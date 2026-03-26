import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import GamePage from './GamePage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

let capturedOnResult: (() => void) | null = null;

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

vi.mock('../components/ScoreBoard', () => ({
  __esModule: true,
  default: () => <div data-testid="scoreboard" />,
}));

vi.mock('../components/HandAnnouncement', () => ({
  __esModule: true,
  default: ({ onDone }: { category: string | null; onDone: () => void }) => {
    onDone();
    return null;
  },
}));

// Track every render call to DiceTray with its settled + dice props
const settledHistory: { settled: boolean; dice: number[] }[] = [];

vi.mock('../components/DiceTray', () => ({
  __esModule: true,
  default: (props: { dice: number[]; settled: boolean }) => {
    settledHistory.push({ settled: props.settled, dice: [...props.dice] });
    return <div data-testid="dice-tray" />;
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
  dice: [] as number[],
  held: [false, false, false, false, false],
  rollCount: 0,
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
  disconnectedPlayers: [],
  pausedFor: null,
  toasts: [],
};

describe('DiceTray dice flash bug', () => {
  beforeEach(() => {
    settledHistory.length = 0;
    capturedOnResult = null;
  });

  it('should NOT pass settled=true to DiceTray when first roll arrives (rollCount 0→1)', () => {
    const { rerender } = render(
      <GamePage
        state={{ ...baseState, rollCount: 0, dice: [] }}
        dispatch={vi.fn()} send={vi.fn()} playerId="me"
      />,
    );

    settledHistory.length = 0;

    // Server responds with dice (rollCount 0 → 1)
    rerender(
      <GamePage
        state={{ ...baseState, rollCount: 1, dice: [3, 4, 2, 5, 1] }}
        dispatch={vi.fn()} send={vi.fn()} playerId="me"
      />,
    );

    // DiceTray must NEVER receive settled=true with the new dice values
    const flashRenders = settledHistory.filter(
      r => r.settled === true && r.dice.length === 5,
    );
    expect(flashRenders).toHaveLength(0);
  });

  it('should NOT pass settled=true to DiceTray on 2nd roll (settled → new dice)', () => {
    const { rerender } = render(
      <GamePage
        state={{ ...baseState, rollCount: 1, dice: [1, 2, 3, 4, 5] }}
        dispatch={vi.fn()} send={vi.fn()} playerId="me"
      />,
    );

    // Settle the 1st roll
    if (capturedOnResult) act(() => capturedOnResult!());

    settledHistory.length = 0;

    // Server responds with 2nd roll (rollCount 1 → 2, new dice)
    rerender(
      <GamePage
        state={{ ...baseState, rollCount: 2, dice: [6, 6, 6, 6, 6] }}
        dispatch={vi.fn()} send={vi.fn()} playerId="me"
      />,
    );

    // DiceTray must NEVER receive settled=true with new dice [6,6,6,6,6]
    const flashRenders = settledHistory.filter(
      r => r.settled === true && r.dice[0] === 6,
    );
    expect(flashRenders).toHaveLength(0);
  });

  it('should pass settled=true to DiceTray after onResult callback fires', () => {
    render(
      <GamePage
        state={{ ...baseState, rollCount: 1, dice: [3, 4, 2, 5, 1] }}
        dispatch={vi.fn()} send={vi.fn()} playerId="me"
      />,
    );

    settledHistory.length = 0;

    // Trigger settle
    expect(capturedOnResult).not.toBeNull();
    act(() => capturedOnResult!());

    // After settle, DiceTray should receive settled=true
    const settledRenders = settledHistory.filter(r => r.settled === true);
    expect(settledRenders.length).toBeGreaterThan(0);
  });
});
