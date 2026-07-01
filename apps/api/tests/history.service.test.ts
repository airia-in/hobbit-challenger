import { describe, expect, it } from 'vitest';
import { isPassingAiVerdict } from '../src/services/history.service';

describe('isPassingAiVerdict', () => {
  it('treats configured verifier errors as non-passing', () => {
    expect(isPassingAiVerdict('ERROR')).toBe(false);
  });

  it('preserves existing failed and skipped behavior', () => {
    expect(isPassingAiVerdict('FAILED')).toBe(false);
    expect(isPassingAiVerdict('SKIPPED')).toBe(true);
    expect(isPassingAiVerdict(null)).toBe(true);
  });
});
