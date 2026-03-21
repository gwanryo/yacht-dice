import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGameState } from './useGameState';

describe('useGameState', () => {
  it('returns initial state', () => {
    const { result } = renderHook(() => useGameState());
    const [state] = result.current;
    expect(state.phase).toBe('lobby');
    expect(state.nickname).toBe('');
    expect(state.roomCode).toBeNull();
    expect(state.dice).toEqual([]);
    expect(state.held).toEqual([false, false, false, false, false]);
    expect(state.rollCount).toBe(0);
    expect(state.round).toBe(1);
    expect(state.rankings).toEqual([]);
    expect(state.reactions).toEqual([]);
    expect(state.pourCount).toBe(0);
  });

  it('SET_NICKNAME updates nickname', () => {
    const { result } = renderHook(() => useGameState());
    act(() => {
      result.current[1]({ type: 'SET_NICKNAME', nickname: 'Alice' });
    });
    expect(result.current[0].nickname).toBe('Alice');
  });

  it('SET_ROOM sets room code and phase', () => {
    const { result } = renderHook(() => useGameState());
    act(() => {
      result.current[1]({ type: 'SET_ROOM', roomCode: 'ABC123' });
    });
    expect(result.current[0].roomCode).toBe('ABC123');
    expect(result.current[0].phase).toBe('room');
  });

  it('SET_PLAYERS updates player list', () => {
    const { result } = renderHook(() => useGameState());
    const players = [
      { id: 'p1', nickname: 'Alice', isHost: true, isReady: false },
      { id: 'p2', nickname: 'Bob', isHost: false, isReady: true },
    ];
    act(() => {
      result.current[1]({ type: 'SET_PLAYERS', players });
    });
    expect(result.current[0].players).toEqual(players);
  });

  it('GAME_ROLLED updates dice, rollCount, held, preview', () => {
    const { result } = renderHook(() => useGameState());
    act(() => {
      result.current[1]({
        type: 'GAME_ROLLED',
        dice: [1, 2, 3, 4, 5],
        held: [true, false, false, false, false],
        rollCount: 1,
        preview: { ones: 1, twos: 2 },
      });
    });
    expect(result.current[0].dice).toEqual([1, 2, 3, 4, 5]);
    expect(result.current[0].held).toEqual([true, false, false, false, false]);
    expect(result.current[0].rollCount).toBe(1);
    expect(result.current[0].preview).toEqual({ ones: 1, twos: 2 });
  });

  it('SET_TURN resets dice state for new turn', () => {
    const { result } = renderHook(() => useGameState());
    act(() => {
      result.current[1]({
        type: 'GAME_ROLLED',
        dice: [1, 2, 3, 4, 5],
        held: [true, false, false, false, false],
        rollCount: 2,
        preview: { ones: 1 },
      });
    });
    act(() => {
      result.current[1]({ type: 'SET_TURN', currentPlayer: 'p2', round: 2 });
    });
    expect(result.current[0].currentPlayer).toBe('p2');
    expect(result.current[0].round).toBe(2);
    expect(result.current[0].rollCount).toBe(0);
    expect(result.current[0].held).toEqual([false, false, false, false, false]);
    expect(result.current[0].dice).toEqual([]);
    expect(result.current[0].preview).toEqual({});
    expect(result.current[0].pourCount).toBe(0);
  });

  it('GAME_END sets result phase and rankings', () => {
    const { result } = renderHook(() => useGameState());
    const rankings = [
      { playerId: 'p1', nickname: 'Alice', score: 200, rank: 1 },
      { playerId: 'p2', nickname: 'Bob', score: 150, rank: 2 },
    ];
    act(() => {
      result.current[1]({ type: 'GAME_END', rankings });
    });
    expect(result.current[0].phase).toBe('result');
    expect(result.current[0].rankings).toEqual(rankings);
  });

  it('ADD_REACTION adds and CLEAR_REACTION removes', () => {
    const { result } = renderHook(() => useGameState());
    act(() => {
      result.current[1]({ type: 'ADD_REACTION', playerId: 'p1', emoji: '👍' });
    });
    expect(result.current[0].reactions).toHaveLength(1);
    expect(result.current[0].reactions[0].playerId).toBe('p1');
    expect(result.current[0].reactions[0].emoji).toBe('👍');

    const id = result.current[0].reactions[0].id;
    act(() => {
      result.current[1]({ type: 'CLEAR_REACTION', id });
    });
    expect(result.current[0].reactions).toHaveLength(0);
  });

  it('GAME_POUR increments pourCount', () => {
    const { result } = renderHook(() => useGameState());
    act(() => {
      result.current[1]({ type: 'GAME_POUR' });
      result.current[1]({ type: 'GAME_POUR' });
    });
    expect(result.current[0].pourCount).toBe(2);
  });

  it('REMOVE_PLAYER filters player from list', () => {
    const { result } = renderHook(() => useGameState());
    const players = [
      { id: 'p1', nickname: 'Alice', isHost: true, isReady: false },
      { id: 'p2', nickname: 'Bob', isHost: false, isReady: true },
    ];
    act(() => {
      result.current[1]({ type: 'SET_PLAYERS', players });
    });
    act(() => {
      result.current[1]({ type: 'REMOVE_PLAYER', playerId: 'p2' });
    });
    expect(result.current[0].players).toHaveLength(1);
    expect(result.current[0].players[0].id).toBe('p1');
  });

  it('RESET_GAME resets to initial state preserving nickname', () => {
    const { result } = renderHook(() => useGameState());
    act(() => {
      result.current[1]({ type: 'SET_NICKNAME', nickname: 'Alice' });
      result.current[1]({ type: 'SET_ROOM', roomCode: 'ABC123' });
    });
    act(() => {
      result.current[1]({ type: 'RESET_GAME' });
    });
    expect(result.current[0].nickname).toBe('Alice');
    expect(result.current[0].phase).toBe('lobby');
    expect(result.current[0].roomCode).toBeNull();
  });

  it('GAME_SYNC sets full game state', () => {
    const { result } = renderHook(() => useGameState());
    act(() => {
      result.current[1]({
        type: 'GAME_SYNC',
        dice: [3, 3, 3, 4, 5],
        held: [true, true, true, false, false],
        rollCount: 2,
        scores: { p1: { ones: 1 } },
        currentPlayer: 'p1',
        round: 3,
        preview: { twos: 0 },
      });
    });
    expect(result.current[0].phase).toBe('game');
    expect(result.current[0].dice).toEqual([3, 3, 3, 4, 5]);
    expect(result.current[0].rollCount).toBe(2);
    expect(result.current[0].round).toBe(3);
    expect(result.current[0].currentPlayer).toBe('p1');
  });

  it('GAME_SCORED updates scores and sets lastScored', () => {
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
    expect(result.current[0].lastScored).toEqual({ playerId: 'p1', category: 'yacht', score: 50 });
  });

  it('SET_TURN preserves lastScored (cleared by CLEAR_LAST_SCORED after announcement)', () => {
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
    expect(result.current[0].lastScored).not.toBeNull();
    act(() => {
      result.current[1]({ type: 'SET_TURN', currentPlayer: 'p2', round: 2 });
    });
    // lastScored survives SET_TURN so the announcement can display
    expect(result.current[0].lastScored).not.toBeNull();
    act(() => {
      result.current[1]({ type: 'CLEAR_LAST_SCORED' });
    });
    expect(result.current[0].lastScored).toBeNull();
  });

  // #10 Rematch votes
  describe('rematch votes', () => {
    it('initial state has empty rematchVotes', () => {
      const { result } = renderHook(() => useGameState());
      expect(result.current[0].rematchVotes).toEqual([]);
    });

    it('SET_REMATCH_VOTES updates rematchVotes', () => {
      const { result } = renderHook(() => useGameState());
      act(() => {
        result.current[1]({ type: 'SET_REMATCH_VOTES', votes: ['p1'] });
      });
      expect(result.current[0].rematchVotes).toEqual(['p1']);
    });

    it('SET_REMATCH_VOTES updates with multiple voters', () => {
      const { result } = renderHook(() => useGameState());
      act(() => {
        result.current[1]({ type: 'SET_REMATCH_VOTES', votes: ['p1', 'p2'] });
      });
      expect(result.current[0].rematchVotes).toEqual(['p1', 'p2']);
    });

    it('RESET_GAME clears rematchVotes', () => {
      const { result } = renderHook(() => useGameState());
      act(() => {
        result.current[1]({ type: 'SET_REMATCH_VOTES', votes: ['p1', 'p2'] });
      });
      expect(result.current[0].rematchVotes).toEqual(['p1', 'p2']);

      act(() => {
        result.current[1]({ type: 'RESET_GAME' });
      });
      expect(result.current[0].rematchVotes).toEqual([]);
    });
  });
});
