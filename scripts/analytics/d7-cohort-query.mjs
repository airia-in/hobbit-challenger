/**
 * D7 check-in rate by registration cohort week.
 * Anchors each user's D7 window on registered_at (not cohort_week_start).
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
 * @param {{ $queryRawUnsafe: (sql: string) => Promise<unknown> }} prisma
 */
export async function queryD7CohortRates(prisma) {
  return prisma.$queryRawUnsafe(D7_COHORT_SQL);
}
