import { describe, it, expect, vi } from 'vitest';
import { createPaymentVerifier, type VerifierClient } from './paymentVerifier.js';

const PAYER = '0x' + 'a'.repeat(64);
const TREASURY = '0x' + 'b'.repeat(64);
// plan-013 — mirrors the bumped TRIPO_FEE_MIST default (0.1 → 0.4 SUI).
// Fixture-only constant; covers the verifier's >= check, under-pay, over-pay.
const FEE = 400_000_000n;
const DIGEST = 'AuzWcL4fUbgLL3uvaqPfwpuzYU5p9EGa4Uqr1fVk2yab';

function txBlock(opts: {
  status?: string;
  sender?: string;
  owner?: string;
  amount?: string;
  coinType?: string;
}) {
  return {
    effects: { status: { status: opts.status ?? 'success' } },
    transaction: { data: { sender: opts.sender ?? PAYER } },
    balanceChanges: [
      {
        owner: { AddressOwner: opts.owner ?? TREASURY },
        coinType: opts.coinType ?? '0x2::sui::SUI',
        amount: opts.amount ?? FEE.toString(),
      },
    ],
  };
}

function verifier(getTransactionBlock: VerifierClient['getTransactionBlock']) {
  return createPaymentVerifier({
    client: { getTransactionBlock } as VerifierClient,
    treasury: TREASURY,
    feeMist: FEE,
  });
}

describe('paymentVerifier', () => {
  it('accepts a valid fee payment from the payer to the treasury', async () => {
    const v = verifier(vi.fn().mockResolvedValue(txBlock({})));
    expect(await v.verify(DIGEST, PAYER)).toEqual({ ok: true });
  });

  it('rejects a replayed digest on the second use', async () => {
    const v = verifier(vi.fn().mockResolvedValue(txBlock({})));
    expect(await v.verify(DIGEST, PAYER)).toEqual({ ok: true });
    expect(await v.verify(DIGEST, PAYER)).toEqual({ ok: false, reason: 'payment_replayed' });
  });

  it('rejects when the sender is not the authenticated payer', async () => {
    const v = verifier(vi.fn().mockResolvedValue(txBlock({ sender: '0x' + 'c'.repeat(64) })));
    expect(await v.verify(DIGEST, PAYER)).toEqual({ ok: false, reason: 'payment_sender_mismatch' });
  });

  it('rejects a failed transaction', async () => {
    const v = verifier(vi.fn().mockResolvedValue(txBlock({ status: 'failure' })));
    expect(await v.verify(DIGEST, PAYER)).toEqual({ ok: false, reason: 'payment_not_successful' });
  });

  it('rejects an underpayment', async () => {
    const v = verifier(vi.fn().mockResolvedValue(txBlock({ amount: (FEE - 1n).toString() })));
    expect(await v.verify(DIGEST, PAYER)).toEqual({
      ok: false,
      reason: 'payment_insufficient_or_wrong_destination',
    });
  });

  it('rejects payment to the wrong destination', async () => {
    const v = verifier(vi.fn().mockResolvedValue(txBlock({ owner: '0x' + 'd'.repeat(64) })));
    expect(await v.verify(DIGEST, PAYER)).toEqual({
      ok: false,
      reason: 'payment_insufficient_or_wrong_destination',
    });
  });

  it('rejects a non-SUI coin payment', async () => {
    const v = verifier(vi.fn().mockResolvedValue(txBlock({ coinType: '0x2::other::OTHER' })));
    expect(await v.verify(DIGEST, PAYER)).toEqual({
      ok: false,
      reason: 'payment_insufficient_or_wrong_destination',
    });
  });

  it('rejects when the tx cannot be fetched', async () => {
    const v = verifier(vi.fn().mockRejectedValue(new Error('not found')));
    expect(await v.verify(DIGEST, PAYER)).toEqual({ ok: false, reason: 'payment_not_found' });
  });

  it('accepts an overpayment (>= fee)', async () => {
    const v = verifier(vi.fn().mockResolvedValue(txBlock({ amount: (FEE * 2n).toString() })));
    expect(await v.verify(DIGEST, PAYER)).toEqual({ ok: true });
  });

  it('accepts when sender == treasury (deployer pays themselves, D-034 demo)', async () => {
    // Hackathon scope: TRIPO_FEE_TREASURY defaults to the deployer's wallet.
    // When the deployer triggers /create, sender == treasury and Sui's
    // per-address NET balanceChanges nets the 0.4 SUI in/out to ~-gas —
    // the positive +0.4 entry never appears. Without this short-circuit
    // verifier 402s with `payment_insufficient_or_wrong_destination`
    // even though the SUI was correctly spent on chain.
    const selfPayTx = {
      effects: { status: { status: 'success' } },
      transaction: { data: { sender: TREASURY } }, // sender == treasury
      balanceChanges: [
        {
          owner: { AddressOwner: TREASURY },
          coinType: '0x2::sui::SUI',
          amount: '-1000000', // net = -gas only
        },
      ],
    };
    const v = verifier(vi.fn().mockResolvedValue(selfPayTx));
    expect(await v.verify(DIGEST, TREASURY)).toEqual({ ok: true });
  });

  it('replay guard fires on self-pay path too', async () => {
    const selfPayTx = {
      effects: { status: { status: 'success' } },
      transaction: { data: { sender: TREASURY } },
      balanceChanges: [
        { owner: { AddressOwner: TREASURY }, coinType: '0x2::sui::SUI', amount: '-1000000' },
      ],
    };
    const v = verifier(vi.fn().mockResolvedValue(selfPayTx));
    expect(await v.verify(DIGEST, TREASURY)).toEqual({ ok: true });
    expect(await v.verify(DIGEST, TREASURY)).toEqual({ ok: false, reason: 'payment_replayed' });
  });
});
