// plan-016 U1 — public surface for the test-wallet adapter. Two safety
// belts protect prod bundles even if tree-shake fails:
//   1. Module-eval throw on import.meta.env.PROD (this file)
//   2. ESLint no-restricted-imports rule banning '*/test-wallet/*' from
//      everything outside frontend/src/wallet/* (eslint.config.js, U6)

if (import.meta.env.PROD) {
  throw new Error(
    'test-wallet module loaded in production build — refusing. ' +
      'Build with VITE_TEST_WALLET unset; the wrapper hooks dead-eliminate ' +
      'this import in production.',
  );
}

export {
  loadKeypair,
  keypairFromBech32,
  MissingTestWalletKeyError,
  InvalidTestWalletKeyError,
  __resetCacheForTests,
} from './loadKeypair';
