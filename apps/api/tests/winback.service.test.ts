import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WinbackService } from '../src/cron/winback.service';
import { getUserLocalDate } from '../src/utils/day-window';
import { WINBACK_KIND } from '../src/utils/winback-dormancy';

const TZ = 'UTC';

type ReminderLogRow = {
  id: string;
  userId: string;
  date: Date;
  kind: string;
  status: string;
  sentAt: Date;
};

type ActivityLogRow = {
  challengeId: string;
  date: Date;
  userId?: string;
  createdAt?: Date | null;
  state?: string | null;
  tier?: string | null;
  value?: number | null;
  subPoints?: unknown;
};

function reminderLogKey(userId: string, date: Date, kind: string): string {
  return `${userId}:${date.getTime()}:${kind}`;
}

function createWinbackFakePrisma(seed: {
  users: Array<{
    id: string;
    name: string;
    phone: string | null;
    timezone: string;
    reminderTime: string | null;
    reminderAdaptive?: boolean;
    whatsappOptIn: boolean;
    challengeTimezone?: string | null;
    challenge?: {
      id: string;
      startDate: Date;
      endDate: Date | null;
      lengthDays: number;
      currentDay: number;
      isActive: boolean;
      stoppedAt: Date | null;
    };
  }>;
  activityLogs?: ActivityLogRow[];
  reminderLogs?: ReminderLogRow[];
}) {
  const users = seed.users.map((user) => ({
    ...user,
    reminderAdaptive: user.reminderAdaptive ?? true,
    group: user.challengeTimezone
      ? { challengeTimezone: user.challengeTimezone }
      : null,
    challenges: user.challenge ? [user.challenge] : [],
  }));

  const reminderLogs = new Map(
    (seed.reminderLogs ?? []).map((log) => [
      reminderLogKey(log.userId, log.date, log.kind),
      { ...log },
    ]),
  );

  const activityByChallenge = new Map<string, Date>();
  for (const log of seed.activityLogs ?? []) {
    const existing = activityByChallenge.get(log.challengeId);
    if (!existing || log.date > existing) {
      activityByChallenge.set(log.challengeId, log.date);
    }
  }

  const prisma = {
    user: {
      findMany: async ({
        where,
      }: {
        where?: {
          phone?: { not: null };
          whatsappOptIn?: boolean;
        };
      }) =>
        users.filter((user) => {
          if (where?.phone?.not === null && user.phone === null) {
            return false;
          }
          if (
            where?.whatsappOptIn !== undefined &&
            user.whatsappOptIn !== where.whatsappOptIn
          ) {
            return false;
          }
          if (!user.challenges?.[0]?.isActive) {
            return false;
          }
          return true;
        }),
    },
    activityLog: {
      groupBy: async ({
        where,
      }: {
        where: { challengeId: { in: string[] } };
      }) =>
        where.challengeId.in.map((challengeId) => ({
          challengeId,
          _max: { date: activityByChallenge.get(challengeId) ?? null },
        })),
      findMany: async ({
        where,
      }: {
        where?: {
          userId?: { in?: string[] };
          date?: { gte?: Date };
        };
      } = {}) =>
        (seed.activityLogs ?? []).filter((log) => {
          if (where?.userId?.in) {
            if (!log.userId || !where.userId.in.includes(log.userId)) {
              return false;
            }
          }
          if (
            where?.date?.gte &&
            log.date.getTime() < where.date.gte.getTime()
          ) {
            return false;
          }
          return Boolean(log.userId);
        }),
    },
    reminderLog: {
      findMany: async ({
        where,
      }: {
        where: {
          userId?: { in: string[] };
          kind?: string;
          status?: string;
        };
      }) =>
        [...reminderLogs.values()].filter((log) => {
          if (where.userId?.in && !where.userId.in.includes(log.userId)) {
            return false;
          }
          if (where.kind && log.kind !== where.kind) {
            return false;
          }
          if (where.status && log.status !== where.status) {
            return false;
          }
          return true;
        }),
      findUnique: async ({
        where,
      }: {
        where: {
          userId_date_kind: { userId: string; date: Date; kind: string };
        };
      }) => {
        const key = reminderLogKey(
          where.userId_date_kind.userId,
          where.userId_date_kind.date,
          where.userId_date_kind.kind,
        );
        return reminderLogs.get(key) ?? null;
      },
      findFirst: async ({
        where,
      }: {
        where: {
          userId?: string;
          date?: Date;
          kind?: string | { in: string[] };
          status?: string;
        };
      }) => {
        for (const log of reminderLogs.values()) {
          if (where.userId && log.userId !== where.userId) continue;
          if (where.date && log.date.getTime() !== where.date.getTime()) {
            continue;
          }
          if (typeof where.kind === 'string' && log.kind !== where.kind) {
            continue;
          }
          if (
            where.kind &&
            typeof where.kind === 'object' &&
            !where.kind.in.includes(log.kind)
          ) {
            continue;
          }
          if (where.status && log.status !== where.status) continue;
          return log;
        }
        return null;
      },
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: {
          userId_date_kind: { userId: string; date: Date; kind: string };
        };
        create: Omit<ReminderLogRow, 'id' | 'sentAt'> & { sentAt?: Date };
        update: Partial<ReminderLogRow>;
      }) => {
        const key = reminderLogKey(
          where.userId_date_kind.userId,
          where.userId_date_kind.date,
          where.userId_date_kind.kind,
        );
        const existing = reminderLogs.get(key);
        if (existing) {
          const updated = { ...existing, ...update };
          reminderLogs.set(key, updated);
          return updated;
        }
        const row: ReminderLogRow = {
          id: `log-${reminderLogs.size}`,
          sentAt: create.sentAt ?? new Date(),
          ...create,
        };
        reminderLogs.set(key, row);
        return row;
      },
    },
  };

  return { prisma, reminderLogs };
}

const challengeStart = getUserLocalDate(
  TZ,
  new Date('2026-06-01T00:00:00.000Z'),
);
const challenge = {
  id: 'c1',
  startDate: challengeStart,
  endDate: getUserLocalDate(TZ, new Date('2026-06-30T00:00:00.000Z')),
  lengthDays: 30,
  currentDay: 15,
  isActive: true,
  stoppedAt: null,
};

describe('WinbackService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T08:00:00.000Z'));
  });

  it('no-ops when Evolution API is not configured', async () => {
    const trySendWinback = vi.fn();
    const { prisma } = createWinbackFakePrisma({
      users: [
        {
          id: 'u1',
          name: 'Alex',
          phone: '+15551234567',
          timezone: TZ,
          reminderTime: '08:00',
          whatsappOptIn: true,
          challenge,
        },
      ],
    });

    const service = new WinbackService(
      prisma as never,
      { isConfigured: () => false, sendText: vi.fn() } as never,
      { trySendWinback } as never,
    );

    await service.processWinbacks();
    expect(trySendWinback).not.toHaveBeenCalled();
  });

  it('sends win-back when dormant 3+ days in morning window', async () => {
    const trySendWinback = vi.fn();
    const lastLogDate = getUserLocalDate(
      TZ,
      new Date('2026-06-12T00:00:00.000Z'),
    );

    const { prisma } = createWinbackFakePrisma({
      users: [
        {
          id: 'u1',
          name: 'Alex',
          phone: '+15551234567',
          timezone: TZ,
          reminderTime: '08:00',
          whatsappOptIn: true,
          challenge,
        },
      ],
      activityLogs: [{ challengeId: 'c1', date: lastLogDate }],
    });

    const service = new WinbackService(
      prisma as never,
      { isConfigured: () => true, sendText: vi.fn() } as never,
      { trySendWinback } as never,
    );

    await service.processWinbacks();

    expect(trySendWinback).toHaveBeenCalledTimes(1);
    expect(trySendWinback).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        context: expect.objectContaining({ dormantDays: 3 }),
      }),
    );
  });

  it('does not send when only 2 dormant days', async () => {
    const trySendWinback = vi.fn();
    const lastLogDate = getUserLocalDate(
      TZ,
      new Date('2026-06-13T00:00:00.000Z'),
    );

    const { prisma } = createWinbackFakePrisma({
      users: [
        {
          id: 'u1',
          name: 'Alex',
          phone: '+15551234567',
          timezone: TZ,
          reminderTime: '08:00',
          whatsappOptIn: true,
          challenge,
        },
      ],
      activityLogs: [{ challengeId: 'c1', date: lastLogDate }],
    });

    const service = new WinbackService(
      prisma as never,
      { isConfigured: () => true, sendText: vi.fn() } as never,
      { trySendWinback } as never,
    );

    await service.processWinbacks();
    expect(trySendWinback).not.toHaveBeenCalled();
  });

  it('skips users without phone or opt-in', async () => {
    const trySendWinback = vi.fn();
    const { prisma } = createWinbackFakePrisma({
      users: [
        {
          id: 'u1',
          name: 'Alex',
          phone: null,
          timezone: TZ,
          reminderTime: '08:00',
          whatsappOptIn: true,
          challenge,
        },
        {
          id: 'u2',
          name: 'Blair',
          phone: '+15559876543',
          timezone: TZ,
          reminderTime: '08:00',
          whatsappOptIn: false,
          challenge: { ...challenge, id: 'c2' },
        },
      ],
    });

    const service = new WinbackService(
      prisma as never,
      { isConfigured: () => true, sendText: vi.fn() } as never,
      { trySendWinback } as never,
    );

    await service.processWinbacks();
    expect(trySendWinback).not.toHaveBeenCalled();
  });

  it('does not send when another reminder already sent today', async () => {
    const trySendWinback = vi.fn();
    const localDate = getUserLocalDate(TZ);
    const lastLogDate = getUserLocalDate(
      TZ,
      new Date('2026-06-12T00:00:00.000Z'),
    );

    const { prisma } = createWinbackFakePrisma({
      users: [
        {
          id: 'u1',
          name: 'Alex',
          phone: '+15551234567',
          timezone: TZ,
          reminderTime: '08:00',
          whatsappOptIn: true,
          challenge,
        },
      ],
      activityLogs: [{ challengeId: 'c1', date: lastLogDate }],
      reminderLogs: [
        {
          id: 'morning-1',
          userId: 'u1',
          date: localDate,
          kind: 'MORNING',
          status: 'SENT',
          sentAt: new Date(),
        },
      ],
    });

    const service = new WinbackService(
      prisma as never,
      { isConfigured: () => true, sendText: vi.fn() } as never,
      { trySendWinback } as never,
    );

    await service.processWinbacks();
    expect(trySendWinback).not.toHaveBeenCalled();
  });

  it('defers other reminders during actionable morning window when eligible', async () => {
    const lastLogDate = getUserLocalDate(
      TZ,
      new Date('2026-06-12T00:00:00.000Z'),
    );
    const { prisma } = createWinbackFakePrisma({ users: [] });

    const service = new WinbackService(
      prisma as never,
      { isConfigured: () => true, sendText: vi.fn() } as never,
      { trySendWinback: vi.fn() } as never,
    );

    const shouldDefer = service.shouldDeferRemindersForUser({
      userId: 'u1',
      challengeTimezone: TZ,
      reminderTime: '08:00',
      challenge,
      lastActivityDate: lastLogDate,
      lastWinbackSentAt: null,
      winbackLogToday: null,
    });

    expect(shouldDefer).toBe(true);
  });

  it('does not defer after morning catch-up closes without SENT', async () => {
    vi.setSystemTime(new Date('2026-06-15T09:00:00.000Z'));
    const lastLogDate = getUserLocalDate(
      TZ,
      new Date('2026-06-12T00:00:00.000Z'),
    );
    const { prisma } = createWinbackFakePrisma({ users: [] });

    const service = new WinbackService(
      prisma as never,
      { isConfigured: () => true, sendText: vi.fn() } as never,
      { trySendWinback: vi.fn() } as never,
    );

    const shouldDefer = service.shouldDeferRemindersForUser({
      userId: 'u1',
      challengeTimezone: TZ,
      reminderTime: '08:00',
      challenge,
      lastActivityDate: lastLogDate,
      lastWinbackSentAt: null,
      winbackLogToday: null,
    });

    expect(shouldDefer).toBe(false);
  });

  it('does not defer after FAILED win-back once retry window closes', async () => {
    vi.setSystemTime(new Date('2026-06-15T08:16:00.000Z'));
    const lastLogDate = getUserLocalDate(
      TZ,
      new Date('2026-06-12T00:00:00.000Z'),
    );
    const { prisma } = createWinbackFakePrisma({ users: [] });

    const service = new WinbackService(
      prisma as never,
      { isConfigured: () => true, sendText: vi.fn() } as never,
      { trySendWinback: vi.fn() } as never,
    );

    const shouldDefer = service.shouldDeferRemindersForUser({
      userId: 'u1',
      challengeTimezone: TZ,
      reminderTime: '08:00',
      challenge,
      lastActivityDate: lastLogDate,
      lastWinbackSentAt: null,
      winbackLogToday: { status: 'FAILED' },
      now: new Date('2026-06-15T08:16:00.000Z'),
    });

    expect(shouldDefer).toBe(false);
  });

  it('does not defer when recovery window (2 dormant days)', async () => {
    const lastLogDate = getUserLocalDate(
      TZ,
      new Date('2026-06-13T00:00:00.000Z'),
    );
    const { prisma } = createWinbackFakePrisma({ users: [] });

    const service = new WinbackService(
      prisma as never,
      { isConfigured: () => true, sendText: vi.fn() } as never,
      { trySendWinback: vi.fn() } as never,
    );

    const shouldDefer = service.shouldDeferRemindersForUser({
      userId: 'u1',
      challengeTimezone: TZ,
      reminderTime: '08:00',
      challenge,
      lastActivityDate: lastLogDate,
      lastWinbackSentAt: null,
      winbackLogToday: null,
    });

    expect(shouldDefer).toBe(false);
  });

  it('suppresses repeat win-back within 7 days', async () => {
    const trySendWinback = vi.fn();
    const lastLogDate = getUserLocalDate(
      TZ,
      new Date('2026-06-01T00:00:00.000Z'),
    );

    const { prisma } = createWinbackFakePrisma({
      users: [
        {
          id: 'u1',
          name: 'Alex',
          phone: '+15551234567',
          timezone: TZ,
          reminderTime: '08:00',
          whatsappOptIn: true,
          challenge,
        },
      ],
      activityLogs: [{ challengeId: 'c1', date: lastLogDate }],
      reminderLogs: [
        {
          id: 'wb-1',
          userId: 'u1',
          date: getUserLocalDate(TZ, new Date('2026-06-10T00:00:00.000Z')),
          kind: WINBACK_KIND,
          status: 'SENT',
          sentAt: new Date('2026-06-10T12:00:00.000Z'),
        },
      ],
    });

    const service = new WinbackService(
      prisma as never,
      { isConfigured: () => true, sendText: vi.fn() } as never,
      { trySendWinback } as never,
    );

    await service.processWinbacks();
    expect(trySendWinback).not.toHaveBeenCalled();
  });

  function buildAdaptiveTimingLogs(
    userId: string,
    days: number,
    minuteOfDay: number,
    startDay = 10,
  ) {
    const hour = Math.floor(minuteOfDay / 60);
    const minute = minuteOfDay % 60;
    const logs: ActivityLogRow[] = [];
    for (let index = 0; index < days; index += 1) {
      const day = startDay + index;
      const dateKey = `2026-06-${String(day).padStart(2, '0')}`;
      logs.push({
        challengeId: 'c1',
        userId,
        date: new Date(`${dateKey}T00:00:00.000Z`),
        createdAt: new Date(
          `${dateKey}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`,
        ),
        state: 'DONE',
        tier: null,
        value: null,
        subPoints: null,
      });
    }
    return logs;
  }

  it('sends win-back once at adaptive effective time when shift is later', async () => {
    const trySendWinback = vi
      .fn()
      .mockImplementation(async ({ prisma, userId, localDate }) => {
        await prisma.reminderLog.upsert({
          where: {
            userId_date_kind: {
              userId,
              date: localDate,
              kind: WINBACK_KIND,
            },
          },
          create: {
            userId,
            date: localDate,
            kind: WINBACK_KIND,
            status: 'SENT',
          },
          update: { status: 'SENT' },
        });
      });
    const lastLogDate = getUserLocalDate(
      TZ,
      new Date('2026-06-12T00:00:00.000Z'),
    );

    const { prisma } = createWinbackFakePrisma({
      users: [
        {
          id: 'u1',
          name: 'Alex',
          phone: '+15551234567',
          timezone: TZ,
          reminderTime: '08:00',
          reminderAdaptive: true,
          whatsappOptIn: true,
          challenge,
        },
      ],
      activityLogs: [
        { challengeId: 'c1', date: lastLogDate },
        ...buildAdaptiveTimingLogs('u1', 5, 8 * 60 + 25, 8),
      ],
    });

    const service = new WinbackService(
      prisma as never,
      { isConfigured: () => true, sendText: vi.fn() } as never,
      { trySendWinback } as never,
    );

    vi.setSystemTime(new Date('2026-06-15T08:20:00.000Z'));
    await service.processWinbacks();
    expect(trySendWinback).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-06-15T08:25:00.000Z'));
    await service.processWinbacks();
    expect(trySendWinback).toHaveBeenCalledTimes(1);
  });

  it('sends win-back at adaptive effective time when shift is earlier than fixed', async () => {
    const trySendWinback = vi
      .fn()
      .mockImplementation(async ({ prisma, userId, localDate }) => {
        await prisma.reminderLog.upsert({
          where: {
            userId_date_kind: {
              userId,
              date: localDate,
              kind: WINBACK_KIND,
            },
          },
          create: {
            userId,
            date: localDate,
            kind: WINBACK_KIND,
            status: 'SENT',
          },
          update: { status: 'SENT' },
        });
      });
    const lastLogDate = getUserLocalDate(
      TZ,
      new Date('2026-06-12T00:00:00.000Z'),
    );

    const { prisma } = createWinbackFakePrisma({
      users: [
        {
          id: 'u1',
          name: 'Alex',
          phone: '+15551234567',
          timezone: TZ,
          reminderTime: '08:00',
          reminderAdaptive: true,
          whatsappOptIn: true,
          challenge,
        },
      ],
      activityLogs: [
        { challengeId: 'c1', date: lastLogDate },
        ...buildAdaptiveTimingLogs('u1', 5, 7 * 60 + 30, 8),
      ],
    });

    const service = new WinbackService(
      prisma as never,
      { isConfigured: () => true, sendText: vi.fn() } as never,
      { trySendWinback } as never,
    );

    vi.setSystemTime(new Date('2026-06-15T07:30:00.000Z'));
    await service.processWinbacks();
    expect(trySendWinback).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-06-15T08:00:00.000Z'));
    await service.processWinbacks();
    expect(trySendWinback).toHaveBeenCalledTimes(1);
  });
});
