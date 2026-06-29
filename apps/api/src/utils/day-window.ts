type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getDatePartsInTimezone(date: Date, timeZone: string): DateParts {
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
