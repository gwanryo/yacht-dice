package room

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"math/big"
	"sync"
	"time"

	"yacht-dice-server/game"
	"yacht-dice-server/message"
	"yacht-dice-server/player"
)

const MaxPlayers = 4

type Room struct {
	Code     string
	password string
	mu       sync.RWMutex
	players  []*player.Player
	hostID   string
	ready    map[string]bool
	engine   *game.Engine
	status   string
	cleanup  *time.Timer
	disconn  map[string]*time.Timer
	rematch  map[string]bool
}

func GenerateCode() string {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	code := make([]byte, 6)
	for i := range code {
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(chars))))
		code[i] = chars[n.Int64()]
	}
	return string(code)
}

func New(code, password string) *Room {
	return &Room{
		Code:     code,
		password: password,
		ready:    make(map[string]bool),
		status:   "waiting",
		disconn:  make(map[string]*time.Timer),
		rematch:  make(map[string]bool),
	}
}

func (r *Room) Status() string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.status
}

func (r *Room) PlayerCount() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.players)
}

func (r *Room) HasPassword() bool {
	return r.password != ""
}

func (r *Room) CheckPassword(pw string) bool {
	return r.password == pw
}

func (r *Room) AddPlayer(p *player.Player) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.status == "playing" {
		return fmt.Errorf(message.ErrGameInProgress)
	}
	if len(r.players) >= MaxPlayers {
		return fmt.Errorf(message.ErrRoomFull)
	}
	for _, existing := range r.players {
		if existing.ID == p.ID {
			return nil
		}
	}
	r.players = append(r.players, p)
	if r.hostID == "" {
		r.hostID = p.ID
	}
	if r.cleanup != nil {
		r.cleanup.Stop()
		r.cleanup = nil
	}
	return nil
}

func (r *Room) RemovePlayer(playerID string, onEmpty func()) {
	r.mu.Lock()
	defer r.mu.Unlock()
	idx := -1
	for i, p := range r.players {
		if p.ID == playerID {
			idx = i
			break
		}
	}
	if idx == -1 {
		return
	}
	r.players = append(r.players[:idx], r.players[idx+1:]...)
	delete(r.ready, playerID)
	if r.hostID == playerID && len(r.players) > 0 {
		r.hostID = r.players[0].ID
	}
	if r.engine != nil {
		r.engine.RemovePlayer(playerID)
		if len(r.players) < 2 {
			r.status = "waiting"
			r.engine = nil
		}
	}
	if len(r.players) == 0 {
		r.cleanup = time.AfterFunc(30*time.Second, onEmpty)
	}
}

func (r *Room) ToggleReady(playerID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.ready[playerID] = !r.ready[playerID]
}

func (r *Room) CanStart(playerID string) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if playerID != r.hostID || len(r.players) < 2 || r.status == "playing" {
		return false
	}
	for _, p := range r.players {
		if p.ID != r.hostID && !r.ready[p.ID] {
			return false
		}
	}
	return true
}

func (r *Room) StartGame() []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	order := make([]string, len(r.players))
	for i, p := range r.players {
		order[i] = p.ID
	}
	r.engine = game.NewEngine(order)
	r.status = "playing"
	r.ready = make(map[string]bool)
	return order
}

// RollResult holds the atomically-captured result of a roll action.
type RollResult struct {
	Dice      [5]int
	Held      [5]bool
	RollCount int
	Preview   map[string]int
}

func (r *Room) Roll(playerID string) (RollResult, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.engine == nil {
		return RollResult{}, fmt.Errorf("no game in progress")
	}
	dice, err := r.engine.Roll(playerID)
	if err != nil {
		return RollResult{}, err
	}
	return RollResult{
		Dice:      dice,
		Held:      r.engine.Held(),
		RollCount: r.engine.RollCount(),
		Preview:   r.engine.Preview(playerID),
	}, nil
}

func (r *Room) Hold(playerID string, index int) ([5]bool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.engine == nil {
		return [5]bool{}, fmt.Errorf("no game in progress")
	}
	return r.engine.Hold(playerID, index)
}

// ScoreResult holds the atomically-captured result of a scoring action.
type ScoreResult struct {
	Score       int
	TotalScores map[string]map[string]int
	Finished    bool
}

func (r *Room) Score(playerID string, category string) (ScoreResult, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.engine == nil {
		return ScoreResult{}, fmt.Errorf("no game in progress")
	}
	score, err := r.engine.Score(playerID, category)
	if err != nil {
		return ScoreResult{}, err
	}
	return ScoreResult{
		Score:       score,
		TotalScores: r.engine.Scores(),
		Finished:    r.engine.IsFinished(),
	}, nil
}

// TurnInfo returns the current player, round, and rollCount atomically.
func (r *Room) TurnInfo() (currentPlayer string, round int, rollCount int, ok bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if r.engine == nil {
		return "", 0, 0, false
	}
	return r.engine.CurrentPlayer(), r.engine.Round(), r.engine.RollCount(), true
}

// GameRankings returns the rankings under lock.
func (r *Room) GameRankings() ([]message.RankEntry, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if r.engine == nil {
		return nil, false
	}
	return r.engine.Rankings(), true
}

func (r *Room) IsFinished() bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.engine != nil && r.engine.IsFinished()
}

func (r *Room) EndGame() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.status = "finished"
	r.rematch = make(map[string]bool)
}

// Rematch records a player's rematch vote. Returns true if all players voted.
func (r *Room) Rematch(playerID string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.rematch[playerID] = true
	if len(r.rematch) >= len(r.players) {
		r.status = "waiting"
		r.engine = nil
		r.ready = make(map[string]bool)
		r.rematch = make(map[string]bool)
		return true
	}
	return false
}

// RematchVotes returns IDs of players who voted for rematch.
func (r *Room) RematchVotes() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	votes := make([]string, 0, len(r.rematch))
	for pid := range r.rematch {
		votes = append(votes, pid)
	}
	return votes
}

func (r *Room) StartRematchTimer(onTimeout func()) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.cleanup != nil {
		r.cleanup.Stop()
	}
	r.cleanup = time.AfterFunc(30*time.Second, onTimeout)
}

func (r *Room) CancelRematchTimer() {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.cleanup != nil {
		r.cleanup.Stop()
		r.cleanup = nil
	}
}

func (r *Room) HandleDisconnect(playerID string, onTimeout func()) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if timer, ok := r.disconn[playerID]; ok {
		timer.Stop()
	}
	r.disconn[playerID] = time.AfterFunc(60*time.Second, onTimeout)
}

func (r *Room) HandleReconnect(playerID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if timer, ok := r.disconn[playerID]; ok {
		timer.Stop()
		delete(r.disconn, playerID)
	}
}

func (r *Room) FindPlayer(playerID string) *player.Player {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, p := range r.players {
		if p.ID == playerID {
			return p
		}
	}
	return nil
}

func (r *Room) Broadcast(data []byte) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, p := range r.players {
		p.Send(data)
	}
}

func (r *Room) BroadcastState() {
	r.mu.RLock()
	players := make([]message.PlayerInfo, len(r.players))
	for i, p := range r.players {
		players[i] = message.PlayerInfo{
			ID:       p.ID,
			Nickname: p.Nickname,
			IsHost:   p.ID == r.hostID,
			IsReady:  r.ready[p.ID],
		}
	}
	r.mu.RUnlock()
	data, _ := message.New("room:state", message.RoomStatePayload{
		RoomCode: r.Code,
		Players:  players,
	})
	r.Broadcast(data)
}

func (r *Room) SyncPayload() []byte {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if r.engine == nil {
		return nil
	}
	var preview map[string]int
	if r.engine.RollCount() > 0 {
		preview = r.engine.Preview(r.engine.CurrentPlayer())
	}
	data, _ := message.New("game:sync", message.GameSyncPayload{
		Dice:          r.engine.Dice(),
		Held:          r.engine.Held(),
		RollCount:     r.engine.RollCount(),
		Scores:        r.engine.Scores(),
		CurrentPlayer: r.engine.CurrentPlayer(),
		Round:         r.engine.Round(),
		Preview:       preview,
	})
	return data
}

func (r *Room) ListItem() message.RoomListItem {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return message.RoomListItem{
		Code:        r.Code,
		PlayerCount: len(r.players),
		HasPassword: r.password != "",
		Status:      r.status,
	}
}

func (r *Room) NicknameMap() map[string]string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	m := make(map[string]string)
	for _, p := range r.players {
		m[p.ID] = p.Nickname
	}
	return m
}

func Decode[T any](raw json.RawMessage) (T, error) {
	var v T
	err := json.Unmarshal(raw, &v)
	return v, err
}
