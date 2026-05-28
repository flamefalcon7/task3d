// plan-016 U2 — wrapper hook over dapp-kit's useCurrentAccount(). In
// production builds (VITE_TEST_WALLET unset) this is a pass-through; in
// dev with VITE_TEST_WALLET=1 + a valid VITE_TEST_WALLET_KEY this returns
// the test wallet's address so /launch and /signin behave as though the
// user were connected to Slush with that key.
//
// Shape is intentionally narrow — call sites only consume `address`, so
// returning the full dapp-kit WalletAccount would be more surface than
// needed and would force test-mode to fabricate fields it doesn't have.
//
// Tree-shake: Vite replaces import.meta.env.VITE_TEST_WALLET with a
// string literal at build time, making TEST_WALLET_ENABLED a compile-
// time constant. Rollup then drops the test-mode branch when the value
// is `false`, leaving the static `loadKeypair` import unused, which is
// pruned by tree-shake. AE4 grep verification at U6 confirms zero
// test-wallet refs in the prod bundle.
import { useMemo } from 'react';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { TEST_WALLET_ENABLED } from './testWalletEnabled';
import { loadKeypair } from '../test-wallet/loadKeypair';

export interface AppAccount {
  address: string;
}

export function useAppAccount(): AppAccount | null {
  const dappKitAccount = useCurrentAccount();

  // why: the keypair load is wrapped in useMemo so it runs once per
  // mount, not on every render. The try/catch swallows load errors —
  // useAppSigner surfaces the same error as a banner; staying null on
  // load failure keeps the LAUNCH null-check working.
  const testAccount = useMemo<AppAccount | null>(() => {
    if (!TEST_WALLET_ENABLED) return null;
    try {
      return { address: loadKeypair().toSuiAddress() };
    } catch {
      return null;
    }
  }, []);

  // plan-016 code-review hotfix — memoize the prod-path return on the
  // address string primitive. Pre-hotfix, this returned `{ address: ... }`
  // as a fresh object literal every render, which made the wrapper
  // useAppSigner.useMemo (and onLaunch's useCallback) invalidate every
  // render. Behavior was correct (downstream string compares short-
  // circuited) but the memo instability eroded reuse and masked future
  // regressions. dapp-kit's useCurrentAccount returns a stable selector
  // result per account; mirroring that here restores the original
  // invariant.
  const prodAddress = dappKitAccount?.address ?? null;
  const prodAccount = useMemo<AppAccount | null>(
    () => (prodAddress ? { address: prodAddress } : null),
    [prodAddress],
  );

  return TEST_WALLET_ENABLED ? testAccount : prodAccount;
}
