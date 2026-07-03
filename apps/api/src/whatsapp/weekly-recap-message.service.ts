import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { BRAND_INTRO } from '@workspace-starter/types';
import { loadPromptFile } from '../services/prompt-loader';
import type { PrismaService } from '../prisma/prisma.service';
import {
  shouldRetryWeeklyRecap,
  WEEKLY_RECAP_KIND,
} from '../utils/weekly-recap-eligibility';
import {
  summarizeWeeklyRecapRollup,
  type WeeklyRecapRollup,
} from '../utils/weekly-recap-rollup';
import { EvolutionApiClient } from './evolution.client';
import { trackReminderSentFireAndForget } from '../services/analytics.service';
import {
  buildReminderMessaging,
  type ReminderMessaging,
} from './openai-reminder.service';

const PROMPT_FILE = 'weekly-recap.jinja';

export type WeeklyRecapStatus = 'SENT' | 'FAILED' | 'SKIPPED_OPTOUT';

export type WeeklyRecapMessageContext = {
  name: string;
  rollup: WeeklyRecapRollup;
};

const WEEKLY_RECAP_FALLBACK_VARIANTS: readonly string[] = [
  'Sunday story time, {{name}}! {{brandName}} here — {{weekSummary}} See the trail: {{dashboardUrl}}',
  'Hey {{name}}, {{brandName}} here with your week on the path. {{weekSummary}} {{dashboardUrl}}',
  'Hi {{name}}! {{brandName}} here — campfire review for the week. {{weekSummary}} {{dashboardUrl}}',
];

export function weeklyRecapFallbackSeed(
  context: WeeklyRecapMessageContext,
): number {
  const input = `${context.name}:${context.rollup.weekStartKey}:WEEKLY_RECAP`;
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pickVariant<T>(variants: readonly T[], seed: number): T {
  return variants[seed % variants.length]!;
}

export function ensureWeeklyRecapDashboardUrl(
  text: string,
  messaging: ReminderMessaging,
): string {
  if (text.includes(messaging.dashboardUrl)) {
    return text;
  }
  return `${text} ${messaging.dashboardUrl}`;
}

export function buildWeeklyRecapCopyLines(
  rollup: WeeklyRecapRollup,
): Record<string, string> {
  const bestHabitLine =
    rollup.bestHabitName && rollup.bestHabitHits > 0
      ? `Strongest habit: ${rollup.bestHabitName} (${rollup.bestHabitHits} hits).`
      : '';

  const themedIntro =
    rollup.perfectDays >= 3
      ? 'Milestone weather on the trail this week.'
      : rollup.daysShowedUp >= Math.ceil(rollup.eligibleDays * 0.5)
        ? 'Steady footsteps — the path remembers.'
        : 'Every small log leaves a mark on the map.';

  return {
    weekStartKey: rollup.weekStartKey,
    weekEndKey: rollup.weekEndKey,
    eligibleDays: String(rollup.eligibleDays),
    daysShowedUp: String(rollup.daysShowedUp),
    perfectDays: String(rollup.perfectDays),
    totalHabitsHit: String(rollup.totalHabitsHit),
    weekXp: String(rollup.weekXp),
    streakStart: String(rollup.streakStart),
    streakEnd: String(rollup.streakEnd),
    bestHabitLine,
    identityReflectionLine: rollup.identityReflectionLine,
    nextWeekNudgeLine: rollup.nextWeekNudgeLine,
    themedIntro,
    weekSummary: summarizeWeeklyRecapRollup(rollup),
  };
}

export function buildWeeklyRecapFallback(
  context: WeeklyRecapMessageContext,
  messaging: ReminderMessaging = buildReminderMessaging(),
  seed = weeklyRecapFallbackSeed(context),
): string {
  const template = pickVariant(WEEKLY_RECAP_FALLBACK_VARIANTS, seed);
  const copyLines = buildWeeklyRecapCopyLines(context.rollup);
  const filled = template
    .replaceAll('{{name}}', context.name)
    .replaceAll('{{brandName}}', messaging.brandName)
    .replaceAll('{{weekSummary}}', copyLines.weekSummary)
    .replaceAll('{{dashboardUrl}}', messaging.dashboardUrl);
  return filled;
}

export function interpolateWeeklyRecapPrompt(
  template: string,
  context: WeeklyRecapMessageContext,
  messaging: ReminderMessaging,
): string {
  const copyLines = buildWeeklyRecapCopyLines(context.rollup);
  const replacements: Record<string, string> = {
    name: context.name,
    brandName: messaging.brandName,
    brandIntro: BRAND_INTRO,
    brandTagline: messaging.brandTagline,
    dashboardUrl: messaging.dashboardUrl,
    ...copyLines,
  };

  let result = template;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  result = result.replace(/\{\{[^}]+\}\}/g, '');
  return result.trim();
}

@Injectable()
export class WeeklyRecapMessageService {
  private readonly logger = new Logger(WeeklyRecapMessageService.name);
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

  async compose(context: WeeklyRecapMessageContext): Promise<string> {
    if (!this.openai) {
      return buildWeeklyRecapFallback(context, this.messaging);
    }

    try {
      const prompt = await loadPromptFile(PROMPT_FILE);
      const systemPrompt = interpolateWeeklyRecapPrompt(
        prompt.system,
        context,
        this.messaging,
      );
      const userPrompt = interpolateWeeklyRecapPrompt(
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
        max_tokens: 180,
      });

      const content = response.choices[0]?.message?.content?.trim();
      if (!content) {
        throw new Error('Empty OpenAI response');
      }
      return ensureWeeklyRecapDashboardUrl(content, this.messaging);
    } catch (error) {
      this.logger.error('Weekly recap compose failed:', error);
      return buildWeeklyRecapFallback(context, this.messaging);
    }
  }

  async trySendWeeklyRecap(input: {
    prisma: PrismaService;
    userId: string;
    phone: string;
    logDate: Date;
    context: WeeklyRecapMessageContext;
  }): Promise<void> {
    const logKey = {
      userId: input.userId,
      date: input.logDate,
      kind: WEEKLY_RECAP_KIND,
    };

    const existing = await input.prisma.reminderLog.findUnique({
      where: { userId_date_kind: logKey },
    });

    if (existing?.status === 'SENT' || existing?.status === 'SKIPPED_OPTOUT') {
      return;
    }

    if (!shouldRetryWeeklyRecap(existing)) {
      return;
    }

    if (!this.evolution.isConfigured()) {
      await this.upsertWeeklyRecapLog(input.prisma, logKey, 'FAILED');
      return;
    }

    const text = await this.compose(input.context);
    const result = await this.evolution.sendText(input.phone, text);
    const status: WeeklyRecapStatus = result.ok ? 'SENT' : 'FAILED';

    await this.upsertWeeklyRecapLog(input.prisma, logKey, status);
    trackReminderSentFireAndForget(
      input.prisma,
      input.userId,
      WEEKLY_RECAP_KIND,
      status,
    );
  }

  private async upsertWeeklyRecapLog(
    prisma: PrismaService,
    logKey: { userId: string; date: Date; kind: string },
    status: WeeklyRecapStatus,
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
