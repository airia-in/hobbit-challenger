import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import {
  ActivityKind,
  type Activity,
  type ActivityLog,
  type Group,
  type User,
} from '@workspace-starter/db';
import {
  createCustomActivityInputSchema,
  negativeXpInputSchema,
  updateActivityInputSchema,
} from '@workspace-starter/types';
import { ActivitiesService } from '../src/services/activities.service';
import { activitiesRouter } from '../src/trpc/routers/activities.router';
import type { Context } from '../src/trpc/context';
import type { PrismaService } from '../src/prisma/prisma.service';

const ADMIN_ID = 'admin-1';
const MEMBER_ID = 'member-1';
const OTHER_USER_ID = 'other-1';
const GROUP_ID = 'group-1';
const PERSONAL_ACTIVITY_ID = 'personal-1';
const GROUP_ACTIVITY_ID = 'group-act-1';
const LOGGED_ACTIVITY_ID = 'logged-act-1';
const LOG_ID = 'log-1';

function createFakePrisma(seed: {
  users: User[];
  groups: Group[];
  activities: Activity[];
  activityLogs?: ActivityLog[];
}) {
  const users = new Map(seed.users.map((u) => [u.id, { ...u }]));
  const groups = new Map(seed.groups.map((g) => [g.id, { ...g }]));
  const activities = new Map(seed.activities.map((a) => [a.id, { ...a }]));
  const activityLogs = new Map(
    (seed.activityLogs ?? []).map((log) => [log.id, { ...log }]),
  );

  let nextId = 1;
  const genId = (prefix: string) => `${prefix}-${nextId++}`;

  const prisma = {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        users.get(where.id) ?? null,
    },
    group: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        groups.get(where.id) ?? null,
    },
    activity: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        activities.get(where.id) ?? null,
      findMany: async ({
        where,
        orderBy,
      }: {
        where?: {
          groupId?: string;
          ownerUserId?: string;
          isPersonal?: boolean;
          scored?: boolean;
        };
        orderBy?: { sortOrder: 'asc' | 'desc' };
      }) => {
        let result = [...activities.values()].filter((activity) => {
          if (
            where?.groupId !== undefined &&
            activity.groupId !== where.groupId
          ) {
            return false;
          }
          if (
            where?.ownerUserId !== undefined &&
            activity.ownerUserId !== where.ownerUserId
          ) {
            return false;
          }
          if (
            where?.isPersonal !== undefined &&
            activity.isPersonal !== where.isPersonal
          ) {
            return false;
          }
          if (where?.scored !== undefined && activity.scored !== where.scored) {
            return false;
          }
          return true;
        });
        if (orderBy?.sortOrder === 'asc') {
          result = result.sort((a, b) => a.sortOrder - b.sortOrder);
        }
        return result.map((a) => ({ ...a }));
      },
      aggregate: async ({
        where,
        _max,
      }: {
        where?: {
          groupId?: string;
          ownerUserId?: string;
          isPersonal?: boolean;
          scored?: boolean;
        };
        _max?: { sortOrder?: boolean };
      }) => {
        const matches = [...activities.values()].filter((activity) => {
          if (
            where?.groupId !== undefined &&
            activity.groupId !== where.groupId
          ) {
            return false;
          }
          if (
            where?.ownerUserId !== undefined &&
            activity.ownerUserId !== where.ownerUserId
          ) {
            return false;
          }
          if (
            where?.isPersonal !== undefined &&
            activity.isPersonal !== where.isPersonal
          ) {
            return false;
          }
          if (where?.scored !== undefined && activity.scored !== where.scored) {
            return false;
          }
          return true;
        });
        const sortOrders = matches.map((a) => a.sortOrder);
        return {
          _max: {
            sortOrder:
              _max?.sortOrder && sortOrders.length > 0
                ? Math.max(...sortOrders)
                : null,
          },
        };
      },
      create: async ({
        data,
      }: {
        data: Omit<Activity, 'id' | 'createdAt'>;
      }) => {
        const activity: Activity = {
          id: genId('activity'),
          createdAt: new Date(),
          ...data,
        };
        activities.set(activity.id, activity);
        return { ...activity };
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<Activity>;
      }) => {
        const existing = activities.get(where.id);
        if (!existing) throw new Error(`Activity not found: ${where.id}`);
        const updated = { ...existing, ...data };
        activities.set(where.id, updated);
        return { ...updated };
      },
    },
    activityLog: {
      count: async ({ where }: { where?: { activityId?: string } }) => {
        return [...activityLogs.values()].filter((log) => {
          if (
            where?.activityId !== undefined &&
            log.activityId !== where.activityId
          ) {
            return false;
          }
          return true;
        }).length;
      },
    },
  };

  return {
    prisma: prisma as unknown as PrismaService,
    stores: { users, groups, activities, activityLogs },
  };
}

function baseUsers(): User[] {
  return [
    {
      id: ADMIN_ID,
      name: 'Admin',
      phone: null,
      email: 'admin@example.com',
      passwordHash: 'hash',
      timezone: 'UTC',
      avatarUrl: null,
      groupId: GROUP_ID,
      reminderTime: null,
      whatsappOptIn: true,
      createdAt: new Date(),
    },
    {
      id: MEMBER_ID,
      name: 'Member',
      phone: null,
      email: 'member@example.com',
      passwordHash: 'hash',
      timezone: 'UTC',
      avatarUrl: null,
      groupId: GROUP_ID,
      reminderTime: null,
      whatsappOptIn: true,
      createdAt: new Date(),
    },
    {
      id: OTHER_USER_ID,
      name: 'Other',
      phone: null,
      email: 'other@example.com',
      passwordHash: 'hash',
      timezone: 'UTC',
      avatarUrl: null,
      groupId: null,
      reminderTime: null,
      whatsappOptIn: true,
      createdAt: new Date(),
    },
  ];
}

function baseGroup(): Group {
  return {
    id: GROUP_ID,
    name: 'Test Group',
    inviteToken: 'token-1',
    adminUserId: ADMIN_ID,
    createdAt: new Date(),
  };
}

function groupCheckboxActivity(id: string, overrides: Partial<Activity> = {}) {
  return {
    id,
    groupId: GROUP_ID,
    ownerUserId: null,
    seedKey: null,
    title: 'Custom checkbox',
    emoji: '✅',
    kind: ActivityKind.CHECKBOX,
    scored: true,
    isPersonal: false,
    xpComplete: 100,
    xpMiss: -50,
    unitLabel: null,
    xpPerUnit: null,
    xpCap: null,
    missXp: null,
    subPoints: null,
    tiers: null,
    deductMultiplier: 2,
    sortOrder: 10,
    active: true,
    createdAt: new Date(),
    ...overrides,
  } satisfies Activity;
}

function personalCheckboxActivity(
  ownerUserId: string,
  overrides: Partial<Activity> = {},
) {
  return {
    id: PERSONAL_ACTIVITY_ID,
    groupId: null,
    ownerUserId,
    seedKey: null,
    title: 'My habit',
    emoji: null,
    kind: ActivityKind.CHECKBOX,
    scored: false,
    isPersonal: true,
    xpComplete: 25,
    xpMiss: -5,
    unitLabel: null,
    xpPerUnit: null,
    xpCap: null,
    missXp: null,
    subPoints: null,
    tiers: null,
    deductMultiplier: 2,
    sortOrder: 0,
    active: true,
    createdAt: new Date(),
    ...overrides,
  } satisfies Activity;
}

function createActivitiesService() {
  return new ActivitiesService({
    verifyProof: vi.fn(),
  } as never);
}

function createRouterContext(
  userId: string,
  fake: ReturnType<typeof createFakePrisma>,
): Context {
  return {
    req: { headers: {} } as Context['req'],
    res: {} as Context['res'],
    user: {
      id: userId,
      email: null,
      phone: null,
      name: 'Test',
    },
    prisma: fake.prisma,
    authService: {} as Context['authService'],
    activitiesService: createActivitiesService(),
    guidanceService: {} as Context['guidanceService'],
  };
}

describe('activity editor schemas', () => {
  it('requires CHECKBOX xp fields and stores negative xpMiss', () => {
    const parsed = createCustomActivityInputSchema.parse({
      kind: 'CHECKBOX',
      title: 'Meditate',
      xpComplete: 50,
      xpMiss: -25,
    });
    expect(parsed.xpMiss).toBe(-25);
    expect(parsed.deductMultiplier).toBe(2);
  });

  it('rejects positive xpMiss for CHECKBOX', () => {
    expect(() =>
      createCustomActivityInputSchema.parse({
        kind: 'CHECKBOX',
        title: 'Meditate',
        xpComplete: 50,
        xpMiss: 25,
      }),
    ).toThrow();
  });

  it('requires NUMBER per-unit and cap > 0', () => {
    const parsed = createCustomActivityInputSchema.parse({
      kind: 'NUMBER',
      title: 'Steps',
      unitLabel: 'steps',
      xpPerUnit: 0.1,
      xpCap: 100,
      missXp: -50,
    });
    expect(parsed.xpPerUnit).toBeGreaterThan(0);
    expect(parsed.xpCap).toBeGreaterThan(0);
    expect(parsed.missXp).toBe(-50);
  });

  it('rejects non-positive xpPerUnit and xpCap for NUMBER', () => {
    expect(() =>
      createCustomActivityInputSchema.parse({
        kind: 'NUMBER',
        title: 'Steps',
        unitLabel: 'steps',
        xpPerUnit: 0,
        xpCap: 100,
        missXp: -10,
      }),
    ).toThrow();

    expect(() =>
      createCustomActivityInputSchema.parse({
        kind: 'NUMBER',
        title: 'Steps',
        unitLabel: 'steps',
        xpPerUnit: 1,
        xpCap: 0,
        missXp: -10,
      }),
    ).toThrow();
  });

  it('accepts deductMultiplier only in {2, 3}', () => {
    expect(
      createCustomActivityInputSchema.parse({
        kind: 'CHECKBOX',
        title: 'A',
        xpComplete: 1,
        xpMiss: -1,
        deductMultiplier: 3,
      }).deductMultiplier,
    ).toBe(3);

    expect(() =>
      createCustomActivityInputSchema.parse({
        kind: 'CHECKBOX',
        title: 'A',
        xpComplete: 1,
        xpMiss: -1,
        deductMultiplier: 4,
      }),
    ).toThrow();
  });

  it('rejects NaN negative XP input', () => {
    expect(() => negativeXpInputSchema.parse(Number.NaN)).toThrow();
  });

  it('rejects empty update payloads', () => {
    expect(() =>
      updateActivityInputSchema.parse({ activityId: 'a1' }),
    ).toThrow();
  });
});

describe('activity editor router', () => {
  let fake: ReturnType<typeof createFakePrisma>;

  beforeEach(() => {
    fake = createFakePrisma({
      users: baseUsers(),
      groups: [baseGroup()],
      activities: [
        groupCheckboxActivity(GROUP_ACTIVITY_ID),
        groupCheckboxActivity(LOGGED_ACTIVITY_ID),
        personalCheckboxActivity(OTHER_USER_ID, { id: 'other-personal' }),
      ],
      activityLogs: [
        {
          id: LOG_ID,
          challengeId: 'challenge-1',
          userId: MEMBER_ID,
          activityId: LOGGED_ACTIVITY_ID,
          date: new Date(),
          value: null,
          tier: null,
          subPoints: null,
          state: 'DONE',
          xpAwarded: 100,
          proofUrl: null,
          aiVerdict: null,
        },
      ],
    });
  });

  it('rejects non-admin group mutations', async () => {
    const caller = activitiesRouter.createCaller(
      createRouterContext(MEMBER_ID, fake),
    );

    await expect(caller.listGroupActivities()).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Admin only',
    } satisfies Partial<TRPCError>);

    await expect(
      caller.createGroupActivity({
        kind: 'CHECKBOX',
        title: 'New',
        xpComplete: 10,
        xpMiss: -5,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('allows admin to list and create group activities', async () => {
    const caller = activitiesRouter.createCaller(
      createRouterContext(ADMIN_ID, fake),
    );

    const listed = await caller.listGroupActivities();
    expect(listed).toHaveLength(2);

    const created = await caller.createGroupActivity({
      kind: 'NUMBER',
      title: 'Weight',
      unitLabel: 'kg',
      xpPerUnit: 10,
      xpCap: 50,
      missXp: -20,
      deductMultiplier: 3,
    });

    expect(created.scored).toBe(true);
    expect(created.isPersonal).toBe(false);
    expect(created.groupId).toBe(GROUP_ID);
    expect(created.missXp).toBe(-20);
    expect(created.deductMultiplier).toBe(3);
    expect(fake.stores.activities.size).toBe(4);
  });

  it('rejects personal activity updates from non-owner', async () => {
    const caller = activitiesRouter.createCaller(
      createRouterContext(MEMBER_ID, fake),
    );

    await expect(
      caller.updatePersonalActivity({
        activityId: 'other-personal',
        title: 'Hijacked',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('creates personal activities with scored=false and no group', async () => {
    const caller = activitiesRouter.createCaller(
      createRouterContext(MEMBER_ID, fake),
    );

    const created = await caller.createPersonalActivity({
      kind: 'CHECKBOX',
      title: 'Journal',
      xpComplete: 15,
      xpMiss: -3,
    });

    expect(created.scored).toBe(false);
    expect(created.isPersonal).toBe(true);
    expect(created.groupId).toBeNull();
    expect(created.ownerUserId).toBe(MEMBER_ID);
    expect(created.xpMiss).toBe(-3);
  });

  it('setActive(false) disables without deleting activity or logs', async () => {
    const caller = activitiesRouter.createCaller(
      createRouterContext(ADMIN_ID, fake),
    );

    const beforeLogs = await fake.prisma.activityLog.count({
      where: { activityId: LOGGED_ACTIVITY_ID },
    });
    expect(beforeLogs).toBe(1);

    const disabled = await caller.setActive({
      activityId: LOGGED_ACTIVITY_ID,
      active: false,
    });

    expect(disabled.active).toBe(false);
    expect(fake.stores.activities.has(LOGGED_ACTIVITY_ID)).toBe(true);

    const afterLogs = await fake.prisma.activityLog.count({
      where: { activityId: LOGGED_ACTIVITY_ID },
    });
    expect(afterLogs).toBe(1);
  });

  it('rejects kind-mismatched update fields for CHECKBOX activity', async () => {
    const caller = activitiesRouter.createCaller(
      createRouterContext(ADMIN_ID, fake),
    );

    await expect(
      caller.updateGroupActivity({
        activityId: GROUP_ACTIVITY_ID,
        unitLabel: 'L',
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Invalid fields for CHECKBOX activity',
    });
  });

  it('allows owner to update their personal activity', async () => {
    fake.stores.activities.set(
      PERSONAL_ACTIVITY_ID,
      personalCheckboxActivity(MEMBER_ID),
    );

    const caller = activitiesRouter.createCaller(
      createRouterContext(MEMBER_ID, fake),
    );

    const updated = await caller.updatePersonalActivity({
      activityId: PERSONAL_ACTIVITY_ID,
      title: 'Renamed',
      xpMiss: -10,
    });

    expect(updated.title).toBe('Renamed');
    expect(updated.xpMiss).toBe(-10);
  });

  it('archivePersonalActivity sets active=false', async () => {
    fake.stores.activities.set(
      PERSONAL_ACTIVITY_ID,
      personalCheckboxActivity(MEMBER_ID),
    );

    const caller = activitiesRouter.createCaller(
      createRouterContext(MEMBER_ID, fake),
    );

    const archived = await caller.archivePersonalActivity({
      activityId: PERSONAL_ACTIVITY_ID,
    });

    expect(archived.active).toBe(false);
    expect(fake.stores.activities.has(PERSONAL_ACTIVITY_ID)).toBe(true);
  });
});
