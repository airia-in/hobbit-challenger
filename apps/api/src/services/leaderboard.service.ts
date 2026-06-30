import { TRPCError } from '@trpc/server';
import type { PrismaService } from '../prisma/prisma.service';
import { latestChallengeRelationArgs } from '../utils/challenge-query';
import { isInterimDayCompleted } from '../utils/day-completion';
import {
  formatLocalDateKey,
  getIsoWeekRange,
  getUserLocalDate,
} from '../utils/day-window';
import { getLiveStreak } from '../utils/live-streak';
import { getMemberStatus } from '../utils/member-status';
import {
  assertLeaderboardSeriesPrivacy,
  shapeLeaderboardSeries,
  type LeaderboardSeriesMetric,
  type LeaderboardSeriesResult,
} from '../utils/stats-aggregation';

export type LeaderboardWindow = 'today' | 'week' | 'total';
export type LeaderboardSortBy =
  | 'xp'
  | 'streak'
  | 'name'
  | 'day'
  | 'successRate';

export type LeaderboardMember = {
  rank: number;
  id: string;
  name: string;
  avatarUrl: string | null;
  currentDay: number;
  status: 'ACTIVE' | 'COMPLETED';
  streak: number;
  xp: number;
  successRate: number;
};

export type LeaderboardResult = {
  members: LeaderboardMember[];
  podium: LeaderboardMember[];
};

function computeSuccessRate(
  dayScores: { finalized: boolean; breakdown: unknown }[],
): number {
  const finalized = dayScores.filter((d) => d.finalized);
  if (finalized.length === 0) return 0;
  const completed = finalized.filter((d) => isInterimDayCompleted(d)).length;
  return Math.round((completed / finalized.length) * 100);
}

async function aggregateWindowXp(
  prisma: PrismaService,
  challengeId: string,
  timezone: string,
  window: LeaderboardWindow,
  totalXp: number,
): Promise<number> {
  if (window === 'total') {
    const today = getUserLocalDate(timezone);
    const todayScore = await prisma.dayScore.findFirst({
      where: { challengeId, date: today },
      select: { netXp: true },
    });
    return totalXp + (todayScore?.netXp ?? 0);
  }

  if (window === 'today') {
    const today = getUserLocalDate(timezone);
    const todayScore = await prisma.dayScore.findFirst({
      where: { challengeId, date: today },
      select: { netXp: true },
    });
    return todayScore?.netXp ?? 0;
  }

  const { start, end } = getIsoWeekRange(timezone);
  const scores = await prisma.dayScore.findMany({
    where: {
      challengeId,
      date: { gte: start, lte: end },
    },
    select: { netXp: true },
  });
  return scores.reduce((sum, score) => sum + score.netXp, 0);
}

function sortMembers(
  members: Omit<LeaderboardMember, 'rank'>[],
  sortBy: LeaderboardSortBy,
): Omit<LeaderboardMember, 'rank'>[] {
  const sorted = [...members];

  switch (sortBy) {
    case 'successRate':
      sorted.sort((a, b) => b.successRate - a.successRate || b.xp - a.xp);
      break;
    case 'streak':
      sorted.sort((a, b) => b.streak - a.streak || b.xp - a.xp);
      break;
    case 'name':
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'day':
      sorted.sort((a, b) => b.currentDay - a.currentDay || b.xp - a.xp);
      break;
    case 'xp':
    default:
      sorted.sort((a, b) => b.xp - a.xp || b.streak - a.streak);
      break;
  }

  return sorted;
}

export async function getLeaderboard(
  prisma: PrismaService,
  userId: string,
  window: LeaderboardWindow = 'today',
  sortBy: LeaderboardSortBy = 'xp',
): Promise<LeaderboardResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user?.groupId) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Join a group to view the leaderboard',
    });
  }

  const members = await prisma.user.findMany({
    where: { groupId: user.groupId },
    select: {
      id: true,
      name: true,
      avatarUrl: true,
      timezone: true,
      groupId: true,
      challenges: {
        ...latestChallengeRelationArgs(),
        include: {
          dayScores: { select: { finalized: true, breakdown: true } },
        },
      },
    },
  });

  const entries = await Promise.all(
    members.map(async (member) => {
      const challenge = member.challenges[0] ?? null;
      const currentDay = challenge?.currentDay ?? 0;
      const streak = challenge
        ? await getLiveStreak(prisma, {
            challengeId: challenge.id,
            userId: member.id,
            groupId: member.groupId,
            timezone: member.timezone,
            storedStreak: challenge.currentStreak,
          })
        : 0;
      const successRate = challenge
        ? computeSuccessRate(challenge.dayScores)
        : 0;
      const xp = challenge
        ? await aggregateWindowXp(
            prisma,
            challenge.id,
            member.timezone,
            window,
            challenge.totalXp,
          )
        : 0;

      return {
        id: member.id,
        name: member.name,
        avatarUrl: member.avatarUrl,
        currentDay,
        status: getMemberStatus(challenge),
        streak,
        xp,
        successRate,
      };
    }),
  );

  const sorted = sortMembers(entries, sortBy);
  const ranked: LeaderboardMember[] = sorted.map((entry, index) => ({
    ...entry,
    rank: index + 1,
  }));

  return {
    members: ranked,
    podium: ranked.slice(0, 3),
  };
}

function resolveSeriesDateRange(
  window: LeaderboardWindow,
  timezone: string,
  challengeStart: Date | null,
): { from: string; to: string } {
  const today = getUserLocalDate(timezone);
  const to = formatLocalDateKey(today, timezone);

  if (window === 'today') {
    return { from: to, to };
  }

  if (window === 'week') {
    const { start, end } = getIsoWeekRange(timezone);
    return {
      from: formatLocalDateKey(start, timezone),
      to: formatLocalDateKey(end, timezone),
    };
  }

  const from = challengeStart
    ? formatLocalDateKey(challengeStart, timezone)
    : to;
  return { from, to };
}

export async function getLeaderboardSeries(
  prisma: PrismaService,
  userId: string,
  window: LeaderboardWindow = 'total',
  metric: LeaderboardSeriesMetric = 'cumulative',
): Promise<LeaderboardSeriesResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user?.groupId) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Join a group to view leaderboard series',
    });
  }

  const members = await prisma.user.findMany({
    where: { groupId: user.groupId },
    select: {
      id: true,
      name: true,
      timezone: true,
      challenges: {
        ...latestChallengeRelationArgs(),
        select: {
          startDate: true,
          dayScores: {
            select: { date: true, netXp: true },
            orderBy: { date: 'asc' },
          },
        },
      },
    },
  });

  const callerChallenge = members.find((member) => member.id === userId)
    ?.challenges[0];
  const { from, to } = resolveSeriesDateRange(
    window,
    user.timezone,
    callerChallenge?.startDate ?? null,
  );

  const memberInputs = members.map((member) => {
    const challenge = member.challenges[0];
    return {
      id: member.id,
      name: member.name,
      dayScores: (challenge?.dayScores ?? []).map((score) => ({
        date: formatLocalDateKey(score.date, member.timezone),
        netXp: score.netXp,
      })),
    };
  });

  const result = shapeLeaderboardSeries(memberInputs, from, to, metric, userId);
  assertLeaderboardSeriesPrivacy(result);
  return result;
}
