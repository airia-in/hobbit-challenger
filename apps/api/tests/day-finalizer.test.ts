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

const personalCheckbox2: ScoredActivity = {
  id: 'personal-stretch',
  kind: 'CHECKBOX',
  scored: false,
  isPersonal: true,
  deductMultiplier: 2,
  xpComplete: 30,
  xpMiss: -30,
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
  streakFreezesAvailable?: number;
  streakFreezesUsed?: number;
  lastStreakFreezeGrantedAt?: Date | null;
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

  it('resets streak to 0 when a personal-only day has unlogged personal activities', () => {
    const result = evaluateDayRollover({
      challenge: baseChallenge({ currentStreak: 5, longestStreak: 5 }),
      scoredActivities: [],
      personalActivities: [personalCheckbox],
      previousDayLogs: [],
    });

    expect(result.dayScore.breakdown.allScoredLogged).toBe(false);
    expect(result.challengeUpdate.currentStreak).toBe(0);
    expect(result.challengeUpdate.longestStreak).toBe(5);
  });

  it('increments streak when all personal activities are logged on a personal-only day', () => {
    const result = evaluateDayRollover({
      challenge: baseChallenge({ currentStreak: 3, longestStreak: 3 }),
      scoredActivities: [],
      personalActivities: [personalCheckbox],
      previousDayLogs: [{ activityId: personalCheckbox.id, state: 'DONE' }],
    });

    expect(result.dayScore.breakdown.allScoredLogged).toBe(true);
    expect(result.challengeUpdate.currentStreak).toBe(4);
    expect(result.challengeUpdate.longestStreak).toBe(4);
    expect(result.dayScore.personalXp).toBe(50);
  });

  it('resets streak when only some personal activities are logged on a personal-only day', () => {
    const result = evaluateDayRollover({
      challenge: baseChallenge({ currentStreak: 5, longestStreak: 5 }),
      scoredActivities: [],
      personalActivities: [personalCheckbox, personalCheckbox2],
      previousDayLogs: [{ activityId: personalCheckbox.id, state: 'DONE' }],
    });

    expect(result.dayScore.breakdown.allScoredLogged).toBe(false);
    expect(result.challengeUpdate.currentStreak).toBe(0);
    expect(result.challengeUpdate.longestStreak).toBe(5);
  });

  it('grouped users still gate streak on scored activities only', () => {
    const logs: ActivityLogInput[] = [
      { activityId: checkboxActivity.id, state: 'DONE' },
      { activityId: personalCheckbox.id, state: 'DONE' },
    ];

    const result = evaluateDayRollover({
      challenge: baseChallenge({ currentStreak: 7, longestStreak: 10 }),
      scoredActivities: scoredSet,
      personalActivities: [personalCheckbox],
      previousDayLogs: logs,
    });

    expect(result.dayScore.breakdown.allScoredLogged).toBe(false);
    expect(result.challengeUpdate.currentStreak).toBe(0);
    expect(result.challengeUpdate.longestStreak).toBe(10);
    expect(result.dayScore.netXp).toBe(150);
    expect(result.dayScore.personalXp).toBe(50);
    expect(result.challengeUpdate.totalXpIncrement).toBe(150);
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

describe('evaluateDayRollover — streak freeze', () => {
  const scoredSet = [checkboxActivity];

  const priorSuccess = {
    finalized: true,
    breakdown: { allScoredLogged: true },
  };

  const priorFailed = {
    finalized: true,
    breakdown: { allScoredLogged: false },
  };

  it('consumes freeze on single miss with prior success', () => {
    const result = evaluateDayRollover({
      challenge: baseChallenge({
        currentStreak: 5,
        longestStreak: 5,
        streakFreezesAvailable: 1,
        streakFreezesUsed: 0,
      }),
      scoredActivities: scoredSet,
      previousDayLogs: [],
      previousDayScore: priorSuccess,
    });

    expect(result.challengeUpdate.currentStreak).toBe(5);
    expect(result.challengeUpdate.streakFreezesAvailable).toBe(0);
    expect(result.challengeUpdate.streakFreezesUsed).toBe(1);
    expect(result.dayScore.breakdown.freezeConsumed).toBe(true);
    expect(result.dayScore.breakdown.allScoredLogged).toBe(false);
    expect(result.flags.freezeConsumed).toBe(true);
    expect(result.flags.freezeGranted).toBe(false);
  });

  it('resets streak when no freeze available', () => {
    const result = evaluateDayRollover({
      challenge: baseChallenge({
        currentStreak: 5,
        streakFreezesAvailable: 0,
      }),
      scoredActivities: scoredSet,
      previousDayLogs: [],
      previousDayScore: priorSuccess,
    });

    expect(result.challengeUpdate.currentStreak).toBe(0);
    expect(result.flags.freezeConsumed).toBe(false);
  });

  it('does not consume freeze on consecutive miss', () => {
    const result = evaluateDayRollover({
      challenge: baseChallenge({
        currentStreak: 5,
        streakFreezesAvailable: 1,
      }),
      scoredActivities: scoredSet,
      previousDayLogs: [],
      previousDayScore: priorFailed,
    });

    expect(result.challengeUpdate.currentStreak).toBe(0);
    expect(result.challengeUpdate.streakFreezesAvailable).toBe(1);
    expect(result.flags.freezeConsumed).toBe(false);
  });

  it('does not consume freeze when streak is 0', () => {
    const result = evaluateDayRollover({
      challenge: baseChallenge({
        currentStreak: 0,
        streakFreezesAvailable: 1,
      }),
      scoredActivities: scoredSet,
      previousDayLogs: [],
      previousDayScore: priorSuccess,
    });

    expect(result.challengeUpdate.currentStreak).toBe(0);
    expect(result.challengeUpdate.streakFreezesAvailable).toBe(1);
    expect(result.flags.freezeConsumed).toBe(false);
  });

  it('consumes freeze at streak 1 when inventory was earned earlier', () => {
    const result = evaluateDayRollover({
      challenge: baseChallenge({
        currentStreak: 1,
        longestStreak: 7,
        streakFreezesAvailable: 1,
        streakFreezesUsed: 0,
      }),
      scoredActivities: scoredSet,
      previousDayLogs: [],
      previousDayScore: priorSuccess,
    });

    expect(result.challengeUpdate.currentStreak).toBe(1);
    expect(result.challengeUpdate.streakFreezesAvailable).toBe(0);
    expect(result.flags.freezeConsumed).toBe(true);
  });

  it('does not consume freeze on personal-only miss days', () => {
    const result = evaluateDayRollover({
      challenge: baseChallenge({
        currentStreak: 5,
        longestStreak: 5,
        streakFreezesAvailable: 1,
      }),
      scoredActivities: [],
      personalActivities: [personalCheckbox],
      previousDayLogs: [],
      previousDayScore: priorSuccess,
    });

    expect(result.challengeUpdate.currentStreak).toBe(0);
    expect(result.challengeUpdate.streakFreezesAvailable).toBe(1);
    expect(result.flags.freezeConsumed).toBe(false);
  });

  it('grants freeze when reaching streak 7 in an eligible week', () => {
    const evaluationDay = new Date('2026-06-15T04:00:00.000Z');
    const result = evaluateDayRollover({
      challenge: baseChallenge({
        currentStreak: 6,
        longestStreak: 6,
        streakFreezesAvailable: 0,
        streakFreezesUsed: 0,
        lastStreakFreezeGrantedAt: null,
      }),
      previousDay: evaluationDay,
      timezone: 'America/New_York',
      scoredActivities: scoredSet,
      previousDayLogs: [{ activityId: checkboxActivity.id, state: 'DONE' }],
      previousDayScore: priorSuccess,
    });

    expect(result.challengeUpdate.currentStreak).toBe(7);
    expect(result.challengeUpdate.streakFreezesAvailable).toBe(1);
    expect(result.challengeUpdate.lastStreakFreezeGrantedAt).toEqual(
      evaluationDay,
    );
    expect(result.flags.freezeGranted).toBe(true);
  });

  it('does not grant a second freeze in the same ISO week', () => {
    const evaluationDay = new Date('2026-06-17T04:00:00.000Z');
    const grantedMonday = new Date('2026-06-15T04:00:00.000Z');
    const result = evaluateDayRollover({
      challenge: baseChallenge({
        currentStreak: 6,
        streakFreezesAvailable: 0,
        lastStreakFreezeGrantedAt: grantedMonday,
      }),
      previousDay: evaluationDay,
      timezone: 'America/New_York',
      scoredActivities: scoredSet,
      previousDayLogs: [{ activityId: checkboxActivity.id, state: 'DONE' }],
      previousDayScore: priorSuccess,
    });

    expect(result.challengeUpdate.currentStreak).toBe(7);
    expect(result.challengeUpdate.streakFreezesAvailable).toBe(0);
    expect(result.flags.freezeGranted).toBe(false);
  });

  it('does not grant when inventory already holds a cloak', () => {
    const evaluationDay = new Date('2026-06-15T04:00:00.000Z');
    const result = evaluateDayRollover({
      challenge: baseChallenge({
        currentStreak: 6,
        streakFreezesAvailable: 1,
      }),
      previousDay: evaluationDay,
      timezone: 'America/New_York',
      scoredActivities: scoredSet,
      previousDayLogs: [{ activityId: checkboxActivity.id, state: 'DONE' }],
      previousDayScore: priorSuccess,
    });

    expect(result.challengeUpdate.streakFreezesAvailable).toBe(1);
    expect(result.flags.freezeGranted).toBe(false);
  });

  it('does not grant at streak 8 without empty inventory and new week', () => {
    const evaluationDay = new Date('2026-06-22T04:00:00.000Z');
    const result = evaluateDayRollover({
      challenge: baseChallenge({
        currentStreak: 7,
        streakFreezesAvailable: 0,
        lastStreakFreezeGrantedAt: new Date('2026-06-15T04:00:00.000Z'),
      }),
      previousDay: evaluationDay,
      timezone: 'America/New_York',
      scoredActivities: scoredSet,
      previousDayLogs: [{ activityId: checkboxActivity.id, state: 'DONE' }],
      previousDayScore: priorSuccess,
    });

    expect(result.challengeUpdate.currentStreak).toBe(8);
    expect(result.flags.freezeGranted).toBe(false);
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

type CronFakeOptions = {
  /** Override outer dayScore.findFirst (pre-transaction guard read). */
  dayScoreFindFirstOverride?: (where: {
    challengeId: string;
    date: Date;
  }) => DayScore | null | Promise<DayScore | null>;
  /** Override tx.dayScore.findUnique (in-transaction authoritative read). */
  txDayScoreFindUniqueOverride?: (
    where: { challengeId_date: { challengeId: string; date: Date } },
    select?: { finalized?: boolean },
  ) => Record<string, unknown> | null | Promise<Record<string, unknown> | null>;
};

function createCronFakePrisma(
  seed: CronFakeSeed,
  options: CronFakeOptions = {},
) {
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
      }) => {
        if (options.dayScoreFindFirstOverride) {
          return options.dayScoreFindFirstOverride(where);
        }
        return (
          dayScores.get(dayScoreKey(where.challengeId, where.date)) ?? null
        );
      },
      findUnique: async ({
        where,
        select,
      }: {
        where: { challengeId_date: { challengeId: string; date: Date } };
        select?: { finalized?: boolean };
      }) => {
        const score =
          dayScores.get(
            dayScoreKey(
              where.challengeId_date.challengeId,
              where.challengeId_date.date,
            ),
          ) ?? null;
        if (!score) return null;
        if (!select) return { ...score };
        return Object.fromEntries(
          Object.keys(select).map((key) => [key, score[key as keyof DayScore]]),
        );
      },
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
          findUnique: async ({
            where,
            select,
          }: {
            where: { challengeId_date: { challengeId: string; date: Date } };
            select?: { finalized?: boolean };
          }) => {
            if (options.txDayScoreFindUniqueOverride) {
              return options.txDayScoreFindUniqueOverride(where, select);
            }
            const score =
              dayScores.get(
                dayScoreKey(
                  where.challengeId_date.challengeId,
                  where.challengeId_date.date,
                ),
              ) ?? null;
            if (!score) return null;
            if (!select) return { ...score };
            return Object.fromEntries(
              Object.keys(select).map((key) => [
                key,
                score[key as keyof DayScore],
              ]),
            );
          },
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
            if (typeof data.streakFreezesAvailable === 'number') {
              challenge.streakFreezesAvailable = data.streakFreezesAvailable;
            }
            if (typeof data.streakFreezesUsed === 'number') {
              challenge.streakFreezesUsed = data.streakFreezesUsed;
            }
            if (
              data.lastStreakFreezeGrantedAt instanceof Date ||
              data.lastStreakFreezeGrantedAt === null
            ) {
              challenge.lastStreakFreezeGrantedAt =
                data.lastStreakFreezeGrantedAt as Date | null;
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
  const startDate = new Date('2026-06-10T04:00:00.000Z');
  let previousDay: Date;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T15:00:00.000Z'));
    const localToday = getUserLocalDate(timezone);
    previousDay = addLocalDays(localToday, -1, timezone);
  });

  it('skips groupless users with no personal activities', async () => {
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

  it('finalizes groupless user with personal activities when all are logged', async () => {
    const personalActivity = makeActivity({
      id: 'personal-1',
      groupId: null,
      ownerUserId: 'user-1',
      scored: false,
      isPersonal: true,
      xpComplete: 50,
      xpMiss: -50,
    });

    const { prisma, transactionOps, challenges, dayScores } =
      createCronFakePrisma({
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
            currentStreak: 2,
            longestStreak: 2,
          },
        ],
        activities: [personalActivity],
        activityLogs: [
          {
            id: 'log-1',
            challengeId: 'ch-1',
            userId: 'user-1',
            activityId: 'personal-1',
            date: previousDay,
            value: null,
            tier: null,
            subPoints: null,
            state: 'DONE',
            xpAwarded: 50,
            proofUrl: null,
            aiVerdict: null,
          },
        ],
      });

    const service = new DayEvaluatorService(prisma as never);
    await service.evaluateDays();

    expect(transactionOps).toHaveLength(2);
    const challenge = challenges.get('ch-1');
    const score = dayScores.get(dayScoreKey('ch-1', previousDay));
    expect(challenge?.currentDay).toBe(6);
    expect(challenge?.currentStreak).toBe(3);
    expect(challenge?.totalXp).toBe(0);
    expect(score?.personalXp).toBe(50);
    expect(score?.finalized).toBe(true);
  });

  it('resets streak for groupless user when personal activities are unlogged', async () => {
    const personalActivity = makeActivity({
      id: 'personal-1',
      groupId: null,
      ownerUserId: 'user-1',
      scored: false,
      isPersonal: true,
      xpComplete: 50,
      xpMiss: -50,
    });

    const { prisma, transactionOps, challenges } = createCronFakePrisma({
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
          currentStreak: 4,
          longestStreak: 4,
        },
      ],
      activities: [personalActivity],
      activityLogs: [],
    });

    const service = new DayEvaluatorService(prisma as never);
    await service.evaluateDays();

    expect(transactionOps).toHaveLength(2);
    const challenge = challenges.get('ch-1');
    expect(challenge?.currentStreak).toBe(0);
    expect(challenge?.currentDay).toBe(6);
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

  it('grants streak freeze at day 7 and invokes grant WhatsApp send', async () => {
    const trySendGrantMessage = vi.fn().mockResolvedValue(undefined);
    const streakFreezeMessage = { trySendGrantMessage };

    const { prisma, transactionOps, challenges } = createCronFakePrisma({
      users: [
        {
          id: 'user-1',
          phone: '+15551234567',
          email: 'a@b.com',
          passwordHash: 'x',
          name: 'User',
          timezone,
          groupId: 'group-1',
          whatsappOptIn: true,
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
          currentDay: 7,
          isActive: true,
          totalXp: 0,
          currentStreak: 6,
          longestStreak: 6,
          streakFreezesAvailable: 0,
          streakFreezesUsed: 0,
          lastStreakFreezeGrantedAt: null,
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

    const service = new DayEvaluatorService(
      prisma as never,
      streakFreezeMessage as never,
    );
    await service.evaluateDays();

    expect(transactionOps).toHaveLength(2);
    const challenge = challenges.get('ch-1');
    expect(challenge?.currentStreak).toBe(7);
    expect(challenge?.streakFreezesAvailable).toBe(1);
    expect(challenge?.lastStreakFreezeGrantedAt).toEqual(previousDay);
    expect(trySendGrantMessage).toHaveBeenCalledTimes(1);
    expect(trySendGrantMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        evaluationDay: previousDay,
        currentStreak: 7,
        streakFreezesAvailable: 1,
      }),
    );
  });

  it('retries grant WhatsApp on finalized day when grant was awarded', async () => {
    const trySendGrantMessage = vi.fn().mockResolvedValue(undefined);
    const streakFreezeMessage = { trySendGrantMessage };

    const { prisma, transactionOps } = createCronFakePrisma({
      users: [
        {
          id: 'user-1',
          phone: '+15551234567',
          email: 'a@b.com',
          passwordHash: 'x',
          name: 'User',
          timezone,
          groupId: 'group-1',
          whatsappOptIn: true,
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
          currentDay: 8,
          isActive: true,
          totalXp: 1400,
          currentStreak: 7,
          longestStreak: 7,
          streakFreezesAvailable: 1,
          streakFreezesUsed: 0,
          lastStreakFreezeGrantedAt: previousDay,
        },
      ],
      activities: [makeActivity({ id: 'act-1', groupId: 'group-1' })],
      dayScores: [
        {
          id: 'ds-1',
          challengeId: 'ch-1',
          userId: 'user-1',
          date: previousDay,
          dayNumber: 7,
          xpEarned: 200,
          xpDeducted: 0,
          netXp: 200,
          personalXp: 0,
          breakdown: { allScoredLogged: true, entries: [] },
          finalized: true,
        },
      ],
    });

    const service = new DayEvaluatorService(
      prisma as never,
      streakFreezeMessage as never,
    );
    await service.evaluateDays();

    expect(transactionOps).toHaveLength(0);
    expect(trySendGrantMessage).toHaveBeenCalledTimes(1);
    expect(trySendGrantMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        evaluationDay: previousDay,
      }),
    );
  });

  it('finalizes the scheduled end day when the cron runs late', async () => {
    const challengeEndDay = addLocalDays(startDate, 2, timezone);
    const { prisma, transactionOps, challenges, dayScores } =
      createCronFakePrisma({
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
            endDate: challengeEndDay,
            lengthDays: 3,
            currentDay: 3,
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
            date: challengeEndDay,
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
    const score = dayScores.get(dayScoreKey('ch-1', challengeEndDay));
    expect(challenge?.isActive).toBe(false);
    expect(challenge?.currentDay).toBe(4);
    expect(score?.dayNumber).toBe(3);
    expect(score?.finalized).toBe(true);
  });

  // Exercises the pre-transaction findFirst guard (day-evaluator.service.ts:86-95).
  // The second evaluateDays() sees finalized:true from the first run and returns before $transaction.
  it('is idempotent via outer guard — second sequential run does not double-increment totalXp', async () => {
    const { prisma, transactionOps, challenges, dayScores } =
      createCronFakePrisma({
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
    await service.evaluateDays();

    const challenge = challenges.get('ch-1');
    const score = dayScores.get(dayScoreKey('ch-1', previousDay));

    expect(transactionOps).toHaveLength(2);
    expect(challenge?.totalXp).toBe(200);
    expect(challenge?.currentDay).toBe(6);
    expect(challenge?.currentStreak).toBe(2);
    expect(score?.finalized).toBe(true);
  });

  // Exercises the in-transaction findUnique guard (day-evaluator.service.ts:123-134).
  // Models a race: outer findFirst sees stale finalized:false, but another writer
  // committed finalized:true before our transaction runs.
  it('skips finalize when in-transaction guard sees finalized:true (race snapshot)', async () => {
    const staleScore: DayScore = {
      id: 'ds-stale',
      challengeId: 'ch-1',
      userId: 'user-1',
      date: previousDay,
      dayNumber: 4,
      xpEarned: 200,
      xpDeducted: 0,
      netXp: 200,
      personalXp: 0,
      breakdown: { allScoredLogged: true, entries: [] },
      finalized: false,
    };

    const { prisma, transactionOps, challenges } = createCronFakePrisma(
      {
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
            currentDay: 6,
            isActive: true,
            totalXp: 200,
            currentStreak: 2,
            longestStreak: 2,
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
      },
      {
        dayScoreFindFirstOverride: () => staleScore,
        txDayScoreFindUniqueOverride: () => ({ finalized: true }),
      },
    );

    const service = new DayEvaluatorService(prisma as never);
    await service.evaluateDays();

    const challenge = challenges.get('ch-1');
    expect(transactionOps).toHaveLength(0);
    expect(challenge?.totalXp).toBe(200);
    expect(challenge?.currentDay).toBe(6);
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});
