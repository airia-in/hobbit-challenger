import { useCallback } from 'react';

/**
 * Light impact haptic on Android Capacitor shell completion.
 * Platform detection and @capacitor/* imports stay in apps/web so packages/ui
 * stays platform-agnostic; pass the returned callback as TaskCard `onCompleted`.
 */
export function useCompletionHaptics() {
  return useCallback(async () => {
    if (typeof window === 'undefined') return;

    try {
      const { Capacitor } = await import('@capacitor/core');
      if (
        !Capacitor.isNativePlatform() ||
        Capacitor.getPlatform() !== 'android'
      ) {
        return;
      }

      const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {
      // No-op on plain web or when Capacitor plugins are unavailable.
    }
  }, []);
}
