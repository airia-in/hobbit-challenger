import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { BRAND_INTRO } from '@workspace-starter/types';
import { sanitizeFirstNameForCard } from '../services/milestone-card.service';
import { loadPromptFile } from '../services/prompt-loader';
import type { PrismaService } from '../prisma/prisma.service';
import {
  sanitizeUserPromptText,
  USER_NAME_MAX_LENGTH,
  wrapUserPromptEmbedData,
} from '../utils/sanitize-prompt-input';
import {
  BUDDY_SUMMARY_KIND,
  shouldRetryBuddySummary,
} from '../utils/buddy-summary-eligibility';
import type { WeeklyRecapRollup } from '../utils/weekly-recap-rollup';
import { EvolutionApiClient } from './evolution.client';
import { trackReminderSentFireAndForget } from '../services/analytics.service';
import {
  buildReminderMessaging,
  type ReminderMessaging,
} from './openai-reminder.service';

const PROMPT_FILE = 'buddy-summary.jinja';

export type BuddySummaryStatus = 'SENT' | 'FAILED' | 'SKIPPED_OPTOUT';

export type BuddySummaryMessageContext = {
  recipientName: string;
  partnerName: string;
  rollup: WeeklyRecapRollup;
};

/** First-name display for WhatsApp copy. */
export function sanitizeBuddyDisplayName(raw: string): string {
  const firstName = sanitizeFirstNameForCard(raw);
  return firstName === 'Traveler' ? 'Member' : firstName;
}

/** Sanitized + structurally wrapped name for LLM prompt embedding. */
export function sanitizeBuddyNameForPrompt(raw: string): string {
  const sanitized =
    sanitizeUserPromptText(
      sanitizeBuddyDisplayName(raw),
      USER_NAME_MAX_LENGTH,
    ) || 'Member';
  return wrapUserPromptEmbedData(sanitized);
}

/**
 * Supportive, guilt-free variants (Hobbit voice, no trademarked fantasy names).
 * "Same trail, different pace" framing — celebrate the buddy, never rank/shame.
 */
const BUDDY_SUMMARY_FALLBACK_VARIANTS: readonly string[] = [
  'Hey {{recipientName}}, {{brandName}} here — {{partnerSummary}} Same trail, different pace. Send them a cheer: {{dashboardUrl}}',
  'Hi {{recipientName}}! {{brandName}} checking in on your trail buddy. {{partnerSummary}} Walk on together: {{dashboardUrl}}',
  'Sunday buddy note, {{recipientName}}! {{brandName}} here — {{partnerSummary}} You two keep each other going. {{dashboardUrl}}',
];

export function buddySummaryFallbackSeed(
  context: BuddySummaryMessageContext,
): number {
  const input = `${context.recipientName}:${context.partnerName}:${context.rollup.weekStartKey}:BUDDY_SUMMARY`;
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pickVariant<T>(variants: readonly T[], seed: number): T {
  return variants[seed % variants.length]!;
}

export function ensureBuddySummaryDashboardUrl(
  text: string,
  messaging: ReminderMessaging,
): string {
  if (text.includes(messaging.dashboardUrl)) {
    return text;
  }
  return `${text} ${messaging.dashboardUrl}`;
}

/** Aggregate-only, supportive one-liner about the partner's week. */
export function buildPartnerSummaryLine(
  partnerName: string,
  rollup: WeeklyRecapRollup,
): string {
  const displayName = sanitizeBuddyDisplayName(partnerName);
  const core = `${displayName} hit ${rollup.daysShowedUp}/${rollup.eligibleDays} days this week`;
  const streak =
    rollup.streakEnd > 0 ? ` and is on a ${rollup.streakEnd}-day streak` : '';
  return `${core}${streak}.`;
}

export function buildBuddySummaryCopyLines(
  context: BuddySummaryMessageContext,
  forPrompt = false,
): Record<string, string> {
  const { rollup } = context;
  const recipientName = forPrompt
    ? sanitizeBuddyNameForPrompt(context.recipientName)
    : sanitizeBuddyDisplayName(context.recipientName);
  const partnerName = forPrompt
    ? sanitizeBuddyNameForPrompt(context.partnerName)
    : sanitizeBuddyDisplayName(context.partnerName);
  const sanitizedBestHabit = rollup.bestHabitName
    ? sanitizeUserPromptText(rollup.bestHabitName)
    : '';
  const displayPartner = sanitizeBuddyDisplayName(context.partnerName);
  const bestHabitLine =
    sanitizedBestHabit && rollup.bestHabitHits > 0
      ? `${displayPartner}'s steady habit: ${sanitizedBestHabit} (${rollup.bestHabitHits} hits).`
      : '';

  return {
    recipientName,
    partnerName,
    weekStartKey: rollup.weekStartKey,
    weekEndKey: rollup.weekEndKey,
    eligibleDays: String(rollup.eligibleDays),
    daysShowedUp: String(rollup.daysShowedUp),
    perfectDays: String(rollup.perfectDays),
    totalHabitsHit: String(rollup.totalHabitsHit),
    streakEnd: String(rollup.streakEnd),
    bestHabitLine,
    partnerSummary: buildPartnerSummaryLine(context.partnerName, rollup),
  };
}

export function buildBuddySummaryFallback(
  context: BuddySummaryMessageContext,
  messaging: ReminderMessaging = buildReminderMessaging(),
  seed = buddySummaryFallbackSeed(context),
): string {
  const template = pickVariant(BUDDY_SUMMARY_FALLBACK_VARIANTS, seed);
  const copyLines = buildBuddySummaryCopyLines(context);
  return template
    .replaceAll('{{recipientName}}', copyLines.recipientName)
    .replaceAll('{{brandName}}', messaging.brandName)
    .replaceAll('{{partnerSummary}}', copyLines.partnerSummary)
    .replaceAll('{{dashboardUrl}}', messaging.dashboardUrl);
}

export function interpolateBuddySummaryPrompt(
  template: string,
  context: BuddySummaryMessageContext,
  messaging: ReminderMessaging,
): string {
  const copyLines = buildBuddySummaryCopyLines(context, true);
  const replacements: Record<string, string> = {
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
export class BuddySummaryMessageService {
  private readonly logger = new Logger(BuddySummaryMessageService.name);
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

  async compose(context: BuddySummaryMessageContext): Promise<string> {
    if (!this.openai) {
      return buildBuddySummaryFallback(context, this.messaging);
    }

    try {
      const prompt = await loadPromptFile(PROMPT_FILE);
      const systemPrompt = interpolateBuddySummaryPrompt(
        prompt.system,
        context,
        this.messaging,
      );
      const userPrompt = interpolateBuddySummaryPrompt(
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
        max_tokens: 160,
      });

      const content = response.choices[0]?.message?.content?.trim();
      if (!content) {
        throw new Error('Empty OpenAI response');
      }
      return ensureBuddySummaryDashboardUrl(content, this.messaging);
    } catch (error) {
      this.logger.error('Buddy summary compose failed:', error);
      return buildBuddySummaryFallback(context, this.messaging);
    }
  }

  async trySendBuddySummary(input: {
    prisma: PrismaService;
    recipientId: string;
    phone: string;
    logDate: Date;
    context: BuddySummaryMessageContext;
    existingLog?: { status: string } | null;
  }): Promise<void> {
    const logKey = {
      userId: input.recipientId,
      date: input.logDate,
      kind: BUDDY_SUMMARY_KIND,
    };

    const existing =
      input.existingLog ??
      (await input.prisma.reminderLog.findUnique({
        where: { userId_date_kind: logKey },
      }));

    if (existing?.status === 'SENT' || existing?.status === 'SKIPPED_OPTOUT') {
      return;
    }

    if (!shouldRetryBuddySummary(existing)) {
      return;
    }

    if (!this.evolution.isConfigured()) {
      await this.upsertBuddySummaryLog(input.prisma, logKey, 'FAILED');
      return;
    }

    const text = await this.compose(input.context);
    const result = await this.evolution.sendText(input.phone, text);
    const status: BuddySummaryStatus = result.ok ? 'SENT' : 'FAILED';

    await this.upsertBuddySummaryLog(input.prisma, logKey, status);
    trackReminderSentFireAndForget(
      input.prisma,
      input.recipientId,
      BUDDY_SUMMARY_KIND,
      status,
    );
  }

  private async upsertBuddySummaryLog(
    prisma: PrismaService,
    logKey: { userId: string; date: Date; kind: string },
    status: BuddySummaryStatus,
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
