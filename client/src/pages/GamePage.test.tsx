import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GamePage from './GamePage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Capture onResult so we can trigger settle manually
let capturedOnResult: (() => void) | null = null;

// Persistent mock fns — accessible across re-renders
const mockShake = vi.fn();
const mockRoll = vi.fn().mockReturnValue(true);

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
        shake: mockShake,
        roll: mockRoll,
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

// Capture ScoreBoard preview prop
let capturedPreview: Record<string, number> = {};
vi.mock('../components/ScoreBoard', () => ({
  __esModule: true,
  default: (props: { preview: Record<string, number> }) => {
    capturedPreview = props.preview;
    return <div data-testid="scoreboard" />;
  },
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
  disconnectedPlayers: [],
  pausedFor: null,
  toasts: [],
};

describe('GamePage button area', () => {
  it('shows disabled tray action when all rolls used', () => {
    render(
      <GamePage state={baseState} dispatch={vi.fn()} send={vi.fn()} playerId="me" />,
    );
    // When rollCount >= 3, tray action shows "—" (no action available)
    expect(screen.getByText('—')).toBeTruthy();
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

describe('GamePage layout — dice tray must not be clipped', () => {
  it('bottom area has shrink-0 to prevent compression on small screens', () => {
    const { container } = render(
      <GamePage state={baseState} dispatch={vi.fn()} send={vi.fn()} playerId="me" />,
    );
    const main = container.querySelector('main')!;
    const bottomArea = main.lastElementChild as HTMLElement;
    expect(bottomArea.className).toContain('shrink-0');
  });

  it('main area has min-h-0 to allow flex content to shrink', () => {
    const { container } = render(
      <GamePage state={baseState} dispatch={vi.fn()} send={vi.fn()} playerId="me" />,
    );
    const main = container.querySelector('main')!;
    const children = Array.from(main.children);
    const middleArea = children[1] as HTMLElement;
    expect(middleArea.className).toContain('min-h-0');
  });

  it('scoreboard container should not have overflow-y-auto (prevents double scrollbar)', () => {
    const { container } = render(
      <GamePage state={baseState} dispatch={vi.fn()} send={vi.fn()} playerId="me" />,
    );
    const scoreboardWrapper = container.querySelector('[data-testid="scoreboard"]')?.parentElement;
    expect(scoreboardWrapper).toBeTruthy();
    expect(scoreboardWrapper!.className).not.toContain('overflow-y-auto');
  });
});

describe('GamePage roll button race condition', () => {
  const mockSend = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnResult = null;
  });

  it('should NOT show Roll! button immediately after clicking Shake! (before server responds)', async () => {
    const user = userEvent.setup();
    const state = { ...baseState, rollCount: 0, dice: [] as number[] };

    render(
      <GamePage state={state} dispatch={vi.fn()} send={mockSend} playerId="me" />,
    );

    // Shake! button should be visible
    const shakeButton = screen.getByRole('button', { name: 'game.shake' });
    expect(shakeButton).toBeInTheDocument();

    // Click Shake!
    await user.click(shakeButton);

    // game:roll should be sent to server
    expect(mockSend).toHaveBeenCalledWith('game:roll');

    // Roll! button should NOT appear — scene hasn't started shaking yet
    expect(screen.queryByRole('button', { name: 'game.rollDice' })).not.toBeInTheDocument();
  });

  it('should show Roll! button only after server responds (rollCount increases)', async () => {
    const user = userEvent.setup();
    const state = { ...baseState, rollCount: 0, dice: [] as number[] };

    const { rerender } = render(
      <GamePage state={state} dispatch={vi.fn()} send={mockSend} playerId="me" />,
    );

    // Click Shake!
    await user.click(screen.getByRole('button', { name: 'game.shake' }));
    expect(mockSend).toHaveBeenCalledWith('game:roll');

    // Simulate server response: rollCount 0 → 1
    const updatedState = { ...baseState, rollCount: 1, dice: [3, 4, 2, 5, 1] };
    rerender(
      <GamePage state={updatedState} dispatch={vi.fn()} send={mockSend} playerId="me" />,
    );

    // NOW Roll! button should appear (useEffect called api.shake())
    expect(screen.getByRole('button', { name: 'game.rollDice' })).toBeInTheDocument();
    expect(mockShake).toHaveBeenCalled();
  });

  it('should prevent duplicate game:roll sends before server responds', async () => {
    const user = userEvent.setup();
    const state = { ...baseState, rollCount: 0, dice: [] as number[] };

    render(
      <GamePage state={state} dispatch={vi.fn()} send={mockSend} playerId="me" />,
    );

    const shakeButton = screen.getByRole('button', { name: 'game.shake' });

    // Click Shake! twice rapidly
    await user.click(shakeButton);
    await user.click(shakeButton);

    // game:roll should only be sent once
    const rollCalls = mockSend.mock.calls.filter((args) => args[0] === 'game:roll');
    expect(rollCalls).toHaveLength(1);
  });

  it('should allow Shake! again after a full roll cycle (settle → shake)', async () => {
    const user = userEvent.setup();
    const state = { ...baseState, rollCount: 0, dice: [] as number[] };

    const { rerender } = render(
      <GamePage state={state} dispatch={vi.fn()} send={mockSend} playerId="me" />,
    );

    // 1st Shake!
    await user.click(screen.getByRole('button', { name: 'game.shake' }));
    expect(mockSend).toHaveBeenCalledWith('game:roll');

    // Server responds
    rerender(
      <GamePage state={{ ...baseState, rollCount: 1, dice: [3, 4, 2, 5, 1] }} dispatch={vi.fn()} send={mockSend} playerId="me" />,
    );

    // Roll!
    await user.click(screen.getByRole('button', { name: 'game.rollDice' }));

    // Simulate dice settle
    act(() => capturedOnResult!());

    // Shake! button should reappear (rollCount=1, still <3)
    const shakeAgain = screen.getByRole('button', { name: /game\.shake/ });
    expect(shakeAgain).toBeInTheDocument();

    // 2nd Shake! should work
    mockSend.mockClear();
    await user.click(shakeAgain);
    const rollCalls = mockSend.mock.calls.filter((args) => args[0] === 'game:roll');
    expect(rollCalls).toHaveLength(1);
  });

  it('should reset pending state on turn change', async () => {
    const user = userEvent.setup();
    const state = { ...baseState, rollCount: 0, dice: [] as number[] };

    const { rerender } = render(
      <GamePage state={state} dispatch={vi.fn()} send={mockSend} playerId="me" />,
    );

    // Click Shake! (pending = true)
    await user.click(screen.getByRole('button', { name: 'game.shake' }));

    // Turn changes before server responds
    rerender(
      <GamePage state={{ ...baseState, rollCount: 0, dice: [], currentPlayer: 'other' }} dispatch={vi.fn()} send={mockSend} playerId="me" />,
    );

    // Turn back to me
    mockSend.mockClear();
    rerender(
      <GamePage state={{ ...baseState, rollCount: 0, dice: [], currentPlayer: 'me' }} dispatch={vi.fn()} send={mockSend} playerId="me" />,
    );

    // Shake! should be available again (pending was reset on turn change)
    const shakeButton = screen.getByRole('button', { name: 'game.shake' });
    await user.click(shakeButton);
    expect(mockSend).toHaveBeenCalledWith('game:roll');
  });
});

describe('GamePage preview timing', () => {
  beforeEach(() => {
    capturedOnResult = null;
    capturedPreview = {};
  });

  it('should NOT pass preview to ScoreBoard during shaking/rolling', () => {
    const preview = { ones: 1, twos: 4, choice: 15 };

    // Render with rollCount=0 (idle), then update to rollCount=1 (shaking)
    const { rerender } = render(
      <GamePage
        state={{ ...baseState, dice: [], rollCount: 0, preview: {} }}
        dispatch={vi.fn()} send={vi.fn()} playerId="me"
      />,
    );

    // Simulate GAME_ROLLED with new rollCount and preview
    rerender(
      <GamePage
        state={{ ...baseState, dice: [1, 2, 3, 4, 5], rollCount: 1, preview }}
        dispatch={vi.fn()} send={vi.fn()} playerId="me"
      />,
    );

    // After effects settle, rollPhase should be 'shaking' and preview NOT passed
    expect(capturedPreview).toEqual({});
  });

  it('should pass preview to ScoreBoard after dice settle', async () => {
    const preview = { ones: 1, twos: 4, choice: 15 };

    const { rerender } = render(
      <GamePage
        state={{ ...baseState, dice: [], rollCount: 0, preview: {} }}
        dispatch={vi.fn()} send={vi.fn()} playerId="me"
      />,
    );

    rerender(
      <GamePage
        state={{ ...baseState, dice: [1, 2, 3, 4, 5], rollCount: 1, preview }}
        dispatch={vi.fn()} send={vi.fn()} playerId="me"
      />,
    );

    // Trigger dice settle
    expect(capturedOnResult).not.toBeNull();
    act(() => capturedOnResult!());

    // After settle, preview should be passed
    expect(capturedPreview).toEqual(preview);
  });
});
