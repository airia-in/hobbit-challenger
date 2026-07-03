import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Warm off-white aligned with apps/web/src/lib/theme.ts light --bg-base.
 * Native cold-start splash cannot read hobbit-theme-mode (no JS yet); this
 * neutral default avoids a stark dark flash for light-theme users (#179).
 */
const NATIVE_SPLASH_BACKGROUND = '#f7f5f2';

const config: CapacitorConfig = {
  appId: 'com.drcode.hobbit',
  appName: 'HOBBIT',
  webDir: 'www',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      // JS hides after resolved theme sync (sync-native-status-bar.ts).
      launchAutoHide: false,
      backgroundColor: NATIVE_SPLASH_BACKGROUND,
      launchFadeOutDuration: 200,
    },
    StatusBar: {
      // Neutral until syncNativeStatusBar applies the resolved theme.
      style: 'LIGHT',
      backgroundColor: NATIVE_SPLASH_BACKGROUND,
    },
  },
};

export default config;
