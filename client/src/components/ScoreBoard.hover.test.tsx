import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ScoreBoard from './ScoreBoard';
import type { PlayerInfo } from '../types/game';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const players: PlayerInfo[] = [
  { id: 'me', nickname: 'Me', isHost: true, isReady: false },
  { id: 'other', nickname: 'Other', isHost: false, isReady: false },
];

const baseProps = {
  players,
  scores: { me: {}, other: {} } as Record<string, Record<string, number>>,
  currentPlayer: 'me',
  myId: 'me',
  rollCount: 1,
  preview: {},
  hoveredCategory: null as { category: string | null; playerId: string } | null,
  minimized: false,
  onSelectCategory: vi.fn(),
  onHoverCategory: vi.fn(),
};

function getRow(cat: string) {
  const cell = screen.getByText(`categories.${cat}`);
  return cell.closest('tr')!;
}

describe('ScoreBoard hover behavior', () => {
  describe('Bug: only one row should highlight at a time', () => {
    it('entering row B clears highlight from row A (no dual highlight)', () => {
      render(<ScoreBoard {...baseProps} />);

      const rowOnes = getRow('ones');
      const rowTwos = getRow('twos');

      // Enter row A
      fireEvent.mouseEnter(rowOnes);
      expect(rowOnes.className).toContain('bg-yellow-500/20');
      expect(rowTwos.className).not.toContain('bg-yellow-500/20');

      // Enter row B without leaving A (simulates fast mouse movement)
      fireEvent.mouseEnter(rowTwos);
      expect(rowTwos.className).toContain('bg-yellow-500/20');
      // Row A must no longer be highlighted
      expect(rowOnes.className).not.toContain('bg-yellow-500/20');
    });

    it('stale server hoveredCategory does not cause dual highlight', () => {
      // Server echo still points to 'ones' while local moved to 'twos'
      render(
        <ScoreBoard
          {...baseProps}
          hoveredCategory={{ category: 'ones', playerId: 'me' }}
        />,
      );

      const rowOnes = getRow('ones');
      const rowTwos = getRow('twos');

      // User hovers over 'twos' locally
      fireEvent.mouseEnter(rowTwos);

      // Only twos should be highlighted (not ones from stale server state)
      expect(rowTwos.className).toContain('bg-yellow-500/20');
      expect(rowOnes.className).not.toContain('bg-yellow-500/20');
    });
  });

  describe('Bug: hover must clear on turn change', () => {
    it('local hover clears when rollCount resets to 0', () => {
      const { rerender } = render(<ScoreBoard {...baseProps} rollCount={1} />);

      const rowOnes = getRow('ones');
      fireEvent.mouseEnter(rowOnes);
      expect(rowOnes.className).toContain('bg-yellow-500/20');

      // Turn changes: rollCount goes to 0
      rerender(<ScoreBoard {...baseProps} rollCount={0} />);

      // Re-query after rerender
      const rowOnesAfter = getRow('ones');
      expect(rowOnesAfter.className).not.toContain('bg-yellow-500/20');
    });

    it('stale hover does not reappear when rollCount goes from 0 to 1', () => {
      const { rerender } = render(<ScoreBoard {...baseProps} rollCount={1} />);

      // Hover over ones
      fireEvent.mouseEnter(getRow('ones'));

      // Turn change: rollCount → 0
      rerender(<ScoreBoard {...baseProps} rollCount={0} />);

      // New turn: rollCount → 1
      rerender(<ScoreBoard {...baseProps} rollCount={1} />);

      // The old hover should NOT reappear
      const rowOnes = getRow('ones');
      expect(rowOnes.className).not.toContain('bg-yellow-500/20');
    });
  });

  describe('hover callbacks', () => {
    it('calls onHoverCategory on enter and leave', () => {
      const onHoverCategory = vi.fn();
      render(<ScoreBoard {...baseProps} onHoverCategory={onHoverCategory} />);

      const row = getRow('ones');
      fireEvent.mouseEnter(row);
      expect(onHoverCategory).toHaveBeenCalledWith('ones');

      fireEvent.mouseLeave(row);
      expect(onHoverCategory).toHaveBeenCalledWith(null);
    });

    it('does not fire hover on non-selectable rows', () => {
      const onHoverCategory = vi.fn();
      render(
        <ScoreBoard
          {...baseProps}
          scores={{ me: { ones: 3 }, other: {} }}
          onHoverCategory={onHoverCategory}
        />,
      );

      // 'ones' is already scored — should not trigger hover
      const row = getRow('ones');
      fireEvent.mouseEnter(row);
      expect(onHoverCategory).not.toHaveBeenCalled();
    });
  });
});
