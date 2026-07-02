import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TRPCError } from '@trpc/server';
import {
  BRAND_INTRO,
  BRAND_NAME,
  BRAND_TAGLINE,
  buildDashboardUrl,
  getGuidance,
  type ActivityGuidance,
} from '@workspace-starter/types';
import type { Activity } from '@workspace-starter/db';
import OpenAI from 'openai';
import type { PrismaService } from '../prisma/prisma.service';
import { loadPromptFile } from './prompt-loader';

export type GuidanceChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type GuidanceAskInput = {
  activityId: string;
  question: string;
  history?: GuidanceChatMessage[];
};

export type GuidanceAskResult = {
  available: boolean;
  answer: string | null;
};

const GUIDANCE_ASK_PROMPT = 'guidance-ask.md';

@Injectable()
export class GuidanceService {
  private readonly logger = new Logger(GuidanceService.name);
  private readonly openai: OpenAI | null;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    const baseURL = this.config.get<string>('OPENAI_BASE_URL');
    this.model =
      this.config.get<string>('OPENAI_VISION_MODEL') ?? 'gpt-4o-mini';

    if (apiKey) {
      this.openai = new OpenAI({
        apiKey,
        baseURL: baseURL || undefined,
      });
    } else {
      this.openai = null;
    }
  }

  async ask(
    prisma: PrismaService,
    userId: string,
    input: GuidanceAskInput,
  ): Promise<GuidanceAskResult> {
    if (!this.openai) {
      return { available: false, answer: null };
    }

    const activity = await this.loadActivityForUser(
      prisma,
      userId,
      input.activityId,
    );
    const prompt = await loadPromptFile(GUIDANCE_ASK_PROMPT);
    const context = buildGuidanceContext(activity.title, activity.seedKey);
    const webDomain =
      this.config.get<string>('WEB_DOMAIN') ?? 'hobbit.drcode.ai';
    const systemPrompt = interpolateGuidancePrompt(prompt.system, {
      activityTitle: activity.title,
      ...context,
      brandName: BRAND_NAME,
      brandIntro: BRAND_INTRO,
      brandTagline: BRAND_TAGLINE,
      dashboardUrl: buildDashboardUrl(webDomain),
      question: input.question,
    });

    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...(input.history ?? []),
          { role: 'user', content: input.question },
        ],
        max_tokens: 300,
      });

      const answer = response.choices[0]?.message?.content?.trim();
      if (!answer) {
        throw new Error('Empty OpenAI response');
      }

      return { available: true, answer };
    } catch (error) {
      this.logger.error('Guidance ask failed:', error);
      return { available: false, answer: null };
    }
  }

  private async loadActivityForUser(
    prisma: PrismaService,
    userId: string,
    activityId: string,
  ): Promise<Activity> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
    }

    const activity = await prisma.activity.findUnique({
      where: { id: activityId },
    });
    if (!activity || !activity.active) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Activity not found' });
    }

    if (activity.isPersonal && activity.ownerUserId === userId) {
      return activity;
    }
    if (activity.groupId && activity.groupId === user.groupId) {
      return activity;
    }

    throw new TRPCError({ code: 'NOT_FOUND', message: 'Activity not found' });
  }
}

export function buildGuidanceContext(
  activityTitle: string,
  seedKey: string | null,
): { ruleBlock: string; tipsText: string } {
  const guidance = getGuidance(seedKey);
  if (!guidance) {
    return {
      ruleBlock: `No canonical rule block exists for this custom activity ("${activityTitle}"). Do not invent strict scoring rules — help the member interpret their own goal honestly.`,
      tipsText: 'No curated tips are available for this custom activity.',
    };
  }

  const ruleParts = [guidance.ruleBlock];
  const tipParts = [formatTipsSection(guidance.tips)];

  if (guidance.subPoints) {
    for (const [key, sub] of Object.entries(guidance.subPoints) as Array<
      [string, NonNullable<ActivityGuidance['subPoints']>[string]]
    >) {
      ruleParts.push(`[${key}] ${sub.ruleBlock}`);
      tipParts.push(formatTipsSection(sub.tips, key));
    }
  }

  return {
    ruleBlock: ruleParts.join('\n\n'),
    tipsText: tipParts.join('\n\n'),
  };
}

function formatTipsSection(
  tips: {
    title: string;
    bullets: string[];
    links?: { label: string; url: string }[];
  },
  label?: string,
): string {
  const heading = label ? `${label} — ${tips.title}` : tips.title;
  const bullets = tips.bullets.map((bullet) => `- ${bullet}`).join('\n');
  const links =
    tips.links?.map((link) => `- [${link.label}](${link.url})`).join('\n') ??
    '';
  return [heading, bullets, links].filter(Boolean).join('\n');
}

export function interpolateGuidancePrompt(
  template: string,
  values: Record<string, string>,
): string {
  let result = template;
  for (const [key, value] of Object.entries(values)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result.replace(/\{\{[^}]+\}\}/g, '').trim();
}
