import { TRPCError } from '@trpc/server';
import type { PrismaService } from '../prisma/prisma.service';
import { challengeDisplayOrderBy } from '../utils/challenge-query';
import {
  isInterimDayCompleted,
  isInterimDayFailed,
} from '../utils/day-completion';
import { addLocalDays, getUserLocalDate } from '../utils/day-window';
import { getLiveStreak } from '../utils/live-streak';

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

  const challenge = await prisma.challenge.findFirst({
    where: { userId },
    orderBy: challengeDisplayOrderBy,
  });

  const allDayScores = await prisma.dayScore.findMany({
    where: { challenge: { userId } },
    select: { finalized: true, breakdown: true },
  });

  const finalizedScores = allDayScores.filter((day) => day.finalized);
  const totalDaysCompleted = finalizedScores.filter((day) =>
    isInterimDayCompleted(day),
  ).length;
  const totalDaysEvaluated = finalizedScores.length;
  const successRate =
    totalDaysEvaluated > 0
      ? Math.round((totalDaysCompleted / totalDaysEvaluated) * 100)
      : 0;

  const yesterdayDate = addLocalDays(
    getUserLocalDate(user.timezone),
    -1,
    user.timezone,
  );
  const yesterdayScore = challenge
    ? await prisma.dayScore.findFirst({
        where: {
          challengeId: challenge.id,
          date: yesterdayDate,
        },
        select: { finalized: true, breakdown: true },
      })
    : null;

  const yesterdayFailed = yesterdayScore
    ? isInterimDayFailed(yesterdayScore)
    : false;

  const currentStreak = challenge
    ? await getLiveStreak(prisma, {
        challengeId: challenge.id,
        userId,
        groupId: user.groupId,
        timezone: user.timezone,
        storedStreak: challenge.currentStreak,
      })
    : 0;
  const lengthDays = challenge?.lengthDays ?? 30;
  const daysRemaining = challenge
    ? Math.max(0, lengthDays - (challenge.currentDay - 1))
    : lengthDays;
  const estimatedFinishDate =
    challenge && daysRemaining > 0
      ? addLocalDays(
          getUserLocalDate(user.timezone),
          daysRemaining,
          user.timezone,
        )
      : challenge && challenge.currentDay > lengthDays
        ? getUserLocalDate(user.timezone)
        : null;

  return {
    currentStreak,
    longestStreak: challenge
      ? Math.max(challenge.longestStreak, currentStreak)
      : 0,
    totalDaysCompleted,
    successRate,
    timesRestarted: 0,
    yesterdayFailed,
    currentDay: challenge?.currentDay ?? 1,
    startDate: challenge?.startDate ?? null,
    estimatedFinishDate,
  };
}
