<div align="center">

# Yacht Dice

**실시간 멀티플레이어 요트 다이스 게임**

물리 엔진 기반 3D 주사위 + WebSocket 실시간 대전

[Play Now](https://yacht.rwe.kr) · [Report Bug](https://github.com/gwanryo/yacht-dice/issues)

</div>

---

## Overview

브라우저에서 바로 플레이하는 요트 다이스. Three.js + Cannon-es 물리 엔진으로 구현한 3D 주사위를 실시간으로 굴리고, WebSocket으로 연결된 상대방과 대전합니다.

- 물리 시뮬레이션 기반 주사위 굴림 (컵 셰이크, 쏟기, 정착)
- 실시간 멀티플레이어 대전 (방 생성/참가)
- 솔로 플레이 모드 + 개인 최고 기록
- 모바일/데스크톱 반응형
- 재접속 시 게임 상태 자동 복원

## Tech Stack

| Layer | Stack |
|-------|-------|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS |
| **3D Engine** | Three.js, Cannon-es |
| **Backend** | Go, Chi, Gorilla WebSocket |
| **Infra** | Docker, Nginx, Let's Encrypt, GitHub Actions |

## Getting Started

### Prerequisites

- Node.js 20+
- Go 1.25+

### Development

```bash
# 서버
cd server
go run .

# 클라이언트 (별도 터미널)
cd client
npm install
npm run dev
```

`http://localhost:5173`에서 접속. WebSocket은 Vite proxy로 `:8080`에 자동 연결됩니다.

### Docker

```bash
docker compose up
```

### Test

```bash
# Frontend
cd client && npm test

# Backend
cd server && go test ./...
```

## License

MIT
