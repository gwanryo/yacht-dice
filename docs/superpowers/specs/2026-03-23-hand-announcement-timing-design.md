# Hand Announcement Timing Bug Fix

## Problem

족보(HandAnnouncement) 알림이 주사위 애니메이션 완료 전에 표시되는 타이밍 버그.

### Root Cause

`GamePage.tsx`에서 hand detection이 별도 `useEffect`로 구현되어 있어 React 렌더 사이클 타이밍 문제 발생:

1. `game:rolled` 도착 → `state.dice` 업데이트 (렌더 N)
2. 같은 렌더에서 sync effect가 `setRollPhase('shaking')` 호출하지만 **다음 렌더에서 반영**
3. Hand detection effect는 같은 렌더에서 `rollPhase === 'settled'` (이전 값) + 새 `state.dice`로 **잘못 트리거**

## Solution: handleSettled 콜백에서 직접 감지 (방식 A)

Hand detection을 별도 `useEffect`에서 제거하고 `handleSettled` 콜백 내부로 이동. 3D 씬의 `onResult()` 콜백이 호출될 때만 족보를 체크한다.

### Changes

#### 1. GamePage.tsx

```tsx
// 추가: dice를 ref로 추적
const diceRef = useRef(state.dice);
diceRef.current = state.dice;

// 변경: handleSettled에서 직접 hand detection
// deps가 빈 배열인 이유: state setter(setAnnouncedHand 등)는 stable하고,
// diceRef는 ref이므로 deps에 포함할 필요 없음.
const handleSettled = useCallback(() => {
  setRollPhase('settled');
  // 같은 족보가 연속으로 나올 때 HandAnnouncement의 useEffect가
  // category 변경을 감지하도록 먼저 null로 리셋 후 microtask에서 설정
  setAnnouncedHand(null);
  setAnnouncedScore(undefined);
  const dice = diceRef.current;
  if (dice.length !== 5) return;
  for (const cat of SPECIAL_CATEGORIES) {
    const hand = isSpecialHand(dice, cat as Category);
    if (hand) {
      queueMicrotask(() => {
        setAnnouncedHand(hand.category);
        setAnnouncedScore(hand.score);
      });
      return;
    }
  }
}, []);

// 제거: "Auto-detect special hand when dice settle" 주석의 useEffect 블록
```

턴 전환 시 announcement 초기화 (기존 `handleAnnouncementDone`은 유지 — 정상 종료 시 cleanup 담당):
```tsx
// sync effect 내 턴 변경 감지 부분에 추가
// handleAnnouncementDone과의 race 없음:
// - 턴 전환 시 즉시 null로 리셋 → 알림 즉시 사라짐
// - handleAnnouncementDone은 3.6초 타이머 기반 → 턴 전환이 더 빠름
if (state.currentPlayer !== prevPlayerRef.current) {
  // ... 기존 코드 ...
  setAnnouncedHand(null);
  setAnnouncedScore(undefined);
}
```

### Tests

#### Unit Tests (Vitest + RTL) — GamePage.test.tsx

1. GAME_ROLLED 직후 HandAnnouncement가 렌더되지 않아야 함
2. handleSettled(onResult) 호출 후에만 HandAnnouncement가 렌더되어야 함
3. 턴 전환 시 announcement가 초기화되어야 함
4. 같은 족보가 연속으로 나와도 각각 표시되어야 함

#### E2E Tests (agent-browser) — e2e/run-e2e.sh

1. Shake 직후(Roll 전) HandAnnouncement 텍스트가 보이지 않아야 함
2. Roll + settle 완료 후에만 족보 관련 텍스트가 나타날 수 있음

### Additional Issues Found

1. **같은 족보 연속 감지 불가** — HandAnnouncement의 `useEffect`가 같은 `category` 값에 대해 재실행되지 않음. `handleSettled`에서 먼저 `null`로 리셋 후 `queueMicrotask`로 설정하여 React가 두 번의 상태 변경을 별도 렌더로 처리하도록 보장. (코드 샘플에 반영됨)
