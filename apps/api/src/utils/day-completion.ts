export type ActivityLogPayload = {
  activityId: string;
  state: string | null;
  tier: string | null;
  value: number | null;
  subPoints: unknown;
};

export type DayLoggingStatus = {
  expectedCount: number;
  loggedActivityIds: string[];
  allScoredLogged: boolean;
};

export function isActivityLogLogged(
  log: Pick<ActivityLogPayload, 'state' | 'tier' | 'value' | 'subPoints'>,
): boolean {
  if (log.state != null && log.state !== 'UNLOGGED') {
    return true;
  }
  if (log.tier != null) {
    return true;
  }
  if (log.value != null) {
    return true;
  }
  if (log.subPoints != null) {
    return true;
  }
  return false;
}

export function computeDayLoggingStatus(
  scoredActivityIds: string[],
  logs: ActivityLogPayload[],
): DayLoggingStatus {
  const expectedCount = scoredActivityIds.length;
  const scoredIdSet = new Set(scoredActivityIds);
  const loggedActivityIds: string[] = [];

  for (const log of logs) {
    if (!scoredIdSet.has(log.activityId)) {
      continue;
    }
    if (isActivityLogLogged(log)) {
      loggedActivityIds.push(log.activityId);
    }
  }

  const allScoredLogged =
    expectedCount > 0 &&
    scoredActivityIds.every((id) => loggedActivityIds.includes(id));

  return { expectedCount, loggedActivityIds, allScoredLogged };
}

export type DayScoreCompletionInput = {
  finalized: boolean;
  breakdown: unknown;
};

export function isInterimDayCompleted(score: DayScoreCompletionInput): boolean {
  if (!score.finalized) {
    return false;
  }

  const breakdown = score.breakdown as { allScoredLogged?: boolean } | null;
  if (breakdown != null && typeof breakdown.allScoredLogged === 'boolean') {
    return breakdown.allScoredLogged;
  }

  return false;
}

export function isInterimDayFailed(score: DayScoreCompletionInput): boolean {
  return score.finalized && !isInterimDayCompleted(score);
}

export function isFreezeAbsorbed(score: DayScoreCompletionInput): boolean {
  const breakdown = score.breakdown as { freezeConsumed?: boolean } | null;
  return Boolean(breakdown?.freezeConsumed);
}

export function isStreakBreakingFailure(
  score: DayScoreCompletionInput,
): boolean {
  return isInterimDayFailed(score) && !isFreezeAbsorbed(score);
}

export function computeCurrentStreak(
  currentStreak: number,
  todayActivityLogs: ActivityLogPayload[],
  scoredActivityIds: string[],
): number {
  const { allScoredLogged } = computeDayLoggingStatus(
    scoredActivityIds,
    todayActivityLogs,
  );

  if (allScoredLogged) {
    return currentStreak + 1;
  }

  return currentStreak;
}
