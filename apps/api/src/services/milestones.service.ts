import {
  type EarnedMilestone,
  type MilestoneKey,
  MILESTONE_CATALOG,
  MILESTONE_KEYS,
  getMilestoneDefinition,
} from '@workspace-starter/types';
import type { PrismaService } from '../prisma/prisma.service';
import {
  isActivityLogLogged,
  isInterimDayCompleted,
} from '../utils/day-completion';
import { formatLocalDateKey } from '../utils/day-window';
import {
  computeLongestHabitStreak,
  countConsecutivePerfectDays,
  countLoggedActivityLogs,
} from '../utils/milestone-metrics';
import { localCalendarDaysBetween } from '../utils/winback-dormancy';

export type MilestoneEvaluationInput = {
  userId: string;
  challengeId: string;
  groupId: string | null;
  evaluationDay: Date;
  timezone: string;
  newStreak: number;
  dayCounted: boolean;
  allScoredLogged: boolean;
  freezeConsumed: boolean;
};

export type MilestoneEvaluationResult = {
  newlyUnlocked: MilestoneKey[];
};

const STREAK_THRESHOLDS: Array<{ key: MilestoneKey; days: number }> = [
  { key: 'streak_7', days: 7 },
  { key: 'streak_21', days: 21 },
  { key: 'streak_30', days: 30 },
  { key: 'streak_66', days: 66 },
];

/** Pure evaluation: which milestones unlock given current state (idempotent keys). */
export function evaluateMilestoneCandidates(
  input: MilestoneEvaluationInput,
  context: {
    existingKeys: Set<string>;
    totalLogCount: number;
    consecutivePerfectDays: number;
    longestHabitStreak: number;
    dormantDaysBeforeEvaluation: number;
  },
): MilestoneKey[] {
  const unlocked: MilestoneKey[] = [];

  for (const { key, days } of STREAK_THRESHOLDS) {
    if (
      input.newStreak >= days &&
      input.dayCounted &&
      !context.existingKeys.has(key)
    ) {
      unlocked.push(key);
    }
  }

  if (
    input.allScoredLogged &&
    input.dayCounted &&
    !context.existingKeys.has('first_perfect_day')
  ) {
    unlocked.push('first_perfect_day');
  }

  if (
    context.consecutivePerfectDays >= 7 &&
    !context.existingKeys.has('first_perfect_week')
  ) {
    unlocked.push('first_perfect_week');
  }

  if (
    context.totalLogCount >= 100 &&
    !context.existingKeys.has('total_logs_100')
  ) {
    unlocked.push('total_logs_100');
  }

  if (
    context.longestHabitStreak >= 14 &&
    !context.existingKeys.has('habit_streak_14')
  ) {
    unlocked.push('habit_streak_14');
  }

  if (
    input.dayCounted &&
    context.dormantDaysBeforeEvaluation >= 3 &&
    !context.existingKeys.has('comeback')
  ) {
    unlocked.push('comeback');
  }

  if (
    input.freezeConsumed &&
    !context.existingKeys.has('first_freeze_consumed')
  ) {
    unlocked.push('first_freeze_consumed');
  }

  return unlocked;
}

export async function loadMilestoneEvaluationContext(
  prisma: PrismaService,
  input: MilestoneEvaluationInput,
): Promise<{
  existingKeys: Set<string>;
  totalLogCount: number;
  consecutivePerfectDays: number;
  longestHabitStreak: number;
  dormantDaysBeforeEvaluation: number;
}> {
  const [existing, perfectDayScores, completionActivities, logs] =
    await Promise.all([
      prisma.userMilestone.findMany({
        where: { userId: input.userId },
        select: { milestoneKey: true },
      }),
      prisma.dayScore.findMany({
        where: {
          challengeId: input.challengeId,
          finalized: true,
        },
        select: { date: true, breakdown: true, finalized: true },
        orderBy: { date: 'desc' },
        take: 14,
      }),
      prisma.activity.findMany({
        where: {
          OR: [
            { ownerUserId: input.userId, isPersonal: true, active: true },
            ...(input.groupId
              ? [
                  {
                    groupId: input.groupId,
                    scored: true,
                    isPersonal: false,
                    active: true,
                  },
                ]
              : []),
          ],
          kind: { in: ['CHECKBOX', 'SUBPOINTS', 'TIERED'] },
        },
        select: { id: true },
      }),
      prisma.activityLog.findMany({
        where: { userId: input.userId },
        select: {
          activityId: true,
          date: true,
          state: true,
          tier: true,
          value: true,
          subPoints: true,
        },
        orderBy: { date: 'asc' },
      }),
    ]);

  const existingKeys = new Set(existing.map((row) => row.milestoneKey));

  const evaluationKey = formatLocalDateKey(input.evaluationDay, input.timezone);
  const perfectDays = perfectDayScores
    .filter((score) => isInterimDayCompleted(score))
    .map((score) => formatLocalDateKey(score.date, input.timezone));

  const consecutivePerfectDays = countConsecutivePerfectDays(
    perfectDays,
    evaluationKey,
    input.allScoredLogged && input.dayCounted,
  );

  const activityIds = new Set(completionActivities.map((a) => a.id));
  const relevantLogs = logs.filter((log) => activityIds.has(log.activityId));
  const longestHabitStreak = computeLongestHabitStreak(
    relevantLogs.map((log) => ({
      activityId: log.activityId,
      dateKey: formatLocalDateKey(log.date, input.timezone),
      logged: isActivityLogLogged(log),
    })),
  );

  const logsBeforeEvaluation = logs.filter(
    (log) =>
      formatLocalDateKey(log.date, input.timezone) < evaluationKey &&
      isActivityLogLogged(log),
  );
  const lastLogBefore =
    logsBeforeEvaluation.length > 0
      ? logsBeforeEvaluation[logsBeforeEvaluation.length - 1]
      : undefined;
  const dormantDaysBeforeEvaluation = lastLogBefore
    ? localCalendarDaysBetween(
        lastLogBefore.date,
        input.evaluationDay,
        input.timezone,
      )
    : 0;

  return {
    existingKeys,
    totalLogCount: countLoggedActivityLogs(logs),
    consecutivePerfectDays,
    longestHabitStreak,
    dormantDaysBeforeEvaluation,
  };
}

export async function evaluateAndUnlockMilestones(
  prisma: PrismaService,
  input: MilestoneEvaluationInput,
): Promise<MilestoneEvaluationResult> {
  const context = await loadMilestoneEvaluationContext(prisma, input);
  const candidates = evaluateMilestoneCandidates(input, context);

  const newlyUnlocked: MilestoneKey[] = [];
  for (const key of candidates) {
    if (!MILESTONE_KEYS.includes(key)) {
      continue;
    }
    try {
      await prisma.userMilestone.create({
        data: {
          userId: input.userId,
          challengeId: input.challengeId,
          milestoneKey: key,
        },
      });
      newlyUnlocked.push(key);
    } catch {
      // Unique constraint — already unlocked (re-finalization safe).
    }
  }

  return { newlyUnlocked };
}

export function shapeEarnedMilestone(row: {
  milestoneKey: string;
  unlockedAt: Date;
}): EarnedMilestone {
  const key = row.milestoneKey as MilestoneKey;
  const definition = getMilestoneDefinition(key);
  return {
    key,
    title: definition.title,
    description: definition.description,
    unlockCopy: definition.unlockCopy,
    unlockedAt: row.unlockedAt,
  };
}

export async function getUserMilestones(
  prisma: PrismaService,
  userId: string,
): Promise<{
  earned: EarnedMilestone[];
  latestUnlock: EarnedMilestone | null;
}> {
  const rows = await prisma.userMilestone.findMany({
    where: { userId },
    orderBy: { unlockedAt: 'desc' },
  });

  const earned = rows
    .filter((row) =>
      (MILESTONE_KEYS as readonly string[]).includes(row.milestoneKey),
    )
    .map(shapeEarnedMilestone);

  return {
    earned,
    latestUnlock: earned[0] ?? null,
  };
}

export function listMilestoneCatalog() {
  return MILESTONE_KEYS.map((key) => MILESTONE_CATALOG[key]);
}
