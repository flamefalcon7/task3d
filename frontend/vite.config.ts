import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// why: S7 versioned masthead (plan-022, D-072). The Tusk3D wordmark is set
// with an issue number `№NNN` = the commit count on `main`, resolved once at
// build time and injected as a compile-time constant. Static deploy-stamp, not
// live data — keeps the Masthead a pure render with no runtime git/network dep.
// Fallback sentinel 0 (no `main` ref, shallow CI clone, non-repo checkout):
// the build never fails and the component drops the `№` rather than render a
// broken number (plan-022 KD-4 / AC-4).
function resolveIssueNumber(): number {
  try {
    const count = execSync('git rev-list --count main', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const n = Number.parseInt(count, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __ISSUE_NUMBER__: JSON.stringify(resolveIssueNumber()),
  },
  // why: @mysten/walrus-wasm ships a .wasm binary that we import with `?url`
  // (spec.md §2.5 + §2.11). Vite resolves `?url` to a hashed asset URL at
  // build time; assetsInclude makes the resolver treat .wasm as a static
  // asset rather than trying to compile it.
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    exclude: ['@mysten/walrus-wasm'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
