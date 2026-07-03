import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardContent } from '../src/components/dashboard/DashboardPage';
import type { HeatmapCellState } from '@workspace-starter/types';

const mockActivitiesGetToday = vi.fn();
const mockStatsGetDashboard = vi.fn();
const mockHeatmapGet = vi.fn();
const mockProfileGet = vi.fn();
const mockUseMutation = vi.fn(() => ({
  mutate: vi.fn(),
  isPending: false,
  reset: vi.fn(),
}));

vi.mock('../src/lib/milestone-toast-storage', () => ({
  isMilestoneToastDismissed: vi.fn(() => true),
  dismissMilestoneToast: vi.fn(),
}));

vi.mock('../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      activities: {
        getToday: {
          cancel: vi.fn(),
          getData: vi.fn(),
          invalidate: vi.fn(),
          setData: vi.fn(),
        },
      },
      stats: {
        getDashboard: {
          invalidate: vi.fn(),
        },
      },
      heatmap: {
        get: {
          invalidate: vi.fn(),
        },
      },
    }),
    activities: {
      getToday: {
        useQuery: (...args: unknown[]) => mockActivitiesGetToday(...args),
      },
      markActivity: { useMutation: () => mockUseMutation() },
      undoActivity: { useMutation: () => mockUseMutation() },
      logNumber: { useMutation: () => mockUseMutation() },
      setTier: { useMutation: () => mockUseMutation() },
      setSubPoints: { useMutation: () => mockUseMutation() },
      attachProof: { useMutation: () => mockUseMutation() },
    },
    stats: {
      getDashboard: {
        useQuery: (...args: unknown[]) => mockStatsGetDashboard(...args),
      },
    },
    heatmap: {
      get: {
        useQuery: (...args: unknown[]) => mockHeatmapGet(...args),
      },
    },
    profile: {
      get: {
        useQuery: (...args: unknown[]) => mockProfileGet(...args),
      },
    },
    guidance: {
      ask: { useMutation: () => mockUseMutation() },
    },
  },
}));

function idleQuery<T>(data: T) {
  return {
    data,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  };
}

function loadingQuery() {
  return {
    data: undefined,
    isLoading: true,
    isError: false,
    error: null,
    refetch: vi.fn(),
  };
}

function errorQuery(message = 'Heatmap failed') {
  return {
    data: undefined,
    isLoading: false,
    isError: true,
    error: { message },
    refetch: vi.fn(),
  };
}

const baseToday = {
  scoredActivities: [
    {
      id: 'activity-1',
      title: 'Water',
      emoji: '💧',
      kind: 'CHECKBOX' as const,
      log: {
        state: 'DONE' as const,
        value: null,
        tier: null,
        subPoints: null,
        xpAwarded: 10,
        proofUrl: null,
        aiVerdict: null,
      },
      canEdit: true,
      seedKey: 'WATER',
      canAttachProof: false,
    },
  ],
  personalActivities: [],
  dayTotals: {
    netXp: 10,
    personalXp: 0,
    xpEarned: 10,
    xpDeducted: 0,
  },
  dateKey: '2026-07-03',
  isViewingToday: true,
  canNavigateBack: true,
  canNavigateForward: false,
  canEdit: true,
  currentDay: 10,
};

const baseStats = {
  currentDay: 10,
  lengthDays: 30,
  startDate: new Date('2026-06-01T00:00:00.000Z'),
  estimatedFinishDate: new Date('2026-07-01T00:00:00.000Z'),
  totalXp: 100,
  todayNetXp: 10,
  currentStreak: 5,
  longestStreak: 5,
  successRate: 60,
  streakFreezesAvailable: 0,
  streakFreezesUsed: 0,
  streakBreak: {
    occurred: false,
    previousStreak: 0,
    brokeOnDate: null,
    daysSinceBreak: 0,
  },
  milestones: {
    earned: [],
    latestUnlock: null,
    latestUnlockAdditionalCount: 0,
  },
};

function heatmapCells(
  count: number,
  stateForDay?: (day: number) => HeatmapCellState,
) {
  return {
    cells: Array.from({ length: count }, (_, index) => {
      const dayNumber = index + 1;
      return {
        dayNumber,
        state: stateForDay?.(dayNumber) ?? ('future' as const),
        dayLabel: null,
      };
    }),
  };
}

describe('DashboardContent companion panel', () => {
  beforeEach(() => {
    mockActivitiesGetToday.mockReturnValue(idleQuery(baseToday));
    mockStatsGetDashboard.mockReturnValue(idleQuery(baseStats));
    mockHeatmapGet.mockReturnValue(
      idleQuery(
        heatmapCells(30, (day) => {
          if (day >= 4 && day <= 9) return 'completed';
          if (day === 10) return 'today';
          return 'future';
        }),
      ),
    );
    mockProfileGet.mockReturnValue(
      idleQuery({ reminderTime: null, needsPhoneMigration: false }),
    );
  });

  it('renders companion between consistency and journey path when heatmap is loaded', () => {
    render(<DashboardContent />);
    expect(screen.getByTestId('companion-panel')).toBeInTheDocument();
    expect(screen.getByTestId('companion-svg')).toHaveAttribute(
      'data-mood',
      'thriving',
    );

    const headings = screen.getAllByRole('heading', { level: 2 });
    const consistencyIndex = headings.findIndex((heading) =>
      /consistency/i.test(heading.textContent ?? ''),
    );
    const gardenIndex = headings.findIndex((heading) =>
      /your garden/i.test(heading.textContent ?? ''),
    );
    const trailIndex = headings.findIndex((heading) =>
      /your trail/i.test(heading.textContent ?? ''),
    );
    expect(consistencyIndex).toBeGreaterThanOrEqual(0);
    expect(gardenIndex).toBeGreaterThan(consistencyIndex);
    expect(trailIndex).toBeGreaterThan(gardenIndex);
  });

  it('hides companion while heatmap is loading', () => {
    mockHeatmapGet.mockReturnValue(loadingQuery());
    render(<DashboardContent />);
    expect(screen.queryByTestId('companion-panel')).not.toBeInTheDocument();
    expect(screen.getByText(/loading progress/i)).toBeInTheDocument();
  });

  it('hides companion when heatmap errors', () => {
    mockHeatmapGet.mockReturnValue(errorQuery());
    render(<DashboardContent />);
    expect(screen.queryByTestId('companion-panel')).not.toBeInTheDocument();
  });

  it('reflects a rainy mood when recent days are mostly missed', () => {
    mockHeatmapGet.mockReturnValue(
      idleQuery(
        heatmapCells(30, (day) => {
          if (day >= 4 && day <= 9) return 'failed';
          if (day === 10) return 'today';
          return 'future';
        }),
      ),
    );
    mockActivitiesGetToday.mockReturnValue(
      idleQuery({
        ...baseToday,
        scoredActivities: [
          {
            ...baseToday.scoredActivities[0],
            log: null,
          },
        ],
      }),
    );
    render(<DashboardContent />);
    expect(screen.getByTestId('companion-svg')).toHaveAttribute(
      'data-mood',
      'rainy',
    );
  });
});
