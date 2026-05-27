import { vi } from 'vitest';

// plan-016 — vitest reads frontend/.env.local just like dev `vite`, so when a
// dev has `VITE_TEST_WALLET=1` set for browser smoke, the wrapper hooks (see
// frontend/src/wallet/testWalletEnabled.ts) would also flip to true during
// `pnpm test`. That breaks tests that pre-date the wrapper hooks and assume
// useCurrentAccount-returns-null semantics from `@mysten/dapp-kit` mocks
// (SignInButton, useSession, etc). Force the constant to '' here so tests
// always run in production-path mode unless a specific test stubs the env
// itself via vi.stubEnv.
vi.stubEnv('VITE_TEST_WALLET', '');
vi.stubEnv('VITE_TEST_WALLET_KEY', '');

// @mysten/walrus-wasm ships a .wasm binary loaded via Vite's `?url` import.
// jsdom can't compile WebAssembly and Vitest doesn't run the Vite asset
// pipeline for these imports, so stub it to a fake URL string. Walrus SDK
// code paths that touch the WASM are mocked at the @mysten/walrus level in
// the affected test files.
vi.mock('@mysten/walrus-wasm/web/walrus_wasm_bg.wasm?url', () => ({
  default: 'mock://walrus-wasm.wasm',
}));

// SignInButton uses dapp-kit hooks (useWallets, useConnectWallet) and Enoki
// helpers — its inner workings have their own dedicated test
// (SignInButton.test.tsx). For every OTHER test that just needs the component
// to render harmlessly inside BrowsePage / CreatorFlow / ModelDetailPage, stub
// it to a small placeholder so we don't have to spin up the full dapp-kit
// provider chain. Real-component coverage stays in SignInButton.test.tsx.
vi.mock('../auth/SignInButton', () => ({
  SignInButton: () => null,
}));
vi.mock('./auth/SignInButton', () => ({
  SignInButton: () => null,
}));

export {};
