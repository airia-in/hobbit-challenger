import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, act } from '@testing-library/react';
import { MilestoneUnlockToast } from '../src/components/dashboard/MilestoneUnlockToast';
import { EarnedMilestonesSection } from '../src/components/progress/EarnedMilestonesSection';
import { DashboardContent } from '../src/components/dashboard/DashboardPage';
import {
  dismissMilestoneToast,
  isMilestoneToastDismissed,
} from '../src/lib/milestone-toast-storage';

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
  isMilestoneToastDismissed: vi.fn(() => false),
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

const milestone = {
  key: 'streak_7' as const,
  title: 'First week on the trail',
  description: 'Seven consecutive challenge days logged.',
  unlockCopy: 'Seven days marching — the path is starting to feel like home.',
  unlockedAt: new Date('2026-07-03T00:00:00.000Z'),
};

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
  currentDay: 3,
};

const baseStats = {
  currentDay: 3,
  lengthDays: 45,
  startDate: new Date('2026-06-01T00:00:00.000Z'),
  estimatedFinishDate: new Date('2026-07-15T00:00:00.000Z'),
  totalXp: 100,
  todayNetXp: 0,
  currentStreak: 7,
  longestStreak: 7,
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
    earned: [milestone],
    latestUnlock: milestone,
    latestUnlockAdditionalCount: 0,
  },
};

describe('MilestoneUnlockToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders unlock copy with aria-live status', () => {
    render(<MilestoneUnlockToast milestone={milestone} onDismiss={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent(milestone.title);
    expect(screen.getByRole('status')).toHaveTextContent(milestone.unlockCopy);
  });

  it('auto-dismisses after timeout', () => {
    const onDismiss = vi.fn();
    render(
      <MilestoneUnlockToast milestone={milestone} onDismiss={onDismiss} />,
    );
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe('EarnedMilestonesSection', () => {
  it('lists earned milestones', () => {
    render(<EarnedMilestonesSection milestones={[milestone]} />);
    expect(screen.getByTestId('milestone-earned-streak_7')).toBeInTheDocument();
    expect(screen.getByText(milestone.title)).toBeInTheDocument();
    expect(
      screen.getByTestId('milestone-download-streak_7'),
    ).toBeInTheDocument();
  });

  it('shows empty state when none earned', () => {
    render(<EarnedMilestonesSection milestones={[]} />);
    expect(screen.getByText(/first milestone is waiting/i)).toBeInTheDocument();
  });
});

describe('DashboardContent milestone toast', () => {
  beforeEach(() => {
    vi.mocked(isMilestoneToastDismissed).mockReturnValue(false);
    mockActivitiesGetToday.mockReturnValue(idleQuery(baseToday));
    mockStatsGetDashboard.mockReturnValue(idleQuery(baseStats));
    mockHeatmapGet.mockReturnValue(idleQuery({ cells: [] }));
    mockProfileGet.mockReturnValue(
      idleQuery({ reminderTime: null, needsPhoneMigration: false }),
    );
  });

  it('shows milestone unlock toast from dashboard stats', () => {
    render(<DashboardContent />);
    expect(screen.getByTestId('milestone-unlock-toast')).toBeInTheDocument();
  });

  it('dismisses milestone toast and records storage', () => {
    render(<DashboardContent />);
    fireEvent.click(screen.getByRole('button', { name: /onward/i }));
    expect(dismissMilestoneToast).toHaveBeenCalledWith(
      'streak_7',
      milestone.unlockedAt,
    );
  });

  it('shows batch summary for multi-unlock toast', () => {
    mockStatsGetDashboard.mockReturnValue(
      idleQuery({
        ...baseStats,
        milestones: {
          earned: [milestone],
          latestUnlock: milestone,
          latestUnlockAdditionalCount: 2,
        },
      }),
    );
    render(<DashboardContent />);
    expect(screen.getByText(/2 more waypoints/i)).toBeInTheDocument();
  });
});
