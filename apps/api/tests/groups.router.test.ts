import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { seedGroupActivities } from '@workspace-starter/db';
import { groupsRouter } from '../src/trpc/routers/groups.router';
import { DEFAULT_CHALLENGE_LENGTH_DAYS } from '../src/utils/challenge-query';
import type { Context } from '../src/trpc/context';

vi.mock('@workspace-starter/db', async (importOriginal) => ({
  ...(await importOriginal()),
  seedGroupActivities: vi.fn(async () => {}),
}));

const CALLER_ID = 'user-caller';
const MEMBER_ID = 'user-member';
const OTHER_GROUP_ID = 'group-existing';
const GROUP_ID = 'group-1';
const INVITE_TOKEN = 'invite-token-abc';
const CHALLENGE_ID = 'challenge-1';

type StoredUser = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  groupId: string | null;
};

type StoredGroup = {
  id: string;
  name: string;
  inviteToken: string;
  adminUserId: string;
};

type StoredChallenge = {
  id: string;
  userId: string;
  groupId: string | null;
  isActive: boolean;
  startDate: Date;
  currentDay: number;
  lengthDays: number;
  endDate: Date | null;
};

type GroupsStores = {
  users: Map<string, StoredUser>;
  groups: Map<string, StoredGroup>;
  groupsByToken: Map<string, StoredGroup>;
  challenges: Map<string, StoredChallenge>;
  activityCounts: Map<string, number>;
};

function createGroupsStores(): GroupsStores {
  const caller: StoredUser = {
    id: CALLER_ID,
    name: 'Caller',
    phone: null,
    email: 'caller@example.com',
    groupId: null,
  };

  return {
    users: new Map([[CALLER_ID, caller]]),
    groups: new Map(),
    groupsByToken: new Map(),
    challenges: new Map(),
    activityCounts: new Map(),
  };
}

function createGroupsContext(
  stores: GroupsStores,
  userId: string = CALLER_ID,
): Context {
  let groupIdCounter = 0;
  let challengeIdCounter = 0;

  const prisma = {
    user: {
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }) =>
          stores.users.get(where.id) ?? null,
      ),
      findFirst: vi.fn(
        async ({
          where,
          include,
        }: {
          where: { id: string; groupId: string };
          include?: {
            challenges?: { where: { isActive: boolean } };
          };
        }) => {
          const user = stores.users.get(where.id);
          if (!user || user.groupId !== where.groupId) return null;

          if (include?.challenges) {
            const activeChallenges = [...stores.challenges.values()].filter(
              (c) =>
                c.userId === user.id &&
                c.isActive === include.challenges!.where.isActive,
            );
            activeChallenges.sort(
              (a, b) => b.startDate.getTime() - a.startDate.getTime(),
            );
            return { ...user, challenges: activeChallenges.slice(0, 1) };
          }

          return user;
        },
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: { groupId?: string | null };
        }) => {
          const user = stores.users.get(where.id);
          if (!user) throw new Error('User not found');
          const updated = { ...user, ...data };
          stores.users.set(where.id, updated);
          return updated;
        },
      ),
    },
    group: {
      findUnique: vi.fn(
        async ({ where }: { where: { id?: string; inviteToken?: string } }) => {
          if ('inviteToken' in where && where.inviteToken) {
            return stores.groupsByToken.get(where.inviteToken) ?? null;
          }
          if ('id' in where && where.id) {
            return stores.groups.get(where.id) ?? null;
          }
          return null;
        },
      ),
      create: vi.fn(
        async ({
          data,
        }: {
          data: {
            name: string;
            inviteToken: string;
            adminUserId: string;
          };
        }) => {
          groupIdCounter += 1;
          const group: StoredGroup = {
            id: `group-${groupIdCounter}`,
            name: data.name,
            inviteToken: data.inviteToken,
            adminUserId: data.adminUserId,
          };
          stores.groups.set(group.id, group);
          stores.groupsByToken.set(group.inviteToken, group);
          return group;
        },
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: { adminUserId?: string };
        }) => {
          const group = stores.groups.get(where.id);
          if (!group) throw new Error('Group not found');
          const updated = { ...group, ...data };
          stores.groups.set(where.id, updated);
          stores.groupsByToken.set(updated.inviteToken, updated);
          return updated;
        },
      ),
    },
    challenge: {
      findFirst: vi.fn(
        async ({
          where,
        }: {
          where: { userId: string; isActive?: boolean };
        }) => {
          const matches = [...stores.challenges.values()].filter(
            (c) =>
              c.userId === where.userId &&
              (where.isActive === undefined || c.isActive === where.isActive),
          );
          return matches[0] ?? null;
        },
      ),
      create: vi.fn(
        async ({
          data,
        }: {
          data: {
            userId: string;
            groupId: string;
            startDate: Date;
            currentDay: number;
            isActive: boolean;
            lengthDays: number;
          };
        }) => {
          challengeIdCounter += 1;
          const challenge: StoredChallenge = {
            id: `challenge-${challengeIdCounter}`,
            userId: data.userId,
            groupId: data.groupId,
            startDate: data.startDate,
            currentDay: data.currentDay,
            isActive: data.isActive,
            lengthDays: data.lengthDays,
            endDate: null,
          };
          stores.challenges.set(challenge.id, challenge);
          return challenge;
        },
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: {
            groupId?: string;
            isActive?: boolean;
            endDate?: Date;
          };
        }) => {
          const challenge = stores.challenges.get(where.id);
          if (!challenge) throw new Error('Challenge not found');
          const updated = { ...challenge, ...data };
          stores.challenges.set(where.id, updated);
          return updated;
        },
      ),
    },
    activity: {
      count: vi.fn(
        async ({ where }: { where: { groupId: string } }) =>
          stores.activityCounts.get(where.groupId) ?? 0,
      ),
    },
    $transaction: vi.fn(async (fn: (tx: typeof prisma) => unknown) =>
      fn(prisma),
    ),
  };

  const user = stores.users.get(userId)!;

  return {
    req: {
      headers: { origin: 'https://app.test' },
    } as Context['req'],
    res: {} as Context['res'],
    user: {
      id: user.id,
      email: user.email,
      phone: user.phone,
      name: user.name,
    },
    prisma: prisma as unknown as Context['prisma'],
    authService: {} as Context['authService'],
    activitiesService: {} as Context['activitiesService'],
  };
}

function seedGroup(
  stores: GroupsStores,
  {
    id = GROUP_ID,
    name = 'Test Group',
    inviteToken = INVITE_TOKEN,
    adminUserId = CALLER_ID,
  }: Partial<StoredGroup> = {},
): StoredGroup {
  const group: StoredGroup = { id, name, inviteToken, adminUserId };
  stores.groups.set(id, group);
  stores.groupsByToken.set(inviteToken, group);
  return group;
}

function seedMember(
  stores: GroupsStores,
  {
    id = MEMBER_ID,
    groupId = GROUP_ID,
    name = 'Member',
  }: { id?: string; groupId?: string; name?: string } = {},
): StoredUser {
  const member: StoredUser = {
    id,
    name,
    phone: null,
    email: `${id}@example.com`,
    groupId,
  };
  stores.users.set(id, member);
  return member;
}

function seedActiveChallenge(
  stores: GroupsStores,
  {
    id = CHALLENGE_ID,
    userId = CALLER_ID,
    groupId = null,
  }: { id?: string; userId?: string; groupId?: string | null } = {},
): StoredChallenge {
  const challenge: StoredChallenge = {
    id,
    userId,
    groupId,
    isActive: true,
    startDate: new Date('2026-06-01T00:00:00.000Z'),
    currentDay: 1,
    lengthDays: DEFAULT_CHALLENGE_LENGTH_DAYS,
    endDate: null,
  };
  stores.challenges.set(id, challenge);
  return challenge;
}

beforeEach(() => {
  vi.mocked(seedGroupActivities).mockClear();
  vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'));
});

describe('groupsRouter create', () => {
  it('creates a group, sets caller groupId, seeds activities, and returns inviteUrl', async () => {
    const stores = createGroupsStores();
    const caller = groupsRouter.createCaller(createGroupsContext(stores));

    const result = await caller.create({ name: 'My Group' });

    expect(result.group.name).toBe('My Group');
    expect(result.group.adminUserId).toBe(CALLER_ID);
    expect(stores.users.get(CALLER_ID)?.groupId).toBe(result.group.id);
    expect(seedGroupActivities).toHaveBeenCalledWith(
      expect.anything(),
      result.group.id,
    );
    expect(result.inviteUrl).toContain('token=');
    expect(result.inviteUrl).toContain(
      encodeURIComponent(result.group.inviteToken),
    );
    expect(result.inviteUrl).toMatch(/\/join\?token=/);
  });

  it('rejects create when caller already belongs to a group', async () => {
    const stores = createGroupsStores();
    stores.users.get(CALLER_ID)!.groupId = OTHER_GROUP_ID;
    const caller = groupsRouter.createCaller(createGroupsContext(stores));

    await expect(
      caller.create({ name: 'Another Group' }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'You already belong to a group',
    } satisfies Partial<TRPCError>);
  });
});

describe('groupsRouter join', () => {
  it('joins with a valid token and creates a challenge when none exists', async () => {
    const stores = createGroupsStores();
    seedGroup(stores);
    const caller = groupsRouter.createCaller(createGroupsContext(stores));

    const result = await caller.join({ token: INVITE_TOKEN });

    expect(result).toEqual({ groupId: GROUP_ID, groupName: 'Test Group' });
    expect(stores.users.get(CALLER_ID)?.groupId).toBe(GROUP_ID);
    const challenge = [...stores.challenges.values()].find(
      (c) => c.userId === CALLER_ID,
    );
    expect(challenge).toMatchObject({
      groupId: GROUP_ID,
      isActive: true,
      currentDay: 1,
      lengthDays: DEFAULT_CHALLENGE_LENGTH_DAYS,
    });
  });

  it('updates an existing active challenge groupId instead of creating a duplicate', async () => {
    const stores = createGroupsStores();
    seedGroup(stores);
    seedActiveChallenge(stores, { groupId: null });
    const caller = groupsRouter.createCaller(createGroupsContext(stores));

    await caller.join({ token: INVITE_TOKEN });

    expect(stores.challenges.size).toBe(1);
    expect(stores.challenges.get(CHALLENGE_ID)?.groupId).toBe(GROUP_ID);
    expect(stores.users.get(CALLER_ID)?.groupId).toBe(GROUP_ID);
  });

  it('rejects join with an invalid token', async () => {
    const stores = createGroupsStores();
    const caller = groupsRouter.createCaller(createGroupsContext(stores));

    await expect(caller.join({ token: 'bad-token' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Invalid invite link',
    } satisfies Partial<TRPCError>);
  });

  it('rejects join when caller already belongs to a group', async () => {
    const stores = createGroupsStores();
    seedGroup(stores);
    stores.users.get(CALLER_ID)!.groupId = OTHER_GROUP_ID;
    const caller = groupsRouter.createCaller(createGroupsContext(stores));

    await expect(caller.join({ token: INVITE_TOKEN })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'You already belong to a group',
    } satisfies Partial<TRPCError>);
  });

  it('seeds group activities when the activity table is empty', async () => {
    const stores = createGroupsStores();
    seedGroup(stores);
    stores.activityCounts.set(GROUP_ID, 0);
    const caller = groupsRouter.createCaller(createGroupsContext(stores));

    await caller.join({ token: INVITE_TOKEN });

    expect(seedGroupActivities).toHaveBeenCalledWith(
      expect.anything(),
      GROUP_ID,
    );
  });

  it('does not re-seed activities when the group already has some', async () => {
    const stores = createGroupsStores();
    seedGroup(stores);
    stores.activityCounts.set(GROUP_ID, 3);
    const caller = groupsRouter.createCaller(createGroupsContext(stores));

    await caller.join({ token: INVITE_TOKEN });

    expect(seedGroupActivities).not.toHaveBeenCalled();
  });
});

describe('groupsRouter removeMember', () => {
  it('lets an admin remove another member and deactivates their challenge', async () => {
    const stores = createGroupsStores();
    seedGroup(stores, { adminUserId: CALLER_ID });
    stores.users.get(CALLER_ID)!.groupId = GROUP_ID;
    seedMember(stores);
    seedActiveChallenge(stores, { userId: MEMBER_ID, groupId: GROUP_ID });
    const caller = groupsRouter.createCaller(createGroupsContext(stores));

    const result = await caller.removeMember({ userId: MEMBER_ID });

    expect(result).toEqual({ success: true });
    expect(stores.users.get(MEMBER_ID)?.groupId).toBeNull();
    expect(stores.challenges.get(CHALLENGE_ID)?.isActive).toBe(false);
    expect(stores.challenges.get(CHALLENGE_ID)?.endDate).toBeDefined();
  });

  it('rejects removeMember from a non-admin caller', async () => {
    const stores = createGroupsStores();
    seedGroup(stores, { adminUserId: 'other-admin' });
    stores.users.get(CALLER_ID)!.groupId = GROUP_ID;
    seedMember(stores);
    const caller = groupsRouter.createCaller(createGroupsContext(stores));

    await expect(
      caller.removeMember({ userId: MEMBER_ID }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Admin only',
    } satisfies Partial<TRPCError>);
  });

  it('rejects when admin tries to remove themselves', async () => {
    const stores = createGroupsStores();
    seedGroup(stores, { adminUserId: CALLER_ID });
    stores.users.get(CALLER_ID)!.groupId = GROUP_ID;
    const caller = groupsRouter.createCaller(createGroupsContext(stores));

    await expect(
      caller.removeMember({ userId: CALLER_ID }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Transfer admin before leaving or use profile settings',
    } satisfies Partial<TRPCError>);
  });

  it('rejects when the target member is not in the group', async () => {
    const stores = createGroupsStores();
    seedGroup(stores, { adminUserId: CALLER_ID });
    stores.users.get(CALLER_ID)!.groupId = GROUP_ID;
    const caller = groupsRouter.createCaller(createGroupsContext(stores));

    await expect(
      caller.removeMember({ userId: 'unknown-user' }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Member not found',
    } satisfies Partial<TRPCError>);
  });
});

describe('groupsRouter transferAdmin', () => {
  it('transfers admin to another group member', async () => {
    const stores = createGroupsStores();
    seedGroup(stores, { adminUserId: CALLER_ID });
    stores.users.get(CALLER_ID)!.groupId = GROUP_ID;
    seedMember(stores);
    const caller = groupsRouter.createCaller(createGroupsContext(stores));

    const result = await caller.transferAdmin({ userId: MEMBER_ID });

    expect(result).toEqual({ adminUserId: MEMBER_ID });
    expect(stores.groups.get(GROUP_ID)?.adminUserId).toBe(MEMBER_ID);
  });

  it('rejects transferAdmin to self', async () => {
    const stores = createGroupsStores();
    seedGroup(stores, { adminUserId: CALLER_ID });
    stores.users.get(CALLER_ID)!.groupId = GROUP_ID;
    const caller = groupsRouter.createCaller(createGroupsContext(stores));

    await expect(
      caller.transferAdmin({ userId: CALLER_ID }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'You are already the admin',
    } satisfies Partial<TRPCError>);
  });

  it('rejects transferAdmin from a non-admin caller', async () => {
    const stores = createGroupsStores();
    seedGroup(stores, { adminUserId: 'other-admin' });
    stores.users.get(CALLER_ID)!.groupId = GROUP_ID;
    seedMember(stores);
    const caller = groupsRouter.createCaller(createGroupsContext(stores));

    await expect(
      caller.transferAdmin({ userId: MEMBER_ID }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Admin only',
    } satisfies Partial<TRPCError>);
  });
});
