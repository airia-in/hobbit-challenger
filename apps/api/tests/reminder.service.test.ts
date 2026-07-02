import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isWithinLocalRetryWindow,
  ReminderService,
} from '../src/cron/reminder.service';
import type { ReminderContext } from '../src/whatsapp/reminder-context.service';
import { addLocalDays, parseLocalDateKey } from '../src/utils/day-window';
import { STREAK_FREEZE_CONSUMED_KIND } from '../src/whatsapp/streak-freeze-message.service';

type ReminderLogRow = {
  id: string;
  userId: string;
  date: Date;
  kind: string;
  status: string;
  sentAt: Date;
};

function reminderLogKey(userId: string, date: Date, kind: string): string {
  return `${userId}:${date.getTime()}:${kind}`;
}

function createReminderFakePrisma(seed: {
  users: Array<{
    id: string;
    name: string;
    phone: string | null;
    timezone: string;
    reminderTime: string | null;
    whatsappOptIn: boolean;
  }>;
  reminderLogs?: ReminderLogRow[];
}) {
  const users = [...seed.users];
  const reminderLogs = new Map(
    (seed.reminderLogs ?? []).map((log) => [
      reminderLogKey(log.userId, log.date, log.kind),
      { ...log },
    ]),
  );

  const prisma = {
    user: {
      findMany: async () => users,
    },
    reminderLog: {
      findFirst: async () => null,
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
      create: async ({
        data,
      }: {
        data: Omit<ReminderLogRow, 'id' | 'sentAt'> & { sentAt?: Date };
      }) => {
        const row: ReminderLogRow = {
          id: `log-${reminderLogs.size}`,
          sentAt: data.sentAt ?? new Date(),
          ...data,
        };
        reminderLogs.set(reminderLogKey(row.userId, row.date, row.kind), row);
        return row;
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
    challenge: {
      findFirst: async () => null,
    },
    activityLog: {
      aggregate: async () => ({ _max: { date: null } }),
    },
  };

  return { prisma, reminderLogs };
}

function createWinbackServiceMock(shouldDefer = false): {
  shouldDeferRemindersForUser: ReturnType<typeof vi.fn>;
  loadDeferBatchContext: ReturnType<typeof vi.fn>;
} {
  return {
    shouldDeferRemindersForUser: vi.fn().mockReturnValue(shouldDefer),
    loadDeferBatchContext: vi.fn().mockResolvedValue({
      challengeByUser: new Map(),
      lastActivityByChallenge: new Map(),
      lastWinbackByUser: new Map(),
      winbackLogTodayByUser: new Map(),
    }),
  };
}

function createReminderService(
  prisma: unknown,
  evolution: unknown,
  contextService: unknown,
  openAiReminder: unknown,
  winbackService?: {
    shouldDeferRemindersForUser: ReturnType<typeof vi.fn>;
    loadDeferBatchContext: ReturnType<typeof vi.fn>;
  },
): ReminderService {
  return new ReminderService(
    prisma as never,
    evolution as never,
    contextService as never,
    openAiReminder as never,
    (winbackService ?? createWinbackServiceMock()) as never,
  );
}

const defaultContext: ReminderContext = {
  name: 'Alex',
  dayNumber: 5,
  tasksDone: 1,
  tasksRemaining: 2,
  todayNetXp: 100,
  xpAtRisk: 50,
  rank: 1,
  totalXp: 500,
  topActivityStreak: 0,
  topActivityName: null,
  unloggedHabitNames: [],
  missedYesterday: false,
  recoveryEligible: false,
  recoveryBreakDate: null,
  challengeInRange: true,
  streakAtRisk: false,
  journeyMilestone: null,
  currentStreak: 0,
  longestStreak: 0,
  streakFreezesAvailable: 0,
};

describe('ReminderService', () => {
  const timezone = 'UTC';

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T08:00:00.000Z'));
  });

  it('no-ops when Evolution API is not configured', async () => {
    const evolution = {
      isConfigured: () => false,
      sendText: vi.fn(),
    };
    const contextService = { buildContext: vi.fn() };
    const openAiReminder = { compose: vi.fn() };
    const { prisma } = createReminderFakePrisma({
      users: [
        {
          id: 'u1',
          name: 'Alex',
          phone: '+15551234567',
          timezone,
          reminderTime: '08:00',
          whatsappOptIn: true,
        },
      ],
    });

    const service = createReminderService(
      prisma,
      evolution,
      contextService,
      openAiReminder,
    );

    await service.processReminders();

    expect(evolution.sendText).not.toHaveBeenCalled();
    expect(contextService.buildContext).not.toHaveBeenCalled();
  });

  it('sends morning reminder once per local day (idempotency)', async () => {
    const sendText = vi.fn().mockResolvedValue({ ok: true });
    const compose = vi.fn().mockResolvedValue('Good morning!');
    const buildContext = vi.fn().mockResolvedValue(defaultContext);

    const evolution = {
      isConfigured: () => true,
      sendText,
    };

    const { prisma, reminderLogs } = createReminderFakePrisma({
      users: [
        {
          id: 'u1',
          name: 'Alex',
          phone: '+15551234567',
          timezone,
          reminderTime: '08:00',
          whatsappOptIn: true,
        },
      ],
    });

    const service = createReminderService(
      prisma,
      evolution,
      { buildContext },
      { compose },
    );

    await service.processReminders();
    await service.processReminders();

    expect(sendText).toHaveBeenCalledTimes(1);
    expect(compose).toHaveBeenCalledTimes(1);
    const sent = [...reminderLogs.values()].find((l) => l.kind === 'MORNING');
    expect(sent?.status).toBe('SENT');
  });

  it('skips evening when all tasks are logged and no xp at risk', async () => {
    vi.setSystemTime(new Date('2026-06-15T21:00:00.000Z'));

    const sendText = vi.fn().mockResolvedValue({ ok: true });
    const compose = vi.fn().mockResolvedValue('Evening nudge');
    const buildContext = vi.fn().mockResolvedValue({
      ...defaultContext,
      tasksRemaining: 0,
      xpAtRisk: 0,
    });

    const evolution = {
      isConfigured: () => true,
      sendText,
    };

    const { prisma } = createReminderFakePrisma({
      users: [
        {
          id: 'u1',
          name: 'Alex',
          phone: '+15551234567',
          timezone,
          reminderTime: '08:00',
          whatsappOptIn: true,
        },
      ],
    });

    const service = createReminderService(
      prisma,
      evolution,
      { buildContext },
      { compose },
    );

    await service.processReminders();

    expect(sendText).not.toHaveBeenCalled();
    expect(compose).not.toHaveBeenCalled();
  });

  it('records SKIPPED_OPTOUT for opted-out users without sending', async () => {
    const sendText = vi.fn();
    const { prisma, reminderLogs } = createReminderFakePrisma({
      users: [
        {
          id: 'u1',
          name: 'Alex',
          phone: '+15551234567',
          timezone,
          reminderTime: '08:00',
          whatsappOptIn: false,
        },
      ],
    });

    const service = createReminderService(
      prisma,
      { isConfigured: () => true, sendText },
      { buildContext: vi.fn() },
      { compose: vi.fn() },
    );

    await service.processReminders();

    expect(sendText).not.toHaveBeenCalled();
    const skipped = [...reminderLogs.values()].filter(
      (l) => l.status === 'SKIPPED_OPTOUT',
    );
    expect(skipped.length).toBe(5);
    expect(skipped.map((l) => l.kind).sort()).toEqual([
      'EVENING',
      'MORNING',
      'RECOVERY',
      'STREAK_AT_RISK',
      'WINBACK',
    ]);
  });

  it('retries FAILED morning reminder on next tick within window', async () => {
    const sendText = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: 'down' })
      .mockResolvedValueOnce({ ok: true });
    const compose = vi.fn().mockResolvedValue('Good morning!');

    const { prisma, reminderLogs } = createReminderFakePrisma({
      users: [
        {
          id: 'u1',
          name: 'Alex',
          phone: '+15551234567',
          timezone,
          reminderTime: '08:00',
          whatsappOptIn: true,
        },
      ],
    });

    const service = createReminderService(
      prisma,
      { isConfigured: () => true, sendText },
      { buildContext: vi.fn().mockResolvedValue(defaultContext) },
      { compose },
    );

    await service.processReminders();
    vi.setSystemTime(new Date('2026-06-15T08:03:00.000Z'));
    await service.processReminders();

    expect(sendText).toHaveBeenCalledTimes(2);
    const log = [...reminderLogs.values()].find((l) => l.kind === 'MORNING');
    expect(log?.status).toBe('SENT');
  });

  it('does not retry SENT morning reminder later in the retry window', async () => {
    const sendText = vi.fn().mockResolvedValue({ ok: true });
    const compose = vi.fn().mockResolvedValue('Good morning!');

    const { prisma } = createReminderFakePrisma({
      users: [
        {
          id: 'u1',
          name: 'Alex',
          phone: '+15551234567',
          timezone,
          reminderTime: '08:00',
          whatsappOptIn: true,
        },
      ],
    });

    const service = createReminderService(
      prisma,
      { isConfigured: () => true, sendText },
      { buildContext: vi.fn().mockResolvedValue(defaultContext) },
      { compose },
    );

    await service.processReminders();
    vi.setSystemTime(new Date('2026-06-15T08:03:00.000Z'));
    await service.processReminders();

    expect(sendText).toHaveBeenCalledTimes(1);
    expect(compose).toHaveBeenCalledTimes(1);
  });

  it('sends RECOVERY instead of MORNING when yesterday streak broke', async () => {
    const sendText = vi.fn().mockResolvedValue({ ok: true });
    const compose = vi.fn().mockResolvedValue('Recovery nudge');
    const buildContext = vi.fn().mockResolvedValue({
      ...defaultContext,
      missedYesterday: true,
      recoveryEligible: true,
      recoveryBreakDate: '2026-06-14',
    });

    const { prisma, reminderLogs } = createReminderFakePrisma({
      users: [
        {
          id: 'u1',
          name: 'Alex',
          phone: '+15551234567',
          timezone,
          reminderTime: '08:00',
          whatsappOptIn: true,
        },
      ],
    });

    const service = createReminderService(
      prisma,
      { isConfigured: () => true, sendText },
      { buildContext },
      { compose },
    );

    await service.processReminders();

    expect(compose).toHaveBeenCalledWith('RECOVERY', expect.any(Object));
    expect(compose).not.toHaveBeenCalledWith('MORNING', expect.any(Object));
    const recovery = [...reminderLogs.values()].find(
      (l) => l.kind === 'RECOVERY',
    );
    expect(recovery?.status).toBe('SENT');
    expect(
      [...reminderLogs.values()].find((l) => l.kind === 'MORNING'),
    ).toBeUndefined();
  });

  it('sends MORNING when yesterday was not a streak break', async () => {
    const compose = vi.fn().mockResolvedValue('Morning');
    const buildContext = vi.fn().mockResolvedValue({
      ...defaultContext,
      missedYesterday: false,
    });

    const { prisma } = createReminderFakePrisma({
      users: [
        {
          id: 'u1',
          name: 'Alex',
          phone: '+15551234567',
          timezone,
          reminderTime: '08:00',
          whatsappOptIn: true,
        },
      ],
    });

    const service = createReminderService(
      prisma,
      {
        isConfigured: () => true,
        sendText: vi.fn().mockResolvedValue({ ok: true }),
      },
      { buildContext },
      { compose },
    );

    await service.processReminders();

    expect(compose).toHaveBeenCalledWith('MORNING', expect.any(Object));
    expect(compose).not.toHaveBeenCalledWith('RECOVERY', expect.any(Object));
  });

  it('sends STREAK_AT_RISK at 18:00 and skips generic EVENING at 21:00', async () => {
    vi.setSystemTime(new Date('2026-06-15T18:00:00.000Z'));

    const sendText = vi.fn().mockResolvedValue({ ok: true });
    const compose = vi.fn().mockResolvedValue('At risk');
    const atRiskContext: ReminderContext = {
      ...defaultContext,
      streakAtRisk: true,
      currentStreak: 5,
      tasksRemaining: 2,
      xpAtRisk: 40,
    };
    const buildContext = vi.fn().mockResolvedValue(atRiskContext);

    const { prisma, reminderLogs } = createReminderFakePrisma({
      users: [
        {
          id: 'u1',
          name: 'Alex',
          phone: '+15551234567',
          timezone,
          reminderTime: '08:00',
          whatsappOptIn: true,
        },
      ],
    });

    const service = createReminderService(
      prisma,
      { isConfigured: () => true, sendText },
      { buildContext },
      { compose },
    );

    await service.processReminders();
    expect(compose).toHaveBeenCalledWith('STREAK_AT_RISK', atRiskContext);

    vi.setSystemTime(new Date('2026-06-15T21:00:00.000Z'));
    await service.processReminders();

    expect(compose).toHaveBeenCalledTimes(1);
    expect(
      [...reminderLogs.values()].find((l) => l.kind === 'STREAK_AT_RISK')
        ?.status,
    ).toBe('SENT');
    expect(
      [...reminderLogs.values()].find((l) => l.kind === 'EVENING'),
    ).toBeUndefined();
  });

  it('sends generic EVENING when streak is below at-risk threshold', async () => {
    vi.setSystemTime(new Date('2026-06-15T21:00:00.000Z'));

    const compose = vi.fn().mockResolvedValue('Evening');
    const buildContext = vi.fn().mockResolvedValue({
      ...defaultContext,
      streakAtRisk: false,
      currentStreak: 2,
      tasksRemaining: 1,
      xpAtRisk: 30,
    });

    const { prisma } = createReminderFakePrisma({
      users: [
        {
          id: 'u1',
          name: 'Alex',
          phone: '+15551234567',
          timezone,
          reminderTime: '08:00',
          whatsappOptIn: true,
        },
      ],
    });

    const service = createReminderService(
      prisma,
      {
        isConfigured: () => true,
        sendText: vi.fn().mockResolvedValue({ ok: true }),
      },
      { buildContext },
      { compose },
    );

    await service.processReminders();

    expect(compose).toHaveBeenCalledWith('EVENING', expect.any(Object));
    expect(compose).not.toHaveBeenCalledWith(
      'STREAK_AT_RISK',
      expect.any(Object),
    );
  });

  it('dedupes RECOVERY to one send per break occurrence', async () => {
    const sendText = vi.fn().mockResolvedValue({ ok: true });
    const compose = vi.fn().mockResolvedValue('Recovery');
    const buildContext = vi.fn().mockResolvedValue({
      ...defaultContext,
      missedYesterday: true,
      recoveryEligible: true,
      recoveryBreakDate: '2026-06-14',
    });

    const { prisma } = createReminderFakePrisma({
      users: [
        {
          id: 'u1',
          name: 'Alex',
          phone: '+15551234567',
          timezone,
          reminderTime: '08:00',
          whatsappOptIn: true,
        },
      ],
    });

    const service = createReminderService(
      prisma,
      { isConfigured: () => true, sendText },
      { buildContext },
      { compose },
    );

    await service.processReminders();
    await service.processReminders();

    expect(sendText).toHaveBeenCalledTimes(1);
    expect(compose).toHaveBeenCalledTimes(1);
  });

  it('sends STREAK_AT_RISK catch-up at 21:00 when 18:00 was missed', async () => {
    vi.setSystemTime(new Date('2026-06-15T21:00:00.000Z'));

    const sendText = vi.fn().mockResolvedValue({ ok: true });
    const compose = vi.fn().mockResolvedValue('At risk catch-up');
    const atRiskContext: ReminderContext = {
      ...defaultContext,
      streakAtRisk: true,
      currentStreak: 5,
      tasksRemaining: 2,
      xpAtRisk: 40,
    };
    const buildContext = vi.fn().mockResolvedValue(atRiskContext);

    const { prisma, reminderLogs } = createReminderFakePrisma({
      users: [
        {
          id: 'u1',
          name: 'Alex',
          phone: '+15551234567',
          timezone,
          reminderTime: '08:00',
          whatsappOptIn: true,
        },
      ],
    });

    const service = createReminderService(
      prisma,
      { isConfigured: () => true, sendText },
      { buildContext },
      { compose },
    );

    await service.processReminders();

    expect(compose).toHaveBeenCalledWith('STREAK_AT_RISK', atRiskContext);
    expect(compose).not.toHaveBeenCalledWith('EVENING', expect.any(Object));
    expect(
      [...reminderLogs.values()].find((l) => l.kind === 'STREAK_AT_RISK')
        ?.status,
    ).toBe('SENT');
  });

  it('sends generic EVENING at 21:00 when STREAK_AT_RISK catch-up fails', async () => {
    vi.setSystemTime(new Date('2026-06-15T21:00:00.000Z'));

    const sendText = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: 'down' })
      .mockResolvedValueOnce({ ok: true });
    const compose = vi
      .fn()
      .mockResolvedValueOnce('At risk failed')
      .mockResolvedValueOnce('Evening backup');
    const atRiskContext: ReminderContext = {
      ...defaultContext,
      streakAtRisk: true,
      currentStreak: 5,
      tasksRemaining: 2,
      xpAtRisk: 40,
    };
    const buildContext = vi.fn().mockResolvedValue(atRiskContext);

    const { prisma } = createReminderFakePrisma({
      users: [
        {
          id: 'u1',
          name: 'Alex',
          phone: '+15551234567',
          timezone,
          reminderTime: '08:00',
          whatsappOptIn: true,
        },
      ],
    });

    const service = createReminderService(
      prisma,
      { isConfigured: () => true, sendText },
      { buildContext },
      { compose },
    );

    await service.processReminders();

    expect(compose).toHaveBeenCalledWith('STREAK_AT_RISK', atRiskContext);
    expect(compose).toHaveBeenCalledWith('EVENING', atRiskContext);
    expect(sendText).toHaveBeenCalledTimes(2);
  });

  it('does not double-send when reminderTime is 18:00', async () => {
    vi.setSystemTime(new Date('2026-06-15T18:00:00.000Z'));

    const sendText = vi.fn().mockResolvedValue({ ok: true });
    const compose = vi.fn().mockResolvedValue('Morning at 18');
    const buildContext = vi.fn().mockResolvedValue({
      ...defaultContext,
      streakAtRisk: true,
      currentStreak: 5,
      tasksRemaining: 2,
    });

    const { prisma } = createReminderFakePrisma({
      users: [
        {
          id: 'u1',
          name: 'Alex',
          phone: '+15551234567',
          timezone,
          reminderTime: '18:00',
          whatsappOptIn: true,
        },
      ],
    });

    const service = createReminderService(
      prisma,
      { isConfigured: () => true, sendText },
      { buildContext },
      { compose },
    );

    await service.processReminders();

    expect(sendText).toHaveBeenCalledTimes(1);
    expect(compose).toHaveBeenCalledWith('MORNING', expect.any(Object));
    expect(compose).not.toHaveBeenCalledWith(
      'STREAK_AT_RISK',
      expect.any(Object),
    );
  });

  it('sends generic EVENING for XP-only users at 21:00 with streak >= 3', async () => {
    vi.setSystemTime(new Date('2026-06-15T21:00:00.000Z'));

    const compose = vi.fn().mockResolvedValue('Evening xp');
    const buildContext = vi.fn().mockResolvedValue({
      ...defaultContext,
      streakAtRisk: false,
      currentStreak: 5,
      tasksRemaining: 0,
      xpAtRisk: 30,
    });

    const { prisma } = createReminderFakePrisma({
      users: [
        {
          id: 'u1',
          name: 'Alex',
          phone: '+15551234567',
          timezone,
          reminderTime: '08:00',
          whatsappOptIn: true,
        },
      ],
    });

    const service = createReminderService(
      prisma,
      {
        isConfigured: () => true,
        sendText: vi.fn().mockResolvedValue({ ok: true }),
      },
      { buildContext },
      { compose },
    );

    await service.processReminders();

    expect(compose).toHaveBeenCalledWith('EVENING', expect.any(Object));
    expect(compose).not.toHaveBeenCalledWith(
      'STREAK_AT_RISK',
      expect.any(Object),
    );
  });

  it('keys RECOVERY ReminderLog on brokeOnDate', async () => {
    const sendText = vi.fn().mockResolvedValue({ ok: true });
    const compose = vi.fn().mockResolvedValue('Recovery');
    const recoveryBreakDate = '2026-06-14';
    const buildContext = vi.fn().mockResolvedValue({
      ...defaultContext,
      missedYesterday: true,
      recoveryEligible: true,
      recoveryBreakDate,
    });

    const { prisma, reminderLogs } = createReminderFakePrisma({
      users: [
        {
          id: 'u1',
          name: 'Alex',
          phone: '+15551234567',
          timezone,
          reminderTime: '08:00',
          whatsappOptIn: true,
        },
      ],
    });

    const service = createReminderService(
      prisma,
      { isConfigured: () => true, sendText },
      { buildContext },
      { compose },
    );

    await service.processReminders();

    const recoveryLog = [...reminderLogs.values()].find(
      (l) => l.kind === 'RECOVERY',
    );
    expect(recoveryLog?.status).toBe('SENT');
    expect(recoveryLog?.date.getTime()).toBe(
      parseLocalDateKey(recoveryBreakDate, timezone).getTime(),
    );
  });

  it('defers morning reminder when streak-freeze consume one-shot was sent today', async () => {
    const localDate = new Date('2026-06-15T00:00:00.000Z');
    const yesterday = addLocalDays(localDate, -1, timezone);

    const sendText = vi.fn().mockResolvedValue({ ok: true });
    const compose = vi.fn().mockResolvedValue('Good morning!');
    const buildContext = vi.fn().mockResolvedValue(defaultContext);

    const { prisma } = createReminderFakePrisma({
      users: [
        {
          id: 'u1',
          name: 'Alex',
          phone: '+15551234567',
          timezone,
          reminderTime: '08:00',
          whatsappOptIn: true,
        },
      ],
      reminderLogs: [
        {
          id: 'consume-1',
          userId: 'u1',
          date: yesterday,
          kind: STREAK_FREEZE_CONSUMED_KIND,
          status: 'SENT',
          sentAt: new Date('2026-06-15T04:30:00.000Z'),
        },
      ],
    });

    const service = createReminderService(
      prisma,
      { isConfigured: () => true, sendText },
      { buildContext },
      { compose },
    );

    await service.processReminders();

    expect(sendText).not.toHaveBeenCalled();
    expect(compose).not.toHaveBeenCalled();
  });

  it('defers all reminders when win-back owns the day', async () => {
    const sendText = vi.fn().mockResolvedValue({ ok: true });
    const compose = vi.fn().mockResolvedValue('Should not send');
    const buildContext = vi.fn().mockResolvedValue({
      ...defaultContext,
      missedYesterday: true,
      recoveryEligible: true,
      recoveryBreakDate: '2026-06-14',
    });
    const winbackService = createWinbackServiceMock(true);

    const { prisma } = createReminderFakePrisma({
      users: [
        {
          id: 'u1',
          name: 'Alex',
          phone: '+15551234567',
          timezone,
          reminderTime: '08:00',
          whatsappOptIn: true,
        },
      ],
    });
    prisma.challenge.findFirst = async () => ({
      id: 'c1',
      startDate: new Date('2026-06-01T00:00:00.000Z'),
      endDate: new Date('2026-06-30T00:00:00.000Z'),
      lengthDays: 30,
      currentDay: 15,
      isActive: true,
      stoppedAt: null,
    });

    const service = createReminderService(
      prisma,
      { isConfigured: () => true, sendText },
      { buildContext },
      { compose },
      winbackService,
    );

    await service.processReminders();

    expect(winbackService.shouldDeferRemindersForUser).toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
    expect(compose).not.toHaveBeenCalled();
  });
});

describe('isWithinLocalRetryWindow', () => {
  it('matches only after the target minute and inside the configured window', () => {
    expect(
      isWithinLocalRetryWindow(
        'UTC',
        '08:00',
        new Date('2026-06-15T08:00:00.000Z'),
        15,
      ),
    ).toBe(false);
    expect(
      isWithinLocalRetryWindow(
        'UTC',
        '08:00',
        new Date('2026-06-15T08:15:00.000Z'),
        15,
      ),
    ).toBe(true);
    expect(
      isWithinLocalRetryWindow(
        'UTC',
        '08:00',
        new Date('2026-06-15T08:16:00.000Z'),
        15,
      ),
    ).toBe(false);
  });
});
