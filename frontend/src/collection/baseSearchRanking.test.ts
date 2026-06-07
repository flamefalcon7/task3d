import { describe, expect, it } from 'vitest';
import type { Model3DSummary, RecallChip } from '@overflow2026/shared';
import { rankForkableMatches, STRONG_MATCH_DISTANCE } from './baseSearchRanking';

// rankForkableMatches only reads `.objectId` — a partial cast is sufficient.
function base(objectId: string): Model3DSummary {
  return { objectId } as Model3DSummary;
}
function hit(modelId: string | null, distance: number, prompt = 'a prompt', creator?: string): RecallChip {
  return { modelId, distance, prompt, ...(creator ? { creator } : {}) };
}

const A = base('0xa');
const B = base('0xb');
const C = base('0xc');
const FORKABLE = [A, B, C];
const ids = (ms: Model3DSummary[]) => ms.map((m) => m.objectId);

describe('rankForkableMatches', () => {
  it('AE1: merges personal + global hits for distinct bases, ranked ascending', () => {
    // personal hits B (own base), global hits A (community); A closer than B.
    const { ordered, matches } = rankForkableMatches(
      [hit('0xb', 0.5)],
      [hit('0xa', 0.3, 'race car', '0xcreator')],
      FORKABLE,
    );
    expect(ids(ordered)).toEqual(['0xa', '0xb', '0xc']); // A, B matched-first (A closer); C trails
    expect(matches.has('0xa')).toBe(true);
    expect(matches.has('0xb')).toBe(true);
    expect(matches.has('0xc')).toBe(false);
  });

  it('de-dupes the same modelId across scopes, keeping the min distance + its reason', () => {
    const { ordered, matches } = rankForkableMatches(
      [hit('0xa', 0.6, 'personal prompt')],
      [hit('0xa', 0.2, 'global prompt', '0xc')],
      FORKABLE,
    );
    // A appears once, promoted to front via the closer (0.2) global hit.
    expect(ids(ordered)).toEqual(['0xa', '0xb', '0xc']);
    expect(matches.get('0xa')!.distance).toBe(0.2);
    expect(matches.get('0xa')!.reason).toBe('global prompt');
  });

  it('R7: drops hits not in the forkable set; all forkable bases still present', () => {
    const { ordered, matches } = rankForkableMatches(
      [],
      [hit('0xZZZ', 0.1)], // not forkable
      FORKABLE,
    );
    expect(ids(ordered)).toEqual(['0xa', '0xb', '0xc']); // unchanged default order
    expect(matches.size).toBe(0);
  });

  it('drops a null modelId and never uses it as a key', () => {
    const { ordered, matches } = rankForkableMatches(
      [hit(null, 0.1, 'trailer-less personal record')],
      [],
      FORKABLE,
    );
    expect(ids(ordered)).toEqual(['0xa', '0xb', '0xc']);
    expect(matches.size).toBe(0);
    expect(matches.has('null' as unknown as string)).toBe(false);
  });

  it('R5: a single match is promoted but no forkable base is removed', () => {
    const { ordered } = rankForkableMatches([], [hit('0xc', 0.3)], FORKABLE);
    expect(ids(ordered)).toEqual(['0xc', '0xa', '0xb']); // C first, rest in original order
    expect(ordered).toHaveLength(3);
  });

  it('flags strong vs weak matches at the threshold', () => {
    const { matches } = rankForkableMatches([hit('0xa', 0.4)], [hit('0xb', 0.6)], FORKABLE);
    expect(matches.get('0xa')!.strong).toBe(true); // 0.40 < 0.45
    expect(matches.get('0xb')!.strong).toBe(false); // 0.60 ≥ 0.45
    expect(STRONG_MATCH_DISTANCE).toBe(0.45);
  });

  it('AE3/F2: empty personal + global → default grid order, no matches', () => {
    const { ordered, matches } = rankForkableMatches([], [], FORKABLE);
    expect(ordered).toBe(FORKABLE); // same reference, unchanged
    expect(matches.size).toBe(0);
  });

  it('AE4/R8: a forkable base with no recall hit is never promoted but remains', () => {
    const { ordered, matches } = rankForkableMatches([hit('0xa', 0.3)], [], FORKABLE);
    expect(matches.has('0xb')).toBe(false);
    expect(ids(ordered)).toContain('0xb'); // still selectable
  });

  it('a creator-absent personal hit still yields a valid reason', () => {
    const { matches } = rankForkableMatches([hit('0xa', 0.3, 'my own base')], [], FORKABLE);
    expect(matches.get('0xa')!.reason).toBe('my own base');
  });

  it('applies per-scope distance transforms', () => {
    // Inflate global distances so a nominally-closer global hit ranks behind personal.
    const { ordered } = rankForkableMatches(
      [hit('0xa', 0.5)],
      [hit('0xb', 0.4)],
      FORKABLE,
      { globalTransform: (d) => d + 0.3 }, // 0.4 → 0.7, now behind A's 0.5
    );
    expect(ids(ordered)).toEqual(['0xa', '0xb', '0xc']);
  });
});
