import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import GamePausedOverlay from './GamePausedOverlay';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'game.paused.title': `${opts?.name} has disconnected`,
        'game.paused.subtitle': 'Waiting for reconnection...',
        'game.paused.remaining': `${opts?.seconds}s remaining`,
      };
      return map[key] ?? key;
    },
  }),
}));

describe('GamePausedOverlay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when pausedFor is null', () => {
    const { container } = render(<GamePausedOverlay pausedFor={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders overlay with player name and countdown', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    render(
      <GamePausedOverlay
        pausedFor={{ playerId: 'p2', nickname: 'Bob', expiresAt: now + 45000 }}
      />
    );
    expect(screen.getByText('Bob has disconnected')).toBeTruthy();
    expect(screen.getByText('Waiting for reconnection...')).toBeTruthy();
    expect(screen.getByText('45s remaining')).toBeTruthy();
  });

  it('counts down every second', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    render(
      <GamePausedOverlay
        pausedFor={{ playerId: 'p2', nickname: 'Bob', expiresAt: now + 10000 }}
      />
    );
    expect(screen.getByText('10s remaining')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText('9s remaining')).toBeTruthy();
  });

  it('shows 0 when expired', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    render(
      <GamePausedOverlay
        pausedFor={{ playerId: 'p2', nickname: 'Bob', expiresAt: now - 1000 }}
      />
    );
    expect(screen.getByText('0s remaining')).toBeTruthy();
  });

  it('has accessible role', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    render(
      <GamePausedOverlay
        pausedFor={{ playerId: 'p2', nickname: 'Bob', expiresAt: now + 30000 }}
      />
    );
    expect(screen.getByRole('alert')).toBeTruthy();
  });
});
