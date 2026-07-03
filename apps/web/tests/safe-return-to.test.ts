import { describe, expect, it } from 'vitest';
import { isSafeRelativeReturnTo } from '../src/lib/safe-return-to';

describe('isSafeRelativeReturnTo', () => {
  it('accepts same-origin relative paths', () => {
    expect(isSafeRelativeReturnTo('/join?token=abc')).toBe(true);
    expect(isSafeRelativeReturnTo('/dashboard')).toBe(true);
  });

  it('rejects protocol-relative and absolute URLs', () => {
    expect(isSafeRelativeReturnTo('//evil.com')).toBe(false);
    expect(isSafeRelativeReturnTo('https://evil.com')).toBe(false);
  });

  it('rejects paths that do not start with /', () => {
    expect(isSafeRelativeReturnTo('evil.com')).toBe(false);
  });
});
