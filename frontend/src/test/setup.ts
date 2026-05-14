import { vi } from 'vitest';

// @mysten/walrus-wasm ships a .wasm binary loaded via Vite's `?url` import.
// jsdom can't compile WebAssembly and Vitest doesn't run the Vite asset
// pipeline for these imports, so stub it to a fake URL string. Walrus SDK
// code paths that touch the WASM are mocked at the @mysten/walrus level in
// the affected test files.
vi.mock('@mysten/walrus-wasm/web/walrus_wasm_bg.wasm?url', () => ({
  default: 'mock://walrus-wasm.wasm',
}));

export {};
