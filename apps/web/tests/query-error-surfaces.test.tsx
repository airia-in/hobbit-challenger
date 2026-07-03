import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminGroupContent } from '../src/components/admin/AdminGroupPage';
import { DashboardContent } from '../src/components/dashboard/DashboardPage';
import { ManageGroupContent } from '../src/components/groups/ManageGroupPage';
import { LeaderboardContent } from '../src/components/leaderboard/LeaderboardPage';
import { ProgressContent } from '../src/components/progress/ProgressPage';

const mockActivitiesGetToday = vi.fn();
const mockStatsGetDashboard = vi.fn();
const mockHeatmapGet = vi.fn();
const mockStatsActivitySeries = vi.fn();
const mockStatsActivityCompletion = vi.fn();
const mockLeaderboardGet = vi.fn();
const mockLeaderboardSeries = vi.fn();
const mockGroupsGetMine = vi.fn();
const mockGroupsGetChallengeRange = vi.fn();
const mockAuthMe = vi.fn();
const mockProfileGet = vi.fn();
const mockUseMutation = vi.fn((..._args: unknown[]) => ({
  mutate: vi.fn(),
  isPending: false,
  reset: vi.fn(),
}));
const mockRemoveMemberMutate = vi.fn();
const mockPromoteAdminMutate = vi.fn();
const mockDemoteAdminMutate = vi.fn();
const mockSetChallengeRangeMutate = vi.fn();
const mockSetChallengeThisWeekMutate = vi.fn();
let removeMemberMutationState = {
  mutate: mockRemoveMemberMutate,
  isPending: false,
  error: null as { message: string } | null,
  reset: vi.fn(),
};
let promoteAdminMutationState = {
  mutate: mockPromoteAdminMutate,
  isPending: false,
  error: null as { message: string } | null,
  reset: vi.fn(),
};
let demoteAdminMutationState = {
  mutate: mockDemoteAdminMutate,
  isPending: false,
  error: null as { message: string } | null,
  reset: vi.fn(),
};
let setChallengeRangeMutationState = {
  mutate: mockSetChallengeRangeMutate,
  isPending: false,
  error: null as { message: string } | null,
  reset: vi.fn(),
};
let setChallengeThisWeekMutationState = {
  mutate: mockSetChallengeThisWeekMutate,
  isPending: false,
  error: null as { message: string } | null,
  reset: vi.fn(),
};
const mockInvalidate = vi.fn();

vi.mock('../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      activities: {
        getToday: {
          cancel: vi.fn(),
          getData: vi.fn(),
          invalidate: mockInvalidate,
          setData: vi.fn(),
        },
      },
      groups: {
        getMine: {
          invalidate: mockInvalidate,
        },
        getChallengeRange: {
          invalidate: mockInvalidate,
        },
      },
      heatmap: {
        get: {
          invalidate: mockInvalidate,
        },
      },
      stats: {
        getDashboard: {
          invalidate: mockInvalidate,
        },
      },
    }),
    activities: {
      getToday: {
        useQuery: (...args: unknown[]) => mockActivitiesGetToday(...args),
      },
      markActivity: {
        useMutation: (...args: unknown[]) => mockUseMutation(...args),
      },
      undoActivity: {
        useMutation: (...args: unknown[]) => mockUseMutation(...args),
      },
      logNumber: {
        useMutation: (...args: unknown[]) => mockUseMutation(...args),
      },
      setTier: {
        useMutation: (...args: unknown[]) => mockUseMutation(...args),
      },
      setSubPoints: {
        useMutation: (...args: unknown[]) => mockUseMutation(...args),
      },
      attachProof: {
        useMutation: (...args: unknown[]) => mockUseMutation(...args),
      },
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
      setDayLabel: {
        useMutation: (...args: unknown[]) => mockUseMutation(...args),
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
    groups: {
      getMine: {
        useQuery: (...args: unknown[]) => mockGroupsGetMine(...args),
      },
      getChallengeRange: {
        useQuery: (...args: unknown[]) => mockGroupsGetChallengeRange(...args),
      },
      create: {
        useMutation: (...args: unknown[]) => mockUseMutation(...args),
      },
      regenerateInvite: {
        useMutation: (...args: unknown[]) => mockUseMutation(...args),
      },
      removeMember: {
        useMutation: () => removeMemberMutationState,
      },
      promoteAdmin: {
        useMutation: () => promoteAdminMutationState,
      },
      demoteAdmin: {
        useMutation: () => demoteAdminMutationState,
      },
      setChallengeRange: {
        useMutation: () => setChallengeRangeMutationState,
      },
      setChallengeThisWeek: {
        useMutation: () => setChallengeThisWeekMutationState,
      },
    },
    auth: {
      me: {
        useQuery: (...args: unknown[]) => mockAuthMe(...args),
      },
    },
    guidance: {
      ask: {
        useMutation: (...args: unknown[]) => mockUseMutation(...args),
      },
    },
    profile: {
      get: {
        useQuery: (...args: unknown[]) => mockProfileGet(...args),
      },
    },
  },
}));

afterEach(() => {
  vi.restoreAllMocks();
  mockActivitiesGetToday.mockReset();
  mockStatsGetDashboard.mockReset();
  mockHeatmapGet.mockReset();
  mockStatsActivitySeries.mockReset();
  mockStatsActivityCompletion.mockReset();
  mockLeaderboardGet.mockReset();
  mockLeaderboardSeries.mockReset();
  mockGroupsGetMine.mockReset();
  mockGroupsGetChallengeRange.mockReset();
  mockAuthMe.mockReset();
  mockProfileGet.mockReset();
  mockUseMutation.mockClear();
  mockInvalidate.mockClear();
  mockRemoveMemberMutate.mockReset();
  mockPromoteAdminMutate.mockReset();
  mockDemoteAdminMutate.mockReset();
  mockSetChallengeRangeMutate.mockReset();
  mockSetChallengeThisWeekMutate.mockReset();
  removeMemberMutationState = {
    mutate: mockRemoveMemberMutate,
    isPending: false,
    error: null,
    reset: vi.fn(),
  };
  promoteAdminMutationState = {
    mutate: mockPromoteAdminMutate,
    isPending: false,
    error: null,
    reset: vi.fn(),
  };
  demoteAdminMutationState = {
    mutate: mockDemoteAdminMutate,
    isPending: false,
    error: null,
    reset: vi.fn(),
  };
  setChallengeRangeMutationState = {
    mutate: mockSetChallengeRangeMutate,
    isPending: false,
    error: null,
    reset: vi.fn(),
  };
  setChallengeThisWeekMutationState = {
    mutate: mockSetChallengeThisWeekMutate,
    isPending: false,
    error: null,
    reset: vi.fn(),
  };
});

function idleQuery(data: unknown = undefined) {
  return {
    data,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  };
}

function errorQuery(message: string, refetch = vi.fn()) {
  return {
    data: undefined,
    isLoading: false,
    isError: true,
    error: { message },
    refetch,
  };
}

const dashboardStats = {
  currentDay: 4,
  lengthDays: 45,
  startDate: new Date('2026-06-01T00:00:00.000Z'),
  estimatedFinishDate: new Date('2026-07-15T00:00:00.000Z'),
  todayDate: new Date('2026-06-04T00:00:00.000Z'),
  totalXp: 100,
  todayNetXp: 10,
  currentStreak: 3,
  longestStreak: 3,
  successRate: 75,
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

const emptyToday = {
  scoredActivities: [],
  personalActivities: [],
  dayTotals: {
    netXp: 0,
    personalXp: 0,
    xpEarned: 0,
    xpDeducted: 0,
  },
  dateKey: '2026-07-02',
  isViewingToday: true,
  canNavigateBack: false,
  canNavigateForward: false,
  canEdit: true,
  currentDay: 1,
};

const adminGroup = {
  id: 'group-1',
  name: 'Iron Will Crew',
  inviteToken: 'token',
  adminUserId: 'admin-1',
  adminUserIds: ['admin-1'],
  adminCount: 1,
  isAdmin: true,
  inviteUrl: 'http://example.com/join?token=token',
  challengeRange: {
    startDate: new Date('2026-06-01T00:00:00.000Z'),
    endDate: new Date('2026-06-30T00:00:00.000Z'),
    lengthDays: 30,
    timezone: 'UTC',
  },
  members: [
    {
      id: 'admin-1',
      name: 'Admin User',
      avatarUrl: null,
      isSelf: true,
      isAdmin: true,
      currentDay: 5,
      status: 'ACTIVE',
    },
    {
      id: 'member-2',
      name: 'Jane Doe',
      avatarUrl: null,
      isSelf: false,
      isAdmin: false,
      currentDay: 3,
      status: 'ACTIVE',
    },
  ],
};

describe('query error surfaces', () => {
  it('distinguishes Manage Group load errors from the no-group state', async () => {
    const refetch = vi.fn();
    mockGroupsGetMine.mockReturnValue(
      errorQuery('Unable to load group', refetch),
    );

    render(<ManageGroupContent />);

    expect(screen.getByText('Unable to load group')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /create your squad/i }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('offers retry when the leaderboard query fails', async () => {
    const refetch = vi.fn();
    mockAuthMe.mockReturnValue(
      idleQuery({ user: { id: 'user-1', groupId: 'group-1' } }),
    );
    mockLeaderboardGet.mockReturnValue(
      errorQuery('Unable to load leaderboard', refetch),
    );

    render(<LeaderboardContent />);

    expect(screen.getByText('Unable to load leaderboard')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /join a group/i })).toHaveAttribute(
      'href',
      '/join',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('shows a warm solo placeholder when the user has no fellowship', () => {
    mockAuthMe.mockReturnValue(
      idleQuery({ user: { id: 'user-1', groupId: null } }),
    );
    mockLeaderboardGet.mockReturnValue(idleQuery());

    render(<LeaderboardContent />);

    expect(
      screen.getByText(
        /no fellowship yet — your own trail stats live on the dashboard/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /start or join a fellowship/i }),
    ).toHaveAttribute('href', '/join');
    expect(mockLeaderboardGet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ enabled: false }),
    );
  });

  it('shows solo path option on the join page when user has no group', () => {
    mockGroupsGetMine.mockReturnValue(idleQuery(null));

    render(<ManageGroupContent />);

    expect(
      screen.getByRole('heading', { name: /choose your path/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/walk the path solo/i)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /continue to dashboard/i }),
    ).toHaveAttribute('href', '/dashboard');
  });

  it('offers retry when the dashboard heatmap query fails', async () => {
    const refetch = vi.fn();
    mockActivitiesGetToday.mockReturnValue(idleQuery(emptyToday));
    mockStatsGetDashboard.mockReturnValue(idleQuery(dashboardStats));
    mockProfileGet.mockReturnValue(idleQuery({ reminderTime: null }));
    mockHeatmapGet.mockReturnValue(
      errorQuery('Unable to load heatmap', refetch),
    );

    render(<DashboardContent />);

    expect(screen.getByText('Unable to load heatmap')).toBeInTheDocument();
    expect(screen.getByText('45-Day Progress')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('offers retry when a progress activity chart query fails', async () => {
    const refetch = vi.fn();
    mockActivitiesGetToday.mockReturnValue(
      idleQuery({
        scoredActivities: [
          {
            id: 'activity-1',
            title: 'Pushups',
            emoji: null,
            kind: 'NUMBER',
          },
        ],
        personalActivities: [],
      }),
    );
    mockStatsGetDashboard.mockReturnValue(idleQuery(dashboardStats));
    mockStatsActivitySeries.mockReturnValue(
      errorQuery('Unable to load chart', refetch),
    );
    mockStatsActivityCompletion.mockReturnValue(idleQuery());
    mockLeaderboardSeries.mockReturnValue(
      idleQuery({
        members: [],
      }),
    );

    render(<ProgressContent />);

    expect(screen.getByText('Unable to load chart')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('opens a confirm modal before removing a member', async () => {
    mockGroupsGetMine.mockReturnValue(idleQuery(adminGroup));

    render(<ManageGroupContent />);

    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(
      screen.getByRole('heading', {
        name: 'Remove Jane Doe from the group?',
      }),
    ).toBeInTheDocument();
    expect(mockRemoveMemberMutate).not.toHaveBeenCalled();

    const confirmButtons = screen.getAllByRole('button', { name: 'Remove' });
    await userEvent.click(confirmButtons[confirmButtons.length - 1]!);
    expect(mockRemoveMemberMutate).toHaveBeenCalledWith({ userId: 'member-2' });
  });

  it('shows admin badges and confirms making a member an admin', async () => {
    mockGroupsGetMine.mockReturnValue(idleQuery(adminGroup));

    render(<ManageGroupContent />);

    expect(screen.getByText('Admin')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Make admin' }));
    expect(
      screen.getByRole('heading', {
        name: 'Make Jane Doe an admin?',
      }),
    ).toBeInTheDocument();

    const confirmButtons = screen.getAllByRole('button', {
      name: 'Make admin',
    });
    await userEvent.click(confirmButtons[confirmButtons.length - 1]!);
    expect(mockPromoteAdminMutate).toHaveBeenCalledWith({
      userId: 'member-2',
    });
  });

  it('shows member removal mutation errors in the confirm modal', async () => {
    mockGroupsGetMine.mockReturnValue(idleQuery(adminGroup));
    removeMemberMutationState = {
      mutate: mockRemoveMemberMutate,
      isPending: false,
      error: { message: 'Cannot remove member' },
      reset: vi.fn(),
    };

    render(<ManageGroupContent />);

    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.getByText('Cannot remove member')).toBeInTheDocument();
  });

  it('keeps admin group header visible when heatmap query fails', async () => {
    const refetch = vi.fn();
    mockGroupsGetMine.mockReturnValue(idleQuery(adminGroup));
    mockHeatmapGet.mockReturnValue(
      errorQuery('Unable to load heatmap', refetch),
    );

    render(<AdminGroupContent />);

    expect(screen.getByText('Iron Will Crew')).toBeInTheDocument();
    expect(screen.getByText('30-Day Heatmap')).toBeInTheDocument();
    expect(screen.getByText('Unable to load heatmap')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('submits a custom challenge range from the admin group page', async () => {
    mockGroupsGetMine.mockReturnValue(idleQuery(adminGroup));
    mockHeatmapGet.mockReturnValue(idleQuery({ cells: [] }));

    render(<AdminGroupContent />);

    fireEvent.change(screen.getByLabelText('Start date'), {
      target: { value: '2026-07-01' },
    });
    fireEvent.change(screen.getByLabelText('End date'), {
      target: { value: '2026-07-31' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Save range' }));

    expect(mockSetChallengeRangeMutate).toHaveBeenCalledOnce();
    const input = mockSetChallengeRangeMutate.mock.calls[0]?.[0];
    expect(input).toMatchObject({
      startDate: expect.any(Date),
      endDate: expect.any(Date),
      timezone: expect.any(String),
    });
    expect(input.startDate.getFullYear()).toBe(2026);
    expect(input.startDate.getMonth()).toBe(6);
    expect(input.startDate.getDate()).toBe(1);
    expect(input.endDate.getFullYear()).toBe(2026);
    expect(input.endDate.getMonth()).toBe(6);
    expect(input.endDate.getDate()).toBe(31);
  });

  it('applies the backend this-week challenge preset', async () => {
    mockGroupsGetMine.mockReturnValue(idleQuery(adminGroup));
    mockHeatmapGet.mockReturnValue(idleQuery({ cells: [] }));

    render(<AdminGroupContent />);

    await userEvent.click(screen.getByRole('button', { name: 'This week' }));
    expect(mockSetChallengeThisWeekMutate).toHaveBeenCalledOnce();
  });

  it('blocks invalid challenge range submissions on the client', async () => {
    mockGroupsGetMine.mockReturnValue(idleQuery(adminGroup));
    mockHeatmapGet.mockReturnValue(idleQuery({ cells: [] }));

    render(<AdminGroupContent />);

    fireEvent.change(screen.getByLabelText('Start date'), {
      target: { value: '2026-08-01' },
    });
    fireEvent.change(screen.getByLabelText('End date'), {
      target: { value: '2026-07-31' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Save range' }));

    expect(
      screen.getByText('Start date must be before or equal to end date.'),
    ).toBeInTheDocument();
    expect(mockSetChallengeRangeMutate).not.toHaveBeenCalled();
  });
});
