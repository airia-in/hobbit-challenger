import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { PrismaService } from '../../prisma/prisma.service';
import { buildInviteUrl } from '../../utils/invite-url';
import { getMemberStatus } from '../../utils/member-status';
import { publicProcedure, protectedProcedure, router } from '../trpc';

async function requireGroupAdmin(
  prisma: PrismaService,
  userId: string,
  groupId: string,
) {
  const group = await prisma.group.findUnique({ where: { id: groupId } });

  if (!group) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Group not found' });
  }

  if (group.adminUserId !== userId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin only' });
  }

  return group;
}

export const groupsRouter = router({
  create: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.user.id },
      });

      if (user?.groupId) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'You already belong to a group',
        });
      }

      const inviteToken = randomUUID();

      const group = await ctx.prisma.$transaction(async (tx) => {
        const created = await tx.group.create({
          data: {
            name: input.name,
            inviteToken,
            adminUserId: ctx.user.id,
          },
        });

        await tx.user.update({
          where: { id: ctx.user.id },
          data: { groupId: created.id },
        });

        return created;
      });

      return {
        group,
        inviteUrl: buildInviteUrl(ctx.req, group.inviteToken),
      };
    }),

  getMine: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.user.id },
    });

    if (!user?.groupId) {
      return null;
    }

    const group = await ctx.prisma.group.findUnique({
      where: { id: user.groupId },
      include: {
        members: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            attempts: {
              where: { isActive: true },
              take: 1,
            },
          },
        },
      },
    });

    if (!group) {
      return null;
    }

    const members = group.members.map((member) => {
      const attempt = member.attempts[0] ?? null;
      return {
        id: member.id,
        name: member.name,
        avatarUrl: member.avatarUrl,
        currentDay: attempt?.currentDay ?? 0,
        status: getMemberStatus(attempt),
      };
    });

    return {
      id: group.id,
      name: group.name,
      inviteToken: group.inviteToken,
      adminUserId: group.adminUserId,
      isAdmin: group.adminUserId === ctx.user.id,
      inviteUrl: buildInviteUrl(ctx.req, group.inviteToken),
      members,
    };
  }),

  previewByToken: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const group = await ctx.prisma.group.findUnique({
        where: { inviteToken: input.token },
        include: { _count: { select: { members: true } } },
      });

      if (!group) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Invalid invite link',
        });
      }

      return {
        name: group.name,
        memberCount: group._count.members,
      };
    }),

  join: protectedProcedure
    .input(z.object({ token: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.user.id },
      });

      if (user?.groupId) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'You already belong to a group',
        });
      }

      const group = await ctx.prisma.group.findUnique({
        where: { inviteToken: input.token },
      });

      if (!group) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Invalid invite link',
        });
      }

      await ctx.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: ctx.user.id },
          data: { groupId: group.id },
        });

        const existingAttempt = await tx.attempt.findFirst({
          where: { userId: ctx.user.id, isActive: true },
        });

        if (!existingAttempt) {
          await tx.attempt.create({
            data: {
              userId: ctx.user.id,
              attemptNumber: 1,
              startDate: new Date(),
              currentDay: 1,
              isActive: true,
            },
          });
        }
      });

      return { groupId: group.id, groupName: group.name };
    }),

  regenerateInvite: protectedProcedure.mutation(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.user.id },
    });

    if (!user?.groupId) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'No group found' });
    }

    await requireGroupAdmin(ctx.prisma, ctx.user.id, user.groupId);

    const newToken = randomUUID();
    const group = await ctx.prisma.group.update({
      where: { id: user.groupId },
      data: { inviteToken: newToken },
    });

    return {
      inviteToken: group.inviteToken,
      inviteUrl: buildInviteUrl(ctx.req, group.inviteToken),
    };
  }),

  removeMember: protectedProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.user.id },
      });

      if (!user?.groupId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No group found' });
      }

      await requireGroupAdmin(ctx.prisma, ctx.user.id, user.groupId);

      if (input.userId === ctx.user.id) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Transfer admin before leaving or use profile settings',
        });
      }

      const member = await ctx.prisma.user.findFirst({
        where: { id: input.userId, groupId: user.groupId },
      });

      if (!member) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Member not found' });
      }

      await ctx.prisma.user.update({
        where: { id: input.userId },
        data: { groupId: null },
      });

      return { success: true };
    }),

  transferAdmin: protectedProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.user.id },
      });

      if (!user?.groupId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No group found' });
      }

      await requireGroupAdmin(ctx.prisma, ctx.user.id, user.groupId);

      if (input.userId === ctx.user.id) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'You are already the admin',
        });
      }

      const member = await ctx.prisma.user.findFirst({
        where: { id: input.userId, groupId: user.groupId },
      });

      if (!member) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Member not found' });
      }

      const group = await ctx.prisma.group.update({
        where: { id: user.groupId },
        data: { adminUserId: input.userId },
      });

      return { adminUserId: group.adminUserId };
    }),
});
