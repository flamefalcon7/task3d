import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Separate from vite.config.ts because Vitest 2.x bundles its own Vite types
// that conflict with Vite 8's UserConfig (notably server.proxy). Keeping the
// test config isolated avoids that type clash without affecting dev/build.
export default defineConfig({
  plugins: [react() as never],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
