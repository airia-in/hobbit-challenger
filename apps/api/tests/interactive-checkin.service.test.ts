import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { ActivityKind } from '@workspace-starter/db';
import { Prisma } from '@workspace-starter/db';
import type { TodayActivity } from '../src/services/activities.service';
import { InteractiveCheckinService } from '../src/whatsapp/interactive-checkin.service';
import { getUserLocalDate } from '../src/utils/day-window';
import {
  CHECKIN_BUTTON_DONE,
  CHECKIN_BUTTON_REST,
  CHECKIN_BUTTON_SNOOZE,
  REST_DAY_KIND,
} from '../src/whatsapp/interactive-checkin.constants';
import {
  resetWebhookAbuseGuardsForTests,
  WEBHOOK_OUTBOUND_CONFIRM_MAX,
} from '../src/whatsapp/webhook-abuse-guards';

const PHONE = '+919876543210';
const OTHER_PHONE = '+15551234567';
const USER_ID = 'user-1';
const NOW_SEC = Math.floor(Date.now() / 1000);

function focusHabitActivity(id = 'habit-1'): TodayActivity {
  return {
    id,
    seedKey: 'DIET',
    title: 'Diet',
    emoji: '🥗',
    kind: ActivityKind.CHECKBOX,
    scored: true,
    isPersonal: false,
    xpComplete: 100,
    xpMiss: -100,
    deductMultiplier: 2,
    allowsProof: false,
    autoCompleteOnProof: false,
    log: null,
    canAttachProof: false,
    canEdit: true,
  };
}

function createDedupeStore() {
  const seen = new Set<string>();
  return {
    create: vi.fn(async ({ data }: { data: { messageId: string } }) => {
      if (seen.has(data.messageId)) {
        throw new Prisma.PrismaClientKnownRequestError('Unique constraint', {
          code: 'P2002',
          clientVersion: 'test',
        });
      }
      seen.add(data.messageId);
      return {
        id: 'dedupe-1',
        messageId: data.messageId,
        createdAt: new Date(),
      };
    }),
    seen,
  };
}

function inboundPayload(
  overrides: Partial<{
    messageId: string;
    phoneE164: string;
    senderPhoneE164: string | null;
    replyKind: 'done' | 'snooze' | 'rest' | null;
    recapFocusIndex: 1 | 2 | 3 | null;
    buttonId: string | null;
  }> = {},
) {
  return {
    messageId: 'm1',
    phoneE164: PHONE,
    senderPhoneE164: null,
    messageTimestamp: NOW_SEC,
    replyKind: 'done' as const,
    recapFocusIndex: null,
    rawText: null,
    buttonId: CHECKIN_BUTTON_DONE,
    ...overrides,
  };
}

describe('InteractiveCheckinService', () => {
  const markActivity = vi.fn();
  const getToday = vi.fn();
  const sendText = vi.fn().mockResolvedValue({ ok: true });
  const handleFocusReply = vi.fn().mockResolvedValue(undefined);
  const reminderLogUpsert = vi.fn().mockResolvedValue({});
  const reminderLogFindMany = vi.fn().mockResolvedValue([]);
  const inboundDedupe = createDedupeStore();

  let service: InteractiveCheckinService;
  const originalWebhookSecret = process.env.EVOLUTION_WEBHOOK_SECRET;

  function createConfig(
    values: Record<string, string | undefined> = {},
  ): ConfigService {
    return new ConfigService({
      EVOLUTION_WEBHOOK_SECRET: 'test-secret',
      ...values,
    });
  }

  function createService(
    prisma: unknown,
    config: ConfigService = createConfig(),
  ): InteractiveCheckinService {
    return new InteractiveCheckinService(
      prisma as never,
      { markActivity, getToday } as never,
      { sendText } as never,
      { handleFocusReply } as never,
      config,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    inboundDedupe.seen.clear();
    resetWebhookAbuseGuardsForTests();
    process.env.EVOLUTION_WEBHOOK_SECRET = 'test-secret';

    const prisma = {
      user: {
        findUnique: vi.fn(async () => ({
          id: USER_ID,
          phone: PHONE,
          whatsappOptIn: true,
          timezone: 'UTC',
          group: null,
        })),
      },
      inboundMessageDedupe: inboundDedupe,
      reminderLog: {
        upsert: reminderLogUpsert,
        findMany: reminderLogFindMany,
      },
    };

    service = createService(prisma);
  });

  afterEach(() => {
    if (originalWebhookSecret === undefined) {
      delete process.env.EVOLUTION_WEBHOOK_SECRET;
    } else {
      process.env.EVOLUTION_WEBHOOK_SECRET = originalWebhookSecret;
    }
  });

  it('marks focus habit on done button', async () => {
    getToday.mockResolvedValue({
      scoredActivities: [focusHabitActivity()],
    });

    await service.handleInbound(inboundPayload());

    expect(markActivity).toHaveBeenCalledWith(
      expect.anything(),
      USER_ID,
      'habit-1',
    );
    expect(getToday).toHaveBeenCalledWith(
      expect.anything(),
      USER_ID,
      undefined,
      { timezone: 'UTC' },
    );
  });

  it('records snooze ReminderLog without outbound confirmation', async () => {
    await service.handleInbound(
      inboundPayload({
        messageId: 'm2',
        replyKind: 'snooze',
        buttonId: CHECKIN_BUTTON_SNOOZE,
      }),
    );

    expect(reminderLogUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          kind: 'SNOOZE_MORNING',
          status: 'ACTIVE',
        }),
      }),
    );
    expect(sendText).not.toHaveBeenCalled();
  });

  it('records rest day without outbound confirmation', async () => {
    const localDate = getUserLocalDate('UTC');

    await service.handleInbound(
      inboundPayload({
        messageId: 'm3',
        replyKind: 'rest',
        buttonId: CHECKIN_BUTTON_REST,
      }),
    );

    expect(reminderLogUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_date_kind: {
            userId: USER_ID,
            date: localDate,
            kind: REST_DAY_KIND,
          },
        },
        create: expect.objectContaining({ status: 'SENT' }),
      }),
    );
    expect(sendText).not.toHaveBeenCalled();
  });

  it('no-ops for unknown phone', async () => {
    const prisma = {
      user: { findUnique: vi.fn(async () => null) },
      inboundMessageDedupe: inboundDedupe,
    };
    const svc = createService(prisma);

    await svc.handleInbound(
      inboundPayload({ phoneE164: '+10000000000', messageId: 'm4' }),
    );

    expect(markActivity).not.toHaveBeenCalled();
    expect(inboundDedupe.create).not.toHaveBeenCalled();
  });

  it('no-ops for opted-out user', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn(async () => ({
          id: USER_ID,
          phone: PHONE,
          whatsappOptIn: false,
          timezone: 'UTC',
          group: null,
        })),
      },
      inboundMessageDedupe: inboundDedupe,
    };
    const svc = createService(prisma);

    await svc.handleInbound(inboundPayload({ messageId: 'm5' }));

    expect(markActivity).not.toHaveBeenCalled();
    expect(inboundDedupe.create).not.toHaveBeenCalled();
  });

  it('dedupes duplicate message ids', async () => {
    getToday.mockResolvedValue({ scoredActivities: [focusHabitActivity()] });

    const payload = inboundPayload({ messageId: 'dup' });

    await service.handleInbound(payload);
    await service.handleInbound(payload);

    expect(markActivity).toHaveBeenCalledTimes(1);
  });

  it('rejects cross-user sender binding mismatch', async () => {
    await service.handleInbound(
      inboundPayload({
        messageId: 'm-cross',
        phoneE164: PHONE,
        senderPhoneE164: OTHER_PHONE,
      }),
    );

    expect(markActivity).not.toHaveBeenCalled();
    expect(inboundDedupe.create).not.toHaveBeenCalled();
  });

  it('caps outbound confirmation texts per user per hour', async () => {
    getToday.mockResolvedValue({ scoredActivities: [] });

    for (let i = 0; i < WEBHOOK_OUTBOUND_CONFIRM_MAX + 2; i += 1) {
      await service.handleInbound(
        inboundPayload({ messageId: `m-out-${i}`, replyKind: 'done' }),
      );
    }

    expect(sendText).toHaveBeenCalledTimes(WEBHOOK_OUTBOUND_CONFIRM_MAX);
  });

  it('routes numeric recap replies to focus handler', async () => {
    await service.handleInbound(
      inboundPayload({
        messageId: 'm-focus',
        replyKind: null,
        recapFocusIndex: 2,
        buttonId: null,
        rawText: '2',
      }),
    );

    expect(handleFocusReply).toHaveBeenCalledWith(USER_ID, 2, 'UTC');
    expect(markActivity).not.toHaveBeenCalled();
  });

  it('dedupes recap focus replies by message id', async () => {
    const payload = inboundPayload({
      messageId: 'dup-focus',
      replyKind: null,
      recapFocusIndex: 1,
      buttonId: null,
      rawText: '1',
    });

    await service.handleInbound(payload);
    await service.handleInbound(payload);

    expect(handleFocusReply).toHaveBeenCalledTimes(1);
  });

  it('no-ops recap focus replies when inbound is not configured', async () => {
    delete process.env.EVOLUTION_WEBHOOK_SECRET;
    delete process.env.EVOLUTION_WEBHOOK_ALLOW_UNAUTHENTICATED;

    const prisma = {
      user: {
        findUnique: vi.fn(async () => ({
          id: USER_ID,
          phone: PHONE,
          whatsappOptIn: true,
          timezone: 'UTC',
          group: null,
        })),
      },
      inboundMessageDedupe: inboundDedupe,
    };
    const svc = createService(
      prisma,
      createConfig({ EVOLUTION_WEBHOOK_SECRET: undefined }),
    );

    await svc.handleInbound(
      inboundPayload({
        messageId: 'm-focus-off',
        replyKind: null,
        recapFocusIndex: 1,
        buttonId: null,
        rawText: '1',
      }),
    );

    expect(handleFocusReply).not.toHaveBeenCalled();
    expect(inboundDedupe.create).not.toHaveBeenCalled();
  });
});
