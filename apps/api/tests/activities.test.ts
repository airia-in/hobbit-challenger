import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import {
  ActivityKind,
  type Activity,
  type ActivityLog,
  type Challenge,
  type DayScore,
  type User,
} from '@workspace-starter/db';
import { ActivitiesService } from '../src/services/activities.service';
import {
  buildMarkActivityPayload,
  mapActivityToScored,
  mapLogToInput,
  recomputeLiveDayScore,
} from '../src/services/activities.service';
import { computeDayScore } from '../src/services/scoring.service';
import { ProofVerifierService } from '../src/services/proof-verifier.service';
import { getUserLocalDate } from '../src/utils/day-window';
import type { PrismaService } from '../src/prisma/prisma.service';

function activityLogKey(
  challengeId: string,
  activityId: string,
  date: Date,
): string {
  return `${challengeId}:${activityId}:${date.getTime()}`;
}

function dayScoreKey(challengeId: string, date: Date): string {
  return `${challengeId}:${date.getTime()}`;
}

function matchesActivityWhere(
  activity: Activity,
  where: {
    OR?: Array<Record<string, unknown>>;
    groupId?: string;
    active?: boolean;
    scored?: boolean;
    ownerUserId?: string;
    isPersonal?: boolean;
  },
): boolean {
  if (where.OR) {
    return where.OR.some((clause) =>
      matchesActivityWhere(activity, clause as typeof where),
    );
  }

  if (where.groupId !== undefined && activity.groupId !== where.groupId) {
    return false;
  }
  if (where.active !== undefined && activity.active !== where.active) {
    return false;
  }
  if (where.scored !== undefined && activity.scored !== where.scored) {
    return false;
  }
  if (
    where.ownerUserId !== undefined &&
    activity.ownerUserId !== where.ownerUserId
  ) {
    return false;
  }
  if (
    where.isPersonal !== undefined &&
    activity.isPersonal !== where.isPersonal
  ) {
    return false;
  }
  return true;
}

type FakePrismaSeed = {
  users: User[];
  challenges: Challenge[];
  activities: Activity[];
  activityLogs?: ActivityLog[];
  dayScores?: DayScore[];
};

function createFakePrisma(seed: FakePrismaSeed) {
  const users = new Map(seed.users.map((user) => [user.id, { ...user }]));
  const challenges = new Map(
    seed.challenges.map((challenge) => [challenge.id, { ...challenge }]),
  );
  const activities = new Map(
    seed.activities.map((activity) => [activity.id, { ...activity }]),
  );
  const activityLogs = new Map(
    (seed.activityLogs ?? []).map((log) => [
      activityLogKey(log.challengeId, log.activityId, log.date),
      { ...log },
    ]),
  );
  const dayScores = new Map(
    (seed.dayScores ?? []).map((score) => [
      dayScoreKey(score.challengeId, score.date),
      { ...score },
    ]),
  );

  let nextId = 1;
  const genId = (prefix: string) => `${prefix}-${nextId++}`;

  const prisma = {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        users.get(where.id) ?? null,
    },
    challenge: {
      findFirst: async ({
        where,
        orderBy,
      }: {
        where: { userId?: string; isActive?: boolean };
        orderBy?: { startDate: 'desc' | 'asc' };
      }) => {
        let matches = [...challenges.values()].filter((challenge) => {
          if (where.userId !== undefined && challenge.userId !== where.userId) {
            return false;
          }
          if (
            where.isActive !== undefined &&
            challenge.isActive !== where.isActive
          ) {
            return false;
          }
          return true;
        });
        if (orderBy?.startDate === 'desc') {
          matches = matches.sort(
            (a, b) => b.startDate.getTime() - a.startDate.getTime(),
          );
        }
        return matches[0] ?? null;
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const challenge = challenges.get(where.id);
        if (!challenge) {
          throw new Error(`Challenge not found: ${where.id}`);
        }
        return challenge;
      },
    },
    activity: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        activities.get(where.id) ?? null,
      findMany: async ({
        where,
        orderBy,
      }: {
        where?: Parameters<typeof matchesActivityWhere>[1];
        orderBy?: { sortOrder: 'asc' | 'desc' };
      }) => {
        let result = [...activities.values()].filter((activity) =>
          where ? matchesActivityWhere(activity, where) : true,
        );
        if (orderBy?.sortOrder === 'asc') {
          result = result.sort((a, b) => a.sortOrder - b.sortOrder);
        }
        return result.map((activity) => ({ ...activity }));
      },
    },
    activityLog: {
      findFirst: async ({
        where,
      }: {
        where: {
          challengeId?: string;
          activityId?: string;
          userId?: string;
          date?: Date;
        };
      }) => {
        if (
          where.challengeId &&
          where.activityId &&
          where.date &&
          !where.userId
        ) {
          return (
            activityLogs.get(
              activityLogKey(where.challengeId, where.activityId, where.date),
            ) ?? null
          );
        }
        for (const log of activityLogs.values()) {
          if (
            where.challengeId !== undefined &&
            log.challengeId !== where.challengeId
          ) {
            continue;
          }
          if (
            where.activityId !== undefined &&
            log.activityId !== where.activityId
          ) {
            continue;
          }
          if (where.userId !== undefined && log.userId !== where.userId) {
            continue;
          }
          if (
            where.date !== undefined &&
            log.date.getTime() !== where.date.getTime()
          ) {
            continue;
          }
          return { ...log };
        }
        return null;
      },
      findMany: async ({
        where,
      }: {
        where: {
          challengeId?: string;
          userId?: string;
          date?: Date;
        };
      }) =>
        [...activityLogs.values()]
          .filter((log) => {
            if (
              where.challengeId !== undefined &&
              log.challengeId !== where.challengeId
            ) {
              return false;
            }
            if (where.userId !== undefined && log.userId !== where.userId) {
              return false;
            }
            if (
              where.date !== undefined &&
              log.date.getTime() !== where.date.getTime()
            ) {
              return false;
            }
            return true;
          })
          .map((log) => ({ ...log })),
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: {
          challengeId_activityId_date: {
            challengeId: string;
            activityId: string;
            date: Date;
          };
        };
        create: Omit<ActivityLog, 'id'>;
        update: Partial<ActivityLog>;
      }) => {
        const key = activityLogKey(
          where.challengeId_activityId_date.challengeId,
          where.challengeId_activityId_date.activityId,
          where.challengeId_activityId_date.date,
        );
        const existing = activityLogs.get(key);
        if (existing) {
          const updated = { ...existing, ...update };
          activityLogs.set(key, updated);
          return { ...updated };
        }
        const created: ActivityLog = {
          id: genId('log'),
          ...create,
        };
        activityLogs.set(key, created);
        return { ...created };
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<ActivityLog>;
      }) => {
        for (const [key, log] of activityLogs.entries()) {
          if (log.id === where.id) {
            const updated = { ...log, ...data };
            activityLogs.set(key, updated);
            return { ...updated };
          }
        }
        throw new Error(`ActivityLog not found: ${where.id}`);
      },
      deleteMany: async ({
        where,
      }: {
        where: { challengeId?: string; userId?: string };
      }) => {
        for (const [key, log] of [...activityLogs.entries()]) {
          if (
            where.challengeId !== undefined &&
            log.challengeId !== where.challengeId
          ) {
            continue;
          }
          if (where.userId !== undefined && log.userId !== where.userId) {
            continue;
          }
          activityLogs.delete(key);
        }
        return { count: 0 };
      },
    },
    dayScore: {
      findFirst: async ({
        where,
        select,
      }: {
        where: { challengeId?: string; date?: Date; userId?: string };
        select?: Record<string, boolean>;
      }) => {
        for (const score of dayScores.values()) {
          if (
            where.challengeId !== undefined &&
            score.challengeId !== where.challengeId
          ) {
            continue;
          }
          if (
            where.date !== undefined &&
            score.date.getTime() !== where.date.getTime()
          ) {
            continue;
          }
          if (where.userId !== undefined && score.userId !== where.userId) {
            continue;
          }
          if (!select) {
            return { ...score };
          }
          return Object.fromEntries(
            Object.keys(select).map((key) => [
              key,
              score[key as keyof DayScore],
            ]),
          );
        }
        return null;
      },
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: {
          challengeId_date: { challengeId: string; date: Date };
        };
        create: Omit<DayScore, 'id'>;
        update: Partial<DayScore>;
      }) => {
        const key = dayScoreKey(
          where.challengeId_date.challengeId,
          where.challengeId_date.date,
        );
        const existing = dayScores.get(key);
        if (existing) {
          const updated = { ...existing, ...update };
          dayScores.set(key, updated);
          return { ...updated };
        }
        const created: DayScore = {
          id: genId('day-score'),
          ...create,
        };
        dayScores.set(key, created);
        return { ...created };
      },
      deleteMany: async ({
        where,
      }: {
        where: { challengeId?: string; userId?: string };
      }) => {
        for (const [key, score] of [...dayScores.entries()]) {
          if (
            where.challengeId !== undefined &&
            score.challengeId !== where.challengeId
          ) {
            continue;
          }
          if (where.userId !== undefined && score.userId !== where.userId) {
            continue;
          }
          dayScores.delete(key);
        }
        return { count: 0 };
      },
    },
  };

  return {
    prisma: prisma as unknown as PrismaService,
    stores: { users, challenges, activities, activityLogs, dayScores },
  };
}

const USER_ID = 'user-1';
const GROUP_ID = 'group-1';
const CHALLENGE_ID = 'challenge-1';
const CHECKBOX_ACTIVITY_ID = 'act-progress-photo';
const DIET_ACTIVITY_ID = 'act-diet';
const PERSONAL_ACTIVITY_ID = 'act-personal';
const WATER_ACTIVITY_ID = 'act-water';

function createActivitiesFixture() {
  const today = getUserLocalDate('UTC');
  const user: User = {
    id: USER_ID,
    name: 'Test User',
    phone: null,
    email: 'test@example.com',
    passwordHash: 'hash',
    timezone: 'UTC',
    groupId: GROUP_ID,
    avatarUrl: null,
    reminderTime: null,
    createdAt: new Date(),
  };
  const challenge: Challenge = {
    id: CHALLENGE_ID,
    userId: USER_ID,
    groupId: GROUP_ID,
    startDate: today,
    endDate: null,
    lengthDays: 30,
    currentDay: 1,
    isActive: true,
    totalXp: 0,
    currentStreak: 0,
    longestStreak: 0,
  };
  const activities: Activity[] = [
    {
      id: DIET_ACTIVITY_ID,
      groupId: GROUP_ID,
      ownerUserId: null,
      seedKey: 'DIET',
      title: 'Diet',
      emoji: '🥗',
      kind: ActivityKind.CHECKBOX,
      scored: true,
      isPersonal: false,
      xpComplete: 250,
      xpMiss: -250,
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
    },
    {
      id: CHECKBOX_ACTIVITY_ID,
      groupId: GROUP_ID,
      ownerUserId: null,
      seedKey: 'PROGRESS_PHOTO',
      title: 'Progress photo',
      emoji: '📸',
      kind: ActivityKind.CHECKBOX,
      scored: true,
      isPersonal: false,
      xpComplete: 200,
      xpMiss: -200,
      unitLabel: null,
      xpPerUnit: null,
      xpCap: null,
      missXp: null,
      subPoints: null,
      tiers: null,
      deductMultiplier: 2,
      sortOrder: 5,
      active: true,
      createdAt: new Date(),
    },
    {
      id: WATER_ACTIVITY_ID,
      groupId: GROUP_ID,
      ownerUserId: null,
      seedKey: 'WATER',
      title: 'Water',
      emoji: '💧',
      kind: ActivityKind.NUMBER,
      scored: true,
      isPersonal: false,
      xpComplete: null,
      xpMiss: null,
      unitLabel: 'L',
      xpPerUnit: 26.3,
      xpCap: 100,
      missXp: -100,
      subPoints: null,
      tiers: null,
      deductMultiplier: 2,
      sortOrder: 2,
      active: true,
      createdAt: new Date(),
    },
    {
      id: PERSONAL_ACTIVITY_ID,
      groupId: null,
      ownerUserId: USER_ID,
      seedKey: null,
      title: 'Personal journal',
      emoji: null,
      kind: ActivityKind.CHECKBOX,
      scored: false,
      isPersonal: true,
      xpComplete: 50,
      xpMiss: -10,
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
    },
  ];

  return createFakePrisma({
    users: [user],
    challenges: [challenge],
    activities,
  });
}

function createService() {
  return new ActivitiesService({
    verifyProof: async () => ({
      passed: true,
      confidence: 1,
      reason: 'SKIPPED',
    }),
  } as unknown as ProofVerifierService);
}

describe('activities helpers', () => {
  it('buildMarkActivityPayload fills CHECKBOX with DONE', () => {
    const payload = buildMarkActivityPayload({
      id: 'a1',
      kind: 'CHECKBOX',
      scored: true,
      isPersonal: false,
      deductMultiplier: 2,
      xpComplete: 200,
    });
    expect(payload).toEqual({ state: 'DONE' });
  });

  it('buildMarkActivityPayload fills SUBPOINTS with DONE', () => {
    const activity = {
      id: 'a1',
      kind: 'SUBPOINTS' as const,
      scored: true,
      isPersonal: false,
      deductMultiplier: 3,
      subPoints: [
        { key: 'A', label: 'A', xp: 10 },
        { key: 'B', label: 'B', xp: 20 },
      ],
    };
    const payload = buildMarkActivityPayload(activity);
    expect(payload.subPoints).toEqual({ A: 'DONE', B: 'DONE' });
  });

  it('buildMarkActivityPayload picks best TIERED tier', () => {
    const activity = {
      id: 't1',
      kind: 'TIERED' as const,
      scored: true,
      isPersonal: false,
      deductMultiplier: 2,
      tiers: [
        { key: 'OVER', label: 'Over', maxMinutes: null, xp: 0 },
        { key: 'NONE', label: 'None', maxMinutes: 0, xp: 250 },
      ],
    };
    const payload = buildMarkActivityPayload(activity);
    expect(payload.tier).toBe('NONE');
  });

  it('buildMarkActivityPayload computes NUMBER value from xpCap and xpPerUnit', () => {
    const payload = buildMarkActivityPayload({
      id: 'water',
      kind: 'NUMBER',
      scored: true,
      isPersonal: false,
      deductMultiplier: 2,
      xpPerUnit: 26.3,
      xpCap: 100,
    });
    expect(payload.value).toBe(3.8);
  });

  it('buildMarkActivityPayload throws BAD_REQUEST for misconfigured NUMBER', () => {
    expect(() =>
      buildMarkActivityPayload({
        id: 'bad-number',
        kind: 'NUMBER',
        scored: true,
        isPersonal: false,
        deductMultiplier: 2,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'BAD_REQUEST',
        message: 'This activity is not configured for one-tap completion',
      }),
    );
  });

  it('buildMarkActivityPayload throws BAD_REQUEST for TIERED without tiers', () => {
    expect(() =>
      buildMarkActivityPayload({
        id: 'bad-tiered',
        kind: 'TIERED',
        scored: true,
        isPersonal: false,
        deductMultiplier: 2,
        tiers: [],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'BAD_REQUEST',
        message: 'This activity is not configured for one-tap completion',
      }),
    );
  });

  it('mapActivityToScored maps nullable fields to undefined', () => {
    const activity: Activity = {
      id: 'mapped',
      groupId: GROUP_ID,
      ownerUserId: null,
      seedKey: 'WATER',
      title: 'Water',
      emoji: '💧',
      kind: ActivityKind.NUMBER,
      scored: true,
      isPersonal: false,
      xpComplete: null,
      xpMiss: null,
      unitLabel: 'L',
      xpPerUnit: 26.3,
      xpCap: 100,
      missXp: -100,
      subPoints: null,
      tiers: null,
      deductMultiplier: 2,
      sortOrder: 1,
      active: true,
      createdAt: new Date(),
    };
    expect(mapActivityToScored(activity)).toEqual({
      id: 'mapped',
      kind: 'NUMBER',
      scored: true,
      isPersonal: false,
      deductMultiplier: 2,
      xpComplete: undefined,
      xpMiss: undefined,
      unitLabel: 'L',
      xpPerUnit: 26.3,
      xpCap: 100,
      missXp: -100,
      subPoints: undefined,
      tiers: undefined,
    });
  });

  it('mapLogToInput maps log fields for scoring', () => {
    const log: ActivityLog = {
      id: 'log-1',
      challengeId: CHALLENGE_ID,
      userId: USER_ID,
      activityId: CHECKBOX_ACTIVITY_ID,
      date: getUserLocalDate('UTC'),
      value: null,
      tier: null,
      subPoints: null,
      state: 'DONE',
      xpAwarded: 200,
      proofUrl: null,
      aiVerdict: null,
    };
    expect(mapLogToInput(log)).toEqual({
      activityId: CHECKBOX_ACTIVITY_ID,
      state: 'DONE',
      value: null,
      tier: null,
      subPoints: undefined,
    });
  });

  it('computeDayScore with applyGrace false leaves unlogged scored activities at zero deduction', () => {
    const scored = [
      {
        id: CHECKBOX_ACTIVITY_ID,
        kind: 'CHECKBOX' as const,
        scored: true,
        isPersonal: false,
        deductMultiplier: 2,
        xpComplete: 200,
        xpMiss: -200,
      },
      {
        id: WATER_ACTIVITY_ID,
        kind: 'NUMBER' as const,
        scored: true,
        isPersonal: false,
        deductMultiplier: 2,
        xpPerUnit: 26.3,
        xpCap: 100,
        missXp: -100,
      },
    ];
    const logsById: Record<string, undefined> = {
      [CHECKBOX_ACTIVITY_ID]: undefined,
      [WATER_ACTIVITY_ID]: undefined,
    };
    const result = computeDayScore(scored, logsById, { applyGrace: false });
    expect(result.xpDeducted).toBe(0);
    expect(result.netXp).toBe(0);
    expect(result.xpEarned).toBe(0);
  });
});

describe('activities service', () => {
  let fake: ReturnType<typeof createActivitiesFixture>;
  let service: ActivitiesService;

  beforeEach(() => {
    fake = createActivitiesFixture();
    service = createService();
  });

  it('markActivity is idempotent for CHECKBOX', async () => {
    const first = await service.markActivity(
      fake.prisma,
      USER_ID,
      CHECKBOX_ACTIVITY_ID,
    );
    const second = await service.markActivity(
      fake.prisma,
      USER_ID,
      CHECKBOX_ACTIVITY_ID,
    );
    expect(second.log.xpAwarded).toBe(first.log.xpAwarded);
    expect(second.log.xpAwarded).toBe(200);
    expect(fake.stores.activityLogs.size).toBe(1);
  });

  it('undoActivity reverts log and zeroes xp', async () => {
    await service.markActivity(fake.prisma, USER_ID, CHECKBOX_ACTIVITY_ID);
    await service.undoActivity(fake.prisma, USER_ID, CHECKBOX_ACTIVITY_ID);

    const today = getUserLocalDate('UTC');
    const log = await fake.prisma.activityLog.findFirst({
      where: {
        challengeId: CHALLENGE_ID,
        activityId: CHECKBOX_ACTIVITY_ID,
        date: today,
      },
    });
    expect(log?.xpAwarded).toBe(0);
    expect(log?.state).toBeNull();
  });

  it('logNumber rejects non-NUMBER activities', async () => {
    const upsertSpy = vi.spyOn(fake.prisma.activityLog, 'upsert');

    await expect(
      service.logNumber(fake.prisma, USER_ID, CHECKBOX_ACTIVITY_ID, 2),
    ).rejects.toBeInstanceOf(TRPCError);

    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it('attachProof rejects DIET before any write', async () => {
    const upsertSpy = vi.spyOn(fake.prisma.activityLog, 'upsert');

    await expect(
      service.attachProof(
        fake.prisma,
        USER_ID,
        DIET_ACTIVITY_ID,
        'https://example.com/photo.jpg',
      ),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    expect(upsertSpy).not.toHaveBeenCalled();
    expect(fake.stores.activityLogs.size).toBe(0);
  });

  it('personal activity xp is excluded from netXp', async () => {
    await service.markActivity(fake.prisma, USER_ID, PERSONAL_ACTIVITY_ID);

    const today = getUserLocalDate('UTC');
    const dayScore = await fake.prisma.dayScore.findFirst({
      where: { challengeId: CHALLENGE_ID, date: today },
    });
    expect(dayScore?.personalXp).toBeGreaterThan(0);
    expect(dayScore?.netXp).toBe(0);
    expect(dayScore?.finalized).toBe(false);
  });

  it('live DayScore uses applyGrace false (unlogged = 0 deducted)', async () => {
    const today = getUserLocalDate('UTC');
    const activities = await fake.prisma.activity.findMany({
      where: {
        OR: [
          { groupId: GROUP_ID, active: true, scored: true },
          { ownerUserId: USER_ID, isPersonal: true, active: true },
        ],
      },
    });
    const challenge = await fake.prisma.challenge.findUniqueOrThrow({
      where: { id: CHALLENGE_ID },
    });

    const totals = await recomputeLiveDayScore(fake.prisma, {
      challenge,
      userId: USER_ID,
      timezone: 'UTC',
      groupId: GROUP_ID,
    });

    expect(totals.xpDeducted).toBe(0);
    expect(totals.netXp).toBe(0);

    const scored = activities
      .filter((a) => a.scored && !a.isPersonal)
      .map(mapActivityToScored);
    const logsById: Record<
      string,
      ReturnType<typeof mapLogToInput> | undefined
    > = {};
    for (const activity of scored) {
      logsById[activity.id] = undefined;
    }
    const direct = computeDayScore(scored, logsById, { applyGrace: false });
    expect(direct.xpDeducted).toBe(0);
    expect(direct.netXp).toBe(0);
    expect(scored.length).toBeGreaterThan(0);

    const stored = await fake.prisma.dayScore.findFirst({
      where: { challengeId: CHALLENGE_ID, date: today },
    });
    expect(stored?.finalized).toBe(false);
    expect(stored?.netXp).toBe(0);
    expect(stored?.xpDeducted).toBe(0);
  });
});
