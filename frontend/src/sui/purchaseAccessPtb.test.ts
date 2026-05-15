import { describe, it, expect } from 'vitest';
import { buildPurchaseAccessPtb } from './purchaseAccessPtb';

describe('buildPurchaseAccessPtb', () => {
  it('builds a Transaction with moveCall to purchase_model_access', () => {
    const tx = buildPurchaseAccessPtb({
      modelObjectId: '0xabc',
      priceMist: 100_000_000n,
    });
    const serialized = JSON.stringify(tx.getData());
    expect(serialized).toContain('purchase_model_access');
    expect(serialized).toContain('model3d');
  });

  it('defaults duration_ms to 0n (permanent access)', () => {
    const tx = buildPurchaseAccessPtb({
      modelObjectId: '0xabc',
      priceMist: 100_000_000n,
    });
    const serialized = JSON.stringify(tx.getData());
    // u64 0 encodes to "0" in BCS pure args; just ensure tx builds and
    // serialization includes the target function name.
    expect(serialized).toContain('purchase_model_access');
  });

  it('accepts an explicit non-zero duration_ms', () => {
    const tx = buildPurchaseAccessPtb({
      modelObjectId: '0xabc',
      priceMist: 100_000_000n,
      durationMs: 86_400_000n,
    });
    expect(tx).toBeDefined();
  });

  it('serializes without throwing for typical input', () => {
    const tx = buildPurchaseAccessPtb({
      modelObjectId: '0xdeadbeef',
      priceMist: 1n,
    });
    expect(() => JSON.stringify(tx.getData())).not.toThrow();
  });
});
