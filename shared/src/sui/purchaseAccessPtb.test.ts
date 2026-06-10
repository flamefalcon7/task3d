// plan 2026-06-10-001 U1 (KTD-5) — shared `buildPurchaseAccessPtb` tests.
//
// Pattern mirrors `frontend/src/sui/collectionTxBuilders.test.ts`: structural
// assertions via `tx.getData()` (learnings — never validate a PTB by
// string-matching serialized JSON). Adds the package-id parameterization
// checks (the one delta from the pre-lift frontend builder) and decodes the
// SplitCoins amount input to prove EXACTLY `accessFeeMist` is split from gas.

import { describe, it, expect } from 'vitest';
import { bcs } from '@mysten/sui/bcs';
import {
  buildPurchaseAccessPtb,
  type PurchaseAccessArgs,
} from './purchaseAccessPtb.js';

const PKG = '0x' + 'a'.repeat(64);
const OTHER_PKG = '0x' + 'b'.repeat(64);
const FAKE_MODEL = '0x' + '1'.repeat(64);

const PURCHASE_ARGS: PurchaseAccessArgs = {
  modelId: FAKE_MODEL,
  accessFeeMist: 2_000_000n,
};

type Cmd = {
  $kind?: string;
  MoveCall?: {
    package?: string;
    module?: string;
    function?: string;
    arguments?: unknown[];
  };
  SplitCoins?: {
    coin?: { $kind?: string };
    amounts?: Array<{ $kind?: string; Input?: number }>;
  };
};

function getCommands(tx: { getData: () => { commands: unknown[] } }): Cmd[] {
  return tx.getData().commands as Cmd[];
}

function moveCalls(tx: { getData: () => { commands: unknown[] } }): Cmd[] {
  return getCommands(tx).filter((c) => c.$kind === 'MoveCall');
}

describe('buildPurchaseAccessPtb (shared, package-id parameterized)', () => {
  it('targets `${packageId}::model3d::purchase_access`', () => {
    const { tx, metadata } = buildPurchaseAccessPtb(PKG, PURCHASE_ARGS);
    const calls = moveCalls(tx);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.MoveCall?.package).toBe(PKG);
    expect(calls[0]!.MoveCall?.module).toBe('model3d');
    expect(calls[0]!.MoveCall?.function).toBe('purchase_access');
    // Arity: model (object), coin (split result) = 2.
    expect(calls[0]!.MoveCall?.arguments).toHaveLength(2);
    expect(metadata.target).toBe(`${PKG}::model3d::purchase_access`);
    expect(metadata.expectedEvents).toEqual([
      `${PKG}::model3d::AccessPurchased`,
    ]);
  });

  it('binds the CALLER-provided package id (no baked-in TESTNET constant)', () => {
    const { tx, metadata } = buildPurchaseAccessPtb(OTHER_PKG, PURCHASE_ARGS);
    expect(moveCalls(tx)[0]!.MoveCall?.package).toBe(OTHER_PKG);
    expect(metadata.target).toBe(`${OTHER_PKG}::model3d::purchase_access`);
  });

  it('splits EXACTLY accessFeeMist from gas (decoded u64 Pure input)', () => {
    const { tx } = buildPurchaseAccessPtb(PKG, PURCHASE_ARGS);
    const data = tx.getData();
    const splits = getCommands(tx).filter((c) => c.$kind === 'SplitCoins');
    expect(splits).toHaveLength(1);
    const split = splits[0]!.SplitCoins!;
    // The split source is the gas coin, not a user-provided coin object.
    expect(split.coin?.$kind).toBe('GasCoin');
    // One amount, referencing a Pure input that decodes to the exact fee.
    expect(split.amounts).toHaveLength(1);
    const amountRef = split.amounts![0]!;
    expect(amountRef.$kind).toBe('Input');
    const input = data.inputs[amountRef.Input!] as {
      $kind?: string;
      Pure?: { bytes: string };
    };
    expect(input.$kind).toBe('Pure');
    expect(bcs.u64().fromBase64(input.Pure!.bytes)).toBe(
      PURCHASE_ARGS.accessFeeMist.toString(),
    );
  });

  it('builds with a zero access fee (splits a zero coin; Move destroy_zero)', () => {
    expect(() =>
      buildPurchaseAccessPtb(PKG, { modelId: FAKE_MODEL, accessFeeMist: 0n }),
    ).not.toThrow();
  });

  it('passes the model as an object input (struct-arg discipline)', () => {
    const { tx } = buildPurchaseAccessPtb(PKG, PURCHASE_ARGS);
    const objectInputs = tx
      .getData()
      .inputs.filter(
        (i) => (i as { $kind?: string }).$kind === 'UnresolvedObject',
      ) as Array<{ UnresolvedObject?: { objectId?: string } }>;
    expect(objectInputs).toHaveLength(1);
    expect(objectInputs[0]!.UnresolvedObject?.objectId).toBe(FAKE_MODEL);
  });
});
