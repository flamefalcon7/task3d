// plan-008 U10 / D-034 — verifies a Tripo service-fee payment off-chain.
//
// The frontend builds the exact transfer PTB (amount + treasury hardcoded), the
// user signs, and the wallet returns a tx digest. This module checks that the
// referenced transaction: (1) succeeded, (2) was sent by the authenticated
// payer, (3) transferred >= the fee in SUI to the treasury, (4) is recent
// (D-088 recency window), and (5) has not already been spent on a prior
// generation. The client is injected for testability.
//
// D-088 (audit Track 4–5 B-1): the replay guard is now DURABLE — backed by the
// SQLite quota store via an injected `store`, so a restart/redeploy (or a second
// load-balanced instance) can no longer wipe it and let a digest fund a second
// generation. `markPaymentSpent` is an atomic INSERT-OR-IGNORE: a false return
// means a concurrent call already consumed the digest (closes the old
// check-then-add race). When no store is injected (unit tests), it falls back to
// a per-instance in-memory Set with the legacy semantics. Full per-request
// binding (a server nonce embedded in the transfer PTB) is deferred to v1.1 —
// see OQ-033; the durable spent-set + recency window closes the practical replay.
//
// D-089 (audit Track 4–5 B-4): the self-pay bypass is gated on an explicit
// `operatorAddress` (the deployer, who legitimately runs /create against their
// own treasury) rather than the structural `sender === treasury` coincidence.
// If `operatorAddress` is unset, the bypass never fires — so pointing the
// treasury at a shared/user wallet can no longer hand that user free generations.

import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';

const SUI_COIN_TYPE = '0x2::sui::SUI';

/** Default recency window: a payment tx older than this is rejected as stale,
 *  killing reuse of an unrelated historical transfer to the treasury. */
const DEFAULT_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

export type VerifierClient = Pick<SuiJsonRpcClient, 'getTransactionBlock'>;

export type VerifyResult = { ok: true } | { ok: false; reason: string };

/** The slice of QuotaStore the verifier needs for its durable replay guard. */
export interface PaymentSpentStore {
  isPaymentSpent(digest: string): boolean;
  markPaymentSpent(digest: string, spentAt: number): boolean;
}

export interface PaymentVerifier {
  /** Verify `digest` paid the fee from `payer` to the treasury. Marks the
   *  digest spent on success so it cannot fund a second generation. */
  verify(digest: string, payer: string): Promise<VerifyResult>;
}

export interface PaymentVerifierOptions {
  client: VerifierClient;
  treasury: string;
  feeMist: bigint;
  /** Durable spent-digest store (D-088). Omit in tests to use the in-memory Set. */
  store?: PaymentSpentStore;
  /** The operator identity allowed the self-pay bypass (D-089); when unset, no
   *  bypass. Defaults to the deployer in production wiring. */
  operatorAddress?: string;
  /** Max age of the payment tx (D-088 recency window). Defaults to 1h. */
  maxAgeMs?: number;
  /** Injectable clock for deterministic recency/replay tests. */
  now?: () => number;
}

function normalizeAddr(a: string | null | undefined): string {
  return (a ?? '').toLowerCase();
}

export function createPaymentVerifier(opts: PaymentVerifierOptions): PaymentVerifier {
  const treasury = normalizeAddr(opts.treasury);
  const operator = opts.operatorAddress ? normalizeAddr(opts.operatorAddress) : null;
  const maxAgeMs = opts.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const now = opts.now ?? Date.now;

  // Durable guard when a store is injected; per-instance fallback otherwise.
  const memSpent = new Set<string>();
  const isSpent = (digest: string): boolean =>
    opts.store ? opts.store.isPaymentSpent(digest) : memSpent.has(digest);
  /** Atomic mark; false ⇒ already consumed (the replay signal). */
  const markSpent = (digest: string): boolean => {
    if (opts.store) return opts.store.markPaymentSpent(digest, now());
    if (memSpent.has(digest)) return false;
    memSpent.add(digest);
    return true;
  };

  return {
    async verify(digest: string, payer: string): Promise<VerifyResult> {
      if (isSpent(digest)) return { ok: false, reason: 'payment_replayed' };

      let tx;
      try {
        tx = await opts.client.getTransactionBlock({
          digest,
          options: { showEffects: true, showBalanceChanges: true, showInput: true },
        });
      } catch {
        return { ok: false, reason: 'payment_not_found' };
      }

      const status = (tx as { effects?: { status?: { status?: string } } }).effects?.status?.status;
      if (status !== 'success') return { ok: false, reason: 'payment_not_successful' };

      const sender = normalizeAddr(
        (tx as { transaction?: { data?: { sender?: string } } }).transaction?.data?.sender,
      );
      if (sender !== normalizeAddr(payer)) return { ok: false, reason: 'payment_sender_mismatch' };

      // Recency window (D-088): reject a stale tx so an old, unrelated transfer
      // to the treasury can't be replayed as fresh payment. `timestampMs` is set
      // once the tx is in a checkpoint; if the RPC omits it we don't fail-closed
      // (avoid false rejects of a just-landed tx), the spent-set still binds it.
      const tsRaw = (tx as { timestampMs?: string | number }).timestampMs;
      if (tsRaw !== undefined && tsRaw !== null) {
        const ts = Number(tsRaw);
        if (Number.isFinite(ts) && now() - ts > maxAgeMs) {
          return { ok: false, reason: 'payment_stale' };
        }
      }

      // Self-pay bypass (D-089): only the explicit operator (the deployer) may
      // skip the balance-change check. When the operator runs /create against
      // their own treasury, Sui's per-address NET balanceChanges nets the fee
      // in/out to ~-gas, so the +fee entry never appears and the check below
      // would wrongly fail. Gating on `operator` (not `treasury`) means a
      // treasury pointed at a shared/user wallet does NOT grant that user the
      // bypass. Unset operator ⇒ no bypass.
      if (operator && sender === operator) {
        if (!markSpent(digest)) return { ok: false, reason: 'payment_replayed' };
        return { ok: true };
      }

      const balanceChanges =
        (tx as {
          balanceChanges?: Array<{
            owner?: { AddressOwner?: string };
            coinType?: string;
            amount?: string;
          }>;
        }).balanceChanges ?? [];

      const toTreasury = balanceChanges.find(
        (bc) =>
          bc.coinType === SUI_COIN_TYPE &&
          normalizeAddr(bc.owner?.AddressOwner) === treasury &&
          BigInt(bc.amount ?? '0') >= opts.feeMist,
      );
      if (!toTreasury) return { ok: false, reason: 'payment_insufficient_or_wrong_destination' };

      // Mark spent LAST, atomically: a concurrent request racing the same digest
      // gets false here and is rejected, so one digest funds exactly one gen.
      if (!markSpent(digest)) return { ok: false, reason: 'payment_replayed' };
      return { ok: true };
    },
  };
}
