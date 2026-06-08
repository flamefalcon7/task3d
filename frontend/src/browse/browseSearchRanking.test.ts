import { describe, expect, it } from 'vitest';
import type { Model3DSummary, RecallChip } from '@overflow2026/shared';
import { rankCollectionMatches } from './browseSearchRanking';
import { STRONG_MATCH_DISTANCE } from '../collection/baseSearchRanking';

function makeModel(overrides: Partial<Model3DSummary> = {}): Model3DSummary {
  return {
    objectId: '0xaaa',
    blobId: 'blob-1',
    collectionId: '0xcoll-1',
    patchId: '',
    creator: '0x1234567890abcdef',
    shapeType: 'box',
    paramsJson: '{"shape":"box"}',
    name: 'Demo Box',
    directAccessPrice: '100000000',
    tags: [],
    partLabels: [],
    createdAtMs: '1700000000000',
    lineageBlobId: 'lin-1',
    glbBlobId: 'glb-1',
    derivativeMintFee: '0',
    accessFee: '0',
    derivativeRoyaltyBps: 0,
    policy: 2,
    isEncrypted: false,
    previewBlobIds: [],
    ...overrides,
  };
}

function hit(modelId: string | null, distance: number, prompt = 'a prompt'): RecallChip {
  return { modelId, distance, prompt } as RecallChip;
}

// Build a groups map directly (mirrors groupByCollection output: key → variants).
function groups(entries: Array<[string, Model3DSummary[]]>): Map<string, Model3DSummary[]> {
  return new Map(entries);
}

describe('rankCollectionMatches', () => {
  it('promotes a matched collection to the front and records its BaseMatch (happy path)', () => {
    const g = groups([
      ['0xc-a', [makeModel({ objectId: '0xa', collectionId: '0xc-a' })]],
      ['0xc-b', [makeModel({ objectId: '0xb', collectionId: '0xc-b' })]],
    ]);
    const { orderedKeys, cardMatches } = rankCollectionMatches(
      [],
      [hit('0xb', 0.3, 'a fast race car')],
      g,
    );
    expect(orderedKeys).toEqual(['0xc-b', '0xc-a']);
    expect(cardMatches.get('0xc-b')?.reason).toBe('a fast race car');
    expect(cardMatches.has('0xc-a')).toBe(false);
  });

  it('promotes a multi-variant group when only one variant matches (AE4)', () => {
    const g = groups([
      [
        '0xshared',
        [
          makeModel({ objectId: '0xv0', collectionId: '0xshared' }),
          makeModel({ objectId: '0xv1', collectionId: '0xshared' }),
        ],
      ],
      ['0xc-x', [makeModel({ objectId: '0xx', collectionId: '0xc-x' })]],
    ]);
    const { orderedKeys, cardMatches } = rankCollectionMatches(
      [],
      [hit('0xv1', 0.32, 'matched variant prompt')],
      g,
    );
    expect(orderedKeys[0]).toBe('0xshared');
    expect(cardMatches.get('0xshared')?.reason).toBe('matched variant prompt');
    expect(cardMatches.get('0xshared')?.distance).toBeCloseTo(0.32);
  });

  it('uses the closest-matching variant for the card match (min distance wins)', () => {
    const g = groups([
      [
        '0xshared',
        [
          makeModel({ objectId: '0xv0', collectionId: '0xshared' }),
          makeModel({ objectId: '0xv1', collectionId: '0xshared' }),
        ],
      ],
    ]);
    const { cardMatches } = rankCollectionMatches(
      [],
      [hit('0xv0', 0.6, 'far'), hit('0xv1', 0.2, 'near')],
      g,
    );
    expect(cardMatches.get('0xshared')?.distance).toBeCloseTo(0.2);
    expect(cardMatches.get('0xshared')?.reason).toBe('near');
    expect(cardMatches.get('0xshared')?.strong).toBe(true); // 0.2 < 0.45
  });

  it('orders matched groups ascending by their closest-variant distance', () => {
    const g = groups([
      ['0xc-a', [makeModel({ objectId: '0xa', collectionId: '0xc-a' })]],
      ['0xc-b', [makeModel({ objectId: '0xb', collectionId: '0xc-b' })]],
      ['0xc-c', [makeModel({ objectId: '0xc', collectionId: '0xc-c' })]],
    ]);
    const { orderedKeys } = rankCollectionMatches(
      [],
      [hit('0xa', 0.5), hit('0xc', 0.1)],
      g,
    );
    // 0xc-c (0.1) before 0xc-a (0.5), then the unmatched 0xc-b.
    expect(orderedKeys).toEqual(['0xc-c', '0xc-a', '0xc-b']);
  });

  it('dedupes a model matched in both scopes, keeping the min distance', () => {
    const g = groups([['0xc-a', [makeModel({ objectId: '0xa', collectionId: '0xc-a' })]]]);
    const { cardMatches } = rankCollectionMatches(
      [hit('0xa', 0.55, 'personal')],
      [hit('0xa', 0.25, 'global')],
      g,
    );
    expect(cardMatches.get('0xc-a')?.distance).toBeCloseTo(0.25);
    expect(cardMatches.get('0xc-a')?.reason).toBe('global');
  });

  it('never hides an unmatched group (R9 no-hide)', () => {
    const g = groups([
      ['0xc-a', [makeModel({ objectId: '0xa', collectionId: '0xc-a' })]],
      ['0xc-b', [makeModel({ objectId: '0xb', collectionId: '0xc-b' })]],
      ['0xc-c', [makeModel({ objectId: '0xc', collectionId: '0xc-c' })]],
    ]);
    const { orderedKeys } = rankCollectionMatches([], [hit('0xb', 0.3)], g);
    // Matched 0xc-b first; unmatched a, c follow in original insertion order.
    expect(orderedKeys).toEqual(['0xc-b', '0xc-a', '0xc-c']);
    expect(orderedKeys).toHaveLength(3);
  });

  it('returns original key order and empty matches when there is no query match', () => {
    const g = groups([
      ['0xc-a', [makeModel({ objectId: '0xa', collectionId: '0xc-a' })]],
      ['0xc-b', [makeModel({ objectId: '0xb', collectionId: '0xc-b' })]],
    ]);
    const { orderedKeys, cardMatches } = rankCollectionMatches([], [], g);
    expect(orderedKeys).toEqual(['0xc-a', '0xc-b']);
    expect(cardMatches.size).toBe(0);
  });

  it('drops chips with null/empty modelId or a modelId absent from all groups', () => {
    const g = groups([['0xc-a', [makeModel({ objectId: '0xa', collectionId: '0xc-a' })]]]);
    const { orderedKeys, cardMatches } = rankCollectionMatches(
      [],
      [hit(null, 0.1), hit('', 0.1), hit('0xNOTHERE', 0.1)],
      g,
    );
    expect(orderedKeys).toEqual(['0xc-a']);
    expect(cardMatches.size).toBe(0); // nothing valid joined → no phantom key
  });

  it('ignores NaN / negative distances (relayer trust boundary)', () => {
    const g = groups([['0xc-a', [makeModel({ objectId: '0xa', collectionId: '0xc-a' })]]]);
    const { cardMatches } = rankCollectionMatches(
      [],
      [hit('0xa', Number.NaN), hit('0xa', -1)],
      g,
    );
    expect(cardMatches.size).toBe(0);
  });

  it('flags strong at the STRONG_MATCH_DISTANCE boundary consistently', () => {
    const g = groups([
      ['0xstrong', [makeModel({ objectId: '0xs', collectionId: '0xstrong' })]],
      ['0xweak', [makeModel({ objectId: '0xw', collectionId: '0xweak' })]],
    ]);
    const { cardMatches } = rankCollectionMatches(
      [],
      [hit('0xs', STRONG_MATCH_DISTANCE - 0.001), hit('0xw', STRONG_MATCH_DISTANCE + 0.001)],
      g,
    );
    expect(cardMatches.get('0xstrong')?.strong).toBe(true);
    expect(cardMatches.get('0xweak')?.strong).toBe(false);
  });

  it('treats a hit exactly at STRONG_MATCH_DISTANCE as weak (pins the strict < operator)', () => {
    const g = groups([['0xc-a', [makeModel({ objectId: '0xa', collectionId: '0xc-a' })]]]);
    const { cardMatches } = rankCollectionMatches([], [hit('0xa', STRONG_MATCH_DISTANCE)], g);
    expect(cardMatches.get('0xc-a')?.strong).toBe(false);
  });

  it('preserves synthetic _orphan:<objectId> keys verbatim', () => {
    const g = groups([
      ['_orphan:0xo', [makeModel({ objectId: '0xo', collectionId: '' })]],
      ['0xc-a', [makeModel({ objectId: '0xa', collectionId: '0xc-a' })]],
    ]);
    const { orderedKeys, cardMatches } = rankCollectionMatches([], [hit('0xo', 0.2)], g);
    expect(orderedKeys).toContain('_orphan:0xo');
    expect(orderedKeys[0]).toBe('_orphan:0xo'); // matched → front
    expect(cardMatches.get('_orphan:0xo')?.distance).toBeCloseTo(0.2);
  });
});
