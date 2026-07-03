import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import {
  MilestoneMessageService,
  buildMilestoneFallback,
  interpolateMilestonePrompt,
  shouldRetryMilestoneMessage,
} from '../src/whatsapp/milestone-message.service';
import { buildReminderMessaging } from '../src/whatsapp/openai-reminder.service';
import { MILESTONE_DAY_REMINDER_KIND } from '@workspace-starter/types';

const messaging = buildReminderMessaging('staging.hobbit.example');
const timezone = 'America/New_York';
const evaluationDay = new Date('2026-06-14T04:00:00.000Z');

const context = {
  name: 'Sam',
  milestoneTitle: 'First week on the trail',
  unlockCopy: 'Seven days marching — the path is starting to feel like home.',
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

function createService(sendOk = true, options?: { mediaOk?: boolean }) {
  const config = {
    get: (key: string) => {
      if (key === 'WEB_DOMAIN') return 'staging.hobbit.example';
      return undefined;
    },
  } as ConfigService;
  const evolution = {
    isConfigured: () => true,
    sendText: vi.fn(async () => ({ ok: sendOk })),
    sendMedia: vi.fn(async () => ({ ok: options?.mediaOk ?? false })),
  };
  const milestoneCard = {
    getOrCreateCard: vi.fn(async () => ({
      buffer: Buffer.from('fake-png'),
      width: 900,
      height: 1200,
      mimeType: 'image/png' as const,
      cachePath: '/tmp/user-1_streak_66.png',
    })),
  };
  return {
    service: new MilestoneMessageService(
      config,
      evolution as never,
      milestoneCard as never,
    ),
    evolution,
    milestoneCard,
  };
}

describe('MilestoneMessageService', () => {
  it('renders fallback with dashboard URL', () => {
    const text = buildMilestoneFallback(context, messaging);
    expect(text).toContain(messaging.dashboardUrl);
    expect(text).toContain(context.milestoneTitle);
  });

  it('renders batch summary in fallback', () => {
    const text = buildMilestoneFallback(
      {
        ...context,
        batchSummary: '...and 3 more waypoints marked on your map',
      },
      messaging,
    );
    expect(text).toContain('3 more waypoints');
  });

  it('interpolates prompt template', () => {
    const rendered = interpolateMilestonePrompt(
      'Hi {{name}}, {{milestoneTitle}}, {{unlockCopy}}, {{dashboardUrl}}',
      context,
      messaging,
    );
    expect(rendered).toContain('Sam');
    expect(rendered).toContain(messaging.dashboardUrl);
  });

  it('dedupes SENT rows and retries FAILED', () => {
    expect(shouldRetryMilestoneMessage(null)).toBe(true);
    expect(shouldRetryMilestoneMessage({ status: 'FAILED' })).toBe(true);
    expect(shouldRetryMilestoneMessage({ status: 'SENT' })).toBe(false);
  });

  it('sends one batched message per evaluation day', async () => {
    const store = createReminderLogStore();
    const { service, evolution } = createService(true);

    await service.trySendBatchUnlockMessage({
      prisma: store.prisma as never,
      userId: 'user-1',
      userName: 'Sam',
      phone: '+911234567890',
      evaluationDay,
      primaryMilestoneKey: 'streak_66',
      additionalUnlockCount: 3,
      timezone,
    });

    await service.trySendBatchUnlockMessage({
      prisma: store.prisma as never,
      userId: 'user-1',
      userName: 'Sam',
      phone: '+911234567890',
      evaluationDay,
      primaryMilestoneKey: 'streak_7',
      additionalUnlockCount: 0,
      timezone,
    });

    expect(evolution.sendText).toHaveBeenCalledTimes(1);
    const key = reminderLogKey(
      'user-1',
      evaluationDay,
      MILESTONE_DAY_REMINDER_KIND,
    );
    expect(store.logs.get(key)?.status).toBe('SENT');
    expect(evolution.sendText.mock.calls[0]?.[1]).toContain('3 more waypoints');
  });

  it('sends share-card media for major milestones and skips text on success', async () => {
    const store = createReminderLogStore();
    const { service, evolution, milestoneCard } = createService(true, {
      mediaOk: true,
    });

    await service.trySendBatchUnlockMessage({
      prisma: store.prisma as never,
      userId: 'user-1',
      userName: 'Sam',
      phone: '+911234567890',
      evaluationDay,
      primaryMilestoneKey: 'streak_66',
      additionalUnlockCount: 0,
      timezone,
    });

    expect(milestoneCard.getOrCreateCard).toHaveBeenCalledTimes(1);
    expect(evolution.sendMedia).toHaveBeenCalledTimes(1);
    expect(evolution.sendText).not.toHaveBeenCalled();
  });

  it('falls back to text when media send fails', async () => {
    const store = createReminderLogStore();
    const { service, evolution } = createService(true, { mediaOk: false });

    await service.trySendBatchUnlockMessage({
      prisma: store.prisma as never,
      userId: 'user-1',
      userName: 'Sam',
      phone: '+911234567890',
      evaluationDay,
      primaryMilestoneKey: 'streak_30',
      additionalUnlockCount: 0,
      timezone,
    });

    expect(evolution.sendMedia).toHaveBeenCalledTimes(1);
    expect(evolution.sendText).toHaveBeenCalledTimes(1);
  });

  it('does not attempt media for non-major milestones', async () => {
    const store = createReminderLogStore();
    const { service, evolution } = createService(true, { mediaOk: true });

    await service.trySendBatchUnlockMessage({
      prisma: store.prisma as never,
      userId: 'user-1',
      userName: 'Sam',
      phone: '+911234567890',
      evaluationDay,
      primaryMilestoneKey: 'comeback',
      additionalUnlockCount: 0,
      timezone,
    });

    expect(evolution.sendMedia).not.toHaveBeenCalled();
    expect(evolution.sendText).toHaveBeenCalledTimes(1);
  });

  it('retries FAILED on a later attempt', async () => {
    const store = createReminderLogStore();
    store.logs.set(
      reminderLogKey('user-1', evaluationDay, MILESTONE_DAY_REMINDER_KIND),
      {
        userId: 'user-1',
        date: evaluationDay,
        kind: MILESTONE_DAY_REMINDER_KIND,
        status: 'FAILED',
        sentAt: new Date('2026-06-13T12:00:00.000Z'),
      },
    );

    const { service, evolution } = createService(true);
    await service.trySendBatchUnlockMessage({
      prisma: store.prisma as never,
      userId: 'user-1',
      userName: 'Sam',
      phone: '+911234567890',
      evaluationDay,
      primaryMilestoneKey: 'streak_21',
      additionalUnlockCount: 1,
      timezone,
      now: new Date('2026-06-14T12:00:00.000Z'),
    });

    expect(evolution.sendText).toHaveBeenCalledTimes(1);
    expect(
      store.logs.get(
        reminderLogKey('user-1', evaluationDay, MILESTONE_DAY_REMINDER_KIND),
      )?.status,
    ).toBe('SENT');
  });
});
