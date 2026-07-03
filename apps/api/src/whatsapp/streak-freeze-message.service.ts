import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { BRAND_INTRO } from '@workspace-starter/types';
import { loadPromptFile } from '../services/prompt-loader';
import {
  formatLocalDateKey,
  getLocalMinutesSinceTarget,
  isLocalTimeMatch,
  isWithinLocalCatchUpWindow,
} from '../utils/day-window';
import type { PrismaService } from '../prisma/prisma.service';
import { EvolutionApiClient } from './evolution.client';
import { trackReminderSentFireAndForget } from '../services/analytics.service';
import {
  buildReminderMessaging,
  type ReminderMessaging,
} from './openai-reminder.service';

/** ReminderLog kind for one-shot streak-freeze grant messages. */
export const STREAK_FREEZE_GRANTED_KIND = 'STREAK_FREEZE_GRANTED';

/** ReminderLog kind for one-shot streak-freeze consume messages. */
export const STREAK_FREEZE_CONSUMED_KIND = 'STREAK_FREEZE_CONSUMED';

export const STREAK_FREEZE_DEFAULT_MORNING_TIME = '08:00';
export const STREAK_FREEZE_RETRY_CATCH_UP_MINUTES = 15;

export type StreakFreezeMessageStatus = 'SENT' | 'FAILED' | 'SKIPPED_OPTOUT';

export type StreakFreezeGrantContext = {
  name: string;
  currentStreak: number;
  streakFreezesAvailable: number;
};

export type StreakFreezeConsumeContext = {
  name: string;
  currentStreak: number;
};

type StreakFreezeLogRow = {
  status: string;
  sentAt?: Date | null;
};

/** Only a successful send records SENT; FAILED rows are retried on later cron ticks. */
export function shouldRetryStreakFreezeGrant(
  existing: { status: string } | null | undefined,
): boolean {
  if (!existing) {
    return true;
  }
  return existing.status === 'FAILED';
}

export function shouldRetryStreakFreezeConsume(
  existing: { status: string } | null | undefined,
): boolean {
  return shouldRetryStreakFreezeGrant(existing);
}

/**
 * Gate send/retry for streak-freeze one-shots: skip terminal rows, avoid FAILED
 * churn when Evolution is down, and cap configured retries to one morning slot
 * per local day.
 */
export function shouldAttemptStreakFreezeMessageSend(
  existing: StreakFreezeLogRow | null | undefined,
  options: {
    evolutionConfigured: boolean;
    timezone: string;
    morningTime?: string;
    now?: Date;
  },
): boolean {
  if (!existing) {
    return true;
  }
  if (existing.status === 'SENT' || existing.status === 'SKIPPED_OPTOUT') {
    return false;
  }
  if (existing.status !== 'FAILED') {
    return true;
  }

  if (!options.evolutionConfigured) {
    return false;
  }

  const morningTime = options.morningTime ?? STREAK_FREEZE_DEFAULT_MORNING_TIME;
  const now = options.now ?? new Date();
  const inMorningSlot =
    isLocalTimeMatch(options.timezone, morningTime, now) ||
    isWithinLocalCatchUpWindow(
      options.timezone,
      morningTime,
      now,
      STREAK_FREEZE_RETRY_CATCH_UP_MINUTES,
    );

  if (!inMorningSlot) {
    return false;
  }

  if (!existing.sentAt) {
    return true;
  }

  const lastAttemptKey = formatLocalDateKey(existing.sentAt, options.timezone);
  const todayKey = formatLocalDateKey(now, options.timezone);
  if (lastAttemptKey !== todayKey) {
    return true;
  }

  const lastElapsed = getLocalMinutesSinceTarget(
    options.timezone,
    morningTime,
    existing.sentAt,
  );
  return lastElapsed === null;
}

/** Defer generic MORNING when a consume one-shot was delivered earlier today. */
export function shouldDeferMorningForStreakFreezeConsumed(
  consumeLog: StreakFreezeLogRow | null | undefined,
  timezone: string,
  now = new Date(),
): boolean {
  if (consumeLog?.status !== 'SENT' || !consumeLog.sentAt) {
    return false;
  }
  return (
    formatLocalDateKey(consumeLog.sentAt, timezone) ===
    formatLocalDateKey(now, timezone)
  );
}

const GRANT_PROMPT_FILE = 'streak-freeze-granted.jinja';
const CONSUME_PROMPT_FILE = 'streak-freeze-consumed.jinja';

export function buildStreakFreezeGrantFallback(
  context: StreakFreezeGrantContext,
  messaging: ReminderMessaging = buildReminderMessaging(),
): string {
  return `${context.currentStreak} days on the trail — you've earned a rain cloak! It will cover one missed day this week. Log at ${messaging.dashboardUrl} 🧥`;
}

/** @deprecated Use buildStreakFreezeGrantFallback */
export const buildStreakFreezeFallback = buildStreakFreezeGrantFallback;

export function buildStreakFreezeConsumeFallback(
  context: StreakFreezeConsumeContext,
  messaging: ReminderMessaging = buildReminderMessaging(),
): string {
  return `Your rain cloak covered yesterday — your ${context.currentStreak}-day streak is still going! Log today at ${messaging.dashboardUrl} 🧥`;
}

export function interpolateStreakFreezeGrantPrompt(
  template: string,
  context: StreakFreezeGrantContext,
  messaging: ReminderMessaging,
): string {
  const replacements: Record<string, string> = {
    name: context.name,
    currentStreak: String(context.currentStreak),
    streakFreezesAvailable: String(context.streakFreezesAvailable),
    brandName: messaging.brandName,
    brandIntro: BRAND_INTRO,
    dashboardUrl: messaging.dashboardUrl,
  };

  let result = template;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

export function interpolateStreakFreezeConsumePrompt(
  template: string,
  context: StreakFreezeConsumeContext,
  messaging: ReminderMessaging,
): string {
  const replacements: Record<string, string> = {
    name: context.name,
    currentStreak: String(context.currentStreak),
    brandName: messaging.brandName,
    brandIntro: BRAND_INTRO,
    dashboardUrl: messaging.dashboardUrl,
  };

  let result = template;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

/** @deprecated Use interpolateStreakFreezeGrantPrompt */
export const interpolateStreakFreezePrompt = interpolateStreakFreezeGrantPrompt;

@Injectable()
export class StreakFreezeMessageService {
  private readonly logger = new Logger(StreakFreezeMessageService.name);
  private readonly openai: OpenAI | null;
  private readonly model: string;
  private readonly messaging: ReminderMessaging;

  constructor(
    private readonly config: ConfigService,
    private readonly evolution: EvolutionApiClient,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    const baseURL = this.config.get<string>('OPENAI_BASE_URL');
    this.model =
      this.config.get<string>('OPENAI_VISION_MODEL') ?? 'gpt-4o-mini';
    this.messaging = buildReminderMessaging(
      this.config.get<string>('WEB_DOMAIN'),
    );

    if (apiKey) {
      this.openai = new OpenAI({
        apiKey,
        baseURL: baseURL || undefined,
      });
    } else {
      this.openai = null;
    }
  }

  async composeGrant(context: StreakFreezeGrantContext): Promise<string> {
    if (!this.openai) {
      return buildStreakFreezeGrantFallback(context, this.messaging);
    }

    try {
      const prompt = await loadPromptFile(GRANT_PROMPT_FILE);
      const systemPrompt = interpolateStreakFreezeGrantPrompt(
        prompt.system,
        context,
        this.messaging,
      );
      const userPrompt = interpolateStreakFreezeGrantPrompt(
        prompt.user,
        context,
        this.messaging,
      );

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 120,
      });

      const content = response.choices[0]?.message?.content?.trim();
      if (!content) {
        throw new Error('Empty OpenAI response');
      }
      return content;
    } catch (error) {
      this.logger.error('Streak freeze grant compose failed:', error);
      return buildStreakFreezeGrantFallback(context, this.messaging);
    }
  }

  /** @deprecated Use composeGrant */
  async compose(context: StreakFreezeGrantContext): Promise<string> {
    return this.composeGrant(context);
  }

  async composeConsume(context: StreakFreezeConsumeContext): Promise<string> {
    if (!this.openai) {
      return buildStreakFreezeConsumeFallback(context, this.messaging);
    }

    try {
      const prompt = await loadPromptFile(CONSUME_PROMPT_FILE);
      const systemPrompt = interpolateStreakFreezeConsumePrompt(
        prompt.system,
        context,
        this.messaging,
      );
      const userPrompt = interpolateStreakFreezeConsumePrompt(
        prompt.user,
        context,
        this.messaging,
      );

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 120,
      });

      const content = response.choices[0]?.message?.content?.trim();
      if (!content) {
        throw new Error('Empty OpenAI response');
      }
      return content;
    } catch (error) {
      this.logger.error('Streak freeze consume compose failed:', error);
      return buildStreakFreezeConsumeFallback(context, this.messaging);
    }
  }

  async trySendGrantMessage(input: {
    prisma: PrismaService;
    userId: string;
    userName: string;
    phone: string;
    evaluationDay: Date;
    currentStreak: number;
    streakFreezesAvailable: number;
    timezone: string;
    morningTime?: string;
    now?: Date;
  }): Promise<void> {
    const logKey = {
      userId: input.userId,
      date: input.evaluationDay,
      kind: STREAK_FREEZE_GRANTED_KIND,
    };

    const existing = await input.prisma.reminderLog.findUnique({
      where: { userId_date_kind: logKey },
    });

    const evolutionConfigured = this.evolution.isConfigured();
    if (
      !shouldAttemptStreakFreezeMessageSend(existing, {
        evolutionConfigured,
        timezone: input.timezone,
        morningTime: input.morningTime,
        now: input.now,
      })
    ) {
      return;
    }

    if (!evolutionConfigured) {
      await this.upsertStreakFreezeLog(input.prisma, logKey, 'FAILED');
      return;
    }

    const context: StreakFreezeGrantContext = {
      name: input.userName,
      currentStreak: input.currentStreak,
      streakFreezesAvailable: input.streakFreezesAvailable,
    };

    const text = await this.composeGrant(context);
    const result = await this.evolution.sendText(input.phone, text);
    const status: StreakFreezeMessageStatus = result.ok ? 'SENT' : 'FAILED';

    await this.upsertStreakFreezeLog(input.prisma, logKey, status);
    trackReminderSentFireAndForget(
      input.prisma,
      input.userId,
      STREAK_FREEZE_GRANTED_KIND,
      status,
    );
  }

  async trySendConsumeMessage(input: {
    prisma: PrismaService;
    userId: string;
    userName: string;
    phone: string;
    evaluationDay: Date;
    currentStreak: number;
    timezone: string;
    morningTime?: string;
    now?: Date;
  }): Promise<void> {
    const logKey = {
      userId: input.userId,
      date: input.evaluationDay,
      kind: STREAK_FREEZE_CONSUMED_KIND,
    };

    const existing = await input.prisma.reminderLog.findUnique({
      where: { userId_date_kind: logKey },
    });

    const evolutionConfigured = this.evolution.isConfigured();
    if (
      !shouldAttemptStreakFreezeMessageSend(existing, {
        evolutionConfigured,
        timezone: input.timezone,
        morningTime: input.morningTime,
        now: input.now,
      })
    ) {
      return;
    }

    if (!evolutionConfigured) {
      await this.upsertStreakFreezeLog(input.prisma, logKey, 'FAILED');
      return;
    }

    const context: StreakFreezeConsumeContext = {
      name: input.userName,
      currentStreak: input.currentStreak,
    };

    const text = await this.composeConsume(context);
    const result = await this.evolution.sendText(input.phone, text);
    const status: StreakFreezeMessageStatus = result.ok ? 'SENT' : 'FAILED';

    await this.upsertStreakFreezeLog(input.prisma, logKey, status);
    trackReminderSentFireAndForget(
      input.prisma,
      input.userId,
      STREAK_FREEZE_CONSUMED_KIND,
      status,
    );
  }

  private async upsertStreakFreezeLog(
    prisma: PrismaService,
    logKey: { userId: string; date: Date; kind: string },
    status: StreakFreezeMessageStatus,
  ): Promise<void> {
    await prisma.reminderLog.upsert({
      where: { userId_date_kind: logKey },
      create: {
        userId: logKey.userId,
        date: logKey.date,
        kind: logKey.kind,
        status,
      },
      update: {
        status,
        sentAt: new Date(),
      },
    });
  }
}
