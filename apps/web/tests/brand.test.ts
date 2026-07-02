import { describe, expect, it } from 'vitest';
import {
  BRAND_DEFAULT_TITLE,
  BRAND_INTRO,
  BRAND_NAME,
  BRAND_SUBTITLE,
  BRAND_TAGLINE,
  formatPageTitle,
} from '../src/lib/brand';

describe('brand', () => {
  it('formats neutral page titles', () => {
    expect(formatPageTitle('Sign In')).toBe('HOBBIT — Sign In');
  });

  it('uses Hobbit habit-buddy branding without fixed-day framing', () => {
    expect(BRAND_NAME).toBe('HOBBIT');
    expect(BRAND_DEFAULT_TITLE).toBe('HOBBIT — Habit buddy');
    expect(BRAND_SUBTITLE).toBe('Habit buddy');
    expect(BRAND_TAGLINE).toBe('Here to annoy you into great habits.');
    expect(BRAND_INTRO).toContain('Hobbit');
    expect(BRAND_TAGLINE).not.toMatch(/75/i);
  });
});
