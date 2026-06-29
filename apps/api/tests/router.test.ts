import { describe, expect, it } from 'vitest';
import { appRouter } from '../src/trpc/router';
import type { Context } from '../src/trpc/context';

function createTestContext(overrides: Partial<Context> = {}): Context {
  return {
    req: { headers: {} } as Context['req'],
    res: {} as Context['res'],
    user: null,
    prisma: {} as Context['prisma'],
    authService: {
      hashPassword: async () => 'hash',
      verifyPassword: async () => true,
      signToken: () => 'token',
      verifyToken: () => null,
      detectTimezone: () => 'UTC',
    } as Context['authService'],
    tasksService: {} as Context['tasksService'],
    ...overrides,
  };
}

describe('appRouter', () => {
  it('exposes DRCODE routers', () => {
    expect(appRouter._def.procedures).toHaveProperty('auth.register');
    expect(appRouter._def.procedures).toHaveProperty('groups.create');
    expect(appRouter._def.procedures).toHaveProperty('tasks.getToday');
    expect(appRouter._def.procedures).toHaveProperty('leaderboard.get');
  });

  it('rejects unauthenticated auth.me', async () => {
    const caller = appRouter.createCaller(createTestContext());

    await expect(caller.auth.me()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('rejects unauthenticated group creation', async () => {
    const caller = appRouter.createCaller(createTestContext());

    await expect(caller.groups.create({ name: 'Squad' })).rejects.toMatchObject(
      { code: 'UNAUTHORIZED' },
    );
  });
});
