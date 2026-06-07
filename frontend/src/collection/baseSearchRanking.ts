// Base-model search ranking (plan-002 U2).
//
// Pure merge of personal + global MemWal recall hits onto the forkable catalog.
// Used by the /launch ask box to reorder/highlight the base picker — it NEVER
// hides a forkable base (R5); a query only promotes matches to the front.
//
// Join: RecallChip.modelId ↔ Model3DSummary.objectId. Hits with a null modelId
// (trailer-less personal records) or an objectId not in the forkable set are
// dropped (R7) — never used as a lookup key. Distances merge by min (closest).
import type { Model3DSummary, RecallChip } from '@overflow2026/shared';

// Mirror creator/PromptMemoryChips.tsx STRONG_MATCH_THRESHOLD — a hit closer
// than this is a "strong" match worth a prominent highlight.
export const STRONG_MATCH_DISTANCE = 0.45;

export interface BaseMatch {
  /** Closest (min) recall distance across scopes for this base. */
  distance: number;
  /** distance < strongMatchDistance — drives the prominent highlight. */
  strong: boolean;
  /** The base creator's original prompt (R6 "why it matched"). Always a string. */
  reason: string;
}

export interface RankedForkable {
  /** Matched forkable bases first (ascending distance), then the rest in their
   *  original order. Always contains every forkable base — nothing is removed. */
  ordered: Model3DSummary[];
  /** Per-base match metadata, keyed by objectId. Empty when there is no query
   *  match (the caller then renders the default grid). */
  matches: Map<string, BaseMatch>;
}

export interface RankOptions {
  /** Per-scope distance transforms (identity by default). Forward-compat hook:
   *  if personal vs global distances turn out not directly comparable, normalize
   *  here without a signature change downstream. */
  personalTransform?: (d: number) => number;
  globalTransform?: (d: number) => number;
  /** Override the strong-match cutoff (default STRONG_MATCH_DISTANCE). */
  strongMatchDistance?: number;
}

const identity = (d: number): number => d;

export function rankForkableMatches(
  personal: RecallChip[],
  global: RecallChip[],
  forkable: Model3DSummary[],
  opts: RankOptions = {},
): RankedForkable {
  const personalTransform = opts.personalTransform ?? identity;
  const globalTransform = opts.globalTransform ?? identity;
  const strongAt = opts.strongMatchDistance ?? STRONG_MATCH_DISTANCE;

  const forkableById = new Map(forkable.map((m) => [m.objectId, m]));

  // Merge: drop null/non-forkable modelIds, de-dupe by modelId keeping the
  // minimum (closest) distance and its prompt as the reason.
  const best = new Map<string, { distance: number; reason: string }>();
  const consider = (chips: RecallChip[], transform: (d: number) => number) => {
    for (const c of chips) {
      const id = c.modelId;
      if (!id || !forkableById.has(id)) continue; // null/'' or not forkable → drop
      const distance = transform(c.distance);
      // Defensive at the relayer trust boundary: a NaN/negative distance would
      // poison the < comparison (mask a closer hit) and the sort (arbitrary order).
      if (!Number.isFinite(distance) || distance < 0) continue;
      const prev = best.get(id);
      if (!prev || distance < prev.distance) best.set(id, { distance, reason: c.prompt });
    }
  };
  consider(personal, personalTransform);
  consider(global, globalTransform);

  // No matches → default grid unchanged (F2 fail-soft path).
  if (best.size === 0) return { ordered: forkable, matches: new Map() };

  const matches = new Map<string, BaseMatch>();
  for (const [id, { distance, reason }] of best) {
    matches.set(id, { distance, strong: distance < strongAt, reason });
  }

  const matchedSorted = [...best.entries()]
    .sort((a, b) => a[1].distance - b[1].distance)
    .map(([id]) => forkableById.get(id)!);
  const matchedIds = new Set(best.keys());
  const rest = forkable.filter((m) => !matchedIds.has(m.objectId));

  return { ordered: [...matchedSorted, ...rest], matches };
}
