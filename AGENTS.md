# Skills Policy

All tasks MUST begin by invoking the `using-superpowers` skill.

## Frontend

- Use skills: `frontend-design`, `web-design-guidelines`, `vercel-react-best-practices`
- Testing: use `agent-browser` actively; always delete generated screenshots after use
- Three.js changes: MUST use all skills starting with `three-`

## Backend (Go)

- Use skills: `golang-patterns`, `golang-testing`

## 작업 완료 후 필수

```bash
cd client && npm test          # 유닛 테스트
cd server && go test ./...     # 서버 테스트
./e2e/run-e2e.sh               # E2E (agent-browser 필요)
```

모두 통과해야 함. 기존 테스트를 통과시키기 위해 수정 금지.
