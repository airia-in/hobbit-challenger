import { z } from 'zod';
import {
  cancelBuddy,
  getBuddyState,
  requestBuddy,
  respondToBuddy,
} from '../../services/buddy.service';
import { protectedProcedure, router } from '../trpc';

export const buddyRouter = router({
  state: protectedProcedure.query(async ({ ctx }) => {
    return getBuddyState(ctx.prisma, ctx.user.id);
  }),

  request: protectedProcedure
    .input(z.object({ addresseeId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return requestBuddy(ctx.prisma, ctx.user.id, input.addresseeId);
    }),

  respond: protectedProcedure
    .input(z.object({ pairId: z.string().min(1), accept: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return respondToBuddy(
        ctx.prisma,
        ctx.user.id,
        input.pairId,
        input.accept,
      );
    }),

  cancel: protectedProcedure.mutation(async ({ ctx }) => {
    return cancelBuddy(ctx.prisma, ctx.user.id);
  }),
});
