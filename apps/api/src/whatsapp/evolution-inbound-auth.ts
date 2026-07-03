import { timingSafeEqual } from 'node:crypto';
import type { EvolutionWebhookEnvelope } from './evolution-inbound.types';

export type EvolutionWebhookAuthConfig = {
  webhookSecret?: string;
  evolutionApiKey?: string;
  evolutionInstance?: string;
  nodeEnv?: string;
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
  const isProduction = config.nodeEnv === 'production';

  if (!secret) {
    if (isProduction) {
      return { ok: false, reason: 'Webhook secret not configured' };
    }
    return { ok: true };
  }

  const bearer = extractBearerToken(request.headers.authorization);
  const headerSecret = request.headers['x-evolution-webhook-secret']?.trim();
  const provided = bearer ?? headerSecret;

  if (!provided || !safeEqualStrings(provided, secret)) {
    return { ok: false, reason: 'Invalid webhook secret' };
  }

  const envelope = request.body as EvolutionWebhookEnvelope | undefined;
  if (
    config.evolutionApiKey &&
    envelope?.apikey &&
    !safeEqualStrings(envelope.apikey, config.evolutionApiKey)
  ) {
    return { ok: false, reason: 'Invalid Evolution apikey' };
  }

  if (
    config.evolutionInstance &&
    envelope?.instance &&
    envelope.instance !== config.evolutionInstance
  ) {
    return { ok: false, reason: 'Unexpected Evolution instance' };
  }

  return { ok: true };
}
