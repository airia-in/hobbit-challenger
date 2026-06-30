import { z } from 'zod';
import {
  getLeaderboard,
  getLeaderboardSeries,
} from '../../services/leaderboard.service';
import { protectedProcedure, router } from '../trpc';

const windowSchema = z.enum(['today', 'week', 'total']);
const sortBySchema = z.enum(['xp', 'streak', 'name', 'day', 'successRate']);
const metricSchema = z.enum(['cumulative', 'daily']);

export const leaderboardRouter = router({
  get: protectedProcedure
    .input(
      z
        .object({
          window: windowSchema.default('today'),
          sortBy: sortBySchema.optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      return getLeaderboard(
        ctx.prisma,
        ctx.user.id,
        input?.window ?? 'today',
        input?.sortBy ?? 'xp',
      );
    }),

  series: protectedProcedure
    .input(
      z.object({
        window: windowSchema.default('total'),
        metric: metricSchema.default('cumulative'),
      }),
    )
    .query(async ({ ctx, input }) => {
      return getLeaderboardSeries(
        ctx.prisma,
        ctx.user.id,
        input.window,
        input.metric,
      );
    }),
});
