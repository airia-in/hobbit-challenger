import {
  Inject,
  Injectable,
  Logger,
  Optional,
  forwardRef,
} from '@nestjs/common';
import { TRPCError } from '@trpc/server';
import {
  Prisma,
  type Activity,
  type ActivityLog,
  type Challenge,
  ensureSoloActivities,
} from '@workspace-starter/db';
import type { PrismaService } from '../prisma/prisma.service';

type PrismaClientLike = PrismaService | Prisma.TransactionClient;
import { deriveChallengeProgress } from '../utils/challenge-range';
import { computeDayLoggingStatus } from '../utils/day-completion';
import {
  addLocalDays,
  formatLocalDateKey,
  getUserLocalDate,
  isBeforeMidnight,
  isLocalDateKey,
  parseLocalDateKey,
} from '../utils/day-window';
import { buildUserActivityOrConditions } from '../utils/user-activities-query';
import {
  clampDateRange,
  countDaysInclusive,
  isCompletionActivityKind,
  shapeActivityCompletion,
  toActivityLogRows,
} from '../utils/stats-aggregation';
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
import {
  canAttachProofToActivity,
  shouldAutoCompleteOnProof,
} from '../utils/proof-completion';
import { getLiveStreak } from '../utils/live-streak';
import { CheckinAckMessageService } from '../whatsapp/checkin-ack-message.service';
import {
  PRODUCT_EVENT_KEYS,
  trackProductEventFireAndForget,
} from './analytics.service';

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
  allowsProof: boolean;
  autoCompleteOnProof: boolean;
  log: TodayActivityLog | null;
  canAttachProof: boolean;
  canEdit: boolean;
  currentStreak?: number;
};

export type GetTodayResult = {
  currentDay: number;
  date: Date;
  dateKey: string;
  isViewingToday: boolean;
  canNavigateBack: boolean;
  canNavigateForward: boolean;
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
  canEdit: boolean,
  currentStreak?: number,
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
    allowsProof: activity.allowsProof,
    autoCompleteOnProof: activity.autoCompleteOnProof,
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
    canAttachProof: canAttachProofToActivity(activity),
    canEdit,
    ...(currentStreak === undefined ? {} : { currentStreak }),
  };
}

function computeActivityCanEdit(
  isViewingToday: boolean,
  todayWindowOpen: boolean,
): boolean {
  if (isViewingToday) {
    return todayWindowOpen;
  }
  return true;
}

function dayNumberForDateKey(
  startDate: Date,
  dateKey: string,
  timezone: string,
): number {
  const startKey = formatLocalDateKey(startDate, timezone);
  return countDaysInclusive(startKey, dateKey);
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
  challenge: Pick<Challenge, 'id' | 'currentDay' | 'userId' | 'startDate'>;
  userId: string;
  timezone: string;
  groupId: string | null;
  date: Date;
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
    allowsProof: activity.allowsProof,
    autoCompleteOnProof: activity.autoCompleteOnProof,
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
    allowsProof: input.allowsProof,
    autoCompleteOnProof: input.autoCompleteOnProof,
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

function assertProofRuleUpdate(activity: Activity, input: UpdateActivityInput) {
  const nextAllowsProof = input.allowsProof ?? activity.allowsProof;
  const nextAutoComplete =
    input.autoCompleteOnProof ?? activity.autoCompleteOnProof;

  if (nextAutoComplete && !nextAllowsProof) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'autoCompleteOnProof requires allowsProof',
    });
  }

  if (nextAutoComplete && activity.kind !== 'CHECKBOX') {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'autoCompleteOnProof is only supported for CHECKBOX activities',
    });
  }
}

function buildUpdateActivityData(
  activity: Activity,
  input: UpdateActivityInput,
): Prisma.ActivityUpdateInput {
  assertKindSpecificUpdateFields(activity, input);
  assertProofRuleUpdate(activity, input);

  const data: Prisma.ActivityUpdateInput = {};

  if (input.title !== undefined) data.title = input.title;
  if (input.emoji !== undefined) data.emoji = input.emoji;
  if (input.deductMultiplier !== undefined) {
    data.deductMultiplier = input.deductMultiplier;
  }
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
  if (input.allowsProof !== undefined) data.allowsProof = input.allowsProof;
  if (input.autoCompleteOnProof !== undefined) {
    data.autoCompleteOnProof = input.autoCompleteOnProof;
  }
  if (input.allowsProof === false) {
    data.autoCompleteOnProof = false;
  }

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
  { challenge, userId, timezone, groupId, date }: RecomputeParams,
): Promise<DayTotals> {
  const targetDate = date;
  const dateKey = formatLocalDateKey(targetDate, timezone);

  const activities = await loadUserActivities(prisma, {
    userId,
    groupId,
  });

  const logs = await prisma.activityLog.findMany({
    where: { challengeId: challenge.id, userId, date: targetDate },
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

  const existingScore = await prisma.dayScore.findFirst({
    where: {
      challengeId: challenge.id,
      date: targetDate,
    },
    select: { finalized: true, netXp: true },
  });

  const dayNumber = dayNumberForDateKey(challenge.startDate, dateKey, timezone);

  await prisma.dayScore.upsert({
    where: {
      challengeId_date: { challengeId: challenge.id, date: targetDate },
    },
    create: {
      challengeId: challenge.id,
      userId,
      date: targetDate,
      dayNumber,
      xpEarned: score.xpEarned,
      xpDeducted: score.xpDeducted,
      netXp: score.netXp,
      personalXp: score.personalXp,
      breakdown: { allScoredLogged: dayCounted, entries: score.breakdown },
      finalized: false,
    },
    update: {
      dayNumber,
      xpEarned: score.xpEarned,
      xpDeducted: score.xpDeducted,
      netXp: score.netXp,
      personalXp: score.personalXp,
      breakdown: { allScoredLogged: dayCounted, entries: score.breakdown },
      finalized: existingScore?.finalized ?? false,
    },
  });

  if (existingScore?.finalized) {
    const delta = score.netXp - existingScore.netXp;
    if (delta !== 0) {
      await prisma.challenge.update({
        where: { id: challenge.id },
        data: { totalXp: { increment: delta } },
      });
    }
  }

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
  return prisma.activity.findMany({
    where: { OR: buildUserActivityOrConditions(userId, groupId) },
    orderBy: { sortOrder: 'asc' },
  });
}

async function loadActivityStreaks(
  prisma: PrismaClientLike,
  {
    activities,
    challenge,
    todayDate,
    timezone,
    userId,
  }: {
    activities: Activity[];
    challenge: Pick<Challenge, 'id' | 'startDate'>;
    todayDate: Date;
    timezone: string;
    userId: string;
  },
): Promise<Map<string, number>> {
  const completionActivityIds = activities
    .filter((activity) => isCompletionActivityKind(activity.kind))
    .map((activity) => activity.id);

  if (completionActivityIds.length === 0) {
    return new Map();
  }

  const todayKey = formatLocalDateKey(todayDate, timezone);
  const range = clampDateRange(
    formatLocalDateKey(challenge.startDate, timezone),
    todayKey,
  );
  if (range.to < range.from) {
    return new Map();
  }
  const queryFromDate = addLocalDays(
    todayDate,
    -(countDaysInclusive(range.from, range.to) - 1),
    timezone,
  );

  const logs = await prisma.activityLog.findMany({
    where: {
      challengeId: challenge.id,
      userId,
      activityId: { in: completionActivityIds },
      date: {
        gte: queryFromDate,
        lte: todayDate,
      },
    },
    select: {
      activityId: true,
      date: true,
      value: true,
      xpAwarded: true,
      state: true,
      tier: true,
      subPoints: true,
    },
    orderBy: { date: 'asc' },
  });

  const logsByActivityId = new Map<string, typeof logs>();
  for (const log of logs) {
    const activityLogs = logsByActivityId.get(log.activityId) ?? [];
    activityLogs.push(log);
    logsByActivityId.set(log.activityId, activityLogs);
  }

  return new Map(
    completionActivityIds.map((activityId) => [
      activityId,
      shapeActivityCompletion(
        toActivityLogRows(logsByActivityId.get(activityId) ?? [], timezone),
        range.from,
        range.to,
        todayKey,
      ).streak,
    ]),
  );
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

async function assertCanMutateForDate(
  prisma: PrismaService,
  challengeId: string,
  timezone: string,
  targetDate: Date,
) {
  const todayDate = getUserLocalDate(timezone);
  const todayKey = formatLocalDateKey(todayDate, timezone);
  const targetKey = formatLocalDateKey(targetDate, timezone);

  if (targetKey > todayKey) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Cannot log activities for a future date',
    });
  }

  const isViewingToday = targetKey === todayKey;

  if (isViewingToday) {
    if (!isBeforeMidnight(timezone)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Submissions are locked after midnight',
      });
    }

    const todayScore = await prisma.dayScore.findFirst({
      where: { challengeId, date: todayDate },
      select: { finalized: true },
    });

    if (todayScore?.finalized) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: "Today's score is finalized",
      });
    }
    return;
  }
}

function resolveViewedDateKey(
  dateKey: string | undefined,
  timezone: string,
): { viewedDate: Date; viewedKey: string; todayKey: string } {
  const todayDate = getUserLocalDate(timezone);
  const todayKey = formatLocalDateKey(todayDate, timezone);

  if (dateKey === undefined) {
    return { viewedDate: todayDate, viewedKey: todayKey, todayKey };
  }

  if (!isLocalDateKey(dateKey)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'date must be YYYY-MM-DD',
    });
  }

  const viewedDate = parseLocalDateKey(dateKey, timezone);
  const viewedKey = formatLocalDateKey(viewedDate, timezone);

  if (viewedKey > todayKey) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Cannot view a future date',
    });
  }

  return { viewedDate, viewedKey, todayKey };
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

@Injectable()
export class ActivitiesService {
  private readonly logger = new Logger(ActivitiesService.name);

  constructor(
    @Optional()
    @Inject(forwardRef(() => CheckinAckMessageService))
    private readonly checkinAck?: CheckinAckMessageService,
  ) {}

  async getToday(
    prisma: PrismaService,
    userId: string,
    dateKey?: string,
    options?: { timezone?: string },
  ): Promise<GetTodayResult> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { group: { select: { challengeTimezone: true } } },
    });
    if (!user) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
    }

    if (!user.groupId) {
      await ensureSoloActivities(prisma, userId);
    }

    const timezone = options?.timezone ?? user.timezone;
    const { viewedDate, viewedKey, todayKey } = resolveViewedDateKey(
      dateKey,
      timezone,
    );
    const isViewingToday = viewedKey === todayKey;
    const todayWindowOpen = isBeforeMidnight(timezone);

    const challenge = await findActiveChallenge(prisma, userId);
    if (!challenge) {
      return {
        currentDay: 1,
        date: viewedDate,
        dateKey: viewedKey,
        isViewingToday,
        canNavigateBack: false,
        canNavigateForward: false,
        canEdit: isViewingToday && todayWindowOpen,
        dayTotals: emptyDayTotals(),
        scoredActivities: [],
        personalActivities: [],
      };
    }

    const challengeTimezone = user.group?.challengeTimezone ?? user.timezone;
    const startKey = formatLocalDateKey(challenge.startDate, challengeTimezone);

    if (viewedKey < startKey) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Date is before the challenge started',
      });
    }

    const progress = deriveChallengeProgress(challenge, challengeTimezone);
    const isWithinRange =
      progress.currentDay >= 1 && progress.currentDay <= progress.lengthDays;
    const viewedDayNumber = dayNumberForDateKey(
      challenge.startDate,
      viewedKey,
      challengeTimezone,
    );

    if (!isWithinRange && isViewingToday) {
      return {
        currentDay: progress.currentDay,
        date: viewedDate,
        dateKey: viewedKey,
        isViewingToday,
        canNavigateBack: viewedKey > startKey,
        canNavigateForward: false,
        canEdit: false,
        dayTotals: emptyDayTotals(),
        scoredActivities: [],
        personalActivities: [],
      };
    }

    if (viewedDayNumber < 1 || viewedDayNumber > progress.lengthDays) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Date is outside the challenge range',
      });
    }

    const runtimeChallenge = {
      ...challenge,
      currentDay: progress.currentDay,
      lengthDays: progress.lengthDays,
    };

    const activities = await loadUserActivities(prisma, {
      userId,
      groupId: user.groupId,
    });

    const logs = await prisma.activityLog.findMany({
      where: {
        challengeId: challenge.id,
        userId,
        date: viewedDate,
      },
    });

    const logByActivityId = new Map(logs.map((log) => [log.activityId, log]));
    const streakByActivityId = await loadActivityStreaks(prisma, {
      activities,
      challenge,
      todayDate: getUserLocalDate(user.timezone),
      timezone: user.timezone,
      userId,
    });

    const viewedScore = await prisma.dayScore.findFirst({
      where: { challengeId: challenge.id, date: viewedDate },
    });

    let dayTotals: DayTotals;
    if (viewedScore && (!viewedScore.finalized || !isViewingToday)) {
      dayTotals = {
        netXp: viewedScore.netXp,
        personalXp: viewedScore.personalXp,
        xpEarned: viewedScore.xpEarned,
        xpDeducted: viewedScore.xpDeducted,
      };
    } else if (activities.length > 0) {
      dayTotals = await recomputeLiveDayScore(prisma, {
        challenge: runtimeChallenge,
        userId,
        timezone: user.timezone,
        groupId: user.groupId,
        date: viewedDate,
      });
    } else {
      dayTotals = emptyDayTotals();
    }

    const todayWindowOpenForEdit =
      isViewingToday && todayWindowOpen && isWithinRange;
    const scoredActivities: TodayActivity[] = [];
    const personalActivities: TodayActivity[] = [];

    for (const activity of activities) {
      const log = logByActivityId.get(activity.id) ?? null;
      const activityCanEdit = computeActivityCanEdit(
        isViewingToday,
        todayWindowOpenForEdit,
      );
      const mapped = mapActivityToToday(
        activity,
        log,
        activityCanEdit,
        streakByActivityId.get(activity.id),
      );
      if (activity.isPersonal) {
        personalActivities.push(mapped);
      } else {
        scoredActivities.push(mapped);
      }
    }

    const dayCanEdit =
      scoredActivities.some((a) => a.canEdit) ||
      personalActivities.some((a) => a.canEdit);

    return {
      currentDay: viewedDayNumber,
      date: viewedDate,
      dateKey: viewedKey,
      isViewingToday,
      canNavigateBack: viewedKey > startKey,
      canNavigateForward: viewedKey < todayKey,
      canEdit: dayCanEdit,
      dayTotals,
      scoredActivities,
      personalActivities,
    };
  }

  async markActivity(
    prisma: PrismaService,
    userId: string,
    activityId: string,
    dateKey?: string,
  ): Promise<MutationResult> {
    return this.upsertActivityLog(
      prisma,
      userId,
      activityId,
      (activity) => buildMarkActivityPayload(mapActivityToScored(activity)),
      'replace',
      dateKey,
    );
  }

  async logNumber(
    prisma: PrismaService,
    userId: string,
    activityId: string,
    value: number,
    dateKey?: string,
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
      dateKey,
    );
  }

  async setSubPoints(
    prisma: PrismaService,
    userId: string,
    activityId: string,
    states: Record<string, ActivityLogState>,
    dateKey?: string,
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
      dateKey,
    );
  }

  async setTier(
    prisma: PrismaService,
    userId: string,
    activityId: string,
    tier: string,
    dateKey?: string,
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
      dateKey,
    );
  }

  async undoActivity(
    prisma: PrismaService,
    userId: string,
    activityId: string,
    dateKey?: string,
  ): Promise<MutationResult> {
    const ctx = await this.loadMutationContext(prisma, userId, activityId);
    const mutationTimezone =
      ctx.user.group?.challengeTimezone ?? ctx.user.timezone;
    const { viewedDate } = resolveViewedDateKey(dateKey, mutationTimezone);
    await assertCanMutateForDate(
      prisma,
      ctx.challenge.id,
      mutationTimezone,
      viewedDate,
    );

    return prisma.$transaction(async (tx) => {
      const log = await tx.activityLog.upsert({
        where: {
          challengeId_activityId_date: {
            challengeId: ctx.challenge.id,
            activityId,
            date: viewedDate,
          },
        },
        create: {
          challengeId: ctx.challenge.id,
          userId,
          activityId,
          date: viewedDate,
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
        date: viewedDate,
      });

      return { log, dayTotals };
    });
  }

  async attachProof(
    prisma: PrismaService,
    userId: string,
    activityId: string,
    proofUrl: string,
    dateKey?: string,
  ): Promise<MutationResult> {
    const ctx = await this.loadMutationContext(prisma, userId, activityId);

    if (!canAttachProofToActivity(ctx.activity)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Photo proof is not allowed for this activity',
      });
    }

    const mutationTimezone =
      ctx.user.group?.challengeTimezone ?? ctx.user.timezone;
    const { viewedDate, viewedKey, todayKey } = resolveViewedDateKey(
      dateKey,
      mutationTimezone,
    );
    const wasScoredDayComplete = await this.isScoredDayComplete(prisma, {
      userId,
      groupId: ctx.user.groupId,
      challengeId: ctx.challenge.id,
      date: viewedDate,
    });
    const wasScoredDayEmpty = !(await this.hadScoredLogsToday(prisma, {
      userId,
      groupId: ctx.user.groupId,
      challengeId: ctx.challenge.id,
      date: viewedDate,
    }));
    await assertCanMutateForDate(
      prisma,
      ctx.challenge.id,
      mutationTimezone,
      viewedDate,
    );

    const scored = mapActivityToScored(ctx.activity);
    const autoComplete = shouldAutoCompleteOnProof(ctx.activity, proofUrl);
    const completionPayload = autoComplete
      ? buildMarkActivityPayload(scored)
      : null;

    return prisma
      .$transaction(async (tx) => {
        const existing = await tx.activityLog.findFirst({
          where: {
            challengeId: ctx.challenge.id,
            activityId,
            date: viewedDate,
          },
        });

        const state = autoComplete
          ? (completionPayload?.state ?? null)
          : (existing?.state ?? null);
        const value = autoComplete
          ? (completionPayload?.value ?? null)
          : (existing?.value ?? null);
        const tier = autoComplete
          ? (completionPayload?.tier ?? null)
          : (existing?.tier ?? null);
        const subPoints = autoComplete
          ? (completionPayload?.subPoints ?? null)
          : ((existing?.subPoints as Record<string, ActivityLogState> | null) ??
            null);

        const logInput: ActivityLogInput = {
          activityId,
          state: state as ActivityLogState | null | undefined,
          value,
          tier,
          subPoints: subPoints ?? undefined,
        };
        const xpAwarded = autoComplete
          ? computeXpAwarded(scored, logInput)
          : (existing?.xpAwarded ?? 0);

        const log = await tx.activityLog.upsert({
          where: {
            challengeId_activityId_date: {
              challengeId: ctx.challenge.id,
              activityId,
              date: viewedDate,
            },
          },
          create: {
            challengeId: ctx.challenge.id,
            userId,
            activityId,
            date: viewedDate,
            proofUrl,
            state,
            value,
            tier,
            subPoints: subPoints ?? undefined,
            xpAwarded,
          },
          update: {
            proofUrl,
            ...(autoComplete
              ? {
                  state,
                  value,
                  tier,
                  subPoints: subPoints ?? undefined,
                  xpAwarded,
                }
              : {}),
          },
        });

        const dayTotals = await recomputeLiveDayScore(tx, {
          challenge: ctx.challenge,
          userId,
          timezone: ctx.user.timezone,
          groupId: ctx.user.groupId,
          date: viewedDate,
        });

        return { log, dayTotals };
      })
      .then((result) => {
        this.scheduleActivityLoggedEvent(
          prisma,
          userId,
          ctx.challenge.id,
          ctx.activity,
        );
        this.scheduleCheckinAcks(prisma, {
          user: ctx.user,
          challenge: ctx.challenge,
          viewedDate,
          viewedKey,
          todayKey,
          wasScoredDayComplete,
          wasScoredDayEmpty,
          isScoredMutation: ctx.activity.scored && !ctx.activity.isPersonal,
          dayTotals: result.dayTotals,
        });
        return result;
      });
  }

  private async loadMutationContext(
    prisma: PrismaService,
    userId: string,
    activityId: string,
  ) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { group: { select: { challengeTimezone: true } } },
    });
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

    const challengeTimezone = user.group?.challengeTimezone ?? user.timezone;
    const progress = deriveChallengeProgress(challenge, challengeTimezone);
    if (progress.currentDay < 1 || progress.currentDay > progress.lengthDays) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Challenge is outside its active date range',
      });
    }

    const activity = await prisma.activity.findUnique({
      where: { id: activityId },
    });
    if (!activity || !activity.active) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Activity not found' });
    }

    await assertActivityAccess(prisma, activity, userId, user.groupId);

    return {
      user,
      challenge: {
        ...challenge,
        currentDay: progress.currentDay,
        lengthDays: progress.lengthDays,
      },
      activity,
    };
  }

  private async upsertActivityLog(
    prisma: PrismaService,
    userId: string,
    activityId: string,
    buildPayload: (
      activity: Activity,
    ) => Pick<ActivityLogInput, 'state' | 'value' | 'tier' | 'subPoints'>,
    mode: 'replace' | 'number' | 'mergeSubPoints' | 'tier' = 'replace',
    dateKey?: string,
  ): Promise<MutationResult> {
    const ctx = await this.loadMutationContext(prisma, userId, activityId);
    const mutationTimezone =
      ctx.user.group?.challengeTimezone ?? ctx.user.timezone;
    const { viewedDate, viewedKey, todayKey } = resolveViewedDateKey(
      dateKey,
      mutationTimezone,
    );
    const wasScoredDayComplete = await this.isScoredDayComplete(prisma, {
      userId,
      groupId: ctx.user.groupId,
      challengeId: ctx.challenge.id,
      date: viewedDate,
    });
    const wasScoredDayEmpty = !(await this.hadScoredLogsToday(prisma, {
      userId,
      groupId: ctx.user.groupId,
      challengeId: ctx.challenge.id,
      date: viewedDate,
    }));
    await assertCanMutateForDate(
      prisma,
      ctx.challenge.id,
      mutationTimezone,
      viewedDate,
    );

    const scored = mapActivityToScored(ctx.activity);
    const payload = buildPayload(ctx.activity);

    const existing = await prisma.activityLog.findFirst({
      where: {
        challengeId: ctx.challenge.id,
        activityId,
        date: viewedDate,
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

    return prisma
      .$transaction(async (tx) => {
        const log = await tx.activityLog.upsert({
          where: {
            challengeId_activityId_date: {
              challengeId: ctx.challenge.id,
              activityId,
              date: viewedDate,
            },
          },
          create: {
            challengeId: ctx.challenge.id,
            userId,
            activityId,
            date: viewedDate,
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
          date: viewedDate,
        });

        return { log, dayTotals };
      })
      .then((result) => {
        this.scheduleActivityLoggedEvent(
          prisma,
          userId,
          ctx.challenge.id,
          ctx.activity,
        );
        this.scheduleCheckinAcks(prisma, {
          user: ctx.user,
          challenge: ctx.challenge,
          viewedDate,
          viewedKey,
          todayKey,
          wasScoredDayComplete,
          wasScoredDayEmpty,
          isScoredMutation: ctx.activity.scored && !ctx.activity.isPersonal,
          dayTotals: result.dayTotals,
        });
        return result;
      });
  }

  private async getScoredDayLoggingStatus(
    prisma: PrismaClientLike,
    params: {
      userId: string;
      groupId: string | null;
      challengeId: string;
      date: Date;
    },
  ) {
    const activities = await loadUserActivities(prisma, {
      userId: params.userId,
      groupId: params.groupId,
    });
    const scoredIds = activities
      .filter((activity) => activity.scored && !activity.isPersonal)
      .map((activity) => activity.id);

    const logs = await prisma.activityLog.findMany({
      where: {
        challengeId: params.challengeId,
        userId: params.userId,
        date: params.date,
      },
    });

    return {
      scoredIds,
      ...computeDayLoggingStatus(scoredIds, logs),
    };
  }

  private async isScoredDayComplete(
    prisma: PrismaClientLike,
    params: {
      userId: string;
      groupId: string | null;
      challengeId: string;
      date: Date;
    },
  ): Promise<boolean> {
    const { allScoredLogged } = await this.getScoredDayLoggingStatus(
      prisma,
      params,
    );
    return allScoredLogged;
  }

  private async hadScoredLogsToday(
    prisma: PrismaClientLike,
    params: {
      userId: string;
      groupId: string | null;
      challengeId: string;
      date: Date;
    },
  ): Promise<boolean> {
    const { loggedActivityIds } = await this.getScoredDayLoggingStatus(
      prisma,
      params,
    );
    return loggedActivityIds.length > 0;
  }

  private scheduleActivityLoggedEvent(
    prisma: PrismaService,
    userId: string,
    challengeId: string,
    activity: Activity,
  ): void {
    trackProductEventFireAndForget(
      prisma,
      userId,
      PRODUCT_EVENT_KEYS.ACTIVITY_LOGGED,
      {
        activityId: activity.id,
        challengeId,
        activityKind: activity.kind,
        scored: activity.scored,
      },
    );
  }

  private scheduleCheckinAcks(
    prisma: PrismaService,
    params: {
      user: {
        id: string;
        name: string;
        phone: string | null;
        whatsappOptIn: boolean;
        timezone: string;
        groupId: string | null;
      };
      challenge: { id: string; currentStreak: number };
      viewedDate: Date;
      viewedKey: string;
      todayKey: string;
      wasScoredDayComplete: boolean;
      wasScoredDayEmpty: boolean;
      isScoredMutation: boolean;
      dayTotals: DayTotals;
    },
  ): void {
    if (!this.checkinAck) {
      return;
    }
    if (params.viewedKey !== params.todayKey) {
      return;
    }

    if (!params.wasScoredDayComplete) {
      void this.notifyCheckinAckIfDayComplete(prisma, params).catch((error) => {
        this.logger.error('Check-in ack notify failed:', error);
      });
    }

    if (params.wasScoredDayEmpty && params.isScoredMutation) {
      void this.notifyCheckinAckIfFirstLog(prisma, params).catch((error) => {
        this.logger.error('First-log check-in ack notify failed:', error);
      });
    }
  }

  private async notifyCheckinAckIfFirstLog(
    prisma: PrismaService,
    params: {
      user: {
        id: string;
        name: string;
        phone: string | null;
        whatsappOptIn: boolean;
        timezone: string;
        groupId: string | null;
      };
      challenge: { id: string; currentStreak: number };
      viewedDate: Date;
      dayTotals: DayTotals;
    },
  ): Promise<void> {
    const isCompleteNow = await this.isScoredDayComplete(prisma, {
      userId: params.user.id,
      groupId: params.user.groupId,
      challengeId: params.challenge.id,
      date: params.viewedDate,
    });
    // Single-habit day: first log completes the day — day-complete ack wins.
    if (isCompleteNow) {
      return;
    }

    const { loggedActivityIds } = await this.getScoredDayLoggingStatus(prisma, {
      userId: params.user.id,
      groupId: params.user.groupId,
      challengeId: params.challenge.id,
      date: params.viewedDate,
    });
    if (loggedActivityIds.length === 0) {
      return;
    }

    const currentStreak = await getLiveStreak(prisma, {
      challengeId: params.challenge.id,
      userId: params.user.id,
      groupId: params.user.groupId,
      timezone: params.user.timezone,
      storedStreak: params.challenge.currentStreak,
    });

    await this.checkinAck!.trySendFirstLogAck({
      prisma,
      userId: params.user.id,
      userName: params.user.name,
      phone: params.user.phone,
      whatsappOptIn: params.user.whatsappOptIn,
      localDay: params.viewedDate,
      timezone: params.user.timezone,
      currentStreak,
      todayNetXp: params.dayTotals.netXp,
      tasksDone: loggedActivityIds.length,
    });
  }

  private async notifyCheckinAckIfDayComplete(
    prisma: PrismaService,
    params: {
      user: {
        id: string;
        name: string;
        phone: string | null;
        whatsappOptIn: boolean;
        timezone: string;
        groupId: string | null;
      };
      challenge: { id: string; currentStreak: number };
      viewedDate: Date;
      dayTotals: DayTotals;
    },
  ): Promise<void> {
    const isCompleteNow = await this.isScoredDayComplete(prisma, {
      userId: params.user.id,
      groupId: params.user.groupId,
      challengeId: params.challenge.id,
      date: params.viewedDate,
    });
    if (!isCompleteNow) {
      return;
    }

    const { loggedActivityIds } = await this.getScoredDayLoggingStatus(prisma, {
      userId: params.user.id,
      groupId: params.user.groupId,
      challengeId: params.challenge.id,
      date: params.viewedDate,
    });

    const currentStreak = await getLiveStreak(prisma, {
      challengeId: params.challenge.id,
      userId: params.user.id,
      groupId: params.user.groupId,
      timezone: params.user.timezone,
      storedStreak: params.challenge.currentStreak,
    });

    await this.checkinAck!.trySendDayCompleteAck({
      prisma,
      userId: params.user.id,
      userName: params.user.name,
      phone: params.user.phone,
      whatsappOptIn: params.user.whatsappOptIn,
      localDay: params.viewedDate,
      timezone: params.user.timezone,
      currentStreak,
      todayNetXp: params.dayTotals.netXp,
      tasksDone: loggedActivityIds.length,
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
