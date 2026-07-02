import { describe, expect, it } from 'vitest';
import {
  ActivityKind,
  type Activity,
  type ActivityLog,
  type Challenge,
  type DayScore,
  type User,
} from '@workspace-starter/db';
import {
  getActivityCompletion,
  getActivitySeries,
  getDashboardStats,
} from '../src/services/stats.service';
import { challengeDisplayOrderBy } from '../src/utils/challenge-query';
import { getUserLocalDate } from '../src/utils/day-window';
import type { PrismaService } from '../src/prisma/prisma.service';

const USER_ID = 'user-1';
const GROUP_ID = 'group-1';

type FakePrismaSeed = {
  users: User[];
  challenges: Challenge[];
  activities: Activity[];
  activityLogs: ActivityLog[];
  dayScores?: DayScore[];
  milestones?: Array<{
    milestoneKey: string;
    unlockedAt: Date;
  }>;
};

function sortChallenges(
  challenges: Challenge[],
  orderBy: typeof challengeDisplayOrderBy,
): Challenge[] {
  const sorted = [...challenges];
  for (const clause of [...orderBy].reverse()) {
    if ('isActive' in clause && clause.isActive === 'desc') {
      sorted.sort((a, b) => Number(b.isActive) - Number(a.isActive));
    }
    if ('startDate' in clause && clause.startDate === 'desc') {
      sorted.sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
    }
  }
  return sorted;
}

function createFakePrisma(seed: FakePrismaSeed) {
  const users = new Map(seed.users.map((user) => [user.id, { ...user }]));
  const challenges = new Map(
    seed.challenges.map((challenge) => [challenge.id, { ...challenge }]),
  );
  const activities = new Map(
    seed.activities.map((activity) => [activity.id, { ...activity }]),
  );
  const activityLogs = [...seed.activityLogs.map((log) => ({ ...log }))];
  const dayScores = [...(seed.dayScores ?? []).map((day) => ({ ...day }))];
  const milestones = [...(seed.milestones ?? [])];

  const prisma = {
    user: {
      findUnique: async ({
        where,
        include,
      }: {
        where: { id: string };
        include?: { group?: { select: { challengeTimezone: true } } };
      }) => {
        const user = users.get(where.id);
        if (!user) return null;
        if (include?.group) {
          return {
            ...user,
            group: user.groupId
              ? { challengeTimezone: 'UTC' as string | null }
              : null,
          };
        }
        return user;
      },
    },
    challenge: {
      findFirst: async ({
        where,
        orderBy,
      }: {
        where: { userId?: string; isActive?: boolean };
        orderBy?: typeof challengeDisplayOrderBy;
      }) => {
        let matches = [...challenges.values()].filter((challenge) => {
          if (where.userId !== undefined && challenge.userId !== where.userId) {
            return false;
          }
          if (
            where.isActive !== undefined &&
            challenge.isActive !== where.isActive
          ) {
            return false;
          }
          return true;
        });
        if (orderBy) {
          matches = sortChallenges(matches, orderBy);
        }
        return matches[0] ?? null;
      },
    },
    activity: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        activities.get(where.id) ?? null,
      findMany: async ({
        where,
      }: {
        where: { OR?: Array<Partial<Activity>> };
      }) => {
        return [...activities.values()]
          .filter((activity) => {
            if (!where.OR) return true;
            return where.OR.some((condition) =>
              Object.entries(condition).every(
                ([key, value]) =>
                  activity[key as keyof Activity] === (value as never),
              ),
            );
          })
          .map((activity) => ({
            id: activity.id,
            scored: activity.scored,
            isPersonal: activity.isPersonal,
          }));
      },
    },
    activityLog: {
      findMany: async ({
        where,
        orderBy,
      }: {
        where: {
          userId?: string;
          activityId?: string;
          challengeId?: string;
          date?: { gte?: Date; lte?: Date };
        };
        orderBy?: { date: 'asc' | 'desc' };
      }) => {
        let result = activityLogs.filter((log) => {
          if (where.userId !== undefined && log.userId !== where.userId) {
            return false;
          }
          if (
            where.activityId !== undefined &&
            log.activityId !== where.activityId
          ) {
            return false;
          }
          if (
            where.challengeId !== undefined &&
            log.challengeId !== where.challengeId
          ) {
            return false;
          }
          if (
            where.date?.gte &&
            log.date.getTime() < where.date.gte.getTime()
          ) {
            return false;
          }
          if (
            where.date?.lte &&
            log.date.getTime() > where.date.lte.getTime()
          ) {
            return false;
          }
          return true;
        });
        if (orderBy?.date === 'asc') {
          result = result.sort((a, b) => a.date.getTime() - b.date.getTime());
        }
        return result.map((log) => ({
          date: log.date,
          value: log.value,
          xpAwarded: log.xpAwarded,
          state: log.state,
          tier: log.tier,
          subPoints: log.subPoints,
        }));
      },
      count: async ({ where }: { where: { userId?: string } }) => {
        return activityLogs.filter((log) => {
          if (where.userId !== undefined && log.userId !== where.userId) {
            return false;
          }
          return true;
        }).length;
      },
    },
    dayScore: {
      findMany: async ({
        where,
        orderBy,
        take,
      }: {
        where: {
          challenge?: { userId?: string };
          challengeId?: string;
          finalized?: boolean;
        };
        orderBy?: { date: 'asc' | 'desc' };
        take?: number;
      }) => {
        let result = dayScores.filter((day) => {
          if (where.challenge?.userId !== undefined) {
            const challenge = challenges.get(day.challengeId);
            if (challenge?.userId !== where.challenge.userId) {
              return false;
            }
          }
          if (
            where.challengeId !== undefined &&
            day.challengeId !== where.challengeId
          ) {
            return false;
          }
          if (
            where.finalized !== undefined &&
            day.finalized !== where.finalized
          ) {
            return false;
          }
          return true;
        });

        if (orderBy?.date === 'desc') {
          result = result.sort((a, b) => b.date.getTime() - a.date.getTime());
        } else if (orderBy?.date === 'asc') {
          result = result.sort((a, b) => a.date.getTime() - b.date.getTime());
        }

        if (take !== undefined) {
          result = result.slice(0, take);
        }

        return result.map((day) => ({
          date: day.date,
          finalized: day.finalized,
          breakdown: day.breakdown,
        }));
      },
      findFirst: async ({
        where,
      }: {
        where: { challengeId: string; date: Date };
      }) => {
        const match = dayScores.find(
          (day) =>
            day.challengeId === where.challengeId &&
            day.date.getTime() === where.date.getTime(),
        );
        return match
          ? { netXp: match.netXp, finalized: match.finalized }
          : null;
      },
    },
    userMilestone: {
      findMany: async ({
        orderBy,
      }: {
        where: { userId?: string };
        orderBy?: { unlockedAt: 'asc' | 'desc' };
      }) => {
        let result = [...milestones];
        if (orderBy?.unlockedAt === 'desc') {
          result = [...result].sort(
            (a, b) => b.unlockedAt.getTime() - a.unlockedAt.getTime(),
          );
        }
        return result;
      },
    },
  };

  return prisma as unknown as PrismaService;
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: USER_ID,
    name: 'Test User',
    phone: null,
    email: 'test@example.com',
    passwordHash: 'hash',
    timezone: 'UTC',
    groupId: GROUP_ID,
    avatarUrl: null,
    reminderTime: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeChallenge(
  id: string,
  overrides: Partial<Challenge> = {},
): Challenge {
  return {
    id,
    userId: USER_ID,
    groupId: GROUP_ID,
    startDate: new Date('2026-01-01'),
    endDate: null,
    lengthDays: 30,
    currentDay: 30,
    isActive: false,
    totalXp: 0,
    currentStreak: 0,
    longestStreak: 0,
    streakFreezesAvailable: 0,
    streakFreezesUsed: 0,
    lastStreakFreezeGrantedAt: null,
    ...overrides,
  };
}

function makeNumberActivity(id: string): Activity {
  return {
    id,
    groupId: GROUP_ID,
    ownerUserId: null,
    seedKey: 'WATER',
    title: 'Water',
    emoji: '💧',
    kind: ActivityKind.NUMBER,
    scored: true,
    isPersonal: false,
    xpComplete: null,
    xpMiss: null,
    unitLabel: 'glasses',
    xpPerUnit: 10,
    xpCap: 100,
    missXp: null,
    subPoints: null,
    tiers: null,
    deductMultiplier: 2,
    sortOrder: 0,
    active: true,
    createdAt: new Date(),
  };
}

function makeCheckboxActivity(id: string): Activity {
  return {
    id,
    groupId: GROUP_ID,
    ownerUserId: null,
    seedKey: 'DIET',
    title: 'Diet',
    emoji: '🥗',
    kind: ActivityKind.CHECKBOX,
    scored: true,
    isPersonal: false,
    xpComplete: 250,
    xpMiss: -250,
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
  };
}

function makeLog(
  challengeId: string,
  activityId: string,
  date: string,
  overrides: Partial<ActivityLog> = {},
): ActivityLog {
  return {
    id: `log-${challengeId}-${activityId}-${date}`,
    challengeId,
    activityId,
    userId: USER_ID,
    date: new Date(`${date}T00:00:00.000Z`),
    value: null,
    xpAwarded: 0,
    state: null,
    tier: null,
    subPoints: null,
    proofUrl: null,
    aiVerdict: null,
    ...overrides,
  };
}

function makeDayScore(
  challengeId: string,
  date: string,
  overrides: Partial<DayScore> = {},
): DayScore {
  return {
    id: `score-${challengeId}-${date}`,
    challengeId,
    userId: USER_ID,
    date: new Date(`${date}T00:00:00.000Z`),
    dayNumber: 1,
    xpEarned: 0,
    xpDeducted: 0,
    netXp: 0,
    personalXp: 0,
    breakdown: [],
    finalized: false,
    ...overrides,
  };
}

describe('stats.service', () => {
  const from = new Date('2026-06-01T00:00:00.000Z');
  const to = new Date('2026-06-03T00:00:00.000Z');

  describe('getDashboardStats', () => {
    it('returns XP-era dashboard stats without a restart counter', async () => {
      const challengeId = 'challenge-active';
      const today = getUserLocalDate('UTC');
      const prisma = createFakePrisma({
        users: [makeUser()],
        challenges: [
          makeChallenge(challengeId, {
            isActive: true,
            totalXp: 900,
            currentStreak: 2,
            longestStreak: 4,
          }),
        ],
        activities: [],
        activityLogs: [],
        dayScores: [
          makeDayScore(challengeId, '2026-06-01', {
            finalized: true,
            breakdown: { allScoredLogged: true },
          }),
          makeDayScore(challengeId, '2026-06-02', {
            finalized: true,
            breakdown: { allScoredLogged: false },
          }),
          makeDayScore(challengeId, today.toISOString().slice(0, 10), {
            netXp: 75,
          }),
        ],
      });

      const result = await getDashboardStats(prisma, USER_ID);

      expect(result.totalXp).toBe(975);
      expect(result.todayNetXp).toBe(75);
      expect(result.totalDaysCompleted).toBe(1);
      expect(result.successRate).toBe(50);
      expect(result.streakBreak).toEqual({
        occurred: true,
        previousStreak: 1,
        brokeOnDate: '2026-06-02',
        daysSinceBreak: expect.any(Number),
      });
      expect(result).not.toHaveProperty('timesRestarted');
    });

    it('returns streakBreak after a multi-day streak failure', async () => {
      const challengeId = 'challenge-streak-break';
      const prisma = createFakePrisma({
        users: [makeUser()],
        challenges: [
          makeChallenge(challengeId, {
            isActive: true,
            currentStreak: 0,
            longestStreak: 9,
          }),
        ],
        activities: [],
        activityLogs: [],
        dayScores: [
          makeDayScore(challengeId, '2026-06-10', {
            finalized: true,
            breakdown: { allScoredLogged: false },
          }),
          ...Array.from({ length: 9 }, (_, index) =>
            makeDayScore(challengeId, `2026-06-0${9 - index}`, {
              finalized: true,
              breakdown: { allScoredLogged: true },
            }),
          ),
        ],
      });

      const result = await getDashboardStats(prisma, USER_ID);

      expect(result.streakBreak).toEqual({
        occurred: true,
        previousStreak: 9,
        brokeOnDate: '2026-06-10',
        daysSinceBreak: expect.any(Number),
      });
    });

    it('returns no streak break when streak is intact', async () => {
      const challengeId = 'challenge-intact';
      const prisma = createFakePrisma({
        users: [makeUser()],
        challenges: [
          makeChallenge(challengeId, {
            isActive: true,
            currentStreak: 5,
            longestStreak: 5,
          }),
        ],
        activities: [],
        activityLogs: [],
        dayScores: [
          makeDayScore(challengeId, '2026-06-09', {
            finalized: true,
            breakdown: { allScoredLogged: true },
          }),
          makeDayScore(challengeId, '2026-06-08', {
            finalized: true,
            breakdown: { allScoredLogged: true },
          }),
        ],
      });

      const result = await getDashboardStats(prisma, USER_ID);

      expect(result.streakBreak).toEqual({
        occurred: false,
        previousStreak: 0,
        brokeOnDate: null,
        daysSinceBreak: 0,
      });
    });

    it('exposes streak freeze inventory on dashboard stats', async () => {
      const challengeId = 'challenge-freeze';
      const prisma = createFakePrisma({
        users: [makeUser()],
        challenges: [
          makeChallenge(challengeId, {
            isActive: true,
            streakFreezesAvailable: 1,
            streakFreezesUsed: 2,
          }),
        ],
        activities: [],
        activityLogs: [],
        dayScores: [],
      });

      const result = await getDashboardStats(prisma, USER_ID);

      expect(result.streakFreezesAvailable).toBe(1);
      expect(result.streakFreezesUsed).toBe(2);
    });

    it('exposes earned milestones on dashboard stats', async () => {
      const challengeId = 'challenge-milestones';
      const unlockedAt = new Date('2026-07-01T00:00:00.000Z');
      const prisma = createFakePrisma({
        users: [makeUser()],
        challenges: [makeChallenge(challengeId, { isActive: true })],
        activities: [],
        activityLogs: [],
        dayScores: [],
        milestones: [
          { milestoneKey: 'streak_7', unlockedAt },
          {
            milestoneKey: 'streak_21',
            unlockedAt: new Date('2026-06-20T00:00:00.000Z'),
          },
        ],
      });

      const result = await getDashboardStats(prisma, USER_ID);

      expect(result.milestones.earned).toHaveLength(2);
      expect(result.milestones.latestUnlock?.key).toBe('streak_7');
      expect(result.milestones.latestUnlock?.title).toBe(
        'First week on the trail',
      );
    });

    it('suppresses streak break when latest day was freeze-absorbed', async () => {
      const challengeId = 'challenge-freeze-absorbed';
      const prisma = createFakePrisma({
        users: [makeUser()],
        challenges: [
          makeChallenge(challengeId, {
            isActive: true,
            currentStreak: 5,
            longestStreak: 5,
            streakFreezesAvailable: 0,
            streakFreezesUsed: 1,
          }),
        ],
        activities: [],
        activityLogs: [],
        dayScores: [
          makeDayScore(challengeId, '2026-06-10', {
            finalized: true,
            breakdown: { allScoredLogged: false, freezeConsumed: true },
          }),
          makeDayScore(challengeId, '2026-06-09', {
            finalized: true,
            breakdown: { allScoredLogged: true },
          }),
        ],
      });

      const result = await getDashboardStats(prisma, USER_ID);

      expect(result.streakBreak.occurred).toBe(false);
    });
  });

  describe('getActivitySeries', () => {
    it('returns series for a user whose only challenge is inactive', async () => {
      const activityId = 'act-water';
      const challengeId = 'challenge-inactive';
      const prisma = createFakePrisma({
        users: [makeUser()],
        challenges: [makeChallenge(challengeId, { isActive: false })],
        activities: [makeNumberActivity(activityId)],
        activityLogs: [
          makeLog(challengeId, activityId, '2026-06-01', {
            value: 2,
            xpAwarded: 20,
          }),
          makeLog(challengeId, activityId, '2026-06-02', {
            value: 3,
            xpAwarded: 30,
          }),
        ],
      });

      const result = await getActivitySeries(
        prisma,
        USER_ID,
        activityId,
        from,
        to,
      );

      expect(result).not.toEqual([]);
      expect(result).toEqual([
        { date: '2026-06-01', value: 2, xpAwarded: 20 },
        { date: '2026-06-02', value: 3, xpAwarded: 30 },
      ]);
    });

    it('prefers the active challenge when both active and inactive exist', async () => {
      const activityId = 'act-water';
      const inactiveChallengeId = 'challenge-inactive';
      const activeChallengeId = 'challenge-active';
      const prisma = createFakePrisma({
        users: [makeUser()],
        challenges: [
          makeChallenge(inactiveChallengeId, {
            isActive: false,
            startDate: new Date('2026-01-01'),
          }),
          makeChallenge(activeChallengeId, {
            isActive: true,
            startDate: new Date('2026-06-01'),
          }),
        ],
        activities: [makeNumberActivity(activityId)],
        activityLogs: [
          makeLog(inactiveChallengeId, activityId, '2026-06-01', {
            value: 99,
            xpAwarded: 990,
          }),
          makeLog(activeChallengeId, activityId, '2026-06-01', {
            value: 1,
            xpAwarded: 10,
          }),
        ],
      });

      const result = await getActivitySeries(
        prisma,
        USER_ID,
        activityId,
        from,
        to,
      );

      expect(result).toEqual([{ date: '2026-06-01', value: 1, xpAwarded: 10 }]);
    });
  });

  describe('getActivityCompletion', () => {
    it('returns completion data for a user whose only challenge is inactive', async () => {
      const activityId = 'act-diet';
      const challengeId = 'challenge-inactive';
      const prisma = createFakePrisma({
        users: [makeUser()],
        challenges: [makeChallenge(challengeId, { isActive: false })],
        activities: [makeCheckboxActivity(activityId)],
        activityLogs: [
          makeLog(challengeId, activityId, '2026-06-01', {
            state: 'DONE',
            xpAwarded: 250,
          }),
          makeLog(challengeId, activityId, '2026-06-02', {
            state: 'DONE',
            xpAwarded: 250,
          }),
        ],
      });

      const result = await getActivityCompletion(
        prisma,
        USER_ID,
        activityId,
        from,
        to,
      );

      expect(result.days).not.toEqual([]);
      expect(result.days).toHaveLength(3);
      expect(
        result.days.filter((day) => day.state === 'completed'),
      ).toHaveLength(2);
    });

    it('prefers the active challenge when both active and inactive exist', async () => {
      const activityId = 'act-diet';
      const inactiveChallengeId = 'challenge-inactive';
      const activeChallengeId = 'challenge-active';
      const prisma = createFakePrisma({
        users: [makeUser()],
        challenges: [
          makeChallenge(inactiveChallengeId, {
            isActive: false,
            startDate: new Date('2026-01-01'),
          }),
          makeChallenge(activeChallengeId, {
            isActive: true,
            startDate: new Date('2026-06-01'),
          }),
        ],
        activities: [makeCheckboxActivity(activityId)],
        activityLogs: [
          makeLog(inactiveChallengeId, activityId, '2026-06-01', {
            state: 'DONE',
            xpAwarded: 250,
          }),
          makeLog(activeChallengeId, activityId, '2026-06-01', {
            state: 'FAILED',
            xpAwarded: -250,
          }),
        ],
      });

      const result = await getActivityCompletion(
        prisma,
        USER_ID,
        activityId,
        from,
        to,
      );

      expect(result.days).toEqual([
        { date: '2026-06-01', state: 'missed' },
        { date: '2026-06-02', state: 'unlogged' },
        { date: '2026-06-03', state: 'unlogged' },
      ]);
      expect(result.streak).toBe(0);
    });
  });
});
