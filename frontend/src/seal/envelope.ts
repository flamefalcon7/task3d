import type { SealClient } from '@mysten/seal';
import { DemType } from '@mysten/seal';
import { SEAL_THRESHOLD } from './sealClient';

// plan-026 U1 — Envelope encryption (AES-256-GCM + Seal-wrapped key).
//
// WHY envelope, not Seal-over-the-GLB: Seal.encrypt itself runs an AES/HMAC DEM
// over its `data`, but routing a multi-MB mesh through Seal would bloat bytes
// against the Walrus 35/46 MB encoder OOM cliff (mesh decimation was declined).
// So we AES-256-GCM the GLB ourselves with WebCrypto (ciphertext ≈ plaintext +
// ~28B overhead) and Seal-encrypt ONLY the 32-byte AES key. This is Seal's
// documented large-payload pattern.
//
// LAYERING (which layer is real vs mocked in tests):
//   - AES-GCM layer (encryptBase ciphertext / decryptBase): real WebCrypto,
//     fully unit-tested for round-trip + tamper rejection.
//   - Seal layer (the sealed AES key): network-dependent (key servers), so the
//     SealClient is MOCKED at the boundary in unit tests. encryptKey/decryptKey
//     here are thin pass-throughs to client.encrypt/client.decrypt.

// AES-256-GCM parameters. 96-bit IV is the GCM-recommended nonce length; the
// 128-bit auth tag is appended to the ciphertext by WebCrypto.
const AES_KEY_BITS = 256;
const AES_GCM_IV_BYTES = 12;
// WebCrypto appends the 16-byte GCM auth tag to the ciphertext. We also prepend
// the 12-byte IV so a single Uint8Array is self-contained. Exposed for the
// length-overhead test (guards the OOM-cliff parity assumption).
export const AES_GCM_OVERHEAD_BYTES = AES_GCM_IV_BYTES + 16;

// Seal identity nonce length (bytes) appended after the model-id prefix so each
// encrypt call produces a unique on-chain identity even for the same model.
const ID_NONCE_BYTES = 16;

export interface EncryptBaseResult {
  /** AES-256-GCM ciphertext of the GLB: [12B IV][ciphertext+16B tag]. */
  ciphertext: Uint8Array;
  /** Seal-wrapped AES key — BCS bytes of the Seal EncryptedObject. Small. */
  sealedKey: Uint8Array;
  /**
   * Hex of the Seal identity used (inner bytes only: [model_id][nonce]).
   * Seal namespaces the packageId itself, so this does NOT include a package
   * prefix. Persist it (the on-chain `id`) to rebuild the seal_approve PTB.
   */
  idHex: string;
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

// Normalize a model id to raw bytes. Accepts either an already-decoded byte
// array or a hex string (with or without a leading 0x) — the on-chain object
// id is a hex string, but callers holding raw bytes can pass them through.
export function modelIdToBytes(modelId: string | Uint8Array): Uint8Array {
  if (modelId instanceof Uint8Array) return modelId;
  const hex = modelId.startsWith('0x') ? modelId.slice(2) : modelId;
  if (hex.length % 2 !== 0 || /[^0-9a-fA-F]/.test(hex)) {
    throw new Error('modelId must be a hex string or Uint8Array');
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

// Build the Seal identity bytes: [model_id_bytes][random nonce]. Prefix-binding
// to the model id is what seal_approve asserts on-chain (id starts_with model).
export function buildSealId(modelId: string | Uint8Array): Uint8Array {
  const idBytes = modelIdToBytes(modelId);
  const nonce = new Uint8Array(ID_NONCE_BYTES);
  crypto.getRandomValues(nonce);
  const id = new Uint8Array(idBytes.length + nonce.length);
  id.set(idBytes, 0);
  id.set(nonce, idBytes.length);
  return id;
}

// AES-GCM encrypt arbitrary bytes with a freshly generated key. Returns the
// raw 32-byte key (to be Seal-wrapped) and the IV-prefixed ciphertext.
async function aesEncrypt(
  plaintext: Uint8Array,
): Promise<{ aesKey: Uint8Array; ciphertext: Uint8Array }> {
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: AES_KEY_BITS },
    true,
    ['encrypt', 'decrypt'],
  );
  const iv = new Uint8Array(AES_GCM_IV_BYTES);
  crypto.getRandomValues(iv);
  const ctBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext as unknown as BufferSource,
  );
  const ct = new Uint8Array(ctBuf);
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  const rawKey = new Uint8Array(await crypto.subtle.exportKey('raw', key));
  return { aesKey: rawKey, ciphertext: out };
}

/**
 * Envelope-encrypt a base GLB for an encrypted-policy publish.
 *
 * AES-256-GCM the bytes with a random key, then Seal-wrap the 32-byte key
 * under `id = [model_id][nonce]` (inner bytes only — Seal adds the package
 * prefix via `packageId`). The big ciphertext goes to Walrus; the small
 * `sealedKey` goes on-chain in the Model3D struct.
 *
 * @param client    SealClient (mock at the boundary in unit tests).
 * @param packageId The (republished) Move package id Seal namespaces under.
 * @param bytes     The plaintext GLB.
 * @param modelId   The Model3D object id (hex) bound into the Seal identity.
 */
export async function encryptBase(
  client: Pick<SealClient, 'encrypt'>,
  packageId: string,
  bytes: Uint8Array,
  modelId: string | Uint8Array,
): Promise<EncryptBaseResult> {
  const { aesKey, ciphertext } = await aesEncrypt(bytes);
  const id = buildSealId(modelId);
  const idHex = toHex(id);
  // kemType is omitted: the SDK exports only DemType at runtime (KemType is
  // type-only in 1.1.3) and defaults to the sole KEM
  // (BonehFranklinBLS12381DemCCA). demType AES-GCM-256 wraps the 32-byte key.
  const { encryptedObject } = await client.encrypt({
    demType: DemType.AesGcm256,
    threshold: SEAL_THRESHOLD,
    packageId,
    id: idHex,
    data: aesKey,
  });
  return { ciphertext, sealedKey: encryptedObject, idHex };
}

/**
 * AES-256-GCM decrypt an IV-prefixed ciphertext (as produced by encryptBase)
 * with a raw 32-byte key. Throws on auth-tag failure (tampered ciphertext or
 * wrong key) — WebCrypto rejects with an OperationError.
 */
export async function decryptBase(
  ciphertext: Uint8Array,
  aesKey: Uint8Array,
): Promise<Uint8Array> {
  if (ciphertext.length < AES_GCM_OVERHEAD_BYTES) {
    throw new Error('ciphertext too short to contain IV + GCM tag');
  }
  const iv = ciphertext.subarray(0, AES_GCM_IV_BYTES);
  const body = ciphertext.subarray(AES_GCM_IV_BYTES);
  const key = await crypto.subtle.importKey(
    'raw',
    aesKey as unknown as BufferSource,
    { name: 'AES-GCM', length: AES_KEY_BITS },
    false,
    ['decrypt'],
  );
  const ptBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    body as unknown as BufferSource,
  );
  return new Uint8Array(ptBuf);
}

/**
 * Seal-unwrap the AES key. The key servers dry-run the seal_approve* call
 * encoded in `txBytes`; on success they return shares that reconstruct the
 * 32-byte AES key. Network-dependent → mock the SealClient in unit tests.
 *
 * @returns the raw 32-byte AES key for decryptBase.
 */
export async function decryptKey(
  client: Pick<SealClient, 'decrypt'>,
  sealedKey: Uint8Array,
  sessionKey: Parameters<SealClient['decrypt']>[0]['sessionKey'],
  txBytes: Uint8Array,
): Promise<Uint8Array> {
  return client.decrypt({ data: sealedKey, sessionKey, txBytes });
}
