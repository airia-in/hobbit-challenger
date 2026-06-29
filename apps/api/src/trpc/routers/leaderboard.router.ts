import { z } from 'zod';
import { getLeaderboard } from '../../services/leaderboard.service';
import { protectedProcedure, router } from '../trpc';

const sortBySchema = z.enum(['day', 'successRate', 'streak', 'name']);

export const leaderboardRouter = router({
  get: protectedProcedure
    .input(z.object({ sortBy: sortBySchema.optional() }).optional())
    .query(async ({ ctx, input }) => {
      return getLeaderboard(ctx.prisma, ctx.user.id, input?.sortBy ?? 'day');
    }),
});
