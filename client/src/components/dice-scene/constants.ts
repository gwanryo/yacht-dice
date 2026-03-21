export const DICE_SIZE = 0.5;
export const DICE_HALF = DICE_SIZE / 2;
export const CUP_BR = 1.3;
export const CUP_TR = 1.7;
export const CUP_H = 3.0;
export const LIFT_HEIGHT = 4.5;
export const PHYS_STEP = 1 / 120;
export const MAX_SUB = 5;
export const TABLE_SIZE = 20;
export const TABLE_HALF = TABLE_SIZE / 2;
export const RAIL_R = 0.3;
export const FADE_SPEED = 0.08;
export const COL_FLY = 700;
export const COL_STAGGER = 150;
export const LIFT_DUR = 600;
export const SLIDE_DUR = 450;
export const POUR_DUR = 800;
export const SETTLE_THRESH = 0.08;
export const PRESENT_DUR = 900;
export const CAM_DUR = 1000;
export const WALL_SEGS = 32;
export const WALL_RINGS = 6;
export const WALL_DEPTH = 0.35;

export const S = {
  IDLE: 'IDLE',
  COLLECT: 'COLLECT',
  SHAKE: 'SHAKE',
  ROLL: 'ROLL',
  SETTLE: 'SETTLE',
  PRESENT: 'PRESENT',
  RESULT: 'RESULT',
} as const;
export type State = typeof S[keyof typeof S];

export const DICE_INIT_POS: [number, number, number][] = [
  [-2.5, DICE_HALF, 2.5], [-1, DICE_HALF, 3], [0.5, DICE_HALF, 2], [2, DICE_HALF, 3], [3.5, DICE_HALF, 2.5],
];

export const PRESENT_ROW: [number, number, number][] = [
  [-2.5, DICE_HALF, 3.5], [-1.25, DICE_HALF, 3.5], [0, DICE_HALF, 3.5], [1.25, DICE_HALF, 3.5], [2.5, DICE_HALF, 3.5],
];

// Mobile needs higher camera to fit all 5 dice in narrow portrait viewport
const _mobile = typeof navigator !== 'undefined' &&
  (navigator.maxTouchPoints > 0 || (typeof window !== 'undefined' && window.innerWidth <= 768));
const _yOff = _mobile ? 4 : 0;

export const CAM_TARGETS: Record<string, { p: [number, number, number]; l: [number, number, number] }> = {
  [S.IDLE]: { p: [0, 14 + _yOff, 5], l: [0, 0, 0] },
  [S.COLLECT]: { p: [0, 12 + _yOff, 4], l: [0, 1, 0] },
  [S.SHAKE]: { p: [2, LIFT_HEIGHT + 9 + _yOff, 5], l: [0, LIFT_HEIGHT, 0] },
  [S.ROLL]: { p: [0, 14 + _yOff, 5], l: [0, 0, 0] },
  [S.SETTLE]: { p: [0, 12 + _yOff, 5], l: [0, 0, 0] },
  [S.RESULT]: { p: [0, 10 + _yOff, 4], l: [0, 0, 3.5] },
};
