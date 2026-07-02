import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { BRAND_INTRO } from '@workspace-starter/types';
import { loadPromptFile } from '../services/prompt-loader';
import type { PrismaService } from '../prisma/prisma.service';
import { EvolutionApiClient } from './evolution.client';
import {
  buildReminderMessaging,
  type ReminderMessaging,
} from './openai-reminder.service';

/** ReminderLog kind for one-shot streak-freeze grant messages. */
export const STREAK_FREEZE_GRANTED_KIND = 'STREAK_FREEZE_GRANTED';

export type StreakFreezeGrantStatus = 'SENT' | 'FAILED' | 'SKIPPED_OPTOUT';

/** Only a successful send records SENT; FAILED rows are retried on later cron ticks. */
export function shouldRetryStreakFreezeGrant(
  existing: { status: string } | null | undefined,
): boolean {
  if (!existing) {
    return true;
  }
  return existing.status === 'FAILED';
}

const PROMPT_FILE = 'streak-freeze-granted.jinja';

export type StreakFreezeGrantContext = {
  name: string;
  currentStreak: number;
  streakFreezesAvailable: number;
};

export function buildStreakFreezeFallback(
  context: StreakFreezeGrantContext,
  messaging: ReminderMessaging = buildReminderMessaging(),
): string {
  return `${context.currentStreak} days on the trail — you've earned a rain cloak! It will cover one missed day this week. Log at ${messaging.dashboardUrl} 🧥`;
}

export function interpolateStreakFreezePrompt(
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

  async compose(context: StreakFreezeGrantContext): Promise<string> {
    if (!this.openai) {
      return buildStreakFreezeFallback(context, this.messaging);
    }

    try {
      const prompt = await loadPromptFile(PROMPT_FILE);
      const systemPrompt = interpolateStreakFreezePrompt(
        prompt.system,
        context,
        this.messaging,
      );
      const userPrompt = interpolateStreakFreezePrompt(
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
      return buildStreakFreezeFallback(context, this.messaging);
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
  }): Promise<void> {
    const logKey = {
      userId: input.userId,
      date: input.evaluationDay,
      kind: STREAK_FREEZE_GRANTED_KIND,
    };

    const existing = await input.prisma.reminderLog.findUnique({
      where: { userId_date_kind: logKey },
    });

    if (existing?.status === 'SENT' || existing?.status === 'SKIPPED_OPTOUT') {
      return;
    }

    if (!this.evolution.isConfigured()) {
      await this.upsertGrantLog(input.prisma, logKey, 'FAILED');
      return;
    }

    const context: StreakFreezeGrantContext = {
      name: input.userName,
      currentStreak: input.currentStreak,
      streakFreezesAvailable: input.streakFreezesAvailable,
    };

    const text = await this.compose(context);
    const result = await this.evolution.sendText(input.phone, text);
    const status: StreakFreezeGrantStatus = result.ok ? 'SENT' : 'FAILED';

    await this.upsertGrantLog(input.prisma, logKey, status);
  }

  private async upsertGrantLog(
    prisma: PrismaService,
    logKey: { userId: string; date: Date; kind: string },
    status: StreakFreezeGrantStatus,
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
