import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

// why: TEST_WALLET_ENABLED is a module-scope constant that captures the
// env value at import time, so we have to stub the env BEFORE importing
// the wrapper hook. vi.resetModules + dynamic import per-case is the
// idiomatic vitest pattern for this.

describe('useAppAccount (plan-016 U2)', () => {
  let validBech32: string;
  let validAddress: string;

  beforeEach(() => {
    const kp = Ed25519Keypair.generate();
    validBech32 = kp.getSecretKey();
    validAddress = kp.toSuiAddress();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('production path: returns dapp-kit useCurrentAccount result', async () => {
    vi.stubEnv('VITE_TEST_WALLET', '');
    vi.doMock('@mysten/dapp-kit', () => ({
      useCurrentAccount: () => ({ address: '0xdeadbeef' }),
    }));
    const { useAppAccount } = await import('./useAppAccount');
    const { result } = renderHook(() => useAppAccount());
    expect(result.current).toEqual({ address: '0xdeadbeef' });
  });

  it('production path: returns null when dapp-kit has no account', async () => {
    vi.stubEnv('VITE_TEST_WALLET', '');
    vi.doMock('@mysten/dapp-kit', () => ({
      useCurrentAccount: () => null,
    }));
    const { useAppAccount } = await import('./useAppAccount');
    const { result } = renderHook(() => useAppAccount());
    expect(result.current).toBeNull();
  });

  it('test mode: returns the test wallet address from VITE_TEST_WALLET_KEY', async () => {
    vi.stubEnv('VITE_TEST_WALLET', '1');
    vi.stubEnv('VITE_TEST_WALLET_KEY', validBech32);
    // why: useCurrentAccount is called unconditionally per rules-of-hooks;
    // in test mode the return value is ignored. We mock it harmlessly so
    // the call doesn't crash on an undefined dapp-kit provider.
    vi.doMock('@mysten/dapp-kit', () => ({
      useCurrentAccount: () => ({ address: '0xshouldbeignored' }),
    }));
    const { useAppAccount } = await import('./useAppAccount');
    const { result } = renderHook(() => useAppAccount());
    expect(result.current).toEqual({ address: validAddress });
  });

  it('test mode + missing key: returns null (banner surfaced via useAppSigner)', async () => {
    vi.stubEnv('VITE_TEST_WALLET', '1');
    vi.stubEnv('VITE_TEST_WALLET_KEY', '');
    vi.doMock('@mysten/dapp-kit', () => ({
      useCurrentAccount: () => null,
    }));
    const { useAppAccount } = await import('./useAppAccount');
    const { result } = renderHook(() => useAppAccount());
    expect(result.current).toBeNull();
  });

  // plan-016 code-review hotfix — pre-hotfix returned a fresh
  // {address: ...} object literal on every render. That caused
  // downstream useMemos and useCallbacks (useAppSigner, useSession,
  // onLaunch) to invalidate every render. Lock identity stability so
  // a regression doesn't silently degrade memoization across the chain.
  it('production: returns stable object identity across rerenders when address is unchanged', async () => {
    vi.stubEnv('VITE_TEST_WALLET', '');
    vi.doMock('@mysten/dapp-kit', () => ({
      useCurrentAccount: () => ({ address: '0xstable' }),
    }));
    const { useAppAccount } = await import('./useAppAccount');
    const { result, rerender } = renderHook(() => useAppAccount());
    const first = result.current;
    rerender();
    rerender();
    rerender();
    expect(result.current).toBe(first);
  });
});
