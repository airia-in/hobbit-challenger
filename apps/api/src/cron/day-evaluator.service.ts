import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { activeChallengeRelationArgs } from '../utils/challenge-query';
import { computeDayLoggingStatus } from '../utils/day-completion';
import { addLocalDays, getUserLocalDate } from '../utils/day-window';

@Injectable()
export class DayEvaluatorService {
  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async evaluateDays() {
    const users = await this.prisma.user.findMany({
      where: {
        challenges: { some: { isActive: true } },
      },
      include: {
        challenges: activeChallengeRelationArgs(),
      },
    });

    for (const user of users) {
      const challenge = user.challenges[0];
      if (!challenge) continue;

      try {
        await this.evaluateUserDay(
          user.id,
          user.timezone,
          user.groupId,
          challenge,
        );
      } catch (error) {
        console.error(`Day evaluation failed for user ${user.id}:`, error);
      }
    }
  }

  private async evaluateUserDay(
    userId: string,
    timezone: string,
    groupId: string | null,
    challenge: {
      id: string;
      startDate: Date;
      currentDay: number;
      lengthDays: number;
      longestStreak: number;
      currentStreak: number;
    },
  ) {
    if (!groupId) {
      return;
    }

    const scoredActivities = await this.prisma.activity.findMany({
      where: { groupId, active: true, scored: true },
      select: { id: true },
    });

    if (scoredActivities.length === 0) {
      return;
    }

    const localToday = getUserLocalDate(timezone);
    const previousDay = addLocalDays(localToday, -1, timezone);
    const challengeStartDay = getUserLocalDate(timezone, challenge.startDate);

    if (previousDay.getTime() < challengeStartDay.getTime()) {
      return;
    }

    const existingScore = await this.prisma.dayScore.findFirst({
      where: {
        challengeId: challenge.id,
        date: previousDay,
      },
    });

    if (existingScore?.finalized) {
      return;
    }

    const activityLogs = await this.prisma.activityLog.findMany({
      where: {
        challengeId: challenge.id,
        userId,
        date: previousDay,
      },
    });

    const scoredActivityIds = scoredActivities.map((activity) => activity.id);
    const { allScoredLogged } = computeDayLoggingStatus(
      scoredActivityIds,
      activityLogs.map((log) => ({
        activityId: log.activityId,
        state: log.state,
        tier: log.tier,
        value: log.value,
        subPoints: log.subPoints,
      })),
    );

    const netXp = activityLogs.reduce((sum, log) => sum + log.xpAwarded, 0);

    await this.prisma.$transaction(async (tx) => {
      await tx.dayScore.upsert({
        where: {
          challengeId_date: {
            challengeId: challenge.id,
            date: previousDay,
          },
        },
        create: {
          challengeId: challenge.id,
          userId,
          date: previousDay,
          dayNumber: challenge.currentDay,
          netXp,
          xpEarned: Math.max(0, netXp),
          xpDeducted: Math.max(0, -netXp),
          breakdown: { allScoredLogged },
          finalized: true,
        },
        update: {
          netXp,
          xpEarned: Math.max(0, netXp),
          xpDeducted: Math.max(0, -netXp),
          breakdown: { allScoredLogged },
          finalized: true,
        },
      });

      const newStreak = allScoredLogged ? challenge.currentStreak + 1 : 0;
      const newLongestStreak = Math.max(challenge.longestStreak, newStreak);
      const newDay = challenge.currentDay + 1;
      const completed = newDay > challenge.lengthDays;

      await tx.challenge.update({
        where: { id: challenge.id },
        data: {
          currentDay: completed ? challenge.lengthDays + 1 : newDay,
          currentStreak: newStreak,
          longestStreak: newLongestStreak,
          totalXp: { increment: netXp },
          ...(completed ? { isActive: false, endDate: new Date() } : {}),
        },
      });
    });
  }
}
