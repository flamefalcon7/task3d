// plan 2026-06-10-001 U7 (KTD-2/KTD-3, D-104) — agent-side Seal decrypt core.
//
// The MCP `download_content` tool (backend/src/mcp/tools/downloadContent.ts)
// returns `{ ciphertextUrl, sealedKey, sealApprove, packageId }` — material
// only. Decryption happens HERE, on the agent's machine, with the agent's own
// keypair: the server never touches the AES key or the plaintext (audit W-9).
// This module is the testable core; the thin CLI shell lives in
// frontend/scripts/agent-decrypt.ts (run by the agent in Claude Code).
//
// Sequence (mirrors decryptAndView.ts:decryptViaEntitlement, minus the wallet
// + viewer parts — the agent's Ed25519Keypair IS the Signer, D-058):
//   1. SessionKey.create(address, packageId, ttl) → sign getPersonalMessage()
//      with the keypair → setPersonalMessageSignature. Only the SIGNATURE
//      travels to the key servers; the secret key never leaves the process.
//   2. recoverFullSealId(sealedKey) — the full [seal_id][nonce] identity, with
//      the D-085 fixed-length mirror asserted client-side (defense in depth;
//      the Move gate + the MCP server enforce the same 32-byte invariant).
//   3. Build the seal_approve_entitlement PTB (`onlyTransactionKind: true`) —
//      same arg shape as buildSealApproveEntitlementPtb, but bound to the
//      SERVER-provided packageId instead of the frontend TESTNET constant.
//   4. decryptBaseGlb — key-server dry-run with the bounded
//      decryptKeyWithRetry backoff (fresh-object race right after purchase),
//      fetch ciphertext from the Walrus aggregator, AES-256-GCM decrypt.
//   5. Atomic write: temp file + rename, so a failure NEVER leaves a partial
//      GLB at the target path.
//
// Every network/SDK boundary (suiClient, sealClient, session factory, txBytes
// builder, byte fetcher) is injected with production defaults, so unit tests
// drive the full arc with fakes — no live key servers, no fullnode.

import { SessionKey } from '@mysten/seal';
import type { SealClient, SealCompatibleClient } from '@mysten/seal';
import { Transaction } from '@mysten/sui/transactions';
import { fromBase64 } from '@mysten/sui/utils';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { getSealClient, SESSION_KEY_TTL_MIN } from '../src/seal/sealClient';
import { recoverFullSealId, decryptBaseGlb } from '../src/seal/forkerDecrypt';

// D-085 — the Move gate (ESealIdWrongLength) and the MCP server both enforce a
// FIXED 32-byte seal_id prefix; envelope.ts appends a 16-byte nonce at encrypt
// time. The recovered full identity must therefore be exactly 48 bytes. Do not
// relax: a different length means foreign/corrupt material.
export const SEAL_ID_LEN = 32;
export const SEAL_ID_NONCE_LEN = 16;
export const FULL_SEAL_ID_LEN = SEAL_ID_LEN + SEAL_ID_NONCE_LEN;

// Same object-id shape the MCP tools accept (downloadContent.ts).
const OBJECT_ID_RE = /^0x[0-9a-fA-F]{1,64}$/;

/** The `download_content` MCP tool's structured output (U6 contract). */
export interface DownloadContentMaterial {
  /** Walrus aggregator URL of the AES-256-GCM ciphertext GLB. */
  ciphertextUrl: string;
  /** base64 BCS EncryptedObject — the Seal-wrapped AES key. */
  sealedKey: string;
  /** Object args for the seal_approve_entitlement dry-run PTB. */
  sealApprove: { modelId: string; entitlementId: string };
  /** model3d package id (SessionKey scope + the moveCall target). */
  packageId: string;
}

/**
 * Validate raw JSON into a `DownloadContentMaterial`. Accepts either the bare
 * structured output or a full MCP tool result that carries it under
 * `structuredContent` (so the agent can pipe the tool response verbatim).
 */
export function parseDownloadContentMaterial(raw: unknown): DownloadContentMaterial {
  const candidate =
    raw !== null && typeof raw === 'object' && 'structuredContent' in raw
      ? (raw as { structuredContent: unknown }).structuredContent
      : raw;
  if (candidate === null || typeof candidate !== 'object') {
    throw new Error('download_content material must be a JSON object');
  }
  const m = candidate as Record<string, unknown>;
  const sealApprove = (m.sealApprove ?? {}) as Record<string, unknown>;
  const modelId = String(sealApprove.modelId ?? '');
  const entitlementId = String(sealApprove.entitlementId ?? '');
  const packageId = String(m.packageId ?? '');
  if (!OBJECT_ID_RE.test(modelId)) {
    throw new Error('material.sealApprove.modelId is not a Sui object id');
  }
  if (!OBJECT_ID_RE.test(entitlementId)) {
    throw new Error('material.sealApprove.entitlementId is not a Sui object id');
  }
  if (!OBJECT_ID_RE.test(packageId)) {
    throw new Error('material.packageId is not a Sui package id');
  }
  const sealedKey = m.sealedKey;
  if (typeof sealedKey !== 'string' || sealedKey.length === 0) {
    throw new Error('material.sealedKey must be a non-empty base64 string');
  }
  const ciphertextUrl = String(m.ciphertextUrl ?? '');
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(ciphertextUrl);
  } catch {
    throw new Error('material.ciphertextUrl is not a valid URL');
  }
  if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
    throw new Error('material.ciphertextUrl must be http(s)');
  }
  return { ciphertextUrl, sealedKey, sealApprove: { modelId, entitlementId }, packageId };
}

/** The signer surface the helper needs — `Ed25519Keypair` satisfies it
 *  structurally (the keypair IS the Signer, D-058; no wrapper). */
export interface AgentSigner {
  getPublicKey(): { toSuiAddress(): string };
  signPersonalMessage(message: Uint8Array): Promise<{ signature: string }>;
}

/** The SessionKey surface the helper drives (real `SessionKey` satisfies it). */
export type AgentSessionKey = Pick<
  SessionKey,
  'getPersonalMessage' | 'setPersonalMessageSignature'
>;

export type CreateSessionKey = (args: {
  address: string;
  packageId: string;
  ttlMin: number;
  suiClient: SealCompatibleClient;
}) => Promise<AgentSessionKey>;

export interface RunAgentDecryptArgs {
  /** Validated `download_content` output (see parseDownloadContentMaterial). */
  material: DownloadContentMaterial;
  /** The agent's keypair. Used ONLY to sign the SessionKey personal message
   *  locally — the secret key never appears in any outbound request. */
  signer: AgentSigner;
  /** Target plaintext path, e.g. `samples/<modelId>.glb`. Written atomically
   *  (temp + rename): a failure leaves NO partial file here. */
  outFile: string;
  /** Sui client for SessionKey.create + the PTB build. Defaults to testnet. */
  suiClient?: SealCompatibleClient;
  /** Seal client (key-server round-trip). Defaults to the testnet 2-of-2. */
  sealClient?: Pick<SealClient, 'decrypt'>;
  /** SessionKey factory boundary (tests). Defaults to SessionKey.create. */
  createSessionKey?: CreateSessionKey;
  /** PTB → txBytes boundary (tests). Defaults to tx.build(onlyTransactionKind). */
  buildTxBytes?: (tx: Transaction) => Promise<Uint8Array>;
  /** Ciphertext fetcher boundary (tests). Defaults to global fetch. */
  fetchBytes?: (url: string) => Promise<Uint8Array>;
  /** Override the bounded decrypt retry count (tests). */
  maxAttempts?: number;
}

export interface RunAgentDecryptResult {
  outFile: string;
  byteLength: number;
  modelId: string;
  /** The agent address derived from the signer (the entitlement holder). */
  address: string;
}

function defaultSuiClient(): SealCompatibleClient {
  // Env-overridable like every other network default in the repo (review
  // M-007/PS-002) — the 8/27 mainnet cutover must not require a code change.
  return new SuiJsonRpcClient({
    network: process.env.SUI_NETWORK ?? 'testnet',
    url: process.env.SUI_FULLNODE_URL ?? getJsonRpcFullnodeUrl('testnet'),
  }) as unknown as SealCompatibleClient;
}

// Bound the aggregator fetch (review JFR-001/R-006): a stalled CDN would
// otherwise hang the agent process until the OS TCP timeout. 60s covers a
// large ciphertext GLB on a slow link.
const FETCH_TIMEOUT_MS = Number(process.env.AGENT_DECRYPT_FETCH_TIMEOUT_MS ?? '60000');

async function defaultFetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) {
    throw new Error(`ciphertext fetch failed: HTTP ${res.status} from the Walrus aggregator`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

/** Write atomically: temp file in the same dir, then rename. On any failure the
 *  temp file is removed and the target path is left untouched. */
async function writeFileAtomic(outFile: string, bytes: Uint8Array): Promise<void> {
  await mkdir(dirname(outFile), { recursive: true });
  const tmp = `${outFile}.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(tmp, bytes);
    await rename(tmp, outFile);
  } catch (e) {
    await rm(tmp, { force: true });
    throw e;
  }
}

/**
 * Complete the client-side half of `download_content`: SessionKey + local
 * signature → seal_approve_entitlement dry-run → AES key (bounded retry) →
 * ciphertext fetch → AES-256-GCM decrypt → atomic write of the plaintext GLB.
 *
 * A key-server denial (wrong keypair / no entitlement) throws after the
 * bounded retries with NO file written. The signer's secret key is never
 * serialized: outbound requests carry only the personal-message SIGNATURE.
 */
export async function runAgentDecrypt(
  args: RunAgentDecryptArgs,
): Promise<RunAgentDecryptResult> {
  const { material } = args;
  const address = args.signer.getPublicKey().toSuiAddress();
  const suiClient = args.suiClient ?? defaultSuiClient();

  // 1 — SessionKey scoped to (agent address, package), signed locally. One-shot
  // CLI: no cache (sessionKey.ts caching exists for interactive multi-step UX).
  const createSessionKey: CreateSessionKey =
    args.createSessionKey ?? ((a) => SessionKey.create(a));
  const sessionKey = await createSessionKey({
    address,
    packageId: material.packageId,
    ttlMin: SESSION_KEY_TTL_MIN,
    suiClient,
  });
  const { signature } = await args.signer.signPersonalMessage(
    sessionKey.getPersonalMessage(),
  );
  await sessionKey.setPersonalMessageSignature(signature);

  // 2 — full Seal identity ([seal_id][nonce]) + the D-085 fixed-length mirror.
  const sealedKey = fromBase64(material.sealedKey);
  const fullId = recoverFullSealId(sealedKey);
  if (fullId.length !== FULL_SEAL_ID_LEN) {
    throw new Error(
      `recovered Seal identity is ${fullId.length} bytes, expected ${FULL_SEAL_ID_LEN} ` +
        `([${SEAL_ID_LEN}-byte seal_id][${SEAL_ID_NONCE_LEN}-byte nonce], D-085 mirror) — ` +
        'refusing to contact the key servers with foreign/corrupt material',
    );
  }

  // 3 — seal_approve_entitlement dry-run PTB. Same arg shape as the frontend's
  // buildSealApproveEntitlementPtb (id, entitlement, model), but the target is
  // bound to the packageId the SERVER returned with the material.
  const tx = new Transaction();
  tx.moveCall({
    target: `${material.packageId}::model3d::seal_approve_entitlement`,
    arguments: [
      tx.pure.vector('u8', Array.from(fullId)),
      tx.object(material.sealApprove.entitlementId),
      tx.object(material.sealApprove.modelId),
    ],
  });
  const buildTxBytes =
    args.buildTxBytes ??
    ((t: Transaction) =>
      t.build({ client: suiClient as never, onlyTransactionKind: true }));
  const txBytes = await buildTxBytes(tx);

  // 4 — key-server dry-run (bounded decryptKeyWithRetry backoff absorbs the
  // fresh-entitlement race right after purchase), fetch ciphertext, AES-GCM.
  const fetchBytes = args.fetchBytes ?? defaultFetchBytes;
  const plaintext = await decryptBaseGlb({
    client: args.sealClient ?? getSealClient(),
    sealedKey,
    // Real SessionKey satisfies AgentSessionKey; fakes are cast by tests.
    sessionKey: sessionKey as SessionKey,
    txBytes,
    fetchCiphertext: () => fetchBytes(material.ciphertextUrl),
    maxAttempts: args.maxAttempts,
  });

  // 5 — atomic write: only a fully decrypted GLB ever lands at outFile.
  await writeFileAtomic(args.outFile, plaintext);

  return {
    outFile: args.outFile,
    byteLength: plaintext.length,
    modelId: material.sealApprove.modelId,
    address,
  };
}
