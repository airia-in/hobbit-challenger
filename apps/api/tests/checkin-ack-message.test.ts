import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import {
  CHECKIN_ACK_KIND,
  CheckinAckMessageService,
  buildCheckinAckFallback,
  buildCheckinAckStreakLine,
  interpolateCheckinAckPrompt,
  resolveCheckinAckStreakBucket,
  shouldAttemptCheckinAck,
} from '../src/whatsapp/checkin-ack-message.service';
import { buildReminderMessaging } from '../src/whatsapp/openai-reminder.service';
import {
  hasEveningReminderEligibility,
  hasStreakAtRiskReminderEligibility,
} from '../src/whatsapp/reminder-context.service';

const messaging = buildReminderMessaging('staging.hobbit.example');
const timezone = 'America/New_York';
const localDay = new Date('2026-06-15T04:00:00.000Z');

const context = {
  name: 'Sam',
  currentStreak: 7,
  todayNetXp: 450,
  tasksDone: 3,
  streakBucket: 'strong' as const,
};

function reminderLogKey(userId: string, date: Date, kind: string): string {
  return `${userId}:${date.getTime()}:${kind}`;
}

function createReminderLogStore() {
  const logs = new Map<
    string,
    { userId: string; date: Date; kind: string; status: string; sentAt?: Date }
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
          };
          update: { status: string; sentAt?: Date };
        }) => {
          const key = reminderLogKey(
            where.userId_date_kind.userId,
            where.userId_date_kind.date,
            where.userId_date_kind.kind,
          );
          const existing = logs.get(key);
          if (existing) {
            existing.status = update.status;
            existing.sentAt = update.sentAt ?? new Date();
            return existing;
          }
          const row = { ...create, sentAt: update.sentAt ?? new Date() };
          logs.set(key, row);
          return row;
        },
      },
    },
  };
}

function createService(
  sendOk = true,
  sendImpl?: () => Promise<{ ok: boolean }>,
) {
  const config = {
    get: (key: string) => {
      if (key === 'WEB_DOMAIN') return 'staging.hobbit.example';
      return undefined;
    },
  } as ConfigService;
  const evolution = {
    isConfigured: () => true,
    sendText: vi.fn(sendImpl ?? (async () => ({ ok: sendOk }))),
  };
  return {
    service: new CheckinAckMessageService(config, evolution as never),
    evolution,
  };
}

const sendInput = {
  prisma: null as never,
  userId: 'u1',
  userName: 'Sam',
  phone: '+15551234567',
  whatsappOptIn: true,
  localDay,
  timezone,
  currentStreak: 7,
  todayNetXp: 450,
  tasksDone: 3,
};

describe('checkin ack helpers', () => {
  it('uses CHECKIN_ACK ReminderLog kind', () => {
    expect(CHECKIN_ACK_KIND).toBe('CHECKIN_ACK');
  });

  it('blocks a second attempt when any log row exists', () => {
    expect(shouldAttemptCheckinAck(null)).toBe(true);
    expect(shouldAttemptCheckinAck({ status: 'SENT' })).toBe(false);
    expect(shouldAttemptCheckinAck({ status: 'FAILED' })).toBe(false);
    expect(shouldAttemptCheckinAck({ status: 'SKIPPED_OPTOUT' })).toBe(false);
  });

  it('resolves streak buckets for prompt tone', () => {
    expect(resolveCheckinAckStreakBucket(0)).toBe('fresh');
    expect(resolveCheckinAckStreakBucket(3)).toBe('building');
    expect(resolveCheckinAckStreakBucket(7)).toBe('strong');
  });

  it('builds fallback without dashboard URL', () => {
    const text = buildCheckinAckFallback(context, messaging);
    expect(text).toContain('Sam');
    expect(text).not.toContain(messaging.dashboardUrl);
    expect(text).toMatch(/pack|trail|habit/i);
  });

  it('interpolates prompt templates', () => {
    const rendered = interpolateCheckinAckPrompt(
      'Hi {{name}}, streak {{currentStreak}}, bucket {{streakBucket}}',
      context,
      messaging,
    );
    expect(rendered).toBe('Hi Sam, streak 7, bucket strong');
  });

  it('varies streak line by streak length', () => {
    expect(buildCheckinAckStreakLine(0, 100)).toContain('XP');
    expect(buildCheckinAckStreakLine(3, 0)).toContain('3-day');
    expect(buildCheckinAckStreakLine(10, 0)).toContain('10 days');
  });
});

describe('evening reminder interaction', () => {
  it('skips STREAK_AT_RISK and EVENING when tasksRemaining is zero', () => {
    const dayCompleteContext = {
      tasksRemaining: 0,
      xpAtRisk: 0,
      streakAtRisk: false,
    };
    expect(
      hasStreakAtRiskReminderEligibility(dayCompleteContext as never),
    ).toBe(false);
    expect(hasEveningReminderEligibility(dayCompleteContext as never)).toBe(
      false,
    );
  });
});

describe('CheckinAckMessageService', () => {
  it('sends once and dedupes on second call same day', async () => {
    const { prisma, logs } = createReminderLogStore();
    const { service, evolution } = createService();

    await service.trySendDayCompleteAck({
      ...sendInput,
      prisma: prisma as never,
    });
    await service.trySendDayCompleteAck({
      ...sendInput,
      prisma: prisma as never,
    });

    expect(evolution.sendText).toHaveBeenCalledTimes(1);
    expect(
      logs.get(reminderLogKey(sendInput.userId, localDay, CHECKIN_ACK_KIND))
        ?.status,
    ).toBe('SENT');
  });

  it('skips when whatsapp opt-in is false', async () => {
    const { prisma, logs } = createReminderLogStore();
    const { service, evolution } = createService();

    await service.trySendDayCompleteAck({
      ...sendInput,
      prisma: prisma as never,
      whatsappOptIn: false,
    });

    expect(evolution.sendText).not.toHaveBeenCalled();
    expect(logs.size).toBe(0);
  });

  it('skips when phone is missing', async () => {
    const { prisma, logs } = createReminderLogStore();
    const { service, evolution } = createService();

    await service.trySendDayCompleteAck({
      ...sendInput,
      prisma: prisma as never,
      phone: null,
    });

    expect(evolution.sendText).not.toHaveBeenCalled();
    expect(logs.size).toBe(0);
  });

  it('records FAILED without throwing when send throws', async () => {
    const { prisma, logs } = createReminderLogStore();
    const { service, evolution } = createService(true, async () => {
      throw new Error('Evolution down');
    });

    await expect(
      service.trySendDayCompleteAck({ ...sendInput, prisma: prisma as never }),
    ).resolves.toBeUndefined();

    expect(evolution.sendText).toHaveBeenCalledTimes(1);
    expect(logs.size).toBe(0);
  });

  it('records FAILED when evolution is unconfigured', async () => {
    const { prisma, logs } = createReminderLogStore();
    const config = {
      get: () => undefined,
    } as ConfigService;
    const evolution = {
      isConfigured: () => false,
      sendText: vi.fn(),
    };
    const service = new CheckinAckMessageService(config, evolution as never);

    await service.trySendDayCompleteAck({
      ...sendInput,
      prisma: prisma as never,
    });

    expect(evolution.sendText).not.toHaveBeenCalled();
    expect(
      logs.get(reminderLogKey(sendInput.userId, localDay, CHECKIN_ACK_KIND))
        ?.status,
    ).toBe('FAILED');
  });

  it('does not resend after FAILED when day completes again', async () => {
    const { prisma, logs } = createReminderLogStore();
    logs.set(reminderLogKey(sendInput.userId, localDay, CHECKIN_ACK_KIND), {
      userId: sendInput.userId,
      date: localDay,
      kind: CHECKIN_ACK_KIND,
      status: 'FAILED',
    });
    const { service, evolution } = createService();

    await service.trySendDayCompleteAck({
      ...sendInput,
      prisma: prisma as never,
    });

    expect(evolution.sendText).not.toHaveBeenCalled();
  });
});
