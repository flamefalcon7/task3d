import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

// why: we assert on Error.name rather than instanceof — vi.resetModules
// + dynamic import creates a second copy of the error-class identity, so
// instanceof MissingTestWalletKeyError fails even when the runtime object
// is the right type. The `name` field is the stable cross-module signal.

describe('useAppSigner (plan-016 U2)', () => {
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

  it('production: returns wrapped signer with toSuiAddress matching account', async () => {
    vi.stubEnv('VITE_TEST_WALLET', '');
    vi.doMock('@mysten/dapp-kit', () => ({
      useCurrentAccount: () => ({ address: '0xabc' }),
      useSignTransaction: () => ({ mutateAsync: vi.fn() }),
      useSignPersonalMessage: () => ({ mutateAsync: vi.fn() }),
    }));
    const { useAppSigner } = await import('./useAppSigner');
    const { result } = renderHook(() => useAppSigner());
    expect(result.current.signer).not.toBeNull();
    expect(result.current.signer?.toSuiAddress()).toBe('0xabc');
    expect(result.current.loadError).toBeNull();
  });

  it('production: returns null signer when account is null', async () => {
    vi.stubEnv('VITE_TEST_WALLET', '');
    vi.doMock('@mysten/dapp-kit', () => ({
      useCurrentAccount: () => null,
      useSignTransaction: () => ({ mutateAsync: vi.fn() }),
      useSignPersonalMessage: () => ({ mutateAsync: vi.fn() }),
    }));
    const { useAppSigner } = await import('./useAppSigner');
    const { result } = renderHook(() => useAppSigner());
    expect(result.current.signer).toBeNull();
    expect(result.current.loadError).toBeNull();
  });

  it('production: signAndExecuteTransaction wires dapp-kit signTx + client.core.executeTransaction', async () => {
    // plan-016 code-review hotfix — this previously tested signTransaction
    // directly, but that method has been removed from the AppSigner
    // interface (signTransaction(bytes: Uint8Array) on the SDK keypair did
    // not structurally match the wrapper's ({transaction}) shape). The
    // prod-path uses dappKitSignTx internally and then calls
    // client.core.executeTransaction — verify the assembly chain.
    vi.stubEnv('VITE_TEST_WALLET', '');
    const signTxMock = vi.fn().mockResolvedValue({ bytes: 'b64', signature: 'sig' });
    const executeTransactionMock = vi.fn().mockResolvedValue({
      $kind: 'Transaction',
      Transaction: { digest: 'EXEC_DIGEST' },
    });
    vi.doMock('@mysten/dapp-kit', () => ({
      useCurrentAccount: () => ({ address: '0xabc' }),
      useSignTransaction: () => ({ mutateAsync: signTxMock }),
      useSignPersonalMessage: () => ({ mutateAsync: vi.fn() }),
    }));
    const { useAppSigner } = await import('./useAppSigner');
    const { result } = renderHook(() => useAppSigner());
    const mockClient = { core: { executeTransaction: executeTransactionMock } };
    const out = await result.current.signer!.signAndExecuteTransaction({
      transaction: 'TX',
      client: mockClient,
    });
    expect(signTxMock).toHaveBeenCalledWith({ transaction: 'TX' });
    expect(executeTransactionMock).toHaveBeenCalledWith({
      transaction: 'b64',
      signatures: ['sig'],
      include: { transaction: true, effects: true },
    });
    expect(out).toEqual({ $kind: 'Transaction', Transaction: { digest: 'EXEC_DIGEST' } });
  });

  it('production: signPersonalMessage delegates to dapp-kit useSignPersonalMessage', async () => {
    vi.stubEnv('VITE_TEST_WALLET', '');
    const signMsgMock = vi.fn().mockResolvedValue({ bytes: 'mb', signature: 'ms' });
    vi.doMock('@mysten/dapp-kit', () => ({
      useCurrentAccount: () => ({ address: '0xabc' }),
      useSignTransaction: () => ({ mutateAsync: vi.fn() }),
      useSignPersonalMessage: () => ({ mutateAsync: signMsgMock }),
    }));
    const { useAppSigner } = await import('./useAppSigner');
    const { result } = renderHook(() => useAppSigner());
    const msg = new TextEncoder().encode('hello');
    const out = await result.current.signer!.signPersonalMessage(msg);
    expect(signMsgMock).toHaveBeenCalledWith({ message: msg });
    expect(out).toEqual({ bytes: 'mb', signature: 'ms' });
  });

  it('test mode + valid key: returns the keypair as the signer', async () => {
    vi.stubEnv('VITE_TEST_WALLET', '1');
    vi.stubEnv('VITE_TEST_WALLET_KEY', validBech32);
    vi.doMock('@mysten/dapp-kit', () => ({
      useCurrentAccount: () => null,
      useSignTransaction: () => ({ mutateAsync: vi.fn() }),
      useSignPersonalMessage: () => ({ mutateAsync: vi.fn() }),
    }));
    const { useAppSigner } = await import('./useAppSigner');
    const { result } = renderHook(() => useAppSigner());
    expect(result.current.signer).not.toBeNull();
    expect(result.current.signer?.toSuiAddress()).toBe(validAddress);
    expect(result.current.loadError).toBeNull();
  });

  it('test mode + missing key: returns null signer + MissingTestWalletKey error', async () => {
    vi.stubEnv('VITE_TEST_WALLET', '1');
    vi.stubEnv('VITE_TEST_WALLET_KEY', '');
    vi.doMock('@mysten/dapp-kit', () => ({
      useCurrentAccount: () => null,
      useSignTransaction: () => ({ mutateAsync: vi.fn() }),
      useSignPersonalMessage: () => ({ mutateAsync: vi.fn() }),
    }));
    const { useAppSigner } = await import('./useAppSigner');
    const { result } = renderHook(() => useAppSigner());
    expect(result.current.signer).toBeNull();
    expect(result.current.loadError?.name).toBe('MissingTestWalletKey');
    expect(result.current.loadError?.message).toMatch(/VITE_TEST_WALLET_KEY is missing/);
  });
});
