package game

import (
	"crypto/rand"
	"errors"
	"math/big"
	"yacht-dice-server/message"
)

type Engine struct {
	playerOrder []string
	turnIdx     int
	round       int
	dice        [5]int
	held        [5]bool
	rollCount   int
	scores      map[string]map[string]int
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

func (e *Engine) Round() int       { return e.round }
func (e *Engine) RollCount() int   { return e.rollCount }
func (e *Engine) Dice() [5]int     { return e.dice }
func (e *Engine) Held() [5]bool    { return e.held }
func (e *Engine) IsFinished() bool { return e.finished }
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

func (e *Engine) Roll(playerID string) ([5]int, error) {
	if e.finished {
		return [5]int{}, errors.New("game is finished")
	}
	if playerID != e.CurrentPlayer() {
		return [5]int{}, errors.New(message.ErrNotYourTurn)
	}
	if e.rollCount >= 3 {
		return [5]int{}, errors.New(message.ErrInvalidRoll)
	}
	// First roll: reset held (no holding allowed on first roll)
	if e.rollCount == 0 {
		e.held = [5]bool{}
	}

	for i := 0; i < 5; i++ {
		if !e.held[i] {
			n, _ := rand.Int(rand.Reader, big.NewInt(6))
			e.dice[i] = int(n.Int64()) + 1
		}
	}

	e.rollCount++
	return e.dice, nil
}

func (e *Engine) Hold(playerID string, index int) ([5]bool, error) {
	if e.finished {
		return [5]bool{}, errors.New("game is finished")
	}
	if playerID != e.CurrentPlayer() {
		return [5]bool{}, errors.New(message.ErrNotYourTurn)
	}
	if e.rollCount == 0 {
		return [5]bool{}, errors.New(message.ErrInvalidRoll)
	}
	if index < 0 || index >= 5 {
		return [5]bool{}, errors.New(message.ErrInvalidIndex)
	}
	e.held[index] = !e.held[index]
	return e.held, nil
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
		if e.round > len(AllCategories()) {
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
			if e.round > len(AllCategories()) {
				e.finished = true
			}
		}
	} else if e.turnIdx > idx {
		e.turnIdx--
	}
}

func (e *Engine) Preview(playerID string) map[string]int {
	preview := make(map[string]int)
	playerScores := e.scores[playerID]
	if playerScores == nil {
		return preview
	}
	for _, cat := range categories {
		if _, scored := playerScores[cat]; !scored {
			preview[cat] = Calculate(e.dice, cat)
		}
	}
	return preview
}

func (e *Engine) Rankings() []message.RankEntry {
	type ps struct {
		id    string
		score int
	}
	var list []ps
	for _, pid := range e.playerOrder {
		if scores, ok := e.scores[pid]; ok {
			list = append(list, ps{pid, TotalScore(scores)})
		}
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
			PlayerID: p.id,
			Score:    p.score,
			Rank:     i + 1,
		}
	}
	return rankings
}
