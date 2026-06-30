import {
  archivePersonalActivityInputSchema,
  createCustomActivityInputSchema,
  setActivityActiveInputSchema,
  updateActivityInputSchema,
} from '@workspace-starter/types';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { protectedProcedure, router } from '../trpc';
import { requireGroupAdmin } from './groups.router';

const activityLogStateSchema = z.enum(['DONE', 'FAILED', 'UNLOGGED']);

async function getCallerGroupId(
  prisma: Parameters<typeof requireGroupAdmin>[0],
  userId: string,
): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.groupId) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'No group found' });
  }
  return user.groupId;
}

export const activitiesRouter = router({
  getToday: protectedProcedure.query(async ({ ctx }) => {
    return ctx.activitiesService.getToday(ctx.prisma, ctx.user.id);
  }),

  markActivity: protectedProcedure
    .input(z.object({ activityId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.activitiesService.markActivity(
        ctx.prisma,
        ctx.user.id,
        input.activityId,
      );
    }),

  logNumber: protectedProcedure
    .input(
      z.object({
        activityId: z.string().min(1),
        value: z.number().finite().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.activitiesService.logNumber(
        ctx.prisma,
        ctx.user.id,
        input.activityId,
        input.value,
      );
    }),

  setSubPoints: protectedProcedure
    .input(
      z.object({
        activityId: z.string().min(1),
        states: z.record(z.string(), activityLogStateSchema),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.activitiesService.setSubPoints(
        ctx.prisma,
        ctx.user.id,
        input.activityId,
        input.states,
      );
    }),

  setTier: protectedProcedure
    .input(
      z.object({
        activityId: z.string().min(1),
        tier: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.activitiesService.setTier(
        ctx.prisma,
        ctx.user.id,
        input.activityId,
        input.tier,
      );
    }),

  undoActivity: protectedProcedure
    .input(z.object({ activityId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.activitiesService.undoActivity(
        ctx.prisma,
        ctx.user.id,
        input.activityId,
      );
    }),

  attachProof: protectedProcedure
    .input(
      z.object({
        activityId: z.string().min(1),
        proofUrl: z.string().url(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.activitiesService.attachProof(
        ctx.prisma,
        ctx.user.id,
        input.activityId,
        input.proofUrl,
      );
    }),

  listGroupActivities: protectedProcedure.query(async ({ ctx }) => {
    const groupId = await getCallerGroupId(ctx.prisma, ctx.user.id);
    await requireGroupAdmin(ctx.prisma, ctx.user.id, groupId);
    return ctx.activitiesService.listGroupActivities(
      ctx.prisma,
      ctx.user.id,
      groupId,
    );
  }),

  createGroupActivity: protectedProcedure
    .input(createCustomActivityInputSchema)
    .mutation(async ({ ctx, input }) => {
      const groupId = await getCallerGroupId(ctx.prisma, ctx.user.id);
      await requireGroupAdmin(ctx.prisma, ctx.user.id, groupId);
      return ctx.activitiesService.createGroupActivity(
        ctx.prisma,
        ctx.user.id,
        groupId,
        input,
      );
    }),

  updateGroupActivity: protectedProcedure
    .input(updateActivityInputSchema)
    .mutation(async ({ ctx, input }) => {
      const groupId = await getCallerGroupId(ctx.prisma, ctx.user.id);
      await requireGroupAdmin(ctx.prisma, ctx.user.id, groupId);
      return ctx.activitiesService.updateGroupActivity(
        ctx.prisma,
        ctx.user.id,
        groupId,
        input,
      );
    }),

  setActive: protectedProcedure
    .input(setActivityActiveInputSchema)
    .mutation(async ({ ctx, input }) => {
      const groupId = await getCallerGroupId(ctx.prisma, ctx.user.id);
      await requireGroupAdmin(ctx.prisma, ctx.user.id, groupId);
      return ctx.activitiesService.setGroupActivityActive(
        ctx.prisma,
        ctx.user.id,
        groupId,
        input,
      );
    }),

  listMyPersonalActivities: protectedProcedure.query(async ({ ctx }) => {
    return ctx.activitiesService.listMyPersonalActivities(
      ctx.prisma,
      ctx.user.id,
    );
  }),

  createPersonalActivity: protectedProcedure
    .input(createCustomActivityInputSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.activitiesService.createPersonalActivity(
        ctx.prisma,
        ctx.user.id,
        input,
      );
    }),

  updatePersonalActivity: protectedProcedure
    .input(updateActivityInputSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.activitiesService.updatePersonalActivity(
        ctx.prisma,
        ctx.user.id,
        input,
      );
    }),

  archivePersonalActivity: protectedProcedure
    .input(archivePersonalActivityInputSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.activitiesService.archivePersonalActivity(
        ctx.prisma,
        ctx.user.id,
        input.activityId,
      );
    }),
});
