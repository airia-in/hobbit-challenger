import type { InteractiveCheckinService } from './interactive-checkin.service';
import {
  MAX_WEBHOOK_BODY_BYTES,
  parseEvolutionInbound,
} from './evolution-inbound.parser';
import {
  verifyEvolutionWebhook,
  type EvolutionWebhookAuthConfig,
} from './evolution-inbound-auth';

type WebhookRequest = {
  headers: {
    authorization?: string;
    'x-evolution-webhook-secret'?: string;
  };
  body?: unknown;
};

type WebhookReply = {
  status: (code: number) => { send: (body: unknown) => unknown };
};

export function createEvolutionWebhookHandler(deps: {
  interactiveCheckin: Pick<InteractiveCheckinService, 'handleInbound'>;
  authConfig: EvolutionWebhookAuthConfig;
}) {
  return async (request: WebhookRequest, reply: WebhookReply) => {
    const bodySize = estimateBodyBytes(request.body);
    if (bodySize > MAX_WEBHOOK_BODY_BYTES) {
      return reply.status(200).send({ ok: true });
    }

    const auth = verifyEvolutionWebhook(request, deps.authConfig);
    if (!auth.ok) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const parsed = parseEvolutionInbound(request.body);
    if (!parsed) {
      return reply.status(200).send({ ok: true });
    }

    try {
      await deps.interactiveCheckin.handleInbound(parsed);
    } catch {
      // Evolution retries on non-2xx; acknowledge to avoid floods.
      return reply.status(200).send({ ok: true });
    }

    return reply.status(200).send({ ok: true });
  };
}

function estimateBodyBytes(body: unknown): number {
  if (body == null) {
    return 0;
  }
  try {
    return Buffer.byteLength(JSON.stringify(body), 'utf8');
  } catch {
    return MAX_WEBHOOK_BODY_BYTES + 1;
  }
}

export function buildEvolutionWebhookAuthConfig(
  env: Record<string, string | undefined>,
): EvolutionWebhookAuthConfig {
  return {
    webhookSecret: env.EVOLUTION_WEBHOOK_SECRET,
    evolutionApiKey: env.EVOLUTION_API_KEY,
    evolutionInstance: env.EVOLUTION_INSTANCE,
    nodeEnv: env.NODE_ENV,
  };
}
