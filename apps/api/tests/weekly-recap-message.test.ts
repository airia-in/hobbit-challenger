import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import {
  WeeklyRecapMessageService,
  buildWeeklyRecapFallback,
  ensureWeeklyRecapDashboardUrl,
  interpolateWeeklyRecapPrompt,
} from '../src/whatsapp/weekly-recap-message.service';
import {
  shouldRetryWeeklyRecap,
  WEEKLY_RECAP_KIND,
} from '../src/utils/weekly-recap-eligibility';
import { buildReminderMessaging } from '../src/whatsapp/openai-reminder.service';

const messaging = buildReminderMessaging('staging.hobbit.example');

const rollup = {
  weekStartKey: '2026-06-22',
  weekEndKey: '2026-06-28',
  eligibleDays: 7,
  daysShowedUp: 5,
  perfectDays: 2,
  totalHabitsHit: 12,
  weekXp: 240,
  streakStart: 3,
  streakEnd: 5,
  bestHabitName: 'Morning walk',
  bestHabitHits: 5,
  identityReflectionLine:
    "You showed up 5 of 7 days — steady steps, and that's who you're becoming.",
  nextWeekNudgeLine:
    'Next week, keep Morning walk in the pack — your 5-day streak has momentum.',
  focusOptions: [],
  focusOptionsLine: '',
  priorWeekFocusLine: '',
};

const context = { name: 'Sam', rollup };
const logDate = new Date('2026-06-22T00:00:00.000Z');

function reminderLogKey(userId: string, date: Date, kind: string): string {
  return `${userId}:${date.getTime()}:${kind}`;
}

function createReminderLogStore() {
  const logs = new Map<
    string,
    {
      userId: string;
      date: Date;
      kind: string;
      status: string;
      metadata?: unknown;
    }
  >();

  return {
    logs,
    prisma: {
      reminderLog: {
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
          return logs.get(key) ?? null;
        },
        upsert: async ({
          where,
          create,
          update,
        }: {
          where: {
            userId_date_kind: { userId: string; date: Date; kind: string };
          };
          create: {
            userId: string;
            date: Date;
            kind: string;
            status: string;
            metadata?: unknown;
          };
          update: { status: string; metadata?: unknown };
        }) => {
          const key = reminderLogKey(
            where.userId_date_kind.userId,
            where.userId_date_kind.date,
            where.userId_date_kind.kind,
          );
          const existing = logs.get(key);
          if (existing) {
            existing.status = update.status;
            if (update.metadata !== undefined) {
              existing.metadata = update.metadata;
            }
            return existing;
          }
          const row = { ...create };
          logs.set(key, row);
          return row;
        },
      },
    },
  };
}

function createService(
  options: {
    configured?: boolean;
    sendResults?: Array<{ ok: boolean }>;
  } = {},
): {
  service: WeeklyRecapMessageService;
  sendText: ReturnType<typeof vi.fn>;
} {
  const sendText = vi.fn();
  const results = options.sendResults ?? [{ ok: true }];
  for (const result of results) {
    sendText.mockResolvedValueOnce(result);
  }

  const evolution = {
    isConfigured: () => options.configured ?? true,
    sendText,
  };

  const service = new WeeklyRecapMessageService(
    new ConfigService({ OPENAI_API_KEY: undefined }),
    evolution as never,
  );

  return { service, sendText };
}

describe('weekly recap message', () => {
  it('builds deterministic fallback with dashboardUrl', () => {
    const message = buildWeeklyRecapFallback(context, messaging);
    expect(message).toContain('Sam');
    expect(message).toContain(messaging.dashboardUrl);
    expect(message).toContain('5 of 7');
  });

  it('ensures dashboardUrl invariant on composed text', () => {
    expect(
      ensureWeeklyRecapDashboardUrl('Trail review complete.', messaging),
    ).toContain(messaging.dashboardUrl);
  });

  it('interpolates prompt slots from rollup context', () => {
    const filled = interpolateWeeklyRecapPrompt(
      'Week {{weekStartKey}}-{{weekEndKey}} for {{name}}. {{identityReflectionLine}} {{dashboardUrl}}',
      context,
      messaging,
    );
    expect(filled).toContain('2026-06-22-2026-06-28');
    expect(filled).toContain("that's who you're becoming");
    expect(filled).toContain(messaging.dashboardUrl);
  });

  it('retries FAILED logs only', () => {
    expect(shouldRetryWeeklyRecap(null)).toBe(true);
    expect(shouldRetryWeeklyRecap({ status: 'FAILED' })).toBe(true);
    expect(shouldRetryWeeklyRecap({ status: 'SENT' })).toBe(false);
  });

  it('sends once per ISO week and records SENT', async () => {
    const store = createReminderLogStore();
    const { service, sendText } = createService();

    await service.trySendWeeklyRecap({
      prisma: store.prisma as never,
      userId: 'user-1',
      phone: '+919876543210',
      logDate,
      context,
    });

    expect(sendText).toHaveBeenCalledTimes(1);
    const key = reminderLogKey('user-1', logDate, WEEKLY_RECAP_KIND);
    expect(store.logs.get(key)?.status).toBe('SENT');

    await service.trySendWeeklyRecap({
      prisma: store.prisma as never,
      userId: 'user-1',
      phone: '+919876543210',
      logDate,
      context,
    });
    expect(sendText).toHaveBeenCalledTimes(1);
  });

  it('records FAILED when Evolution send fails and allows retry', async () => {
    const store = createReminderLogStore();
    const { service, sendText } = createService({
      sendResults: [{ ok: false }, { ok: true }],
    });

    await service.trySendWeeklyRecap({
      prisma: store.prisma as never,
      userId: 'user-1',
      phone: '+919876543210',
      logDate,
      context,
    });

    const key = reminderLogKey('user-1', logDate, WEEKLY_RECAP_KIND);
    expect(store.logs.get(key)?.status).toBe('FAILED');

    await service.trySendWeeklyRecap({
      prisma: store.prisma as never,
      userId: 'user-1',
      phone: '+919876543210',
      logDate,
      context,
    });
    expect(sendText).toHaveBeenCalledTimes(2);
    expect(store.logs.get(key)?.status).toBe('SENT');
  });

  it('persists focus metadata on SENT when inbound enabled and options present', async () => {
    const store = createReminderLogStore();
    const { service } = createService();
    const focusRollup = {
      ...rollup,
      focusOptions: [
        {
          index: 1 as const,
          activityId: 'a1',
          name: 'Morning walk',
          completedDays: 3,
          eligibleDays: 6,
        },
        {
          index: 2 as const,
          activityId: 'a2',
          name: 'Reading',
          completedDays: 2,
          eligibleDays: 6,
        },
      ],
      focusOptionsLine:
        'Pick one habit to focus next week — reply with 1, 2, or 3:\n1) Morning walk (3/6 days)\n2) Reading (2/6 days)',
    };

    await service.trySendWeeklyRecap({
      prisma: store.prisma as never,
      userId: 'user-1',
      phone: '+919876543210',
      logDate,
      inboundEnabled: true,
      context: { name: 'Sam', rollup: focusRollup },
    });

    const key = reminderLogKey('user-1', logDate, WEEKLY_RECAP_KIND);
    expect(store.logs.get(key)?.metadata).toEqual({
      focusOptions: [
        { index: 1, activityId: 'a1', name: 'Morning walk' },
        { index: 2, activityId: 'a2', name: 'Reading' },
      ],
    });
  });

  it('omits focus metadata when inbound disabled', async () => {
    const store = createReminderLogStore();
    const { service } = createService();
    const focusRollup = {
      ...rollup,
      focusOptions: [
        {
          index: 1 as const,
          activityId: 'a1',
          name: 'Morning walk',
          completedDays: 3,
          eligibleDays: 6,
        },
        {
          index: 2 as const,
          activityId: 'a2',
          name: 'Reading',
          completedDays: 2,
          eligibleDays: 6,
        },
      ],
      focusOptionsLine: 'Pick one habit...',
    };

    await service.trySendWeeklyRecap({
      prisma: store.prisma as never,
      userId: 'user-1',
      phone: '+919876543210',
      logDate,
      inboundEnabled: false,
      context: { name: 'Sam', rollup: focusRollup },
    });

    const key = reminderLogKey('user-1', logDate, WEEKLY_RECAP_KIND);
    expect(store.logs.get(key)?.metadata).toBeUndefined();
  });

  it('appends focus options line to fallback copy', () => {
    const focusRollup = {
      ...rollup,
      focusOptionsLine:
        'Pick one habit to focus next week — reply with 1, 2, or 3:\n1) Morning walk (3/6 days)',
    };
    const message = buildWeeklyRecapFallback(
      { name: 'Sam', rollup: focusRollup },
      messaging,
    );
    expect(message).toContain('reply with 1, 2, or 3');
    expect(message).toContain('Morning walk (3/6 days)');
  });
});
