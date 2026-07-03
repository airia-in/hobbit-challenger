import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AnalyticsService,
  PRODUCT_EVENT_KEYS,
  isProductAnalyticsEnabled,
  trackProductEvent,
  trackProductEventFireAndForget,
  trackReminderSentFireAndForget,
} from '../src/services/analytics.service';
import { DayEvaluatorService } from '../src/cron/day-evaluator.service';
import { ReminderService } from '../src/cron/reminder.service';
import type { ReminderContext } from '../src/whatsapp/reminder-context.service';

describe('analytics.service', () => {
  it('isProductAnalyticsEnabled defaults to true when unset', () => {
    expect(isProductAnalyticsEnabled({})).toBe(true);
    expect(isProductAnalyticsEnabled({ PRODUCT_ANALYTICS_ENABLED: '' })).toBe(
      true,
    );
  });

  it('isProductAnalyticsEnabled respects false values', () => {
    expect(
      isProductAnalyticsEnabled({ PRODUCT_ANALYTICS_ENABLED: 'false' }),
    ).toBe(false);
    expect(isProductAnalyticsEnabled({ PRODUCT_ANALYTICS_ENABLED: '0' })).toBe(
      false,
    );
    expect(isProductAnalyticsEnabled({ PRODUCT_ANALYTICS_ENABLED: 'no' })).toBe(
      false,
    );
  });

  it('trackProductEvent never throws when DB insert fails', async () => {
    const logger = { error: vi.fn() };
    const prisma = {
      productEvent: {
        create: vi.fn().mockRejectedValue(new Error('db down')),
      },
    };

    await expect(
      trackProductEvent(
        prisma,
        'user-1',
        PRODUCT_EVENT_KEYS.ACTIVITY_LOGGED,
        { activityId: 'a1' },
        { enabled: true, logger: logger as unknown as Logger },
      ),
    ).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalled();
  });

  it('trackProductEventFireAndForget never throws when DB insert fails', async () => {
    const logger = { error: vi.fn() };
    const prisma = {
      productEvent: {
        create: vi.fn().mockRejectedValue(new Error('db down')),
      },
    };

    expect(() =>
      trackProductEventFireAndForget(
        prisma,
        'user-1',
        PRODUCT_EVENT_KEYS.ACTIVITY_LOGGED,
        { activityId: 'a1' },
        { enabled: true, logger: logger as unknown as Logger },
      ),
    ).not.toThrow();

    await vi.waitFor(() => {
      expect(logger.error).toHaveBeenCalled();
    });
  });

  it('skips writes when PRODUCT_ANALYTICS_ENABLED is false', async () => {
    const prisma = {
      productEvent: {
        create: vi.fn().mockResolvedValue({ id: 'evt-1' }),
      },
    };

    await trackProductEvent(
      prisma,
      'user-1',
      PRODUCT_EVENT_KEYS.USER_REGISTERED,
      { timezone: 'UTC' },
      { enabled: false },
    );

    expect(prisma.productEvent.create).not.toHaveBeenCalled();
  });

  it('drops non-primitive metadata fields for privacy', async () => {
    const prisma = {
      productEvent: {
        create: vi.fn().mockResolvedValue({ id: 'evt-1' }),
      },
    };

    await trackProductEvent(
      prisma,
      'user-1',
      PRODUCT_EVENT_KEYS.REMINDER_SENT,
      {
        kind: 'MORNING',
        status: 'SENT',
        phone: '+15551234567' as unknown as string,
        messageBody: 'secret copy' as unknown as string,
      },
      { enabled: true },
    );

    expect(prisma.productEvent.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        eventKey: PRODUCT_EVENT_KEYS.REMINDER_SENT,
        metadata: {
          kind: 'MORNING',
          status: 'SENT',
        },
      },
    });
  });

  it('drops blocked PII metadata keys (extended blocklist)', async () => {
    const prisma = {
      productEvent: {
        create: vi.fn().mockResolvedValue({ id: 'evt-1' }),
      },
    };

    await trackProductEvent(
      prisma,
      'user-1',
      PRODUCT_EVENT_KEYS.ACTIVITY_LOGGED,
      {
        activityId: 'a1',
        userName: 'Alex' as unknown as string,
        username: 'alex' as unknown as string,
        anchorText: 'click here' as unknown as string,
        copy: 'marketing copy' as unknown as string,
        title: 'Hello' as unknown as string,
        phoneNumber: '+15551234567' as unknown as string,
      },
      { enabled: true },
    );

    expect(prisma.productEvent.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        eventKey: PRODUCT_EVENT_KEYS.ACTIVITY_LOGGED,
        metadata: {
          activityId: 'a1',
        },
      },
    });
  });

  it('trackReminderSentFireAndForget emits only on SENT status', async () => {
    const prisma = {
      productEvent: {
        create: vi.fn().mockResolvedValue({ id: 'evt-1' }),
      },
    };

    trackReminderSentFireAndForget(prisma, 'user-1', 'MORNING', 'FAILED', {
      enabled: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(prisma.productEvent.create).not.toHaveBeenCalled();

    trackReminderSentFireAndForget(prisma, 'user-1', 'MORNING', 'SENT', {
      enabled: true,
    });
    await vi.waitFor(() => {
      expect(prisma.productEvent.create).toHaveBeenCalledTimes(1);
    });
    expect(prisma.productEvent.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        eventKey: PRODUCT_EVENT_KEYS.REMINDER_SENT,
        metadata: { kind: 'MORNING', status: 'SENT' },
      },
    });
  });

  it('AnalyticsService caches PRODUCT_ANALYTICS_ENABLED at construction', async () => {
    const prisma = {
      productEvent: {
        create: vi.fn().mockResolvedValue({ id: 'evt-1' }),
      },
    };
    const config = {
      get: vi.fn().mockReturnValue('true'),
    };

    const service = new AnalyticsService(prisma as never, config as never);
    service.track('user-1', PRODUCT_EVENT_KEYS.GROUP_JOINED, {
      groupId: 'g1',
    });
    config.get.mockReturnValue('false');
    service.track('user-2', PRODUCT_EVENT_KEYS.GROUP_JOINED, {
      groupId: 'g2',
    });

    await vi.waitFor(() => {
      expect(prisma.productEvent.create).toHaveBeenCalledTimes(2);
    });
    expect(config.get).toHaveBeenCalledTimes(1);
  });

  it('AnalyticsService.track is fire-and-forget and gated by config', async () => {
    const prisma = {
      productEvent: {
        create: vi.fn().mockResolvedValue({ id: 'evt-1' }),
      },
    };
    const config = {
      get: vi.fn().mockReturnValue('false'),
    };

    const service = new AnalyticsService(prisma as never, config as never);
    service.track('user-1', PRODUCT_EVENT_KEYS.GROUP_JOINED, {
      groupId: 'g1',
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(prisma.productEvent.create).not.toHaveBeenCalled();
  });
});

describe('analytics emission touchpoints', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('day-evaluator emits day.finalized and streak.broken on finalize', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'evt-1' });
    const prisma = {
      productEvent: { create },
      user: { findMany: vi.fn().mockResolvedValue([]) },
      activity: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'activity-1',
            scored: true,
            isPersonal: false,
            kind: 'CHECKBOX',
          },
        ]),
      },
      dayScore: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn(),
      },
      activityLog: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      challenge: {
        update: vi.fn(),
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          dayScore: {
            findUnique: vi.fn().mockResolvedValue(null),
            upsert: vi.fn(),
          },
          challenge: { update: vi.fn() },
        };
        return fn(tx);
      }),
    };

    const service = new DayEvaluatorService(prisma as never);
    const previous = process.env.PRODUCT_ANALYTICS_ENABLED;
    process.env.PRODUCT_ANALYTICS_ENABLED = 'true';

    try {
      await (
        service as unknown as {
          evaluateUserDay: (...args: unknown[]) => Promise<void>;
        }
      ).evaluateUserDay(
        'user-1',
        'Alex',
        null,
        true,
        'UTC',
        null,
        'UTC',
        'group-1',
        {
          id: 'challenge-1',
          startDate: new Date('2026-07-01T00:00:00.000Z'),
          endDate: null,
          currentDay: 2,
          lengthDays: 30,
          longestStreak: 3,
          currentStreak: 3,
          streakFreezesAvailable: 0,
          streakFreezesUsed: 0,
          lastStreakFreezeGrantedAt: null,
          isActive: true,
        },
      );

      await vi.waitFor(() => {
        expect(create).toHaveBeenCalled();
      });
    } finally {
      process.env.PRODUCT_ANALYTICS_ENABLED = previous;
    }

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventKey: PRODUCT_EVENT_KEYS.DAY_FINALIZED,
        }),
      }),
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventKey: PRODUCT_EVENT_KEYS.STREAK_BROKEN,
          metadata: expect.objectContaining({ previousStreak: 3 }),
        }),
      }),
    );
  });

  it('activity.logged payload shape excludes PII keys', async () => {
    const prisma = {
      productEvent: {
        create: vi.fn().mockResolvedValue({ id: 'evt-1' }),
      },
    };

    await trackProductEvent(
      prisma,
      'user-1',
      PRODUCT_EVENT_KEYS.ACTIVITY_LOGGED,
      {
        activityId: 'activity-1',
        challengeId: 'challenge-1',
        activityKind: 'CHECKBOX',
        scored: true,
        phone: '+15551234567' as unknown as string,
      },
      { enabled: true },
    );

    expect(prisma.productEvent.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        eventKey: PRODUCT_EVENT_KEYS.ACTIVITY_LOGGED,
        metadata: {
          activityId: 'activity-1',
          challengeId: 'challenge-1',
          activityKind: 'CHECKBOX',
          scored: true,
        },
      },
    });
  });

  it('reminder.service emits one reminder.sent after FAILED retry succeeds', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'evt-1' });
    const localDate = new Date('2026-07-03T00:00:00.000Z');
    const prisma = {
      productEvent: { create },
      user: { findMany: vi.fn().mockResolvedValue([]) },
      reminderLog: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ status: 'FAILED' })
          .mockResolvedValueOnce({ status: 'FAILED' }),
        upsert: vi.fn().mockResolvedValue({}),
      },
    };
    const evolution = {
      isConfigured: vi.fn().mockReturnValue(true),
      sendButtons: vi
        .fn()
        .mockResolvedValueOnce({ ok: false })
        .mockResolvedValueOnce({ ok: true }),
      sendText: vi
        .fn()
        .mockResolvedValueOnce({ ok: false })
        .mockResolvedValueOnce({ ok: true }),
    };
    const contextService = {
      buildContext: vi.fn().mockResolvedValue({
        tasksRemaining: 1,
      } as ReminderContext),
    };
    const openAiReminder = {
      compose: vi.fn().mockResolvedValue('Trail copy'),
    };
    const winbackService = {
      loadDeferBatchContext: vi.fn().mockResolvedValue({}),
      shouldDeferRemindersForUser: vi.fn().mockReturnValue(false),
    };

    const service = new ReminderService(
      prisma as never,
      evolution as never,
      contextService as never,
      openAiReminder as never,
      winbackService as never,
    );

    const previous = process.env.PRODUCT_ANALYTICS_ENABLED;
    process.env.PRODUCT_ANALYTICS_ENABLED = 'true';

    try {
      const trySend = (
        service as unknown as {
          trySendReminder: (...args: unknown[]) => Promise<void>;
        }
      ).trySendReminder.bind(service);

      await trySend(
        {
          id: 'user-1',
          name: 'Alex',
          phone: '+15551234567',
          timezone: 'UTC',
        },
        localDate,
        'MORNING',
      );
      await trySend(
        {
          id: 'user-1',
          name: 'Alex',
          phone: '+15551234567',
          timezone: 'UTC',
        },
        localDate,
        'MORNING',
      );

      await vi.waitFor(() => {
        expect(create).toHaveBeenCalledTimes(1);
      });
    } finally {
      process.env.PRODUCT_ANALYTICS_ENABLED = previous;
    }

    expect(create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        eventKey: PRODUCT_EVENT_KEYS.REMINDER_SENT,
        metadata: {
          kind: 'MORNING',
          status: 'SENT',
        },
      },
    });
  });

  it('reminder.service emits reminder.sent after send', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'evt-1' });
    const localDate = new Date('2026-07-03T00:00:00.000Z');
    const prisma = {
      productEvent: { create },
      user: { findMany: vi.fn().mockResolvedValue([]) },
      reminderLog: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({}),
      },
    };
    const evolution = {
      isConfigured: vi.fn().mockReturnValue(true),
      sendButtons: vi.fn().mockResolvedValue({ ok: true }),
      sendText: vi.fn().mockResolvedValue({ ok: true }),
    };
    const contextService = {
      buildContext: vi.fn().mockResolvedValue({
        tasksRemaining: 1,
      } as ReminderContext),
    };
    const openAiReminder = {
      compose: vi.fn().mockResolvedValue('Trail copy'),
    };
    const winbackService = {
      loadDeferBatchContext: vi.fn().mockResolvedValue({}),
      shouldDeferRemindersForUser: vi.fn().mockReturnValue(false),
    };

    const service = new ReminderService(
      prisma as never,
      evolution as never,
      contextService as never,
      openAiReminder as never,
      winbackService as never,
    );

    const previous = process.env.PRODUCT_ANALYTICS_ENABLED;
    process.env.PRODUCT_ANALYTICS_ENABLED = 'true';

    try {
      await (
        service as unknown as {
          trySendReminder: (...args: unknown[]) => Promise<void>;
        }
      ).trySendReminder(
        {
          id: 'user-1',
          name: 'Alex',
          phone: '+15551234567',
          timezone: 'UTC',
        },
        localDate,
        'MORNING',
      );

      await vi.waitFor(() => {
        expect(create).toHaveBeenCalled();
      });
    } finally {
      process.env.PRODUCT_ANALYTICS_ENABLED = previous;
    }

    expect(create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        eventKey: PRODUCT_EVENT_KEYS.REMINDER_SENT,
        metadata: {
          kind: 'MORNING',
          status: 'SENT',
        },
      },
    });
    const metadata = create.mock.calls[0]?.[0]?.data?.metadata as Record<
      string,
      unknown
    >;
    expect(metadata).not.toHaveProperty('phone');
    expect(metadata).not.toHaveProperty('message');
  });
});
