import { defineConfig } from 'vite';

// base './' keeps asset paths relative so the build can later be wrapped by Capacitor for iOS.
export default defineConfig({
  base: './',
  server: { host: true },
  build: { chunkSizeWarningLimit: 2000 },
});
