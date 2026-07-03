import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { BRAND_INTRO } from '@workspace-starter/types';
import { loadPromptFile } from '../services/prompt-loader';
import type { PrismaService } from '../prisma/prisma.service';
import { WINBACK_KIND, shouldRetryWinback } from '../utils/winback-dormancy';
import { EvolutionApiClient } from './evolution.client';
import { trackReminderSentFireAndForget } from '../services/analytics.service';
import {
  buildReminderMessaging,
  type ReminderMessaging,
} from './openai-reminder.service';

const PROMPT_FILE = 'winback.jinja';

export type WinbackStatus = 'SENT' | 'FAILED' | 'SKIPPED_OPTOUT';

export type WinbackContext = {
  name: string;
  dayNumber: number;
  dormantDays: number;
  rank: number | null;
};

const WINBACK_FALLBACK_VARIANTS: readonly string[] = [
  'Hey {{name}}, {{brandName}} here — the trail waited while you rested. Pick the smallest thing today: {{dashboardUrl}}',
  'Morning, {{name}}! {{brandName}} here — your campfire stayed warm. One tiny log is enough to start: {{dashboardUrl}}',
  'Hi {{name}}, {{brandName}} here — day {{dayNumber}} kept a spot for you. Smallest habit, fresh path: {{dashboardUrl}}',
];

export function winbackFallbackSeed(context: WinbackContext): number {
  const input = `${context.name}:${context.dayNumber}:WINBACK`;
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pickVariant<T>(variants: readonly T[], seed: number): T {
  return variants[seed % variants.length]!;
}

export function ensureWinbackDashboardUrl(
  text: string,
  messaging: ReminderMessaging,
): string {
  if (text.includes(messaging.dashboardUrl)) {
    return text;
  }
  return `${text} ${messaging.dashboardUrl}`;
}
export function buildWinbackFallback(
  context: WinbackContext,
  messaging: ReminderMessaging = buildReminderMessaging(),
  seed = winbackFallbackSeed(context),
): string {
  const template = pickVariant(WINBACK_FALLBACK_VARIANTS, seed);
  const rankSuffix =
    context.rank != null ? ` You're rank #${context.rank}.` : '';
  const filled = template
    .replaceAll('{{name}}', context.name)
    .replaceAll('{{brandName}}', messaging.brandName)
    .replaceAll('{{dayNumber}}', String(context.dayNumber))
    .replaceAll('{{dashboardUrl}}', messaging.dashboardUrl);
  return `${filled}${rankSuffix}`;
}

export function interpolateWinbackPrompt(
  template: string,
  context: WinbackContext,
  messaging: ReminderMessaging,
): string {
  const rankLine =
    context.rank != null ? `Current leaderboard rank: ${context.rank}.` : '';
  const themedIntro =
    context.dormantDays >= 7
      ? 'Long quiet stretch — a single small step reopens the path.'
      : 'A few days off the trail — no rush, just a gentle nudge back.';

  const replacements: Record<string, string> = {
    name: context.name,
    dayNumber: String(context.dayNumber),
    dormantDays: String(context.dormantDays),
    brandName: messaging.brandName,
    brandIntro: BRAND_INTRO,
    brandTagline: messaging.brandTagline,
    dashboardUrl: messaging.dashboardUrl,
    themedIntro,
    rankLine,
  };

  let result = template;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }

  result = result.replace(/\{\{#if rank\}\}[\s\S]*?\{\{\/if\}\}/g, rankLine);
  result = result.replace(/\{\{[^}]+\}\}/g, '');

  return result.trim();
}

@Injectable()
export class WinbackMessageService {
  private readonly logger = new Logger(WinbackMessageService.name);
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

  async compose(context: WinbackContext): Promise<string> {
    if (!this.openai) {
      return buildWinbackFallback(context, this.messaging);
    }

    try {
      const prompt = await loadPromptFile(PROMPT_FILE);
      const systemPrompt = interpolateWinbackPrompt(
        prompt.system,
        context,
        this.messaging,
      );
      const userPrompt = interpolateWinbackPrompt(
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
      return ensureWinbackDashboardUrl(content, this.messaging);
    } catch (error) {
      this.logger.error('Winback compose failed:', error);
      return buildWinbackFallback(context, this.messaging);
    }
  }

  async trySendWinback(input: {
    prisma: PrismaService;
    userId: string;
    phone: string;
    localDate: Date;
    context: WinbackContext;
  }): Promise<void> {
    const logKey = {
      userId: input.userId,
      date: input.localDate,
      kind: WINBACK_KIND,
    };

    const existing = await input.prisma.reminderLog.findUnique({
      where: { userId_date_kind: logKey },
    });

    if (existing?.status === 'SENT' || existing?.status === 'SKIPPED_OPTOUT') {
      return;
    }

    if (!shouldRetryWinback(existing)) {
      return;
    }

    if (!this.evolution.isConfigured()) {
      await this.upsertWinbackLog(input.prisma, logKey, 'FAILED');
      return;
    }

    const text = await this.compose(input.context);
    const result = await this.evolution.sendText(input.phone, text);
    const status: WinbackStatus = result.ok ? 'SENT' : 'FAILED';

    await this.upsertWinbackLog(input.prisma, logKey, status);
    trackReminderSentFireAndForget(
      input.prisma,
      input.userId,
      WINBACK_KIND,
      status,
    );
  }

  private async upsertWinbackLog(
    prisma: PrismaService,
    logKey: { userId: string; date: Date; kind: string },
    status: WinbackStatus,
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
