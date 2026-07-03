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

/** ReminderLog kind for one-shot web day-complete acknowledgments (#140). */
export const CHECKIN_ACK_KIND = 'CHECKIN_ACK';

export type CheckinAckStatus = 'SENT' | 'FAILED' | 'SKIPPED_OPTOUT';

export type CheckinAckStreakBucket = 'fresh' | 'building' | 'strong';

export type CheckinAckContext = {
  name: string;
  currentStreak: number;
  todayNetXp: number;
  tasksDone: number;
  streakBucket: CheckinAckStreakBucket;
};

const PROMPT_FILE = 'checkin-ack.jinja';

const CHECKIN_ACK_FALLBACK_VARIANTS: readonly string[] = [
  "Pack's empty, {{name}} — I saw that from here. {{streakLine}}",
  'Every scored habit logged today. Nice work on the trail, {{name}}. {{streakLine}}',
  "The pack's clear for today, {{name}}. {{streakLine}}",
  "I caught that from here — today's habits are done, {{name}}. {{streakLine}}",
];

/**
 * At most one ack per user per local day. Any existing ReminderLog row blocks a
 * second send (including undo/redo), mirroring dashboard confetti dedupe.
 */
export function shouldAttemptCheckinAck(
  existing: { status: string } | null | undefined,
): boolean {
  return !existing;
}

export function resolveCheckinAckStreakBucket(
  currentStreak: number,
): CheckinAckStreakBucket {
  if (currentStreak >= 7) {
    return 'strong';
  }
  if (currentStreak >= 1) {
    return 'building';
  }
  return 'fresh';
}

export function buildCheckinAckStreakLine(
  currentStreak: number,
  todayNetXp: number,
): string {
  if (currentStreak >= 7) {
    return `${currentStreak} days on the trail — keep that campfire warm.`;
  }
  if (currentStreak >= 1) {
    return `${currentStreak}-day streak rolling.`;
  }
  if (todayNetXp > 0) {
    return `+${todayNetXp} XP in the pack today.`;
  }
  return 'Fresh path tomorrow.';
}

export function checkinAckFallbackSeed(context: CheckinAckContext): number {
  const input = `${context.name}:${context.currentStreak}:${context.tasksDone}:CHECKIN_ACK`;
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pickVariant<T>(variants: readonly T[], seed: number): T {
  return variants[seed % variants.length]!;
}

export function buildCheckinAckFallback(
  context: CheckinAckContext,
  messaging: ReminderMessaging = buildReminderMessaging(),
  seed = checkinAckFallbackSeed(context),
): string {
  const template = pickVariant(CHECKIN_ACK_FALLBACK_VARIANTS, seed);
  const streakLine = buildCheckinAckStreakLine(
    context.currentStreak,
    context.todayNetXp,
  );
  return template
    .replaceAll('{{name}}', context.name)
    .replaceAll('{{streakLine}}', streakLine)
    .replaceAll('{{brandName}}', messaging.brandName);
}

export function interpolateCheckinAckPrompt(
  template: string,
  context: CheckinAckContext,
  messaging: ReminderMessaging,
): string {
  const replacements: Record<string, string> = {
    name: context.name,
    currentStreak: String(context.currentStreak),
    todayNetXp: String(context.todayNetXp),
    tasksDone: String(context.tasksDone),
    streakBucket: context.streakBucket,
    brandName: messaging.brandName,
    brandIntro: BRAND_INTRO,
  };

  let result = template;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

@Injectable()
export class CheckinAckMessageService {
  private readonly logger = new Logger(CheckinAckMessageService.name);
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

  async compose(context: CheckinAckContext): Promise<string> {
    if (!this.openai) {
      return buildCheckinAckFallback(context, this.messaging);
    }

    try {
      const prompt = await loadPromptFile(PROMPT_FILE);
      const systemPrompt = interpolateCheckinAckPrompt(
        prompt.system,
        context,
        this.messaging,
      );
      const userPrompt = interpolateCheckinAckPrompt(
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
      this.logger.error('Check-in ack compose failed:', error);
      return buildCheckinAckFallback(context, this.messaging);
    }
  }

  async trySendDayCompleteAck(input: {
    prisma: PrismaService;
    userId: string;
    userName: string;
    phone: string | null;
    whatsappOptIn: boolean;
    localDay: Date;
    timezone: string;
    currentStreak: number;
    todayNetXp: number;
    tasksDone: number;
  }): Promise<void> {
    try {
      const logKey = {
        userId: input.userId,
        date: input.localDay,
        kind: CHECKIN_ACK_KIND,
      };

      const existing = await input.prisma.reminderLog.findUnique({
        where: { userId_date_kind: logKey },
      });

      if (!shouldAttemptCheckinAck(existing)) {
        return;
      }

      if (!input.phone || !input.whatsappOptIn) {
        return;
      }

      const evolutionConfigured = this.evolution.isConfigured();
      if (!evolutionConfigured) {
        await this.upsertCheckinAckLog(input.prisma, logKey, 'FAILED');
        return;
      }

      const context: CheckinAckContext = {
        name: input.userName,
        currentStreak: input.currentStreak,
        todayNetXp: input.todayNetXp,
        tasksDone: input.tasksDone,
        streakBucket: resolveCheckinAckStreakBucket(input.currentStreak),
      };

      const text = await this.compose(context);
      const result = await this.evolution.sendText(input.phone, text);
      const status: CheckinAckStatus = result.ok ? 'SENT' : 'FAILED';

      await this.upsertCheckinAckLog(input.prisma, logKey, status);
    } catch (error) {
      this.logger.error('Check-in ack send failed:', error);
    }
  }

  private async upsertCheckinAckLog(
    prisma: PrismaService,
    logKey: { userId: string; date: Date; kind: string },
    status: CheckinAckStatus,
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
