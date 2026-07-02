import type { MilestoneKey } from '@workspace-starter/types';
import { isActivityLogLogged } from './day-completion';
import { formatLocalDateKey } from './day-window';
import { localCalendarDaysBetween } from './winback-dormancy';

export function countLoggedActivityLogs(
  logs: Array<{
    state: string | null;
    tier: string | null;
    value: number | null;
    subPoints: unknown;
  }>,
): number {
  return logs.filter((log) => isActivityLogLogged(log)).length;
}

export function countConsecutivePerfectDays(
  perfectDayKeys: string[],
  evaluationKey: string,
  evaluationIsPerfect: boolean,
): number {
  const perfectSet = new Set(perfectDayKeys);
  if (evaluationIsPerfect) {
    perfectSet.add(evaluationKey);
  }

  let count = 0;
  let cursor = evaluationKey;
  while (perfectSet.has(cursor)) {
    count += 1;
    cursor = shiftDateKey(cursor, -1);
  }
  return count;
}

function shiftDateKey(dateKey: string, deltaDays: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return utc.toISOString().slice(0, 10);
}

export function dateKeyToUtcDate(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export type HabitLogEntry = {
  activityId: string;
  dateKey: string;
  logged: boolean;
  completed: boolean;
};

export type FinalizedDayScoreRow = {
  date: Date;
  breakdown: unknown;
};

const STREAK_MILESTONE_THRESHOLDS: Array<{ key: MilestoneKey; days: number }> =
  [
    { key: 'streak_7', days: 7 },
    { key: 'streak_21', days: 21 },
    { key: 'streak_30', days: 30 },
    { key: 'streak_66', days: 66 },
  ];

function isDayCountedBreakdown(breakdown: unknown): boolean {
  const value = breakdown as { allScoredLogged?: boolean } | null;
  return value?.allScoredLogged === true;
}

function isFreezeConsumedBreakdown(breakdown: unknown): boolean {
  const value = breakdown as { freezeConsumed?: boolean } | null;
  return value?.freezeConsumed === true;
}

function isPerfectDayBreakdown(breakdown: unknown): boolean {
  return isDayCountedBreakdown(breakdown);
}

/** Replay challenge streak from finalized day scores (matches day-finalizer gating). */
export function replayChallengeStreak(
  dayScores: FinalizedDayScoreRow[],
): Array<{ date: Date; streakAfter: number }> {
  const sorted = [...dayScores].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
  let streak = 0;
  const timeline: Array<{ date: Date; streakAfter: number }> = [];

  for (const score of sorted) {
    if (isDayCountedBreakdown(score.breakdown)) {
      streak += 1;
    } else if (isFreezeConsumedBreakdown(score.breakdown)) {
      // Streak preserved when a freeze absorbs a miss.
    } else {
      streak = 0;
    }
    timeline.push({ date: score.date, streakAfter: streak });
  }

  return timeline;
}

export function deriveStreakMilestoneDates(
  dayScores: FinalizedDayScoreRow[],
): Map<MilestoneKey, Date> {
  const unlockDates = new Map<MilestoneKey, Date>();
  const timeline = replayChallengeStreak(dayScores);

  for (const { key, days } of STREAK_MILESTONE_THRESHOLDS) {
    const hit = timeline.find((point) => point.streakAfter >= days);
    if (hit) {
      unlockDates.set(key, hit.date);
    }
  }

  return unlockDates;
}

export function deriveFirstPerfectDayDate(
  dayScores: FinalizedDayScoreRow[],
): Date | null {
  const sorted = [...dayScores]
    .filter((score) => isPerfectDayBreakdown(score.breakdown))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  return sorted[0]?.date ?? null;
}

export function deriveFirstPerfectWeekDate(
  dayScores: FinalizedDayScoreRow[],
  timezone: string,
): Date | null {
  const perfectKeys = dayScores
    .filter((score) => isPerfectDayBreakdown(score.breakdown))
    .map((score) => formatLocalDateKey(score.date, timezone))
    .sort();

  for (const endKey of perfectKeys) {
    if (countConsecutivePerfectDays(perfectKeys, endKey, false) >= 7) {
      return dateKeyToUtcDate(endKey);
    }
  }

  return null;
}

export function deriveFirstFreezeConsumedDate(
  dayScores: FinalizedDayScoreRow[],
): Date | null {
  const sorted = [...dayScores]
    .filter((score) => isFreezeConsumedBreakdown(score.breakdown))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  return sorted[0]?.date ?? null;
}

export function deriveTotalLogs100Date(
  logs: Array<{
    date: Date;
    state: string | null;
    tier: string | null;
    value: number | null;
    subPoints: unknown;
  }>,
): Date | null {
  const logged = logs
    .filter((log) => isActivityLogLogged(log))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  return logged[99]?.date ?? null;
}

function isLogCompletedForHabit(log: {
  state: string | null;
  tier: string | null;
  value: number | null;
  subPoints: unknown;
}): boolean {
  if (!isActivityLogLogged(log)) return false;
  if (log.state === 'FAILED') return false;
  if (log.state === 'DONE') return true;
  if (log.value != null) return log.value > 0;
  if (log.tier != null) return true;
  if (log.subPoints != null) return true;
  return false;
}

/**
 * Longest consecutive completed-day run for any habit in the challenge scope.
 * Matches TaskCard / getActivityCompletion completion semantics.
 */
export function computeLongestCompletedHabitStreak(
  logs: Array<{
    activityId: string;
    date: Date;
    state: string | null;
    tier: string | null;
    value: number | null;
    subPoints: unknown;
  }>,
  timezone: string,
): number {
  const byActivity = new Map<string, Set<string>>();

  for (const log of logs) {
    if (!isLogCompletedForHabit(log)) continue;
    const dateKey = formatLocalDateKey(log.date, timezone);
    const dates = byActivity.get(log.activityId) ?? new Set<string>();
    dates.add(dateKey);
    byActivity.set(log.activityId, dates);
  }

  let best = 0;
  for (const dates of byActivity.values()) {
    best = Math.max(best, longestConsecutiveRun(dates));
  }
  return best;
}

export function deriveHabitStreak14Date(
  logs: Array<{
    activityId: string;
    date: Date;
    state: string | null;
    tier: string | null;
    value: number | null;
    subPoints: unknown;
  }>,
  timezone: string,
): Date | null {
  const byActivity = new Map<string, Set<string>>();

  for (const log of logs) {
    if (!isLogCompletedForHabit(log)) continue;
    const dateKey = formatLocalDateKey(log.date, timezone);
    const dates = byActivity.get(log.activityId) ?? new Set<string>();
    dates.add(dateKey);
    byActivity.set(log.activityId, dates);
  }

  let earliest: Date | null = null;

  for (const dates of byActivity.values()) {
    const sorted = [...dates].sort();
    let run = 0;
    for (let i = 0; i < sorted.length; i += 1) {
      if (i > 0 && isNextDay(sorted[i - 1]!, sorted[i]!)) {
        run += 1;
      } else {
        run = 1;
      }
      if (run >= 14) {
        const hitDate = dateKeyToUtcDate(sorted[i]!);
        if (!earliest || hitDate.getTime() < earliest.getTime()) {
          earliest = hitDate;
        }
      }
    }
  }

  return earliest;
}

export type ActivityLogDateRow = { date: Date };

/**
 * First day the user logged any ActivityLog after 3+ dormant local days.
 * Any log row counts (aligned with winback dormancy semantics).
 */
export function deriveComebackDate(
  logs: ActivityLogDateRow[],
  timezone: string,
  minDormantDays = 3,
): Date | null {
  const sorted = [...logs].sort((a, b) => a.date.getTime() - b.date.getTime());
  let lastDate: Date | null = null;

  for (const log of sorted) {
    if (!lastDate) {
      lastDate = log.date;
      continue;
    }

    const dormantDays = localCalendarDaysBetween(lastDate, log.date, timezone);
    if (dormantDays >= minDormantDays) {
      return log.date;
    }

    if (log.date.getTime() > lastDate.getTime()) {
      lastDate = log.date;
    }
  }

  return null;
}

export function computeDormantDaysBefore(
  logs: ActivityLogDateRow[],
  evaluationDay: Date,
  timezone: string,
): number {
  const evaluationKey = formatLocalDateKey(evaluationDay, timezone);
  const prior = logs
    .filter((log) => formatLocalDateKey(log.date, timezone) < evaluationKey)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const lastBefore = prior[prior.length - 1];
  if (!lastBefore) return 0;

  return localCalendarDaysBetween(lastBefore.date, evaluationDay, timezone);
}

export function hasAnyActivityLogOnDay(
  logs: ActivityLogDateRow[],
  evaluationDay: Date,
  timezone: string,
): boolean {
  const evaluationKey = formatLocalDateKey(evaluationDay, timezone);
  return logs.some(
    (log) => formatLocalDateKey(log.date, timezone) === evaluationKey,
  );
}

/** @deprecated Use computeLongestCompletedHabitStreak for milestone evaluation. */
export function computeLongestHabitStreak(logs: HabitLogEntry[]): number {
  const byActivity = new Map<string, Set<string>>();
  for (const log of logs) {
    if (!log.logged) continue;
    const dates = byActivity.get(log.activityId) ?? new Set<string>();
    dates.add(log.dateKey);
    byActivity.set(log.activityId, dates);
  }

  let best = 0;
  for (const dates of byActivity.values()) {
    best = Math.max(best, longestConsecutiveRun(dates));
  }
  return best;
}

function longestConsecutiveRun(dateKeys: Set<string>): number {
  if (dateKeys.size === 0) return 0;

  const sorted = [...dateKeys].sort();
  let best = 1;
  let current = 1;

  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1]!;
    const curr = sorted[i]!;
    if (isNextDay(prev, curr)) {
      current += 1;
      best = Math.max(best, current);
    } else if (prev !== curr) {
      current = 1;
    }
  }

  return best;
}

function isNextDay(prevKey: string, nextKey: string): boolean {
  const [y, m, d] = prevKey.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return next === nextKey;
}
