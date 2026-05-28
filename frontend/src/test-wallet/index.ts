// plan-016 U1 — public surface for the test-wallet adapter. PROD guard
// lives in loadKeypair.ts so it fires on the actually-imported module
// (the wrapper hooks import the submodule directly, not this barrel).
// __resetCacheForTests is intentionally NOT re-exported — it's a test
// implementation detail; tests import it directly from loadKeypair.

export {
  loadKeypair,
  keypairFromBech32,
  MissingTestWalletKeyError,
  InvalidTestWalletKeyError,
} from './loadKeypair';
