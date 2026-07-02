import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { activeChallengeRelationArgs } from '../utils/challenge-query';
import { deriveChallengeProgress } from '../utils/challenge-range';
import { getUserLocalDate } from '../utils/day-window';
import {
  isWinbackEligible,
  isWinbackMorningWindowActionable,
  localCalendarDaysBetween,
  OTHER_DAILY_REMINDER_KINDS,
  shouldDeferRemindersForWinback,
  WINBACK_KIND,
  type WinbackDeferInput,
} from '../utils/winback-dormancy';
import { EvolutionApiClient } from '../whatsapp/evolution.client';
import { WinbackMessageService } from '../whatsapp/winback-message.service';

type WinbackCandidate = {
  id: string;
  name: string;
  phone: string;
  timezone: string;
  reminderTime: string | null;
  challengeTimezone: string;
  challenge: {
    id: string;
    startDate: Date;
    endDate: Date | null;
    lengthDays: number;
    currentDay: number;
    isActive: boolean;
    stoppedAt: Date | null;
  };
};

export type WinbackDeferUserInput = {
  id: string;
  reminderTime: string | null;
  challengeTimezone: string;
};

export type WinbackDeferBatchContext = {
  challengeByUser: Map<
    string,
    WinbackCandidate['challenge'] & { userId: string }
  >;
  lastActivityByChallenge: Map<string, Date | null>;
  lastWinbackByUser: Map<string, Date>;
  winbackLogTodayByUser: Map<string, { status: string } | null>;
};

@Injectable()
export class WinbackService {
  private readonly logger = new Logger(WinbackService.name);
  private loggedUnconfigured = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly evolution: EvolutionApiClient,
    private readonly winbackMessage: WinbackMessageService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async processWinbacks(): Promise<void> {
    if (!this.evolution.isConfigured()) {
      if (!this.loggedUnconfigured) {
        this.logger.debug(
          'Evolution API not configured — skipping WhatsApp win-backs',
        );
        this.loggedUnconfigured = true;
      }
      return;
    }

    const users = await this.prisma.user.findMany({
      where: {
        phone: { not: null },
        whatsappOptIn: true,
        challenges: { some: { isActive: true, stoppedAt: null } },
      },
      select: {
        id: true,
        name: true,
        phone: true,
        timezone: true,
        reminderTime: true,
        group: { select: { challengeTimezone: true } },
        challenges: activeChallengeRelationArgs(),
      },
    });

    const candidates: WinbackCandidate[] = [];
    for (const user of users) {
      const challenge = user.challenges[0];
      if (!user.phone || !challenge) {
        continue;
      }
      candidates.push({
        id: user.id,
        name: user.name,
        phone: user.phone,
        timezone: user.timezone,
        reminderTime: user.reminderTime,
        challengeTimezone: user.group?.challengeTimezone ?? user.timezone,
        challenge,
      });
    }

    if (candidates.length === 0) {
      return;
    }

    const challengeIds = candidates.map((c) => c.challenge.id);
    const userIds = candidates.map((c) => c.id);

    const [lastLogs, winbackLogs] = await Promise.all([
      this.prisma.activityLog.groupBy({
        by: ['challengeId'],
        where: { challengeId: { in: challengeIds } },
        _max: { date: true },
      }),
      this.prisma.reminderLog.findMany({
        where: {
          userId: { in: userIds },
          kind: WINBACK_KIND,
          status: 'SENT',
        },
        orderBy: { sentAt: 'desc' },
        select: { userId: true, sentAt: true },
      }),
    ]);

    const lastActivityByChallenge = new Map(
      lastLogs.map((row) => [row.challengeId, row._max.date]),
    );

    const lastWinbackByUser = new Map<string, Date>();
    for (const log of winbackLogs) {
      if (!lastWinbackByUser.has(log.userId)) {
        lastWinbackByUser.set(log.userId, log.sentAt);
      }
    }

    for (const candidate of candidates) {
      try {
        await this.processCandidate(
          candidate,
          lastActivityByChallenge.get(candidate.challenge.id) ?? null,
          lastWinbackByUser.get(candidate.id) ?? null,
        );
      } catch (error) {
        this.logger.error(`Win-back failed for user ${candidate.id}:`, error);
      }
    }
  }

  /**
   * Batches challenge, activity, and win-back log lookups for ReminderService.
   */
  async loadDeferBatchContext(
    users: WinbackDeferUserInput[],
  ): Promise<WinbackDeferBatchContext> {
    if (users.length === 0) {
      return {
        challengeByUser: new Map(),
        lastActivityByChallenge: new Map(),
        lastWinbackByUser: new Map(),
        winbackLogTodayByUser: new Map(),
      };
    }

    const userIds = users.map((user) => user.id);
    const localDateByUser = new Map(
      users.map((user) => [user.id, getUserLocalDate(user.challengeTimezone)]),
    );
    const uniqueDates = [
      ...new Set([...localDateByUser.values()].map((date) => date.getTime())),
    ].map((time) => new Date(time));

    const challenges = await this.prisma.challenge.findMany({
      where: {
        userId: { in: userIds },
        isActive: true,
        stoppedAt: null,
      },
      orderBy: { startDate: 'desc' },
    });

    const challengeByUser = new Map<
      string,
      WinbackCandidate['challenge'] & { userId: string }
    >();
    for (const challenge of challenges) {
      if (!challengeByUser.has(challenge.userId)) {
        challengeByUser.set(challenge.userId, challenge);
      }
    }

    const challengeIds = [...challengeByUser.values()].map(
      (challenge) => challenge.id,
    );

    const [lastLogs, winbackSentLogs, todayWinbackLogs] = await Promise.all([
      challengeIds.length > 0
        ? this.prisma.activityLog.groupBy({
            by: ['challengeId'],
            where: { challengeId: { in: challengeIds } },
            _max: { date: true },
          })
        : Promise.resolve([]),
      this.prisma.reminderLog.findMany({
        where: {
          userId: { in: userIds },
          kind: WINBACK_KIND,
          status: 'SENT',
        },
        orderBy: { sentAt: 'desc' },
        select: { userId: true, sentAt: true },
      }),
      uniqueDates.length > 0
        ? this.prisma.reminderLog.findMany({
            where: {
              userId: { in: userIds },
              kind: WINBACK_KIND,
              date: { in: uniqueDates },
            },
            select: { userId: true, date: true, status: true },
          })
        : Promise.resolve([]),
    ]);

    const lastActivityByChallenge = new Map(
      lastLogs.map((row) => [row.challengeId, row._max.date]),
    );

    const lastWinbackByUser = new Map<string, Date>();
    for (const log of winbackSentLogs) {
      if (!lastWinbackByUser.has(log.userId)) {
        lastWinbackByUser.set(log.userId, log.sentAt);
      }
    }

    const winbackLogTodayByUser = new Map<string, { status: string } | null>();
    for (const user of users) {
      const localDate = localDateByUser.get(user.id)!;
      const log = todayWinbackLogs.find(
        (row) =>
          row.userId === user.id && row.date.getTime() === localDate.getTime(),
      );
      winbackLogTodayByUser.set(user.id, log ?? null);
    }

    return {
      challengeByUser,
      lastActivityByChallenge,
      lastWinbackByUser,
      winbackLogTodayByUser,
    };
  }

  shouldDeferRemindersForUser(
    input: {
      userId: string;
      challengeTimezone: string;
      reminderTime: string | null;
      now?: Date;
    } & Partial<WinbackDeferInput>,
    batch?: WinbackDeferBatchContext,
  ): boolean {
    if (batch) {
      const challenge = batch.challengeByUser.get(input.userId);
      if (!challenge) {
        return false;
      }

      return shouldDeferRemindersForWinback({
        lastActivityDate:
          batch.lastActivityByChallenge.get(challenge.id) ?? null,
        challengeStartDate: challenge.startDate,
        challengeTimezone: input.challengeTimezone,
        challenge,
        lastWinbackSentAt: batch.lastWinbackByUser.get(input.userId) ?? null,
        winbackLogToday: batch.winbackLogTodayByUser.get(input.userId) ?? null,
        reminderTime: input.reminderTime,
        now: input.now,
      });
    }

    if (
      !input.challenge ||
      input.lastActivityDate === undefined ||
      input.lastWinbackSentAt === undefined ||
      input.winbackLogToday === undefined
    ) {
      return false;
    }

    return shouldDeferRemindersForWinback({
      lastActivityDate: input.lastActivityDate,
      challengeStartDate: input.challengeStartDate!,
      challengeTimezone: input.challengeTimezone,
      challenge: input.challenge,
      lastWinbackSentAt: input.lastWinbackSentAt,
      winbackLogToday: input.winbackLogToday,
      reminderTime: input.reminderTime,
      now: input.now,
    });
  }

  private async processCandidate(
    candidate: WinbackCandidate,
    lastActivityDate: Date | null,
    lastWinbackSentAt: Date | null,
  ): Promise<void> {
    const { challengeTimezone } = candidate;
    const localDate = getUserLocalDate(challengeTimezone);

    const winbackLog = await this.prisma.reminderLog.findUnique({
      where: {
        userId_date_kind: {
          userId: candidate.id,
          date: localDate,
          kind: WINBACK_KIND,
        },
      },
    });

    if (
      !isWinbackMorningWindowActionable({
        timezone: challengeTimezone,
        reminderTime: candidate.reminderTime,
        winbackLogToday: winbackLog,
      })
    ) {
      return;
    }

    if (
      !isWinbackEligible({
        lastActivityDate,
        challengeStartDate: candidate.challenge.startDate,
        challengeTimezone,
        challenge: candidate.challenge,
        lastWinbackSentAt,
      })
    ) {
      return;
    }

    if (await this.hasOtherReminderSentToday(candidate.id, localDate)) {
      return;
    }

    const progress = deriveChallengeProgress(
      candidate.challenge,
      challengeTimezone,
    );
    const dormantDays = localCalendarDaysBetween(
      lastActivityDate ?? candidate.challenge.startDate,
      localDate,
      challengeTimezone,
    );

    await this.winbackMessage.trySendWinback({
      prisma: this.prisma,
      userId: candidate.id,
      phone: candidate.phone,
      localDate,
      context: {
        name: candidate.name,
        dayNumber: progress.currentDay,
        dormantDays,
        rank: null,
      },
    });
  }

  private async hasOtherReminderSentToday(
    userId: string,
    localDate: Date,
  ): Promise<boolean> {
    const sent = await this.prisma.reminderLog.findFirst({
      where: {
        userId,
        date: localDate,
        kind: { in: [...OTHER_DAILY_REMINDER_KINDS] },
        status: 'SENT',
      },
      select: { id: true },
    });
    return sent !== null;
  }
}
