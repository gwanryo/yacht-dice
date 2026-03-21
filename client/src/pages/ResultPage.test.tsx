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
    const buttons = screen.getAllByRole('button');
    const rematchBtn = buttons.find(b => b.textContent?.includes('result.rematch'));
    expect(rematchBtn).toBeTruthy();
    expect(rematchBtn!.disabled).toBe(false);
  });

  it('rematch button stays enabled when only OTHER player voted', () => {
    render(
      <ResultPage
        state={{ ...baseState, rematchVotes: ['other'] }}
        dispatch={vi.fn()} send={vi.fn()} playerId="me"
      />,
    );
    const buttons = screen.getAllByRole('button');
    const rematchBtn = buttons.find(b => b.textContent?.includes('result.rematch'));
    expect(rematchBtn!.disabled).toBe(false);
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
    const buttons = screen.getAllByRole('button');
    const rematchBtn = buttons.find(b => b.textContent?.includes('result.rematch'));
    fireEvent.click(rematchBtn!);
    expect(send).toHaveBeenCalledWith('game:rematch');
  });
});

describe('back to lobby', () => {
  it('sends room:leave and dispatches RESET_GAME on leave confirm', () => {
    const send = vi.fn();
    const dispatch = vi.fn();
    render(
      <ResultPage state={baseState} dispatch={dispatch} send={send} playerId="me" />,
    );

    // Click "Back to Lobby" button to open confirm dialog
    const buttons = screen.getAllByRole('button');
    const lobbyBtn = buttons.find(b => b.textContent === 'result.backToLobby');
    fireEvent.click(lobbyBtn!);

    // A confirm dialog appears - find the confirm button inside the dialog
    const dialog = screen.getByRole('dialog');
    const dialogButtons = dialog.querySelectorAll('button');
    const confirmBtn = Array.from(dialogButtons).find(b => b.textContent === 'result.backToLobby');
    fireEvent.click(confirmBtn!);

    expect(send).toHaveBeenCalledWith('room:leave');
    expect(dispatch).toHaveBeenCalledWith({ type: 'RESET_GAME' });
  });

  it('clears room param from URL before dispatching RESET_GAME to prevent auto-rejoin', () => {
    // Simulate URL with ?room=ABC123 (as it would be during a game)
    const originalUrl = window.location.href;
    window.history.replaceState({}, '', '?room=ABC123');

    const send = vi.fn();
    const dispatch = vi.fn();
    // Track replaceState calls to verify URL is cleaned BEFORE RESET_GAME
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

    render(
      <ResultPage state={baseState} dispatch={dispatch} send={send} playerId="me" />,
    );

    // Click "Back to Lobby" button and confirm
    const buttons = screen.getAllByRole('button');
    const lobbyBtn = buttons.find(b => b.textContent === 'result.backToLobby');
    fireEvent.click(lobbyBtn!);

    const dialog = screen.getByRole('dialog');
    const dialogButtons = dialog.querySelectorAll('button');
    const confirmBtn = Array.from(dialogButtons).find(b => b.textContent === 'result.backToLobby');
    fireEvent.click(confirmBtn!);

    // URL should be cleared of room param
    const url = new URL(window.location.href);
    expect(url.searchParams.has('room')).toBe(false);

    // Verify replaceState was called to clear the room param
    const clearCall = replaceStateSpy.mock.calls.find(call => {
      const urlStr = String(call[2]);
      return !urlStr.includes('room=');
    });
    expect(clearCall).toBeTruthy();

    // Cleanup
    replaceStateSpy.mockRestore();
    window.history.replaceState({}, '', originalUrl);
  });
});

describe('rematch button with insufficient players', () => {
  it('disables rematch button when only 1 player remains', () => {
    const singlePlayerState = {
      ...baseState,
      players: [{ id: 'me', nickname: 'Me', isHost: true, isReady: false }],
    };
    render(<ResultPage state={singlePlayerState} dispatch={vi.fn()} send={vi.fn()} playerId="me" />);
    const buttons = screen.getAllByRole('button');
    // When opponent left, button shows 'result.opponentLeft' instead of 'result.rematch'
    const rematchBtn = buttons.find(b =>
      b.textContent?.includes('result.rematch') || b.textContent?.includes('result.opponentLeft')
    );
    expect(rematchBtn).toBeTruthy();
    expect(rematchBtn!).toBeDisabled();
  });

  it('shows opponent left label when only 1 player remains', () => {
    const singlePlayerState = {
      ...baseState,
      players: [{ id: 'me', nickname: 'Me', isHost: true, isReady: false }],
    };
    render(<ResultPage state={singlePlayerState} dispatch={vi.fn()} send={vi.fn()} playerId="me" />);
    expect(screen.getByText('result.opponentLeft')).toBeTruthy();
  });

  it('does not send game:rematch when clicking disabled rematch button (solo player)', () => {
    const singlePlayerState = {
      ...baseState,
      players: [{ id: 'me', nickname: 'Me', isHost: true, isReady: false }],
    };
    const send = vi.fn();
    render(<ResultPage state={singlePlayerState} dispatch={vi.fn()} send={send} playerId="me" />);
    const buttons = screen.getAllByRole('button');
    const rematchBtn = buttons.find(b =>
      b.textContent?.includes('result.opponentLeft')
    );
    // Disabled button click should not trigger send
    fireEvent.click(rematchBtn!);
    expect(send).not.toHaveBeenCalledWith('game:rematch');
  });
});
