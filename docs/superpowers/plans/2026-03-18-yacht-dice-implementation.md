# Yacht Dice Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an online multiplayer Yacht Dice game with Go backend, React frontend, and Docker Compose deployment.

**Architecture:** Go backend (Chi + Gorilla WebSocket) manages game state and rooms. React frontend (Vite + TypeScript + Tailwind) provides UI. nginx reverse-proxies WebSocket connections. 3D dice rendering uses an existing Three.js + cannon-es implementation.

**Tech Stack:** Go 1.22, Chi v5, Gorilla WebSocket, React 18, Vite 5, TypeScript, Tailwind CSS 3, Three.js 0.162, cannon-es, react-i18next, Docker Compose

**Spec:** `docs/superpowers/specs/2026-03-18-yacht-dice-design.md`

**3D Dice Reference:** `C:\Users\USER\Desktop\Work\Dice\index.html` — has `window.DiceGame` API: `setValues([])`, `shake()`, `roll()`, `getValues()`, `onResult(cb)`

---

## Chunk 0: Git Init

### Task 0: Initialize Git Repository

- [ ] **Step 1: Initialize git and make first commit**

```bash
cd "C:/Users/USER/Desktop/Work/WebstormProjects/yatch-dice" && git init && git add .gitignore && git commit -m "chore: initial commit"
```

- [ ] **Step 2: Create server and client directories**

```bash
mkdir -p server client
```

---

## Chunk 1: Backend Core (Score + Messages + Player)

### Task 1: Go Module Init

**Files:**
- Create: `server/go.mod`
- Create: `server/go.sum`

- [ ] **Step 1: Initialize Go module**

```bash
cd server && go mod init yacht-dice-server
```

- [ ] **Step 2: Add dependencies**

```bash
cd server && go get github.com/go-chi/chi/v5@v5.0.12 && go get github.com/go-chi/cors && go get github.com/gorilla/websocket@v1.5.3 && go get github.com/google/uuid@v1.6.0
```

- [ ] **Step 3: Commit**

```bash
git add server/go.mod server/go.sum
git commit -m "chore: init go module with dependencies"
```

---

### Task 2: Message Types

**Files:**
- Create: `server/message/message.go`

- [ ] **Step 1: Write message types**

```go
package message

import "encoding/json"

type Envelope struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

func New(typ string, payload any) ([]byte, error) {
	p, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	return json.Marshal(Envelope{Type: typ, Payload: p})
}

func Parse(data []byte) (Envelope, error) {
	var e Envelope
	err := json.Unmarshal(data, &e)
	return e, err
}

// Error codes
const (
	ErrNotYourTurn     = "NOT_YOUR_TURN"
	ErrCategoryFilled  = "CATEGORY_FILLED"
	ErrInvalidRoll     = "INVALID_ROLL"
	ErrRoomFull        = "ROOM_FULL"
	ErrWrongPassword   = "WRONG_PASSWORD"
	ErrRoomNotFound    = "ROOM_NOT_FOUND"
	ErrGameInProgress  = "GAME_IN_PROGRESS"
)

// Payloads: Lobby
type RoomCreatePayload struct {
	Password string `json:"password,omitempty"`
}
type RoomCreatedPayload struct {
	RoomCode string `json:"roomCode"`
}
type RoomJoinPayload struct {
	RoomCode string `json:"roomCode"`
	Password string `json:"password,omitempty"`
}
type RoomListItem struct {
	Code        string `json:"code"`
	PlayerCount int    `json:"playerCount"`
	HasPassword bool   `json:"hasPassword"`
	Status      string `json:"status"` // "waiting" | "playing"
}

// Payloads: Waiting Room
type PlayerInfo struct {
	ID       string `json:"id"`
	Nickname string `json:"nickname"`
	IsHost   bool   `json:"isHost"`
	IsReady  bool   `json:"isReady"`
}
type RoomStatePayload struct {
	RoomCode string       `json:"roomCode"`
	Players  []PlayerInfo `json:"players"`
}
type GameStartPayload struct {
	PlayerOrder []string `json:"playerOrder"`
}

// Payloads: Game
type GameRollPayload struct {
	Held []int `json:"held"` // indices 0-4
}
type GameRolledPayload struct {
	Dice      [5]int `json:"dice"`
	RollCount int    `json:"rollCount"`
}
type GameScorePayload struct {
	Category string `json:"category"`
}
type GameScoredPayload struct {
	PlayerID    string            `json:"playerId"`
	Category    string            `json:"category"`
	Score       int               `json:"score"`
	TotalScores map[string]map[string]int `json:"totalScores"` // playerId -> category -> score
}
type GameTurnPayload struct {
	CurrentPlayer string `json:"currentPlayer"`
	Round         int    `json:"round"`
}
type GameSyncPayload struct {
	Dice          [5]int                    `json:"dice"`
	Held          [5]bool                   `json:"held"`
	RollCount     int                       `json:"rollCount"`
	Scores        map[string]map[string]int `json:"scores"`
	CurrentPlayer string                    `json:"currentPlayer"`
	Round         int                       `json:"round"`
}
type GameEndPayload struct {
	Rankings []RankEntry `json:"rankings"`
}
type RankEntry struct {
	PlayerID string `json:"playerId"`
	Nickname string `json:"nickname"`
	Score    int    `json:"score"`
	Rank     int    `json:"rank"`
}

// Payloads: Reaction
type ReactionSendPayload struct {
	Emoji string `json:"emoji"`
}
type ReactionShowPayload struct {
	PlayerID string `json:"playerId"`
	Emoji    string `json:"emoji"`
}

// Payloads: Connection
type ConnectedPayload struct {
	PlayerID string `json:"playerId"`
}
type PlayerEventPayload struct {
	PlayerID string `json:"playerId"`
}
type ErrorPayload struct {
	Message string `json:"message"`
	Code    string `json:"code"`
}
```

- [ ] **Step 2: Commit**

```bash
git add server/message/
git commit -m "feat: add WebSocket message types and serialization"
```

---

### Task 3: Score Calculator (TDD)

**Files:**
- Create: `server/game/score.go`
- Create: `server/game/score_test.go`

- [ ] **Step 1: Write failing tests**

```go
package game

import "testing"

func TestOnes(t *testing.T) {
	if got := Calculate([5]int{1, 1, 3, 4, 5}, "ones"); got != 2 {
		t.Errorf("ones = %d, want 2", got)
	}
}
func TestSixes(t *testing.T) {
	if got := Calculate([5]int{6, 6, 6, 1, 2}, "sixes"); got != 18 {
		t.Errorf("sixes = %d, want 18", got)
	}
}
func TestChoice(t *testing.T) {
	if got := Calculate([5]int{1, 2, 3, 4, 5}, "choice"); got != 15 {
		t.Errorf("choice = %d, want 15", got)
	}
}
func TestFourOfAKind(t *testing.T) {
	if got := Calculate([5]int{3, 3, 3, 3, 5}, "fourOfAKind"); got != 17 {
		t.Errorf("fourOfAKind = %d, want 17", got)
	}
}
func TestFourOfAKindFail(t *testing.T) {
	if got := Calculate([5]int{3, 3, 3, 2, 5}, "fourOfAKind"); got != 0 {
		t.Errorf("fourOfAKind = %d, want 0", got)
	}
}
func TestFullHouse(t *testing.T) {
	if got := Calculate([5]int{2, 2, 3, 3, 3}, "fullHouse"); got != 25 {
		t.Errorf("fullHouse = %d, want 25", got)
	}
}
func TestFullHouseFail(t *testing.T) {
	if got := Calculate([5]int{2, 2, 3, 3, 4}, "fullHouse"); got != 0 {
		t.Errorf("fullHouse = %d, want 0", got)
	}
}
func TestSmallStraight(t *testing.T) {
	tests := [][5]int{{1, 2, 3, 4, 6}, {2, 3, 4, 5, 5}, {1, 3, 4, 5, 6}}
	for _, d := range tests {
		if got := Calculate(d, "smallStraight"); got != 30 {
			t.Errorf("smallStraight(%v) = %d, want 30", d, got)
		}
	}
}
func TestSmallStraightFail(t *testing.T) {
	if got := Calculate([5]int{1, 2, 3, 5, 6}, "smallStraight"); got != 0 {
		t.Errorf("smallStraight = %d, want 0", got)
	}
}
func TestLargeStraight(t *testing.T) {
	if got := Calculate([5]int{1, 2, 3, 4, 5}, "largeStraight"); got != 40 {
		t.Errorf("largeStraight = %d, want 40", got)
	}
	if got := Calculate([5]int{2, 3, 4, 5, 6}, "largeStraight"); got != 40 {
		t.Errorf("largeStraight = %d, want 40", got)
	}
}
func TestLargeStraightFail(t *testing.T) {
	if got := Calculate([5]int{1, 2, 3, 4, 6}, "largeStraight"); got != 0 {
		t.Errorf("largeStraight = %d, want 0", got)
	}
}
func TestYacht(t *testing.T) {
	if got := Calculate([5]int{4, 4, 4, 4, 4}, "yacht"); got != 50 {
		t.Errorf("yacht = %d, want 50", got)
	}
}
func TestYachtFail(t *testing.T) {
	if got := Calculate([5]int{4, 4, 4, 4, 5}, "yacht"); got != 0 {
		t.Errorf("yacht = %d, want 0", got)
	}
}
func TestUpperBonus(t *testing.T) {
	scores := map[string]int{"ones": 3, "twos": 8, "threes": 12, "fours": 16, "fives": 15, "sixes": 18}
	if got := UpperBonus(scores); got != 35 {
		t.Errorf("upperBonus = %d, want 35", got)
	}
}
func TestUpperBonusNot(t *testing.T) {
	scores := map[string]int{"ones": 1, "twos": 2, "threes": 3, "fours": 4, "fives": 5, "sixes": 6}
	if got := UpperBonus(scores); got != 0 {
		t.Errorf("upperBonus = %d, want 0", got)
	}
}
func TestAllCategories(t *testing.T) {
	cats := AllCategories()
	if len(cats) != 12 {
		t.Errorf("categories count = %d, want 12", len(cats))
	}
}
func TestInvalidCategory(t *testing.T) {
	if got := Calculate([5]int{1, 2, 3, 4, 5}, "invalid"); got != -1 {
		t.Errorf("invalid = %d, want -1", got)
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd server && go test ./game/ -v
```

Expected: FAIL (functions not defined)

- [ ] **Step 3: Implement score.go**

```go
package game

import "sort"

var categories = []string{
	"ones", "twos", "threes", "fours", "fives", "sixes",
	"choice", "fourOfAKind", "fullHouse",
	"smallStraight", "largeStraight", "yacht",
}

func AllCategories() []string {
	out := make([]string, len(categories))
	copy(out, categories)
	return out
}

func Calculate(dice [5]int, category string) int {
	counts := [7]int{}
	sum := 0
	for _, d := range dice {
		counts[d]++
		sum += d
	}
	switch category {
	case "ones":
		return counts[1] * 1
	case "twos":
		return counts[2] * 2
	case "threes":
		return counts[3] * 3
	case "fours":
		return counts[4] * 4
	case "fives":
		return counts[5] * 5
	case "sixes":
		return counts[6] * 6
	case "choice":
		return sum
	case "fourOfAKind":
		for v := 1; v <= 6; v++ {
			if counts[v] >= 4 {
				return sum
			}
		}
		return 0
	case "fullHouse":
		has3, has2 := false, false
		for v := 1; v <= 6; v++ {
			if counts[v] == 3 {
				has3 = true
			}
			if counts[v] == 2 {
				has2 = true
			}
		}
		if has3 && has2 {
			return 25
		}
		return 0
	case "smallStraight":
		sorted := make([]int, 5)
		copy(sorted, dice[:])
		sort.Ints(sorted)
		uniq := []int{sorted[0]}
		for i := 1; i < 5; i++ {
			if sorted[i] != sorted[i-1] {
				uniq = append(uniq, sorted[i])
			}
		}
		if hasRun(uniq, 4) {
			return 30
		}
		return 0
	case "largeStraight":
		sorted := make([]int, 5)
		copy(sorted, dice[:])
		sort.Ints(sorted)
		for i := 1; i < 5; i++ {
			if sorted[i] != sorted[i-1]+1 {
				return 0
			}
		}
		return 40
	case "yacht":
		for v := 1; v <= 6; v++ {
			if counts[v] == 5 {
				return 50
			}
		}
		return 0
	default:
		return -1
	}
}

func hasRun(uniq []int, length int) bool {
	if len(uniq) < length {
		return false
	}
	run := 1
	for i := 1; i < len(uniq); i++ {
		if uniq[i] == uniq[i-1]+1 {
			run++
			if run >= length {
				return true
			}
		} else {
			run = 1
		}
	}
	return false
}

var upperCategories = []string{"ones", "twos", "threes", "fours", "fives", "sixes"}

func UpperBonus(scores map[string]int) int {
	sum := 0
	for _, cat := range upperCategories {
		sum += scores[cat]
	}
	if sum >= 63 {
		return 35
	}
	return 0
}

func TotalScore(scores map[string]int) int {
	sum := 0
	for _, v := range scores {
		sum += v
	}
	sum += UpperBonus(scores)
	return sum
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd server && go test ./game/ -v
```

Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add server/game/
git commit -m "feat: add score calculator with full test coverage"
```

---

### Task 4: Player Type

**Files:**
- Create: `server/player/player.go`

- [ ] **Step 1: Write player.go**

```go
package player

import (
	"sync"
	"github.com/gorilla/websocket"
)

type Player struct {
	ID       string
	Nickname string
	Conn     *websocket.Conn
	mu       sync.Mutex
}

func New(id, nickname string, conn *websocket.Conn) *Player {
	return &Player{ID: id, Nickname: nickname, Conn: conn}
}

func (p *Player) Send(data []byte) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.Conn == nil {
		return nil
	}
	return p.Conn.WriteMessage(websocket.TextMessage, data)
}

func (p *Player) SetConn(conn *websocket.Conn) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.Conn = conn
}

func (p *Player) Connected() bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.Conn != nil
}
```

- [ ] **Step 2: Commit**

```bash
git add server/player/
git commit -m "feat: add player type with thread-safe connection"
```

---

## Chunk 2: Backend Room + Game Engine

### Task 5: Game Engine

**Files:**
- Create: `server/game/engine.go`
- Create: `server/game/engine_test.go`

- [ ] **Step 1: Write engine tests**

```go
package game

import (
	"testing"
)

func TestNewEngine(t *testing.T) {
	e := NewEngine([]string{"p1", "p2"})
	if e.CurrentPlayer() != "p1" {
		t.Errorf("first player = %s, want p1", e.CurrentPlayer())
	}
	if e.Round() != 1 {
		t.Errorf("round = %d, want 1", e.Round())
	}
	if e.RollCount() != 0 {
		t.Errorf("rollCount = %d, want 0", e.RollCount())
	}
}

func TestRoll(t *testing.T) {
	e := NewEngine([]string{"p1", "p2"})
	dice, err := e.Roll("p1", []int{})
	if err != nil {
		t.Fatal(err)
	}
	for _, d := range dice {
		if d < 1 || d > 6 {
			t.Errorf("dice value out of range: %d", d)
		}
	}
	if e.RollCount() != 1 {
		t.Errorf("rollCount = %d, want 1", e.RollCount())
	}
}

func TestRollWrongPlayer(t *testing.T) {
	e := NewEngine([]string{"p1", "p2"})
	_, err := e.Roll("p2", []int{})
	if err == nil {
		t.Error("expected error for wrong player")
	}
}

func TestRollFirstMustBeEmpty(t *testing.T) {
	e := NewEngine([]string{"p1", "p2"})
	_, err := e.Roll("p1", []int{0, 1})
	if err == nil {
		t.Error("expected error for held on first roll")
	}
}

func TestRollMax3(t *testing.T) {
	e := NewEngine([]string{"p1", "p2"})
	e.Roll("p1", []int{})
	e.Roll("p1", []int{0, 1})
	e.Roll("p1", []int{0, 1, 2})
	_, err := e.Roll("p1", []int{})
	if err == nil {
		t.Error("expected error for 4th roll")
	}
}

func TestScoreAndAdvance(t *testing.T) {
	e := NewEngine([]string{"p1", "p2"})
	e.Roll("p1", []int{})
	score, err := e.Score("p1", "choice")
	if err != nil {
		t.Fatal(err)
	}
	if score < 5 || score > 30 {
		t.Errorf("choice score out of range: %d", score)
	}
	if e.CurrentPlayer() != "p2" {
		t.Errorf("next player = %s, want p2", e.CurrentPlayer())
	}
}

func TestScoreDuplicate(t *testing.T) {
	e := NewEngine([]string{"p1", "p2"})
	e.Roll("p1", []int{})
	e.Score("p1", "choice")
	e.Roll("p2", []int{})
	e.Score("p2", "choice")
	e.Roll("p1", []int{})
	_, err := e.Score("p1", "choice")
	if err == nil {
		t.Error("expected error for duplicate category")
	}
}

func TestGameEnd(t *testing.T) {
	e := NewEngine([]string{"p1", "p2"})
	cats := AllCategories()
	for round := 0; round < 13; round++ {
		for _, pid := range []string{"p1", "p2"} {
			e.Roll(pid, []int{})
			e.Score(pid, cats[round])
		}
	}
	if !e.IsFinished() {
		t.Error("game should be finished after 13 rounds")
	}
}

func TestRemovePlayer(t *testing.T) {
	e := NewEngine([]string{"p1", "p2", "p3"})
	e.RemovePlayer("p2")
	if len(e.PlayerOrder()) != 2 {
		t.Errorf("players = %d, want 2", len(e.PlayerOrder()))
	}
}

func TestHeld(t *testing.T) {
	e := NewEngine([]string{"p1"})
	e.Roll("p1", []int{})
	e.Roll("p1", []int{0, 2, 4})
	h := e.Held()
	if !h[0] || h[1] || !h[2] || h[3] || !h[4] {
		t.Errorf("held = %v, want [true false true false true]", h)
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd server && go test ./game/ -v -run TestNew
```

Expected: FAIL

- [ ] **Step 3: Implement engine.go**

```go
package game

import (
	"errors"
	"math/rand"
	"yacht-dice-server/message"
)

type Engine struct {
	playerOrder []string
	turnIdx     int
	round       int
	dice        [5]int
	held        [5]bool
	rollCount   int
	scores      map[string]map[string]int // playerId -> category -> score
	finished    bool
}

func NewEngine(playerOrder []string) *Engine {
	scores := make(map[string]map[string]int)
	for _, pid := range playerOrder {
		scores[pid] = make(map[string]int)
	}
	return &Engine{
		playerOrder: playerOrder,
		turnIdx:     0,
		round:       1,
		scores:      scores,
	}
}

func (e *Engine) CurrentPlayer() string {
	if e.turnIdx >= len(e.playerOrder) {
		return ""
	}
	return e.playerOrder[e.turnIdx]
}

func (e *Engine) Round() int         { return e.round }
func (e *Engine) RollCount() int     { return e.rollCount }
func (e *Engine) Dice() [5]int       { return e.dice }
func (e *Engine) Held() [5]bool      { return e.held }
func (e *Engine) IsFinished() bool   { return e.finished }
func (e *Engine) PlayerOrder() []string {
	out := make([]string, len(e.playerOrder))
	copy(out, e.playerOrder)
	return out
}

func (e *Engine) Scores() map[string]map[string]int {
	out := make(map[string]map[string]int)
	for pid, cats := range e.scores {
		out[pid] = make(map[string]int)
		for k, v := range cats {
			out[pid][k] = v
		}
	}
	return out
}

func (e *Engine) Roll(playerID string, held []int) ([5]int, error) {
	if e.finished {
		return [5]int{}, errors.New("game is finished")
	}
	if playerID != e.CurrentPlayer() {
		return [5]int{}, errors.New(message.ErrNotYourTurn)
	}
	if e.rollCount >= 3 {
		return [5]int{}, errors.New(message.ErrInvalidRoll)
	}
	if e.rollCount == 0 && len(held) > 0 {
		return [5]int{}, errors.New(message.ErrInvalidRoll)
	}

	// Mark held
	e.held = [5]bool{}
	for _, idx := range held {
		if idx >= 0 && idx < 5 {
			e.held[idx] = true
		}
	}

	// Roll unheld dice
	for i := 0; i < 5; i++ {
		if !e.held[i] {
			e.dice[i] = rand.Intn(6) + 1
		}
	}

	e.rollCount++
	return e.dice, nil
}

func (e *Engine) Score(playerID string, category string) (int, error) {
	if e.finished {
		return 0, errors.New("game is finished")
	}
	if playerID != e.CurrentPlayer() {
		return 0, errors.New(message.ErrNotYourTurn)
	}
	if e.rollCount == 0 {
		return 0, errors.New(message.ErrInvalidRoll)
	}
	if _, exists := e.scores[playerID][category]; exists {
		return 0, errors.New(message.ErrCategoryFilled)
	}
	score := Calculate(e.dice, category)
	if score == -1 {
		return 0, errors.New("invalid category")
	}
	e.scores[playerID][category] = score
	e.advanceTurn()
	return score, nil
}

func (e *Engine) advanceTurn() {
	e.rollCount = 0
	e.held = [5]bool{}
	e.dice = [5]int{}
	e.turnIdx++
	if e.turnIdx >= len(e.playerOrder) {
		e.turnIdx = 0
		e.round++
		if e.round > 13 {
			e.finished = true
		}
	}
}

func (e *Engine) RemovePlayer(playerID string) {
	idx := -1
	for i, pid := range e.playerOrder {
		if pid == playerID {
			idx = i
			break
		}
	}
	if idx == -1 {
		return
	}

	// If it was the removed player's turn, don't advance round
	wasCurrentTurn := idx == e.turnIdx

	e.playerOrder = append(e.playerOrder[:idx], e.playerOrder[idx+1:]...)

	if len(e.playerOrder) == 0 {
		e.finished = true
		return
	}

	if wasCurrentTurn {
		e.rollCount = 0
		e.held = [5]bool{}
		e.dice = [5]int{}
		if e.turnIdx >= len(e.playerOrder) {
			e.turnIdx = 0
			e.round++
			if e.round > 13 {
				e.finished = true
			}
		}
	} else if e.turnIdx > idx {
		e.turnIdx--
	}
}

func (e *Engine) Rankings() []message.RankEntry {
	type ps struct {
		id    string
		score int
	}
	var list []ps
	for pid := range e.scores {
		list = append(list, ps{pid, TotalScore(e.scores[pid])})
	}
	// Sort descending
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
			PlayerID: p.id,
			Score:    p.score,
			Rank:     i + 1,
		}
	}
	return rankings
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd server && go test ./game/ -v
```

Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add server/game/
git commit -m "feat: add game engine with turn management and TDD"
```

---

### Task 6: Room

**Files:**
- Create: `server/room/room.go`

- [ ] **Step 1: Implement room.go**

```go
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
	Password string
	mu       sync.RWMutex
	players  []*player.Player
	hostID   string
	ready    map[string]bool
	engine   *game.Engine
	status   string // "waiting" | "playing"
	cleanup  *time.Timer
	disconn  map[string]*time.Timer // playerID -> disconnect timer
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
		Password: password,
		ready:    make(map[string]bool),
		status:   "waiting",
		disconn:  make(map[string]*time.Timer),
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
	return r.Password != ""
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
	// Check duplicate
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

func (r *Room) Roll(playerID string, held []int) ([5]int, int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.engine == nil {
		return [5]int{}, 0, fmt.Errorf("no game in progress")
	}
	dice, err := r.engine.Roll(playerID, held)
	return dice, r.engine.RollCount(), err
}

func (r *Room) Score(playerID string, category string) (int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.engine == nil {
		return 0, fmt.Errorf("no game in progress")
	}
	return r.engine.Score(playerID, category)
}

func (r *Room) GameState() *game.Engine {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.engine
}

func (r *Room) IsFinished() bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.engine != nil && r.engine.IsFinished()
}

func (r *Room) EndGame() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.status = "waiting"
	r.engine = nil
}

func (r *Room) Rematch(playerID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.status = "waiting"
	r.engine = nil
	r.ready = make(map[string]bool)
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
	data, _ := message.New("game:sync", message.GameSyncPayload{
		Dice:          r.engine.Dice(),
		Held:          r.engine.Held(),
		RollCount:     r.engine.RollCount(),
		Scores:        r.engine.Scores(),
		CurrentPlayer: r.engine.CurrentPlayer(),
		Round:         r.engine.Round(),
	})
	return data
}

func (r *Room) ListItem() message.RoomListItem {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return message.RoomListItem{
		Code:        r.Code,
		PlayerCount: len(r.players),
		HasPassword: r.Password != "",
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

// helper to decode payload
func Decode[T any](raw json.RawMessage) (T, error) {
	var v T
	err := json.Unmarshal(raw, &v)
	return v, err
}
```

- [ ] **Step 2: Commit**

```bash
git add server/room/
git commit -m "feat: add room management with host, ready, game lifecycle"
```

---

### Task 7: Hub

**Files:**
- Create: `server/hub/hub.go`

- [ ] **Step 1: Implement hub.go**

```go
package hub

import (
	"fmt"
	"sync"

	"yacht-dice-server/player"
	"yacht-dice-server/room"
	"yacht-dice-server/message"
)

type Hub struct {
	mu      sync.RWMutex
	rooms   map[string]*room.Room
	players map[string]*player.Player     // playerID -> Player
	roomOf  map[string]string              // playerID -> roomCode
}

func New() *Hub {
	return &Hub{
		rooms:   make(map[string]*room.Room),
		players: make(map[string]*player.Player),
		roomOf:  make(map[string]string),
	}
}

func (h *Hub) RegisterPlayer(p *player.Player) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.players[p.ID] = p
}

func (h *Hub) GetPlayer(id string) *player.Player {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.players[id]
}

func (h *Hub) CreateRoom(password string) *room.Room {
	h.mu.Lock()
	defer h.mu.Unlock()
	code := room.GenerateCode()
	for h.rooms[code] != nil {
		code = room.GenerateCode()
	}
	r := room.New(code, password)
	h.rooms[code] = r
	return r
}

func (h *Hub) GetRoom(code string) *room.Room {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.rooms[code]
}

func (h *Hub) RemoveRoom(code string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.rooms, code)
	// Clean up roomOf references
	for pid, rc := range h.roomOf {
		if rc == code {
			delete(h.roomOf, pid)
		}
	}
}

func (h *Hub) JoinRoom(code string, p *player.Player) error {
	r := h.GetRoom(code)
	if r == nil {
		return fmt.Errorf(message.ErrRoomNotFound)
	}
	err := r.AddPlayer(p)
	if err != nil {
		return err
	}
	h.mu.Lock()
	h.roomOf[p.ID] = code
	h.mu.Unlock()
	return nil
}

func (h *Hub) LeaveRoom(playerID string) {
	h.mu.Lock()
	code, ok := h.roomOf[playerID]
	if ok {
		delete(h.roomOf, playerID)
	}
	h.mu.Unlock()

	if !ok {
		return
	}
	r := h.GetRoom(code)
	if r == nil {
		return
	}
	r.RemovePlayer(playerID, func() {
		h.RemoveRoom(code)
	})
}

func (h *Hub) PlayerRoom(playerID string) *room.Room {
	h.mu.RLock()
	code := h.roomOf[playerID]
	h.mu.RUnlock()
	return h.GetRoom(code)
}

func (h *Hub) ListRooms() []message.RoomListItem {
	h.mu.RLock()
	defer h.mu.RUnlock()
	list := make([]message.RoomListItem, 0, len(h.rooms))
	for _, r := range h.rooms {
		list = append(list, r.ListItem())
	}
	return list
}

func (h *Hub) RemovePlayerFull(playerID string) {
	h.LeaveRoom(playerID)
	h.mu.Lock()
	delete(h.players, playerID)
	h.mu.Unlock()
}
```

- [ ] **Step 2: Verify build**

```bash
cd server && go build ./...
```

- [ ] **Step 3: Commit**

```bash
git add server/hub/
git commit -m "feat: add hub for room and player management"
```

---

## Chunk 3: Backend WebSocket Handler + Main

### Task 8: WebSocket Handler

**Files:**
- Create: `server/handler/ws.go`

- [ ] **Step 1: Implement ws.go**

```go
package handler

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"

	"yacht-dice-server/hub"
	"yacht-dice-server/message"
	"yacht-dice-server/player"
	"yacht-dice-server/room"
)

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
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("upgrade error: %v", err)
		return
	}
	defer conn.Close()

	nickname := r.URL.Query().Get("nickname")
	if nickname == "" {
		nickname = "Player_" + uuid.New().String()[:4]
	}

	// Reconnection
	existingID := r.URL.Query().Get("playerId")
	var p *player.Player
	if existingID != "" {
		p = wh.hub.GetPlayer(existingID)
	}
	if p != nil {
		p.SetConn(conn)
		// Sync state if in a room
		rm := wh.hub.PlayerRoom(p.ID)
		if rm != nil {
			rm.HandleReconnect(p.ID)
			rm.BroadcastState()
			if syncData := rm.SyncPayload(); syncData != nil {
				p.Send(syncData)
			}
		}
	} else {
		p = player.New(uuid.New().String(), nickname, conn)
		wh.hub.RegisterPlayer(p)
	}

	// Send connected
	data, _ := message.New("connected", message.ConnectedPayload{PlayerID: p.ID})
	p.Send(data)

	// Read loop
	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			log.Printf("read error (player %s): %v", p.ID, err)
			wh.handleDisconnect(p)
			return
		}
		env, err := message.Parse(msg)
		if err != nil {
			continue
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

	// Notify others
	data, _ := message.New("player:disconnected", message.PlayerEventPayload{PlayerID: p.ID})
	rm.Broadcast(data)

	if rm.Status() == "playing" {
		rm.HandleDisconnect(p.ID, func() {
			// Timeout: remove from game
			rm.RemovePlayer(p.ID, func() { wh.hub.RemoveRoom(rm.Code) })
			remData, _ := message.New("player:removed", message.PlayerEventPayload{PlayerID: p.ID})
			rm.Broadcast(remData)

			if rm.PlayerCount() < 2 && rm.Status() == "playing" {
				wh.endGame(rm)
			} else {
				rm.BroadcastState()
				wh.broadcastTurn(rm)
			}
		})
	} else {
		wh.hub.LeaveRoom(p.ID)
		leftData, _ := message.New("player:left", message.PlayerEventPayload{PlayerID: p.ID})
		rm.Broadcast(leftData)
		rm.BroadcastState()
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
	case "game:score":
		wh.handleScore(p, env.Payload)
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
	json.Unmarshal(payload, &req)
	rm := wh.hub.CreateRoom(req.Password)
	wh.hub.JoinRoom(rm.Code, p)
	data, _ := message.New("room:created", message.RoomCreatedPayload{RoomCode: rm.Code})
	p.Send(data)
	rm.BroadcastState()
}

func (wh *WSHandler) handleRoomJoin(p *player.Player, payload json.RawMessage) {
	var req message.RoomJoinPayload
	json.Unmarshal(payload, &req)

	rm := wh.hub.GetRoom(req.RoomCode)
	if rm == nil {
		wh.sendError(p, message.ErrRoomNotFound, "Room not found")
		return
	}
	if rm.HasPassword() && rm.Password != req.Password {
		wh.sendError(p, message.ErrWrongPassword, "Wrong password")
		return
	}
	if err := wh.hub.JoinRoom(req.RoomCode, p); err != nil {
		wh.sendError(p, err.Error(), err.Error())
		return
	}
	data, _ := message.New("room:joined", message.RoomStatePayload{
		RoomCode: rm.Code,
	})
	p.Send(data)
	joinData, _ := message.New("player:joined", message.PlayerInfo{
		ID: p.ID, Nickname: p.Nickname,
	})
	rm.Broadcast(joinData)
	rm.BroadcastState()
}

func (wh *WSHandler) handleRoomLeave(p *player.Player) {
	rm := wh.hub.PlayerRoom(p.ID)
	if rm == nil {
		return
	}
	wh.hub.LeaveRoom(p.ID)
	data, _ := message.New("player:left", message.PlayerEventPayload{PlayerID: p.ID})
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

func (wh *WSHandler) handleRoll(p *player.Player, payload json.RawMessage) {
	rm := wh.hub.PlayerRoom(p.ID)
	if rm == nil {
		return
	}
	var req message.GameRollPayload
	json.Unmarshal(payload, &req)
	dice, rollCount, err := rm.Roll(p.ID, req.Held)
	if err != nil {
		wh.sendError(p, err.Error(), err.Error())
		return
	}
	data, _ := message.New("game:rolled", message.GameRolledPayload{Dice: dice, RollCount: rollCount})
	rm.Broadcast(data)
}

func (wh *WSHandler) handleScore(p *player.Player, payload json.RawMessage) {
	rm := wh.hub.PlayerRoom(p.ID)
	if rm == nil {
		return
	}
	var req message.GameScorePayload
	json.Unmarshal(payload, &req)

	engine := rm.GameState()
	if engine == nil {
		return
	}

	score, err := rm.Score(p.ID, req.Category)
	if err != nil {
		wh.sendError(p, err.Error(), err.Error())
		return
	}

	data, _ := message.New("game:scored", message.GameScoredPayload{
		PlayerID:    p.ID,
		Category:    req.Category,
		Score:       score,
		TotalScores: engine.Scores(),
	})
	rm.Broadcast(data)

	if rm.IsFinished() {
		wh.endGame(rm)
	} else {
		wh.broadcastTurn(rm)
	}
}

func (wh *WSHandler) endGame(rm *room.Room) {
	engine := rm.GameState()
	if engine == nil {
		return
	}
	rankings := engine.Rankings()
	nicks := rm.NicknameMap()
	for i := range rankings {
		rankings[i].Nickname = nicks[rankings[i].PlayerID]
	}
	data, _ := message.New("game:end", message.GameEndPayload{Rankings: rankings})
	rm.Broadcast(data)
	rm.EndGame()
	// Start 30-second rematch timer — if nobody clicks rematch, dissolve room
	rm.StartRematchTimer(func() {
		wh.hub.RemoveRoom(rm.Code)
	})
}

func (wh *WSHandler) broadcastTurn(rm *room.Room) {
	engine := rm.GameState()
	if engine == nil {
		return
	}
	data, _ := message.New("game:turn", message.GameTurnPayload{
		CurrentPlayer: engine.CurrentPlayer(),
		Round:         engine.Round(),
	})
	rm.Broadcast(data)
}

func (wh *WSHandler) handleRematch(p *player.Player) {
	rm := wh.hub.PlayerRoom(p.ID)
	if rm == nil {
		return
	}
	rm.CancelRematchTimer()
	rm.Rematch(p.ID)
	rm.BroadcastState()
}

func (wh *WSHandler) handleReaction(p *player.Player, payload json.RawMessage) {
	rm := wh.hub.PlayerRoom(p.ID)
	if rm == nil {
		return
	}
	var req message.ReactionSendPayload
	json.Unmarshal(payload, &req)
	data, _ := message.New("reaction:show", message.ReactionShowPayload{
		PlayerID: p.ID, Emoji: req.Emoji,
	})
	rm.Broadcast(data)
}
```

- [ ] **Step 2: Fix build**

```bash
cd server && go build ./...
```

- [ ] **Step 3: Commit**

```bash
git add server/handler/
git commit -m "feat: add WebSocket handler with full message routing"
```

---

### Task 9: Main Entry Point

**Files:**
- Create: `server/main.go`

- [ ] **Step 1: Implement main.go**

```go
package main

import (
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"yacht-dice-server/handler"
	"yacht-dice-server/hub"
)

func main() {
	h := hub.New()
	wsHandler := handler.NewWSHandler(h)

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		AllowCredentials: true,
	}))

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("ok"))
	})
	r.Handle("/ws", wsHandler)

	log.Println("Server starting on :8080")
	if err := http.ListenAndServe(":8080", r); err != nil {
		log.Fatal(err)
	}
}
```

- [ ] **Step 2: Build and verify**

```bash
cd server && go build -o yacht-server . && echo "Build OK"
```

- [ ] **Step 3: Commit**

```bash
git add server/main.go
git commit -m "feat: add main entry point with Chi router"
```

---

## Chunk 4: Frontend Setup + Types + i18n

### Task 10: React Project Init

**Files:**
- Create: `client/` (Vite project)

- [ ] **Step 1: Create Vite React TypeScript project**

```bash
cd "C:/Users/USER/Desktop/Work/WebstormProjects/yatch-dice" && npm create vite@latest client -- --template react-ts
```

- [ ] **Step 2: Install dependencies**

```bash
cd client && npm install && npm install -D tailwindcss @tailwindcss/vite react-i18next i18next i18next-browser-languagedetector
```

- [ ] **Step 3: Configure Tailwind (Vite plugin)**

Replace `client/vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/ws': {
        target: 'http://localhost:8080',
        ws: true,
      },
    },
  },
})
```

Replace `client/src/index.css`:

```css
@import "tailwindcss";
```

- [ ] **Step 4: Commit**

```bash
git add client/
git commit -m "chore: init React + Vite + TypeScript + Tailwind"
```

---

### Task 11: Shared Types

**Files:**
- Create: `client/src/types/game.ts`

- [ ] **Step 1: Write types**

```typescript
export interface Envelope {
  type: string;
  payload?: unknown;
}

export interface PlayerInfo {
  id: string;
  nickname: string;
  isHost: boolean;
  isReady: boolean;
}

export interface RoomState {
  roomCode: string;
  players: PlayerInfo[];
}

export interface RoomListItem {
  code: string;
  playerCount: number;
  hasPassword: boolean;
  status: 'waiting' | 'playing';
}

export interface GameRolledPayload {
  dice: number[];
  rollCount: number;
}

export interface GameScoredPayload {
  playerId: string;
  category: string;
  score: number;
  totalScores: Record<string, Record<string, number>>;
}

export interface GameTurnPayload {
  currentPlayer: string;
  round: number;
}

export interface GameSyncPayload {
  dice: number[];
  held: boolean[];
  rollCount: number;
  scores: Record<string, Record<string, number>>;
  currentPlayer: string;
  round: number;
}

export interface RankEntry {
  playerId: string;
  nickname: string;
  score: number;
  rank: number;
}

export interface GameEndPayload {
  rankings: RankEntry[];
}

export interface ReactionShowPayload {
  playerId: string;
  emoji: string;
}

export interface ErrorPayload {
  message: string;
  code: string;
}

export type GamePhase = 'lobby' | 'room' | 'game' | 'result';

export const CATEGORIES = [
  'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
  'choice', 'fourOfAKind', 'fullHouse',
  'smallStraight', 'largeStraight', 'yacht',
] as const;

export type Category = typeof CATEGORIES[number];

export const UPPER_CATEGORIES: Category[] = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
export const LOWER_CATEGORIES: Category[] = ['choice', 'fourOfAKind', 'fullHouse', 'smallStraight', 'largeStraight', 'yacht'];
```

- [ ] **Step 2: Commit**

```bash
git add client/src/types/
git commit -m "feat: add shared TypeScript types"
```

---

### Task 12: i18n Setup

**Files:**
- Create: `client/src/i18n/ko.json`
- Create: `client/src/i18n/en.json`
- Create: `client/src/i18n/ja.json`
- Create: `client/src/i18n/index.ts`

- [ ] **Step 1: Write translations**

`client/src/i18n/ko.json`:
```json
{
  "app": { "title": "Yacht Dice" },
  "lobby": {
    "nickname": "닉네임",
    "nicknamePlaceholder": "닉네임을 입력하세요",
    "createRoom": "방 만들기",
    "joinByCode": "코드로 참여",
    "codePlaceholder": "방 코드 입력",
    "password": "비밀번호",
    "passwordPlaceholder": "비밀번호 (선택사항)",
    "join": "참여",
    "refresh": "새로고침",
    "noRooms": "방이 없습니다",
    "players": "명",
    "waiting": "대기 중",
    "playing": "게임 중"
  },
  "room": {
    "code": "방 코드",
    "ready": "준비",
    "cancel": "취소",
    "start": "게임 시작",
    "leave": "나가기",
    "host": "방장",
    "waitingForPlayers": "플레이어를 기다리는 중...",
    "allReady": "모든 플레이어가 준비되었습니다"
  },
  "game": {
    "round": "라운드",
    "roll": "굴리기",
    "rollsLeft": "남은 굴리기",
    "shake": "Shake!",
    "rollDice": "Roll!",
    "selectCategory": "카테고리를 선택하세요",
    "yourTurn": "당신의 턴",
    "waitingTurn": "의 턴입니다",
    "score": "점수"
  },
  "categories": {
    "ones": "1", "twos": "2", "threes": "3",
    "fours": "4", "fives": "5", "sixes": "6",
    "choice": "초이스", "fourOfAKind": "포커", "fullHouse": "풀하우스",
    "smallStraight": "스몰 스트레이트", "largeStraight": "라지 스트레이트", "yacht": "야찌",
    "upperBonus": "상단 보너스", "total": "합계"
  },
  "result": {
    "title": "게임 결과",
    "rank": "등",
    "rematch": "다시하기",
    "backToLobby": "로비로"
  }
}
```

`client/src/i18n/en.json`:
```json
{
  "app": { "title": "Yacht Dice" },
  "lobby": {
    "nickname": "Nickname",
    "nicknamePlaceholder": "Enter nickname",
    "createRoom": "Create Room",
    "joinByCode": "Join by Code",
    "codePlaceholder": "Room code",
    "password": "Password",
    "passwordPlaceholder": "Password (optional)",
    "join": "Join",
    "refresh": "Refresh",
    "noRooms": "No rooms available",
    "players": "players",
    "waiting": "Waiting",
    "playing": "Playing"
  },
  "room": {
    "code": "Room Code",
    "ready": "Ready",
    "cancel": "Cancel",
    "start": "Start Game",
    "leave": "Leave",
    "host": "Host",
    "waitingForPlayers": "Waiting for players...",
    "allReady": "All players ready"
  },
  "game": {
    "round": "Round",
    "roll": "Roll",
    "rollsLeft": "rolls left",
    "shake": "Shake!",
    "rollDice": "Roll!",
    "selectCategory": "Select a category",
    "yourTurn": "Your turn",
    "waitingTurn": "'s turn",
    "score": "Score"
  },
  "categories": {
    "ones": "Ones", "twos": "Twos", "threes": "Threes",
    "fours": "Fours", "fives": "Fives", "sixes": "Sixes",
    "choice": "Choice", "fourOfAKind": "Four of a Kind", "fullHouse": "Full House",
    "smallStraight": "Sm. Straight", "largeStraight": "Lg. Straight", "yacht": "Yacht",
    "upperBonus": "Upper Bonus", "total": "Total"
  },
  "result": {
    "title": "Game Results",
    "rank": "place",
    "rematch": "Rematch",
    "backToLobby": "Back to Lobby"
  }
}
```

`client/src/i18n/ja.json`:
```json
{
  "app": { "title": "Yacht Dice" },
  "lobby": {
    "nickname": "ニックネーム",
    "nicknamePlaceholder": "ニックネームを入力",
    "createRoom": "ルーム作成",
    "joinByCode": "コードで参加",
    "codePlaceholder": "ルームコード",
    "password": "パスワード",
    "passwordPlaceholder": "パスワード（任意）",
    "join": "参加",
    "refresh": "更新",
    "noRooms": "ルームがありません",
    "players": "人",
    "waiting": "待機中",
    "playing": "プレイ中"
  },
  "room": {
    "code": "ルームコード",
    "ready": "準備完了",
    "cancel": "キャンセル",
    "start": "ゲーム開始",
    "leave": "退出",
    "host": "ホスト",
    "waitingForPlayers": "プレイヤーを待っています...",
    "allReady": "全員準備完了"
  },
  "game": {
    "round": "ラウンド",
    "roll": "ロール",
    "rollsLeft": "残りロール",
    "shake": "Shake!",
    "rollDice": "Roll!",
    "selectCategory": "カテゴリを選択してください",
    "yourTurn": "あなたのターン",
    "waitingTurn": "のターン",
    "score": "スコア"
  },
  "categories": {
    "ones": "1", "twos": "2", "threes": "3",
    "fours": "4", "fives": "5", "sixes": "6",
    "choice": "チョイス", "fourOfAKind": "フォーカード", "fullHouse": "フルハウス",
    "smallStraight": "Sストレート", "largeStraight": "Lストレート", "yacht": "ヨット",
    "upperBonus": "上段ボーナス", "total": "合計"
  },
  "result": {
    "title": "ゲーム結果",
    "rank": "位",
    "rematch": "もう一度",
    "backToLobby": "ロビーへ"
  }
}
```

`client/src/i18n/index.ts`:
```typescript
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import ko from './ko.json';
import en from './en.json';
import ja from './ja.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { ko: { translation: ko }, en: { translation: en }, ja: { translation: ja } },
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });

export default i18n;
```

- [ ] **Step 2: Commit**

```bash
git add client/src/i18n/
git commit -m "feat: add i18n with Korean, English, Japanese"
```

---

## Chunk 5: Frontend Hooks + Components

### Task 13: WebSocket Hook

**Files:**
- Create: `client/src/hooks/useWebSocket.ts`

- [ ] **Step 1: Implement useWebSocket**

```typescript
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Envelope } from '../types/game';

type MessageHandler = (env: Envelope) => void;

export function useWebSocket(nickname: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const playerIdRef = useRef<string | null>(null);
  const nicknameRef = useRef(nickname);
  const handlersRef = useRef<Map<string, MessageHandler[]>>(new Map());
  const retriesRef = useRef(0);
  const maxRetries = 5;

  // Keep refs in sync
  useEffect(() => { nicknameRef.current = nickname; }, [nickname]);
  useEffect(() => { playerIdRef.current = playerId; }, [playerId]);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const params = new URLSearchParams({ nickname: nicknameRef.current });
    if (playerIdRef.current) params.set('playerId', playerIdRef.current);
    const url = `${protocol}//${host}/ws?${params}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      retriesRef.current = 0;
    };

    ws.onclose = () => {
      setConnected(false);
      if (retriesRef.current < maxRetries) {
        retriesRef.current++;
        setTimeout(connect, 3000);
      }
    };

    ws.onmessage = (event) => {
      try {
        const envelope: Envelope = JSON.parse(event.data);
        if (envelope.type === 'connected') {
          const payload = envelope.payload as { playerId: string };
          setPlayerId(payload.playerId);
          playerIdRef.current = payload.playerId;
        }
        const handlers = handlersRef.current.get(envelope.type);
        if (handlers) {
          handlers.forEach(h => h(envelope));
        }
        // Also fire wildcard handlers
        const wildcards = handlersRef.current.get('*');
        if (wildcards) {
          wildcards.forEach(h => h(envelope));
        }
      } catch {
        // ignore parse errors
      }
    };
  }, []); // stable reference — uses refs instead of state

  const send = useCallback((type: string, payload?: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, payload }));
    }
  }, []);

  const on = useCallback((type: string, handler: MessageHandler) => {
    if (!handlersRef.current.has(type)) {
      handlersRef.current.set(type, []);
    }
    handlersRef.current.get(type)!.push(handler);
    return () => {
      const handlers = handlersRef.current.get(type);
      if (handlers) {
        const idx = handlers.indexOf(handler);
        if (idx >= 0) handlers.splice(idx, 1);
      }
    };
  }, []);

  const disconnect = useCallback(() => {
    retriesRef.current = maxRetries; // prevent reconnect
    wsRef.current?.close();
  }, []);

  return { connect, disconnect, send, on, connected, playerId };
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/hooks/useWebSocket.ts
git commit -m "feat: add WebSocket hook with reconnection"
```

---

### Task 14: Game State Hook

**Files:**
- Create: `client/src/hooks/useGameState.ts`

- [ ] **Step 1: Implement useGameState**

```typescript
import { useReducer } from 'react';
import type {
  GamePhase, PlayerInfo, RoomListItem, RankEntry,
} from '../types/game';

export interface GameState {
  phase: GamePhase;
  nickname: string;
  roomCode: string | null;
  players: PlayerInfo[];
  roomList: RoomListItem[];
  // Game
  dice: number[];
  held: boolean[];
  rollCount: number;
  currentPlayer: string | null;
  round: number;
  scores: Record<string, Record<string, number>>;
  // Result
  rankings: RankEntry[];
  // Reactions
  reactions: { playerId: string; emoji: string; ts: number }[];
}

export type GameAction =
  | { type: 'SET_NICKNAME'; nickname: string }
  | { type: 'SET_PHASE'; phase: GamePhase }
  | { type: 'SET_ROOM'; roomCode: string }
  | { type: 'SET_PLAYERS'; players: PlayerInfo[] }
  | { type: 'SET_ROOM_LIST'; list: RoomListItem[] }
  | { type: 'GAME_ROLLED'; dice: number[]; rollCount: number }
  | { type: 'TOGGLE_HOLD'; index: number }
  | { type: 'SET_TURN'; currentPlayer: string; round: number }
  | { type: 'SET_SCORES'; scores: Record<string, Record<string, number>> }
  | { type: 'GAME_END'; rankings: RankEntry[] }
  | { type: 'GAME_SYNC'; dice: number[]; held: boolean[]; rollCount: number; scores: Record<string, Record<string, number>>; currentPlayer: string; round: number }
  | { type: 'ADD_REACTION'; playerId: string; emoji: string }
  | { type: 'CLEAR_REACTION'; ts: number }
  | { type: 'RESET_GAME' };

const initialState: GameState = {
  phase: 'lobby',
  nickname: '',
  roomCode: null,
  players: [],
  roomList: [],
  dice: [],
  held: [false, false, false, false, false],
  rollCount: 0,
  currentPlayer: null,
  round: 1,
  scores: {},
  rankings: [],
  reactions: [],
};

function reducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'SET_NICKNAME':
      return { ...state, nickname: action.nickname };
    case 'SET_PHASE':
      return { ...state, phase: action.phase };
    case 'SET_ROOM':
      return { ...state, roomCode: action.roomCode, phase: 'room' };
    case 'SET_PLAYERS':
      return { ...state, players: action.players };
    case 'SET_ROOM_LIST':
      return { ...state, roomList: action.list };
    case 'GAME_ROLLED':
      return { ...state, dice: action.dice, rollCount: action.rollCount, held: [false, false, false, false, false] };
    case 'TOGGLE_HOLD':
      if (state.rollCount === 0) return state;
      const newHeld = [...state.held];
      newHeld[action.index] = !newHeld[action.index];
      return { ...state, held: newHeld };
    case 'SET_TURN':
      return { ...state, currentPlayer: action.currentPlayer, round: action.round, rollCount: 0, held: [false, false, false, false, false], dice: [] };
    case 'SET_SCORES':
      return { ...state, scores: action.scores };
    case 'GAME_END':
      return { ...state, phase: 'result', rankings: action.rankings };
    case 'GAME_SYNC':
      return { ...state, dice: action.dice, held: action.held, rollCount: action.rollCount, scores: action.scores, currentPlayer: action.currentPlayer, round: action.round, phase: 'game' };
    case 'ADD_REACTION':
      return { ...state, reactions: [...state.reactions, { playerId: action.playerId, emoji: action.emoji, ts: Date.now() }] };
    case 'CLEAR_REACTION':
      return { ...state, reactions: state.reactions.filter(r => r.ts !== action.ts) };
    case 'RESET_GAME':
      return { ...initialState, nickname: state.nickname };
    default:
      return state;
  }
}

export function useGameState() {
  return useReducer(reducer, initialState);
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/hooks/useGameState.ts
git commit -m "feat: add game state reducer hook"
```

---

### Task 15: ScoreBoard Component

**Files:**
- Create: `client/src/components/ScoreBoard.tsx`

- [ ] **Step 1: Implement ScoreBoard**

```tsx
import { useTranslation } from 'react-i18next';
import { UPPER_CATEGORIES, LOWER_CATEGORIES, type Category, type PlayerInfo } from '../types/game';

interface Props {
  players: PlayerInfo[];
  scores: Record<string, Record<string, number>>;
  currentPlayer: string | null;
  myId: string | null;
  rollCount: number;
  onSelectCategory?: (category: Category) => void;
}

function upperSum(playerScores: Record<string, number>): number {
  return UPPER_CATEGORIES.reduce((sum, cat) => sum + (playerScores[cat] ?? 0), 0);
}

function total(playerScores: Record<string, number>): number {
  const sum = Object.values(playerScores).reduce((a, b) => a + b, 0);
  const bonus = upperSum(playerScores) >= 63 ? 35 : 0;
  return sum + bonus;
}

export default function ScoreBoard({ players, scores, currentPlayer, myId, rollCount, onSelectCategory }: Props) {
  const { t } = useTranslation();
  const isMyTurn = currentPlayer === myId;
  const myScores = myId ? (scores[myId] ?? {}) : {};

  const renderRow = (cat: Category) => {
    const canSelect = isMyTurn && rollCount > 0 && myScores[cat] === undefined;
    return (
      <tr key={cat} className={canSelect ? 'cursor-pointer hover:bg-white/10' : ''} onClick={() => canSelect && onSelectCategory?.(cat)}>
        <td className={`px-2 py-1 text-sm font-medium ${canSelect ? 'text-yellow-300' : 'text-gray-300'}`}>
          {t(`categories.${cat}`)}
        </td>
        {players.map(p => (
          <td key={p.id} className={`px-2 py-1 text-center text-sm ${p.id === currentPlayer ? 'text-white font-bold' : 'text-gray-400'}`}>
            {scores[p.id]?.[cat] !== undefined ? scores[p.id][cat] : '-'}
          </td>
        ))}
      </tr>
    );
  };

  return (
    <div className="bg-black/40 backdrop-blur rounded-xl p-3 overflow-auto max-h-[70vh]">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="px-2 py-1 text-left text-xs text-gray-500">{t('game.score')}</th>
            {players.map(p => (
              <th key={p.id} className={`px-2 py-1 text-center text-xs ${p.id === currentPlayer ? 'text-yellow-300' : 'text-gray-400'}`}>
                {p.nickname}{p.id === myId ? ' (me)' : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {UPPER_CATEGORIES.map(renderRow)}
          <tr className="border-t border-white/10">
            <td className="px-2 py-1 text-xs text-gray-500">{t('categories.upperBonus')}</td>
            {players.map(p => (
              <td key={p.id} className="px-2 py-1 text-center text-xs text-gray-500">
                {upperSum(scores[p.id] ?? {}) >= 63 ? '+35' : `${upperSum(scores[p.id] ?? {})}/63`}
              </td>
            ))}
          </tr>
          <tr className="h-2" />
          {LOWER_CATEGORIES.map(renderRow)}
          <tr className="border-t border-white/20">
            <td className="px-2 py-1 text-sm font-bold text-white">{t('categories.total')}</td>
            {players.map(p => (
              <td key={p.id} className="px-2 py-1 text-center text-sm font-bold text-white">
                {total(scores[p.id] ?? {})}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/ScoreBoard.tsx
git commit -m "feat: add ScoreBoard component"
```

---

### Task 16: ReactionBar Component

**Files:**
- Create: `client/src/components/ReactionBar.tsx`

- [ ] **Step 1: Implement ReactionBar**

```tsx
import { useEffect } from 'react';

const EMOJIS = ['👍', '👏', '😂', '😱', '🔥', '💀', '🎉', '😭'];

interface Props {
  onSend: (emoji: string) => void;
  reactions: { playerId: string; emoji: string; ts: number }[];
  onExpire: (ts: number) => void;
  players: { id: string; nickname: string }[];
}

export default function ReactionBar({ onSend, reactions, onExpire, players }: Props) {
  useEffect(() => {
    if (reactions.length === 0) return;
    const oldest = reactions[0];
    const timer = setTimeout(() => onExpire(oldest.ts), 3000);
    return () => clearTimeout(timer);
  }, [reactions, onExpire]);

  const nick = (id: string) => players.find(p => p.id === id)?.nickname ?? '?';

  return (
    <div className="relative">
      <div className="flex gap-1 flex-wrap">
        {EMOJIS.map(e => (
          <button key={e} onClick={() => onSend(e)}
            className="w-10 h-10 text-xl rounded-lg bg-white/10 hover:bg-white/20 transition-colors">
            {e}
          </button>
        ))}
      </div>
      <div className="absolute bottom-14 left-0 flex flex-col gap-1 pointer-events-none">
        {reactions.map(r => (
          <div key={r.ts} className="bg-black/60 text-white text-sm px-2 py-1 rounded-lg animate-bounce">
            {nick(r.playerId)} {r.emoji}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/ReactionBar.tsx
git commit -m "feat: add ReactionBar emoji component"
```

---

### Task 17: DiceArea Component (Placeholder + 3D Integration)

**Files:**
- Create: `client/src/components/DiceArea.tsx`

The user's `C:\Users\USER\Desktop\Work\Dice\index.html` uses `window.DiceGame` API. We'll embed it in an iframe or adapt it as a React component that communicates via the global API.

- [ ] **Step 1: Implement DiceArea wrapper**

```tsx
import { useEffect, useRef, useCallback } from 'react';

interface DiceGameAPI {
  setValues(v: number[]): void;
  shake(): void;
  roll(): void;
  getValues(): number[] | null;
  onResult(cb: (values: number[]) => void): void;
}

declare global {
  interface Window {
    DiceGame?: DiceGameAPI;
  }
}

interface Props {
  dice: number[];
  held: boolean[];
  rollPhase: 'idle' | 'shaking' | 'rolling' | 'settled';
  onHold: (index: number) => void;
  onSettled?: () => void;
}

export default function DiceArea({ dice, held, rollPhase, onHold, onSettled }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const apiRef = useRef<DiceGameAPI | null>(null);
  const prevPhaseRef = useRef(rollPhase);

  const getAPI = useCallback(() => {
    if (apiRef.current) return apiRef.current;
    const win = iframeRef.current?.contentWindow as (Window & { DiceGame?: DiceGameAPI }) | null;
    if (win?.DiceGame) {
      apiRef.current = win.DiceGame;
      return apiRef.current;
    }
    return null;
  }, []);

  // Listen for results from 3D engine
  useEffect(() => {
    const check = setInterval(() => {
      const api = getAPI();
      if (api) {
        api.onResult(() => {
          onSettled?.();
        });
        clearInterval(check);
      }
    }, 200);
    return () => clearInterval(check);
  }, [getAPI, onSettled]);

  // Send dice values and trigger animations
  useEffect(() => {
    const api = getAPI();
    if (!api) return;

    if (rollPhase === 'shaking' && prevPhaseRef.current !== 'shaking') {
      api.shake();
    }
    if (rollPhase === 'rolling' && prevPhaseRef.current !== 'rolling') {
      // Set target values from server BEFORE triggering roll animation
      // The 3D engine will animate dice to land on these values
      if (dice.length === 5) api.setValues(dice);
      api.roll();
    }
    prevPhaseRef.current = rollPhase;
  }, [rollPhase, dice, getAPI]);

  return (
    <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-gray-900">
      <iframe
        ref={iframeRef}
        src="/dice3d.html"
        className="w-full h-full border-0"
        title="3D Dice"
      />
      {/* Hold indicators overlay */}
      {rollPhase === 'settled' && dice.length === 5 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-3">
          {dice.map((d, i) => (
            <button
              key={i}
              onClick={() => onHold(i)}
              className={`w-12 h-12 rounded-lg text-lg font-bold transition-all ${
                held[i]
                  ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/30'
                  : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Copy 3D dice HTML to client public dir**

```bash
cp "C:/Users/USER/Desktop/Work/Dice/index.html" "C:/Users/USER/Desktop/Work/WebstormProjects/yatch-dice/client/public/dice3d.html"
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/DiceArea.tsx client/public/dice3d.html
git commit -m "feat: add DiceArea component with 3D dice integration"
```

---

## Chunk 6: Frontend Pages + App Wiring

### Task 18: LobbyPage

**Files:**
- Create: `client/src/pages/LobbyPage.tsx`

- [ ] **Step 1: Implement LobbyPage**

```tsx
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameAction } from '../hooks/useGameState';
import type { GameState, RoomListItem } from '../types/game';

interface Props {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
  send: (type: string, payload?: unknown) => void;
  on: (type: string, handler: (e: any) => void) => () => void;
  playerId: string | null;
}

export default function LobbyPage({ state, dispatch, send, on }: Props) {
  const { t, i18n } = useTranslation();
  const [nickname, setNickname] = useState(state.nickname);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [createPassword, setCreatePassword] = useState('');

  useEffect(() => {
    const unsub1 = on('room:list', (env) => {
      dispatch({ type: 'SET_ROOM_LIST', list: env.payload as RoomListItem[] });
    });
    const unsub2 = on('room:created', (env) => {
      const p = env.payload as { roomCode: string };
      dispatch({ type: 'SET_ROOM', roomCode: p.roomCode });
    });
    const unsub3 = on('room:joined', () => {
      // Phase change handled by room:state
    });
    const unsub4 = on('room:state', (env) => {
      const p = env.payload as { roomCode: string; players: any[] };
      dispatch({ type: 'SET_ROOM', roomCode: p.roomCode });
      dispatch({ type: 'SET_PLAYERS', players: p.players });
    });
    send('room:list');
    return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
  }, [on, send, dispatch]);

  const handleCreate = () => {
    if (nickname) dispatch({ type: 'SET_NICKNAME', nickname });
    send('room:create', { password: createPassword || undefined });
  };

  const handleJoin = (roomCode: string, pw?: string) => {
    if (nickname) dispatch({ type: 'SET_NICKNAME', nickname });
    send('room:join', { roomCode, password: pw || undefined });
  };

  const langs = [
    { code: 'ko', label: '한국어' },
    { code: 'en', label: 'English' },
    { code: 'ja', label: '日本語' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-2">{t('app.title')}</h1>
          <div className="flex justify-center gap-2">
            {langs.map(l => (
              <button key={l.code} onClick={() => i18n.changeLanguage(l.code)}
                className={`px-3 py-1 rounded text-sm ${i18n.language === l.code ? 'bg-white text-black' : 'bg-white/10 text-white'}`}>
                {l.label}
              </button>
            ))}
          </div>
        </div>

        {/* Nickname */}
        <div className="bg-black/30 backdrop-blur rounded-xl p-4">
          <input
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            placeholder={t('lobby.nicknamePlaceholder')}
            className="w-full bg-white/10 text-white rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        {/* Create Room */}
        <div className="bg-black/30 backdrop-blur rounded-xl p-4 space-y-3">
          <input
            value={createPassword}
            onChange={e => setCreatePassword(e.target.value)}
            placeholder={t('lobby.passwordPlaceholder')}
            type="password"
            className="w-full bg-white/10 text-white rounded-lg px-4 py-2 outline-none text-sm"
          />
          <button onClick={handleCreate}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-lg transition-colors">
            {t('lobby.createRoom')}
          </button>
        </div>

        {/* Join by Code */}
        <div className="bg-black/30 backdrop-blur rounded-xl p-4 space-y-3">
          <div className="flex gap-2">
            <input value={code} onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder={t('lobby.codePlaceholder')} maxLength={6}
              className="flex-1 bg-white/10 text-white rounded-lg px-4 py-2 outline-none uppercase tracking-widest" />
            <input value={password} onChange={e => setPassword(e.target.value)}
              placeholder={t('lobby.password')} type="password"
              className="flex-1 bg-white/10 text-white rounded-lg px-4 py-2 outline-none text-sm" />
          </div>
          <button onClick={() => handleJoin(code, password)} disabled={code.length < 6}
            className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white font-bold py-3 rounded-lg transition-colors">
            {t('lobby.join')}
          </button>
        </div>

        {/* Room List */}
        <div className="bg-black/30 backdrop-blur rounded-xl p-4">
          <div className="flex justify-between items-center mb-3">
            <span className="text-gray-400 text-sm">{t('lobby.joinByCode')}</span>
            <button onClick={() => send('room:list')} className="text-sm text-purple-400 hover:text-purple-300">
              {t('lobby.refresh')}
            </button>
          </div>
          {state.roomList.length === 0 ? (
            <p className="text-gray-500 text-center py-4">{t('lobby.noRooms')}</p>
          ) : (
            <div className="space-y-2">
              {state.roomList.map(r => (
                <div key={r.code}
                  onClick={() => r.status === 'waiting' && handleJoin(r.code)}
                  className={`flex justify-between items-center p-3 rounded-lg ${r.status === 'waiting' ? 'bg-white/5 hover:bg-white/10 cursor-pointer' : 'bg-white/5 opacity-50'}`}>
                  <span className="text-white font-mono">{r.code}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-400 text-sm">{r.playerCount}/4 {t('lobby.players')}</span>
                    {r.hasPassword && <span className="text-yellow-500 text-xs">🔒</span>}
                    <span className={`text-xs ${r.status === 'waiting' ? 'text-green-400' : 'text-orange-400'}`}>
                      {t(`lobby.${r.status}`)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/LobbyPage.tsx
git commit -m "feat: add LobbyPage with room list and creation"
```

---

### Task 19: RoomPage

**Files:**
- Create: `client/src/pages/RoomPage.tsx`

- [ ] **Step 1: Implement RoomPage**

```tsx
import { useTranslation } from 'react-i18next';
import type { GameState } from '../hooks/useGameState';
import type { GameAction } from '../hooks/useGameState';

interface Props {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
  send: (type: string, payload?: unknown) => void;
  playerId: string | null;
}

export default function RoomPage({ state, send, playerId }: Props) {
  const { t } = useTranslation();
  const me = state.players.find(p => p.id === playerId);
  const isHost = me?.isHost ?? false;
  const isReady = me?.isReady ?? false;
  const allOthersReady = state.players.filter(p => p.id !== playerId).every(p => p.isReady || p.isHost);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white mb-1">{t('app.title')}</h1>
          <p className="text-gray-400">{t('room.code')}: <span className="font-mono text-white text-xl tracking-widest">{state.roomCode}</span></p>
        </div>

        <div className="bg-black/30 backdrop-blur rounded-xl p-4 space-y-3">
          {state.players.map(p => (
            <div key={p.id} className="flex justify-between items-center p-3 bg-white/5 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="text-white font-medium">{p.nickname}</span>
                {p.isHost && <span className="text-xs bg-yellow-500 text-black px-2 py-0.5 rounded">{t('room.host')}</span>}
                {p.id === playerId && <span className="text-xs text-purple-400">(me)</span>}
              </div>
              {!p.isHost && (
                <span className={`text-sm ${p.isReady ? 'text-green-400' : 'text-gray-500'}`}>
                  {p.isReady ? '✓ ' + t('room.ready') : '...'}
                </span>
              )}
            </div>
          ))}
          {state.players.length < 2 && (
            <p className="text-center text-gray-500 text-sm py-2">{t('room.waitingForPlayers')}</p>
          )}
        </div>

        <div className="flex gap-3">
          <button onClick={() => send('room:leave')}
            className="flex-1 bg-red-600/80 hover:bg-red-600 text-white py-3 rounded-lg font-bold transition-colors">
            {t('room.leave')}
          </button>
          {isHost ? (
            <button
              onClick={() => send('room:start')}
              disabled={state.players.length < 2 || !allOthersReady}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white py-3 rounded-lg font-bold transition-colors">
              {t('room.start')}
            </button>
          ) : (
            <button
              onClick={() => send('room:ready')}
              className={`flex-1 py-3 rounded-lg font-bold transition-colors ${isReady ? 'bg-gray-600 hover:bg-gray-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>
              {isReady ? t('room.cancel') : t('room.ready')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/RoomPage.tsx
git commit -m "feat: add RoomPage with ready/start logic"
```

---

### Task 20: GamePage

**Files:**
- Create: `client/src/pages/GamePage.tsx`

- [ ] **Step 1: Implement GamePage**

```tsx
import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import DiceArea from '../components/DiceArea';
import ScoreBoard from '../components/ScoreBoard';
import ReactionBar from '../components/ReactionBar';
import type { GameState, GameAction } from '../hooks/useGameState';
import type { Category } from '../types/game';

interface Props {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
  send: (type: string, payload?: unknown) => void;
  playerId: string | null;
}

export default function GamePage({ state, dispatch, send, playerId }: Props) {
  const { t } = useTranslation();
  const isMyTurn = state.currentPlayer === playerId;
  const [rollPhase, setRollPhase] = useState<'idle' | 'shaking' | 'rolling' | 'settled'>('idle');

  const handleShake = () => {
    if (!isMyTurn || state.rollCount >= 3) return;
    setRollPhase('shaking');
    // Request roll from server — server responds with game:rolled
    const held: number[] = [];
    state.held.forEach((h, i) => { if (h) held.push(i); });
    send('game:roll', { held });
  };

  // When server sends dice result, transition to rolling phase
  // (dice values are set via DiceArea's useEffect before roll() is called)
  useEffect(() => {
    if (rollPhase === 'shaking' && state.dice.length === 5 && state.rollCount > 0) {
      // Brief delay so shake animation is visible before rolling
      const timer = setTimeout(() => setRollPhase('rolling'), 800);
      return () => clearTimeout(timer);
    }
  }, [state.dice, state.rollCount, rollPhase]);

  const handleSettled = useCallback(() => {
    setRollPhase('settled');
  }, []);

  const handleScore = (category: Category) => {
    send('game:score', { category });
    setRollPhase('idle');
  };

  const handleReaction = (emoji: string) => {
    send('reaction:send', { emoji });
  };

  const currentNick = state.players.find(p => p.id === state.currentPlayer)?.nickname ?? '';

  // When dice come from server, trigger roll animation
  // This is handled via useEffect in App.tsx wiring

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-green-900 to-gray-900 flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center px-4 py-2 bg-black/30">
        <span className="text-white font-bold">{t('game.round')} {state.round}/13</span>
        <span className={`text-sm ${isMyTurn ? 'text-yellow-300 font-bold' : 'text-gray-400'}`}>
          {isMyTurn ? t('game.yourTurn') : currentNick + t('game.waitingTurn')}
        </span>
        <span className="text-gray-400 text-sm">{t('game.rollsLeft')}: {3 - state.rollCount}</span>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 p-4">
        {/* Left: Dice + controls */}
        <div className="flex-1 flex flex-col gap-4">
          <DiceArea
            dice={state.dice}
            held={state.held}
            rollPhase={rollPhase}
            onHold={(i) => dispatch({ type: 'TOGGLE_HOLD', index: i })}
            onSettled={handleSettled}
          />
          <div className="flex justify-center gap-4">
            {rollPhase !== 'shaking' && rollPhase !== 'rolling' && (
              <button
                onClick={handleShake}
                disabled={!isMyTurn || state.rollCount >= 3}
                className="px-8 py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white font-bold rounded-xl text-lg transition-colors">
                {state.rollCount === 0 ? t('game.shake') : t('game.rollDice')}
                {state.rollCount > 0 && ` (${3 - state.rollCount})`}
              </button>
            )}
          </div>
        </div>

        {/* Right: Scoreboard */}
        <div className="lg:w-80">
          <ScoreBoard
            players={state.players}
            scores={state.scores}
            currentPlayer={state.currentPlayer}
            myId={playerId}
            rollCount={state.rollCount}
            onSelectCategory={isMyTurn && state.rollCount > 0 ? handleScore : undefined}
          />
        </div>
      </div>

      {/* Bottom: Reactions */}
      <div className="px-4 pb-4">
        <ReactionBar
          onSend={handleReaction}
          reactions={state.reactions}
          onExpire={(ts) => dispatch({ type: 'CLEAR_REACTION', ts })}
          players={state.players}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/GamePage.tsx
git commit -m "feat: add GamePage with dice, scoreboard, reactions"
```

---

### Task 21: ResultPage

**Files:**
- Create: `client/src/pages/ResultPage.tsx`

- [ ] **Step 1: Implement ResultPage**

```tsx
import { useTranslation } from 'react-i18next';
import type { GameState, GameAction } from '../hooks/useGameState';

interface Props {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
  send: (type: string, payload?: unknown) => void;
}

export default function ResultPage({ state, dispatch, send }: Props) {
  const { t } = useTranslation();
  const medals = ['🥇', '🥈', '🥉', ''];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-yellow-900 to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <h1 className="text-3xl font-bold text-white text-center">{t('result.title')}</h1>

        <div className="space-y-3">
          {state.rankings.map((r, i) => (
            <div key={r.playerId}
              className={`flex items-center justify-between p-4 rounded-xl ${i === 0 ? 'bg-yellow-500/20 border border-yellow-500/50' : 'bg-black/30'}`}>
              <div className="flex items-center gap-3">
                <span className="text-2xl">{medals[i] ?? ''}</span>
                <div>
                  <p className="text-white font-bold">{r.nickname}</p>
                  <p className="text-gray-400 text-sm">{r.rank}{t('result.rank')}</p>
                </div>
              </div>
              <span className="text-2xl font-bold text-white">{r.score}</span>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => { send('game:rematch'); }}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg font-bold transition-colors">
            {t('result.rematch')}
          </button>
          <button
            onClick={() => { send('room:leave'); dispatch({ type: 'RESET_GAME' }); }}
            className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-3 rounded-lg font-bold transition-colors">
            {t('result.backToLobby')}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/ResultPage.tsx
git commit -m "feat: add ResultPage with rankings"
```

---

### Task 22: App.tsx Wiring

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/src/main.tsx`

- [ ] **Step 1: Write App.tsx**

```tsx
import { useEffect, useCallback, useState } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useGameState } from './hooks/useGameState';
import LobbyPage from './pages/LobbyPage';
import RoomPage from './pages/RoomPage';
import GamePage from './pages/GamePage';
import ResultPage from './pages/ResultPage';
import type {
  RoomState, GameRolledPayload, GameScoredPayload,
  GameTurnPayload, GameSyncPayload, GameEndPayload,
  ReactionShowPayload,
} from './types/game';

export default function App() {
  const [nickname, setNickname] = useState(() => {
    return localStorage.getItem('yacht-nickname') || '';
  });
  const ws = useWebSocket(nickname);
  const [state, dispatch] = useGameState();

  // Connect on mount
  useEffect(() => {
    if (nickname) {
      ws.connect();
      return () => ws.disconnect();
    }
  }, []);

  // Save nickname
  useEffect(() => {
    if (state.nickname) {
      setNickname(state.nickname);
      localStorage.setItem('yacht-nickname', state.nickname);
    }
  }, [state.nickname]);

  // Connect when nickname is first set
  const handleConnect = useCallback((nick: string) => {
    setNickname(nick);
    localStorage.setItem('yacht-nickname', nick);
    dispatch({ type: 'SET_NICKNAME', nickname: nick });
  }, [dispatch]);

  // Register message handlers
  useEffect(() => {
    const unsubs = [
      ws.on('room:state', (env) => {
        const p = env.payload as RoomState;
        dispatch({ type: 'SET_ROOM', roomCode: p.roomCode });
        dispatch({ type: 'SET_PLAYERS', players: p.players });
      }),
      ws.on('game:start', () => {
        dispatch({ type: 'SET_PHASE', phase: 'game' });
      }),
      ws.on('game:rolled', (env) => {
        const p = env.payload as GameRolledPayload;
        dispatch({ type: 'GAME_ROLLED', dice: p.dice, rollCount: p.rollCount });
      }),
      ws.on('game:scored', (env) => {
        const p = env.payload as GameScoredPayload;
        dispatch({ type: 'SET_SCORES', scores: p.totalScores });
      }),
      ws.on('game:turn', (env) => {
        const p = env.payload as GameTurnPayload;
        dispatch({ type: 'SET_TURN', currentPlayer: p.currentPlayer, round: p.round });
      }),
      ws.on('game:sync', (env) => {
        const p = env.payload as GameSyncPayload;
        dispatch({ type: 'GAME_SYNC', ...p });
      }),
      ws.on('game:end', (env) => {
        const p = env.payload as GameEndPayload;
        dispatch({ type: 'GAME_END', rankings: p.rankings });
      }),
      ws.on('reaction:show', (env) => {
        const p = env.payload as ReactionShowPayload;
        dispatch({ type: 'ADD_REACTION', playerId: p.playerId, emoji: p.emoji });
      }),
      ws.on('player:left', () => {
        // room:state will follow
      }),
      ws.on('error', (env) => {
        const p = env.payload as { message: string };
        console.error('Server error:', p.message);
      }),
    ];
    return () => unsubs.forEach(u => u());
  }, [ws, dispatch]);

  // Auto-connect if we have a nickname
  useEffect(() => {
    if (nickname && !ws.connected) {
      ws.connect();
    }
  }, [nickname, ws]);

  switch (state.phase) {
    case 'lobby':
      return <LobbyPage state={state} dispatch={dispatch} send={ws.send} on={ws.on} playerId={ws.playerId} />;
    case 'room':
      return <RoomPage state={state} dispatch={dispatch} send={ws.send} playerId={ws.playerId} />;
    case 'game':
      return <GamePage state={state} dispatch={dispatch} send={ws.send} playerId={ws.playerId} />;
    case 'result':
      return <ResultPage state={state} dispatch={dispatch} send={ws.send} />;
  }
}
```

- [ ] **Step 2: Update main.tsx**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './i18n';
import './index.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 3: Verify build**

```bash
cd client && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add client/src/App.tsx client/src/main.tsx
git commit -m "feat: wire App with WebSocket, routing, and state management"
```

---

## Chunk 7: Docker Compose

### Task 23: Backend Dockerfile

**Files:**
- Create: `server/Dockerfile`

- [ ] **Step 1: Write Dockerfile**

```dockerfile
FROM golang:1.22-alpine AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /yacht-server .

FROM alpine:3.19
RUN apk add --no-cache ca-certificates
COPY --from=build /yacht-server /yacht-server
EXPOSE 8080
CMD ["/yacht-server"]
```

- [ ] **Step 2: Commit**

```bash
git add server/Dockerfile
git commit -m "chore: add backend Dockerfile"
```

---

### Task 24: Frontend Dockerfile + nginx

**Files:**
- Create: `client/Dockerfile`
- Create: `client/nginx.conf`

- [ ] **Step 1: Write nginx.conf**

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /ws {
        proxy_pass http://backend:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }

    location /health {
        proxy_pass http://backend:8080;
    }
}
```

- [ ] **Step 2: Write Dockerfile**

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

- [ ] **Step 3: Commit**

```bash
git add client/Dockerfile client/nginx.conf
git commit -m "chore: add frontend Dockerfile and nginx config"
```

---

### Task 25: docker-compose.yml

**Files:**
- Create: `docker-compose.yml`

- [ ] **Step 1: Write docker-compose.yml**

```yaml
services:
  frontend:
    build: ./client
    ports:
      - "80:80"
    depends_on:
      - backend

  backend:
    build: ./server
    ports:
      - "8080:8080"
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:8080/health"]
      interval: 10s
      timeout: 3s
      retries: 3
```

- [ ] **Step 2: Commit**

```bash
git add docker-compose.yml
git commit -m "chore: add docker-compose.yml"
```

---

### Task 26: Build and Smoke Test

- [ ] **Step 1: Build everything**

```bash
docker-compose build
```

- [ ] **Step 2: Start and verify**

```bash
docker-compose up -d && sleep 5 && curl -s http://localhost/health && curl -s -o /dev/null -w "%{http_code}" http://localhost/
```

Expected: `ok` and `200`

- [ ] **Step 3: Commit any fixes**

```bash
git add -A && git commit -m "fix: docker-compose build fixes"
```

---

## Chunk 8: Final Verification

### Task 27: Verify All Tests and Build

- [ ] **Step 1: Update .gitignore**

Add to `.gitignore`:
```
node_modules/
dist/
.env
*.exe
yacht-server
dice-3d-demo.html
```

- [ ] **Step 2: Verify all tests pass**

```bash
cd server && go test ./... -v
```

- [ ] **Step 3: Verify frontend builds**

```bash
cd client && npm run build
```

- [ ] **Step 4: Commit all remaining files**

```bash
git add -A && git commit -m "chore: final cleanup and gitignore update"
```
