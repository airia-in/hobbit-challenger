import {
  type EarnedMilestone,
  type MilestoneKey,
  MILESTONE_CATALOG,
  MILESTONE_KEYS,
  compareMilestonePrestige,
  getMilestoneDefinition,
  pickMostPrestigiousMilestone,
} from '@workspace-starter/types';
import type { PrismaService } from '../prisma/prisma.service';
import { isInterimDayCompleted } from '../utils/day-completion';
import { formatLocalDateKey } from '../utils/day-window';
import {
  computeDormantDaysBefore,
  computeLongestCompletedHabitStreak,
  countConsecutivePerfectDays,
  countLoggedActivityLogs,
  deriveComebackDate,
  deriveFirstFreezeConsumedDate,
  deriveFirstPerfectDayDate,
  deriveFirstPerfectWeekDate,
  deriveHabitStreak14Date,
  deriveStreakMilestoneDates,
  deriveTotalLogs100Date,
  hasAnyActivityLogOnDay,
  replayChallengeStreak,
} from '../utils/milestone-metrics';

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

export type MilestoneUnlockCandidate = {
  key: MilestoneKey;
  unlockedAt: Date;
};

const STREAK_THRESHOLDS: Array<{ key: MilestoneKey; days: number }> = [
  { key: 'streak_7', days: 7 },
  { key: 'streak_21', days: 21 },
  { key: 'streak_30', days: 30 },
  { key: 'streak_66', days: 66 },
];

export type MilestoneHistoricalContext = {
  existingKeys: Set<string>;
  totalLogCount: number;
  longestHabitStreak: number;
  dormantDaysBeforeEvaluation: number;
  loggedOnEvaluationDay: boolean;
  pendingUnlocks: MilestoneUnlockCandidate[];
};

/** Pure evaluation: which milestones unlock from full-history context. */
export function evaluateMilestoneCandidates(
  context: MilestoneHistoricalContext,
): MilestoneKey[] {
  return context.pendingUnlocks
    .filter((candidate) => !context.existingKeys.has(candidate.key))
    .map((candidate) => candidate.key);
}

export function buildHistoricalUnlockCandidates(input: {
  allFinalizedDayScores: Array<{ date: Date; breakdown: unknown }>;
  challengeDayScores: Array<{ date: Date; breakdown: unknown }>;
  challengeActivityLogs: Array<{
    activityId: string;
    date: Date;
    state: string | null;
    tier: string | null;
    value: number | null;
    subPoints: unknown;
  }>;
  allUserLogs: Array<{
    date: Date;
    state: string | null;
    tier: string | null;
    value: number | null;
    subPoints: unknown;
  }>;
  evaluationDay: Date;
  timezone: string;
  newStreak: number;
  dayCounted: boolean;
  allScoredLogged: boolean;
  freezeConsumed: boolean;
  streakFreezesUsed: number;
}): MilestoneUnlockCandidate[] {
  const candidates: MilestoneUnlockCandidate[] = [];

  const streakDates = deriveStreakMilestoneDates(input.challengeDayScores);
  for (const { key, days } of STREAK_THRESHOLDS) {
    const historical = streakDates.get(key);
    if (historical) {
      candidates.push({ key, unlockedAt: historical });
      continue;
    }
    if (input.dayCounted && input.newStreak >= days) {
      candidates.push({ key, unlockedAt: input.evaluationDay });
    }
  }

  const firstPerfectDay = deriveFirstPerfectDayDate(
    input.allFinalizedDayScores,
  );
  if (firstPerfectDay) {
    candidates.push({ key: 'first_perfect_day', unlockedAt: firstPerfectDay });
  } else if (input.dayCounted && input.allScoredLogged) {
    candidates.push({
      key: 'first_perfect_day',
      unlockedAt: input.evaluationDay,
    });
  }

  const firstPerfectWeek = deriveFirstPerfectWeekDate(
    input.allFinalizedDayScores,
    input.timezone,
  );
  if (firstPerfectWeek) {
    candidates.push({
      key: 'first_perfect_week',
      unlockedAt: firstPerfectWeek,
    });
  } else if (input.dayCounted && input.allScoredLogged) {
    const evaluationKey = formatLocalDateKey(
      input.evaluationDay,
      input.timezone,
    );
    const perfectKeys = input.allFinalizedDayScores
      .filter((score) => isInterimDayCompleted({ ...score, finalized: true }))
      .map((score) => formatLocalDateKey(score.date, input.timezone));
    if (countConsecutivePerfectDays(perfectKeys, evaluationKey, true) >= 7) {
      candidates.push({
        key: 'first_perfect_week',
        unlockedAt: input.evaluationDay,
      });
    }
  }

  const totalLogs = countLoggedActivityLogs(input.allUserLogs);
  if (totalLogs >= 100) {
    const at100 =
      deriveTotalLogs100Date(input.allUserLogs) ?? input.evaluationDay;
    candidates.push({ key: 'total_logs_100', unlockedAt: at100 });
  }

  const habitStreak14Date = deriveHabitStreak14Date(
    input.challengeActivityLogs,
    input.timezone,
  );
  if (habitStreak14Date) {
    candidates.push({ key: 'habit_streak_14', unlockedAt: habitStreak14Date });
  } else if (
    computeLongestCompletedHabitStreak(
      input.challengeActivityLogs,
      input.timezone,
    ) >= 14
  ) {
    candidates.push({
      key: 'habit_streak_14',
      unlockedAt: input.evaluationDay,
    });
  }

  const comebackDate = deriveComebackDate(
    input.challengeActivityLogs,
    input.timezone,
  );
  const dormantDays = computeDormantDaysBefore(
    input.challengeActivityLogs,
    input.evaluationDay,
    input.timezone,
  );
  const loggedToday = hasAnyActivityLogOnDay(
    input.challengeActivityLogs,
    input.evaluationDay,
    input.timezone,
  );

  if (comebackDate) {
    candidates.push({ key: 'comeback', unlockedAt: comebackDate });
  } else if (loggedToday && dormantDays >= 3) {
    candidates.push({ key: 'comeback', unlockedAt: input.evaluationDay });
  }

  const freezeDate = deriveFirstFreezeConsumedDate(input.challengeDayScores);
  if (freezeDate) {
    candidates.push({ key: 'first_freeze_consumed', unlockedAt: freezeDate });
  } else if (input.freezeConsumed || input.streakFreezesUsed > 0) {
    candidates.push({
      key: 'first_freeze_consumed',
      unlockedAt: input.evaluationDay,
    });
  }

  const byKey = new Map<MilestoneKey, MilestoneUnlockCandidate>();
  for (const candidate of candidates) {
    const existing = byKey.get(candidate.key);
    if (
      !existing ||
      candidate.unlockedAt.getTime() < existing.unlockedAt.getTime()
    ) {
      byKey.set(candidate.key, candidate);
    }
  }

  return [...byKey.values()].sort((a, b) =>
    compareMilestonePrestige(a.key, b.key),
  );
}

export async function loadMilestoneEvaluationContext(
  prisma: PrismaService,
  input: MilestoneEvaluationInput & { streakFreezesUsed?: number },
): Promise<MilestoneHistoricalContext> {
  const [
    existing,
    allFinalizedDayScores,
    challengeDayScores,
    challenge,
    completionActivities,
    allUserLogs,
    challengeActivityLogs,
  ] = await Promise.all([
    prisma.userMilestone.findMany({
      where: { userId: input.userId },
      select: { milestoneKey: true },
    }),
    prisma.dayScore.findMany({
      where: { userId: input.userId, finalized: true },
      select: { date: true, breakdown: true },
      orderBy: { date: 'asc' },
    }),
    prisma.dayScore.findMany({
      where: { challengeId: input.challengeId, finalized: true },
      select: { date: true, breakdown: true },
      orderBy: { date: 'asc' },
    }),
    prisma.challenge.findUnique({
      where: { id: input.challengeId },
      select: { streakFreezesUsed: true },
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
        date: true,
        state: true,
        tier: true,
        value: true,
        subPoints: true,
      },
      orderBy: { date: 'asc' },
    }),
    prisma.activityLog.findMany({
      where: { userId: input.userId, challengeId: input.challengeId },
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
  const streakFreezesUsed =
    input.streakFreezesUsed ?? challenge?.streakFreezesUsed ?? 0;

  const pendingUnlocks = buildHistoricalUnlockCandidates({
    allFinalizedDayScores,
    challengeDayScores,
    challengeActivityLogs,
    allUserLogs,
    evaluationDay: input.evaluationDay,
    timezone: input.timezone,
    newStreak: input.newStreak,
    dayCounted: input.dayCounted,
    allScoredLogged: input.allScoredLogged,
    freezeConsumed: input.freezeConsumed,
    streakFreezesUsed,
  });

  const activityIds = new Set(completionActivities.map((a) => a.id));
  const relevantLogs = challengeActivityLogs.filter((log) =>
    activityIds.has(log.activityId),
  );

  return {
    existingKeys,
    totalLogCount: countLoggedActivityLogs(allUserLogs),
    longestHabitStreak: computeLongestCompletedHabitStreak(
      relevantLogs,
      input.timezone,
    ),
    dormantDaysBeforeEvaluation: computeDormantDaysBefore(
      challengeActivityLogs,
      input.evaluationDay,
      input.timezone,
    ),
    loggedOnEvaluationDay: hasAnyActivityLogOnDay(
      challengeActivityLogs,
      input.evaluationDay,
      input.timezone,
    ),
    pendingUnlocks,
  };
}

export async function evaluateAndUnlockMilestones(
  prisma: PrismaService,
  input: MilestoneEvaluationInput & { streakFreezesUsed?: number },
): Promise<MilestoneEvaluationResult> {
  const context = await loadMilestoneEvaluationContext(prisma, input);
  const candidateKeys = evaluateMilestoneCandidates(context);
  const unlockByKey = new Map(
    context.pendingUnlocks.map((candidate) => [candidate.key, candidate]),
  );

  const newlyUnlocked: MilestoneKey[] = [];
  for (const key of candidateKeys) {
    if (!MILESTONE_KEYS.includes(key)) {
      continue;
    }
    const candidate = unlockByKey.get(key);
    try {
      await prisma.userMilestone.create({
        data: {
          userId: input.userId,
          challengeId: input.challengeId,
          milestoneKey: key,
          unlockedAt: candidate?.unlockedAt ?? new Date(),
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

function groupLatestUnlockBatch(earned: EarnedMilestone[]): {
  latestUnlock: EarnedMilestone | null;
  latestUnlockAdditionalCount: number;
} {
  if (earned.length === 0) {
    return { latestUnlock: null, latestUnlockAdditionalCount: 0 };
  }

  const sorted = [...earned].sort(
    (a, b) =>
      new Date(b.unlockedAt).getTime() - new Date(a.unlockedAt).getTime(),
  );
  const latestAt = new Date(sorted[0]!.unlockedAt).getTime();
  const batch = sorted.filter(
    (row) => new Date(row.unlockedAt).getTime() === latestAt,
  );
  const primaryKey =
    pickMostPrestigiousMilestone(batch.map((row) => row.key)) ?? batch[0]!.key;
  const primary = batch.find((row) => row.key === primaryKey) ?? batch[0]!;

  return {
    latestUnlock: primary,
    latestUnlockAdditionalCount: Math.max(0, batch.length - 1),
  };
}

export async function getUserMilestones(
  prisma: PrismaService,
  userId: string,
): Promise<{
  earned: EarnedMilestone[];
  latestUnlock: EarnedMilestone | null;
  latestUnlockAdditionalCount: number;
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

  const batch = groupLatestUnlockBatch(earned);

  return {
    earned,
    ...batch,
  };
}

export function listMilestoneCatalog() {
  return MILESTONE_KEYS.map((key) => MILESTONE_CATALOG[key]);
}

export { pickMostPrestigiousMilestone, replayChallengeStreak };
