import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import {
  type Activity,
  type ActivityLog,
  type Challenge,
  type User,
} from '@workspace-starter/db';
import {
  getLeaderboard,
  getLeaderboardSeries,
} from '../src/services/leaderboard.service';
import { challengeDisplayOrderBy } from '../src/utils/challenge-query';
import {
  formatLocalDateKey,
  getIsoWeekRange,
  getUserLocalDate,
} from '../src/utils/day-window';
import { assertLeaderboardSeriesPrivacy } from '../src/utils/stats-aggregation';
import type { PrismaService } from '../src/prisma/prisma.service';

const CALLER_ID = 'user-caller';
const GROUP_ID = 'group-1';
const TIMEZONE = 'UTC';
const FIXED_NOW = new Date('2026-06-15T12:00:00.000Z');

type StoredDayScore = {
  id: string;
  challengeId: string;
  userId: string;
  date: Date;
  dayNumber: number;
  xpEarned: number;
  xpDeducted: number;
  netXp: number;
  personalXp: number;
  breakdown: unknown;
  finalized: boolean;
};

type FakePrismaSeed = {
  users: User[];
  challenges: Challenge[];
  dayScores: StoredDayScore[];
  activities?: Activity[];
  activityLogs?: ActivityLog[];
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

function matchesActivityWhere(
  activity: Activity,
  where: {
    OR?: Array<Record<string, unknown>>;
    groupId?: string;
    active?: boolean;
    scored?: boolean;
    ownerUserId?: string;
    isPersonal?: boolean;
  },
): boolean {
  if (where.OR) {
    return where.OR.some((clause) =>
      matchesActivityWhere(activity, clause as typeof where),
    );
  }
  if (where.groupId !== undefined && activity.groupId !== where.groupId) {
    return false;
  }
  if (where.active !== undefined && activity.active !== where.active) {
    return false;
  }
  if (where.scored !== undefined && activity.scored !== where.scored) {
    return false;
  }
  if (
    where.ownerUserId !== undefined &&
    activity.ownerUserId !== where.ownerUserId
  ) {
    return false;
  }
  if (
    where.isPersonal !== undefined &&
    activity.isPersonal !== where.isPersonal
  ) {
    return false;
  }
  return true;
}

function createFakePrisma(seed: FakePrismaSeed) {
  const users = new Map(seed.users.map((user) => [user.id, { ...user }]));
  const challenges = new Map(
    seed.challenges.map((challenge) => [challenge.id, { ...challenge }]),
  );
  const dayScores = [...seed.dayScores.map((score) => ({ ...score }))];
  const activities = new Map(
    (seed.activities ?? []).map((activity) => [activity.id, { ...activity }]),
  );
  const activityLogs = [
    ...(seed.activityLogs ?? []).map((log) => ({ ...log })),
  ];

  function challengesForUser(userId: string): Challenge[] {
    return sortChallenges(
      [...challenges.values()].filter(
        (challenge) => challenge.userId === userId,
      ),
    );
  }

  function dayScoresForChallenge(challengeId: string): StoredDayScore[] {
    return dayScores
      .filter((score) => score.challengeId === challengeId)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  const prisma = {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        users.get(where.id) ?? null,
      findMany: async ({
        where,
        select,
      }: {
        where: { groupId?: string };
        select?: {
          id?: boolean;
          name?: boolean;
          avatarUrl?: boolean;
          timezone?: boolean;
          groupId?: boolean;
          challenges?: {
            include?: {
              dayScores?: {
                select: { finalized?: boolean; breakdown?: boolean };
              };
            };
            select?: {
              startDate?: boolean;
              dayScores?: {
                select: { date?: boolean; netXp?: boolean };
                orderBy?: { date: 'asc' | 'desc' };
              };
            };
          };
        };
      }) => {
        let result = [...users.values()];
        if (where.groupId !== undefined) {
          result = result.filter((user) => user.groupId === where.groupId);
        }

        return result.map((user) => {
          const row: Record<string, unknown> = {};
          if (select?.id) row.id = user.id;
          if (select?.name) row.name = user.name;
          if (select?.avatarUrl) row.avatarUrl = user.avatarUrl;
          if (select?.timezone) row.timezone = user.timezone;
          if (select?.groupId) row.groupId = user.groupId;

          if (select?.challenges) {
            const latest = challengesForUser(user.id).slice(0, 1);
            if (select.challenges.include?.dayScores) {
              row.challenges = latest.map((challenge) => ({
                ...challenge,
                dayScores: dayScoresForChallenge(challenge.id).map((score) => ({
                  finalized: score.finalized,
                  breakdown: score.breakdown,
                })),
              }));
            } else if (select.challenges.select) {
              row.challenges = latest.map((challenge) => ({
                startDate: challenge.startDate,
                dayScores: dayScoresForChallenge(challenge.id).map((score) => ({
                  date: score.date,
                  netXp: score.netXp,
                })),
              }));
            } else {
              row.challenges = latest;
            }
          }

          return row;
        });
      },
    },
    dayScore: {
      findFirst: async ({
        where,
        select,
      }: {
        where: { challengeId: string; date: Date };
        select?: { netXp?: boolean };
      }) => {
        const match =
          dayScores.find(
            (score) =>
              score.challengeId === where.challengeId &&
              score.date.getTime() === where.date.getTime(),
          ) ?? null;
        if (!match) return null;
        if (select?.netXp) return { netXp: match.netXp };
        return match;
      },
      findMany: async ({
        where,
        select,
      }: {
        where: {
          challengeId: string;
          date?: { gte?: Date; lte?: Date };
        };
        select?: { netXp?: boolean };
      }) => {
        const matches = dayScores.filter((score) => {
          if (score.challengeId !== where.challengeId) return false;
          if (
            where.date?.gte &&
            score.date.getTime() < where.date.gte.getTime()
          ) {
            return false;
          }
          if (
            where.date?.lte &&
            score.date.getTime() > where.date.lte.getTime()
          ) {
            return false;
          }
          return true;
        });
        if (select?.netXp) {
          return matches.map((score) => ({ netXp: score.netXp }));
        }
        return matches;
      },
    },
    activity: {
      findMany: async ({
        where,
      }: {
        where?: Parameters<typeof matchesActivityWhere>[1];
      }) =>
        [...activities.values()]
          .filter((activity) =>
            where ? matchesActivityWhere(activity, where) : true,
          )
          .map((activity) => ({
            id: activity.id,
            scored: activity.scored,
            isPersonal: activity.isPersonal,
          })),
    },
    activityLog: {
      findMany: async ({
        where,
      }: {
        where: {
          challengeId?: string;
          userId?: string;
          date?: Date;
        };
      }) =>
        activityLogs
          .filter((log) => {
            if (
              where.challengeId !== undefined &&
              log.challengeId !== where.challengeId
            ) {
              return false;
            }
            if (where.userId !== undefined && log.userId !== where.userId) {
              return false;
            }
            if (
              where.date !== undefined &&
              log.date.getTime() !== where.date.getTime()
            ) {
              return false;
            }
            return true;
          })
          .map((log) => ({
            activityId: log.activityId,
            state: log.state,
            tier: log.tier,
            value: log.value,
            subPoints: log.subPoints,
          })),
    },
  };

  return prisma as unknown as PrismaService;
}

function makeUser(id: string, overrides: Partial<User> = {}): User {
  return {
    id,
    name: `User ${id}`,
    phone: null,
    email: `${id}@example.com`,
    passwordHash: 'hash',
    timezone: TIMEZONE,
    groupId: GROUP_ID,
    avatarUrl: null,
    reminderTime: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeChallenge(
  id: string,
  userId: string,
  overrides: Partial<Challenge> = {},
): Challenge {
  return {
    id,
    userId,
    groupId: GROUP_ID,
    startDate: new Date('2026-06-01T00:00:00.000Z'),
    endDate: null,
    lengthDays: 75,
    currentDay: 15,
    isActive: true,
    totalXp: 0,
    currentStreak: 0,
    longestStreak: 0,
    ...overrides,
  };
}

function makeDayScore(
  id: string,
  challengeId: string,
  userId: string,
  dateKey: string,
  netXp: number,
  overrides: Partial<StoredDayScore> = {},
): StoredDayScore {
  return {
    id,
    challengeId,
    userId,
    date: new Date(`${dateKey}T00:00:00.000Z`),
    dayNumber: 1,
    xpEarned: netXp,
    xpDeducted: 0,
    netXp,
    personalXp: 0,
    breakdown: { allScoredLogged: true },
    finalized: true,
    ...overrides,
  };
}

function localDateKey(dateKey: string): Date {
  return getUserLocalDate(TIMEZONE, new Date(`${dateKey}T12:00:00.000Z`));
}

describe('leaderboard.service', () => {
  let today: Date;
  let weekStart: Date;
  let weekEnd: Date;

  beforeEach(() => {
    vi.setSystemTime(FIXED_NOW);
    today = getUserLocalDate(TIMEZONE);
    ({ start: weekStart, end: weekEnd } = getIsoWeekRange(TIMEZONE));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getLeaderboard', () => {
    it('throws NOT_FOUND when caller has no groupId', async () => {
      const prisma = createFakePrisma({
        users: [makeUser(CALLER_ID, { groupId: null })],
        challenges: [],
        dayScores: [],
      });

      await expect(getLeaderboard(prisma, CALLER_ID)).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Join a group to view the leaderboard',
      } satisfies Partial<TRPCError>);
    });

    it('ranks members by today netXp when window is today', async () => {
      const aliceId = 'user-alice';
      const bobId = 'user-bob';
      const charlieId = 'user-charlie';
      const aliceChallenge = 'challenge-alice';
      const bobChallenge = 'challenge-bob';
      const charlieChallenge = 'challenge-charlie';

      const prisma = createFakePrisma({
        users: [
          makeUser(CALLER_ID, { name: 'Caller' }),
          makeUser(aliceId, { name: 'Alice' }),
          makeUser(bobId, { name: 'Bob' }),
          makeUser(charlieId, { name: 'Charlie' }),
        ],
        challenges: [
          makeChallenge('challenge-caller', CALLER_ID),
          makeChallenge(aliceChallenge, aliceId),
          makeChallenge(bobChallenge, bobId),
          makeChallenge(charlieChallenge, charlieId),
        ],
        dayScores: [
          makeDayScore(
            'score-alice-today',
            aliceChallenge,
            aliceId,
            '2026-06-15',
            100,
          ),
          makeDayScore(
            'score-bob-today',
            bobChallenge,
            bobId,
            '2026-06-15',
            50,
          ),
          makeDayScore(
            'score-charlie-today',
            charlieChallenge,
            charlieId,
            '2026-06-15',
            200,
          ),
        ],
      });

      const result = await getLeaderboard(prisma, CALLER_ID, 'today', 'xp');

      expect(result.members.map((member) => member.id)).toEqual([
        charlieId,
        aliceId,
        bobId,
        CALLER_ID,
      ]);
      expect(result.members[0]?.xp).toBe(200);
      expect(result.members[1]?.xp).toBe(100);
      expect(result.members[2]?.xp).toBe(50);
    });

    it('sums netXp across the ISO week when window is week', async () => {
      const aliceId = 'user-alice';
      const bobId = 'user-bob';
      const aliceChallenge = 'challenge-alice';
      const bobChallenge = 'challenge-bob';

      const prisma = createFakePrisma({
        users: [
          makeUser(CALLER_ID, { name: 'Caller' }),
          makeUser(aliceId, { name: 'Alice' }),
          makeUser(bobId, { name: 'Bob' }),
        ],
        challenges: [
          makeChallenge('challenge-caller', CALLER_ID),
          makeChallenge(aliceChallenge, aliceId),
          makeChallenge(bobChallenge, bobId),
        ],
        dayScores: [
          makeDayScore(
            'score-alice-mon',
            aliceChallenge,
            aliceId,
            '2026-06-15',
            10,
          ),
          makeDayScore(
            'score-alice-wed',
            aliceChallenge,
            aliceId,
            '2026-06-17',
            20,
          ),
          makeDayScore(
            'score-alice-sun',
            aliceChallenge,
            aliceId,
            '2026-06-21',
            30,
          ),
          makeDayScore('score-bob-mon', bobChallenge, bobId, '2026-06-15', 100),
          makeDayScore(
            'score-bob-prev',
            bobChallenge,
            bobId,
            '2026-06-14',
            999,
          ),
        ],
      });

      const result = await getLeaderboard(prisma, CALLER_ID, 'week', 'xp');

      expect(formatLocalDateKey(weekStart, TIMEZONE)).toBe('2026-06-15');
      expect(formatLocalDateKey(weekEnd, TIMEZONE)).toBe('2026-06-21');
      expect(result.members.find((member) => member.id === aliceId)?.xp).toBe(
        60,
      );
      expect(result.members.find((member) => member.id === bobId)?.xp).toBe(
        100,
      );
    });

    it('uses totalXp plus today netXp when window is total', async () => {
      const aliceId = 'user-alice';
      const aliceChallenge = 'challenge-alice';

      const prisma = createFakePrisma({
        users: [makeUser(CALLER_ID), makeUser(aliceId, { name: 'Alice' })],
        challenges: [
          makeChallenge('challenge-caller', CALLER_ID),
          makeChallenge(aliceChallenge, aliceId, { totalXp: 500 }),
        ],
        dayScores: [
          makeDayScore(
            'score-alice-today',
            aliceChallenge,
            aliceId,
            '2026-06-15',
            75,
          ),
        ],
      });

      const result = await getLeaderboard(prisma, CALLER_ID, 'total', 'xp');

      expect(result.members.find((member) => member.id === aliceId)?.xp).toBe(
        575,
      );
    });

    it('orders by streak descending with xp as tie-breaker', async () => {
      const alphaId = 'user-alpha';
      const betaId = 'user-beta';
      const gammaId = 'user-gamma';
      const alphaChallenge = 'challenge-alpha';
      const betaChallenge = 'challenge-beta';
      const gammaChallenge = 'challenge-gamma';

      const prisma = createFakePrisma({
        users: [
          makeUser(CALLER_ID, { name: 'Caller' }),
          makeUser(alphaId, { name: 'Alpha' }),
          makeUser(betaId, { name: 'Beta' }),
          makeUser(gammaId, { name: 'Gamma' }),
        ],
        challenges: [
          makeChallenge('challenge-caller', CALLER_ID, { currentStreak: 1 }),
          makeChallenge(alphaChallenge, alphaId, { currentStreak: 10 }),
          makeChallenge(betaChallenge, betaId, { currentStreak: 15 }),
          makeChallenge(gammaChallenge, gammaId, { currentStreak: 15 }),
        ],
        dayScores: [
          makeDayScore(
            'score-alpha',
            alphaChallenge,
            alphaId,
            '2026-06-15',
            100,
          ),
          makeDayScore('score-beta', betaChallenge, betaId, '2026-06-15', 50),
          makeDayScore(
            'score-gamma',
            gammaChallenge,
            gammaId,
            '2026-06-15',
            80,
          ),
        ],
      });

      const result = await getLeaderboard(prisma, CALLER_ID, 'today', 'streak');

      expect(result.members.slice(0, 3).map((member) => member.id)).toEqual([
        gammaId,
        betaId,
        alphaId,
      ]);
      expect(result.members[0]?.streak).toBe(15);
      expect(result.members[0]?.xp).toBe(80);
      expect(result.members[1]?.streak).toBe(15);
      expect(result.members[1]?.xp).toBe(50);
    });

    it('returns exactly the top three members on the podium', async () => {
      const ids = ['user-a', 'user-b', 'user-c', 'user-d'] as const;
      const prisma = createFakePrisma({
        users: [
          makeUser(CALLER_ID, { name: 'Caller' }),
          ...ids.map((id) => makeUser(id, { name: id })),
        ],
        challenges: [
          makeChallenge('challenge-caller', CALLER_ID),
          ...ids.map((id) => makeChallenge(`challenge-${id}`, id)),
        ],
        dayScores: [
          makeDayScore(
            'score-a',
            'challenge-user-a',
            'user-a',
            '2026-06-15',
            400,
          ),
          makeDayScore(
            'score-b',
            'challenge-user-b',
            'user-b',
            '2026-06-15',
            300,
          ),
          makeDayScore(
            'score-c',
            'challenge-user-c',
            'user-c',
            '2026-06-15',
            200,
          ),
          makeDayScore(
            'score-d',
            'challenge-user-d',
            'user-d',
            '2026-06-15',
            100,
          ),
        ],
      });

      const result = await getLeaderboard(prisma, CALLER_ID, 'today', 'xp');

      expect(result.podium).toHaveLength(3);
      expect(result.podium.map((member) => member.id)).toEqual([
        'user-a',
        'user-b',
        'user-c',
      ]);
      expect(result.podium).toEqual(result.members.slice(0, 3));
    });

    it('returns zeroed stats for a member without a challenge', async () => {
      const noChallengeId = 'user-no-challenge';
      const prisma = createFakePrisma({
        users: [
          makeUser(CALLER_ID),
          makeUser(noChallengeId, { name: 'No Challenge' }),
        ],
        challenges: [makeChallenge('challenge-caller', CALLER_ID)],
        dayScores: [],
      });

      const result = await getLeaderboard(prisma, CALLER_ID, 'today', 'xp');
      const member = result.members.find((entry) => entry.id === noChallengeId);

      expect(member).toMatchObject({
        xp: 0,
        streak: 0,
        status: 'COMPLETED',
        currentDay: 0,
      });
    });
  });

  describe('getLeaderboardSeries', () => {
    it('throws NOT_FOUND when caller has no groupId', async () => {
      const prisma = createFakePrisma({
        users: [makeUser(CALLER_ID, { groupId: null })],
        challenges: [],
        dayScores: [],
      });

      await expect(
        getLeaderboardSeries(prisma, CALLER_ID),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Join a group to view leaderboard series',
      } satisfies Partial<TRPCError>);
    });

    it('returns a single-day range when window is today', async () => {
      const aliceId = 'user-alice';
      const aliceChallenge = 'challenge-alice';
      const prisma = createFakePrisma({
        users: [makeUser(CALLER_ID), makeUser(aliceId, { name: 'Alice' })],
        challenges: [
          makeChallenge('challenge-caller', CALLER_ID),
          makeChallenge(aliceChallenge, aliceId),
        ],
        dayScores: [
          makeDayScore(
            'score-alice-today',
            aliceChallenge,
            aliceId,
            '2026-06-15',
            42,
          ),
        ],
      });

      const result = await getLeaderboardSeries(
        prisma,
        CALLER_ID,
        'today',
        'daily',
      );
      const caller = result.members.find((member) => member.isSelf);
      const firstPoint = caller?.points[0];

      expect(formatLocalDateKey(today, TIMEZONE)).toBe('2026-06-15');
      expect(caller?.points).toHaveLength(1);
      expect(firstPoint?.date).toBe(formatLocalDateKey(today, TIMEZONE));
      // Caller has no score today, so their single point carries zero XP...
      expect(firstPoint?.xp).toBe(0);
      // ...while Alice's seeded score flows through to her series point.
      const alice = result.members.find((member) => member.id === aliceId);
      expect(alice?.points).toHaveLength(1);
      expect(alice?.points[0]?.xp).toBe(42);
    });

    it('uses the caller ISO week range when window is week', async () => {
      const aliceId = 'user-alice';
      const aliceChallenge = 'challenge-alice';
      const prisma = createFakePrisma({
        users: [makeUser(CALLER_ID), makeUser(aliceId, { name: 'Alice' })],
        challenges: [
          makeChallenge('challenge-caller', CALLER_ID),
          makeChallenge(aliceChallenge, aliceId),
        ],
        dayScores: [
          makeDayScore(
            'score-alice-mon',
            aliceChallenge,
            aliceId,
            '2026-06-15',
            10,
          ),
          makeDayScore(
            'score-alice-sun',
            aliceChallenge,
            aliceId,
            '2026-06-21',
            20,
          ),
        ],
      });

      const result = await getLeaderboardSeries(
        prisma,
        CALLER_ID,
        'week',
        'daily',
      );
      const caller = result.members.find((member) => member.isSelf);

      expect(caller?.points.at(0)?.date).toBe('2026-06-15');
      expect(caller?.points.at(-1)?.date).toBe('2026-06-21');
      expect(caller?.points).toHaveLength(7);
    });

    it('returns cumulative running totals from challenge start when metric is cumulative', async () => {
      const callerChallenge = 'challenge-caller';
      const prisma = createFakePrisma({
        users: [makeUser(CALLER_ID, { name: 'Caller' })],
        challenges: [
          makeChallenge(callerChallenge, CALLER_ID, {
            startDate: localDateKey('2026-06-01'),
          }),
        ],
        dayScores: [
          makeDayScore('score-1', callerChallenge, CALLER_ID, '2026-06-01', 10),
          makeDayScore('score-2', callerChallenge, CALLER_ID, '2026-06-10', 20),
          makeDayScore('score-3', callerChallenge, CALLER_ID, '2026-06-15', 30),
        ],
      });

      const result = await getLeaderboardSeries(
        prisma,
        CALLER_ID,
        'total',
        'cumulative',
      );
      const caller = result.members.find((member) => member.isSelf);

      expect(
        caller?.points.find((point) => point.date === '2026-06-01')?.xp,
      ).toBe(10);
      expect(
        caller?.points.find((point) => point.date === '2026-06-10')?.xp,
      ).toBe(30);
      expect(
        caller?.points.find((point) => point.date === '2026-06-15')?.xp,
      ).toBe(60);
    });

    it('returns per-day netXp when metric is daily', async () => {
      const callerChallenge = 'challenge-caller';
      const prisma = createFakePrisma({
        users: [makeUser(CALLER_ID, { name: 'Caller' })],
        challenges: [
          makeChallenge(callerChallenge, CALLER_ID, {
            startDate: localDateKey('2026-06-01'),
          }),
        ],
        dayScores: [
          makeDayScore('score-1', callerChallenge, CALLER_ID, '2026-06-01', 10),
          makeDayScore('score-2', callerChallenge, CALLER_ID, '2026-06-10', 20),
          makeDayScore('score-3', callerChallenge, CALLER_ID, '2026-06-15', 30),
        ],
      });

      const result = await getLeaderboardSeries(
        prisma,
        CALLER_ID,
        'total',
        'daily',
      );
      const caller = result.members.find((member) => member.isSelf);

      expect(
        caller?.points.find((point) => point.date === '2026-06-01')?.xp,
      ).toBe(10);
      expect(
        caller?.points.find((point) => point.date === '2026-06-10')?.xp,
      ).toBe(20);
      expect(
        caller?.points.find((point) => point.date === '2026-06-15')?.xp,
      ).toBe(30);
    });

    it('places caller first, sorts others by name, and omits forbidden privacy fields', async () => {
      const alphaId = 'user-alpha';
      const zuluId = 'user-zulu';
      const alphaChallenge = 'challenge-alpha';
      const zuluChallenge = 'challenge-zulu';
      const callerChallenge = 'challenge-caller';

      const prisma = createFakePrisma({
        users: [
          makeUser(CALLER_ID, { name: 'Caller' }),
          makeUser(zuluId, { name: 'Zulu' }),
          makeUser(alphaId, { name: 'Alpha' }),
        ],
        challenges: [
          makeChallenge(callerChallenge, CALLER_ID),
          makeChallenge(alphaChallenge, alphaId),
          makeChallenge(zuluChallenge, zuluId),
        ],
        dayScores: [
          makeDayScore(
            'score-caller',
            callerChallenge,
            CALLER_ID,
            '2026-06-15',
            5,
          ),
          makeDayScore(
            'score-alpha',
            alphaChallenge,
            alphaId,
            '2026-06-15',
            10,
            {
              breakdown: {
                allScoredLogged: true,
                proofUrl: '/secret/proof.jpg',
                proof: { photo: 'hidden' },
                aiVerdict: 'PASS',
              },
            },
          ),
          makeDayScore('score-zulu', zuluChallenge, zuluId, '2026-06-15', 15),
        ],
      });

      const result = await getLeaderboardSeries(
        prisma,
        CALLER_ID,
        'today',
        'daily',
      );
      const json = JSON.stringify(result);

      expect(result.members[0]?.isSelf).toBe(true);
      expect(result.members[0]?.id).toBe(CALLER_ID);
      expect(result.members.slice(1).map((member) => member.name)).toEqual([
        'Alpha',
        'Zulu',
      ]);
      expect(json).not.toContain('proofUrl');
      expect(json).not.toContain('proof');
      expect(json).not.toContain('aiVerdict');
      expect(json).not.toContain('photo');
      expect(() => assertLeaderboardSeriesPrivacy(result)).not.toThrow();
    });
  });
});
