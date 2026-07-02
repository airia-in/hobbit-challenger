import { describe, expect, it } from 'vitest';
import { Prisma } from '@workspace-starter/db';
import {
  buildHistoricalUnlockCandidates,
  evaluateAndUnlockMilestones,
  evaluateMilestoneCandidates,
  getUserMilestones,
  shapeEarnedMilestone,
} from '../src/services/milestones.service';
import {
  computeLongestCompletedHabitStreak,
  countConsecutivePerfectDays,
  countLoggedActivityLogs,
  deriveComebackDate,
  deriveFirstPerfectWeekDate,
  replayChallengeStreak,
} from '../src/utils/milestone-metrics';
import {
  MILESTONE_CATALOG,
  pickMostPrestigiousMilestone,
} from '@workspace-starter/types';

const evaluationDay = new Date('2026-07-25T00:00:00.000Z');
const timezone = 'UTC';

function emptyContext() {
  return {
    existingKeys: new Set<string>(),
    totalLogCount: 0,
    longestHabitStreak: 0,
    dormantDaysBeforeEvaluation: 0,
    loggedOnEvaluationDay: false,
    pendingUnlocks: [],
  };
}

describe('evaluateMilestoneCandidates', () => {
  it('returns pending unlock keys not already earned', () => {
    const unlocked = evaluateMilestoneCandidates({
      ...emptyContext(),
      pendingUnlocks: [
        { key: 'streak_7', unlockedAt: evaluationDay },
        { key: 'streak_21', unlockedAt: evaluationDay },
      ],
    });
    expect(unlocked).toEqual(['streak_7', 'streak_21']);
  });

  it('skips already-earned keys (idempotent evaluation)', () => {
    const unlocked = evaluateMilestoneCandidates({
      ...emptyContext(),
      existingKeys: new Set(['streak_7']),
      pendingUnlocks: [
        { key: 'streak_7', unlockedAt: evaluationDay },
        { key: 'streak_21', unlockedAt: evaluationDay },
      ],
    });
    expect(unlocked).toEqual(['streak_21']);
  });
});

describe('buildHistoricalUnlockCandidates', () => {
  it('backfills streak milestones from full challenge history', () => {
    const dayScores = Array.from({ length: 66 }, (_, index) => ({
      date: new Date(Date.UTC(2026, 4, 1 + index)),
      breakdown: { allScoredLogged: true },
    }));

    const candidates = buildHistoricalUnlockCandidates({
      allFinalizedDayScores: dayScores,
      challengeDayScores: dayScores,
      challengeActivityLogs: [],
      allUserLogs: [],
      evaluationDay,
      timezone,
      newStreak: 66,
      dayCounted: true,
      allScoredLogged: true,
      freezeConsumed: false,
      streakFreezesUsed: 0,
    });

    expect(candidates.map((c) => c.key)).toEqual(
      expect.arrayContaining([
        'streak_7',
        'streak_21',
        'streak_30',
        'streak_66',
      ]),
    );
    expect(pickMostPrestigiousMilestone(candidates.map((c) => c.key))).toBe(
      'streak_66',
    );
  });

  it('finds first perfect week beyond a 14-day lookback window', () => {
    const perfectRun = Array.from({ length: 7 }, (_, index) => ({
      date: new Date(Date.UTC(2026, 4, 5 + index)),
      breakdown: { allScoredLogged: true },
    }));
    const gap = Array.from({ length: 14 }, (_, index) => ({
      date: new Date(Date.UTC(2026, 4, 12 + index)),
      breakdown: { allScoredLogged: false },
    }));

    const allScores = [...perfectRun, ...gap];
    const firstWeek = deriveFirstPerfectWeekDate(allScores, timezone);
    expect(firstWeek).toEqual(new Date(Date.UTC(2026, 4, 11)));

    const candidates = buildHistoricalUnlockCandidates({
      allFinalizedDayScores: allScores,
      challengeDayScores: allScores,
      challengeActivityLogs: [],
      allUserLogs: [],
      evaluationDay,
      timezone,
      newStreak: 0,
      dayCounted: false,
      allScoredLogged: false,
      freezeConsumed: false,
      streakFreezesUsed: 0,
    });

    expect(candidates.some((c) => c.key === 'first_perfect_week')).toBe(true);
  });

  it('retroactively awards first perfect day from history', () => {
    const candidates = buildHistoricalUnlockCandidates({
      allFinalizedDayScores: [
        {
          date: new Date(Date.UTC(2026, 5, 1)),
          breakdown: { allScoredLogged: true },
        },
      ],
      challengeDayScores: [
        {
          date: new Date(Date.UTC(2026, 5, 1)),
          breakdown: { allScoredLogged: true },
        },
        {
          date: new Date(Date.UTC(2026, 5, 2)),
          breakdown: { allScoredLogged: false },
        },
      ],
      challengeActivityLogs: [],
      allUserLogs: [],
      evaluationDay,
      timezone,
      newStreak: 0,
      dayCounted: false,
      allScoredLogged: false,
      freezeConsumed: false,
      streakFreezesUsed: 0,
    });

    expect(candidates.some((c) => c.key === 'first_perfect_day')).toBe(true);
  });

  it('retroactively awards first freeze consumed from history', () => {
    const candidates = buildHistoricalUnlockCandidates({
      allFinalizedDayScores: [],
      challengeDayScores: [
        {
          date: new Date(Date.UTC(2026, 5, 10)),
          breakdown: { allScoredLogged: false, freezeConsumed: true },
        },
      ],
      challengeActivityLogs: [],
      allUserLogs: [],
      evaluationDay,
      timezone,
      newStreak: 5,
      dayCounted: false,
      allScoredLogged: false,
      freezeConsumed: false,
      streakFreezesUsed: 1,
    });

    expect(candidates.some((c) => c.key === 'first_freeze_consumed')).toBe(
      true,
    );
  });

  it('unlocks comeback on any activity log after dormancy (not dayCounted)', () => {
    const lastLog = new Date(Date.UTC(2026, 6, 1));
    const returnLog = new Date(Date.UTC(2026, 6, 5));

    const candidates = buildHistoricalUnlockCandidates({
      allFinalizedDayScores: [],
      challengeDayScores: [],
      challengeActivityLogs: [
        {
          activityId: 'a1',
          date: lastLog,
          state: 'DONE',
          tier: null,
          value: null,
          subPoints: null,
        },
        {
          activityId: 'a1',
          date: returnLog,
          state: 'UNLOGGED',
          tier: null,
          value: null,
          subPoints: null,
        },
      ],
      allUserLogs: [],
      evaluationDay: returnLog,
      timezone,
      newStreak: 0,
      dayCounted: false,
      allScoredLogged: false,
      freezeConsumed: false,
      streakFreezesUsed: 0,
    });

    expect(candidates.some((c) => c.key === 'comeback')).toBe(true);
  });
});

describe('milestone metrics helpers', () => {
  it('counts logged activity logs only', () => {
    expect(
      countLoggedActivityLogs([
        { state: 'DONE', tier: null, value: null, subPoints: null },
        { state: 'UNLOGGED', tier: null, value: null, subPoints: null },
      ]),
    ).toBe(1);
  });

  it('counts consecutive perfect days ending on evaluation day', () => {
    expect(
      countConsecutivePerfectDays(
        ['2026-07-01', '2026-07-02'],
        '2026-07-03',
        true,
      ),
    ).toBe(3);
  });

  it('replays challenge streak from finalized scores', () => {
    const timeline = replayChallengeStreak([
      { date: new Date('2026-07-01'), breakdown: { allScoredLogged: true } },
      { date: new Date('2026-07-02'), breakdown: { allScoredLogged: true } },
      {
        date: new Date('2026-07-03'),
        breakdown: { allScoredLogged: false, freezeConsumed: true },
      },
      { date: new Date('2026-07-04'), breakdown: { allScoredLogged: true } },
    ]);
    expect(timeline.map((row) => row.streakAfter)).toEqual([1, 2, 2, 3]);
  });

  it('uses completed-day semantics for habit streak 14', () => {
    const longest = computeLongestCompletedHabitStreak(
      [
        {
          activityId: 'a1',
          date: new Date('2026-06-01'),
          state: 'DONE',
          tier: null,
          value: null,
          subPoints: null,
        },
        {
          activityId: 'a1',
          date: new Date('2026-06-02'),
          state: 'FAILED',
          tier: null,
          value: null,
          subPoints: null,
        },
      ],
      timezone,
    );
    expect(longest).toBe(1);
  });

  it('detects comeback from any activity log row', () => {
    const comeback = deriveComebackDate(
      [{ date: new Date('2026-06-01') }, { date: new Date('2026-06-05') }],
      timezone,
    );
    expect(comeback).toEqual(new Date('2026-06-05'));
  });
});

describe('evaluateAndUnlockMilestones idempotency', () => {
  function p2002DuplicateError(): Prisma.PrismaClientKnownRequestError {
    return new Prisma.PrismaClientKnownRequestError('Unique constraint', {
      code: 'P2002',
      clientVersion: 'test',
    });
  }

  it('creates each milestone once across repeated evaluation', async () => {
    const rows: Array<{ milestoneKey: string; unlockedAt: Date }> = [];
    const prisma = {
      userMilestone: {
        findMany: async () =>
          rows.map((row) => ({ milestoneKey: row.milestoneKey })),
        create: async ({
          data,
        }: {
          data: { milestoneKey: string; unlockedAt?: Date };
        }) => {
          if (rows.some((row) => row.milestoneKey === data.milestoneKey)) {
            throw p2002DuplicateError();
          }
          rows.push({
            milestoneKey: data.milestoneKey,
            unlockedAt: data.unlockedAt ?? new Date(),
          });
          return data;
        },
      },
      activityLog: {
        findMany: async () => [],
      },
      dayScore: {
        findMany: async () => [],
      },
      activity: {
        findMany: async () => [],
      },
      challenge: {
        findUnique: async () => ({ streakFreezesUsed: 0 }),
      },
    };

    const input = {
      userId: 'user-1',
      challengeId: 'challenge-1',
      groupId: null,
      evaluationDay,
      timezone,
      newStreak: 7,
      dayCounted: true,
      allScoredLogged: true,
      freezeConsumed: false,
    };

    const first = await evaluateAndUnlockMilestones(prisma as never, input);
    const second = await evaluateAndUnlockMilestones(prisma as never, input);

    expect(first.newlyUnlocked).toContain('streak_7');
    expect(second.newlyUnlocked).toEqual([]);
    expect(rows.filter((row) => row.milestoneKey === 'streak_7')).toHaveLength(
      1,
    );
  });

  it('backfill burst creates N rows from one evaluation', async () => {
    const rows: Array<{ milestoneKey: string; unlockedAt: Date }> = [];
    const dayScores = Array.from({ length: 66 }, (_, index) => ({
      date: new Date(Date.UTC(2026, 4, 1 + index)),
      breakdown: { allScoredLogged: true },
    }));

    const prisma = {
      userMilestone: {
        findMany: async () =>
          rows.map((row) => ({ milestoneKey: row.milestoneKey })),
        create: async ({
          data,
        }: {
          data: { milestoneKey: string; unlockedAt?: Date };
        }) => {
          rows.push({
            milestoneKey: data.milestoneKey,
            unlockedAt: data.unlockedAt ?? new Date(),
          });
          return data;
        },
      },
      activityLog: { findMany: async () => [] },
      dayScore: { findMany: async () => dayScores },
      activity: { findMany: async () => [] },
      challenge: {
        findUnique: async () => ({ streakFreezesUsed: 0 }),
      },
    };

    const result = await evaluateAndUnlockMilestones(prisma as never, {
      userId: 'user-1',
      challengeId: 'challenge-1',
      groupId: null,
      evaluationDay,
      timezone,
      newStreak: 66,
      dayCounted: true,
      allScoredLogged: true,
      freezeConsumed: false,
    });

    expect(result.newlyUnlocked.length).toBeGreaterThanOrEqual(4);
    expect(rows.length).toBe(result.newlyUnlocked.length);
  });

  it('swallows P2002 duplicate but rethrows other create errors', async () => {
    const prisma = {
      userMilestone: {
        findMany: async () => [],
        create: async () => {
          throw p2002DuplicateError();
        },
      },
      activityLog: { findMany: async () => [] },
      dayScore: { findMany: async () => [] },
      activity: { findMany: async () => [] },
      challenge: {
        findUnique: async () => ({ streakFreezesUsed: 0 }),
      },
    };

    const input = {
      userId: 'user-1',
      challengeId: 'challenge-1',
      groupId: null,
      evaluationDay,
      timezone,
      newStreak: 7,
      dayCounted: true,
      allScoredLogged: true,
      freezeConsumed: false,
    };

    const result = await evaluateAndUnlockMilestones(prisma as never, input);
    expect(result.newlyUnlocked).toEqual([]);

    const failingPrisma = {
      ...prisma,
      userMilestone: {
        findMany: async () => [],
        create: async () => {
          throw new Error('connection lost');
        },
      },
    };

    await expect(
      evaluateAndUnlockMilestones(failingPrisma as never, input),
    ).rejects.toThrow('connection lost');
  });
});

describe('getUserMilestones batch summary', () => {
  it('returns most prestigious latest unlock with additional count', async () => {
    const unlockedAt = new Date('2026-07-03T00:00:00.000Z');
    const prisma = {
      userMilestone: {
        findMany: async () => [
          { milestoneKey: 'streak_7', unlockedAt },
          { milestoneKey: 'streak_21', unlockedAt },
          { milestoneKey: 'first_perfect_day', unlockedAt },
        ],
      },
    };

    const result = await getUserMilestones(prisma as never, 'user-1');
    expect(result.latestUnlock?.key).toBe('streak_21');
    expect(result.latestUnlockAdditionalCount).toBe(2);
  });
});

describe('shapeEarnedMilestone', () => {
  it('maps catalog metadata onto earned rows', () => {
    const shaped = shapeEarnedMilestone({
      milestoneKey: 'streak_7',
      unlockedAt: new Date('2026-07-03T00:00:00.000Z'),
    });
    expect(shaped.title).toBe(MILESTONE_CATALOG.streak_7.title);
    expect(shaped.unlockCopy).toBe(MILESTONE_CATALOG.streak_7.unlockCopy);
  });
});
