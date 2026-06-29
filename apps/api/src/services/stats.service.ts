import { TRPCError } from '@trpc/server';
import type { PrismaService } from '../prisma/prisma.service';
import { addLocalDays, getUserLocalDate } from '../utils/day-window';

export type DashboardStats = {
  currentStreak: number;
  longestStreak: number;
  totalDaysCompleted: number;
  successRate: number;
  timesRestarted: number;
  yesterdayFailed: boolean;
  currentDay: number;
  startDate: Date | null;
  estimatedFinishDate: Date | null;
};

export async function getDashboardStats(
  prisma: PrismaService,
  userId: string,
): Promise<DashboardStats> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
  }

  const attempt = await prisma.attempt.findFirst({
    where: { userId, isActive: true },
  });

  const allDayResults = await prisma.dayResult.findMany({
    where: { attempt: { userId } },
    select: { completed: true },
  });

  const totalDaysCompleted = allDayResults.filter(
    (day) => day.completed,
  ).length;
  const totalDaysEvaluated = allDayResults.length;
  const successRate =
    totalDaysEvaluated > 0
      ? Math.round((totalDaysCompleted / totalDaysEvaluated) * 100)
      : 0;

  const yesterdayDate = addLocalDays(
    getUserLocalDate(user.timezone),
    -1,
    user.timezone,
  );
  const yesterdayResult = attempt
    ? await prisma.dayResult.findFirst({
        where: {
          attemptId: attempt.id,
          date: yesterdayDate,
        },
      })
    : null;

  const yesterdayFailed = yesterdayResult?.completed === false;

  const currentStreak = attempt ? Math.max(0, attempt.currentDay - 1) : 0;
  const daysRemaining = attempt
    ? Math.max(0, 75 - (attempt.currentDay - 1))
    : 75;
  const estimatedFinishDate =
    attempt && daysRemaining > 0
      ? addLocalDays(
          getUserLocalDate(user.timezone),
          daysRemaining,
          user.timezone,
        )
      : attempt && attempt.currentDay > 75
        ? getUserLocalDate(user.timezone)
        : null;

  return {
    currentStreak,
    longestStreak: attempt?.longestStreak ?? 0,
    totalDaysCompleted,
    successRate,
    timesRestarted: attempt?.timesRestarted ?? 0,
    yesterdayFailed,
    currentDay: attempt?.currentDay ?? 1,
    startDate: attempt?.startDate ?? null,
    estimatedFinishDate,
  };
}
