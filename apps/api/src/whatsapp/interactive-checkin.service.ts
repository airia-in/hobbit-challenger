import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@workspace-starter/db';
import { PrismaService } from '../prisma/prisma.service';
import { ActivitiesService } from '../services/activities.service';
import { getUserLocalDate } from '../utils/day-window';
import { EvolutionApiClient } from './evolution.client';
import type { ParsedEvolutionInbound } from './evolution-inbound.types';
import { pickFocusHabit } from './interactive-checkin-focus';
import {
  INTERACTIVE_CHECKIN_REMINDER_KINDS,
  REST_DAY_KIND,
  SNOOZE_DURATION_MS,
  snoozeKindFor,
} from './interactive-checkin.constants';
import type { ReminderKind } from './openai-reminder.service';

@Injectable()
export class InteractiveCheckinService {
  private readonly logger = new Logger(InteractiveCheckinService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activitiesService: ActivitiesService,
    private readonly evolution: EvolutionApiClient,
  ) {}

  async handleInbound(parsed: ParsedEvolutionInbound): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { phone: parsed.phoneE164 },
      select: {
        id: true,
        phone: true,
        whatsappOptIn: true,
        timezone: true,
        group: { select: { challengeTimezone: true } },
      },
    });

    if (!user) {
      this.logger.debug('Inbound WhatsApp from unknown phone — ignored');
      return;
    }

    if (!user.whatsappOptIn) {
      this.logger.debug(
        `Inbound WhatsApp ignored for opted-out user ${user.id}`,
      );
      return;
    }

    if (!(await this.claimMessageId(parsed.messageId))) {
      return;
    }

    if (!parsed.replyKind) {
      return;
    }

    const timezone = user.group?.challengeTimezone ?? user.timezone;
    const localDate = getUserLocalDate(timezone);

    switch (parsed.replyKind) {
      case 'done':
        await this.handleDone(user.id, user.phone!);
        break;
      case 'snooze':
        await this.handleSnooze(user.id, localDate);
        await this.evolution.sendText(
          user.phone!,
          "I'll check back in about an hour.",
        );
        break;
      case 'rest':
        await this.handleRestDay(user.id, localDate);
        await this.evolution.sendText(
          user.phone!,
          'Rest day noted — see you tomorrow.',
        );
        break;
    }
  }

  private async claimMessageId(messageId: string): Promise<boolean> {
    try {
      await this.prisma.inboundMessageDedupe.create({
        data: { messageId },
      });
      return true;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return false;
      }
      throw error;
    }
  }

  private async handleDone(userId: string, phone: string): Promise<void> {
    const today = await this.activitiesService.getToday(this.prisma, userId);
    const habit = pickFocusHabit(today.scoredActivities);

    if (!habit) {
      await this.evolution.sendText(
        phone,
        'Nothing left to quick-log today — open your dashboard to finish up.',
      );
      return;
    }

    await this.activitiesService.markActivity(this.prisma, userId, habit.id);
  }

  private async handleSnooze(userId: string, localDate: Date): Promise<void> {
    const baseKind = await this.inferLastReminderKind(userId, localDate);
    const snoozeKind = snoozeKindFor(baseKind);
    const snoozeUntil = new Date(Date.now() + SNOOZE_DURATION_MS);

    await this.prisma.reminderLog.upsert({
      where: {
        userId_date_kind: { userId, date: localDate, kind: snoozeKind },
      },
      create: {
        userId,
        date: localDate,
        kind: snoozeKind,
        status: 'ACTIVE',
        sentAt: snoozeUntil,
      },
      update: {
        status: 'ACTIVE',
        sentAt: snoozeUntil,
      },
    });
  }

  private async handleRestDay(userId: string, localDate: Date): Promise<void> {
    await this.prisma.reminderLog.upsert({
      where: {
        userId_date_kind: { userId, date: localDate, kind: REST_DAY_KIND },
      },
      create: {
        userId,
        date: localDate,
        kind: REST_DAY_KIND,
        status: 'SENT',
      },
      update: {
        status: 'SENT',
        sentAt: new Date(),
      },
    });
  }

  private async inferLastReminderKind(
    userId: string,
    localDate: Date,
  ): Promise<ReminderKind> {
    const logs = await this.prisma.reminderLog.findMany({
      where: {
        userId,
        date: localDate,
        kind: { in: [...INTERACTIVE_CHECKIN_REMINDER_KINDS] },
        status: 'SENT',
      },
      orderBy: { sentAt: 'desc' },
      take: 1,
      select: { kind: true },
    });

    const kind = logs[0]?.kind;
    if (
      kind &&
      (INTERACTIVE_CHECKIN_REMINDER_KINDS as readonly string[]).includes(kind)
    ) {
      return kind as ReminderKind;
    }

    return 'MORNING';
  }
}
