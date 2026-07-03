import { afterEach, describe, expect, it, vi } from 'vitest';
import { syncNativeStatusBar } from '../src/lib/sync-native-status-bar';

const setStyleMock = vi.fn().mockResolvedValue(undefined);
const setBackgroundColorMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(),
  },
}));

vi.mock('@capacitor/status-bar', () => ({
  StatusBar: {
    setStyle: setStyleMock,
    setBackgroundColor: setBackgroundColorMock,
  },
  Style: {
    Light: 'LIGHT',
    Dark: 'DARK',
  },
}));

describe('syncNativeStatusBar', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('no-ops on web (non-native platform)', async () => {
    const { Capacitor } = await import('@capacitor/core');
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);

    await syncNativeStatusBar('light');

    expect(setStyleMock).not.toHaveBeenCalled();
    expect(setBackgroundColorMock).not.toHaveBeenCalled();
  });

  it('applies light status bar styling on native light theme', async () => {
    const { Capacitor } = await import('@capacitor/core');
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);

    await syncNativeStatusBar('light');

    expect(setStyleMock).toHaveBeenCalledWith({ style: 'LIGHT' });
    expect(setBackgroundColorMock).toHaveBeenCalledWith({ color: '#f7f5f2' });
  });

  it('applies dark status bar styling on native dark theme', async () => {
    const { Capacitor } = await import('@capacitor/core');
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);

    await syncNativeStatusBar('dark');

    expect(setStyleMock).toHaveBeenCalledWith({ style: 'DARK' });
    expect(setBackgroundColorMock).toHaveBeenCalledWith({ color: '#0a0a0a' });
  });
});
