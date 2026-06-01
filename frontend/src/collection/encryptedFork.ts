import type { SealClient, SessionKey } from '@mysten/seal';
import { Transaction } from '@mysten/sui/transactions';
import {
  buildLaunchCollectionWithEntitlementPtb,
  buildSealApproveEntitlementPtb,
  buildMintTokensPtb,
} from '../sui/collectionTxBuilders';
import { TESTNET } from '../sui/networkConfig';
import { recoverFullSealId, decryptBaseGlb } from '../seal/forkerDecrypt';
import { WALRUS_AGGREGATOR } from '../walrus/aggregator';

// plan-026 U5 — encrypted ALLOW_LIST 3-step fork orchestration. Pure functions
// with every network/SDK/wallet boundary injected, so unit tests drive the full
// arc with mocks (no live key servers, no real wallet). The page wires these to
// its real signer / SealClient / SuiClient.
//
//   Step 1  launchEncryptedCollection  → { capId, collectionId, digest }
//   Step 2  decryptEncryptedBase       → plaintext GLB (key-server dry-run gate)
//   Step 3  mintEncryptedTokens        → digest (sets quilt + batch-mints)

// ---------------------------------------------------------------------------
// plan-027 D-078 — STEP 1 of the encrypted ALLOW_LIST fork, now charged AT MINT
// (not at unlock): cap-issuing `launch_collection_with_entitlement` (derive fee
// paid, empty quilt, entitlement-gated). One popup. The unlock step is a FREE
// entitlement-gated decrypt; this is the only on-chain charge of the fork.

export interface LaunchResult {
  capId: string;
  collectionId: string;
  digest: string;
}

const CAP_TYPE_SUFFIX = '::model3d::NftCollectionCreatorCap';
const COLLECTION_TYPE_SUFFIX = '::model3d::NftCollection';

interface CreatedObjectChange {
  type: 'created';
  objectType: string;
  objectId: string;
}

/**
 * Extract the freshly-created cap + collection object ids from a launch tx's
 * `objectChanges`. The cap is the created `NftCollectionCreatorCap`; the
 * collection is the created `NftCollection`. Throws if either is missing (the
 * 3-step flow cannot continue without both).
 */
export function extractLaunchIds(
  objectChanges: ReadonlyArray<{ type?: string; objectType?: string; objectId?: string }>,
): { capId: string; collectionId: string } {
  const created = objectChanges.filter(
    (c): c is CreatedObjectChange =>
      c.type === 'created' &&
      typeof c.objectType === 'string' &&
      typeof c.objectId === 'string',
  );
  const cap = created.find((c) => c.objectType.endsWith(CAP_TYPE_SUFFIX));
  const collection = created.find((c) => c.objectType.endsWith(COLLECTION_TYPE_SUFFIX));
  if (!cap || !collection) {
    throw new Error(
      'launch_collection effects missing the created cap or collection — cannot continue the 3-step fork',
    );
  }
  return { capId: cap.objectId, collectionId: collection.objectId };
}

export interface LaunchEncryptedCollectionArgs {
  modelId: string;
  /** plan-027 D-078 — the caller's soulbound `AccessEntitlement` id for this
   *  base. The entitlement-gated launch entry asserts the caller holds it; the
   *  bare `launch_collection` rejects ALLOW_LIST bases. */
  entitlementId: string;
  feeMist: bigint;
  /** Sign + execute the launch PTB (wallet). Returns the tx digest. */
  signAndExecute: (tx: Transaction) => Promise<string>;
  /** Read a tx's objectChanges by digest (after waiting for finality). */
  fetchObjectChanges: (
    digest: string,
  ) => Promise<ReadonlyArray<{ type?: string; objectType?: string; objectId?: string }>>;
}

/**
 * STEP 1 — call cap-issuing `launch_collection_with_entitlement(model,
 * entitlement, payment≥fee, quilt="")` (plan-027 D-078). The quilt is empty
 * because the variants aren't baked until after the base decrypts; `mint_tokens`
 * sets the real one. Returns the new cap + collection ids parsed from the
 * effects. The derive fee is charged HERE (at mint), not at the free unlock.
 */
export async function launchEncryptedCollection(
  args: LaunchEncryptedCollectionArgs,
): Promise<LaunchResult> {
  const { tx } = buildLaunchCollectionWithEntitlementPtb({
    modelId: args.modelId,
    entitlementId: args.entitlementId,
    feeMist: args.feeMist,
    // D-076 — empty quilt at launch; mint_tokens (step 3) sets the real one.
    quiltBlobId: '',
  });
  const digest = await args.signAndExecute(tx);
  const changes = await args.fetchObjectChanges(digest);
  const { capId, collectionId } = extractLaunchIds(changes);
  return { capId, collectionId, digest };
}

/**
 * Read the encrypted base's `sealed_key` (the BCS EncryptedObject wrapping the
 * AES key) from chain. The catalog `Model3DSummary` deliberately omits this
 * few-hundred-byte field, so we lazily getObject only when the forker actually
 * pays to fork. A `vector<u8>` Move field comes back from JSON-RPC as an array
 * of numbers. Throws if the object isn't a Move object or carries no sealed_key.
 */
export function parseSealedKeyFromObject(resp: unknown): Uint8Array {
  const data = (resp as { data?: { content?: { dataType?: string; fields?: Record<string, unknown> | null } | null } }).data;
  if (data?.content?.dataType !== 'moveObject') {
    throw new Error('encrypted base read-back is not a Move object');
  }
  const fields = (data.content.fields ?? {}) as Record<string, unknown>;
  const raw = fields.sealed_key;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('encrypted base has no sealed_key — is it actually encrypted?');
  }
  return Uint8Array.from(raw.map((n) => Number(n)));
}

// ---------------------------------------------------------------------------
// Step 2 — decrypt the base (key-server dry-run gate). No on-chain tx.

export interface DecryptEncryptedBaseArgs {
  /** SealClient (mocked at the boundary in unit tests). */
  sealClient: Pick<SealClient, 'decrypt'>;
  /** Activated SessionKey (one wallet personal-message signature). */
  sessionKey: SessionKey;
  /** The Seal-wrapped AES key read from `model.sealed_key` (BCS EncryptedObject). */
  sealedKey: Uint8Array;
  /** The base's `glb_blob_id` — holds AES CIPHERTEXT for an encrypted base. */
  ciphertextBlobId: string;
  /** plan-027 D-078 — the soulbound `AccessEntitlement` id that gates decrypt
   *  (replaces the old cap/collection binding). The caller proves it bought
   *  access; the key servers dry-run `seal_approve_entitlement(id, entitlement,
   *  model)` against it. */
  entitlementId: string;
  /** The encrypted base `Model3D` object id the entitlement binds to. */
  baseModelId: string;
  /** Build the seal_approve_entitlement PTB into txBytes (onlyTransactionKind). */
  buildTxBytes: (tx: Transaction) => Promise<Uint8Array>;
  /** Fetch raw bytes from a Walrus aggregator blob url (defaults to global fetch). */
  fetchBytes?: (url: string) => Promise<Uint8Array>;
  /** Override the decrypt retry attempt count (tests). */
  maxAttempts?: number;
}

async function defaultFetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Walrus aggregator ${res.status} for the encrypted base`);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * STEP 2 — recover the FULL Seal identity from the sealed key, build the
 * seal_approve_entitlement dry-run PTB (plan-027 D-078: entitlement-gated, no
 * cap), decrypt the AES key (with bounded retry for the fresh-object race),
 * fetch the ciphertext, and AES-GCM-decrypt to the plaintext GLB. Returns the
 * plaintext the existing backend bake consumes — there is NO raw-download
 * affordance for these bytes (R7).
 */
export async function decryptEncryptedBase(
  args: DecryptEncryptedBaseArgs,
): Promise<Uint8Array> {
  // The on-chain model.seal_id is only the PREFIX; the full id (prefix+nonce)
  // lives inside the EncryptedObject and is what seal_approve_entitlement's
  // is_prefix(model.seal_id, id) check needs.
  const fullId = recoverFullSealId(args.sealedKey);
  const { tx } = buildSealApproveEntitlementPtb({
    id: fullId,
    entitlementId: args.entitlementId,
    baseModelId: args.baseModelId,
  });
  const txBytes = await args.buildTxBytes(tx);
  const fetchBytes = args.fetchBytes ?? defaultFetchBytes;
  // The ciphertext is a QUILT PATCH (co-located with the preview stills in one
  // Walrus quilt at publish — single upload, ~3 popups), so it resolves via the
  // by-quilt-patch-id endpoint, not /v1/blobs/<standalone-id>.
  const ciphertextUrl = `${WALRUS_AGGREGATOR}/v1/blobs/by-quilt-patch-id/${args.ciphertextBlobId}`;
  return decryptBaseGlb({
    client: args.sealClient,
    sealedKey: args.sealedKey,
    sessionKey: args.sessionKey,
    txBytes,
    fetchCiphertext: () => fetchBytes(ciphertextUrl),
    maxAttempts: args.maxAttempts,
  });
}

// ---------------------------------------------------------------------------
// Step 3 — mint_tokens (set quilt + batch-mint). One popup.

export interface MintEncryptedTokensArgs {
  capId: string;
  collectionId: string;
  quiltBlobId: string;
  tokenNames: string[];
  tokenPatchIds: string[];
  signAndExecute: (tx: Transaction) => Promise<string>;
}

/**
 * STEP 3 — call `mint_tokens(cap, collection, quilt_blob_id, names, patches)`:
 * pin the post-bake quilt and batch-mint the colored fleet. Returns the digest.
 */
export async function mintEncryptedTokens(
  args: MintEncryptedTokensArgs,
): Promise<string> {
  const { tx } = buildMintTokensPtb({
    capId: args.capId,
    collectionId: args.collectionId,
    quiltBlobId: args.quiltBlobId,
    tokenNames: args.tokenNames,
    tokenPatchIds: args.tokenPatchIds,
  });
  return args.signAndExecute(tx);
}

// Re-export the package id so the page builds the SessionKey + onlyTransactionKind
// PTB against the same (republished) package the builders target.
export const PACKAGE_ID = TESTNET.model3dPackageId;
