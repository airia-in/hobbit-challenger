import { TRPCError } from '@trpc/server';
import type { PrismaService } from '../prisma/prisma.service';
import { getMemberStatus } from '../utils/member-status';

export type LeaderboardSortBy = 'day' | 'successRate' | 'streak' | 'name';

export type LeaderboardMember = {
  rank: number;
  id: string;
  name: string;
  avatarUrl: string | null;
  currentDay: number;
  status: 'ACTIVE' | 'ELIMINATED' | 'COMPLETED';
  streak: number;
  successRate: number;
};

export type LeaderboardResult = {
  members: LeaderboardMember[];
  podium: LeaderboardMember[];
};

function computeSuccessRate(
  dayResults: { completed: boolean }[],
): number {
  if (dayResults.length === 0) return 0;
  const completed = dayResults.filter((d) => d.completed).length;
  return Math.round((completed / dayResults.length) * 100);
}

function sortMembers(
  members: Omit<LeaderboardMember, 'rank'>[],
  sortBy: LeaderboardSortBy,
): Omit<LeaderboardMember, 'rank'>[] {
  const sorted = [...members];

  switch (sortBy) {
    case 'successRate':
      sorted.sort((a, b) => b.successRate - a.successRate || b.currentDay - a.currentDay);
      break;
    case 'streak':
      sorted.sort((a, b) => b.streak - a.streak || b.currentDay - a.currentDay);
      break;
    case 'name':
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'day':
    default:
      sorted.sort((a, b) => b.currentDay - a.currentDay || b.successRate - a.successRate);
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
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Join a group to view the leaderboard' });
  }

  const members = await prisma.user.findMany({
    where: { groupId: user.groupId },
    select: {
      id: true,
      name: true,
      avatarUrl: true,
      attempts: {
        where: { isActive: true },
        take: 1,
        include: {
          dayResults: { select: { completed: true } },
        },
      },
    },
  });

  const entries = members.map((member) => {
    const attempt = member.attempts[0] ?? null;
    const currentDay = attempt?.currentDay ?? 0;
    const streak = attempt ? Math.max(0, attempt.currentDay - 1) : 0;
    const successRate = attempt
      ? computeSuccessRate(attempt.dayResults)
      : 0;

    return {
      id: member.id,
      name: member.name,
      avatarUrl: member.avatarUrl,
      currentDay,
      status: getMemberStatus(attempt),
      streak,
      successRate,
    };
  });

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
