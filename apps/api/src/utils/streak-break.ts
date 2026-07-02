import type { StreakBreak } from '@workspace-starter/types';
import { isInterimDayCompleted, isInterimDayFailed } from './day-completion';
import { addLocalDays, formatLocalDateKey } from './day-window';

export type FinalizedDayScore = {
  date: Date;
  breakdown: unknown;
  finalized: boolean;
};

function daysBetweenDateKeys(fromKey: string, toKey: string): number {
  const from = new Date(`${fromKey}T00:00:00.000Z`);
  const to = new Date(`${toKey}T00:00:00.000Z`);
  return Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

export function computeStreakBreak(
  finalizedScores: FinalizedDayScore[],
  timezone: string,
  todayDate: Date,
): StreakBreak {
  const noBreak: StreakBreak = {
    occurred: false,
    previousStreak: 0,
    brokeOnDate: null,
    daysSinceBreak: 0,
  };

  const sorted = [...finalizedScores]
    .filter((score) => score.finalized)
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  const last = sorted[0];
  if (!last || !isInterimDayFailed(last)) {
    return noBreak;
  }

  const brokeOnDate = formatLocalDateKey(last.date, timezone);
  const todayKey = formatLocalDateKey(todayDate, timezone);
  const scoreByDateKey = new Map(
    sorted.map((score) => [formatLocalDateKey(score.date, timezone), score]),
  );

  let firstFailureDate = last.date;
  let cursor = addLocalDays(last.date, -1, timezone);
  while (true) {
    const key = formatLocalDateKey(cursor, timezone);
    const score = scoreByDateKey.get(key);
    if (!score || !isInterimDayFailed(score)) {
      break;
    }
    firstFailureDate = score.date;
    cursor = addLocalDays(cursor, -1, timezone);
  }

  let previousStreak = 0;
  cursor = addLocalDays(firstFailureDate, -1, timezone);
  while (true) {
    const key = formatLocalDateKey(cursor, timezone);
    const score = scoreByDateKey.get(key);
    if (!score || !isInterimDayCompleted(score)) {
      break;
    }
    previousStreak += 1;
    cursor = addLocalDays(cursor, -1, timezone);
  }

  const priorToLatestKey = formatLocalDateKey(
    addLocalDays(last.date, -1, timezone),
    timezone,
  );
  const priorToLatest = scoreByDateKey.get(priorToLatestKey);
  const isRepeatMiss =
    priorToLatest != null && isInterimDayFailed(priorToLatest);

  return {
    occurred: previousStreak > 0 || isRepeatMiss,
    previousStreak,
    brokeOnDate,
    daysSinceBreak: daysBetweenDateKeys(brokeOnDate, todayKey),
  };
}
