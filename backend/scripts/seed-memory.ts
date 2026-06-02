// Demo-seeding for the Riff Copilot global pool (plan-001 U7, D-080).
//
// Populates MemWal so /create shows value on demo day. CRITICAL (exclude-self
// trap): the global pool must contain entries authored by 2–3 DISTINCT
// non-presenter addresses, or the presenter wallet's community section is empty
// (everything is filtered as "self"). Records go through the SAME memoryWrites
// helper the live /remember route uses, so seeded records are byte-identical.
//
// For the most polished demo, override SEED_DATA's modelIds with REAL published
// Model3D object ids (so the "open model" links resolve) — ideally models
// actually published from 2–3 separate test wallets. The defaults below are
// synthetic and good enough to prove the UI + exclude-self behavior.
//
// Run (env MEMWAL_* must be set — see backend/.env):
//   pnpm --dir backend exec tsx scripts/seed-memory.ts
import { getMemwalClient, type MemwalClient } from '../src/lib/memwal-client.js';
import { memoryWrites, type MemoryWrite } from '../src/routes/memory.js';

// model3d.move policy ints: RESTRICTED=0, ALLOW_LIST=1, PERMISSIONLESS=2.
const POLICY_RESTRICTED = 0;
const POLICY_ALLOW_LIST = 1;
const POLICY_PERMISSIONLESS = 2;

export interface SeedRecord {
  /** Author address (= personal namespace + global trailer `c`). */
  creatorAddr: string;
  prompt: string;
  /** Published Model3D object id (replace with real ids for resolving links). */
  modelId: string;
  policy: number;
}

const addr = (h: string) => '0x' + h.repeat(64).slice(0, 64);
const CREATOR_A = addr('a');
const CREATOR_B = addr('b');
const CREATOR_C = addr('c');

// 3 distinct non-presenter creators; a mix of policies incl. one RESTRICTED.
export const SEED_DATA: SeedRecord[] = [
  { creatorAddr: CREATOR_A, prompt: 'a low-poly red sports car, sharp angular body', modelId: addr('1'), policy: POLICY_PERMISSIONLESS },
  { creatorAddr: CREATOR_A, prompt: 'a sleek sci-fi hover bike with neon accents', modelId: addr('2'), policy: POLICY_ALLOW_LIST },
  { creatorAddr: CREATOR_B, prompt: 'a chunky off-road pickup truck with big tires', modelId: addr('3'), policy: POLICY_PERMISSIONLESS },
  { creatorAddr: CREATOR_B, prompt: 'a medieval wooden treasure chest with iron bands', modelId: addr('4'), policy: POLICY_ALLOW_LIST },
  { creatorAddr: CREATOR_C, prompt: 'a cute cartoon mushroom house', modelId: addr('5'), policy: POLICY_PERMISSIONLESS },
  // RESTRICTED → must NEVER reach the global pool (proves the policy gate).
  { creatorAddr: CREATOR_C, prompt: 'a private prototype weapon, do not share', modelId: addr('6'), policy: POLICY_RESTRICTED },
];

/** Expand seed records into the exact MemWal writes (personal + gated global). */
export function planSeedWrites(records: SeedRecord[] = SEED_DATA): MemoryWrite[] {
  return records.flatMap((r) => memoryWrites(r.creatorAddr, r.prompt, r.modelId, r.policy));
}

/** Perform the seed writes against a MemWal client. Returns the write count. */
export async function seedMemory(client: MemwalClient, records: SeedRecord[] = SEED_DATA): Promise<number> {
  const writes = planSeedWrites(records);
  for (const w of writes) {
    await client.remember(w.namespace, w.text);
  }
  return writes.length;
}

// CLI entry — only when executed directly (not when imported by the test).
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const client = getMemwalClient();
  if (!client.configured) {
    console.error('MEMWAL_* env not set — cannot seed. See backend/.env.example.');
    process.exit(1);
  }
  seedMemory(client)
    .then((n) => console.log(`[seed-memory] issued ${n} writes across ${SEED_DATA.length} records`))
    .catch((e) => {
      console.error('[seed-memory] failed:', e);
      process.exit(1);
    });
}
