import { isActivityLogLogged } from './day-completion';
import {
  addLocalDays,
  getDatePartsInTimezone,
  getUserLocalDate,
  isValidWallClockHHMM,
} from './day-window';

export const DEFAULT_MORNING_TIME = '08:00';

export const ADAPTIVE_HISTORY_DAYS = 21;
export const ADAPTIVE_MIN_DAYS_WITH_LOGS = 5;
export const ADAPTIVE_MAX_OFFSET_MINUTES = 30;
export const ADAPTIVE_MAX_MAD_MINUTES = 45;
export const ADAPTIVE_ABSOLUTE_EARLIEST = '05:00';
export const ADAPTIVE_ABSOLUTE_LATEST = '12:00';

export type ActivityLogTimingRow = {
  userId: string;
  date: Date;
  createdAt: Date;
  state: string | null;
  tier: string | null;
  value: number | null;
  subPoints: unknown;
};

export type AdaptiveTimingUser = {
  id: string;
  reminderTime: string | null;
  reminderAdaptive: boolean;
  challengeTimezone: string;
};

export function hhmmToMinutes(hhmm: string): number {
  const [hour, minute] = hhmm.split(':').map(Number);
  return hour * 60 + minute;
}

export function minutesToHHMM(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, totalMinutes));
  const hour = Math.floor(clamped / 60);
  const minute = clamped % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function medianMinutes(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
  }
  return sorted[mid]!;
}

export function medianAbsoluteDeviation(
  values: number[],
  median: number,
): number {
  if (values.length === 0) {
    return 0;
  }
  const deviations = values.map((value) => Math.abs(value - median));
  return medianMinutes(deviations);
}

export function createdAtToLocalMinutes(
  createdAt: Date,
  timezone: string,
): number {
  const { hour, minute } = getDatePartsInTimezone(createdAt, timezone);
  return hour * 60 + minute;
}

export function aggregateFirstLogMinutesByDay(
  logs: ActivityLogTimingRow[],
  timezone: string,
): number[] {
  const firstLogByDay = new Map<number, Date>();

  for (const log of logs) {
    if (!isActivityLogLogged(log)) {
      continue;
    }

    const dayKey = log.date.getTime();
    const existing = firstLogByDay.get(dayKey);
    if (!existing || log.createdAt.getTime() < existing.getTime()) {
      firstLogByDay.set(dayKey, log.createdAt);
    }
  }

  return [...firstLogByDay.values()].map((createdAt) =>
    createdAtToLocalMinutes(createdAt, timezone),
  );
}

export function resolveEffectiveMorningTime(input: {
  baseReminderTime: string | null;
  reminderAdaptive: boolean;
  firstLogMinutesByDay: number[];
}): string {
  const baseTime = input.baseReminderTime ?? DEFAULT_MORNING_TIME;
  if (!input.reminderAdaptive) {
    return baseTime;
  }

  const baseMinutes = hhmmToMinutes(baseTime);
  const samples = input.firstLogMinutesByDay;

  if (samples.length < ADAPTIVE_MIN_DAYS_WITH_LOGS) {
    return baseTime;
  }

  const median = medianMinutes(samples);
  const mad = medianAbsoluteDeviation(samples, median);
  if (mad > ADAPTIVE_MAX_MAD_MINUTES) {
    return baseTime;
  }

  const earliest = hhmmToMinutes(ADAPTIVE_ABSOLUTE_EARLIEST);
  const latest = hhmmToMinutes(ADAPTIVE_ABSOLUTE_LATEST);
  const shifted = Math.min(
    Math.max(median, baseMinutes - ADAPTIVE_MAX_OFFSET_MINUTES),
    baseMinutes + ADAPTIVE_MAX_OFFSET_MINUTES,
  );
  const bounded = Math.min(Math.max(shifted, earliest), latest);

  return minutesToHHMM(bounded);
}

export function computeAdaptiveWindowStart(
  now: Date,
  timezones: string[],
  historyDays = ADAPTIVE_HISTORY_DAYS,
): Date {
  if (timezones.length === 0) {
    return new Date(now.getTime() - (historyDays + 1) * 24 * 60 * 60 * 1000);
  }

  let earliest = Number.POSITIVE_INFINITY;
  for (const timezone of timezones) {
    const localToday = getUserLocalDate(timezone, now);
    const windowStart = addLocalDays(localToday, -historyDays, timezone);
    earliest = Math.min(earliest, windowStart.getTime());
  }

  return new Date(earliest);
}

export function buildAdaptiveTimingMap(
  users: AdaptiveTimingUser[],
  logs: ActivityLogTimingRow[],
): Map<string, string> {
  const logsByUser = new Map<string, ActivityLogTimingRow[]>();
  for (const log of logs) {
    const existing = logsByUser.get(log.userId) ?? [];
    existing.push(log);
    logsByUser.set(log.userId, existing);
  }

  const result = new Map<string, string>();
  for (const user of users) {
    const userLogs = logsByUser.get(user.id) ?? [];
    const firstLogMinutesByDay = user.reminderAdaptive
      ? aggregateFirstLogMinutesByDay(userLogs, user.challengeTimezone)
      : [];
    const effectiveTime = resolveEffectiveMorningTime({
      baseReminderTime: user.reminderTime,
      reminderAdaptive: user.reminderAdaptive,
      firstLogMinutesByDay,
    });
    result.set(user.id, effectiveTime);
  }

  return result;
}

export function assertValidMorningTime(hhmm: string): void {
  if (!isValidWallClockHHMM(hhmm)) {
    throw new Error(`Invalid morning time: ${hhmm}`);
  }
}
