import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  GetTodayResult,
  TodayActivity,
} from '../src/services/activities.service';
import {
  buildReminderContextFromFixture,
  collectUnloggedHabitNames,
  computeXpAtRisk,
  countTasksFromToday,
  getChallengeYesterdayDate,
  hasEveningReminderEligibility,
  hasRecoveryReminderEligibility,
  hasStreakAtRiskReminderEligibility,
  pickTopActivityStreak,
  ReminderContextService,
  resolveJourneyMilestone,
  resolveRecoveryEligibility,
  shouldDeferEveningToStreakAtRisk,
  STREAK_AT_RISK_MIN,
} from '../src/whatsapp/reminder-context.service';
import { challengeDisplayOrderBy } from '../src/utils/challenge-query';
import {
  type Challenge,
  type DayScore,
  type User,
} from '@workspace-starter/db';
import {
  addLocalDays,
  formatLocalDateKey,
  getUserLocalDate,
} from '../src/utils/day-window';

function scoredActivity(
  overrides: Partial<TodayActivity> & { id: string },
): TodayActivity {
  return {
    id: overrides.id,
    seedKey: null,
    title: overrides.title ?? 'Task',
    emoji: null,
    kind: 'CHECKBOX',
    scored: true,
    isPersonal: false,
    xpComplete: 100,
    xpMiss: -100,
    deductMultiplier: 2,
    allowsProof: false,
    autoCompleteOnProof: false,
    canEdit: true,
    log: null,
    canAttachProof: true,
    ...overrides,
  };
}

function emptyToday(overrides: Partial<GetTodayResult> = {}): GetTodayResult {
  return {
    currentDay: 5,
    date: new Date('2026-06-15T00:00:00.000Z'),
    dateKey: '2026-06-15',
    isViewingToday: true,
    canNavigateBack: true,
    canNavigateForward: false,
    canEdit: true,
    dayTotals: { netXp: 0, personalXp: 0, xpEarned: 0, xpDeducted: 0 },
    scoredActivities: [],
    personalActivities: [],
    ...overrides,
  };
}

describe('reminder-context helpers', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts done and remaining tasks', () => {
    const activities = [
      scoredActivity({
        id: 'a1',
        log: {
          id: 'l1',
          state: 'DONE',
          value: null,
          tier: null,
          subPoints: null,
          xpAwarded: 100,
          proofUrl: null,
          aiVerdict: null,
        },
      }),
      scoredActivity({ id: 'a2', log: null }),
      scoredActivity({ id: 'a3', log: null }),
    ];

    expect(countTasksFromToday(activities)).toEqual({
      tasksDone: 1,
      tasksRemaining: 2,
    });
  });

  it('computes xpAtRisk from unlogged scored activities', () => {
    const activities = [
      scoredActivity({
        id: 'a1',
        xpMiss: -200,
        log: {
          id: 'l1',
          state: 'DONE',
          value: null,
          tier: null,
          subPoints: null,
          xpAwarded: 100,
          proofUrl: null,
          aiVerdict: null,
        },
      }),
      scoredActivity({ id: 'a2', xpMiss: -200, log: null }),
    ];

    expect(computeXpAtRisk(activities)).toBe(100);
  });

  it('picks top per-activity streak by count with first tie-break', () => {
    const activities = [
      scoredActivity({ id: 'a1', title: 'Water', currentStreak: 3 }),
      scoredActivity({ id: 'a2', title: 'Diet', currentStreak: 7 }),
      scoredActivity({ id: 'a3', title: 'Walk', currentStreak: 7 }),
    ];

    expect(pickTopActivityStreak(activities)).toEqual({
      topActivityStreak: 7,
      topActivityName: 'Diet',
    });
  });

  it('caps unlogged habit names at three scored activities', () => {
    const activities = [
      scoredActivity({ id: 'a1', title: 'One', log: null }),
      scoredActivity({ id: 'a2', title: 'Two', log: null }),
      scoredActivity({ id: 'a3', title: 'Three', log: null }),
      scoredActivity({ id: 'a4', title: 'Four', log: null }),
    ];

    expect(collectUnloggedHabitNames(activities)).toEqual([
      'One',
      'Two',
      'Three',
    ]);
  });

  it('resolves journey milestone days', () => {
    expect(resolveJourneyMilestone(7)).toBe(7);
    expect(resolveJourneyMilestone(21)).toBe(21);
    expect(resolveJourneyMilestone(30)).toBe(30);
    expect(resolveJourneyMilestone(8)).toBeNull();
  });

  it('builds full context from fixture', () => {
    const today = emptyToday({
      currentDay: 7,
      scoredActivities: [
        scoredActivity({
          id: 'a1',
          title: 'Water',
          currentStreak: 5,
          log: {
            id: 'l1',
            state: 'DONE',
            value: null,
            tier: null,
            subPoints: null,
            xpAwarded: 100,
            proofUrl: null,
            aiVerdict: null,
          },
        }),
        scoredActivity({ id: 'a2', title: 'Diet', xpMiss: -200, log: null }),
        scoredActivity({ id: 'a3', title: 'Walk', log: null }),
      ],
    });

    const context = buildReminderContextFromFixture({
      name: 'Alex',
      today,
      todayNetXp: 50,
      totalXp: 1500,
      currentStreak: STREAK_AT_RISK_MIN,
      longestStreak: 12,
      rank: 2,
      missedYesterday: true,
      recoveryEligible: true,
      recoveryBreakDate: '2026-06-14',
    });

    expect(context).toEqual({
      name: 'Alex',
      dayNumber: 7,
      tasksDone: 1,
      tasksRemaining: 2,
      todayNetXp: 50,
      xpAtRisk: 150,
      rank: 2,
      totalXp: 1500,
      topActivityStreak: 5,
      topActivityName: 'Water',
      unloggedHabitNames: ['Diet', 'Walk'],
      missedYesterday: true,
      recoveryEligible: true,
      recoveryBreakDate: '2026-06-14',
      challengeInRange: true,
      streakAtRisk: true,
      journeyMilestone: 7,
      currentStreak: STREAK_AT_RISK_MIN,
      longestStreak: 12,
      streakFreezesAvailable: 0,
    });
  });

  it('anchors challenge yesterday when user timezone lags challenge timezone', () => {
    const now = new Date('2026-06-10T18:00:00.000Z');
    const challengeTz = 'Asia/Tokyo';
    const userTz = 'America/Los_Angeles';

    const wrongYesterday = addLocalDays(
      getUserLocalDate(userTz, now),
      -1,
      challengeTz,
    );
    const correctYesterday = getChallengeYesterdayDate(challengeTz, now);

    expect(formatLocalDateKey(wrongYesterday, challengeTz)).toBe('2026-06-09');
    expect(formatLocalDateKey(correctYesterday, challengeTz)).toBe(
      '2026-06-10',
    );
  });

  it('evening eligibility requires incomplete tasks or xp at risk', () => {
    expect(
      hasEveningReminderEligibility({
        name: 'A',
        dayNumber: 1,
        tasksDone: 3,
        tasksRemaining: 0,
        todayNetXp: 100,
        xpAtRisk: 0,
        rank: null,
        totalXp: 100,
        topActivityStreak: 0,
        topActivityName: null,
        unloggedHabitNames: [],
        missedYesterday: false,
        recoveryEligible: false,
        recoveryBreakDate: null,
        challengeInRange: true,
        streakAtRisk: false,
        journeyMilestone: null,
        currentStreak: 0,
        longestStreak: 0,
        streakFreezesAvailable: 0,
      }),
    ).toBe(false);

    expect(
      hasEveningReminderEligibility({
        name: 'A',
        dayNumber: 1,
        tasksDone: 2,
        tasksRemaining: 1,
        todayNetXp: 100,
        xpAtRisk: 50,
        rank: null,
        totalXp: 100,
        topActivityStreak: 0,
        topActivityName: null,
        unloggedHabitNames: [],
        missedYesterday: false,
        recoveryEligible: false,
        recoveryBreakDate: null,
        challengeInRange: true,
        streakAtRisk: true,
        journeyMilestone: null,
        currentStreak: 5,
        longestStreak: 5,
        streakFreezesAvailable: 0,
      }),
    ).toBe(true);
  });

  it('recovery eligibility requires first morning after break while challenge active', () => {
    const base = buildReminderContextFromFixture({
      name: 'A',
      today: emptyToday(),
      todayNetXp: 0,
      totalXp: 0,
      missedYesterday: false,
      recoveryEligible: false,
    });
    expect(hasRecoveryReminderEligibility(base)).toBe(false);
    expect(
      hasRecoveryReminderEligibility({
        ...base,
        missedYesterday: true,
        recoveryEligible: true,
        recoveryBreakDate: '2026-06-14',
      }),
    ).toBe(true);
    expect(
      hasRecoveryReminderEligibility({
        ...base,
        missedYesterday: true,
        recoveryEligible: false,
        challengeInRange: false,
      }),
    ).toBe(false);
  });

  it('resolveRecoveryEligibility rejects repeat misses and ended challenges', () => {
    expect(
      resolveRecoveryEligibility({
        missedYesterday: true,
        challengeInRange: true,
        dayBeforeYesterdayFailed: true,
        brokeOnDate: '2026-06-14',
      }),
    ).toEqual({ recoveryEligible: false, recoveryBreakDate: null });

    expect(
      resolveRecoveryEligibility({
        missedYesterday: true,
        challengeInRange: false,
        dayBeforeYesterdayFailed: false,
        brokeOnDate: '2026-06-14',
      }),
    ).toEqual({ recoveryEligible: false, recoveryBreakDate: null });

    expect(
      resolveRecoveryEligibility({
        missedYesterday: true,
        challengeInRange: true,
        dayBeforeYesterdayFailed: false,
        brokeOnDate: '2026-06-14',
      }),
    ).toEqual({
      recoveryEligible: true,
      recoveryBreakDate: '2026-06-14',
    });
  });

  it('streak-at-risk eligibility requires streak threshold and open tasks', () => {
    const base = buildReminderContextFromFixture({
      name: 'A',
      today: emptyToday({
        scoredActivities: [scoredActivity({ id: 'a1', log: null })],
      }),
      todayNetXp: 0,
      totalXp: 0,
      currentStreak: STREAK_AT_RISK_MIN,
    });
    expect(hasStreakAtRiskReminderEligibility(base)).toBe(true);
    expect(
      hasStreakAtRiskReminderEligibility({
        ...base,
        currentStreak: STREAK_AT_RISK_MIN - 1,
        streakAtRisk: false,
      }),
    ).toBe(false);
    expect(
      hasStreakAtRiskReminderEligibility({
        ...base,
        tasksRemaining: 0,
        streakAtRisk: false,
      }),
    ).toBe(false);
  });

  it('defers generic evening only when STREAK_AT_RISK was sent', () => {
    const atRisk = buildReminderContextFromFixture({
      name: 'A',
      today: emptyToday({
        scoredActivities: [scoredActivity({ id: 'a1', log: null })],
      }),
      todayNetXp: 0,
      totalXp: 0,
      currentStreak: 5,
    });
    expect(shouldDeferEveningToStreakAtRisk(atRisk, true)).toBe(true);
    expect(shouldDeferEveningToStreakAtRisk(atRisk, false)).toBe(false);
    expect(
      shouldDeferEveningToStreakAtRisk(
        {
          ...atRisk,
          currentStreak: 1,
          streakAtRisk: false,
        },
        true,
      ),
    ).toBe(false);
  });

  it('treats freeze-absorbed yesterday as not missed via buildContext', async () => {
    const timezone = 'America/New_York';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T15:00:00.000Z'));
    const yesterday = getChallengeYesterdayDate(timezone);

    const user: User = {
      id: 'user-1',
      name: 'Alex',
      phone: '+15551234567',
      email: 'a@b.com',
      passwordHash: 'x',
      timezone,
      groupId: 'group-1',
      avatarUrl: null,
      reminderTime: null,
      whatsappOptIn: true,
      createdAt: new Date(),
    };
    const challenge: Challenge = {
      id: 'ch-1',
      userId: user.id,
      groupId: 'group-1',
      startDate: new Date('2026-06-01T04:00:00.000Z'),
      endDate: null,
      lengthDays: 30,
      currentDay: 15,
      isActive: true,
      totalXp: 1000,
      currentStreak: 5,
      longestStreak: 7,
      streakFreezesAvailable: 0,
      streakFreezesUsed: 1,
      lastStreakFreezeGrantedAt: null,
    };
    const yesterdayScore: DayScore = {
      id: 'ds-y',
      challengeId: challenge.id,
      userId: user.id,
      date: yesterday,
      dayNumber: 14,
      xpEarned: 0,
      xpDeducted: 100,
      netXp: -100,
      personalXp: 0,
      breakdown: {
        allScoredLogged: false,
        freezeConsumed: true,
        entries: [],
      },
      finalized: true,
    };

    const prisma = {
      user: {
        findUnique: async ({
          include,
        }: {
          where: { id: string };
          include?: { group?: { select: { challengeTimezone: true } } };
        }) => {
          if (!include?.group) return user;
          return { ...user, group: { challengeTimezone: timezone } };
        },
      },
      challenge: {
        findFirst: async ({
          where,
          orderBy,
        }: {
          where: { userId?: string };
          orderBy?: typeof challengeDisplayOrderBy;
        }) => {
          void orderBy;
          return where.userId === user.id ? challenge : null;
        },
      },
      dayScore: {
        findMany: async ({
          where,
        }: {
          where: { challenge?: { userId?: string }; challengeId?: string };
        }) => {
          if (where.challenge?.userId !== user.id) return [];
          return [yesterdayScore].map((day) => ({
            finalized: day.finalized,
            breakdown: day.breakdown,
            date: day.date,
          }));
        },
        findFirst: async ({
          where,
        }: {
          where: {
            challengeId?: string;
            date?: Date;
            finalized?: boolean;
          };
        }) => {
          if (
            where.challengeId === challenge.id &&
            where.date?.getTime() === yesterday.getTime()
          ) {
            if (where.finalized && !yesterdayScore.finalized) return null;
            return {
              netXp: yesterdayScore.netXp,
              finalized: yesterdayScore.finalized,
              breakdown: yesterdayScore.breakdown,
            };
          }
          return null;
        },
      },
      activity: {
        findMany: async () => [],
      },
      activityLog: {
        findMany: async () => [],
      },
      userMilestone: {
        findMany: async () => [],
      },
    };

    const activitiesService = {
      getToday: vi.fn().mockResolvedValue(
        emptyToday({
          currentDay: challenge.currentDay,
          date: getUserLocalDate(timezone),
        }),
      ),
    };

    const service = new ReminderContextService(activitiesService as never);
    const context = await service.buildContext(
      prisma as never,
      user.id,
      user.name,
    );

    expect(context.missedYesterday).toBe(false);
  });
});
