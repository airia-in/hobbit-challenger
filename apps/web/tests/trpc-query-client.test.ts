import { afterEach, describe, expect, it, vi } from 'vitest';

describe('getQueryClient', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('reuses one client across calls in the browser so cache survives navigation', async () => {
    const { getQueryClient } = await import('../src/components/TrpcProvider');
    const first = getQueryClient();
    const second = getQueryClient();
    expect(second).toBe(first);
  });

  it('returns a fresh client on the server so requests never share state', async () => {
    vi.stubGlobal('window', undefined);
    const { getQueryClient } = await import('../src/components/TrpcProvider');
    const first = getQueryClient();
    const second = getQueryClient();
    expect(second).not.toBe(first);
  });
});
