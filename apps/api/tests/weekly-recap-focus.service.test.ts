import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WeeklyRecapFocusService,
  isRecapFocusReplyWindowOpen,
  resolveRecapFocusChoice,
} from '../src/whatsapp/weekly-recap-focus.service';

const USER_ID = 'user-1';
const TZ = 'UTC';
const RECAP_DATE = new Date('2026-06-22T00:00:00.000Z');
const SENT_AT = new Date('2026-06-28T10:00:00.000Z');

const openMetadata = {
  focusOptions: [
    { index: 1 as const, activityId: 'a1', name: 'Morning walk' },
    { index: 2 as const, activityId: 'a2', name: 'Reading' },
  ],
};

function createPrisma(seed: {
  logs?: Array<{
    id: string;
    userId: string;
    date: Date;
    sentAt: Date;
    metadata: unknown;
  }>;
}) {
  const logs = [...(seed.logs ?? [])];
  const userUpdate = vi.fn().mockResolvedValue({});
  const logUpdate = vi.fn().mockResolvedValue({});

  return {
    prisma: {
      reminderLog: {
        findMany: vi.fn(async () =>
          logs
            .filter((log) => log.userId === USER_ID)
            .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime()),
        ),
        update: logUpdate,
      },
      user: {
        update: userUpdate,
      },
      $transaction: vi.fn(async (ops: Promise<unknown>[]) => {
        for (const op of ops) {
          await op;
        }
      }),
    },
    logUpdate,
    userUpdate,
    logs,
  };
}

describe('WeeklyRecapFocusService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-29T12:00:00.000Z'));
  });

  it('maps inbound index to stored option and persists focus', async () => {
    const { prisma, logUpdate, userUpdate } = createPrisma({
      logs: [
        {
          id: 'log-1',
          userId: USER_ID,
          date: RECAP_DATE,
          sentAt: SENT_AT,
          metadata: openMetadata,
        },
      ],
    });
    const service = new WeeklyRecapFocusService(prisma as never);

    await service.handleFocusReply(USER_ID, 2, TZ);

    expect(logUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'log-1' },
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            focusChoice: expect.objectContaining({
              index: 2,
              activityId: 'a2',
              name: 'Reading',
            }),
          }),
        }),
      }),
    );
    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: USER_ID },
        data: expect.objectContaining({
          recapFocus: expect.objectContaining({
            targetWeekStartKey: '2026-06-29',
            activityId: 'a2',
            activityName: 'Reading',
            sourceRecapWeekStartKey: '2026-06-22',
          }),
        }),
      }),
    );
  });

  it('ignores stale recap replies outside the window', async () => {
    vi.setSystemTime(new Date('2026-07-20T12:00:00.000Z'));
    const { prisma, logUpdate } = createPrisma({
      logs: [
        {
          id: 'log-1',
          userId: USER_ID,
          date: RECAP_DATE,
          sentAt: SENT_AT,
          metadata: openMetadata,
        },
      ],
    });
    const service = new WeeklyRecapFocusService(prisma as never);

    await service.handleFocusReply(USER_ID, 1, TZ);
    expect(logUpdate).not.toHaveBeenCalled();
  });

  it('ignores replies when no open recap log exists', async () => {
    const { prisma, logUpdate } = createPrisma({ logs: [] });
    const service = new WeeklyRecapFocusService(prisma as never);

    await service.handleFocusReply(USER_ID, 1, TZ);
    expect(logUpdate).not.toHaveBeenCalled();
  });

  it('ignores duplicate focus choice on the same recap log', async () => {
    const { prisma, logUpdate } = createPrisma({
      logs: [
        {
          id: 'log-1',
          userId: USER_ID,
          date: RECAP_DATE,
          sentAt: SENT_AT,
          metadata: {
            ...openMetadata,
            focusChoice: {
              index: 1,
              activityId: 'a1',
              name: 'Morning walk',
              chosenAt: '2026-06-28T11:00:00.000Z',
            },
          },
        },
      ],
    });
    const service = new WeeklyRecapFocusService(prisma as never);

    await service.handleFocusReply(USER_ID, 2, TZ);
    expect(logUpdate).not.toHaveBeenCalled();
  });

  it('no-ops for out-of-range index', () => {
    expect(resolveRecapFocusChoice(openMetadata, 3)).toBeNull();
  });
});

describe('recap focus reply window', () => {
  it('accepts replies within seven days of send', () => {
    expect(
      isRecapFocusReplyWindowOpen(
        SENT_AT,
        TZ,
        new Date('2026-07-04T09:00:00.000Z'),
      ),
    ).toBe(true);
  });

  it('rejects replies after window end', () => {
    expect(
      isRecapFocusReplyWindowOpen(
        SENT_AT,
        TZ,
        new Date('2026-07-20T12:00:00.000Z'),
      ),
    ).toBe(false);
  });
});

describe('findOpenRecapFocusLog', () => {
  it('selects latest sent recap with options and no choice', async () => {
    const { prisma } = createPrisma({
      logs: [
        {
          id: 'old',
          userId: USER_ID,
          date: new Date('2026-06-15T00:00:00.000Z'),
          sentAt: new Date('2026-06-21T10:00:00.000Z'),
          metadata: {
            focusOptions: [
              { index: 1, activityId: 'x', name: 'Old' },
              { index: 2, activityId: 'y', name: 'Stale' },
            ],
            focusChoice: {
              index: 1,
              activityId: 'x',
              name: 'Old',
              chosenAt: '2026-06-21T11:00:00.000Z',
            },
          },
        },
        {
          id: 'open',
          userId: USER_ID,
          date: RECAP_DATE,
          sentAt: SENT_AT,
          metadata: openMetadata,
        },
      ],
    });
    const service = new WeeklyRecapFocusService(prisma as never);
    const log = await service.findOpenRecapFocusLog(USER_ID);
    expect(log?.id).toBe('open');
    expect(log?.metadata).toEqual(openMetadata);
  });
});
