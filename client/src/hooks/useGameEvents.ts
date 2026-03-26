import { useEffect, useRef } from 'react';
import type { Dispatch } from 'react';
import type { useWebSocket } from './useWebSocket';
import type { GameAction } from './useGameState';
import type {
  RoomState, GameRolledPayload, GameScoredPayload,
  GameTurnPayload, GameSyncPayload, GameEndPayload,
  ReactionShowPayload, GameHeldPayload, GameHoveredPayload,
  ResultSyncPayload, GamePausedPayload, PlayerLeftPayload,
} from '../types/game';

type WS = ReturnType<typeof useWebSocket>;

export function useGameEvents(
  ws: WS,
  dispatch: Dispatch<GameAction>,
  setError: (error: string | null) => void,
  getPhase: () => string,
  getPlayerId: () => string | null,
) {
  const errorTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const unsubs = [
      ws.on('room:state', (env) => {
        const p = env.payload as RoomState;
        // During game phase, room:state means a player reconnected — clear disconnect indicators
        if (getPhase() === 'game') {
          for (const player of p.players) {
            dispatch({ type: 'PLAYER_RECONNECTED', playerId: player.id });
          }
          return;
        }
        // Only process room:state when already in room phase.
        // Lobby entry is handled by LobbyPage (room:joined/room:created).
        // Result/game phases should not be interrupted by room:state.
        if (getPhase() !== 'room') return;
        dispatch({ type: 'SET_ROOM_STATE', roomCode: p.roomCode, players: p.players });
      }),
      ws.on('rematch:start', (env) => {
        const p = env.payload as RoomState;
        dispatch({ type: 'SET_ROOM_STATE', roomCode: p.roomCode, players: p.players });
      }),
      ws.on('game:start', () => {
        dispatch({ type: 'SET_PHASE', phase: 'game' });
      }),
      ws.on('game:rolled', (env) => {
        const p = env.payload as GameRolledPayload;
        dispatch({ type: 'GAME_ROLLED', dice: p.dice, held: p.held, rollCount: p.rollCount, preview: p.preview });
      }),
      ws.on('game:pour', () => {
        dispatch({ type: 'GAME_POUR' });
      }),
      ws.on('game:held', (env) => {
        const p = env.payload as GameHeldPayload;
        dispatch({ type: 'GAME_HELD', held: p.held });
      }),
      ws.on('game:hovered', (env) => {
        const p = env.payload as GameHoveredPayload;
        dispatch({ type: 'SET_HOVERED', category: p.category, playerId: p.playerId });
      }),
      ws.on('game:scored', (env) => {
        const p = env.payload as GameScoredPayload;
        dispatch({ type: 'GAME_SCORED', playerId: p.playerId, category: p.category, score: p.score, scores: p.totalScores });
      }),
      ws.on('game:turn', (env) => {
        const p = env.payload as GameTurnPayload;
        dispatch({ type: 'SET_TURN', currentPlayer: p.currentPlayer, round: p.round });
      }),
      ws.on('game:sync', (env) => {
        const p = env.payload as GameSyncPayload;
        dispatch({ type: 'GAME_SYNC', ...p });
      }),
      ws.on('room:sync', (env) => {
        const p = env.payload as RoomState;
        dispatch({ type: 'ROOM_SYNC', roomCode: p.roomCode, players: p.players });
      }),
      ws.on('result:sync', (env) => {
        const p = env.payload as ResultSyncPayload;
        dispatch({ type: 'RESULT_SYNC', rankings: p.rankings, scores: p.scores, rematchVotes: p.rematchVotes, players: p.players, roomCode: p.roomCode });
      }),
      ws.on('game:end', (env) => {
        const p = env.payload as GameEndPayload;
        dispatch({ type: 'GAME_END', rankings: p.rankings });
      }),
      ws.on('rematch:status', (env) => {
        const p = env.payload as { votes: string[] };
        dispatch({ type: 'SET_REMATCH_VOTES', votes: p.votes });
      }),
      ws.on('reaction:show', (env) => {
        const p = env.payload as ReactionShowPayload;
        dispatch({ type: 'ADD_REACTION', playerId: p.playerId, emoji: p.emoji });
      }),
      ws.on('player:disconnected', (env) => {
        const p = env.payload as { playerId: string };
        dispatch({ type: 'PLAYER_DISCONNECTED', playerId: p.playerId });
      }),
      ws.on('game:paused', (env) => {
        const p = env.payload as GamePausedPayload;
        dispatch({ type: 'GAME_PAUSED', playerId: p.playerId, nickname: p.nickname, expiresAt: p.expiresAt });
      }),
      ws.on('game:resumed', (env) => {
        const p = env.payload as { playerId: string };
        dispatch({ type: 'GAME_RESUMED', playerId: p.playerId });
      }),
      ws.on('player:left', (env) => {
        const p = env.payload as PlayerLeftPayload;
        if (p.playerId === getPlayerId()) {
          // Self left — go to lobby
          const url = new URL(window.location.href);
          url.searchParams.delete('room');
          window.history.replaceState({}, '', url);
          dispatch({ type: 'RESET_GAME' });
          return;
        }
        dispatch({ type: 'REMOVE_PLAYER', playerId: p.playerId });
        dispatch({ type: 'GAME_RESUMED', playerId: p.playerId });
        if (p.reason && p.reason !== 'normal' && p.nickname) {
          const id = `left-${p.playerId}-${Date.now()}`;
          dispatch({ type: 'ADD_TOAST', id, nickname: p.nickname, reason: p.reason as 'voluntary' | 'timeout' });
          setTimeout(() => dispatch({ type: 'REMOVE_TOAST', id }), 3000);
        }
      }),
      ws.on('error', (env) => {
        const p = env.payload as { message: string };
        setError(p.message);
        const timer = setTimeout(() => setError(null), 5000);
        errorTimerRef.current = timer;
      }),
    ];
    return () => {
      unsubs.forEach(u => u());
      clearTimeout(errorTimerRef.current);
    };
  }, [ws.on, dispatch, setError, getPhase, getPlayerId]);
}
