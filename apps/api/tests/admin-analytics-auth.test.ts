import { describe, expect, it } from 'vitest';
import {
  ADMIN_TOKEN_ENV,
  ADMIN_TOKEN_HEADER,
  extractAdminToken,
  isAnalyticsAdminToken,
} from '../src/utils/admin-analytics-auth';

describe('isAnalyticsAdminToken', () => {
  it('fails closed when the env token is unset or empty', () => {
    expect(isAnalyticsAdminToken('anything', {})).toBe(false);
    expect(isAnalyticsAdminToken('anything', { [ADMIN_TOKEN_ENV]: '' })).toBe(
      false,
    );
    expect(
      isAnalyticsAdminToken('anything', { [ADMIN_TOKEN_ENV]: '   ' }),
    ).toBe(false);
  });

  it('rejects a missing or mismatched token', () => {
    const env = { [ADMIN_TOKEN_ENV]: 'secret-token' };
    expect(isAnalyticsAdminToken(undefined, env)).toBe(false);
    expect(isAnalyticsAdminToken('', env)).toBe(false);
    expect(isAnalyticsAdminToken('wrong', env)).toBe(false);
    expect(isAnalyticsAdminToken('secret-token-longer', env)).toBe(false);
  });

  it('accepts the exact configured token', () => {
    const env = { [ADMIN_TOKEN_ENV]: 'secret-token' };
    expect(isAnalyticsAdminToken('secret-token', env)).toBe(true);
    expect(isAnalyticsAdminToken(' secret-token ', env)).toBe(false);
  });
});

describe('extractAdminToken', () => {
  it('reads the header value', () => {
    expect(extractAdminToken({ [ADMIN_TOKEN_HEADER]: 'abc' })).toBe('abc');
  });

  it('reads the first value when the header repeats', () => {
    expect(extractAdminToken({ [ADMIN_TOKEN_HEADER]: ['abc', 'def'] })).toBe(
      'abc',
    );
  });

  it('returns undefined when absent', () => {
    expect(extractAdminToken({})).toBeUndefined();
    expect(extractAdminToken(undefined)).toBeUndefined();
  });
});
