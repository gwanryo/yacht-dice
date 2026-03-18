# Yacht Dice - Online Multiplayer Game Design

## Overview

Docker Compose로 배포하는 온라인 멀티플레이어 Yacht Dice(야찌) 게임.
2~4명이 실시간으로 Yacht Dice를 플레이할 수 있다.
유저 정보 영속화는 없으며, 방이 종료되면 모든 상태가 소멸한다.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite + TypeScript + Tailwind CSS |
| Backend | Go + Chi (HTTP router) + Gorilla WebSocket |
| Deployment | Docker Compose (2 containers: nginx + go binary) |
| i18n | react-i18next (Korean, English, Japanese) |
| State Management | React Context + useReducer |
| DB | None (in-memory only) |

## Architecture

```
┌─────────────────────────────────────────────────┐
│                 Docker Compose                   │
│                                                  │
│  ┌──────────────┐       ┌─────────────────────┐ │
│  │   Frontend    │       │      Backend        │ │
│  │  (nginx)      │◄─────►│  (Go binary)        │ │
│  │              │  WS    │                     │ │
│  │  React+Vite  │       │  Chi router          │ │
│  │  TypeScript  │       │  Gorilla WebSocket   │ │
│  │  Tailwind    │       │                     │ │
│  │  Port: 80    │       │  Port: 8080          │ │
│  └──────────────┘       └─────────────────────┘ │
└─────────────────────────────────────────────────┘
```

- nginx가 `/ws` 경로를 backend로 프록시
- 나머지 경로는 정적 파일 서빙

## Room System & Game Flow

```
[로비]                    [방 안]                    [게임 중]
┌─────────┐   생성/참여   ┌──────────┐    전원 준비    ┌──────────┐
│ 닉네임   │──────────────►│ 대기실    │──────────────►│ 게임 진행 │
│ 입력     │              │ 2~4명    │              │ 13라운드  │
└─────────┘              └──────────┘              └──────────┘
                              │                        │
                         나가기/킥                  게임 종료
                              │                        │
                              ▼                        ▼
                          [로비로]                [결과 화면]
                                                      │
                                                  다시하기/나가기
```

### Room Creation & Joining

- 방 생성 시 6자리 영숫자 코드 자동 생성 (예: `A3K9F2`)
- 비밀번호 설정은 선택사항
- 참여 방법 2가지:
  - **로비 목록**에서 선택 -> 비밀번호가 있으면 입력 후 입장
  - **코드 직접 입력** -> 비밀번호가 있으면 입력 후 입장 (코드를 아는 것 자체가 초대를 의미하지만, 비밀번호 검증은 동일하게 적용)
- 최대 인원은 4명 고정

### Waiting Room

- 방장(생성자)이 존재, 방장이 나가면 다음 사람에게 이관
- 전원 "준비" 누르면 방장이 "게임 시작" 가능 (최소 2명)
- 닉네임이 방 안에서 표시됨

### Game End

- 13라운드 종료 후 결과 화면
- "다시하기" 또는 "로비로" 선택
- **다시하기**: 같은 방(같은 코드)에서 대기실로 돌아감. 전원이 다시 준비 후 시작. 일부만 클릭하면 클릭한 사람만 대기실로 이동, 나머지는 결과 화면에 남음. 30초 내 아무도 안 누르면 방 해산.

### Empty Room Cleanup

- 마지막 플레이어가 나가면 30초 후 방 삭제

## Game Rules (Yacht Dice)

### Turn Structure

- 플레이어 순서: 입장 순서대로 고정
- 한 턴에 주사위 3번 굴리기 가능
- 첫 번째 굴림은 5개 모두 필수, 이후 유지할 주사위를 선택(hold)하고 나머지만 재굴림
- 3번 굴린 후 (또는 원할 때 아무 때나) 13개 카테고리 중 하나에 점수 기입

### Scoring Categories (13)

**Upper Section**

| Category | Condition | Score |
|---|---|---|
| Ones | 1의 합산 | 1 x count |
| Twos | 2의 합산 | 2 x count |
| Threes | 3의 합산 | 3 x count |
| Fours | 4의 합산 | 4 x count |
| Fives | 5의 합산 | 5 x count |
| Sixes | 6의 합산 | 6 x count |

*Upper Bonus*: Upper Section 합계 >= 63이면 자동으로 +35 보너스. 카테고리가 아닌 자동 계산 항목.

**Lower Section**

| Category | Condition | Score |
|---|---|---|
| Choice | 없음 | 전체 합 |
| Four of a Kind | 같은 눈 4개+ | 전체 합 |
| Full House | 3+2 조합 | 25 |
| Small Straight | 연속 4개 | 30 |
| Large Straight | 연속 5개 | 40 |
| Yacht | 5개 동일 | 50 |

### Dice Roll

- 서버가 랜덤 생성하여 클라이언트에 전달
- 클라이언트는 3D 연출만 담당 (치팅 방지)
- 점수 판정은 서버에서 수행

## WebSocket Protocol

### Connection

```
Client -> ws://backend:8080/ws?nickname=Player1
Server -> { type: "connected", playerId: "uuid" }
```

Reconnection: playerId를 쿼리로 보내면 서버가 기존 세션 복원.
클라이언트가 3초 간격, 최대 5회 자동 재시도.
재연결 성공 시 서버가 `game:sync` 메시지로 전체 상태 전송 (현재 주사위 값, held 상태, rollCount, 전체 점수판, 현재 턴/라운드).

### Disconnection During Game

- 플레이어 연결이 끊기면 60초간 재연결 대기
- 60초 내 재연결 실패 시 해당 플레이어는 게임에서 제거되고 남은 플레이어로 계속 진행
- 2명 미만이 되면 게임 자동 종료, 남은 플레이어가 승리

### Message Types

**Lobby**

```
C->S  room:create    { password?: string }
S->C  room:created   { roomCode: "A3K9F2" }
C->S  room:leave     {}
C->S  room:join      { roomCode, password?: string }
S->C  room:joined    { room state }
C->S  room:list      {}
S->C  room:list      [{ code, playerCount, hasPassword, status: "waiting"|"playing" }]
```

**Waiting Room**

```
C->S  room:ready     {}              // 토글 (ready <-> unready)
C->S  room:start     {}           // 방장만
S->C  room:state     { players[], readyStates }
S->C  game:start     { playerOrder }
```

**Game**

```
C->S  game:roll      { held: [0,2,4] }   // hold할 인덱스 (첫 굴림은 빈 배열 필수, 서버가 검증)
S->C  game:rolled    { dice: [3,5,2,1,6], rollCount: 2 }
C->S  game:score     { category: "fullHouse" }
S->C  game:scored    { playerId, category, score, totalScores }
S->C  game:turn      { currentPlayer, round }
S->C  game:sync      { dice, held, rollCount, scores, currentPlayer, round }  // 재연결 시
S->C  game:end       { rankings }
C->S  game:rematch   {}                 // 다시하기
```

**Reaction**

```
C->S  reaction:send  { emoji: "..." }
S->C  reaction:show  { playerId, emoji }
```

**Connection Management**

```
S->C  player:left    { playerId }
S->C  player:joined  { player }
S->C  player:disconnected  { playerId }     // 연결 끊김 (재연결 대기 중)
S->C  player:removed      { playerId }     // 재연결 실패로 게임에서 제거
S->C  error          { message, code }

// Error codes:
//   NOT_YOUR_TURN     - 자기 턴이 아닌데 행동
//   CATEGORY_FILLED   - 이미 기입된 카테고리 선택
//   INVALID_ROLL      - 첫 굴림에 held 전송 등
//   ROOM_FULL         - 방 정원 초과
//   WRONG_PASSWORD    - 비밀번호 불일치
//   ROOM_NOT_FOUND    - 존재하지 않는 방 코드
//   GAME_IN_PROGRESS  - 게임 중인 방에 참여 시도
```

## Frontend Structure

```
src/
├── App.tsx                  # 라우팅, WebSocket 컨텍스트
├── i18n/
│   ├── ko.json              # 한국어
│   ├── en.json              # English
│   └── ja.json              # 日本語
├── hooks/
│   ├── useWebSocket.ts      # WS 연결, 재연결, 메시지 핸들링
│   └── useGameState.ts      # 게임 상태 관리
├── pages/
│   ├── LobbyPage.tsx        # 닉네임 입력 + 방 목록 + 코드 입력
│   ├── RoomPage.tsx         # 대기실 (준비/시작)
│   ├── GamePage.tsx         # 게임 진행 화면
│   └── ResultPage.tsx       # 결과 화면
├── components/
│   ├── DiceArea.tsx         # 3D 주사위 영역 (별도 구현)
│   ├── ScoreBoard.tsx       # 점수판 (전체 플레이어)
│   ├── DiceControls.tsx     # Roll/Hold 버튼
│   ├── ReactionBar.tsx      # 이모지/스탬프 선택 & 표시
│   ├── RoomList.tsx         # 로비 방 목록
│   └── PlayerList.tsx       # 방 안 플레이어 목록
└── types/
    └── game.ts              # 공유 타입 정의
```

- `DiceArea`는 인터페이스만 정의 (props: dice 값 배열, held 상태, onHold 콜백). 3D 구현은 별도.
- 상태 관리: React Context + useReducer (외부 라이브러리 불필요)

## Backend Structure

```
server/
├── main.go                  # 엔트리포인트, Chi 라우터 설정
├── handler/
│   └── ws.go                # WebSocket 업그레이드, 메시지 라우팅
├── hub/
│   └── hub.go               # 전체 연결 관리, 방 목록 관리
├── room/
│   └── room.go              # 방 생성/참여/퇴장, 대기실 로직
├── game/
│   ├── engine.go            # 턴 진행, 주사위 굴림, 점수 판정
│   └── score.go             # 13개 카테고리 점수 계산 로직
├── player/
│   └── player.go            # 플레이어 구조체, 연결 상태
├── message/
│   └── message.go           # JSON 메시지 타입 정의, 직렬화
└── Dockerfile
```

- **Hub**: 모든 WebSocket 연결을 관리하는 싱글턴. 방 생성/목록/삭제 담당.
- **Room**: goroutine 1개가 방 1개를 담당. 채널로 메시지 수신, 방 안 브로드캐스트.
- **Game Engine**: Room 안에서 게임 시작 시 생성. 턴/라운드 상태 머신 관리.
- **Score**: 순수 함수로 구현 - `func Calculate(dice [5]int, category string) int`
- **동시성**: Room별 goroutine + channel 패턴으로 락 없이 안전하게 처리.

## Docker Compose

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
```

### Frontend Dockerfile

- Stage 1: `node:20-alpine` - `npm install && npm run build`
- Stage 2: `nginx:alpine` - 빌드 결과물 복사 + nginx.conf

### Backend Dockerfile

- Stage 1: `golang:1.22-alpine` - `go build`
- Stage 2: `alpine` - 바이너리만 복사 (최종 이미지 ~15MB)

### nginx.conf

```
location /     -> 정적 파일 서빙
location /ws   -> proxy_pass http://backend:8080 (WebSocket upgrade)
```

### Health Check

- Backend: `GET /health` 엔드포인트

### Execution

```bash
docker-compose up --build
# http://localhost 접속하면 바로 플레이 가능
```

## Player Identity

- 로비 진입 시 닉네임 입력, 미입력 시 랜덤 생성 (예: "Player_A3K9")
- 닉네임은 세션 동안만 유지

## Communication

- 텍스트 채팅 없음
- 이모지/스탬프 리액션만 지원
- 턴 타이머 없음

## i18n

- 지원 언어: 한국어 (ko), English (en), 日本語 (ja)
- react-i18next 사용
- 브라우저 언어 자동 감지, 수동 전환 가능

## 3D Dice

- DiceArea 컴포넌트는 props 인터페이스만 정의
- 3D 구현은 별도로 진행 (프로젝트 외부에서 준비)
- 인터페이스: `{ dice: number[], held: boolean[], rollPhase: 'idle'|'shaking'|'rolling'|'settled', onHold: (index: number) => void }`
