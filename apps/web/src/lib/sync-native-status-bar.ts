import type { ResolvedTheme } from './theme';

const SPLASH_FADE_MS = 200;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Align Capacitor status bar chrome with the resolved web theme, then hide the
 * native splash once JS has applied the user's preference (#179).
 *
 * Native cold-start splash cannot read hobbit-theme-mode; capacitor.config.ts
 * uses a theme-neutral background until this hook runs.
 *
 * Platform detection and @capacitor/* imports stay in apps/web (see #164, #167).
 */
export async function syncNativeStatusBar(
  resolved: ResolvedTheme,
): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return;

    const { StatusBar, Style } = await import('@capacitor/status-bar');
    const style = resolved === 'light' ? Style.Light : Style.Dark;
    const color = resolved === 'light' ? '#f7f5f2' : '#0a0a0a';

    await StatusBar.setStyle({ style });
    await StatusBar.setBackgroundColor({ color });

    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide({
      fadeOutDuration: prefersReducedMotion() ? 0 : SPLASH_FADE_MS,
    });
  } catch {
    // No-op on plain web or when Capacitor plugins are unavailable.
  }
}
