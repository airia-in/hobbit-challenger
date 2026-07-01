import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { type Challenge, type User } from '@workspace-starter/db';
import { getHeatmap, setDayLabel } from '../src/services/heatmap.service';
import { challengeDisplayOrderBy } from '../src/utils/challenge-query';
import type { PrismaService } from '../src/prisma/prisma.service';

const USER_ID = 'user-1';
const ADMIN_ID = 'admin-1';
const MEMBER_ID = 'member-1';
const GROUP_ID = 'group-1';
const CHALLENGE_ID = 'challenge-1';
const FIXED_NOW = new Date('2026-06-15T12:00:00.000Z');

type StoredDayScore = {
  id: string;
  challengeId: string;
  userId: string;
  date: Date;
  dayNumber: number;
  finalized: boolean;
  breakdown: unknown;
};

type StoredDayLabel = {
  id: string;
  groupId: string;
  dayNumber: number;
  labelText: string;
  setByUserId: string;
  updatedAt: Date;
};

type StoredGroup = {
  id: string;
  name: string;
  inviteToken: string;
  adminUserId: string;
};

type FakePrismaSeed = {
  users: User[];
  groups: StoredGroup[];
  challenges: Challenge[];
  dayScores: StoredDayScore[];
  dayLabels: StoredDayLabel[];
};

function sortChallenges(challenges: Challenge[]): Challenge[] {
  const sorted = [...challenges];
  for (const clause of [...challengeDisplayOrderBy].reverse()) {
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
  const groups = new Map(seed.groups.map((group) => [group.id, { ...group }]));
  const challenges = new Map(
    seed.challenges.map((challenge) => [challenge.id, { ...challenge }]),
  );
  const dayScores = [...seed.dayScores.map((score) => ({ ...score }))];
  const dayLabels = [...seed.dayLabels.map((label) => ({ ...label }))];

  function challengesForUser(userId: string): Challenge[] {
    return sortChallenges(
      [...challenges.values()].filter(
        (challenge) => challenge.userId === userId,
      ),
    );
  }

  function dayScoresForChallenge(challengeId: string): StoredDayScore[] {
    return dayScores.filter((score) => score.challengeId === challengeId);
  }

  const dayLabelUpsert = vi.fn(
    async ({
      where,
      create,
      update,
    }: {
      where: { groupId_dayNumber: { groupId: string; dayNumber: number } };
      create: {
        groupId: string;
        dayNumber: number;
        labelText: string;
        setByUserId: string;
      };
      update: { labelText: string; setByUserId: string };
    }) => {
      const { groupId, dayNumber } = where.groupId_dayNumber;
      const existing = dayLabels.find(
        (label) => label.groupId === groupId && label.dayNumber === dayNumber,
      );
      if (existing) {
        existing.labelText = update.labelText;
        existing.setByUserId = update.setByUserId;
        existing.updatedAt = FIXED_NOW;
        return { ...existing };
      }
      const created: StoredDayLabel = {
        id: `label-${groupId}-${dayNumber}`,
        groupId: create.groupId,
        dayNumber: create.dayNumber,
        labelText: create.labelText,
        setByUserId: create.setByUserId,
        updatedAt: FIXED_NOW,
      };
      dayLabels.push(created);
      return { ...created };
    },
  );

  const prisma = {
    user: {
      findUnique: async ({
        where,
        include,
      }: {
        where: { id: string };
        include?: {
          group?: { include?: { dayLabels?: boolean } };
          challenges?: {
            orderBy?: typeof challengeDisplayOrderBy;
            take?: number;
            include?: { dayScores?: boolean };
          };
        };
      }) => {
        const user = users.get(where.id);
        if (!user) {
          return null;
        }

        const row: Record<string, unknown> = { ...user };

        if (include?.group) {
          const group = user.groupId ? groups.get(user.groupId) : null;
          if (group) {
            row.group = {
              ...group,
              dayLabels: include.group.include?.dayLabels
                ? dayLabels.filter((label) => label.groupId === group.id)
                : undefined,
            };
          } else {
            row.group = null;
          }
        }

        if (include?.challenges) {
          const latest = challengesForUser(user.id).slice(0, 1);
          row.challenges = latest.map((challenge) => ({
            ...challenge,
            dayScores: include.challenges?.include?.dayScores
              ? dayScoresForChallenge(challenge.id)
              : undefined,
          }));
        }

        return row;
      },
    },
    group: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        groups.get(where.id) ?? null,
    },
    challenge: {
      findFirst: async ({
        where,
        orderBy,
        select,
      }: {
        where: { userId?: string };
        orderBy?: typeof challengeDisplayOrderBy;
        select?: { lengthDays?: boolean };
      }) => {
        let matches = [...challenges.values()].filter((challenge) => {
          if (where.userId !== undefined && challenge.userId !== where.userId) {
            return false;
          }
          return true;
        });
        if (orderBy) {
          matches = sortChallenges(matches);
        }
        const match = matches[0] ?? null;
        if (!match) {
          return null;
        }
        if (select?.lengthDays) {
          return { lengthDays: match.lengthDays };
        }
        return match;
      },
    },
    dayLabel: {
      upsert: dayLabelUpsert,
    },
  };

  return {
    prisma: prisma as unknown as PrismaService,
    dayLabelUpsert,
  };
}

function makeUser(id: string, overrides: Partial<User> = {}): User {
  return {
    id,
    name: 'Test User',
    phone: null,
    email: `${id}@example.com`,
    passwordHash: 'hash',
    timezone: 'UTC',
    groupId: GROUP_ID,
    avatarUrl: null,
    reminderTime: null,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeGroup(adminUserId: string): StoredGroup {
  return {
    id: GROUP_ID,
    name: 'Test Group',
    inviteToken: 'invite-token',
    adminUserId,
  };
}

function makeChallenge(overrides: Partial<Challenge> = {}): Challenge {
  return {
    id: CHALLENGE_ID,
    userId: USER_ID,
    groupId: GROUP_ID,
    startDate: new Date('2026-06-01'),
    endDate: null,
    lengthDays: 7,
    currentDay: 3,
    isActive: true,
    totalXp: 0,
    currentStreak: 0,
    longestStreak: 0,
    ...overrides,
  };
}

function makeDayScore(
  dayNumber: number,
  overrides: Partial<StoredDayScore> = {},
): StoredDayScore {
  return {
    id: `score-${dayNumber}`,
    challengeId: CHALLENGE_ID,
    userId: USER_ID,
    date: new Date(
      `2026-06-${String(dayNumber).padStart(2, '0')}T00:00:00.000Z`,
    ),
    dayNumber,
    finalized: true,
    breakdown: { allScoredLogged: true },
    ...overrides,
  };
}

function baseSeed(overrides: Partial<FakePrismaSeed> = {}): FakePrismaSeed {
  return {
    users: [makeUser(USER_ID)],
    groups: [makeGroup(ADMIN_ID)],
    challenges: [makeChallenge()],
    dayScores: [],
    dayLabels: [],
    ...overrides,
  };
}

function cellState(
  cells: Awaited<ReturnType<typeof getHeatmap>>['cells'],
  dayNumber: number,
) {
  return cells.find((cell) => cell.dayNumber === dayNumber)?.state;
}

describe('heatmap.service', () => {
  beforeEach(() => {
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getHeatmap', () => {
    it('throws NOT_FOUND when user is missing', async () => {
      const { prisma } = createFakePrisma(baseSeed({ users: [] }));

      await expect(getHeatmap(prisma, USER_ID)).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'User not found',
      } satisfies Partial<TRPCError>);
    });

    it('marks day 3 as today with past scores and future days when active on day 3', async () => {
      const { prisma } = createFakePrisma(
        baseSeed({
          challenges: [
            makeChallenge({ currentDay: 3, isActive: true, lengthDays: 7 }),
          ],
          dayScores: [
            makeDayScore(1, {
              finalized: true,
              breakdown: { allScoredLogged: true },
            }),
            makeDayScore(2, {
              finalized: true,
              breakdown: { allScoredLogged: false },
            }),
          ],
        }),
      );

      const result = await getHeatmap(prisma, USER_ID);

      expect(cellState(result.cells, 1)).toBe('completed');
      expect(cellState(result.cells, 2)).toBe('failed');
      expect(cellState(result.cells, 3)).toBe('today');
      expect(cellState(result.cells, 4)).toBe('future');
      expect(cellState(result.cells, 7)).toBe('future');
    });

    it('marks a finalized past day with all scored logged as completed', async () => {
      const { prisma } = createFakePrisma(
        baseSeed({
          challenges: [
            makeChallenge({ currentDay: 5, isActive: true, lengthDays: 7 }),
          ],
          dayScores: [
            makeDayScore(2, {
              finalized: true,
              breakdown: { allScoredLogged: true },
            }),
          ],
        }),
      );

      const result = await getHeatmap(prisma, USER_ID);

      expect(cellState(result.cells, 2)).toBe('completed');
    });

    it('marks a finalized past day without all scored logged as failed', async () => {
      const { prisma } = createFakePrisma(
        baseSeed({
          challenges: [
            makeChallenge({ currentDay: 5, isActive: true, lengthDays: 7 }),
          ],
          dayScores: [
            makeDayScore(2, {
              finalized: true,
              breakdown: { allScoredLogged: false },
            }),
          ],
        }),
      );

      const result = await getHeatmap(prisma, USER_ID);

      expect(cellState(result.cells, 2)).toBe('failed');
    });

    it('marks a past day without a score as not_started', async () => {
      const { prisma } = createFakePrisma(
        baseSeed({
          challenges: [
            makeChallenge({ currentDay: 5, isActive: true, lengthDays: 7 }),
          ],
          dayScores: [],
        }),
      );

      const result = await getHeatmap(prisma, USER_ID);

      expect(cellState(result.cells, 2)).toBe('not_started');
    });

    it('uses score-only states when currentDay exceeds lengthDays', async () => {
      const { prisma } = createFakePrisma(
        baseSeed({
          challenges: [
            makeChallenge({
              currentDay: 8,
              isActive: false,
              lengthDays: 7,
            }),
          ],
          dayScores: [
            makeDayScore(1, {
              finalized: true,
              breakdown: { allScoredLogged: true },
            }),
            makeDayScore(2, {
              finalized: true,
              breakdown: { allScoredLogged: false },
            }),
          ],
        }),
      );

      const result = await getHeatmap(prisma, USER_ID);

      expect(result.cells.some((cell) => cell.state === 'today')).toBe(false);
      expect(result.cells.some((cell) => cell.state === 'future')).toBe(false);
      expect(cellState(result.cells, 1)).toBe('completed');
      expect(cellState(result.cells, 2)).toBe('failed');
      expect(cellState(result.cells, 3)).toBe('not_started');
    });

    it('populates dayLabel from group day labels', async () => {
      const { prisma } = createFakePrisma(
        baseSeed({
          challenges: [
            makeChallenge({ currentDay: 3, isActive: true, lengthDays: 5 }),
          ],
          dayLabels: [
            {
              id: 'label-1',
              groupId: GROUP_ID,
              dayNumber: 2,
              labelText: 'Leg day',
              setByUserId: ADMIN_ID,
              updatedAt: FIXED_NOW,
            },
          ],
        }),
      );

      const result = await getHeatmap(prisma, USER_ID);

      expect(result.cells.find((cell) => cell.dayNumber === 2)?.dayLabel).toBe(
        'Leg day',
      );
      expect(
        result.cells.find((cell) => cell.dayNumber === 1)?.dayLabel,
      ).toBeNull();
    });

    it('returns isGroupAdmin true for the group admin and false for members', async () => {
      const adminSeed = baseSeed({
        users: [makeUser(ADMIN_ID)],
        groups: [makeGroup(ADMIN_ID)],
      });
      const memberSeed = baseSeed({
        users: [makeUser(MEMBER_ID)],
        groups: [makeGroup(ADMIN_ID)],
        challenges: [makeChallenge({ userId: MEMBER_ID })],
      });

      const adminResult = await getHeatmap(
        createFakePrisma(adminSeed).prisma,
        ADMIN_ID,
      );
      const memberResult = await getHeatmap(
        createFakePrisma(memberSeed).prisma,
        MEMBER_ID,
      );

      expect(adminResult.isGroupAdmin).toBe(true);
      expect(memberResult.isGroupAdmin).toBe(false);
    });
  });

  describe('setDayLabel', () => {
    it('throws FORBIDDEN for non-admin users', async () => {
      const { prisma } = createFakePrisma(
        baseSeed({
          users: [makeUser(MEMBER_ID)],
          groups: [makeGroup(ADMIN_ID)],
          challenges: [makeChallenge({ userId: MEMBER_ID, lengthDays: 30 })],
        }),
      );

      await expect(
        setDayLabel(prisma, MEMBER_ID, 1, 'Rest day'),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'Admin only',
      } satisfies Partial<TRPCError>);
    });

    it('throws BAD_REQUEST for day 0 and maxDay + 1', async () => {
      const { prisma } = createFakePrisma(
        baseSeed({
          users: [makeUser(ADMIN_ID)],
          groups: [makeGroup(ADMIN_ID)],
          challenges: [makeChallenge({ userId: ADMIN_ID, lengthDays: 75 })],
        }),
      );

      await expect(
        setDayLabel(prisma, ADMIN_ID, 0, 'Invalid'),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Day must be 1–75',
      } satisfies Partial<TRPCError>);

      await expect(
        setDayLabel(prisma, ADMIN_ID, 76, 'Invalid'),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Day must be 1–75',
      } satisfies Partial<TRPCError>);
    });

    it('upserts the label and returns it on success', async () => {
      const { prisma, dayLabelUpsert } = createFakePrisma(
        baseSeed({
          users: [makeUser(ADMIN_ID)],
          groups: [makeGroup(ADMIN_ID)],
          challenges: [makeChallenge({ userId: ADMIN_ID, lengthDays: 30 })],
        }),
      );

      const label = await setDayLabel(prisma, ADMIN_ID, 5, 'Core focus');

      expect(dayLabelUpsert).toHaveBeenCalledOnce();
      expect(label).toMatchObject({
        groupId: GROUP_ID,
        dayNumber: 5,
        labelText: 'Core focus',
        setByUserId: ADMIN_ID,
      });
    });

    it('rejects day 31 when the challenge lengthDays is 30', async () => {
      const { prisma } = createFakePrisma(
        baseSeed({
          users: [makeUser(ADMIN_ID)],
          groups: [makeGroup(ADMIN_ID)],
          challenges: [makeChallenge({ userId: ADMIN_ID, lengthDays: 30 })],
        }),
      );

      await expect(
        setDayLabel(prisma, ADMIN_ID, 31, 'Too far'),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Day must be 1–30',
      } satisfies Partial<TRPCError>);
    });
  });
});
