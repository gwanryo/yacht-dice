import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import GamePage from './GamePage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Capture onResult so we can trigger settle manually
let capturedOnResult: (() => void) | null = null;

// NOTE: This mock replaces the simpler mock that was here before.
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

// HandAnnouncement — simplified mock so we can detect when it appears
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

describe('GamePage button area', () => {
  it('shows "select score" prompt when all rolls used', () => {
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
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId('hand-announcement').textContent).toContain('yacht');

    // Simulate second roll with same yacht dice (rollCount increments)
    rerender(
      <GamePage
        state={{ ...baseState, dice: [3, 3, 3, 3, 3], rollCount: 2 }}
        dispatch={vi.fn()} send={vi.fn()} playerId="me"
      />,
    );

    // Second settle — yacht announced again
    act(() => capturedOnResult!());
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId('hand-announcement').textContent).toContain('yacht');
  });
});
