export function isValidTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export function getDatePartsInTimezone(
  date: Date,
  timeZone: string,
): DateParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === '24' ? 0 : parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second === '24' ? 0 : parts.second),
  };
}

function getTimezoneOffsetMs(timeZone: string, date: Date): number {
  const parts = getDatePartsInTimezone(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - date.getTime();
}

function zonedTimeToUtc(
  parts: Omit<DateParts, 'hour' | 'minute' | 'second'> & {
    hour?: number;
    minute?: number;
    second?: number;
  },
  timeZone: string,
): Date {
  const utcGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
  );
  const offset = getTimezoneOffsetMs(timeZone, new Date(utcGuess));
  return new Date(utcGuess - offset);
}

function formatDateKey(date: Date, timeZone: string): string {
  return date.toLocaleDateString('en-CA', { timeZone });
}

/** YYYY-MM-DD for a UTC instant in the user's timezone. */
export function formatLocalDateKey(date: Date, timezone: string): string {
  return formatDateKey(date, timezone);
}

const LOCAL_DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** True when `dateKey` is a YYYY-MM-DD string. */
export function isLocalDateKey(dateKey: string): boolean {
  return LOCAL_DATE_KEY_PATTERN.test(dateKey);
}

/** UTC midnight for a local calendar day in the given timezone. */
export function parseLocalDateKey(dateKey: string, timezone: string): Date {
  if (!isLocalDateKey(dateKey)) {
    throw new Error(`Invalid local date key: ${dateKey}`);
  }
  const { year, month, day } = parseDateKey(dateKey);
  return zonedTimeToUtc({ year, month, day }, timezone);
}

function parseDateKey(
  dateKey: string,
): Omit<DateParts, 'hour' | 'minute' | 'second'> {
  const [year, month, day] = dateKey.split('-').map(Number);
  return { year, month, day };
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const { year, month, day } = parseDateKey(dateKey);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return utc.toISOString().slice(0, 10);
}

function parseTargetHHMM(targetHHMM: string): {
  targetHour: number;
  targetMinute: number;
} | null {
  const [targetHour, targetMinute] = targetHHMM.split(':').map(Number);
  if (
    Number.isNaN(targetHour) ||
    Number.isNaN(targetMinute) ||
    targetHour < 0 ||
    targetHour > 23 ||
    targetMinute < 0 ||
    targetMinute > 59
  ) {
    return null;
  }
  return { targetHour, targetMinute };
}

/** Minutes elapsed since targetHHMM in timezone; null when local time is before target. */
export function getLocalMinutesSinceTarget(
  timezone: string,
  targetHHMM: string,
  now = new Date(),
): number | null {
  const parsed = parseTargetHHMM(targetHHMM);
  if (!parsed) {
    return null;
  }

  const { hour, minute } = getDatePartsInTimezone(now, timezone);
  const currentMinutes = hour * 60 + minute;
  const targetMinutes = parsed.targetHour * 60 + parsed.targetMinute;
  const elapsedMinutes = currentMinutes - targetMinutes;
  return elapsedMinutes >= 0 ? elapsedMinutes : null;
}

/** True when the user's local hour:minute equals targetHHMM (for EVERY_MINUTE cron). */
export function isLocalTimeMatch(
  timezone: string,
  targetHHMM: string,
  now = new Date(),
): boolean {
  const elapsed = getLocalMinutesSinceTarget(timezone, targetHHMM, now);
  return elapsed === 0;
}

/** True from targetHHMM through targetHHMM + windowMinutes (inclusive) in timezone. */
export function isWithinLocalCatchUpWindow(
  timezone: string,
  targetHHMM: string,
  now = new Date(),
  windowMinutes = 15,
): boolean {
  const elapsed = getLocalMinutesSinceTarget(timezone, targetHHMM, now);
  return elapsed !== null && elapsed <= windowMinutes;
}

/** Returns UTC instant for midnight of the user's current local calendar day. */
export function getUserLocalDate(timezone: string, now = new Date()): Date {
  const dateKey = formatDateKey(now, timezone);
  const { year, month, day } = parseDateKey(dateKey);
  return zonedTimeToUtc({ year, month, day }, timezone);
}

/** True if the user can still submit tasks for today (before 11:59:59 PM local). */
export function isBeforeMidnight(timezone: string, now = new Date()): boolean {
  const { end } = getDayWindow(getUserLocalDate(timezone, now), timezone);
  return now.getTime() <= end.getTime();
}

/** Returns the start (midnight) and end (23:59:59.999) of a calendar day in the user's timezone. */
export function getDayWindow(
  date: Date,
  timezone: string,
): { start: Date; end: Date } {
  const dateKey = formatDateKey(date, timezone);
  const { year, month, day } = parseDateKey(dateKey);
  const start = zonedTimeToUtc({ year, month, day }, timezone);
  const end = zonedTimeToUtc(
    { year, month, day, hour: 23, minute: 59, second: 59 },
    timezone,
  );
  return { start, end: new Date(end.getTime() + 999) };
}

export function addLocalDays(date: Date, days: number, timezone: string): Date {
  const dateKey = addDaysToDateKey(formatDateKey(date, timezone), days);
  const { year, month, day } = parseDateKey(dateKey);
  return zonedTimeToUtc({ year, month, day }, timezone);
}

export function isSameLocalDay(a: Date, b: Date, timezone: string): boolean {
  return formatDateKey(a, timezone) === formatDateKey(b, timezone);
}

/** Returns local-midnight instants for Monday and Sunday of the current ISO week. */
export function getIsoWeekRange(
  timezone: string,
  now = new Date(),
): { start: Date; end: Date } {
  const dateKey = formatDateKey(now, timezone);
  const { year, month, day } = parseDateKey(dateKey);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = utcDate.getUTCDay();
  const isoDay = dayOfWeek === 0 ? 7 : dayOfWeek;
  const mondayKey = addDaysToDateKey(dateKey, -(isoDay - 1));
  const sundayKey = addDaysToDateKey(mondayKey, 6);
  const mondayParts = parseDateKey(mondayKey);
  const sundayParts = parseDateKey(sundayKey);
  return {
    start: zonedTimeToUtc(mondayParts, timezone),
    end: zonedTimeToUtc(sundayParts, timezone),
  };
}
