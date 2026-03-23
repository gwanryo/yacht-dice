const STORAGE_KEY = 'yacht-solo-highscore';

export interface HighScoreEntry {
  score: number;
  date: string;
}

export function getHighScore(): HighScoreEntry | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as HighScoreEntry;
    if (typeof entry.score !== 'number' || typeof entry.date !== 'string') return null;
    return entry;
  } catch {
    return null;
  }
}

export type HighScoreResult = { isNewBest: boolean; previous: HighScoreEntry | null };

export function saveHighScore(score: number): HighScoreResult {
  const previous = getHighScore();
  const isNewBest = !previous || score > previous.score;
  if (isNewBest) {
    try {
      const entry: HighScoreEntry = { score, date: new Date().toISOString() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
    } catch { /* quota exceeded or private browsing */ }
  }
  return { isNewBest, previous };
}
