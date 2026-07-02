import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.drcode.hobbit',
  appName: 'HOBBIT',
  webDir: 'www',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#0A0A0A',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0A0A0A',
    },
  },
};

export default config;
