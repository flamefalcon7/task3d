// plan-016 U2 — wrapper hook returning the unified Signer interface the
// /launch flow needs: walrus writeFilesFlow.executeRegister + executeCertify
// call signer.signAndExecuteTransaction({transaction, client}); the launch
// PTB sign uses the same shape; useSession.signIn calls signer.
// signPersonalMessage(bytes). In production mode, this wraps three dapp-kit
// hooks. In test mode (VITE_TEST_WALLET=1), it returns the loaded
// Ed25519Keypair directly — that class already implements every method on
// the AppSigner interface (toSuiAddress / signAndExecuteTransaction /
// signPersonalMessage / signTransaction).
//
// `loadError` lets call sites render a banner when test mode is on but the
// key fails to load (R5 / AE2). When `signer` is null AND `loadError` is
// set, /launch shows the banner and disables LAUNCH; when `signer` is null
// AND `loadError` is null, the user is simply not connected.
import { useMemo } from 'react';
import {
  useSignPersonalMessage,
  useSignTransaction,
} from '@mysten/dapp-kit';
import { TEST_WALLET_ENABLED } from './testWalletEnabled';
import { useAppAccount } from './useAppAccount';
import { loadKeypair } from '../test-wallet/loadKeypair';

// plan-016 code-review hotfix — the SDK's executeTransaction returns a
// discriminated union, NOT a flat {digest}. Declaring the AppSigner
// return as {digest} was a lie that forced an inline cast at the call
// site. Re-declare to mirror the actual SDK shape so consumers can
// pattern-match on $kind without re-casting.
export type AppSignAndExecuteResult =
  | { $kind: 'Transaction'; Transaction: { digest: string }; FailedTransaction?: never }
  | {
      $kind: 'FailedTransaction';
      Transaction?: never;
      FailedTransaction: { digest: string; status?: { error?: { message?: string } } };
    };

// plan-016 code-review hotfix — signTransaction removed from the public
// AppSigner interface. The Sui SDK's Ed25519Keypair has signTransaction
// (bytes: Uint8Array) but AppSigner previously declared it as
// ({transaction}). The `keypair as unknown as AppSigner` cast hid the
// mismatch; no current consumer calls it directly (walrus uses
// signAndExecuteTransaction; useSession uses signPersonalMessage). Drop
// it from the interface so the contract is honest about what the
// implementation actually supports.
export interface AppSigner {
  toSuiAddress(): string;
  signAndExecuteTransaction(input: {
    transaction: unknown;
    client: unknown;
  }): Promise<AppSignAndExecuteResult>;
  signPersonalMessage(
    bytes: Uint8Array,
  ): Promise<{ bytes: string; signature: string }>;
}

export interface UseAppSignerResult {
  signer: AppSigner | null;
  /** Error from test-wallet key load (test mode only). null in production. */
  loadError: Error | null;
}

export function useAppSigner(): UseAppSignerResult {
  const account = useAppAccount();
  const { mutateAsync: dappKitSignTx } = useSignTransaction();
  const { mutateAsync: dappKitSignPersonalMessage } = useSignPersonalMessage();

  return useMemo<UseAppSignerResult>(() => {
    if (TEST_WALLET_ENABLED) {
      try {
        const keypair = loadKeypair();
        // Ed25519Keypair already satisfies AppSigner. We pass through
        // by shape rather than constructing a wrapper.
        return { signer: keypair as unknown as AppSigner, loadError: null };
      } catch (err) {
        return {
          signer: null,
          loadError: err instanceof Error ? err : new Error(String(err)),
        };
      }
    }

    if (!account) return { signer: null, loadError: null };
    const address = account.address;

    // why: prod-mode wrapper mirrors the existing useDappKitSigner helper
    // in LaunchCollectionPage.tsx (lines 87-109 pre-refactor), extended
    // with signPersonalMessage so useSession can also flow through.
    const signer: AppSigner = {
      toSuiAddress: () => address,
      signAndExecuteTransaction: async ({ transaction, client }) => {
        const { bytes, signature } = await dappKitSignTx({
          transaction: transaction as never,
        });
        const c = client as {
          core: {
            executeTransaction: (input: unknown) => Promise<AppSignAndExecuteResult>;
          };
        };
        return c.core.executeTransaction({
          transaction: bytes,
          signatures: [signature],
          include: { transaction: true, effects: true },
        });
      },
      signPersonalMessage: async (bytes) => {
        // dapp-kit returns {bytes, signature}; the keypair's matches.
        const result = await dappKitSignPersonalMessage({ message: bytes });
        return { bytes: result.bytes, signature: result.signature };
      },
    };

    return { signer, loadError: null };
  }, [account, dappKitSignTx, dappKitSignPersonalMessage]);
}
