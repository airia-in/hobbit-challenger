import type { PrismaService } from '../prisma/prisma.service';
import type { AuthService } from '../services/auth.service';
import {
  isMilestoneKey,
  isValidMilestoneCardFilename,
  sanitizeFirstNameForCard,
  type MilestoneCardService,
} from '../services/milestone-card.service';
import {
  PRODUCT_EVENT_KEYS,
  trackProductEventFireAndForget,
} from '../services/analytics.service';
import { authenticateUpload } from '../uploads/upload-handler';

type MilestoneCardRequest = {
  headers: { authorization?: string };
  params: { milestoneKey?: string };
};

type MilestoneCardReply = {
  status: (code: number) => { send: (body: unknown) => unknown };
  header: (name: string, value: string) => MilestoneCardReply;
  send: (body: unknown) => unknown;
};

export function createMilestoneCardHandler(deps: {
  cardService: Pick<
    MilestoneCardService,
    'getCardDirectory' | 'getOrCreateCard'
  >;
  authService: Pick<AuthService, 'verifyToken'>;
  prisma: PrismaService;
}) {
  const { cardService, authService, prisma } = deps;

  return async (request: MilestoneCardRequest, reply: MilestoneCardReply) => {
    const auth = await authenticateUpload(request.headers.authorization, {
      authService,
      prisma,
    });
    if (!auth) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const milestoneKey = request.params.milestoneKey;
    if (!milestoneKey || !isMilestoneKey(milestoneKey)) {
      return reply.status(400).send({ error: 'Invalid milestone key' });
    }

    const earned = await prisma.userMilestone.findUnique({
      where: {
        userId_milestoneKey: {
          userId: auth.userId,
          milestoneKey,
        },
      },
      select: { milestoneKey: true },
    });
    if (!earned) {
      return reply.status(404).send({ error: 'Milestone not earned' });
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { name: true },
    });
    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    const card = await cardService.getOrCreateCard({
      userId: auth.userId,
      firstName: sanitizeFirstNameForCard(user.name),
      milestoneKey,
    });

    const filename = card.cachePath.split('/').pop() ?? 'milestone-card.png';
    if (!isValidMilestoneCardFilename(filename)) {
      return reply.status(500).send({ error: 'Invalid card filename' });
    }

    trackProductEventFireAndForget(
      prisma,
      auth.userId,
      PRODUCT_EVENT_KEYS.MILESTONE_SHARED,
      { milestoneKey, channel: 'web' },
    );

    return reply
      .header('Content-Type', 'image/png')
      .header(
        'Content-Disposition',
        `attachment; filename="hobbit-${milestoneKey}.png"`,
      )
      .header('Cache-Control', 'private, max-age=3600')
      .send(card.buffer);
  };
}
