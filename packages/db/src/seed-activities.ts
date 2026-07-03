import type { ActivityKind, Prisma, PrismaClient } from '@prisma/client';

export type BuiltinActivitySeed = {
  seedKey: string;
  title: string;
  emoji: string;
  kind: ActivityKind;
  sortOrder: number;
  scored: boolean;
  isPersonal: boolean;
  deductMultiplier: number;
  allowsProof: boolean;
  autoCompleteOnProof: boolean;
  xpComplete?: number;
  xpMiss?: number;
  unitLabel?: string;
  xpPerUnit?: number;
  xpCap?: number;
  missXp?: number;
  subPoints?: Prisma.InputJsonValue;
  tiers?: Prisma.InputJsonValue;
};

function builtinProofRules(seedKey: string): {
  allowsProof: boolean;
  autoCompleteOnProof: boolean;
} {
  if (seedKey === 'DIET') {
    return { allowsProof: false, autoCompleteOnProof: false };
  }
  if (seedKey === 'PROGRESS_PHOTO') {
    return { allowsProof: true, autoCompleteOnProof: true };
  }
  return { allowsProof: true, autoCompleteOnProof: false };
}

export const BUILTIN_ACTIVITIES: BuiltinActivitySeed[] = [
  {
    seedKey: 'DIET',
    title: 'Diet',
    emoji: '🥗',
    kind: 'SUBPOINTS',
    sortOrder: 1,
    scored: true,
    isPersonal: false,
    deductMultiplier: 3,
    ...builtinProofRules('DIET'),
    subPoints: [
      { key: 'HEALTHY', label: 'Healthy', xp: 60 },
      { key: 'NO_JUNK', label: 'No junk', xp: 70 },
      { key: 'NO_ALCOHOL', label: 'No alcohol', xp: 20 },
    ],
  },
  {
    seedKey: 'ACTIVITY',
    title: 'Physical activity',
    emoji: '💪',
    kind: 'SUBPOINTS',
    sortOrder: 2,
    scored: true,
    isPersonal: false,
    deductMultiplier: 3,
    ...builtinProofRules('ACTIVITY'),
    subPoints: [
      { key: 'MIN_45', label: '45 min', xp: 200 },
      { key: 'OUTSIDE', label: 'Outside', xp: 50 },
    ],
  },
  {
    seedKey: 'WATER',
    title: 'Water',
    emoji: '💧',
    kind: 'NUMBER',
    sortOrder: 3,
    scored: true,
    isPersonal: false,
    deductMultiplier: 2,
    ...builtinProofRules('WATER'),
    unitLabel: 'L',
    xpPerUnit: 26.3,
    xpCap: 100,
    missXp: -100,
  },
  {
    seedKey: 'READING',
    title: 'Book reading',
    emoji: '📖',
    kind: 'SUBPOINTS',
    sortOrder: 4,
    scored: true,
    isPersonal: false,
    deductMultiplier: 2,
    ...builtinProofRules('READING'),
    subPoints: [
      { key: 'PAGES_10', label: '10 pages', xp: 100 },
      { key: 'NON_FICTION', label: 'Non-fiction', xp: 50 },
    ],
  },
  {
    seedKey: 'PROGRESS_PHOTO',
    title: 'Progress photo',
    emoji: '📸',
    kind: 'CHECKBOX',
    sortOrder: 5,
    scored: true,
    isPersonal: false,
    deductMultiplier: 2,
    ...builtinProofRules('PROGRESS_PHOTO'),
    xpComplete: 200,
    xpMiss: -200,
  },
  {
    seedKey: 'NO_REELS',
    title: 'No Reels/Shorts',
    emoji: '📵',
    kind: 'TIERED',
    sortOrder: 6,
    scored: true,
    isPersonal: false,
    deductMultiplier: 2,
    ...builtinProofRules('NO_REELS'),
    tiers: [
      { key: 'NONE', label: '0 min', maxMinutes: 0, xp: 250 },
      { key: 'UNDER_30', label: '<=30 min', maxMinutes: 30, xp: 150 },
      { key: 'UNDER_60', label: '<=60 min', maxMinutes: 60, xp: 60 },
      { key: 'OVER', label: '>60 min', maxMinutes: null, xp: 0 },
    ],
  },
  {
    seedKey: 'NO_SOCIAL',
    title: 'No Social Media',
    emoji: '📱',
    kind: 'TIERED',
    sortOrder: 7,
    scored: true,
    isPersonal: false,
    deductMultiplier: 2,
    ...builtinProofRules('NO_SOCIAL'),
    tiers: [
      { key: 'NONE', label: '0 min', maxMinutes: 0, xp: 250 },
      { key: 'UNDER_30', label: '<=30 min', maxMinutes: 30, xp: 150 },
      { key: 'UNDER_60', label: '<=60 min', maxMinutes: 60, xp: 60 },
      { key: 'OVER', label: '>60 min', maxMinutes: null, xp: 0 },
    ],
  },
];

type SeedClient = Pick<PrismaClient, 'activity'>;

type SoloSeedClient = Pick<PrismaClient, 'activity'>;

type SoloTransitionClient = Pick<PrismaClient, 'activity' | 'activityLog'>;

function builtinActivityData(
  activity: BuiltinActivitySeed,
  overrides: {
    groupId?: string | null;
    ownerUserId?: string | null;
  },
) {
  return {
    groupId: overrides.groupId ?? null,
    ownerUserId: overrides.ownerUserId ?? null,
    seedKey: activity.seedKey,
    title: activity.title,
    emoji: activity.emoji,
    kind: activity.kind,
    scored: activity.scored,
    isPersonal: activity.isPersonal,
    deductMultiplier: activity.deductMultiplier,
    allowsProof: activity.allowsProof,
    autoCompleteOnProof: activity.autoCompleteOnProof,
    sortOrder: activity.sortOrder,
    xpComplete: activity.xpComplete,
    xpMiss: activity.xpMiss,
    unitLabel: activity.unitLabel,
    xpPerUnit: activity.xpPerUnit,
    xpCap: activity.xpCap,
    missXp: activity.missXp,
    subPoints: activity.subPoints,
    tiers: activity.tiers,
    active: true,
  };
}

export async function seedGroupActivities(
  prisma: SeedClient,
  groupId: string,
): Promise<void> {
  for (const activity of BUILTIN_ACTIVITIES) {
    await prisma.activity.upsert({
      where: {
        groupId_seedKey: {
          groupId,
          seedKey: activity.seedKey,
        },
      },
      create: builtinActivityData(activity, { groupId }),
      update: {
        ...builtinActivityData(activity, { groupId }),
      },
    });
  }
}

/** Builtin scored habits for groupless users (owner-scoped, not custom personal). */
export async function seedSoloActivities(
  prisma: SoloSeedClient,
  userId: string,
): Promise<void> {
  for (const activity of BUILTIN_ACTIVITIES) {
    const data = builtinActivityData(activity, {
      groupId: null,
      ownerUserId: userId,
    });

    await prisma.activity.upsert({
      where: {
        ownerUserId_seedKey: {
          ownerUserId: userId,
          seedKey: activity.seedKey,
        },
      },
      create: data,
      update: data,
    });
  }
}

export async function hasActiveSoloBuiltins(
  prisma: SoloSeedClient,
  userId: string,
): Promise<boolean> {
  const count = await prisma.activity.count({
    where: {
      ownerUserId: userId,
      groupId: null,
      scored: true,
      isPersonal: false,
      seedKey: { not: null },
      active: true,
    },
  });
  return count > 0;
}

/** Lazy backfill for legacy groupless users created before solo seeding shipped. */
export async function ensureSoloActivities(
  prisma: SoloSeedClient,
  userId: string,
): Promise<boolean> {
  if (await hasActiveSoloBuiltins(prisma, userId)) {
    return true;
  }

  const anySoloBuiltin = await prisma.activity.count({
    where: {
      ownerUserId: userId,
      groupId: null,
      seedKey: { not: null },
    },
  });
  if (anySoloBuiltin > 0) {
    return false;
  }

  await seedSoloActivities(prisma, userId);
  return true;
}

/**
 * Remap solo-era activity logs onto group builtin rows when joining a fellowship.
 * Must run after group builtins are seeded and before solo rows are deactivated.
 */
export async function migrateSoloActivityLogs(
  prisma: SoloTransitionClient,
  userId: string,
  challengeId: string,
  groupId: string,
): Promise<void> {
  const soloActivities = await prisma.activity.findMany({
    where: {
      ownerUserId: userId,
      groupId: null,
      seedKey: { not: null },
    },
    select: { id: true, seedKey: true },
  });

  if (soloActivities.length === 0) {
    return;
  }

  const groupActivities = await prisma.activity.findMany({
    where: {
      groupId,
      seedKey: {
        in: soloActivities
          .map((activity) => activity.seedKey)
          .filter((seedKey): seedKey is string => seedKey != null),
      },
    },
    select: { id: true, seedKey: true },
  });

  const groupActivityIdBySeedKey = new Map(
    groupActivities
      .filter(
        (activity): activity is { id: string; seedKey: string } =>
          activity.seedKey != null,
      )
      .map((activity) => [activity.seedKey, activity.id]),
  );

  for (const soloActivity of soloActivities) {
    if (!soloActivity.seedKey) {
      continue;
    }

    const groupActivityId = groupActivityIdBySeedKey.get(soloActivity.seedKey);
    if (!groupActivityId) {
      continue;
    }

    const soloLogs = await prisma.activityLog.findMany({
      where: {
        challengeId,
        activityId: soloActivity.id,
      },
    });

    for (const log of soloLogs) {
      const conflicting = await prisma.activityLog.findUnique({
        where: {
          challengeId_activityId_date: {
            challengeId,
            activityId: groupActivityId,
            date: log.date,
          },
        },
      });

      if (conflicting) {
        await prisma.activityLog.delete({ where: { id: log.id } });
        continue;
      }

      await prisma.activityLog.update({
        where: { id: log.id },
        data: { activityId: groupActivityId },
      });
    }
  }
}

/** Hide solo builtin habits once the user joins or creates a fellowship. */
export async function deactivateSoloActivities(
  prisma: SoloSeedClient,
  userId: string,
): Promise<void> {
  await prisma.activity.updateMany({
    where: {
      ownerUserId: userId,
      groupId: null,
      scored: true,
      isPersonal: false,
      seedKey: { not: null },
    },
    data: { active: false },
  });
}
