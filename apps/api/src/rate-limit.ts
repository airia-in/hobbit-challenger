import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AuthService } from './services/auth.service';

export type AbuseRateLimitConfig = {
  auth: {
    max: number;
    timeWindow: number;
  };
  guidance: {
    max: number;
    timeWindow: number;
  };
  uploads: {
    max: number;
    timeWindow: number;
  };
  webhook: {
    max: number;
    timeWindow: number;
  };
};

type TrpcRateLimitTarget = 'auth' | 'guidance';

const DEFAULT_AUTH_MAX = 20;
const DEFAULT_AUTH_WINDOW_MS = 60_000;
const DEFAULT_GUIDANCE_MAX = 20;
const DEFAULT_GUIDANCE_WINDOW_MS = 10 * 60_000;
const DEFAULT_UPLOAD_MAX = 30;
const DEFAULT_UPLOAD_WINDOW_MS = 60_000;
const DEFAULT_WEBHOOK_MAX = 60;
const DEFAULT_WEBHOOK_WINDOW_MS = 60_000;

const AUTH_PROCEDURES = new Set(['auth.login', 'auth.register']);
const GUIDANCE_PROCEDURES = new Set(['guidance.ask']);

export function getAbuseRateLimitConfig(
  env: Record<string, string | undefined> = process.env,
): AbuseRateLimitConfig {
  return {
    auth: {
      max: parsePositiveInteger(env.AUTH_RATE_LIMIT_MAX, DEFAULT_AUTH_MAX),
      timeWindow: parsePositiveInteger(
        env.AUTH_RATE_LIMIT_WINDOW_MS,
        DEFAULT_AUTH_WINDOW_MS,
      ),
    },
    guidance: {
      max: parsePositiveInteger(
        env.GUIDANCE_RATE_LIMIT_MAX,
        DEFAULT_GUIDANCE_MAX,
      ),
      timeWindow: parsePositiveInteger(
        env.GUIDANCE_RATE_LIMIT_WINDOW_MS,
        DEFAULT_GUIDANCE_WINDOW_MS,
      ),
    },
    uploads: {
      max: parsePositiveInteger(env.UPLOAD_RATE_LIMIT_MAX, DEFAULT_UPLOAD_MAX),
      timeWindow: parsePositiveInteger(
        env.UPLOAD_RATE_LIMIT_WINDOW_MS,
        DEFAULT_UPLOAD_WINDOW_MS,
      ),
    },
    webhook: {
      max: parsePositiveInteger(
        env.WEBHOOK_RATE_LIMIT_MAX,
        DEFAULT_WEBHOOK_MAX,
      ),
      timeWindow: parsePositiveInteger(
        env.WEBHOOK_RATE_LIMIT_WINDOW_MS,
        DEFAULT_WEBHOOK_WINDOW_MS,
      ),
    },
  };
}

export async function registerAbuseRateLimits(
  fastify: FastifyInstance,
  deps: {
    authService: Pick<AuthService, 'verifyToken'>;
    config?: AbuseRateLimitConfig;
  },
): Promise<AbuseRateLimitConfig> {
  const config = deps.config ?? getAbuseRateLimitConfig();

  await fastify.register(rateLimit, {
    global: false,
    keyGenerator: (request) => request.ip,
    errorResponseBuilder: (_request, context) =>
      buildRateLimitError(context.ttl),
  });

  const authLimiter = fastify.createRateLimit({
    max: config.auth.max,
    timeWindow: config.auth.timeWindow,
    keyGenerator: (request) => `auth:${request.ip}`,
  });
  const guidanceLimiter = fastify.createRateLimit({
    max: config.guidance.max,
    timeWindow: config.guidance.timeWindow,
    keyGenerator: (request) =>
      `guidance:${getUserOrIpRateLimitKey(request, deps.authService)}`,
  });

  fastify.addHook('preHandler', async (request, reply) => {
    for (const target of getTrpcRateLimitTargets(request.url)) {
      const limit =
        target === 'auth'
          ? await authLimiter(request)
          : await guidanceLimiter(request);

      if (!limit.isAllowed && limit.isExceeded) {
        return sendRateLimitExceeded(reply, limit.ttlInSeconds);
      }
    }
  });

  return config;
}

export function getMilestoneCardRateLimitConfig(
  config: AbuseRateLimitConfig,
  authService: Pick<AuthService, 'verifyToken'>,
) {
  return {
    max: config.uploads.max,
    timeWindow: config.uploads.timeWindow,
    groupId: 'milestone-cards',
    keyGenerator: (request: FastifyRequest) =>
      `milestone-cards:${getUserOrIpRateLimitKey(request, authService)}`,
  };
}

export function getUploadRateLimitConfig(
  config: AbuseRateLimitConfig,
  authService: Pick<AuthService, 'verifyToken'>,
) {
  return {
    max: config.uploads.max,
    timeWindow: config.uploads.timeWindow,
    groupId: 'uploads',
    keyGenerator: (request: FastifyRequest) =>
      `uploads:${getUserOrIpRateLimitKey(request, authService)}`,
  };
}

export function createWebhookRateLimitPreHandlers(
  fastify: FastifyInstance,
  config: AbuseRateLimitConfig,
) {
  const shared = {
    max: config.webhook.max,
    timeWindow: config.webhook.timeWindow,
    errorResponseBuilder: (
      _request: FastifyRequest,
      context: { ttl: number },
    ) => buildRateLimitError(context.ttl),
  };

  const ipLimiter = fastify.rateLimit({
    ...shared,
    groupId: 'webhook-ip',
    keyGenerator: (request) => `webhook:ip:${request.ip}`,
  });

  const phoneLimiter = fastify.rateLimit({
    ...shared,
    groupId: 'webhook-phone',
    keyGenerator: (request) => {
      const phone = extractWebhookBodyPhone(request.body);
      return phone ? `webhook:phone:${phone}` : `webhook:ip:${request.ip}`;
    },
  });

  return [ipLimiter, phoneLimiter];
}

function extractWebhookBodyPhone(body: unknown): string | null {
  const remoteJid = (body as { data?: { key?: { remoteJid?: string } } })?.data
    ?.key?.remoteJid;
  if (!remoteJid) {
    return null;
  }
  const bare = remoteJid.split('@')[0]?.split(':')[0];
  const digits = bare?.replace(/\D/g, '');
  return digits || null;
}

export function getTrpcRateLimitTargets(url: string): TrpcRateLimitTarget[] {
  const procedures = getTrpcProcedures(url);
  const targets: TrpcRateLimitTarget[] = [];

  if (procedures.some((procedure) => AUTH_PROCEDURES.has(procedure))) {
    targets.push('auth');
  }
  if (procedures.some((procedure) => GUIDANCE_PROCEDURES.has(procedure))) {
    targets.push('guidance');
  }

  return targets;
}

function getTrpcProcedures(url: string): string[] {
  const { pathname } = new URL(url, 'http://local.invalid');
  if (!pathname.startsWith('/trpc/')) {
    return [];
  }

  return pathname
    .slice('/trpc/'.length)
    .split(',')
    .map((procedure) => safeDecodeURIComponent(procedure).trim())
    .filter(Boolean);
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return '';
  }
}

function getUserOrIpRateLimitKey(
  request: FastifyRequest,
  authService: Pick<AuthService, 'verifyToken'>,
): string {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (token) {
    const payload = authService.verifyToken(token);
    if (payload) {
      return `user:${payload.userId}`;
    }
  }

  return `ip:${request.ip}`;
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sendRateLimitExceeded(reply: FastifyReply, ttlInSeconds: number) {
  return reply
    .status(429)
    .header('Retry-After', String(ttlInSeconds))
    .send(buildRateLimitError(ttlInSeconds * 1000));
}

function buildRateLimitError(ttlMs: number) {
  const retryAfterSeconds = Math.max(1, Math.ceil(ttlMs / 1000));

  return {
    error: 'Too Many Requests',
    message: `Rate limit exceeded. Try again in ${retryAfterSeconds} seconds.`,
    statusCode: 429,
  };
}
