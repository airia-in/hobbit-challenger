import { describe, expect, it } from 'vitest';
import {
  getLocalMinutesSinceTarget,
  isLocalTimeMatch,
  isValidTimeZone,
  isWithinLocalCatchUpWindow,
} from '../src/utils/day-window';

describe('isValidTimeZone', () => {
  it('returns true for known IANA zones', () => {
    expect(isValidTimeZone('America/New_York')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true);
  });

  it('returns false for invalid zones', () => {
    expect(isValidTimeZone('Not/AZone')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });
});

describe('isLocalTimeMatch', () => {
  it('matches when local hour:minute equals target in UTC', () => {
    const now = new Date('2026-06-15T08:00:00.000Z');
    expect(isLocalTimeMatch('UTC', '08:00', now)).toBe(true);
    expect(isLocalTimeMatch('UTC', '08:01', now)).toBe(false);
    expect(isLocalTimeMatch('UTC', '07:00', now)).toBe(false);
  });

  it('matches America/New_York local time', () => {
    // 2026-06-15 08:00 EDT = 12:00 UTC (EDT is UTC-4)
    const now = new Date('2026-06-15T12:00:00.000Z');
    expect(isLocalTimeMatch('America/New_York', '08:00', now)).toBe(true);
    expect(isLocalTimeMatch('America/New_York', '21:00', now)).toBe(false);
  });

  it('matches Asia/Kolkata local time', () => {
    // 2026-06-15 21:00 IST = 15:30 UTC (IST is UTC+5:30)
    const now = new Date('2026-06-15T15:30:00.000Z');
    expect(isLocalTimeMatch('Asia/Kolkata', '21:00', now)).toBe(true);
    expect(isLocalTimeMatch('Asia/Kolkata', '08:00', now)).toBe(false);
  });

  it('matches Europe/London during BST', () => {
    // 2026-06-15 08:00 BST = 07:00 UTC
    const now = new Date('2026-06-15T07:00:00.000Z');
    expect(isLocalTimeMatch('Europe/London', '08:00', now)).toBe(true);
  });

  it('returns false for invalid targetHHMM', () => {
    const now = new Date('2026-06-15T08:00:00.000Z');
    expect(isLocalTimeMatch('UTC', 'invalid', now)).toBe(false);
    expect(isLocalTimeMatch('UTC', '25:00', now)).toBe(false);
    expect(isLocalTimeMatch('UTC', '08:60', now)).toBe(false);
  });
});

describe('isWithinLocalCatchUpWindow', () => {
  it('includes the target minute and subsequent minutes within the window', () => {
    expect(
      isWithinLocalCatchUpWindow(
        'UTC',
        '08:00',
        new Date('2026-06-15T08:00:00.000Z'),
        15,
      ),
    ).toBe(true);
    expect(
      isWithinLocalCatchUpWindow(
        'UTC',
        '08:00',
        new Date('2026-06-15T08:15:00.000Z'),
        15,
      ),
    ).toBe(true);
    expect(
      isWithinLocalCatchUpWindow(
        'UTC',
        '08:00',
        new Date('2026-06-15T08:16:00.000Z'),
        15,
      ),
    ).toBe(false);
    expect(
      isWithinLocalCatchUpWindow(
        'UTC',
        '08:00',
        new Date('2026-06-15T07:59:00.000Z'),
        15,
      ),
    ).toBe(false);
  });
});

describe('getLocalMinutesSinceTarget', () => {
  it('returns elapsed minutes after the target time', () => {
    expect(
      getLocalMinutesSinceTarget(
        'UTC',
        '18:00',
        new Date('2026-06-15T21:00:00.000Z'),
      ),
    ).toBe(180);
  });
});
