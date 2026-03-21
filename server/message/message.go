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

// ValidCategory checks if the given string is a known scoring category.
func ValidCategory(cat string) bool {
	switch cat {
	case "ones", "twos", "threes", "fours", "fives", "sixes",
		"choice", "fourOfAKind", "fullHouse",
		"smallStraight", "largeStraight", "yacht":
		return true
	}
	return false
}

// validEmojis is the set of allowed reaction emojis.
var validEmojis = map[string]bool{
	"\U0001F44D": true, // 👍 thumbs up
	"\U0001F44E": true, // 👎 thumbs down
	"\U0001F44F": true, // 👏 clapping hands
	"\U0001F602": true, // 😂 face with tears of joy
	"\U0001F622": true, // 😢 crying face
	"\U0001F621": true, // 😡 pouting face
	"\U0001F60E": true, // 😎 smiling face with sunglasses
	"\U0001F631": true, // 😱 face screaming in fear
	"\U0001F389": true, // 🎉 party popper
	"\U0001F525": true, // 🔥 fire
	"\U0001F480": true, // 💀 skull
	"\U0001F62D": true, // 😭 loudly crying face
	"\U0001F4A9": true, // 💩 pile of poo
	"\U0001F914": true, // 🤔 thinking face
}

// ValidEmoji checks if the given string is an allowed reaction emoji.
func ValidEmoji(emoji string) bool {
	return validEmojis[emoji]
}

// ValidEmojis returns the set of allowed reaction emojis.
func ValidEmojis() map[string]bool {
	out := make(map[string]bool, len(validEmojis))
	for k, v := range validEmojis {
		out[k] = v
	}
	return out
}

// Error codes
const (
	ErrNotYourTurn    = "NOT_YOUR_TURN"
	ErrCategoryFilled = "CATEGORY_FILLED"
	ErrInvalidRoll    = "INVALID_ROLL"
	ErrRoomFull       = "ROOM_FULL"
	ErrWrongPassword  = "WRONG_PASSWORD"
	ErrRoomNotFound   = "ROOM_NOT_FOUND"
	ErrGameInProgress = "GAME_IN_PROGRESS"
	ErrInvalidPayload = "INVALID_PAYLOAD"
	ErrInvalidIndex   = "INVALID_INDEX"
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
type GameHoldPayload struct {
	Index int `json:"index"`
}
type GameHeldPayload struct {
	Held     [5]bool `json:"held"`
	PlayerID string  `json:"playerId"`
}
type GameHoverPayload struct {
	Category *string `json:"category"`
}
type GameHoveredPayload struct {
	Category *string `json:"category"`
	PlayerID string  `json:"playerId"`
}
type GameRolledPayload struct {
	Dice      [5]int         `json:"dice"`
	Held      [5]bool        `json:"held"`
	RollCount int            `json:"rollCount"`
	Preview   map[string]int `json:"preview"`
}
type GameScorePayload struct {
	Category string `json:"category"`
}
type GameScoredPayload struct {
	PlayerID    string                    `json:"playerId"`
	Category    string                    `json:"category"`
	Score       int                       `json:"score"`
	TotalScores map[string]map[string]int `json:"totalScores"`
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
	Preview       map[string]int            `json:"preview"`
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

// Payloads: Rematch
type RematchStatusPayload struct {
	Votes []string `json:"votes"`
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
	Token    string `json:"token"`
}
type PlayerEventPayload struct {
	PlayerID string `json:"playerId"`
}
type ErrorPayload struct {
	Message string `json:"message"`
	Code    string `json:"code"`
}
