import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import HandAnnouncement from './HandAnnouncement';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('HandAnnouncement', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders special hand name for yacht', () => {
    render(<HandAnnouncement category="yacht" onDone={vi.fn()} />);
    expect(screen.getByText('categories.yacht')).toBeTruthy();
  });

  it('renders special hand name for fullHouse', () => {
    render(<HandAnnouncement category="fullHouse" onDone={vi.fn()} />);
    expect(screen.getByText('categories.fullHouse')).toBeTruthy();
  });

  it('calls onDone immediately for non-special hands', () => {
    const onDone = vi.fn();
    render(<HandAnnouncement category="ones" onDone={onDone} />);
    expect(onDone).toHaveBeenCalled();
  });

  it('calls onDone after animation completes for special hands', () => {
    const onDone = vi.fn();
    render(<HandAnnouncement category="yacht" onDone={onDone} />);
    expect(onDone).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(3600); });
    expect(onDone).toHaveBeenCalled();
  });

  it('renders null when category is null', () => {
    const onDone = vi.fn();
    const { container } = render(<HandAnnouncement category={null} onDone={onDone} />);
    expect(container.innerHTML).toBe('');
    expect(onDone).toHaveBeenCalled();
  });

  it('displays score when provided', () => {
    render(<HandAnnouncement category="yacht" score={50} onDone={vi.fn()} />);
    expect(screen.getByText('+50')).toBeTruthy();
  });
});
