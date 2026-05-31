import { describe, it, expect, vi } from 'vitest';

// jsdom and Node each have their own Uint8Array constructor; a buffer that
// crosses the WebCrypto boundary can come back as the "other realm's"
// Uint8Array, which trips vitest's class-aware toEqual even when bytes match.
// Compare byte-content via plain arrays to stay realm-agnostic.
function expectBytesEqual(a: Uint8Array, b: Uint8Array) {
  expect(Array.from(a)).toEqual(Array.from(b));
}
import {
  encryptBase,
  decryptBase,
  decryptKey,
  buildSealId,
  modelIdToBytes,
  AES_GCM_OVERHEAD_BYTES,
} from './envelope';
import { SEAL_THRESHOLD } from './sealClient';

// The AES-256-GCM envelope layer (encryptBase ciphertext / decryptBase) is
// tested for REAL against WebCrypto. Only the Seal key-wrap is mocked — a fake
// SealClient that records what it was asked to encrypt and round-trips the
// 32-byte AES key (real key servers would do this over the network).
function makeFakeSealClient() {
  const encryptCalls: Array<{ id: string; packageId: string; data: Uint8Array }> =
    [];
  let lastKey: Uint8Array | null = null;
  const client = {
    encrypt: vi.fn(
      async ({
        id,
        packageId,
        data,
        threshold,
      }: {
        id: string;
        packageId: string;
        data: Uint8Array;
        threshold: number;
      }) => {
        encryptCalls.push({ id, packageId, data });
        lastKey = data; // stash so decrypt can return it
        void threshold;
        // A "sealed" blob: a 4-byte "SEAL" tag + the (in reality encrypted)
        // key bytes, so the fake decrypt can recover the key by stripping it.
        const sealed = new Uint8Array(4 + data.length);
        sealed.set([0x53, 0x45, 0x41, 0x4c], 0);
        sealed.set(data, 4);
        return {
          encryptedObject: sealed,
          key: data,
        };
      },
    ),
    decrypt: vi.fn(async ({ data }: { data: Uint8Array }) => {
      // Unwrap our fake sealed blob → the original AES key bytes.
      return data.subarray(4);
    }),
  };
  return { client, encryptCalls, getLastKey: () => lastKey };
}

const PACKAGE = `0x${'a'.repeat(64)}`;
const MODEL_ID = `0x${'1234'.repeat(16)}`; // 32-byte hex object id

describe('modelIdToBytes / buildSealId', () => {
  it('decodes a 0x hex model id to 32 bytes', () => {
    const b = modelIdToBytes(MODEL_ID);
    expect(b).toHaveLength(32);
  });

  it('rejects non-hex model ids', () => {
    expect(() => modelIdToBytes('0xZZ')).toThrow();
  });

  it('buildSealId carries the model-id prefix and a unique nonce per call', () => {
    const modelBytes = modelIdToBytes(MODEL_ID);
    const id1 = buildSealId(MODEL_ID);
    const id2 = buildSealId(MODEL_ID);
    // Prefix == the model id bytes.
    expect(id1.subarray(0, modelBytes.length)).toEqual(modelBytes);
    expect(id2.subarray(0, modelBytes.length)).toEqual(modelBytes);
    // Nonce suffix differs → ids are unique.
    expect(Array.from(id1)).not.toEqual(Array.from(id2));
    expect(id1.length).toBeGreaterThan(modelBytes.length);
  });
});

describe('envelope round-trip (real AES, mocked Seal key-wrap)', () => {
  it('round-trips a small buffer', async () => {
    const { client, getLastKey } = makeFakeSealClient();
    const plaintext = new TextEncoder().encode('hello tusk3d base glb');
    const { ciphertext, sealedKey, idHex } = await encryptBase(
      client,
      PACKAGE,
      plaintext,
      MODEL_ID,
    );
    const aesKey = getLastKey()!;
    const out = await decryptBase(ciphertext, aesKey);
    expectBytesEqual(out, plaintext);
    expect(idHex).toMatch(/^[0-9a-f]+$/);
    expect(sealedKey.length).toBeGreaterThan(0);
  });

  it('round-trips a multi-MB GLB buffer', async () => {
    const { client, getLastKey } = makeFakeSealClient();
    // ~5 MB of pseudo-random bytes stands in for a real GLB.
    const big = new Uint8Array(5 * 1024 * 1024);
    crypto.getRandomValues(big.subarray(0, 65536)); // seed a chunk
    for (let i = 65536; i < big.length; i++) {
      big[i] = ((big[i % 65536] ?? 0) + i) & 0xff;
    }
    const { ciphertext } = await encryptBase(client, PACKAGE, big, MODEL_ID);
    const out = await decryptBase(ciphertext, getLastKey()!);
    expect(out.length).toBe(big.length);
    // Byte-exact compare without Array.from over 5M elements (realm-agnostic).
    expect(Buffer.from(out).equals(Buffer.from(big))).toBe(true);
  });

  it('decryptKey unwraps the AES key, then decryptBase recovers plaintext (full path)', async () => {
    const { client } = makeFakeSealClient();
    const plaintext = new TextEncoder().encode('end to end envelope');
    const { ciphertext, sealedKey } = await encryptBase(
      client,
      PACKAGE,
      plaintext,
      MODEL_ID,
    );
    const aesKey = await decryptKey(
      client,
      sealedKey,
      {} as never, // sessionKey — irrelevant to the fake
      new Uint8Array([1, 2, 3]), // txBytes — irrelevant to the fake
    );
    const out = await decryptBase(ciphertext, aesKey);
    expectBytesEqual(out, plaintext);
  });
});

describe('ciphertext length parity (guards the Walrus OOM-cliff assumption)', () => {
  it('AES ciphertext ≈ plaintext + fixed GCM overhead', async () => {
    const { client } = makeFakeSealClient();
    for (const size of [0, 1, 1024, 1_000_000]) {
      const pt = new Uint8Array(size);
      const { ciphertext } = await encryptBase(client, PACKAGE, pt, MODEL_ID);
      expect(ciphertext.length).toBe(size + AES_GCM_OVERHEAD_BYTES);
    }
  });
});

describe('GCM authentication failures', () => {
  it('tampered ciphertext throws on decrypt', async () => {
    const { client, getLastKey } = makeFakeSealClient();
    const pt = new TextEncoder().encode('integrity matters');
    const { ciphertext } = await encryptBase(client, PACKAGE, pt, MODEL_ID);
    // Flip a byte in the GCM-protected body (after the 12-byte IV).
    const last = ciphertext.length - 1;
    ciphertext[last] = (ciphertext[last] ?? 0) ^ 0xff;
    await expect(decryptBase(ciphertext, getLastKey()!)).rejects.toThrow();
  });

  it('wrong key throws on decrypt', async () => {
    const { client } = makeFakeSealClient();
    const pt = new TextEncoder().encode('integrity matters');
    const { ciphertext } = await encryptBase(client, PACKAGE, pt, MODEL_ID);
    const wrongKey = new Uint8Array(32);
    crypto.getRandomValues(wrongKey);
    await expect(decryptBase(ciphertext, wrongKey)).rejects.toThrow();
  });
});

describe('Seal identity binding', () => {
  it('passes inner id bytes only (no package prefix) and the configured threshold to Seal', async () => {
    const { client, encryptCalls } = makeFakeSealClient();
    const modelBytes = modelIdToBytes(MODEL_ID);
    await encryptBase(client, PACKAGE, new Uint8Array([9]), MODEL_ID);
    expect(encryptCalls).toHaveLength(1);
    const call = encryptCalls[0]!;
    // packageId is a SEPARATE arg — the id must NOT begin with it.
    expect(call.id.startsWith(PACKAGE.slice(2))).toBe(false);
    // The id DOES begin with the model-id hex prefix.
    const modelHex = Array.from(modelBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    expect(call.id.startsWith(modelHex)).toBe(true);
    // And only the 32-byte AES key is handed to Seal (not the GLB).
    expect(call.data).toHaveLength(32);
    expect(client.encrypt).toHaveBeenCalledWith(
      expect.objectContaining({ threshold: SEAL_THRESHOLD, packageId: PACKAGE }),
    );
  });

  it('produces a unique id per encrypt call (nonce)', async () => {
    const { client, encryptCalls } = makeFakeSealClient();
    await encryptBase(client, PACKAGE, new Uint8Array([1]), MODEL_ID);
    await encryptBase(client, PACKAGE, new Uint8Array([1]), MODEL_ID);
    expect(encryptCalls[0]!.id).not.toBe(encryptCalls[1]!.id);
  });
});
