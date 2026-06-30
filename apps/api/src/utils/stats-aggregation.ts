import { isActivityLogLogged } from './day-completion';

/** Ranges longer than this are aggregated into ISO-week buckets server-side. */
export const SERIES_WEEKLY_BUCKET_THRESHOLD_DAYS = 90;

/** Hard cap on queryable range length (inclusive days). */
export const MAX_SERIES_RANGE_DAYS = 365;

export type ActivityLogRow = {
  date: string;
  value: number | null;
  xpAwarded: number;
  state: string | null;
  tier: string | null;
  subPoints: unknown;
};

export type ActivitySeriesPoint = {
  date: string;
  value: number;
  xpAwarded: number;
};

export type CompletionDayState = 'completed' | 'missed' | 'unlogged' | 'future';

export type ActivityCompletionResult = {
  rateByWeek: { weekStart: string; rate: number }[];
  streak: number;
  days: { date: string; state: CompletionDayState }[];
};

export type LeaderboardSeriesMetric = 'cumulative' | 'daily';

export type LeaderboardMemberInput = {
  id: string;
  name: string;
  dayScores: { date: string; netXp: number }[];
};

export type LeaderboardSeriesMember = {
  id: string;
  name: string;
  isSelf: boolean;
  points: { date: string; xp: number }[];
};

export type LeaderboardSeriesResult = {
  members: LeaderboardSeriesMember[];
};

export function parseDateKey(dateKey: string): {
  year: number;
  month: number;
  day: number;
} {
  const [year, month, day] = dateKey.split('-').map(Number);
  return { year, month, day };
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const { year, month, day } = parseDateKey(dateKey);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return utc.toISOString().slice(0, 10);
}

export function countDaysInclusive(from: string, to: string): number {
  if (to < from) return 0;
  const start = Date.UTC(
    parseDateKey(from).year,
    parseDateKey(from).month - 1,
    parseDateKey(from).day,
  );
  const end = Date.UTC(
    parseDateKey(to).year,
    parseDateKey(to).month - 1,
    parseDateKey(to).day,
  );
  return Math.floor((end - start) / 86_400_000) + 1;
}

export function iterDateKeys(from: string, to: string): string[] {
  if (to < from) return [];
  const keys: string[] = [];
  let current = from;
  while (current <= to) {
    keys.push(current);
    current = addDaysToDateKey(current, 1);
  }
  return keys;
}

export function getIsoWeekStart(dateKey: string): string {
  const { year, month, day } = parseDateKey(dateKey);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = utcDate.getUTCDay();
  const isoDay = dayOfWeek === 0 ? 7 : dayOfWeek;
  return addDaysToDateKey(dateKey, -(isoDay - 1));
}

export function shouldBucketWeekly(from: string, to: string): boolean {
  return countDaysInclusive(from, to) > SERIES_WEEKLY_BUCKET_THRESHOLD_DAYS;
}

export function clampDateRange(
  from: string,
  to: string,
  maxDays = MAX_SERIES_RANGE_DAYS,
): { from: string; to: string } {
  if (to < from) return { from, to };
  const span = countDaysInclusive(from, to);
  if (span <= maxDays) return { from, to };
  return { from: addDaysToDateKey(to, -(maxDays - 1)), to };
}

function isLogCompleted(log: ActivityLogRow): boolean {
  if (!isActivityLogLogged(log)) return false;
  if (log.state === 'FAILED') return false;
  if (log.state === 'DONE') return true;
  if (log.value != null) return log.value > 0;
  if (log.tier != null) return true;
  if (log.subPoints != null) return true;
  return false;
}

export function getCompletionDayState(
  log: ActivityLogRow | undefined,
  dateKey: string,
  todayKey: string,
): CompletionDayState {
  if (dateKey > todayKey) return 'future';
  if (!log || !isActivityLogLogged(log)) return 'unlogged';
  if (log.state === 'FAILED') return 'missed';
  return isLogCompleted(log) ? 'completed' : 'missed';
}

export function computePerActivityStreak(
  days: { date: string; state: CompletionDayState }[],
): number {
  const eligible = days
    .filter((day) => day.state !== 'future')
    .sort((a, b) => b.date.localeCompare(a.date));

  let streak = 0;
  for (const day of eligible) {
    if (day.state === 'completed') {
      streak += 1;
    } else {
      break;
    }
  }
  return streak;
}

export function computeWeeklyCompletionRates(
  days: { date: string; state: CompletionDayState }[],
): { weekStart: string; rate: number }[] {
  const byWeek = new Map<string, { completed: number; total: number }>();

  for (const day of days) {
    if (day.state === 'future') continue;
    const weekStart = getIsoWeekStart(day.date);
    const bucket = byWeek.get(weekStart) ?? { completed: 0, total: 0 };
    bucket.total += 1;
    if (day.state === 'completed') bucket.completed += 1;
    byWeek.set(weekStart, bucket);
  }

  return [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, { completed, total }]) => ({
      weekStart,
      rate: total > 0 ? Math.round((completed / total) * 100) : 0,
    }));
}

function bucketSeriesWeekly(
  points: ActivitySeriesPoint[],
): ActivitySeriesPoint[] {
  const byWeek = new Map<
    string,
    { valueSum: number; valueCount: number; xpSum: number }
  >();

  for (const point of points) {
    const weekStart = getIsoWeekStart(point.date);
    const bucket = byWeek.get(weekStart) ?? {
      valueSum: 0,
      valueCount: 0,
      xpSum: 0,
    };
    bucket.valueSum += point.value;
    bucket.valueCount += 1;
    bucket.xpSum += point.xpAwarded;
    byWeek.set(weekStart, bucket);
  }

  return [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, bucket]) => ({
      date: weekStart,
      value:
        bucket.valueCount > 0
          ? Math.round((bucket.valueSum / bucket.valueCount) * 100) / 100
          : 0,
      xpAwarded: bucket.xpSum,
    }));
}

export function shapeActivitySeries(
  logs: ActivityLogRow[],
  from: string,
  to: string,
): ActivitySeriesPoint[] {
  if (to < from) return [];

  const logByDate = new Map(logs.map((log) => [log.date, log]));
  const daily: ActivitySeriesPoint[] = iterDateKeys(from, to).map((date) => {
    const log = logByDate.get(date);
    return {
      date,
      value: log?.value ?? 0,
      xpAwarded: log?.xpAwarded ?? 0,
    };
  });

  if (shouldBucketWeekly(from, to)) {
    return bucketSeriesWeekly(
      daily.filter((point) => point.value > 0 || point.xpAwarded !== 0),
    );
  }

  return daily.filter((point) => point.value > 0 || point.xpAwarded !== 0);
}

export function shapeActivityCompletion(
  logs: ActivityLogRow[],
  from: string,
  to: string,
  todayKey: string,
): ActivityCompletionResult {
  if (to < from) {
    return { rateByWeek: [], streak: 0, days: [] };
  }

  const logByDate = new Map(logs.map((log) => [log.date, log]));
  const days = iterDateKeys(from, to).map((date) => ({
    date,
    state: getCompletionDayState(logByDate.get(date), date, todayKey),
  }));

  return {
    rateByWeek: computeWeeklyCompletionRates(days),
    streak: computePerActivityStreak(days),
    days,
  };
}

function bucketLeaderboardWeekly(
  points: { date: string; xp: number }[],
  metric: LeaderboardSeriesMetric,
): { date: string; xp: number }[] {
  if (metric === 'cumulative') {
    const byWeek = new Map<string, number>();
    for (const point of points) {
      const weekStart = getIsoWeekStart(point.date);
      byWeek.set(weekStart, point.xp);
    }
    return [...byWeek.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, xp]) => ({ date, xp }));
  }

  const byWeek = new Map<string, number>();
  for (const point of points) {
    const weekStart = getIsoWeekStart(point.date);
    byWeek.set(weekStart, (byWeek.get(weekStart) ?? 0) + point.xp);
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, xp]) => ({ date, xp }));
}

export function shapeLeaderboardMemberSeries(
  dayScores: { date: string; netXp: number }[],
  from: string,
  to: string,
  metric: LeaderboardSeriesMetric,
): { date: string; xp: number }[] {
  if (to < from) return [];

  const scoreByDate = new Map(
    dayScores.map((score) => [score.date, score.netXp]),
  );
  const sortedDates = iterDateKeys(from, to);
  let running = 0;
  const points: { date: string; xp: number }[] = [];

  for (const date of sortedDates) {
    const dailyXp = scoreByDate.get(date) ?? 0;
    running += dailyXp;
    points.push({
      date,
      xp: metric === 'cumulative' ? running : dailyXp,
    });
  }

  if (shouldBucketWeekly(from, to)) {
    return bucketLeaderboardWeekly(points, metric);
  }

  return points;
}

export function shapeLeaderboardSeries(
  members: LeaderboardMemberInput[],
  from: string,
  to: string,
  metric: LeaderboardSeriesMetric,
  callerId: string,
): LeaderboardSeriesResult {
  if (to < from) return { members: [] };

  const shaped = members.map((member) => ({
    id: member.id,
    name: member.name,
    isSelf: member.id === callerId,
    points: shapeLeaderboardMemberSeries(member.dayScores, from, to, metric),
  }));

  const caller = shaped.find((member) => member.isSelf);
  const others = shaped
    .filter((member) => !member.isSelf)
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    members: caller ? [caller, ...others] : others,
  };
}

/** Strip sensitive fields — leaderboard series must never expose proof data. */
export function assertLeaderboardSeriesPrivacy(
  payload: LeaderboardSeriesResult,
): void {
  const json = JSON.stringify(payload);
  const forbidden = ['proofUrl', 'proof', 'aiVerdict', 'photo'];
  for (const key of forbidden) {
    if (json.includes(key)) {
      throw new Error(`Leaderboard series leaked forbidden field: ${key}`);
    }
  }
}
