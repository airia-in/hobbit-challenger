import type { ResolvedTheme } from './theme';

/**
 * Align Capacitor status bar chrome with the resolved web theme.
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
  } catch {
    // No-op on plain web or when Capacitor plugins are unavailable.
  }
}
