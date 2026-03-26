package message

import (
	"encoding/json"
	"testing"
)

func TestNew(t *testing.T) {
	data, err := New("test:type", map[string]string{"key": "value"})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	var env Envelope
	if err := json.Unmarshal(data, &env); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if env.Type != "test:type" {
		t.Errorf("type = %s, want test:type", env.Type)
	}

	var payload map[string]string
	if err := json.Unmarshal(env.Payload, &payload); err != nil {
		t.Fatalf("Unmarshal payload: %v", err)
	}
	if payload["key"] != "value" {
		t.Errorf("payload key = %s, want value", payload["key"])
	}
}

func TestNewNilPayload(t *testing.T) {
	data, err := New("test:nil", nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	var env Envelope
	if err := json.Unmarshal(data, &env); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if env.Type != "test:nil" {
		t.Errorf("type = %s, want test:nil", env.Type)
	}
}

func TestParse(t *testing.T) {
	raw := `{"type":"room:create","payload":{"password":"secret"}}`
	env, err := Parse([]byte(raw))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if env.Type != "room:create" {
		t.Errorf("type = %s, want room:create", env.Type)
	}

	var payload RoomCreatePayload
	if err := json.Unmarshal(env.Payload, &payload); err != nil {
		t.Fatalf("Unmarshal payload: %v", err)
	}
	if payload.Password != "secret" {
		t.Errorf("password = %s, want secret", payload.Password)
	}
}

func TestParseInvalid(t *testing.T) {
	_, err := Parse([]byte("not json"))
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestParseNoPayload(t *testing.T) {
	raw := `{"type":"room:list"}`
	env, err := Parse([]byte(raw))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if env.Type != "room:list" {
		t.Errorf("type = %s, want room:list", env.Type)
	}
	if env.Payload != nil {
		t.Errorf("expected nil payload, got %s", string(env.Payload))
	}
}

func TestValidCategory(t *testing.T) {
	validCats := []string{
		"ones", "twos", "threes", "fours", "fives", "sixes",
		"choice", "fourOfAKind", "fullHouse",
		"smallStraight", "largeStraight", "yacht",
	}
	for _, cat := range validCats {
		if !ValidCategory(cat) {
			t.Errorf("ValidCategory(%s) = false, want true", cat)
		}
	}
}

func TestValidCategoryInvalid(t *testing.T) {
	invalidCats := []string{"", "invalid", "ONES", "yahtzee", "bonus", "total"}
	for _, cat := range invalidCats {
		if ValidCategory(cat) {
			t.Errorf("ValidCategory(%s) = true, want false", cat)
		}
	}
}

func TestValidEmojis(t *testing.T) {
	emojis := ValidEmojis()
	if len(emojis) == 0 {
		t.Fatal("expected non-empty emoji set")
	}

	// Check that thumbs up is in the set
	if !emojis["\U0001F44D"] {
		t.Error("expected thumbs up emoji to be valid")
	}

	// Check that a random string is not in the set
	if emojis["notanemoji"] {
		t.Error("expected 'notanemoji' to not be valid")
	}
}

func TestValidEmojisReturnsCopy(t *testing.T) {
	emojis1 := ValidEmojis()
	emojis2 := ValidEmojis()

	// Modifying one should not affect the other
	emojis1["test"] = true
	if emojis2["test"] {
		t.Error("ValidEmojis should return a copy")
	}
}

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

func TestNewRoundTrip(t *testing.T) {
	// Create a message, serialize it, parse it back
	original := ConnectedPayload{PlayerID: "abc123", Token: "abc123:deadbeef"}
	data, err := New("connected", original)
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	env, err := Parse(data)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if env.Type != "connected" {
		t.Errorf("type = %s, want connected", env.Type)
	}

	var parsed ConnectedPayload
	if err := json.Unmarshal(env.Payload, &parsed); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if parsed.PlayerID != "abc123" {
		t.Errorf("playerID = %s, want abc123", parsed.PlayerID)
	}
	if parsed.Token != "abc123:deadbeef" {
		t.Errorf("token = %s, want abc123:deadbeef", parsed.Token)
	}
}
