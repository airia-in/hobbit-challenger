import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import {
  mapActivityToScored,
  mapLogToInput,
} from '../services/activities.service';
import { evaluateDayRollover } from '../services/day-finalizer';
import {
  evaluateAndUnlockMilestones,
  pickMostPrestigiousMilestone,
} from '../services/milestones.service';
import { activeChallengeRelationArgs } from '../utils/challenge-query';
import { fallbackScheduledEnd } from '../utils/challenge-range';
import { isFreezeAbsorbed } from '../utils/day-completion';
import {
  addLocalDays,
  formatLocalDateKey,
  getUserLocalDate,
} from '../utils/day-window';
import { buildUserActivityOrConditions } from '../utils/user-activities-query';
import { MilestoneMessageService } from '../whatsapp/milestone-message.service';
import { StreakFreezeMessageService } from '../whatsapp/streak-freeze-message.service';
import { REST_DAY_KIND } from '../whatsapp/interactive-checkin.constants';
import {
  PRODUCT_EVENT_KEYS,
  trackProductEventFireAndForget,
} from '../services/analytics.service';

@Injectable()
export class DayEvaluatorService {
  private readonly logger = new Logger(DayEvaluatorService.name);

  /**
   * Keys `${challengeId}:${localDate}` for finalized-day milestone self-heal already
   * attempted this process lifetime. Steady-state cron ticks skip the expensive
   * full-history scan once a key is present (~1440×/day → 1×/day per finalized day).
   *
   * Trade-off: a process restart clears this set, so the next cron tick re-runs
   * self-heal once (intentional). Missed unlocks are also picked up on the next
   * day's fresh finalization path, which always evaluates regardless of this set.
   */
  private readonly milestoneSelfHealAttempted = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly streakFreezeMessage?: StreakFreezeMessageService,
    @Optional()
    private readonly milestoneMessage?: MilestoneMessageService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async evaluateDays() {
    const users = await this.prisma.user.findMany({
      where: {
        challenges: { some: { isActive: true } },
      },
      select: {
        id: true,
        name: true,
        phone: true,
        whatsappOptIn: true,
        timezone: true,
        reminderTime: true,
        groupId: true,
        group: { select: { challengeTimezone: true } },
        challenges: activeChallengeRelationArgs(),
      },
    });

    for (const user of users) {
      const challenge = user.challenges[0];
      if (!challenge) continue;

      try {
        await this.evaluateUserDay(
          user.id,
          user.name,
          user.phone,
          user.whatsappOptIn,
          user.timezone,
          user.reminderTime,
          user.group?.challengeTimezone ?? user.timezone,
          user.groupId,
          challenge,
        );
      } catch (error) {
        this.logger.error(`Day evaluation failed for user ${user.id}:`, error);
      }
    }
  }

  private async evaluateUserDay(
    userId: string,
    userName: string,
    userPhone: string | null,
    whatsappOptIn: boolean,
    timezone: string,
    reminderTime: string | null,
    challengeTimezone: string,
    groupId: string | null,
    challenge: {
      id: string;
      startDate: Date;
      endDate: Date | null;
      currentDay: number;
      lengthDays: number;
      longestStreak: number;
      currentStreak: number;
      streakFreezesAvailable: number;
      streakFreezesUsed: number;
      lastStreakFreezeGrantedAt: Date | null;
      isActive: boolean;
    },
  ) {
    const activities = await this.prisma.activity.findMany({
      where: { OR: buildUserActivityOrConditions(userId, groupId) },
    });

    const scoredActivities = activities.filter(
      (a) => a.scored && !a.isPersonal,
    );
    const personalActivities = activities.filter((a) => a.isPersonal);

    if (scoredActivities.length === 0 && personalActivities.length === 0) {
      return;
    }

    const localToday = getUserLocalDate(challengeTimezone);
    const previousDay = addLocalDays(localToday, -1, challengeTimezone);
    const challengeStartDay = getUserLocalDate(
      challengeTimezone,
      challenge.startDate,
    );
    const challengeEndDay = getUserLocalDate(
      challengeTimezone,
      fallbackScheduledEnd(challenge, challengeTimezone),
    );

    if (previousDay.getTime() < challengeStartDay.getTime()) {
      return;
    }

    const evaluationDay =
      previousDay.getTime() > challengeEndDay.getTime()
        ? challengeEndDay
        : previousDay;

    const existingScore = await this.prisma.dayScore.findFirst({
      where: {
        challengeId: challenge.id,
        date: evaluationDay,
      },
      select: { finalized: true, breakdown: true },
    });

    if (existingScore?.finalized) {
      const breakdown = existingScore.breakdown as {
        allScoredLogged?: boolean;
        freezeConsumed?: boolean;
      } | null;
      await this.maybeSelfHealMilestonesForFinalizedDay({
        userId,
        userName,
        userPhone,
        whatsappOptIn,
        groupId,
        challengeId: challenge.id,
        evaluationDay,
        challengeTimezone,
        reminderTime,
        newStreak: challenge.currentStreak,
        dayCounted: breakdown?.allScoredLogged === true,
        allScoredLogged: breakdown?.allScoredLogged === true,
        freezeConsumed: breakdown?.freezeConsumed === true,
        streakFreezesUsed: challenge.streakFreezesUsed,
      });
      await this.maybeSendStreakFreezeConsumeMessage({
        userId,
        userName,
        userPhone,
        whatsappOptIn,
        evaluationDay,
        currentStreak: challenge.currentStreak,
        challengeTimezone,
        reminderTime,
        freezeConsumedOnDay: isFreezeAbsorbed(existingScore),
        challengeActive: challenge.isActive,
      });
      await this.maybeRetryStreakFreezeGrantMessage({
        userId,
        userName,
        userPhone,
        whatsappOptIn,
        currentStreak: challenge.currentStreak,
        streakFreezesAvailable: challenge.streakFreezesAvailable,
        lastStreakFreezeGrantedAt: challenge.lastStreakFreezeGrantedAt,
        challengeTimezone,
        reminderTime,
        challengeActive: challenge.isActive,
      });
      if (previousDay.getTime() > challengeEndDay.getTime()) {
        await this.prisma.challenge.update({
          where: { id: challenge.id },
          data: { isActive: false },
        });
      }
      return;
    }

    const dayBeforeEvaluation = addLocalDays(
      evaluationDay,
      -1,
      challengeTimezone,
    );
    const previousDayScore =
      dayBeforeEvaluation.getTime() >= challengeStartDay.getTime()
        ? await this.prisma.dayScore.findFirst({
            where: {
              challengeId: challenge.id,
              date: dayBeforeEvaluation,
              finalized: true,
            },
            select: { breakdown: true, finalized: true },
          })
        : null;

    const activityLogs = await this.prisma.activityLog.findMany({
      where: {
        challengeId: challenge.id,
        userId,
        date: evaluationDay,
      },
    });

    const restDayLog = await this.prisma.reminderLog.findUnique({
      where: {
        userId_date_kind: {
          userId,
          date: evaluationDay,
          kind: REST_DAY_KIND,
        },
      },
      select: { status: true },
    });
    const isRestDay = restDayLog?.status === 'SENT';

    const result = evaluateDayRollover({
      challenge: {
        currentDay: challenge.currentDay,
        lengthDays: challenge.lengthDays,
        startDate: challenge.startDate,
        endDate: challenge.endDate,
        currentStreak: challenge.currentStreak,
        longestStreak: challenge.longestStreak,
        streakFreezesAvailable: challenge.streakFreezesAvailable,
        streakFreezesUsed: challenge.streakFreezesUsed,
        lastStreakFreezeGrantedAt: challenge.lastStreakFreezeGrantedAt,
      },
      previousDay: evaluationDay,
      timezone: challengeTimezone,
      previousDayScore,
      isRestDay,
      scoredActivities: scoredActivities.map(mapActivityToScored),
      personalActivities: personalActivities.map(mapActivityToScored),
      previousDayLogs: activityLogs.map(mapLogToInput),
    });

    let finalized = false;
    await this.prisma.$transaction(async (tx) => {
      // Authoritative guard: re-read inside the tx so concurrent finalizers cannot
      // both pass the outer check and double-increment totalXp (SQLite/libSQL
      // serializes writers; the first tx to set finalized wins).
      const current = await tx.dayScore.findUnique({
        where: {
          challengeId_date: {
            challengeId: challenge.id,
            date: evaluationDay,
          },
        },
        select: { finalized: true },
      });
      if (current?.finalized) {
        return;
      }

      await tx.dayScore.upsert({
        where: {
          challengeId_date: {
            challengeId: challenge.id,
            date: evaluationDay,
          },
        },
        create: {
          challengeId: challenge.id,
          userId,
          date: evaluationDay,
          dayNumber: result.dayScore.dayNumber,
          netXp: result.dayScore.netXp,
          xpEarned: result.dayScore.xpEarned,
          xpDeducted: result.dayScore.xpDeducted,
          personalXp: result.dayScore.personalXp,
          breakdown: result.dayScore.breakdown,
          finalized: true,
        },
        update: {
          netXp: result.dayScore.netXp,
          xpEarned: result.dayScore.xpEarned,
          xpDeducted: result.dayScore.xpDeducted,
          personalXp: result.dayScore.personalXp,
          breakdown: result.dayScore.breakdown,
          finalized: true,
        },
      });

      await tx.challenge.update({
        where: { id: challenge.id },
        data: {
          currentDay: result.challengeUpdate.currentDay,
          currentStreak: result.challengeUpdate.currentStreak,
          longestStreak: result.challengeUpdate.longestStreak,
          totalXp: { increment: result.challengeUpdate.totalXpIncrement },
          streakFreezesAvailable: result.challengeUpdate.streakFreezesAvailable,
          streakFreezesUsed: result.challengeUpdate.streakFreezesUsed,
          lastStreakFreezeGrantedAt:
            result.challengeUpdate.lastStreakFreezeGrantedAt,
          ...(result.challengeUpdate.completed ? { isActive: false } : {}),
        },
      });
      finalized = true;
    });

    if (finalized) {
      this.trackDayFinalizedEvents({
        userId,
        challengeId: challenge.id,
        previousStreak: challenge.currentStreak,
        result,
      });
      this.markMilestoneSelfHealAttempted(
        challenge.id,
        evaluationDay,
        challengeTimezone,
      );
      await this.maybeEvaluateMilestones({
        userId,
        userName,
        userPhone,
        whatsappOptIn,
        groupId,
        challengeId: challenge.id,
        evaluationDay,
        challengeTimezone,
        reminderTime,
        newStreak: result.challengeUpdate.currentStreak,
        dayCounted: result.dayScore.breakdown.allScoredLogged,
        allScoredLogged: result.dayScore.breakdown.allScoredLogged,
        freezeConsumed: result.flags.freezeConsumed,
        streakFreezesUsed:
          result.challengeUpdate.streakFreezesUsed ??
          challenge.streakFreezesUsed,
      });
      await this.maybeSendStreakFreezeConsumeMessage({
        userId,
        userName,
        userPhone,
        whatsappOptIn,
        evaluationDay,
        currentStreak: result.challengeUpdate.currentStreak,
        challengeTimezone,
        reminderTime,
        freezeConsumedOnDay: result.flags.freezeConsumed,
        challengeActive: !result.challengeUpdate.completed,
      });
      await this.maybeRetryStreakFreezeGrantMessage({
        userId,
        userName,
        userPhone,
        whatsappOptIn,
        currentStreak: result.challengeUpdate.currentStreak,
        streakFreezesAvailable:
          result.challengeUpdate.streakFreezesAvailable ?? 0,
        lastStreakFreezeGrantedAt:
          result.challengeUpdate.lastStreakFreezeGrantedAt ?? null,
        challengeTimezone,
        reminderTime,
        challengeActive: !result.challengeUpdate.completed,
      });
    }
  }

  private milestoneSelfHealKey(
    challengeId: string,
    evaluationDay: Date,
    timezone: string,
  ): string {
    return `${challengeId}:${formatLocalDateKey(evaluationDay, timezone)}`;
  }

  private markMilestoneSelfHealAttempted(
    challengeId: string,
    evaluationDay: Date,
    timezone: string,
  ): void {
    this.milestoneSelfHealAttempted.add(
      this.milestoneSelfHealKey(challengeId, evaluationDay, timezone),
    );
  }

  private async maybeSelfHealMilestonesForFinalizedDay(input: {
    userId: string;
    userName: string;
    userPhone: string | null;
    whatsappOptIn: boolean;
    groupId: string | null;
    challengeId: string;
    evaluationDay: Date;
    challengeTimezone: string;
    reminderTime: string | null;
    newStreak: number;
    dayCounted: boolean;
    allScoredLogged: boolean;
    freezeConsumed: boolean;
    streakFreezesUsed: number;
  }): Promise<void> {
    const key = this.milestoneSelfHealKey(
      input.challengeId,
      input.evaluationDay,
      input.challengeTimezone,
    );
    if (this.milestoneSelfHealAttempted.has(key)) {
      return;
    }
    this.milestoneSelfHealAttempted.add(key);
    await this.maybeEvaluateMilestones(input);
  }

  private async maybeEvaluateMilestones(input: {
    userId: string;
    userName: string;
    userPhone: string | null;
    whatsappOptIn: boolean;
    groupId: string | null;
    challengeId: string;
    evaluationDay: Date;
    challengeTimezone: string;
    reminderTime: string | null;
    newStreak: number;
    dayCounted: boolean;
    allScoredLogged: boolean;
    freezeConsumed: boolean;
    streakFreezesUsed: number;
  }): Promise<void> {
    try {
      const { newlyUnlocked } = await evaluateAndUnlockMilestones(this.prisma, {
        userId: input.userId,
        challengeId: input.challengeId,
        groupId: input.groupId,
        evaluationDay: input.evaluationDay,
        timezone: input.challengeTimezone,
        newStreak: input.newStreak,
        dayCounted: input.dayCounted,
        allScoredLogged: input.allScoredLogged,
        freezeConsumed: input.freezeConsumed,
        streakFreezesUsed: input.streakFreezesUsed,
      });

      for (const milestoneKey of newlyUnlocked) {
        trackProductEventFireAndForget(
          this.prisma,
          input.userId,
          PRODUCT_EVENT_KEYS.MILESTONE_UNLOCKED,
          {
            milestoneKey,
            challengeId: input.challengeId,
          },
        );
      }

      if (
        !this.milestoneMessage ||
        !input.userPhone ||
        !input.whatsappOptIn ||
        newlyUnlocked.length === 0
      ) {
        return;
      }

      const primary = pickMostPrestigiousMilestone(newlyUnlocked);
      if (!primary) {
        return;
      }

      try {
        await this.milestoneMessage.trySendBatchUnlockMessage({
          prisma: this.prisma,
          userId: input.userId,
          userName: input.userName,
          phone: input.userPhone,
          evaluationDay: input.evaluationDay,
          primaryMilestoneKey: primary,
          additionalUnlockCount: newlyUnlocked.length - 1,
          timezone: input.challengeTimezone,
          morningTime: input.reminderTime ?? undefined,
        });
      } catch (error) {
        this.logger.error(
          `Milestone message failed for user ${input.userId} (${primary}):`,
          error,
        );
      }
    } catch (error) {
      this.logger.error(
        `Milestone evaluation failed for user ${input.userId}:`,
        error,
      );
    }
  }

  private async maybeRetryStreakFreezeGrantMessage(input: {
    userId: string;
    userName: string;
    userPhone: string | null;
    whatsappOptIn: boolean;
    currentStreak: number;
    streakFreezesAvailable: number;
    lastStreakFreezeGrantedAt: Date | null;
    challengeTimezone: string;
    reminderTime: string | null;
    challengeActive: boolean;
  }): Promise<void> {
    if (
      !this.streakFreezeMessage ||
      !input.userPhone ||
      !input.whatsappOptIn ||
      !input.challengeActive ||
      !input.lastStreakFreezeGrantedAt
    ) {
      return;
    }

    try {
      await this.streakFreezeMessage.trySendGrantMessage({
        prisma: this.prisma,
        userId: input.userId,
        userName: input.userName,
        phone: input.userPhone,
        evaluationDay: input.lastStreakFreezeGrantedAt,
        currentStreak: input.currentStreak,
        streakFreezesAvailable: input.streakFreezesAvailable,
        timezone: input.challengeTimezone,
        morningTime: input.reminderTime ?? undefined,
      });
    } catch (error) {
      this.logger.error(
        `Streak freeze grant message failed for user ${input.userId}:`,
        error,
      );
    }
  }

  private async maybeSendStreakFreezeConsumeMessage(input: {
    userId: string;
    userName: string;
    userPhone: string | null;
    whatsappOptIn: boolean;
    evaluationDay: Date;
    currentStreak: number;
    challengeTimezone: string;
    reminderTime: string | null;
    freezeConsumedOnDay: boolean;
    challengeActive: boolean;
  }): Promise<void> {
    if (
      !this.streakFreezeMessage ||
      !input.userPhone ||
      !input.whatsappOptIn ||
      !input.freezeConsumedOnDay ||
      !input.challengeActive
    ) {
      return;
    }

    try {
      await this.streakFreezeMessage.trySendConsumeMessage({
        prisma: this.prisma,
        userId: input.userId,
        userName: input.userName,
        phone: input.userPhone,
        evaluationDay: input.evaluationDay,
        currentStreak: input.currentStreak,
        timezone: input.challengeTimezone,
        morningTime: input.reminderTime ?? undefined,
      });
    } catch (error) {
      this.logger.error(
        `Streak freeze consume message failed for user ${input.userId}:`,
        error,
      );
    }
  }

  private trackDayFinalizedEvents(input: {
    userId: string;
    challengeId: string;
    previousStreak: number;
    result: ReturnType<typeof evaluateDayRollover>;
  }): void {
    const { result } = input;
    trackProductEventFireAndForget(
      this.prisma,
      input.userId,
      PRODUCT_EVENT_KEYS.DAY_FINALIZED,
      {
        challengeId: input.challengeId,
        dayNumber: result.dayScore.dayNumber,
        allScoredLogged: result.dayScore.breakdown.allScoredLogged,
        netXp: result.dayScore.netXp,
        currentStreak: result.challengeUpdate.currentStreak,
      },
    );

    if (result.flags.freezeConsumed) {
      trackProductEventFireAndForget(
        this.prisma,
        input.userId,
        PRODUCT_EVENT_KEYS.STREAK_FREEZE_CONSUMED,
        {
          challengeId: input.challengeId,
          currentStreak: result.challengeUpdate.currentStreak,
        },
      );
    } else if (
      input.previousStreak > 0 &&
      result.challengeUpdate.currentStreak === 0
    ) {
      trackProductEventFireAndForget(
        this.prisma,
        input.userId,
        PRODUCT_EVENT_KEYS.STREAK_BROKEN,
        {
          challengeId: input.challengeId,
          previousStreak: input.previousStreak,
        },
      );
    }
  }
}
