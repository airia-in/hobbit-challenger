import { Injectable } from '@nestjs/common';
import {
  ActivitiesService,
  type GetTodayResult,
  type TodayActivity,
} from '../services/activities.service';
import { getLeaderboard } from '../services/leaderboard.service';
import {
  computeDayScore,
  type ScoredActivity,
} from '../services/scoring.service';
import { getDashboardStats } from '../services/stats.service';
import { challengeDisplayOrderBy } from '../utils/challenge-query';
import {
  isActivityLogLogged,
  isFreezeAbsorbed,
  isInterimDayFailed,
} from '../utils/day-completion';
import { addLocalDays, getUserLocalDate } from '../utils/day-window';
import type { PrismaService } from '../prisma/prisma.service';

export const UNLOGGED_HABITS_CAP = 3;
export const STREAK_AT_RISK_MIN = 3;

/** Challenge-local yesterday (midnight anchor in challenge TZ, not user TZ). */
export function getChallengeYesterdayDate(
  challengeTimezone: string,
  now = new Date(),
): Date {
  const todayInChallenge = getUserLocalDate(challengeTimezone, now);
  return addLocalDays(todayInChallenge, -1, challengeTimezone);
}

export type ReminderContext = {
  name: string;
  dayNumber: number;
  tasksDone: number;
  tasksRemaining: number;
  todayNetXp: number;
  xpAtRisk: number;
  rank: number | null;
  totalXp: number;
  topActivityStreak: number;
  topActivityName: string | null;
  unloggedHabitNames: string[];
  missedYesterday: boolean;
  streakAtRisk: boolean;
  journeyMilestone: 7 | 21 | 30 | null;
  currentStreak: number;
  longestStreak: number;
  streakFreezesAvailable: number;
};

function todayActivityToScored(activity: TodayActivity): ScoredActivity {
  return {
    id: activity.id,
    kind: activity.kind,
    scored: activity.scored,
    isPersonal: activity.isPersonal,
    deductMultiplier: activity.deductMultiplier,
    xpComplete: activity.xpComplete,
    xpMiss: activity.xpMiss,
    unitLabel: activity.unitLabel,
    xpPerUnit: activity.xpPerUnit,
    xpCap: activity.xpCap,
    missXp: activity.missXp,
    subPoints: activity.subPoints,
    tiers: activity.tiers,
  };
}

export function pickTopActivityStreak(scoredActivities: TodayActivity[]): {
  topActivityStreak: number;
  topActivityName: string | null;
} {
  let topActivityStreak = 0;
  let topActivityName: string | null = null;

  for (const activity of scoredActivities) {
    if (!activity.scored || activity.currentStreak === undefined) {
      continue;
    }
    if (activity.currentStreak > topActivityStreak) {
      topActivityStreak = activity.currentStreak;
      topActivityName = activity.title;
    }
  }

  return { topActivityStreak, topActivityName };
}

export function collectUnloggedHabitNames(
  scoredActivities: TodayActivity[],
  cap = UNLOGGED_HABITS_CAP,
): string[] {
  const names: string[] = [];

  for (const activity of scoredActivities) {
    if (!activity.scored) {
      continue;
    }
    const log = activity.log;
    if (log && isActivityLogLogged(log)) {
      continue;
    }
    names.push(activity.title);
    if (names.length >= cap) {
      break;
    }
  }

  return names;
}

export function resolveJourneyMilestone(dayNumber: number): 7 | 21 | 30 | null {
  if (dayNumber === 7 || dayNumber === 21 || dayNumber === 30) {
    return dayNumber;
  }
  return null;
}

export function countTasksFromToday(scoredActivities: TodayActivity[]): {
  tasksDone: number;
  tasksRemaining: number;
} {
  let tasksDone = 0;
  let tasksRemaining = 0;

  for (const activity of scoredActivities) {
    if (!activity.scored) {
      continue;
    }
    const log = activity.log;
    if (log && isActivityLogLogged(log)) {
      tasksDone += 1;
    } else {
      tasksRemaining += 1;
    }
  }

  return { tasksDone, tasksRemaining };
}

export function computeXpAtRisk(scoredActivities: TodayActivity[]): number {
  const scored = scoredActivities.filter((a) => a.scored && !a.isPersonal);
  const activities = scored.map(todayActivityToScored);

  const logsById = Object.fromEntries(
    scored.map((a) => [
      a.id,
      a.log
        ? {
            activityId: a.id,
            state: a.log.state,
            value: a.log.value,
            tier: a.log.tier,
            subPoints: a.log.subPoints,
          }
        : undefined,
    ]),
  );

  const withGrace = computeDayScore(activities, logsById, {
    applyGrace: true,
  });
  const withoutGrace = computeDayScore(activities, logsById, {
    applyGrace: false,
  });

  return Math.max(0, withGrace.xpDeducted - withoutGrace.xpDeducted);
}

export function buildReminderContextFromToday(
  name: string,
  today: GetTodayResult,
  stats: {
    todayNetXp: number;
    totalXp: number;
    currentStreak: number;
    longestStreak: number;
    streakFreezesAvailable?: number;
  },
  rank: number | null,
  missedYesterday: boolean,
): ReminderContext {
  const { tasksDone, tasksRemaining } = countTasksFromToday(
    today.scoredActivities,
  );
  const xpAtRisk = computeXpAtRisk(today.scoredActivities);
  const { topActivityStreak, topActivityName } = pickTopActivityStreak(
    today.scoredActivities,
  );
  const unloggedHabitNames = collectUnloggedHabitNames(today.scoredActivities);
  const journeyMilestone = resolveJourneyMilestone(today.currentDay);
  const streakAtRisk =
    stats.currentStreak >= STREAK_AT_RISK_MIN && tasksRemaining > 0;

  return {
    name,
    dayNumber: today.currentDay,
    tasksDone,
    tasksRemaining,
    todayNetXp: stats.todayNetXp,
    xpAtRisk,
    rank,
    totalXp: stats.totalXp,
    topActivityStreak,
    topActivityName,
    unloggedHabitNames,
    missedYesterday,
    streakAtRisk,
    journeyMilestone,
    currentStreak: stats.currentStreak,
    longestStreak: stats.longestStreak,
    streakFreezesAvailable: stats.streakFreezesAvailable ?? 0,
  };
}

export function hasEveningReminderEligibility(
  context: ReminderContext,
): boolean {
  return context.tasksRemaining > 0 || context.xpAtRisk > 0;
}

@Injectable()
export class ReminderContextService {
  constructor(private readonly activitiesService: ActivitiesService) {}

  async buildContext(
    prisma: PrismaService,
    userId: string,
    userName: string,
  ): Promise<ReminderContext> {
    const stats = await getDashboardStats(prisma, userId);

    let rank: number | null = null;
    try {
      const leaderboard = await getLeaderboard(prisma, userId);
      rank = leaderboard.members.find((m) => m.id === userId)?.rank ?? null;
    } catch {
      // User has no group — rank remains null
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { group: { select: { challengeTimezone: true } } },
    });

    let missedYesterday = false;
    if (user) {
      const challenge = await prisma.challenge.findFirst({
        where: { userId },
        orderBy: challengeDisplayOrderBy,
      });
      if (challenge) {
        const timezone = user.group?.challengeTimezone ?? user.timezone;
        const yesterday = getChallengeYesterdayDate(timezone);
        const yesterdayScore = await prisma.dayScore.findFirst({
          where: {
            challengeId: challenge.id,
            date: yesterday,
            finalized: true,
          },
          select: { finalized: true, breakdown: true },
        });
        missedYesterday = yesterdayScore
          ? isInterimDayFailed(yesterdayScore) &&
            !isFreezeAbsorbed(yesterdayScore)
          : false;
      }
    }

    const today = await this.activitiesService.getToday(prisma, userId);

    return buildReminderContextFromToday(
      userName,
      today,
      {
        todayNetXp: stats.todayNetXp,
        totalXp: stats.totalXp,
        currentStreak: stats.currentStreak,
        longestStreak: stats.longestStreak,
        streakFreezesAvailable: stats.streakFreezesAvailable,
      },
      rank,
      missedYesterday,
    );
  }
}

export function buildReminderContextFromFixture(input: {
  name: string;
  today: GetTodayResult;
  todayNetXp: number;
  totalXp: number;
  currentStreak?: number;
  longestStreak?: number;
  rank?: number | null;
  missedYesterday?: boolean;
}): ReminderContext {
  return buildReminderContextFromToday(
    input.name,
    input.today,
    {
      todayNetXp: input.todayNetXp,
      totalXp: input.totalXp,
      currentStreak: input.currentStreak ?? 0,
      longestStreak: input.longestStreak ?? 0,
    },
    input.rank ?? null,
    input.missedYesterday ?? false,
  );
}
