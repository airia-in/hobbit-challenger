import { TRPCError } from '@trpc/server';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuthService } from './auth.service';

export type ProfileData = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  timezone: string;
  reminderTime: string | null;
  groupId: string | null;
  groupName: string | null;
  isGroupAdmin: boolean;
};

export async function getProfile(
  prisma: PrismaService,
  userId: string,
): Promise<ProfileData> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { group: { select: { id: true, name: true, adminUserId: true } } },
  });

  if (!user) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    timezone: user.timezone,
    reminderTime: user.reminderTime,
    groupId: user.groupId,
    groupName: user.group?.name ?? null,
    isGroupAdmin: user.group?.adminUserId === userId,
  };
}

export async function updateProfile(
  prisma: PrismaService,
  authService: AuthService,
  userId: string,
  input: { name?: string; password?: string; reminderTime?: string | null },
) {
  const data: { name?: string; passwordHash?: string; reminderTime?: string | null } = {};

  if (input.name !== undefined) {
    if (input.name.trim().length === 0) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Name cannot be empty' });
    }
    data.name = input.name.trim();
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
    if (input.reminderTime !== null && !/^\d{2}:\d{2}$/.test(input.reminderTime)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Reminder time must be HH:MM format',
      });
    }
    data.reminderTime = input.reminderTime;
  }

  if (Object.keys(data).length === 0) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'No fields to update' });
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
      timezone: true,
      reminderTime: true,
      groupId: true,
    },
  });

  return user;
}

export async function leaveGroup(prisma: PrismaService, userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      group: true,
      attempts: { where: { isActive: true }, take: 1 },
    },
  });

  if (!user) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
  }

  if (!user.groupId) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'You are not in a group' });
  }

  if (user.group?.adminUserId === userId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Transfer admin before leaving the group',
    });
  }

  await prisma.$transaction(async (tx) => {
    const activeAttempt = user.attempts[0];
    if (activeAttempt) {
      await tx.attempt.update({
        where: { id: activeAttempt.id },
        data: { isActive: false, endDate: new Date() },
      });
    }

    await tx.user.update({
      where: { id: userId },
      data: { groupId: null },
    });
  });

  return { success: true };
}
