import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StreakRecoveryBanner } from '../src/components/dashboard/StreakRecoveryBanner';
import { DashboardContent } from '../src/components/dashboard/DashboardPage';
import { getStreakRecoveryMessage } from '../src/lib/celebrations';
import {
  dismissStreakRecovery,
  isStreakRecoveryDismissed,
} from '../src/lib/streak-recovery-storage';

const mockActivitiesGetToday = vi.fn();
const mockStatsGetDashboard = vi.fn();
const mockHeatmapGet = vi.fn();
const mockProfileGet = vi.fn();
const mockUseMutation = vi.fn(() => ({
  mutate: vi.fn(),
  isPending: false,
  reset: vi.fn(),
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
  currentStreak: 0,
  longestStreak: 12,
  successRate: 60,
  streakBreak: {
    occurred: true,
    previousStreak: 5,
    brokeOnDate: '2026-07-02',
    daysSinceBreak: 1,
  },
};

describe('getStreakRecoveryMessage', () => {
  it('uses the day-1 compassionate variant', () => {
    const message = getStreakRecoveryMessage({
      previousStreak: 5,
      longestStreak: 12,
      daysSinceBreak: 1,
    });
    expect(message).toMatch(/rainy day on the trail yesterday/i);
    expect(message).toMatch(/streak paused at 5/i);
    expect(message).toMatch(/best run 12/i);
  });

  it('uses the day-2+ never-miss-twice variant', () => {
    const message = getStreakRecoveryMessage({
      previousStreak: 5,
      longestStreak: 12,
      daysSinceBreak: 2,
    });
    expect(message).toMatch(/one rest day on the trail is fine/i);
    expect(message).toMatch(/miss twice/i);
    expect(message).toMatch(/best run was 12 days/i);
  });
});

describe('StreakRecoveryBanner', () => {
  it('renders the fresh-break variant when daysSinceBreak is 1', () => {
    render(
      <StreakRecoveryBanner
        previousStreak={4}
        longestStreak={9}
        daysSinceBreak={1}
        onDismiss={vi.fn()}
        onScrollToTasks={vi.fn()}
      />,
    );

    const banner = screen.getByTestId('streak-recovery-banner');
    expect(banner).toHaveAttribute('data-variant', 'fresh-break');
    expect(
      screen.getByText(/rainy day on the trail yesterday/i),
    ).toBeInTheDocument();
  });

  it('renders the never-miss-twice variant when daysSinceBreak is 2 or more', () => {
    render(
      <StreakRecoveryBanner
        previousStreak={4}
        longestStreak={9}
        daysSinceBreak={3}
        onDismiss={vi.fn()}
        onScrollToTasks={vi.fn()}
      />,
    );

    const banner = screen.getByTestId('streak-recovery-banner');
    expect(banner).toHaveAttribute('data-variant', 'never-miss-twice');
    expect(
      screen.getByText(/one rest day on the trail is fine/i),
    ).toBeInTheDocument();
  });

  it('scroll CTA triggers the scroll handler', async () => {
    const onScrollToTasks = vi.fn();
    render(
      <StreakRecoveryBanner
        previousStreak={4}
        longestStreak={9}
        daysSinceBreak={1}
        onDismiss={vi.fn()}
        onScrollToTasks={onScrollToTasks}
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: /see today's habits/i }),
    );
    expect(onScrollToTasks).toHaveBeenCalledOnce();
  });

  it('persists dismissal per brokeOnDate in localStorage', async () => {
    const brokeOnDate = '2026-07-02';
    const onDismiss = () => dismissStreakRecovery(brokeOnDate);

    render(
      <StreakRecoveryBanner
        previousStreak={4}
        longestStreak={9}
        daysSinceBreak={1}
        onDismiss={onDismiss}
        onScrollToTasks={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Onward' }));
    expect(isStreakRecoveryDismissed(brokeOnDate)).toBe(true);
    expect(isStreakRecoveryDismissed('2026-07-01')).toBe(false);
  });
});

describe('DashboardContent streak recovery', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows the banner when streakBreak occurred on today view', () => {
    mockActivitiesGetToday.mockReturnValue(idleQuery(baseToday));
    mockStatsGetDashboard.mockReturnValue(idleQuery(baseStats));
    mockHeatmapGet.mockReturnValue(idleQuery({ cells: [] }));
    mockProfileGet.mockReturnValue(idleQuery({ reminderTime: null }));

    render(<DashboardContent />);

    expect(screen.getByTestId('streak-recovery-banner')).toBeInTheDocument();
    expect(screen.queryByTestId('perfect-day-banner')).not.toBeInTheDocument();
  });

  it('hides the banner when viewing a historical date', () => {
    mockActivitiesGetToday.mockReturnValue(
      idleQuery({
        ...baseToday,
        isViewingToday: false,
        dateKey: '2026-07-01',
      }),
    );
    mockStatsGetDashboard.mockReturnValue(idleQuery(baseStats));
    mockHeatmapGet.mockReturnValue(idleQuery({ cells: [] }));
    mockProfileGet.mockReturnValue(idleQuery({ reminderTime: null }));

    render(<DashboardContent />);

    expect(
      screen.queryByTestId('streak-recovery-banner'),
    ).not.toBeInTheDocument();
  });

  it('hides the banner after dismissal for the same break date', async () => {
    mockActivitiesGetToday.mockReturnValue(idleQuery(baseToday));
    mockStatsGetDashboard.mockReturnValue(idleQuery(baseStats));
    mockHeatmapGet.mockReturnValue(idleQuery({ cells: [] }));
    mockProfileGet.mockReturnValue(idleQuery({ reminderTime: null }));

    render(<DashboardContent />);
    expect(screen.getByTestId('streak-recovery-banner')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Onward' }));
    expect(
      screen.queryByTestId('streak-recovery-banner'),
    ).not.toBeInTheDocument();
    expect(isStreakRecoveryDismissed('2026-07-02')).toBe(true);
  });

  it('scroll CTA targets the today tasks section', () => {
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    mockActivitiesGetToday.mockReturnValue(idleQuery(baseToday));
    mockStatsGetDashboard.mockReturnValue(idleQuery(baseStats));
    mockHeatmapGet.mockReturnValue(idleQuery({ cells: [] }));
    mockProfileGet.mockReturnValue(idleQuery({ reminderTime: null }));

    render(<DashboardContent />);

    fireEvent.click(
      screen.getByRole('button', { name: /see today's habits/i }),
    );
    expect(scrollIntoView).toHaveBeenCalled();
    expect(document.getElementById('today-tasks')).toBeInTheDocument();
  });
});
