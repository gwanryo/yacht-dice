import { useReducer } from 'react';
import type {
  GamePhase, PlayerInfo, RankEntry,
} from '../types/game';

export interface GameState {
  phase: GamePhase;
  nickname: string;
  roomCode: string | null;
  players: PlayerInfo[];
  dice: number[];
  held: boolean[];
  rollCount: number;
  currentPlayer: string | null;
  round: number;
  scores: Record<string, Record<string, number>>;
  rankings: RankEntry[];
  reactions: { playerId: string; emoji: string; id: string }[];
  preview: Record<string, number>;
  hoveredCategory: { category: string | null; playerId: string } | null;
  pourCount: number;
  rematchVotes: string[];
  lastScored: { playerId: string; category: string; score: number } | null;
}

export type GameAction =
  | { type: 'SET_NICKNAME'; nickname: string }
  | { type: 'SET_PHASE'; phase: GamePhase }
  | { type: 'SET_ROOM'; roomCode: string }
  | { type: 'SET_PLAYERS'; players: PlayerInfo[] }
  | { type: 'SET_ROOM_STATE'; roomCode: string; players: PlayerInfo[] }
  | { type: 'GAME_ROLLED'; dice: number[]; held: boolean[]; rollCount: number; preview: Record<string, number> }
  | { type: 'GAME_HELD'; held: boolean[] }
  | { type: 'SET_TURN'; currentPlayer: string; round: number }
  | { type: 'SET_SCORES'; scores: Record<string, Record<string, number>> }
  | { type: 'GAME_SCORED'; playerId: string; category: string; score: number; scores: Record<string, Record<string, number>> }
  | { type: 'GAME_END'; rankings: RankEntry[] }
  | { type: 'GAME_SYNC'; dice: number[]; held: boolean[]; rollCount: number; scores: Record<string, Record<string, number>>; currentPlayer: string; round: number; preview: Record<string, number> }
  | { type: 'ADD_REACTION'; playerId: string; emoji: string }
  | { type: 'CLEAR_REACTION'; id: string }
  | { type: 'SET_HOVERED'; category: string | null; playerId: string }
  | { type: 'GAME_POUR' }
  | { type: 'REMOVE_PLAYER'; playerId: string }
  | { type: 'SET_REMATCH_VOTES'; votes: string[] }
  | { type: 'RESET_GAME' }
  | { type: 'CLEAR_NICKNAME' }
  | { type: 'CLEAR_LAST_SCORED' };

const EMPTY_HELD: boolean[] = [false, false, false, false, false];

const initialState: GameState = {
  phase: 'lobby',
  nickname: '',
  roomCode: null,
  players: [],
  dice: [],
  held: EMPTY_HELD,
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

function reducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'SET_NICKNAME':
      return { ...state, nickname: action.nickname };
    case 'SET_PHASE':
      return { ...state, phase: action.phase };
    case 'SET_ROOM':
      return { ...state, roomCode: action.roomCode, phase: 'room' };
    case 'SET_PLAYERS':
      return { ...state, players: action.players };
    case 'SET_ROOM_STATE':
      return { ...state, roomCode: action.roomCode, phase: 'room', players: action.players };
    case 'GAME_ROLLED':
      return { ...state, dice: action.dice, rollCount: action.rollCount, held: action.held ?? EMPTY_HELD, preview: action.preview ?? {} };
    case 'GAME_HELD':
      return { ...state, held: action.held };
    case 'SET_TURN':
      return { ...state, currentPlayer: action.currentPlayer, round: action.round, rollCount: 0, held: EMPTY_HELD, dice: [], preview: {}, hoveredCategory: null, pourCount: 0 };
    case 'SET_SCORES':
      return { ...state, scores: action.scores };
    case 'GAME_SCORED':
      return { ...state, scores: action.scores, lastScored: { playerId: action.playerId, category: action.category, score: action.score } };
    case 'GAME_END':
      return { ...state, phase: 'result', rankings: action.rankings };
    case 'GAME_SYNC':
      return { ...state, dice: action.dice, held: action.held, rollCount: action.rollCount, scores: action.scores, currentPlayer: action.currentPlayer, round: action.round, phase: 'game', preview: action.preview ?? {} };
    case 'SET_HOVERED':
      return { ...state, hoveredCategory: { category: action.category, playerId: action.playerId } };
    case 'ADD_REACTION': {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      return { ...state, reactions: [...state.reactions, { playerId: action.playerId, emoji: action.emoji, id }] };
    }
    case 'GAME_POUR':
      return { ...state, pourCount: state.pourCount + 1 };
    case 'CLEAR_REACTION':
      return { ...state, reactions: state.reactions.filter(r => r.id !== action.id) };
    case 'REMOVE_PLAYER':
      return { ...state, players: state.players.filter(p => p.id !== action.playerId) };
    case 'SET_REMATCH_VOTES':
      return { ...state, rematchVotes: action.votes };
    case 'RESET_GAME':
      return { ...initialState, nickname: state.nickname };
    case 'CLEAR_NICKNAME':
      return { ...initialState, nickname: '' };
    case 'CLEAR_LAST_SCORED':
      return { ...state, lastScored: null };
    default:
      return state;
  }
}

const STORAGE_KEY = 'yacht-nickname';
const STORAGE_VERSION_KEY = 'yacht-storage-v';
const STORAGE_VERSION = 1;

function getSavedNickname(): string {
  try {
    const ver = localStorage.getItem(STORAGE_VERSION_KEY);
    if (ver !== String(STORAGE_VERSION)) {
      // Defer storage writes to avoid side effects during render
      queueMicrotask(() => {
        try {
          localStorage.removeItem(STORAGE_KEY);
          localStorage.setItem(STORAGE_VERSION_KEY, String(STORAGE_VERSION));
        } catch { /* quota exceeded */ }
      });
      return '';
    }
    return localStorage.getItem(STORAGE_KEY) || '';
  } catch { return ''; }
}

export function useGameState() {
  return useReducer(reducer, undefined, () => ({
    ...initialState,
    nickname: getSavedNickname(),
  }));
}
