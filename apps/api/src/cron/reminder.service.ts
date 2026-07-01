import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import {
  getDatePartsInTimezone,
  getUserLocalDate,
  isLocalTimeMatch,
} from '../utils/day-window';
import { EvolutionApiClient } from '../whatsapp/evolution.client';
import {
  hasEveningReminderEligibility,
  ReminderContextService,
} from '../whatsapp/reminder-context.service';
import {
  OpenAiReminderService,
  type ReminderKind,
} from '../whatsapp/openai-reminder.service';

const DEFAULT_MORNING_TIME = '08:00';
const EVENING_TIME = '21:00';
const FAILED_RETRY_WINDOW_MINUTES = 15;

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
  }): Promise<void> {
    if (!user.phone || !user.whatsappOptIn) {
      const localDate = getUserLocalDate(user.timezone);
      await this.recordSkippedOptout(user.id, localDate, 'MORNING');
      await this.recordSkippedOptout(user.id, localDate, 'EVENING');
      return;
    }

    const localDate = getUserLocalDate(user.timezone);
    const morningTime = user.reminderTime ?? DEFAULT_MORNING_TIME;

    if (
      isLocalTimeMatch(user.timezone, morningTime) ||
      (await this.shouldRetryFailedReminder(
        user.id,
        localDate,
        'MORNING',
        user.timezone,
        morningTime,
      ))
    ) {
      await this.trySendReminder(user, localDate, 'MORNING');
    }

    if (
      isLocalTimeMatch(user.timezone, EVENING_TIME) ||
      (await this.shouldRetryFailedReminder(
        user.id,
        localDate,
        'EVENING',
        user.timezone,
        EVENING_TIME,
      ))
    ) {
      const context = await this.contextService.buildContext(
        this.prisma,
        user.id,
        user.name,
      );
      if (hasEveningReminderEligibility(context)) {
        await this.trySendReminder(user, localDate, 'EVENING', context);
      }
    }
  }

  private async shouldRetryFailedReminder(
    userId: string,
    localDate: Date,
    kind: ReminderKind,
    timezone: string,
    reminderTime: string,
  ): Promise<boolean> {
    if (!isWithinLocalRetryWindow(timezone, reminderTime)) {
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

  private async trySendReminder(
    user: {
      id: string;
      name: string;
      phone: string | null;
      timezone: string;
    },
    localDate: Date,
    kind: ReminderKind,
    prebuiltContext?: Awaited<
      ReturnType<ReminderContextService['buildContext']>
    >,
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
