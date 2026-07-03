import { useEffect } from 'react';
import {
  markNativeDeepLinkBootstrapSettled,
  markNativeDeepLinkBootstrapStarted,
} from './native-deep-link-pending';
import { resolveNativeDeepLinkTarget } from './native-deep-link';

// App.getLaunchUrl() returns the URL the app was cold-started with for the whole
// app lifetime. Under the View Transitions router this hook remounts on every
// in-app navigation, so without a session-scoped guard it would re-navigate the
// user back to the original launch target on each nav. Handle the launch URL at
// most once per app session; live appUrlOpen events are unaffected.
let launchUrlProcessed = false;

export function resetLaunchUrlProcessedForTests(): void {
  launchUrlProcessed = false;
}

function navigateToDeepLinkTarget(url: string): boolean {
  const target = resolveNativeDeepLinkTarget(url);
  if (!target) return false;

  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (current === target) return true;

  window.location.assign(target);
  return true;
}

/**
 * Routes Android App Link / deep-link opens into the Capacitor WebView.
 * Platform detection and @capacitor/* imports stay in apps/web so packages/ui
 * stays platform-agnostic.
 */
export function useNativeDeepLinks(): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let cancelled = false;
    let removeListener: (() => void) | undefined;
    let launchUrlHandled = false;

    markNativeDeepLinkBootstrapStarted();

    void (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor.isNativePlatform() || cancelled) return;

        const { App } = await import('@capacitor/app');
        if (cancelled) return;

        const handle = await App.addListener('appUrlOpen', (event) => {
          if (navigateToDeepLinkTarget(event.url)) {
            launchUrlHandled = true;
          }
        });
        if (cancelled) {
          void handle.remove();
          return;
        }

        removeListener = () => {
          void handle.remove();
        };

        if (!launchUrlProcessed) {
          const launch = await App.getLaunchUrl();
          launchUrlProcessed = true;
          if (!cancelled && launch?.url && !launchUrlHandled) {
            navigateToDeepLinkTarget(launch.url);
          }
        }
      } catch {
        // No-op on plain web or when Capacitor plugins are unavailable.
      } finally {
        if (!cancelled) {
          markNativeDeepLinkBootstrapSettled();
        }
      }
    })();

    return () => {
      cancelled = true;
      markNativeDeepLinkBootstrapSettled();
      removeListener?.();
    };
  }, []);
}
