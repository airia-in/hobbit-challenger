import { z } from 'zod';
import { TaskType } from '@workspace-starter/db';
import { protectedProcedure, router } from '../trpc';

const taskTypeSchema = z.nativeEnum(TaskType);

const proofInputSchema = z.object({
  proofUrl: z.string().optional(),
  proofNotes: z.string().optional(),
  bookTitle: z.string().optional(),
  pageFrom: z.number().int().optional(),
  pageTo: z.number().int().optional(),
  dietConfirmed: z.boolean().optional(),
});

export const tasksRouter = router({
  getToday: protectedProcedure.query(async ({ ctx }) => {
    return ctx.tasksService.getTodayTasks(ctx.prisma, ctx.user.id);
  }),

  submit: protectedProcedure
    .input(
      proofInputSchema.extend({
        taskType: taskTypeSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.tasksService.submitTask(ctx.prisma, ctx.user.id, input);
    }),

  updateProof: protectedProcedure
    .input(
      proofInputSchema.extend({
        taskLogId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { taskLogId, ...proof } = input;
      return ctx.tasksService.updateProof(
        ctx.prisma,
        ctx.user.id,
        taskLogId,
        proof,
      );
    }),
});
