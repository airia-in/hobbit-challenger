import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ActivityKind,
  type Activity,
  type Challenge,
  type User,
} from '@workspace-starter/db';
import { ActivitiesService } from '../src/services/activities.service';
import { addLocalDays, getUserLocalDate } from '../src/utils/day-window';
import {
  CHECKIN_ACK_FIRST_KIND,
  CHECKIN_ACK_KIND,
} from '../src/whatsapp/checkin-ack-message.service';

const USER_ID = 'user-1';
const GROUP_ID = 'group-1';
const CHALLENGE_ID = 'challenge-1';
const DIET_ID = 'activity-diet';
const WATER_ID = 'activity-water';
const PHOTO_ID = 'activity-photo';

function activityLogKey(
  challengeId: string,
  activityId: string,
  date: Date,
): string {
  return `${challengeId}:${activityId}:${date.getTime()}`;
}

function createFixture() {
  const today = getUserLocalDate('UTC');
  const user: User = {
    id: USER_ID,
    name: 'Alex',
    phone: '+15551234567',
    email: 'alex@example.com',
    passwordHash: 'hash',
    timezone: 'UTC',
    groupId: GROUP_ID,
    avatarUrl: null,
    reminderTime: null,
    whatsappOptIn: true,
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
    currentStreak: 2,
    longestStreak: 2,
  };
  const activities: Activity[] = [
    {
      id: DIET_ID,
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
      allowsProof: false,
      autoCompleteOnProof: false,
      sortOrder: 0,
      active: true,
      createdAt: new Date(),
    },
    {
      id: WATER_ID,
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
      allowsProof: false,
      autoCompleteOnProof: false,
      sortOrder: 1,
      active: true,
      createdAt: new Date(),
    },
    {
      id: PHOTO_ID,
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
      allowsProof: true,
      autoCompleteOnProof: true,
      sortOrder: 2,
      active: true,
      createdAt: new Date(),
    },
  ];

  const users = new Map([[USER_ID, { ...user }]]);
  const challenges = new Map([[CHALLENGE_ID, { ...challenge }]]);
  const activityMap = new Map(activities.map((a) => [a.id, { ...a }]));
  const activityLogs = new Map<string, Record<string, unknown>>();
  const dayScores = new Map<string, Record<string, unknown>>();
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
        let matches = [...challenges.values()].filter((c) => {
          if (where.userId && c.userId !== where.userId) return false;
          if (where.isActive !== undefined && c.isActive !== where.isActive) {
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
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { totalXp?: { increment: number } };
      }) => {
        const row = challenges.get(where.id);
        if (!row) throw new Error('missing challenge');
        if (data.totalXp?.increment) {
          row.totalXp += data.totalXp.increment;
        }
        return row;
      },
    },
    activity: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        activityMap.get(where.id) ?? null,
      findMany: async ({
        where,
        orderBy,
      }: {
        where?: { OR?: Array<Record<string, unknown>> };
        orderBy?: { sortOrder: 'asc' | 'desc' };
      }) => {
        let result = [...activityMap.values()];
        if (where?.OR) {
          result = result.filter((activity) =>
            where.OR!.some((clause) => {
              if (
                clause.groupId !== undefined &&
                activity.groupId !== clause.groupId
              ) {
                return false;
              }
              if (
                clause.active !== undefined &&
                activity.active !== clause.active
              ) {
                return false;
              }
              if (
                clause.scored !== undefined &&
                activity.scored !== clause.scored
              ) {
                return false;
              }
              if (
                clause.ownerUserId !== undefined &&
                activity.ownerUserId !== clause.ownerUserId
              ) {
                return false;
              }
              if (
                clause.isPersonal !== undefined &&
                activity.isPersonal !== clause.isPersonal
              ) {
                return false;
              }
              return true;
            }),
          );
        }
        if (orderBy?.sortOrder === 'asc') {
          result = result.sort((a, b) => a.sortOrder - b.sortOrder);
        }
        return result.map((a) => ({ ...a }));
      },
      aggregate: async () => ({ _max: { sortOrder: 2 } }),
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
        if (where.challengeId && where.activityId && where.date) {
          return (
            activityLogs.get(
              activityLogKey(where.challengeId, where.activityId, where.date),
            ) ?? null
          );
        }
        return null;
      },
      findMany: async ({
        where,
      }: {
        where: {
          challengeId?: string;
          userId?: string;
          activityId?: string | { in: string[] };
          date?: Date | { gte?: Date; lte?: Date };
        };
      }) =>
        [...activityLogs.values()].filter((log) => {
          if (where.challengeId && log.challengeId !== where.challengeId) {
            return false;
          }
          if (where.userId && log.userId !== where.userId) {
            return false;
          }
          if (where.date instanceof Date) {
            if ((log.date as Date).getTime() !== where.date.getTime()) {
              return false;
            }
          }
          return true;
        }),
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
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const key = activityLogKey(
          where.challengeId_activityId_date.challengeId,
          where.challengeId_activityId_date.activityId,
          where.challengeId_activityId_date.date,
        );
        const existing = activityLogs.get(key);
        if (existing) {
          Object.assign(existing, update);
          return { ...existing };
        }
        const row = { id: genId('log'), ...create };
        activityLogs.set(key, row);
        return { ...row };
      },
    },
    dayScore: {
      findFirst: async ({
        where,
      }: {
        where: { challengeId?: string; date?: Date };
      }) => {
        if (!where.challengeId || !where.date) return null;
        return (
          dayScores.get(`${where.challengeId}:${where.date.getTime()}`) ?? null
        );
      },
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { challengeId_date: { challengeId: string; date: Date } };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const key = `${where.challengeId_date.challengeId}:${where.challengeId_date.date.getTime()}`;
        const existing = dayScores.get(key);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row = { id: genId('score'), ...create };
        dayScores.set(key, row);
        return row;
      },
    },
    $transaction: async <T>(fn: (tx: typeof prisma) => Promise<T>) =>
      fn(prisma),
  };

  return { prisma, user, today, activityLogs, activityMap };
}

describe('activities check-in ack trigger', () => {
  let trySendDayCompleteAck: ReturnType<typeof vi.fn>;
  let trySendFirstLogAck: ReturnType<typeof vi.fn>;
  let service: ActivitiesService;

  beforeEach(() => {
    trySendDayCompleteAck = vi.fn().mockResolvedValue(undefined);
    trySendFirstLogAck = vi.fn().mockResolvedValue(undefined);
    service = new ActivitiesService({
      trySendDayCompleteAck,
      trySendFirstLogAck,
    } as never);
  });

  it('acks on first partial log of the day', async () => {
    const { prisma } = createFixture();

    await service.markActivity(prisma as never, USER_ID, DIET_ID);
    await vi.waitFor(() => {
      expect(trySendFirstLogAck).toHaveBeenCalledTimes(1);
      expect(trySendDayCompleteAck).not.toHaveBeenCalled();
    });
    expect(trySendFirstLogAck).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        tasksDone: 1,
        whatsappOptIn: true,
      }),
    );
  });

  it('acks once when the day transitions to perfect-day complete', async () => {
    const { prisma } = createFixture();

    await service.markActivity(prisma as never, USER_ID, DIET_ID);
    await vi.waitFor(() => expect(trySendFirstLogAck).toHaveBeenCalledTimes(1));
    await service.logNumber(prisma as never, USER_ID, WATER_ID, 3.8);
    await service.markActivity(prisma as never, USER_ID, PHOTO_ID);

    await vi.waitFor(() => {
      expect(trySendDayCompleteAck).toHaveBeenCalledTimes(1);
      expect(trySendFirstLogAck).toHaveBeenCalledTimes(1);
    });
    expect(trySendDayCompleteAck).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        tasksDone: 3,
        whatsappOptIn: true,
      }),
    );
  });

  it('sends only day-complete ack on a single-habit day', async () => {
    const { prisma, activityMap } = createFixture();
    for (const id of [WATER_ID, PHOTO_ID]) {
      activityMap.delete(id);
    }

    await service.markActivity(prisma as never, USER_ID, DIET_ID);

    await vi.waitFor(() => {
      expect(trySendDayCompleteAck).toHaveBeenCalledTimes(1);
      expect(trySendFirstLogAck).not.toHaveBeenCalled();
    });
  });

  it('does not ack again after undo and redo the same day (service dedupe)', async () => {
    const { prisma } = createFixture();

    await service.markActivity(prisma as never, USER_ID, DIET_ID);
    await vi.waitFor(() => expect(trySendFirstLogAck).toHaveBeenCalledTimes(1));
    await service.logNumber(prisma as never, USER_ID, WATER_ID, 3.8);
    await service.markActivity(prisma as never, USER_ID, PHOTO_ID);
    await vi.waitFor(() =>
      expect(trySendDayCompleteAck).toHaveBeenCalledTimes(1),
    );

    await service.undoActivity(prisma as never, USER_ID, PHOTO_ID);
    await service.markActivity(prisma as never, USER_ID, PHOTO_ID);
    await vi.waitFor(() =>
      expect(trySendDayCompleteAck).toHaveBeenCalledTimes(1),
    );
    expect(trySendFirstLogAck).toHaveBeenCalledTimes(1);
  });

  it('does not ack when backfilling a historical date', async () => {
    const { prisma } = createFixture();
    const yesterday = addLocalDays(getUserLocalDate('UTC'), -1, 'UTC');
    const yesterdayKey = yesterday.toISOString().slice(0, 10);

    await service.markActivity(prisma as never, USER_ID, DIET_ID, yesterdayKey);
    await service.logNumber(
      prisma as never,
      USER_ID,
      WATER_ID,
      3.8,
      yesterdayKey,
    );
    await service.markActivity(
      prisma as never,
      USER_ID,
      PHOTO_ID,
      yesterdayKey,
    );

    await vi.waitFor(() => {
      expect(trySendDayCompleteAck).not.toHaveBeenCalled();
      expect(trySendFirstLogAck).not.toHaveBeenCalled();
    });
  });

  it('mutation succeeds when ack send rejects', async () => {
    trySendDayCompleteAck.mockRejectedValue(new Error('send blew up'));
    const { prisma } = createFixture();

    await service.markActivity(prisma as never, USER_ID, DIET_ID);
    await service.logNumber(prisma as never, USER_ID, WATER_ID, 3.8);
    const result = await service.markActivity(
      prisma as never,
      USER_ID,
      PHOTO_ID,
    );

    expect(result.dayTotals.netXp).toBeGreaterThan(0);
    await vi.waitFor(() =>
      expect(trySendDayCompleteAck).toHaveBeenCalledTimes(1),
    );
  });

  it('exports CHECKIN_ACK kinds for ReminderLog wiring', () => {
    expect(CHECKIN_ACK_KIND).toBe('CHECKIN_ACK');
    expect(CHECKIN_ACK_FIRST_KIND).toBe('CHECKIN_ACK_FIRST');
  });
});
