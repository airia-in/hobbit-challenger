import { describe, expect, it } from 'vitest';
import { verdictClass, verdictLabel } from '../src/lib/ai-verdict';

describe('verdictClass', () => {
  it('returns success styling for PASSED and BONUS', () => {
    const success =
      'text-[var(--success)] border-[var(--success)]/30 bg-[var(--success)]/10';
    expect(verdictClass('PASSED')).toBe(success);
    expect(verdictClass('BONUS')).toBe(success);
  });

  it('returns red styling for FAILED', () => {
    expect(verdictClass('FAILED')).toBe(
      'text-[var(--accent-red)] border-[var(--accent-red)]/30 bg-[var(--accent-red)]/10',
    );
  });

  it('returns muted styling for SKIPPED, null, and unknown verdicts', () => {
    const muted =
      'text-[var(--text-muted)] border-[var(--border)] bg-[var(--surface-raised)]';
    expect(verdictClass('SKIPPED')).toBe(muted);
    expect(verdictClass(null)).toBe(muted);
    expect(verdictClass('UNKNOWN')).toBe(muted);
  });
});

describe('verdictLabel', () => {
  it('maps PASSED and BONUS to Verified', () => {
    expect(verdictLabel('PASSED')).toBe('Verified');
    expect(verdictLabel('BONUS')).toBe('Verified');
  });

  it('maps FAILED to Not verified', () => {
    expect(verdictLabel('FAILED')).toBe('Not verified');
  });

  it('maps SKIPPED to Not checked', () => {
    expect(verdictLabel('SKIPPED')).toBe('Not checked');
  });

  it('returns empty string for null and raw string for unknown verdicts', () => {
    expect(verdictLabel(null)).toBe('');
    expect(verdictLabel('CUSTOM')).toBe('CUSTOM');
  });
});
