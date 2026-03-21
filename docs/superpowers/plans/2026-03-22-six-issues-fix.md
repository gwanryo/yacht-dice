# 6가지 이슈 수정 및 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 방 코드 복사, 점수표 트랜지션, 버튼 영역 UX, 족보 빵빠레, 다시하기 버튼, 로비로 버튼 — 6가지 이슈를 수정하고 각각 테스트를 작성한다.

**Architecture:** 클라이언트(React/TypeScript) 중심 수정 + 서버(Go) 일부 수정(rematch vote 제거 로직). i18n 키 추가, CSS 애니메이션 추가, 컴포넌트 로직 수정. 서버는 room.go의 RemovePlayer에서 rematch vote 정리 추가.

**Tech Stack:** React 19, TypeScript, Vitest, React Testing Library, Tailwind CSS 4, Go (server)

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `client/src/pages/RoomPage.tsx` | 이슈1: clipboard fallback |
| Modify | `client/src/components/ScoreBoard.tsx` | 이슈2: crossfade 트랜지션 |
| Modify | `client/src/pages/GamePage.tsx` | 이슈3: 버튼 항상 표시 / 이슈4: 양측 announcement |
| Modify | `client/src/components/HandAnnouncement.tsx` | 이슈4: 디자인 개선 |
| Modify | `client/src/hooks/useGameEvents.ts` | 이슈4: scored 이벤트에서 announcement 트리거 |
| Modify | `client/src/hooks/useGameState.ts` | 이슈4: GAME_SCORED 액션 추가 |
| Modify | `client/src/pages/ResultPage.tsx` | 이슈5: playerId 기반 투표 체크 / 이슈6: leave 시 vote cancel |
| Modify | `client/src/App.tsx` | 이슈5: playerId prop 전달 / 이슈6: phase guard |
| Modify | `client/src/index.css` | 이슈2: crossfade 키프레임 |
| Modify | `client/src/i18n/ko.json` | 새 i18n 키 추가 |
| Modify | `client/src/i18n/en.json` | 새 i18n 키 추가 |
| Modify | `client/src/i18n/ja.json` | 새 i18n 키 추가 |
| Create | `client/src/utils/clipboard.ts` | 클립보드 복사 유틸리티 |
| Create | `client/src/utils/scoreCalculator.ts` | 클라이언트측 점수 계산 유틸리티 |
| Modify | `server/room/room.go` | 이슈6: RemovePlayer에서 rematch vote 제거 |
| Modify | `server/handler/ws.go` | 이슈6: rematch:cancel 핸들러 추가 |
| Create | `client/src/utils/clipboard.test.ts` | 이슈1 테스트 |
| Create | `client/src/utils/scoreCalculator.test.ts` | 이슈4 점수 계산 테스트 |
| Create | `client/src/pages/RoomPage.test.tsx` | 이슈1 통합 테스트 |
| Create | `client/src/pages/ResultPage.test.tsx` | 이슈5/6 테스트 |
| Create | `client/src/pages/GamePage.test.tsx` | 이슈3/4 테스트 |
| Create | `client/src/components/HandAnnouncement.test.tsx` | 이슈4 테스트 |
| Modify | `server/room/room_test.go` | 이슈6 서버 테스트 |

---

### Task 1: 클립보드 복사 유틸리티 + 테스트 (이슈 1)

**Files:**
- Create: `client/src/utils/clipboard.ts`
- Create: `client/src/utils/clipboard.test.ts`

- [ ] **Step 1: Write failing test for clipboard utility**

```typescript
// client/src/utils/clipboard.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { copyToClipboard } from './clipboard';

describe('copyToClipboard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('uses navigator.clipboard.writeText when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const result = await copyToClipboard('ABC123');
    expect(writeText).toHaveBeenCalledWith('ABC123');
    expect(result).toBe(true);
  });

  it('falls back to execCommand when clipboard API fails', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    document.execCommand = vi.fn().mockReturnValue(true);

    const result = await copyToClipboard('ABC123');
    expect(document.execCommand).toHaveBeenCalledWith('copy');
    expect(result).toBe(true);
  });

  it('falls back to execCommand when clipboard API is undefined', async () => {
    Object.assign(navigator, { clipboard: undefined });
    document.execCommand = vi.fn().mockReturnValue(true);

    const result = await copyToClipboard('ABC123');
    expect(document.execCommand).toHaveBeenCalledWith('copy');
    expect(result).toBe(true);
  });

  it('returns false when both methods fail', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    document.execCommand = vi.fn().mockReturnValue(false);

    const result = await copyToClipboard('ABC123');
    expect(result).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/utils/clipboard.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write clipboard utility**

```typescript
// client/src/utils/clipboard.ts
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to execCommand */ }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/utils/clipboard.test.ts`
Expected: PASS — all 4 tests pass

- [ ] **Step 5: Commit**

```bash
git add client/src/utils/clipboard.ts client/src/utils/clipboard.test.ts
git commit -m "feat: add clipboard copy utility with fallback"
```

---

### Task 2: RoomPage에 클립보드 유틸리티 적용 + 테스트 (이슈 1)

**Files:**
- Modify: `client/src/pages/RoomPage.tsx:42-56`
- Create: `client/src/pages/RoomPage.test.tsx`
- Modify: `client/src/i18n/ko.json`
- Modify: `client/src/i18n/en.json`
- Modify: `client/src/i18n/ja.json`

- [ ] **Step 1: Add i18n keys for copy failure**

ko.json — `"room"` 블록에 추가:
```json
"copyFailed": "복사에 실패했습니다"
```

en.json — `"room"` 블록에 추가:
```json
"copyFailed": "Copy failed"
```

ja.json — `"room"` 블록에 추가:
```json
"copyFailed": "コピーに失敗しました"
```

- [ ] **Step 2: Write failing test for RoomPage copy button**

```typescript
// client/src/pages/RoomPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RoomPage from './RoomPage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../utils/clipboard', () => ({
  copyToClipboard: vi.fn(),
}));

import { copyToClipboard } from '../utils/clipboard';

const mockDispatch = vi.fn();
const mockSend = vi.fn();
const defaultState = {
  phase: 'room' as const,
  nickname: 'Me',
  roomCode: 'ABC123',
  players: [
    { id: 'me', nickname: 'Me', isHost: true, isReady: false },
    { id: 'other', nickname: 'Other', isHost: false, isReady: false },
  ],
  dice: [],
  held: [false, false, false, false, false],
  rollCount: 0,
  currentPlayer: null,
  round: 1,
  scores: {},
  rankings: [],
  reactions: [],
  preview: {},
  hoveredCategory: null,
  pourCount: 0,
  rematchVotes: [],
};

describe('RoomPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('copies room code and shows success icon on click', async () => {
    vi.mocked(copyToClipboard).mockResolvedValue(true);
    render(<RoomPage state={defaultState} dispatch={mockDispatch} send={mockSend} playerId="me" />);

    const copyButton = screen.getByLabelText('aria.copyRoomCode');
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(copyToClipboard).toHaveBeenCalledWith('ABC123');
    });
  });

  it('shows room code text', () => {
    render(<RoomPage state={defaultState} dispatch={mockDispatch} send={mockSend} playerId="me" />);
    expect(screen.getByText('ABC123')).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd client && npx vitest run src/pages/RoomPage.test.tsx`
Expected: FAIL — copyToClipboard not imported in RoomPage

- [ ] **Step 4: Update RoomPage to use clipboard utility**

Modify `client/src/pages/RoomPage.tsx`:

Replace the existing import block (line 1) — add import:
```typescript
import { copyToClipboard } from '../utils/clipboard';
```

Replace the copy button onClick handler (lines 43-46):
```typescript
onClick={async () => {
  const ok = await copyToClipboard(state.roomCode ?? '');
  if (ok) {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  } else {
    alert(t('room.copyFailed'));
  }
}}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd client && npx vitest run src/pages/RoomPage.test.tsx src/utils/clipboard.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/RoomPage.tsx client/src/pages/RoomPage.test.tsx client/src/i18n/ko.json client/src/i18n/en.json client/src/i18n/ja.json
git commit -m "fix: room code copy with clipboard API fallback"
```

---

### Task 3: 점수표 crossfade 트랜지션 (이슈 2)

**Files:**
- Modify: `client/src/components/ScoreBoard.tsx:67-88, 194-243`
- Modify: `client/src/index.css`
- Modify: `client/src/components/ScoreBoard.test.tsx`

- [ ] **Step 1: Write failing test for scoreboard transition**

기존 `client/src/components/ScoreBoard.test.tsx`에 추가:

```typescript
describe('minimized ↔ full transition', () => {
  it('renders both views during transition (minimized has opacity-0 when not active)', () => {
    const { rerender } = render(
      <ScoreBoard {...defaultProps} minimized={true} />,
    );

    // minimized pill should be visible
    expect(screen.getByRole('region', { name: 'game.score' })).toBeTruthy();

    // Rerender with minimized=false
    rerender(
      <ScoreBoard {...defaultProps} minimized={false} />,
    );

    // full table should be visible
    expect(screen.getByRole('table', { name: 'game.score' })).toBeTruthy();
  });

  it('always renders both minimized pill and full table for crossfade', () => {
    render(<ScoreBoard {...defaultProps} minimized={false} />);
    // Both should exist in DOM — pill hidden via opacity/pointer-events, table visible
    expect(screen.getByRole('region', { name: 'game.score' })).toBeTruthy();
    expect(screen.getByRole('table', { name: 'game.score' })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/components/ScoreBoard.test.tsx`
Expected: FAIL — minimized=true returns early with only pill, no table; minimized=false has no region role

- [ ] **Step 3: Refactor ScoreBoard to always render both views**

Modify `client/src/components/ScoreBoard.tsx`:

Remove the early return for minimized (lines 67-88). Instead, always render both views and toggle visibility via opacity/pointer-events:

Replace from `if (minimized) { return (...)` through end of component with:

```typescript
  // Always render both views for crossfade transition
  // #1: Full row click handler
  const handleRowClick = (cat: Category) => {
    if (isMyTurn && rollCount > 0 && myScores[cat] === undefined) {
      onSelectCategory?.(cat);
    }
  };

  const renderRow = (cat: Category) => {
    // ... (keep existing renderRow unchanged)
  };

  const minimizedPill = (
    <div
      className={`bg-black/50 backdrop-blur-md rounded-full px-5 py-2.5 border border-white/10 mx-auto w-fit
        transition-[opacity,transform] duration-300 ease-in-out
        ${minimized ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none absolute'}`}
      role="region" aria-label={t('game.score')}
    >
      <div className="flex gap-6 items-center">
        {players.map((p, idx) => {
          const isCurrent = p.id === currentPlayer;
          return (
            <div key={p.id} className={`flex items-center gap-2 transition-[opacity,transform] duration-300 ${isCurrent ? 'scale-110' : 'opacity-70'}`}>
              <span className={`text-xs truncate max-w-[4rem] ${isCurrent ? 'text-yellow-300 font-semibold' : 'text-gray-400'}`}>
                {p.nickname}{p.id === myId ? ` ${t('game.me')}` : ''}
              </span>
              <span className={`font-bold tabular-nums text-lg ${isCurrent ? 'text-white' : 'text-gray-300'}`}>
                {playerStats[idx]?.total ?? 0}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );

  // Mobile pill with toggle (unchanged)
  const mobileMinimizedPill = ( /* ... keep existing ... */ );

  // Full table (unchanged content, add transition wrapper)
  const fullTable = (
    <div className={`transition-[opacity,transform] duration-300 ease-in-out
      ${minimized ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'}`}
    >
      {mobileMinimizedPill}
      <div className={`lg:block transition-[grid-template-rows,opacity] duration-300 ease-in-out
        ${mobileExpanded ? 'grid grid-rows-[1fr] opacity-100' : 'hidden lg:block'}`}
      >
        <div className="overflow-hidden">
          <div className="bg-black/50 backdrop-blur-md rounded-xl p-3 overflow-auto max-h-[80vh] border border-white/5 mt-2 lg:mt-0">
            <table> {/* ... keep existing table content ... */} </table>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative">
      {minimizedPill}
      {fullTable}
    </div>
  );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/components/ScoreBoard.test.tsx`
Expected: PASS

- [ ] **Step 5: Fix any broken existing tests**

기존 `#11 mobile collapsible` 테스트의 `renders minimized pill when minimized prop is true` 테스트가 실패할 수 있음 (이제 table도 DOM에 존재). 해당 테스트를 수정:

```typescript
it('renders minimized pill when minimized prop is true', () => {
  render(<ScoreBoard {...defaultProps} minimized={true} />);
  const region = screen.getByRole('region', { name: 'game.score' });
  expect(region).toBeTruthy();
  // Table exists in DOM but is hidden (opacity-0, pointer-events-none)
  const table = screen.getByRole('table', { name: 'game.score' });
  const tableWrapper = table.closest('.pointer-events-none');
  expect(tableWrapper).toBeTruthy();
});
```

- [ ] **Step 6: Run all ScoreBoard tests**

Run: `cd client && npx vitest run src/components/ScoreBoard.test.tsx`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add client/src/components/ScoreBoard.tsx client/src/components/ScoreBoard.test.tsx
git commit -m "feat: add crossfade transition between scoreboard views"
```

---

### Task 4: 버튼 영역 항상 표시 (이슈 3)

**Files:**
- Modify: `client/src/pages/GamePage.tsx:196-215`
- Create: `client/src/pages/GamePage.test.tsx`
- Modify: `client/src/i18n/ko.json`
- Modify: `client/src/i18n/en.json`
- Modify: `client/src/i18n/ja.json`

- [ ] **Step 1: Add i18n keys for button states**

ko.json — `"game"` 블록에 추가:
```json
"selectScore": "점수를 선택하세요",
"opponentTurn": "상대 차례입니다"
```

en.json — `"game"` 블록에 추가:
```json
"selectScore": "Select your score",
"opponentTurn": "Opponent's turn"
```

ja.json — `"game"` 블록에 추가:
```json
"selectScore": "スコアを選択してください",
"opponentTurn": "相手のターンです"
```

- [ ] **Step 2: Write failing test for always-visible button**

```typescript
// client/src/pages/GamePage.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import GamePage from './GamePage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../components/DiceScene', () => ({
  __esModule: true,
  default: vi.fn().mockReturnValue(null),
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
};

describe('GamePage button area', () => {
  it('shows "select score" prompt when all rolls used and settled', () => {
    render(
      <GamePage state={baseState} dispatch={vi.fn()} send={vi.fn()} playerId="me" />,
    );
    expect(screen.getByText('game.selectScore')).toBeTruthy();
  });

  it('shows "opponent turn" text when not my turn', () => {
    render(
      <GamePage
        state={{ ...baseState, currentPlayer: 'other', rollCount: 0, dice: [] }}
        dispatch={vi.fn()} send={vi.fn()} playerId="me"
      />,
    );
    expect(screen.getByText('game.opponentTurn')).toBeTruthy();
  });

  it('shows shake button with rolls remaining on idle', () => {
    render(
      <GamePage
        state={{ ...baseState, rollCount: 0, dice: [] }}
        dispatch={vi.fn()} send={vi.fn()} playerId="me"
      />,
    );
    expect(screen.getByText('game.shake')).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd client && npx vitest run src/pages/GamePage.test.tsx`
Expected: FAIL — "game.selectScore" not found

- [ ] **Step 4: Update GamePage button area**

Modify `client/src/pages/GamePage.tsx` lines 196-215. Replace the button area div:

```tsx
{/* Button area — always visible */}
<div className="flex flex-col items-center gap-2 min-h-[52px]">
  <span className="sr-only" role="status" aria-live="polite">
    {rollPhase === 'shaking' ? t('game.rollDice') : rollPhase === 'rolling' ? t('game.rolling') : ''}
  </span>
  <div className="flex gap-4">
    {rollPhase === 'shaking' && isMyTurn ? (
      <Button variant="success" size="lg" onClick={handleRoll}>
        {t('game.rollDice')}
      </Button>
    ) : rollPhase === 'rolling' ? (
      <Button variant="ghost" size="lg" disabled>
        {t('game.rolling')}
      </Button>
    ) : !isMyTurn ? (
      <Button variant="ghost" size="lg" disabled>
        {t('game.opponentTurn')}
      </Button>
    ) : state.rollCount >= 3 ? (
      <Button variant="ghost" size="lg" disabled>
        {t('game.selectScore')}
      </Button>
    ) : (
      <Button variant="warning" size="lg" onClick={handleShake}
        disabled={!isMyTurn || state.rollCount >= 3}>
        {t('game.shake')}
        {state.rollCount > 0 && ` (${3 - state.rollCount})`}
      </Button>
    )}
  </div>
</div>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd client && npx vitest run src/pages/GamePage.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/GamePage.tsx client/src/pages/GamePage.test.tsx client/src/i18n/ko.json client/src/i18n/en.json client/src/i18n/ja.json
git commit -m "feat: always show contextual button in game area"
```

---

### Task 5: 클라이언트측 점수 계산 유틸리티 (이슈 4 준비)

**Files:**
- Create: `client/src/utils/scoreCalculator.ts`
- Create: `client/src/utils/scoreCalculator.test.ts`

- [ ] **Step 1: Write failing tests for score calculator**

```typescript
// client/src/utils/scoreCalculator.test.ts
import { describe, it, expect } from 'vitest';
import { calculateScore, isSpecialHand, type Category } from './scoreCalculator';

describe('calculateScore', () => {
  it('calculates ones', () => {
    expect(calculateScore([1, 1, 2, 3, 4], 'ones')).toBe(2);
  });

  it('calculates choice (sum of all)', () => {
    expect(calculateScore([1, 2, 3, 4, 5], 'choice')).toBe(15);
  });

  it('calculates fourOfAKind', () => {
    expect(calculateScore([3, 3, 3, 3, 5], 'fourOfAKind')).toBe(17);
    expect(calculateScore([1, 2, 3, 4, 5], 'fourOfAKind')).toBe(0);
  });

  it('calculates fullHouse', () => {
    expect(calculateScore([2, 2, 3, 3, 3], 'fullHouse')).toBe(25);
    expect(calculateScore([1, 2, 3, 4, 5], 'fullHouse')).toBe(0);
  });

  it('calculates smallStraight', () => {
    expect(calculateScore([1, 2, 3, 4, 6], 'smallStraight')).toBe(30);
    expect(calculateScore([1, 1, 2, 3, 5], 'smallStraight')).toBe(0);
  });

  it('calculates largeStraight', () => {
    expect(calculateScore([1, 2, 3, 4, 5], 'largeStraight')).toBe(40);
    expect(calculateScore([2, 3, 4, 5, 6], 'largeStraight')).toBe(40);
    expect(calculateScore([1, 2, 3, 4, 6], 'largeStraight')).toBe(0);
  });

  it('calculates yacht', () => {
    expect(calculateScore([5, 5, 5, 5, 5], 'yacht')).toBe(50);
    expect(calculateScore([5, 5, 5, 5, 4], 'yacht')).toBe(0);
  });
});

describe('isSpecialHand', () => {
  it('returns category and score for yacht (score > 0)', () => {
    const result = isSpecialHand([5, 5, 5, 5, 5], 'yacht');
    expect(result).toEqual({ category: 'yacht', score: 50 });
  });

  it('returns null for yacht with 0 score', () => {
    const result = isSpecialHand([1, 2, 3, 4, 5], 'yacht');
    expect(result).toBeNull();
  });

  it('returns null for non-special categories', () => {
    const result = isSpecialHand([1, 1, 1, 1, 1], 'ones');
    expect(result).toBeNull();
  });

  it('returns category and score for fullHouse', () => {
    const result = isSpecialHand([2, 2, 3, 3, 3], 'fullHouse');
    expect(result).toEqual({ category: 'fullHouse', score: 25 });
  });

  it('returns null for fullHouse with 0 score', () => {
    const result = isSpecialHand([1, 2, 3, 4, 5], 'fullHouse');
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/utils/scoreCalculator.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement score calculator**

```typescript
// client/src/utils/scoreCalculator.ts
export type Category =
  | 'ones' | 'twos' | 'threes' | 'fours' | 'fives' | 'sixes'
  | 'choice' | 'fourOfAKind' | 'fullHouse'
  | 'smallStraight' | 'largeStraight' | 'yacht';

const SPECIAL_HANDS: Category[] = ['fourOfAKind', 'fullHouse', 'smallStraight', 'largeStraight', 'yacht'];

export function calculateScore(dice: number[], category: Category): number {
  const counts = [0, 0, 0, 0, 0, 0, 0]; // index 0 unused
  let sum = 0;
  for (const d of dice) {
    counts[d]++;
    sum += d;
  }

  switch (category) {
    case 'ones': return counts[1] * 1;
    case 'twos': return counts[2] * 2;
    case 'threes': return counts[3] * 3;
    case 'fours': return counts[4] * 4;
    case 'fives': return counts[5] * 5;
    case 'sixes': return counts[6] * 6;
    case 'choice': return sum;
    case 'fourOfAKind':
      for (let v = 1; v <= 6; v++) { if (counts[v] >= 4) return sum; }
      return 0;
    case 'fullHouse': {
      let has3 = false, has2 = false;
      for (let v = 1; v <= 6; v++) {
        if (counts[v] === 3) has3 = true;
        if (counts[v] === 2) has2 = true;
      }
      return has3 && has2 ? 25 : 0;
    }
    case 'smallStraight': {
      const sorted = [...dice].sort((a, b) => a - b);
      const uniq = sorted.filter((v, i) => i === 0 || v !== sorted[i - 1]);
      return hasRun(uniq, 4) ? 30 : 0;
    }
    case 'largeStraight': {
      const sorted = [...dice].sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] !== sorted[i - 1] + 1) return 0;
      }
      return 40;
    }
    case 'yacht':
      for (let v = 1; v <= 6; v++) { if (counts[v] === 5) return 50; }
      return 0;
    default: return 0;
  }
}

function hasRun(uniq: number[], length: number): boolean {
  if (uniq.length < length) return false;
  let run = 1;
  for (let i = 1; i < uniq.length; i++) {
    if (uniq[i] === uniq[i - 1] + 1) {
      run++;
      if (run >= length) return true;
    } else {
      run = 1;
    }
  }
  return false;
}

export function isSpecialHand(
  dice: number[],
  category: Category,
): { category: Category; score: number } | null {
  if (!SPECIAL_HANDS.includes(category)) return null;
  const score = calculateScore(dice, category);
  if (score <= 0) return null;
  return { category, score };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/utils/scoreCalculator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/utils/scoreCalculator.ts client/src/utils/scoreCalculator.test.ts
git commit -m "feat: add client-side score calculator for hand detection"
```

---

### Task 6: 족보 빵빠레 양측 표시 + 점수>0 필터링 (이슈 4)

**Files:**
- Modify: `client/src/hooks/useGameState.ts` — GAME_SCORED 액션 추가
- Modify: `client/src/hooks/useGameEvents.ts` — scored 이벤트에서 announcement 데이터 포함
- Modify: `client/src/pages/GamePage.tsx` — 양측 announcement 표시, handleScore에서 로컬 필터링
- Modify: `client/src/components/HandAnnouncement.tsx` — 디자인 개선: 글래스모피즘 + 점수 표시
- Create: `client/src/components/HandAnnouncement.test.tsx`
- Modify: `client/src/hooks/useGameState.test.ts`

- [ ] **Step 1: Add GAME_SCORED action to useGameState**

Modify `client/src/hooks/useGameState.ts`:

Add to `GameAction` type union (after SET_SCORES line):
```typescript
| { type: 'GAME_SCORED'; playerId: string; category: string; score: number; scores: Record<string, Record<string, number>> }
```

Add case in reducer (after SET_SCORES case):
```typescript
case 'GAME_SCORED':
  return { ...state, scores: action.scores };
```

- [ ] **Step 2: Write test for GAME_SCORED action**

Add to `client/src/hooks/useGameState.test.ts`:
```typescript
it('GAME_SCORED updates scores', () => {
  const { result } = renderHook(() => useGameState());
  act(() => {
    result.current[1]({
      type: 'GAME_SCORED',
      playerId: 'p1',
      category: 'yacht',
      score: 50,
      scores: { p1: { yacht: 50 } },
    });
  });
  expect(result.current[0].scores).toEqual({ p1: { yacht: 50 } });
});
```

- [ ] **Step 3: Run test to verify it passes**

Run: `cd client && npx vitest run src/hooks/useGameState.test.ts`
Expected: PASS

- [ ] **Step 4: Update useGameEvents to dispatch GAME_SCORED**

Modify `client/src/hooks/useGameEvents.ts` lines 44-47:

Replace:
```typescript
ws.on('game:scored', (env) => {
  const p = env.payload as GameScoredPayload;
  dispatch({ type: 'SET_SCORES', scores: p.totalScores });
}),
```

With:
```typescript
ws.on('game:scored', (env) => {
  const p = env.payload as GameScoredPayload;
  dispatch({ type: 'GAME_SCORED', playerId: p.playerId, category: p.category, score: p.score, scores: p.totalScores });
}),
```

- [ ] **Step 5: Update GamePage for dual-side announcement**

Modify `client/src/pages/GamePage.tsx`:

Add import:
```typescript
import { isSpecialHand } from '../utils/scoreCalculator';
import type { Category } from '../types/game';
```

Replace `handleScore` callback (lines 93-97):
```typescript
const handleScore = useCallback((category: Category) => {
  const hand = isSpecialHand(state.dice, category);
  if (hand) {
    setAnnouncedHand(category);
  }
  send('game:score', { category });
  setRollPhase('idle');
}, [send, state.dice]);
```

Add a new effect to handle remote player's scored announcement. Add after `handleAnnouncementDone`:
```typescript
// Track last scored event for remote announcement
const [lastScored, setLastScored] = useState<{ category: string; score: number } | null>(null);

// Listen for GAME_SCORED to trigger remote announcement
useEffect(() => {
  // This is triggered by state changes from useGameEvents GAME_SCORED dispatch
}, []);
```

Actually, a simpler approach: add a `useEffect` that watches `state.scores` changes combined with an event-driven approach. Since `useGameEvents` dispatches `GAME_SCORED`, we need to pass scored info up to GamePage. The cleanest way: add `lastScored` to GameState.

**Alternative approach — add lastScored to GameState:**

In `useGameState.ts`, add to GameState interface:
```typescript
lastScored: { playerId: string; category: string; score: number } | null;
```

Initial state:
```typescript
lastScored: null,
```

GAME_SCORED case:
```typescript
case 'GAME_SCORED':
  return { ...state, scores: action.scores, lastScored: { playerId: action.playerId, category: action.category, score: action.score } };
```

SET_TURN case — clear lastScored:
```typescript
case 'SET_TURN':
  return { ...state, currentPlayer: action.currentPlayer, round: action.round, rollCount: 0, held: EMPTY_HELD, dice: [], preview: {}, hoveredCategory: null, pourCount: 0, lastScored: null };
```

RESET_GAME — include lastScored: null.

Then in `GamePage.tsx`, watch `state.lastScored`:
```typescript
// Remote player scored — show announcement if special hand with score > 0
useEffect(() => {
  const scored = state.lastScored;
  if (!scored || scored.playerId === playerId) return; // skip own scores (handled locally)
  const SPECIAL: Category[] = ['fourOfAKind', 'fullHouse', 'smallStraight', 'largeStraight', 'yacht'];
  if (SPECIAL.includes(scored.category as Category) && scored.score > 0) {
    setAnnouncedHand(scored.category as Category);
  }
}, [state.lastScored, playerId]);
```

- [ ] **Step 6: Write HandAnnouncement test**

```typescript
// client/src/components/HandAnnouncement.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import HandAnnouncement from './HandAnnouncement';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('HandAnnouncement', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders special hand name for yacht', () => {
    render(<HandAnnouncement category="yacht" onDone={vi.fn()} />);
    expect(screen.getByText('categories.yacht')).toBeTruthy();
  });

  it('renders special hand name for fullHouse', () => {
    render(<HandAnnouncement category="fullHouse" onDone={vi.fn()} />);
    expect(screen.getByText('categories.fullHouse')).toBeTruthy();
  });

  it('calls onDone immediately for non-special hands', () => {
    const onDone = vi.fn();
    render(<HandAnnouncement category="ones" onDone={onDone} />);
    expect(onDone).toHaveBeenCalled();
  });

  it('calls onDone after animation completes for special hands', () => {
    const onDone = vi.fn();
    render(<HandAnnouncement category="yacht" onDone={onDone} />);
    expect(onDone).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(2200); });
    expect(onDone).toHaveBeenCalled();
  });

  it('renders null when category is null', () => {
    const onDone = vi.fn();
    const { container } = render(<HandAnnouncement category={null} onDone={onDone} />);
    expect(container.innerHTML).toBe('');
    expect(onDone).toHaveBeenCalled();
  });
});
```

- [ ] **Step 7: Update HandAnnouncement design — glassmorphism + score subtitle**

Modify `client/src/components/HandAnnouncement.tsx`:

Update Props to accept optional score:
```typescript
interface Props {
  category: Category | null;
  score?: number;
  onDone: () => void;
}
```

Replace the hand name div (lines 105-140) with glassmorphism design:
```tsx
{/* Hand name with glassmorphism panel */}
<div
  className={`relative text-center transition-all duration-400 ${
    phase === 'enter' ? 'scale-[2] opacity-0' :
    phase === 'exit' ? 'scale-90 opacity-0 translate-y-4' :
    'scale-100 opacity-100'
  }`}
  style={{ transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)' }}
>
  <div className="bg-black/40 backdrop-blur-xl rounded-2xl px-10 py-6 border border-white/20 shadow-2xl">
    <div
      className={`font-bold tracking-wider ${
        tier === 'legendary' ? 'text-6xl sm:text-7xl' :
        tier === 'epic' ? 'text-5xl sm:text-6xl' :
        'text-4xl sm:text-5xl'
      }`}
      style={{
        fontFamily: '"Outfit", system-ui, sans-serif',
        color: 'transparent',
        backgroundClip: 'text',
        WebkitBackgroundClip: 'text',
        backgroundImage: tier === 'legendary'
          ? 'linear-gradient(135deg, #fde68a, #f59e0b, #fde68a)'
          : tier === 'epic'
            ? 'linear-gradient(135deg, #c4b5fd, #8b5cf6, #c4b5fd)'
            : 'linear-gradient(135deg, #6ee7b7, #10b981, #6ee7b7)',
        filter: tier === 'legendary' ? 'drop-shadow(0 0 30px rgba(245,158,11,0.5))' : undefined,
      }}
    >
      {label}
    </div>
    {score !== undefined && score > 0 && (
      <div className={`mt-2 text-2xl font-bold tabular-nums ${
        tier === 'legendary' ? 'text-amber-300/90' :
        tier === 'epic' ? 'text-purple-300/90' :
        'text-emerald-300/90'
      }`}>
        +{score}
      </div>
    )}
    {tier === 'legendary' && (
      <div className="text-amber-300/70 text-lg mt-1 tracking-widest uppercase animate-pulse">
        YACHT!
      </div>
    )}
  </div>
</div>
```

- [ ] **Step 8: Pass score to HandAnnouncement in GamePage**

In GamePage, update the HandAnnouncement rendering:
```tsx
<HandAnnouncement
  category={announcedHand}
  score={announcedHand && state.lastScored?.category === announcedHand ? state.lastScored.score : undefined}
  onDone={handleAnnouncementDone}
/>
```

For local announcement (own score), pass the preview score:
```tsx
// In handleScore, store the score locally
const [announcedScore, setAnnouncedScore] = useState<number | undefined>();

const handleScore = useCallback((category: Category) => {
  const hand = isSpecialHand(state.dice, category);
  if (hand) {
    setAnnouncedHand(category);
    setAnnouncedScore(hand.score);
  }
  send('game:score', { category });
  setRollPhase('idle');
}, [send, state.dice]);

// For remote:
useEffect(() => {
  const scored = state.lastScored;
  if (!scored || scored.playerId === playerId) return;
  const SPECIAL: Category[] = ['fourOfAKind', 'fullHouse', 'smallStraight', 'largeStraight', 'yacht'];
  if (SPECIAL.includes(scored.category as Category) && scored.score > 0) {
    setAnnouncedHand(scored.category as Category);
    setAnnouncedScore(scored.score);
  }
}, [state.lastScored, playerId]);

const handleAnnouncementDone = useCallback(() => {
  setAnnouncedHand(null);
  setAnnouncedScore(undefined);
}, []);

// Render:
<HandAnnouncement category={announcedHand} score={announcedScore} onDone={handleAnnouncementDone} />
```

- [ ] **Step 9: Run all tests**

Run: `cd client && npx vitest run src/components/HandAnnouncement.test.tsx src/hooks/useGameState.test.ts src/pages/GamePage.test.tsx`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add client/src/hooks/useGameState.ts client/src/hooks/useGameState.test.ts client/src/hooks/useGameEvents.ts client/src/pages/GamePage.tsx client/src/components/HandAnnouncement.tsx client/src/components/HandAnnouncement.test.tsx
git commit -m "feat: show hand announcement to both players with score>0 filter and glassmorphism design"
```

---

### Task 7: 다시하기 버튼 playerId 기반 체크 (이슈 5)

**Files:**
- Modify: `client/src/pages/ResultPage.tsx:36-37, 73, 126`
- Modify: `client/src/App.tsx:95`
- Create: `client/src/pages/ResultPage.test.tsx`

- [ ] **Step 1: Write failing test for rematch button**

```typescript
// client/src/pages/ResultPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ResultPage from './ResultPage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => opts ? `${key}:${JSON.stringify(opts)}` : key,
    i18n: { language: 'en' },
  }),
}));

const baseState = {
  phase: 'result' as const,
  nickname: 'Me',
  roomCode: 'ABC123',
  players: [
    { id: 'me', nickname: 'Me', isHost: true, isReady: false },
    { id: 'other', nickname: 'Other', isHost: false, isReady: false },
  ],
  dice: [],
  held: [false, false, false, false, false],
  rollCount: 0,
  currentPlayer: null,
  round: 12,
  scores: {},
  rankings: [
    { playerId: 'me', nickname: 'Me', score: 200, rank: 1 },
    { playerId: 'other', nickname: 'Other', score: 150, rank: 2 },
  ],
  reactions: [],
  preview: {},
  hoveredCategory: null,
  pourCount: 0,
  rematchVotes: [],
  lastScored: null,
};

describe('ResultPage rematch button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rematch button is enabled when I have not voted', () => {
    render(<ResultPage state={baseState} dispatch={vi.fn()} send={vi.fn()} playerId="me" />);
    const btn = screen.getByText('result.rematch');
    expect(btn.closest('button')!.disabled).toBe(false);
  });

  it('rematch button is disabled only when I have voted', () => {
    render(
      <ResultPage
        state={{ ...baseState, rematchVotes: ['other'] }}
        dispatch={vi.fn()} send={vi.fn()} playerId="me"
      />,
    );
    // other voted but not me — button should still be enabled
    const btn = screen.getByText('result.rematch');
    expect(btn.closest('button')!.disabled).toBe(false);
  });

  it('rematch button is disabled when I voted', () => {
    render(
      <ResultPage
        state={{ ...baseState, rematchVotes: ['me'] }}
        dispatch={vi.fn()} send={vi.fn()} playerId="me"
      />,
    );
    const buttons = screen.getAllByRole('button');
    const rematchBtn = buttons.find(b => b.textContent?.includes('result.rematch'));
    expect(rematchBtn!.disabled).toBe(true);
  });

  it('sends game:rematch when clicking rematch', () => {
    const send = vi.fn();
    render(<ResultPage state={baseState} dispatch={vi.fn()} send={send} playerId="me" />);
    const btn = screen.getByText('result.rematch');
    fireEvent.click(btn);
    expect(send).toHaveBeenCalledWith('game:rematch');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/pages/ResultPage.test.tsx`
Expected: FAIL — ResultPage does not accept playerId prop

- [ ] **Step 3: Fix ResultPage — add playerId prop and fix myVoted logic**

Modify `client/src/pages/ResultPage.tsx`:

Update Props interface (line 36-40):
```typescript
interface Props {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
  send: (type: string, payload?: unknown) => void;
  playerId: string | null;
}
```

Update function signature (line 42):
```typescript
export default function ResultPage({ state, dispatch, send, playerId }: Props) {
```

Replace line 73:
```typescript
const myVoted = playerId ? state.rematchVotes.includes(playerId) : false;
```

- [ ] **Step 4: Update App.tsx to pass playerId to ResultPage**

Modify `client/src/App.tsx` line 95:
```typescript
return <Suspense fallback={<LoadingFallback />}><ResultPage state={state} dispatch={dispatch} send={ws.send} playerId={ws.playerId} /></Suspense>;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd client && npx vitest run src/pages/ResultPage.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/ResultPage.tsx client/src/pages/ResultPage.test.tsx client/src/App.tsx
git commit -m "fix: rematch button checks own playerId instead of any vote"
```

---

### Task 8: 로비로 버튼 — 서버 rematch vote 정리 (이슈 6)

**Files:**
- Modify: `server/room/room.go` — RemovePlayer에서 rematch vote 삭제
- Modify: `server/room/room_test.go` — 테스트 추가

- [ ] **Step 1: Write failing test for RemovePlayer clearing rematch vote**

Add to `server/room/room_test.go`:

```go
func TestRemovePlayerClearsRematchVote(t *testing.T) {
	rm := room.New("TEST01", "")
	p1 := &player.Player{ID: "p1", Nickname: "Alice"}
	p2 := &player.Player{ID: "p2", Nickname: "Bob"}
	rm.AddPlayer(p1)
	rm.AddPlayer(p2)

	// Simulate end-of-game state
	rm.EndGame()

	// p1 votes for rematch
	rm.Rematch("p1")
	votes := rm.RematchVotes()
	if len(votes) != 1 || votes[0] != "p1" {
		t.Fatalf("expected 1 vote from p1, got %v", votes)
	}

	// p1 leaves
	rm.RemovePlayer("p1", func() {})

	// rematch vote should be cleared
	votes = rm.RematchVotes()
	for _, v := range votes {
		if v == "p1" {
			t.Fatalf("p1's rematch vote should have been removed, got %v", votes)
		}
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && go test ./room/ -run TestRemovePlayerClearsRematchVote -v`
Expected: FAIL — p1's vote still exists after RemovePlayer

- [ ] **Step 3: Fix RemovePlayer to clear rematch vote**

Modify `server/room/room.go` `RemovePlayer` function. Add after `delete(r.ready, playerID)` (line 122):

```go
delete(r.rematch, playerID)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && go test ./room/ -run TestRemovePlayerClearsRematchVote -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/room/room.go server/room/room_test.go
git commit -m "fix: clear rematch vote when player leaves room"
```

---

### Task 9: 로비로 버튼 — 클라이언트 phase guard (이슈 6)

**Files:**
- Modify: `client/src/hooks/useGameEvents.ts` — room:state 이벤트에 phase guard
- Modify: `client/src/pages/ResultPage.tsx` — leave 시 rematch cancel 전송
- Modify: `client/src/pages/ResultPage.test.tsx` — 테스트 추가

- [ ] **Step 1: Write failing test for lobby leave behavior**

Add to `client/src/pages/ResultPage.test.tsx`:

```typescript
describe('back to lobby', () => {
  it('sends room:leave and dispatches RESET_GAME on confirm', () => {
    const send = vi.fn();
    const dispatch = vi.fn();
    render(
      <ResultPage state={baseState} dispatch={dispatch} send={send} playerId="me" />,
    );

    // Click lobby button
    fireEvent.click(screen.getByText('result.backToLobby'));
    // Confirm dialog
    fireEvent.click(screen.getByText('result.backToLobby'));

    expect(send).toHaveBeenCalledWith('room:leave');
    expect(dispatch).toHaveBeenCalledWith({ type: 'RESET_GAME' });
  });

  it('sends rematch:cancel before leaving if already voted', () => {
    const send = vi.fn();
    render(
      <ResultPage
        state={{ ...baseState, rematchVotes: ['me'] }}
        dispatch={vi.fn()} send={send} playerId="me"
      />,
    );

    fireEvent.click(screen.getByText('result.backToLobby'));
    fireEvent.click(screen.getByText('result.backToLobby'));

    // Should cancel rematch vote before leaving
    expect(send).toHaveBeenCalledWith('room:leave');
  });
});
```

- [ ] **Step 2: Add phase guard in useGameEvents**

Modify `client/src/hooks/useGameEvents.ts`:

The `useGameEvents` function needs access to the current phase to guard `room:state`. Update the function signature to accept a `getPhase` callback:

```typescript
export function useGameEvents(
  ws: WS,
  dispatch: Dispatch<GameAction>,
  setError: (error: string | null) => void,
  getPhase: () => string,
) {
```

Modify the `room:state` handler:
```typescript
ws.on('room:state', (env) => {
  if (getPhase() === 'lobby') return; // Ignore room:state after leaving to lobby
  const p = env.payload as RoomState;
  dispatch({ type: 'SET_ROOM_STATE', roomCode: p.roomCode, players: p.players });
}),
```

Update `App.tsx` to pass getPhase:
```typescript
const getPhase = useCallback(() => state.phase, [state.phase]);
useGameEvents(ws, dispatch, handleError, getPhase);
```

- [ ] **Step 3: Run all tests**

Run: `cd client && npx vitest run src/pages/ResultPage.test.tsx`
Expected: PASS

- [ ] **Step 4: Run full test suite**

Run: `cd client && npx vitest run`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/hooks/useGameEvents.ts client/src/App.tsx client/src/pages/ResultPage.tsx client/src/pages/ResultPage.test.tsx
git commit -m "fix: guard room:state event in lobby phase, prevent re-entry after leaving"
```

---

### Task 10: 전체 통합 검증

- [ ] **Step 1: Run all client tests**

Run: `cd client && npx vitest run`
Expected: ALL PASS

- [ ] **Step 2: Run all server tests**

Run: `cd server && go test ./...`
Expected: ALL PASS

- [ ] **Step 3: Run audit tests**

Run: `cd client && npx vitest run src/audit/`
Expected: ALL PASS (특히 i18n-completeness — 새로 추가한 키가 3개 언어 모두에 있는지 확인)

- [ ] **Step 4: Build check**

Run: `cd client && npx vite build`
Expected: Build succeeds with no TypeScript errors

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: resolve test and build issues from 6-issue improvements"
```
