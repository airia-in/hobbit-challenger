import { describe, expect, it } from 'vitest';
import {
  BRAND_DEFAULT_TITLE,
  BRAND_SUBTITLE,
  BRAND_TAGLINE,
  formatPageTitle,
} from '../src/lib/brand';

describe('brand', () => {
  it('formats neutral page titles', () => {
    expect(formatPageTitle('Sign In')).toBe('DRCODE — Sign In');
  });

  it('uses discipline challenge branding without fixed-day framing', () => {
    expect(BRAND_DEFAULT_TITLE).toBe('DRCODE — Discipline Challenge');
    expect(BRAND_SUBTITLE).toBe('Discipline Challenge');
    expect(BRAND_TAGLINE).not.toMatch(/75/i);
  });
});
