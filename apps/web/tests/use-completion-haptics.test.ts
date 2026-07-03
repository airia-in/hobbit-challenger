import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCompletionHaptics } from '../src/lib/use-completion-haptics';

const impactMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(),
    getPlatform: vi.fn(),
  },
}));

vi.mock('@capacitor/haptics', () => ({
  Haptics: {
    impact: impactMock,
  },
  ImpactStyle: {
    Light: 'LIGHT',
  },
}));

describe('useCompletionHaptics', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('no-ops on web (non-native platform)', async () => {
    const { Capacitor } = await import('@capacitor/core');
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    vi.mocked(Capacitor.getPlatform).mockReturnValue('web');

    const { result } = renderHook(() => useCompletionHaptics());
    await result.current();

    expect(impactMock).not.toHaveBeenCalled();
  });

  it('no-ops on native iOS', async () => {
    const { Capacitor } = await import('@capacitor/core');
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(Capacitor.getPlatform).mockReturnValue('ios');

    const { result } = renderHook(() => useCompletionHaptics());
    await result.current();

    expect(impactMock).not.toHaveBeenCalled();
  });

  it('fires light impact on native Android', async () => {
    const { Capacitor } = await import('@capacitor/core');
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(Capacitor.getPlatform).mockReturnValue('android');

    const { result } = renderHook(() => useCompletionHaptics());
    await result.current();

    await waitFor(() => {
      expect(impactMock).toHaveBeenCalledWith({ style: 'LIGHT' });
    });
  });
});
