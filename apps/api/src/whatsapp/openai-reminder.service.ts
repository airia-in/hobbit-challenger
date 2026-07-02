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

export type ReminderKind =
  | 'MORNING'
  | 'EVENING'
  | 'RECOVERY'
  | 'STREAK_AT_RISK';

const PROMPT_FILES: Record<ReminderKind, string> = {
  MORNING: 'reminder-morning.jinja',
  EVENING: 'reminder-evening.jinja',
  RECOVERY: 'reminder-recovery.jinja',
  STREAK_AT_RISK: 'reminder-streak-at-risk.jinja',
};

const DEFAULT_WEB_DOMAIN = 'hobbit.drcode.ai';

export type ReminderMessaging = {
  brandName: string;
  brandIntro: string;
  brandTagline: string;
  dashboardUrl: string;
};

export type ReminderCopyLines = {
  themedIntro: string;
  unloggedHabitsLine: string;
  streakLine: string;
  milestoneLine: string;
  yesterdayMissLine: string;
  streakAtRiskLine: string;
  recoveryLine: string;
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

export function buildReminderCopyLines(
  context: ReminderContext,
): ReminderCopyLines {
  const unloggedHabitsLine =
    context.unloggedHabitNames.length > 0
      ? `Still in the pack: ${context.unloggedHabitNames.join(', ')}.`
      : '';

  const streakLine =
    context.topActivityStreak > 0 && context.topActivityName
      ? `${context.topActivityName} is on a ${context.topActivityStreak}-day trail streak.`
      : context.currentStreak > 0
        ? `${context.currentStreak} days on the challenge trail.`
        : '';

  const milestoneLine = context.journeyMilestone
    ? `Milestone day ${context.journeyMilestone} on the journey — worth a small campfire cheer.`
    : '';

  const yesterdayMissLine = context.missedYesterday
    ? 'Yesterday was a muddy patch on the trail — today is a fresh path.'
    : '';

  const streakAtRiskLine = context.streakAtRisk
    ? `Your ${context.currentStreak}-day streak needs today's logs before the campfire goes out.`
    : '';

  const recoveryLine = context.missedYesterday
    ? 'One muddy day — the trail rule is never miss twice. Today counts.'
    : '';

  const themedIntro =
    context.journeyMilestone != null
      ? 'Pack light, walk steady — milestone weather ahead.'
      : context.streakAtRisk
        ? 'Clouds on the horizon — a few logs will clear the sky.'
        : context.missedYesterday
          ? "Fresh morning air after yesterday's rain."
          : 'Good trail weather for small wins today.';

  return {
    themedIntro,
    unloggedHabitsLine,
    streakLine,
    milestoneLine,
    yesterdayMissLine,
    streakAtRiskLine,
    recoveryLine,
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
  const copyLines = buildReminderCopyLines(context);

  const replacements: Record<string, string> = {
    name: context.name,
    dayNumber: String(context.dayNumber),
    tasksDone: String(context.tasksDone),
    tasksRemaining: String(context.tasksRemaining),
    todayNetXp: String(context.todayNetXp),
    xpAtRisk: String(context.xpAtRisk),
    totalXp: String(context.totalXp),
    currentStreak: String(context.currentStreak),
    longestStreak: String(context.longestStreak),
    topActivityStreak: String(context.topActivityStreak),
    topActivityName: context.topActivityName ?? '',
    rank: context.rank != null ? String(context.rank) : '',
    rankLine,
    brandName: messaging.brandName,
    brandIntro: messaging.brandIntro,
    brandTagline: messaging.brandTagline,
    dashboardUrl: messaging.dashboardUrl,
    ...copyLines,
  };

  let result = template;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }

  result = result.replace(/\{\{#if rank\}\}[\s\S]*?\{\{\/if\}\}/g, rankLine);
  result = result.replace(/\{\{[^}]+\}\}/g, '');

  void kind;
  return result.trim();
}

function appendDashboardLink(
  message: string,
  context: ReminderContext,
  kind: ReminderKind,
  messaging: ReminderMessaging,
): string {
  const alwaysInclude =
    kind === 'RECOVERY' || kind === 'STREAK_AT_RISK' || kind === 'EVENING';
  if (!alwaysInclude && context.tasksRemaining <= 0) {
    return message;
  }

  const suffix =
    kind === 'RECOVERY'
      ? ` Log today: ${messaging.dashboardUrl}`
      : ` Log them: ${messaging.dashboardUrl}`;
  return `${message}${suffix}`;
}

export function fallbackSeed(
  context: ReminderContext,
  kind: ReminderKind,
): number {
  const input = `${context.name}:${context.dayNumber}:${kind}`;
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pickVariant<T>(variants: readonly T[], seed: number): T {
  return variants[seed % variants.length]!;
}

const MORNING_CLEAR: readonly string[] = [
  'Good morning, {{name}}! {{brandName}} here — day {{dayNumber}} trail is clear ahead.',
  'Morning, {{name}}! {{brandName}} here — the pack is light on day {{dayNumber}}.',
];

const MORNING_CLEAR_AFTER_MISS: readonly string[] = [
  "Good morning, {{name}}! {{brandName}} here — fresh trail on day {{dayNumber}} after yesterday's mud.",
  "Rise and ramble, {{name}}! {{brandName}} here — day {{dayNumber}} starts clean after yesterday's detour.",
];

const MORNING_MILESTONE: readonly string[] = [
  'Good morning, {{name}}! {{brandName}} here — day {{dayNumber}} milestone, campfire-worthy weather.',
  'Morning, {{name}}! {{brandName}} here — day {{dayNumber}} is a trail marker worth celebrating.',
  'Hey {{name}}, {{brandName}} here — milestone day {{dayNumber}}! Pack steady and enjoy the view.',
];

const MORNING_YESTERDAY_MISS: readonly string[] = [
  'Good morning, {{name}}! {{brandName}} here — rain yesterday, sunshine on day {{dayNumber}}.',
  "Morning, {{name}}! {{brandName}} here — muddy patch behind us, {{tasksRemaining}} task(s) on today's path.",
];

const MORNING_STREAK_AT_RISK: readonly string[] = [
  'Good morning, {{name}}! {{brandName}} here — your {{currentStreak}}-day streak wants {{tasksRemaining}} log(s) today.',
  'Morning, {{name}}! {{brandName}} here — keep the {{currentStreak}}-day fire going, {{tasksRemaining}} log(s) to go.',
  "Hey {{name}}, {{brandName}} here — day {{dayNumber}} — don't let a {{currentStreak}}-day streak get cold. {{tasksRemaining}} still open.",
];

const MORNING_TASKS: readonly string[] = [
  'Good morning, {{name}}! {{brandName}} here — day {{dayNumber}} with {{tasksRemaining}} task(s) in the pack.',
  'Morning, {{name}}! {{brandName}} here — day {{dayNumber}} with {{tasksRemaining}} habit(s) to log before sunset.',
];

const EVENING_MILESTONE: readonly string[] = [
  'Hi {{name}}, {{brandName}} here — milestone evening on day {{dayNumber}}. {{tasksRemaining}} task(s) before the campfire dims.',
  'Evening, {{name}}! {{brandName}} here — day {{dayNumber}} milestone; log {{tasksRemaining}} before midnight.',
];

const EVENING_STREAK_AT_RISK: readonly string[] = [
  'Hi {{name}}, {{brandName}} here — {{currentStreak}}-day streak at risk. {{tasksRemaining}} task(s) and {{xpAtRisk}} XP before midnight.',
  'Evening, {{name}}! {{brandName}} here — {{tasksRemaining}} open, {{xpAtRisk}} XP at stake for your {{currentStreak}}-day run.',
  "Hey {{name}}, {{brandName}} here — don't let day {{dayNumber}} snap a {{currentStreak}}-day streak. {{tasksRemaining}} still unlogged, {{xpAtRisk}} XP at risk.",
];

const EVENING_XP_ONLY: readonly string[] = [
  'Hi {{name}}, {{brandName}} here — all tasks logged but {{xpAtRisk}} XP still at risk before midnight.',
  'Evening, {{name}}! {{brandName}} here — tasks are done; {{xpAtRisk}} XP could still slip away tonight.',
  'Hey {{name}}, {{brandName}} here — {{xpAtRisk}} XP on the line even though the pack looks packed.',
];

const EVENING_DEFAULT: readonly string[] = [
  'Hi {{name}}, {{brandName}} here — {{tasksRemaining}} task(s) still open and {{xpAtRisk}} XP at risk before midnight.',
  'Evening, {{name}}! {{brandName}} here — {{tasksRemaining}} habit(s) unlogged; {{xpAtRisk}} XP fades at midnight.',
  "Hey {{name}}, {{brandName}} here — campfire's cooling with {{tasksRemaining}} task(s) and {{xpAtRisk}} XP tonight.",
];

const RECOVERY_DEFAULT: readonly string[] = [
  "Good morning, {{name}}! {{brandName}} here — yesterday's mud is behind us. Never miss twice — {{tasksRemaining}} log(s) today keep the trail alive.",
  "Morning, {{name}}! {{brandName}} here — one slip doesn't end the journey. Today's the comeback day with {{tasksRemaining}} habit(s) on the path.",
  'Hey {{name}}, {{brandName}} here — fresh trail air on day {{dayNumber}}. Rule of the road: never miss twice. {{tasksRemaining}} log(s) waiting.',
];

const STREAK_AT_RISK_KIND_DEFAULT: readonly string[] = [
  'Hi {{name}}, {{brandName}} here — your {{currentStreak}}-day streak needs {{tasksRemaining}} log(s) before the campfire goes out.',
  'Evening, {{name}}! {{brandName}} here — {{currentStreak}} days on the trail; {{tasksRemaining}} habit(s) and {{xpAtRisk}} XP still open tonight.',
  "Hey {{name}}, {{brandName}} here — clouds on day {{dayNumber}}. Don't let a {{currentStreak}}-day streak get cold — {{tasksRemaining}} to log.",
];

function fillFallbackTemplate(
  template: string,
  context: ReminderContext,
  messaging: ReminderMessaging,
): string {
  const rankSuffix =
    context.rank != null ? ` You're rank #${context.rank}.` : '';
  const filled = template
    .replaceAll('{{name}}', context.name)
    .replaceAll('{{brandName}}', messaging.brandName)
    .replaceAll('{{dayNumber}}', String(context.dayNumber))
    .replaceAll('{{tasksRemaining}}', String(context.tasksRemaining))
    .replaceAll('{{xpAtRisk}}', String(context.xpAtRisk))
    .replaceAll('{{currentStreak}}', String(context.currentStreak));
  return `${filled}${rankSuffix}`;
}

function selectMorningTemplate(context: ReminderContext, seed: number): string {
  if (context.tasksRemaining <= 0) {
    if (context.missedYesterday) {
      return pickVariant(MORNING_CLEAR_AFTER_MISS, seed);
    }
    return pickVariant(MORNING_CLEAR, seed);
  }
  if (context.journeyMilestone != null) {
    return pickVariant(MORNING_MILESTONE, seed);
  }
  if (context.missedYesterday) {
    return pickVariant(MORNING_YESTERDAY_MISS, seed);
  }
  if (context.streakAtRisk) {
    return pickVariant(MORNING_STREAK_AT_RISK, seed);
  }
  return pickVariant(MORNING_TASKS, seed);
}

function selectEveningTemplate(context: ReminderContext, seed: number): string {
  if (context.journeyMilestone != null) {
    return pickVariant(EVENING_MILESTONE, seed);
  }
  if (context.tasksRemaining <= 0 && context.xpAtRisk > 0) {
    return pickVariant(EVENING_XP_ONLY, seed);
  }
  return pickVariant(EVENING_DEFAULT, seed);
}

function selectRecoveryTemplate(
  _context: ReminderContext,
  seed: number,
): string {
  return pickVariant(RECOVERY_DEFAULT, seed);
}

function selectStreakAtRiskKindTemplate(
  _context: ReminderContext,
  seed: number,
): string {
  return pickVariant(STREAK_AT_RISK_KIND_DEFAULT, seed);
}

function selectFallbackTemplate(
  kind: ReminderKind,
  context: ReminderContext,
  seed: number,
): string {
  switch (kind) {
    case 'MORNING':
      return selectMorningTemplate(context, seed);
    case 'EVENING':
      return selectEveningTemplate(context, seed);
    case 'RECOVERY':
      return selectRecoveryTemplate(context, seed);
    case 'STREAK_AT_RISK':
      return selectStreakAtRiskKindTemplate(context, seed);
  }
}

export function buildFallbackMessage(
  kind: ReminderKind,
  context: ReminderContext,
  messaging: ReminderMessaging = buildReminderMessaging(),
  seed = fallbackSeed(context, kind),
): string {
  const template = selectFallbackTemplate(kind, context, seed);
  const message = fillFallbackTemplate(template, context, messaging);
  return appendDashboardLink(message, context, kind, messaging);
}

export const FALLBACK_VARIANT_TEMPLATES = [
  ...MORNING_CLEAR,
  ...MORNING_CLEAR_AFTER_MISS,
  ...MORNING_MILESTONE,
  ...MORNING_YESTERDAY_MISS,
  ...MORNING_STREAK_AT_RISK,
  ...MORNING_TASKS,
  ...EVENING_MILESTONE,
  ...EVENING_STREAK_AT_RISK,
  ...EVENING_XP_ONLY,
  ...EVENING_DEFAULT,
  ...RECOVERY_DEFAULT,
  ...STREAK_AT_RISK_KIND_DEFAULT,
] as const;
