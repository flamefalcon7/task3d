// Browse semantic-search ranking (plan 2026-06-08-002 U1).
//
// /browse renders one card per COLLECTION (groupByCollection), but the recall
// join + dedupe/NaN-guard/strong-flag logic in rankForkableMatches works per
// Model3D objectId. This util reuses that logic over the flattened model set,
// then collapses the per-objectId matches up to per-collection cards: a card's
// match is its closest-matching variant, and matched cards promote to the front
// while every collection key — including the synthetic `_orphan:<objectId>`
// keys groupByCollection emits — is preserved verbatim (R9 no-hide).
//
// The browse candidate set is the FULL model set (orphan / encrypted /
// empty-glbBlobId included) — unlike /launch's `forkable` filter — because the
// catalog wants every model rankable and rankForkableMatches harmlessly drops
// any chip whose modelId isn't in the set.
import type { Model3DSummary, RecallChip } from '@overflow2026/shared';
import {
  rankForkableMatches,
  type BaseMatch,
  type RankOptions,
} from '../collection/baseSearchRanking';

export type { BaseMatch };

export interface RankedCollections {
  /** Every collection key, matched groups first (ascending by closest-variant
   *  distance) then unmatched groups in original insertion order. Never omits a
   *  key, so the grid can use it as its single source of order. */
  orderedKeys: string[];
  /** Per-card match metadata keyed by collection key. Empty when no query match. */
  cardMatches: Map<string, BaseMatch>;
}

export function rankCollectionMatches(
  personal: RecallChip[],
  global: RecallChip[],
  groups: Map<string, Model3DSummary[]>,
  opts: RankOptions = {},
): RankedCollections {
  const keys = [...groups.keys()];

  // Reuse the battle-tested per-objectId merge: join, drop null/non-candidate
  // modelIds, NaN/negative guard, dedupe-by-min, strong flag. We only consume
  // its `matches` map — `ordered` is a flat model list, not collection-grouped.
  const flat = keys.flatMap((k) => groups.get(k)!);
  const { matches } = rankForkableMatches(personal, global, flat, opts);

  if (matches.size === 0) {
    // No query match → default grid order, no highlights (fail-soft path).
    return { orderedKeys: keys, cardMatches: new Map() };
  }

  // Collapse per-objectId matches to per-collection: a group's match is its
  // closest-matching variant (min distance). `strong`/`reason` ride along from
  // that variant's BaseMatch.
  const cardMatches = new Map<string, BaseMatch>();
  const bestDistance = new Map<string, number>();
  for (const key of keys) {
    let best: BaseMatch | undefined;
    for (const m of groups.get(key)!) {
      const match = matches.get(m.objectId);
      if (match && (!best || match.distance < best.distance)) best = match;
    }
    if (best) {
      cardMatches.set(key, best);
      bestDistance.set(key, best.distance);
    }
  }

  const matchedKeys = keys
    .filter((k) => cardMatches.has(k))
    .sort((a, b) => bestDistance.get(a)! - bestDistance.get(b)!);
  const restKeys = keys.filter((k) => !cardMatches.has(k));

  return { orderedKeys: [...matchedKeys, ...restKeys], cardMatches };
}
