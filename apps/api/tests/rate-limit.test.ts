import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import {
  type AbuseRateLimitConfig,
  getAbuseRateLimitConfig,
  getTrpcRateLimitTargets,
  getUploadRateLimitConfig,
  registerAbuseRateLimits,
} from '../src/rate-limit';

const strictConfig: AbuseRateLimitConfig = {
  auth: { max: 1, timeWindow: 60_000 },
  guidance: { max: 1, timeWindow: 60_000 },
  uploads: { max: 1, timeWindow: 60_000 },
  webhook: { max: 1, timeWindow: 60_000 },
};

const authService = {
  verifyToken: () => ({ userId: 'user-1' }),
};

describe('getTrpcRateLimitTargets', () => {
  it('matches auth procedures', () => {
    expect(getTrpcRateLimitTargets('/trpc/auth.login')).toEqual(['auth']);
    expect(getTrpcRateLimitTargets('/trpc/auth.register?batch=1')).toEqual([
      'auth',
    ]);
  });

  it('matches guidance.ask procedures', () => {
    expect(getTrpcRateLimitTargets('/trpc/guidance.ask')).toEqual(['guidance']);
  });

  it('matches batched auth and guidance procedures', () => {
    expect(
      getTrpcRateLimitTargets('/trpc/auth.login,guidance.ask?batch=1'),
    ).toEqual(['auth', 'guidance']);
  });

  it('ignores unrelated procedures and non-tRPC paths', () => {
    expect(getTrpcRateLimitTargets('/trpc/auth.me')).toEqual([]);
    expect(getTrpcRateLimitTargets('/api/uploads')).toEqual([]);
  });

  it('ignores malformed encoded procedure names', () => {
    expect(getTrpcRateLimitTargets('/trpc/%E0%A4%A')).toEqual([]);
  });
});

describe('getAbuseRateLimitConfig', () => {
  it('uses sensible positive defaults', () => {
    expect(getAbuseRateLimitConfig({})).toEqual({
      auth: { max: 20, timeWindow: 60_000 },
      guidance: { max: 20, timeWindow: 600_000 },
      uploads: { max: 30, timeWindow: 60_000 },
      webhook: { max: 60, timeWindow: 60_000 },
    });
  });

  it('allows positive integer env overrides and ignores invalid values', () => {
    expect(
      getAbuseRateLimitConfig({
        AUTH_RATE_LIMIT_MAX: '7',
        AUTH_RATE_LIMIT_WINDOW_MS: '30000',
        GUIDANCE_RATE_LIMIT_MAX: 'not-a-number',
        GUIDANCE_RATE_LIMIT_WINDOW_MS: '-1',
        UPLOAD_RATE_LIMIT_MAX: '3',
        UPLOAD_RATE_LIMIT_WINDOW_MS: '45000',
      }),
    ).toEqual({
      auth: { max: 7, timeWindow: 30_000 },
      guidance: { max: 20, timeWindow: 600_000 },
      uploads: { max: 3, timeWindow: 45_000 },
      webhook: { max: 60, timeWindow: 60_000 },
    });
  });
});

describe('registerAbuseRateLimits', () => {
  it('rate-limits auth tRPC procedures', async () => {
    const app = Fastify();
    await registerAbuseRateLimits(app, {
      authService,
      config: strictConfig,
    });
    app.post('/trpc/auth.login', async () => ({ ok: true }));

    try {
      await app.ready();

      expect(
        await app.inject({ method: 'POST', url: '/trpc/auth.login' }),
      ).toMatchObject({ statusCode: 200 });
      expect(
        await app.inject({ method: 'POST', url: '/trpc/auth.login' }),
      ).toMatchObject({ statusCode: 429 });
    } finally {
      await app.close();
    }
  });

  it('rate-limits guidance tRPC procedures', async () => {
    const app = Fastify();
    await registerAbuseRateLimits(app, {
      authService,
      config: strictConfig,
    });
    app.post('/trpc/guidance.ask', async () => ({ ok: true }));

    try {
      await app.ready();

      expect(
        await app.inject({
          method: 'POST',
          url: '/trpc/guidance.ask',
          headers: { authorization: 'Bearer token' },
        }),
      ).toMatchObject({ statusCode: 200 });
      expect(
        await app.inject({
          method: 'POST',
          url: '/trpc/guidance.ask',
          headers: { authorization: 'Bearer token' },
        }),
      ).toMatchObject({ statusCode: 429 });
    } finally {
      await app.close();
    }
  });

  it('rate-limits upload routes with route config', async () => {
    const app = Fastify();
    const config = await registerAbuseRateLimits(app, {
      authService,
      config: strictConfig,
    });
    app.post(
      '/api/uploads',
      {
        config: {
          rateLimit: getUploadRateLimitConfig(config, authService),
        },
      },
      async () => ({ ok: true }),
    );

    try {
      await app.ready();

      expect(
        await app.inject({
          method: 'POST',
          url: '/api/uploads',
          headers: { authorization: 'Bearer token' },
        }),
      ).toMatchObject({ statusCode: 200 });
      expect(
        await app.inject({
          method: 'POST',
          url: '/api/uploads',
          headers: { authorization: 'Bearer token' },
        }),
      ).toMatchObject({ statusCode: 429 });
    } finally {
      await app.close();
    }
  });
});
