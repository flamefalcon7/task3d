// plan-008 U10 / D-034 — verifies a Tripo service-fee payment off-chain.
//
// The frontend builds the exact transfer PTB (amount + treasury hardcoded), the
// user signs, and the wallet returns a tx digest. This module checks that the
// referenced transaction: (1) succeeded, (2) was sent by the authenticated
// payer, (3) transferred >= the fee in SUI to the treasury, and (4) has not
// already been spent on a prior generation (in-memory replay guard — persist
// for production). The client is injected for testability.

import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';

const SUI_COIN_TYPE = '0x2::sui::SUI';

export type VerifierClient = Pick<SuiJsonRpcClient, 'getTransactionBlock'>;

export type VerifyResult = { ok: true } | { ok: false; reason: string };

export interface PaymentVerifier {
  /** Verify `digest` paid the fee from `payer` to the treasury. Marks the
   *  digest spent on success so it cannot fund a second generation. */
  verify(digest: string, payer: string): Promise<VerifyResult>;
}

export interface PaymentVerifierOptions {
  client: VerifierClient;
  treasury: string;
  feeMist: bigint;
}

function normalizeAddr(a: string | null | undefined): string {
  return (a ?? '').toLowerCase();
}

export function createPaymentVerifier(opts: PaymentVerifierOptions): PaymentVerifier {
  const treasury = normalizeAddr(opts.treasury);
  const spent = new Set<string>();

  return {
    async verify(digest: string, payer: string): Promise<VerifyResult> {
      if (spent.has(digest)) return { ok: false, reason: 'payment_replayed' };

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

      spent.add(digest);
      return { ok: true };
    },
  };
}
