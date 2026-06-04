import { describe, it, expect, vi } from 'vitest';
import {
  createPaymentVerifier,
  type VerifierClient,
  type PaymentSpentStore,
} from './paymentVerifier.js';

const PAYER = '0x' + 'a'.repeat(64);
const TREASURY = '0x' + 'b'.repeat(64);
// plan-013 — mirrors the bumped TRIPO_FEE_MIST default (0.1 → 0.4 SUI).
// Fixture-only constant; covers the verifier's >= check, under-pay, over-pay.
const FEE = 400_000_000n;
const DIGEST = 'AuzWcL4fUbgLL3uvaqPfwpuzYU5p9EGa4Uqr1fVk2yab';

/** In-memory PaymentSpentStore double — mirrors the SQLite store's atomic
 *  INSERT-OR-IGNORE semantics (markPaymentSpent returns false on a known digest). */
function memStore(): PaymentSpentStore {
  const s = new Set<string>();
  return {
    isPaymentSpent: (d) => s.has(d),
    markPaymentSpent: (d) => {
      if (s.has(d)) return false;
      s.add(d);
      return true;
    },
  };
}

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

function verifier(
  getTransactionBlock: VerifierClient['getTransactionBlock'],
  extra: { store?: PaymentSpentStore; operatorAddress?: string; maxAgeMs?: number; now?: () => number } = {},
) {
  return createPaymentVerifier({
    client: { getTransactionBlock } as VerifierClient,
    treasury: TREASURY,
    feeMist: FEE,
    ...extra,
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

  // Self-pay net-balance tx used by the operator-bypass tests (D-089). When the
  // operator runs /create against their own treasury, the NET balanceChange is
  // ~-gas, so the +fee entry the normal path looks for never appears.
  const selfPayTx = {
    effects: { status: { status: 'success' } },
    transaction: { data: { sender: TREASURY } }, // sender == treasury == operator (deployer)
    balanceChanges: [
      { owner: { AddressOwner: TREASURY }, coinType: '0x2::sui::SUI', amount: '-1000000' },
    ],
  };

  it('accepts self-pay when sender == configured operator (deployer, D-089)', async () => {
    const v = verifier(vi.fn().mockResolvedValue(selfPayTx), { operatorAddress: TREASURY });
    expect(await v.verify(DIGEST, TREASURY)).toEqual({ ok: true });
  });

  it('replay guard fires on the operator self-pay path too', async () => {
    const v = verifier(vi.fn().mockResolvedValue(selfPayTx), { operatorAddress: TREASURY });
    expect(await v.verify(DIGEST, TREASURY)).toEqual({ ok: true });
    expect(await v.verify(DIGEST, TREASURY)).toEqual({ ok: false, reason: 'payment_replayed' });
  });

  // D-089 (B-4) — the security fix: with NO operator configured, the structural
  // sender == treasury coincidence must NOT grant the bypass. The self-pay tx
  // (net -gas, no +fee entry) then correctly fails the balance check.
  it('does NOT bypass on sender == treasury when no operator is configured (B-4)', async () => {
    const v = verifier(vi.fn().mockResolvedValue(selfPayTx)); // operatorAddress unset
    expect(await v.verify(DIGEST, TREASURY)).toEqual({
      ok: false,
      reason: 'payment_insufficient_or_wrong_destination',
    });
  });

  it('does NOT bypass for a non-operator whose wallet happens to equal the treasury', async () => {
    // A different operator is configured; the treasury-equal payer is NOT it,
    // so no free generation even though sender == treasury structurally.
    const operator = '0x' + 'e'.repeat(64);
    const v = verifier(vi.fn().mockResolvedValue(selfPayTx), { operatorAddress: operator });
    expect(await v.verify(DIGEST, TREASURY)).toEqual({
      ok: false,
      reason: 'payment_insufficient_or_wrong_destination',
    });
  });

  // D-088 (B-1) — durable replay guard: a digest consumed by one verifier
  // instance is rejected by a FRESH instance sharing the same store, proving the
  // guard survives a restart / second load-balanced instance.
  it('rejects a replayed digest across verifier instances sharing a store (B-1)', async () => {
    const store = memStore();
    const a = verifier(vi.fn().mockResolvedValue(txBlock({})), { store });
    expect(await a.verify(DIGEST, PAYER)).toEqual({ ok: true });

    const b = verifier(vi.fn().mockResolvedValue(txBlock({})), { store }); // "after restart"
    expect(await b.verify(DIGEST, PAYER)).toEqual({ ok: false, reason: 'payment_replayed' });
  });

  // D-088 (B-1) — recency window: a stale tx (older than maxAgeMs) is rejected so
  // an old, unrelated transfer to the treasury can't be replayed as fresh payment.
  it('rejects a stale payment tx older than the recency window (B-1)', async () => {
    const now = 10_000_000;
    const staleTx = { ...txBlock({}), timestampMs: String(now - 2 * 60 * 60 * 1000) }; // 2h old
    const v = verifier(vi.fn().mockResolvedValue(staleTx), {
      store: memStore(),
      maxAgeMs: 60 * 60 * 1000, // 1h window
      now: () => now,
    });
    expect(await v.verify(DIGEST, PAYER)).toEqual({ ok: false, reason: 'payment_stale' });
  });

  it('accepts a recent payment tx within the recency window', async () => {
    const now = 10_000_000;
    const freshTx = { ...txBlock({}), timestampMs: String(now - 5 * 60 * 1000) }; // 5m old
    const v = verifier(vi.fn().mockResolvedValue(freshTx), {
      store: memStore(),
      maxAgeMs: 60 * 60 * 1000,
      now: () => now,
    });
    expect(await v.verify(DIGEST, PAYER)).toEqual({ ok: true });
  });

  // D-088 — documented fail-OPEN: when the RPC omits timestampMs (e.g. a tx not
  // yet associated with a checkpoint), the recency check is SKIPPED rather than
  // fail-closed, so a just-landed payment isn't falsely rejected. The durable
  // spent-set still binds the digest to one generation. This locks that contract
  // so a future flip to fail-closed is a deliberate, test-breaking change.
  it('accepts a tx with NO timestampMs (recency check skipped, fail-open)', async () => {
    const now = 10_000_000;
    const noTsTx = txBlock({}); // fixture has no timestampMs
    const v = verifier(vi.fn().mockResolvedValue(noTsTx), {
      store: memStore(),
      maxAgeMs: 60 * 60 * 1000,
      now: () => now,
    });
    expect(await v.verify(DIGEST, PAYER)).toEqual({ ok: true });
  });

  // The invariant that defuses the recency fail-open: even when the recency check
  // is skipped (no timestampMs), the durable spent-set still binds the digest, so
  // it funds exactly ONE generation — a fail-open tx cannot be replayed.
  it('still binds a no-timestampMs digest to one use (fail-open is not a replay multiplier)', async () => {
    const now = 10_000_000;
    const noTsTx = txBlock({});
    const v = verifier(vi.fn().mockResolvedValue(noTsTx), {
      store: memStore(),
      maxAgeMs: 60 * 60 * 1000,
      now: () => now,
    });
    expect(await v.verify(DIGEST, PAYER)).toEqual({ ok: true });
    expect(await v.verify(DIGEST, PAYER)).toEqual({ ok: false, reason: 'payment_replayed' });
  });

  it('skips the recency check on a non-numeric timestampMs (fail-open, not a crash)', async () => {
    const now = 10_000_000;
    const garbageTsTx = { ...txBlock({}), timestampMs: 'not-a-number' };
    const v = verifier(vi.fn().mockResolvedValue(garbageTsTx), {
      store: memStore(),
      maxAgeMs: 60 * 60 * 1000,
      now: () => now,
    });
    expect(await v.verify(DIGEST, PAYER)).toEqual({ ok: true });
  });

  // Ordering invariant: a digest that fails a transient check is NOT marked spent,
  // so a legitimate retry succeeds (markSpent runs only on the success paths).
  it('does not consume the digest on a transient failure — a later valid retry succeeds', async () => {
    const store = memStore();
    const client = vi
      .fn()
      .mockResolvedValueOnce(txBlock({ status: 'failure' })) // transient fail
      .mockResolvedValueOnce(txBlock({})); // retry succeeds
    const v = verifier(client, { store });
    expect(await v.verify(DIGEST, PAYER)).toEqual({ ok: false, reason: 'payment_not_successful' });
    expect(await v.verify(DIGEST, PAYER)).toEqual({ ok: true });
  });
});
