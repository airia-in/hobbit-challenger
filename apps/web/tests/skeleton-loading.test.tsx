import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardContent } from '../src/components/dashboard/DashboardPage';
import { HistoryContent } from '../src/components/history/HistoryPage';
import { LeaderboardContent } from '../src/components/leaderboard/LeaderboardPage';
import { ProgressContent } from '../src/components/progress/ProgressPage';
import { LazyJourneyPath } from '../src/components/lazy/LazyJourneyPath';
import type { HeatmapCellState } from '@workspace-starter/types';

const mockActivitiesGetToday = vi.fn();
const mockStatsGetDashboard = vi.fn();
const mockHeatmapGet = vi.fn();
const mockProfileGet = vi.fn();
const mockHistoryList = vi.fn();
const mockHistoryExport = vi.fn();
const mockAuthMe = vi.fn();
const mockLeaderboardGet = vi.fn();
const mockLeaderboardSeries = vi.fn();
const mockStatsActivitySeries = vi.fn();
const mockStatsActivityCompletion = vi.fn();
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
      activitySeries: {
        useQuery: (...args: unknown[]) => mockStatsActivitySeries(...args),
      },
      activityCompletion: {
        useQuery: (...args: unknown[]) => mockStatsActivityCompletion(...args),
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
    history: {
      list: {
        useQuery: (...args: unknown[]) => mockHistoryList(...args),
      },
      exportCsv: {
        useQuery: (...args: unknown[]) => mockHistoryExport(...args),
      },
    },
    auth: {
      me: {
        useQuery: (...args: unknown[]) => mockAuthMe(...args),
      },
    },
    leaderboard: {
      get: {
        useQuery: (...args: unknown[]) => mockLeaderboardGet(...args),
      },
      series: {
        useQuery: (...args: unknown[]) => mockLeaderboardSeries(...args),
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

const baseToday = {
  scoredActivities: [
    {
      id: 'activity-1',
      title: 'Water',
      emoji: '💧',
      kind: 'CHECKBOX' as const,
      log: null,
      canEdit: true,
      seedKey: 'WATER',
      canAttachProof: false,
    },
  ],
  personalActivities: [],
  dayTotals: {
    netXp: 0,
    personalXp: 0,
    xpEarned: 0,
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
  todayDate: new Date('2026-07-03T00:00:00.000Z'),
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

const heatmapData = {
  cells: Array.from({ length: 30 }, (_, index) => ({
    dayNumber: index + 1,
    state: 'future' as HeatmapCellState,
    dayLabel: null,
  })),
};

const meWithGroup = {
  user: {
    id: 'user-1',
    groupId: 'group-1',
  },
};

const leaderboardData = {
  podium: [],
  members: [],
};

const leaderboardSeriesData = {
  members: [],
};

const activitySeriesData = [{ date: '2026-07-01', value: 5 }];

const activityCompletionData = {
  streak: 2,
  rateByWeek: [],
  days: [],
};

const dashboardIdle = idleQuery(baseStats);
const todayIdle = idleQuery(baseToday);
const heatmapIdle = idleQuery(heatmapData);
const profileIdle = idleQuery({
  reminderTime: null,
  needsPhoneMigration: false,
});
const meIdle = idleQuery(meWithGroup);
const leaderboardIdle = idleQuery(leaderboardData);
const leaderboardSeriesIdle = idleQuery(leaderboardSeriesData);
const activitySeriesIdle = idleQuery(activitySeriesData);
const activityCompletionIdle = idleQuery(activityCompletionData);
const historyExportIdle = { refetch: vi.fn(), isFetching: false };

afterEach(() => {
  vi.clearAllMocks();
});

beforeEach(() => {
  mockActivitiesGetToday.mockReturnValue(todayIdle);
  mockStatsGetDashboard.mockReturnValue(dashboardIdle);
  mockHeatmapGet.mockReturnValue(heatmapIdle);
  mockProfileGet.mockReturnValue(profileIdle);
  mockAuthMe.mockReturnValue(meIdle);
  mockLeaderboardGet.mockReturnValue(leaderboardIdle);
  mockLeaderboardSeries.mockReturnValue(leaderboardSeriesIdle);
  mockStatsActivitySeries.mockReturnValue(activitySeriesIdle);
  mockStatsActivityCompletion.mockReturnValue(activityCompletionIdle);
  mockHistoryExport.mockReturnValue(historyExportIdle);
});

describe('skeleton loading states', () => {
  it('DashboardContent shows page skeleton while primary queries load', () => {
    mockActivitiesGetToday.mockReturnValue(loadingQuery());
    render(<DashboardContent />);
    expect(screen.queryByText(/loading dashboard/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Loading dashboard')).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.getAllByTestId('task-card-skeleton').length).toBeGreaterThan(
      0,
    );
  });

  it('DashboardContent does not show page skeleton when cache is warm', () => {
    render(<DashboardContent />);
    expect(
      screen.queryByLabelText('Loading dashboard'),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('task-card-skeleton')).not.toBeInTheDocument();
  });

  it('ProgressContent shows page skeleton while primary queries load', () => {
    mockStatsGetDashboard.mockReturnValue(loadingQuery());
    render(<ProgressContent />);
    expect(screen.queryByText(/loading progress/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Loading progress')).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.getByTestId('milestone-list-skeleton')).toBeInTheDocument();
    expect(screen.getAllByTestId('line-chart-skeleton').length).toBeGreaterThan(
      0,
    );
  });

  it('HistoryContent keeps header and shows day card skeletons while loading', () => {
    mockHistoryList.mockReturnValue(loadingQuery());
    render(<HistoryContent />);
    expect(
      screen.getByRole('heading', { name: 'History' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/loading history/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Loading history')).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.getAllByTestId('history-day-card-skeleton')).toHaveLength(3);
  });

  it('LeaderboardContent shows rich skeleton after auth resolves with a group', () => {
    mockLeaderboardGet.mockReturnValue(loadingQuery());
    render(<LeaderboardContent />);
    expect(screen.queryByText(/loading leaderboard/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Loading leaderboard')).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.getByTestId('podium-block-skeleton')).toBeInTheDocument();
    expect(
      screen.getByTestId('leaderboard-table-skeleton'),
    ).toBeInTheDocument();
  });
});

describe('lazy below-the-fold components', () => {
  it('LazyJourneyPath resolves after suspense with skeleton fallback', async () => {
    render(
      <LazyJourneyPath
        cells={heatmapData.cells}
        currentDay={10}
        lengthDays={30}
        earnedMilestoneKeys={[]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('journey-path')).toBeInTheDocument();
    });
    expect(
      screen.queryByTestId('journey-path-skeleton'),
    ).not.toBeInTheDocument();
  });
});
