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

  it('defers other reminders when win-back is eligible', async () => {
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

    const shouldDefer = await service.shouldDeferRemindersForUser({
      userId: 'u1',
      challengeTimezone: TZ,
      reminderTime: '08:00',
      challenge,
      lastActivityDate: lastLogDate,
      lastWinbackSentAt: null,
    });

    expect(shouldDefer).toBe(true);
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

    const shouldDefer = await service.shouldDeferRemindersForUser({
      userId: 'u1',
      challengeTimezone: TZ,
      reminderTime: '08:00',
      challenge,
      lastActivityDate: lastLogDate,
      lastWinbackSentAt: null,
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
});
