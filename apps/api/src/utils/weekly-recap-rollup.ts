import { formatLocalDateKey } from './day-window';
import {
  countLoggedActivityLogs,
  replayChallengeStreak,
  type FinalizedDayScoreRow,
} from './milestone-metrics';
import {
  countDaysInclusive,
  getIsoWeekStart,
  iterDateKeys,
} from './stats-aggregation';
import {
  computeWeeklyRecapEligibleRange,
  capEligibleRangeToFinalizedDays,
  getWeeklyRecapWeekKeys,
  type WeeklyRecapEligibleRange,
} from './weekly-recap-eligibility';

type ChallengeLike = {
  startDate: Date;
  endDate: Date | null;
  lengthDays: number;
  currentDay: number;
  isActive: boolean;
  stoppedAt: Date | null;
};

type ActivityLogRow = {
  activityId: string;
  date: Date;
  state: string | null;
  tier: string | null;
  value: number | null;
  subPoints: unknown;
};

type DayScoreRow = {
  date: Date;
  netXp: number;
  breakdown: unknown;
  finalized: boolean;
};

export type WeeklyRecapRollup = {
  weekStartKey: string;
  weekEndKey: string;
  eligibleDays: number;
  daysShowedUp: number;
  perfectDays: number;
  totalHabitsHit: number;
  weekXp: number;
  streakStart: number;
  streakEnd: number;
  bestHabitName: string | null;
  bestHabitHits: number;
  identityReflectionLine: string;
  nextWeekNudgeLine: string;
};

function isPerfectDayBreakdown(breakdown: unknown): boolean {
  const value = breakdown as { allScoredLogged?: boolean } | null;
  return value?.allScoredLogged === true;
}

function isLogCompletedForHabit(log: ActivityLogRow): boolean {
  if (log.state === 'FAILED') return false;
  if (log.state === 'DONE') return true;
  if (log.value != null) return log.value > 0;
  if (log.tier != null) return true;
  if (log.subPoints != null) return true;
  return false;
}

function buildIdentityReflectionLine(
  daysShowedUp: number,
  eligibleDays: number,
): string {
  const dayLabel = eligibleDays === 1 ? 'day' : 'days';
  if (daysShowedUp >= eligibleDays && eligibleDays >= 5) {
    return `You showed up every eligible day this week (${daysShowedUp} of ${eligibleDays} ${dayLabel}) — that's who you're becoming.`;
  }
  if (daysShowedUp >= Math.ceil(eligibleDays * 0.7)) {
    return `You showed up ${daysShowedUp} of ${eligibleDays} ${dayLabel} — steady steps, and that's who you're becoming.`;
  }
  if (daysShowedUp >= 1) {
    return `You showed up ${daysShowedUp} of ${eligibleDays} ${dayLabel} — small steps still shape the trail you're on.`;
  }
  return 'The trail is still here when you are ready.';
}

function buildNextWeekNudgeLine(
  bestHabitName: string | null,
  streakEnd: number,
): string {
  if (bestHabitName && streakEnd > 0) {
    return `Next week, keep ${bestHabitName} in the pack — your ${streakEnd}-day streak has momentum.`;
  }
  if (bestHabitName) {
    return `Next week, ${bestHabitName} is a gentle place to start again.`;
  }
  if (streakEnd > 0) {
    return `Next week, one small log keeps your ${streakEnd}-day streak warm.`;
  }
  return 'Next week, pick one small habit and let the trail meet you there.';
}

function streakBeforeWeek(
  dayScores: FinalizedDayScoreRow[],
  weekStartKey: string,
  timezone: string,
): number {
  const beforeWeek = dayScores.filter(
    (score) => formatLocalDateKey(score.date, timezone) < weekStartKey,
  );
  const timeline = replayChallengeStreak(beforeWeek);
  return timeline[timeline.length - 1]?.streakAfter ?? 0;
}

function streakAtWeekEnd(
  dayScores: FinalizedDayScoreRow[],
  weekEndKey: string,
  timezone: string,
): number {
  const throughWeek = dayScores.filter(
    (score) => formatLocalDateKey(score.date, timezone) <= weekEndKey,
  );
  const timeline = replayChallengeStreak(throughWeek);
  return timeline[timeline.length - 1]?.streakAfter ?? 0;
}

function countDaysWithActivity(
  activityDates: string[],
  eligibleStartKey: string,
  eligibleEndKey: string,
): number {
  const eligible = new Set(iterDateKeys(eligibleStartKey, eligibleEndKey));
  return new Set(activityDates.filter((dateKey) => eligible.has(dateKey))).size;
}

function findBestHabit(
  logs: ActivityLogRow[],
  activityNames: Map<string, string>,
  eligibleStartKey: string,
  eligibleEndKey: string,
  timezone: string,
): { name: string | null; hits: number } {
  const eligible = new Set(iterDateKeys(eligibleStartKey, eligibleEndKey));
  const hitsByActivity = new Map<string, number>();

  for (const log of logs) {
    const dateKey = formatLocalDateKey(log.date, timezone);
    if (!eligible.has(dateKey) || !isLogCompletedForHabit(log)) {
      continue;
    }
    hitsByActivity.set(
      log.activityId,
      (hitsByActivity.get(log.activityId) ?? 0) + 1,
    );
  }

  let bestId: string | null = null;
  let bestHits = 0;
  for (const [activityId, hits] of hitsByActivity) {
    if (hits > bestHits) {
      bestId = activityId;
      bestHits = hits;
    }
  }

  return {
    name: bestId ? (activityNames.get(bestId) ?? null) : null,
    hits: bestHits,
  };
}

export function computeWeeklyRecapRollupRange(
  challenge: ChallengeLike,
  timezone: string,
  dayScores: DayScoreRow[],
  now = new Date(),
): WeeklyRecapEligibleRange {
  const baseRange = computeWeeklyRecapEligibleRange(challenge, timezone, now);
  const finalizedDateKeys = new Set(
    dayScores
      .filter((score) => score.finalized)
      .map((score) => formatLocalDateKey(score.date, timezone)),
  );
  return capEligibleRangeToFinalizedDays(
    baseRange,
    finalizedDateKeys,
    timezone,
    now,
  );
}

export function computeWeeklyRecapRollup(input: {
  challenge: ChallengeLike;
  timezone: string;
  dayScores: DayScoreRow[];
  activityLogs: ActivityLogRow[];
  activityNames: Map<string, string>;
  now?: Date;
}): WeeklyRecapRollup {
  const now = input.now ?? new Date();
  const timezone = input.timezone;
  const range = computeWeeklyRecapRollupRange(
    input.challenge,
    timezone,
    input.dayScores,
    now,
  );
  const { weekStartKey, weekEndKey } = getWeeklyRecapWeekKeys(timezone, now);

  const finalizedInWeek = input.dayScores.filter((score) => {
    if (!score.finalized) return false;
    const dateKey = formatLocalDateKey(score.date, timezone);
    return dateKey >= range.eligibleStartKey && dateKey <= range.eligibleEndKey;
  });

  const perfectDays = finalizedInWeek.filter((score) =>
    isPerfectDayBreakdown(score.breakdown),
  ).length;

  const weekXp = finalizedInWeek.reduce((sum, score) => sum + score.netXp, 0);

  const logsInRange = input.activityLogs.filter((log) => {
    const dateKey = formatLocalDateKey(log.date, timezone);
    return dateKey >= range.eligibleStartKey && dateKey <= range.eligibleEndKey;
  });

  const totalHabitsHit = countLoggedActivityLogs(logsInRange);

  const activityDates = [
    ...new Set(
      logsInRange.map((log) => formatLocalDateKey(log.date, timezone)),
    ),
  ];
  const daysShowedUp = countDaysWithActivity(
    activityDates,
    range.eligibleStartKey,
    range.eligibleEndKey,
  );

  const finalizedScores: FinalizedDayScoreRow[] = input.dayScores
    .filter((score) => score.finalized)
    .map((score) => ({ date: score.date, breakdown: score.breakdown }));

  const streakStart = streakBeforeWeek(finalizedScores, weekStartKey, timezone);
  const streakEnd = streakAtWeekEnd(
    finalizedScores,
    range.eligibleEndKey,
    timezone,
  );

  const best = findBestHabit(
    input.activityLogs,
    input.activityNames,
    range.eligibleStartKey,
    range.eligibleEndKey,
    timezone,
  );

  const identityReflectionLine = buildIdentityReflectionLine(
    daysShowedUp,
    range.eligibleDays,
  );
  const nextWeekNudgeLine = buildNextWeekNudgeLine(best.name, streakEnd);

  return {
    weekStartKey,
    weekEndKey,
    eligibleDays: range.eligibleDays,
    daysShowedUp,
    perfectDays,
    totalHabitsHit,
    weekXp,
    streakStart,
    streakEnd,
    bestHabitName: best.name,
    bestHabitHits: best.hits,
    identityReflectionLine,
    nextWeekNudgeLine,
  };
}

export function summarizeWeeklyRecapRollup(rollup: WeeklyRecapRollup): string {
  const streakLine =
    rollup.streakEnd > rollup.streakStart
      ? `Streak grew from ${rollup.streakStart} to ${rollup.streakEnd}.`
      : rollup.streakEnd > 0
        ? `Streak holding at ${rollup.streakEnd}.`
        : 'Fresh trail ahead.';

  const habitLine =
    rollup.bestHabitName && rollup.bestHabitHits > 0
      ? `Strongest habit: ${rollup.bestHabitName} (${rollup.bestHabitHits} hits).`
      : '';

  const perfectLine =
    rollup.perfectDays > 0
      ? `${rollup.perfectDays} perfect day${rollup.perfectDays === 1 ? '' : 's'}.`
      : '';

  return [
    `${rollup.daysShowedUp} of ${rollup.eligibleDays} days on the trail.`,
    `${rollup.totalHabitsHit} habit logs, ${rollup.weekXp} XP.`,
    perfectLine,
    streakLine,
    habitLine,
    rollup.identityReflectionLine,
    rollup.nextWeekNudgeLine,
  ]
    .filter(Boolean)
    .join(' ');
}

/** @internal test helper */
export function getRollupEligibleRangeForTest(
  challenge: ChallengeLike,
  timezone: string,
  dayScores: DayScoreRow[] = [],
  now?: Date,
): WeeklyRecapEligibleRange {
  return computeWeeklyRecapRollupRange(challenge, timezone, dayScores, now);
}

/** @internal test helper */
export function isoWeekStartKey(dateKey: string): string {
  return getIsoWeekStart(dateKey);
}

/** @internal test helper */
export function eligibleDayCount(from: string, to: string): number {
  return countDaysInclusive(from, to);
}
