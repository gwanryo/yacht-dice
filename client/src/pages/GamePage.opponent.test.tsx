import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import GamePage from './GamePage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Capture the onResult callback so we can trigger 'settled' from tests
let capturedOnResult: ((values: number[]) => void) | null = null;

vi.mock('../components/DiceScene', async () => {
  const { forwardRef, useImperativeHandle } = await import('react');
  return {
    __esModule: true,
    default: forwardRef(function FakeDiceScene(_: unknown, ref: React.Ref<unknown>) {
      useImperativeHandle(ref, () => ({
        setValues: vi.fn(),
        setHeld: vi.fn(),
        shake: vi.fn(),
        roll: vi.fn().mockReturnValue(true),
        onResult: (cb: (values: number[]) => void) => { capturedOnResult = cb; },
      }));
      return null;
    }),
  };
});

vi.mock('../components/ErrorBoundary', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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
  currentPlayer: 'other',
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

describe('GamePage opponent status text', () => {
  beforeEach(() => { capturedOnResult = null; });

  it('shows opponentTurn when opponent is idle', () => {
    render(
      <GamePage state={baseState} dispatch={vi.fn()} send={vi.fn()} playerId="me" />,
    );
    expect(screen.getByText('game.opponentTurn')).toBeTruthy();
  });

  it('shows opponentShaking when opponent shakes', () => {
    const { rerender } = render(
      <GamePage state={baseState} dispatch={vi.fn()} send={vi.fn()} playerId="me" />,
    );
    act(() => {
      rerender(
        <GamePage
          state={{ ...baseState, rollCount: 1, dice: [1, 2, 3, 4, 5] }}
          dispatch={vi.fn()} send={vi.fn()} playerId="me"
        />,
      );
    });
    expect(screen.getByText('game.opponentShaking')).toBeTruthy();
  });

  it('shows opponentRolled when opponent rolls', () => {
    const { rerender } = render(
      <GamePage state={baseState} dispatch={vi.fn()} send={vi.fn()} playerId="me" />,
    );
    act(() => {
      rerender(
        <GamePage
          state={{ ...baseState, rollCount: 1, dice: [1, 2, 3, 4, 5] }}
          dispatch={vi.fn()} send={vi.fn()} playerId="me"
        />,
      );
    });
    act(() => {
      rerender(
        <GamePage
          state={{ ...baseState, rollCount: 1, dice: [1, 2, 3, 4, 5], pourCount: 1 }}
          dispatch={vi.fn()} send={vi.fn()} playerId="me"
        />,
      );
    });
    expect(screen.getByText('game.opponentRolled')).toBeTruthy();
  });

  it('shows opponentChoosing when opponent dice settled', () => {
    const { rerender } = render(
      <GamePage state={baseState} dispatch={vi.fn()} send={vi.fn()} playerId="me" />,
    );
    // shaking
    act(() => {
      rerender(
        <GamePage
          state={{ ...baseState, rollCount: 1, dice: [1, 2, 3, 4, 5] }}
          dispatch={vi.fn()} send={vi.fn()} playerId="me"
        />,
      );
    });
    // rolling
    act(() => {
      rerender(
        <GamePage
          state={{ ...baseState, rollCount: 1, dice: [1, 2, 3, 4, 5], pourCount: 1 }}
          dispatch={vi.fn()} send={vi.fn()} playerId="me"
        />,
      );
    });
    // settled — trigger onResult callback
    act(() => {
      capturedOnResult?.([1, 2, 3, 4, 5]);
    });
    expect(screen.getByText('game.opponentChoosing')).toBeTruthy();
  });
});

describe('GamePage opponent tray integration', () => {
  beforeEach(() => { capturedOnResult = null; });

  it('shows tray with empty slots and "—" action when opponent is idle (rollCount=0)', () => {
    const { container } = render(
      <GamePage state={baseState} dispatch={vi.fn()} send={vi.fn()} playerId="me" />,
    );
    // Tray should render with empty slots (not null)
    expect(container.querySelector('.dice-tray')).not.toBeNull();
    // Action label shows "—"
    expect(screen.getByText('—')).toBeTruthy();
    // Status text below tray
    expect(screen.getByText('game.opponentTurn')).toBeTruthy();
  });

  it('shows tray with dice and "—" action when opponent has rolled', () => {
    const { rerender, container } = render(
      <GamePage state={baseState} dispatch={vi.fn()} send={vi.fn()} playerId="me" />,
    );
    act(() => {
      rerender(
        <GamePage
          state={{ ...baseState, rollCount: 1, dice: [2, 3, 4, 5, 6] }}
          dispatch={vi.fn()} send={vi.fn()} playerId="me"
        />,
      );
    });
    // Tray visible with dice
    expect(container.querySelector('.dice-tray')).not.toBeNull();
    // Action is "—" (opponent can't act from our side)
    expect(screen.getByText('—')).toBeTruthy();
    // Status text shows shaking phase
    expect(screen.getByText('game.opponentShaking')).toBeTruthy();
  });

  it('does NOT show status text when it is my turn', () => {
    render(
      <GamePage
        state={{ ...baseState, currentPlayer: 'me', rollCount: 1, dice: [1, 2, 3, 4, 5] }}
        dispatch={vi.fn()} send={vi.fn()} playerId="me"
      />,
    );
    // My-turn status texts should not be present
    expect(screen.queryByText('game.opponentTurn')).toBeNull();
    expect(screen.queryByText('game.opponentShaking')).toBeNull();
    expect(screen.queryByText('game.opponentChoosing')).toBeNull();
    expect(screen.queryByText('game.rolling')).toBeNull();
    expect(screen.queryByText('game.selectScore')).toBeNull();
  });

  it('status text has aria-live for accessibility', () => {
    render(
      <GamePage state={baseState} dispatch={vi.fn()} send={vi.fn()} playerId="me" />,
    );
    const statusEl = screen.getByText('game.opponentTurn');
    expect(statusEl.getAttribute('aria-live')).toBe('polite');
  });
});

describe('GamePage hand announcement', () => {
  beforeEach(() => { capturedOnResult = null; });

  it('shows announcement on settle when dice form a special hand (my turn)', async () => {
    const { rerender } = render(
      <GamePage
        state={{ ...baseState, currentPlayer: 'me', rollCount: 0, dice: [] }}
        dispatch={vi.fn()} send={vi.fn()} playerId="me"
      />,
    );
    // shake
    act(() => {
      rerender(
        <GamePage
          state={{ ...baseState, currentPlayer: 'me', rollCount: 1, dice: [1, 2, 3, 4, 5] }}
          dispatch={vi.fn()} send={vi.fn()} playerId="me"
        />,
      );
    });
    // settled with large straight [1,2,3,4,5]
    act(() => {
      capturedOnResult?.([1, 2, 3, 4, 5]);
    });
    await act(async () => { await Promise.resolve(); });
    // HandAnnouncement should render the category name (may appear in announcement + table)
    expect(screen.getAllByText('categories.largeStraight').length).toBeGreaterThanOrEqual(1);
  });

  it('shows announcement on settle for opponent too (both players see it)', async () => {
    const { rerender } = render(
      <GamePage state={baseState} dispatch={vi.fn()} send={vi.fn()} playerId="me" />,
    );
    // opponent shakes with yacht [6,6,6,6,6]
    act(() => {
      rerender(
        <GamePage
          state={{ ...baseState, rollCount: 1, dice: [6, 6, 6, 6, 6] }}
          dispatch={vi.fn()} send={vi.fn()} playerId="me"
        />,
      );
    });
    // opponent rolls
    act(() => {
      rerender(
        <GamePage
          state={{ ...baseState, rollCount: 1, dice: [6, 6, 6, 6, 6], pourCount: 1 }}
          dispatch={vi.fn()} send={vi.fn()} playerId="me"
        />,
      );
    });
    // settled
    act(() => {
      capturedOnResult?.([6, 6, 6, 6, 6]);
    });
    await act(async () => { await Promise.resolve(); });
    // Both players should see yacht announcement
    expect(screen.getAllByText('categories.yacht').length).toBeGreaterThanOrEqual(1);
  });

  it('does NOT show announcement twice via lastScored (removed)', () => {
    const { rerender } = render(
      <GamePage state={baseState} dispatch={vi.fn()} send={vi.fn()} playerId="me" />,
    );
    // Simulate lastScored arriving (should NOT trigger announcement since effect was removed)
    act(() => {
      rerender(
        <GamePage
          state={{ ...baseState, lastScored: { playerId: 'other', category: 'yacht', score: 50 } }}
          dispatch={vi.fn()} send={vi.fn()} playerId="me"
        />,
      );
    });
    // No announcement overlay should appear (role="alert" is the HandAnnouncement container)
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('SPECIAL_CATEGORIES order', () => {
  it('yacht (50pts) should be checked before smallStraight (30pts)', async () => {
    // Import the module to check constant order
    // We verify via the audit test, but also check behavior:
    // If dice are [1,2,3,4,5] — both largeStraight(40) and smallStraight(30) match.
    // The announcement should show largeStraight (higher score first).
    const { rerender } = render(
      <GamePage
        state={{ ...baseState, currentPlayer: 'me', rollCount: 0, dice: [] }}
        dispatch={vi.fn()} send={vi.fn()} playerId="me"
      />,
    );
    act(() => {
      rerender(
        <GamePage
          state={{ ...baseState, currentPlayer: 'me', rollCount: 1, dice: [1, 2, 3, 4, 5] }}
          dispatch={vi.fn()} send={vi.fn()} playerId="me"
        />,
      );
    });
    act(() => {
      capturedOnResult?.([1, 2, 3, 4, 5]);
    });
    await act(async () => { await Promise.resolve(); });
    // Should show largeStraight announcement (role="alert" contains the hand name)
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('categories.largeStraight');
    expect(alert.textContent).not.toContain('categories.smallStraight');
  });
});
