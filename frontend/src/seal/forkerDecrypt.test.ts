import { describe, it, expect, vi, afterEach } from 'vitest';
import { EncryptedObject } from '@mysten/seal';
import { fromHex, toHex } from '@mysten/sui/utils';
import {
  recoverFullSealId,
  decryptKeyWithRetry,
  decryptBaseGlb,
  DECRYPT_KEY_MAX_ATTEMPTS,
} from './forkerDecrypt';
import { encryptBase, AES_GCM_OVERHEAD_BYTES } from './envelope';

function expectBytesEqual(a: Uint8Array, b: Uint8Array) {
  expect(Array.from(a)).toEqual(Array.from(b));
}

// Build a real BCS EncryptedObject carrying a known full id so we can verify
// recoverFullSealId extracts exactly the bytes Seal sealed under (prefix+nonce).
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

describe('recoverFullSealId', () => {
  it('returns the FULL identity (prefix+nonce) the EncryptedObject was sealed under', () => {
    // 32-byte random seal_id PREFIX + 16-byte nonce = the 48-byte full id.
    const fullId = new Uint8Array(48);
    for (let i = 0; i < fullId.length; i++) fullId[i] = (i * 7) % 256;
    const sealedKey = makeEncryptedObject(fullId);
    const recovered = recoverFullSealId(sealedKey);
    expectBytesEqual(recovered, fullId);
  });

  it('round-trips a real encryptBase sealed key id (prefix is the seal_id, plus a nonce)', async () => {
    // Mock SealClient.encrypt to return a real EncryptedObject for the id arg.
    const fakeClient = {
      encrypt: vi.fn(async ({ id }: { id: string }) => ({
        encryptedObject: makeEncryptedObject(fromHex(id)),
      })),
    };
    const sealIdPrefix = new Uint8Array(32).fill(9);
    const { sealedKey, idHex } = await encryptBase(
      fakeClient as never,
      '0x' + 'ab'.repeat(32),
      new Uint8Array([10, 20, 30]),
      sealIdPrefix,
    );
    const recovered = recoverFullSealId(sealedKey);
    // The recovered id equals the idHex encryptBase used (prefix + its nonce),
    // and STARTS WITH the seal_id prefix (what seal_approve_cap's is_prefix checks).
    expectBytesEqual(recovered, fromHex(idHex));
    expect(Array.from(recovered.subarray(0, 32))).toEqual(Array.from(sealIdPrefix));
    expect(recovered.length).toBe(32 + 16);
  });
});

describe('decryptKeyWithRetry', () => {
  // Stub the backoff sleep to fire immediately so the bounded retry doesn't
  // burn real wall-clock time. Returns the original setTimeout for restore.
  let realSetTimeout: typeof setTimeout;
  function stubInstantSleep() {
    realSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = ((fn: () => void) => {
      fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout;
  }
  afterEach(() => {
    if (realSetTimeout) globalThis.setTimeout = realSetTimeout;
  });

  it('returns the key on the first attempt when decrypt succeeds', async () => {
    const key = new Uint8Array(32).fill(7);
    const client = { decrypt: vi.fn(async () => key) };
    const out = await decryptKeyWithRetry(
      client,
      new Uint8Array([1]),
      {} as never,
      new Uint8Array([2]),
    );
    expectBytesEqual(out, key);
    expect(client.decrypt).toHaveBeenCalledTimes(1);
  });

  it('engages the retry path on a transient fresh-object failure, then succeeds', async () => {
    stubInstantSleep();
    const key = new Uint8Array(32).fill(3);
    // Fail the first two attempts (key servers 503 on the just-minted objects),
    // succeed on the third — proves the bounded retry covers the dry-run race.
    const decrypt = vi
      .fn()
      .mockRejectedValueOnce(new Error('503 key server not ready'))
      .mockRejectedValueOnce(new Error('503 key server not ready'))
      .mockResolvedValueOnce(key);
    const out = await decryptKeyWithRetry(
      { decrypt },
      new Uint8Array([1]),
      {} as never,
      new Uint8Array([2]),
      { maxAttempts: 3 },
    );
    expectBytesEqual(out, key);
    expect(decrypt).toHaveBeenCalledTimes(3);
  });

  it('rethrows after exhausting attempts (a deterministic denial is not retried into success)', async () => {
    stubInstantSleep();
    const decrypt = vi.fn().mockRejectedValue(new Error('seal_approve aborted: no cap'));
    await expect(
      decryptKeyWithRetry(
        { decrypt },
        new Uint8Array([1]),
        {} as never,
        new Uint8Array([2]),
        { maxAttempts: 2 },
      ),
    ).rejects.toThrow('seal_approve aborted');
    expect(decrypt).toHaveBeenCalledTimes(2);
  });

  it('defaults to DECRYPT_KEY_MAX_ATTEMPTS when not overridden', async () => {
    stubInstantSleep();
    const decrypt = vi.fn().mockRejectedValue(new Error('always fails'));
    await expect(
      decryptKeyWithRetry({ decrypt }, new Uint8Array([1]), {} as never, new Uint8Array([2])),
    ).rejects.toThrow('always fails');
    expect(decrypt).toHaveBeenCalledTimes(DECRYPT_KEY_MAX_ATTEMPTS);
  });
});

describe('decryptBaseGlb', () => {
  it('unwraps the AES key, fetches the ciphertext, and AES-GCM-decrypts the plaintext', async () => {
    // Real AES round-trip: encrypt a known plaintext, capture the key + ciphertext,
    // then feed them back through decryptBaseGlb with a mocked key-unwrap.
    const fakeSealClient = {
      encrypt: vi.fn(async ({ data }: { data: Uint8Array }) => {
        // stash the AES key in a fake sealed blob
        const sealed = new Uint8Array(data.length);
        sealed.set(data);
        return { encryptedObject: sealed };
      }),
      decrypt: vi.fn(async ({ data }: { data: Uint8Array }) => data), // unwrap = identity
    };
    const plaintext = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 1, 2, 3, 4, 5, 6, 7, 8]);
    const { ciphertext, sealedKey } = await encryptBase(
      fakeSealClient as never,
      '0x' + 'cd'.repeat(32),
      plaintext,
      new Uint8Array(32).fill(1),
    );
    expect(ciphertext.length).toBe(plaintext.length + AES_GCM_OVERHEAD_BYTES);

    const out = await decryptBaseGlb({
      client: fakeSealClient as never,
      sealedKey,
      sessionKey: {} as never,
      txBytes: new Uint8Array([9]),
      fetchCiphertext: async () => ciphertext,
    });
    expectBytesEqual(out, plaintext);
  });
});
