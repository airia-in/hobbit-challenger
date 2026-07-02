import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import {
  getDatePartsInTimezone,
  getUserLocalDate,
  isLocalTimeMatch,
  isWithinLocalCatchUpWindow,
  parseLocalDateKey,
} from '../utils/day-window';
import { EvolutionApiClient } from '../whatsapp/evolution.client';
import {
  hasEveningReminderEligibility,
  hasRecoveryReminderEligibility,
  hasStreakAtRiskReminderEligibility,
  ReminderContext,
  ReminderContextService,
  shouldDeferEveningToStreakAtRisk,
} from '../whatsapp/reminder-context.service';
import {
  OpenAiReminderService,
  type ReminderKind,
} from '../whatsapp/openai-reminder.service';

const DEFAULT_MORNING_TIME = '08:00';
const STREAK_AT_RISK_TIME = '18:00';
const EVENING_TIME = '21:00';
const FAILED_RETRY_WINDOW_MINUTES = 15;
const FIRST_SEND_CATCH_UP_MINUTES = 15;
/** 18:00–20:59; 21:00 evening block owns final catch-up + EVENING fallback. */
const STREAK_AT_RISK_SLOT_CATCH_UP_MINUTES = 179;
const STREAK_AT_RISK_RETRY_MINUTES = 180;

type ReminderStatus = 'SENT' | 'FAILED' | 'SKIPPED_OPTOUT';

@Injectable()
export class ReminderService {
  private readonly logger = new Logger(ReminderService.name);
  private loggedUnconfigured = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly evolution: EvolutionApiClient,
    private readonly contextService: ReminderContextService,
    private readonly openAiReminder: OpenAiReminderService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async processReminders(): Promise<void> {
    if (!this.evolution.isConfigured()) {
      if (!this.loggedUnconfigured) {
        this.logger.debug(
          'Evolution API not configured — skipping WhatsApp reminders',
        );
        this.loggedUnconfigured = true;
      }
      return;
    }

    const users = await this.prisma.user.findMany({
      where: {
        phone: { not: null },
        whatsappOptIn: true,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        timezone: true,
        reminderTime: true,
        whatsappOptIn: true,
        group: { select: { challengeTimezone: true } },
      },
    });

    for (const user of users) {
      try {
        await this.processUserReminders(user);
      } catch (error) {
        this.logger.error(`Reminder failed for user ${user.id}:`, error);
      }
    }
  }

  private async processUserReminders(user: {
    id: string;
    name: string;
    phone: string | null;
    timezone: string;
    reminderTime: string | null;
    whatsappOptIn: boolean;
    group: { challengeTimezone: string | null } | null;
  }): Promise<void> {
    const reminderTimezone = user.group?.challengeTimezone ?? user.timezone;

    if (!user.phone || !user.whatsappOptIn) {
      const localDate = getUserLocalDate(reminderTimezone);
      await this.recordSkippedOptout(user.id, localDate, 'MORNING');
      await this.recordSkippedOptout(user.id, localDate, 'RECOVERY');
      await this.recordSkippedOptout(user.id, localDate, 'STREAK_AT_RISK');
      await this.recordSkippedOptout(user.id, localDate, 'EVENING');
      return;
    }

    const localDate = getUserLocalDate(reminderTimezone);
    const morningTime = user.reminderTime ?? DEFAULT_MORNING_TIME;
    const morningWindowActive =
      isLocalTimeMatch(reminderTimezone, morningTime) ||
      isWithinLocalCatchUpWindow(
        reminderTimezone,
        morningTime,
        new Date(),
        FIRST_SEND_CATCH_UP_MINUTES,
      ) ||
      (await this.shouldRetryFailedReminder(
        user.id,
        localDate,
        'MORNING',
        reminderTimezone,
        morningTime,
      ));

    if (morningWindowActive) {
      const context = await this.contextService.buildContext(
        this.prisma,
        user.id,
        user.name,
      );
      if (hasRecoveryReminderEligibility(context)) {
        const recoveryDate = parseLocalDateKey(
          context.recoveryBreakDate!,
          reminderTimezone,
        );
        const recoveryDue =
          isLocalTimeMatch(reminderTimezone, morningTime) ||
          isWithinLocalCatchUpWindow(
            reminderTimezone,
            morningTime,
            new Date(),
            FIRST_SEND_CATCH_UP_MINUTES,
          ) ||
          (await this.shouldRetryFailedReminder(
            user.id,
            recoveryDate,
            'RECOVERY',
            reminderTimezone,
            morningTime,
          ));
        if (recoveryDue) {
          await this.trySendReminder(user, recoveryDate, 'RECOVERY', context);
        }
      } else if (morningWindowActive) {
        await this.trySendReminder(user, localDate, 'MORNING', context);
      }
    }

    const morningSlotBlocksStreakAtRisk =
      morningTime === STREAK_AT_RISK_TIME &&
      (isLocalTimeMatch(reminderTimezone, morningTime) ||
        isWithinLocalCatchUpWindow(
          reminderTimezone,
          morningTime,
          new Date(),
          FIRST_SEND_CATCH_UP_MINUTES,
        ) ||
        (await this.shouldRetryFailedReminder(
          user.id,
          localDate,
          'MORNING',
          reminderTimezone,
          morningTime,
        )));

    const streakAtRiskSlotDue =
      !morningSlotBlocksStreakAtRisk &&
      (await this.shouldProcessReminderSlot(
        user.id,
        localDate,
        reminderTimezone,
        STREAK_AT_RISK_TIME,
        ['STREAK_AT_RISK'],
        STREAK_AT_RISK_SLOT_CATCH_UP_MINUTES,
        STREAK_AT_RISK_RETRY_MINUTES,
      ));

    if (streakAtRiskSlotDue) {
      const context = await this.contextService.buildContext(
        this.prisma,
        user.id,
        user.name,
      );
      if (hasStreakAtRiskReminderEligibility(context)) {
        await this.trySendReminder(user, localDate, 'STREAK_AT_RISK', context);
      }
    }

    const eveningSlotDue = await this.shouldProcessReminderSlot(
      user.id,
      localDate,
      reminderTimezone,
      EVENING_TIME,
      ['EVENING'],
      FIRST_SEND_CATCH_UP_MINUTES,
    );

    if (eveningSlotDue) {
      const context = await this.contextService.buildContext(
        this.prisma,
        user.id,
        user.name,
      );
      const streakAtRiskSent = await this.hasSentReminder(
        user.id,
        localDate,
        'STREAK_AT_RISK',
      );

      if (hasStreakAtRiskReminderEligibility(context) && !streakAtRiskSent) {
        await this.trySendReminder(user, localDate, 'STREAK_AT_RISK', context);
      }

      const streakAtRiskSentAfterCatchUp = await this.hasSentReminder(
        user.id,
        localDate,
        'STREAK_AT_RISK',
      );

      if (
        hasEveningReminderEligibility(context) &&
        !shouldDeferEveningToStreakAtRisk(context, streakAtRiskSentAfterCatchUp)
      ) {
        await this.trySendReminder(user, localDate, 'EVENING', context);
      }
    }
  }

  private async shouldProcessReminderSlot(
    userId: string,
    localDate: Date,
    timezone: string,
    targetTime: string,
    kinds: ReminderKind[],
    catchUpWindowMinutes: number,
    failedRetryWindowMinutes = FAILED_RETRY_WINDOW_MINUTES,
  ): Promise<boolean> {
    if (isLocalTimeMatch(timezone, targetTime)) {
      return true;
    }

    for (const kind of kinds) {
      if (
        await this.shouldRetryFailedReminder(
          userId,
          localDate,
          kind,
          timezone,
          targetTime,
          failedRetryWindowMinutes,
        )
      ) {
        return true;
      }
    }

    if (
      !isWithinLocalCatchUpWindow(
        timezone,
        targetTime,
        new Date(),
        catchUpWindowMinutes,
      )
    ) {
      return false;
    }

    for (const kind of kinds) {
      const existing = await this.prisma.reminderLog.findUnique({
        where: {
          userId_date_kind: {
            userId,
            date: localDate,
            kind,
          },
        },
      });
      if (!existing) {
        return true;
      }
    }

    return false;
  }

  private async shouldRetryFailedReminder(
    userId: string,
    localDate: Date,
    kind: ReminderKind,
    timezone: string,
    reminderTime: string,
    retryWindowMinutes = FAILED_RETRY_WINDOW_MINUTES,
  ): Promise<boolean> {
    if (
      !isWithinLocalRetryWindow(
        timezone,
        reminderTime,
        new Date(),
        retryWindowMinutes,
      )
    ) {
      return false;
    }

    const existing = await this.prisma.reminderLog.findUnique({
      where: {
        userId_date_kind: {
          userId,
          date: localDate,
          kind,
        },
      },
    });

    return existing?.status === 'FAILED';
  }

  private async hasSentReminder(
    userId: string,
    localDate: Date,
    kind: ReminderKind,
  ): Promise<boolean> {
    const existing = await this.prisma.reminderLog.findUnique({
      where: {
        userId_date_kind: {
          userId,
          date: localDate,
          kind,
        },
      },
    });
    return existing?.status === 'SENT';
  }

  private async trySendReminder(
    user: {
      id: string;
      name: string;
      phone: string | null;
      timezone: string;
    },
    localDate: Date,
    kind: ReminderKind,
    prebuiltContext?: ReminderContext,
  ): Promise<void> {
    const existing = await this.prisma.reminderLog.findUnique({
      where: {
        userId_date_kind: {
          userId: user.id,
          date: localDate,
          kind,
        },
      },
    });

    if (existing?.status === 'SENT' || existing?.status === 'SKIPPED_OPTOUT') {
      return;
    }

    const context =
      prebuiltContext ??
      (await this.contextService.buildContext(this.prisma, user.id, user.name));

    const text = await this.openAiReminder.compose(kind, context);
    const result = await this.evolution.sendText(user.phone!, text);

    const status: ReminderStatus = result.ok ? 'SENT' : 'FAILED';
    await this.upsertReminderLog(user.id, localDate, kind, status);
  }

  private async recordSkippedOptout(
    userId: string,
    localDate: Date,
    kind: ReminderKind,
  ): Promise<void> {
    const existing = await this.prisma.reminderLog.findUnique({
      where: {
        userId_date_kind: { userId, date: localDate, kind },
      },
    });
    if (existing) {
      return;
    }

    await this.prisma.reminderLog.create({
      data: {
        userId,
        date: localDate,
        kind,
        status: 'SKIPPED_OPTOUT',
      },
    });
  }

  private async upsertReminderLog(
    userId: string,
    date: Date,
    kind: ReminderKind,
    status: ReminderStatus,
  ): Promise<void> {
    await this.prisma.reminderLog.upsert({
      where: {
        userId_date_kind: { userId, date, kind },
      },
      create: {
        userId,
        date,
        kind,
        status,
      },
      update: {
        status,
        sentAt: new Date(),
      },
    });
  }
}

export function isWithinLocalRetryWindow(
  timezone: string,
  targetHHMM: string,
  now = new Date(),
  windowMinutes = FAILED_RETRY_WINDOW_MINUTES,
): boolean {
  const [targetHour, targetMinute] = targetHHMM.split(':').map(Number);
  if (
    Number.isNaN(targetHour) ||
    Number.isNaN(targetMinute) ||
    targetHour < 0 ||
    targetHour > 23 ||
    targetMinute < 0 ||
    targetMinute > 59
  ) {
    return false;
  }

  const { hour, minute } = getDatePartsInTimezone(now, timezone);
  const currentMinutes = hour * 60 + minute;
  const targetMinutes = targetHour * 60 + targetMinute;
  const elapsedMinutes = currentMinutes - targetMinutes;

  return elapsedMinutes > 0 && elapsedMinutes <= windowMinutes;
}
