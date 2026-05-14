import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
