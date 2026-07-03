import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  BRAND_INTRO,
  type MilestoneKey,
  MILESTONE_DAY_REMINDER_KIND,
  getMilestoneDefinition,
  isShareCardMilestone,
  milestoneBatchSummaryLine,
} from '@workspace-starter/types';
import { loadPromptFile } from '../services/prompt-loader';
import type { PrismaService } from '../prisma/prisma.service';
import { EvolutionApiClient } from './evolution.client';
import {
  PRODUCT_EVENT_KEYS,
  trackProductEventFireAndForget,
  trackReminderSentFireAndForget,
} from '../services/analytics.service';
import {
  sanitizeFirstNameForCard,
  MilestoneCardService,
} from '../services/milestone-card.service';
import {
  buildReminderMessaging,
  type ReminderMessaging,
} from './openai-reminder.service';
import { shouldAttemptStreakFreezeMessageSend } from './streak-freeze-message.service';

export type MilestoneMessageStatus = 'SENT' | 'FAILED' | 'SKIPPED_OPTOUT';

export type MilestoneMessageContext = {
  name: string;
  milestoneTitle: string;
  unlockCopy: string;
  batchSummary?: string;
};

const PROMPT_FILE = 'milestone.jinja';

export function buildMilestoneFallback(
  context: MilestoneMessageContext,
  messaging: ReminderMessaging = buildReminderMessaging(),
): string {
  const batchLine = context.batchSummary ? ` ${context.batchSummary}` : '';
  return `${context.milestoneTitle} — ${context.unlockCopy}${batchLine} See your milestones: ${messaging.dashboardUrl}`;
}

export function interpolateMilestonePrompt(
  template: string,
  context: MilestoneMessageContext,
  messaging: ReminderMessaging,
): string {
  const replacements: Record<string, string> = {
    name: context.name,
    milestoneTitle: context.milestoneTitle,
    unlockCopy: context.batchSummary
      ? `${context.unlockCopy} ${context.batchSummary}`
      : context.unlockCopy,
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

/**
 * Milestone WhatsApp precedence (#134):
 * - Sends at day finalization (event-driven), not the morning cron slot.
 * - At most one message per user per local evaluation day; batched unlocks
 *   celebrate the most prestigious milestone and fold the rest into one line.
 * - Unsent unlocks do not queue retries on later days — dashboard is durable.
 */
@Injectable()
export class MilestoneMessageService {
  private readonly logger = new Logger(MilestoneMessageService.name);
  private readonly openai: OpenAI | null;
  private readonly model: string;
  private readonly messaging: ReminderMessaging;

  constructor(
    private readonly config: ConfigService,
    private readonly evolution: EvolutionApiClient,
    private readonly milestoneCard: MilestoneCardService,
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

  async compose(context: MilestoneMessageContext): Promise<string> {
    if (!this.openai) {
      return buildMilestoneFallback(context, this.messaging);
    }

    try {
      const prompt = await loadPromptFile(PROMPT_FILE);
      const systemPrompt = interpolateMilestonePrompt(
        prompt.system,
        context,
        this.messaging,
      );
      const userPrompt = interpolateMilestonePrompt(
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
      return content.includes(this.messaging.dashboardUrl)
        ? content
        : `${content} ${this.messaging.dashboardUrl}`;
    } catch (error) {
      this.logger.error('Milestone compose failed:', error);
      return buildMilestoneFallback(context, this.messaging);
    }
  }

  async trySendBatchUnlockMessage(input: {
    prisma: PrismaService;
    userId: string;
    userName: string;
    phone: string;
    evaluationDay: Date;
    primaryMilestoneKey: MilestoneKey;
    additionalUnlockCount: number;
    timezone: string;
    morningTime?: string;
    now?: Date;
  }): Promise<void> {
    const definition = getMilestoneDefinition(input.primaryMilestoneKey);
    const logKey = {
      userId: input.userId,
      date: input.evaluationDay,
      kind: MILESTONE_DAY_REMINDER_KIND,
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
      await this.upsertMilestoneLog(input.prisma, logKey, 'FAILED');
      return;
    }

    const batchSummary = milestoneBatchSummaryLine(input.additionalUnlockCount);
    const context: MilestoneMessageContext = {
      name: input.userName,
      milestoneTitle: definition.title,
      unlockCopy: definition.unlockCopy,
      ...(batchSummary ? { batchSummary } : {}),
    };

    const text = await this.compose(context);
    let status: MilestoneMessageStatus = 'FAILED';
    let mediaSent = false;
    let useTextFallback = !isShareCardMilestone(input.primaryMilestoneKey);

    if (isShareCardMilestone(input.primaryMilestoneKey)) {
      try {
        const card = await this.milestoneCard.getOrCreateCard({
          userId: input.userId,
          firstName: sanitizeFirstNameForCard(input.userName),
          milestoneKey: input.primaryMilestoneKey,
        });
        const mediaResult = await this.evolution.sendMedia(input.phone, {
          mediatype: 'image',
          mimetype: 'image/png',
          caption: text,
          media: card.buffer.toString('base64'),
          fileName: `hobbit-${input.primaryMilestoneKey}.png`,
        });
        if (mediaResult.ok) {
          status = 'SENT';
          mediaSent = true;
          trackProductEventFireAndForget(
            input.prisma,
            input.userId,
            PRODUCT_EVENT_KEYS.MILESTONE_SHARED,
            {
              milestoneKey: input.primaryMilestoneKey,
              channel: 'whatsapp',
            },
          );
        } else if (mediaResult.failureKind === 'client') {
          useTextFallback = true;
        }
      } catch (error) {
        this.logger.error('Milestone share card media failed:', error);
        useTextFallback = true;
      }
    }

    if (!mediaSent && useTextFallback) {
      const result = await this.evolution.sendText(input.phone, text);
      status = result.ok ? 'SENT' : 'FAILED';
    }

    await this.upsertMilestoneLog(input.prisma, logKey, status);
    trackReminderSentFireAndForget(
      input.prisma,
      input.userId,
      MILESTONE_DAY_REMINDER_KIND,
      status,
    );
  }

  /** @deprecated Per-key sends replaced by trySendBatchUnlockMessage. */
  async trySendUnlockMessage(input: {
    prisma: PrismaService;
    userId: string;
    userName: string;
    phone: string;
    evaluationDay: Date;
    milestoneKey: MilestoneKey;
    timezone: string;
    morningTime?: string;
    now?: Date;
  }): Promise<void> {
    await this.trySendBatchUnlockMessage({
      ...input,
      primaryMilestoneKey: input.milestoneKey,
      additionalUnlockCount: 0,
    });
  }

  private async upsertMilestoneLog(
    prisma: PrismaService,
    logKey: { userId: string; date: Date; kind: string },
    status: MilestoneMessageStatus,
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

export function shouldRetryMilestoneMessage(
  existing: { status: string } | null | undefined,
): boolean {
  if (!existing) return true;
  return existing.status === 'FAILED';
}
