import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetNativeDeepLinkBootstrapForTests } from '../src/lib/native-deep-link-pending';
import {
  resetLaunchUrlProcessedForTests,
  useNativeDeepLinks,
} from '../src/lib/use-native-deep-links';

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
  const callOrder: string[] = [];

  beforeEach(() => {
    resetNativeDeepLinkBootstrapForTests();
    resetLaunchUrlProcessedForTests();
    window.history.pushState({}, '', '/');
    assignMock.mockClear();
    callOrder.length = 0;
    getLaunchUrlMock.mockImplementation(async () => {
      callOrder.push('getLaunchUrl');
      return undefined;
    });
    addListenerMock.mockImplementation(async (_event, _handler) => {
      callOrder.push('addListener');
      return { remove: removeMock };
    });
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
    resetNativeDeepLinkBootstrapForTests();
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

  it('registers appUrlOpen before consuming getLaunchUrl', async () => {
    const { Capacitor } = await import('@capacitor/core');
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    getLaunchUrlMock.mockImplementation(async () => {
      callOrder.push('getLaunchUrl');
      return {
        url: 'https://hobbit.drcode.ai/join?token=cold-start',
      };
    });

    renderHook(() => useNativeDeepLinks());

    await waitFor(() => {
      expect(callOrder).toEqual(['addListener', 'getLaunchUrl']);
    });
  });

  it('routes cold-start launch URL into the WebView', async () => {
    const { Capacitor } = await import('@capacitor/core');
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    getLaunchUrlMock.mockResolvedValue({
      url: 'https://hobbit.drcode.ai/join?token=cold-start',
    });

    renderHook(() => useNativeDeepLinks());

    await waitFor(() => {
      expect(assignMock).toHaveBeenCalledWith('/join?token=cold-start');
    });
    expect(addListenerMock).toHaveBeenCalledWith(
      'appUrlOpen',
      expect.any(Function),
    );
  });

  it('processes the launch URL only once across remounts (view transitions)', async () => {
    const { Capacitor } = await import('@capacitor/core');
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    getLaunchUrlMock.mockResolvedValue({
      url: 'https://hobbit.drcode.ai/join?token=cold-start',
    });

    const first = renderHook(() => useNativeDeepLinks());
    await waitFor(() => {
      expect(getLaunchUrlMock).toHaveBeenCalledTimes(1);
      expect(assignMock).toHaveBeenCalledTimes(1);
    });
    first.unmount();

    // A subsequent in-app navigation remounts the bootstrap; it must NOT
    // re-consume the stale launch URL and yank the user back.
    assignMock.mockClear();
    renderHook(() => useNativeDeepLinks());
    await waitFor(() => {
      expect(addListenerMock).toHaveBeenCalled();
    });
    expect(getLaunchUrlMock).toHaveBeenCalledTimes(1);
    expect(assignMock).not.toHaveBeenCalled();
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

  it('dedupes getLaunchUrl when appUrlOpen already handled the same URL', async () => {
    const { Capacitor } = await import('@capacitor/core');
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    const launchUrl = 'https://hobbit.drcode.ai/join?token=shared';

    addListenerMock.mockImplementation(async (event, handler) => {
      if (event === 'appUrlOpen') {
        handler({ url: launchUrl });
      }
      return { remove: removeMock };
    });
    getLaunchUrlMock.mockResolvedValue({ url: launchUrl });

    renderHook(() => useNativeDeepLinks());

    await waitFor(() => {
      expect(getLaunchUrlMock).toHaveBeenCalled();
    });
    expect(assignMock).toHaveBeenCalledTimes(1);
    expect(assignMock).toHaveBeenCalledWith('/join?token=shared');
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

    const { unmount } = renderHook(() => useNativeDeepLinks());

    await waitFor(() => {
      expect(addListenerMock).toHaveBeenCalled();
    });

    unmount();

    await waitFor(() => {
      expect(removeMock).toHaveBeenCalled();
    });
  });

  it('settles bootstrap and skips listener registration after fast unmount', async () => {
    const { Capacitor } = await import('@capacitor/core');
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);

    let resolveAddListener: (value: { remove: typeof removeMock }) => void;
    const pendingListener = new Promise<{ remove: typeof removeMock }>(
      (resolve) => {
        resolveAddListener = resolve;
      },
    );
    addListenerMock.mockReturnValue(pendingListener);

    const { unmount } = renderHook(() => useNativeDeepLinks());
    unmount();

    resolveAddListener!({ remove: removeMock });

    await waitFor(() => {
      expect(removeMock).not.toHaveBeenCalled();
    });
  });
});
