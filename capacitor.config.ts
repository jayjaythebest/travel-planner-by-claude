import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.jayjaythebest.travelplanner',
  appName: '旅程規劃',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  ios: {
    // Let the WebView extend under the status bar; CSS safe-area-inset-* handles spacing
    contentInset: 'automatic',
    scrollEnabled: false,
    backgroundColor: '#18181b',
  },
};

export default config;
