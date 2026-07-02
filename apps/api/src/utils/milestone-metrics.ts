import { isActivityLogLogged } from './day-completion';

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

export type HabitLogEntry = {
  activityId: string;
  dateKey: string;
  logged: boolean;
};

/** Longest run of consecutive logged days for any single habit (personal best). */
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
