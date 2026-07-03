import { timingSafeEqual } from 'node:crypto';
import type { EvolutionWebhookEnvelope } from './evolution-inbound.types';

export type EvolutionWebhookAuthConfig = {
  webhookSecret?: string;
  evolutionApiKey?: string;
  evolutionInstance?: string;
  allowUnauthenticated?: boolean;
};

export type EvolutionWebhookRequest = {
  headers: {
    authorization?: string;
    'x-evolution-webhook-secret'?: string;
  };
  body?: unknown;
};

function safeEqualStrings(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

function extractBearerToken(authorization: string | undefined): string | null {
  if (!authorization) {
    return null;
  }
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

export function verifyEvolutionWebhook(
  request: EvolutionWebhookRequest,
  config: EvolutionWebhookAuthConfig,
): { ok: true } | { ok: false; reason: string } {
  const secret = config.webhookSecret?.trim();

  if (!secret) {
    if (config.allowUnauthenticated) {
      return { ok: true };
    }
    return { ok: false, reason: 'Webhook secret not configured' };
  }

  const bearer = extractBearerToken(request.headers.authorization);
  const headerSecret = request.headers['x-evolution-webhook-secret']?.trim();
  const provided = bearer ?? headerSecret;

  if (!provided || !safeEqualStrings(provided, secret)) {
    return { ok: false, reason: 'Invalid webhook secret' };
  }

  const envelope = request.body as EvolutionWebhookEnvelope | undefined;

  if (config.evolutionApiKey) {
    const apikey = envelope?.apikey?.trim();
    if (!apikey || !safeEqualStrings(apikey, config.evolutionApiKey)) {
      return { ok: false, reason: 'Invalid Evolution apikey' };
    }
  }

  if (config.evolutionInstance) {
    const instance = envelope?.instance?.trim();
    if (!instance || instance !== config.evolutionInstance) {
      return { ok: false, reason: 'Unexpected Evolution instance' };
    }
  }

  return { ok: true };
}

export function isEvolutionInboundConfigured(
  env: Record<string, string | undefined>,
): boolean {
  return (
    Boolean(env.EVOLUTION_WEBHOOK_SECRET?.trim()) ||
    env.EVOLUTION_WEBHOOK_ALLOW_UNAUTHENTICATED === 'true'
  );
}

export function logWebhookAuthStartupWarning(
  env: Record<string, string | undefined>,
): void {
  const secret = env.EVOLUTION_WEBHOOK_SECRET?.trim();
  const allowUnauthenticated =
    env.EVOLUTION_WEBHOOK_ALLOW_UNAUTHENTICATED === 'true';

  if (!secret && !allowUnauthenticated) {
    console.warn(
      '[security] EVOLUTION_WEBHOOK_SECRET is unset — inbound Evolution webhooks will be rejected. ' +
        'Set EVOLUTION_WEBHOOK_SECRET or EVOLUTION_WEBHOOK_ALLOW_UNAUTHENTICATED=true for local dev only.',
    );
    return;
  }

  if (!secret && allowUnauthenticated) {
    console.warn(
      '[security] EVOLUTION_WEBHOOK_ALLOW_UNAUTHENTICATED=true — inbound webhooks accept unauthenticated requests.',
    );
  }
}
