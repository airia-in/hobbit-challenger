import { TRPCError } from '@trpc/server';
import type { DashboardStats as DashboardStatsBase } from '@workspace-starter/types';
import type { Activity } from '@workspace-starter/db';
import type { PrismaService } from '../prisma/prisma.service';
import { challengeDisplayOrderBy } from '../utils/challenge-query';
import {
  DEFAULT_CHALLENGE_WINDOW_DAYS,
  deriveChallengeProgress,
} from '../utils/challenge-range';
import { isInterimDayCompleted } from '../utils/day-completion';
import {
  addLocalDays,
  formatLocalDateKey,
  getUserLocalDate,
} from '../utils/day-window';
import { getLiveStreak } from '../utils/live-streak';
import { computeStreakBreak } from '../utils/streak-break';
import { getUserMilestones } from './milestones.service';
import {
  clampDateRange,
  isCompletionActivityKind,
  shapeActivityCompletion,
  shapeActivitySeries,
  toActivityLogRows,
  type ActivityCompletionResult,
  type ActivitySeriesPoint,
} from '../utils/stats-aggregation';

export type DashboardStats = DashboardStatsBase;

export async function getDashboardStats(
  prisma: PrismaService,
  userId: string,
): Promise<DashboardStats> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { group: { select: { challengeTimezone: true } } },
  });
  if (!user) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
  }

  const todayDate = getUserLocalDate(user.timezone);

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

  let todayNetXp = 0;
  if (challenge) {
    const todayScore = await prisma.dayScore.findFirst({
      where: { challengeId: challenge.id, date: todayDate },
      select: { netXp: true, finalized: true },
    });
    todayNetXp = todayScore?.netXp ?? 0;
  }

  const totalXp = (challenge?.totalXp ?? 0) + todayNetXp;

  const currentStreak = challenge
    ? await getLiveStreak(prisma, {
        challengeId: challenge.id,
        userId,
        groupId: user.groupId,
        timezone: user.timezone,
        storedStreak: challenge.currentStreak,
      })
    : 0;

  const progress = challenge
    ? deriveChallengeProgress(
        challenge,
        user.group?.challengeTimezone ?? user.timezone,
      )
    : null;
  const lengthDays = progress?.lengthDays ?? DEFAULT_CHALLENGE_WINDOW_DAYS;
  const currentDay = progress?.currentDay ?? 0;
  const daysRemaining =
    progress && currentDay >= 1
      ? Math.max(0, lengthDays - (currentDay - 1))
      : lengthDays;
  const estimatedFinishDate =
    challenge && daysRemaining > 0
      ? (progress?.endDate ??
        addLocalDays(todayDate, daysRemaining, user.timezone))
      : challenge && currentDay > lengthDays
        ? todayDate
        : null;

  const challengeTimezone = user.group?.challengeTimezone ?? user.timezone;

  const finalizedScoresForBreak = challenge
    ? await prisma.dayScore.findMany({
        where: { challengeId: challenge.id, finalized: true },
        select: { date: true, breakdown: true, finalized: true },
        orderBy: { date: 'desc' },
        take: lengthDays,
      })
    : [];

  const streakBreak = computeStreakBreak(
    finalizedScoresForBreak,
    challengeTimezone,
    getUserLocalDate(challengeTimezone),
  );

  const milestones = await getUserMilestones(prisma, userId);

  return {
    totalXp,
    todayNetXp,
    currentDay,
    lengthDays,
    startDate: challenge?.startDate ?? null,
    todayDate,
    estimatedFinishDate,
    currentStreak,
    longestStreak: challenge
      ? Math.max(challenge.longestStreak, currentStreak)
      : 0,
    totalDaysCompleted,
    successRate,
    streakBreak,
    streakFreezesAvailable: challenge?.streakFreezesAvailable ?? 0,
    streakFreezesUsed: challenge?.streakFreezesUsed ?? 0,
    milestones,
  };
}

async function assertActivityInScope(
  activity: Activity,
  userId: string,
  groupId: string | null,
): Promise<void> {
  if (activity.isPersonal && activity.ownerUserId === userId) {
    return;
  }
  if (activity.groupId && activity.groupId === groupId) {
    return;
  }
  throw new TRPCError({
    code: 'NOT_FOUND',
    message: 'Activity not found',
  });
}

export async function getActivitySeries(
  prisma: PrismaService,
  userId: string,
  activityId: string,
  from: Date,
  to: Date,
): Promise<ActivitySeriesPoint[]> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
  }

  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
  });
  if (!activity) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Activity not found' });
  }

  await assertActivityInScope(activity, userId, user.groupId);

  if (activity.kind !== 'NUMBER') {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Activity series is only available for NUMBER activities',
    });
  }

  const fromKey = formatLocalDateKey(from, user.timezone);
  const toKey = formatLocalDateKey(to, user.timezone);
  const range = clampDateRange(fromKey, toKey);
  if (range.to < range.from) return [];

  // Include inactive challenges so historical progress stays visible (see getDashboardStats).
  const challenge = await prisma.challenge.findFirst({
    where: { userId },
    orderBy: challengeDisplayOrderBy,
  });
  if (!challenge) return [];

  const logs = await prisma.activityLog.findMany({
    where: {
      userId,
      activityId,
      challengeId: challenge.id,
      date: {
        gte: from,
        lte: to,
      },
    },
    select: {
      date: true,
      value: true,
      xpAwarded: true,
      state: true,
      tier: true,
      subPoints: true,
    },
    orderBy: { date: 'asc' },
  });

  return shapeActivitySeries(
    toActivityLogRows(logs, user.timezone),
    range.from,
    range.to,
  );
}

export async function getActivityCompletion(
  prisma: PrismaService,
  userId: string,
  activityId: string,
  from: Date,
  to: Date,
): Promise<ActivityCompletionResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
  }

  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
  });
  if (!activity) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Activity not found' });
  }

  await assertActivityInScope(activity, userId, user.groupId);

  if (!isCompletionActivityKind(activity.kind)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message:
        'Activity completion is only available for CHECKBOX, SUBPOINTS, or TIERED activities',
    });
  }

  const fromKey = formatLocalDateKey(from, user.timezone);
  const toKey = formatLocalDateKey(to, user.timezone);
  const range = clampDateRange(fromKey, toKey);
  if (range.to < range.from) {
    return { rateByWeek: [], streak: 0, days: [] };
  }

  // Include inactive challenges so historical progress stays visible (see getDashboardStats).
  const challenge = await prisma.challenge.findFirst({
    where: { userId },
    orderBy: challengeDisplayOrderBy,
  });
  if (!challenge) {
    return { rateByWeek: [], streak: 0, days: [] };
  }

  const logs = await prisma.activityLog.findMany({
    where: {
      userId,
      activityId,
      challengeId: challenge.id,
      date: {
        gte: from,
        lte: to,
      },
    },
    select: {
      date: true,
      value: true,
      xpAwarded: true,
      state: true,
      tier: true,
      subPoints: true,
    },
    orderBy: { date: 'asc' },
  });

  const todayKey = formatLocalDateKey(
    getUserLocalDate(user.timezone),
    user.timezone,
  );

  return shapeActivityCompletion(
    toActivityLogRows(logs, user.timezone),
    range.from,
    range.to,
    todayKey,
  );
}
