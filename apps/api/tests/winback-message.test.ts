import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import {
  WinbackMessageService,
  buildWinbackFallback,
  interpolateWinbackPrompt,
} from '../src/whatsapp/winback-message.service';
import {
  shouldRetryWinback,
  WINBACK_KIND,
} from '../src/utils/winback-dormancy';
import { buildReminderMessaging } from '../src/whatsapp/openai-reminder.service';

const messaging = buildReminderMessaging('staging.hobbit.example');

const context = {
  name: 'Sam',
  dayNumber: 12,
  dormantDays: 4,
  rank: 3,
};

const localDate = new Date('2026-06-15T04:00:00.000Z');

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
  service: WinbackMessageService;
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
    service: new WinbackMessageService(config, evolution as never),
    sendText,
  };
}

const sendInput = {
  userId: 'user-1',
  phone: '+15551234567',
  localDate,
  context,
};

describe('WinbackMessageService', () => {
  it('renders warm fallback with dashboard URL', () => {
    const text = buildWinbackFallback(context, messaging);
    expect(text).toMatch(/trail waited|campfire|smallest/i);
    expect(text).toContain(messaging.dashboardUrl);
  });

  it('interpolates prompt template variables', () => {
    const rendered = interpolateWinbackPrompt(
      'Hi {{name}}, day {{dayNumber}}, quiet {{dormantDays}} days, {{dashboardUrl}}',
      context,
      messaging,
    );
    expect(rendered).toContain('Sam');
    expect(rendered).toContain('12');
    expect(rendered).toContain('4');
    expect(rendered).toContain(messaging.dashboardUrl);
  });

  it('returns fallback when API key is missing', async () => {
    const { service } = createService({ apiKey: undefined });
    const text = await service.compose(context);
    expect(text).toBe(buildWinbackFallback(context, messaging));
  });

  it('uses WINBACK ReminderLog kind', () => {
    expect(WINBACK_KIND).toBe('WINBACK');
  });

  it('shouldRetryWinback allows missing and FAILED rows only', () => {
    expect(shouldRetryWinback(null)).toBe(true);
    expect(shouldRetryWinback({ status: 'FAILED' })).toBe(true);
    expect(shouldRetryWinback({ status: 'SENT' })).toBe(false);
  });

  it('records SENT and skips a second send', async () => {
    const { service, sendText } = createService({ apiKey: undefined });
    const { prisma, logs } = createReminderLogStore();

    await service.trySendWinback({ prisma: prisma as never, ...sendInput });
    await service.trySendWinback({ prisma: prisma as never, ...sendInput });

    expect(sendText).toHaveBeenCalledTimes(1);
    const log = logs.get(
      reminderLogKey(sendInput.userId, localDate, WINBACK_KIND),
    );
    expect(log?.status).toBe('SENT');
  });

  it('retries after FAILED send without crossing success dedupe', async () => {
    const { service, sendText } = createService({
      apiKey: undefined,
      sendResults: [{ ok: false }, { ok: true }],
    });
    const { prisma, logs } = createReminderLogStore();

    await service.trySendWinback({ prisma: prisma as never, ...sendInput });
    await service.trySendWinback({ prisma: prisma as never, ...sendInput });

    expect(sendText).toHaveBeenCalledTimes(2);
    const log = logs.get(
      reminderLogKey(sendInput.userId, localDate, WINBACK_KIND),
    );
    expect(log?.status).toBe('SENT');
  });

  it('records FAILED when Evolution is not configured', async () => {
    const { service, sendText } = createService({
      apiKey: undefined,
      configured: false,
    });
    const { prisma, logs } = createReminderLogStore();

    await service.trySendWinback({ prisma: prisma as never, ...sendInput });

    expect(sendText).not.toHaveBeenCalled();
    const log = logs.get(
      reminderLogKey(sendInput.userId, localDate, WINBACK_KIND),
    );
    expect(log?.status).toBe('FAILED');
  });
});
