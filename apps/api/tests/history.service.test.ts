import { describe, expect, it } from 'vitest';
import {
  isPassingAiVerdict,
  resolveDayFailReason,
} from '../src/services/history.service';

describe('resolveDayFailReason', () => {
  it('returns scored copy when the user belongs to a group', () => {
    expect(resolveDayFailReason('g1')).toBe(
      'Not all scored activities were logged',
    );
  });

  it('returns personal copy for personal-only users', () => {
    expect(resolveDayFailReason(null)).toBe(
      'Not all personal activities were logged',
    );
  });
});

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
