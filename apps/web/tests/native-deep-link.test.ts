import { describe, expect, it } from 'vitest';
import { resolveNativeDeepLinkTarget } from '../src/lib/native-deep-link';

const WEB_DOMAIN = 'hobbit.drcode.ai';

describe('resolveNativeDeepLinkTarget', () => {
  it('maps canonical invite query URLs to /join?token=…', () => {
    expect(
      resolveNativeDeepLinkTarget(
        'https://hobbit.drcode.ai/join?token=abc123',
        WEB_DOMAIN,
      ),
    ).toBe('/join?token=abc123');
  });

  it('rewrites legacy /join/{token} paths like middleware and static-host', () => {
    expect(
      resolveNativeDeepLinkTarget(
        'https://hobbit.drcode.ai/join/some-uuid-token/',
        WEB_DOMAIN,
      ),
    ).toBe('/join?token=some-uuid-token');
  });

  it('preserves encoded token values', () => {
    expect(
      resolveNativeDeepLinkTarget(
        'https://hobbit.drcode.ai/join?token=a%2Bb%2Fc',
        WEB_DOMAIN,
      ),
    ).toBe('/join?token=a%2Bb%2Fc');
  });

  it('routes other in-app paths on the web domain', () => {
    expect(
      resolveNativeDeepLinkTarget(
        'https://hobbit.drcode.ai/dashboard',
        WEB_DOMAIN,
      ),
    ).toBe('/dashboard');
  });

  it('ignores foreign hosts', () => {
    expect(
      resolveNativeDeepLinkTarget(
        'https://evil.example/join?token=abc',
        WEB_DOMAIN,
      ),
    ).toBeNull();
  });

  it('ignores invalid URLs', () => {
    expect(resolveNativeDeepLinkTarget('not-a-url', WEB_DOMAIN)).toBeNull();
  });
});
