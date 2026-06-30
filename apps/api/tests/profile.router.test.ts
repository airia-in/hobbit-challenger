import { describe, expect, it, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { profileRouter } from '../src/trpc/routers/profile.router';
import type { Context } from '../src/trpc/context';

const USER_ID = 'user-legacy';
const OTHER_ID = 'user-other';
const PHONE = '+919876543210';
const OTHER_PHONE = '+919876543211';

type StoredUser = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  passwordHash: string;
  timezone: string;
  avatarUrl: string | null;
  groupId: string | null;
  reminderTime: string | null;
};

function createProfileContext(stores: {
  users: Map<string, StoredUser>;
  usersByPhone: Map<string, StoredUser>;
  usersByEmail: Map<string, StoredUser>;
}): Context {
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
      update: vi.fn(
        async ({
          where,
          data,
          select,
        }: {
          where: { id: string };
          data: Partial<StoredUser>;
          select: Record<string, boolean>;
        }) => {
          const user = stores.users.get(where.id);
          if (!user) throw new Error('User not found');

          const updated: StoredUser = { ...user, ...data };
          stores.users.set(where.id, updated);

          for (const [phone, u] of stores.usersByPhone) {
            if (u.id === where.id) stores.usersByPhone.delete(phone);
          }
          if (updated.phone) stores.usersByPhone.set(updated.phone, updated);

          for (const [email, u] of stores.usersByEmail) {
            if (u.id === where.id) stores.usersByEmail.delete(email);
          }
          if (updated.email) stores.usersByEmail.set(updated.email, updated);

          return Object.fromEntries(
            Object.keys(select).map((key) => [
              key,
              updated[key as keyof StoredUser],
            ]),
          );
        },
      ),
    },
  };

  const legacyUser = stores.users.get(USER_ID)!;

  return {
    req: { headers: {} } as Context['req'],
    res: {} as Context['res'],
    user: {
      id: legacyUser.id,
      email: legacyUser.email,
      phone: legacyUser.phone,
      name: legacyUser.name,
    },
    prisma: prisma as unknown as Context['prisma'],
    authService: {
      hashPassword: vi.fn(async () => 'hashed'),
      verifyPassword: vi.fn(async () => true),
      signToken: vi.fn(() => 'jwt-token'),
      verifyToken: vi.fn(() => null),
      detectTimezone: vi.fn(() => 'Asia/Kolkata'),
    } as Context['authService'],
    activitiesService: {} as Context['activitiesService'],
  };
}

function legacyUserStore(): {
  users: Map<string, StoredUser>;
  usersByPhone: Map<string, StoredUser>;
  usersByEmail: Map<string, StoredUser>;
} {
  const legacy: StoredUser = {
    id: USER_ID,
    name: 'Legacy User',
    phone: null,
    email: 'legacy@example.com',
    passwordHash: 'hash',
    timezone: 'Asia/Kolkata',
    avatarUrl: null,
    groupId: null,
    reminderTime: null,
  };

  return {
    users: new Map([[USER_ID, legacy]]),
    usersByPhone: new Map<string, StoredUser>(),
    usersByEmail: new Map([['legacy@example.com', legacy]]),
  };
}

describe('profileRouter update phone', () => {
  it('adds a phone for legacy email-only users', async () => {
    const stores = legacyUserStore();
    const caller = profileRouter.createCaller(createProfileContext(stores));

    const result = await caller.update({ phone: '9876543210' });

    expect(result.phone).toBe(PHONE);
    expect(stores.users.get(USER_ID)?.phone).toBe(PHONE);
  });

  it('rejects invalid phone on update', async () => {
    const stores = legacyUserStore();
    const caller = profileRouter.createCaller(createProfileContext(stores));

    await expect(caller.update({ phone: 'not-a-phone' })).rejects.toMatchObject(
      {
        code: 'BAD_REQUEST',
        message: 'Invalid phone number',
      } satisfies Partial<TRPCError>,
    );
  });

  it('rejects duplicate phone on update', async () => {
    const stores = legacyUserStore();
    const other: StoredUser = {
      id: OTHER_ID,
      name: 'Other',
      phone: OTHER_PHONE,
      email: null,
      passwordHash: 'hash',
      timezone: 'UTC',
      avatarUrl: null,
      groupId: null,
      reminderTime: null,
    };
    stores.users.set(OTHER_ID, other);
    stores.usersByPhone.set(OTHER_PHONE, other);

    const caller = profileRouter.createCaller(createProfileContext(stores));

    await expect(caller.update({ phone: '9876543211' })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Account already exists',
    } satisfies Partial<TRPCError>);
  });
});
