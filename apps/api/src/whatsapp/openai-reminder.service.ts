import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  BRAND_INTRO,
  BRAND_NAME,
  BRAND_TAGLINE,
  buildDashboardUrl,
} from '@workspace-starter/types';
import { loadPromptFile } from '../services/prompt-loader';
import type { ReminderContext } from './reminder-context.service';

export type ReminderKind = 'MORNING' | 'EVENING';

const PROMPT_FILES: Record<ReminderKind, string> = {
  MORNING: 'reminder-morning.jinja',
  EVENING: 'reminder-evening.jinja',
};

const DEFAULT_WEB_DOMAIN = 'hobbit.drcode.ai';

export type ReminderMessaging = {
  brandName: string;
  brandIntro: string;
  brandTagline: string;
  dashboardUrl: string;
};

export function buildReminderMessaging(
  webDomain = DEFAULT_WEB_DOMAIN,
): ReminderMessaging {
  return {
    brandName: BRAND_NAME,
    brandIntro: BRAND_INTRO,
    brandTagline: BRAND_TAGLINE,
    dashboardUrl: buildDashboardUrl(webDomain),
  };
}

@Injectable()
export class OpenAiReminderService {
  private readonly logger = new Logger(OpenAiReminderService.name);
  private readonly openai: OpenAI | null;
  private readonly model: string;
  private readonly messaging: ReminderMessaging;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    const baseURL = this.config.get<string>('OPENAI_BASE_URL');
    this.model =
      this.config.get<string>('OPENAI_VISION_MODEL') ?? 'gpt-4o-mini';
    this.messaging = buildReminderMessaging(
      this.config.get<string>('WEB_DOMAIN') ?? DEFAULT_WEB_DOMAIN,
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

  async compose(kind: ReminderKind, context: ReminderContext): Promise<string> {
    if (!this.openai) {
      return buildFallbackMessage(kind, context, this.messaging);
    }

    try {
      const prompt = await loadPromptFile(PROMPT_FILES[kind]);
      const systemPrompt = interpolatePrompt(
        prompt.system,
        context,
        kind,
        this.messaging,
      );
      const userPrompt = interpolatePrompt(
        prompt.user,
        context,
        kind,
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
      this.logger.error(`Reminder compose failed (${kind}):`, error);
      return buildFallbackMessage(kind, context, this.messaging);
    }
  }
}

export function interpolatePrompt(
  template: string,
  context: ReminderContext,
  kind: ReminderKind,
  messaging: ReminderMessaging = buildReminderMessaging(),
): string {
  const rankLine =
    context.rank != null ? `Current leaderboard rank: ${context.rank}.` : '';

  const replacements: Record<string, string> = {
    name: context.name,
    dayNumber: String(context.dayNumber),
    tasksDone: String(context.tasksDone),
    tasksRemaining: String(context.tasksRemaining),
    todayNetXp: String(context.todayNetXp),
    xpAtRisk: String(context.xpAtRisk),
    totalXp: String(context.totalXp),
    rank: context.rank != null ? String(context.rank) : '',
    rankLine,
    brandName: messaging.brandName,
    brandIntro: messaging.brandIntro,
    brandTagline: messaging.brandTagline,
    dashboardUrl: messaging.dashboardUrl,
  };

  let result = template;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }

  // Remove leftover handlebars-style conditionals from prompt templates
  result = result.replace(/\{\{#if rank\}\}[\s\S]*?\{\{\/if\}\}/g, rankLine);
  result = result.replace(/\{\{[^}]+\}\}/g, '');

  void kind;
  return result.trim();
}

function appendDashboardLink(
  message: string,
  context: ReminderContext,
  messaging: ReminderMessaging,
): string {
  if (context.tasksRemaining <= 0) {
    return message;
  }

  return `${message} Log them: ${messaging.dashboardUrl}`;
}

export function buildFallbackMessage(
  kind: ReminderKind,
  context: ReminderContext,
  messaging: ReminderMessaging = buildReminderMessaging(),
): string {
  const rankSuffix =
    context.rank != null ? ` You're rank #${context.rank}.` : '';

  if (kind === 'MORNING') {
    if (context.tasksRemaining <= 0) {
      return `Good morning, ${context.name}! ${messaging.brandName} here — day ${context.dayNumber} is looking clear.${rankSuffix}`;
    }

    return appendDashboardLink(
      `Good morning, ${context.name}! ${messaging.brandName} here — day ${context.dayNumber} with ${context.tasksRemaining} task(s) left.${rankSuffix}`,
      context,
      messaging,
    );
  }

  return appendDashboardLink(
    `Hi ${context.name}, ${messaging.brandName} here — ${context.tasksRemaining} task(s) still open and ${context.xpAtRisk} XP at risk before midnight. Annoying, I know.${rankSuffix}`,
    context,
    messaging,
  );
}
