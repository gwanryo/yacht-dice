# Disconnect Detection & Voluntary Leave Design

## Overview

Two related features for handling player absence during gameplay:

1. **Disconnect detection**: When a player's connection drops, notify others and pause the game when it's the disconnected player's turn. Show a countdown timer until auto-removal.
2. **Voluntary leave**: A leave button allowing players to exit mid-game, preserving their current score for rankings.

## Decisions

| Decision | Choice |
|----------|--------|
| Pause behavior | Pause only on disconnected player's turn |
| Score handling | Sum only filled categories (unfilled ignored) |
| Turn order | Remove left player entirely from rotation |
| Timeout treatment | Same as voluntary leave (score preserved, removed from turns) |
| Leave button location | Top-left header, left of round indicator |
| Implementation approach | Server-centric (server manages all state) |

## Message Protocol

### New Messages

| Direction | Type | Payload | Description |
|-----------|------|---------|-------------|
| S→C | `game:paused` | `{ playerId, nickname, expiresAt }` | Disconnected player's turn reached, game paused. `expiresAt` is Unix ms timestamp. |
| S→C | `game:resumed` | `{ playerId }` | Disconnected player reconnected, game resumes |
| C→S | `game:leave` | `{}` | Voluntary mid-game leave request (distinct from existing `room:leave` which is for waiting room) |

### Existing Message Changes

- **`player:left`**: Already exists with `{ playerId }`. Expand payload to `{ playerId, nickname, reason }`. `reason`: `"voluntary"`, `"timeout"`, or `"normal"` (existing waiting-room leave, for backward compat). All existing handlers already use `playerId` so the added fields are additive and non-breaking.
- **`game:end`** rankings: add `leftEarly: boolean` field to `RankEntry` struct (Go) and TypeScript interface.
- **`game:sync`**: add `pausedFor: { playerId, nickname, expiresAt } | null` field for reconnecting players to see active pause state. `expiresAt` is Unix ms timestamp.

### Flow: Disconnect → Turn Reached → Pause

```
Player B disconnects
  → S→C: player:disconnected { playerId: B }
  → Existing disconnect timer is NOT started (deferred to pause)
Player A finishes turn, next is B
  → S→C: game:paused { playerId: B, nickname: "Bob", expiresAt: 1711540860000 }
  → Pause timer starts (60s from now)
Player B reconnects
  → Cancel pause timer
  → S→C: game:resumed { playerId: B }
  → Normal turn proceeds
```

### Flow: Disconnect → Timeout

```
60s elapsed, B did not return
  → S→C: player:left { playerId: B, nickname: "Bob", reason: "timeout" }
  → B's filled scores preserved in engine.leftPlayers
  → B removed from turn order
  → S→C: game:turn { currentPlayer: C, round: ... }
```

### Flow: Voluntary Leave

```
Player B clicks leave → confirms dialog
  → C→S: game:leave {}
  → Server snapshots B's scores into engine.leftPlayers
  → Server removes B from playerOrder
  → S→C: player:left { playerId: B, nickname: "Bob", reason: "voluntary" }
  → If B's turn: advance to next player
  → Next turn proceeds
```

### Flow: Leaving Player's Own Client

```
After sending game:leave:
  → Server sends player:left to ALL including the leaver
  → Leaver's client transitions to lobby phase
  → Server closes WebSocket for the leaver
  → URL room code parameter is cleared
```

## Server Logic

### Timer Strategy: Single Pause Timer (replaces existing disconnect timer during game)

The existing `handleDisconnect` sets a 60s disconnect timer immediately. This conflicts with the pause-on-turn design. Change:

- **During game (`StatusPlaying`)**: Do NOT start disconnect timer on disconnect. Instead, mark the player as disconnected (`conn == nil`). The timer starts only when the disconnected player's turn arrives (via `game:paused`). If the player is already on their turn when they disconnect, start the pause timer immediately.
- **During waiting/result**: Keep existing 30s disconnect timer behavior unchanged.

This ensures exactly one timer governs the disconnected player's fate during gameplay.

### Turn Advance with Disconnect Check (room.go)

When a turn ends and the next player is determined:

- **Connected** → send `game:turn` as usual
- **Disconnected** → send `game:paused` with `expiresAt` (now + 60s), start single pause timer
  - On reconnect → cancel timer, send `game:resumed`, proceed with turn
  - On timeout → treat as leave (preserve scores, remove from turn order, advance to next connected player)
  - On next player also disconnected (cascading) → immediately start new `game:paused` for that player. Each disconnected player gets their own 60s window.

### Voluntary Leave Handler (new handler in ws.go + engine.go)

New message case `game:leave` in `handleMessage` (ws.go):

1. Verify game is in `StatusPlaying`
2. Call `engine.RetirePlayer(playerID)`:
   - Copy player's current scores to `engine.leftPlayers` map (new field)
   - Remove from `playerOrder`
   - Return whether it was this player's turn
3. Broadcast `player:left { reason: "voluntary" }` to all (including leaver)
4. If it was the leaving player's turn → advance to next player with `game:turn`
5. If 1 active player remains → compute rankings via `Rankings()` (which now includes leftPlayers), send `game:end`
6. If 0 active players remain (solo) → clean up room, no rankings
7. Close leaver's WebSocket connection, remove from hub

### Rankings (engine.go)

New field: `engine.leftPlayers map[string]map[string]int` — maps playerID → category → score for retired players.

`Rankings()` changes:
- Iterate both `playerOrder` (active) and `leftPlayers` (retired)
- For leftPlayers: sum only filled categories. Upper bonus uses standard threshold (>= 63) on whatever upper categories were filled — no proration.
- Add `LeftEarly: true` to `RankEntry` for retired players
- `RankEntry` struct gains `LeftEarly bool \`json:"leftEarly"\``
- Rank all players together by total score

### Non-Turn Disconnect Behavior

If Player B disconnects but it's Player A's turn:

- Game continues normally for A
- A sees B's disconnected status indicator (existing `player:disconnected`)
- No timer starts yet — timer starts only when B's turn arrives
- When B's turn arrives, `game:paused` triggers

### `game:leave` vs `room:leave`

- `room:leave` — existing message for leaving the waiting room. Unchanged.
- `game:leave` — new message for leaving mid-game. Only valid when game status is `StatusPlaying`.
- Handler dispatch in ws.go must route to different functions based on message type.

## Client UI

### 3-1. Disconnected Player Indicator (ScoreBoard)

- Warning icon `⚠` next to disconnected player's nickname
- Semi-transparent styling on their column
- Appears immediately on `player:disconnected`, removed on reconnect or `player:left`
- State: add `disconnectedPlayers: Set<string>` to game state reducer

### 3-2. Game Paused Overlay

Centered overlay on `game:paused`:

- Semi-transparent dark backdrop over game screen
- Player name + "연결이 끊겼습니다" message
- "재연결 대기 중..." subtitle
- Countdown timer derived from `expiresAt` timestamp (use `Date.now()` delta for accuracy)
- Progress bar showing elapsed/remaining proportion
- Dismissed on `game:resumed` or `player:left`

State: `pausedFor: { playerId, nickname, expiresAt } | null` in game state reducer.

### 3-3. Leave Button

Position: top-left of header bar, left of round indicator.

```
[←] 라운드 3/12        내 턴!        남은 굴림: 2
```

- Small `←` icon button, minimum 44x44px touch target
- On click: ConfirmDialog (reuse existing component)
  - Title: "정말로 나가시겠습니까?"
  - Body: "현재까지의 점수만 인정되며 게임에 복귀할 수 없습니다."
  - Actions: [취소] [나가기 (red/destructive)]

### 3-4. Leave Toast Notification

On `player:left` (for OTHER players, not self), show temporary toast:

- Voluntary: "{nickname}님이 게임을 나갔습니다"
- Timeout: "{nickname}님의 연결이 끊겨 퇴장되었습니다"
- Auto-dismiss after 3 seconds
- State: add `toasts: Array<{ id, message, timestamp }>` to game state, or use a lightweight toast queue

### 3-5. Leaving Player's Own Client

On receiving `player:left` where `playerId === myId`:

- Transition to lobby phase (reset game state)
- Clear room code from URL
- No toast needed for self

### 3-6. Result Screen Rankings

Left-early players shown with label:

```
1st  Alice    285pts
2nd  Charlie  210pts
3rd  Bob      120pts  (중도 퇴장)
```

- "(중도 퇴장)" in gray text next to score, driven by `leftEarly` field in ranking data
- No distinction between voluntary and timeout in results

## i18n Keys

New translation keys needed:

- `game.paused.title`: "{{name}}님의 연결이 끊겼습니다"
- `game.paused.subtitle`: "재연결 대기 중..."
- `game.paused.remaining`: "{{seconds}}초 남음"
- `game.leave.confirm.title`: "정말로 나가시겠습니까?"
- `game.leave.confirm.body`: "현재까지의 점수만 인정되며 게임에 복귀할 수 없습니다."
- `game.leave.confirm.cancel`: "취소"
- `game.leave.confirm.leave`: "나가기"
- `game.leave.toast.voluntary`: "{{name}}님이 게임을 나갔습니다"
- `game.leave.toast.timeout`: "{{name}}님의 연결이 끊겨 퇴장되었습니다"
- `game.result.leftEarly`: "중도 퇴장"

## Edge Cases

- **All players disconnect**: No pause timer starts until someone's turn arrives. If all are disconnected, the game is effectively frozen. Existing room empty-check timer (30s) handles cleanup if all WebSockets close.
- **Cascading disconnects (multiple players offline)**: Each disconnected player gets their own 60s pause when their turn arrives. If A, B, C are disconnected and only D is online, turns cycle through pauses: pause for A (60s) → timeout → pause for B (60s) → timeout → D plays alone or game ends.
- **Leave during pause**: If a connected player clicks leave while game is paused for someone else, process their leave normally. If this leaves only the disconnected player, end game (disconnected player gets leftEarly ranking).
- **Solo player leaves**: Room destruction, transition to lobby. No rankings computed.
- **Player leaves on their own turn mid-roll**: Their filled scores are preserved as-is, advance to next player.
- **Last two players, one leaves**: Game ends immediately with rankings. Remaining player wins.
- **Player disconnects ON their turn**: `game:paused` fires immediately (not deferred to next turn cycle).
- **Upper bonus for left players**: Standard threshold (>= 63 from filled upper categories). No proration. If they filled enough to qualify, they get the bonus.
