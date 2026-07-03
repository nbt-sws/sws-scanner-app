import type { CapacitorConfig } from '@capacitor/cli';

// Capacitor config — wraps the React build into native iOS / Android shells.
// Build the web app first (npm run build), then run `npx cap sync` to copy
// the /build folder into ios/ and android/ projects.

const config: CapacitorConfig = {
  appId: 'app.swibswap.scanner',
  appName: 'SwibSwap',
  webDir: 'build',
  bundledWebRuntime: false,
  backgroundColor: '#0F1228',
  ios: {
    contentInset: 'always',
    backgroundColor: '#0F1228',
  },
  android: {
    backgroundColor: '#0F1228',
    allowMixedContent: false,
  },
  plugins: {
    Camera: {
      // ask for "while-using" permission; user can change in OS settings.
      permissions: ['camera', 'photos'],
    },
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#0F1228',
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: false,
    },
  },
};

export default config;
