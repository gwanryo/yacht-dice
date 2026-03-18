# Game UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve multiplayer UX with real-time hold/hover broadcasting, fullscreen 3D background, dice tray, score preview, and turn indicators.

**Architecture:** Server-authoritative game state (Go) with WebSocket broadcast. Client is React+Tailwind with Three.js+cannon-es for 3D dice. iframe removed — Three.js canvas becomes fullscreen background, all UI overlaid. New message types: `game:hold`, `game:held`, `game:hover`, `game:hovered`. Score preview computed server-side and included in `game:rolled`.

**Tech Stack:** Go 1.22 (server), React 19, TypeScript, Tailwind CSS 4, Three.js 0.162, cannon-es 0.20, Vite 8

**Spec:** `docs/superpowers/specs/2026-03-18-game-ux-improvements-design.md`

---

## Task 1: Server — Engine Hold + Roll refactor

**Files:**
- Modify: `server/game/engine.go`
- Modify: `server/game/engine_test.go`
- Modify: `server/message/message.go`

- [ ] **Step 1: Update message.go with new types and error code**

Add to `server/message/message.go`:

```go
// After existing error codes
const ErrInvalidIndex = "INVALID_INDEX"

// Delete GameRollPayload entirely (no longer needed)

// New payloads
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
```

Also add `Preview` field to `GameRolledPayload`:
```go
type GameRolledPayload struct {
	Dice      [5]int         `json:"dice"`
	Held      [5]bool        `json:"held"`
	RollCount int            `json:"rollCount"`
	Preview   map[string]int `json:"preview"`
}
```

And to `GameSyncPayload`:
```go
Preview map[string]int `json:"preview"`
```

- [ ] **Step 2: Write failing tests for Engine.Hold()**

Add to `server/game/engine_test.go`:

```go
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd server && go test ./game/ -run 'TestHold' -v`
Expected: compilation error — `Hold` method not defined, `Roll` signature changed.

- [ ] **Step 4: Implement Engine.Hold() and refactor Roll()**

In `server/game/engine.go`:

Change `Roll` signature — remove `held []int` parameter:
```go
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
```

Add `Hold` method:
```go
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
```

- [ ] **Step 5: Update existing engine tests for new Roll signature**

In `server/game/engine_test.go`, change all `e.Roll("p1", []int{})` to `e.Roll("p1")` and all `e.Roll("p1", []int{0, 1})` etc. to first call `Roll` then `Hold` separately:

- `TestRoll`: `e.Roll("p1")` (no second arg)
- `TestRollWrongPlayer`: `e.Roll("p2")` (no second arg)
- `TestRollFirstMustBeEmpty`: remove this test (holding is now separate)
- `TestRollMax3`: call `e.Roll("p1")` three times (no held args), then test 4th fails
- `TestScoreAndAdvance`: `e.Roll("p1")` (no second arg)
- `TestScoreDuplicate`: all `e.Roll(...)` without second arg
- `TestGameEnd`: all `e.Roll(pid)` without second arg
- `TestHeld`: replace with new hold-based test:

```go
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
```

- [ ] **Step 6: Run all engine tests**

Run: `cd server && go test ./game/ -v`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add server/game/engine.go server/game/engine_test.go server/message/message.go
git commit -m "feat(server): add Hold method, remove held from Roll, add new message types"
```

---

## Task 2: Server — Engine Preview

**Files:**
- Modify: `server/game/engine.go`
- Modify: `server/game/engine_test.go`

- [ ] **Step 1: Write failing test for Preview**

Add to `server/game/engine_test.go`:

```go
func TestPreview(t *testing.T) {
	e := NewEngine([]string{"p1", "p2"})
	e.Roll("p1")
	preview := e.Preview("p1")
	// All 12 categories should have preview values
	if len(preview) != 12 {
		t.Errorf("preview categories = %d, want 12", len(preview))
	}
	// choice should equal sum of dice
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
	// p2's turn now
	e.Roll("p2")
	e.Score("p2", "choice")
	// p1's turn again
	e.Roll("p1")
	preview := e.Preview("p1")
	if _, ok := preview["choice"]; ok {
		t.Error("choice should not be in preview after scoring")
	}
	if len(preview) != 11 {
		t.Errorf("preview categories = %d, want 11", len(preview))
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && go test ./game/ -run 'TestPreview' -v`
Expected: FAIL — `Preview` method not defined

- [ ] **Step 3: Implement Preview**

Add to `server/game/engine.go`:

```go
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
```

- [ ] **Step 4: Run tests**

Run: `cd server && go test ./game/ -run 'TestPreview' -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add server/game/engine.go server/game/engine_test.go
git commit -m "feat(server): add Preview method for score calculation"
```

---

## Task 3: Server — Room + WS Handler updates

**Files:**
- Modify: `server/room/room.go`
- Modify: `server/handler/ws.go`

- [ ] **Step 1: Add Room methods (Hold, Roll refactor, RollResult, TurnInfo extension)**

In `server/room/room.go`:

Add `RollResult` struct and atomic `Roll` method:
```go
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
```

Add `Hold` method:
```go
func (r *Room) Hold(playerID string, index int) ([5]bool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.engine == nil {
		return [5]bool{}, fmt.Errorf("no game in progress")
	}
	return r.engine.Hold(playerID, index)
}
```

Extend `TurnInfo` to return rollCount:
```go
func (r *Room) TurnInfo() (currentPlayer string, round int, rollCount int, ok bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if r.engine == nil {
		return "", 0, 0, false
	}
	return r.engine.CurrentPlayer(), r.engine.Round(), r.engine.RollCount(), true
}
```

Update `SyncPayload` to include Preview:
```go
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
```

- [ ] **Step 2: Update WS Handler — handleRoll, add handleHold and handleHover**

In `server/handler/ws.go`:

Add to `handleMessage` switch:
```go
case "game:hold":
	wh.handleHold(p, env.Payload)
case "game:hover":
	wh.handleHover(p, env.Payload)
```

Update `handleRoll` to use atomic `RollResult`:
```go
func (wh *WSHandler) handleRoll(p *player.Player, payload json.RawMessage) {
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
```

Add `handleHold`:
```go
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
```

Add `handleHover` with rollCount validation:
```go
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
```

Update `broadcastTurn` for new TurnInfo signature:
```go
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
```

Also update `handleScore` to use new `Room.Roll` → `Room.Score` still returns `ScoreResult` (unchanged).

- [ ] **Step 3: Verify full server compiles**

Run: `cd server && go build ./...`
Expected: SUCCESS

- [ ] **Step 4: Run all server tests**

Run: `cd server && go test ./... -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add server/room/room.go server/handler/ws.go
git commit -m "feat(server): add hold/hover handlers, atomic roll result, preview in rolled"
```

---

## Task 4: Client — Type definitions + State management

**Files:**
- Modify: `client/src/types/game.ts`
- Modify: `client/src/hooks/useGameState.ts`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Update TypeScript types**

In `client/src/types/game.ts`:

Update `GameRolledPayload`:
```typescript
export interface GameRolledPayload {
  dice: number[];
  held: boolean[];
  rollCount: number;
  preview: Record<string, number>;
}
```

Add new payload types:
```typescript
export interface GameHeldPayload {
  held: boolean[];
  playerId: string;
}

export interface GameHoveredPayload {
  category: string | null;
  playerId: string;
}
```

Update `GameSyncPayload` — add preview:
```typescript
export interface GameSyncPayload {
  dice: number[];
  held: boolean[];
  rollCount: number;
  scores: Record<string, Record<string, number>>;
  currentPlayer: string;
  round: number;
  preview: Record<string, number>;
}
```

- [ ] **Step 2: Update useGameState**

In `client/src/hooks/useGameState.ts`:

Add `preview` and `hoveredCategory` to `GameState`:
```typescript
export interface GameState {
  // ... existing fields ...
  preview: Record<string, number>;
  hoveredCategory: { category: string | null; playerId: string } | null;
}
```

Update `initialState`:
```typescript
preview: {},
hoveredCategory: null,
```

Update action types — remove `TOGGLE_HOLD`, add new actions, update `GAME_ROLLED` and `GAME_SYNC` with preview:

```typescript
export type GameAction =
  | { type: 'SET_NICKNAME'; nickname: string }
  | { type: 'SET_PHASE'; phase: GamePhase }
  | { type: 'SET_ROOM'; roomCode: string }
  | { type: 'SET_PLAYERS'; players: PlayerInfo[] }
  | { type: 'SET_ROOM_LIST'; list: RoomListItem[] }
  | { type: 'GAME_ROLLED'; dice: number[]; held: boolean[]; rollCount: number; preview: Record<string, number> }
  | { type: 'GAME_HELD'; held: boolean[] }
  | { type: 'SET_TURN'; currentPlayer: string; round: number }
  | { type: 'SET_SCORES'; scores: Record<string, Record<string, number>> }
  | { type: 'GAME_END'; rankings: RankEntry[] }
  | { type: 'GAME_SYNC'; dice: number[]; held: boolean[]; rollCount: number; scores: Record<string, Record<string, number>>; currentPlayer: string; round: number; preview: Record<string, number> }
  | { type: 'ADD_REACTION'; playerId: string; emoji: string }
  | { type: 'CLEAR_REACTION'; id: string }
  | { type: 'SET_HOVERED'; category: string | null; playerId: string }
  | { type: 'RESET_GAME' };
```

Note: `TOGGLE_HOLD` removed, `SET_PREVIEW` not needed (preview comes through GAME_ROLLED/GAME_SYNC).

Update reducer cases:
- Remove `TOGGLE_HOLD` case
- Add `GAME_HELD` case: `return { ...state, held: action.held };`
- Add `SET_HOVERED` case: `return { ...state, hoveredCategory: { category: action.category, playerId: action.playerId } };`
- Update `GAME_ROLLED` case: `return { ...state, dice: action.dice, rollCount: action.rollCount, held: action.held ?? [false,false,false,false,false], preview: action.preview ?? {} };`
- Update `GAME_SYNC` case: add `preview: action.preview ?? {}` to returned state
- Update `SET_TURN` case: add `preview: {}, hoveredCategory: null` to returned state

- [ ] **Step 3: Update App.tsx handlers**

In `client/src/App.tsx`:

Add imports for new payload types:
```typescript
import type {
  RoomState, GameRolledPayload, GameScoredPayload,
  GameTurnPayload, GameSyncPayload, GameEndPayload,
  ReactionShowPayload, GameHeldPayload, GameHoveredPayload,
} from './types/game';
```

Add new handlers in the `useEffect`:
```typescript
ws.on('game:held', (env) => {
  const p = env.payload as GameHeldPayload;
  dispatch({ type: 'GAME_HELD', held: p.held });
}),
ws.on('game:hovered', (env) => {
  const p = env.payload as GameHoveredPayload;
  dispatch({ type: 'SET_HOVERED', category: p.category, playerId: p.playerId });
}),
```

Update `game:rolled` handler to include preview:
```typescript
ws.on('game:rolled', (env) => {
  const p = env.payload as GameRolledPayload;
  dispatch({ type: 'GAME_ROLLED', dice: p.dice, held: p.held, rollCount: p.rollCount, preview: p.preview });
}),
```

- [ ] **Step 4: Verify client compiles**

Run: `cd client && npx tsc --noEmit`
Expected: May have errors in GamePage.tsx (TOGGLE_HOLD removed) — expected, will fix in later tasks.

- [ ] **Step 5: Commit**

```bash
git add client/src/types/game.ts client/src/hooks/useGameState.ts client/src/App.tsx
git commit -m "feat(client): update types and state for hold/hover/preview"
```

---

## Task 5: Client — Install Three.js + cannon-es dependencies

**Files:**
- Modify: `client/package.json`

- [ ] **Step 1: Install Three.js and cannon-es**

Run: `cd client && npm install three cannon-es && npm install -D @types/three`

- [ ] **Step 2: Verify install**

Run: `cd client && npx tsc --noEmit 2>&1 | head -5`
Expected: TypeScript recognizes three and cannon-es imports (errors should only be from removed TOGGLE_HOLD, not from missing modules).

- [ ] **Step 3: Commit**

```bash
git add client/package.json client/package-lock.json
git commit -m "chore: add three.js and cannon-es dependencies"
```

---

## Task 6: Client — DiceScene component

**Files:**
- Create: `client/src/components/DiceScene.tsx`

This is the largest task. Port the entire `dice3d.html` Three.js scene into a React component.

**Reference:** `client/public/dice3d.html` — the complete Three.js+cannon-es scene (877 lines). Use @threejs-fundamentals, @threejs-geometry, @threejs-materials, @threejs-lighting, @threejs-animation skills.

- [ ] **Step 1: Create DiceScene.tsx**

Create `client/src/components/DiceScene.tsx`. This component:

1. Renders a single `<canvas>` element with `position: fixed; inset: 0; z-index: 0`
2. On mount (`useEffect`), initializes the full Three.js scene from `dice3d.html`:
   - Scene, camera, renderer (attach to canvas ref)
   - OrbitControls
   - Lighting (ambient, directional, spot)
   - Table (felt + rails)
   - Dice meshes (5 dice with pip textures)
   - Cup (outer, inner, bottom, rim, bands)
   - Physics world (cannon-es: ground, walls, dice bodies, cup body)
   - State machine (IDLE, COLLECT, SHAKE, ROLL, SETTLE, PRESENT, RESULT)
   - All animation functions (updateCollect, updateShake, updateRoll, updateSettle, updatePresent)
   - Camera animations
   - Animation loop (requestAnimationFrame)
3. Exposes `DiceSceneAPI` via `useImperativeHandle`:
   ```typescript
   export interface DiceSceneAPI {
     setValues(v: number[]): void;
     setHeld(h: boolean[]): void;
     shake(): void;
     roll(): void;
     onResult(cb: (values: number[]) => void): void;
   }
   ```
4. On unmount, disposes renderer, geometries, materials, textures, removes physics bodies.

**Key differences from dice3d.html:**
- No `#ui-panel` (UI is separate React components)
- No `inputs` or `getVals()` — values set via API
- No embedded detection — always fullscreen
- Uses React ref instead of `document.getElementById`
- Cleanup on unmount

**Implementation approach:** Extract the scene setup into a factory function that takes a canvas element and returns the API + cleanup function. Keep the code structure as close to `dice3d.html` as possible to minimize bugs during port.

```typescript
import { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';

export interface DiceSceneAPI {
  setValues(v: number[]): void;
  setHeld(h: boolean[]): void;
  shake(): void;
  roll(): void;
  onResult(cb: (values: number[]) => void): void;
}

const DiceScene = forwardRef<DiceSceneAPI>(function DiceScene(_, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const apiRef = useRef<DiceSceneAPI | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { api, cleanup } = createDiceScene(canvas);
    apiRef.current = api;
    cleanupRef.current = cleanup;

    return () => {
      cleanup();
      apiRef.current = null;
      cleanupRef.current = null;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    setValues(v) { apiRef.current?.setValues(v); },
    setHeld(h) { apiRef.current?.setHeld(h); },
    shake() { apiRef.current?.shake(); },
    roll() { apiRef.current?.roll(); },
    onResult(cb) { apiRef.current?.onResult(cb); },
  }));

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full"
      style={{ zIndex: 0 }}
    />
  );
});

export default DiceScene;
```

The `createDiceScene(canvas)` function contains the full port of `dice3d.html`'s `<script>` block, adapted to:
- Use the passed canvas element for the renderer
- Return `{ api: DiceSceneAPI, cleanup: () => void }`
- Not create any DOM elements (no inputs, no buttons)
- Handle window resize

This function is long (~700 lines) — a direct port of the existing code.

- [ ] **Step 2: Verify it compiles**

Run: `cd client && npx tsc --noEmit 2>&1 | grep DiceScene`
Expected: No errors from DiceScene.tsx

- [ ] **Step 3: Commit**

```bash
git add client/src/components/DiceScene.tsx
git commit -m "feat(client): add DiceScene component (Three.js fullscreen)"
```

---

## Task 7: Client — DiceTray component

**Files:**
- Create: `client/src/components/DiceTray.tsx`

- [ ] **Step 1: Create DiceTray.tsx**

```typescript
import { useTranslation } from 'react-i18next';

interface Props {
  dice: number[];
  held: boolean[];
  rollCount: number;
  isMyTurn: boolean;
  onHold: (index: number) => void;
}

export default function DiceTray({ dice, held, rollCount, isMyTurn, onHold }: Props) {
  const { t } = useTranslation();
  const canInteract = isMyTurn && rollCount > 0;

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Dice result buttons */}
      {rollCount > 0 && dice.length === 5 && (
        <div className="flex gap-3">
          {dice.map((d, i) => (
            <button
              key={i}
              onClick={() => canInteract && !held[i] && onHold(i)}
              disabled={!canInteract || held[i]}
              aria-label={`Dice ${i + 1}: ${d}${held[i] ? ' (held)' : ''}`}
              className={`w-12 h-12 rounded-lg text-lg font-bold transition-all duration-300 ${
                held[i]
                  ? 'opacity-30 scale-75'
                  : canInteract
                    ? 'bg-white/20 text-white hover:bg-white/30 backdrop-blur cursor-pointer'
                    : 'bg-white/10 text-white/60'
              }`}
            >
              {held[i] ? '' : d}
            </button>
          ))}
        </div>
      )}

      {/* Tray */}
      <div
        className="flex gap-2.5 justify-center px-4 py-3 rounded-xl"
        style={{
          background: 'linear-gradient(135deg, #3d2b1f, #5c4033)',
          border: '2px solid #7c5e4a',
          boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.3)',
        }}
      >
        {Array.from({ length: 5 }).map((_, i) => {
          const heldIndex = dice.findIndex((_, di) => held[di] && getHeldSlot(held, di) === i);
          const heldValue = heldIndex >= 0 ? dice[heldIndex] : null;

          return (
            <button
              key={i}
              onClick={() => {
                if (heldValue !== null && canInteract) {
                  onHold(heldIndex);
                }
              }}
              disabled={!canInteract || heldValue === null}
              className={`w-11 h-11 rounded-lg flex items-center justify-center font-bold text-lg transition-all duration-300 ${
                heldValue !== null
                  ? 'bg-white text-gray-900 shadow-md cursor-pointer hover:scale-105'
                  : 'bg-white/10 border-2 border-dashed border-white/20'
              }`}
            >
              {heldValue}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Map held dice to tray slot indices (fill left to right). */
function getHeldSlot(held: boolean[], diceIndex: number): number {
  let slot = 0;
  for (let i = 0; i < diceIndex; i++) {
    if (held[i]) slot++;
  }
  return slot;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd client && npx tsc --noEmit 2>&1 | grep DiceTray`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add client/src/components/DiceTray.tsx
git commit -m "feat(client): add DiceTray component with wood tray style"
```

---

## Task 8: Client — ScoreBoard redesign

**Files:**
- Modify: `client/src/components/ScoreBoard.tsx`

- [ ] **Step 1: Update ScoreBoard with preview, hover, and improved design**

Rewrite `client/src/components/ScoreBoard.tsx`:

```typescript
import { useTranslation } from 'react-i18next';
import { UPPER_CATEGORIES, LOWER_CATEGORIES, type Category, type PlayerInfo } from '../types/game';

interface Props {
  players: PlayerInfo[];
  scores: Record<string, Record<string, number>>;
  currentPlayer: string | null;
  myId: string | null;
  rollCount: number;
  preview: Record<string, number>;
  hoveredCategory: { category: string | null; playerId: string } | null;
  onSelectCategory?: (category: Category) => void;
  onHoverCategory?: (category: string | null) => void;
}

function upperSum(playerScores: Record<string, number>): number {
  return UPPER_CATEGORIES.reduce((sum, cat) => sum + (playerScores[cat] ?? 0), 0);
}

function total(playerScores: Record<string, number>): number {
  const sum = Object.values(playerScores).reduce((a, b) => a + b, 0);
  const bonus = upperSum(playerScores) >= 63 ? 35 : 0;
  return sum + bonus;
}

export default function ScoreBoard({
  players, scores, currentPlayer, myId, rollCount,
  preview, hoveredCategory, onSelectCategory, onHoverCategory,
}: Props) {
  const { t } = useTranslation();
  const isMyTurn = currentPlayer === myId;
  const myScores = myId ? (scores[myId] ?? {}) : {};

  const renderRow = (cat: Category) => {
    const canSelect = isMyTurn && rollCount > 0 && myScores[cat] === undefined;
    const previewScore = preview[cat];
    const isHovered = hoveredCategory?.category === cat;
    const isOtherHover = isHovered && hoveredCategory?.playerId !== myId;
    const isMyHover = isHovered && hoveredCategory?.playerId === myId;

    return (
      <tr
        key={cat}
        className={`transition-colors ${
          isMyHover ? 'bg-yellow-500/20' :
          isOtherHover ? 'bg-blue-500/10' :
          canSelect ? 'hover:bg-yellow-500/15' : ''
        }`}
        onMouseEnter={() => canSelect && onHoverCategory?.(cat)}
        onMouseLeave={() => canSelect && onHoverCategory?.(null)}
      >
        <td className={`px-2 py-1.5 text-sm font-medium ${
          canSelect ? 'text-yellow-300' : 'text-gray-400'
        }`}>
          {canSelect ? (
            <button
              onClick={() => onSelectCategory?.(cat)}
              className="w-full text-left text-yellow-300 hover:text-yellow-100 font-semibold focus-visible:ring-2 focus-visible:ring-yellow-400 rounded px-1 -mx-1"
            >
              {t(`categories.${cat}`)}
            </button>
          ) : (
            t(`categories.${cat}`)
          )}
        </td>
        {players.map(p => {
          const scored = scores[p.id]?.[cat];
          const isPreview = scored === undefined && p.id === currentPlayer && previewScore !== undefined;
          return (
            <td
              key={p.id}
              className={`px-2 py-1.5 text-center text-sm tabular-nums ${
                scored !== undefined
                  ? p.id === currentPlayer ? 'text-white font-bold' : 'text-gray-400'
                  : isPreview
                    ? previewScore === 0
                      ? 'text-yellow-500/15 italic'
                      : 'text-yellow-500/40 italic'
                    : 'text-gray-600'
              }`}
            >
              {scored !== undefined ? scored : isPreview ? previewScore : '-'}
            </td>
          );
        })}
      </tr>
    );
  };

  return (
    <div className="bg-black/50 backdrop-blur-md rounded-xl p-3 overflow-auto max-h-[80vh] border border-white/5">
      <table className="w-full border-collapse" aria-label={t('game.score')}>
        <thead>
          <tr>
            <th className="px-2 py-1 text-left text-xs text-gray-500">{t('game.score')}</th>
            {players.map(p => (
              <th key={p.id} className={`px-2 py-1 text-center text-xs transition-colors ${
                p.id === currentPlayer ? 'text-yellow-300 font-bold' : 'text-gray-500'
              }`}>
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
              <td key={p.id} className="px-2 py-1 text-center text-sm font-bold text-white tabular-nums">
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

- [ ] **Step 2: Verify it compiles**

Run: `cd client && npx tsc --noEmit 2>&1 | grep ScoreBoard`
Expected: No errors from ScoreBoard itself (GamePage may still have errors)

- [ ] **Step 3: Commit**

```bash
git add client/src/components/ScoreBoard.tsx
git commit -m "feat(client): redesign ScoreBoard with preview and hover support"
```

---

## Task 9: Client — GamePage rewrite (fullscreen 3D + overlay)

**Files:**
- Modify: `client/src/pages/GamePage.tsx`
- Delete: `client/src/components/DiceArea.tsx`

- [ ] **Step 1: Rewrite GamePage with fullscreen layout + turn indicator**

Rewrite `client/src/pages/GamePage.tsx`:

```typescript
import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import DiceScene from '../components/DiceScene';
import type { DiceSceneAPI } from '../components/DiceScene';
import DiceTray from '../components/DiceTray';
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
  const prevRollCountRef = useRef(state.rollCount);
  const sceneRef = useRef<DiceSceneAPI>(null);

  const handleShake = () => {
    if (!isMyTurn || state.rollCount >= 3) return;
    setRollPhase('shaking');
    send('game:roll');
  };

  const handleRoll = () => {
    if (rollPhase !== 'shaking') return;
    setRollPhase('rolling');
  };

  // Trigger animation when dice values arrive
  useEffect(() => {
    if (state.rollCount > prevRollCountRef.current && state.dice.length === 5) {
      const api = sceneRef.current;
      if (api) {
        api.setHeld(state.held);
        api.setValues(state.dice);
        if (isMyTurn) {
          api.shake();
          setRollPhase('shaking');
        } else {
          api.shake();
          setTimeout(() => {
            api.roll();
            setRollPhase('rolling');
          }, 1200);
        }
      }
    }
    prevRollCountRef.current = state.rollCount;
  }, [state.rollCount, state.dice, state.held, isMyTurn]);

  // Handle roll phase: when shaking -> user clicks Roll -> tell scene to roll
  useEffect(() => {
    if (rollPhase === 'rolling') {
      sceneRef.current?.roll();
    }
  }, [rollPhase]);

  // Reset rollPhase when turn changes
  useEffect(() => {
    setRollPhase('idle');
    prevRollCountRef.current = 0;
  }, [state.currentPlayer]);

  const handleSettled = useCallback(() => {
    setRollPhase('settled');
  }, []);

  // Register onResult callback
  useEffect(() => {
    sceneRef.current?.onResult(() => {
      handleSettled();
    });
  }, [handleSettled]);

  const handleScore = (category: Category) => {
    send('game:score', { category });
    setRollPhase('idle');
  };

  const handleHold = (index: number) => {
    send('game:hold', { index });
  };

  const handleHoverCategory = (category: string | null) => {
    send('game:hover', { category });
  };

  const handleReaction = (emoji: string) => {
    send('reaction:send', { emoji });
  };

  const currentNick = state.players.find(p => p.id === state.currentPlayer)?.nickname ?? '';

  return (
    <div className="fixed inset-0 overflow-hidden">
      {/* 3D Scene — fullscreen background */}
      <DiceScene ref={sceneRef} />

      {/* UI Overlay */}
      <div className="relative z-10 h-full flex flex-col pointer-events-none">
        {/* Top bar — turn indicator */}
        <div className={`pointer-events-auto flex justify-between items-center px-4 py-2.5 transition-all ${
          isMyTurn
            ? 'bg-gradient-to-r from-yellow-600/80 via-amber-500/80 to-yellow-600/80 shadow-lg shadow-yellow-500/20'
            : 'bg-black/40 backdrop-blur-sm'
        }`}>
          <span className="text-white font-bold tabular-nums">
            {t('game.round')} {state.round}/12
          </span>
          <span className={`text-sm font-bold ${isMyTurn ? 'text-white' : 'text-gray-300'}`} aria-live="polite">
            {isMyTurn ? t('game.yourTurn') : currentNick + t('game.waitingTurn')}
          </span>
          <span className="text-white/70 text-sm tabular-nums">
            {t('game.rollsLeft')}: {3 - state.rollCount}
          </span>
        </div>

        {/* Main area */}
        <div className="flex-1 flex">
          {/* Spacer for 3D scene */}
          <div className="flex-1" />

          {/* ScoreBoard — right sidebar */}
          <div className="pointer-events-auto lg:w-80 p-4">
            <ScoreBoard
              players={state.players}
              scores={state.scores}
              currentPlayer={state.currentPlayer}
              myId={playerId}
              rollCount={state.rollCount}
              preview={state.preview}
              hoveredCategory={state.hoveredCategory}
              onSelectCategory={isMyTurn && state.rollCount > 0 ? handleScore : undefined}
              onHoverCategory={isMyTurn && state.rollCount > 0 ? handleHoverCategory : undefined}
            />
          </div>
        </div>

        {/* Bottom area — dice tray + buttons */}
        <div className="pointer-events-auto flex flex-col items-center gap-3 pb-4">
          <DiceTray
            dice={state.dice}
            held={state.held}
            rollCount={state.rollCount}
            isMyTurn={isMyTurn}
            onHold={handleHold}
          />
          <div className="flex gap-4">
            {rollPhase === 'shaking' && isMyTurn && (
              <button onClick={handleRoll}
                className="px-8 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl text-lg transition-colors focus-visible:ring-2 focus-visible:ring-white shadow-lg">
                Roll!
              </button>
            )}
            {rollPhase !== 'shaking' && rollPhase !== 'rolling' && (
              <button onClick={handleShake}
                disabled={!isMyTurn || state.rollCount >= 3}
                className="px-8 py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white font-bold rounded-xl text-lg transition-colors focus-visible:ring-2 focus-visible:ring-white shadow-lg">
                {t('game.shake')}
                {state.rollCount > 0 && ` (${3 - state.rollCount})`}
              </button>
            )}
          </div>
          <ReactionBar
            onSend={handleReaction}
            reactions={state.reactions}
            onExpire={(id) => dispatch({ type: 'CLEAR_REACTION', id })}
            players={state.players}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Delete DiceArea.tsx**

Run: `rm client/src/components/DiceArea.tsx`

- [ ] **Step 3: Verify client compiles**

Run: `cd client && npx tsc --noEmit`
Expected: SUCCESS (or only warnings)

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/GamePage.tsx
git rm client/src/components/DiceArea.tsx
git commit -m "feat(client): fullscreen 3D layout with overlay UI and turn indicator"
```

---

## Task 10: Client — Update GamePage handleShake flow

The current flow sends `game:roll` immediately on shake, but the old code sent held indices. The new flow: shake triggers server roll (no held needed), server responds with `game:rolled` including dice+preview, then animation plays.

**Files:**
- Modify: `client/src/pages/GamePage.tsx` (if needed after Task 9)

- [ ] **Step 1: Verify the roll flow is correct**

Walk through the flow:
1. User clicks Shake → `send('game:roll')` (no payload needed)
2. Server rolls dice, broadcasts `game:rolled` with dice, held, rollCount, preview
3. `App.tsx` dispatches `GAME_ROLLED`
4. `GamePage` useEffect detects rollCount increase → triggers DiceScene shake+roll

If the flow from Task 9 is correct, no changes needed. Verify by reading the code.

- [ ] **Step 2: Run full client build**

Run: `cd client && npm run build`
Expected: SUCCESS

- [ ] **Step 3: Commit (if changes made)**

```bash
git add -A && git commit -m "fix(client): correct roll flow for server-authoritative held state"
```

---

## Task 11: Integration test — Manual

- [ ] **Step 1: Start server**

Run: `cd server && go run .`

- [ ] **Step 2: Start client dev server**

Run: `cd client && npm run dev`

- [ ] **Step 3: Open two browser tabs, test:**

1. Both join a room, start game
2. Player 1 rolls → both see dice animation
3. Player 1 clicks dice → tray receives dice, both players see hold state
4. Player 1 rolls again → held dice stay, unheld dice re-roll
5. Player 1 hovers scoreboard categories → other player sees hover highlight
6. Player 1 clicks a score category → score recorded, preview matches
7. Turn switches → turn indicator changes on both screens
8. 3D scene fills entire background, UI overlaid properly

- [ ] **Step 4: Fix any issues found**

- [ ] **Step 5: Final commit**

```bash
git add -A && git commit -m "fix: integration fixes for game UX improvements"
```
