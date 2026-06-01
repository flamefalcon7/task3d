// plan-027 U6 — shared "buy-access decrypt" helper.
//
// Extracts the SessionKey → seal_approve_entitlement → decryptEncryptedBase
// sequence that both U8 (ModelDetailPage consumer view) and U10
// (LaunchCollectionPage free entitlement-gated unlock) run. Before this, the
// sequence lived inline in `LaunchCollectionPage.onUnlock`; pulling it into one
// self-contained, well-typed module gives U8/U10 a stable artifact to consume
// rather than reaching into a page internal.
//
// The full sequence (mirrors LaunchCollectionPage.onUnlock 830-859 pre-split):
//   1. Reuse a cached SessionKey for (address, packageId), or create one and
//      have the wallet sign its personal message, then activate + cache it.
//   2. Lazily read the encrypted base's `sealed_key` (BCS EncryptedObject) from
//      chain — the catalog summary omits it.
//   3. decryptEncryptedBase: build the seal_approve_entitlement dry-run PTB
//      (entitlement-gated, plan-027 D-078), key-server dry-run → AES key (with
//      bounded retry for the fresh-object race), fetch ciphertext, AES-GCM
//      decrypt → plaintext GLB bytes.
//   4. Wrap the plaintext in a `model/gltf-binary` object URL for the in-app
//      Babylon viewer. There is NO raw-download affordance (R7): the caller
//      mounts the URL in the viewer and revokes it on unmount.
//
// Every network/SDK/wallet boundary is injected (suiClient, signPersonalMessage,
// SealClient factory, txBytes builder) so U8/U10 unit tests drive the arc with
// mocks — no live key servers, no real wallet. Production callers pass their
// app's shared client + the dapp-kit / AppSigner signPersonalMessage.

import type { SealClient } from '@mysten/seal';
import type { Transaction } from '@mysten/sui/transactions';
import type { Model3DSummary } from '@overflow2026/shared';
import { getSealClient } from './sealClient';
import {
  createSession,
  activateSession,
  getCachedSession,
} from './sessionKey';
import {
  decryptEncryptedBase,
  parseSealedKeyFromObject,
  PACKAGE_ID,
} from '../collection/encryptedFork';

/** The minimal `Model3D` shape this helper reads: the on-chain object id (the
 *  seal_approve_entitlement `model` arg + sealed_key read target) and the
 *  ciphertext blob id. A `Model3DSummary` satisfies it. */
export type DecryptableModel = Pick<Model3DSummary, 'objectId' | 'glbBlobId'>;

/** The minimal SuiClient surface this helper needs — getObject (lazy sealed_key
 *  read) and the `onlyTransactionKind` build target for the dry-run PTB. */
export interface DecryptSuiClient {
  getObject(input: {
    id: string;
    options: { showContent: true };
  }): Promise<unknown>;
}

/** Wallet personal-message signer (the dapp-kit / AppSigner shape:
 *  `signPersonalMessage(bytes) → { signature }`). */
export type SignPersonalMessage = (
  message: Uint8Array,
) => Promise<{ signature: string }>;

export interface DecryptViaEntitlementArgs {
  /** The encrypted ALLOW_LIST base to decrypt (objectId + ciphertext blob id). */
  model: DecryptableModel;
  /** The caller's soulbound `AccessEntitlement` id for this base (from
   *  `useOwnedEntitlements`, or the just-bought entitlement read off
   *  `objectChanges`). Gates the key-server dry-run. */
  entitlementId: string;
  /** The app's shared SuiClient (getObject + onlyTransactionKind build). */
  suiClient: DecryptSuiClient;
  /** Sign the SessionKey personal message (one wallet popup, only when no live
   *  cached session exists for this address+package). */
  signPersonalMessage: SignPersonalMessage;
  /** The signed-in wallet address — the SessionKey + the on-chain
   *  `entitlement.holder == sender` gate both key off it. */
  address: string;
  /** Override the SealClient (tests). Defaults to the app's testnet client. */
  sealClient?: Pick<SealClient, 'decrypt'>;
  /** Override the decrypt retry attempt count (tests). */
  maxAttempts?: number;
}

export interface DecryptViaEntitlementResult {
  /** The plaintext GLB bytes (consumed by the in-app viewer / backend bake). */
  plaintext: Uint8Array;
  /** A `model/gltf-binary` object URL for the Babylon viewer. The caller MUST
   *  `URL.revokeObjectURL(blobUrl)` when the viewer unmounts. No download link
   *  is exposed for these bytes (R7). */
  blobUrl: string;
}

/**
 * Run the full SessionKey → seal_approve_entitlement → decrypt sequence for an
 * entitlement holder and return the plaintext GLB bytes plus a viewer object
 * URL. Shared by U8 (consumer view) and U10 (free fork-unlock).
 *
 * `signPersonalMessage` is invoked at most once (only when no live SessionKey is
 * cached for this address+package). A persistent decrypt denial — e.g. a wallet
 * that holds no entitlement, so `seal_approve_entitlement` aborts
 * deterministically — throws after the bounded retries, never silently succeeds.
 */
export async function decryptViaEntitlement(
  args: DecryptViaEntitlementArgs,
): Promise<DecryptViaEntitlementResult> {
  // 1 — SessionKey: reuse a cached one within its short TTL so a retry doesn't
  // re-prompt; otherwise create one and sign its personal message.
  let sessionKey = getCachedSession(args.address, PACKAGE_ID);
  if (!sessionKey) {
    const pending = await createSession(
      args.address,
      PACKAGE_ID,
      args.suiClient as never,
    );
    const { signature } = await args.signPersonalMessage(pending.personalMessage);
    sessionKey = await activateSession(pending, PACKAGE_ID, signature);
  }

  // 2 — lazily read the encrypted base's sealed_key (omitted from the catalog
  // summary because it is a few hundred bytes per model).
  const modelResp = await args.suiClient.getObject({
    id: args.model.objectId,
    options: { showContent: true },
  });
  const sealedKey = parseSealedKeyFromObject(modelResp);

  // 3 — entitlement-gated decrypt (key-server dry-run + AES-GCM).
  const plaintext = await decryptEncryptedBase({
    sealClient: args.sealClient ?? getSealClient(),
    sessionKey,
    sealedKey,
    ciphertextBlobId: args.model.glbBlobId,
    entitlementId: args.entitlementId,
    baseModelId: args.model.objectId,
    buildTxBytes: (tx: Transaction) =>
      tx.build({ client: args.suiClient as never, onlyTransactionKind: true }),
    maxAttempts: args.maxAttempts,
  });

  // 4 — wrap for the in-app viewer. Caller revokes on unmount (no download).
  const blobUrl = URL.createObjectURL(
    new Blob([plaintext as BlobPart], { type: 'model/gltf-binary' }),
  );

  return { plaintext, blobUrl };
}
