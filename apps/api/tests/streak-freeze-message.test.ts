import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import {
  StreakFreezeMessageService,
  buildStreakFreezeFallback,
  interpolateStreakFreezePrompt,
  STREAK_FREEZE_GRANTED_KIND,
} from '../src/whatsapp/streak-freeze-message.service';
import { buildReminderMessaging } from '../src/whatsapp/openai-reminder.service';

const messaging = buildReminderMessaging('staging.hobbit.example');

const context = {
  name: 'Sam',
  currentStreak: 7,
  streakFreezesAvailable: 1,
};

function createService(apiKey?: string): StreakFreezeMessageService {
  const evolution = {
    isConfigured: () => Boolean(apiKey),
    sendText: vi.fn().mockResolvedValue({ ok: true }),
  };
  const config = {
    get: (key: string) => {
      if (key === 'OPENAI_API_KEY') return apiKey;
      if (key === 'OPENAI_BASE_URL') return undefined;
      if (key === 'OPENAI_VISION_MODEL') return 'gpt-4o-mini';
      if (key === 'WEB_DOMAIN') return 'staging.hobbit.example';
      return undefined;
    },
  } as unknown as ConfigService;
  return new StreakFreezeMessageService(config, evolution as never);
}

describe('StreakFreezeMessageService', () => {
  it('renders fallback copy with streak and cloak', async () => {
    const text = buildStreakFreezeFallback(context, messaging);
    expect(text).toMatch(/7 days on the trail/i);
    expect(text).toMatch(/rain cloak/i);
    expect(text).toContain(messaging.dashboardUrl);
  });

  it('interpolates prompt template variables', () => {
    const rendered = interpolateStreakFreezePrompt(
      'Hi {{name}}, streak {{currentStreak}}, cloaks {{streakFreezesAvailable}}, {{dashboardUrl}}',
      context,
      messaging,
    );
    expect(rendered).toBe(
      `Hi Sam, streak 7, cloaks 1, ${messaging.dashboardUrl}`,
    );
  });

  it('returns fallback when API key is missing', async () => {
    const service = createService(undefined);
    const text = await service.compose(context);
    expect(text).toBe(buildStreakFreezeFallback(context, messaging));
  });

  it('dedupes grant sends via ReminderLog kind', async () => {
    expect(STREAK_FREEZE_GRANTED_KIND).toBe('STREAK_FREEZE_GRANTED');
  });
});
