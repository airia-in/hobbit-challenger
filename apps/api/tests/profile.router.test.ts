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
  whatsappOptIn: boolean;
  weeklyRecapOptIn: boolean;
};

function createProfileContext(stores: {
  users: Map<string, StoredUser>;
  usersByPhone: Map<string, StoredUser>;
  usersByEmail: Map<string, StoredUser>;
}): Context {
  const prisma = {
    user: {
      findUnique: vi.fn(
        async ({
          where,
          include,
        }: {
          where: Record<string, string>;
          include?: { challenges?: unknown };
        }) => {
          if ('phone' in where)
            return stores.usersByPhone.get(where.phone) ?? null;
          if ('email' in where)
            return stores.usersByEmail.get(where.email) ?? null;
          if ('id' in where) {
            const user = stores.users.get(where.id) ?? null;
            if (user && include?.challenges) {
              return { ...user, challenges: [] };
            }
            return user;
          }
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
    $transaction: vi.fn(async (fn: (tx: typeof prisma) => unknown) =>
      fn(prisma),
    ),
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
    whatsappOptIn: true,
    weeklyRecapOptIn: true,
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
      whatsappOptIn: true,
      weeklyRecapOptIn: true,
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

describe('profileRouter whatsappOptIn', () => {
  it('exposes needsPhoneMigration for legacy email-only users', async () => {
    const stores = legacyUserStore();
    const caller = profileRouter.createCaller(createProfileContext(stores));

    const profile = await caller.get();

    expect(profile.needsPhoneMigration).toBe(true);
    expect(profile.whatsappOptIn).toBe(true);
  });

  it('rejects enabling whatsappOptIn without a stored phone', async () => {
    const stores = legacyUserStore();
    stores.users.get(USER_ID)!.whatsappOptIn = false;
    const caller = profileRouter.createCaller(createProfileContext(stores));

    await expect(caller.update({ whatsappOptIn: true })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Add a phone number before enabling WhatsApp reminders',
    } satisfies Partial<TRPCError>);
  });

  it('allows whatsappOptIn when phone is saved in the same update', async () => {
    const stores = legacyUserStore();
    stores.users.get(USER_ID)!.whatsappOptIn = false;
    const caller = profileRouter.createCaller(createProfileContext(stores));

    const updated = await caller.update({
      phone: '9876543210',
      whatsappOptIn: true,
    });

    expect(updated.phone).toBe(PHONE);
    expect(updated.whatsappOptIn).toBe(true);
  });

  it('allows whatsappOptIn when the account already has a phone', async () => {
    const stores = legacyUserStore();
    const user = stores.users.get(USER_ID)!;
    user.phone = PHONE;
    user.whatsappOptIn = false;
    stores.users.set(USER_ID, user);
    stores.usersByPhone.set(PHONE, user);
    const caller = profileRouter.createCaller(createProfileContext(stores));

    const updated = await caller.update({ whatsappOptIn: true });

    expect(updated.whatsappOptIn).toBe(true);
  });

  it('round-trips whatsappOptIn off through get and update', async () => {
    const stores = legacyUserStore();
    const caller = profileRouter.createCaller(createProfileContext(stores));

    const initial = await caller.get();
    expect(initial.whatsappOptIn).toBe(true);

    const updated = await caller.update({ whatsappOptIn: false });
    expect(updated.whatsappOptIn).toBe(false);
    expect(stores.users.get(USER_ID)?.whatsappOptIn).toBe(false);

    const afterUpdate = await caller.get();
    expect(afterUpdate.whatsappOptIn).toBe(false);
    expect(afterUpdate.needsPhoneMigration).toBe(true);
  });
});

describe('profileRouter weeklyRecapOptIn', () => {
  it('defaults weeklyRecapOptIn to true on get', async () => {
    const stores = legacyUserStore();
    stores.users.get(USER_ID)!.phone = PHONE;
    const caller = profileRouter.createCaller(createProfileContext(stores));

    const profile = await caller.get();
    expect(profile.weeklyRecapOptIn).toBe(true);
  });

  it('rejects enabling weeklyRecapOptIn without phone and whatsapp', async () => {
    const stores = legacyUserStore();
    stores.users.get(USER_ID)!.weeklyRecapOptIn = false;
    const caller = profileRouter.createCaller(createProfileContext(stores));

    await expect(
      caller.update({ weeklyRecapOptIn: true }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message:
        'Add a phone number and enable WhatsApp reminders before enabling weekly recap',
    });
  });

  it('allows weeklyRecapOptIn when phone and whatsapp are enabled', async () => {
    const stores = legacyUserStore();
    const user = stores.users.get(USER_ID)!;
    user.phone = PHONE;
    user.weeklyRecapOptIn = false;
    const caller = profileRouter.createCaller(createProfileContext(stores));

    const updated = await caller.update({ weeklyRecapOptIn: true });
    expect(updated.weeklyRecapOptIn).toBe(true);
  });

  it('round-trips weeklyRecapOptIn off through get and update', async () => {
    const stores = legacyUserStore();
    stores.users.get(USER_ID)!.phone = PHONE;
    const caller = profileRouter.createCaller(createProfileContext(stores));

    const updated = await caller.update({ weeklyRecapOptIn: false });
    expect(updated.weeklyRecapOptIn).toBe(false);

    const afterUpdate = await caller.get();
    expect(afterUpdate.weeklyRecapOptIn).toBe(false);
  });
});

describe('profileRouter phone normalization', () => {
  it('normalizes bare digits to E.164 on update', async () => {
    const stores = legacyUserStore();
    const caller = profileRouter.createCaller(createProfileContext(stores));

    const result = await caller.update({ phone: '9876543210' });

    expect(result.phone).toBe(PHONE);
  });

  it('passes through already-normalized E.164 on update', async () => {
    const stores = legacyUserStore();
    const caller = profileRouter.createCaller(createProfileContext(stores));

    const result = await caller.update({ phone: PHONE });

    expect(result.phone).toBe(PHONE);
  });

  it('normalizes formatted phone input on update', async () => {
    const stores = legacyUserStore();
    const caller = profileRouter.createCaller(createProfileContext(stores));

    const result = await caller.update({ phone: '+91 98765 43210' });

    expect(result.phone).toBe(PHONE);
  });
});

describe('profileRouter timezone', () => {
  it('persists a valid timezone on update', async () => {
    const stores = legacyUserStore();
    const caller = profileRouter.createCaller(createProfileContext(stores));

    const result = await caller.update({ timezone: 'America/New_York' });

    expect(result.timezone).toBe('America/New_York');
    expect(stores.users.get(USER_ID)?.timezone).toBe('America/New_York');
  });

  it('rejects an invalid timezone on update', async () => {
    const stores = legacyUserStore();
    const caller = profileRouter.createCaller(createProfileContext(stores));

    await expect(
      caller.update({ timezone: 'Not/AZone' }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Invalid timezone',
    } satisfies Partial<TRPCError>);
  });
});

describe('profileRouter avatarUrl', () => {
  it('persists a valid avatarUrl on update', async () => {
    const stores = legacyUserStore();
    const caller = profileRouter.createCaller(createProfileContext(stores));

    const result = await caller.update({ avatarUrl: '/uploads/abc.jpg' });

    expect(result.avatarUrl).toBe('/uploads/abc.jpg');
    expect(stores.users.get(USER_ID)?.avatarUrl).toBe('/uploads/abc.jpg');
  });

  it('clears avatarUrl when set to null', async () => {
    const stores = legacyUserStore();
    const user = stores.users.get(USER_ID)!;
    user.avatarUrl = '/uploads/old.jpg';
    stores.users.set(USER_ID, user);
    const caller = profileRouter.createCaller(createProfileContext(stores));

    const result = await caller.update({ avatarUrl: null });

    expect(result.avatarUrl).toBeNull();
    expect(stores.users.get(USER_ID)?.avatarUrl).toBeNull();
  });

  it.each([
    'https://evil.com/x.jpg',
    '/uploads/../x.jpg',
    'data:image/png;base64,AAAA',
  ])('rejects invalid avatarUrl %s with BAD_REQUEST', async (avatarUrl) => {
    const stores = legacyUserStore();
    const caller = profileRouter.createCaller(createProfileContext(stores));

    await expect(caller.update({ avatarUrl })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    } satisfies Partial<TRPCError>);
  });
});

const GROUP_ID = 'group-leave';
const ADMIN_ID = 'user-admin';
const CHALLENGE_ID = 'challenge-leave';

type StoredGroup = {
  id: string;
  name: string;
  adminUserId: string;
};

type StoredChallenge = {
  id: string;
  userId: string;
  isActive: boolean;
  startDate: Date;
  endDate: Date | null;
  stoppedAt: Date | null;
};

function createLeaveGroupContext(stores: {
  users: Map<string, StoredUser>;
  usersByPhone: Map<string, StoredUser>;
  usersByEmail: Map<string, StoredUser>;
  groups: Map<string, StoredGroup>;
  groupAdmins: Map<
    string,
    { groupId: string; userId: string; createdAt: Date }
  >;
  challenges: Map<string, StoredChallenge>;
  callerId: string;
}): Context {
  const prisma = {
    user: {
      findUnique: vi.fn(
        async ({
          where,
          include,
        }: {
          where: Record<string, string>;
          include?: { group?: boolean; challenges?: unknown };
        }) => {
          if ('phone' in where)
            return stores.usersByPhone.get(where.phone) ?? null;
          if ('email' in where)
            return stores.usersByEmail.get(where.email) ?? null;
          if ('id' in where) {
            const user = stores.users.get(where.id) ?? null;
            if (!user) return null;

            const result: Record<string, unknown> = { ...user };
            if (include?.group && user.groupId) {
              result.group = stores.groups.get(user.groupId) ?? null;
            }
            if (include?.challenges) {
              const active = [...stores.challenges.values()]
                .filter((c) => c.userId === user.id && c.isActive)
                .sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
              result.challenges = active.slice(0, 1);
            }
            return result;
          }
          return null;
        },
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<StoredUser>;
        }) => {
          const user = stores.users.get(where.id);
          if (!user) throw new Error('User not found');
          const updated: StoredUser = { ...user, ...data };
          stores.users.set(where.id, updated);
          return updated;
        },
      ),
      count: vi.fn(
        async ({ where }: { where: { groupId: string } }) =>
          [...stores.users.values()].filter(
            (user) => user.groupId === where.groupId,
          ).length,
      ),
    },
    group: {
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<StoredGroup>;
        }) => {
          const group = stores.groups.get(where.id);
          if (!group) throw new Error('Group not found');
          const updated = { ...group, ...data };
          stores.groups.set(where.id, updated);
          return updated;
        },
      ),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const deleted = stores.groups.delete(where.id);
        if (!deleted) throw new Error('Group not found');

        for (const key of [...stores.groupAdmins.keys()]) {
          if (key.startsWith(`${where.id}:`)) stores.groupAdmins.delete(key);
        }

        return { id: where.id };
      }),
    },
    dayLabel: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    groupAdmin: {
      findMany: vi.fn(
        async ({
          where,
        }: {
          where: { groupId: string };
          select?: { userId?: boolean };
          orderBy?: unknown;
        }) =>
          [...stores.groupAdmins.values()]
            .filter((admin) => admin.groupId === where.groupId)
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
            .map((admin) => ({ userId: admin.userId })),
      ),
      findFirst: vi.fn(
        async ({
          where,
        }: {
          where: { groupId: string; userId?: { not: string } };
          select?: { userId?: boolean };
          orderBy?: unknown;
        }) =>
          [...stores.groupAdmins.values()]
            .filter(
              (admin) =>
                admin.groupId === where.groupId &&
                admin.userId !== where.userId?.not,
            )
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
            .map((admin) => ({ userId: admin.userId }))[0] ?? null,
      ),
      deleteMany: vi.fn(
        async ({ where }: { where: { groupId: string; userId: string } }) => {
          const deleted = stores.groupAdmins.delete(
            `${where.groupId}:${where.userId}`,
          );
          return { count: deleted ? 1 : 0 };
        },
      ),
    },
    challenge: {
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: { isActive?: boolean; stoppedAt?: Date };
        }) => {
          const challenge = stores.challenges.get(where.id);
          if (!challenge) throw new Error('Challenge not found');
          const updated = { ...challenge, ...data };
          stores.challenges.set(where.id, updated);
          return updated;
        },
      ),
    },
    $transaction: vi.fn(async (fn: (tx: typeof prisma) => unknown) =>
      fn(prisma),
    ),
  };

  const caller = stores.users.get(stores.callerId);
  if (!caller) {
    return {
      req: { headers: {} } as Context['req'],
      res: {} as Context['res'],
      user: {
        id: stores.callerId,
        email: null,
        phone: null,
        name: 'Missing User',
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

  return {
    req: { headers: {} } as Context['req'],
    res: {} as Context['res'],
    user: {
      id: caller.id,
      email: caller.email,
      phone: caller.phone,
      name: caller.name,
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

function memberLeaveStores(): {
  users: Map<string, StoredUser>;
  usersByPhone: Map<string, StoredUser>;
  usersByEmail: Map<string, StoredUser>;
  groups: Map<string, StoredGroup>;
  groupAdmins: Map<
    string,
    { groupId: string; userId: string; createdAt: Date }
  >;
  challenges: Map<string, StoredChallenge>;
  callerId: string;
} {
  const member: StoredUser = {
    id: USER_ID,
    name: 'Member User',
    phone: null,
    email: 'member@example.com',
    passwordHash: 'hash',
    timezone: 'UTC',
    avatarUrl: null,
    groupId: GROUP_ID,
    reminderTime: null,
    whatsappOptIn: true,
    weeklyRecapOptIn: true,
  };

  const groups = new Map<string, StoredGroup>([
    [GROUP_ID, { id: GROUP_ID, name: 'Leave Group', adminUserId: ADMIN_ID }],
  ]);

  const challenges = new Map<string, StoredChallenge>([
    [
      CHALLENGE_ID,
      {
        id: CHALLENGE_ID,
        userId: USER_ID,
        isActive: true,
        startDate: new Date('2026-06-01T00:00:00.000Z'),
        endDate: null,
        stoppedAt: null,
      },
    ],
  ]);

  const groupAdmins = new Map([
    [
      `${GROUP_ID}:${ADMIN_ID}`,
      {
        groupId: GROUP_ID,
        userId: ADMIN_ID,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
  ]);

  return {
    users: new Map([[USER_ID, member]]),
    usersByPhone: new Map(),
    usersByEmail: new Map([['member@example.com', member]]),
    groups,
    groupAdmins,
    challenges,
    callerId: USER_ID,
  };
}

describe('profileRouter leaveGroup', () => {
  it('lets a non-admin member leave, clearing groupId and deactivating challenge', async () => {
    const stores = memberLeaveStores();
    const caller = profileRouter.createCaller(createLeaveGroupContext(stores));

    const result = await caller.leaveGroup();

    expect(result).toEqual({ success: true });
    expect(stores.users.get(USER_ID)?.groupId).toBeNull();
    expect(stores.challenges.get(CHALLENGE_ID)?.isActive).toBe(false);
    expect(stores.challenges.get(CHALLENGE_ID)?.stoppedAt).toBeDefined();
  });

  it('rejects leaveGroup when user is not in a group', async () => {
    const stores = memberLeaveStores();
    stores.users.get(USER_ID)!.groupId = null;
    const caller = profileRouter.createCaller(createLeaveGroupContext(stores));

    await expect(caller.leaveGroup()).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'You are not in a group',
    } satisfies Partial<TRPCError>);
  });

  it('dissolves the group when caller is the last admin and only member', async () => {
    const stores = memberLeaveStores();
    stores.groups.get(GROUP_ID)!.adminUserId = USER_ID;
    stores.groupAdmins.clear();
    stores.groupAdmins.set(`${GROUP_ID}:${USER_ID}`, {
      groupId: GROUP_ID,
      userId: USER_ID,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const caller = profileRouter.createCaller(createLeaveGroupContext(stores));

    const result = await caller.leaveGroup();

    expect(result).toEqual({ success: true, dissolved: true });
    expect(stores.users.get(USER_ID)?.groupId).toBeNull();
    expect(stores.groups.has(GROUP_ID)).toBe(false);
    expect(stores.groupAdmins.has(`${GROUP_ID}:${USER_ID}`)).toBe(false);
    expect(stores.challenges.get(CHALLENGE_ID)?.isActive).toBe(false);
    expect(stores.challenges.get(CHALLENGE_ID)?.stoppedAt).toBeDefined();
  });

  it('rejects leaveGroup when caller is the last admin and other members remain', async () => {
    const stores = memberLeaveStores();
    const otherMember: StoredUser = {
      id: OTHER_ID,
      name: 'Other Member',
      phone: null,
      email: 'other-member@example.com',
      passwordHash: 'hash',
      timezone: 'UTC',
      avatarUrl: null,
      groupId: GROUP_ID,
      reminderTime: null,
      whatsappOptIn: true,
      weeklyRecapOptIn: true,
    };
    stores.users.set(OTHER_ID, otherMember);
    stores.usersByEmail.set('other-member@example.com', otherMember);
    stores.groups.get(GROUP_ID)!.adminUserId = USER_ID;
    stores.groupAdmins.clear();
    stores.groupAdmins.set(`${GROUP_ID}:${USER_ID}`, {
      groupId: GROUP_ID,
      userId: USER_ID,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const caller = profileRouter.createCaller(createLeaveGroupContext(stores));

    await expect(caller.leaveGroup()).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Promote another admin before leaving the group',
    } satisfies Partial<TRPCError>);
    expect(stores.users.get(USER_ID)?.groupId).toBe(GROUP_ID);
    expect(stores.groups.has(GROUP_ID)).toBe(true);
    expect(stores.challenges.get(CHALLENGE_ID)?.isActive).toBe(true);
  });

  it('lets a secondary admin leave and removes their admin grant', async () => {
    const stores = memberLeaveStores();
    stores.groupAdmins.set(`${GROUP_ID}:${USER_ID}`, {
      groupId: GROUP_ID,
      userId: USER_ID,
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
    });
    const caller = profileRouter.createCaller(createLeaveGroupContext(stores));

    const result = await caller.leaveGroup();

    expect(result).toEqual({ success: true });
    expect(stores.users.get(USER_ID)?.groupId).toBeNull();
    expect(stores.groupAdmins.has(`${GROUP_ID}:${USER_ID}`)).toBe(false);
    expect(stores.groups.get(GROUP_ID)?.adminUserId).toBe(ADMIN_ID);
  });

  it('rejects leaveGroup when user is not found', async () => {
    const stores = memberLeaveStores();
    stores.users.delete(USER_ID);
    const caller = profileRouter.createCaller(createLeaveGroupContext(stores));

    await expect(caller.leaveGroup()).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'User not found',
    } satisfies Partial<TRPCError>);
  });
});
