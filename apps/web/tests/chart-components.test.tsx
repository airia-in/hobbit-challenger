import { render, screen } from '@testing-library/react';
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

  it('omits today pulse animation when reduced motion is preferred', () => {
    mockMatchMedia(true);
    const cells = journeyCells(5, 'today');
    render(<JourneyPath cells={cells} currentDay={1} lengthDays={5} />);
    const todayTile = document.querySelector('[data-state="today"] div[title]');
    expect(todayTile).toBeTruthy();
    expect(todayTile?.className).not.toContain('journey-today-pulse');
  });
});
