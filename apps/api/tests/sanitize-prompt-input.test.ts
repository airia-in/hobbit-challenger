import { describe, expect, it } from 'vitest';
import {
  HABIT_ANCHOR_TEXT_MAX_LENGTH,
  sanitizeUserPromptText,
} from '../src/utils/sanitize-prompt-input';

describe('sanitizeUserPromptText', () => {
  it('strips newlines and collapses whitespace', () => {
    expect(sanitizeUserPromptText('morning\n coffee\t')).toBe('morning coffee');
  });

  it('removes template delimiter syntax', () => {
    expect(sanitizeUserPromptText('after {{ignore me}} chai')).toBe(
      'after chai',
    );
    expect(sanitizeUserPromptText('{% block evil %}')).toBe('');
  });

  it('truncates to max length', () => {
    const long = 'a'.repeat(HABIT_ANCHOR_TEXT_MAX_LENGTH + 20);
    expect(sanitizeUserPromptText(long).length).toBe(
      HABIT_ANCHOR_TEXT_MAX_LENGTH,
    );
  });
});
