import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import LobbyPage from './LobbyPage';
import type { GameState } from '../hooks/useGameState';
import type { Envelope } from '../types/game';

// Mock matchMedia for jsdom
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: query === '(pointer: fine)',
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

const mockDispatch = vi.fn();
const mockSend = vi.fn();

type Handler = (env: Envelope) => void;
const handlers = new Map<string, Handler[]>();
const mockOn = vi.fn((type: string, handler: Handler) => {
  if (!handlers.has(type)) handlers.set(type, []);
  handlers.get(type)!.push(handler);
  return () => {
    const arr = handlers.get(type);
    if (arr) {
      const idx = arr.indexOf(handler);
      if (idx >= 0) arr.splice(idx, 1);
    }
  };
});

function emit(type: string, payload: unknown) {
  const arr = handlers.get(type);
  if (arr) arr.forEach(h => h({ type, payload }));
}

const nicknameConfirmedState: GameState = {
  phase: 'lobby',
  nickname: 'TestUser',
  roomCode: null,
  players: [],
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
  lastScored: null,
};

const noNicknameState: GameState = {
  ...nicknameConfirmedState,
  nickname: '',
};

describe('LobbyPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
  });

  describe('room entry events', () => {
    it('dispatches SET_ROOM when server sends no players (backward compat)', () => {
      render(
        <LobbyPage state={nicknameConfirmedState} dispatch={mockDispatch} send={mockSend} on={mockOn} playerId="p1" />
      );

      act(() => emit('room:created', { roomCode: 'ABC123' }));

      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'SET_ROOM',
        roomCode: 'ABC123',
      });
    });

    it('dispatches SET_ROOM_STATE with players when server includes them (room:created)', () => {
      render(
        <LobbyPage state={nicknameConfirmedState} dispatch={mockDispatch} send={mockSend} on={mockOn} playerId="p1" />
      );

      const players = [{ id: 'p1', nickname: 'TestUser', isHost: true, isReady: false }];
      act(() => emit('room:created', { roomCode: 'ABC123', players }));

      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'SET_ROOM_STATE',
        roomCode: 'ABC123',
        players,
      });
    });

    it('dispatches SET_ROOM_STATE with players when server includes them (room:joined)', () => {
      render(
        <LobbyPage state={nicknameConfirmedState} dispatch={mockDispatch} send={mockSend} on={mockOn} playerId="p1" />
      );

      const players = [
        { id: 'host1', nickname: 'Host', isHost: true, isReady: false },
        { id: 'p1', nickname: 'TestUser', isHost: false, isReady: false },
      ];
      act(() => emit('room:joined', { roomCode: 'XYZ789', players }));

      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'SET_ROOM_STATE',
        roomCode: 'XYZ789',
        players,
      });
    });

    it('registers both room:created and room:joined handlers', () => {
      render(
        <LobbyPage state={nicknameConfirmedState} dispatch={mockDispatch} send={mockSend} on={mockOn} playerId="p1" />
      );

      const registeredTypes = mockOn.mock.calls.map(c => c[0]);
      expect(registeredTypes).toContain('room:created');
      expect(registeredTypes).toContain('room:joined');
    });
  });

  describe('nickname step', () => {
    it('shows nickname input when nickname not confirmed', () => {
      render(
        <LobbyPage state={noNicknameState} dispatch={mockDispatch} send={mockSend} on={mockOn} playerId="p1" />
      );

      expect(screen.getByLabelText('lobby.nickname')).toBeTruthy();
    });

    it('does not register room event handlers before nickname is confirmed', () => {
      render(
        <LobbyPage state={noNicknameState} dispatch={mockDispatch} send={mockSend} on={mockOn} playerId="p1" />
      );

      expect(mockOn).not.toHaveBeenCalled();
    });
  });

  describe('settings', () => {
    it('shows settings button when nickname is confirmed', () => {
      render(
        <LobbyPage state={nicknameConfirmedState} dispatch={mockDispatch} send={mockSend} on={mockOn} playerId="p1" />
      );

      expect(screen.getByLabelText('lobby.settings')).toBeTruthy();
    });

    it('opens settings modal when settings button is clicked', () => {
      render(
        <LobbyPage state={nicknameConfirmedState} dispatch={mockDispatch} send={mockSend} on={mockOn} playerId="p1" />
      );

      fireEvent.click(screen.getByLabelText('lobby.settings'));

      expect(screen.getByRole('dialog')).toBeTruthy();
    });

    it('does not show settings button before nickname is confirmed', () => {
      render(
        <LobbyPage state={noNicknameState} dispatch={mockDispatch} send={mockSend} on={mockOn} playerId="p1" />
      );

      expect(screen.queryByLabelText('lobby.settings')).toBeNull();
    });
  });

  describe('join form', () => {
    it('sends room:join with code and password on submit', () => {
      render(
        <LobbyPage state={nicknameConfirmedState} dispatch={mockDispatch} send={mockSend} on={mockOn} playerId="p1" />
      );

      const codeInput = screen.getByPlaceholderText('lobby.codePlaceholder');
      const passwordInput = screen.getByPlaceholderText('lobby.password');

      fireEvent.change(codeInput, { target: { value: 'ABC123' } });
      fireEvent.change(passwordInput, { target: { value: 'secret' } });

      const form = codeInput.closest('form')!;
      fireEvent.submit(form);

      expect(mockSend).toHaveBeenCalledWith('room:join', {
        roomCode: 'ABC123',
        password: 'secret',
      });
    });

    it('disables join button when code is less than 6 characters', () => {
      render(
        <LobbyPage state={nicknameConfirmedState} dispatch={mockDispatch} send={mockSend} on={mockOn} playerId="p1" />
      );

      const codeInput = screen.getByPlaceholderText('lobby.codePlaceholder');
      fireEvent.change(codeInput, { target: { value: 'ABC' } });

      // The secondary join button (in the join form) should be disabled
      const buttons = screen.getAllByRole('button').filter(
        b => b.textContent === 'lobby.join'
      );
      const joinFormButton = buttons.find(b => b.closest('form'));
      expect(joinFormButton?.hasAttribute('disabled')).toBe(true);
    });
  });
});
