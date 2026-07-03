import { describe, expect, it, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import {
  seedSoloActivities,
  ensureSoloActivities,
} from '@workspace-starter/db';
import { authRouter } from '../src/trpc/routers/auth.router';
import { DEFAULT_CHALLENGE_WINDOW_DAYS } from '../src/utils/challenge-range';
import type { Context } from '../src/trpc/context';

vi.mock('@workspace-starter/db', async (importOriginal) => ({
  ...(await importOriginal()),
  seedSoloActivities: vi.fn(async () => {}),
  ensureSoloActivities: vi.fn(async () => true),
}));

const USER_ID = 'user-1';
const PHONE = '+919876543210';
const PASSWORD = 'password123';
const PASSWORD_HASH = 'hashed';

type StoredUser = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  passwordHash: string;
  timezone: string;
  avatarUrl: string | null;
  groupId: string | null;
};

function createAuthContext(
  stores: {
    users: Map<string, StoredUser>;
    usersByPhone: Map<string, StoredUser>;
    usersByEmail: Map<string, StoredUser>;
    challenges: Array<{
      userId: string;
      startDate: Date;
      endDate: Date;
      lengthDays: number;
    }>;
  },
  authOverrides: Partial<Context['authService']> = {},
): Context {
  const prisma = {
    user: {
      findUnique: vi.fn(
        async ({ where }: { where: Record<string, string> }) => {
          if ('phone' in where)
            return stores.usersByPhone.get(where.phone) ?? null;
          if ('email' in where)
            return stores.usersByEmail.get(where.email) ?? null;
          if ('id' in where) return stores.users.get(where.id) ?? null;
          return null;
        },
      ),
      create: vi.fn(),
    },
    challenge: {
      create: vi.fn(),
      findFirst: vi.fn(async () => null),
    },
    $transaction: vi.fn(async (fn: (tx: typeof prisma) => Promise<unknown>) => {
      const tx = {
        user: {
          create: vi.fn(
            async ({
              data,
              select,
            }: {
              data: Omit<StoredUser, 'id' | 'avatarUrl' | 'groupId'> & {
                avatarUrl?: null;
                groupId?: null;
              };
              select: Record<string, boolean>;
            }) => {
              const created: StoredUser = {
                id: USER_ID,
                name: data.name,
                phone: data.phone ?? null,
                email: data.email ?? null,
                passwordHash: data.passwordHash,
                timezone: data.timezone,
                avatarUrl: null,
                groupId: null,
              };
              stores.users.set(created.id, created);
              if (created.phone)
                stores.usersByPhone.set(created.phone, created);
              if (created.email)
                stores.usersByEmail.set(created.email, created);
              return Object.fromEntries(
                Object.keys(select).map((key) => [
                  key,
                  created[key as keyof StoredUser],
                ]),
              );
            },
          ),
        },
        challenge: {
          create: vi.fn(
            async ({
              data,
            }: {
              data: {
                userId: string;
                startDate: Date;
                endDate: Date;
                lengthDays: number;
              };
            }) => {
              stores.challenges.push(data);
              return data;
            },
          ),
        },
      };
      return fn(tx as unknown as typeof prisma);
    }),
  };

  return {
    req: { headers: {} } as Context['req'],
    res: {} as Context['res'],
    user: null,
    prisma: prisma as unknown as Context['prisma'],
    authService: {
      hashPassword: vi.fn(async () => PASSWORD_HASH),
      verifyPassword: vi.fn(async (password: string, hash: string) => {
        return password === PASSWORD && hash === PASSWORD_HASH;
      }),
      signToken: vi.fn(() => 'jwt-token'),
      verifyToken: vi.fn(() => null),
      detectTimezone: vi.fn(() => 'Asia/Kolkata'),
      ...authOverrides,
    } as Context['authService'],
    activitiesService: {} as Context['activitiesService'],
  };
}

describe('authRouter register/login', () => {
  it('registers with phone and creates initial challenge', async () => {
    const stores = {
      users: new Map<string, StoredUser>(),
      usersByPhone: new Map<string, StoredUser>(),
      usersByEmail: new Map<string, StoredUser>(),
      challenges: [] as Array<{ userId: string }>,
    };
    const ctx = createAuthContext(stores);
    const caller = authRouter.createCaller(ctx);

    const result = await caller.register({
      name: 'Mokshit',
      phone: '9876543210',
      password: PASSWORD,
    });

    expect(result.token).toBe('jwt-token');
    expect(result.user.phone).toBe(PHONE);
    expect(result.user.email).toBeNull();
    expect(stores.challenges).toHaveLength(1);
    expect(stores.challenges[0]?.lengthDays).toBe(
      DEFAULT_CHALLENGE_WINDOW_DAYS,
    );
    expect(stores.challenges[0]?.endDate).toBeInstanceOf(Date);
    expect(ctx.authService.hashPassword).toHaveBeenCalledWith(PASSWORD);
    expect(seedSoloActivities).toHaveBeenCalledWith(expect.anything(), USER_ID);
  });

  it('rejects duplicate phone on register', async () => {
    const existing: StoredUser = {
      id: USER_ID,
      name: 'Existing',
      phone: PHONE,
      email: null,
      passwordHash: PASSWORD_HASH,
      timezone: 'UTC',
      avatarUrl: null,
      groupId: null,
    };
    const stores = {
      users: new Map([[USER_ID, existing]]),
      usersByPhone: new Map([[PHONE, existing]]),
      usersByEmail: new Map<string, StoredUser>(),
      challenges: [] as Array<{ userId: string }>,
    };
    const caller = authRouter.createCaller(createAuthContext(stores));

    await expect(
      caller.register({
        name: 'New User',
        phone: '9876543210',
        password: PASSWORD,
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Account already exists',
    } satisfies Partial<TRPCError>);
  });

  it('logs in with normalized phone and wrong password fails', async () => {
    const existing: StoredUser = {
      id: USER_ID,
      name: 'Mokshit',
      phone: PHONE,
      email: null,
      passwordHash: PASSWORD_HASH,
      timezone: 'UTC',
      avatarUrl: null,
      groupId: null,
    };
    const stores = {
      users: new Map([[USER_ID, existing]]),
      usersByPhone: new Map([[PHONE, existing]]),
      usersByEmail: new Map<string, StoredUser>(),
      challenges: [] as Array<{ userId: string }>,
    };
    const ctx = createAuthContext(stores, {
      verifyPassword: vi.fn(async () => false),
    });
    const caller = authRouter.createCaller(ctx);

    await expect(
      caller.login({ identifier: '9876543210', password: 'wrong' }),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      message: 'Invalid credentials',
    } satisfies Partial<TRPCError>);
  });

  it('logs in with phone on happy path', async () => {
    const existing: StoredUser = {
      id: USER_ID,
      name: 'Mokshit',
      phone: PHONE,
      email: null,
      passwordHash: PASSWORD_HASH,
      timezone: 'UTC',
      avatarUrl: null,
      groupId: null,
    };
    const stores = {
      users: new Map([[USER_ID, existing]]),
      usersByPhone: new Map([[PHONE, existing]]),
      usersByEmail: new Map<string, StoredUser>(),
      challenges: [] as Array<{ userId: string }>,
    };
    const caller = authRouter.createCaller(createAuthContext(stores));

    const result = await caller.login({
      identifier: '9876543210',
      password: PASSWORD,
    });

    expect(result.token).toBe('jwt-token');
    expect(result.user.phone).toBe(PHONE);
  });

  it('supports transitional email login for legacy users', async () => {
    const existing: StoredUser = {
      id: USER_ID,
      name: 'Legacy',
      phone: null,
      email: 'legacy@example.com',
      passwordHash: PASSWORD_HASH,
      timezone: 'UTC',
      avatarUrl: null,
      groupId: null,
    };
    const stores = {
      users: new Map([[USER_ID, existing]]),
      usersByPhone: new Map<string, StoredUser>(),
      usersByEmail: new Map([['legacy@example.com', existing]]),
      challenges: [] as Array<{ userId: string }>,
    };
    const caller = authRouter.createCaller(createAuthContext(stores));

    const result = await caller.login({
      identifier: 'legacy@example.com',
      password: PASSWORD,
    });

    expect(result.token).toBe('jwt-token');
    expect(result.user.email).toBe('legacy@example.com');
    expect(result.user.phone).toBeNull();
  });

  it('backfills solo seeds on me for groupless users', async () => {
    const existing: StoredUser = {
      id: USER_ID,
      name: 'Legacy',
      phone: PHONE,
      email: null,
      passwordHash: PASSWORD_HASH,
      timezone: 'UTC',
      avatarUrl: null,
      groupId: null,
    };
    const stores = {
      users: new Map([[USER_ID, existing]]),
      usersByPhone: new Map([[PHONE, existing]]),
      usersByEmail: new Map<string, StoredUser>(),
      challenges: [] as Array<{ userId: string }>,
    };
    const caller = authRouter.createCaller({
      ...createAuthContext(stores),
      user: { id: USER_ID },
    });

    const result = await caller.me();

    expect(ensureSoloActivities).toHaveBeenCalledWith(
      expect.anything(),
      USER_ID,
    );
    expect(result.hasSoloSeeds).toBe(true);
  });
});
