import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { Prisma } from '@workspace-starter/db';
import { BRAND_INTRO } from '@workspace-starter/types';
import { loadPromptFile } from '../services/prompt-loader';
import type { PrismaService } from '../prisma/prisma.service';
import { EvolutionApiClient } from './evolution.client';
import { trackReminderSentFireAndForget } from '../services/analytics.service';
import {
  buildReminderMessaging,
  type ReminderMessaging,
} from './openai-reminder.service';

/** ReminderLog kind for one-shot day-complete acknowledgments (#140 / #162). */
export const CHECKIN_ACK_KIND = 'CHECKIN_ACK';

/** ReminderLog kind for first scored log of the local day (#173). */
export const CHECKIN_ACK_FIRST_KIND = 'CHECKIN_ACK_FIRST';

export type CheckinAckStatus = 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED_OPTOUT';

export type CheckinAckStreakBucket = 'fresh' | 'building' | 'strong';

export type CheckinAckContext = {
  name: string;
  currentStreak: number;
  todayNetXp: number;
  tasksDone: number;
  streakBucket: CheckinAckStreakBucket;
};

const PROMPT_FILE = 'checkin-ack.jinja';
const PROMPT_FILE_FIRST = 'checkin-ack-first.jinja';

const CHECKIN_ACK_FALLBACK_VARIANTS: readonly string[] = [
  "Pack's empty, {{name}} — I saw that from here. {{streakLine}}",
  'Every scored habit logged today. Nice work on the trail, {{name}}. {{streakLine}}',
  "The pack's clear for today, {{name}}. {{streakLine}}",
  "I caught that from here — today's habits are done, {{name}}. {{streakLine}}",
];

const CHECKIN_ACK_FIRST_FALLBACK_VARIANTS: readonly string[] = [
  "First step on today's trail, {{name}} — I saw that from here. {{streakLine}}",
  'Nice opener for today, {{name}}. {{streakLine}}',
  "Trail's started — I caught your first log today, {{name}}. {{streakLine}}",
  'First habit in the pack today, {{name}}. {{streakLine}}',
];

/**
 * At most one send per (user, local day, ReminderLog kind). Multi-habit days may
 * emit both `CHECKIN_ACK_FIRST` (first scored log) and `CHECKIN_ACK` (day
 * complete); each kind dedupes independently. Any existing row for that kind
 * blocks a second send (including undo/redo). FAILED rows are not retried.
 */
export function shouldAttemptCheckinAck(
  existing: { status: string } | null | undefined,
): boolean {
  return !existing;
}

function isReminderLogUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
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

/** First-log streak line — never "Fresh path tomorrow." on a celebratory opener. */
export function buildCheckinAckFirstStreakLine(
  currentStreak: number,
  todayNetXp: number,
  tasksDone: number,
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
  if (tasksDone >= 1) {
    return 'That first step counts today.';
  }
  return '';
}

export function stripCheckinAckDashboardUrl(
  text: string,
  messaging: ReminderMessaging,
): string {
  if (!text.includes(messaging.dashboardUrl)) {
    return text;
  }
  return text
    .split(messaging.dashboardUrl)
    .join('')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function hashCheckinAckSeed(context: CheckinAckContext, kind: string): number {
  const input = `${context.name}:${context.currentStreak}:${context.tasksDone}:${kind}`;
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function checkinAckFallbackSeed(context: CheckinAckContext): number {
  return hashCheckinAckSeed(context, CHECKIN_ACK_KIND);
}

export function checkinAckFirstFallbackSeed(
  context: CheckinAckContext,
): number {
  return hashCheckinAckSeed(context, CHECKIN_ACK_FIRST_KIND);
}

function pickVariant<T>(variants: readonly T[], seed: number): T {
  return variants[seed % variants.length]!;
}

function applyCheckinAckTemplate(
  template: string,
  context: CheckinAckContext,
  messaging: ReminderMessaging,
  streakLine: string,
): string {
  return template
    .replaceAll('{{name}}', context.name)
    .replaceAll('{{streakLine}}', streakLine)
    .replaceAll('{{brandName}}', messaging.brandName);
}

function buildCheckinAckFallbackFromVariants(
  variants: readonly string[],
  context: CheckinAckContext,
  messaging: ReminderMessaging,
  seed: number,
  streakLine: string,
): string {
  const template = pickVariant(variants, seed);
  return applyCheckinAckTemplate(template, context, messaging, streakLine);
}

export function buildCheckinAckFallback(
  context: CheckinAckContext,
  messaging: ReminderMessaging = buildReminderMessaging(),
  seed = checkinAckFallbackSeed(context),
): string {
  return buildCheckinAckFallbackFromVariants(
    CHECKIN_ACK_FALLBACK_VARIANTS,
    context,
    messaging,
    seed,
    buildCheckinAckStreakLine(context.currentStreak, context.todayNetXp),
  );
}

export function buildCheckinAckFirstFallback(
  context: CheckinAckContext,
  messaging: ReminderMessaging = buildReminderMessaging(),
  seed = checkinAckFirstFallbackSeed(context),
): string {
  return buildCheckinAckFallbackFromVariants(
    CHECKIN_ACK_FIRST_FALLBACK_VARIANTS,
    context,
    messaging,
    seed,
    buildCheckinAckFirstStreakLine(
      context.currentStreak,
      context.todayNetXp,
      context.tasksDone,
    ),
  );
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
    return this.composeFromPrompt(
      PROMPT_FILE,
      context,
      buildCheckinAckFallback,
    );
  }

  async composeFirstLog(context: CheckinAckContext): Promise<string> {
    return this.composeFromPrompt(
      PROMPT_FILE_FIRST,
      context,
      buildCheckinAckFirstFallback,
    );
  }

  private async composeFromPrompt(
    promptFile: string,
    context: CheckinAckContext,
    fallback: (
      context: CheckinAckContext,
      messaging: ReminderMessaging,
    ) => string,
  ): Promise<string> {
    if (!this.openai) {
      return fallback(context, this.messaging);
    }

    try {
      const prompt = await loadPromptFile(promptFile);
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
      return stripCheckinAckDashboardUrl(content, this.messaging);
    } catch (error) {
      this.logger.error('Check-in ack compose failed:', error);
      return fallback(context, this.messaging);
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
    await this.trySendCheckinAck({
      ...input,
      kind: CHECKIN_ACK_KIND,
      compose: (context) => this.compose(context),
    });
  }

  async trySendFirstLogAck(input: {
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
    await this.trySendCheckinAck({
      ...input,
      kind: CHECKIN_ACK_FIRST_KIND,
      compose: (context) => this.composeFirstLog(context),
    });
  }

  private async trySendCheckinAck(input: {
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
    kind: string;
    compose: (context: CheckinAckContext) => Promise<string>;
  }): Promise<void> {
    const logKey = {
      userId: input.userId,
      date: input.localDay,
      kind: input.kind,
    };

    try {
      const existing = await input.prisma.reminderLog.findUnique({
        where: { userId_date_kind: logKey },
      });

      if (!shouldAttemptCheckinAck(existing)) {
        return;
      }

      // Opt-out / missing phone: no ReminderLog row (unlike cron SKIPPED_OPTOUT).
      if (!input.phone || !input.whatsappOptIn) {
        return;
      }

      if (!this.evolution.isConfigured()) {
        await this.recordTerminalCheckinAckLog(input.prisma, logKey, 'FAILED');
        return;
      }

      const claimed = await this.claimCheckinAckLease(input.prisma, logKey);
      if (!claimed) {
        return;
      }

      let status: 'SENT' | 'FAILED' = 'FAILED';
      try {
        const context: CheckinAckContext = {
          name: input.userName,
          currentStreak: input.currentStreak,
          todayNetXp: input.todayNetXp,
          tasksDone: input.tasksDone,
          streakBucket: resolveCheckinAckStreakBucket(input.currentStreak),
        };

        const text = await input.compose(context);
        const result = await this.evolution.sendText(input.phone, text);
        status = result.ok ? 'SENT' : 'FAILED';
      } catch (error) {
        this.logger.error('Check-in ack send failed:', error);
        status = 'FAILED';
      }

      await this.finalizeCheckinAckLog(input.prisma, logKey, status);
      trackReminderSentFireAndForget(
        input.prisma,
        input.userId,
        input.kind,
        status,
      );
    } catch (error) {
      this.logger.error('Check-in ack failed:', error);
    }
  }

  /** Atomically claims (userId, date, kind) before outbound I/O; P2002 = lost race. */
  private async claimCheckinAckLease(
    prisma: PrismaService,
    logKey: { userId: string; date: Date; kind: string },
  ): Promise<boolean> {
    try {
      await prisma.reminderLog.create({
        data: {
          userId: logKey.userId,
          date: logKey.date,
          kind: logKey.kind,
          status: 'PENDING',
        },
      });
      return true;
    } catch (error) {
      if (isReminderLogUniqueViolation(error)) {
        return false;
      }
      throw error;
    }
  }

  /** Records a terminal status without send (e.g. unconfigured Evolution). */
  private async recordTerminalCheckinAckLog(
    prisma: PrismaService,
    logKey: { userId: string; date: Date; kind: string },
    status: 'FAILED',
  ): Promise<void> {
    try {
      await prisma.reminderLog.create({
        data: {
          userId: logKey.userId,
          date: logKey.date,
          kind: logKey.kind,
          status,
        },
      });
    } catch (error) {
      if (isReminderLogUniqueViolation(error)) {
        return;
      }
      throw error;
    }
  }

  private async finalizeCheckinAckLog(
    prisma: PrismaService,
    logKey: { userId: string; date: Date; kind: string },
    status: 'SENT' | 'FAILED',
  ): Promise<void> {
    await prisma.reminderLog.update({
      where: { userId_date_kind: logKey },
      data: {
        status,
        sentAt: new Date(),
      },
    });
  }
}
