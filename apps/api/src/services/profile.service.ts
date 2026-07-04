import { TRPCError } from '@trpc/server';
import { Prisma } from '@workspace-starter/db';
import { normalizePhone, PhoneValidationError } from '../auth/phone';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuthService } from './auth.service';
import { activeChallengeRelationArgs } from '../utils/challenge-query';
import {
  getUserLocalDate,
  isValidTimeZone,
  isValidWallClockHHMM,
} from '../utils/day-window';
import {
  getGroupAdminUserIds,
  getReplacementAdminId,
} from '../utils/group-admin';
import { cancelBuddyPairsForUser } from './buddy.service';
import {
  HABIT_ANCHOR_TEXT_MAX_LENGTH,
  sanitizeUserPromptText,
  USER_NAME_MAX_LENGTH,
} from '../utils/sanitize-prompt-input';

export type ProfileData = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  timezone: string;
  reminderTime: string | null;
  habitAnchorText: string | null;
  habitAnchorTime: string | null;
  whatsappOptIn: boolean;
  weeklyRecapOptIn: boolean;
  reminderAdaptive: boolean;
  needsPhoneMigration: boolean;
  groupId: string | null;
  groupName: string | null;
  isGroupAdmin: boolean;
  groupMemberCount: number;
  groupAdminCount: number;
};

const PROMOTE_ANOTHER_ADMIN_MESSAGE =
  'Promote another admin before leaving the group';

export async function getProfile(
  prisma: PrismaService,
  userId: string,
): Promise<ProfileData> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      group: {
        select: {
          id: true,
          name: true,
          adminUserId: true,
          admins: {
            select: { userId: true },
            orderBy: { createdAt: 'asc' },
          },
          _count: {
            select: { members: true },
          },
        },
      },
    },
  });

  if (!user) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
  }

  const adminUserIds = user.group
    ? user.group.admins.length > 0
      ? user.group.admins.map((admin) => admin.userId)
      : [user.group.adminUserId]
    : [];

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    timezone: user.timezone,
    reminderTime: user.reminderTime,
    habitAnchorText: user.habitAnchorText,
    habitAnchorTime: user.habitAnchorTime,
    whatsappOptIn: user.whatsappOptIn,
    weeklyRecapOptIn: user.weeklyRecapOptIn,
    reminderAdaptive: user.reminderAdaptive,
    needsPhoneMigration:
      user.phone === null && (user.email !== null || user.whatsappOptIn),
    groupId: user.groupId,
    groupName: user.group?.name ?? null,
    isGroupAdmin: adminUserIds.includes(userId),
    groupMemberCount: user.group?._count.members ?? 0,
    groupAdminCount: adminUserIds.length,
  };
}

const UPLOAD_PATH_PATTERN = /^\/uploads\/[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/;

export type UpdateProfileInput = {
  name?: string;
  password?: string;
  reminderTime?: string | null;
  habitAnchorText?: string | null;
  habitAnchorTime?: string | null;
  whatsappOptIn?: boolean;
  weeklyRecapOptIn?: boolean;
  reminderAdaptive?: boolean;
  phone?: string;
  email?: string;
  timezone?: string;
  avatarUrl?: string | null;
};

export async function updateProfile(
  prisma: PrismaService,
  authService: AuthService,
  userId: string,
  input: UpdateProfileInput,
) {
  const data: {
    name?: string;
    passwordHash?: string;
    reminderTime?: string | null;
    habitAnchorText?: string | null;
    habitAnchorTime?: string | null;
    whatsappOptIn?: boolean;
    weeklyRecapOptIn?: boolean;
    reminderAdaptive?: boolean;
    phone?: string;
    email?: string;
    timezone?: string;
    avatarUrl?: string | null;
  } = {};

  if (input.name !== undefined) {
    if (input.name.trim().length === 0) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Name cannot be empty',
      });
    }
    const sanitizedName = sanitizeUserPromptText(
      input.name.trim(),
      USER_NAME_MAX_LENGTH,
    );
    if (sanitizedName.length === 0) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Name cannot be empty',
      });
    }
    data.name = sanitizedName;
  }

  if (input.password !== undefined) {
    if (input.password.length < 8) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Password must be at least 8 characters',
      });
    }
    data.passwordHash = await authService.hashPassword(input.password);
  }

  if (input.reminderTime !== undefined) {
    if (
      input.reminderTime !== null &&
      !isValidWallClockHHMM(input.reminderTime)
    ) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Reminder time must be HH:MM format',
      });
    }
    data.reminderTime = input.reminderTime;
  }

  if (input.habitAnchorText !== undefined) {
    if (input.habitAnchorText === null || input.habitAnchorText.trim() === '') {
      data.habitAnchorText = null;
    } else {
      const raw = input.habitAnchorText.trim();
      if (raw.length > HABIT_ANCHOR_TEXT_MAX_LENGTH) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Habit anchor must be at most ${HABIT_ANCHOR_TEXT_MAX_LENGTH} characters`,
        });
      }
      const trimmed = sanitizeUserPromptText(raw);
      data.habitAnchorText = trimmed.length === 0 ? null : trimmed;
    }
  }

  if (input.habitAnchorTime !== undefined) {
    if (
      input.habitAnchorTime !== null &&
      input.habitAnchorTime !== '' &&
      !isValidWallClockHHMM(input.habitAnchorTime)
    ) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Habit anchor time must be HH:MM format',
      });
    }
    data.habitAnchorTime =
      input.habitAnchorTime === null || input.habitAnchorTime === ''
        ? null
        : input.habitAnchorTime;
  }

  if (input.phone !== undefined) {
    let normalizedPhone: string;
    try {
      normalizedPhone = normalizePhone(input.phone);
    } catch (error) {
      if (error instanceof PhoneValidationError) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid phone number',
        });
      }
      throw error;
    }

    const existingByPhone = await prisma.user.findUnique({
      where: { phone: normalizedPhone },
    });

    if (existingByPhone && existingByPhone.id !== userId) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'Account already exists',
      });
    }

    data.phone = normalizedPhone;
  }

  if (input.whatsappOptIn !== undefined) {
    if (input.whatsappOptIn) {
      const effectivePhone =
        data.phone ??
        (
          await prisma.user.findUnique({
            where: { id: userId },
            select: { phone: true },
          })
        )?.phone;

      if (!effectivePhone) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Add a phone number before enabling WhatsApp reminders',
        });
      }
    }
    data.whatsappOptIn = input.whatsappOptIn;
  }

  if (input.weeklyRecapOptIn !== undefined) {
    if (input.weeklyRecapOptIn) {
      const stored = await prisma.user.findUnique({
        where: { id: userId },
        select: { phone: true, whatsappOptIn: true },
      });
      const effectivePhone = data.phone ?? stored?.phone;
      const effectiveWhatsapp =
        data.whatsappOptIn ?? stored?.whatsappOptIn ?? false;

      if (!effectivePhone || !effectiveWhatsapp) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            'Add a phone number and enable WhatsApp reminders before enabling weekly recap',
        });
      }
    }
    data.weeklyRecapOptIn = input.weeklyRecapOptIn;
  }

  if (input.reminderAdaptive !== undefined) {
    if (input.reminderAdaptive) {
      const stored = await prisma.user.findUnique({
        where: { id: userId },
        select: { phone: true, whatsappOptIn: true },
      });
      const effectivePhone = data.phone ?? stored?.phone;
      const effectiveWhatsapp =
        data.whatsappOptIn ?? stored?.whatsappOptIn ?? false;

      if (!effectivePhone || !effectiveWhatsapp) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            'Add a phone number and enable WhatsApp reminders before enabling adaptive timing',
        });
      }
    }
    data.reminderAdaptive = input.reminderAdaptive;
  }

  if (input.email !== undefined) {
    const existingByEmail = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existingByEmail && existingByEmail.id !== userId) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'Account already exists',
      });
    }

    data.email = input.email;
  }

  if (input.timezone !== undefined) {
    if (!isValidTimeZone(input.timezone)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Invalid timezone',
      });
    }
    data.timezone = input.timezone;
  }

  if (input.avatarUrl !== undefined) {
    if (input.avatarUrl === null || input.avatarUrl === '') {
      data.avatarUrl = null;
    } else if (!UPLOAD_PATH_PATTERN.test(input.avatarUrl)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Invalid avatar URL',
      });
    } else {
      data.avatarUrl = input.avatarUrl;
    }
  }

  if (Object.keys(data).length === 0) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'No fields to update',
    });
  }

  const select = {
    id: true,
    name: true,
    email: true,
    phone: true,
    avatarUrl: true,
    timezone: true,
    reminderTime: true,
    habitAnchorText: true,
    habitAnchorTime: true,
    whatsappOptIn: true,
    weeklyRecapOptIn: true,
    reminderAdaptive: true,
    groupId: true,
  } as const;

  const nextTimezone = data.timezone;
  if (nextTimezone !== undefined) {
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      include: { challenges: activeChallengeRelationArgs() },
    });

    if (!existingUser) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
    }

    if (existingUser.timezone !== nextTimezone) {
      return prisma.$transaction(async (tx) => {
        await rekeyCurrentDayForTimezoneChange(tx, {
          userId,
          challengeId: existingUser.challenges[0]?.id ?? null,
          oldTimezone: existingUser.timezone,
          newTimezone: nextTimezone,
        });

        return tx.user.update({
          where: { id: userId },
          data,
          select,
        });
      });
    }
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select,
  });

  return user;
}

type RekeyPrisma = Pick<PrismaService, 'activityLog' | 'dayScore'>;

export async function rekeyCurrentDayForTimezoneChange(
  prisma: RekeyPrisma,
  {
    userId,
    challengeId,
    oldTimezone,
    newTimezone,
    now = new Date(),
  }: {
    userId: string;
    challengeId: string | null;
    oldTimezone: string;
    newTimezone: string;
    now?: Date;
  },
): Promise<void> {
  if (!challengeId || oldTimezone === newTimezone) {
    return;
  }

  const oldDate = getUserLocalDate(oldTimezone, now);
  const newDate = getUserLocalDate(newTimezone, now);
  if (oldDate.getTime() === newDate.getTime()) {
    return;
  }

  // Preserve the existing UTC-midnight storage model by moving only the active,
  // unfinalized local day. Historical finalized days keep their original keys.
  const logs = await prisma.activityLog.findMany({
    where: { challengeId, userId, date: oldDate },
  });

  for (const log of logs) {
    const existingAtNewDate = await prisma.activityLog.findUnique({
      where: {
        challengeId_activityId_date: {
          challengeId,
          activityId: log.activityId,
          date: newDate,
        },
      },
    });

    if (!existingAtNewDate) {
      await prisma.activityLog.update({
        where: { id: log.id },
        data: { date: newDate },
      });
      continue;
    }

    if (isMoreCompleteActivityLog(log, existingAtNewDate)) {
      await prisma.activityLog.update({
        where: { id: existingAtNewDate.id },
        data: {
          value: log.value,
          tier: log.tier,
          subPoints: log.subPoints === null ? Prisma.DbNull : log.subPoints,
          state: log.state,
          xpAwarded: log.xpAwarded,
          proofUrl: log.proofUrl,
          aiVerdict: log.aiVerdict,
        },
      });
    }

    await prisma.activityLog.delete({ where: { id: log.id } });
  }

  const dayScore = await prisma.dayScore.findFirst({
    where: { challengeId, userId, date: oldDate, finalized: false },
  });
  if (!dayScore) {
    return;
  }

  const existingScoreAtNewDate = await prisma.dayScore.findUnique({
    where: {
      challengeId_date: {
        challengeId,
        date: newDate,
      },
    },
  });

  if (!existingScoreAtNewDate) {
    await prisma.dayScore.update({
      where: { id: dayScore.id },
      data: { date: newDate },
    });
    return;
  }

  if (!existingScoreAtNewDate.finalized) {
    await prisma.dayScore.update({
      where: { id: existingScoreAtNewDate.id },
      data: {
        dayNumber: dayScore.dayNumber,
        xpEarned: dayScore.xpEarned,
        xpDeducted: dayScore.xpDeducted,
        netXp: dayScore.netXp,
        personalXp: dayScore.personalXp,
        breakdown:
          dayScore.breakdown === null ? Prisma.JsonNull : dayScore.breakdown,
        finalized: false,
      },
    });
  }

  await prisma.dayScore.delete({ where: { id: dayScore.id } });
}

function isMoreCompleteActivityLog(
  candidate: {
    value: number | null;
    tier: string | null;
    subPoints: unknown;
    state: string | null;
    proofUrl: string | null;
    aiVerdict: string | null;
  },
  current: {
    value: number | null;
    tier: string | null;
    subPoints: unknown;
    state: string | null;
    proofUrl: string | null;
    aiVerdict: string | null;
  },
): boolean {
  return activityLogCompleteness(candidate) > activityLogCompleteness(current);
}

function activityLogCompleteness(log: {
  value: number | null;
  tier: string | null;
  subPoints: unknown;
  state: string | null;
  proofUrl: string | null;
  aiVerdict: string | null;
}): number {
  return [
    log.value,
    log.tier,
    log.subPoints,
    log.state,
    log.proofUrl,
    log.aiVerdict,
  ].filter((value) => value !== null && value !== undefined).length;
}

export async function leaveGroup(prisma: PrismaService, userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      group: true,
      challenges: activeChallengeRelationArgs(),
    },
  });

  if (!user) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
  }

  if (!user.groupId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'You are not in a group',
    });
  }

  const adminUserIds = await getGroupAdminUserIds(
    prisma,
    user.groupId,
    user.group?.adminUserId,
  );
  const isAdmin = adminUserIds.includes(userId);
  const isLastAdmin = isAdmin && adminUserIds.length <= 1;
  const groupMemberCount = await prisma.user.count({
    where: { groupId: user.groupId },
  });

  if (isLastAdmin && groupMemberCount > 1) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: PROMOTE_ANOTHER_ADMIN_MESSAGE,
    });
  }

  if (isLastAdmin) {
    await prisma.$transaction(async (tx) => {
      const transactionMemberCount = await tx.user.count({
        where: { groupId: user.groupId! },
      });

      if (transactionMemberCount > 1) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: PROMOTE_ANOTHER_ADMIN_MESSAGE,
        });
      }

      const activeChallenge = user.challenges[0];
      if (activeChallenge) {
        await tx.challenge.update({
          where: { id: activeChallenge.id },
          data: { isActive: false, stoppedAt: new Date() },
        });
      }

      await tx.user.update({
        where: { id: userId },
        data: { groupId: null },
      });

      await cancelBuddyPairsForUser(tx, userId);

      await tx.dayLabel.deleteMany({
        where: { groupId: user.groupId! },
      });

      await tx.group.delete({
        where: { id: user.groupId! },
      });
    });

    return { success: true, dissolved: true };
  }

  const replacementAdminId = isAdmin
    ? (adminUserIds.find((adminId) => adminId !== userId) ??
      (await getReplacementAdminId(prisma, user.groupId, userId)))
    : null;

  await prisma.$transaction(async (tx) => {
    if (isAdmin) {
      await tx.groupAdmin.deleteMany({
        where: {
          groupId: user.groupId!,
          userId,
        },
      });

      if (replacementAdminId && user.group?.adminUserId === userId) {
        await tx.group.update({
          where: { id: user.groupId! },
          data: { adminUserId: replacementAdminId },
        });
      }
    }

    const activeChallenge = user.challenges[0];
    if (activeChallenge) {
      await tx.challenge.update({
        where: { id: activeChallenge.id },
        data: { isActive: false, stoppedAt: new Date() },
      });
    }

    await tx.user.update({
      where: { id: userId },
      data: { groupId: null },
    });

    await cancelBuddyPairsForUser(tx, userId);
  });

  return { success: true };
}
