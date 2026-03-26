import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ScoreBoard from './ScoreBoard';
import type { PlayerInfo } from '../types/game';

// Mock i18n
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const players: PlayerInfo[] = [
  { id: 'me', nickname: 'Me', isHost: true, isReady: false },
  { id: 'other', nickname: 'Other', isHost: false, isReady: false },
];

const emptyScores: Record<string, Record<string, number>> = {
  me: {},
  other: {},
};

const defaultProps = {
  players,
  scores: emptyScores,
  currentPlayer: 'me',
  myId: 'me',
  rollCount: 1,
  preview: {},
  hoveredCategory: null,
  minimized: false,
  onSelectCategory: vi.fn(),
  onHoverCategory: vi.fn(),
};

describe('ScoreBoard', () => {
  // #1 Click area covers full row
  describe('#1 full-row click area', () => {
    it('clicking anywhere on the row triggers onSelectCategory', () => {
      const onSelectCategory = vi.fn();
      render(
        <ScoreBoard
          {...defaultProps}
          onSelectCategory={onSelectCategory}
        />,
      );

      // Find a score cell (td) for 'ones' row — the second td in the row is a player score cell
      // The rows render category names via t(`categories.${cat}`), so look for 'categories.ones'
      const categoryCell = screen.getByText('categories.ones');
      // Get the parent row
      const row = categoryCell.closest('tr')!;

      // Click on the row itself (not the button)
      fireEvent.click(row);

      expect(onSelectCategory).toHaveBeenCalledWith('ones');
    });

    it('does not trigger onSelectCategory when score is already set', () => {
      const onSelectCategory = vi.fn();
      render(
        <ScoreBoard
          {...defaultProps}
          scores={{ me: { ones: 3 }, other: {} }}
          onSelectCategory={onSelectCategory}
        />,
      );

      const categoryCell = screen.getByText('categories.ones');
      const row = categoryCell.closest('tr')!;
      fireEvent.click(row);

      expect(onSelectCategory).not.toHaveBeenCalled();
    });

    it('does not trigger onSelectCategory when rollCount is 0', () => {
      const onSelectCategory = vi.fn();
      render(
        <ScoreBoard
          {...defaultProps}
          rollCount={0}
          onSelectCategory={onSelectCategory}
        />,
      );

      const categoryCell = screen.getByText('categories.ones');
      const row = categoryCell.closest('tr')!;
      fireEvent.click(row);

      expect(onSelectCategory).not.toHaveBeenCalled();
    });

    it('does not trigger onSelectCategory when it is not my turn', () => {
      const onSelectCategory = vi.fn();
      render(
        <ScoreBoard
          {...defaultProps}
          currentPlayer="other"
          onSelectCategory={onSelectCategory}
        />,
      );

      const categoryCell = screen.getByText('categories.ones');
      const row = categoryCell.closest('tr')!;
      fireEvent.click(row);

      expect(onSelectCategory).not.toHaveBeenCalled();
    });
  });

  // #2 Hover state — no duplicate highlights
  describe('#2 hover state', () => {
    it('only one row is highlighted at a time via local hover state', () => {
      render(<ScoreBoard {...defaultProps} />);

      const onesCell = screen.getByText('categories.ones');
      const twosCell = screen.getByText('categories.twos');
      const onesRow = onesCell.closest('tr')!;
      const twosRow = twosCell.closest('tr')!;

      // mouseEnter row A (ones)
      fireEvent.mouseEnter(onesRow);
      expect(onesRow.className).toContain('bg-yellow-500/20');
      expect(twosRow.className).not.toContain('bg-yellow-500/20');

      // mouseEnter row B (twos) without explicitly leaving row A
      fireEvent.mouseEnter(twosRow);
      expect(twosRow.className).toContain('bg-yellow-500/20');
      expect(onesRow.className).not.toContain('bg-yellow-500/20');
    });

    it('removes highlight on mouseLeave', () => {
      render(<ScoreBoard {...defaultProps} />);

      const onesCell = screen.getByText('categories.ones');
      const onesRow = onesCell.closest('tr')!;

      fireEvent.mouseEnter(onesRow);
      expect(onesRow.className).toContain('bg-yellow-500/20');

      fireEvent.mouseLeave(onesRow);
      expect(onesRow.className).not.toContain('bg-yellow-500/20');
    });

    it('shows other player hover with blue highlight', () => {
      render(
        <ScoreBoard
          {...defaultProps}
          hoveredCategory={{ category: 'ones', playerId: 'other' }}
        />,
      );

      const onesCell = screen.getByText('categories.ones');
      const onesRow = onesCell.closest('tr')!;
      expect(onesRow.className).toContain('bg-blue-500/10');
    });
  });

  // #7 Preview score visibility
  describe('#7 preview score visibility', () => {
    it('renders non-zero preview scores with visible yellow styling', () => {
      render(
        <ScoreBoard
          {...defaultProps}
          preview={{ ones: 3 }}
        />,
      );

      // The preview value '3' should be rendered
      const onesCell = screen.getByText('categories.ones');
      const onesRow = onesCell.closest('tr')!;
      // Find the td that shows the preview score for 'me' (current player)
      const cells = onesRow.querySelectorAll('td');
      // Second td is the 'me' player column
      const myScoreCell = cells[1];

      expect(myScoreCell.textContent).toBe('3');
      expect(myScoreCell.className).toContain('text-yellow-400/70');
      expect(myScoreCell.className).toContain('font-semibold');
    });

    it('renders zero preview scores with moderate opacity', () => {
      render(
        <ScoreBoard
          {...defaultProps}
          preview={{ twos: 0 }}
        />,
      );

      const twosCell = screen.getByText('categories.twos');
      const twosRow = twosCell.closest('tr')!;
      const cells = twosRow.querySelectorAll('td');
      const myScoreCell = cells[1];

      expect(myScoreCell.textContent).toBe('0');
      expect(myScoreCell.className).toContain('text-yellow-500/30');
      expect(myScoreCell.className).toContain('italic');
    });

    it('does not show preview for already scored categories', () => {
      render(
        <ScoreBoard
          {...defaultProps}
          scores={{ me: { ones: 5 }, other: {} }}
          preview={{ ones: 3 }}
        />,
      );

      const onesCell = screen.getByText('categories.ones');
      const onesRow = onesCell.closest('tr')!;
      const cells = onesRow.querySelectorAll('td');
      const myScoreCell = cells[1];

      // Should show the actual score, not the preview
      expect(myScoreCell.textContent).toBe('5');
      expect(myScoreCell.className).not.toContain('text-yellow-400/70');
    });
  });

  // #11 Mobile collapsible
  describe('#11 mobile collapsible', () => {
    it('shows toggle button with chevron SVG', () => {
      render(<ScoreBoard {...defaultProps} />);

      // The toggle button contains an SVG chevron
      const svgs = document.querySelectorAll('svg');
      const chevronSvg = Array.from(svgs).find(
        (svg) => svg.querySelector('path[d="M19 9l-7 7-7-7"]'),
      );
      expect(chevronSvg).toBeTruthy();
    });

    it('auto-expands when rollCount > 0 and not minimized', () => {
      render(
        <ScoreBoard
          {...defaultProps}
          rollCount={1}
          minimized={false}
        />,
      );

      // The table should be visible
      const table = screen.getByRole('table', { name: 'game.score' });
      expect(table).toBeTruthy();
    });

    it('renders minimized pill when minimized prop is true', () => {
      render(
        <ScoreBoard
          {...defaultProps}
          minimized={true}
        />,
      );

      const region = screen.getByRole('region', { name: 'game.score' });
      expect(region).toBeTruthy();
      // Table exists in DOM but is visually hidden
      const table = screen.getByRole('table', { name: 'game.score' });
      expect(table).toBeTruthy();
    });

    it('toggles mobile expansion on button click', () => {
      render(
        <ScoreBoard
          {...defaultProps}
          rollCount={0}
          minimized={false}
        />,
      );

      // Find the toggle button (it contains the chevron SVG)
      const svgs = document.querySelectorAll('svg');
      const chevronSvg = Array.from(svgs).find(
        (svg) => svg.querySelector('path[d="M19 9l-7 7-7-7"]'),
      );
      const toggleButton = chevronSvg?.closest('button');
      expect(toggleButton).toBeTruthy();

      // With rollCount=0 and no auto-expand, the table container should be hidden
      // Click to expand
      fireEvent.click(toggleButton!);

      // After click, the chevron should rotate (rotate-180 class)
      expect(chevronSvg!.className.baseVal).toContain('rotate-180');
    });
  });

  // Minimized <-> full crossfade transition
  describe('minimized <-> full transition', () => {
    it('always renders both minimized pill and full table for crossfade', () => {
      render(<ScoreBoard {...defaultProps} minimized={false} />);
      expect(screen.getByRole('region', { name: 'game.score' })).toBeTruthy();
      expect(screen.getByRole('table', { name: 'game.score' })).toBeTruthy();
    });

    it('renders both views when minimized is true', () => {
      render(<ScoreBoard {...defaultProps} minimized={true} />);
      expect(screen.getByRole('region', { name: 'game.score' })).toBeTruthy();
      expect(screen.getByRole('table', { name: 'game.score' })).toBeTruthy();
    });
  });

  // #12 No nested scroll containers / 4-player layout
  describe('#12 nested scroll and 4-player layout', () => {
    const fourPlayers: PlayerInfo[] = [
      { id: 'p1', nickname: 'LongNickname1', isHost: true, isReady: false },
      { id: 'p2', nickname: 'LongNickname2', isHost: false, isReady: false },
      { id: 'p3', nickname: 'LongNickname3', isHost: false, isReady: false },
      { id: 'p4', nickname: 'LongNickname4', isHost: false, isReady: false },
    ];

    const fourPlayerProps = {
      ...defaultProps,
      players: fourPlayers,
      scores: { p1: {}, p2: {}, p3: {}, p4: {} },
      currentPlayer: 'p1',
      myId: 'p1',
    };

    it('should not have nested overflow-auto containers (causes double scrollbar)', () => {
      const { container } = render(<ScoreBoard {...fourPlayerProps} />);
      const overflowAutoEls = container.querySelectorAll('[class*="overflow-auto"]');
      expect(overflowAutoEls.length).toBeLessThanOrEqual(1);
    });

    it('should not have an element with both overflow-auto and max-h (creates vertical scroll that nests with parent)', () => {
      const { container } = render(<ScoreBoard {...fourPlayerProps} />);
      const els = container.querySelectorAll('[class*="overflow-auto"]');
      const nestedScrollEls = Array.from(els).filter(el =>
        /max-h-\[/.test(el.className),
      );
      expect(nestedScrollEls).toHaveLength(0);
    });

    it('should render all 4 player columns in the table header', () => {
      render(<ScoreBoard {...fourPlayerProps} />);
      const table = screen.getByRole('table', { name: 'game.score' });
      const headerCells = table.querySelectorAll('thead th');
      expect(headerCells).toHaveLength(5);
    });

    it('should truncate long nicknames in column headers', () => {
      render(<ScoreBoard {...fourPlayerProps} />);
      const table = screen.getByRole('table', { name: 'game.score' });
      const headerCells = table.querySelectorAll('thead th');
      for (let i = 1; i < headerCells.length; i++) {
        const span = headerCells[i].querySelector('span');
        expect(span?.className).toContain('truncate');
      }
    });
  });

  // Desktop always-visible scoreboard (lg: breakpoint overrides minimized)
  describe('desktop always-visible scoreboard', () => {
    it('minimized pill has lg: override classes to stay hidden on desktop when minimized', () => {
      render(
        <ScoreBoard {...defaultProps} minimized={true} />,
      );

      const region = screen.getByRole('region', { name: 'game.score' });
      expect(region.className).toContain('lg:opacity-0');
      expect(region.className).toContain('lg:scale-95');
      expect(region.className).toContain('lg:pointer-events-none');
      expect(region.className).toContain('lg:absolute');
    });

    it('minimized pill has no lg: override classes when not minimized', () => {
      render(<ScoreBoard {...defaultProps} minimized={false} />);

      const region = screen.getByRole('region', { name: 'game.score' });
      expect(region.className).not.toContain('lg:opacity-0');
    });

    it('full table has lg: override classes to stay visible on desktop when minimized', () => {
      render(
        <ScoreBoard {...defaultProps} minimized={true} />,
      );

      const table = screen.getByRole('table', { name: 'game.score' });
      const tableWrapper = table.closest('[class*="transition-[opacity,transform]"]')!;
      expect(tableWrapper.className).toContain('lg:opacity-100');
      expect(tableWrapper.className).toContain('lg:scale-100');
      expect(tableWrapper.className).toContain('lg:pointer-events-auto');
    });

    it('full table has no lg: override classes when not minimized (already visible)', () => {
      render(
        <ScoreBoard {...defaultProps} minimized={false} />,
      );

      const table = screen.getByRole('table', { name: 'game.score' });
      const tableWrapper = table.closest('[class*="transition-[opacity,transform]"]')!;
      expect(tableWrapper.className).not.toContain('lg:opacity-100');
      // Should have base opacity-100 instead
      expect(tableWrapper.className).toContain('opacity-100');
    });
  });

  // Score computation display
  describe('score display', () => {
    it('displays upper bonus progress', () => {
      render(
        <ScoreBoard
          {...defaultProps}
          scores={{ me: { ones: 3, twos: 6 }, other: {} }}
        />,
      );

      // Should display 9/63 for 'me' player
      expect(screen.getByText('9/63')).toBeTruthy();
    });

    it('displays +35 bonus when upper sum >= 63', () => {
      render(
        <ScoreBoard
          {...defaultProps}
          scores={{
            me: { ones: 5, twos: 10, threes: 15, fours: 12, fives: 15, sixes: 6 },
            other: {},
          }}
        />,
      );

      expect(screen.getByText('+35')).toBeTruthy();
    });

    it('displays total scores for each player', () => {
      render(
        <ScoreBoard
          {...defaultProps}
          scores={{ me: { ones: 3 }, other: { ones: 4 } }}
        />,
      );

      // Total should appear in the footer row
      const totalLabel = screen.getByText('categories.total');
      const totalRow = totalLabel.closest('tr')!;
      const totalCells = totalRow.querySelectorAll('td');
      expect(totalCells[1].textContent).toBe('3');
      expect(totalCells[2].textContent).toBe('4');
    });
  });
});
