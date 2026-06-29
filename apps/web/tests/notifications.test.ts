import { describe, expect, it } from 'vitest';
import {
  firedTodayStorageKey,
  shouldFireReminder,
  shouldFireTenPmWarning,
} from '../src/lib/notifications';

describe('notifications', () => {
  it('builds per-day storage keys', () => {
    const now = new Date('2026-06-30T12:00:00');
    expect(firedTodayStorageKey('reminder', now)).toBe(
      'drcode_notification_fired_reminder_2026-06-30',
    );
  });

  it('fires reminder in matching minute', () => {
    const now = new Date('2026-06-30T08:30:00');
    expect(shouldFireReminder('08:30', now)).toBe(true);
    expect(shouldFireReminder('08:31', now)).toBe(false);
    expect(shouldFireReminder(null, now)).toBe(false);
  });

  it('fires 10 PM warning only at 22:00', () => {
    expect(shouldFireTenPmWarning(new Date('2026-06-30T22:00:00'))).toBe(true);
    expect(shouldFireTenPmWarning(new Date('2026-06-30T22:01:00'))).toBe(false);
    expect(shouldFireTenPmWarning(new Date('2026-06-30T21:59:00'))).toBe(false);
  });
});
