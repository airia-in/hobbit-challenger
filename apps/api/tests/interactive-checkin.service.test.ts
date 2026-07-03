import { beforeEach, describe, expect, it, vi } from 'vitest';
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

const PHONE = '+919876543210';
const USER_ID = 'user-1';

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

describe('InteractiveCheckinService', () => {
  const markActivity = vi.fn();
  const getToday = vi.fn();
  const sendText = vi.fn().mockResolvedValue({ ok: true });
  const reminderLogUpsert = vi.fn().mockResolvedValue({});
  const reminderLogFindMany = vi.fn().mockResolvedValue([]);
  const inboundDedupe = createDedupeStore();

  let service: InteractiveCheckinService;

  beforeEach(() => {
    vi.clearAllMocks();
    inboundDedupe.seen.clear();

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

    service = new InteractiveCheckinService(
      prisma as never,
      { markActivity, getToday } as never,
      { sendText } as never,
    );
  });

  it('marks focus habit on done button', async () => {
    getToday.mockResolvedValue({
      scoredActivities: [focusHabitActivity()],
    });

    await service.handleInbound({
      messageId: 'm1',
      phoneE164: PHONE,
      replyKind: 'done',
      rawText: null,
      buttonId: CHECKIN_BUTTON_DONE,
    });

    expect(markActivity).toHaveBeenCalledWith(
      expect.anything(),
      USER_ID,
      'habit-1',
    );
  });

  it('records snooze ReminderLog', async () => {
    await service.handleInbound({
      messageId: 'm2',
      phoneE164: PHONE,
      replyKind: 'snooze',
      rawText: null,
      buttonId: CHECKIN_BUTTON_SNOOZE,
    });

    expect(reminderLogUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          kind: 'SNOOZE_MORNING',
          status: 'ACTIVE',
        }),
      }),
    );
    expect(sendText).toHaveBeenCalled();
  });

  it('records rest day', async () => {
    const localDate = getUserLocalDate('UTC');

    await service.handleInbound({
      messageId: 'm3',
      phoneE164: PHONE,
      replyKind: 'rest',
      rawText: null,
      buttonId: CHECKIN_BUTTON_REST,
    });

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
  });

  it('no-ops for unknown phone', async () => {
    const prisma = {
      user: { findUnique: vi.fn(async () => null) },
      inboundMessageDedupe: inboundDedupe,
    };
    const svc = new InteractiveCheckinService(
      prisma as never,
      { markActivity, getToday } as never,
      { sendText } as never,
    );

    await svc.handleInbound({
      messageId: 'm4',
      phoneE164: '+10000000000',
      replyKind: 'done',
      rawText: null,
      buttonId: CHECKIN_BUTTON_DONE,
    });

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
    const svc = new InteractiveCheckinService(
      prisma as never,
      { markActivity, getToday } as never,
      { sendText } as never,
    );

    await svc.handleInbound({
      messageId: 'm5',
      phoneE164: PHONE,
      replyKind: 'done',
      rawText: null,
      buttonId: CHECKIN_BUTTON_DONE,
    });

    expect(markActivity).not.toHaveBeenCalled();
    expect(inboundDedupe.create).not.toHaveBeenCalled();
  });

  it('dedupes duplicate message ids', async () => {
    getToday.mockResolvedValue({ scoredActivities: [focusHabitActivity()] });

    const payload = {
      messageId: 'dup',
      phoneE164: PHONE,
      replyKind: 'done' as const,
      rawText: null,
      buttonId: CHECKIN_BUTTON_DONE,
    };

    await service.handleInbound(payload);
    await service.handleInbound(payload);

    expect(markActivity).toHaveBeenCalledTimes(1);
  });
});
