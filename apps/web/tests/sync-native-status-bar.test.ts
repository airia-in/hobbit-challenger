import { afterEach, describe, expect, it, vi } from 'vitest';
import { syncNativeStatusBar } from '../src/lib/sync-native-status-bar';

const setStyleMock = vi.fn().mockResolvedValue(undefined);
const setBackgroundColorMock = vi.fn().mockResolvedValue(undefined);
const hideSplashMock = vi.fn().mockResolvedValue(undefined);

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

vi.mock('@capacitor/splash-screen', () => ({
  SplashScreen: {
    hide: hideSplashMock,
  },
}));

describe('syncNativeStatusBar', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('no-ops on web (non-native platform)', async () => {
    const { Capacitor } = await import('@capacitor/core');
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);

    await syncNativeStatusBar('light');

    expect(setStyleMock).not.toHaveBeenCalled();
    expect(setBackgroundColorMock).not.toHaveBeenCalled();
    expect(hideSplashMock).not.toHaveBeenCalled();
  });

  it('applies light status bar styling on native light theme', async () => {
    const { Capacitor } = await import('@capacitor/core');
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    await syncNativeStatusBar('light');

    expect(setStyleMock).toHaveBeenCalledWith({ style: 'LIGHT' });
    expect(setBackgroundColorMock).toHaveBeenCalledWith({ color: '#f7f5f2' });
    expect(hideSplashMock).toHaveBeenCalledWith({ fadeOutDuration: 200 });
  });

  it('applies dark status bar styling on native dark theme', async () => {
    const { Capacitor } = await import('@capacitor/core');
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    await syncNativeStatusBar('dark');

    expect(setStyleMock).toHaveBeenCalledWith({ style: 'DARK' });
    expect(setBackgroundColorMock).toHaveBeenCalledWith({ color: '#0a0a0a' });
    expect(hideSplashMock).toHaveBeenCalledWith({ fadeOutDuration: 200 });
  });

  it('skips splash fade when prefers-reduced-motion is set', async () => {
    const { Capacitor } = await import('@capacitor/core');
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    await syncNativeStatusBar('light');

    expect(hideSplashMock).toHaveBeenCalledWith({ fadeOutDuration: 0 });
  });
});
