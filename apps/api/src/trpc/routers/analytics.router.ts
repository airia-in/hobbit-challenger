import {
  getCohortReport,
  queryD7Cohort,
  queryReminderLatency,
  queryStreakSurvival,
} from '../../services/cohort-analytics.service';
import { adminProcedure, router } from '../trpc';

/**
 * Admin-gated, read-only product analytics (issue #184). All procedures require
 * the shared analytics admin token (see adminProcedure). Responses are aggregate
 * cohort/retention metrics only — no per-user rows, no PII.
 */
export const analyticsRouter = router({
  /** D7 check-in rate by registration cohort week. */
  d7Cohort: adminProcedure.query(async ({ ctx }) => {
    return queryD7Cohort(ctx.prisma);
  }),

  /** Streak survival curve (share of users reaching each streak threshold). */
  streakSurvival: adminProcedure.query(async ({ ctx }) => {
    return queryStreakSurvival(ctx.prisma);
  }),

  /** Reminder -> next check-in latency (minutes) aggregated across users. */
  reminderLatency: adminProcedure.query(async ({ ctx }) => {
    return queryReminderLatency(ctx.prisma);
  }),

  /** Combined report bundling all three aggregations. */
  report: adminProcedure.query(async ({ ctx }) => {
    return getCohortReport(ctx.prisma);
  }),
});
