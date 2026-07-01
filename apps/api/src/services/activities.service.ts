import { Injectable } from '@nestjs/common';
import { TRPCError } from '@trpc/server';
import {
  Prisma,
  type Activity,
  type ActivityLog,
  type Challenge,
} from '@workspace-starter/db';
import type { PrismaService } from '../prisma/prisma.service';

type PrismaClientLike = PrismaService | Prisma.TransactionClient;
import { computeDayLoggingStatus } from '../utils/day-completion';
import { getUserLocalDate, isBeforeMidnight } from '../utils/day-window';
import {
  type ActivityLogInput,
  type ActivityLogState,
  type ScoredActivity,
  type SubPointConfig,
  type TierConfig,
  computeActivityXp,
  computeDayScore,
} from './scoring.service';
import type {
  ActivityEditorRow,
  CreateCustomActivityInput,
  SetActivityActiveInput,
  UpdateActivityInput,
} from '@workspace-starter/types';
import { ProofVerifierService } from './proof-verifier.service';

export const LEGACY_TASK_TYPES = [
  'DIET',
  'OUTDOOR_WORKOUT',
  'INDOOR_WORKOUT',
  'WATER',
  'READING',
  'PROGRESS_PHOTO',
  'NO_REELS',
  'NO_SOCIAL',
] as const;

export type LegacyTaskType = (typeof LEGACY_TASK_TYPES)[number];

const SEED_KEY_TO_LEGACY_TASK: Record<string, LegacyTaskType> = {
  DIET: 'DIET',
  ACTIVITY: 'OUTDOOR_WORKOUT',
  WATER: 'WATER',
  READING: 'READING',
  PROGRESS_PHOTO: 'PROGRESS_PHOTO',
  NO_REELS: 'NO_REELS',
  NO_SOCIAL: 'NO_SOCIAL',
};

export type DayTotals = {
  netXp: number;
  personalXp: number;
  xpEarned: number;
  xpDeducted: number;
};

export type TodayActivityLog = {
  id: string;
  state: ActivityLogState | null;
  value: number | null;
  tier: string | null;
  subPoints: Record<string, ActivityLogState> | null;
  xpAwarded: number;
  proofUrl: string | null;
  aiVerdict: string | null;
};

export type TodayActivity = {
  id: string;
  seedKey: string | null;
  title: string;
  emoji: string | null;
  kind: ScoredActivity['kind'];
  scored: boolean;
  isPersonal: boolean;
  xpComplete?: number;
  xpMiss?: number;
  unitLabel?: string;
  xpPerUnit?: number;
  xpCap?: number;
  missXp?: number;
  subPoints?: SubPointConfig[];
  tiers?: TierConfig[];
  deductMultiplier: number;
  log: TodayActivityLog | null;
  canAttachProof: boolean;
};

export type GetTodayResult = {
  currentDay: number;
  date: Date;
  canEdit: boolean;
  dayTotals: DayTotals;
  scoredActivities: TodayActivity[];
  personalActivities: TodayActivity[];
};

export type MutationResult = {
  log: ActivityLog;
  dayTotals: DayTotals;
};

export function mapActivityToScored(activity: Activity): ScoredActivity {
  return {
    id: activity.id,
    kind: activity.kind,
    scored: activity.scored,
    isPersonal: activity.isPersonal,
    deductMultiplier: activity.deductMultiplier,
    xpComplete: activity.xpComplete ?? undefined,
    xpMiss: activity.xpMiss ?? undefined,
    unitLabel: activity.unitLabel ?? undefined,
    xpPerUnit: activity.xpPerUnit ?? undefined,
    xpCap: activity.xpCap ?? undefined,
    missXp: activity.missXp ?? undefined,
    subPoints: (activity.subPoints ?? undefined) as
      | SubPointConfig[]
      | undefined,
    tiers: (activity.tiers ?? undefined) as TierConfig[] | undefined,
  };
}

export function mapLogToInput(log: ActivityLog): ActivityLogInput {
  return {
    activityId: log.activityId,
    state: (log.state as ActivityLogState | null) ?? undefined,
    value: log.value,
    tier: log.tier,
    subPoints:
      (log.subPoints as Record<string, ActivityLogState> | null) ?? undefined,
  };
}

function emptyDayTotals(): DayTotals {
  return { netXp: 0, personalXp: 0, xpEarned: 0, xpDeducted: 0 };
}

function mapActivityToToday(
  activity: Activity,
  log: ActivityLog | null,
): TodayActivity {
  const scored = mapActivityToScored(activity);
  return {
    id: activity.id,
    seedKey: activity.seedKey,
    title: activity.title,
    emoji: activity.emoji,
    kind: activity.kind,
    scored: activity.scored,
    isPersonal: activity.isPersonal,
    xpComplete: scored.xpComplete,
    xpMiss: scored.xpMiss,
    unitLabel: scored.unitLabel,
    xpPerUnit: scored.xpPerUnit,
    xpCap: scored.xpCap,
    missXp: scored.missXp,
    subPoints: scored.subPoints,
    tiers: scored.tiers,
    deductMultiplier: activity.deductMultiplier,
    log: log
      ? {
          id: log.id,
          state: (log.state as ActivityLogState | null) ?? null,
          value: log.value,
          tier: log.tier,
          subPoints:
            (log.subPoints as Record<string, ActivityLogState> | null) ?? null,
          xpAwarded: log.xpAwarded,
          proofUrl: log.proofUrl,
          aiVerdict: log.aiVerdict,
        }
      : null,
    canAttachProof: activity.seedKey !== 'DIET',
  };
}

function fullCompletionNumberValue(activity: ScoredActivity): number {
  // Use the same xpPerUnit default as the scoring engine (?? 0) so a one-tap
  // "mark done" can never appear to succeed while awarding 0 XP.
  const xpPerUnit = activity.xpPerUnit ?? 0;
  const xpCap = activity.xpCap ?? 0;
  if (xpCap <= 0 || xpPerUnit <= 0) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'This activity is not configured for one-tap completion',
    });
  }
  return Math.round((xpCap / xpPerUnit) * 100) / 100;
}

function bestTierKey(activity: ScoredActivity): string | null {
  const tiers = activity.tiers ?? [];
  if (tiers.length === 0) {
    return null;
  }
  const best = tiers.reduce((a, b) => (b.xp > a.xp ? b : a));
  return best.key;
}

export function buildMarkActivityPayload(
  activity: ScoredActivity,
): Pick<ActivityLogInput, 'state' | 'value' | 'tier' | 'subPoints'> {
  switch (activity.kind) {
    case 'CHECKBOX':
      return { state: 'DONE' };
    case 'NUMBER':
      return { value: fullCompletionNumberValue(activity) };
    case 'TIERED': {
      const tier = bestTierKey(activity);
      if (!tier) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This activity is not configured for one-tap completion',
        });
      }
      return { tier };
    }
    case 'SUBPOINTS': {
      const subPoints: Record<string, ActivityLogState> = {};
      for (const sp of activity.subPoints ?? []) {
        subPoints[sp.key] = 'DONE';
      }
      return { subPoints };
    }
    default: {
      const _exhaustive: never = activity.kind;
      throw new Error(`Unsupported activity kind: ${String(_exhaustive)}`);
    }
  }
}

type RecomputeParams = {
  challenge: Pick<Challenge, 'id' | 'currentDay' | 'userId'>;
  userId: string;
  timezone: string;
  groupId: string | null;
};

export function mapActivityToEditorRow(activity: Activity): ActivityEditorRow {
  return {
    id: activity.id,
    groupId: activity.groupId,
    ownerUserId: activity.ownerUserId,
    seedKey: activity.seedKey,
    title: activity.title,
    emoji: activity.emoji,
    kind: activity.kind,
    scored: activity.scored,
    isPersonal: activity.isPersonal,
    xpComplete: activity.xpComplete,
    xpMiss: activity.xpMiss,
    unitLabel: activity.unitLabel,
    xpPerUnit: activity.xpPerUnit,
    xpCap: activity.xpCap,
    missXp: activity.missXp,
    subPoints: (activity.subPoints ?? null) as ActivityEditorRow['subPoints'],
    tiers: (activity.tiers ?? null) as ActivityEditorRow['tiers'],
    deductMultiplier: activity.deductMultiplier,
    sortOrder: activity.sortOrder,
    active: activity.active,
  };
}

async function resolveNextSortOrder(
  prisma: PrismaService,
  where: Prisma.ActivityWhereInput,
): Promise<number> {
  const max = await prisma.activity.aggregate({
    where,
    _max: { sortOrder: true },
  });
  return (max._max.sortOrder ?? -1) + 1;
}

function buildCreateActivityData(input: CreateCustomActivityInput) {
  const base = {
    title: input.title,
    emoji: input.emoji ?? null,
    kind: input.kind,
    deductMultiplier: input.deductMultiplier,
    sortOrder: input.sortOrder,
    seedKey: null,
    active: true,
  };

  if (input.kind === 'CHECKBOX') {
    return {
      ...base,
      xpComplete: input.xpComplete,
      xpMiss: input.xpMiss,
      unitLabel: null,
      xpPerUnit: null,
      xpCap: null,
      missXp: null,
    };
  }

  return {
    ...base,
    xpComplete: null,
    xpMiss: null,
    unitLabel: input.unitLabel,
    xpPerUnit: input.xpPerUnit,
    xpCap: input.xpCap,
    missXp: input.missXp,
  };
}

function assertKindSpecificUpdateFields(
  activity: Activity,
  input: UpdateActivityInput,
) {
  const hasCheckboxFields =
    input.xpComplete !== undefined || input.xpMiss !== undefined;
  const hasNumberFields =
    input.unitLabel !== undefined ||
    input.xpPerUnit !== undefined ||
    input.xpCap !== undefined ||
    input.missXp !== undefined;
  const hasSubPoints = input.subPoints !== undefined;
  const hasTiers = input.tiers !== undefined;

  switch (activity.kind) {
    case 'CHECKBOX':
      if (hasNumberFields || hasSubPoints || hasTiers) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid fields for CHECKBOX activity',
        });
      }
      break;
    case 'NUMBER':
      if (hasCheckboxFields || hasSubPoints || hasTiers) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid fields for NUMBER activity',
        });
      }
      break;
    case 'SUBPOINTS':
      if (hasCheckboxFields || hasNumberFields || hasTiers) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid fields for SUBPOINTS activity',
        });
      }
      break;
    case 'TIERED':
      if (hasCheckboxFields || hasNumberFields || hasSubPoints) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid fields for TIERED activity',
        });
      }
      break;
    default: {
      const _exhaustive: never = activity.kind;
      throw new Error(`Unsupported activity kind: ${String(_exhaustive)}`);
    }
  }
}

function buildUpdateActivityData(
  activity: Activity,
  input: UpdateActivityInput,
): Prisma.ActivityUpdateInput {
  assertKindSpecificUpdateFields(activity, input);

  const data: Prisma.ActivityUpdateInput = {};

  if (input.title !== undefined) data.title = input.title;
  if (input.emoji !== undefined) data.emoji = input.emoji;
  if (input.deductMultiplier !== undefined) {
    data.deductMultiplier = input.deductMultiplier;
  }
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;

  if (activity.kind === 'CHECKBOX') {
    if (input.xpComplete !== undefined) data.xpComplete = input.xpComplete;
    if (input.xpMiss !== undefined) data.xpMiss = input.xpMiss;
  } else if (activity.kind === 'NUMBER') {
    if (input.unitLabel !== undefined) data.unitLabel = input.unitLabel;
    if (input.xpPerUnit !== undefined) data.xpPerUnit = input.xpPerUnit;
    if (input.xpCap !== undefined) data.xpCap = input.xpCap;
    if (input.missXp !== undefined) data.missXp = input.missXp;
  } else if (activity.kind === 'SUBPOINTS') {
    if (input.subPoints !== undefined) data.subPoints = input.subPoints;
  } else if (activity.kind === 'TIERED') {
    if (input.tiers !== undefined) data.tiers = input.tiers;
  }

  return data;
}

async function assertGroupActivity(
  prisma: PrismaService,
  activityId: string,
  groupId: string,
): Promise<Activity> {
  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
  });

  if (
    !activity ||
    activity.groupId !== groupId ||
    activity.isPersonal ||
    !activity.scored
  ) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Activity not found' });
  }

  return activity;
}

async function assertPersonalActivityOwnership(
  prisma: PrismaService,
  activityId: string,
  userId: string,
): Promise<Activity> {
  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
  });

  if (!activity || !activity.isPersonal || activity.ownerUserId !== userId) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Activity not found' });
  }

  return activity;
}

export async function recomputeLiveDayScore(
  prisma: PrismaClientLike,
  { challenge, userId, timezone, groupId }: RecomputeParams,
): Promise<DayTotals> {
  const today = getUserLocalDate(timezone);

  const activities = await loadUserActivities(prisma, {
    userId,
    groupId,
  });

  const logs = await prisma.activityLog.findMany({
    where: { challengeId: challenge.id, userId, date: today },
  });

  const logsById = Object.fromEntries(
    logs.map((log) => [log.activityId, mapLogToInput(log)]),
  );

  const scoredActivities = activities.map(mapActivityToScored);
  const score = computeDayScore(scoredActivities, logsById, {
    applyGrace: false,
  });

  const scoredIds = activities
    .filter((a) => a.scored && !a.isPersonal)
    .map((a) => a.id);
  const personalIds = activities.filter((a) => a.isPersonal).map((a) => a.id);

  const logInputs = logs.map((log) => ({
    activityId: log.activityId,
    state: log.state,
    tier: log.tier,
    value: log.value,
    subPoints: log.subPoints,
  }));

  const { allScoredLogged } = computeDayLoggingStatus(scoredIds, logInputs);
  const { allScoredLogged: allPersonalLogged } = computeDayLoggingStatus(
    personalIds,
    logInputs,
  );

  const dayCounted =
    scoredIds.length > 0
      ? allScoredLogged
      : personalIds.length > 0
        ? allPersonalLogged
        : false;

  await prisma.dayScore.upsert({
    where: {
      challengeId_date: { challengeId: challenge.id, date: today },
    },
    create: {
      challengeId: challenge.id,
      userId,
      date: today,
      dayNumber: challenge.currentDay,
      xpEarned: score.xpEarned,
      xpDeducted: score.xpDeducted,
      netXp: score.netXp,
      personalXp: score.personalXp,
      breakdown: { allScoredLogged: dayCounted, entries: score.breakdown },
      finalized: false,
    },
    update: {
      xpEarned: score.xpEarned,
      xpDeducted: score.xpDeducted,
      netXp: score.netXp,
      personalXp: score.personalXp,
      breakdown: { allScoredLogged: dayCounted, entries: score.breakdown },
      finalized: false,
    },
  });

  return {
    netXp: score.netXp,
    personalXp: score.personalXp,
    xpEarned: score.xpEarned,
    xpDeducted: score.xpDeducted,
  };
}

async function loadUserActivities(
  prisma: PrismaClientLike,
  { userId, groupId }: { userId: string; groupId: string | null },
) {
  const orConditions: Prisma.ActivityWhereInput[] = [
    { ownerUserId: userId, isPersonal: true, active: true },
  ];

  if (groupId) {
    orConditions.unshift({ groupId, active: true, scored: true });
  }

  return prisma.activity.findMany({
    where: { OR: orConditions },
    orderBy: { sortOrder: 'asc' },
  });
}

async function findActiveChallenge(prisma: PrismaService, userId: string) {
  return prisma.challenge.findFirst({
    where: { userId, isActive: true },
    orderBy: { startDate: 'desc' },
  });
}

async function assertActivityAccess(
  prisma: PrismaService,
  activity: Activity,
  userId: string,
  groupId: string | null,
) {
  if (activity.isPersonal && activity.ownerUserId === userId) {
    return;
  }
  if (activity.groupId && activity.groupId === groupId) {
    return;
  }
  throw new TRPCError({
    code: 'NOT_FOUND',
    message: 'Activity not found',
  });
}

async function assertCanMutate(
  prisma: PrismaService,
  challengeId: string,
  timezone: string,
) {
  if (!isBeforeMidnight(timezone)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Submissions are locked after midnight',
    });
  }

  const today = getUserLocalDate(timezone);
  const todayScore = await prisma.dayScore.findFirst({
    where: { challengeId, date: today },
    select: { finalized: true },
  });

  if (todayScore?.finalized) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: "Today's score is finalized",
    });
  }
}

function computeXpAwarded(
  activity: ScoredActivity,
  logInput: ActivityLogInput,
): number {
  const { earned, deducted } = computeActivityXp(activity, logInput, {
    applyGrace: false,
  });
  return earned - deducted;
}

function seedKeyToLegacyTask(seedKey: string | null): LegacyTaskType | null {
  if (!seedKey) {
    return null;
  }
  return SEED_KEY_TO_LEGACY_TASK[seedKey] ?? null;
}

@Injectable()
export class ActivitiesService {
  constructor(private readonly proofVerifier: ProofVerifierService) {}

  async getToday(
    prisma: PrismaService,
    userId: string,
  ): Promise<GetTodayResult> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
    }

    const todayDate = getUserLocalDate(user.timezone);
    const canEdit = isBeforeMidnight(user.timezone);

    const challenge = await findActiveChallenge(prisma, userId);
    if (!challenge) {
      return {
        currentDay: 1,
        date: todayDate,
        canEdit,
        dayTotals: emptyDayTotals(),
        scoredActivities: [],
        personalActivities: [],
      };
    }

    const activities = await loadUserActivities(prisma, {
      userId,
      groupId: user.groupId,
    });

    const logs = await prisma.activityLog.findMany({
      where: {
        challengeId: challenge.id,
        userId,
        date: todayDate,
      },
    });

    const logByActivityId = new Map(logs.map((log) => [log.activityId, log]));

    const todayScore = await prisma.dayScore.findFirst({
      where: { challengeId: challenge.id, date: todayDate },
    });

    let dayTotals: DayTotals;
    if (todayScore && !todayScore.finalized) {
      dayTotals = {
        netXp: todayScore.netXp,
        personalXp: todayScore.personalXp,
        xpEarned: todayScore.xpEarned,
        xpDeducted: todayScore.xpDeducted,
      };
    } else if (activities.length > 0) {
      dayTotals = await recomputeLiveDayScore(prisma, {
        challenge,
        userId,
        timezone: user.timezone,
        groupId: user.groupId,
      });
    } else {
      dayTotals = emptyDayTotals();
    }

    const scoredActivities: TodayActivity[] = [];
    const personalActivities: TodayActivity[] = [];

    for (const activity of activities) {
      const today = mapActivityToToday(
        activity,
        logByActivityId.get(activity.id) ?? null,
      );
      if (activity.isPersonal) {
        personalActivities.push(today);
      } else {
        scoredActivities.push(today);
      }
    }

    return {
      currentDay: challenge.currentDay,
      date: todayDate,
      canEdit,
      dayTotals,
      scoredActivities,
      personalActivities,
    };
  }

  async markActivity(
    prisma: PrismaService,
    userId: string,
    activityId: string,
  ): Promise<MutationResult> {
    return this.upsertActivityLog(
      prisma,
      userId,
      activityId,
      (activity) => buildMarkActivityPayload(mapActivityToScored(activity)),
      'replace',
    );
  }

  async logNumber(
    prisma: PrismaService,
    userId: string,
    activityId: string,
    value: number,
  ): Promise<MutationResult> {
    return this.upsertActivityLog(
      prisma,
      userId,
      activityId,
      (activity) => {
        if (activity.kind !== 'NUMBER') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Activity is not a NUMBER kind',
          });
        }
        return { value };
      },
      'number',
    );
  }

  async setSubPoints(
    prisma: PrismaService,
    userId: string,
    activityId: string,
    states: Record<string, ActivityLogState>,
  ): Promise<MutationResult> {
    return this.upsertActivityLog(
      prisma,
      userId,
      activityId,
      (activity) => {
        if (activity.kind !== 'SUBPOINTS') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Activity is not a SUBPOINTS kind',
          });
        }
        return { subPoints: states };
      },
      'mergeSubPoints',
    );
  }

  async setTier(
    prisma: PrismaService,
    userId: string,
    activityId: string,
    tier: string,
  ): Promise<MutationResult> {
    return this.upsertActivityLog(
      prisma,
      userId,
      activityId,
      (activity) => {
        if (activity.kind !== 'TIERED') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Activity is not a TIERED kind',
          });
        }
        const tiers = (activity.tiers ?? []) as TierConfig[];
        if (!tiers.some((t) => t.key === tier)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Unknown tier key: ${tier}`,
          });
        }
        return { tier };
      },
      'tier',
    );
  }

  async undoActivity(
    prisma: PrismaService,
    userId: string,
    activityId: string,
  ): Promise<MutationResult> {
    const ctx = await this.loadMutationContext(prisma, userId, activityId);
    await assertCanMutate(prisma, ctx.challenge.id, ctx.user.timezone);

    const today = getUserLocalDate(ctx.user.timezone);

    return prisma.$transaction(async (tx) => {
      const log = await tx.activityLog.upsert({
        where: {
          challengeId_activityId_date: {
            challengeId: ctx.challenge.id,
            activityId,
            date: today,
          },
        },
        create: {
          challengeId: ctx.challenge.id,
          userId,
          activityId,
          date: today,
          state: null,
          value: null,
          tier: null,
          subPoints: Prisma.DbNull,
          xpAwarded: 0,
        },
        update: {
          state: null,
          value: null,
          tier: null,
          subPoints: Prisma.DbNull,
          xpAwarded: 0,
        },
      });

      const dayTotals = await recomputeLiveDayScore(tx, {
        challenge: ctx.challenge,
        userId,
        timezone: ctx.user.timezone,
        groupId: ctx.user.groupId,
      });

      return { log, dayTotals };
    });
  }

  async attachProof(
    prisma: PrismaService,
    userId: string,
    activityId: string,
    proofUrl: string,
  ): Promise<{ log: ActivityLog }> {
    const ctx = await this.loadMutationContext(prisma, userId, activityId);

    if (ctx.activity.seedKey === 'DIET') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Photo proof is not allowed for diet',
      });
    }

    await assertCanMutate(prisma, ctx.challenge.id, ctx.user.timezone);

    const today = getUserLocalDate(ctx.user.timezone);

    const existing = await prisma.activityLog.findFirst({
      where: {
        challengeId: ctx.challenge.id,
        activityId,
        date: today,
      },
    });

    const log = await prisma.activityLog.upsert({
      where: {
        challengeId_activityId_date: {
          challengeId: ctx.challenge.id,
          activityId,
          date: today,
        },
      },
      create: {
        challengeId: ctx.challenge.id,
        userId,
        activityId,
        date: today,
        proofUrl,
        xpAwarded: 0,
      },
      update: { proofUrl },
    });

    const legacyTask = seedKeyToLegacyTask(ctx.activity.seedKey);
    if (legacyTask && proofUrl !== existing?.proofUrl) {
      void this.proofVerifier.verifyProof(legacyTask, proofUrl).then(
        async (result) => {
          const aiVerdict =
            result.reason === 'SKIPPED'
              ? 'SKIPPED'
              : result.reason === 'ERROR'
                ? 'ERROR'
                : result.passed
                  ? 'PASSED'
                  : 'FAILED';
          await prisma.activityLog.update({
            where: { id: log.id },
            data: { aiVerdict },
          });
        },
        () => {},
      );
    }

    return { log };
  }

  private async loadMutationContext(
    prisma: PrismaService,
    userId: string,
    activityId: string,
  ) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
    }

    const challenge = await findActiveChallenge(prisma, userId);
    if (!challenge) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'No active challenge found',
      });
    }

    const activity = await prisma.activity.findUnique({
      where: { id: activityId },
    });
    if (!activity || !activity.active) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Activity not found' });
    }

    await assertActivityAccess(prisma, activity, userId, user.groupId);

    return { user, challenge, activity };
  }

  private async upsertActivityLog(
    prisma: PrismaService,
    userId: string,
    activityId: string,
    buildPayload: (
      activity: Activity,
    ) => Pick<ActivityLogInput, 'state' | 'value' | 'tier' | 'subPoints'>,
    mode: 'replace' | 'number' | 'mergeSubPoints' | 'tier' = 'replace',
  ): Promise<MutationResult> {
    const ctx = await this.loadMutationContext(prisma, userId, activityId);
    await assertCanMutate(prisma, ctx.challenge.id, ctx.user.timezone);

    const today = getUserLocalDate(ctx.user.timezone);
    const scored = mapActivityToScored(ctx.activity);
    const payload = buildPayload(ctx.activity);

    const existing = await prisma.activityLog.findFirst({
      where: {
        challengeId: ctx.challenge.id,
        activityId,
        date: today,
      },
    });

    let state: string | null;
    let value: number | null;
    let tier: string | null;
    let subPoints: Record<string, ActivityLogState> | null;

    if (mode === 'replace') {
      state = payload.state ?? null;
      value = payload.value ?? null;
      tier = payload.tier ?? null;
      subPoints = payload.subPoints ?? null;
    } else if (mode === 'number') {
      value = payload.value ?? null;
      state = existing?.state === 'FAILED' ? existing.state : null;
      tier = existing?.tier ?? null;
      subPoints =
        (existing?.subPoints as Record<string, ActivityLogState> | null) ??
        null;
    } else if (mode === 'tier') {
      tier = payload.tier ?? null;
      state = existing?.state ?? null;
      value = existing?.value ?? null;
      subPoints =
        (existing?.subPoints as Record<string, ActivityLogState> | null) ??
        null;
    } else {
      const existingSubPoints =
        (existing?.subPoints as Record<string, ActivityLogState> | null) ?? {};
      subPoints = { ...existingSubPoints, ...payload.subPoints };
      state = existing?.state ?? null;
      value = existing?.value ?? null;
      tier = existing?.tier ?? null;
    }

    const logInput: ActivityLogInput = {
      activityId,
      state: state as ActivityLogState | null | undefined,
      value,
      tier,
      subPoints,
    };

    const xpAwarded = computeXpAwarded(scored, logInput);

    return prisma.$transaction(async (tx) => {
      const log = await tx.activityLog.upsert({
        where: {
          challengeId_activityId_date: {
            challengeId: ctx.challenge.id,
            activityId,
            date: today,
          },
        },
        create: {
          challengeId: ctx.challenge.id,
          userId,
          activityId,
          date: today,
          state,
          value,
          tier,
          subPoints: subPoints ?? undefined,
          xpAwarded,
        },
        update: {
          state,
          value,
          tier,
          subPoints: subPoints ?? undefined,
          xpAwarded,
        },
      });

      const dayTotals = await recomputeLiveDayScore(tx, {
        challenge: ctx.challenge,
        userId,
        timezone: ctx.user.timezone,
        groupId: ctx.user.groupId,
      });

      return { log, dayTotals };
    });
  }

  // Activity editor — mid-challenge edits affect scoring FORWARD only; stored
  // DayScore rows are never retroactively recomputed.
  async listGroupActivities(
    prisma: PrismaService,
    userId: string,
    groupId: string,
  ): Promise<ActivityEditorRow[]> {
    const activities = await prisma.activity.findMany({
      where: { groupId, isPersonal: false, scored: true },
      orderBy: { sortOrder: 'asc' },
    });
    return activities.map(mapActivityToEditorRow);
  }

  async createGroupActivity(
    prisma: PrismaService,
    userId: string,
    groupId: string,
    input: CreateCustomActivityInput,
  ): Promise<ActivityEditorRow> {
    const sortOrder =
      input.sortOrder ??
      (await resolveNextSortOrder(prisma, {
        groupId,
        isPersonal: false,
        scored: true,
      }));

    const activity = await prisma.activity.create({
      data: {
        ...buildCreateActivityData({ ...input, sortOrder }),
        groupId,
        ownerUserId: null,
        isPersonal: false,
        scored: true,
      },
    });

    return mapActivityToEditorRow(activity);
  }

  async updateGroupActivity(
    prisma: PrismaService,
    userId: string,
    groupId: string,
    input: UpdateActivityInput,
  ): Promise<ActivityEditorRow> {
    const activity = await assertGroupActivity(
      prisma,
      input.activityId,
      groupId,
    );
    const data = buildUpdateActivityData(activity, input);

    const updated = await prisma.activity.update({
      where: { id: activity.id },
      data,
    });

    return mapActivityToEditorRow(updated);
  }

  async setGroupActivityActive(
    prisma: PrismaService,
    userId: string,
    groupId: string,
    input: SetActivityActiveInput,
  ): Promise<ActivityEditorRow> {
    const activity = await assertGroupActivity(
      prisma,
      input.activityId,
      groupId,
    );

    const updated = await prisma.activity.update({
      where: { id: activity.id },
      data: { active: input.active },
    });

    return mapActivityToEditorRow(updated);
  }

  async listMyPersonalActivities(
    prisma: PrismaService,
    userId: string,
  ): Promise<ActivityEditorRow[]> {
    const activities = await prisma.activity.findMany({
      where: { ownerUserId: userId, isPersonal: true },
      orderBy: { sortOrder: 'asc' },
    });
    return activities.map(mapActivityToEditorRow);
  }

  async createPersonalActivity(
    prisma: PrismaService,
    userId: string,
    input: CreateCustomActivityInput,
  ): Promise<ActivityEditorRow> {
    const sortOrder =
      input.sortOrder ??
      (await resolveNextSortOrder(prisma, {
        ownerUserId: userId,
        isPersonal: true,
      }));

    const activity = await prisma.activity.create({
      data: {
        ...buildCreateActivityData({ ...input, sortOrder }),
        groupId: null,
        ownerUserId: userId,
        isPersonal: true,
        scored: false,
      },
    });

    return mapActivityToEditorRow(activity);
  }

  async updatePersonalActivity(
    prisma: PrismaService,
    userId: string,
    input: UpdateActivityInput,
  ): Promise<ActivityEditorRow> {
    const activity = await assertPersonalActivityOwnership(
      prisma,
      input.activityId,
      userId,
    );
    const data = buildUpdateActivityData(activity, input);

    const updated = await prisma.activity.update({
      where: { id: activity.id },
      data,
    });

    return mapActivityToEditorRow(updated);
  }

  async archivePersonalActivity(
    prisma: PrismaService,
    userId: string,
    activityId: string,
  ): Promise<ActivityEditorRow> {
    const activity = await assertPersonalActivityOwnership(
      prisma,
      activityId,
      userId,
    );

    const updated = await prisma.activity.update({
      where: { id: activity.id },
      data: { active: false },
    });

    return mapActivityToEditorRow(updated);
  }
}

export {
  computeCurrentStreak,
  computeDayLoggingStatus,
  isActivityLogLogged,
} from '../utils/day-completion';

export const ALL_TASK_TYPES = LEGACY_TASK_TYPES;
