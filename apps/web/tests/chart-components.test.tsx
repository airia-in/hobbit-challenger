import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CompletionHeatmap,
  DayCounter,
  HeatmapGrid,
  JourneyPath,
  LineChart,
  getHeatmapColumnCount,
  type HeatmapCellData,
  type HeatmapCellState,
} from '@workspace-starter/ui';

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

afterEach(() => {
  vi.clearAllMocks();
  mockMatchMedia(false);
});

function journeyCells(
  count: number,
  state: HeatmapCellState = 'future',
): HeatmapCellData[] {
  return Array.from({ length: count }, (_, index) => ({
    dayNumber: index + 1,
    state,
    dayLabel: null,
  }));
}

describe('LineChart', () => {
  it('renders empty state without crashing', () => {
    render(<LineChart series={[{ label: 'Test', points: [] }]} />);
    expect(screen.getByText('Not enough data yet')).toBeInTheDocument();
  });

  it('renders chart with data', () => {
    const { container } = render(
      <LineChart
        series={[
          {
            label: 'Water',
            points: [
              { date: '2026-06-01', value: 2 },
              { date: '2026-06-02', value: 3 },
            ],
          },
        ]}
      />,
    );
    expect(container.querySelector('svg')).toBeTruthy();
    expect(screen.getByText('Water')).toBeInTheDocument();
  });
});

describe('CompletionHeatmap', () => {
  it('renders empty state without crashing', () => {
    render(<CompletionHeatmap days={[]} />);
    expect(screen.getByText('Not enough data yet')).toBeInTheDocument();
  });

  it('renders heatmap cells with legend', () => {
    const { container } = render(
      <CompletionHeatmap
        days={[
          { date: '2026-06-01', state: 'completed' },
          { date: '2026-06-02', state: 'missed' },
        ]}
      />,
    );
    expect(container.querySelectorAll('rect')).toHaveLength(2);
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Missed')).toBeInTheDocument();
  });
});

describe('HeatmapGrid', () => {
  function cells(count: number) {
    return Array.from({ length: count }, (_, index) => ({
      dayNumber: index + 1,
      state: 'future' as const,
      dayLabel: null,
    }));
  }

  it('uses a compact week layout for 7-day ranges', () => {
    const { container } = render(<HeatmapGrid cells={cells(7)} />);
    expect(screen.getAllByTitle(/Day \d+/)).toHaveLength(7);
    expect(container.querySelector('.grid')).toHaveStyle({
      gridTemplateColumns: 'repeat(7, minmax(1.25rem, 1fr))',
    });
  });

  it('keeps long ranges scrollable instead of shrinking cells away', () => {
    const { container } = render(<HeatmapGrid cells={cells(366)} />);
    expect(screen.getAllByTitle(/Day \d+/)).toHaveLength(366);
    expect(container.querySelector('.grid')).toHaveStyle({
      gridTemplateColumns: 'repeat(24, minmax(1.25rem, 1fr))',
    });
  });

  it('derives column counts for week, month, and arbitrary ranges', () => {
    expect(getHeatmapColumnCount(7)).toBe(7);
    expect(getHeatmapColumnCount(31)).toBe(7);
    expect(getHeatmapColumnCount(75)).toBe(13);
    expect(getHeatmapColumnCount(366)).toBe(24);
  });

  it('renders missed days as neutral while preserving completed and today colors', () => {
    render(
      <HeatmapGrid
        cells={[
          { dayNumber: 1, state: 'completed', dayLabel: null },
          { dayNumber: 2, state: 'failed', dayLabel: null },
          { dayNumber: 3, state: 'today', dayLabel: null },
        ]}
      />,
    );

    expect(screen.getByTitle('Day 1')).toHaveClass('bg-[var(--success)]');
    expect(screen.getByTitle('Day 2')).toHaveClass(
      'bg-[var(--surface-raised)]',
    );
    expect(screen.getByTitle('Day 2')).not.toHaveClass(
      'bg-[var(--accent-red)]',
    );
    expect(screen.getByTitle('Day 3')).toHaveClass('bg-[var(--gold-fill)]');
  });
});

describe('DayCounter', () => {
  it('renders explicit challenge totals without a default 75-day fallback', () => {
    const { container } = render(
      <DayCounter
        currentDay={370}
        totalDays={366}
        startDate="2026-01-01T00:00:00.000Z"
        endDate="2027-01-01T00:00:00.000Z"
      />,
    );

    expect(container).toHaveTextContent('/ 366');
    expect(container).toHaveTextContent('Range');
    expect(container).toHaveTextContent('to');
  });
});

describe('JourneyPath', () => {
  it('renders one tile per cell with horizontal scroll', () => {
    const { container } = render(
      <JourneyPath cells={journeyCells(30)} currentDay={5} lengthDays={30} />,
    );
    expect(screen.getByTestId('journey-path')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(30);
    expect(container.querySelector('.overflow-x-auto')).toBeTruthy();
  });

  it('maps each heatmap cell state to data-state', () => {
    const states: HeatmapCellState[] = [
      'completed',
      'failed',
      'future',
      'today',
      'not_started',
    ];
    const cells = states.map((state, index) => ({
      dayNumber: index + 1,
      state,
      dayLabel: null,
    }));
    render(<JourneyPath cells={cells} currentDay={4} lengthDays={5} />);
    for (const state of states) {
      expect(document.querySelector(`[data-state="${state}"]`)).toBeTruthy();
    }
  });

  it('renders failed trail days as neutral instead of red', () => {
    const cells: HeatmapCellData[] = [
      { dayNumber: 1, state: 'completed', dayLabel: null },
      { dayNumber: 2, state: 'failed', dayLabel: null },
      { dayNumber: 3, state: 'today', dayLabel: null },
    ];

    render(<JourneyPath cells={cells} currentDay={3} lengthDays={3} />);

    const failedTile = document.querySelector(
      '[data-state="failed"] div[title]',
    );
    expect(failedTile).toHaveClass('bg-[var(--surface-raised)]');
    expect(failedTile).not.toHaveClass('bg-[var(--accent-red)]');
  });

  it('places landmarks at days 7, 21, 30, and 66 for long challenges', () => {
    render(
      <JourneyPath cells={journeyCells(66)} currentDay={10} lengthDays={66} />,
    );
    expect(screen.getByTestId('journey-landmark-7')).toBeInTheDocument();
    expect(screen.getByTestId('journey-landmark-21')).toBeInTheDocument();
    expect(screen.getByTestId('journey-landmark-30')).toBeInTheDocument();
    expect(screen.getByTestId('journey-landmark-66')).toBeInTheDocument();
  });

  it('hides day-66 landmark when challenge is shorter than 66 days', () => {
    render(
      <JourneyPath cells={journeyCells(30)} currentDay={10} lengthDays={30} />,
    );
    expect(screen.getByTestId('journey-landmark-7')).toBeInTheDocument();
    expect(screen.queryByTestId('journey-landmark-66')).not.toBeInTheDocument();
  });

  it('hides landmarks beyond challenge length for short challenges', () => {
    const { rerender } = render(
      <JourneyPath cells={journeyCells(6)} currentDay={3} lengthDays={6} />,
    );
    expect(screen.queryByTestId('journey-landmark-7')).not.toBeInTheDocument();

    rerender(
      <JourneyPath cells={journeyCells(20)} currentDay={10} lengthDays={20} />,
    );
    expect(screen.getByTestId('journey-landmark-7')).toBeInTheDocument();
    expect(screen.queryByTestId('journey-landmark-21')).not.toBeInTheDocument();
    expect(screen.queryByTestId('journey-landmark-30')).not.toBeInTheDocument();
  });

  it('does not mark lifetime-earned milestones as earned on future challenge days', () => {
    render(
      <JourneyPath
        cells={journeyCells(30)}
        currentDay={3}
        lengthDays={30}
        earnedMilestoneKeys={['streak_7']}
      />,
    );
    expect(screen.getByTestId('journey-landmark-7')).toHaveAttribute(
      'data-earned',
      'false',
    );
    expect(screen.getByTestId('journey-landmark-7')).toHaveAttribute(
      'data-upcoming',
      'true',
    );
  });

  it('marks earned landmarks and upcoming landmarks', () => {
    render(
      <JourneyPath
        cells={journeyCells(30)}
        currentDay={10}
        lengthDays={30}
        earnedMilestoneKeys={['streak_7']}
      />,
    );
    expect(screen.getByTestId('journey-landmark-7')).toHaveAttribute(
      'data-earned',
      'true',
    );
    expect(screen.getByTestId('journey-landmark-21')).toHaveAttribute(
      'data-earned',
      'false',
    );
    expect(screen.getByTestId('journey-landmark-21')).toHaveAttribute(
      'data-upcoming',
      'true',
    );
    expect(screen.getByTestId('journey-landmark-30')).toHaveAttribute(
      'data-upcoming',
      'true',
    );
  });

  it('marks passed-but-missed landmarks when day is behind current day', () => {
    render(
      <JourneyPath
        cells={journeyCells(30)}
        currentDay={25}
        lengthDays={30}
        earnedMilestoneKeys={['streak_7']}
      />,
    );
    expect(screen.getByTestId('journey-landmark-21')).toHaveAttribute(
      'data-earned',
      'false',
    );
    expect(screen.getByTestId('journey-landmark-21')).toHaveAttribute(
      'data-upcoming',
      'false',
    );
  });

  it('shows progress cursor on current day', () => {
    render(
      <JourneyPath cells={journeyCells(10)} currentDay={4} lengthDays={10} />,
    );
    expect(screen.getByTestId('journey-current-cursor')).toBeInTheDocument();
    const currentTile = document.querySelector('[data-current="true"]');
    expect(currentTile).toHaveAttribute('data-day', '4');
  });

  it('shows progress cursor on last day when currentDay exceeds lengthDays', () => {
    render(
      <JourneyPath cells={journeyCells(30)} currentDay={31} lengthDays={30} />,
    );
    expect(screen.getByTestId('journey-current-cursor')).toBeInTheDocument();
    const currentTile = document.querySelector('[data-current="true"]');
    expect(currentTile).toHaveAttribute('data-day', '30');
  });

  it('makes the horizontal scroller keyboard-accessible', () => {
    render(
      <JourneyPath cells={journeyCells(30)} currentDay={5} lengthDays={30} />,
    );
    const scroller = screen.getByTestId('journey-path');
    expect(scroller).toHaveAttribute('tabindex', '0');
    expect(scroller).toHaveAttribute('role', 'region');
    expect(scroller.getAttribute('aria-label')).toMatch(/arrow keys/i);
  });

  it('scrolls horizontally via arrow keys on the focused trail region', () => {
    const scrollBy = vi.fn();
    const scrollTo = vi.fn();
    render(
      <JourneyPath cells={journeyCells(30)} currentDay={5} lengthDays={30} />,
    );
    const scroller = screen.getByTestId('journey-path');
    scroller.scrollBy = scrollBy;
    scroller.scrollTo = scrollTo;

    fireEvent.keyDown(scroller, { key: 'ArrowRight' });
    expect(scrollBy).toHaveBeenCalledWith({ left: 80, behavior: 'smooth' });

    fireEvent.keyDown(scroller, { key: 'ArrowLeft' });
    expect(scrollBy).toHaveBeenCalledWith({ left: -80, behavior: 'smooth' });

    fireEvent.keyDown(scroller, { key: 'Home' });
    expect(scrollTo).toHaveBeenCalledWith({ left: 0, behavior: 'smooth' });

    fireEvent.keyDown(scroller, { key: 'End' });
    expect(scrollTo).toHaveBeenCalledWith({
      left: scroller.scrollWidth,
      behavior: 'smooth',
    });
  });

  it('exposes per-day state via aria-label on each listitem', () => {
    render(
      <JourneyPath
        cells={journeyCells(10)}
        currentDay={4}
        lengthDays={10}
        earnedMilestoneKeys={['streak_7']}
      />,
    );
    const currentDayTile = document.querySelector('[data-day="4"]');
    expect(currentDayTile?.getAttribute('aria-label')).toMatch(
      /Day 4.*current day/i,
    );

    const day7Tile = document.querySelector('[data-day="7"]');
    expect(day7Tile?.getAttribute('aria-label')).toMatch(
      /Day 7.*upcoming landmark: First week on the trail/i,
    );
  });

  it('omits today pulse animation when reduced motion is preferred', () => {
    mockMatchMedia(true);
    const cells = journeyCells(5, 'today');
    render(<JourneyPath cells={cells} currentDay={1} lengthDays={5} />);
    const todayTile = document.querySelector('[data-state="today"] div[title]');
    expect(todayTile).toBeTruthy();
    expect(todayTile?.className).not.toContain('journey-today-pulse');
  });

  it('reacts to prefers-reduced-motion changes while mounted', async () => {
    let matches = false;
    const listeners = new Map<string, Set<() => void>>();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        get matches() {
          return matches;
        },
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: (event: string, handler: () => void) => {
          if (!listeners.has(event)) listeners.set(event, new Set());
          listeners.get(event)!.add(handler);
        },
        removeEventListener: (event: string, handler: () => void) => {
          listeners.get(event)?.delete(handler);
        },
        dispatchEvent: vi.fn(),
      })),
    });

    const cells = journeyCells(5, 'today');
    render(<JourneyPath cells={cells} currentDay={1} lengthDays={5} />);
    const todayTileSelector = '[data-state="today"] div[title]';
    expect(document.querySelector(todayTileSelector)?.className).toContain(
      'journey-today-pulse',
    );

    matches = true;
    for (const handler of listeners.get('change') ?? []) {
      handler();
    }

    await waitFor(() => {
      expect(
        document.querySelector(todayTileSelector)?.className,
      ).not.toContain('journey-today-pulse');
    });
  });
});
