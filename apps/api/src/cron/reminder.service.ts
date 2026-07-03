import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import {
  getDatePartsInTimezone,
  getUserLocalDate,
  addLocalDays,
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
import { WINBACK_KIND } from '../utils/winback-dormancy';
import {
  OpenAiReminderService,
  type ReminderKind,
} from '../whatsapp/openai-reminder.service';
import {
  STREAK_FREEZE_CONSUMED_KIND,
  shouldDeferMorningForStreakFreezeConsumed,
} from '../whatsapp/streak-freeze-message.service';
import {
  WinbackService,
  type WinbackDeferBatchContext,
} from './winback.service';
import { trackReminderSentFireAndForget } from '../services/analytics.service';
import {
  buildCheckinTextFallback,
  buildInteractiveReminderPayload,
} from '../whatsapp/interactive-checkin-buttons';
import {
  isInteractiveCheckinReminderKind,
  REST_DAY_KIND,
  snoozeKindFor,
} from '../whatsapp/interactive-checkin.constants';

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
    private readonly winbackService: WinbackService,
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

    const deferUsers = users.map((user) => ({
      id: user.id,
      reminderTime: user.reminderTime,
      challengeTimezone: user.group?.challengeTimezone ?? user.timezone,
    }));
    const deferBatch =
      await this.winbackService.loadDeferBatchContext(deferUsers);

    for (const user of users) {
      try {
        await this.processUserReminders(user, deferBatch);
      } catch (error) {
        this.logger.error(`Reminder failed for user ${user.id}:`, error);
      }
    }
  }

  private async processUserReminders(
    user: {
      id: string;
      name: string;
      phone: string | null;
      timezone: string;
      reminderTime: string | null;
      whatsappOptIn: boolean;
      group: { challengeTimezone: string | null } | null;
    },
    deferBatch: WinbackDeferBatchContext,
  ): Promise<void> {
    const reminderTimezone = user.group?.challengeTimezone ?? user.timezone;

    if (!user.phone || !user.whatsappOptIn) {
      const localDate = getUserLocalDate(reminderTimezone);
      await this.recordSkippedOptout(user.id, localDate, 'MORNING');
      await this.recordSkippedOptout(user.id, localDate, 'RECOVERY');
      await this.recordSkippedOptout(user.id, localDate, 'STREAK_AT_RISK');
      await this.recordSkippedOptout(user.id, localDate, 'EVENING');
      await this.recordSkippedOptout(user.id, localDate, WINBACK_KIND);
      return;
    }

    const localDate = getUserLocalDate(reminderTimezone);

    if (await this.hasRestDay(user.id, localDate)) {
      return;
    }

    if (this.shouldDeferToWinback(user, reminderTimezone, deferBatch)) {
      return;
    }
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
        const yesterday = addLocalDays(localDate, -1, reminderTimezone);
        const consumeLog = await this.prisma.reminderLog.findUnique({
          where: {
            userId_date_kind: {
              userId: user.id,
              date: yesterday,
              kind: STREAK_FREEZE_CONSUMED_KIND,
            },
          },
        });
        if (
          !shouldDeferMorningForStreakFreezeConsumed(
            consumeLog,
            reminderTimezone,
          )
        ) {
          await this.trySendReminder(user, localDate, 'MORNING', context);
        }
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

  /**
   * WINBACK defers while it owns the actionable morning window or has SENT today.
   */
  private shouldDeferToWinback(
    user: {
      id: string;
      reminderTime: string | null;
      group: { challengeTimezone: string | null } | null;
      timezone: string;
    },
    reminderTimezone: string,
    deferBatch: WinbackDeferBatchContext,
  ): boolean {
    return this.winbackService.shouldDeferRemindersForUser(
      {
        userId: user.id,
        challengeTimezone: reminderTimezone,
        reminderTime: user.reminderTime,
      },
      deferBatch,
    );
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

    if (isInteractiveCheckinReminderKind(kind)) {
      if (await this.shouldSkipForActiveSnooze(user.id, localDate, kind)) {
        return;
      }
      await this.consumeExpiredSnoozeIfNeeded(user.id, localDate, kind);
    }

    const context =
      prebuiltContext ??
      (await this.contextService.buildContext(this.prisma, user.id, user.name));

    const text = await this.openAiReminder.compose(kind, context);
    let result: { ok: boolean; error?: string };

    if (isInteractiveCheckinReminderKind(kind)) {
      const buttonsPayload = buildInteractiveReminderPayload(text);
      const buttonsResult = await this.evolution.sendButtons(
        user.phone!,
        buttonsPayload,
      );
      if (buttonsResult.ok) {
        result = buttonsResult;
      } else {
        result = await this.evolution.sendText(
          user.phone!,
          buildCheckinTextFallback(text),
        );
      }
    } else {
      result = await this.evolution.sendText(user.phone!, text);
    }

    const status: ReminderStatus = result.ok ? 'SENT' : 'FAILED';
    await this.upsertReminderLog(user.id, localDate, kind, status);
    trackReminderSentFireAndForget(this.prisma, user.id, kind, status);
  }

  private async recordSkippedOptout(
    userId: string,
    localDate: Date,
    kind: ReminderKind | typeof WINBACK_KIND,
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

  private async hasRestDay(userId: string, localDate: Date): Promise<boolean> {
    const restDay = await this.prisma.reminderLog.findUnique({
      where: {
        userId_date_kind: {
          userId,
          date: localDate,
          kind: REST_DAY_KIND,
        },
      },
    });
    return restDay?.status === 'SENT';
  }

  private async shouldSkipForActiveSnooze(
    userId: string,
    localDate: Date,
    kind: ReminderKind,
  ): Promise<boolean> {
    const snoozeKind = snoozeKindFor(kind);
    const snooze = await this.prisma.reminderLog.findUnique({
      where: {
        userId_date_kind: { userId, date: localDate, kind: snoozeKind },
      },
    });
    return Boolean(
      snooze?.status === 'ACTIVE' && snooze.sentAt.getTime() > Date.now(),
    );
  }

  private async consumeExpiredSnoozeIfNeeded(
    userId: string,
    localDate: Date,
    kind: ReminderKind,
  ): Promise<void> {
    const snoozeKind = snoozeKindFor(kind);
    const snooze = await this.prisma.reminderLog.findUnique({
      where: {
        userId_date_kind: { userId, date: localDate, kind: snoozeKind },
      },
    });
    if (snooze?.status === 'ACTIVE' && snooze.sentAt.getTime() <= Date.now()) {
      await this.prisma.reminderLog.update({
        where: {
          userId_date_kind: { userId, date: localDate, kind: snoozeKind },
        },
        data: { status: 'CONSUMED' },
      });
    }
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
