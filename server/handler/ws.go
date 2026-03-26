package handler

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"

	"yacht-dice-server/hub"
	"yacht-dice-server/message"
	"yacht-dice-server/player"
	"yacht-dice-server/room"
)

// Named constants for magic numbers
const (
	maxTokens        = 30
	tokenRefillRate  = 100 * time.Millisecond
	hoverMinInterval = 200 * time.Millisecond

	ipMaxTokens       = 10
	ipTokenRefillRate = 6 * time.Second // 10 tokens refilled over 60s = 1 per 6s
	ipCleanupInterval = 5 * time.Minute
	ipLimiterExpiry   = 2 * time.Minute
)

// signingKey is generated at server start for HMAC-signing player IDs.
var signingKey []byte

func init() {
	signingKey = make([]byte, 32)
	if _, err := rand.Read(signingKey); err != nil {
		panic("failed to generate signing key: " + err.Error())
	}
}

// signPlayerID returns "playerId:hmac_hex".
func signPlayerID(playerID string) string {
	mac := hmac.New(sha256.New, signingKey)
	mac.Write([]byte(playerID))
	sig := hex.EncodeToString(mac.Sum(nil))
	return playerID + ":" + sig
}

// verifyPlayerToken checks that "playerId:hmac_hex" is valid.
func verifyPlayerToken(token string) (string, bool) {
	idx := strings.LastIndex(token, ":")
	if idx < 0 {
		return "", false
	}
	playerID := token[:idx]
	sigHex := token[idx+1:]
	mac := hmac.New(sha256.New, signingKey)
	mac.Write([]byte(playerID))
	expected := hex.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(sigHex), []byte(expected)) {
		return "", false
	}
	return playerID, true
}

// rateLimiter is a simple token-bucket rate limiter.
type rateLimiter struct {
	mu       sync.Mutex
	tokens   int
	max      int
	refill   time.Duration
	lastTime time.Time
}

func newRateLimiter(max int, refill time.Duration) *rateLimiter {
	return &rateLimiter{
		tokens:   max,
		max:      max,
		refill:   refill,
		lastTime: time.Now(),
	}
}

func (rl *rateLimiter) Allow() bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	now := time.Now()
	elapsed := now.Sub(rl.lastTime)
	add := int(elapsed / rl.refill)
	if add > 0 {
		rl.tokens += add
		if rl.tokens > rl.max {
			rl.tokens = rl.max
		}
		rl.lastTime = rl.lastTime.Add(time.Duration(add) * rl.refill)
	}
	if rl.tokens <= 0 {
		return false
	}
	rl.tokens--
	return true
}

// hoverThrottle limits hover events by minimum interval.
type hoverThrottle struct {
	mu       sync.Mutex
	lastTime time.Time
	interval time.Duration
}

func newHoverThrottle(interval time.Duration) *hoverThrottle {
	return &hoverThrottle{interval: interval}
}

func (ht *hoverThrottle) Allow() bool {
	ht.mu.Lock()
	defer ht.mu.Unlock()
	now := time.Now()
	if now.Sub(ht.lastTime) < ht.interval {
		return false
	}
	ht.lastTime = now
	return true
}

// Per-IP connection rate limiting
var (
	ipLimiterMu sync.Mutex
	ipLimiters  = make(map[string]*ipLimiterEntry)
)

type ipLimiterEntry struct {
	limiter  *rateLimiter
	lastSeen time.Time
}

func init() {
	go cleanupIPLimiters()
}

func cleanupIPLimiters() {
	ticker := time.NewTicker(ipCleanupInterval)
	defer ticker.Stop()
	for range ticker.C {
		ipLimiterMu.Lock()
		now := time.Now()
		for ip, entry := range ipLimiters {
			if now.Sub(entry.lastSeen) > ipLimiterExpiry {
				delete(ipLimiters, ip)
			}
		}
		ipLimiterMu.Unlock()
	}
}

var rateLimitDisabled = os.Getenv("DISABLE_RATE_LIMIT") == "true"

func allowIP(ip string) bool {
	if rateLimitDisabled {
		return true
	}
	ipLimiterMu.Lock()
	defer ipLimiterMu.Unlock()
	entry, ok := ipLimiters[ip]
	if !ok {
		entry = &ipLimiterEntry{
			limiter:  newRateLimiter(ipMaxTokens, ipTokenRefillRate),
			lastSeen: time.Now(),
		}
		ipLimiters[ip] = entry
	}
	entry.lastSeen = time.Now()
	return entry.limiter.Allow()
}

func extractClientIP(r *http.Request) string {
	// Check X-Forwarded-For first (reverse proxy)
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.SplitN(xff, ",", 2)
		ip := strings.TrimSpace(parts[0])
		if ip != "" {
			return ip
		}
	}
	// Fall back to RemoteAddr
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type WSHandler struct {
	hub *hub.Hub
}

func NewWSHandler(h *hub.Hub) *WSHandler {
	return &WSHandler{hub: h}
}

func (wh *WSHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	clientIP := extractClientIP(r)
	if !allowIP(clientIP) {
		http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Error("WebSocket upgrade failed", "error", err, "ip", clientIP)
		return
	}
	defer conn.Close()

	nickname := strings.TrimSpace(r.URL.Query().Get("nickname"))
	if utf8.RuneCountInString(nickname) > 20 {
		nickname = string([]rune(nickname)[:20])
	}
	if nickname == "" {
		nickname = "Player_" + uuid.New().String()[:4]
	}

	// Check for reconnection via signed token
	existingToken := r.URL.Query().Get("token")
	var p *player.Player
	if existingToken != "" {
		if playerID, valid := verifyPlayerToken(existingToken); valid {
			p = wh.hub.GetPlayer(playerID)
		} else {
			slog.Warn("Invalid reconnection token", "ip", clientIP)
		}
	}
	if p != nil {
		p.SetConn(conn)
		slog.Info("Player reconnected", "playerId", p.ID, "ip", clientIP)
		rm := wh.hub.PlayerRoom(p.ID)
		if rm != nil {
			rm.HandleReconnect(p.ID)
			// If game was paused for this player, resume
			if pf := rm.GetPausedFor(); pf != nil && pf.PlayerID == p.ID {
				rm.ClearPausedFor()
				resumeData, _ := message.New("game:resumed", message.GameResumedPayload{PlayerID: p.ID})
				rm.Broadcast(resumeData)
				wh.broadcastTurn(rm)
			}
			rm.BroadcastState()
			if syncData := rm.SyncPayload(); syncData != nil {
				p.Send(syncData)
			}
		}
	} else {
		p = player.New(uuid.New().String(), nickname, conn)
		wh.hub.RegisterPlayer(p)
		slog.Info("New player connected", "playerId", p.ID, "nickname", nickname, "ip", clientIP)
	}

	token := signPlayerID(p.ID)
	data, _ := message.New("connected", message.ConnectedPayload{PlayerID: p.ID, Token: token})
	p.Send(data)

	limiter := newRateLimiter(maxTokens, tokenRefillRate)
	hover := newHoverThrottle(hoverMinInterval)

	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			slog.Error("WebSocket read error", "playerId", p.ID, "error", err)
			wh.handleDisconnect(p)
			return
		}
		env, err := message.Parse(msg)
		if err != nil {
			slog.Warn("Message parse error", "playerId", p.ID, "error", err)
			continue
		}
		if env.Type == "game:hover" {
			if !hover.Allow() {
				continue
			}
		} else {
			if !limiter.Allow() {
				continue
			}
		}
		wh.handleMessage(p, env)
	}
}

func (wh *WSHandler) handleDisconnect(p *player.Player) {
	p.SetConn(nil)
	rm := wh.hub.PlayerRoom(p.ID)
	if rm == nil {
		wh.hub.RemovePlayerFull(p.ID)
		return
	}

	data, _ := message.New("player:disconnected", message.PlayerEventPayload{PlayerID: p.ID})
	rm.Broadcast(data)

	switch rm.Status() {
	case room.StatusPlaying:
		// During gameplay: don't start disconnect timer immediately.
		// If it's the disconnected player's turn, start pause timer now.
		// Otherwise, pause starts when their turn arrives via broadcastTurnOrPause.
		currentPlayer, _, _, ok := rm.TurnInfo()
		if ok && currentPlayer == p.ID {
			wh.startPauseTimer(rm, p)
		}
	case room.StatusFinished:
		rm.HandleDisconnectWaiting(p.ID, func() {
			rm.RemovePlayer(p.ID, func() { wh.hub.RemoveRoom(rm.Code) })
			remData, _ := message.New("player:removed", message.PlayerEventPayload{PlayerID: p.ID})
			rm.Broadcast(remData)
		})
	default:
		rm.HandleDisconnectWaiting(p.ID, func() {
			wh.hub.LeaveRoom(p.ID)
			leftData, _ := message.New("player:left", message.PlayerLeftPayload{
				PlayerID: p.ID,
				Nickname: p.Nickname,
				Reason:   "normal",
			})
			rm.Broadcast(leftData)
			rm.BroadcastState()
		})
	}
}

func (wh *WSHandler) handleMessage(p *player.Player, env message.Envelope) {
	switch env.Type {
	case "room:create":
		wh.handleRoomCreate(p, env.Payload)
	case "room:join":
		wh.handleRoomJoin(p, env.Payload)
	case "room:leave":
		wh.handleRoomLeave(p)
	case "room:list":
		wh.handleRoomList(p)
	case "room:ready":
		wh.handleReady(p)
	case "room:start":
		wh.handleStart(p)
	case "game:roll":
		wh.handleRoll(p, env.Payload)
	case "game:hold":
		wh.handleHold(p, env.Payload)
	case "game:hover":
		wh.handleHover(p, env.Payload)
	case "game:score":
		wh.handleScore(p, env.Payload)
	case "game:pour":
		wh.handlePour(p)
	case "game:leave":
		wh.handleGameLeave(p)
	case "game:rematch":
		wh.handleRematch(p)
	case "reaction:send":
		wh.handleReaction(p, env.Payload)
	}
}

func (wh *WSHandler) sendError(p *player.Player, code, msg string) {
	data, _ := message.New("error", message.ErrorPayload{Code: code, Message: msg})
	p.Send(data)
}

func (wh *WSHandler) handleRoomCreate(p *player.Player, payload json.RawMessage) {
	var req message.RoomCreatePayload
	if err := json.Unmarshal(payload, &req); err != nil {
		wh.sendError(p, message.ErrInvalidPayload, "Invalid payload")
		return
	}
	if existing := wh.hub.PlayerRoom(p.ID); existing != nil {
		wh.hub.LeaveRoom(p.ID)
	}
	rm := wh.hub.CreateRoom(req.Password)
	wh.hub.JoinRoom(rm.Code, p)
	data, _ := message.New("room:created", rm.StatePayload())
	p.Send(data)
	rm.BroadcastState()
}

func (wh *WSHandler) handleRoomJoin(p *player.Player, payload json.RawMessage) {
	var req message.RoomJoinPayload
	if err := json.Unmarshal(payload, &req); err != nil {
		wh.sendError(p, message.ErrInvalidPayload, "Invalid payload")
		return
	}
	rm := wh.hub.GetRoom(req.RoomCode)
	if rm == nil {
		wh.sendError(p, message.ErrRoomNotFound, "Room not found")
		return
	}
	if rm.HasPassword() && !rm.CheckPassword(req.Password) {
		wh.sendError(p, message.ErrWrongPassword, "Wrong password")
		return
	}
	if existing := wh.hub.PlayerRoom(p.ID); existing != nil {
		wh.hub.LeaveRoom(p.ID)
	}
	if err := wh.hub.JoinRoom(req.RoomCode, p); err != nil {
		wh.sendError(p, err.Error(), err.Error())
		return
	}
	data, _ := message.New("room:joined", rm.StatePayload())
	p.Send(data)
	joinData, _ := message.New("player:joined", message.PlayerInfo{ID: p.ID, Nickname: p.Nickname})
	rm.Broadcast(joinData)
	rm.BroadcastState()
}

func (wh *WSHandler) handleRoomLeave(p *player.Player) {
	rm := wh.hub.PlayerRoom(p.ID)
	if rm == nil {
		return
	}
	wh.hub.LeaveRoom(p.ID)
	data, _ := message.New("player:left", message.PlayerLeftPayload{
		PlayerID: p.ID,
		Nickname: p.Nickname,
		Reason:   "normal",
	})
	rm.Broadcast(data)
	rm.BroadcastState()
}

func (wh *WSHandler) handleRoomList(p *player.Player) {
	list := wh.hub.ListRooms()
	data, _ := message.New("room:list", list)
	p.Send(data)
}

func (wh *WSHandler) handleReady(p *player.Player) {
	rm := wh.hub.PlayerRoom(p.ID)
	if rm == nil {
		return
	}
	rm.ToggleReady(p.ID)
	rm.BroadcastState()
}

func (wh *WSHandler) handleStart(p *player.Player) {
	rm := wh.hub.PlayerRoom(p.ID)
	if rm == nil || !rm.CanStart(p.ID) {
		return
	}
	order := rm.StartGame()
	data, _ := message.New("game:start", message.GameStartPayload{PlayerOrder: order})
	rm.Broadcast(data)
	wh.broadcastTurn(rm)
}

func (wh *WSHandler) handleRoll(p *player.Player, _ json.RawMessage) {
	rm := wh.hub.PlayerRoom(p.ID)
	if rm == nil {
		return
	}
	result, err := rm.Roll(p.ID)
	if err != nil {
		wh.sendError(p, err.Error(), err.Error())
		return
	}
	data, _ := message.New("game:rolled", message.GameRolledPayload{
		Dice: result.Dice, Held: result.Held, RollCount: result.RollCount, Preview: result.Preview,
	})
	rm.Broadcast(data)
}

func (wh *WSHandler) handleHold(p *player.Player, payload json.RawMessage) {
	rm := wh.hub.PlayerRoom(p.ID)
	if rm == nil {
		return
	}
	var req message.GameHoldPayload
	if err := json.Unmarshal(payload, &req); err != nil {
		wh.sendError(p, message.ErrInvalidPayload, "Invalid payload")
		return
	}
	held, err := rm.Hold(p.ID, req.Index)
	if err != nil {
		wh.sendError(p, err.Error(), err.Error())
		return
	}
	data, _ := message.New("game:held", message.GameHeldPayload{Held: held, PlayerID: p.ID})
	rm.Broadcast(data)
}

func (wh *WSHandler) handleHover(p *player.Player, payload json.RawMessage) {
	rm := wh.hub.PlayerRoom(p.ID)
	if rm == nil {
		return
	}
	var req message.GameHoverPayload
	if err := json.Unmarshal(payload, &req); err != nil {
		return
	}
	currentPlayer, _, rollCount, ok := rm.TurnInfo()
	if !ok || currentPlayer != p.ID || rollCount == 0 {
		return
	}
	data, _ := message.New("game:hovered", message.GameHoveredPayload{Category: req.Category, PlayerID: p.ID})
	rm.Broadcast(data)
}

func (wh *WSHandler) handleScore(p *player.Player, payload json.RawMessage) {
	rm := wh.hub.PlayerRoom(p.ID)
	if rm == nil {
		return
	}
	var req message.GameScorePayload
	if err := json.Unmarshal(payload, &req); err != nil {
		wh.sendError(p, message.ErrInvalidPayload, "Invalid payload")
		return
	}
	result, err := rm.Score(p.ID, req.Category)
	if err != nil {
		wh.sendError(p, err.Error(), err.Error())
		return
	}
	data, _ := message.New("game:scored", message.GameScoredPayload{
		PlayerID: p.ID, Category: req.Category, Score: result.Score, TotalScores: result.TotalScores,
	})
	rm.Broadcast(data)
	if result.Finished {
		wh.endGame(rm)
	} else {
		wh.broadcastTurnOrPause(rm)
	}
}

func (wh *WSHandler) endGame(rm *room.Room) {
	rankings, ok := rm.GameRankings()
	if !ok {
		return
	}
	nicks := rm.NicknameMap()
	for i := range rankings {
		// Only overwrite if the player is still in the room;
		// left players already have Nickname set by Rankings().
		if nick, ok := nicks[rankings[i].PlayerID]; ok {
			rankings[i].Nickname = nick
		}
	}
	data, _ := message.New("game:end", message.GameEndPayload{Rankings: rankings})
	rm.Broadcast(data)
	rm.EndGame(rankings)
	rm.StartRematchTimer(func() {
		wh.hub.RemoveRoom(rm.Code)
	})
}

func (wh *WSHandler) broadcastTurn(rm *room.Room) {
	currentPlayer, round, _, ok := rm.TurnInfo()
	if !ok {
		return
	}
	data, _ := message.New("game:turn", message.GameTurnPayload{
		CurrentPlayer: currentPlayer, Round: round,
	})
	rm.Broadcast(data)
}

func (wh *WSHandler) broadcastTurnOrPause(rm *room.Room) {
	currentPlayer, round, _, ok := rm.TurnInfo()
	if !ok {
		return
	}
	if !rm.IsPlayerConnected(currentPlayer) {
		p := rm.FindPlayer(currentPlayer)
		if p != nil {
			wh.startPauseTimer(rm, p)
		}
		return
	}
	data, _ := message.New("game:turn", message.GameTurnPayload{
		CurrentPlayer: currentPlayer, Round: round,
	})
	rm.Broadcast(data)
}

func (wh *WSHandler) startPauseTimer(rm *room.Room, p *player.Player) {
	expiresAt := time.Now().Add(room.DisconnectTimeout).UnixMilli()
	rm.SetPausedFor(p.ID, p.Nickname, expiresAt)
	pauseData, _ := message.New("game:paused", message.GamePausedPayload{
		PlayerID:  p.ID,
		Nickname:  p.Nickname,
		ExpiresAt: expiresAt,
	})
	rm.Broadcast(pauseData)
	rm.HandleDisconnect(p.ID, func() {
		rm.ClearPausedFor()
		nick := p.Nickname
		result := rm.RetirePlayer(p.ID)
		leftData, _ := message.New("player:left", message.PlayerLeftPayload{
			PlayerID: p.ID,
			Nickname: nick,
			Reason:   "timeout",
		})
		rm.Broadcast(leftData)
		if result.ActiveCount == 1 {
			wh.endGame(rm)
		} else if result.ActiveCount > 1 {
			rm.BroadcastState()
			wh.broadcastTurnOrPause(rm)
		} else {
			wh.hub.RemoveRoom(rm.Code)
		}
		wh.hub.RemovePlayerFull(p.ID)
	})
}

func (wh *WSHandler) handleGameLeave(p *player.Player) {
	rm := wh.hub.PlayerRoom(p.ID)
	if rm == nil {
		return
	}
	if rm.Status() != room.StatusPlaying {
		return
	}
	result := rm.RetirePlayer(p.ID)
	if !result.OK {
		return
	}
	nick := p.Nickname
	leftData, _ := message.New("player:left", message.PlayerLeftPayload{
		PlayerID: p.ID,
		Nickname: nick,
		Reason:   "voluntary",
	})
	rm.Broadcast(leftData)
	p.Send(leftData) // also send to the leaver (already removed from room)

	if result.ActiveCount == 0 {
		wh.hub.RemovePlayerFull(p.ID)
		wh.hub.RemoveRoom(rm.Code)
		return
	}
	if result.ActiveCount == 1 {
		wh.endGame(rm)
		wh.hub.RemovePlayerFull(p.ID)
		return
	}
	rm.BroadcastState()
	if result.WasTurn {
		wh.broadcastTurnOrPause(rm)
	}
	wh.hub.RemovePlayerFull(p.ID)
}

func (wh *WSHandler) handlePour(p *player.Player) {
	rm := wh.hub.PlayerRoom(p.ID)
	if rm == nil {
		return
	}
	currentPlayer, _, _, ok := rm.TurnInfo()
	if !ok || currentPlayer != p.ID {
		return
	}
	data, _ := message.New("game:pour", nil)
	rm.Broadcast(data)
}

func (wh *WSHandler) handleRematch(p *player.Player) {
	rm := wh.hub.PlayerRoom(p.ID)
	if rm == nil {
		return
	}
	rm.CancelRematchTimer()
	allVoted := rm.Rematch(p.ID)
	if allVoted {
		startData, _ := message.New("rematch:start", rm.StatePayload())
		rm.Broadcast(startData)
		rm.BroadcastState()
	} else {
		votes := rm.RematchVotes()
		data, _ := message.New("rematch:status", message.RematchStatusPayload{Votes: votes})
		rm.Broadcast(data)
	}
}

func (wh *WSHandler) handleReaction(p *player.Player, payload json.RawMessage) {
	rm := wh.hub.PlayerRoom(p.ID)
	if rm == nil {
		return
	}
	var req message.ReactionSendPayload
	if err := json.Unmarshal(payload, &req); err != nil {
		wh.sendError(p, message.ErrInvalidPayload, "Invalid payload")
		return
	}
	if !message.ValidEmoji(req.Emoji) {
		return
	}
	data, _ := message.New("reaction:show", message.ReactionShowPayload{PlayerID: p.ID, Emoji: req.Emoji})
	rm.Broadcast(data)
}
