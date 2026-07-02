import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import {
  OpenAiReminderService,
  buildFallbackMessage,
  buildReminderCopyLines,
  buildReminderMessaging,
  FALLBACK_VARIANT_TEMPLATES,
  fallbackSeed,
  interpolatePrompt,
} from '../src/whatsapp/openai-reminder.service';
import type { ReminderContext } from '../src/whatsapp/reminder-context.service';
import { STREAK_AT_RISK_MIN } from '../src/whatsapp/reminder-context.service';

const baseContext: ReminderContext = {
  name: 'Sam',
  dayNumber: 10,
  tasksDone: 2,
  tasksRemaining: 3,
  todayNetXp: 150,
  xpAtRisk: 75,
  rank: 4,
  totalXp: 2000,
  topActivityStreak: 6,
  topActivityName: 'Water',
  unloggedHabitNames: ['Diet', 'Walk'],
  missedYesterday: false,
  recoveryEligible: false,
  recoveryBreakDate: null,
  challengeInRange: true,
  streakAtRisk: true,
  journeyMilestone: null,
  currentStreak: STREAK_AT_RISK_MIN + 2,
  longestStreak: 15,
  streakFreezesAvailable: 0,
};

const messaging = buildReminderMessaging('staging.hobbit.example');

function createService(apiKey?: string): OpenAiReminderService {
  const config = {
    get: (key: string) => {
      if (key === 'OPENAI_API_KEY') return apiKey;
      if (key === 'OPENAI_BASE_URL') return undefined;
      if (key === 'OPENAI_VISION_MODEL') return 'gpt-4o-mini';
      if (key === 'WEB_DOMAIN') return 'staging.hobbit.example';
      return undefined;
    },
  } as unknown as ConfigService;
  return new OpenAiReminderService(config);
}

describe('OpenAiReminderService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns template fallback when API key is missing', async () => {
    const service = createService(undefined);
    const text = await service.compose('MORNING', baseContext);
    expect(text).toBe(buildFallbackMessage('MORNING', baseContext, messaging));
  });

  it('returns template fallback when OpenAI throws', async () => {
    const service = createService('test-key');
    const openai = (
      service as unknown as {
        openai: { chat: { completions: { create: ReturnType<typeof vi.fn> } } };
      }
    ).openai;
    openai.chat.completions.create = vi
      .fn()
      .mockRejectedValue(new Error('API down'));

    const text = await service.compose('EVENING', baseContext);
    expect(text).toBe(buildFallbackMessage('EVENING', baseContext, messaging));
  });

  it('never throws on compose failure', async () => {
    const service = createService('test-key');
    const openai = (
      service as unknown as {
        openai: { chat: { completions: { create: ReturnType<typeof vi.fn> } } };
      }
    ).openai;
    openai.chat.completions.create = vi
      .fn()
      .mockRejectedValue(new Error('boom'));

    await expect(service.compose('MORNING', baseContext)).resolves.toBeTypeOf(
      'string',
    );
  });
});

describe('interpolatePrompt', () => {
  it('substitutes context values, brand fields, and rank line', () => {
    const template =
      'Hi {{name}}, {{brandName}}, remaining {{tasksRemaining}}. Dashboard: {{dashboardUrl}}. {{rankLine}} {{streakLine}}';
    const result = interpolatePrompt(
      template,
      baseContext,
      'MORNING',
      messaging,
    );
    expect(result).toContain('Sam');
    expect(result).toContain('HOBBIT');
    expect(result).toContain('3');
    expect(result).toContain('https://staging.hobbit.example/dashboard');
    expect(result).toContain('rank: 4');
    expect(result).toContain('Water is on a 6-day trail streak');
  });

  it('omits rank line when rank is null', () => {
    const template = 'Hello {{name}}. {{rankLine}}';
    const result = interpolatePrompt(
      template,
      { ...baseContext, rank: null },
      'EVENING',
      messaging,
    );
    expect(result).not.toContain('rank');
  });

  it('strips unknown placeholders', () => {
    const template = 'Hello {{name}} {{unknownSlot}}';
    const result = interpolatePrompt(
      template,
      baseContext,
      'MORNING',
      messaging,
    );
    expect(result).toBe('Hello Sam');
  });
});

describe('buildReminderCopyLines', () => {
  it('builds milestone and streak-at-risk lines', () => {
    const lines = buildReminderCopyLines({
      ...baseContext,
      journeyMilestone: 21,
      streakAtRisk: true,
      currentStreak: 8,
    });
    expect(lines.milestoneLine).toContain('21');
    expect(lines.streakAtRiskLine).toContain('8-day streak');
    expect(lines.unloggedHabitsLine).toContain('Diet');
  });

  it('builds recovery line when yesterday was a streak break', () => {
    const lines = buildReminderCopyLines({
      ...baseContext,
      missedYesterday: true,
    });
    expect(lines.recoveryLine).toContain('never miss twice');
  });
});

describe('buildFallbackMessage', () => {
  it('uses Hobbit voice and dashboard URL when tasks remain', () => {
    const morning = buildFallbackMessage('MORNING', baseContext, messaging);
    expect(morning).toContain('HOBBIT');
    expect(morning).toContain('https://staging.hobbit.example/dashboard');

    const evening = buildFallbackMessage('EVENING', baseContext, messaging);
    expect(evening).toContain('HOBBIT');
    expect(evening).toContain('XP');
    expect(evening).toContain('https://staging.hobbit.example/dashboard');
  });

  it('omits dashboard URL on a clear morning', () => {
    const message = buildFallbackMessage(
      'MORNING',
      { ...baseContext, tasksRemaining: 0 },
      messaging,
    );
    expect(message).not.toContain('/dashboard');
  });

  it('exposes at least fifteen distinct fallback templates', () => {
    expect(new Set(FALLBACK_VARIANT_TEMPLATES).size).toBeGreaterThanOrEqual(15);
  });

  it('selects fallbacks deterministically from name and day', () => {
    const a = buildFallbackMessage('MORNING', baseContext, messaging, 0);
    const b = buildFallbackMessage('MORNING', baseContext, messaging, 0);
    const c = buildFallbackMessage(
      'MORNING',
      { ...baseContext, name: 'Other' },
      messaging,
      fallbackSeed({ ...baseContext, name: 'Other' }, 'MORNING'),
    );
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('includes dashboard URL for evening buckets with open tasks', () => {
    const contexts: ReminderContext[] = [
      { ...baseContext, journeyMilestone: 30 },
      { ...baseContext, streakAtRisk: true, currentStreak: 10 },
      {
        ...baseContext,
        tasksRemaining: 0,
        xpAtRisk: 40,
        streakAtRisk: false,
      },
    ];

    for (const context of contexts) {
      const message = buildFallbackMessage('EVENING', context, messaging);
      if (context.tasksRemaining > 0) {
        expect(message).toContain(messaging.dashboardUrl);
      }
    }
  });

  it('recovery fallback uses never-miss-twice voice and always links dashboard', () => {
    const message = buildFallbackMessage(
      'RECOVERY',
      { ...baseContext, missedYesterday: true },
      messaging,
    );
    expect(message).toContain('never miss twice');
    expect(message).toContain(messaging.dashboardUrl);
  });

  it('streak-at-risk kind fallback includes streak and dashboard URL', () => {
    const message = buildFallbackMessage(
      'STREAK_AT_RISK',
      baseContext,
      messaging,
    );
    expect(message).toContain(String(baseContext.currentStreak));
    expect(message).toContain(messaging.dashboardUrl);
  });

  it('selects recovery and streak-at-risk fallbacks deterministically', () => {
    const recoveryA = buildFallbackMessage(
      'RECOVERY',
      { ...baseContext, missedYesterday: true },
      messaging,
      0,
    );
    const recoveryB = buildFallbackMessage(
      'RECOVERY',
      { ...baseContext, missedYesterday: true },
      messaging,
      0,
    );
    expect(recoveryA).toBe(recoveryB);

    const atRiskA = buildFallbackMessage(
      'STREAK_AT_RISK',
      baseContext,
      messaging,
      1,
    );
    const atRiskB = buildFallbackMessage(
      'STREAK_AT_RISK',
      baseContext,
      messaging,
      2,
    );
    expect(atRiskA).not.toBe(atRiskB);
  });
});
