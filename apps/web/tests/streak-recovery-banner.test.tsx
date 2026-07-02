import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StreakRecoveryBanner } from '../src/components/dashboard/StreakRecoveryBanner';
import { DashboardContent } from '../src/components/dashboard/DashboardPage';
import {
  getStreakRecoveryCta,
  getStreakRecoveryMessage,
  pickEasiestUnloggedScoredHabit,
  taskCardDomId,
} from '../src/lib/celebrations';
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
  currentStreak: 0,
  longestStreak: 12,
  successRate: 60,
  streakFreezesAvailable: 0,
  streakFreezesUsed: 0,
  streakBreak: {
    occurred: true,
    previousStreak: 5,
    brokeOnDate: '2026-07-02',
    daysSinceBreak: 1,
  },
  milestones: {
    earned: [],
    latestUnlock: null,
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

  it('uses today wording when daysSinceBreak is 0', () => {
    const message = getStreakRecoveryMessage({
      previousStreak: 5,
      longestStreak: 12,
      daysSinceBreak: 0,
    });
    expect(message).toMatch(/rainy day on the trail today/i);
    expect(message).not.toMatch(/yesterday/i);
  });

  it('omits paused-at-0 phrasing when previousStreak is 0', () => {
    const message = getStreakRecoveryMessage({
      previousStreak: 0,
      longestStreak: 0,
      daysSinceBreak: 1,
    });
    expect(message).not.toMatch(/paused at 0/i);
    expect(message).toMatch(/rainy day on the trail yesterday/i);
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

describe('pickEasiestUnloggedScoredHabit', () => {
  it('prefers checkbox habits over number and tiered types', () => {
    const easiest = pickEasiestUnloggedScoredHabit(
      [
        {
          id: 'tiered',
          title: 'Workout',
          kind: 'TIERED',
          canAttachProof: false,
        },
        {
          id: 'number',
          title: 'Steps',
          kind: 'NUMBER',
          canAttachProof: false,
        },
        {
          id: 'checkbox',
          title: 'Water',
          kind: 'CHECKBOX',
          canAttachProof: false,
        },
      ],
      () => false,
    );

    expect(easiest?.id).toBe('checkbox');
  });

  it('names the easiest habit in recovery CTA copy', () => {
    expect(getStreakRecoveryCta('Water')).toBe('Log Water — easy win');
  });
});

describe('StreakRecoveryBanner', () => {
  it('renders the fresh-break variant when daysSinceBreak is 1', () => {
    render(
      <StreakRecoveryBanner
        previousStreak={4}
        longestStreak={9}
        daysSinceBreak={1}
        ctaLabel={getStreakRecoveryCta('Water')}
        onDismiss={vi.fn()}
        onScrollToTasks={vi.fn()}
      />,
    );

    const banner = screen.getByTestId('streak-recovery-banner');
    expect(banner).toHaveAttribute('data-variant', 'fresh-break');
    expect(
      screen.getByText(/rainy day on the trail yesterday/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /log water/i }),
    ).toBeInTheDocument();
  });

  it('renders the never-miss-twice variant when daysSinceBreak is 2 or more', () => {
    render(
      <StreakRecoveryBanner
        previousStreak={4}
        longestStreak={9}
        daysSinceBreak={3}
        ctaLabel={getStreakRecoveryCta('Water')}
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
        ctaLabel={getStreakRecoveryCta('Water')}
        onDismiss={vi.fn()}
        onScrollToTasks={onScrollToTasks}
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: /log water — easy win/i }),
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
        ctaLabel={getStreakRecoveryCta('Water')}
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
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('shows the banner when streakBreak occurred on today view', () => {
    mockActivitiesGetToday.mockReturnValue(idleQuery(baseToday));
    mockStatsGetDashboard.mockReturnValue(idleQuery(baseStats));
    mockHeatmapGet.mockReturnValue(idleQuery({ cells: [] }));
    mockProfileGet.mockReturnValue(idleQuery({ reminderTime: null }));

    render(<DashboardContent />);

    expect(screen.getByTestId('streak-recovery-banner')).toBeInTheDocument();
    expect(screen.queryByTestId('perfect-day-banner')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /log water — easy win/i }),
    ).toBeInTheDocument();
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

  it('does not flash a previously dismissed banner on load', () => {
    dismissStreakRecovery('2026-07-02');

    mockActivitiesGetToday.mockReturnValue(idleQuery(baseToday));
    mockStatsGetDashboard.mockReturnValue(idleQuery(baseStats));
    mockHeatmapGet.mockReturnValue(idleQuery({ cells: [] }));
    mockProfileGet.mockReturnValue(idleQuery({ reminderTime: null }));

    render(<DashboardContent />);

    expect(
      screen.queryByTestId('streak-recovery-banner'),
    ).not.toBeInTheDocument();
  });

  it('hides the banner when all scored habits are complete', () => {
    mockActivitiesGetToday.mockReturnValue(
      idleQuery({
        ...baseToday,
        scoredActivities: [
          {
            id: 'activity-1',
            title: 'Water',
            emoji: '💧',
            kind: 'CHECKBOX' as const,
            log: {
              id: 'log-1',
              state: 'DONE',
              value: null,
              tier: null,
              subPoints: null,
              xpAwarded: 100,
              proofUrl: null,
              aiVerdict: null,
            },
            canEdit: true,
            seedKey: 'WATER',
            canAttachProof: false,
          },
        ],
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

  it('scroll CTA targets the easiest unlogged habit card', () => {
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    mockActivitiesGetToday.mockReturnValue(
      idleQuery({
        ...baseToday,
        scoredActivities: [
          {
            id: 'activity-tiered',
            title: 'Workout',
            emoji: '🏋️',
            kind: 'TIERED' as const,
            log: null,
            canEdit: true,
            seedKey: null,
            canAttachProof: false,
          },
          {
            id: 'activity-water',
            title: 'Water',
            emoji: '💧',
            kind: 'CHECKBOX' as const,
            log: null,
            canEdit: true,
            seedKey: 'WATER',
            canAttachProof: false,
          },
        ],
      }),
    );
    mockStatsGetDashboard.mockReturnValue(idleQuery(baseStats));
    mockHeatmapGet.mockReturnValue(idleQuery({ cells: [] }));
    mockProfileGet.mockReturnValue(idleQuery({ reminderTime: null }));

    render(<DashboardContent />);

    const easiest = pickEasiestUnloggedScoredHabit(
      [
        {
          id: 'activity-tiered',
          title: 'Workout',
          kind: 'TIERED',
          canAttachProof: false,
        },
        {
          id: 'activity-water',
          title: 'Water',
          kind: 'CHECKBOX',
          canAttachProof: false,
        },
      ],
      () => false,
    );
    expect(easiest?.title).toBe('Water');

    fireEvent.click(
      screen.getByRole('button', { name: /log water — easy win/i }),
    );
    expect(scrollIntoView).toHaveBeenCalled();
    expect(
      document.getElementById(taskCardDomId('activity-water')),
    ).toBeInTheDocument();
  });

  it('hides the banner when streakBreak occurred is false (freeze absorbed)', () => {
    mockActivitiesGetToday.mockReturnValue(idleQuery(baseToday));
    mockStatsGetDashboard.mockReturnValue(
      idleQuery({
        ...baseStats,
        streakBreak: {
          occurred: false,
          previousStreak: 5,
          brokeOnDate: null,
          daysSinceBreak: 0,
        },
      }),
    );
    mockHeatmapGet.mockReturnValue(idleQuery({ cells: [] }));
    mockProfileGet.mockReturnValue(idleQuery({ reminderTime: null }));

    render(<DashboardContent />);

    expect(
      screen.queryByTestId('streak-recovery-banner'),
    ).not.toBeInTheDocument();
  });

  it('shows rain-cloak indicator when streakFreezesAvailable is 1', () => {
    mockActivitiesGetToday.mockReturnValue(idleQuery(baseToday));
    mockStatsGetDashboard.mockReturnValue(
      idleQuery({
        ...baseStats,
        currentStreak: 7,
        streakFreezesAvailable: 1,
        streakBreak: {
          occurred: false,
          previousStreak: 0,
          brokeOnDate: null,
          daysSinceBreak: 0,
        },
      }),
    );
    mockHeatmapGet.mockReturnValue(idleQuery({ cells: [] }));
    mockProfileGet.mockReturnValue(idleQuery({ reminderTime: null }));

    render(<DashboardContent />);

    expect(screen.getByLabelText('1 rain cloak available')).toBeInTheDocument();
  });
});
