import { afterEach, describe, expect, it } from 'vitest';
import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
import { buildInviteUrl } from '../src/utils/invite-url';

type FastifyRequest = CreateFastifyContextOptions['req'];

function mockReq(origin?: string): FastifyRequest {
  return { headers: { origin } } as FastifyRequest;
}

describe('buildInviteUrl', () => {
  const envSnapshot = { ...process.env };

  afterEach(() => {
    process.env = { ...envSnapshot };
  });

  it('uses request Origin when present', () => {
    delete process.env.FRONTEND_URL;
    delete process.env.CORS_ORIGIN;

    expect(buildInviteUrl(mockReq('https://app.example'), 'tok')).toBe(
      'https://app.example/join?token=tok',
    );
  });

  it('prefers FRONTEND_URL over CORS_ORIGIN', () => {
    process.env.FRONTEND_URL = 'http://192.168.1.10:4321';
    process.env.CORS_ORIGIN = 'http://localhost:4321,http://127.0.0.1:4321';

    expect(buildInviteUrl(mockReq(undefined), 'abc')).toBe(
      'http://192.168.1.10:4321/join?token=abc',
    );
  });

  it('falls back to the first CORS_ORIGIN entry', () => {
    delete process.env.FRONTEND_URL;
    process.env.CORS_ORIGIN = 'http://localhost:4321,http://127.0.0.1:4321';

    expect(buildInviteUrl(mockReq(undefined), 'tok')).toBe(
      'http://localhost:4321/join?token=tok',
    );
  });

  it('falls back to localhost:4321 when unset', () => {
    delete process.env.FRONTEND_URL;
    delete process.env.CORS_ORIGIN;

    expect(buildInviteUrl(mockReq(undefined), 'tok')).toBe(
      'http://localhost:4321/join?token=tok',
    );
  });

  it('strips a trailing slash from the origin', () => {
    process.env.FRONTEND_URL = 'http://localhost:4321/';

    expect(buildInviteUrl(mockReq(undefined), 'tok')).toBe(
      'http://localhost:4321/join?token=tok',
    );
  });

  it('encodes the token in the query string', () => {
    process.env.FRONTEND_URL = 'http://localhost:4321';

    expect(buildInviteUrl(mockReq(undefined), 'a+b/c')).toBe(
      'http://localhost:4321/join?token=a%2Bb%2Fc',
    );
  });
});
