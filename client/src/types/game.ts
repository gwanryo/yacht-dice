export interface Envelope {
  type: string;
  payload?: unknown;
}

export interface PlayerInfo {
  id: string;
  nickname: string;
  isHost: boolean;
  isReady: boolean;
}

export interface RoomState {
  roomCode: string;
  players: PlayerInfo[];
}

export interface RoomListItem {
  code: string;
  playerCount: number;
  hasPassword: boolean;
  status: 'waiting' | 'playing';
}

export interface GameRolledPayload {
  dice: number[];
  held: boolean[];
  rollCount: number;
  preview: Record<string, number>;
}

export interface GameHeldPayload {
  held: boolean[];
  playerId: string;
}

export interface GameHoveredPayload {
  category: string | null;
  playerId: string;
}

export interface GameScoredPayload {
  playerId: string;
  category: string;
  score: number;
  totalScores: Record<string, Record<string, number>>;
}

export interface GameTurnPayload {
  currentPlayer: string;
  round: number;
}

export interface GameSyncPayload {
  dice: number[];
  held: boolean[];
  rollCount: number;
  scores: Record<string, Record<string, number>>;
  currentPlayer: string;
  round: number;
  preview: Record<string, number>;
  players: PlayerInfo[];
  roomCode: string;
}

export interface RankEntry {
  playerId: string;
  nickname: string;
  score: number;
  rank: number;
}

export interface GameEndPayload {
  rankings: RankEntry[];
}

export interface ResultSyncPayload {
  rankings: RankEntry[];
  scores: Record<string, Record<string, number>>;
  rematchVotes: string[];
  players: PlayerInfo[];
  roomCode: string;
}

export interface ReactionShowPayload {
  playerId: string;
  emoji: string;
}

export type GamePhase = 'lobby' | 'room' | 'game' | 'result';

export const CATEGORIES = [
  'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
  'choice', 'fourOfAKind', 'fullHouse',
  'smallStraight', 'largeStraight', 'yacht',
] as const;

export type Category = typeof CATEGORIES[number];

export const UPPER_CATEGORIES: Category[] = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
export const LOWER_CATEGORIES: Category[] = ['choice', 'fourOfAKind', 'fullHouse', 'smallStraight', 'largeStraight', 'yacht'];
