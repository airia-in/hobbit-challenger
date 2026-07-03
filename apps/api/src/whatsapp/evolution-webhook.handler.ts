import type { InteractiveCheckinService } from './interactive-checkin.service';
import { parseEvolutionInbound } from './evolution-inbound.parser';
import {
  logWebhookAuthStartupWarning,
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

export function buildEvolutionWebhookAuthConfig(
  env: Record<string, string | undefined>,
): EvolutionWebhookAuthConfig {
  return {
    webhookSecret: env.EVOLUTION_WEBHOOK_SECRET,
    evolutionApiKey: env.EVOLUTION_API_KEY,
    evolutionInstance: env.EVOLUTION_INSTANCE,
    allowUnauthenticated:
      env.EVOLUTION_WEBHOOK_ALLOW_UNAUTHENTICATED === 'true',
  };
}

export { logWebhookAuthStartupWarning };
