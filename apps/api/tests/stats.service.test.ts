import { describe, expect, it } from 'vitest';
import {
  ActivityKind,
  type Activity,
  type ActivityLog,
  type Challenge,
  type User,
} from '@workspace-starter/db';
import {
  getActivityCompletion,
  getActivitySeries,
} from '../src/services/stats.service';
import { challengeDisplayOrderBy } from '../src/utils/challenge-query';
import type { PrismaService } from '../src/prisma/prisma.service';

const USER_ID = 'user-1';
const GROUP_ID = 'group-1';

type FakePrismaSeed = {
  users: User[];
  challenges: Challenge[];
  activities: Activity[];
  activityLogs: ActivityLog[];
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

  const prisma = {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        users.get(where.id) ?? null,
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

describe('stats.service', () => {
  const from = new Date('2026-06-01T00:00:00.000Z');
  const to = new Date('2026-06-03T00:00:00.000Z');

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
