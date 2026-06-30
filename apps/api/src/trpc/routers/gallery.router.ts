import { z } from 'zod';
import { listGallery } from '../../services/gallery.service';
import { protectedProcedure, router } from '../trpc';

const filtersSchema = z.object({
  seedKey: z.string().min(1).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const galleryRouter = router({
  list: protectedProcedure
    .input(filtersSchema.optional())
    .query(async ({ ctx, input }) => {
      return listGallery(ctx.prisma, ctx.user.id, input ?? {});
    }),
});
