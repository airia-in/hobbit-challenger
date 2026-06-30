import { TRPCError } from '@trpc/server';
import type { PrismaService } from '../prisma/prisma.service';
import { latestChallengeRelationArgs } from '../utils/challenge-query';
import { isInterimDayCompleted } from '../utils/day-completion';
import { getLiveStreak } from '../utils/live-streak';
import { getMemberStatus } from '../utils/member-status';

export type LeaderboardSortBy = 'day' | 'successRate' | 'streak' | 'name';

export type LeaderboardMember = {
  rank: number;
  id: string;
  name: string;
  avatarUrl: string | null;
  currentDay: number;
  status: 'ACTIVE' | 'COMPLETED';
  streak: number;
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

function sortMembers(
  members: Omit<LeaderboardMember, 'rank'>[],
  sortBy: LeaderboardSortBy,
): Omit<LeaderboardMember, 'rank'>[] {
  const sorted = [...members];

  switch (sortBy) {
    case 'successRate':
      sorted.sort(
        (a, b) => b.successRate - a.successRate || b.currentDay - a.currentDay,
      );
      break;
    case 'streak':
      sorted.sort((a, b) => b.streak - a.streak || b.currentDay - a.currentDay);
      break;
    case 'name':
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'day':
    default:
      sorted.sort(
        (a, b) => b.currentDay - a.currentDay || b.successRate - a.successRate,
      );
      break;
  }

  return sorted;
}

export async function getLeaderboard(
  prisma: PrismaService,
  userId: string,
  sortBy: LeaderboardSortBy = 'day',
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

      return {
        id: member.id,
        name: member.name,
        avatarUrl: member.avatarUrl,
        currentDay,
        status: getMemberStatus(challenge),
        streak,
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
