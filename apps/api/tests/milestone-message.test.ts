import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import {
  MilestoneMessageService,
  buildMilestoneFallback,
  interpolateMilestonePrompt,
  shouldRetryMilestoneMessage,
} from '../src/whatsapp/milestone-message.service';
import { buildReminderMessaging } from '../src/whatsapp/openai-reminder.service';
import { milestoneReminderKind } from '@workspace-starter/types';

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

function createService(sendOk = true) {
  const config = {
    get: (key: string) => {
      if (key === 'WEB_DOMAIN') return 'staging.hobbit.example';
      return undefined;
    },
  } as ConfigService;
  const evolution = {
    isConfigured: () => true,
    sendText: vi.fn(async () => ({ ok: sendOk })),
  };
  return {
    service: new MilestoneMessageService(config, evolution as never),
    evolution,
  };
}

describe('MilestoneMessageService', () => {
  it('renders fallback with dashboard URL', () => {
    const text = buildMilestoneFallback(context, messaging);
    expect(text).toContain(messaging.dashboardUrl);
    expect(text).toContain(context.milestoneTitle);
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

  it('sends once per milestone kind and records SENT', async () => {
    const store = createReminderLogStore();
    const { service, evolution } = createService(true);
    const kind = milestoneReminderKind('streak_7');

    await service.trySendUnlockMessage({
      prisma: store.prisma as never,
      userId: 'user-1',
      userName: 'Sam',
      phone: '+911234567890',
      evaluationDay,
      milestoneKey: 'streak_7',
      timezone,
    });

    await service.trySendUnlockMessage({
      prisma: store.prisma as never,
      userId: 'user-1',
      userName: 'Sam',
      phone: '+911234567890',
      evaluationDay,
      milestoneKey: 'streak_7',
      timezone,
    });

    expect(evolution.sendText).toHaveBeenCalledTimes(1);
    const key = reminderLogKey('user-1', evaluationDay, kind);
    expect(store.logs.get(key)?.status).toBe('SENT');
  });

  it('retries FAILED on a later attempt', async () => {
    const store = createReminderLogStore();
    const kind = milestoneReminderKind('streak_21');
    store.logs.set(reminderLogKey('user-1', evaluationDay, kind), {
      userId: 'user-1',
      date: evaluationDay,
      kind,
      status: 'FAILED',
      sentAt: new Date('2026-06-13T12:00:00.000Z'),
    });

    const { service, evolution } = createService(true);
    await service.trySendUnlockMessage({
      prisma: store.prisma as never,
      userId: 'user-1',
      userName: 'Sam',
      phone: '+911234567890',
      evaluationDay,
      milestoneKey: 'streak_21',
      timezone,
      now: new Date('2026-06-14T12:00:00.000Z'),
    });

    expect(evolution.sendText).toHaveBeenCalledTimes(1);
    expect(
      store.logs.get(reminderLogKey('user-1', evaluationDay, kind))?.status,
    ).toBe('SENT');
  });
});
