import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import {
  seedGroupActivities,
  deactivateSoloActivities,
} from '@workspace-starter/db';
import { z } from 'zod';
import { latestChallengeRelationArgs } from '../../utils/challenge-query';
import {
  MAX_CHALLENGE_RANGE_DAYS,
  buildChallengeRange,
  buildCurrentIsoWeekChallengeRange,
  buildDefaultChallengeRange,
  deriveChallengeProgress,
  lengthDaysFromRange,
} from '../../utils/challenge-range';
import { buildInviteUrl } from '../../utils/invite-url';
import {
  getGroupAdminUserIds,
  getReplacementAdminId,
  requireGroupAdmin,
} from '../../utils/group-admin';
import { getMemberStatus } from '../../utils/member-status';
import { publicProcedure, protectedProcedure, router } from '../trpc';

const challengeRangeInput = z
  .object({
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    timezone: z.string().min(1).optional(),
  })
  .refine((input) => input.startDate <= input.endDate, {
    message: 'Start date must be before or equal to end date',
    path: ['endDate'],
  });

function ensureRangeWithinLimit(lengthDays: number) {
  if (lengthDays > MAX_CHALLENGE_RANGE_DAYS) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Challenge range cannot exceed ${MAX_CHALLENGE_RANGE_DAYS} days`,
    });
  }
}

export { requireGroupAdmin };

export const groupsRouter = router({
  create: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.user.id },
      });

      if (!user) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      }

      if (user.groupId) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'You already belong to a group',
        });
      }

      const inviteToken = randomUUID();
      const timezone = user.timezone;
      const range = buildDefaultChallengeRange(timezone);

      const group = await ctx.prisma.$transaction(async (tx) => {
        const created = await tx.group.create({
          data: {
            name: input.name,
            inviteToken,
            adminUserId: ctx.user.id,
            challengeStartDate: range.startDate,
            challengeEndDate: range.endDate,
            challengeTimezone: timezone,
          },
        });

        await tx.groupAdmin.create({
          data: {
            groupId: created.id,
            userId: ctx.user.id,
          },
        });

        await tx.user.update({
          where: { id: ctx.user.id },
          data: { groupId: created.id },
        });

        await seedGroupActivities(tx, created.id);
        await deactivateSoloActivities(tx, ctx.user.id);

        const activeChallenge = await tx.challenge.findFirst({
          where: { userId: ctx.user.id, isActive: true },
          orderBy: { startDate: 'desc' },
        });
        if (activeChallenge) {
          await tx.challenge.update({
            where: { id: activeChallenge.id },
            data: {
              groupId: created.id,
              startDate: range.startDate,
              endDate: range.endDate,
              lengthDays: range.lengthDays,
              currentDay: range.currentDay,
              stoppedAt: null,
            },
          });
        } else {
          await tx.challenge.create({
            data: {
              userId: ctx.user.id,
              groupId: created.id,
              startDate: range.startDate,
              endDate: range.endDate,
              lengthDays: range.lengthDays,
              currentDay: range.currentDay,
              isActive: true,
            },
          });
        }

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
        admins: {
          select: { userId: true },
          orderBy: { createdAt: 'asc' },
        },
        members: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            challenges: latestChallengeRelationArgs(),
          },
        },
      },
    });

    if (!group) {
      return null;
    }

    const adminUserIds =
      group.admins.length > 0
        ? group.admins.map((admin) => admin.userId)
        : [group.adminUserId];
    const adminUserIdSet = new Set(adminUserIds);
    const members = group.members.map((member) => {
      const challenge = member.challenges[0] ?? null;
      const progress = challenge
        ? deriveChallengeProgress(
            challenge,
            group.challengeTimezone ?? user.timezone,
          )
        : null;
      return {
        id: member.id,
        name: member.name,
        avatarUrl: member.avatarUrl,
        isSelf: member.id === ctx.user.id,
        isAdmin: adminUserIdSet.has(member.id),
        currentDay: progress?.currentDay ?? 0,
        status: getMemberStatus(
          challenge,
          group.challengeTimezone ?? user.timezone,
        ),
      };
    });

    const challengeRange =
      group.challengeStartDate && group.challengeEndDate
        ? {
            startDate: group.challengeStartDate,
            endDate: group.challengeEndDate,
            timezone: group.challengeTimezone ?? user.timezone,
            lengthDays: lengthDaysFromRange(
              group.challengeStartDate,
              group.challengeEndDate,
              group.challengeTimezone ?? user.timezone,
            ),
          }
        : null;

    return {
      id: group.id,
      name: group.name,
      inviteToken: group.inviteToken,
      adminUserId: group.adminUserId,
      adminUserIds,
      adminCount: adminUserIds.length,
      isAdmin: adminUserIdSet.has(ctx.user.id),
      inviteUrl: buildInviteUrl(ctx.req, group.inviteToken),
      challengeRange,
      members,
    };
  }),

  getChallengeRange: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.user.id },
      include: { group: true },
    });

    if (!user?.groupId || !user.group) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'No group found' });
    }

    const timezone = user.group.challengeTimezone ?? user.timezone;
    const range =
      user.group.challengeStartDate && user.group.challengeEndDate
        ? buildChallengeRange(
            user.group.challengeStartDate,
            user.group.challengeEndDate,
            timezone,
          )
        : buildDefaultChallengeRange(timezone);

    return { ...range, timezone };
  }),

  setChallengeRange: protectedProcedure
    .input(challengeRangeInput)
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.user.id },
      });

      if (!user?.groupId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No group found' });
      }

      const groupId = user.groupId;
      await requireGroupAdmin(ctx.prisma, ctx.user.id, groupId);

      const timezone = input.timezone ?? user.timezone;
      const range = buildChallengeRange(
        input.startDate,
        input.endDate,
        timezone,
      );
      ensureRangeWithinLimit(range.lengthDays);

      await ctx.prisma.$transaction(async (tx) => {
        await tx.group.update({
          where: { id: groupId },
          data: {
            challengeStartDate: range.startDate,
            challengeEndDate: range.endDate,
            challengeTimezone: timezone,
          },
        });

        const members = await tx.user.findMany({
          where: { groupId },
          select: {
            id: true,
            challenges: {
              where: { isActive: true },
              orderBy: { startDate: 'desc' },
              take: 1,
              select: { id: true },
            },
          },
        });

        for (const member of members) {
          const activeChallenge = member.challenges[0];
          if (activeChallenge) {
            await tx.challenge.update({
              where: { id: activeChallenge.id },
              data: {
                groupId,
                startDate: range.startDate,
                endDate: range.endDate,
                lengthDays: range.lengthDays,
                currentDay: range.currentDay,
                stoppedAt: null,
              },
            });
          } else {
            await tx.challenge.create({
              data: {
                userId: member.id,
                groupId,
                startDate: range.startDate,
                endDate: range.endDate,
                lengthDays: range.lengthDays,
                currentDay: range.currentDay,
                isActive: true,
              },
            });
          }
        }
      });

      return { ...range, timezone };
    }),

  setChallengeThisWeek: protectedProcedure.mutation(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.user.id },
      include: { group: true },
    });

    if (!user?.groupId || !user.group) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'No group found' });
    }

    const groupId = user.groupId;
    await requireGroupAdmin(ctx.prisma, ctx.user.id, groupId);

    const timezone = user.group.challengeTimezone ?? user.timezone;
    const range = buildCurrentIsoWeekChallengeRange(timezone);

    await ctx.prisma.$transaction(async (tx) => {
      await tx.group.update({
        where: { id: groupId },
        data: {
          challengeStartDate: range.startDate,
          challengeEndDate: range.endDate,
          challengeTimezone: timezone,
        },
      });

      const members = await tx.user.findMany({
        where: { groupId },
        select: {
          id: true,
          challenges: {
            where: { isActive: true },
            orderBy: { startDate: 'desc' },
            take: 1,
            select: { id: true },
          },
        },
      });

      for (const member of members) {
        const activeChallenge = member.challenges[0];
        if (activeChallenge) {
          await tx.challenge.update({
            where: { id: activeChallenge.id },
            data: {
              groupId,
              startDate: range.startDate,
              endDate: range.endDate,
              lengthDays: range.lengthDays,
              currentDay: range.currentDay,
              stoppedAt: null,
            },
          });
        } else {
          await tx.challenge.create({
            data: {
              userId: member.id,
              groupId,
              startDate: range.startDate,
              endDate: range.endDate,
              lengthDays: range.lengthDays,
              currentDay: range.currentDay,
              isActive: true,
            },
          });
        }
      }
    });

    return { ...range, timezone };
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

      if (!user) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      }

      if (user.groupId) {
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

        const activityCount = await tx.activity.count({
          where: { groupId: group.id },
        });
        if (activityCount === 0) {
          await seedGroupActivities(tx, group.id);
        }

        await deactivateSoloActivities(tx, ctx.user.id);

        const existingChallenge = await tx.challenge.findFirst({
          where: { userId: ctx.user.id, isActive: true },
        });

        if (!existingChallenge) {
          const timezone = group.challengeTimezone ?? user.timezone;
          const range =
            group.challengeStartDate && group.challengeEndDate
              ? buildChallengeRange(
                  group.challengeStartDate,
                  group.challengeEndDate,
                  timezone,
                )
              : buildDefaultChallengeRange(timezone);

          await tx.challenge.create({
            data: {
              userId: ctx.user.id,
              groupId: group.id,
              startDate: range.startDate,
              endDate: range.endDate,
              currentDay: range.currentDay,
              isActive: true,
              lengthDays: range.lengthDays,
            },
          });
        } else {
          const timezone = group.challengeTimezone ?? user.timezone;
          const range =
            group.challengeStartDate && group.challengeEndDate
              ? buildChallengeRange(
                  group.challengeStartDate,
                  group.challengeEndDate,
                  timezone,
                )
              : deriveChallengeProgress(existingChallenge, timezone);

          await tx.challenge.update({
            where: { id: existingChallenge.id },
            data: {
              groupId: group.id,
              startDate:
                group.challengeStartDate ?? existingChallenge.startDate,
              endDate: range.endDate,
              lengthDays: range.lengthDays,
              currentDay: range.currentDay,
              stoppedAt: null,
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

      const groupId = user.groupId;
      const group = await requireGroupAdmin(ctx.prisma, ctx.user.id, groupId);

      if (input.userId === ctx.user.id) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Use profile settings to leave the group',
        });
      }

      const member = await ctx.prisma.user.findFirst({
        where: { id: input.userId, groupId },
        include: {
          challenges: {
            where: { isActive: true },
            orderBy: { startDate: 'desc' },
            take: 1,
          },
        },
      });

      if (!member) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Member not found' });
      }

      const adminUserIds = await getGroupAdminUserIds(
        ctx.prisma,
        groupId,
        group.adminUserId,
      );
      const targetIsAdmin = adminUserIds.includes(input.userId);
      if (targetIsAdmin && adminUserIds.length <= 1) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot remove the last admin',
        });
      }
      const replacementAdminId = targetIsAdmin
        ? (adminUserIds.find((adminId) => adminId !== input.userId) ?? null)
        : null;

      // Mirror leaveGroup: deactivate the member's active challenge so it is not
      // left frozen-but-active (the day finalizer skips users without a group).
      await ctx.prisma.$transaction(async (tx) => {
        if (targetIsAdmin) {
          await tx.groupAdmin.deleteMany({
            where: {
              groupId,
              userId: input.userId,
            },
          });

          if (replacementAdminId && member.id === group.adminUserId) {
            await tx.group.update({
              where: { id: groupId },
              data: { adminUserId: replacementAdminId },
            });
          }
        }

        const activeChallenge = member.challenges[0];
        if (activeChallenge) {
          await tx.challenge.update({
            where: { id: activeChallenge.id },
            data: { isActive: false, stoppedAt: new Date() },
          });
        }

        await tx.user.update({
          where: { id: input.userId },
          data: { groupId: null },
        });
      });

      return { success: true };
    }),

  promoteAdmin: protectedProcedure
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
          message: 'You are already an admin',
        });
      }

      const member = await ctx.prisma.user.findFirst({
        where: { id: input.userId, groupId: user.groupId },
      });

      if (!member) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Member not found' });
      }

      await ctx.prisma.groupAdmin.upsert({
        where: {
          groupId_userId: {
            groupId: user.groupId,
            userId: input.userId,
          },
        },
        create: {
          groupId: user.groupId,
          userId: input.userId,
        },
        update: {},
      });

      return { userId: input.userId };
    }),

  demoteAdmin: protectedProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.user.id },
      });

      if (!user?.groupId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No group found' });
      }

      const group = await requireGroupAdmin(
        ctx.prisma,
        ctx.user.id,
        user.groupId,
      );

      if (input.userId === ctx.user.id) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Ask another admin to remove your admin access',
        });
      }

      const member = await ctx.prisma.user.findFirst({
        where: { id: input.userId, groupId: user.groupId },
      });

      if (!member) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Member not found' });
      }

      const adminUserIds = await getGroupAdminUserIds(
        ctx.prisma,
        user.groupId,
        group.adminUserId,
      );

      if (!adminUserIds.includes(input.userId)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Member is not an admin',
        });
      }

      if (adminUserIds.length <= 1) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot remove the last admin',
        });
      }

      const replacementAdminId =
        adminUserIds.find((adminId) => adminId !== input.userId) ??
        (await getReplacementAdminId(ctx.prisma, user.groupId, input.userId));

      await ctx.prisma.$transaction(async (tx) => {
        await tx.groupAdmin.deleteMany({
          where: {
            groupId: user.groupId!,
            userId: input.userId,
          },
        });

        if (input.userId === group.adminUserId && replacementAdminId) {
          await tx.group.update({
            where: { id: user.groupId! },
            data: { adminUserId: replacementAdminId },
          });
        }
      });

      return { userId: input.userId };
    }),
});
