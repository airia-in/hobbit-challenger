import { describe, expect, it } from 'vitest';
import { ActivityKind } from '@workspace-starter/db';
import { migrateSoloActivityLogs } from '@workspace-starter/db';

const USER_ID = 'user-1';
const GROUP_ID = 'group-1';
const CHALLENGE_ID = 'challenge-1';
const SOLO_WATER_ID = 'solo-water';
const GROUP_WATER_ID = 'group-water';
const LOG_DATE = new Date('2026-06-15T00:00:00.000Z');

type StoredActivity = {
  id: string;
  ownerUserId: string | null;
  groupId: string | null;
  seedKey: string | null;
  title: string;
  emoji: string | null;
  kind: ActivityKind;
  scored: boolean;
  isPersonal: boolean;
  active: boolean;
};

type StoredLog = {
  id: string;
  challengeId: string;
  userId: string;
  activityId: string;
  date: Date;
};

function logKey(challengeId: string, activityId: string, date: Date): string {
  return `${challengeId}:${activityId}:${date.getTime()}`;
}

function createTransitionPrisma(seed: {
  activities: StoredActivity[];
  logs: StoredLog[];
}) {
  const activities = new Map(
    seed.activities.map((activity) => [activity.id, { ...activity }]),
  );
  const logs = new Map(
    seed.logs.map((log) => [
      logKey(log.challengeId, log.activityId, log.date),
      { ...log },
    ]),
  );

  return {
    activity: {
      findMany: async ({
        where,
      }: {
        where: {
          ownerUserId?: string;
          groupId?: string | null;
          seedKey?: { not: null } | { in: string[] };
        };
      }) =>
        [...activities.values()].filter((activity) => {
          if (
            where.ownerUserId !== undefined &&
            activity.ownerUserId !== where.ownerUserId
          ) {
            return false;
          }
          if (
            where.groupId !== undefined &&
            activity.groupId !== where.groupId
          ) {
            return false;
          }
          if (
            where.seedKey &&
            'not' in where.seedKey &&
            activity.seedKey == null
          ) {
            return false;
          }
          if (
            where.seedKey &&
            'in' in where.seedKey &&
            (!activity.seedKey || !where.seedKey.in.includes(activity.seedKey))
          ) {
            return false;
          }
          return true;
        }),
      findUnique: async () => null,
    },
    activityLog: {
      findMany: async ({
        where,
      }: {
        where: { challengeId: string; activityId: string };
      }) =>
        [...logs.values()].filter(
          (log) =>
            log.challengeId === where.challengeId &&
            log.activityId === where.activityId,
        ),
      findUnique: async ({
        where,
      }: {
        where: {
          challengeId_activityId_date: {
            challengeId: string;
            activityId: string;
            date: Date;
          };
        };
      }) => {
        const key = logKey(
          where.challengeId_activityId_date.challengeId,
          where.challengeId_activityId_date.activityId,
          where.challengeId_activityId_date.date,
        );
        return logs.get(key) ?? null;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { activityId: string };
      }) => {
        const entry = [...logs.entries()].find(
          ([, log]) => log.id === where.id,
        );
        if (!entry) {
          throw new Error('Log not found');
        }
        const [key, log] = entry;
        logs.delete(key);
        const updated = { ...log, activityId: data.activityId };
        logs.set(
          logKey(updated.challengeId, updated.activityId, updated.date),
          updated,
        );
        return updated;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        for (const [key, log] of logs.entries()) {
          if (log.id === where.id) {
            logs.delete(key);
            return log;
          }
        }
        throw new Error('Log not found');
      },
    },
    stores: { activities, logs },
  };
}

describe('migrateSoloActivityLogs', () => {
  it('remaps solo-era logs onto group builtin rows by seedKey', async () => {
    const fake = createTransitionPrisma({
      activities: [
        {
          id: SOLO_WATER_ID,
          ownerUserId: USER_ID,
          groupId: null,
          seedKey: 'WATER',
          title: 'Water',
          emoji: '💧',
          kind: ActivityKind.NUMBER,
          scored: true,
          isPersonal: false,
          active: true,
        },
        {
          id: GROUP_WATER_ID,
          ownerUserId: null,
          groupId: GROUP_ID,
          seedKey: 'WATER',
          title: 'Water',
          emoji: '💧',
          kind: ActivityKind.NUMBER,
          scored: true,
          isPersonal: false,
          active: true,
        },
      ],
      logs: [
        {
          id: 'log-1',
          challengeId: CHALLENGE_ID,
          userId: USER_ID,
          activityId: SOLO_WATER_ID,
          date: LOG_DATE,
        },
      ],
    });

    await migrateSoloActivityLogs(
      fake as never,
      USER_ID,
      CHALLENGE_ID,
      GROUP_ID,
    );

    const remapped = [...fake.stores.logs.values()];
    expect(remapped).toHaveLength(1);
    expect(remapped[0]?.activityId).toBe(GROUP_WATER_ID);
  });

  it('drops solo logs when a group log already exists for the same day', async () => {
    const fake = createTransitionPrisma({
      activities: [
        {
          id: SOLO_WATER_ID,
          ownerUserId: USER_ID,
          groupId: null,
          seedKey: 'WATER',
          title: 'Water',
          emoji: '💧',
          kind: ActivityKind.NUMBER,
          scored: true,
          isPersonal: false,
          active: true,
        },
        {
          id: GROUP_WATER_ID,
          ownerUserId: null,
          groupId: GROUP_ID,
          seedKey: 'WATER',
          title: 'Water',
          emoji: '💧',
          kind: ActivityKind.NUMBER,
          scored: true,
          isPersonal: false,
          active: true,
        },
      ],
      logs: [
        {
          id: 'log-solo',
          challengeId: CHALLENGE_ID,
          userId: USER_ID,
          activityId: SOLO_WATER_ID,
          date: LOG_DATE,
        },
        {
          id: 'log-group',
          challengeId: CHALLENGE_ID,
          userId: USER_ID,
          activityId: GROUP_WATER_ID,
          date: LOG_DATE,
        },
      ],
    });

    await migrateSoloActivityLogs(
      fake as never,
      USER_ID,
      CHALLENGE_ID,
      GROUP_ID,
    );

    const remaining = [...fake.stores.logs.values()];
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe('log-group');
  });
});
