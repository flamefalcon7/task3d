import { describe, it, expect } from 'vitest';
import {
  buildPublishPtb,
  encodeLicenseTerms,
  DEFAULT_LICENSE,
} from './publishPtb';

describe('encodeLicenseTerms', () => {
  it('BCS snapshot for default LicenseTerms', () => {
    const bytes = encodeLicenseTerms(DEFAULT_LICENSE);
    // Default: policy=2, fee=0, royalty=1000 (0x03E8 LE), commercial=true,
    // attribution=false. BCS layout: u8 | u64 LE | u16 LE | bool | bool.
    expect(Array.from(bytes)).toEqual([
      0x02,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0xe8, 0x03,
      0x01,
      0x00,
    ]);
  });

  it('different policy encodes different first byte', () => {
    expect(encodeLicenseTerms({ ...DEFAULT_LICENSE, policy: 0 })[0]).toBe(0x00);
    expect(encodeLicenseTerms({ ...DEFAULT_LICENSE, policy: 1 })[0]).toBe(0x01);
  });

  it('non-zero derivative fee encodes in u64 LE positions', () => {
    const bytes = encodeLicenseTerms({
      ...DEFAULT_LICENSE,
      derivativeMintFee: 1n,
    });
    expect(bytes[1]).toBe(0x01);
    expect(bytes[8]).toBe(0x00);
  });
});

describe('buildPublishPtb', () => {
  it('chains new_license_terms result into publish_and_share (per-review P0 fix)', () => {
    const tx = buildPublishPtb({
      blobObjectId: '0xabc',
      shapeType: 'box',
      paramsJson: '{"shape":"box","width":1,"height":1,"depth":1}',
      name: 'My Box',
      tags: ['demo', 'box'],
      lineageBlobId: 'walrus_blob_id_demo',
      directAccessPrice: 100_000_000n,
      isEncrypted: false,
      license: DEFAULT_LICENSE,
    });
    // Both moveCalls must appear so the LicenseTerms struct is constructed
    // on-chain and passed as a Result to publish_and_share (rather than as
    // raw BCS bytes, which would fail Move type checking).
    const serialized = JSON.stringify(tx.getData());
    expect(serialized).toContain('new_license_terms');
    expect(serialized).toContain('publish_and_share');
    expect(serialized).toContain('model3d');
  });
});
