// U7 (D-104) — agent-side decrypt core tests. All network/SDK boundaries are
// faked (session factory, SealClient, txBytes builder, byte fetcher); the AES
// layer and the Ed25519 signing are REAL.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { EncryptedObject, NoAccessError } from '@mysten/seal';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { toBase64, toHex } from '@mysten/sui/utils';
import type { Transaction } from '@mysten/sui/transactions';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  runAgentDecrypt,
  parseDownloadContentMaterial,
  FULL_SEAL_ID_LEN,
  type AgentSessionKey,
  type CreateSessionKey,
  type DownloadContentMaterial,
} from './agentDecrypt';
import { DECRYPT_KEY_MAX_ATTEMPTS } from './forkerDecrypt';

const MODEL_ID = '0x' + 'aa'.repeat(32);
const ENT_ID = '0x' + 'bb'.repeat(32);
const PKG_ID = '0x' + 'cc'.repeat(32);

// Real BCS EncryptedObject carrying a known full id (forkerDecrypt.test.ts shape).
function makeEncryptedObject(idBytes: Uint8Array): Uint8Array {
  return EncryptedObject.serialize({
    version: 0,
    packageId: '0x' + '11'.repeat(32),
    id: toHex(idBytes),
    services: [['0x' + '22'.repeat(32), 1]],
    threshold: 1,
    encryptedShares: {
      BonehFranklinBLS12381: {
        nonce: new Uint8Array(96),
        encryptedShares: [new Uint8Array(32)],
        encryptedRandomness: new Uint8Array(32),
      },
    },
    ciphertext: { Aes256Gcm: { blob: new Uint8Array([1, 2, 3]), aad: null } },
  }).toBytes();
}

// 48-byte full identity: [32-byte seal_id][16-byte nonce] (D-085 shape).
const FULL_ID = new Uint8Array(FULL_SEAL_ID_LEN).map((_, i) => (i * 7 + 3) % 256);

// Known AES-256 key + a "glTF"-magic plaintext fixture.
const AES_KEY = new Uint8Array(32).map((_, i) => (i * 11 + 1) % 256);
const GLB_PLAINTEXT = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 42, 7, 9, 13]);

// Real WebCrypto AES-256-GCM, IV-prefixed — the envelope.ts ciphertext shape.
async function makeCiphertext(plaintext: Uint8Array, rawKey: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    rawKey as unknown as BufferSource,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const iv = new Uint8Array(12).fill(5);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext as unknown as BufferSource),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return out;
}

function makeMaterial(overrides: Partial<DownloadContentMaterial> = {}): DownloadContentMaterial {
  return {
    ciphertextUrl: 'https://cdn.example/v1/blobs/by-quilt-patch-id/QmFixturePatch',
    sealedKey: toBase64(makeEncryptedObject(FULL_ID)),
    sealApprove: { modelId: MODEL_ID, entitlementId: ENT_ID },
    packageId: PKG_ID,
    ...overrides,
  };
}

/** Everything that crosses a network-shaped boundary, captured for assertions. */
interface Captured {
  createSessionArgs: unknown[];
  signature: string | null;
  decryptArgs: unknown[];
  fetchUrls: string[];
  txData: unknown[];
}

function makeHarness() {
  const captured: Captured = {
    createSessionArgs: [],
    signature: null,
    decryptArgs: [],
    fetchUrls: [],
    txData: [],
  };
  const session: AgentSessionKey = {
    getPersonalMessage: () => new TextEncoder().encode('agent-decrypt session message'),
    setPersonalMessageSignature: async (sig: string) => {
      captured.signature = sig;
    },
  };
  const createSessionKey: CreateSessionKey = async (a) => {
    captured.createSessionArgs.push(a);
    return session;
  };
  const buildTxBytes = vi.fn(async (tx: Transaction) => {
    captured.txData.push(tx.getData());
    return new Uint8Array([7, 7, 7]);
  });
  return { captured, createSessionKey, buildTxBytes };
}

// Stub the retry backoff sleep so denied attempts don't burn wall-clock time
// (forkerDecrypt.test.ts pattern).
let realSetTimeout: typeof setTimeout | undefined;
function stubInstantSleep() {
  realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = ((fn: () => void) => {
    fn();
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as unknown as typeof setTimeout;
}

const tmpDirs: string[] = [];
async function makeTmpDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'agent-decrypt-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(async () => {
  if (realSetTimeout) {
    globalThis.setTimeout = realSetTimeout;
    realSetTimeout = undefined;
  }
  await Promise.all(tmpDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe('parseDownloadContentMaterial', () => {
  it('accepts the bare material and the structuredContent envelope', () => {
    const material = makeMaterial();
    expect(parseDownloadContentMaterial(material)).toEqual(material);
    expect(
      parseDownloadContentMaterial({ content: [], structuredContent: material }),
    ).toEqual(material);
  });

  it('rejects malformed ids, missing sealedKey, and non-http urls', () => {
    expect(() =>
      parseDownloadContentMaterial(
        makeMaterial({ sealApprove: { modelId: '../etc', entitlementId: ENT_ID } }),
      ),
    ).toThrow(/modelId/);
    expect(() => parseDownloadContentMaterial(makeMaterial({ sealedKey: '' }))).toThrow(
      /sealedKey/,
    );
    expect(() =>
      parseDownloadContentMaterial(makeMaterial({ ciphertextUrl: 'file:///etc/passwd' })),
    ).toThrow(/http/);
  });
});

describe('runAgentDecrypt', () => {
  it('decrypts the ciphertext with the unwrapped AES key and writes the GLB to the target path', async () => {
    const dir = await makeTmpDir();
    const outFile = join(dir, `${MODEL_ID}.glb`);
    const material = makeMaterial();
    const ciphertext = await makeCiphertext(GLB_PLAINTEXT, AES_KEY);
    const { captured, createSessionKey, buildTxBytes } = makeHarness();
    const keypair = Ed25519Keypair.generate();

    const decrypt = vi.fn(async (a: unknown) => {
      captured.decryptArgs.push(a);
      return AES_KEY;
    });
    const fetchBytes = vi.fn(async (url: string) => {
      captured.fetchUrls.push(url);
      return ciphertext;
    });

    const result = await runAgentDecrypt({
      material,
      signer: keypair,
      outFile,
      createSessionKey,
      sealClient: { decrypt },
      buildTxBytes,
      fetchBytes,
    });

    // Plaintext GLB landed at the target path, byte-identical to the fixture.
    const written = await readFile(outFile);
    expect(Array.from(written)).toEqual(Array.from(GLB_PLAINTEXT));
    expect(result.byteLength).toBe(GLB_PLAINTEXT.length);
    expect(result.modelId).toBe(MODEL_ID);
    expect(result.address).toBe(keypair.getPublicKey().toSuiAddress());
    // No temp residue: only the final GLB lives in the dir.
    expect(await readdir(dir)).toEqual([`${MODEL_ID}.glb`]);

    // SessionKey was scoped to the agent address + the SERVER-provided package.
    expect(captured.createSessionArgs).toHaveLength(1);
    expect(captured.createSessionArgs[0]).toMatchObject({
      address: keypair.getPublicKey().toSuiAddress(),
      packageId: PKG_ID,
    });
    // The personal message was actually signed (a real Ed25519 signature string).
    expect(typeof captured.signature).toBe('string');
    expect((captured.signature as unknown as string).length).toBeGreaterThan(0);

    // The dry-run PTB targets the material's packageId with the frontend's
    // 3-arg shape: (full id, entitlement, model).
    const txJson = JSON.stringify(captured.txData[0]);
    expect(txJson).toContain('seal_approve_entitlement');
    expect(txJson).toContain(PKG_ID.slice(2));
    expect(txJson).toContain(ENT_ID);
    expect(txJson).toContain(MODEL_ID);

    // SealClient got the BCS sealed key + our built txBytes; the ciphertext was
    // fetched from exactly the URL the server returned.
    const decryptArg = captured.decryptArgs[0] as { data: Uint8Array; txBytes: Uint8Array };
    expect(toBase64(decryptArg.data)).toBe(material.sealedKey);
    expect(Array.from(decryptArg.txBytes)).toEqual([7, 7, 7]);
    expect(captured.fetchUrls).toEqual([material.ciphertextUrl]);
  });

  it('errors clearly on a key-server denial (wrong keypair) and writes NO partial file', async () => {
    stubInstantSleep();
    const dir = await makeTmpDir();
    const outFile = join(dir, `${MODEL_ID}.glb`);
    const { createSessionKey, buildTxBytes } = makeHarness();
    // The entitlement holder is someone else: the key servers dry-run
    // seal_approve_entitlement, see a sender with no entitlement, and deny.
    const wrongKeypair = Ed25519Keypair.generate();
    const decrypt = vi.fn(async () => {
      throw new NoAccessError('req-test');
    });
    const fetchBytes = vi.fn(async () => new Uint8Array(64));

    await expect(
      runAgentDecrypt({
        material: makeMaterial(),
        signer: wrongKeypair,
        outFile,
        createSessionKey,
        sealClient: { decrypt },
        buildTxBytes,
        fetchBytes,
        maxAttempts: 2,
      }),
    ).rejects.toBeInstanceOf(NoAccessError);

    // Bounded: the deterministic denial is retried at most maxAttempts times.
    expect(decrypt).toHaveBeenCalledTimes(2);
    // Fail-closed delivery: nothing — not even a temp file — in the target dir.
    expect(await readdir(dir)).toEqual([]);
    // The ciphertext was never even fetched (key unwrap failed first).
    expect(fetchBytes).not.toHaveBeenCalled();
  });

  it('recovers from the fresh-entitlement race within the bounded retry', async () => {
    stubInstantSleep();
    const dir = await makeTmpDir();
    const outFile = join(dir, `${MODEL_ID}.glb`);
    const ciphertext = await makeCiphertext(GLB_PLAINTEXT, AES_KEY);
    const { createSessionKey, buildTxBytes } = makeHarness();
    // Key servers can't see the just-purchased entitlement yet: deny twice,
    // then succeed (the post-purchase fullnode/key-server lag).
    const decrypt = vi
      .fn()
      .mockRejectedValueOnce(new Error('503 key server: object not found'))
      .mockRejectedValueOnce(new Error('503 key server: object not found'))
      .mockResolvedValueOnce(AES_KEY);

    const result = await runAgentDecrypt({
      material: makeMaterial(),
      signer: Ed25519Keypair.generate(),
      outFile,
      createSessionKey,
      sealClient: { decrypt },
      buildTxBytes,
      fetchBytes: async () => ciphertext,
    });

    expect(result.byteLength).toBe(GLB_PLAINTEXT.length);
    expect(Array.from(await readFile(outFile))).toEqual(Array.from(GLB_PLAINTEXT));
    // Recovery happened within the frontend's bounded default — no looser.
    expect(decrypt).toHaveBeenCalledTimes(3);
    expect(decrypt.mock.calls.length).toBeLessThanOrEqual(DECRYPT_KEY_MAX_ATTEMPTS);
  });

  it('rejects a sealed key whose recovered identity is not the fixed 48-byte shape (D-085 mirror) before any key-server contact', async () => {
    const dir = await makeTmpDir();
    const outFile = join(dir, `${MODEL_ID}.glb`);
    const { createSessionKey, buildTxBytes } = makeHarness();
    const decrypt = vi.fn(async () => AES_KEY);
    // A 32-byte id = bare seal_id prefix with no nonce — foreign material.
    const material = makeMaterial({
      sealedKey: toBase64(makeEncryptedObject(new Uint8Array(32).fill(1))),
    });

    await expect(
      runAgentDecrypt({
        material,
        signer: Ed25519Keypair.generate(),
        outFile,
        createSessionKey,
        sealClient: { decrypt },
        buildTxBytes,
        fetchBytes: async () => new Uint8Array(64),
      }),
    ).rejects.toThrow(/D-085/);

    expect(decrypt).not.toHaveBeenCalled();
    expect(await readdir(dir)).toEqual([]);
  });

  it('never lets the secret key appear in any outbound boundary payload', async () => {
    const dir = await makeTmpDir();
    const outFile = join(dir, `${MODEL_ID}.glb`);
    const material = makeMaterial();
    const ciphertext = await makeCiphertext(GLB_PLAINTEXT, AES_KEY);
    const { captured, createSessionKey, buildTxBytes } = makeHarness();
    const keypair = Ed25519Keypair.generate();
    const decrypt = vi.fn(async (a: unknown) => {
      captured.decryptArgs.push(a);
      return AES_KEY;
    });

    await runAgentDecrypt({
      material,
      signer: keypair,
      outFile,
      // Stub the (unused-by-fakes) sui client so the captured session args
      // serialize without the real client's circular structure.
      suiClient: {} as never,
      createSessionKey,
      sealClient: { decrypt },
      buildTxBytes,
      fetchBytes: async (url) => {
        captured.fetchUrls.push(url);
        return ciphertext;
      },
    });

    // Every form the 32-byte secret could leak in: bech32, hex, base64.
    const bech32 = keypair.getSecretKey();
    const rawSecret = decodeSuiPrivateKey(bech32).secretKey;
    const forbidden = [bech32, toHex(rawSecret), toHex(rawSecret).toUpperCase(), toBase64(rawSecret)];

    // Serialize EVERYTHING that crossed a boundary (Uint8Arrays as hex so byte
    // embeddings are visible to the scan).
    const dump = JSON.stringify(
      {
        createSessionArgs: captured.createSessionArgs,
        signature: captured.signature,
        decryptArgs: captured.decryptArgs,
        fetchUrls: captured.fetchUrls,
        txData: captured.txData,
      },
      (_k, v: unknown) => (v instanceof Uint8Array ? toHex(v) : v),
    );

    for (const needle of forbidden) {
      expect(dump).not.toContain(needle);
    }
    // Sanity: the scan corpus is non-trivial and the signature DID travel.
    expect(dump.length).toBeGreaterThan(200);
    expect(captured.signature).toBeTruthy();
  });
});
