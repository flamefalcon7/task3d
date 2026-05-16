// Spike-B (R8) — verify SDK accepts the borrow-then-consume PTB chain shape
// that plan-003 KTD-1 prescribes for Collection Forge:
//
//   1. publish_collection(...) returns Collection by value
//   2. N times: mint_variant(&Collection, ...) borrows Collection, returns Model3D
//   3. share_collection(Collection) consumes Collection by value
//
// This test exercises the encoding-level question only: can the SDK encode a
// transaction that references the same Result handle N times as a borrow
// argument, then once as a value-consuming argument? Move runtime semantics
// (whether the deployed contract actually permits this) are out of scope here
// and validated downstream by U1's Move tests + U2's testnet dry-run.
//
// Evidence trail (in case U1 needs to re-verify):
//   - @mysten/sui/dist/transactions/Transaction.mjs lines 273-285: #addCommand
//     only validates that referenced Results are still in #availableResults.
//     Results are NOT removed from #availableResults when they are referenced
//     as arguments — only when they are consumed by certain explicit ops.
//     This means a Result can be passed as an argument to N moveCalls.
//   - Sui Move semantics (Move book, kiosk pattern): &T borrows are scoped
//     per-call. After the borrowing function returns, the underlying value is
//     back to its original location, unchanged in identity.
//   - Mainnet precedent: Sui Kiosk's place/take/list operations use exactly
//     this pattern — kiosk::new() returns (Kiosk, OwnerCap) by value, then N
//     calls take &mut Kiosk, then share_object(kiosk) consumes it.

import { describe, it, expect } from 'vitest';
import { Transaction } from '@mysten/sui/transactions';

const FAKE_PACKAGE_ID = '0x' + 'b'.repeat(64);
const FAKE_BLOB_OBJECT_ID = '0x' + 'c'.repeat(64);
const CLOCK_OBJECT_ID = '0x6';

function buildBorrowThenConsumePtb(variantCount: number): Transaction {
  const tx = new Transaction();

  // Step 1: publish_collection returns Collection by value
  const collection = tx.moveCall({
    target: `${FAKE_PACKAGE_ID}::model3d::publish_collection`,
    arguments: [
      tx.object(FAKE_BLOB_OBJECT_ID),
      tx.pure.string('Neon Drift Series'),
      tx.pure.string('neon-drift'),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });

  // Step 2: N times — mint_variant borrows &Collection
  for (let i = 0; i < variantCount; i += 1) {
    const model = tx.moveCall({
      target: `${FAKE_PACKAGE_ID}::model3d::mint_variant`,
      arguments: [
        collection, // SDK passes Result handle; runtime treats as &Collection
        tx.pure.string(`patch-${i}`),
        tx.pure.string('{}'),
        tx.pure.string(`Variant ${i}`),
        tx.object(CLOCK_OBJECT_ID),
      ],
    });
    // Share the returned Model3D to keep the PTB realistic
    tx.moveCall({
      target: `0x2::transfer::public_share_object`,
      typeArguments: [`${FAKE_PACKAGE_ID}::model3d::Model3D`],
      arguments: [model],
    });
  }

  // Step 3: share_collection consumes Collection by value
  tx.moveCall({
    target: `${FAKE_PACKAGE_ID}::model3d::share_collection`,
    arguments: [collection],
  });

  return tx;
}

describe('Spike-B: PTB borrow-then-consume chain shape (R8 plan-003)', () => {
  it('SDK encodes the publish → 3 borrows → share shape without error', () => {
    expect(() => buildBorrowThenConsumePtb(3)).not.toThrow();
  });

  it('SDK encodes the 16-variant cap shape without error', () => {
    expect(() => buildBorrowThenConsumePtb(16)).not.toThrow();
  });

  it('encoded transaction references the same Collection Result handle in every mint_variant arg', () => {
    const tx = buildBorrowThenConsumePtb(3);
    const data = tx.getData();
    // The Collection is created by command 0 (publish_collection).
    // Commands 1, 3, 5 are mint_variant calls. Each must reference Result(0)
    // as its first non-pure arg.
    const mintVariantCalls = data.commands.filter(
      (c) => c.$kind === 'MoveCall' && c.MoveCall?.function === 'mint_variant',
    );
    expect(mintVariantCalls).toHaveLength(3);
    for (const cmd of mintVariantCalls) {
      const args = cmd.$kind === 'MoveCall' ? cmd.MoveCall?.arguments ?? [] : [];
      // First arg is the Collection — should be a Result handle pointing at index 0
      const firstArg = args[0];
      expect(firstArg?.$kind).toBe('Result');
      if (firstArg?.$kind === 'Result') {
        expect(firstArg.Result).toBe(0);
      }
    }
  });

  it('final share_collection references the same Result(0) handle', () => {
    const tx = buildBorrowThenConsumePtb(3);
    const data = tx.getData();
    const shareCommands = data.commands.filter(
      (c) =>
        c.$kind === 'MoveCall' && c.MoveCall?.function === 'share_collection',
    );
    expect(shareCommands).toHaveLength(1);
    const shareArgs =
      shareCommands[0]?.$kind === 'MoveCall'
        ? shareCommands[0].MoveCall?.arguments ?? []
        : [];
    expect(shareArgs[0]?.$kind).toBe('Result');
    if (shareArgs[0]?.$kind === 'Result') {
      expect(shareArgs[0].Result).toBe(0);
    }
  });

  it('command count grows linearly with variant count (no SDK rewriting)', () => {
    const tx3 = buildBorrowThenConsumePtb(3);
    const tx16 = buildBorrowThenConsumePtb(16);
    // 1 publish + N×(mint + share Model3D) + 1 share_collection
    expect(tx3.getData().commands).toHaveLength(1 + 3 * 2 + 1);
    expect(tx16.getData().commands).toHaveLength(1 + 16 * 2 + 1);
  });
});
