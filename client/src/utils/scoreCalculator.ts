import type { Category } from '../types/game';

export const SPECIAL_HANDS: Category[] = ['fourOfAKind', 'fullHouse', 'smallStraight', 'largeStraight', 'yacht'];

export function calculateScore(dice: number[], category: Category): number {
  const counts = [0, 0, 0, 0, 0, 0, 0]; // index 0 unused
  let sum = 0;
  for (const d of dice) {
    counts[d]++;
    sum += d;
  }

  switch (category) {
    case 'ones': return counts[1] * 1;
    case 'twos': return counts[2] * 2;
    case 'threes': return counts[3] * 3;
    case 'fours': return counts[4] * 4;
    case 'fives': return counts[5] * 5;
    case 'sixes': return counts[6] * 6;
    case 'choice': return sum;
    case 'fourOfAKind':
      for (let v = 1; v <= 6; v++) { if (counts[v] >= 4) return sum; }
      return 0;
    case 'fullHouse': {
      let has3 = false, has2 = false;
      for (let v = 1; v <= 6; v++) {
        if (counts[v] === 3) has3 = true;
        if (counts[v] === 2) has2 = true;
      }
      return has3 && has2 ? 25 : 0;
    }
    case 'smallStraight': {
      const sorted = [...dice].sort((a, b) => a - b);
      const uniq = sorted.filter((v, i) => i === 0 || v !== sorted[i - 1]);
      return hasRun(uniq, 4) ? 30 : 0;
    }
    case 'largeStraight': {
      const sorted = [...dice].sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] !== sorted[i - 1] + 1) return 0;
      }
      return 40;
    }
    case 'yacht':
      for (let v = 1; v <= 6; v++) { if (counts[v] === 5) return 50; }
      return 0;
    default: return 0;
  }
}

function hasRun(uniq: number[], length: number): boolean {
  if (uniq.length < length) return false;
  let run = 1;
  for (let i = 1; i < uniq.length; i++) {
    if (uniq[i] === uniq[i - 1] + 1) {
      run++;
      if (run >= length) return true;
    } else {
      run = 1;
    }
  }
  return false;
}

export function isSpecialHand(
  dice: number[],
  category: Category,
): { category: Category; score: number } | null {
  if (!SPECIAL_HANDS.includes(category)) return null;
  const score = calculateScore(dice, category);
  if (score <= 0) return null;
  return { category, score };
}
