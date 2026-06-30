import { z } from 'zod';
import { exportHistoryCsv, listHistory } from '../../services/history.service';
import { LEGACY_TASK_TYPES } from '../../services/tasks.service';
import { protectedProcedure, router } from '../trpc';

const filtersSchema = z.object({
  taskType: z.enum(LEGACY_TASK_TYPES).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

export const historyRouter = router({
  list: protectedProcedure
    .input(filtersSchema.optional())
    .query(async ({ ctx, input }) => {
      return listHistory(ctx.prisma, ctx.user.id, input ?? {});
    }),

  exportCsv: protectedProcedure
    .input(filtersSchema.optional())
    .query(async ({ ctx, input }) => {
      const csv = await exportHistoryCsv(ctx.prisma, ctx.user.id, input ?? {});
      return { csv };
    }),
});
