// Shared memory-recall configuration (review M-004) — consumed by BOTH the
// /api/memory route and the MCP search_models tool, so neither imports the
// other's module. Values were previously module-local to routes/memory.ts;
// semantics unchanged.

/** Shared community namespace (D-080 Global Recall). Personal records live
 *  under `namespace = wallet address`; non-RESTRICTED publishes are ALSO
 *  mirrored here. */
export const GLOBAL_NAMESPACE = 'global';

/** Global recall over-fetches: exclude-self / denylist / id-shape filters run
 *  post-recall, so callers request more than they return. */
export const GLOBAL_OVERFETCH = 4;

// Relevance gate: vector recall always returns nearest neighbours, so without
// a distance ceiling a junk query surfaces the whole pool. Drop results
// at/above this cosine distance. Env-tunable for the demo. (See
// routes/memory.ts for the honest calibration notes behind 0.66.)
export const RECALL_MAX_DISTANCE = Number(process.env.MEMORY_MAX_DISTANCE ?? '0.66');

// Operator break-glass: addresses suppressed from global recall. Testnet's
// free publish fee is no spam deterrent, so this denylist — not the fee — is
// the real lever for the demo window. Seeded from env (comma-separated),
// mutable in tests.
const denylist = new Set<string>(
  (process.env.MEMORY_DENYLIST ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

/** True when `creator` is operator-suppressed from global recall. */
export function isDenylistedCreator(creator: string): boolean {
  return denylist.has(creator);
}

/** Test-only: replace the denylist contents. */
export function setMemoryDenylistForTest(addresses: string[]): void {
  denylist.clear();
  for (const a of addresses) denylist.add(a);
}
