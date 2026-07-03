import { describe, expect, it, vi } from 'vitest';
import { createMilestoneCardHandler } from '../src/milestones/milestone-card.handler';

vi.mock('node:fs', () => ({
  createReadStream: vi.fn(() => 'stream'),
}));

vi.mock('node:fs/promises', () => ({
  access: vi.fn(async () => undefined),
}));

function createHandler(overrides?: {
  userId?: string | null;
  userName?: string;
  earned?: boolean;
}) {
  const userId = overrides?.userId ?? 'user-1';
  const earned = overrides?.earned ?? true;

  const cardService = {
    getCardDirectory: () => '/tmp/milestone-cards',
    getOrCreateCard: vi.fn(async () => ({
      buffer: Buffer.from('png-bytes'),
      width: 900,
      height: 1200,
      mimeType: 'image/png' as const,
      cachePath: `/tmp/milestone-cards/user-1_streak_7.png`,
    })),
  };

  const authService = {
    verifyToken: vi.fn(() => (userId ? { userId } : null)),
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
    const { handler } = createHandler({ userId: null });
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
    const { handler } = createHandler({ earned: false });
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
    expect(send).toHaveBeenCalledWith('stream');
  });
});
