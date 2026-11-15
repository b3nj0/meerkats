import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Replace with your own reverse-DNS bundle id before shipping to the App Store.
  appId: 'com.example.sunbursthollow',
  appName: 'Sunburst Hollow',
  webDir: 'dist',
  backgroundColor: '#1a1410',
  ios: {
    // The game draws edge to edge; the HUD reads safe-area insets itself.
    contentInset: 'never',
    scrollEnabled: false,
  },
};

export default config;
