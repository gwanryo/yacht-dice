package room

import (
	"encoding/json"
	"sync"
	"testing"

	"yacht-dice-server/message"
	"yacht-dice-server/player"
)

// mockPlayer creates a player with a mock connection (nil conn, but tracks sent messages).
type sentMessages struct {
	mu   sync.Mutex
	msgs [][]byte
}

func (s *sentMessages) add(data []byte) {
	s.mu.Lock()
	defer s.mu.Unlock()
	cp := make([]byte, len(data))
	copy(cp, data)
	s.msgs = append(s.msgs, cp)
}

func (s *sentMessages) count() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.msgs)
}

func newMockPlayer(id, nickname string) *player.Player {
	// Using nil conn — Send will return ErrDisconnected but won't panic
	return player.New(id, nickname, nil)
}

func TestNew(t *testing.T) {
	rm := New("ABCD12", "")
	if rm.Code != "ABCD12" {
		t.Errorf("code = %s, want ABCD12", rm.Code)
	}
	if rm.Status() != StatusWaiting {
		t.Errorf("status = %s, want waiting", rm.Status())
	}
	if rm.HasPassword() {
		t.Error("room should not have password")
	}
}

func TestNewWithPassword(t *testing.T) {
	rm := New("ABCD12", "secret")
	if !rm.HasPassword() {
		t.Error("room should have password")
	}
	if !rm.CheckPassword("secret") {
		t.Error("correct password should match")
	}
	if rm.CheckPassword("wrong") {
		t.Error("wrong password should not match")
	}
}

func TestAddPlayer(t *testing.T) {
	rm := New("TEST01", "")
	p := newMockPlayer("p1", "Alice")
	err := rm.AddPlayer(p)
	if err != nil {
		t.Fatalf("AddPlayer: %v", err)
	}
	if rm.PlayerCount() != 1 {
		t.Errorf("count = %d, want 1", rm.PlayerCount())
	}
}

func TestAddPlayerDuplicate(t *testing.T) {
	rm := New("TEST01", "")
	p := newMockPlayer("p1", "Alice")
	rm.AddPlayer(p)
	err := rm.AddPlayer(p) // same player again
	if err != nil {
		t.Fatalf("duplicate add should succeed: %v", err)
	}
	if rm.PlayerCount() != 1 {
		t.Errorf("count = %d, want 1 (no duplicate)", rm.PlayerCount())
	}
}

func TestAddPlayerFull(t *testing.T) {
	rm := New("TEST01", "")
	for i := 0; i < MaxPlayers; i++ {
		p := newMockPlayer("p"+string(rune('1'+i)), "Player")
		rm.AddPlayer(p)
	}
	extra := newMockPlayer("extra", "Extra")
	err := rm.AddPlayer(extra)
	if err == nil {
		t.Error("expected error when room is full")
	}
}

func TestAddPlayerGameInProgress(t *testing.T) {
	rm := New("TEST01", "")
	p1 := newMockPlayer("p1", "Alice")
	p2 := newMockPlayer("p2", "Bob")
	rm.AddPlayer(p1)
	rm.AddPlayer(p2)
	rm.StartGame()

	p3 := newMockPlayer("p3", "Charlie")
	err := rm.AddPlayer(p3)
	if err == nil {
		t.Error("expected error when game in progress")
	}
}

func TestRemovePlayer(t *testing.T) {
	rm := New("TEST01", "")
	p1 := newMockPlayer("p1", "Alice")
	p2 := newMockPlayer("p2", "Bob")
	rm.AddPlayer(p1)
	rm.AddPlayer(p2)

	called := false
	rm.RemovePlayer("p1", func() { called = true })

	if rm.PlayerCount() != 1 {
		t.Errorf("count = %d, want 1", rm.PlayerCount())
	}
	if called {
		t.Error("onEmpty should not be called when players remain")
	}
}

func TestRemovePlayerOnEmpty(t *testing.T) {
	rm := New("TEST01", "")
	p := newMockPlayer("p1", "Alice")
	rm.AddPlayer(p)

	rm.RemovePlayer("p1", func() {
		// This would be called after emptyRoomTimeout via time.AfterFunc
	})

	// The callback is called via time.AfterFunc so won't fire immediately,
	// but the cleanup timer should be set (non-nil internally).
	if rm.PlayerCount() != 0 {
		t.Errorf("count = %d, want 0", rm.PlayerCount())
	}
}

func TestRemovePlayerNotFound(t *testing.T) {
	rm := New("TEST01", "")
	// Should not panic
	rm.RemovePlayer("nonexistent", func() {})
}

func TestToggleReady(t *testing.T) {
	rm := New("TEST01", "")
	p := newMockPlayer("p1", "Alice")
	rm.AddPlayer(p)

	rm.ToggleReady("p1")
	// Need to check via CanStart indirectly since ready is private
	// Add a second player and test CanStart
	p2 := newMockPlayer("p2", "Bob")
	rm.AddPlayer(p2)
	rm.ToggleReady("p2")

	// p1 is host, p2 is ready => can start
	if !rm.CanStart("p1") {
		t.Error("expected CanStart to return true")
	}

	// Toggle p2 off
	rm.ToggleReady("p2")
	if rm.CanStart("p1") {
		t.Error("expected CanStart to return false after un-readying")
	}
}

func TestCanStartNotHost(t *testing.T) {
	rm := New("TEST01", "")
	p1 := newMockPlayer("p1", "Alice")
	p2 := newMockPlayer("p2", "Bob")
	rm.AddPlayer(p1)
	rm.AddPlayer(p2)
	rm.ToggleReady("p2")

	if rm.CanStart("p2") {
		t.Error("non-host should not be able to start")
	}
}

func TestCanStartSoloPlayer(t *testing.T) {
	rm := New("TEST01", "")
	p1 := newMockPlayer("p1", "Alice")
	rm.AddPlayer(p1)

	if !rm.CanStart("p1") {
		t.Error("solo player (host) should be able to start")
	}
}

func TestCanStartZeroPlayers(t *testing.T) {
	rm := New("TEST01", "")
	if rm.CanStart("nobody") {
		t.Error("should not start with zero players")
	}
}

func TestStartGame(t *testing.T) {
	rm := New("TEST01", "")
	p1 := newMockPlayer("p1", "Alice")
	p2 := newMockPlayer("p2", "Bob")
	rm.AddPlayer(p1)
	rm.AddPlayer(p2)

	order := rm.StartGame()
	if len(order) != 2 {
		t.Fatalf("order len = %d, want 2", len(order))
	}
	if rm.Status() != StatusPlaying {
		t.Errorf("status = %s, want playing", rm.Status())
	}
}

func TestRoll(t *testing.T) {
	rm := New("TEST01", "")
	p1 := newMockPlayer("p1", "Alice")
	p2 := newMockPlayer("p2", "Bob")
	rm.AddPlayer(p1)
	rm.AddPlayer(p2)
	rm.StartGame()

	result, err := rm.Roll("p1")
	if err != nil {
		t.Fatalf("Roll: %v", err)
	}
	for _, d := range result.Dice {
		if d < 1 || d > 6 {
			t.Errorf("dice value out of range: %d", d)
		}
	}
	if result.RollCount != 1 {
		t.Errorf("rollCount = %d, want 1", result.RollCount)
	}
}

func TestRollNoGame(t *testing.T) {
	rm := New("TEST01", "")
	_, err := rm.Roll("p1")
	if err == nil {
		t.Error("expected error when no game in progress")
	}
}

func TestHold(t *testing.T) {
	rm := New("TEST01", "")
	p1 := newMockPlayer("p1", "Alice")
	p2 := newMockPlayer("p2", "Bob")
	rm.AddPlayer(p1)
	rm.AddPlayer(p2)
	rm.StartGame()
	rm.Roll("p1")

	held, err := rm.Hold("p1", 2)
	if err != nil {
		t.Fatalf("Hold: %v", err)
	}
	if !held[2] {
		t.Error("dice 2 should be held")
	}
}

func TestHoldNoGame(t *testing.T) {
	rm := New("TEST01", "")
	_, err := rm.Hold("p1", 0)
	if err == nil {
		t.Error("expected error when no game in progress")
	}
}

func TestScore(t *testing.T) {
	rm := New("TEST01", "")
	p1 := newMockPlayer("p1", "Alice")
	p2 := newMockPlayer("p2", "Bob")
	rm.AddPlayer(p1)
	rm.AddPlayer(p2)
	rm.StartGame()
	rm.Roll("p1")

	result, err := rm.Score("p1", "choice")
	if err != nil {
		t.Fatalf("Score: %v", err)
	}
	if result.Score < 5 || result.Score > 30 {
		t.Errorf("choice score out of range: %d", result.Score)
	}
	if result.TotalScores == nil {
		t.Error("TotalScores should not be nil")
	}
}

func TestScoreNoGame(t *testing.T) {
	rm := New("TEST01", "")
	_, err := rm.Score("p1", "choice")
	if err == nil {
		t.Error("expected error when no game in progress")
	}
}

func TestTurnInfo(t *testing.T) {
	rm := New("TEST01", "")
	p1 := newMockPlayer("p1", "Alice")
	p2 := newMockPlayer("p2", "Bob")
	rm.AddPlayer(p1)
	rm.AddPlayer(p2)
	rm.StartGame()

	currentPlayer, round, rollCount, ok := rm.TurnInfo()
	if !ok {
		t.Fatal("expected ok to be true")
	}
	if currentPlayer != "p1" {
		t.Errorf("currentPlayer = %s, want p1", currentPlayer)
	}
	if round != 1 {
		t.Errorf("round = %d, want 1", round)
	}
	if rollCount != 0 {
		t.Errorf("rollCount = %d, want 0", rollCount)
	}
}

func TestTurnInfoNoGame(t *testing.T) {
	rm := New("TEST01", "")
	_, _, _, ok := rm.TurnInfo()
	if ok {
		t.Error("expected ok to be false when no game")
	}
}

func TestHandleDisconnectAndReconnect(t *testing.T) {
	rm := New("TEST01", "")
	p1 := newMockPlayer("p1", "Alice")
	p2 := newMockPlayer("p2", "Bob")
	rm.AddPlayer(p1)
	rm.AddPlayer(p2)
	rm.StartGame()

	called := false
	rm.HandleDisconnect("p1", func() { called = true })

	// Reconnect before timeout
	rm.HandleReconnect("p1")

	// The timeout callback should not have fired
	if called {
		t.Error("timeout should not fire after reconnect")
	}
}

func TestHandleReconnectNotDisconnected(t *testing.T) {
	rm := New("TEST01", "")
	// Should not panic
	rm.HandleReconnect("p1")
}

func TestRematch(t *testing.T) {
	rm := New("TEST01", "")
	p1 := newMockPlayer("p1", "Alice")
	p2 := newMockPlayer("p2", "Bob")
	rm.AddPlayer(p1)
	rm.AddPlayer(p2)
	rm.StartGame()
	rm.EndGame(nil)

	allVoted := rm.Rematch("p1")
	if allVoted {
		t.Error("should not be all voted with one vote")
	}

	votes := rm.RematchVotes()
	if len(votes) != 1 || votes[0] != "p1" {
		t.Errorf("votes = %v, want [p1]", votes)
	}

	allVoted = rm.Rematch("p2")
	if !allVoted {
		t.Error("all players should have voted")
	}
	if rm.Status() != StatusWaiting {
		t.Errorf("status = %s, want waiting after all voted", rm.Status())
	}
}

func TestBroadcastState(t *testing.T) {
	rm := New("TEST01", "")
	p1 := newMockPlayer("p1", "Alice")
	rm.AddPlayer(p1)
	// BroadcastState with nil conn just returns errors silently
	rm.BroadcastState() // should not panic
}

func TestSyncPayloadNoEngine(t *testing.T) {
	rm := New("TEST01", "")
	p1 := newMockPlayer("p1", "Alice")
	rm.AddPlayer(p1)
	data := rm.SyncPayload()
	if data == nil {
		t.Fatal("waiting room should return room:sync, not nil")
	}
	var env struct {
		Type string `json:"type"`
	}
	json.Unmarshal(data, &env)
	if env.Type != "room:sync" {
		t.Errorf("type = %s, want room:sync", env.Type)
	}
}

func TestSyncPayloadWithGame(t *testing.T) {
	rm := New("TEST01", "")
	p1 := newMockPlayer("p1", "Alice")
	p2 := newMockPlayer("p2", "Bob")
	rm.AddPlayer(p1)
	rm.AddPlayer(p2)
	rm.StartGame()
	rm.Roll("p1")

	data := rm.SyncPayload()
	if data == nil {
		t.Fatal("expected non-nil sync payload")
	}

	// Verify it's valid JSON with expected fields
	var env struct {
		Type    string          `json:"type"`
		Payload json.RawMessage `json:"payload"`
	}
	if err := json.Unmarshal(data, &env); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if env.Type != "game:sync" {
		t.Errorf("type = %s, want game:sync", env.Type)
	}
}

func TestListItem(t *testing.T) {
	rm := New("TEST01", "mypassword")
	p := newMockPlayer("p1", "Alice")
	rm.AddPlayer(p)

	item := rm.ListItem()
	if item.Code != "TEST01" {
		t.Errorf("code = %s, want TEST01", item.Code)
	}
	if item.PlayerCount != 1 {
		t.Errorf("playerCount = %d, want 1", item.PlayerCount)
	}
	if !item.HasPassword {
		t.Error("expected HasPassword to be true")
	}
	if item.Status != StatusWaiting {
		t.Errorf("status = %s, want waiting", item.Status)
	}
}

func TestGenerateCode(t *testing.T) {
	code := GenerateCode()
	if len(code) != 6 {
		t.Errorf("code length = %d, want 6", len(code))
	}
	// All characters should be from the allowed set
	allowed := "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	for _, c := range code {
		found := false
		for _, a := range allowed {
			if c == a {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("unexpected character in code: %c", c)
		}
	}
}

func TestHostTransferOnRemove(t *testing.T) {
	rm := New("TEST01", "")
	p1 := newMockPlayer("p1", "Alice")
	p2 := newMockPlayer("p2", "Bob")
	rm.AddPlayer(p1)
	rm.AddPlayer(p2)

	// p1 is host; remove p1
	rm.RemovePlayer("p1", func() {})

	// p2 should now be able to start (as new host) once ready
	p3 := newMockPlayer("p3", "Charlie")
	rm.AddPlayer(p3)
	rm.ToggleReady("p3")

	if !rm.CanStart("p2") {
		t.Error("p2 should be the new host and able to start")
	}
}

func TestNicknameMap(t *testing.T) {
	rm := New("TEST01", "")
	p1 := newMockPlayer("p1", "Alice")
	p2 := newMockPlayer("p2", "Bob")
	rm.AddPlayer(p1)
	rm.AddPlayer(p2)

	nicks := rm.NicknameMap()
	if nicks["p1"] != "Alice" {
		t.Errorf("p1 nickname = %s, want Alice", nicks["p1"])
	}
	if nicks["p2"] != "Bob" {
		t.Errorf("p2 nickname = %s, want Bob", nicks["p2"])
	}
}

func TestRemovePlayerClearsRematchVote(t *testing.T) {
	rm := New("TEST01", "")
	p1 := newMockPlayer("p1", "Alice")
	p2 := newMockPlayer("p2", "Bob")
	rm.AddPlayer(p1)
	rm.AddPlayer(p2)

	// Simulate end-of-game state
	rm.StartGame()
	rm.EndGame(nil)

	// p1 votes for rematch
	rm.Rematch("p1")
	votes := rm.RematchVotes()
	if len(votes) != 1 || votes[0] != "p1" {
		t.Fatalf("expected 1 vote from p1, got %v", votes)
	}

	// p1 leaves
	rm.RemovePlayer("p1", func() {})

	// rematch vote should be cleared
	votes = rm.RematchVotes()
	for _, v := range votes {
		if v == "p1" {
			t.Fatalf("p1's rematch vote should have been removed, got %v", votes)
		}
	}
}

func TestRematchWithSinglePlayerAfterLeave(t *testing.T) {
	rm := New("TEST01", "")
	p1 := newMockPlayer("p1", "Alice")
	p2 := newMockPlayer("p2", "Bob")
	rm.AddPlayer(p1)
	rm.AddPlayer(p2)
	rm.StartGame()
	rm.EndGame(nil)

	// p2 leaves
	rm.RemovePlayer("p2", func() {})

	// p1 votes for rematch alone — should trigger rematch (solo mode)
	allVoted := rm.Rematch("p1")
	if !allVoted {
		t.Error("solo rematch should start with single remaining player")
	}

	if rm.Status() != StatusWaiting {
		t.Errorf("status = %s, want waiting after solo rematch", rm.Status())
	}
}

func TestRematchVotesAfterPlayerLeave(t *testing.T) {
	rm := New("TEST01", "")
	p1 := newMockPlayer("p1", "Alice")
	p2 := newMockPlayer("p2", "Bob")
	rm.AddPlayer(p1)
	rm.AddPlayer(p2)
	rm.StartGame()
	rm.EndGame(nil)

	// Both vote, but p1 leaves before p2 votes
	rm.Rematch("p1")
	rm.RemovePlayer("p1", func() {})

	// After removal, only p2 remains but p1's vote is cleared
	votes := rm.RematchVotes()
	if len(votes) != 0 {
		t.Errorf("expected 0 votes after leaving player's vote cleared, got %v", votes)
	}

	// p2 votes — alone, should trigger rematch (solo mode allows 1-player rematch)
	allVoted := rm.Rematch("p2")
	if !allVoted {
		t.Error("solo rematch should start with single remaining player")
	}
}

func TestIsPlayerConnected(t *testing.T) {
	rm := New("TEST01", "")
	p1 := newMockPlayer("p1", "Alice")
	rm.AddPlayer(p1)
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
	// p1's turn — retire p3 (not current)
	result := rm.RetirePlayer("p3")
	if !result.OK {
		t.Fatal("retire should succeed")
	}
	if result.WasTurn {
		t.Error("p3 was not current, wasTurn should be false")
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

func TestSetAndClearPausedFor(t *testing.T) {
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

func TestFindPlayer(t *testing.T) {
	rm := New("TEST01", "")
	p1 := newMockPlayer("p1", "Alice")
	rm.AddPlayer(p1)

	found := rm.FindPlayer("p1")
	if found == nil {
		t.Fatal("expected to find player")
	}
	if found.ID != "p1" {
		t.Errorf("found ID = %s, want p1", found.ID)
	}

	notFound := rm.FindPlayer("missing")
	if notFound != nil {
		t.Error("expected nil for missing player")
	}
}

func TestHandleDisconnectWaiting(t *testing.T) {
	rm := New("TEST01", "")
	p1 := newMockPlayer("p1", "Alice")
	p2 := newMockPlayer("p2", "Bob")
	rm.AddPlayer(p1)
	rm.AddPlayer(p2)

	called := false
	rm.HandleDisconnectWaiting("p2", func() { called = true })

	// Reconnect before timeout — callback should NOT fire
	rm.HandleReconnect("p2")
	if called {
		t.Error("callback should not have fired after reconnect")
	}
}

func TestSyncPayloadWaiting(t *testing.T) {
	rm := New("TEST02", "")
	p1 := newMockPlayer("p1", "Alice")
	rm.AddPlayer(p1)

	data := rm.SyncPayload()
	if data == nil {
		t.Fatal("SyncPayload should return data for waiting room")
	}
	var env struct {
		Type    string          `json:"type"`
		Payload json.RawMessage `json:"payload"`
	}
	if err := json.Unmarshal(data, &env); err != nil {
		t.Fatal(err)
	}
	if env.Type != "room:sync" {
		t.Errorf("type = %s, want room:sync", env.Type)
	}
}

func TestSyncPayloadFinished(t *testing.T) {
	rm := New("TEST03", "")
	p1 := newMockPlayer("p1", "Alice")
	p2 := newMockPlayer("p2", "Bob")
	rm.AddPlayer(p1)
	rm.AddPlayer(p2)
	rm.StartGame()

	rankings := []message.RankEntry{
		{PlayerID: "p1", Nickname: "Alice", Score: 100, Rank: 1},
		{PlayerID: "p2", Nickname: "Bob", Score: 80, Rank: 2},
	}
	rm.EndGame(rankings)

	data := rm.SyncPayload()
	if data == nil {
		t.Fatal("SyncPayload should return data for finished room")
	}
	var env struct {
		Type    string          `json:"type"`
		Payload json.RawMessage `json:"payload"`
	}
	if err := json.Unmarshal(data, &env); err != nil {
		t.Fatal(err)
	}
	if env.Type != "result:sync" {
		t.Errorf("type = %s, want result:sync", env.Type)
	}
	var payload message.ResultSyncPayload
	if err := json.Unmarshal(env.Payload, &payload); err != nil {
		t.Fatal(err)
	}
	if len(payload.Rankings) != 2 {
		t.Errorf("rankings len = %d, want 2", len(payload.Rankings))
	}
}

func TestSoloGameFullRound(t *testing.T) {
	rm := New("TEST01", "")
	p1 := newMockPlayer("p1", "Alice")
	rm.AddPlayer(p1)

	if !rm.CanStart("p1") {
		t.Fatal("solo player should be able to start")
	}

	order := rm.StartGame()
	if len(order) != 1 || order[0] != "p1" {
		t.Fatalf("order = %v, want [p1]", order)
	}
	if rm.Status() != StatusPlaying {
		t.Fatalf("status = %s, want playing", rm.Status())
	}

	// Play all 12 rounds
	categories := []string{
		"ones", "twos", "threes", "fours", "fives", "sixes",
		"choice", "fourOfAKind", "fullHouse",
		"smallStraight", "largeStraight", "yacht",
	}
	for i, cat := range categories {
		_, err := rm.Roll("p1")
		if err != nil {
			t.Fatalf("round %d: Roll: %v", i+1, err)
		}
		result, err := rm.Score("p1", cat)
		if err != nil {
			t.Fatalf("round %d: Score(%s): %v", i+1, cat, err)
		}
		if result.TotalScores == nil {
			t.Fatalf("round %d: TotalScores should not be nil", i+1)
		}
	}

	if !rm.IsFinished() {
		t.Error("game should be finished after 12 rounds")
	}
}

func TestSoloRematch(t *testing.T) {
	rm := New("TEST01", "")
	p1 := newMockPlayer("p1", "Alice")
	rm.AddPlayer(p1)
	rm.StartGame()
	rm.EndGame(nil)

	allVoted := rm.Rematch("p1")
	if !allVoted {
		t.Error("solo rematch should complete with single vote")
	}
	if rm.Status() != StatusWaiting {
		t.Errorf("status = %s, want waiting after solo rematch", rm.Status())
	}
}

func TestSyncPayloadPlaying(t *testing.T) {
	rm := New("TEST04", "")
	p1 := newMockPlayer("p1", "Alice")
	p2 := newMockPlayer("p2", "Bob")
	rm.AddPlayer(p1)
	rm.AddPlayer(p2)
	rm.StartGame()

	data := rm.SyncPayload()
	if data == nil {
		t.Fatal("SyncPayload should return data for playing room")
	}
	var env struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(data, &env); err != nil {
		t.Fatal(err)
	}
	if env.Type != "game:sync" {
		t.Errorf("type = %s, want game:sync", env.Type)
	}
}

func TestSyncPayloadPlayingIncludesPlayers(t *testing.T) {
	rm := New("TEST05", "")
	p1 := newMockPlayer("p1", "Alice")
	rm.AddPlayer(p1)
	rm.StartGame()

	data := rm.SyncPayload()
	if data == nil {
		t.Fatal("SyncPayload should return data")
	}
	var env struct {
		Type    string          `json:"type"`
		Payload json.RawMessage `json:"payload"`
	}
	if err := json.Unmarshal(data, &env); err != nil {
		t.Fatal(err)
	}
	var payload message.GameSyncPayload
	if err := json.Unmarshal(env.Payload, &payload); err != nil {
		t.Fatal(err)
	}
	if len(payload.Players) != 1 {
		t.Errorf("players len = %d, want 1", len(payload.Players))
	}
	if payload.Players[0].ID != "p1" {
		t.Errorf("player ID = %s, want p1", payload.Players[0].ID)
	}
	if payload.Players[0].Nickname != "Alice" {
		t.Errorf("player nickname = %s, want Alice", payload.Players[0].Nickname)
	}
	if payload.RoomCode != "TEST05" {
		t.Errorf("roomCode = %s, want TEST05", payload.RoomCode)
	}
}

func TestSyncPayloadFinishedIncludesPlayers(t *testing.T) {
	rm := New("TEST06", "")
	p1 := newMockPlayer("p1", "Alice")
	rm.AddPlayer(p1)
	rm.StartGame()
	rankings := []message.RankEntry{
		{PlayerID: "p1", Nickname: "Alice", Score: 100, Rank: 1},
	}
	rm.EndGame(rankings)

	data := rm.SyncPayload()
	if data == nil {
		t.Fatal("SyncPayload should return data")
	}
	var env struct {
		Type    string          `json:"type"`
		Payload json.RawMessage `json:"payload"`
	}
	if err := json.Unmarshal(data, &env); err != nil {
		t.Fatal(err)
	}
	var payload message.ResultSyncPayload
	if err := json.Unmarshal(env.Payload, &payload); err != nil {
		t.Fatal(err)
	}
	if len(payload.Players) != 1 {
		t.Errorf("players len = %d, want 1", len(payload.Players))
	}
	if payload.Players[0].ID != "p1" {
		t.Errorf("player ID = %s, want p1", payload.Players[0].ID)
	}
	if payload.RoomCode != "TEST06" {
		t.Errorf("roomCode = %s, want TEST06", payload.RoomCode)
	}
}
