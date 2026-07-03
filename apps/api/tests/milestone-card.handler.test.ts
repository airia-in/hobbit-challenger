import { describe, expect, it, vi } from 'vitest';
import { createMilestoneCardHandler } from '../src/milestones/milestone-card.handler';

function createHandler(overrides?: {
  userId?: string | null;
  userName?: string;
  earned?: boolean;
  authUserId?: string;
}) {
  const userId = overrides?.userId ?? 'user-1';
  const earned = overrides?.earned ?? true;
  const authUserId = overrides?.authUserId ?? userId;

  const cardService = {
    getCardDirectory: () => '/tmp/milestone-cards',
    getOrCreateCard: vi.fn(async () => ({
      buffer: Buffer.from('png-bytes'),
      width: 900,
      height: 1200,
      mimeType: 'image/png' as const,
      cachePath: `/tmp/milestone-cards/user-1_streak_7_a1b2c3d4e5f6.png`,
    })),
  };

  const authService = {
    verifyToken: vi.fn(() => (authUserId ? { userId: authUserId } : null)),
  };

  const prisma = {
    user: {
      findUnique: vi.fn(async () =>
        userId ? { id: userId, name: overrides?.userName ?? 'Sam' } : null,
      ),
    },
    userMilestone: {
      findUnique: vi.fn(async () =>
        earned ? { milestoneKey: 'streak_7' } : null,
      ),
    },
    productEvent: {
      create: vi.fn(async () => ({})),
    },
  };

  const handler = createMilestoneCardHandler({
    cardService,
    authService,
    prisma: prisma as never,
  });

  return { handler, cardService, prisma, authService };
}

describe('milestone card download handler', () => {
  it('rejects unauthenticated requests', async () => {
    const { handler } = createHandler({ authUserId: null });
    const reply = {
      status: vi.fn(() => ({ send: vi.fn() })),
      header: vi.fn().mockReturnThis(),
      send: vi.fn(),
    };

    await handler(
      { headers: {}, params: { milestoneKey: 'streak_7' } },
      reply as never,
    );

    expect(reply.status).toHaveBeenCalledWith(401);
  });

  it('rejects cards for milestones the user has not earned', async () => {
    const { handler, cardService } = createHandler({ earned: false });
    const send = vi.fn();
    const reply = {
      status: vi.fn(() => ({ send })),
      header: vi.fn().mockReturnThis(),
      send: vi.fn(),
    };

    await handler(
      {
        headers: { authorization: 'Bearer token' },
        params: { milestoneKey: 'streak_7' },
      },
      reply as never,
    );

    expect(reply.status).toHaveBeenCalledWith(404);
    expect(cardService.getOrCreateCard).not.toHaveBeenCalled();
  });

  it('returns 404 for cross-user milestone without generating a card', async () => {
    const { handler, cardService } = createHandler({
      authUserId: 'user-a',
      earned: false,
    });
    const send = vi.fn();
    const reply = {
      status: vi.fn(() => ({ send })),
      header: vi.fn().mockReturnThis(),
      send: vi.fn(),
    };

    await handler(
      {
        headers: { authorization: 'Bearer token' },
        params: { milestoneKey: 'streak_7' },
      },
      reply as never,
    );

    expect(reply.status).toHaveBeenCalledWith(404);
    expect(cardService.getOrCreateCard).not.toHaveBeenCalled();
  });

  it('generates card for owner and tracks share analytics', async () => {
    const { handler, cardService, prisma } = createHandler();
    const send = vi.fn();
    const reply = {
      status: vi.fn(() => ({ send })),
      header: vi.fn().mockReturnThis(),
      send,
    };

    await handler(
      {
        headers: { authorization: 'Bearer token' },
        params: { milestoneKey: 'streak_7' },
      },
      reply as never,
    );

    expect(cardService.getOrCreateCard).toHaveBeenCalledWith({
      userId: 'user-1',
      firstName: 'Sam',
      milestoneKey: 'streak_7',
    });
    expect(prisma.productEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventKey: 'milestone.shared',
          metadata: { milestoneKey: 'streak_7', channel: 'web' },
        }),
      }),
    );
    expect(reply.header).toHaveBeenCalledWith('Content-Type', 'image/png');
    expect(send).toHaveBeenCalledWith(Buffer.from('png-bytes'));
  });

  it('serves the in-memory buffer so pruning cannot delete the file mid-download', async () => {
    // The card buffer returned by getOrCreateCard is sent directly; the handler
    // never re-reads cachePath from disk, so a concurrent prune of an older
    // cached version cannot race an in-flight download.
    const { handler, cardService } = createHandler();
    const send = vi.fn();
    const reply = {
      status: vi.fn(() => ({ send })),
      header: vi.fn().mockReturnThis(),
      send,
    };

    await handler(
      {
        headers: { authorization: 'Bearer token' },
        params: { milestoneKey: 'streak_7' },
      },
      reply as never,
    );

    const sent = send.mock.calls[0]?.[0];
    expect(Buffer.isBuffer(sent)).toBe(true);
    expect(cardService.getOrCreateCard).toHaveBeenCalledTimes(1);
  });
});
