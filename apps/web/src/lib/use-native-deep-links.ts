import { useEffect } from 'react';
import { resolveNativeDeepLinkTarget } from './native-deep-link';

function navigateToDeepLinkTarget(url: string): void {
  const target = resolveNativeDeepLinkTarget(url);
  if (!target) return;

  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (current === target) return;

  window.location.assign(target);
}

/**
 * Routes Android App Link / deep-link opens into the Capacitor WebView.
 * Platform detection and @capacitor/* imports stay in apps/web so packages/ui
 * stays platform-agnostic.
 */
export function useNativeDeepLinks(): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let removeListener: (() => void) | undefined;

    void (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor.isNativePlatform()) return;

        const { App } = await import('@capacitor/app');

        const launch = await App.getLaunchUrl();
        if (launch?.url) {
          navigateToDeepLinkTarget(launch.url);
        }

        const handle = await App.addListener('appUrlOpen', (event) => {
          navigateToDeepLinkTarget(event.url);
        });
        removeListener = () => {
          void handle.remove();
        };
      } catch {
        // No-op on plain web or when Capacitor plugins are unavailable.
      }
    })();

    return () => {
      removeListener?.();
    };
  }, []);
}
