import { EncryptedObject } from '@mysten/seal';
import type { SealClient, SessionKey } from '@mysten/seal';
import { fromHex } from '@mysten/sui/utils';
import { decryptKey, decryptBase } from './envelope';

// plan-026 U5 — forker-side decrypt orchestration for the encrypted ALLOW_LIST
// 3-step fork. Pure, network-boundary-injected (SealClient + a txBytes-builder
// + a ciphertext fetcher are all passed in), so the unit tests mock at the Seal
// / network seam — no live key servers.
//
// STEP 2 of the 3-step flow (cap minted in step 1, mint in step 3):
//   1. Recover the FULL Seal identity from the sealed_key EncryptedObject.
//   2. Build the seal_approve_cap PTB txBytes (caller-supplied builder).
//   3. decryptKey → AES key (key servers dry-run seal_approve_cap; gasless).
//      Bounded retry/backoff absorbs the fresh-object dry-run race (the cap /
//      collection minted in step 1 may not be visible to the key servers yet,
//      surfacing as a transient 503/not-found).
//   4. Fetch the ciphertext from Walrus + AES-GCM-decrypt → plaintext GLB.

// ---------------------------------------------------------------------------
// Deferred-tuning constants (plan: "Retry/backoff tuning for the key-server
// fresh-object dry-run race" — Deferred to Implementation). These are a first
// cut; tune against real testnet dry-run latency once the wallet-signed path
// is exercised end-to-end. Kept here as named constants so the tuning has one
// home rather than being scattered through the page.
// 2 attempts (1 retry) keeps the combined decrypt under the ~75s budget: with
// KEY_SERVER_TIMEOUT_MS=15s a wedged key server costs ≈30s here, not 60-80s.
// Still absorbs the common fresh-object dry-run race (one backoff+retry); a
// persistent denial throws after both attempts rather than being retried away.
export const DECRYPT_KEY_MAX_ATTEMPTS = 2;
export const DECRYPT_KEY_BACKOFF_BASE_MS = 600;
// Exponential-ish backoff: base * 2^(attempt-1), capped, so attempts land at
// roughly 600 / 1200 / 2400 ms between the 4 tries (~4.2s total worst case).
export const DECRYPT_KEY_BACKOFF_MAX_MS = 3000;

/**
 * Recover the FULL Seal identity (`[seal_id prefix][nonce]`) that the
 * EncryptedObject was sealed under, as raw bytes for the seal_approve_cap PTB.
 *
 * WHY parse instead of using the on-chain `model.seal_id`: the on-chain field
 * is only the PREFIX (the random per-model seal_id). The actual Seal identity
 * appends a random nonce at encrypt time (`encryptBase` → `buildSealId`), and
 * that nonce is NOT stored on chain — it lives only inside the EncryptedObject.
 * `seal_approve_cap` asserts `is_prefix(model.seal_id, id)`, so we must pass the
 * full id (which starts with seal_id) — the prefix alone would be a different,
 * never-encrypted identity and the key servers would refuse to release shares.
 *
 * `EncryptedObject.parse(bytes).id` returns the id as a hex string (the BCS
 * `byteVector` field carries a `toHex` output transform — verified against
 * @mysten/seal@1.1.3). `fromHex` turns it back into the bytes the PTB needs.
 */
export function recoverFullSealId(sealedKey: Uint8Array): Uint8Array {
  const parsed = EncryptedObject.parse(sealedKey);
  return fromHex(parsed.id);
}

function backoffDelayMs(attempt: number): number {
  const raw = DECRYPT_KEY_BACKOFF_BASE_MS * 2 ** (attempt - 1);
  return Math.min(raw, DECRYPT_KEY_BACKOFF_MAX_MS);
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Decrypt the AES key with bounded retry to absorb the fresh-object dry-run
 * race. The cap + collection minted in step 1 may not be visible to the key
 * servers immediately, surfacing as a transient failure on the FIRST attempts;
 * we back off and retry. A persistent failure (e.g. an un-paid wallet that
 * holds no cap → seal_approve_cap aborts deterministically) still throws after
 * the attempts are exhausted — denial is not silently retried into success.
 */
export async function decryptKeyWithRetry(
  client: Pick<SealClient, 'decrypt'>,
  sealedKey: Uint8Array,
  sessionKey: SessionKey,
  txBytes: Uint8Array,
  opts: { maxAttempts?: number } = {},
): Promise<Uint8Array> {
  const maxAttempts = opts.maxAttempts ?? DECRYPT_KEY_MAX_ATTEMPTS;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await decryptKey(client, sealedKey, sessionKey, txBytes);
    } catch (e) {
      lastErr = e;
      if (attempt < maxAttempts) {
        await sleep(backoffDelayMs(attempt));
      }
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(String(lastErr ?? 'decryptKey failed'));
}

export interface DecryptBaseGlbArgs {
  /** SealClient (mocked at the boundary in unit tests). */
  client: Pick<SealClient, 'decrypt'>;
  /** The Seal-wrapped AES key (BCS EncryptedObject) read from `model.sealed_key`. */
  sealedKey: Uint8Array;
  /** Activated SessionKey (one wallet personal-message signature). */
  sessionKey: SessionKey;
  /** seal_approve_cap PTB serialized with `onlyTransactionKind: true`. */
  txBytes: Uint8Array;
  /** Fetch the AES ciphertext bytes from Walrus (the base's `glb_blob_id`). */
  fetchCiphertext: () => Promise<Uint8Array>;
  /** Override the retry attempt count (tests). */
  maxAttempts?: number;
}

/**
 * Full step-2 decrypt: unwrap the AES key (with retry), fetch the ciphertext,
 * AES-GCM-decrypt to the plaintext GLB. Returns the plaintext bytes the EXISTING
 * backend bake (`runBuildVariants`) consumes — there is intentionally NO raw-
 * download affordance for these bytes (R9 "no forker-facing download").
 */
export async function decryptBaseGlb(
  args: DecryptBaseGlbArgs,
): Promise<Uint8Array> {
  const aesKey = await decryptKeyWithRetry(
    args.client,
    args.sealedKey,
    args.sessionKey,
    args.txBytes,
    { maxAttempts: args.maxAttempts },
  );
  const ciphertext = await args.fetchCiphertext();
  return decryptBase(ciphertext, aesKey);
}
