package game

import (
	"testing"

	"yacht-dice-server/message"
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
	dice, err := e.Roll("p1")
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
	_, err := e.Roll("p2")
	if err == nil {
		t.Error("expected error for wrong player")
	}
}

func TestRollMax3(t *testing.T) {
	e := NewEngine([]string{"p1", "p2"})
	e.Roll("p1")
	e.Roll("p1")
	e.Roll("p1")
	_, err := e.Roll("p1")
	if err == nil {
		t.Error("expected error for 4th roll")
	}
}

func TestScoreAndAdvance(t *testing.T) {
	e := NewEngine([]string{"p1", "p2"})
	e.Roll("p1")
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
	e.Roll("p1")
	e.Score("p1", "choice")
	e.Roll("p2")
	e.Score("p2", "choice")
	e.Roll("p1")
	_, err := e.Score("p1", "choice")
	if err == nil {
		t.Error("expected error for duplicate category")
	}
}

func TestGameEnd(t *testing.T) {
	e := NewEngine([]string{"p1", "p2"})
	cats := AllCategories()
	for round := 0; round < len(cats); round++ {
		for _, pid := range []string{"p1", "p2"} {
			e.Roll(pid)
			e.Score(pid, cats[round])
		}
	}
	if !e.IsFinished() {
		t.Error("game should be finished after all rounds")
	}
}

func TestRemovePlayer(t *testing.T) {
	e := NewEngine([]string{"p1", "p2", "p3"})
	e.RemovePlayer("p2")
	if len(e.PlayerOrder()) != 2 {
		t.Errorf("players = %d, want 2", len(e.PlayerOrder()))
	}
}

func TestHeldViaHold(t *testing.T) {
	e := NewEngine([]string{"p1"})
	e.Roll("p1")
	e.Hold("p1", 0)
	e.Hold("p1", 2)
	e.Hold("p1", 4)
	h := e.Held()
	if !h[0] || h[1] || !h[2] || h[3] || !h[4] {
		t.Errorf("held = %v, want [true false true false true]", h)
	}
}

func TestHoldToggle(t *testing.T) {
	e := NewEngine([]string{"p1", "p2"})
	e.Roll("p1") // first roll
	held, err := e.Hold("p1", 2)
	if err != nil {
		t.Fatal(err)
	}
	if !held[2] {
		t.Error("dice 2 should be held")
	}
	// Toggle off
	held, err = e.Hold("p1", 2)
	if err != nil {
		t.Fatal(err)
	}
	if held[2] {
		t.Error("dice 2 should be unheld after toggle")
	}
}

func TestHoldWrongPlayer(t *testing.T) {
	e := NewEngine([]string{"p1", "p2"})
	e.Roll("p1")
	_, err := e.Hold("p2", 0)
	if err == nil {
		t.Error("expected error for wrong player")
	}
}

func TestHoldBeforeRoll(t *testing.T) {
	e := NewEngine([]string{"p1", "p2"})
	_, err := e.Hold("p1", 0)
	if err == nil {
		t.Error("expected error when rollCount == 0")
	}
}

func TestHoldInvalidIndex(t *testing.T) {
	e := NewEngine([]string{"p1", "p2"})
	e.Roll("p1")
	_, err := e.Hold("p1", 5)
	if err == nil {
		t.Error("expected error for index 5")
	}
	_, err = e.Hold("p1", -1)
	if err == nil {
		t.Error("expected error for index -1")
	}
}

func TestPreview(t *testing.T) {
	e := NewEngine([]string{"p1", "p2"})
	e.Roll("p1")
	preview := e.Preview("p1")
	if len(preview) != 12 {
		t.Errorf("preview categories = %d, want 12", len(preview))
	}
	dice := e.Dice()
	sum := 0
	for _, d := range dice {
		sum += d
	}
	if preview["choice"] != sum {
		t.Errorf("choice preview = %d, want %d", preview["choice"], sum)
	}
}

func TestPreviewExcludesScored(t *testing.T) {
	e := NewEngine([]string{"p1", "p2"})
	e.Roll("p1")
	e.Score("p1", "choice")
	e.Roll("p2")
	e.Score("p2", "choice")
	e.Roll("p1")
	preview := e.Preview("p1")
	if _, ok := preview["choice"]; ok {
		t.Error("choice should not be in preview after scoring")
	}
	if len(preview) != 11 {
		t.Errorf("preview categories = %d, want 11", len(preview))
	}
}

func TestRemoveCurrentPlayer(t *testing.T) {
	e := NewEngine([]string{"p1", "p2", "p3"})
	e.Roll("p1")
	// Remove current player p1
	e.RemovePlayer("p1")
	// Should advance to p2 with reset state
	if e.CurrentPlayer() != "p2" {
		t.Errorf("after removing current player, current = %s, want p2", e.CurrentPlayer())
	}
	if e.RollCount() != 0 {
		t.Errorf("rollCount should be 0 after removing current player, got %d", e.RollCount())
	}
}

func TestRemovePlayerBeforeCurrent(t *testing.T) {
	e := NewEngine([]string{"p1", "p2", "p3"})
	// Advance to p2's turn
	e.Roll("p1")
	e.Score("p1", "choice")
	if e.CurrentPlayer() != "p2" {
		t.Fatalf("expected p2's turn, got %s", e.CurrentPlayer())
	}
	// Remove p1 (before current)
	e.RemovePlayer("p1")
	// p2 should still be current
	if e.CurrentPlayer() != "p2" {
		t.Errorf("after removing p1, current = %s, want p2", e.CurrentPlayer())
	}
}

func TestRemovePlayerAfterCurrent(t *testing.T) {
	e := NewEngine([]string{"p1", "p2", "p3"})
	// p1's turn
	if e.CurrentPlayer() != "p1" {
		t.Fatalf("expected p1's turn, got %s", e.CurrentPlayer())
	}
	// Remove p3 (after current)
	e.RemovePlayer("p3")
	// p1 should still be current
	if e.CurrentPlayer() != "p1" {
		t.Errorf("after removing p3, current = %s, want p1", e.CurrentPlayer())
	}
	if len(e.PlayerOrder()) != 2 {
		t.Errorf("player count = %d, want 2", len(e.PlayerOrder()))
	}
}

func TestRemoveLastPlayerWrapsTurn(t *testing.T) {
	e := NewEngine([]string{"p1", "p2"})
	// Advance to p2's turn
	e.Roll("p1")
	e.Score("p1", "choice")
	if e.CurrentPlayer() != "p2" {
		t.Fatalf("expected p2's turn, got %s", e.CurrentPlayer())
	}
	// Remove p2 (current and last in order) — should wrap to p1 and advance round
	e.RemovePlayer("p2")
	if e.CurrentPlayer() != "p1" {
		t.Errorf("after removing last player in order, current = %s, want p1", e.CurrentPlayer())
	}
	if e.Round() != 2 {
		t.Errorf("round = %d, want 2 after wrapping", e.Round())
	}
}

func TestRankings(t *testing.T) {
	e := NewEngine([]string{"p1", "p2"})
	// Play one round so both have scores
	e.Roll("p1")
	e.Score("p1", "choice")
	e.Roll("p2")
	e.Score("p2", "choice")

	rankings := e.Rankings()
	if len(rankings) != 2 {
		t.Errorf("rankings count = %d, want 2", len(rankings))
	}
	// Rankings should be sorted by score descending
	if rankings[0].Score < rankings[1].Score {
		t.Error("rankings should be sorted descending by score")
	}
	if rankings[0].Rank != 1 || rankings[1].Rank != 2 {
		t.Error("ranks should be 1, 2")
	}
}

func TestRetirePlayerScoresPreserved(t *testing.T) {
	e := NewEngine([]string{"p1", "p2", "p3"})
	e.SetNicknames(map[string]string{"p1": "Alice", "p2": "Bob", "p3": "Charlie"})
	e.Roll("p1")
	e.Score("p1", "ones")
	e.Roll("p2")
	e.Score("p2", "ones")

	wasTurn := e.RetirePlayer("p2")
	if wasTurn {
		t.Error("p2 was not current player, wasTurn should be false")
	}
	if len(e.PlayerOrder()) != 2 {
		t.Errorf("playerOrder len = %d, want 2", len(e.PlayerOrder()))
	}
	lp := e.LeftPlayers()
	if lp["p2"].Scores == nil {
		t.Fatal("p2 should be in leftPlayers")
	}
	if lp["p2"].Nickname != "Bob" {
		t.Errorf("p2 nickname = %s, want Bob", lp["p2"].Nickname)
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
	e.SetNicknames(map[string]string{"p1": "Alice", "p2": "Bob", "p3": "Charlie"})
	e.Roll("p1")
	e.Score("p1", "choice")
	e.Roll("p2")
	e.Score("p2", "choice")
	e.Roll("p3")
	e.Score("p3", "choice")

	e.RetirePlayer("p2")

	cats := AllCategories()
	for _, cat := range cats {
		if cat == "choice" {
			continue
		}
		for _, pid := range e.PlayerOrder() {
			e.Roll(pid)
			e.Score(pid, cat)
		}
	}

	rankings := e.Rankings()
	if len(rankings) != 3 {
		t.Fatalf("rankings len = %d, want 3", len(rankings))
	}
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
	if p2Entry.Nickname != "Bob" {
		t.Errorf("p2 nickname = %s, want Bob", p2Entry.Nickname)
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

func TestScoreBeforeRoll(t *testing.T) {
	e := NewEngine([]string{"p1", "p2"})
	_, err := e.Score("p1", "choice")
	if err == nil {
		t.Error("expected error when scoring before rolling")
	}
}

func TestScoreInvalidCategory(t *testing.T) {
	e := NewEngine([]string{"p1", "p2"})
	e.Roll("p1")
	_, err := e.Score("p1", "notACategory")
	if err == nil {
		t.Error("expected error for invalid category")
	}
}

func TestFullGameFourPlayers(t *testing.T) {
	players := []string{"p1", "p2", "p3", "p4"}
	e := NewEngine(players)
	cats := AllCategories()
	for round := 0; round < len(cats); round++ {
		for _, pid := range players {
			if e.IsFinished() {
				t.Fatalf("game finished early at round %d, player %s", round, pid)
			}
			if e.CurrentPlayer() != pid {
				t.Fatalf("round %d: expected %s's turn, got %s", round, pid, e.CurrentPlayer())
			}
			_, err := e.Roll(pid)
			if err != nil {
				t.Fatalf("round %d, %s roll: %v", round, pid, err)
			}
			_, err = e.Score(pid, cats[round])
			if err != nil {
				t.Fatalf("round %d, %s score %s: %v", round, pid, cats[round], err)
			}
		}
	}
	if !e.IsFinished() {
		t.Error("game should be finished after all rounds with 4 players")
	}
	rankings := e.Rankings()
	if len(rankings) != 4 {
		t.Errorf("rankings count = %d, want 4", len(rankings))
	}
}
