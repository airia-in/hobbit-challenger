import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardContent } from '../src/components/dashboard/DashboardPage';

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
  totalXp: 100,
  todayNetXp: 0,
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

function heatmapCells(count: number) {
  return {
    cells: Array.from({ length: count }, (_, index) => ({
      dayNumber: index + 1,
      state: 'future' as const,
      dayLabel: null,
    })),
  };
}

describe('DashboardContent journey path', () => {
  beforeEach(() => {
    mockActivitiesGetToday.mockReturnValue(idleQuery(baseToday));
    mockStatsGetDashboard.mockReturnValue(idleQuery(baseStats));
    mockHeatmapGet.mockReturnValue(idleQuery(heatmapCells(30)));
    mockProfileGet.mockReturnValue(
      idleQuery({ reminderTime: null, needsPhoneMigration: false }),
    );
  });

  it('renders journey path above the heatmap grid', () => {
    render(<DashboardContent />);
    expect(
      screen.getByRole('heading', { name: /your trail/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /30-day progress/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('journey-path')).toBeInTheDocument();
    const headings = screen.getAllByRole('heading', { level: 2 });
    const trailIndex = headings.findIndex((heading) =>
      /your trail/i.test(heading.textContent ?? ''),
    );
    const progressIndex = headings.findIndex((heading) =>
      /30-day progress/i.test(heading.textContent ?? ''),
    );
    expect(trailIndex).toBeGreaterThanOrEqual(0);
    expect(progressIndex).toBeGreaterThan(trailIndex);
  });
});
