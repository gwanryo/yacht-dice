# Game UX Improvements Design Spec

## Overview

Yacht Dice 게임의 멀티플레이어 경험과 UI를 개선하는 7가지 변경사항.

- 하위호환성 고려하지 않음 — 모든 변경은 breaking change로 적용

## 1. Hold 액션 실시간 브로드캐스트

### 현재 상태
- `TOGGLE_HOLD`는 클라이언트 로컬에서만 처리
- 다른 플레이어는 hold 상태를 볼 수 없음
- `game:roll` 시 held 인덱스를 서버에 보내지만 검증만 하고 결과의 held 필드로 반환

### 변경
- 새 메시지 `game:hold` (Client → Server): `{ index: number }` (0-4)
- 서버 검증: 현재 턴 플레이어인지, rollCount > 0인지
- 검증 통과 시 engine에서 held 상태 토글
- 새 메시지 `game:held` (Server → Broadcast): `{ held: [5]bool, playerId: string }`
- 클라이언트에서 `TOGGLE_HOLD` 로컬 dispatch 제거, 서버 응답(`game:held`)으로만 상태 변경

### `game:roll`에서 held 제거
- 서버가 이제 held 상태를 engine 내부에서 관리하므로, `GameRollPayload`에서 `Held []int` 필드 제거
- `Engine.Roll()`은 더 이상 held 파라미터를 받지 않고 내부 `e.held`를 사용
- `handleRoll`에서 held 재구성 로직 제거, `engine.Held()`로 대체

### Engine 변경
```go
func (e *Engine) Hold(playerID string, index int) ([5]bool, error)
```
- playerID != CurrentPlayer → ErrNotYourTurn
- rollCount == 0 → ErrInvalidRoll
- index < 0 || index >= 5 → ErrInvalidIndex (새 에러 코드)
- e.held[index] 토글 후 e.held 반환

```go
func (e *Engine) Roll(playerID string) ([5]int, error)
```
- 기존 `held []int` 파라미터 제거, 내부 `e.held` 사용

### 턴 전환 시 held 리셋
- `advanceTurn()`에서 `e.held = [5]bool{}`는 유지
- `game:turn` 메시지 수신 시 클라이언트가 held 상태를 리셋 (기존 `SET_TURN` reducer에서 이미 처리됨)
- 별도의 `game:held` 브로드캐스트 불필요 — `game:turn`이 암묵적 리셋

### Room 변경
```go
func (r *Room) Hold(playerID string, index int) ([5]bool, error)
func (r *Room) Roll(playerID string) ([5]int, int, error)  // held 파라미터 제거
```

### WS Handler
- `game:hold` 수신 → room.Hold() → `game:held` 브로드캐스트
- `handleRoll` 변경: held 파라미터 제거, engine.Held()로 대체

### 새 Payload 타입
```go
type GameHoldPayload struct {
    Index int `json:"index"`
}
type GameHeldPayload struct {
    Held     [5]bool `json:"held"`
    PlayerID string  `json:"playerId"`
}
```

### 새 에러 코드
```go
const ErrInvalidIndex = "INVALID_INDEX"
```

## 2. 점수판 호버 브로드캐스트

### 새 메시지
- `game:hover` (Client → Server): `{ category: string | null }`
  - null이면 호버 해제
- `game:hovered` (Server → Broadcast): `{ category: string | null, playerId: string }`

### 서버 검증
- 현재 턴 플레이어인지, rollCount > 0인지
- 검증 실패 시 무시 (에러 전송 불필요)
- 의도적으로 현재 턴 플레이어만 호버 브로드캐스트 — 상대방이 자기 점수판을 호버해도 전파되지 않음

### 클라이언트
- ScoreBoard에서 마우스 호버 시 `game:hover` 전송 (throttle 없음)
- 마우스가 점수판을 벗어나면 `game:hover` with null 전송
- 상대방의 hover 상태를 해당 행에 표시

### 새 Payload 타입
```go
type GameHoverPayload struct {
    Category *string `json:"category"` // nil이면 호버 해제
}
type GameHoveredPayload struct {
    Category *string `json:"category"`
    PlayerID string  `json:"playerId"`
}
```

## 3. 서버 주도 점수 미리보기

### GameRolledPayload 확장
```go
type GameRolledPayload struct {
    Dice      [5]int         `json:"dice"`
    Held      [5]bool        `json:"held"`
    RollCount int            `json:"rollCount"`
    Preview   map[string]int `json:"preview"`
}
```

### Preview 계산
- `engine.Preview(playerID)` 메서드 추가
- 해당 플레이어의 아직 선택되지 않은 카테고리에 대해 `Calculate(dice, category)` 호출
- 이미 선택된 카테고리는 preview에 포함하지 않음
- preview는 주사위 값에만 의존하므로 hold 변경 시 재계산/재전송 불필요

### 호출 시점
- `game:rolled` 브로드캐스트 시 현재 턴 플레이어의 preview 포함

### GameSyncPayload 확장
```go
type GameSyncPayload struct {
    Dice          [5]int                    `json:"dice"`
    Held          [5]bool                   `json:"held"`
    RollCount     int                       `json:"rollCount"`
    Scores        map[string]map[string]int `json:"scores"`
    CurrentPlayer string                    `json:"currentPlayer"`
    Round         int                       `json:"round"`
    Preview       map[string]int            `json:"preview"`
}
```
- 재접속 시: rollCount > 0이면 현재 턴 플레이어의 preview 포함, 아니면 빈 map

## 4. 전체화면 3D 배경 + UI 오버레이

### 현재 상태
- 3D 씬이 `dice3d.html`에 독립적으로 존재
- `DiceArea` 컴포넌트가 iframe으로 임베드 (`max-h-[40vh]`)
- `window.DiceGame` API로 iframe과 통신

### 변경: iframe 제거, Three.js 직접 통합
- `dice3d.html`의 Three.js + cannon-es 로직을 React 컴포넌트로 이전
- Three.js 캔버스가 게임 페이지 전체 배경 (`position: fixed, inset: 0, z-index: 0`)
- 모든 게임 UI (롤 버튼, 점수판, 트레이, 턴 표시)는 오버레이 (`position: relative, z-index: 10`)
- `dice3d.html`은 삭제하지 않고 standalone 테스트용으로 보존

### 새 컴포넌트 구조
```
GamePage
├── DiceScene (Three.js canvas, 전체화면 배경, z-0)
│   └── Three.js scene, camera, renderer, physics
└── GameOverlay (UI 오버레이, z-10)
    ├── TopBar (라운드, 턴 표시)
    ├── DiceTray (하단 중앙, 5칸 보관함)
    ├── RollButton (하단 중앙, 트레이 위)
    ├── ScoreBoard (오른쪽 사이드바)
    └── ReactionBar (하단)
```

### DiceScene 컴포넌트
- `useRef`로 canvas 엘리먼트 관리
- `useEffect`에서 Three.js scene, renderer, physics 초기화
- 기존 `dice3d.html`의 모든 로직 포함 (scene, camera, lighting, physics, dice, cup, animations)
- `window.DiceGame` API 대신 React ref로 직접 제어
- `embedded` 모드의 UI panel 불필요 — 별도 React 컴포넌트로 대체
- cleanup에서 renderer.dispose(), physics world 정리

### DiceScene API (ref로 노출)
```typescript
interface DiceSceneAPI {
  setValues(v: number[]): void;
  setHeld(h: boolean[]): void;
  shake(): void;
  roll(): void;
  onResult(cb: (values: number[]) => void): void;
}
```
- 기존 `window.DiceGame`과 동일한 인터페이스, useImperativeHandle로 노출

### 화면 크기 문제 해결
- iframe의 `max-h-[40vh]` 제한이 자연스럽게 제거됨
- 캔버스가 전체 뷰포트를 채우므로 컵/주사위가 충분히 크게 보임
- 카메라 FOV와 position은 기존 값 유지 (필요 시 조정)

## 5. 주사위 보관함 UI (DiceTray)

### 레이아웃
- 화면 하단 중앙에 오버레이로 배치
- 가로 5칸 트레이, 나무 질감 스타일 (갈색 그라디언트, 내부 그림자, border)
- 3D 배경 위에 반투명하게 떠 있는 느낌

### 인터랙션
- 주사위 결과 표시 후(rollCount > 0), 주사위 숫자 버튼 클릭 → 트레이 칸으로 이동 애니메이션
  - CSS transition: translate + scale, ~300ms ease-out
- 트레이 안의 주사위 클릭 → 다시 원래 위치로 복귀 (hold 해제)
- 모든 클릭은 `game:hold` 메시지를 서버에 전송
- 서버 `game:held` 응답으로 UI 상태 업데이트
- 첫 번째 roll 전 (rollCount == 0): 트레이와 주사위 버튼 비활성 — hold 불가

### 상대방 턴
- 상대방의 held 상태도 트레이에 표시 (숫자 보임, 클릭 불가)

### Roll 시 동작
- 보관함(held)에 있는 주사위는 컵 안에 들어가지 않음
- 서버가 내부 held 상태 기반으로 held 주사위를 유지

### send 함수 전달
- GamePage가 `send` prop을 DiceTray와 ScoreBoard에 전달
- DiceTray: `send('game:hold', { index })` 호출
- ScoreBoard: `send('game:hover', { category })` 호출

## 6. 점수판 디자인 개선

### 예상 점수 미리보기
- 서버에서 받은 `preview`를 선택 가능한 카테고리에 표시
- 스타일: 흐린 노란색 (opacity ~0.4), 이탤릭
- 0점인 경우 더 흐리게 (opacity ~0.15)
- 이미 선택된 카테고리는 확정 점수 (일반 색상)

### 호버 인터랙션
- 내 턴: 선택 가능한 행에 마우스 올리면 배경 밝아짐 + 점수 bold + 노란색 강조
- 상대방의 hover: 해당 행에 살짝 다른 색 하이라이트 (subtle)

### 선택 불가 상태
- 이미 채워진 카테고리: 회색 텍스트, 인터랙션 없음
- 내 턴이 아닐 때: 모든 카테고리 인터랙션 비활성

## 7. 턴 표시 개선

### 상단 바
- 내 턴: 눈에 띄는 배경색 (금색/노란색 계열 그라디언트), 텍스트 볼드, 약간의 글로우
- 상대 턴: 차분한 어두운 배경, "OO의 턴" 텍스트

### 점수판
- 현재 턴 플레이어의 컬럼 헤더 하이라이트 (노란색)
- 이미 존재하는 동작 유지 강화

## Message Type Summary

| 메시지 | 방향 | 페이로드 |
|--------|------|----------|
| `game:hold` | C → S | `{ index: int }` |
| `game:held` | S → All | `{ held: [5]bool, playerId: string }` |
| `game:hover` | C → S | `{ category: string \| null }` |
| `game:hovered` | S → All | `{ category: string \| null, playerId: string }` |
| `game:rolled` (확장) | S → All | 기존 + `preview: map[string]int` |
| `game:sync` (확장) | S → One | 기존 + `preview: map[string]int` |

## 파일 변경 범위

### Server
- `server/message/message.go` — 새 payload 타입 4개, GameRolledPayload/GameSyncPayload에 Preview 추가, GameRollPayload에서 Held 제거, 새 에러 코드 ErrInvalidIndex
- `server/game/engine.go` — Hold(), Preview() 메서드 추가, Roll()에서 held 파라미터 제거
- `server/handler/ws.go` — game:hold, game:hover 핸들러 추가, handleRoll에서 held 파라미터 제거 및 preview 포함
- `server/room/room.go` — Hold() 메서드 추가, Roll()에서 held 파라미터 제거

### Client
- `client/src/types/game.ts` — GameRolledPayload에 preview 추가, 새 payload 타입
- `client/src/hooks/useGameState.ts` — TOGGLE_HOLD 제거, GAME_HELD 추가, preview/hoveredCategory 상태 추가
- `client/src/hooks/useWebSocket.ts` — 변경 없음
- `client/src/App.tsx` — game:held, game:hovered 핸들러 등록
- `client/src/components/DiceScene.tsx` — **새 파일**. dice3d.html의 Three.js+cannon-es 로직을 React 컴포넌트로 이전. 전체화면 캔버스 배경.
- `client/src/components/DiceTray.tsx` — **새 파일**. 하단 중앙 오버레이 보관함 5칸, 나무 트레이 질감, hold 애니메이션.
- `client/src/components/DiceArea.tsx` — 삭제 (DiceScene + DiceTray로 대체)
- `client/src/components/ScoreBoard.tsx` — preview 표시, send prop 받아 game:hover 전송, 오버레이 스타일로 변경, 디자인 개선
- `client/src/pages/GamePage.tsx` — 전체화면 3D 배경 + UI 오버레이 레이아웃, 턴 표시 개선
- `client/src/i18n/*.json` — 필요 시 새 키 추가
- `client/public/dice3d.html` — 보존 (standalone 테스트용), 변경 없음
