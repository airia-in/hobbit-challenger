import { timingSafeEqual } from 'node:crypto';

/** Header carrying the analytics admin token (env-gated admin surface). */
export const ADMIN_TOKEN_HEADER = 'x-admin-token';

/** Env var holding the shared analytics admin token. Unset => surface disabled. */
export const ADMIN_TOKEN_ENV = 'ADMIN_ANALYTICS_TOKEN';

type AdminAuthEnv = Record<string, string | undefined>;

/**
 * Constant-time check that `token` matches the configured admin token.
 *
 * Fails closed: returns `false` when the env token is unset/empty, so the
 * analytics surface stays disabled until an operator provisions a secret.
 */
export function isAnalyticsAdminToken(
  token: string | undefined,
  env: AdminAuthEnv = process.env,
): boolean {
  const expected = env[ADMIN_TOKEN_ENV]?.trim();
  if (!expected) {
    return false;
  }
  if (typeof token !== 'string' || token.length === 0) {
    return false;
  }

  const provided = Buffer.from(token);
  const secret = Buffer.from(expected);
  if (provided.length !== secret.length) {
    return false;
  }
  return timingSafeEqual(provided, secret);
}

/**
 * Reads the admin token from request headers (case-insensitive; supports the
 * array form Fastify may produce for repeated headers).
 */
export function extractAdminToken(
  headers: Record<string, string | string[] | undefined> | undefined,
): string | undefined {
  const raw = headers?.[ADMIN_TOKEN_HEADER];
  if (Array.isArray(raw)) {
    return raw[0];
  }
  return raw;
}
