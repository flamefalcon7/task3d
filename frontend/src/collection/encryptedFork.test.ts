import { describe, it, expect, vi } from 'vitest';
import { EncryptedObject } from '@mysten/seal';
import { toHex } from '@mysten/sui/utils';
import {
  extractLaunchIds,
  parseSealedKeyFromObject,
  launchEncryptedCollection,
  decryptEncryptedBase,
  mintEncryptedTokens,
} from './encryptedFork';
import { PACKAGE_ID } from './encryptedFork';

const CAP_ID = '0xcap';
const COLLECTION_ID = '0xcoll';
const MODEL_ID = '0xmodel';

function makeSealedKey(idBytes: Uint8Array): Uint8Array {
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
    ciphertext: { Aes256Gcm: { blob: new Uint8Array([1]), aad: null } },
  }).toBytes();
}

describe('extractLaunchIds', () => {
  const capType = `${PACKAGE_ID}::model3d::NftCollectionCreatorCap`;
  const collType = `${PACKAGE_ID}::model3d::NftCollection`;

  it('extracts the created cap + collection ids from objectChanges', () => {
    const changes = [
      { type: 'created', objectType: capType, objectId: '0xthecap' },
      { type: 'created', objectType: collType, objectId: '0xthecoll' },
      { type: 'mutated', objectType: '0x2::coin::Coin', objectId: '0xgas' },
    ];
    expect(extractLaunchIds(changes)).toEqual({
      capId: '0xthecap',
      collectionId: '0xthecoll',
    });
  });

  it('throws when the cap is absent', () => {
    const changes = [{ type: 'created', objectType: collType, objectId: '0xc' }];
    expect(() => extractLaunchIds(changes)).toThrow(/missing the created cap or collection/);
  });

  it('throws when the collection is absent', () => {
    const changes = [{ type: 'created', objectType: capType, objectId: '0xcap' }];
    expect(() => extractLaunchIds(changes)).toThrow(/missing the created cap or collection/);
  });
});

describe('parseSealedKeyFromObject', () => {
  it('reads sealed_key (a vector<u8>) out of a moveObject getObject response', () => {
    const resp = {
      data: {
        content: {
          dataType: 'moveObject',
          fields: { sealed_key: [1, 2, 3, 255] },
        },
      },
    };
    expect(Array.from(parseSealedKeyFromObject(resp))).toEqual([1, 2, 3, 255]);
  });

  it('throws when the object is not a Move object', () => {
    expect(() => parseSealedKeyFromObject({ data: { content: { dataType: 'package' } } })).toThrow(
      /not a Move object/,
    );
  });

  it('throws when there is no sealed_key', () => {
    const resp = { data: { content: { dataType: 'moveObject', fields: {} } } };
    expect(() => parseSealedKeyFromObject(resp)).toThrow(/no sealed_key/);
  });
});

describe('launchEncryptedCollection (step 1)', () => {
  it('signs the cap-issuing launch with an EMPTY quilt and returns the parsed ids', async () => {
    const signAndExecute = vi.fn().mockResolvedValue('0xdigest1');
    const fetchObjectChanges = vi.fn().mockResolvedValue([
      { type: 'created', objectType: `${PACKAGE_ID}::model3d::NftCollectionCreatorCap`, objectId: '0xthecap' },
      { type: 'created', objectType: `${PACKAGE_ID}::model3d::NftCollection`, objectId: '0xthecoll' },
    ]);
    const out = await launchEncryptedCollection({
      modelId: MODEL_ID,
      feeMist: 250_000_000n,
      signAndExecute,
      fetchObjectChanges,
    });
    expect(out).toEqual({ capId: '0xthecap', collectionId: '0xthecoll', digest: '0xdigest1' });
    expect(signAndExecute).toHaveBeenCalledTimes(1);
    expect(fetchObjectChanges).toHaveBeenCalledWith('0xdigest1');
  });
});

describe('decryptEncryptedBase (step 2)', () => {
  it('recovers the full seal id, builds txBytes, decrypts, and returns plaintext', async () => {
    const fullId = new Uint8Array(48).fill(5);
    const sealedKey = makeSealedKey(fullId);
    // The AES key the (mocked) key servers return; decryptBase needs a real key.
    const aesKey = new Uint8Array(32).fill(9);
    // Pre-encrypt a known plaintext so the AES-GCM decrypt path is exercised end-to-end.
    const plaintext = new Uint8Array([7, 7, 7, 8, 8, 8]);
    const ivKey = await crypto.subtle.importKey('raw', aesKey, { name: 'AES-GCM' }, false, ['encrypt']);
    const iv = new Uint8Array(12).fill(2);
    const ct = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, ivKey, plaintext),
    );
    const ciphertext = new Uint8Array(iv.length + ct.length);
    ciphertext.set(iv, 0);
    ciphertext.set(ct, iv.length);

    const sealClient = { decrypt: vi.fn().mockResolvedValue(aesKey) };
    const buildTxBytes = vi.fn().mockResolvedValue(new Uint8Array([0xaa]));
    const fetchBytes = vi.fn().mockResolvedValue(ciphertext);

    const out = await decryptEncryptedBase({
      sealClient: sealClient as never,
      sessionKey: {} as never,
      sealedKey,
      ciphertextBlobId: 'blob-xyz',
      capId: CAP_ID,
      collectionId: COLLECTION_ID,
      baseModelId: MODEL_ID,
      buildTxBytes,
      fetchBytes,
    });
    expect(Array.from(out)).toEqual(Array.from(plaintext));
    expect(buildTxBytes).toHaveBeenCalledTimes(1);
    // The key servers were handed the seal_approve_cap txBytes + the sealed key.
    expect(sealClient.decrypt).toHaveBeenCalledWith(
      expect.objectContaining({ data: sealedKey, txBytes: new Uint8Array([0xaa]) }),
    );
    // Ciphertext fetched from the base's blob id (never re-fetched as a GLB).
    expect(fetchBytes).toHaveBeenCalledWith(expect.stringContaining('blob-xyz'));
  });
});

describe('mintEncryptedTokens (step 3)', () => {
  it('signs mint_tokens and returns the digest', async () => {
    const signAndExecute = vi.fn().mockResolvedValue('0xdigest3');
    const digest = await mintEncryptedTokens({
      capId: CAP_ID,
      collectionId: COLLECTION_ID,
      quiltBlobId: 'quilt-1',
      tokenNames: ['A #1', 'A #2'],
      tokenPatchIds: ['p1', 'p2'],
      signAndExecute,
    });
    expect(digest).toBe('0xdigest3');
    expect(signAndExecute).toHaveBeenCalledTimes(1);
  });
});
