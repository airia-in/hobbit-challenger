import { TRPCError } from '@trpc/server';
import type { Activity } from '@workspace-starter/db';
import type { PrismaService } from '../prisma/prisma.service';
import { challengeDisplayOrderBy } from '../utils/challenge-query';
import { isInterimDayCompleted } from '../utils/day-completion';
import {
  addLocalDays,
  formatLocalDateKey,
  getUserLocalDate,
} from '../utils/day-window';
import { getLiveStreak } from '../utils/live-streak';
import {
  clampDateRange,
  shapeActivityCompletion,
  shapeActivitySeries,
  type ActivityCompletionResult,
  type ActivitySeriesPoint,
} from '../utils/stats-aggregation';

export type DashboardStats = {
  totalXp: number;
  todayNetXp: number;
  currentDay: number;
  lengthDays: number;
  startDate: Date | null;
  todayDate: Date;
  estimatedFinishDate: Date | null;
  currentStreak: number;
  longestStreak: number;
  totalDaysCompleted: number;
  successRate: number;
  timesRestarted: number;
};

export async function getDashboardStats(
  prisma: PrismaService,
  userId: string,
): Promise<DashboardStats> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
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

  const lengthDays = challenge?.lengthDays ?? 30;
  const daysRemaining = challenge
    ? Math.max(0, lengthDays - (challenge.currentDay - 1))
    : lengthDays;
  const estimatedFinishDate =
    challenge && daysRemaining > 0
      ? addLocalDays(todayDate, daysRemaining, user.timezone)
      : challenge && challenge.currentDay > lengthDays
        ? todayDate
        : null;

  return {
    totalXp,
    todayNetXp,
    currentDay: challenge?.currentDay ?? 1,
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
    timesRestarted: 0,
  };
}

const COMPLETION_KINDS = new Set(['CHECKBOX', 'SUBPOINTS', 'TIERED']);

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

function toActivityLogRows(
  logs: {
    date: Date;
    value: number | null;
    xpAwarded: number;
    state: string | null;
    tier: string | null;
    subPoints: unknown;
  }[],
  timezone: string,
) {
  return logs.map((log) => ({
    date: formatLocalDateKey(log.date, timezone),
    value: log.value,
    xpAwarded: log.xpAwarded,
    state: log.state,
    tier: log.tier,
    subPoints: log.subPoints,
  }));
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

  if (!COMPLETION_KINDS.has(activity.kind)) {
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
