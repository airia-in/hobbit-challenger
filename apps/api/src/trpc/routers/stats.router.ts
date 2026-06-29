import { getDashboardStats } from '../../services/stats.service';
import { protectedProcedure, router } from '../trpc';

export const statsRouter = router({
  getDashboard: protectedProcedure.query(async ({ ctx }) => {
    return getDashboardStats(ctx.prisma, ctx.user.id);
  }),
});
