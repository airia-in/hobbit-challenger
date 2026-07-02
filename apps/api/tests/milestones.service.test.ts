import { describe, expect, it } from 'vitest';
import {
  evaluateAndUnlockMilestones,
  evaluateMilestoneCandidates,
  shapeEarnedMilestone,
} from '../src/services/milestones.service';
import {
  computeLongestHabitStreak,
  countConsecutivePerfectDays,
  countLoggedActivityLogs,
} from '../src/utils/milestone-metrics';
import { MILESTONE_CATALOG } from '@workspace-starter/types';

const baseInput = {
  userId: 'user-1',
  challengeId: 'challenge-1',
  groupId: 'group-1',
  evaluationDay: new Date('2026-07-03T00:00:00.000Z'),
  timezone: 'UTC',
  newStreak: 0,
  dayCounted: false,
  allScoredLogged: false,
  freezeConsumed: false,
};

const emptyContext = {
  existingKeys: new Set<string>(),
  totalLogCount: 0,
  consecutivePerfectDays: 0,
  longestHabitStreak: 0,
  dormantDaysBeforeEvaluation: 0,
};

describe('evaluateMilestoneCandidates', () => {
  it('unlocks streak thresholds exactly once when day counts', () => {
    const unlocked = evaluateMilestoneCandidates(
      { ...baseInput, newStreak: 7, dayCounted: true },
      emptyContext,
    );
    expect(unlocked).toContain('streak_7');
    expect(unlocked).not.toContain('streak_21');
  });

  it('does not unlock streak milestones when day did not count', () => {
    const unlocked = evaluateMilestoneCandidates(
      { ...baseInput, newStreak: 7, dayCounted: false },
      emptyContext,
    );
    expect(unlocked).toEqual([]);
  });

  it('skips already-earned keys (idempotent evaluation)', () => {
    const unlocked = evaluateMilestoneCandidates(
      { ...baseInput, newStreak: 7, dayCounted: true },
      { ...emptyContext, existingKeys: new Set(['streak_7']) },
    );
    expect(unlocked).not.toContain('streak_7');
  });

  it('unlocks first perfect day and week', () => {
    const unlocked = evaluateMilestoneCandidates(
      {
        ...baseInput,
        dayCounted: true,
        allScoredLogged: true,
      },
      { ...emptyContext, consecutivePerfectDays: 7 },
    );
    expect(unlocked).toContain('first_perfect_day');
    expect(unlocked).toContain('first_perfect_week');
  });

  it('unlocks total logs, habit streak, comeback, and freeze consumed', () => {
    const unlocked = evaluateMilestoneCandidates(
      {
        ...baseInput,
        dayCounted: true,
        freezeConsumed: true,
      },
      {
        ...emptyContext,
        totalLogCount: 100,
        longestHabitStreak: 14,
        dormantDaysBeforeEvaluation: 3,
      },
    );
    expect(unlocked).toEqual(
      expect.arrayContaining([
        'total_logs_100',
        'habit_streak_14',
        'comeback',
        'first_freeze_consumed',
      ]),
    );
  });

  it('covers full unlock matrix for 66-day streak', () => {
    const unlocked = evaluateMilestoneCandidates(
      { ...baseInput, newStreak: 66, dayCounted: true },
      emptyContext,
    );
    expect(unlocked).toEqual(
      expect.arrayContaining([
        'streak_7',
        'streak_21',
        'streak_30',
        'streak_66',
      ]),
    );
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

  it('computes longest habit streak across activities', () => {
    const longest = computeLongestHabitStreak([
      { activityId: 'a1', dateKey: '2026-06-01', logged: true },
      { activityId: 'a1', dateKey: '2026-06-02', logged: true },
      { activityId: 'a2', dateKey: '2026-06-01', logged: true },
    ]);
    expect(longest).toBe(2);
  });
});

describe('evaluateAndUnlockMilestones idempotency', () => {
  it('creates each milestone once across repeated evaluation', async () => {
    const rows: Array<{ milestoneKey: string }> = [];
    const prisma = {
      userMilestone: {
        findMany: async () =>
          rows.map((row) => ({ milestoneKey: row.milestoneKey })),
        create: async ({ data }: { data: { milestoneKey: string } }) => {
          if (rows.some((row) => row.milestoneKey === data.milestoneKey)) {
            throw new Error('Unique constraint');
          }
          rows.push({ milestoneKey: data.milestoneKey });
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
    };

    const input = {
      userId: 'user-1',
      challengeId: 'challenge-1',
      groupId: null,
      evaluationDay: new Date('2026-07-03T00:00:00.000Z'),
      timezone: 'UTC',
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
