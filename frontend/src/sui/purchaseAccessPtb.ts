import { Transaction } from '@mysten/sui/transactions';

// MODEL3D_PACKAGE_ID — same pattern as publishPtb.ts. '0x0' placeholder until
// VITE_MODEL3D_PACKAGE_ID is wired up post-testnet deploy.
export const MODEL3D_PACKAGE_ID =
  (import.meta.env.VITE_MODEL3D_PACKAGE_ID as string) || '0x0';

export interface BuildPurchaseAccessPtbInput {
  modelObjectId: string; // Sui object ID of the shared Model3D
  priceMist: bigint;     // u64 — must be >= model.direct_access_price; pass exact price
  durationMs?: bigint;   // optional; default 0n = permanent (D-016)
}

export function buildPurchaseAccessPtb(
  input: BuildPurchaseAccessPtbInput,
): Transaction {
  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(input.priceMist)]);
  tx.moveCall({
    target: `${MODEL3D_PACKAGE_ID}::model3d::purchase_model_access`,
    arguments: [
      tx.object(input.modelObjectId), // &Model3D (shared)
      coin,                           // Coin<SUI>
      tx.pure.u64(input.durationMs ?? 0n),
      tx.object('0x6'),               // Clock
    ],
  });
  return tx;
}
