import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ActivityKind,
  type Activity,
  type ActivityLog,
  type Challenge,
  type DayScore,
  type User,
} from '@workspace-starter/db';
import { DayEvaluatorService } from '../src/cron/day-evaluator.service';
import { evaluateDayRollover } from '../src/services/day-finalizer';
import {
  type ActivityLogInput,
  type ScoredActivity,
} from '../src/services/scoring.service';
import { addLocalDays, getUserLocalDate } from '../src/utils/day-window';

const checkboxActivity: ScoredActivity = {
  id: 'progress-photo',
  kind: 'CHECKBOX',
  scored: true,
  isPersonal: false,
  deductMultiplier: 2,
  xpComplete: 200,
  xpMiss: -200,
};

const waterActivity: ScoredActivity = {
  id: 'water',
  kind: 'NUMBER',
  scored: true,
  isPersonal: false,
  deductMultiplier: 2,
  unitLabel: 'L',
  xpPerUnit: 26.3,
  xpCap: 100,
  missXp: -100,
};

const tieredActivity: ScoredActivity = {
  id: 'no-reels',
  kind: 'TIERED',
  scored: true,
  isPersonal: false,
  deductMultiplier: 2,
  tiers: [
    { key: 'NONE', label: '0 min', maxMinutes: 0, xp: 250 },
    { key: 'UNDER_30', label: '<=30 min', maxMinutes: 30, xp: 150 },
    { key: 'UNDER_60', label: '<=60 min', maxMinutes: 60, xp: 60 },
    { key: 'OVER', label: '>60 min', maxMinutes: null, xp: 0 },
  ],
};

const personalCheckbox: ScoredActivity = {
  id: 'personal-journal',
  kind: 'CHECKBOX',
  scored: false,
  isPersonal: true,
  deductMultiplier: 2,
  xpComplete: 50,
  xpMiss: -50,
};

function baseChallenge(overrides: Partial<EvaluateDayRolloverChallenge> = {}) {
  return {
    currentDay: 1,
    lengthDays: 30,
    currentStreak: 0,
    longestStreak: 0,
    ...overrides,
  };
}

type EvaluateDayRolloverChallenge = {
  currentDay: number;
  lengthDays: number;
  currentStreak: number;
  longestStreak: number;
};

describe('evaluateDayRollover — grace applied', () => {
  it('deducts unlogged checkbox at half rate', () => {
    const result = evaluateDayRollover({
      challenge: baseChallenge(),
      scoredActivities: [checkboxActivity],
      previousDayLogs: [],
    });

    expect(result.dayScore.xpDeducted).toBe(100);
    expect(result.dayScore.netXp).toBe(-100);
    expect(result.challengeUpdate.totalXpIncrement).toBe(-100);
  });

  it('deducts unlogged number at half rate', () => {
    const result = evaluateDayRollover({
      challenge: baseChallenge(),
      scoredActivities: [waterActivity],
      previousDayLogs: [],
    });

    expect(result.dayScore.xpDeducted).toBe(50);
    expect(result.dayScore.netXp).toBe(-50);
  });

  it('applies no penalty for unlogged tiered activity', () => {
    const result = evaluateDayRollover({
      challenge: baseChallenge(),
      scoredActivities: [tieredActivity],
      previousDayLogs: [],
    });

    expect(result.dayScore.xpDeducted).toBe(0);
    expect(result.dayScore.netXp).toBe(0);
    expect(result.dayScore.breakdown.entries[0]?.state).toBe('UNLOGGED');
  });
});

describe('evaluateDayRollover — streak semantics', () => {
  const scoredSet = [checkboxActivity, waterActivity];

  it('increments streak when all scored activities are logged', () => {
    const logs: ActivityLogInput[] = [
      { activityId: checkboxActivity.id, state: 'DONE' },
      { activityId: waterActivity.id, value: 3.8 },
    ];

    const result = evaluateDayRollover({
      challenge: baseChallenge({ currentStreak: 4, longestStreak: 4 }),
      scoredActivities: scoredSet,
      previousDayLogs: logs,
    });

    expect(result.dayScore.breakdown.allScoredLogged).toBe(true);
    expect(result.challengeUpdate.currentStreak).toBe(5);
    expect(result.challengeUpdate.longestStreak).toBe(5);
  });

  it('counts FAILED as logged for streak purposes', () => {
    const logs: ActivityLogInput[] = [
      { activityId: checkboxActivity.id, state: 'FAILED' },
      { activityId: waterActivity.id, value: 3.8 },
    ];

    const result = evaluateDayRollover({
      challenge: baseChallenge({ currentStreak: 2 }),
      scoredActivities: scoredSet,
      previousDayLogs: logs,
    });

    expect(result.dayScore.breakdown.allScoredLogged).toBe(true);
    expect(result.challengeUpdate.currentStreak).toBe(3);
  });

  it('resets streak to 0 when a scored activity is unlogged', () => {
    const logs: ActivityLogInput[] = [
      { activityId: checkboxActivity.id, state: 'DONE' },
    ];

    const result = evaluateDayRollover({
      challenge: baseChallenge({ currentStreak: 7, longestStreak: 10 }),
      scoredActivities: scoredSet,
      previousDayLogs: logs,
    });

    expect(result.dayScore.breakdown.allScoredLogged).toBe(false);
    expect(result.challengeUpdate.currentStreak).toBe(0);
    expect(result.challengeUpdate.longestStreak).toBe(10);
  });

  it('resets streak to 0 without eliminating or restarting the challenge', () => {
    const result = evaluateDayRollover({
      challenge: baseChallenge({ currentDay: 15, currentStreak: 14 }),
      scoredActivities: scoredSet,
      previousDayLogs: [],
    });

    expect(result.challengeUpdate.currentStreak).toBe(0);
    expect(result.challengeUpdate.currentDay).toBe(16);
    expect(result.challengeUpdate.completed).toBe(false);
  });
});

describe('evaluateDayRollover — longestStreak', () => {
  it('updates longestStreak only when new streak exceeds it', () => {
    const logs: ActivityLogInput[] = [
      { activityId: checkboxActivity.id, state: 'DONE' },
    ];

    const below = evaluateDayRollover({
      challenge: baseChallenge({
        currentStreak: 3,
        longestStreak: 10,
      }),
      scoredActivities: [checkboxActivity],
      previousDayLogs: logs,
    });
    expect(below.challengeUpdate.longestStreak).toBe(10);

    const above = evaluateDayRollover({
      challenge: baseChallenge({
        currentStreak: 10,
        longestStreak: 10,
      }),
      scoredActivities: [checkboxActivity],
      previousDayLogs: logs,
    });
    expect(above.challengeUpdate.longestStreak).toBe(11);
  });
});

describe('evaluateDayRollover — XP totals', () => {
  it('sets totalXpIncrement equal to netXp for positive days', () => {
    const logs: ActivityLogInput[] = [
      { activityId: checkboxActivity.id, state: 'DONE' },
      { activityId: waterActivity.id, value: 3.8 },
    ];

    const result = evaluateDayRollover({
      challenge: baseChallenge(),
      scoredActivities: [checkboxActivity, waterActivity],
      previousDayLogs: logs,
    });

    expect(result.dayScore.netXp).toBe(300);
    expect(result.challengeUpdate.totalXpIncrement).toBe(300);
  });

  it('sets totalXpIncrement equal to netXp for negative days', () => {
    const logs: ActivityLogInput[] = [
      { activityId: checkboxActivity.id, state: 'FAILED' },
      { activityId: waterActivity.id, value: 0 },
    ];

    const result = evaluateDayRollover({
      challenge: baseChallenge(),
      scoredActivities: [checkboxActivity, waterActivity],
      previousDayLogs: logs,
    });

    expect(result.dayScore.netXp).toBe(-300);
    expect(result.challengeUpdate.totalXpIncrement).toBe(-300);
  });
});

describe('evaluateDayRollover — challenge completion', () => {
  it('marks completed when currentDay + 1 exceeds lengthDays', () => {
    const result = evaluateDayRollover({
      challenge: baseChallenge({ currentDay: 30, lengthDays: 30 }),
      scoredActivities: [checkboxActivity],
      previousDayLogs: [{ activityId: checkboxActivity.id, state: 'DONE' }],
    });

    expect(result.challengeUpdate.completed).toBe(true);
    expect(result.challengeUpdate.currentDay).toBe(31);
  });

  it('does not complete when currentDay + 1 equals lengthDays', () => {
    const result = evaluateDayRollover({
      challenge: baseChallenge({ currentDay: 29, lengthDays: 30 }),
      scoredActivities: [checkboxActivity],
      previousDayLogs: [{ activityId: checkboxActivity.id, state: 'DONE' }],
    });

    expect(result.challengeUpdate.completed).toBe(false);
    expect(result.challengeUpdate.currentDay).toBe(30);
  });

  it('does not complete on earlier days', () => {
    const result = evaluateDayRollover({
      challenge: baseChallenge({ currentDay: 5, lengthDays: 30 }),
      scoredActivities: [checkboxActivity],
      previousDayLogs: [],
    });

    expect(result.challengeUpdate.completed).toBe(false);
    expect(result.challengeUpdate.currentDay).toBe(6);
  });
});

describe('evaluateDayRollover — personal activities', () => {
  it('excludes personal XP from netXp and totalXpIncrement', () => {
    const logs: ActivityLogInput[] = [
      { activityId: checkboxActivity.id, state: 'DONE' },
      { activityId: personalCheckbox.id, state: 'DONE' },
    ];

    const result = evaluateDayRollover({
      challenge: baseChallenge(),
      scoredActivities: [checkboxActivity],
      personalActivities: [personalCheckbox],
      previousDayLogs: logs,
    });

    expect(result.dayScore.netXp).toBe(200);
    expect(result.dayScore.personalXp).toBe(50);
    expect(result.challengeUpdate.totalXpIncrement).toBe(200);
  });

  it('does not require personal activities for allScoredLogged', () => {
    const result = evaluateDayRollover({
      challenge: baseChallenge(),
      scoredActivities: [checkboxActivity],
      personalActivities: [personalCheckbox],
      previousDayLogs: [{ activityId: checkboxActivity.id, state: 'DONE' }],
    });

    expect(result.dayScore.breakdown.allScoredLogged).toBe(true);
  });
});

describe('evaluateDayRollover — breakdown shape', () => {
  it('returns breakdown with allScoredLogged and entries', () => {
    const logs: ActivityLogInput[] = [
      { activityId: checkboxActivity.id, state: 'DONE' },
    ];

    const result = evaluateDayRollover({
      challenge: baseChallenge({ currentDay: 7 }),
      scoredActivities: [checkboxActivity, waterActivity],
      previousDayLogs: logs,
    });

    expect(result.dayScore.dayNumber).toBe(7);
    expect(result.dayScore.breakdown).toEqual({
      allScoredLogged: false,
      entries: expect.arrayContaining([
        expect.objectContaining({
          activityId: checkboxActivity.id,
          kind: 'CHECKBOX',
          state: 'DONE',
        }),
        expect.objectContaining({
          activityId: waterActivity.id,
          kind: 'NUMBER',
          state: 'UNLOGGED',
        }),
      ]),
    });
    expect(result.dayScore.breakdown.entries).toHaveLength(2);
  });
});

// --- Cron guard tests (fake prisma, no PrismaClient) ---

function activityLogKey(
  challengeId: string,
  activityId: string,
  date: Date,
): string {
  return `${challengeId}:${activityId}:${date.getTime()}`;
}

function dayScoreKey(challengeId: string, date: Date): string {
  return `${challengeId}:${date.getTime()}`;
}

function makeActivity(
  overrides: Partial<Activity> & Pick<Activity, 'id'>,
): Activity {
  return {
    groupId: 'group-1',
    ownerUserId: null,
    seedKey: null,
    title: 'Test',
    emoji: null,
    kind: ActivityKind.CHECKBOX,
    scored: true,
    isPersonal: false,
    xpComplete: 200,
    xpMiss: -200,
    unitLabel: null,
    xpPerUnit: null,
    xpCap: null,
    missXp: null,
    subPoints: null,
    tiers: null,
    deductMultiplier: 2,
    sortOrder: 0,
    active: true,
    createdAt: new Date(),
    ...overrides,
  };
}

type CronFakeSeed = {
  users: User[];
  challenges: Challenge[];
  activities: Activity[];
  activityLogs?: ActivityLog[];
  dayScores?: DayScore[];
};

function createCronFakePrisma(seed: CronFakeSeed) {
  const users = [...seed.users];
  const challenges = new Map(
    seed.challenges.map((challenge) => [challenge.id, { ...challenge }]),
  );
  const activities = [...seed.activities];
  const activityLogs = new Map(
    (seed.activityLogs ?? []).map((log) => [
      activityLogKey(log.challengeId, log.activityId, log.date),
      { ...log },
    ]),
  );
  const dayScores = new Map(
    (seed.dayScores ?? []).map((score) => [
      dayScoreKey(score.challengeId, score.date),
      { ...score },
    ]),
  );

  const transactionOps: Array<Record<string, unknown>> = [];

  const prisma = {
    user: {
      findMany: async ({ include }: { include?: { challenges?: unknown } }) => {
        void include;
        return users.map((user) => {
          const userChallenges = [...challenges.values()].filter(
            (c) => c.userId === user.id && c.isActive,
          );
          return { ...user, challenges: userChallenges };
        });
      },
    },
    activity: {
      findMany: async ({
        where,
      }: {
        where: { OR: Array<Record<string, unknown>> };
      }) =>
        activities.filter((activity) =>
          where.OR.some((clause) => {
            if (
              'groupId' in clause &&
              clause.groupId === activity.groupId &&
              clause.active === activity.active &&
              clause.scored === activity.scored
            ) {
              return true;
            }
            if (
              'ownerUserId' in clause &&
              clause.ownerUserId === activity.ownerUserId &&
              clause.isPersonal === activity.isPersonal &&
              clause.active === activity.active
            ) {
              return true;
            }
            return false;
          }),
        ),
    },
    dayScore: {
      findFirst: async ({
        where,
      }: {
        where: { challengeId: string; date: Date };
      }) => dayScores.get(dayScoreKey(where.challengeId, where.date)) ?? null,
    },
    activityLog: {
      findMany: async ({
        where,
      }: {
        where: { challengeId: string; userId: string; date: Date };
      }) =>
        [...activityLogs.values()].filter(
          (log) =>
            log.challengeId === where.challengeId &&
            log.userId === where.userId &&
            log.date.getTime() === where.date.getTime(),
        ),
    },
    $transaction: async (fn: (tx: typeof prisma) => Promise<void>) => {
      const tx = {
        dayScore: {
          upsert: async (args: Record<string, unknown>) => {
            transactionOps.push({ type: 'dayScore.upsert', ...args });
            const create = args.create as DayScore;
            const key = dayScoreKey(create.challengeId, create.date);
            dayScores.set(key, { ...create, id: `score-${dayScores.size}` });
          },
        },
        challenge: {
          update: async ({
            where,
            data,
          }: {
            where: { id: string };
            data: Record<string, unknown>;
          }) => {
            transactionOps.push({ type: 'challenge.update', where, data });
            const challenge = challenges.get(where.id);
            if (!challenge) return;
            if (typeof data.currentDay === 'number') {
              challenge.currentDay = data.currentDay;
            }
            if (typeof data.currentStreak === 'number') {
              challenge.currentStreak = data.currentStreak;
            }
            if (typeof data.longestStreak === 'number') {
              challenge.longestStreak = data.longestStreak;
            }
            if (data.totalXp && typeof data.totalXp === 'object') {
              const inc = (data.totalXp as { increment: number }).increment;
              challenge.totalXp += inc;
            }
            if (data.isActive === false) {
              challenge.isActive = false;
            }
          },
        },
      };
      await fn(tx as never);
      return transactionOps;
    },
  };

  return { prisma, transactionOps, challenges, dayScores };
}

describe('DayEvaluatorService — cron guards', () => {
  const timezone = 'America/New_York';
  const startDate = new Date('2026-01-01T12:00:00.000Z');
  let previousDay: Date;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T15:00:00.000Z'));
    const localToday = getUserLocalDate(timezone);
    previousDay = addLocalDays(localToday, -1, timezone);
  });

  it('skips users with no group', async () => {
    const { prisma, transactionOps } = createCronFakePrisma({
      users: [
        {
          id: 'user-1',
          phone: null,
          email: 'a@b.com',
          passwordHash: 'x',
          name: 'User',
          timezone,
          groupId: null,
          createdAt: new Date(),
          avatarUrl: null,
          reminderTime: null,
        },
      ],
      challenges: [
        {
          id: 'ch-1',
          userId: 'user-1',
          groupId: null,
          startDate,
          endDate: null,
          lengthDays: 30,
          currentDay: 5,
          isActive: true,
          totalXp: 0,
          currentStreak: 0,
          longestStreak: 0,
        },
      ],
      activities: [makeActivity({ id: 'act-1' })],
    });

    const service = new DayEvaluatorService(prisma as never);
    await service.evaluateDays();

    expect(transactionOps).toHaveLength(0);
  });

  it('skips when previous day is already finalized', async () => {
    const { prisma, transactionOps } = createCronFakePrisma({
      users: [
        {
          id: 'user-1',
          phone: null,
          email: 'a@b.com',
          passwordHash: 'x',
          name: 'User',
          timezone,
          groupId: 'group-1',
          createdAt: new Date(),
          avatarUrl: null,
          reminderTime: null,
        },
      ],
      challenges: [
        {
          id: 'ch-1',
          userId: 'user-1',
          groupId: 'group-1',
          startDate,
          endDate: null,
          lengthDays: 30,
          currentDay: 5,
          isActive: true,
          totalXp: 100,
          currentStreak: 2,
          longestStreak: 2,
        },
      ],
      activities: [makeActivity({ id: 'act-1', groupId: 'group-1' })],
      dayScores: [
        {
          id: 'ds-1',
          challengeId: 'ch-1',
          userId: 'user-1',
          date: previousDay,
          dayNumber: 4,
          xpEarned: 200,
          xpDeducted: 0,
          netXp: 200,
          personalXp: 0,
          breakdown: { allScoredLogged: true, entries: [] },
          finalized: true,
        },
      ],
    });

    const service = new DayEvaluatorService(prisma as never);
    await service.evaluateDays();

    expect(transactionOps).toHaveLength(0);
  });

  it('skips users with zero scored activities', async () => {
    const { prisma, transactionOps } = createCronFakePrisma({
      users: [
        {
          id: 'user-1',
          phone: null,
          email: 'a@b.com',
          passwordHash: 'x',
          name: 'User',
          timezone,
          groupId: 'group-1',
          createdAt: new Date(),
          avatarUrl: null,
          reminderTime: null,
        },
      ],
      challenges: [
        {
          id: 'ch-1',
          userId: 'user-1',
          groupId: 'group-1',
          startDate,
          endDate: null,
          lengthDays: 30,
          currentDay: 5,
          isActive: true,
          totalXp: 0,
          currentStreak: 0,
          longestStreak: 0,
        },
      ],
      activities: [],
    });

    const service = new DayEvaluatorService(prisma as never);
    await service.evaluateDays();

    expect(transactionOps).toHaveLength(0);
  });

  it('finalizes previous day and advances challenge when guards pass', async () => {
    const { prisma, transactionOps, challenges } = createCronFakePrisma({
      users: [
        {
          id: 'user-1',
          phone: null,
          email: 'a@b.com',
          passwordHash: 'x',
          name: 'User',
          timezone,
          groupId: 'group-1',
          createdAt: new Date(),
          avatarUrl: null,
          reminderTime: null,
        },
      ],
      challenges: [
        {
          id: 'ch-1',
          userId: 'user-1',
          groupId: 'group-1',
          startDate,
          endDate: null,
          lengthDays: 30,
          currentDay: 5,
          isActive: true,
          totalXp: 0,
          currentStreak: 1,
          longestStreak: 1,
        },
      ],
      activities: [makeActivity({ id: 'act-1', groupId: 'group-1' })],
      activityLogs: [
        {
          id: 'log-1',
          challengeId: 'ch-1',
          userId: 'user-1',
          activityId: 'act-1',
          date: previousDay,
          value: null,
          tier: null,
          subPoints: null,
          state: 'DONE',
          xpAwarded: 200,
          proofUrl: null,
          aiVerdict: null,
        },
      ],
    });

    const service = new DayEvaluatorService(prisma as never);
    await service.evaluateDays();

    expect(transactionOps).toHaveLength(2);
    const challenge = challenges.get('ch-1');
    expect(challenge?.currentDay).toBe(6);
    expect(challenge?.currentStreak).toBe(2);
    expect(challenge?.totalXp).toBe(200);
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});
