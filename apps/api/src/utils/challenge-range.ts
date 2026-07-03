import {
  addLocalDays,
  formatLocalDateKey,
  getIsoWeekRange,
  getUserLocalDate,
} from './day-window';

export const DEFAULT_CHALLENGE_WINDOW_DAYS = 30;
export const MAX_CHALLENGE_RANGE_DAYS = 366;

type ChallengeRangeLike = {
  startDate: Date;
  endDate: Date | null;
  lengthDays: number;
  currentDay: number;
  isActive: boolean;
  stoppedAt?: Date | null;
};

function parseDateKey(dateKey: string): {
  year: number;
  month: number;
  day: number;
} {
  const [year, month, day] = dateKey.split('-').map(Number);
  return { year, month, day };
}

function dateKeyToUtcTime(dateKey: string): number {
  const { year, month, day } = parseDateKey(dateKey);
  return Date.UTC(year, month - 1, day);
}

function compareDateKeys(a: string, b: string): number {
  return dateKeyToUtcTime(a) - dateKeyToUtcTime(b);
}

function daysBetweenDateKeysInclusive(
  startKey: string,
  endKey: string,
): number {
  const diffMs = dateKeyToUtcTime(endKey) - dateKeyToUtcTime(startKey);
  return Math.floor(diffMs / 86_400_000) + 1;
}

export function normalizeChallengeBoundary(date: Date, timezone: string): Date {
  return getUserLocalDate(timezone, date);
}

export function lengthDaysFromRange(
  startDate: Date,
  endDate: Date,
  timezone: string,
): number {
  const startKey = formatLocalDateKey(startDate, timezone);
  const endKey = formatLocalDateKey(endDate, timezone);
  return daysBetweenDateKeysInclusive(startKey, endKey);
}

export function currentDayFromDates(
  startDate: Date,
  endDate: Date,
  timezone: string,
  now = new Date(),
): number {
  const todayKey = formatLocalDateKey(now, timezone);
  const startKey = formatLocalDateKey(startDate, timezone);
  const endKey = formatLocalDateKey(endDate, timezone);
  const lengthDays = daysBetweenDateKeysInclusive(startKey, endKey);

  if (compareDateKeys(todayKey, startKey) < 0) {
    return 0;
  }

  if (compareDateKeys(todayKey, endKey) > 0) {
    return lengthDays + 1;
  }

  return daysBetweenDateKeysInclusive(startKey, todayKey);
}

export function scheduledEndFromStart(
  startDate: Date,
  lengthDays: number,
  timezone: string,
): Date {
  return addLocalDays(startDate, Math.max(1, lengthDays) - 1, timezone);
}

export function fallbackScheduledEnd(
  challenge: Pick<ChallengeRangeLike, 'startDate' | 'endDate' | 'lengthDays'>,
  timezone: string,
): Date {
  return (
    challenge.endDate ??
    scheduledEndFromStart(challenge.startDate, challenge.lengthDays, timezone)
  );
}

export function deriveChallengeProgress(
  challenge: Pick<
    ChallengeRangeLike,
    'startDate' | 'endDate' | 'lengthDays' | 'currentDay'
  >,
  timezone: string,
  now = new Date(),
): { endDate: Date; lengthDays: number; currentDay: number } {
  const endDate = fallbackScheduledEnd(challenge, timezone);
  const lengthDays = Math.max(
    1,
    lengthDaysFromRange(challenge.startDate, endDate, timezone),
  );
  const currentDay = currentDayFromDates(
    challenge.startDate,
    endDate,
    timezone,
    now,
  );

  return { endDate, lengthDays, currentDay };
}

export function isChallengeCompleted(
  challenge: ChallengeRangeLike | null,
  timezone: string,
  now = new Date(),
): boolean {
  if (!challenge) {
    return true;
  }

  if (!challenge.isActive || challenge.stoppedAt) {
    return true;
  }

  const { currentDay, lengthDays } = deriveChallengeProgress(
    challenge,
    timezone,
    now,
  );
  return currentDay > lengthDays;
}

export function buildDefaultChallengeRange(
  timezone: string,
  now = new Date(),
): { startDate: Date; endDate: Date; lengthDays: number; currentDay: number } {
  const startDate = getUserLocalDate(timezone, now);
  const endDate = scheduledEndFromStart(
    startDate,
    DEFAULT_CHALLENGE_WINDOW_DAYS,
    timezone,
  );
  return {
    startDate,
    endDate,
    lengthDays: lengthDaysFromRange(startDate, endDate, timezone),
    currentDay: currentDayFromDates(startDate, endDate, timezone, now),
  };
}

export function buildChallengeRange(
  startDate: Date,
  endDate: Date,
  timezone: string,
  now = new Date(),
): { startDate: Date; endDate: Date; lengthDays: number; currentDay: number } {
  const normalizedStart = normalizeChallengeBoundary(startDate, timezone);
  const normalizedEnd = normalizeChallengeBoundary(endDate, timezone);
  const lengthDays = lengthDaysFromRange(
    normalizedStart,
    normalizedEnd,
    timezone,
  );

  return {
    startDate: normalizedStart,
    endDate: normalizedEnd,
    lengthDays,
    currentDay: currentDayFromDates(
      normalizedStart,
      normalizedEnd,
      timezone,
      now,
    ),
  };
}

export function buildCurrentIsoWeekChallengeRange(
  timezone: string,
  now = new Date(),
): { startDate: Date; endDate: Date; lengthDays: number; currentDay: number } {
  const { start, end } = getIsoWeekRange(timezone, now);
  return buildChallengeRange(start, end, timezone, now);
}

/** Preserve the earliest solo start and latest end when attaching a fellowship. */
export function mergeChallengeOnGroupJoin(
  existing: Pick<
    ChallengeRangeLike,
    'startDate' | 'endDate' | 'lengthDays' | 'currentDay'
  >,
  groupStartDate: Date,
  groupEndDate: Date,
  timezone: string,
  now = new Date(),
): { startDate: Date; endDate: Date; lengthDays: number; currentDay: number } {
  const groupRange = buildChallengeRange(
    groupStartDate,
    groupEndDate,
    timezone,
    now,
  );
  const soloRange = deriveChallengeProgress(existing, timezone, now);

  const mergedStart =
    existing.startDate.getTime() < groupRange.startDate.getTime()
      ? existing.startDate
      : groupRange.startDate;
  const mergedEnd =
    soloRange.endDate.getTime() > groupRange.endDate.getTime()
      ? soloRange.endDate
      : groupRange.endDate;

  return buildChallengeRange(mergedStart, mergedEnd, timezone, now);
}
