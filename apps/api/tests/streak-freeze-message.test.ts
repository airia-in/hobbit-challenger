import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import {
  StreakFreezeMessageService,
  buildStreakFreezeConsumeFallback,
  buildStreakFreezeGrantFallback,
  interpolateStreakFreezeConsumePrompt,
  interpolateStreakFreezeGrantPrompt,
  shouldAttemptStreakFreezeMessageSend,
  shouldDeferMorningForStreakFreezeConsumed,
  shouldRetryStreakFreezeConsume,
  shouldRetryStreakFreezeGrant,
  STREAK_FREEZE_CONSUMED_KIND,
  STREAK_FREEZE_DEFAULT_MORNING_TIME,
  STREAK_FREEZE_GRANTED_KIND,
} from '../src/whatsapp/streak-freeze-message.service';
import { buildReminderMessaging } from '../src/whatsapp/openai-reminder.service';

const messaging = buildReminderMessaging('staging.hobbit.example');
const timezone = 'America/New_York';

const grantContext = {
  name: 'Sam',
  currentStreak: 7,
  streakFreezesAvailable: 1,
};

const consumeContext = {
  name: 'Sam',
  currentStreak: 7,
};

const evaluationDay = new Date('2026-06-14T04:00:00.000Z');

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
  options: {
    apiKey?: string;
    configured?: boolean;
    sendResults?: Array<{ ok: boolean }>;
  } = {},
): {
  service: StreakFreezeMessageService;
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
  const config = {
    get: (key: string) => {
      if (key === 'OPENAI_API_KEY') return options.apiKey;
      if (key === 'OPENAI_BASE_URL') return undefined;
      if (key === 'OPENAI_VISION_MODEL') return 'gpt-4o-mini';
      if (key === 'WEB_DOMAIN') return 'staging.hobbit.example';
      return undefined;
    },
  } as unknown as ConfigService;
  return {
    service: new StreakFreezeMessageService(config, evolution as never),
    sendText,
  };
}

const grantInput = {
  userId: 'user-1',
  userName: 'Sam',
  phone: '+15551234567',
  evaluationDay,
  currentStreak: 7,
  streakFreezesAvailable: 1,
  timezone,
};

const consumeInput = {
  userId: 'user-1',
  userName: 'Sam',
  phone: '+15551234567',
  evaluationDay,
  currentStreak: 7,
  timezone,
};

describe('StreakFreezeMessageService', () => {
  it('renders grant fallback copy with streak and cloak', () => {
    const text = buildStreakFreezeGrantFallback(grantContext, messaging);
    expect(text).toMatch(/7 days on the trail/i);
    expect(text).toMatch(/rain cloak/i);
    expect(text).toContain(messaging.dashboardUrl);
  });

  it('renders consume fallback copy with streak preserved', () => {
    const text = buildStreakFreezeConsumeFallback(consumeContext, messaging);
    expect(text).toMatch(/rain cloak covered yesterday/i);
    expect(text).toMatch(/7-day streak/i);
    expect(text).toContain(messaging.dashboardUrl);
  });

  it('interpolates grant prompt template variables', () => {
    const rendered = interpolateStreakFreezeGrantPrompt(
      'Hi {{name}}, streak {{currentStreak}}, cloaks {{streakFreezesAvailable}}, {{dashboardUrl}}',
      grantContext,
      messaging,
    );
    expect(rendered).toBe(
      `Hi Sam, streak 7, cloaks 1, ${messaging.dashboardUrl}`,
    );
  });

  it('interpolates consume prompt template variables', () => {
    const rendered = interpolateStreakFreezeConsumePrompt(
      'Hi {{name}}, streak {{currentStreak}}, {{dashboardUrl}}',
      consumeContext,
      messaging,
    );
    expect(rendered).toBe(`Hi Sam, streak 7, ${messaging.dashboardUrl}`);
  });

  it('returns grant fallback when API key is missing', async () => {
    const { service } = createService({ apiKey: undefined });
    const text = await service.composeGrant(grantContext);
    expect(text).toBe(buildStreakFreezeGrantFallback(grantContext, messaging));
  });

  it('returns consume fallback when API key is missing', async () => {
    const { service } = createService({ apiKey: undefined });
    const text = await service.composeConsume(consumeContext);
    expect(text).toBe(
      buildStreakFreezeConsumeFallback(consumeContext, messaging),
    );
  });

  it('uses distinct ReminderLog kinds for grant and consume', () => {
    expect(STREAK_FREEZE_GRANTED_KIND).toBe('STREAK_FREEZE_GRANTED');
    expect(STREAK_FREEZE_CONSUMED_KIND).toBe('STREAK_FREEZE_CONSUMED');
  });

  it('shouldRetryStreakFreezeGrant allows missing and FAILED rows only', () => {
    expect(shouldRetryStreakFreezeGrant(null)).toBe(true);
    expect(shouldRetryStreakFreezeGrant({ status: 'FAILED' })).toBe(true);
    expect(shouldRetryStreakFreezeGrant({ status: 'SENT' })).toBe(false);
    expect(shouldRetryStreakFreezeGrant({ status: 'SKIPPED_OPTOUT' })).toBe(
      false,
    );
  });

  it('shouldRetryStreakFreezeConsume mirrors grant retry rules', () => {
    expect(shouldRetryStreakFreezeConsume(null)).toBe(true);
    expect(shouldRetryStreakFreezeConsume({ status: 'FAILED' })).toBe(true);
    expect(shouldRetryStreakFreezeConsume({ status: 'SENT' })).toBe(false);
  });

  it('records SENT grant and skips a second send', async () => {
    const { service, sendText } = createService({ apiKey: undefined });
    const { prisma, logs } = createReminderLogStore();

    await service.trySendGrantMessage({
      prisma: prisma as never,
      ...grantInput,
    });
    await service.trySendGrantMessage({
      prisma: prisma as never,
      ...grantInput,
    });

    expect(sendText).toHaveBeenCalledTimes(1);
    const log = logs.get(
      reminderLogKey(
        grantInput.userId,
        evaluationDay,
        STREAK_FREEZE_GRANTED_KIND,
      ),
    );
    expect(log?.status).toBe('SENT');
  });

  it('records SENT consume and skips a second send', async () => {
    const { service, sendText } = createService({ apiKey: undefined });
    const { prisma, logs } = createReminderLogStore();

    await service.trySendConsumeMessage({
      prisma: prisma as never,
      ...consumeInput,
    });
    await service.trySendConsumeMessage({
      prisma: prisma as never,
      ...consumeInput,
    });

    expect(sendText).toHaveBeenCalledTimes(1);
    const log = logs.get(
      reminderLogKey(
        consumeInput.userId,
        evaluationDay,
        STREAK_FREEZE_CONSUMED_KIND,
      ),
    );
    expect(log?.status).toBe('SENT');
  });

  it('retries grant after FAILED send during morning window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T04:30:00.000Z'));

    const { service, sendText } = createService({
      apiKey: undefined,
      sendResults: [{ ok: false }, { ok: true }],
    });
    const { prisma, logs } = createReminderLogStore();

    await service.trySendGrantMessage({
      prisma: prisma as never,
      ...grantInput,
    });

    vi.setSystemTime(new Date('2026-06-15T12:05:00.000Z'));
    await service.trySendGrantMessage({
      prisma: prisma as never,
      ...grantInput,
    });

    expect(sendText).toHaveBeenCalledTimes(2);
    const log = logs.get(
      reminderLogKey(
        grantInput.userId,
        evaluationDay,
        STREAK_FREEZE_GRANTED_KIND,
      ),
    );
    expect(log?.status).toBe('SENT');

    vi.useRealTimers();
  });

  it('records single FAILED grant when Evolution is not configured', async () => {
    const { service, sendText } = createService({
      apiKey: undefined,
      configured: false,
    });
    const { prisma, logs } = createReminderLogStore();

    await service.trySendGrantMessage({
      prisma: prisma as never,
      ...grantInput,
    });
    await service.trySendGrantMessage({
      prisma: prisma as never,
      ...grantInput,
    });

    expect(sendText).not.toHaveBeenCalled();
    expect(logs.size).toBe(1);
    const log = logs.get(
      reminderLogKey(
        grantInput.userId,
        evaluationDay,
        STREAK_FREEZE_GRANTED_KIND,
      ),
    );
    expect(log?.status).toBe('FAILED');
  });

  it('sends grant after FAILED when Evolution becomes configured in morning window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T04:30:00.000Z'));

    const sendText = vi.fn().mockResolvedValue({ ok: true });
    let configured = false;
    const evolution = {
      isConfigured: () => configured,
      sendText,
    };
    const config = {
      get: (key: string) => {
        if (key === 'WEB_DOMAIN') return 'staging.hobbit.example';
        return undefined;
      },
    } as unknown as ConfigService;
    const service = new StreakFreezeMessageService(config, evolution as never);
    const { prisma } = createReminderLogStore();

    configured = false;
    await service.trySendGrantMessage({
      prisma: prisma as never,
      ...grantInput,
    });

    configured = true;
    vi.setSystemTime(new Date('2026-06-15T12:05:00.000Z'));
    await service.trySendGrantMessage({
      prisma: prisma as never,
      ...grantInput,
    });

    expect(sendText).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe('shouldAttemptStreakFreezeMessageSend', () => {
  it('allows first attempt when no log exists', () => {
    expect(
      shouldAttemptStreakFreezeMessageSend(null, {
        evolutionConfigured: true,
        timezone,
      }),
    ).toBe(true);
  });

  it('blocks repeat FAILED attempts when Evolution is unconfigured', () => {
    expect(
      shouldAttemptStreakFreezeMessageSend(
        { status: 'FAILED', sentAt: new Date() },
        { evolutionConfigured: false, timezone },
      ),
    ).toBe(false);
  });

  it('caps configured FAILED retries to one morning slot per local day', () => {
    vi.useFakeTimers();
    const morning = new Date('2026-06-15T12:05:00.000Z');
    vi.setSystemTime(morning);

    const afterMorningFail = shouldAttemptStreakFreezeMessageSend(
      { status: 'FAILED', sentAt: morning },
      {
        evolutionConfigured: true,
        timezone,
        morningTime: STREAK_FREEZE_DEFAULT_MORNING_TIME,
        now: morning,
      },
    );
    expect(afterMorningFail).toBe(false);

    const nextMorning = new Date('2026-06-16T12:05:00.000Z');
    const nextDayRetry = shouldAttemptStreakFreezeMessageSend(
      { status: 'FAILED', sentAt: morning },
      {
        evolutionConfigured: true,
        timezone,
        morningTime: STREAK_FREEZE_DEFAULT_MORNING_TIME,
        now: nextMorning,
      },
    );
    expect(nextDayRetry).toBe(true);

    vi.useRealTimers();
  });
});

describe('shouldDeferMorningForStreakFreezeConsumed', () => {
  it('defers morning when consume one-shot was sent today', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T14:00:00.000Z'));

    expect(
      shouldDeferMorningForStreakFreezeConsumed(
        { status: 'SENT', sentAt: new Date('2026-06-15T04:30:00.000Z') },
        timezone,
        new Date('2026-06-15T14:00:00.000Z'),
      ),
    ).toBe(true);

    vi.useRealTimers();
  });

  it('does not defer morning when consume was sent on a prior day', () => {
    expect(
      shouldDeferMorningForStreakFreezeConsumed(
        { status: 'SENT', sentAt: new Date('2026-06-14T04:30:00.000Z') },
        timezone,
        new Date('2026-06-15T14:00:00.000Z'),
      ),
    ).toBe(false);
  });
});
