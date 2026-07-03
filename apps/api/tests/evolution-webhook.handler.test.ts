import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import {
  buildEvolutionWebhookAuthConfig,
  createEvolutionWebhookHandler,
} from '../src/whatsapp/evolution-webhook.handler';
import {
  logWebhookAuthStartupWarning,
  verifyEvolutionWebhook,
} from '../src/whatsapp/evolution-inbound-auth';
import { CHECKIN_BUTTON_DONE } from '../src/whatsapp/interactive-checkin.constants';
import {
  MAX_WEBHOOK_BODY_BYTES,
  WEBHOOK_MESSAGE_MAX_AGE_MS,
} from '../src/whatsapp/evolution-inbound.parser';
import {
  createWebhookRateLimitPreHandlers,
  registerAbuseRateLimits,
} from '../src/rate-limit';

const NOW_SEC = Math.floor(Date.now() / 1000);

describe('verifyEvolutionWebhook', () => {
  it('rejects invalid secret in production', () => {
    const result = verifyEvolutionWebhook(
      { headers: { authorization: 'Bearer wrong' }, body: {} },
      {
        webhookSecret: 'secret',
      },
    );
    expect(result.ok).toBe(false);
  });

  it('accepts bearer token', () => {
    const result = verifyEvolutionWebhook(
      { headers: { authorization: 'Bearer secret' }, body: {} },
      { webhookSecret: 'secret' },
    );
    expect(result.ok).toBe(true);
  });

  it('fails closed when secret is unset in all environments', () => {
    const result = verifyEvolutionWebhook(
      { headers: {}, body: {} },
      { webhookSecret: undefined, allowUnauthenticated: false },
    );
    expect(result.ok).toBe(false);
  });

  it('allows unauthenticated only with explicit dev flag', () => {
    const result = verifyEvolutionWebhook(
      { headers: {}, body: {} },
      { allowUnauthenticated: true },
    );
    expect(result.ok).toBe(true);
  });

  it('requires apikey when EVOLUTION_API_KEY is configured', () => {
    const result = verifyEvolutionWebhook(
      {
        headers: { authorization: 'Bearer secret' },
        body: { apikey: 'wrong', instance: 'inst' },
      },
      {
        webhookSecret: 'secret',
        evolutionApiKey: 'expected-key',
        evolutionInstance: 'inst',
      },
    );
    expect(result.ok).toBe(false);
  });

  it('requires instance when EVOLUTION_INSTANCE is configured', () => {
    const result = verifyEvolutionWebhook(
      {
        headers: { authorization: 'Bearer secret' },
        body: { apikey: 'expected-key', instance: 'wrong' },
      },
      {
        webhookSecret: 'secret',
        evolutionApiKey: 'expected-key',
        evolutionInstance: 'inst',
      },
    );
    expect(result.ok).toBe(false);
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
      messageTimestamp: NOW_SEC,
    },
  };

  it('returns 401 when secret is unset (fail closed)', async () => {
    const handler = createEvolutionWebhookHandler({
      interactiveCheckin: { handleInbound: vi.fn() },
      authConfig: buildEvolutionWebhookAuthConfig({}),
    });

    const reply = createReply();
    await handler({ headers: {}, body: validPayload }, reply as never);

    expect(reply.status).toHaveBeenCalledWith(401);
  });

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

  it('rejects stale messageTimestamp before handleInbound', async () => {
    const handleInbound = vi.fn();
    const handler = createEvolutionWebhookHandler({
      interactiveCheckin: { handleInbound },
      authConfig: buildEvolutionWebhookAuthConfig({
        EVOLUTION_WEBHOOK_SECRET: 'secret',
        EVOLUTION_WEBHOOK_ALLOW_UNAUTHENTICATED: 'true',
      }),
    });

    const stalePayload = {
      ...validPayload,
      data: {
        ...validPayload.data,
        messageTimestamp:
          NOW_SEC - Math.ceil(WEBHOOK_MESSAGE_MAX_AGE_MS / 1000) - 60,
      },
    };

    const reply = createReply();
    await handler(
      {
        headers: { authorization: 'Bearer secret' },
        body: stalePayload,
      },
      reply as never,
    );

    expect(handleInbound).not.toHaveBeenCalled();
    expect(reply.status).toHaveBeenCalledWith(200);
  });
});

describe('webhook route integration', () => {
  it('rejects oversize payloads before handler via bodyLimit', async () => {
    const app = Fastify();
    const authService = { verifyToken: () => null };
    const config = await registerAbuseRateLimits(app, {
      authService,
      config: {
        auth: { max: 100, timeWindow: 60_000 },
        guidance: { max: 100, timeWindow: 60_000 },
        uploads: { max: 100, timeWindow: 60_000 },
        webhook: { max: 100, timeWindow: 60_000 },
      },
    });
    const preHandlers = createWebhookRateLimitPreHandlers(app, config);

    app.post(
      '/api/webhooks/evolution',
      {
        bodyLimit: MAX_WEBHOOK_BODY_BYTES,
        preHandler: preHandlers,
      },
      createEvolutionWebhookHandler({
        interactiveCheckin: { handleInbound: vi.fn() },
        authConfig: buildEvolutionWebhookAuthConfig({
          EVOLUTION_WEBHOOK_ALLOW_UNAUTHENTICATED: 'true',
        }),
      }),
    );

    try {
      await app.ready();
      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/evolution',
        payload: { blob: 'x'.repeat(70_000) },
      });
      expect(response.statusCode).toBe(413);
    } finally {
      await app.close();
    }
  });

  it('enforces both IP and phone webhook rate limits', async () => {
    const app = Fastify();
    const authService = { verifyToken: () => null };
    const config = await registerAbuseRateLimits(app, {
      authService,
      config: {
        auth: { max: 100, timeWindow: 60_000 },
        guidance: { max: 100, timeWindow: 60_000 },
        uploads: { max: 100, timeWindow: 60_000 },
        webhook: { max: 1, timeWindow: 60_000 },
      },
    });
    const preHandlers = createWebhookRateLimitPreHandlers(app, config);
    const payload = {
      event: 'messages.upsert',
      data: {
        key: {
          remoteJid: '919876543210@s.whatsapp.net',
          fromMe: false,
          id: 'msg-rate-1',
        },
        messageTimestamp: NOW_SEC,
      },
    };

    app.post(
      '/api/webhooks/evolution',
      {
        bodyLimit: MAX_WEBHOOK_BODY_BYTES,
        preHandler: preHandlers,
      },
      createEvolutionWebhookHandler({
        interactiveCheckin: { handleInbound: vi.fn() },
        authConfig: buildEvolutionWebhookAuthConfig({
          EVOLUTION_WEBHOOK_ALLOW_UNAUTHENTICATED: 'true',
        }),
      }),
    );

    try {
      await app.ready();
      const first = await app.inject({
        method: 'POST',
        url: '/api/webhooks/evolution',
        payload,
      });
      const second = await app.inject({
        method: 'POST',
        url: '/api/webhooks/evolution',
        payload: {
          ...payload,
          data: {
            ...payload.data,
            key: { ...payload.data.key, id: 'msg-rate-2' },
          },
        },
      });
      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(429);
    } finally {
      await app.close();
    }
  });
});

describe('logWebhookAuthStartupWarning', () => {
  it('warns when secret unset and fail-closed', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logWebhookAuthStartupWarning({});
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
