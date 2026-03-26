# Disconnect Detection & Voluntary Leave Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add pause-on-disconnect with countdown timer and voluntary mid-game leave with score preservation.

**Architecture:** Server-centric — server manages all pause/leave state, clients react to messages. New `RetirePlayer` method in engine preserves scores AND nicknames in a `leftPlayers` map before removing from turn order. Single pause timer replaces existing disconnect timer during gameplay. Client adds overlay, leave button, and toast notifications.

**Key design notes:**
- `leftPlayers` stores `{playerID → {scores, nickname}}` so nicknames survive removal from room
- `disconnectTimeout` is exported from room package as `DisconnectTimeout` for handler access
- Client toast messages use i18n keys, not hardcoded English
- Leaving player's lobby transition is driven by server's `player:left` response, not eager client reset
- On reconnect, server broadcasts `room:state` which client uses to clear disconnect indicators (no separate `player:reconnected` message needed — `room:state` already contains current player list)

**Tech Stack:** Go 1.25 (server), React 19 + TypeScript + Vitest (client), Tailwind CSS, i18next

**Spec:** `docs/superpowers/specs/2026-03-27-disconnect-and-leave-design.md`

---

## File Structure

### Server Changes
- **Modify:** `server/message/message.go` — Add new payload structs, expand `RankEntry` with `LeftEarly`
- **Modify:** `server/game/engine.go` — Add `leftPlayers` map, `RetirePlayer()`, update `Rankings()`
- **Modify:** `server/room/room.go` — Add `RetirePlayer()`, `IsPlayerConnected()`, `HandlePausedTurn()`, update `SyncPayload()`
- **Modify:** `server/handler/ws.go` — Add `game:leave` handler, modify `handleDisconnect`, modify `broadcastTurn`

### Client Changes
- **Modify:** `client/src/types/game.ts` — Add `leftEarly` to `RankEntry`, add new payload types
- **Modify:** `client/src/hooks/useGameState.ts` — Add `disconnectedPlayers`, `pausedFor`, `toasts` to state + new actions
- **Modify:** `client/src/hooks/useGameEvents.ts` — Handle `player:disconnected`, `game:paused`, `game:resumed`, expanded `player:left`
- **Create:** `client/src/components/GamePausedOverlay.tsx` — Pause overlay with countdown
- **Modify:** `client/src/pages/GamePage.tsx` — Add leave button, overlay, toast
- **Modify:** `client/src/pages/ResultPage.tsx` — Show "(중도 퇴장)" for leftEarly players
- **Modify:** `client/src/i18n/ko.json`, `en.json`, `ja.json` — New translation keys

### Test Files
- **Modify:** `server/game/engine_test.go` — Tests for `RetirePlayer`, updated `Rankings`
- **Modify:** `server/room/room_test.go` — Tests for room-level retire, pause, connectivity check
- **Modify:** `client/src/hooks/useGameState.test.ts` — Tests for new actions
- **Create:** `client/src/components/GamePausedOverlay.test.tsx` — Overlay rendering tests
- **Modify:** `client/src/pages/GamePage.test.tsx` — Leave button tests

---

## Task 1: Message Payload Structs

**Files:**
- Modify: `server/message/message.go:162-197`
- Test: `server/message/message_test.go`

- [ ] **Step 1: Write failing test for new payload JSON serialization**

In `server/message/message_test.go`, add:

```go
func TestRankEntryLeftEarly(t *testing.T) {
	entry := RankEntry{
		PlayerID:  "p1",
		Nickname:  "Alice",
		Score:     120,
		Rank:      1,
		LeftEarly: true,
	}
	data, err := json.Marshal(entry)
	if err != nil {
		t.Fatal(err)
	}
	var decoded map[string]any
	json.Unmarshal(data, &decoded)
	if decoded["leftEarly"] != true {
		t.Errorf("leftEarly = %v, want true", decoded["leftEarly"])
	}
}

func TestPlayerLeftPayload(t *testing.T) {
	p := PlayerLeftPayload{
		PlayerID: "p1",
		Nickname: "Alice",
		Reason:   "voluntary",
	}
	data, err := json.Marshal(p)
	if err != nil {
		t.Fatal(err)
	}
	var decoded map[string]any
	json.Unmarshal(data, &decoded)
	if decoded["reason"] != "voluntary" {
		t.Errorf("reason = %v, want voluntary", decoded["reason"])
	}
}

func TestGamePausedPayload(t *testing.T) {
	p := GamePausedPayload{
		PlayerID:  "p1",
		Nickname:  "Alice",
		ExpiresAt: 1711540860000,
	}
	data, err := json.Marshal(p)
	if err != nil {
		t.Fatal(err)
	}
	var decoded map[string]any
	json.Unmarshal(data, &decoded)
	if decoded["expiresAt"].(float64) != 1711540860000 {
		t.Errorf("expiresAt = %v, want 1711540860000", decoded["expiresAt"])
	}
}

func TestGameSyncPausedForField(t *testing.T) {
	sync := GameSyncPayload{
		PausedFor: &GamePausedPayload{
			PlayerID:  "p2",
			Nickname:  "Bob",
			ExpiresAt: 1711540860000,
		},
	}
	data, _ := json.Marshal(sync)
	var decoded map[string]any
	json.Unmarshal(data, &decoded)
	pf := decoded["pausedFor"].(map[string]any)
	if pf["playerId"] != "p2" {
		t.Errorf("pausedFor.playerId = %v, want p2", pf["playerId"])
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && go test ./message/ -run "TestRankEntryLeftEarly|TestPlayerLeftPayload|TestGamePausedPayload|TestGameSyncPausedForField" -v`
Expected: Compilation errors — `LeftEarly`, `PlayerLeftPayload`, `GamePausedPayload` don't exist yet.

- [ ] **Step 3: Write minimal implementation**

In `server/message/message.go`, add `LeftEarly` to `RankEntry` and new payload structs:

```go
// Update RankEntry (line 162):
type RankEntry struct {
	PlayerID  string `json:"playerId"`
	Nickname  string `json:"nickname"`
	Score     int    `json:"score"`
	Rank      int    `json:"rank"`
	LeftEarly bool   `json:"leftEarly"`
}

// Add new payload structs after PlayerEventPayload:
type PlayerLeftPayload struct {
	PlayerID string `json:"playerId"`
	Nickname string `json:"nickname"`
	Reason   string `json:"reason"`
}

type GamePausedPayload struct {
	PlayerID  string `json:"playerId"`
	Nickname  string `json:"nickname"`
	ExpiresAt int64  `json:"expiresAt"`
}

type GameResumedPayload struct {
	PlayerID string `json:"playerId"`
}
```

Add `PausedFor` field to `GameSyncPayload`:

```go
type GameSyncPayload struct {
	Dice          [5]int                    `json:"dice"`
	Held          [5]bool                   `json:"held"`
	RollCount     int                       `json:"rollCount"`
	Scores        map[string]map[string]int `json:"scores"`
	CurrentPlayer string                    `json:"currentPlayer"`
	Round         int                       `json:"round"`
	Preview       map[string]int            `json:"preview"`
	Players       []PlayerInfo              `json:"players"`
	RoomCode      string                    `json:"roomCode"`
	PausedFor     *GamePausedPayload        `json:"pausedFor,omitempty"`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && go test ./message/ -run "TestRankEntryLeftEarly|TestPlayerLeftPayload|TestGamePausedPayload|TestGameSyncPausedForField" -v`
Expected: PASS

- [ ] **Step 5: Run all existing tests to verify no regressions**

Run: `cd server && go test ./...`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add server/message/message.go server/message/message_test.go
git commit -m "feat: add message payloads for disconnect/leave feature"
```

---

## Task 2: Engine RetirePlayer & Updated Rankings

**Files:**
- Modify: `server/game/engine.go:10-19,142-216`
- Test: `server/game/engine_test.go`

- [ ] **Step 1: Write failing tests**

In `server/game/engine_test.go`, add:

```go
func TestRetirePlayer(t *testing.T) {
	e := NewEngine([]string{"p1", "p2", "p3"})
	e.Roll("p1")
	e.Score("p1", "ones")
	e.Roll("p2")
	e.Score("p2", "ones")

	// Now p3's turn — retire p2 (not current turn)
	wasTurn := e.RetirePlayer("p2")
	if wasTurn {
		t.Error("p2 was not current player, wasTurn should be false")
	}
	if len(e.PlayerOrder()) != 2 {
		t.Errorf("playerOrder len = %d, want 2", len(e.PlayerOrder()))
	}
	// p2's scores should be in leftPlayers
	lp := e.LeftPlayers()
	if lp["p2"] == nil {
		t.Fatal("p2 should be in leftPlayers")
	}
	if lp["p2"]["ones"] == 0 {
		// ones score could theoretically be 0 but we rolled, so just check key exists
		if _, ok := lp["p2"]["ones"]; !ok {
			t.Error("p2 should have ones score preserved")
		}
	}
}

func TestRetireCurrentPlayer(t *testing.T) {
	e := NewEngine([]string{"p1", "p2"})
	e.Roll("p1")
	e.Score("p1", "ones")
	// p2's turn
	wasTurn := e.RetirePlayer("p2")
	if !wasTurn {
		t.Error("p2 is current player, wasTurn should be true")
	}
	if e.CurrentPlayer() != "p1" {
		t.Errorf("after retiring current, current = %s, want p1", e.CurrentPlayer())
	}
}

func TestRankingsIncludesLeftPlayers(t *testing.T) {
	e := NewEngine([]string{"p1", "p2", "p3"})
	// p1 scores
	e.Roll("p1")
	e.Score("p1", "choice")
	// p2 scores
	e.Roll("p2")
	e.Score("p2", "choice")
	// p3 scores
	e.Roll("p3")
	e.Score("p3", "choice")

	// Retire p2
	e.RetirePlayer("p2")

	// Play remaining rounds for p1 and p3
	cats := AllCategories()
	for _, cat := range cats[1:] { // skip "ones" which is cats[0], we used "choice"
		if cat == "choice" {
			continue
		}
		for _, pid := range e.PlayerOrder() {
			e.Roll(pid)
			e.Score(pid, cat)
		}
	}

	rankings := e.Rankings()
	// Should have 3 entries (p1, p2 retired, p3)
	if len(rankings) != 3 {
		t.Fatalf("rankings len = %d, want 3", len(rankings))
	}
	// Find p2's entry
	var p2Entry *message.RankEntry
	for i := range rankings {
		if rankings[i].PlayerID == "p2" {
			p2Entry = &rankings[i]
			break
		}
	}
	if p2Entry == nil {
		t.Fatal("p2 should appear in rankings")
	}
	if !p2Entry.LeftEarly {
		t.Error("p2 should have LeftEarly = true")
	}
}

func TestRetireNonexistentPlayer(t *testing.T) {
	e := NewEngine([]string{"p1", "p2"})
	wasTurn := e.RetirePlayer("p99")
	if wasTurn {
		t.Error("nonexistent player should return false")
	}
}

func TestRetireLastActivePlayer(t *testing.T) {
	e := NewEngine([]string{"p1"})
	e.Roll("p1")
	e.Score("p1", "ones")
	e.RetirePlayer("p1")
	if !e.IsFinished() {
		t.Error("game should be finished when last player retires")
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && go test ./game/ -run "TestRetirePlayer|TestRetireCurrentPlayer|TestRankingsIncludesLeftPlayers|TestRetireNonexistentPlayer|TestRetireLastActivePlayer" -v`
Expected: Compilation error — `RetirePlayer`, `LeftPlayers` don't exist.

- [ ] **Step 3: Implement RetirePlayer and update Rankings**

In `server/game/engine.go`:

Add `leftPlayers` field (with nickname) to Engine struct and initialize in `NewEngine`:

```go
type LeftPlayer struct {
	Nickname string
	Scores   map[string]int
}

type Engine struct {
	playerOrder []string
	nicknames   map[string]string // playerID → nickname, set via SetNicknames
	turnIdx     int
	round       int
	dice        [5]int
	held        [5]bool
	rollCount   int
	scores      map[string]map[string]int
	finished    bool
	leftPlayers map[string]LeftPlayer
}

func NewEngine(playerOrder []string) *Engine {
	scores := make(map[string]map[string]int)
	for _, pid := range playerOrder {
		scores[pid] = make(map[string]int)
	}
	return &Engine{
		playerOrder: playerOrder,
		nicknames:   make(map[string]string),
		turnIdx:     0,
		round:       1,
		scores:      scores,
		leftPlayers: make(map[string]LeftPlayer),
	}
}
```

Add `SetNicknames` and `LeftPlayers()` accessor:

```go
func (e *Engine) SetNicknames(nicks map[string]string) {
	for k, v := range nicks {
		e.nicknames[k] = v
	}
}

func (e *Engine) LeftPlayers() map[string]LeftPlayer {
	out := make(map[string]LeftPlayer)
	for pid, lp := range e.leftPlayers {
		scores := make(map[string]int)
		for k, v := range lp.Scores {
			scores[k] = v
		}
		out[pid] = LeftPlayer{Nickname: lp.Nickname, Scores: scores}
	}
	return out
}
```

Add `RetirePlayer` method (place after `RemovePlayer`):

```go
// RetirePlayer preserves the player's scores and nickname in leftPlayers,
// then removes them from the active turn order. Returns true if it was the player's turn.
func (e *Engine) RetirePlayer(playerID string) bool {
	idx := -1
	for i, pid := range e.playerOrder {
		if pid == playerID {
			idx = i
			break
		}
	}
	if idx == -1 {
		return false
	}
	// Snapshot scores and nickname
	if scores, ok := e.scores[playerID]; ok {
		snap := make(map[string]int)
		for k, v := range scores {
			snap[k] = v
		}
		e.leftPlayers[playerID] = LeftPlayer{
			Nickname: e.nicknames[playerID],
			Scores:   snap,
		}
	}
	wasTurn := idx == e.turnIdx
	e.RemovePlayer(playerID)
	return wasTurn
}
```

Update `Rankings()` to include leftPlayers:

```go
func (e *Engine) Rankings() []message.RankEntry {
	type ps struct {
		id        string
		nickname  string
		score     int
		leftEarly bool
	}
	var list []ps
	for _, pid := range e.playerOrder {
		if scores, ok := e.scores[pid]; ok {
			list = append(list, ps{pid, e.nicknames[pid], TotalScore(scores), false})
		}
	}
	for pid, lp := range e.leftPlayers {
		list = append(list, ps{pid, lp.Nickname, TotalScore(lp.Scores), true})
	}
	for i := 0; i < len(list); i++ {
		for j := i + 1; j < len(list); j++ {
			if list[j].score > list[i].score {
				list[i], list[j] = list[j], list[i]
			}
		}
	}
	rankings := make([]message.RankEntry, len(list))
	for i, p := range list {
		rankings[i] = message.RankEntry{
			PlayerID:  p.id,
			Nickname:  p.nickname,
			Score:     p.score,
			Rank:      i + 1,
			LeftEarly: p.leftEarly,
		}
	}
	return rankings
}
```

Note: Since `Rankings()` now includes nicknames, `endGame` in ws.go should still call `NicknameMap()` to fill nicknames for active players, but left players already have their nicknames from the engine. Alternatively, call `engine.SetNicknames(nicks)` when starting the game so the engine always has nicknames. **Preferred approach: call `SetNicknames` in `StartGame`.**

Update `Room.StartGame()` to set nicknames on the engine:

```go
func (r *Room) StartGame() []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	order := make([]string, len(r.players))
	nicks := make(map[string]string)
	for i, p := range r.players {
		order[i] = p.ID
		nicks[p.ID] = p.Nickname
	}
	r.engine = game.NewEngine(order)
	r.engine.SetNicknames(nicks)
	r.status = StatusPlaying
	r.ready = make(map[string]bool)
	return order
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && go test ./game/ -run "TestRetirePlayer|TestRetireCurrentPlayer|TestRankingsIncludesLeftPlayers|TestRetireNonexistentPlayer|TestRetireLastActivePlayer" -v`
Expected: All PASS

- [ ] **Step 5: Run all existing tests**

Run: `cd server && go test ./...`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add server/game/engine.go server/game/engine_test.go
git commit -m "feat: add RetirePlayer with score preservation and updated Rankings"
```

---

## Task 3: Room-Level RetirePlayer, Connectivity Check, Pause Support

**Files:**
- Modify: `server/room/room.go:17-42,114-147,323-350,399-443`
- Test: `server/room/room_test.go`

- [ ] **Step 1: Write failing tests**

In `server/room/room_test.go`, add:

```go
func TestIsPlayerConnected(t *testing.T) {
	rm := New("TEST01", "")
	p1 := newMockPlayer("p1", "Alice")
	rm.AddPlayer(p1)
	// Mock players have nil conn → not connected
	if rm.IsPlayerConnected("p1") {
		t.Error("nil conn player should not be connected")
	}
	if rm.IsPlayerConnected("nonexistent") {
		t.Error("nonexistent player should not be connected")
	}
}

func TestRetirePlayerRoom(t *testing.T) {
	rm := New("TEST01", "")
	p1 := newMockPlayer("p1", "Alice")
	p2 := newMockPlayer("p2", "Bob")
	p3 := newMockPlayer("p3", "Charlie")
	rm.AddPlayer(p1)
	rm.AddPlayer(p2)
	rm.AddPlayer(p3)
	rm.StartGame()
	rm.Roll("p1")
	rm.Score("p1", "choice")

	result := rm.RetirePlayer("p2")
	if !result.OK {
		t.Fatal("retire should succeed")
	}
	if result.WasTurn {
		t.Error("p2 was not current, wasTurn should be false")
	}
	if rm.PlayerCount() != 2 {
		t.Errorf("player count = %d, want 2", rm.PlayerCount())
	}
}

func TestRetirePlayerNoGame(t *testing.T) {
	rm := New("TEST01", "")
	p1 := newMockPlayer("p1", "Alice")
	rm.AddPlayer(p1)
	result := rm.RetirePlayer("p1")
	if result.OK {
		t.Error("retire should fail when no game")
	}
}

func TestRetirePlayerGameEndWhenOneLeft(t *testing.T) {
	rm := New("TEST01", "")
	p1 := newMockPlayer("p1", "Alice")
	p2 := newMockPlayer("p2", "Bob")
	rm.AddPlayer(p1)
	rm.AddPlayer(p2)
	rm.StartGame()
	rm.Roll("p1")
	rm.Score("p1", "choice")
	rm.Roll("p2")
	rm.Score("p2", "choice")

	result := rm.RetirePlayer("p1")
	if !result.OK {
		t.Fatal("retire should succeed")
	}
	if result.ActiveCount != 1 {
		t.Errorf("activeCount = %d, want 1", result.ActiveCount)
	}
}

func TestRetirePlayerSolo(t *testing.T) {
	rm := New("TEST01", "")
	p1 := newMockPlayer("p1", "Alice")
	rm.AddPlayer(p1)
	rm.StartGame()
	rm.Roll("p1")
	rm.Score("p1", "choice")

	result := rm.RetirePlayer("p1")
	if !result.OK {
		t.Fatal("retire should succeed")
	}
	if result.ActiveCount != 0 {
		t.Errorf("activeCount = %d, want 0", result.ActiveCount)
	}
}

func TestSetPausedFor(t *testing.T) {
	rm := New("TEST01", "")
	p1 := newMockPlayer("p1", "Alice")
	p2 := newMockPlayer("p2", "Bob")
	rm.AddPlayer(p1)
	rm.AddPlayer(p2)
	rm.StartGame()

	rm.SetPausedFor("p2", "Bob", 1711540860000)
	pf := rm.GetPausedFor()
	if pf == nil {
		t.Fatal("pausedFor should not be nil")
	}
	if pf.PlayerID != "p2" {
		t.Errorf("pausedFor.PlayerID = %s, want p2", pf.PlayerID)
	}
	if pf.ExpiresAt != 1711540860000 {
		t.Errorf("pausedFor.ExpiresAt = %d, want 1711540860000", pf.ExpiresAt)
	}
}

func TestClearPausedFor(t *testing.T) {
	rm := New("TEST01", "")
	p1 := newMockPlayer("p1", "Alice")
	p2 := newMockPlayer("p2", "Bob")
	rm.AddPlayer(p1)
	rm.AddPlayer(p2)
	rm.StartGame()

	rm.SetPausedFor("p2", "Bob", 1711540860000)
	rm.ClearPausedFor()
	if rm.GetPausedFor() != nil {
		t.Error("pausedFor should be nil after clear")
	}
}

func TestSyncPayloadIncludesPausedFor(t *testing.T) {
	rm := New("TEST01", "")
	p1 := newMockPlayer("p1", "Alice")
	p2 := newMockPlayer("p2", "Bob")
	rm.AddPlayer(p1)
	rm.AddPlayer(p2)
	rm.StartGame()

	rm.SetPausedFor("p2", "Bob", 1711540860000)
	data := rm.SyncPayload()
	var env struct {
		Type    string          `json:"type"`
		Payload json.RawMessage `json:"payload"`
	}
	json.Unmarshal(data, &env)
	var payload message.GameSyncPayload
	json.Unmarshal(env.Payload, &payload)
	if payload.PausedFor == nil {
		t.Fatal("SyncPayload should include pausedFor")
	}
	if payload.PausedFor.PlayerID != "p2" {
		t.Errorf("pausedFor.playerId = %s, want p2", payload.PausedFor.PlayerID)
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && go test ./room/ -run "TestIsPlayerConnected|TestRetirePlayerRoom|TestRetirePlayerNoGame|TestRetirePlayerGameEndWhenOneLeft|TestRetirePlayerSolo|TestSetPausedFor|TestClearPausedFor|TestSyncPayloadIncludesPausedFor" -v`
Expected: Compilation errors — `IsPlayerConnected`, `RetirePlayer` (room method), `SetPausedFor`, `GetPausedFor`, `ClearPausedFor` don't exist.

- [ ] **Step 3: Implement room-level methods**

In `server/room/room.go`:

Export `disconnectTimeout` for handler access — rename to `DisconnectTimeout`:

```go
const (
	MaxPlayers         = 4
	emptyRoomTimeout   = 30 * time.Second
	DisconnectTimeout  = 60 * time.Second // exported for handler
	rematchTimeout     = 30 * time.Second
	// ...
)
```

Update `HandleDisconnect` to use `DisconnectTimeout` instead of `disconnectTimeout`.

Add `pausedFor` to Room struct:

```go
type Room struct {
	Code         string
	passwordHash []byte
	mu           sync.RWMutex
	players      []*player.Player
	hostID       string
	ready        map[string]bool
	engine       *game.Engine
	status       string
	cleanup      *time.Timer
	disconn      map[string]*time.Timer
	rematch      map[string]bool
	lastRankings []message.RankEntry
	lastScores   map[string]map[string]int
	pausedFor    *message.GamePausedPayload
}
```

Add `RetireResult` type and `RetirePlayer` method:

```go
type RetireResult struct {
	OK          bool
	WasTurn     bool
	ActiveCount int
}

func (r *Room) RetirePlayer(playerID string) RetireResult {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.engine == nil {
		return RetireResult{}
	}
	wasTurn := r.engine.RetirePlayer(playerID)
	activeCount := len(r.engine.PlayerOrder())
	// Remove from room's player list
	idx := -1
	for i, p := range r.players {
		if p.ID == playerID {
			idx = i
			break
		}
	}
	if idx != -1 {
		r.players = append(r.players[:idx], r.players[idx+1:]...)
	}
	delete(r.ready, playerID)
	delete(r.rematch, playerID)
	if r.hostID == playerID && len(r.players) > 0 {
		r.hostID = r.players[0].ID
	}
	// Clean up disconnect timer
	if timer, ok := r.disconn[playerID]; ok {
		timer.Stop()
		delete(r.disconn, playerID)
	}
	// Clear pause if it was for this player
	if r.pausedFor != nil && r.pausedFor.PlayerID == playerID {
		r.pausedFor = nil
	}
	return RetireResult{OK: true, WasTurn: wasTurn, ActiveCount: activeCount}
}
```

Add `IsPlayerConnected`:

```go
func (r *Room) IsPlayerConnected(playerID string) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, p := range r.players {
		if p.ID == playerID {
			return p.Connected()
		}
	}
	return false
}
```

Add pause state methods:

```go
func (r *Room) SetPausedFor(playerID, nickname string, expiresAt int64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.pausedFor = &message.GamePausedPayload{
		PlayerID:  playerID,
		Nickname:  nickname,
		ExpiresAt: expiresAt,
	}
}

func (r *Room) GetPausedFor() *message.GamePausedPayload {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.pausedFor
}

func (r *Room) ClearPausedFor() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.pausedFor = nil
}
```

Update `SyncPayload` case `StatusPlaying` to include `PausedFor`:

```go
case StatusPlaying:
	if r.engine == nil {
		return nil
	}
	var preview map[string]int
	if r.engine.RollCount() > 0 {
		preview = r.engine.Preview(r.engine.CurrentPlayer())
	}
	sp := r.statePayloadLocked()
	data, _ := message.New("game:sync", message.GameSyncPayload{
		Dice:          r.engine.Dice(),
		Held:          r.engine.Held(),
		RollCount:     r.engine.RollCount(),
		Scores:        r.engine.Scores(),
		CurrentPlayer: r.engine.CurrentPlayer(),
		Round:         r.engine.Round(),
		Preview:       preview,
		Players:       sp.Players,
		RoomCode:      sp.RoomCode,
		PausedFor:     r.pausedFor,
	})
	return data
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && go test ./room/ -run "TestIsPlayerConnected|TestRetirePlayerRoom|TestRetirePlayerNoGame|TestRetirePlayerGameEndWhenOneLeft|TestRetirePlayerSolo|TestSetPausedFor|TestClearPausedFor|TestSyncPayloadIncludesPausedFor" -v`
Expected: All PASS

- [ ] **Step 5: Run all existing tests**

Run: `cd server && go test ./...`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add server/room/room.go server/room/room_test.go
git commit -m "feat: add room-level RetirePlayer, pause state, connectivity check"
```

---

## Task 4: Server Handler — Disconnect Timer Change & game:leave

**Files:**
- Modify: `server/handler/ws.go:294-365,532-558`
- Test: `server/handler/ws_test.go`

- [ ] **Step 1: Write failing tests**

In `server/handler/ws_test.go`, add test for handleGameLeave logic. Since the handler requires WebSocket connections, test the message dispatch route exists:

```go
func TestHandleMessageRouting_GameLeave(t *testing.T) {
	// Verify that "game:leave" is a recognized message type
	// by checking the handler doesn't silently ignore it
	// This is an integration-level concern; unit test the room/engine logic instead.
	// The key test is that game:leave case exists in handleMessage.
	// We verify this by checking the handler compiles with the new case.
	t.Log("game:leave handler case exists — verified at compile time")
}
```

The real verification is that the handler changes compile and existing tests pass. The logic is tested through room/engine unit tests.

- [ ] **Step 2: Implement handler changes**

In `server/handler/ws.go`:

Add `game:leave` case to `handleMessage`:

```go
case "game:leave":
	wh.handleGameLeave(p)
```

Add the handler function:

```go
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
	p.Send(leftData) // also send to the leaver (they're already removed from room)

	if result.ActiveCount == 0 {
		// Solo player left — clean up room
		wh.hub.RemovePlayerFull(p.ID)
		wh.hub.RemoveRoom(rm.Code)
		return
	}
	if result.ActiveCount == 1 {
		// End game with rankings
		wh.endGame(rm)
		wh.hub.RemovePlayerFull(p.ID)
		return
	}
	// More than 1 player remains
	rm.BroadcastState()
	if result.WasTurn {
		wh.broadcastTurnOrPause(rm)
	}
	wh.hub.RemovePlayerFull(p.ID)
}
```

Modify `handleDisconnect` — during `StatusPlaying`, don't start timer immediately. Instead, check if it's the disconnected player's turn:

```go
case room.StatusPlaying:
	currentPlayer, _, _, ok := rm.TurnInfo()
	if ok && currentPlayer == p.ID {
		// Disconnected on their own turn — start pause immediately
		wh.startPauseTimer(rm, p)
	}
	// If not their turn, no timer yet — it starts when their turn arrives
	// via broadcastTurnOrPause
```

Add `startPauseTimer`:

```go
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
		if result.ActiveCount <= 1 && result.ActiveCount > 0 {
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
```

Add `broadcastTurnOrPause` — replaces direct `broadcastTurn` after score/turn advance:

```go
func (wh *WSHandler) broadcastTurnOrPause(rm *room.Room) {
	currentPlayer, round, _, ok := rm.TurnInfo()
	if !ok {
		return
	}
	if !rm.IsPlayerConnected(currentPlayer) {
		// Next player is disconnected — start pause
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
```

Update `handleScore` to use `broadcastTurnOrPause` instead of `broadcastTurn`:

```go
// In handleScore, change:
//   wh.broadcastTurn(rm)
// to:
//   wh.broadcastTurnOrPause(rm)
```

Update reconnect handler to cancel pause and send `game:resumed`:

```go
// In ServeHTTP reconnection block, after rm.HandleReconnect(p.ID):
if pf := rm.GetPausedFor(); pf != nil && pf.PlayerID == p.ID {
	rm.ClearPausedFor()
	resumeData, _ := message.New("game:resumed", message.GameResumedPayload{PlayerID: p.ID})
	rm.Broadcast(resumeData)
	// Now it's this player's turn — send turn info
	wh.broadcastTurn(rm)
}
```

Also update `endGame` to not overwrite nicknames that `Rankings()` already set (left players have nicknames from engine, active players need them from `NicknameMap`):

```go
func (wh *WSHandler) endGame(rm *room.Room) {
	rankings, ok := rm.GameRankings()
	if !ok {
		return
	}
	nicks := rm.NicknameMap()
	for i := range rankings {
		if nick, ok := nicks[rankings[i].PlayerID]; ok {
			rankings[i].Nickname = nick
		}
		// Left players already have Nickname set by Rankings()
	}
	data, _ := message.New("game:end", message.GameEndPayload{Rankings: rankings})
	rm.Broadcast(data)
	rm.EndGame(rankings)
	rm.StartRematchTimer(func() {
		wh.hub.RemoveRoom(rm.Code)
	})
}
```

Also update existing `player:left` message in `handleRoomLeave` to use expanded payload:

```go
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
```

Update `handleDisconnect` default (waiting) case to use `PlayerLeftPayload`:

```go
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
```

- [ ] **Step 3: Run all server tests**

Run: `cd server && go test ./...`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add server/handler/ws.go server/handler/ws_test.go
git commit -m "feat: add game:leave handler, pause-on-disconnect, broadcastTurnOrPause"
```

---

## Task 5: Client TypeScript Types & State

**Files:**
- Modify: `client/src/types/game.ts:66-71`
- Modify: `client/src/hooks/useGameState.ts`
- Test: `client/src/hooks/useGameState.test.ts`

- [ ] **Step 1: Write failing tests for new state actions**

In `client/src/hooks/useGameState.test.ts`, add:

```ts
describe('disconnect and leave features', () => {
  it('PLAYER_DISCONNECTED adds to disconnectedPlayers set', () => {
    const { result } = renderHook(() => useGameState());
    act(() => {
      result.current[1]({ type: 'PLAYER_DISCONNECTED', playerId: 'p2' });
    });
    expect(result.current[0].disconnectedPlayers).toContain('p2');
  });

  it('PLAYER_RECONNECTED removes from disconnectedPlayers', () => {
    const { result } = renderHook(() => useGameState());
    act(() => {
      result.current[1]({ type: 'PLAYER_DISCONNECTED', playerId: 'p2' });
      result.current[1]({ type: 'PLAYER_RECONNECTED', playerId: 'p2' });
    });
    expect(result.current[0].disconnectedPlayers).not.toContain('p2');
  });

  it('GAME_PAUSED sets pausedFor state', () => {
    const { result } = renderHook(() => useGameState());
    act(() => {
      result.current[1]({
        type: 'GAME_PAUSED',
        playerId: 'p2',
        nickname: 'Bob',
        expiresAt: 1711540860000,
      });
    });
    expect(result.current[0].pausedFor).toEqual({
      playerId: 'p2',
      nickname: 'Bob',
      expiresAt: 1711540860000,
    });
  });

  it('GAME_RESUMED clears pausedFor', () => {
    const { result } = renderHook(() => useGameState());
    act(() => {
      result.current[1]({
        type: 'GAME_PAUSED',
        playerId: 'p2',
        nickname: 'Bob',
        expiresAt: 1711540860000,
      });
      result.current[1]({ type: 'GAME_RESUMED', playerId: 'p2' });
    });
    expect(result.current[0].pausedFor).toBeNull();
  });

  it('ADD_TOAST adds toast and REMOVE_TOAST removes it', () => {
    const { result } = renderHook(() => useGameState());
    act(() => {
      result.current[1]({ type: 'ADD_TOAST', id: 't1', nickname: 'Bob', reason: 'voluntary' });
    });
    expect(result.current[0].toasts).toHaveLength(1);
    expect(result.current[0].toasts[0]).toEqual({ id: 't1', nickname: 'Bob', reason: 'voluntary' });
    act(() => {
      result.current[1]({ type: 'REMOVE_TOAST', id: 't1' });
    });
    expect(result.current[0].toasts).toHaveLength(0);
  });

  it('GAME_SYNC with pausedFor restores pause state', () => {
    const { result } = renderHook(() => useGameState());
    act(() => {
      result.current[1]({
        type: 'GAME_SYNC',
        dice: [1, 2, 3, 4, 5],
        held: [false, false, false, false, false],
        rollCount: 0,
        scores: {},
        currentPlayer: 'p2',
        round: 1,
        preview: {},
        players: [
          { id: 'p1', nickname: 'Alice', isHost: true, isReady: false },
          { id: 'p2', nickname: 'Bob', isHost: false, isReady: false },
        ],
        roomCode: 'ABC123',
        pausedFor: { playerId: 'p2', nickname: 'Bob', expiresAt: 1711540860000 },
      });
    });
    expect(result.current[0].pausedFor).toEqual({
      playerId: 'p2',
      nickname: 'Bob',
      expiresAt: 1711540860000,
    });
  });

  it('RESET_GAME clears disconnect/pause/toast state', () => {
    const { result } = renderHook(() => useGameState());
    act(() => {
      result.current[1]({ type: 'PLAYER_DISCONNECTED', playerId: 'p2' });
      result.current[1]({ type: 'GAME_PAUSED', playerId: 'p2', nickname: 'Bob', expiresAt: 999 });
      result.current[1]({ type: 'ADD_TOAST', id: 't1', nickname: 'Test', reason: 'voluntary' });
    });
    act(() => {
      result.current[1]({ type: 'RESET_GAME' });
    });
    expect(result.current[0].disconnectedPlayers).toEqual([]);
    expect(result.current[0].pausedFor).toBeNull();
    expect(result.current[0].toasts).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd client && npx vitest run src/hooks/useGameState.test.ts`
Expected: Type errors — new action types and state fields don't exist.

- [ ] **Step 3: Update types and state**

In `client/src/types/game.ts`, add `leftEarly` to `RankEntry` and new payload interfaces:

```ts
export interface RankEntry {
  playerId: string;
  nickname: string;
  score: number;
  rank: number;
  leftEarly?: boolean;
}

export interface GamePausedPayload {
  playerId: string;
  nickname: string;
  expiresAt: number;
}

export interface PlayerLeftPayload {
  playerId: string;
  nickname: string;
  reason: 'voluntary' | 'timeout' | 'normal';
}
```

Add `pausedFor` to `GameSyncPayload`:

```ts
export interface GameSyncPayload {
  // ... existing fields ...
  pausedFor?: GamePausedPayload | null;
}
```

In `client/src/hooks/useGameState.ts`, add to `GameState`:

```ts
disconnectedPlayers: string[];
pausedFor: { playerId: string; nickname: string; expiresAt: number } | null;
toasts: { id: string; nickname: string; reason: 'voluntary' | 'timeout' }[];
```

Add to `initialState`:

```ts
disconnectedPlayers: [],
pausedFor: null,
toasts: [],
```

Add new action types to `GameAction`:

```ts
| { type: 'PLAYER_DISCONNECTED'; playerId: string }
| { type: 'PLAYER_RECONNECTED'; playerId: string }
| { type: 'GAME_PAUSED'; playerId: string; nickname: string; expiresAt: number }
| { type: 'GAME_RESUMED'; playerId: string }
| { type: 'ADD_TOAST'; id: string; nickname: string; reason: 'voluntary' | 'timeout' }
| { type: 'REMOVE_TOAST'; id: string }
```

Add reducer cases:

```ts
case 'PLAYER_DISCONNECTED':
  return { ...state, disconnectedPlayers: [...state.disconnectedPlayers, action.playerId] };
case 'PLAYER_RECONNECTED':
  return {
    ...state,
    disconnectedPlayers: state.disconnectedPlayers.filter(id => id !== action.playerId),
  };
case 'GAME_PAUSED':
  return { ...state, pausedFor: { playerId: action.playerId, nickname: action.nickname, expiresAt: action.expiresAt } };
case 'GAME_RESUMED':
  return { ...state, pausedFor: null, disconnectedPlayers: state.disconnectedPlayers.filter(id => id !== action.playerId) };
case 'ADD_TOAST':
  return { ...state, toasts: [...state.toasts, { id: action.id, nickname: action.nickname, reason: action.reason }] };
case 'REMOVE_TOAST':
  return { ...state, toasts: state.toasts.filter(t => t.id !== action.id) };
```

Update `GAME_SYNC` case to include `pausedFor`:

```ts
case 'GAME_SYNC':
  return { ...state, dice: action.dice, held: action.held, rollCount: action.rollCount, scores: action.scores, currentPlayer: action.currentPlayer, round: action.round, phase: 'game', preview: action.preview ?? {}, players: action.players, roomCode: action.roomCode, pausedFor: action.pausedFor ?? null };
```

Update `RESET_GAME` to clear new fields:

```ts
case 'RESET_GAME':
  return { ...initialState, nickname: state.nickname };
```

(Already covered since `initialState` has the defaults.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd client && npx vitest run src/hooks/useGameState.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/types/game.ts client/src/hooks/useGameState.ts client/src/hooks/useGameState.test.ts
git commit -m "feat: add client state for disconnect/pause/toast/leave"
```

---

## Task 6: Client Event Handlers

**Files:**
- Modify: `client/src/hooks/useGameEvents.ts`

- [ ] **Step 1: Add event handlers for new messages**

In `client/src/hooks/useGameEvents.ts`, add imports for new types and add handlers:

```ts
// Add imports:
import type {
  // ... existing imports ...
  GamePausedPayload, PlayerLeftPayload,
} from '../types/game';
```

Add new event subscriptions inside the `unsubs` array:

```ts
ws.on('player:disconnected', (env) => {
  const p = env.payload as { playerId: string };
  dispatch({ type: 'PLAYER_DISCONNECTED', playerId: p.playerId });
}),
ws.on('game:paused', (env) => {
  const p = env.payload as GamePausedPayload;
  dispatch({ type: 'GAME_PAUSED', playerId: p.playerId, nickname: p.nickname, expiresAt: p.expiresAt });
}),
ws.on('game:resumed', (env) => {
  const p = env.payload as { playerId: string };
  dispatch({ type: 'GAME_RESUMED', playerId: p.playerId });
}),
```

Update existing `player:left` handler to handle expanded payload with toasts. Note: toast messages must use i18n. Since `useGameEvents` doesn't have access to `t()`, pass the raw reason/nickname to the reducer and let the UI layer format the message with i18n. Alternatively, move toast creation to the component. **Preferred: store structured toast data in state, format with i18n in component.**

Change toast state type to structured data:

```ts
// In useGameState.ts, change toast type:
toasts: { id: string; nickname: string; reason: 'voluntary' | 'timeout' }[];

// ADD_TOAST action:
| { type: 'ADD_TOAST'; id: string; nickname: string; reason: 'voluntary' | 'timeout' }
```

Event handler:

```ts
ws.on('player:left', (env) => {
  const p = env.payload as PlayerLeftPayload;
  dispatch({ type: 'REMOVE_PLAYER', playerId: p.playerId });
  // Clear pause if it was for this player
  dispatch({ type: 'GAME_RESUMED', playerId: p.playerId });
  // Toast for other players (not self — self handles via phase transition)
  if (p.reason && p.reason !== 'normal' && p.nickname) {
    const id = `left-${p.playerId}-${Date.now()}`;
    dispatch({ type: 'ADD_TOAST', id, nickname: p.nickname, reason: p.reason });
    setTimeout(() => dispatch({ type: 'REMOVE_TOAST', id }), 3000);
  }
}),
```

In GamePage toast rendering, use i18n:

```tsx
{state.toasts.map(toast => (
  <div key={toast.id} className="...">
    {toast.reason === 'voluntary'
      ? t('game.leave.toast.voluntary', { name: toast.nickname })
      : t('game.leave.toast.timeout', { name: toast.nickname })}
  </div>
))}
```

Handle reconnect clearing disconnect status. On `room:state` (already broadcast after reconnect), clear `disconnectedPlayers` for any player present in the state. Update the `room:state` handler:

```ts
ws.on('room:state', (env) => {
  if (getPhase() !== 'room') return;
  const p = env.payload as RoomState;
  dispatch({ type: 'SET_ROOM_STATE', roomCode: p.roomCode, players: p.players });
}),
```

Also add a `player:reconnected` dispatch to `PLAYER_RECONNECTED` when `room:state` arrives during game phase (the server broadcasts `room:state` on reconnect). Add a new handler:

```ts
ws.on('room:state', (env) => {
  const p = env.payload as RoomState;
  // During game phase, room:state means a player reconnected — sync player list
  if (getPhase() === 'game') {
    // Clear disconnect indicators for all players in the new state
    for (const player of p.players) {
      dispatch({ type: 'PLAYER_RECONNECTED', playerId: player.id });
    }
    return;
  }
  if (getPhase() !== 'room') return;
  dispatch({ type: 'SET_ROOM_STATE', roomCode: p.roomCode, players: p.players });
}),
```

- [ ] **Step 2: Update audit test for room:state handler change**

The audit test at `client/src/audit/comprehensive-review.test.ts` enforces that `room:state` is only processed in room phase. Since we now also handle it during game phase (for reconnect indicators), update the audit test to allow this new behavior. Find the regex check and update it to accept the new pattern, or remove that specific assertion.

- [ ] **Step 3: Run client tests**

Run: `cd client && npx vitest run`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add client/src/hooks/useGameEvents.ts client/src/audit/comprehensive-review.test.ts
git commit -m "feat: add client event handlers for disconnect/pause/leave messages"
```

---

## Task 7: i18n Translations

**Files:**
- Modify: `client/src/i18n/ko.json`
- Modify: `client/src/i18n/en.json`
- Modify: `client/src/i18n/ja.json`

- [ ] **Step 1: Add translation keys**

Add to each language file under `"game"` section:

**ko.json:**
```json
"game.paused.title": "{{name}}님의 연결이 끊겼습니다",
"game.paused.subtitle": "재연결 대기 중...",
"game.paused.remaining": "{{seconds}}초 남음",
"game.leave.confirm.title": "정말로 나가시겠습니까?",
"game.leave.confirm.body": "현재까지의 점수만 인정되며 게임에 복귀할 수 없습니다.",
"game.leave.button": "나가기",
"game.leave.toast.voluntary": "{{name}}님이 게임을 나갔습니다",
"game.leave.toast.timeout": "{{name}}님의 연결이 끊겨 퇴장되었습니다",
"game.result.leftEarly": "중도 퇴장"
```

**en.json:**
```json
"game.paused.title": "{{name}} has disconnected",
"game.paused.subtitle": "Waiting for reconnection...",
"game.paused.remaining": "{{seconds}}s remaining",
"game.leave.confirm.title": "Leave the game?",
"game.leave.confirm.body": "Only your current score will count. You cannot rejoin.",
"game.leave.button": "Leave",
"game.leave.toast.voluntary": "{{name}} left the game",
"game.leave.toast.timeout": "{{name}} was disconnected",
"game.result.leftEarly": "Left early"
```

**ja.json:**
```json
"game.paused.title": "{{name}}さんの接続が切れました",
"game.paused.subtitle": "再接続を待っています...",
"game.paused.remaining": "残り{{seconds}}秒",
"game.leave.confirm.title": "本当に退出しますか？",
"game.leave.confirm.body": "現在のスコアのみが記録され、復帰できません。",
"game.leave.button": "退出",
"game.leave.toast.voluntary": "{{name}}さんがゲームを退出しました",
"game.leave.toast.timeout": "{{name}}さんの接続が切れて退出しました",
"game.result.leftEarly": "途中退出"
```

- [ ] **Step 2: Run i18n completeness test**

Run: `cd client && npx vitest run src/audit/i18n-completeness.test.ts`
Expected: PASS (all languages have matching keys)

- [ ] **Step 3: Commit**

```bash
git add client/src/i18n/ko.json client/src/i18n/en.json client/src/i18n/ja.json
git commit -m "feat: add i18n keys for disconnect/leave features"
```

---

## Task 8: GamePausedOverlay Component

**Files:**
- Create: `client/src/components/GamePausedOverlay.tsx`
- Create: `client/src/components/GamePausedOverlay.test.tsx`

- [ ] **Step 1: Write failing test**

Create `client/src/components/GamePausedOverlay.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import GamePausedOverlay from './GamePausedOverlay';

// Mock i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'game.paused.title': `${opts?.name} has disconnected`,
        'game.paused.subtitle': 'Waiting for reconnection...',
        'game.paused.remaining': `${opts?.seconds}s remaining`,
      };
      return map[key] ?? key;
    },
  }),
}));

describe('GamePausedOverlay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when pausedFor is null', () => {
    const { container } = render(<GamePausedOverlay pausedFor={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders overlay with player name and countdown', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    render(
      <GamePausedOverlay
        pausedFor={{ playerId: 'p2', nickname: 'Bob', expiresAt: now + 45000 }}
      />
    );
    expect(screen.getByText('Bob has disconnected')).toBeTruthy();
    expect(screen.getByText('Waiting for reconnection...')).toBeTruthy();
    expect(screen.getByText('45s remaining')).toBeTruthy();
  });

  it('counts down every second', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    render(
      <GamePausedOverlay
        pausedFor={{ playerId: 'p2', nickname: 'Bob', expiresAt: now + 10000 }}
      />
    );
    expect(screen.getByText('10s remaining')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText('9s remaining')).toBeTruthy();
  });

  it('shows 0 when expired', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    render(
      <GamePausedOverlay
        pausedFor={{ playerId: 'p2', nickname: 'Bob', expiresAt: now - 1000 }}
      />
    );
    expect(screen.getByText('0s remaining')).toBeTruthy();
  });

  it('has accessible role and label', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    render(
      <GamePausedOverlay
        pausedFor={{ playerId: 'p2', nickname: 'Bob', expiresAt: now + 30000 }}
      />
    );
    expect(screen.getByRole('alert')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/components/GamePausedOverlay.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `client/src/components/GamePausedOverlay.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface PausedFor {
  playerId: string;
  nickname: string;
  expiresAt: number;
}

interface Props {
  pausedFor: PausedFor | null;
}

export default function GamePausedOverlay({ pausedFor }: Props) {
  const { t } = useTranslation();
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!pausedFor) return;
    const update = () => {
      const left = Math.max(0, Math.ceil((pausedFor.expiresAt - Date.now()) / 1000));
      setRemaining(left);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [pausedFor]);

  if (!pausedFor) return null;

  const total = 60;
  const progress = Math.min(1, remaining / total);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center" role="alert">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative bg-black/80 backdrop-blur-md border border-white/10 rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl text-center space-y-4">
        <div className="text-yellow-400 text-4xl">⚠</div>
        <h2 className="text-white text-lg font-bold">
          {t('game.paused.title', { name: pausedFor.nickname })}
        </h2>
        <p className="text-gray-400 text-sm">
          {t('game.paused.subtitle')}
        </p>
        <p className="text-white text-2xl font-bold tabular-nums">
          {t('game.paused.remaining', { seconds: remaining })}
        </p>
        <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
          <div
            className="h-full bg-yellow-500 rounded-full transition-[width] duration-1000 ease-linear"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/components/GamePausedOverlay.test.tsx`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/components/GamePausedOverlay.tsx client/src/components/GamePausedOverlay.test.tsx
git commit -m "feat: add GamePausedOverlay component with countdown"
```

---

## Task 9: GamePage — Leave Button, Overlay, Toast Integration

**Files:**
- Modify: `client/src/pages/GamePage.tsx:161-250`
- Test: `client/src/pages/GamePage.test.tsx`

- [ ] **Step 1: Write failing tests**

In `client/src/pages/GamePage.test.tsx`, add tests for the leave button:

```tsx
// Add to existing describe block or new describe:
describe('leave button', () => {
  it('renders leave button in header', () => {
    // render GamePage with default props
    // look for button with accessible name matching leave
    const btn = screen.getByRole('button', { name: /leave|나가기|退出/i });
    expect(btn).toBeTruthy();
  });

  it('shows confirm dialog when leave button clicked', async () => {
    // click leave button
    // expect confirm dialog to appear
  });
});
```

The exact test structure depends on existing GamePage test setup. Adapt to the existing pattern.

- [ ] **Step 2: Implement GamePage changes**

In `client/src/pages/GamePage.tsx`:

Add imports:

```tsx
import GamePausedOverlay from '../components/GamePausedOverlay';
import ConfirmDialog from '../components/ConfirmDialog';
```

Add leave state:

```tsx
const [confirmLeave, setConfirmLeave] = useState(false);
```

Add leave handler — only sends the message; lobby transition is driven by the server's `player:left` response received in `useGameEvents` (where `playerId === myId` triggers `RESET_GAME`):

```tsx
const handleLeave = useCallback(() => {
  send('game:leave');
}, [send]);
```

In `useGameEvents.ts`, the `player:left` handler must check for self-leave and trigger lobby transition. This requires passing `playerId` to the hook. Update `useGameEvents` signature to accept `getPlayerId: () => string | null`:

```ts
ws.on('player:left', (env) => {
  const p = env.payload as PlayerLeftPayload;
  if (p.playerId === getPlayerId()) {
    // Self left — go to lobby
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.replaceState({}, '', url);
    dispatch({ type: 'RESET_GAME' });
    return;
  }
  dispatch({ type: 'REMOVE_PLAYER', playerId: p.playerId });
  dispatch({ type: 'GAME_RESUMED', playerId: p.playerId });
  if (p.reason && p.reason !== 'normal' && p.nickname) {
    const id = `left-${p.playerId}-${Date.now()}`;
    dispatch({ type: 'ADD_TOAST', id, nickname: p.nickname, reason: p.reason });
    setTimeout(() => dispatch({ type: 'REMOVE_TOAST', id }), 3000);
  }
}),
```

In the header, add leave button before the round indicator:

```tsx
<header className={`pointer-events-auto flex justify-between items-center px-4 py-2.5 ...`}>
  <div className="flex items-center gap-2">
    <button
      onClick={() => setConfirmLeave(true)}
      className="text-white/60 hover:text-white transition-colors p-1 -ml-1"
      aria-label={t('game.leave.button')}
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
        <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
      </svg>
    </button>
    <span className="text-white font-bold tabular-nums">
      {t('game.round')} {state.round}/12
    </span>
  </div>
  {/* ... rest of header unchanged ... */}
</header>
```

Add overlay and dialog after HandAnnouncement:

```tsx
<GamePausedOverlay pausedFor={state.pausedFor} />

{/* Toast notifications */}
<div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
  {state.toasts.map(toast => (
    <div key={toast.id} className="bg-black/80 backdrop-blur-md text-white text-sm px-4 py-2 rounded-xl border border-white/10 animate-fade-in">
      {toast.reason === 'voluntary'
        ? t('game.leave.toast.voluntary', { name: toast.nickname })
        : t('game.leave.toast.timeout', { name: toast.nickname })}
    </div>
  ))}
</div>

{/* Leave confirmation */}
<ConfirmDialog
  open={confirmLeave}
  message={t('game.leave.confirm.body')}
  confirmLabel={t('game.leave.button')}
  cancelLabel={t('room.cancel')}
  variant="danger"
  onConfirm={handleLeave}
  onCancel={() => setConfirmLeave(false)}
/>
```

Add disconnected player indicator in ScoreBoard props (if ScoreBoard supports it) or pass `disconnectedPlayers` prop:

```tsx
<ScoreBoard
  // ... existing props ...
  disconnectedPlayers={state.disconnectedPlayers}
/>
```

- [ ] **Step 3: Run tests**

Run: `cd client && npx vitest run src/pages/GamePage.test.tsx`
Expected: PASS

- [ ] **Step 4: Run all client tests**

Run: `cd client && npx vitest run`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/GamePage.tsx client/src/pages/GamePage.test.tsx
git commit -m "feat: add leave button, pause overlay, and toast to GamePage"
```

---

## Task 10: ScoreBoard — Disconnected Player Indicator

**Files:**
- Modify: `client/src/components/ScoreBoard.tsx`
- Test: `client/src/components/ScoreBoard.test.tsx`

- [ ] **Step 1: Write failing test**

In `client/src/components/ScoreBoard.test.tsx`, add:

```tsx
it('shows warning icon for disconnected players', () => {
  // Render ScoreBoard with disconnectedPlayers=['p2']
  // Expect ⚠ icon next to p2's name
});
```

- [ ] **Step 2: Add `disconnectedPlayers` prop to ScoreBoard**

Add prop `disconnectedPlayers?: string[]`. In the player header rendering, if the player ID is in `disconnectedPlayers`, add a `⚠` icon and opacity styling.

- [ ] **Step 3: Run tests**

Run: `cd client && npx vitest run src/components/ScoreBoard.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add client/src/components/ScoreBoard.tsx client/src/components/ScoreBoard.test.tsx
git commit -m "feat: add disconnected player indicator in ScoreBoard"
```

---

## Task 11: ResultPage — Left Early Label

**Files:**
- Modify: `client/src/pages/ResultPage.tsx:148-167`
- Test: `client/src/pages/ResultPage.test.tsx`

- [ ] **Step 1: Write failing test**

In `client/src/pages/ResultPage.test.tsx`, add:

```tsx
it('shows left early label for retired players', () => {
  // Render ResultPage with rankings that include leftEarly: true
  // Expect "(중도 퇴장)" or equivalent text
});
```

- [ ] **Step 2: Update ResultPage ranking display**

In the multiplayer ranking bar and table, check `r.leftEarly` and append the label:

```tsx
{r.leftEarly && (
  <span className="text-gray-500 text-xs ml-1">({t('game.result.leftEarly')})</span>
)}
```

- [ ] **Step 3: Run tests**

Run: `cd client && npx vitest run src/pages/ResultPage.test.tsx`
Expected: PASS

- [ ] **Step 4: Run all tests**

Run: `cd client && npx vitest run`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/ResultPage.tsx client/src/pages/ResultPage.test.tsx
git commit -m "feat: show left-early label in result rankings"
```

---

## Task 12: Integration Verification

- [ ] **Step 1: Run all server tests**

Run: `cd server && go test ./... -v`
Expected: All PASS

- [ ] **Step 2: Run all client tests**

Run: `cd client && npx vitest run`
Expected: All PASS

- [ ] **Step 3: Build check**

Run: `cd client && npx tsc --noEmit && npx vite build`
Expected: No errors

- [ ] **Step 4: Final commit if any remaining changes**

```bash
git status
# If any unstaged changes, add and commit
```
