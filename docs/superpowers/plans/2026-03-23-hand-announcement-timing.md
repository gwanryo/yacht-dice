# Hand Announcement Timing Bug Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the bug where hand announcements appear before dice animation completes, by moving detection from a useEffect into the handleSettled callback.

**Architecture:** Replace the race-prone `useEffect` (which triggers on `[rollPhase, state.dice]`) with direct detection inside `handleSettled`, using a `diceRef` to access latest dice values without adding dependencies. Use `queueMicrotask` to ensure consecutive identical hands trigger separate renders.

**Tech Stack:** React 19, TypeScript, Vitest, React Testing Library, agent-browser (E2E)

**Spec:** `docs/superpowers/specs/2026-03-23-hand-announcement-timing-design.md`

---

### Task 1: Write failing unit tests for the timing bug

**Files:**
- Modify: `client/src/pages/GamePage.test.tsx`

- [ ] **Step 1: Add test — GAME_ROLLED should NOT trigger hand announcement**

Add to `GamePage.test.tsx`. The DiceScene mock needs to capture the `onResult` callback so we can call it manually to simulate settle.

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import GamePage from './GamePage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Capture onResult so we can trigger settle manually
let capturedOnResult: (() => void) | null = null;

// NOTE: This mock replaces the simpler mock in the existing "button area" describe block.
// Since vi.mock is hoisted and file-scoped, only one mock per module is allowed.
// The existing tests continue to work because this mock also returns null from render.
// Must use require('react') inside factory since vi.mock is hoisted above imports.
vi.mock('../components/DiceScene', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: React.forwardRef((_props: unknown, ref: React.Ref<unknown>) => {
      React.useImperativeHandle(ref, () => ({
        setValues: vi.fn(),
        setHeld: vi.fn(),
        shake: vi.fn(),
        roll: vi.fn().mockReturnValue(true),
        onResult: (cb: () => void) => { capturedOnResult = cb; },
      }));
      return null;
    }),
  };
});

vi.mock('../components/ErrorBoundary', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// HandAnnouncement — render real component so we can detect when it appears
vi.mock('../components/HandAnnouncement', () => ({
  __esModule: true,
  default: ({ category, score, onDone }: { category: string | null; score?: number; onDone: () => void }) => {
    if (!category) { onDone(); return null; }
    return <div data-testid="hand-announcement">{category}:{score}</div>;
  },
}));

const baseState = {
  phase: 'game' as const,
  nickname: 'Me',
  roomCode: 'ABC123',
  players: [
    { id: 'me', nickname: 'Me', isHost: true, isReady: false },
    { id: 'other', nickname: 'Other', isHost: false, isReady: false },
  ],
  dice: [1, 2, 3, 4, 5],
  held: [false, false, false, false, false],
  rollCount: 3,
  currentPlayer: 'me',
  round: 1,
  scores: {},
  rankings: [],
  reactions: [],
  preview: {},
  hoveredCategory: null,
  pourCount: 0,
  rematchVotes: [],
  lastScored: null,
};

describe('GamePage hand announcement timing', () => {
  beforeEach(() => {
    capturedOnResult = null;
  });

  it('should NOT show hand announcement immediately after GAME_ROLLED with yacht dice', () => {
    // Render with settled state from a previous roll, then receive new dice
    const { rerender } = render(
      <GamePage
        state={{ ...baseState, dice: [1, 1, 1, 1, 2], rollCount: 1 }}
        dispatch={vi.fn()} send={vi.fn()} playerId="me"
      />,
    );

    // Simulate settle from previous roll
    if (capturedOnResult) act(() => capturedOnResult!());

    // Now simulate GAME_ROLLED arriving with yacht dice (rollCount increments)
    rerender(
      <GamePage
        state={{ ...baseState, dice: [3, 3, 3, 3, 3], rollCount: 2 }}
        dispatch={vi.fn()} send={vi.fn()} playerId="me"
      />,
    );

    // Hand announcement should NOT appear yet — dice animation hasn't completed
    expect(screen.queryByTestId('hand-announcement')).toBeNull();
  });

  it('should show hand announcement only after dice settle (onResult callback)', async () => {
    render(
      <GamePage
        state={{ ...baseState, dice: [3, 3, 3, 3, 3], rollCount: 1 }}
        dispatch={vi.fn()} send={vi.fn()} playerId="me"
      />,
    );

    // Before settle — no announcement
    expect(screen.queryByTestId('hand-announcement')).toBeNull();

    // Trigger settle
    expect(capturedOnResult).not.toBeNull();
    act(() => capturedOnResult!());
    // Flush queueMicrotask used for setting announced hand
    await act(async () => { await Promise.resolve(); });

    // Now announcement should appear
    expect(screen.getByTestId('hand-announcement')).toBeTruthy();
    expect(screen.getByTestId('hand-announcement').textContent).toContain('yacht');
  });

  it('should clear announcement on turn change', async () => {
    const { rerender } = render(
      <GamePage
        state={{ ...baseState, dice: [3, 3, 3, 3, 3], rollCount: 1 }}
        dispatch={vi.fn()} send={vi.fn()} playerId="me"
      />,
    );

    // Settle → announcement appears
    act(() => capturedOnResult!());
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId('hand-announcement')).toBeTruthy();

    // Turn changes
    rerender(
      <GamePage
        state={{ ...baseState, dice: [], rollCount: 0, currentPlayer: 'other', round: 2 }}
        dispatch={vi.fn()} send={vi.fn()} playerId="me"
      />,
    );

    // Announcement should be gone
    expect(screen.queryByTestId('hand-announcement')).toBeNull();
  });

  it('should show announcement for consecutive identical hands', async () => {
    const { rerender } = render(
      <GamePage
        state={{ ...baseState, dice: [3, 3, 3, 3, 3], rollCount: 1 }}
        dispatch={vi.fn()} send={vi.fn()} playerId="me"
      />,
    );

    // First settle — yacht announced
    act(() => capturedOnResult!());
    // queueMicrotask needs to flush
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId('hand-announcement').textContent).toContain('yacht');

    // Simulate second roll with same yacht dice (rollCount increments)
    rerender(
      <GamePage
        state={{ ...baseState, dice: [3, 3, 3, 3, 3], rollCount: 2 }}
        dispatch={vi.fn()} send={vi.fn()} playerId="me"
      />,
    );

    // handleSettled resets to null first
    // Before settle, announcement should have been cleared by the null reset
    // (the rerender triggered sync effect which set rollPhase to shaking)

    // Second settle — yacht announced again
    act(() => capturedOnResult!());
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId('hand-announcement').textContent).toContain('yacht');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/ryo/Personal/yatch-dice/client && npx vitest run src/pages/GamePage.test.tsx`

Expected: At least the first test ("should NOT show hand announcement immediately after GAME_ROLLED") should FAIL because the current code's `useEffect` triggers on `state.dice` change while `rollPhase` is still `'settled'`.

---

### Task 2: Fix GamePage.tsx — move hand detection to handleSettled

**Files:**
- Modify: `client/src/pages/GamePage.tsx:33,38-41,89-109`
- Modify: `client/src/pages/GamePage.opponent.test.tsx:138,162,211` (flush queueMicrotask)

- [ ] **Step 1: Add diceRef after line 36**

After `const sceneRef = useRef<DiceSceneAPI>(null);` (line 36), add:

```tsx
const diceRef = useRef(state.dice);
diceRef.current = state.dice;
```

- [ ] **Step 2: Add announcement reset to turn-change block**

In the sync effect (line 58-87), inside the turn-change `if` block (line 63-68), add two lines before the closing brace:

```tsx
if (state.currentPlayer !== prevPlayerRef.current) {
  prevPlayerRef.current = state.currentPlayer;
  setRollPhase('idle');
  prevRollCountRef.current = 0;
  prevPourRef.current = 0;
  setAnnouncedHand(null);      // ← add
  setAnnouncedScore(undefined); // ← add
}
```

- [ ] **Step 3: Replace handleSettled with hand-detection version**

Replace lines 89-91:
```tsx
const handleSettled = useCallback(() => {
  setRollPhase('settled');
}, []);
```

With:
```tsx
const handleSettled = useCallback(() => {
  setRollPhase('settled');
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
```

- [ ] **Step 4: Remove the old hand-detection useEffect**

Delete lines 97-109 (the entire `useEffect` block with comment `// Auto-detect special hand when dice settle`):

```tsx
// DELETE THIS ENTIRE BLOCK:
// Auto-detect special hand when dice settle (both players see it)
useEffect(() => {
  if (rollPhase !== 'settled' || state.dice.length !== 5) return;
  // Check all special categories for a match
  for (const cat of SPECIAL_CATEGORIES) {
    const hand = isSpecialHand(state.dice, cat as Category);
    if (hand) {
      setAnnouncedHand(hand.category);
      setAnnouncedScore(hand.score);
      break; // Show only the best/first match
    }
  }
}, [rollPhase, state.dice]);
```

- [ ] **Step 5: Update existing hand announcement tests in GamePage.opponent.test.tsx**

The existing tests in `client/src/pages/GamePage.opponent.test.tsx` assert on hand announcements after `capturedOnResult` but don't flush `queueMicrotask`. After the fix, `handleSettled` uses `queueMicrotask` to set the announced hand. Add microtask flushing to the three affected tests:

In the `GamePage hand announcement` describe block, update these tests to be `async` and add `await act(async () => { await Promise.resolve(); });` after each `act(() => { capturedOnResult?.(...); });` call:

1. `'shows announcement on settle when dice form a special hand (my turn)'` (line 138) — make async, add flush after line 157
2. `'shows announcement on settle for opponent too (both players see it)'` (line 162) — make async, add flush after line 187

In the `SPECIAL_CATEGORIES order` describe block:
3. `'yacht (50pts) should be checked before smallStraight (30pts)'` (line 211) — make async, add flush after line 232

Example pattern for each:
```tsx
// Change: it('...', () => {  →  it('...', async () => {
// After: act(() => { capturedOnResult?.([...]); });
// Add:   await act(async () => { await Promise.resolve(); });
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd /Users/ryo/Personal/yatch-dice/client && npx vitest run src/pages/GamePage.test.tsx`

Expected: ALL tests pass.

- [ ] **Step 7: Run full test suite to check for regressions**

Run: `cd /Users/ryo/Personal/yatch-dice/client && npx vitest run`

Expected: All existing tests pass (including GamePage.opponent.test.tsx).

- [ ] **Step 8: Commit**

```bash
git add client/src/pages/GamePage.tsx client/src/pages/GamePage.test.tsx client/src/pages/GamePage.opponent.test.tsx
git commit -m "fix: hand announcement only triggers after dice animation settles

Move hand detection from useEffect (race-prone due to React render cycle
timing between state.dice and rollPhase) into handleSettled callback.
Use diceRef for latest values and queueMicrotask for consecutive identical hands."
```

---

### Task 3: Add E2E test for announcement timing

**Files:**
- Modify: `e2e/run-e2e.sh`

- [ ] **Step 1: Add hand announcement timing test after Test 4 (before play_full_game)**

Insert after Test 4b (line ~126, before `echo "  Playing..."`). This test verifies that after Shake (but before Roll), no hand announcement text is visible:

```bash
# ── Test 4c: Hand announcement should NOT appear before roll settles ──
echo -e "  ${CYAN}Checking hand announcement timing...${NC}"
S=$(snap)
# After shaking, no hand announcement categories should be visible
# (yacht, largeStraight, smallStraight, fullHouse, fourOfAKind labels)
assert_not "No hand announcement before roll" "$S" 'categories\.(yacht|largeStraight|smallStraight|fullHouse|fourOfAKind)'
```

- [ ] **Step 2: Commit**

```bash
git add e2e/run-e2e.sh
git commit -m "test(e2e): verify hand announcement does not appear before dice settle"
```
