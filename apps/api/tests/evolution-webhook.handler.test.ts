import { describe, expect, it, vi } from 'vitest';
import {
  buildEvolutionWebhookAuthConfig,
  createEvolutionWebhookHandler,
} from '../src/whatsapp/evolution-webhook.handler';
import { verifyEvolutionWebhook } from '../src/whatsapp/evolution-inbound-auth';
import { CHECKIN_BUTTON_DONE } from '../src/whatsapp/interactive-checkin.constants';

describe('verifyEvolutionWebhook', () => {
  it('rejects invalid secret in production', () => {
    const result = verifyEvolutionWebhook(
      { headers: { authorization: 'Bearer wrong' }, body: {} },
      {
        webhookSecret: 'secret',
        nodeEnv: 'production',
      },
    );
    expect(result.ok).toBe(false);
  });

  it('accepts bearer token', () => {
    const result = verifyEvolutionWebhook(
      { headers: { authorization: 'Bearer secret' }, body: {} },
      { webhookSecret: 'secret', nodeEnv: 'production' },
    );
    expect(result.ok).toBe(true);
  });
});

describe('createEvolutionWebhookHandler', () => {
  function createReply() {
    const send = vi.fn();
    return {
      status: vi.fn(() => ({ send })),
      send,
    };
  }

  const validPayload = {
    event: 'messages.upsert',
    data: {
      key: {
        remoteJid: '919876543210@s.whatsapp.net',
        fromMe: false,
        id: 'msg-1',
      },
      message: {
        buttonsResponseMessage: { selectedButtonId: CHECKIN_BUTTON_DONE },
      },
    },
  };

  it('returns 401 for invalid secret in production', async () => {
    const handler = createEvolutionWebhookHandler({
      interactiveCheckin: { handleInbound: vi.fn() },
      authConfig: buildEvolutionWebhookAuthConfig({
        EVOLUTION_WEBHOOK_SECRET: 'secret',
        NODE_ENV: 'production',
      }),
    });

    const reply = createReply();
    await handler({ headers: {}, body: validPayload }, reply as never);

    expect(reply.status).toHaveBeenCalledWith(401);
  });

  it('returns 200 and delegates on valid secret', async () => {
    const handleInbound = vi.fn().mockResolvedValue(undefined);
    const handler = createEvolutionWebhookHandler({
      interactiveCheckin: { handleInbound },
      authConfig: buildEvolutionWebhookAuthConfig({
        EVOLUTION_WEBHOOK_SECRET: 'secret',
        NODE_ENV: 'production',
      }),
    });

    const reply = createReply();
    await handler(
      {
        headers: { authorization: 'Bearer secret' },
        body: validPayload,
      },
      reply as never,
    );

    expect(reply.status).toHaveBeenCalledWith(200);
    expect(handleInbound).toHaveBeenCalledTimes(1);
  });

  it('rejects oversize payloads with 200 no-op', async () => {
    const handleInbound = vi.fn();
    const handler = createEvolutionWebhookHandler({
      interactiveCheckin: { handleInbound },
      authConfig: buildEvolutionWebhookAuthConfig({
        NODE_ENV: 'test',
      }),
    });

    const reply = createReply();
    const huge = { blob: 'x'.repeat(70_000) };
    await handler({ headers: {}, body: huge }, reply as never);

    expect(handleInbound).not.toHaveBeenCalled();
    expect(reply.status).toHaveBeenCalledWith(200);
  });
});
