import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';

type FastifyRequest = CreateFastifyContextOptions['req'];

export function buildInviteUrl(req: FastifyRequest, token: string): string {
  const origin =
    (typeof req.headers.origin === 'string' && req.headers.origin) ||
    process.env.FRONTEND_URL ||
    process.env.CORS_ORIGIN?.split(',')[0]?.trim() ||
    'http://localhost:4321';

  return `${origin.replace(/\/$/, '')}/join?token=${encodeURIComponent(token)}`;
}
