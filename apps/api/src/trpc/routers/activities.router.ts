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

const localDateKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');

const optionalDateInputSchema = z.object({
  date: localDateKeySchema.optional(),
});

const mutationDateInputSchema = z.object({
  activityId: z.string().min(1),
  date: localDateKeySchema.optional(),
});

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
  getToday: protectedProcedure
    .input(optionalDateInputSchema.optional())
    .query(async ({ ctx, input }) => {
      return ctx.activitiesService.getToday(
        ctx.prisma,
        ctx.user.id,
        input?.date,
      );
    }),

  markActivity: protectedProcedure
    .input(mutationDateInputSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.activitiesService.markActivity(
        ctx.prisma,
        ctx.user.id,
        input.activityId,
        input.date,
      );
    }),

  logNumber: protectedProcedure
    .input(
      mutationDateInputSchema.extend({
        value: z.number().finite().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.activitiesService.logNumber(
        ctx.prisma,
        ctx.user.id,
        input.activityId,
        input.value,
        input.date,
      );
    }),

  setSubPoints: protectedProcedure
    .input(
      mutationDateInputSchema.extend({
        states: z.record(z.string(), activityLogStateSchema),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.activitiesService.setSubPoints(
        ctx.prisma,
        ctx.user.id,
        input.activityId,
        input.states,
        input.date,
      );
    }),

  setTier: protectedProcedure
    .input(
      mutationDateInputSchema.extend({
        tier: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.activitiesService.setTier(
        ctx.prisma,
        ctx.user.id,
        input.activityId,
        input.tier,
        input.date,
      );
    }),

  undoActivity: protectedProcedure
    .input(mutationDateInputSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.activitiesService.undoActivity(
        ctx.prisma,
        ctx.user.id,
        input.activityId,
        input.date,
      );
    }),

  attachProof: protectedProcedure
    .input(
      mutationDateInputSchema.extend({
        // Only paths from our /api/uploads endpoint; blocks SSRF, data URIs, and .. traversal.
        proofUrl: z
          .string()
          .regex(
            /^\/uploads\/[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/,
            'proofUrl must be an uploaded file path',
          ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.activitiesService.attachProof(
        ctx.prisma,
        ctx.user.id,
        input.activityId,
        input.proofUrl,
        input.date,
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
