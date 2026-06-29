import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { publicProcedure, protectedProcedure, router } from '../trpc';

const userSelect = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
  timezone: true,
  groupId: true,
} as const;

export const authRouter = router({
  register: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(8),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.user.findUnique({
        where: { email: input.email },
      });

      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Email already registered',
        });
      }

      const passwordHash = await ctx.authService.hashPassword(input.password);
      const timezone = ctx.authService.detectTimezone(ctx.req);

      const user = await ctx.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            name: input.name,
            email: input.email,
            passwordHash,
            timezone,
          },
          select: userSelect,
        });

        await tx.attempt.create({
          data: {
            userId: created.id,
            attemptNumber: 1,
            startDate: new Date(),
            currentDay: 1,
            isActive: true,
          },
        });

        return created;
      });

      const token = ctx.authService.signToken({
        userId: user.id,
        email: user.email,
      });

      return { token, user };
    }),

  login: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { email: input.email },
      });

      if (!user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid email or password',
        });
      }

      const valid = await ctx.authService.verifyPassword(
        input.password,
        user.passwordHash,
      );

      if (!valid) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid email or password',
        });
      }

      const token = ctx.authService.signToken({
        userId: user.id,
        email: user.email,
      });

      return {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatarUrl: user.avatarUrl,
          timezone: user.timezone,
          groupId: user.groupId,
        },
      };
    }),

  logout: protectedProcedure.mutation(async () => {
    return { success: true };
  }),

  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.user.id },
      select: userSelect,
    });

    if (!user) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
    }

    const attempt = await ctx.prisma.attempt.findFirst({
      where: { userId: user.id, isActive: true },
      select: {
        id: true,
        attemptNumber: true,
        currentDay: true,
        startDate: true,
        isActive: true,
        longestStreak: true,
        timesRestarted: true,
      },
    });

    return { user, attempt };
  }),
});
