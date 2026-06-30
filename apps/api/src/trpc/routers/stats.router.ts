import { z } from 'zod';
import {
  getActivityCompletion,
  getActivitySeries,
  getDashboardStats,
} from '../../services/stats.service';
import { protectedProcedure, router } from '../trpc';

const dateRangeSchema = z.object({
  activityId: z.string().min(1),
  from: z.coerce.date(),
  to: z.coerce.date(),
});

export const statsRouter = router({
  getDashboard: protectedProcedure.query(async ({ ctx }) => {
    return getDashboardStats(ctx.prisma, ctx.user.id);
  }),

  activitySeries: protectedProcedure
    .input(dateRangeSchema)
    .query(async ({ ctx, input }) => {
      return getActivitySeries(
        ctx.prisma,
        ctx.user.id,
        input.activityId,
        input.from,
        input.to,
      );
    }),

  activityCompletion: protectedProcedure
    .input(dateRangeSchema)
    .query(async ({ ctx, input }) => {
      return getActivityCompletion(
        ctx.prisma,
        ctx.user.id,
        input.activityId,
        input.from,
        input.to,
      );
    }),
});
