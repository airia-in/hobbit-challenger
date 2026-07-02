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
      create: {
        groupId,
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
      },
      update: {
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
      },
    });
  }
}
