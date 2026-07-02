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
};

const context = { name: 'Sam', rollup };
const logDate = new Date('2026-06-22T00:00:00.000Z');

function reminderLogKey(userId: string, date: Date, kind: string): string {
  return `${userId}:${date.getTime()}:${kind}`;
}

function createReminderLogStore() {
  const logs = new Map<
    string,
    { userId: string; date: Date; kind: string; status: string }
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
          create: { userId: string; date: Date; kind: string; status: string };
          update: { status: string };
        }) => {
          const key = reminderLogKey(
            where.userId_date_kind.userId,
            where.userId_date_kind.date,
            where.userId_date_kind.kind,
          );
          const existing = logs.get(key);
          if (existing) {
            existing.status = update.status;
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
});
