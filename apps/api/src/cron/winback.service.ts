import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { activeChallengeRelationArgs } from '../utils/challenge-query';
import { deriveChallengeProgress } from '../utils/challenge-range';
import {
  getUserLocalDate,
  getLocalMinutesSinceTarget,
  isLocalTimeMatch,
  isWithinLocalCatchUpWindow,
} from '../utils/day-window';
import {
  isWinbackEligible,
  localCalendarDaysBetween,
  OTHER_DAILY_REMINDER_KINDS,
  WINBACK_KIND,
} from '../utils/winback-dormancy';
import { EvolutionApiClient } from '../whatsapp/evolution.client';
import { WinbackMessageService } from '../whatsapp/winback-message.service';

const DEFAULT_MORNING_TIME = '08:00';
const FIRST_SEND_CATCH_UP_MINUTES = 15;
const FAILED_RETRY_WINDOW_MINUTES = 15;

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
   * Used by ReminderService to defer all reminder kinds when win-back owns the day.
   */
  async shouldDeferRemindersForUser(input: {
    userId: string;
    challengeTimezone: string;
    reminderTime: string | null;
    challenge: WinbackCandidate['challenge'];
    lastActivityDate: Date | null;
    lastWinbackSentAt: Date | null;
  }): Promise<boolean> {
    const localDate = getUserLocalDate(input.challengeTimezone);
    const eligible = isWinbackEligible({
      lastActivityDate: input.lastActivityDate,
      challengeStartDate: input.challenge.startDate,
      challengeTimezone: input.challengeTimezone,
      challenge: input.challenge,
      lastWinbackSentAt: input.lastWinbackSentAt,
    });

    const winbackLog = await this.prisma.reminderLog.findUnique({
      where: {
        userId_date_kind: {
          userId: input.userId,
          date: localDate,
          kind: WINBACK_KIND,
        },
      },
    });

    if (winbackLog?.status === 'SENT') {
      return true;
    }

    if (eligible) {
      return true;
    }

    if (winbackLog?.status === 'FAILED') {
      const morningTime = input.reminderTime ?? DEFAULT_MORNING_TIME;
      return isWithinLocalRetryWindow(
        input.challengeTimezone,
        morningTime,
        new Date(),
        FAILED_RETRY_WINDOW_MINUTES,
      );
    }

    return false;
  }

  private async processCandidate(
    candidate: WinbackCandidate,
    lastActivityDate: Date | null,
    lastWinbackSentAt: Date | null,
  ): Promise<void> {
    const { challengeTimezone } = candidate;
    const morningTime = candidate.reminderTime ?? DEFAULT_MORNING_TIME;
    const localDate = getUserLocalDate(challengeTimezone);

    if (
      !(await this.isMorningWindowDue(
        candidate.id,
        localDate,
        challengeTimezone,
        morningTime,
      ))
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

  private async isMorningWindowDue(
    userId: string,
    localDate: Date,
    timezone: string,
    morningTime: string,
  ): Promise<boolean> {
    if (isLocalTimeMatch(timezone, morningTime)) {
      return true;
    }

    const existing = await this.prisma.reminderLog.findUnique({
      where: {
        userId_date_kind: {
          userId,
          date: localDate,
          kind: WINBACK_KIND,
        },
      },
    });

    if (existing?.status === 'FAILED') {
      return isWithinLocalRetryWindow(
        timezone,
        morningTime,
        new Date(),
        FAILED_RETRY_WINDOW_MINUTES,
      );
    }

    return isWithinLocalCatchUpWindow(
      timezone,
      morningTime,
      new Date(),
      FIRST_SEND_CATCH_UP_MINUTES,
    );
  }

  private async hasOtherReminderSentToday(
    userId: string,
    localDate: Date,
  ): Promise<boolean> {
    for (const kind of OTHER_DAILY_REMINDER_KINDS) {
      const existing = await this.prisma.reminderLog.findUnique({
        where: {
          userId_date_kind: { userId, date: localDate, kind },
        },
      });
      if (existing?.status === 'SENT') {
        return true;
      }
    }
    return false;
  }
}

function isWithinLocalRetryWindow(
  timezone: string,
  targetHHMM: string,
  now: Date,
  windowMinutes: number,
): boolean {
  const elapsed = getLocalMinutesSinceTarget(timezone, targetHHMM, now);
  return elapsed !== null && elapsed > 0 && elapsed <= windowMinutes;
}
