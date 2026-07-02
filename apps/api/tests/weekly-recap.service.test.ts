import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WeeklyRecapService } from '../src/cron/weekly-recap.service';
import { getUserLocalDate } from '../src/utils/day-window';
import { WINBACK_KIND } from '../src/utils/winback-dormancy';
import { WEEKLY_RECAP_KIND } from '../src/utils/weekly-recap-eligibility';

const TZ = 'UTC';
const SUNDAY_10 = new Date('2026-06-28T10:00:00.000Z');
const LOG_DATE = new Date('2026-06-22T00:00:00.000Z');

type UserRow = {
  id: string;
  name: string;
  phone: string | null;
  timezone: string;
  whatsappOptIn: boolean;
  weeklyRecapOptIn: boolean;
  groupId: string | null;
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

function createFakePrisma(seed: {
  users: UserRow[];
  challenges?: ChallengeRow[];
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
  const challenges = seed.challenges ?? [];
  const activityLogs = seed.activityLogs ?? [];
  const dayScores = seed.dayScores ?? [];
  const reminderLogs = new Map(
    (seed.reminderLogs ?? []).map((log) => [
      `${log.userId}:${log.date.getTime()}:${log.kind}`,
      log,
    ]),
  );

  return {
    user: {
      findMany: async ({
        where,
      }: {
        where?: {
          phone?: { not: null };
          whatsappOptIn?: boolean;
          weeklyRecapOptIn?: boolean;
          id?: { in: string[] };
        };
      }) => {
        if (where?.id?.in) {
          return seed.users.filter((user) => where.id!.in.includes(user.id));
        }
        return seed.users.filter((user) => {
          if (where?.phone?.not === null && user.phone === null) return false;
          if (
            where?.whatsappOptIn !== undefined &&
            user.whatsappOptIn !== where.whatsappOptIn
          ) {
            return false;
          }
          if (
            where?.weeklyRecapOptIn !== undefined &&
            user.weeklyRecapOptIn !== where.weeklyRecapOptIn
          ) {
            return false;
          }
          return true;
        });
      },
    },
    challenge: {
      findMany: async () => challenges,
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
        where: {
          challengeId: { in: string[] };
          date?: { gte: Date };
        };
      }) =>
        activityLogs.filter((log) => {
          if (!where.challengeId.in.includes(log.challengeId)) {
            return false;
          }
          if (
            where.date?.gte &&
            log.date.getTime() < where.date.gte.getTime()
          ) {
            return false;
          }
          return true;
        }),
    },
    dayScore: {
      findMany: async ({
        where,
      }: {
        where: {
          challengeId: { in: string[] };
          date?: { gte: Date };
        };
      }) =>
        dayScores.filter((score) => {
          if (!where.challengeId.in.includes(score.challengeId)) {
            return false;
          }
          if (
            where.date?.gte &&
            score.date.getTime() < where.date.gte.getTime()
          ) {
            return false;
          }
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
        [...reminderLogs.values()].filter((log) => {
          if (where.userId?.in && !where.userId.in.includes(log.userId)) {
            return false;
          }
          if (where.kind && log.kind !== where.kind) return false;
          if (where.status && log.status !== where.status) return false;
          if (
            where.date?.in &&
            !where.date.in.some((date) => date.getTime() === log.date.getTime())
          ) {
            return false;
          }
          return true;
        }),
    },
  };
}

const challenge: ChallengeRow = {
  id: 'c1',
  userId: 'u1',
  startDate: getUserLocalDate(TZ, new Date('2026-06-01T00:00:00.000Z')),
  endDate: getUserLocalDate(TZ, new Date('2026-06-30T00:00:00.000Z')),
  lengthDays: 30,
  currentDay: 20,
  isActive: true,
  stoppedAt: null,
};

const activeUser: UserRow = {
  id: 'u1',
  name: 'Alex',
  phone: '+15551234567',
  timezone: TZ,
  whatsappOptIn: true,
  weeklyRecapOptIn: true,
  groupId: null,
  group: null,
};

describe('WeeklyRecapService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SUNDAY_10);
  });

  it('no-ops when Evolution API is not configured', async () => {
    const trySendWeeklyRecap = vi.fn();
    const prisma = createFakePrisma({
      users: [activeUser],
      challenges: [challenge],
      activityLogs: [
        {
          challengeId: 'c1',
          activityId: 'a1',
          date: getUserLocalDate(TZ, new Date('2026-06-27T00:00:00.000Z')),
          state: 'DONE',
        },
      ],
    });

    const service = new WeeklyRecapService(
      prisma as never,
      { isConfigured: () => false } as never,
      { trySendWeeklyRecap } as never,
    );

    await service.processWeeklyRecaps();
    expect(trySendWeeklyRecap).not.toHaveBeenCalled();
  });

  it('sends recap on Sunday for active eligible users', async () => {
    const trySendWeeklyRecap = vi.fn();
    const prisma = createFakePrisma({
      users: [activeUser],
      challenges: [challenge],
      activityLogs: [
        {
          challengeId: 'c1',
          activityId: 'a1',
          date: getUserLocalDate(TZ, new Date('2026-06-27T00:00:00.000Z')),
          state: 'DONE',
        },
      ],
      dayScores: [
        {
          challengeId: 'c1',
          date: getUserLocalDate(TZ, new Date('2026-06-27T00:00:00.000Z')),
          netXp: 50,
          finalized: true,
          breakdown: { allScoredLogged: true },
        },
      ],
    });

    const service = new WeeklyRecapService(
      prisma as never,
      { isConfigured: () => true } as never,
      { trySendWeeklyRecap } as never,
    );

    await service.processWeeklyRecaps();

    expect(trySendWeeklyRecap).toHaveBeenCalledTimes(1);
    expect(trySendWeeklyRecap).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        logDate: LOG_DATE,
        context: expect.objectContaining({
          name: 'Alex',
          rollup: expect.objectContaining({
            daysShowedUp: 1,
            eligibleDays: 6,
          }),
        }),
      }),
    );
  });

  it('does not load batch context outside the Sunday send window', async () => {
    vi.setSystemTime(new Date('2026-06-28T11:00:00.000Z'));
    const trySendWeeklyRecap = vi.fn();
    const findManySpy = vi.fn(async () => []);
    const prisma = {
      ...createFakePrisma({
        users: [activeUser],
        challenges: [challenge],
      }),
      challenge: { findMany: findManySpy },
    };

    const service = new WeeklyRecapService(
      prisma as never,
      { isConfigured: () => true } as never,
      { trySendWeeklyRecap } as never,
    );

    await service.processWeeklyRecaps();
    expect(findManySpy).not.toHaveBeenCalled();
    expect(trySendWeeklyRecap).not.toHaveBeenCalled();
  });

  it('skips dormant users in favor of winback', async () => {
    const trySendWeeklyRecap = vi.fn();
    const prisma = createFakePrisma({
      users: [activeUser],
      challenges: [challenge],
      activityLogs: [
        {
          challengeId: 'c1',
          activityId: 'a1',
          date: getUserLocalDate(TZ, new Date('2026-06-25T00:00:00.000Z')),
          state: 'DONE',
        },
      ],
    });

    const service = new WeeklyRecapService(
      prisma as never,
      { isConfigured: () => true } as never,
      { trySendWeeklyRecap } as never,
    );

    await service.processWeeklyRecaps();
    expect(trySendWeeklyRecap).not.toHaveBeenCalled();
  });

  it('excludes weeklyRecapOptIn false users at query time', async () => {
    const trySendWeeklyRecap = vi.fn();
    const prisma = createFakePrisma({
      users: [{ ...activeUser, weeklyRecapOptIn: false }],
      challenges: [challenge],
      activityLogs: [
        {
          challengeId: 'c1',
          activityId: 'a1',
          date: getUserLocalDate(TZ, new Date('2026-06-27T00:00:00.000Z')),
          state: 'DONE',
        },
      ],
    });

    const service = new WeeklyRecapService(
      prisma as never,
      { isConfigured: () => true } as never,
      { trySendWeeklyRecap } as never,
    );

    await service.processWeeklyRecaps();
    expect(trySendWeeklyRecap).not.toHaveBeenCalled();
  });

  it('does not block other reminder kinds', async () => {
    const trySendWeeklyRecap = vi.fn();
    const prisma = createFakePrisma({
      users: [activeUser],
      challenges: [challenge],
      activityLogs: [
        {
          challengeId: 'c1',
          activityId: 'a1',
          date: getUserLocalDate(TZ, new Date('2026-06-27T00:00:00.000Z')),
          state: 'DONE',
        },
      ],
      reminderLogs: [
        {
          userId: 'u1',
          date: getUserLocalDate(TZ, new Date('2026-06-28T00:00:00.000Z')),
          kind: 'MORNING',
          status: 'SENT',
        },
      ],
    });

    const service = new WeeklyRecapService(
      prisma as never,
      { isConfigured: () => true } as never,
      { trySendWeeklyRecap } as never,
    );

    await service.processWeeklyRecaps();
    expect(trySendWeeklyRecap).toHaveBeenCalledTimes(1);
  });

  it('dedupes when WEEKLY_RECAP already SENT for the ISO week', async () => {
    const trySendWeeklyRecap = vi.fn();
    const prisma = createFakePrisma({
      users: [activeUser],
      challenges: [challenge],
      activityLogs: [
        {
          challengeId: 'c1',
          activityId: 'a1',
          date: getUserLocalDate(TZ, new Date('2026-06-27T00:00:00.000Z')),
          state: 'DONE',
        },
      ],
      reminderLogs: [
        {
          userId: 'u1',
          date: LOG_DATE,
          kind: WEEKLY_RECAP_KIND,
          status: 'SENT',
        },
      ],
    });

    const service = new WeeklyRecapService(
      prisma as never,
      { isConfigured: () => true } as never,
      { trySendWeeklyRecap } as never,
    );

    await service.processWeeklyRecaps();
    expect(trySendWeeklyRecap).not.toHaveBeenCalled();
  });

  it('ignores WINBACK logs for weekly dedupe', async () => {
    const trySendWeeklyRecap = vi.fn();
    const prisma = createFakePrisma({
      users: [activeUser],
      challenges: [challenge],
      activityLogs: [
        {
          challengeId: 'c1',
          activityId: 'a1',
          date: getUserLocalDate(TZ, new Date('2026-06-27T00:00:00.000Z')),
          state: 'DONE',
        },
      ],
      reminderLogs: [
        {
          userId: 'u1',
          date: getUserLocalDate(TZ, new Date('2026-06-28T00:00:00.000Z')),
          kind: WINBACK_KIND,
          status: 'SENT',
          sentAt: new Date('2026-06-28T08:00:00.000Z'),
        },
      ],
    });

    const service = new WeeklyRecapService(
      prisma as never,
      { isConfigured: () => true } as never,
      { trySendWeeklyRecap } as never,
    );

    await service.processWeeklyRecaps();
    expect(trySendWeeklyRecap).toHaveBeenCalledTimes(1);
  });
});
