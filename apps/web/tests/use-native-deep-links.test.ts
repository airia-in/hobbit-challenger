import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNativeDeepLinks } from '../src/lib/use-native-deep-links';

const getLaunchUrlMock = vi.fn();
const addListenerMock = vi.fn();
const removeMock = vi.fn();

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(),
  },
}));

vi.mock('@capacitor/app', () => ({
  App: {
    getLaunchUrl: getLaunchUrlMock,
    addListener: addListenerMock,
  },
}));

describe('useNativeDeepLinks', () => {
  const assignMock = vi.fn();

  beforeEach(() => {
    window.history.pushState({}, '', '/');
    assignMock.mockClear();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        pathname: '/',
        search: '',
        hash: '',
        assign: assignMock,
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('no-ops on web (non-native platform)', async () => {
    const { Capacitor } = await import('@capacitor/core');
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);

    renderHook(() => useNativeDeepLinks());

    await waitFor(() => {
      expect(getLaunchUrlMock).not.toHaveBeenCalled();
      expect(addListenerMock).not.toHaveBeenCalled();
    });
  });

  it('routes cold-start launch URL into the WebView', async () => {
    const { Capacitor } = await import('@capacitor/core');
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    getLaunchUrlMock.mockResolvedValue({
      url: 'https://hobbit.drcode.ai/join?token=cold-start',
    });
    addListenerMock.mockResolvedValue({ remove: removeMock });

    renderHook(() => useNativeDeepLinks());

    await waitFor(() => {
      expect(assignMock).toHaveBeenCalledWith('/join?token=cold-start');
    });
    expect(addListenerMock).toHaveBeenCalledWith(
      'appUrlOpen',
      expect.any(Function),
    );
  });

  it('routes warm appUrlOpen events into the WebView', async () => {
    const { Capacitor } = await import('@capacitor/core');
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    getLaunchUrlMock.mockResolvedValue(undefined);

    let urlOpenHandler: ((event: { url: string }) => void) | undefined;
    addListenerMock.mockImplementation(async (event, handler) => {
      if (event === 'appUrlOpen') {
        urlOpenHandler = handler;
      }
      return { remove: removeMock };
    });

    renderHook(() => useNativeDeepLinks());

    await waitFor(() => {
      expect(addListenerMock).toHaveBeenCalled();
    });

    urlOpenHandler?.({
      url: 'https://hobbit.drcode.ai/join/legacy-token/',
    });

    expect(assignMock).toHaveBeenCalledWith('/join?token=legacy-token');
  });

  it('skips navigation when already on the target path', async () => {
    const { Capacitor } = await import('@capacitor/core');
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        pathname: '/join',
        search: '?token=same',
        hash: '',
        assign: assignMock,
      },
    });
    getLaunchUrlMock.mockResolvedValue({
      url: 'https://hobbit.drcode.ai/join?token=same',
    });
    addListenerMock.mockResolvedValue({ remove: removeMock });

    renderHook(() => useNativeDeepLinks());

    await waitFor(() => {
      expect(getLaunchUrlMock).toHaveBeenCalled();
    });
    expect(assignMock).not.toHaveBeenCalled();
  });

  it('removes appUrlOpen listener on unmount', async () => {
    const { Capacitor } = await import('@capacitor/core');
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    getLaunchUrlMock.mockResolvedValue(undefined);
    addListenerMock.mockResolvedValue({ remove: removeMock });

    const { unmount } = renderHook(() => useNativeDeepLinks());

    await waitFor(() => {
      expect(addListenerMock).toHaveBeenCalled();
    });

    unmount();

    await waitFor(() => {
      expect(removeMock).toHaveBeenCalled();
    });
  });
});
