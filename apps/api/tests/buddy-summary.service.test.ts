import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BuddySummaryService } from '../src/cron/buddy-summary.service';
import { WeeklyRecapService } from '../src/cron/weekly-recap.service';
import { getUserLocalDate } from '../src/utils/day-window';
import { BUDDY_SUMMARY_KIND } from '../src/utils/buddy-summary-eligibility';

const TZ = 'UTC';
const SUNDAY_10 = new Date('2026-06-28T10:00:00.000Z');
const LOG_DATE = new Date('2026-06-22T00:00:00.000Z');

type UserRow = {
  id: string;
  name: string;
  phone: string | null;
  whatsappOptIn: boolean;
  timezone: string;
  weeklyRecapOptIn: boolean;
  groupId: string | null;
  recapFocus?: unknown;
  group: { challengeTimezone: string | null } | null;
};

type ChallengeRow = {
  id: string;
  userId: string;
  startDate: Date;
  endDate: Date | null;
  lengthDays: number;
  currentDay: number;
  isActive: boolean;
  stoppedAt: Date | null;
};

type PairRow = {
  groupId: string;
  requesterId: string;
  addresseeId: string;
  status: string;
};

function d(iso: string): Date {
  return getUserLocalDate(TZ, new Date(iso));
}

function createFakePrisma(seed: {
  users: UserRow[];
  challenges: ChallengeRow[];
  pairs: PairRow[];
  activityLogs?: Array<{
    challengeId: string;
    activityId: string;
    date: Date;
    state: string | null;
  }>;
  dayScores?: Array<{
    challengeId: string;
    date: Date;
    netXp: number;
    breakdown: unknown;
    finalized: boolean;
  }>;
  reminderLogs?: Array<{
    userId: string;
    date: Date;
    kind: string;
    status: string;
    sentAt?: Date;
  }>;
}) {
  const activityLogs = seed.activityLogs ?? [];
  const dayScores = seed.dayScores ?? [];
  const reminderLogs = seed.reminderLogs ?? [];
  const usersById = new Map(seed.users.map((u) => [u.id, u]));

  return {
    accountabilityPair: {
      findMany: async () =>
        seed.pairs
          .filter((p) => p.status === 'ACTIVE')
          .map((p) => ({
            groupId: p.groupId,
            requester: pairUser(usersById.get(p.requesterId)!),
            addressee: pairUser(usersById.get(p.addresseeId)!),
          })),
    },
    user: {
      findMany: async ({ where }: { where?: { id?: { in: string[] } } }) => {
        if (where?.id?.in) {
          return seed.users
            .filter((u) => where.id!.in.includes(u.id))
            .map((u) => ({ id: u.id, groupId: u.groupId }));
        }
        return seed.users;
      },
    },
    challenge: {
      findMany: async ({ where }: { where: { userId: { in: string[] } } }) =>
        seed.challenges.filter((c) => where.userId.in.includes(c.userId)),
    },
    activityLog: {
      groupBy: async ({
        where,
      }: {
        where: { challengeId: { in: string[] } };
      }) =>
        where.challengeId.in.map((challengeId) => {
          const dates = activityLogs
            .filter((log) => log.challengeId === challengeId)
            .map((log) => log.date);
          const max = dates.length
            ? new Date(Math.max(...dates.map((date) => date.getTime())))
            : null;
          return { challengeId, _max: { date: max } };
        }),
      findMany: async ({
        where,
      }: {
        where: { challengeId: { in: string[] }; date?: { gte: Date } };
      }) =>
        activityLogs.filter((log) => {
          if (!where.challengeId.in.includes(log.challengeId)) return false;
          if (where.date?.gte && log.date.getTime() < where.date.gte.getTime())
            return false;
          return true;
        }),
    },
    dayScore: {
      findMany: async ({
        where,
      }: {
        where: { challengeId: { in: string[] }; date?: { gte: Date } };
      }) =>
        dayScores.filter((score) => {
          if (!where.challengeId.in.includes(score.challengeId)) return false;
          if (
            where.date?.gte &&
            score.date.getTime() < where.date.gte.getTime()
          )
            return false;
          return true;
        }),
    },
    activity: {
      findMany: async () => [],
    },
    reminderLog: {
      findMany: async ({
        where,
      }: {
        where: {
          userId?: { in: string[] };
          kind?: string;
          status?: string;
          date?: { in: Date[] };
        };
      }) =>
        reminderLogs.filter((log) => {
          if (where.userId?.in && !where.userId.in.includes(log.userId))
            return false;
          if (where.kind && log.kind !== where.kind) return false;
          if (where.status && log.status !== where.status) return false;
          if (
            where.date?.in &&
            !where.date.in.some((x) => x.getTime() === log.date.getTime())
          )
            return false;
          return true;
        }),
    },
  };
}

function pairUser(u: UserRow) {
  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
    whatsappOptIn: u.whatsappOptIn,
    timezone: u.timezone,
    groupId: u.groupId,
    group: u.group,
  };
}

function makeService(prisma: unknown, configured: boolean, trySend: unknown) {
  const evolution = { isConfigured: () => configured } as never;
  const recap = new WeeklyRecapService(
    prisma as never,
    evolution,
    {} as never,
    { get: () => undefined } as never,
  );
  return new BuddySummaryService(
    prisma as never,
    evolution,
    { trySendBuddySummary: trySend } as never,
    recap,
  );
}

const alex: UserRow = {
  id: 'u1',
  name: 'Alex',
  phone: '+15550000001',
  whatsappOptIn: true,
  weeklyRecapOptIn: true,
  timezone: TZ,
  groupId: 'g1',
  group: { challengeTimezone: TZ },
};
const bo: UserRow = {
  id: 'u2',
  name: 'Bo',
  phone: '+15550000002',
  whatsappOptIn: true,
  weeklyRecapOptIn: true,
  timezone: TZ,
  groupId: 'g1',
  group: { challengeTimezone: TZ },
};

const challengeAlex: ChallengeRow = {
  id: 'c1',
  userId: 'u1',
  startDate: d('2026-06-01T00:00:00.000Z'),
  endDate: d('2026-06-30T00:00:00.000Z'),
  lengthDays: 30,
  currentDay: 20,
  isActive: true,
  stoppedAt: null,
};
const challengeBo: ChallengeRow = { ...challengeAlex, id: 'c2', userId: 'u2' };

function activeWeekSeed() {
  return {
    users: [alex, bo],
    challenges: [challengeAlex, challengeBo],
    pairs: [
      { groupId: 'g1', requesterId: 'u1', addresseeId: 'u2', status: 'ACTIVE' },
    ] as PairRow[],
    activityLogs: [
      {
        challengeId: 'c1',
        activityId: 'a1',
        date: d('2026-06-27'),
        state: 'DONE',
      },
      {
        challengeId: 'c2',
        activityId: 'a1',
        date: d('2026-06-27'),
        state: 'DONE',
      },
    ],
    dayScores: [
      {
        challengeId: 'c1',
        date: d('2026-06-27'),
        netXp: 50,
        finalized: true,
        breakdown: { allScoredLogged: true },
      },
      {
        challengeId: 'c2',
        date: d('2026-06-27'),
        netXp: 50,
        finalized: true,
        breakdown: { allScoredLogged: true },
      },
    ],
  };
}

describe('BuddySummaryService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SUNDAY_10);
  });

  it('no-ops when Evolution API is not configured', async () => {
    const trySend = vi.fn();
    const prisma = createFakePrisma(activeWeekSeed());
    await makeService(prisma, false, trySend).processBuddySummaries();
    expect(trySend).not.toHaveBeenCalled();
  });

  it('sends each member a supportive summary of the other on Sunday', async () => {
    const trySend = vi.fn();
    const prisma = createFakePrisma(activeWeekSeed());
    await makeService(prisma, true, trySend).processBuddySummaries();

    expect(trySend).toHaveBeenCalledTimes(2);
    const calls = trySend.mock.calls.map((c) => c[0]);
    const toAlex = calls.find((x) => x.recipientId === 'u1');
    const toBo = calls.find((x) => x.recipientId === 'u2');
    expect(toAlex.context.partnerName).toBe('Bo');
    expect(toAlex.context.recipientName).toBe('Alex');
    expect(toAlex.logDate).toEqual(LOG_DATE);
    expect(toAlex.context.rollup.daysShowedUp).toBe(1);
    expect(toBo.context.partnerName).toBe('Alex');
  });

  it('dedupes when BUDDY_SUMMARY already SENT for a recipient this week', async () => {
    const trySend = vi.fn();
    const prisma = createFakePrisma({
      ...activeWeekSeed(),
      reminderLogs: [
        {
          userId: 'u1',
          date: LOG_DATE,
          kind: BUDDY_SUMMARY_KIND,
          status: 'SENT',
        },
      ],
    });
    await makeService(prisma, true, trySend).processBuddySummaries();

    expect(trySend).toHaveBeenCalledTimes(1);
    expect(trySend.mock.calls[0][0].recipientId).toBe('u2');
  });

  it('does not summarize a dormant partner and defers dormant recipients to winback', async () => {
    const trySend = vi.fn();
    // Bo's only activity is 8 days before Sunday → dormant subject and recipient.
    const seed = activeWeekSeed();
    seed.activityLogs = [
      {
        challengeId: 'c1',
        activityId: 'a1',
        date: d('2026-06-27'),
        state: 'DONE',
      },
      {
        challengeId: 'c2',
        activityId: 'a1',
        date: d('2026-06-20'),
        state: 'DONE',
      },
    ];
    seed.dayScores = seed.dayScores.filter((s) => s.challengeId === 'c1');
    const prisma = createFakePrisma(seed);
    await makeService(prisma, true, trySend).processBuddySummaries();

    // Alex (active recipient) gets nothing because partner Bo is dormant.
    // Bo (dormant recipient) is skipped for winback precedence.
    expect(trySend).not.toHaveBeenCalled();
  });

  it('skips a pair when a member has left the group', async () => {
    const trySend = vi.fn();
    const seed = activeWeekSeed();
    seed.users = [alex, { ...bo, groupId: 'g2' }];
    const prisma = createFakePrisma(seed);
    await makeService(prisma, true, trySend).processBuddySummaries();
    expect(trySend).not.toHaveBeenCalled();
  });

  it('does not load batch context outside the Sunday send window', async () => {
    vi.setSystemTime(new Date('2026-06-28T12:00:00.000Z'));
    const trySend = vi.fn();
    const prisma = createFakePrisma(activeWeekSeed());
    const challengeSpy = vi.spyOn(prisma.challenge, 'findMany');
    await makeService(prisma, true, trySend).processBuddySummaries();
    expect(challengeSpy).not.toHaveBeenCalled();
    expect(trySend).not.toHaveBeenCalled();
  });
});
