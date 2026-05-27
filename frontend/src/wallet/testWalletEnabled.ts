// plan-016 U2 — single source of truth for the test-wallet activation
// flag. Wrapper hooks (useAppAccount, useAppSigner) and the TopNav pill
// gate on this constant. Vite replaces import.meta.env.VITE_TEST_WALLET
// with a string literal at build time, so this becomes a compile-time
// constant and downstream `if (TEST_WALLET_ENABLED)` branches are dead-
// code-eliminable in production builds.

export const TEST_WALLET_ENABLED: boolean =
  import.meta.env.VITE_TEST_WALLET === '1';
