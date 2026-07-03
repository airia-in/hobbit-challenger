import { z } from 'zod';
import {
  getProfile,
  leaveGroup,
  updateProfile,
} from '../../services/profile.service';
import { protectedProcedure, router } from '../trpc';

export const profileRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    return getProfile(ctx.prisma, ctx.user.id);
  }),

  update: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).optional(),
        password: z.string().min(8).optional(),
        reminderTime: z.string().nullable().optional(),
        habitAnchorText: z.string().nullable().optional(),
        habitAnchorTime: z.string().nullable().optional(),
        whatsappOptIn: z.boolean().optional(),
        weeklyRecapOptIn: z.boolean().optional(),
        reminderAdaptive: z.boolean().optional(),
        phone: z.string().min(1).optional(),
        email: z.string().email().optional(),
        timezone: z.string().optional(),
        avatarUrl: z
          .string()
          .regex(/^\/uploads\/[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/)
          .nullable()
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return updateProfile(ctx.prisma, ctx.authService, ctx.user.id, input);
    }),

  leaveGroup: protectedProcedure.mutation(async ({ ctx }) => {
    return leaveGroup(ctx.prisma, ctx.user.id);
  }),
});
