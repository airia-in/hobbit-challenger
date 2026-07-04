import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appRouter } from '../src/trpc/router';
import type { Context } from '../src/trpc/context';
import { ADMIN_TOKEN_ENV } from '../src/utils/admin-analytics-auth';

const ADMIN_TOKEN = 'test-admin-token';

function createContext(
  headers: Record<string, string | string[] | undefined> = {},
  prisma: Partial<Context['prisma']> = {},
): Context {
  return {
    req: { headers } as Context['req'],
    res: {} as Context['res'],
    user: null,
    prisma: prisma as Context['prisma'],
    authService: {} as Context['authService'],
    activitiesService: {} as Context['activitiesService'],
    guidanceService: {} as Context['guidanceService'],
  };
}

describe('analytics router (admin-gated)', () => {
  const previous = process.env[ADMIN_TOKEN_ENV];

  beforeEach(() => {
    process.env[ADMIN_TOKEN_ENV] = ADMIN_TOKEN;
  });

  afterEach(() => {
    if (previous === undefined) {
      delete process.env[ADMIN_TOKEN_ENV];
    } else {
      process.env[ADMIN_TOKEN_ENV] = previous;
    }
  });

  it('registers the analytics procedures', () => {
    expect(appRouter._def.procedures).toHaveProperty('analytics.d7Cohort');
    expect(appRouter._def.procedures).toHaveProperty(
      'analytics.streakSurvival',
    );
    expect(appRouter._def.procedures).toHaveProperty(
      'analytics.reminderLatency',
    );
    expect(appRouter._def.procedures).toHaveProperty('analytics.report');
  });

  it('rejects requests without an admin token', async () => {
    const caller = appRouter.createCaller(createContext());
    await expect(caller.analytics.d7Cohort()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('rejects requests with a wrong admin token', async () => {
    const caller = appRouter.createCaller(
      createContext({ 'x-admin-token': 'nope' }),
    );
    await expect(caller.analytics.report()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('fails closed when the token env var is unset', async () => {
    delete process.env[ADMIN_TOKEN_ENV];
    const caller = appRouter.createCaller(
      createContext({ 'x-admin-token': ADMIN_TOKEN }),
    );
    await expect(caller.analytics.d7Cohort()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('serves aggregates for a valid admin token', async () => {
    const rows = [
      {
        cohort_week_start: '2026-06-29',
        registered: 2,
        d7_checkin_users: 1,
        d7_checkin_rate_pct: 50,
      },
    ];
    const prisma = { $queryRawUnsafe: vi.fn().mockResolvedValue(rows) };
    const caller = appRouter.createCaller(
      createContext({ 'x-admin-token': ADMIN_TOKEN }, prisma),
    );

    await expect(caller.analytics.d7Cohort()).resolves.toEqual(rows);
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
  });
});
