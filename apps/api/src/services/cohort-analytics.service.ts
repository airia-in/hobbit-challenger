import type { PrismaService } from '../prisma/prisma.service';

/**
 * Read-only cohort/retention aggregations over ProductEvent rows (#148 / #184).
 *
 * Every query is a single bounded statement (no application-side N+1) and leans
 * on the ProductEvent indexes `(eventKey, createdAt)` and `(userId, createdAt)`.
 * Results are aggregate counts/rates only — no per-user rows, no PII.
 */

type RawQueryClient = {
  $queryRawUnsafe: <T = unknown>(
    sql: string,
    ...params: unknown[]
  ) => Promise<T>;
};

export type D7CohortRow = {
  cohort_week_start: string;
  registered: number;
  d7_checkin_users: number;
  d7_checkin_rate_pct: number | null;
};

export type StreakSurvivalRow = {
  streak_day: number;
  users_reached: number;
  base_users: number;
  survival_rate_pct: number | null;
};

export type ReminderLatencyRow = {
  sample_count: number;
  avg_latency_minutes: number | null;
  min_latency_minutes: number | null;
  max_latency_minutes: number | null;
};

export type CohortReport = {
  generatedAt: string;
  d7Cohort: D7CohortRow[];
  streakSurvival: StreakSurvivalRow[];
  reminderLatency: ReminderLatencyRow;
};

/**
 * D7 check-in rate by registration cohort week. Each user's D7 window is
 * anchored on registration time (mirrors docs/guides/product-analytics.md).
 */
export const D7_COHORT_SQL = `
WITH cohorts AS (
  SELECT
    u.id AS user_id,
    u.createdAt AS registered_at,
    date(u.createdAt, 'weekday 1', '-6 days') AS cohort_week_start
  FROM User u
),
d7_checkins AS (
  SELECT DISTINCT c.user_id
  FROM cohorts c
  INNER JOIN ProductEvent pe ON pe.userId = c.user_id
  WHERE pe.eventKey = 'activity.logged'
    AND pe.createdAt >= c.registered_at
    AND pe.createdAt < datetime(c.registered_at, '+7 days')
)
SELECT
  cohort_week_start,
  COUNT(*) AS registered,
  COUNT(d7.user_id) AS d7_checkin_users,
  ROUND(100.0 * COUNT(d7.user_id) / COUNT(*), 1) AS d7_checkin_rate_pct
FROM cohorts c
LEFT JOIN d7_checkins d7 ON d7.user_id = c.user_id
GROUP BY cohort_week_start
ORDER BY cohort_week_start;
`.trim();

/**
 * Streak survival curve. For each threshold N, the share of users who ever
 * finalized a day at `currentStreak >= N`, relative to users who reached >= 1.
 * Reads `day.finalized` metadata.currentStreak (numeric, non-PII).
 */
export const STREAK_SURVIVAL_SQL = `
WITH user_max_streak AS (
  SELECT
    pe.userId AS user_id,
    MAX(CAST(json_extract(pe.metadata, '$.currentStreak') AS INTEGER)) AS max_streak
  FROM ProductEvent pe
  WHERE pe.eventKey = 'day.finalized'
    AND json_extract(pe.metadata, '$.currentStreak') IS NOT NULL
  GROUP BY pe.userId
),
thresholds(streak_day) AS (VALUES (1), (3), (7), (14), (30)),
base AS (
  SELECT COUNT(*) AS n FROM user_max_streak WHERE max_streak >= 1
)
SELECT
  t.streak_day AS streak_day,
  SUM(CASE WHEN ums.max_streak >= t.streak_day THEN 1 ELSE 0 END) AS users_reached,
  (SELECT n FROM base) AS base_users,
  ROUND(
    100.0 * SUM(CASE WHEN ums.max_streak >= t.streak_day THEN 1 ELSE 0 END)
      / NULLIF((SELECT n FROM base), 0),
    1
  ) AS survival_rate_pct
FROM thresholds t
LEFT JOIN user_max_streak ums ON 1 = 1
GROUP BY t.streak_day
ORDER BY t.streak_day;
`.trim();

/**
 * Reminder -> check-in latency. For each `reminder.sent`, the minutes until the
 * same user's next `activity.logged` within 24h, aggregated across all pairs.
 * A single correlated statement (no application N+1).
 */
export const REMINDER_LATENCY_SQL = `
WITH latencies AS (
  SELECT
    (julianday((
      SELECT MIN(al.createdAt)
      FROM ProductEvent al
      WHERE al.userId = r.userId
        AND al.eventKey = 'activity.logged'
        AND al.createdAt > r.createdAt
        AND al.createdAt <= datetime(r.createdAt, '+1 day')
    )) - julianday(r.createdAt)) * 24 * 60 AS latency_minutes
  FROM ProductEvent r
  WHERE r.eventKey = 'reminder.sent'
)
SELECT
  COUNT(latency_minutes) AS sample_count,
  ROUND(AVG(latency_minutes), 1) AS avg_latency_minutes,
  ROUND(MIN(latency_minutes), 1) AS min_latency_minutes,
  ROUND(MAX(latency_minutes), 1) AS max_latency_minutes
FROM latencies
WHERE latency_minutes IS NOT NULL;
`.trim();

const EMPTY_LATENCY: ReminderLatencyRow = {
  sample_count: 0,
  avg_latency_minutes: null,
  min_latency_minutes: null,
  max_latency_minutes: null,
};

export async function queryD7Cohort(
  prisma: RawQueryClient,
): Promise<D7CohortRow[]> {
  return prisma.$queryRawUnsafe<D7CohortRow[]>(D7_COHORT_SQL);
}

export async function queryStreakSurvival(
  prisma: RawQueryClient,
): Promise<StreakSurvivalRow[]> {
  return prisma.$queryRawUnsafe<StreakSurvivalRow[]>(STREAK_SURVIVAL_SQL);
}

export async function queryReminderLatency(
  prisma: RawQueryClient,
): Promise<ReminderLatencyRow> {
  const rows =
    await prisma.$queryRawUnsafe<ReminderLatencyRow[]>(REMINDER_LATENCY_SQL);
  return rows[0] ?? EMPTY_LATENCY;
}

/** Runs all three aggregations for a single admin report payload. */
export async function getCohortReport(
  prisma: PrismaService | RawQueryClient,
): Promise<CohortReport> {
  const client = prisma as RawQueryClient;
  const [d7Cohort, streakSurvival, reminderLatency] = await Promise.all([
    queryD7Cohort(client),
    queryStreakSurvival(client),
    queryReminderLatency(client),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    d7Cohort,
    streakSurvival,
    reminderLatency,
  };
}
