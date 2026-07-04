import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('renders companion between consistency and journey path when heatmap is loaded', async () => {
    render(<DashboardContent />);
    // Companion and journey path are lazy-loaded behind Suspense, so wait until
    // both their headings have resolved before asserting their relative order.
    await waitFor(() => {
      expect(screen.getByTestId('companion-panel')).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { level: 2, name: /your trail/i }),
      ).toBeInTheDocument();
    });
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

  it('shows below-fold skeletons while heatmap is loading', () => {
    mockHeatmapGet.mockReturnValue(loadingQuery());
    render(<DashboardContent />);
    expect(screen.queryByTestId('companion-panel')).not.toBeInTheDocument();
    expect(screen.getByTestId('journey-path-skeleton')).toBeInTheDocument();
    expect(screen.getByTestId('heatmap-grid-skeleton')).toBeInTheDocument();
    expect(screen.getByTestId('companion-panel-skeleton')).toBeInTheDocument();
  });

  it('hides companion when heatmap errors', () => {
    mockHeatmapGet.mockReturnValue(errorQuery());
    render(<DashboardContent />);
    expect(screen.queryByTestId('companion-panel')).not.toBeInTheDocument();
  });

  it('reflects a rainy mood when recent days are mostly missed', async () => {
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
    await waitFor(() => {
      expect(screen.getByTestId('companion-svg')).toHaveAttribute(
        'data-mood',
        'rainy',
      );
    });
  });

  it('does not downgrade mood when viewing a past day but calendar today is complete', async () => {
    const user = userEvent.setup();
    mockStatsGetDashboard.mockReturnValue(
      idleQuery({ ...baseStats, currentDay: 7 }),
    );
    mockHeatmapGet.mockReturnValue(
      idleQuery(
        heatmapCells(30, (day) => {
          if (day === 1 || day === 2) return 'completed';
          if (day >= 3 && day <= 6) return 'failed';
          if (day === 7) return 'today';
          return 'future';
        }),
      ),
    );
    // React Query returns stable references across renders; precompute the two
    // query results so the mock returns the SAME instance per input. Returning a
    // fresh idleQuery(...) on every call changes identity each render and drives
    // DashboardContent into an infinite re-render loop (heap OOM in the suite).
    const pastDayQuery = idleQuery({
      ...baseToday,
      dateKey: '2026-07-02',
      currentDay: 7,
      isViewingToday: false,
      canNavigateBack: true,
      canNavigateForward: true,
      scoredActivities: [
        {
          ...baseToday.scoredActivities[0],
          log: null,
        },
      ],
    });
    const todayQuery = idleQuery({
      ...baseToday,
      currentDay: 7,
      dateKey: '2026-07-03',
      isViewingToday: true,
    });
    mockActivitiesGetToday.mockImplementation((input?: { date?: string }) =>
      input?.date ? pastDayQuery : todayQuery,
    );

    render(<DashboardContent />);
    await waitFor(() => {
      expect(screen.getByTestId('companion-svg')).toHaveAttribute(
        'data-mood',
        'sleepy',
      );
    });

    await user.click(screen.getByTestId('dashboard-date-prev'));
    await waitFor(() => {
      expect(screen.getByTestId('companion-svg')).toHaveAttribute(
        'data-mood',
        'sleepy',
      );
    });
    expect(screen.getByTestId('companion-svg')).not.toHaveAttribute(
      'data-mood',
      'rainy',
    );
  });
});
