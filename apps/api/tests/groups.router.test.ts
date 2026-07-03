import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import {
  seedGroupActivities,
  deactivateSoloActivities,
  migrateSoloActivityLogs,
} from '@workspace-starter/db';
import { groupsRouter } from '../src/trpc/routers/groups.router';
import { DEFAULT_CHALLENGE_WINDOW_DAYS } from '../src/utils/challenge-range';
import type { Context } from '../src/trpc/context';

vi.mock('@workspace-starter/db', async (importOriginal) => ({
  ...(await importOriginal()),
  seedGroupActivities: vi.fn(async () => {}),
  deactivateSoloActivities: vi.fn(async () => {}),
  migrateSoloActivityLogs: vi.fn(async () => {}),
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
  timezone: string;
};

type StoredGroup = {
  id: string;
  name: string;
  inviteToken: string;
  adminUserId: string;
  challengeStartDate: Date | null;
  challengeEndDate: Date | null;
  challengeTimezone: string | null;
};

type StoredGroupAdmin = {
  groupId: string;
  userId: string;
  createdAt: Date;
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
  stoppedAt: Date | null;
};

type GroupsStores = {
  users: Map<string, StoredUser>;
  groups: Map<string, StoredGroup>;
  groupsByToken: Map<string, StoredGroup>;
  groupAdmins: Map<string, StoredGroupAdmin>;
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
    timezone: 'UTC',
  };

  return {
    users: new Map([[CALLER_ID, caller]]),
    groups: new Map(),
    groupsByToken: new Map(),
    groupAdmins: new Map(),
    challenges: new Map(),
    activityCounts: new Map(),
  };
}

function groupAdminKey(groupId: string, userId: string): string {
  return `${groupId}:${userId}`;
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
        async ({
          where,
          include,
        }: {
          where: { id: string };
          include?: { group?: boolean };
        }) => {
          const user = stores.users.get(where.id) ?? null;
          if (!user) return null;
          if (include?.group) {
            return {
              ...user,
              group: user.groupId
                ? (stores.groups.get(user.groupId) ?? null)
                : null,
            };
          }
          return user;
        },
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
      findMany: vi.fn(
        async ({
          where,
          select,
        }: {
          where: { groupId: string };
          select?: unknown;
        }) => {
          void select;
          return [...stores.users.values()]
            .filter((user) => user.groupId === where.groupId)
            .map((user) => {
              const activeChallenges = [...stores.challenges.values()]
                .filter((challenge) => {
                  return challenge.userId === user.id && challenge.isActive;
                })
                .sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
              return {
                id: user.id,
                challenges: activeChallenges.slice(0, 1).map((challenge) => ({
                  id: challenge.id,
                })),
              };
            });
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
        async ({
          where,
          include,
        }: {
          where: { id?: string; inviteToken?: string };
          include?: {
            admins?: { select?: { userId?: boolean }; orderBy?: unknown };
            members?: {
              select?: {
                id?: boolean;
                name?: boolean;
                avatarUrl?: boolean;
                challenges?: unknown;
              };
            };
          };
        }) => {
          let group: StoredGroup | null = null;
          if ('inviteToken' in where && where.inviteToken) {
            group = stores.groupsByToken.get(where.inviteToken) ?? null;
          }
          if ('id' in where && where.id) {
            group = stores.groups.get(where.id) ?? null;
          }
          if (!group) return null;

          const row: Record<string, unknown> = { ...group };
          if (include?.admins) {
            row.admins = [...stores.groupAdmins.values()]
              .filter((admin) => admin.groupId === group.id)
              .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
              .map((admin) => ({ userId: admin.userId }));
          }
          if (include?.members) {
            row.members = [...stores.users.values()]
              .filter((member) => member.groupId === group.id)
              .map((member) => {
                const challenges = [...stores.challenges.values()]
                  .filter((challenge) => challenge.userId === member.id)
                  .sort(
                    (a, b) =>
                      Number(b.isActive) - Number(a.isActive) ||
                      b.startDate.getTime() - a.startDate.getTime(),
                  )
                  .slice(0, 1);
                return {
                  id: member.id,
                  name: member.name,
                  avatarUrl: null,
                  challenges,
                };
              });
          }

          return row;
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
            challengeStartDate?: Date;
            challengeEndDate?: Date;
            challengeTimezone?: string;
          };
        }) => {
          groupIdCounter += 1;
          const group: StoredGroup = {
            id: `group-${groupIdCounter}`,
            name: data.name,
            inviteToken: data.inviteToken,
            adminUserId: data.adminUserId,
            challengeStartDate: data.challengeStartDate ?? null,
            challengeEndDate: data.challengeEndDate ?? null,
            challengeTimezone: data.challengeTimezone ?? null,
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
          data: Partial<StoredGroup>;
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
      create: vi.fn(
        async ({ data }: { data: { groupId: string; userId: string } }) => {
          const admin: StoredGroupAdmin = {
            groupId: data.groupId,
            userId: data.userId,
            createdAt: new Date(),
          };
          stores.groupAdmins.set(
            groupAdminKey(admin.groupId, admin.userId),
            admin,
          );
          return admin;
        },
      ),
      upsert: vi.fn(
        async ({
          where,
          create,
        }: {
          where: { groupId_userId: { groupId: string; userId: string } };
          create: { groupId: string; userId: string };
          update: Record<string, never>;
        }) => {
          const key = groupAdminKey(
            where.groupId_userId.groupId,
            where.groupId_userId.userId,
          );
          const existing = stores.groupAdmins.get(key);
          if (existing) return existing;
          const admin: StoredGroupAdmin = {
            groupId: create.groupId,
            userId: create.userId,
            createdAt: new Date(),
          };
          stores.groupAdmins.set(key, admin);
          return admin;
        },
      ),
      deleteMany: vi.fn(
        async ({ where }: { where: { groupId: string; userId: string } }) => {
          const key = groupAdminKey(where.groupId, where.userId);
          const deleted = stores.groupAdmins.delete(key);
          return { count: deleted ? 1 : 0 };
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
            endDate: Date;
            currentDay: number;
            isActive: boolean;
            lengthDays: number;
          };
        }) => {
          do {
            challengeIdCounter += 1;
          } while (stores.challenges.has(`challenge-${challengeIdCounter}`));
          const challenge: StoredChallenge = {
            id: `challenge-${challengeIdCounter}`,
            userId: data.userId,
            groupId: data.groupId,
            startDate: data.startDate,
            endDate: data.endDate,
            currentDay: data.currentDay,
            isActive: data.isActive,
            lengthDays: data.lengthDays,
            stoppedAt: null,
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
            startDate?: Date;
            currentDay?: number;
            lengthDays?: number;
            stoppedAt?: Date | null;
          };
        }) => {
          const challenge = stores.challenges.get(where.id);
          if (!challenge) throw new Error('Challenge not found');
          const updated = { ...challenge, ...data };
          stores.challenges.set(where.id, updated);
          return updated;
        },
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { userId?: string; isActive?: boolean };
          data: Partial<StoredChallenge>;
        }) => {
          let count = 0;
          for (const [id, challenge] of stores.challenges) {
            if (where.userId && challenge.userId !== where.userId) continue;
            if (
              where.isActive !== undefined &&
              challenge.isActive !== where.isActive
            ) {
              continue;
            }
            stores.challenges.set(id, { ...challenge, ...data });
            count += 1;
          }
          return { count };
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
    challengeStartDate = null,
    challengeEndDate = null,
    challengeTimezone = null,
  }: Partial<StoredGroup> = {},
): StoredGroup {
  const group: StoredGroup = {
    id,
    name,
    inviteToken,
    adminUserId,
    challengeStartDate,
    challengeEndDate,
    challengeTimezone,
  };
  stores.groups.set(id, group);
  stores.groupsByToken.set(inviteToken, group);
  stores.groupAdmins.set(groupAdminKey(id, adminUserId), {
    groupId: id,
    userId: adminUserId,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  });
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
    timezone: 'UTC',
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
    startDate = new Date('2026-06-01T00:00:00.000Z'),
    endDate = new Date('2026-06-30T00:00:00.000Z'),
    currentDay = 1,
    lengthDays = DEFAULT_CHALLENGE_WINDOW_DAYS,
  }: {
    id?: string;
    userId?: string;
    groupId?: string | null;
    startDate?: Date;
    endDate?: Date | null;
    currentDay?: number;
    lengthDays?: number;
  } = {},
): StoredChallenge {
  const challenge: StoredChallenge = {
    id,
    userId,
    groupId,
    isActive: true,
    startDate,
    currentDay,
    lengthDays,
    endDate,
    stoppedAt: null,
  };
  stores.challenges.set(id, challenge);
  return challenge;
}

beforeEach(() => {
  vi.mocked(seedGroupActivities).mockClear();
  vi.mocked(deactivateSoloActivities).mockClear();
  vi.mocked(migrateSoloActivityLogs).mockClear();
  vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'));
});

describe('groupsRouter create', () => {
  it('creates a group, sets caller groupId, seeds activities, and returns inviteUrl', async () => {
    const stores = createGroupsStores();
    const caller = groupsRouter.createCaller(createGroupsContext(stores));

    const result = await caller.create({ name: 'My Group' });

    expect(result.group.name).toBe('My Group');
    expect(result.group.adminUserId).toBe(CALLER_ID);
    expect(
      stores.groupAdmins.get(groupAdminKey(result.group.id, CALLER_ID)),
    ).toMatchObject({ groupId: result.group.id, userId: CALLER_ID });
    expect(stores.users.get(CALLER_ID)?.groupId).toBe(result.group.id);
    expect(seedGroupActivities).toHaveBeenCalledWith(
      expect.anything(),
      result.group.id,
    );
    expect(deactivateSoloActivities).toHaveBeenCalledWith(
      expect.anything(),
      CALLER_ID,
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
      lengthDays: DEFAULT_CHALLENGE_WINDOW_DAYS,
      endDate: expect.any(Date),
    });
  });

  it('updates an existing active challenge groupId instead of creating a duplicate', async () => {
    const stores = createGroupsStores();
    seedGroup(stores, {
      challengeStartDate: new Date('2026-06-10T00:00:00.000Z'),
      challengeEndDate: new Date('2026-07-09T00:00:00.000Z'),
      challengeTimezone: 'UTC',
    });
    seedActiveChallenge(stores, {
      groupId: null,
      startDate: new Date('2026-06-01T00:00:00.000Z'),
      endDate: new Date('2026-06-30T00:00:00.000Z'),
    });
    const caller = groupsRouter.createCaller(createGroupsContext(stores));

    await caller.join({ token: INVITE_TOKEN });

    expect(stores.challenges.size).toBe(1);
    const challenge = stores.challenges.get(CHALLENGE_ID);
    expect(challenge?.groupId).toBe(GROUP_ID);
    expect(challenge?.startDate.toISOString()).toBe(
      new Date('2026-06-01T00:00:00.000Z').toISOString(),
    );
    expect(challenge?.endDate?.toISOString()).toBe(
      new Date('2026-07-09T00:00:00.000Z').toISOString(),
    );
    expect(stores.users.get(CALLER_ID)?.groupId).toBe(GROUP_ID);
    expect(migrateSoloActivityLogs).toHaveBeenCalledWith(
      expect.anything(),
      CALLER_ID,
      CHALLENGE_ID,
      GROUP_ID,
    );
    expect(deactivateSoloActivities).toHaveBeenCalledWith(
      expect.anything(),
      CALLER_ID,
    );
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
    expect(deactivateSoloActivities).toHaveBeenCalledWith(
      expect.anything(),
      CALLER_ID,
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

describe('groupsRouter getMine', () => {
  it('returns member-level admin badges and admin totals', async () => {
    const stores = createGroupsStores();
    seedGroup(stores, { adminUserId: CALLER_ID });
    stores.users.get(CALLER_ID)!.groupId = GROUP_ID;
    seedMember(stores);
    stores.groupAdmins.set(groupAdminKey(GROUP_ID, MEMBER_ID), {
      groupId: GROUP_ID,
      userId: MEMBER_ID,
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
    });
    const caller = groupsRouter.createCaller(createGroupsContext(stores));

    const result = await caller.getMine();

    expect(result).toMatchObject({
      adminUserId: CALLER_ID,
      adminUserIds: [CALLER_ID, MEMBER_ID],
      adminCount: 2,
      isAdmin: true,
    });
    expect(result?.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: CALLER_ID,
          isSelf: true,
          isAdmin: true,
        }),
        expect.objectContaining({
          id: MEMBER_ID,
          isSelf: false,
          isAdmin: true,
        }),
      ]),
    );
  });

  it('treats a secondary admin as an admin', async () => {
    const stores = createGroupsStores();
    seedGroup(stores, { adminUserId: CALLER_ID });
    stores.users.get(CALLER_ID)!.groupId = GROUP_ID;
    seedMember(stores);
    stores.groupAdmins.set(groupAdminKey(GROUP_ID, MEMBER_ID), {
      groupId: GROUP_ID,
      userId: MEMBER_ID,
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
    });
    const caller = groupsRouter.createCaller(
      createGroupsContext(stores, MEMBER_ID),
    );

    const result = await caller.getMine();

    expect(result?.isAdmin).toBe(true);
    expect(
      result?.members.find((member) => member.id === MEMBER_ID),
    ).toMatchObject({ isSelf: true, isAdmin: true });
  });
});

describe('groupsRouter setChallengeRange', () => {
  it('lets an admin set a custom range and syncs active member challenges', async () => {
    const stores = createGroupsStores();
    seedGroup(stores, { adminUserId: CALLER_ID });
    stores.users.get(CALLER_ID)!.groupId = GROUP_ID;
    seedMember(stores);
    seedActiveChallenge(stores, { userId: CALLER_ID, groupId: GROUP_ID });
    seedActiveChallenge(stores, {
      id: 'challenge-member',
      userId: MEMBER_ID,
      groupId: GROUP_ID,
    });
    const caller = groupsRouter.createCaller(createGroupsContext(stores));

    const result = await caller.setChallengeRange({
      startDate: new Date('2026-07-01T12:00:00.000Z'),
      endDate: new Date('2026-07-31T12:00:00.000Z'),
      timezone: 'UTC',
    });

    expect(result.lengthDays).toBe(31);
    expect(result.currentDay).toBe(0);
    expect(stores.groups.get(GROUP_ID)).toMatchObject({
      challengeTimezone: 'UTC',
      challengeStartDate: new Date('2026-07-01T00:00:00.000Z'),
      challengeEndDate: new Date('2026-07-31T00:00:00.000Z'),
    });
    for (const challenge of stores.challenges.values()) {
      expect(challenge).toMatchObject({
        startDate: new Date('2026-07-01T00:00:00.000Z'),
        endDate: new Date('2026-07-31T00:00:00.000Z'),
        lengthDays: 31,
        currentDay: 0,
        stoppedAt: null,
      });
    }
  });

  it('sets this week and creates missing member challenges', async () => {
    const stores = createGroupsStores();
    seedGroup(stores, { adminUserId: CALLER_ID });
    stores.users.get(CALLER_ID)!.groupId = GROUP_ID;
    seedMember(stores);
    seedActiveChallenge(stores, { userId: CALLER_ID, groupId: GROUP_ID });
    const caller = groupsRouter.createCaller(createGroupsContext(stores));

    const result = await caller.setChallengeThisWeek();

    expect(result.lengthDays).toBe(7);
    expect(result.currentDay).toBe(1);
    expect(stores.challenges.size).toBe(2);
    for (const challenge of stores.challenges.values()) {
      expect(challenge).toMatchObject({
        groupId: GROUP_ID,
        startDate: new Date('2026-06-15T00:00:00.000Z'),
        endDate: new Date('2026-06-21T00:00:00.000Z'),
        lengthDays: 7,
        currentDay: 1,
      });
    }
  });

  it('rejects range updates from non-admin members', async () => {
    const stores = createGroupsStores();
    seedGroup(stores, { adminUserId: MEMBER_ID });
    stores.users.get(CALLER_ID)!.groupId = GROUP_ID;
    const caller = groupsRouter.createCaller(createGroupsContext(stores));

    await expect(
      caller.setChallengeRange({
        startDate: new Date('2026-07-01T00:00:00.000Z'),
        endDate: new Date('2026-07-07T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Admin only',
    } satisfies Partial<TRPCError>);
  });

  it('lets a secondary admin set a custom range', async () => {
    const stores = createGroupsStores();
    seedGroup(stores, { adminUserId: CALLER_ID });
    stores.users.get(CALLER_ID)!.groupId = GROUP_ID;
    seedMember(stores);
    stores.groupAdmins.set(groupAdminKey(GROUP_ID, MEMBER_ID), {
      groupId: GROUP_ID,
      userId: MEMBER_ID,
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
    });
    seedActiveChallenge(stores, { userId: CALLER_ID, groupId: GROUP_ID });
    seedActiveChallenge(stores, {
      id: 'challenge-member',
      userId: MEMBER_ID,
      groupId: GROUP_ID,
    });
    const caller = groupsRouter.createCaller(
      createGroupsContext(stores, MEMBER_ID),
    );

    const result = await caller.setChallengeRange({
      startDate: new Date('2026-07-01T12:00:00.000Z'),
      endDate: new Date('2026-07-07T12:00:00.000Z'),
      timezone: 'UTC',
    });

    expect(result.lengthDays).toBe(7);
    expect(stores.groups.get(GROUP_ID)).toMatchObject({
      challengeStartDate: new Date('2026-07-01T00:00:00.000Z'),
      challengeEndDate: new Date('2026-07-07T00:00:00.000Z'),
    });
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

  it('removes an admin grant and rotates primary admin when removing an admin member', async () => {
    const stores = createGroupsStores();
    seedGroup(stores, { adminUserId: MEMBER_ID });
    stores.users.get(CALLER_ID)!.groupId = GROUP_ID;
    seedMember(stores);
    stores.groupAdmins.set(groupAdminKey(GROUP_ID, CALLER_ID), {
      groupId: GROUP_ID,
      userId: CALLER_ID,
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
    });
    seedActiveChallenge(stores, { userId: MEMBER_ID, groupId: GROUP_ID });
    const caller = groupsRouter.createCaller(createGroupsContext(stores));

    const result = await caller.removeMember({ userId: MEMBER_ID });

    expect(result).toEqual({ success: true });
    expect(stores.users.get(MEMBER_ID)?.groupId).toBeNull();
    expect(stores.groupAdmins.has(groupAdminKey(GROUP_ID, MEMBER_ID))).toBe(
      false,
    );
    expect(stores.groups.get(GROUP_ID)?.adminUserId).toBe(CALLER_ID);
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
      message: 'Use profile settings to leave the group',
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

describe('groupsRouter admin membership', () => {
  it('promotes another member without removing the current admin', async () => {
    const stores = createGroupsStores();
    seedGroup(stores, { adminUserId: CALLER_ID });
    stores.users.get(CALLER_ID)!.groupId = GROUP_ID;
    seedMember(stores);
    const caller = groupsRouter.createCaller(createGroupsContext(stores));

    const result = await caller.promoteAdmin({ userId: MEMBER_ID });

    expect(result).toEqual({ userId: MEMBER_ID });
    expect(stores.groups.get(GROUP_ID)?.adminUserId).toBe(CALLER_ID);
    expect(stores.groupAdmins.has(groupAdminKey(GROUP_ID, CALLER_ID))).toBe(
      true,
    );
    expect(stores.groupAdmins.has(groupAdminKey(GROUP_ID, MEMBER_ID))).toBe(
      true,
    );
  });

  it('rejects promoteAdmin to self', async () => {
    const stores = createGroupsStores();
    seedGroup(stores, { adminUserId: CALLER_ID });
    stores.users.get(CALLER_ID)!.groupId = GROUP_ID;
    const caller = groupsRouter.createCaller(createGroupsContext(stores));

    await expect(
      caller.promoteAdmin({ userId: CALLER_ID }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'You are already an admin',
    } satisfies Partial<TRPCError>);
  });

  it('rejects promoteAdmin from a non-admin caller', async () => {
    const stores = createGroupsStores();
    seedGroup(stores, { adminUserId: 'other-admin' });
    stores.users.get(CALLER_ID)!.groupId = GROUP_ID;
    seedMember(stores);
    const caller = groupsRouter.createCaller(createGroupsContext(stores));

    await expect(
      caller.promoteAdmin({ userId: MEMBER_ID }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Admin only',
    } satisfies Partial<TRPCError>);
  });

  it('demotes another admin', async () => {
    const stores = createGroupsStores();
    seedGroup(stores, { adminUserId: CALLER_ID });
    stores.users.get(CALLER_ID)!.groupId = GROUP_ID;
    seedMember(stores);
    stores.groupAdmins.set(groupAdminKey(GROUP_ID, MEMBER_ID), {
      groupId: GROUP_ID,
      userId: MEMBER_ID,
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
    });
    const caller = groupsRouter.createCaller(createGroupsContext(stores));

    const result = await caller.demoteAdmin({ userId: MEMBER_ID });

    expect(result).toEqual({ userId: MEMBER_ID });
    expect(stores.groupAdmins.has(groupAdminKey(GROUP_ID, MEMBER_ID))).toBe(
      false,
    );
    expect(stores.groups.get(GROUP_ID)?.adminUserId).toBe(CALLER_ID);
  });

  it('updates the primary admin when demoting the primary admin', async () => {
    const stores = createGroupsStores();
    seedGroup(stores, { adminUserId: MEMBER_ID });
    stores.users.get(CALLER_ID)!.groupId = GROUP_ID;
    seedMember(stores);
    stores.groupAdmins.set(groupAdminKey(GROUP_ID, CALLER_ID), {
      groupId: GROUP_ID,
      userId: CALLER_ID,
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
    });
    const caller = groupsRouter.createCaller(createGroupsContext(stores));

    await caller.demoteAdmin({ userId: MEMBER_ID });

    expect(stores.groupAdmins.has(groupAdminKey(GROUP_ID, MEMBER_ID))).toBe(
      false,
    );
    expect(stores.groups.get(GROUP_ID)?.adminUserId).toBe(CALLER_ID);
  });

  it('rejects demoting the last admin', async () => {
    const stores = createGroupsStores();
    seedGroup(stores, { adminUserId: CALLER_ID });
    stores.users.get(CALLER_ID)!.groupId = GROUP_ID;
    seedMember(stores);
    const caller = groupsRouter.createCaller(createGroupsContext(stores));

    await expect(
      caller.demoteAdmin({ userId: MEMBER_ID }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Member is not an admin',
    } satisfies Partial<TRPCError>);
  });
});
