import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import {
  StreakFreezeMessageService,
  buildStreakFreezeFallback,
  interpolateStreakFreezePrompt,
  shouldRetryStreakFreezeGrant,
  STREAK_FREEZE_GRANTED_KIND,
} from '../src/whatsapp/streak-freeze-message.service';
import { buildReminderMessaging } from '../src/whatsapp/openai-reminder.service';

const messaging = buildReminderMessaging('staging.hobbit.example');

const context = {
  name: 'Sam',
  currentStreak: 7,
  streakFreezesAvailable: 1,
};

const evaluationDay = new Date('2026-06-14T04:00:00.000Z');

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
};

describe('StreakFreezeMessageService', () => {
  it('renders fallback copy with streak and cloak', async () => {
    const text = buildStreakFreezeFallback(context, messaging);
    expect(text).toMatch(/7 days on the trail/i);
    expect(text).toMatch(/rain cloak/i);
    expect(text).toContain(messaging.dashboardUrl);
  });

  it('interpolates prompt template variables', () => {
    const rendered = interpolateStreakFreezePrompt(
      'Hi {{name}}, streak {{currentStreak}}, cloaks {{streakFreezesAvailable}}, {{dashboardUrl}}',
      context,
      messaging,
    );
    expect(rendered).toBe(
      `Hi Sam, streak 7, cloaks 1, ${messaging.dashboardUrl}`,
    );
  });

  it('returns fallback when API key is missing', async () => {
    const { service } = createService({ apiKey: undefined });
    const text = await service.compose(context);
    expect(text).toBe(buildStreakFreezeFallback(context, messaging));
  });

  it('uses STREAK_FREEZE_GRANTED ReminderLog kind', () => {
    expect(STREAK_FREEZE_GRANTED_KIND).toBe('STREAK_FREEZE_GRANTED');
  });

  it('shouldRetryStreakFreezeGrant allows missing and FAILED rows only', () => {
    expect(shouldRetryStreakFreezeGrant(null)).toBe(true);
    expect(shouldRetryStreakFreezeGrant({ status: 'FAILED' })).toBe(true);
    expect(shouldRetryStreakFreezeGrant({ status: 'SENT' })).toBe(false);
    expect(shouldRetryStreakFreezeGrant({ status: 'SKIPPED_OPTOUT' })).toBe(
      false,
    );
  });

  it('records SENT and skips a second send', async () => {
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

  it('retries after FAILED send', async () => {
    const { service, sendText } = createService({
      apiKey: undefined,
      sendResults: [{ ok: false }, { ok: true }],
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

    expect(sendText).toHaveBeenCalledTimes(2);
    const log = logs.get(
      reminderLogKey(
        grantInput.userId,
        evaluationDay,
        STREAK_FREEZE_GRANTED_KIND,
      ),
    );
    expect(log?.status).toBe('SENT');
  });

  it('records FAILED when Evolution is not configured', async () => {
    const { service, sendText } = createService({
      apiKey: undefined,
      configured: false,
    });
    const { prisma, logs } = createReminderLogStore();

    await service.trySendGrantMessage({
      prisma: prisma as never,
      ...grantInput,
    });

    expect(sendText).not.toHaveBeenCalled();
    const log = logs.get(
      reminderLogKey(
        grantInput.userId,
        evaluationDay,
        STREAK_FREEZE_GRANTED_KIND,
      ),
    );
    expect(log?.status).toBe('FAILED');
  });

  it('sends after FAILED when Evolution becomes configured', async () => {
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
    await service.trySendGrantMessage({
      prisma: prisma as never,
      ...grantInput,
    });

    expect(sendText).toHaveBeenCalledTimes(1);
  });
});
