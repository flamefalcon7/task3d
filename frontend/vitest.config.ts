import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Separate from vite.config.ts because Vitest 2.x bundles its own Vite types
// that conflict with Vite 8's UserConfig (notably server.proxy). Keeping the
// test config isolated avoids that type clash without affecting dev/build.
//
// R6 — Type checking enforced at `npm test` via the `test` script's
// `tsc --noEmit` prefix in package.json. Vitest's built-in `typecheck.enabled`
// is reserved for `.test-d.ts` type-only tests; we want full project tsc on
// every test run so @ts-expect-error directives in regular `.test.ts` files
// (e.g. scenario 4 in kioskTxBuilders.test.ts) become load-bearing.
export default defineConfig({
  plugins: [react() as never],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
