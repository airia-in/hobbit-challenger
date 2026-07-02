import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import {
  OpenAiReminderService,
  buildFallbackMessage,
  buildReminderMessaging,
  interpolatePrompt,
} from '../src/whatsapp/openai-reminder.service';
import type { ReminderContext } from '../src/whatsapp/reminder-context.service';

const baseContext: ReminderContext = {
  name: 'Sam',
  dayNumber: 10,
  tasksDone: 2,
  tasksRemaining: 3,
  todayNetXp: 150,
  xpAtRisk: 75,
  rank: 4,
  totalXp: 2000,
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
      'Hi {{name}}, {{brandName}}, remaining {{tasksRemaining}}. Dashboard: {{dashboardUrl}}. {{rankLine}}';
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
});

describe('buildFallbackMessage', () => {
  it('uses Hobbit voice and dashboard URL when tasks remain', () => {
    const morning = buildFallbackMessage('MORNING', baseContext, messaging);
    expect(morning).toContain('HOBBIT');
    expect(morning).toContain('https://staging.hobbit.example/dashboard');

    const evening = buildFallbackMessage('EVENING', baseContext, messaging);
    expect(evening).toContain('HOBBIT');
    expect(evening).toContain('XP at risk');
    expect(evening).toContain('https://staging.hobbit.example/dashboard');
  });

  it('omits dashboard URL on a clear morning', () => {
    const message = buildFallbackMessage(
      'MORNING',
      { ...baseContext, tasksRemaining: 0 },
      messaging,
    );
    expect(message).toContain('looking clear');
    expect(message).not.toContain('/dashboard');
  });
});
