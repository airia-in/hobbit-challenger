import { describe, expect, it } from 'vitest';
import {
  buildBuddySummaryFallback,
  buildPartnerSummaryLine,
  type BuddySummaryMessageContext,
} from '../src/whatsapp/buddy-summary-message.service';
import { buildReminderMessaging } from '../src/whatsapp/openai-reminder.service';
import type { WeeklyRecapRollup } from '../src/utils/weekly-recap-rollup';

const rollup: WeeklyRecapRollup = {
  weekStartKey: '2026-06-22',
  weekEndKey: '2026-06-28',
  eligibleDays: 7,
  daysShowedUp: 5,
  perfectDays: 2,
  totalHabitsHit: 12,
  weekXp: 240,
  streakStart: 3,
  streakEnd: 5,
  bestHabitName: 'Morning walk',
  bestHabitHits: 5,
  identityReflectionLine: '',
  nextWeekNudgeLine: '',
  focusOptions: [],
  focusOptionsLine: '',
  priorWeekFocusLine: '',
};

const context: BuddySummaryMessageContext = {
  recipientName: 'Alex',
  partnerName: 'Bo',
  rollup,
};

describe('buddy summary fallback copy', () => {
  it('summarizes the partner with aggregate, supportive numbers', () => {
    const line = buildPartnerSummaryLine('Bo', rollup);
    expect(line).toContain('Bo hit 5/7 days');
    expect(line).toContain('5-day streak');
  });

  it('is guilt-free and includes the dashboard URL', () => {
    const messaging = buildReminderMessaging('example.com');
    const text = buildBuddySummaryFallback(context, messaging, 0);
    expect(text).toContain('Alex');
    expect(text).toContain('Bo');
    expect(text).toContain(messaging.dashboardUrl);
    // No ranking / shame language.
    expect(text.toLowerCase()).not.toContain('rank');
    expect(text.toLowerCase()).not.toContain('behind');
    expect(text.toLowerCase()).not.toContain('beat');
  });
});
