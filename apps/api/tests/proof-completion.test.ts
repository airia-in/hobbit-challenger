import { describe, expect, it } from 'vitest';
import {
  canAttachProofToActivity,
  shouldAutoCompleteOnProof,
} from '../src/utils/proof-completion';

describe('proof-completion rules', () => {
  it('allows proof only when allowsProof is true', () => {
    expect(
      canAttachProofToActivity({
        allowsProof: true,
        autoCompleteOnProof: false,
      }),
    ).toBe(true);
    expect(
      canAttachProofToActivity({
        allowsProof: false,
        autoCompleteOnProof: false,
      }),
    ).toBe(false);
  });

  it('auto-completes only when proof is present and rule is enabled', () => {
    const rule = { allowsProof: true, autoCompleteOnProof: true };
    expect(shouldAutoCompleteOnProof(rule, '/uploads/photo.jpg')).toBe(true);
    expect(shouldAutoCompleteOnProof(rule, null)).toBe(false);
    expect(
      shouldAutoCompleteOnProof(
        { allowsProof: true, autoCompleteOnProof: false },
        '/uploads/photo.jpg',
      ),
    ).toBe(false);
    expect(
      shouldAutoCompleteOnProof(
        { allowsProof: false, autoCompleteOnProof: true },
        '/uploads/photo.jpg',
      ),
    ).toBe(false);
  });
});
