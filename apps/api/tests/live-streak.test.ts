import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ActivityKind,
  type Activity,
  type ActivityLog,
} from '@workspace-starter/db';
import { getLiveStreak } from '../src/utils/live-streak';
import { getUserLocalDate } from '../src/utils/day-window';
import type { PrismaService } from '../src/prisma/prisma.service';

const USER_ID = 'user-1';
const GROUP_ID = 'group-1';
const CHALLENGE_ID = 'challenge-1';
const TIMEZONE = 'UTC';

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

function createFakePrisma(seed: {
  activities: Activity[];
  activityLogs: ActivityLog[];
}) {
  const activities = new Map(
    seed.activities.map((activity) => [activity.id, { ...activity }]),
  );
  const activityLogs = [...seed.activityLogs.map((log) => ({ ...log }))];

  return {
    activity: {
      findMany: async ({
        where,
      }: {
        where?: Parameters<typeof matchesActivityWhere>[1];
      }) =>
        [...activities.values()]
          .filter((activity) =>
            where ? matchesActivityWhere(activity, where) : true,
          )
          .map((activity) => ({
            id: activity.id,
            scored: activity.scored,
            isPersonal: activity.isPersonal,
          })),
    },
    activityLog: {
      findMany: async ({
        where,
      }: {
        where: {
          challengeId?: string;
          userId?: string;
          date?: Date;
        };
      }) =>
        activityLogs
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
          .map((log) => ({
            activityId: log.activityId,
            state: log.state,
            tier: log.tier,
            value: log.value,
            subPoints: log.subPoints,
          })),
    },
  } as unknown as PrismaService;
}

function personalActivity(id: string): Activity {
  return {
    id,
    groupId: null,
    ownerUserId: USER_ID,
    seedKey: null,
    title: `Personal ${id}`,
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
  };
}

function scoredGroupActivity(id: string): Activity {
  return {
    id,
    groupId: GROUP_ID,
    ownerUserId: null,
    seedKey: 'DIET',
    title: `Scored ${id}`,
    emoji: null,
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
    sortOrder: 1,
    active: true,
    createdAt: new Date(),
  };
}

function loggedLog(activityId: string, today: Date): ActivityLog {
  return {
    id: `log-${activityId}`,
    challengeId: CHALLENGE_ID,
    userId: USER_ID,
    activityId,
    date: today,
    state: 'DONE',
    tier: null,
    value: null,
    subPoints: null,
    proofUrl: null,
    aiVerdict: null,
    createdAt: today,
    updatedAt: today,
  };
}

describe('getLiveStreak', () => {
  const fixedNow = new Date('2026-06-15T12:00:00.000Z');
  let today: Date;

  beforeEach(() => {
    vi.setSystemTime(fixedNow);
    today = getUserLocalDate(TIMEZONE);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('increments stored streak for personal-only users when all personal activities are logged today', async () => {
    const prisma = createFakePrisma({
      activities: [personalActivity('p1'), personalActivity('p2')],
      activityLogs: [loggedLog('p1', today), loggedLog('p2', today)],
    });

    const result = await getLiveStreak(prisma, {
      challengeId: CHALLENGE_ID,
      userId: USER_ID,
      groupId: null,
      timezone: TIMEZONE,
      storedStreak: 3,
    });

    expect(result).toBe(4);
  });

  it('returns stored streak for personal-only users with partial personal logs', async () => {
    const prisma = createFakePrisma({
      activities: [personalActivity('p1'), personalActivity('p2')],
      activityLogs: [loggedLog('p1', today)],
    });

    const result = await getLiveStreak(prisma, {
      challengeId: CHALLENGE_ID,
      userId: USER_ID,
      groupId: null,
      timezone: TIMEZONE,
      storedStreak: 3,
    });

    expect(result).toBe(3);
  });

  it('returns stored streak for personal-only users with zero personal activities', async () => {
    const prisma = createFakePrisma({
      activities: [],
      activityLogs: [],
    });

    const result = await getLiveStreak(prisma, {
      challengeId: CHALLENGE_ID,
      userId: USER_ID,
      groupId: null,
      timezone: TIMEZONE,
      storedStreak: 3,
    });

    expect(result).toBe(3);
  });

  it('increments stored streak for grouped users when all scored activities are logged today', async () => {
    const prisma = createFakePrisma({
      activities: [scoredGroupActivity('s1'), scoredGroupActivity('s2')],
      activityLogs: [loggedLog('s1', today), loggedLog('s2', today)],
    });

    const result = await getLiveStreak(prisma, {
      challengeId: CHALLENGE_ID,
      userId: USER_ID,
      groupId: GROUP_ID,
      timezone: TIMEZONE,
      storedStreak: 5,
    });

    expect(result).toBe(6);
  });

  it('does not let personal logs affect grouped streak gating when scored activities are incomplete', async () => {
    const prisma = createFakePrisma({
      activities: [
        scoredGroupActivity('s1'),
        scoredGroupActivity('s2'),
        personalActivity('p1'),
      ],
      activityLogs: [loggedLog('s1', today), loggedLog('p1', today)],
    });

    const result = await getLiveStreak(prisma, {
      challengeId: CHALLENGE_ID,
      userId: USER_ID,
      groupId: GROUP_ID,
      timezone: TIMEZONE,
      storedStreak: 5,
    });

    expect(result).toBe(5);
  });

  it('increments grouped streak when all scored activities are logged even if personal activities are not', async () => {
    // Personal activities must NOT be unioned into a grouped user's gating set:
    // with every scored activity logged, the day counts regardless of personal logs.
    const prisma = createFakePrisma({
      activities: [
        scoredGroupActivity('s1'),
        scoredGroupActivity('s2'),
        personalActivity('p1'),
      ],
      activityLogs: [loggedLog('s1', today), loggedLog('s2', today)],
    });

    const result = await getLiveStreak(prisma, {
      challengeId: CHALLENGE_ID,
      userId: USER_ID,
      groupId: GROUP_ID,
      timezone: TIMEZONE,
      storedStreak: 5,
    });

    expect(result).toBe(6);
  });

  it('returns stored streak for grouped users with no scored activities', async () => {
    // Grouped users never fall back to personal gating: with zero scored
    // activities the day cannot count optimistically, even if personal ones are logged.
    const prisma = createFakePrisma({
      activities: [personalActivity('p1')],
      activityLogs: [loggedLog('p1', today)],
    });

    const result = await getLiveStreak(prisma, {
      challengeId: CHALLENGE_ID,
      userId: USER_ID,
      groupId: GROUP_ID,
      timezone: TIMEZONE,
      storedStreak: 5,
    });

    expect(result).toBe(5);
  });
});
