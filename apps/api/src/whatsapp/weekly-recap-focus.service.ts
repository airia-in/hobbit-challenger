import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@workspace-starter/db';
import {
  parseWeeklyRecapReminderMetadata,
  type WeeklyRecapReminderMetadata,
} from '@workspace-starter/types';
import { PrismaService } from '../prisma/prisma.service';
import { sanitizeUserPromptText } from '../utils/sanitize-prompt-input';
import {
  formatLocalDateKey,
  getDatePartsInTimezone,
  parseLocalDateKey,
} from '../utils/day-window';
import { addDaysToDateKey } from '../utils/stats-aggregation';
import {
  WEEKLY_RECAP_KIND,
  WEEKLY_RECAP_TIME,
} from '../utils/weekly-recap-eligibility';

const RECAP_FOCUS_REPLY_MAX_MS = 7 * 24 * 60 * 60 * 1000;

type RecapFocusLogRow = {
  id: string;
  date: Date;
  sentAt: Date;
  metadata: unknown;
};

function parseTargetHHMM(
  targetHHMM: string,
): { targetHour: number; targetMinute: number } | null {
  const match = targetHHMM.match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }
  return {
    targetHour: Number(match[1]),
    targetMinute: Number(match[2]),
  };
}

export function getNextWeeklyRecapSlotUtc(
  sentAt: Date,
  timezone: string,
): Date {
  const sentKey = formatLocalDateKey(sentAt, timezone);
  const [year, month, day] = sentKey.split('-').map(Number);
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const daysUntilNextSunday = dayOfWeek === 0 ? 7 : 7 - dayOfWeek;
  const nextSundayKey = addDaysToDateKey(sentKey, daysUntilNextSunday);
  const target = parseTargetHHMM(WEEKLY_RECAP_TIME);
  if (!target) {
    return new Date(sentAt.getTime() + RECAP_FOCUS_REPLY_MAX_MS);
  }

  const base = parseLocalDateKey(nextSundayKey, timezone);
  const dayMs = 24 * 60 * 60 * 1000;
  for (let offset = 0; offset < dayMs; offset += 60_000) {
    const candidate = new Date(base.getTime() + offset);
    const parts = getDatePartsInTimezone(candidate, timezone);
    const key = formatLocalDateKey(candidate, timezone);
    if (
      key === nextSundayKey &&
      parts.hour === target.targetHour &&
      parts.minute === target.targetMinute
    ) {
      return candidate;
    }
  }

  return new Date(base.getTime() + 10 * 60 * 60 * 1000);
}

export function getRecapFocusReplyWindowEnd(
  sentAt: Date,
  timezone: string,
): Date {
  const maxBy7Days = new Date(sentAt.getTime() + RECAP_FOCUS_REPLY_MAX_MS);
  const nextSundaySlot = getNextWeeklyRecapSlotUtc(sentAt, timezone);
  return nextSundaySlot < maxBy7Days ? nextSundaySlot : maxBy7Days;
}

export function isRecapFocusReplyWindowOpen(
  sentAt: Date,
  timezone: string,
  now = new Date(),
): boolean {
  return (
    now.getTime() <= getRecapFocusReplyWindowEnd(sentAt, timezone).getTime()
  );
}

export function resolveRecapFocusChoice(
  metadata: WeeklyRecapReminderMetadata,
  index: 1 | 2 | 3,
): WeeklyRecapReminderMetadata['focusOptions'][number] | null {
  if (metadata.focusChoice) {
    return null;
  }
  if (index > metadata.focusOptions.length) {
    return null;
  }
  const option = metadata.focusOptions[index - 1];
  if (!option || option.index !== index) {
    return null;
  }
  return option;
}

@Injectable()
export class WeeklyRecapFocusService {
  private readonly logger = new Logger(WeeklyRecapFocusService.name);

  constructor(private readonly prisma: PrismaService) {}

  async handleFocusReply(
    userId: string,
    index: 1 | 2 | 3,
    timezone: string,
  ): Promise<void> {
    const log = await this.findOpenRecapFocusLog(userId);
    if (!log) {
      return;
    }

    if (!isRecapFocusReplyWindowOpen(log.sentAt, timezone)) {
      return;
    }

    const metadata = parseWeeklyRecapReminderMetadata(log.metadata);
    if (!metadata) {
      return;
    }

    const option = resolveRecapFocusChoice(metadata, index);
    if (!option) {
      return;
    }

    const sourceRecapWeekStartKey = formatLocalDateKey(log.date, timezone);
    const targetWeekStartKey = addDaysToDateKey(sourceRecapWeekStartKey, 7);
    const chosenAt = new Date().toISOString();
    const sanitizedName = sanitizeUserPromptText(option.name);
    const focusChoice = {
      index,
      activityId: option.activityId,
      name: sanitizedName,
      chosenAt,
    };
    const updatedMetadata: WeeklyRecapReminderMetadata = {
      ...metadata,
      focusChoice,
    };

    const claimed = await this.prisma.$transaction(async (tx) => {
      const logUpdate = await tx.reminderLog.updateMany({
        where: {
          id: log.id,
          metadata: {
            equals: metadata as Prisma.InputJsonValue,
          },
        },
        data: {
          metadata: updatedMetadata as Prisma.InputJsonValue,
        },
      });

      if (logUpdate.count === 0) {
        return false;
      }

      await tx.user.update({
        where: { id: userId },
        data: {
          recapFocus: {
            targetWeekStartKey,
            activityId: option.activityId,
            activityName: sanitizedName,
            sourceRecapWeekStartKey,
            chosenAt,
          },
        },
      });

      return true;
    });

    if (!claimed) {
      return;
    }

    this.logger.debug(
      `Stored recap focus for user ${userId}: ${sanitizedName} (${index})`,
    );
  }

  async findOpenRecapFocusLog(
    userId: string,
    now = new Date(),
  ): Promise<RecapFocusLogRow | null> {
    const replyWindowStart = new Date(now.getTime() - RECAP_FOCUS_REPLY_MAX_MS);
    const logs = await this.prisma.reminderLog.findMany({
      where: {
        userId,
        kind: WEEKLY_RECAP_KIND,
        status: 'SENT',
        sentAt: { gte: replyWindowStart },
      },
      orderBy: { sentAt: 'desc' },
      take: 20,
      select: {
        id: true,
        date: true,
        sentAt: true,
        metadata: true,
      },
    });

    for (const log of logs) {
      const metadata = parseWeeklyRecapReminderMetadata(log.metadata);
      if (metadata?.focusOptions?.length && !metadata.focusChoice) {
        return log;
      }
    }

    return null;
  }
}
