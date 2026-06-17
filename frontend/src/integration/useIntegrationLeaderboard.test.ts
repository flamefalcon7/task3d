import { describe, it, expect } from 'vitest';
import type { Model3DSummary } from '@overflow2026/shared';
import { buildLeaderboardRows } from './useIntegrationLeaderboard';
import { POLICY_PERMISSIONLESS, type NftCollectionSummary } from './useCollections';

const cid = (ch: string) => '0x' + ch.repeat(64);

function coll(
  id: string,
  opts: Partial<NftCollectionSummary> = {},
): NftCollectionSummary {
  return {
    collectionId: id,
    baseModelId: opts.baseModelId ?? cid('0'),
    baseCreator: '0x0',
    nftCreator: '0x0',
    baseRoyaltyBps: 0,
    integrationPolicy: opts.integrationPolicy ?? POLICY_PERMISSIONLESS,
    registerFee: opts.registerFee ?? '1000000000',
  };
}

const model = (objectId: string, name: string, createdAtMs = '0') =>
  ({ objectId, name, createdAtMs }) as Model3DSummary;

describe('buildLeaderboardRows', () => {
  it('includes zero-count collections (left-join) and ranks by count desc', () => {
    const collections = [coll(cid('a')), coll(cid('b')), coll(cid('c'))];
    const counts = new Map([
      [cid('a'), { count: 1, latestRegisteredAtMs: 100 }],
      [cid('b'), { count: 3, latestRegisteredAtMs: 100 }],
      // c absent → count 0
    ]);
    const rows = buildLeaderboardRows(collections, [], counts);
    expect(rows.map((r) => r.collectionId)).toEqual([cid('b'), cid('a'), cid('c')]);
    expect(rows.find((r) => r.collectionId === cid('c'))?.count).toBe(0);
  });

  it('breaks count ties by most-recent integration timestamp desc', () => {
    const collections = [coll(cid('a')), coll(cid('b'))];
    const counts = new Map([
      [cid('a'), { count: 2, latestRegisteredAtMs: 1000 }],
      [cid('b'), { count: 2, latestRegisteredAtMs: 9000 }],
    ]);
    const rows = buildLeaderboardRows(collections, [], counts);
    expect(rows.map((r) => r.collectionId)).toEqual([cid('b'), cid('a')]);
  });

  it('orders equal-count (incl. all-zero) collections newest-first by base model publish time', () => {
    const collections = [
      coll(cid('a'), { baseModelId: cid('1') }),
      coll(cid('b'), { baseModelId: cid('2') }),
    ];
    const models = [model(cid('1'), 'Older', '1000'), model(cid('2'), 'Newer', '5000')];
    const rows = buildLeaderboardRows(collections, models, new Map());
    // both count 0 → newer base model (b) ranks first
    expect(rows.map((r) => r.collectionId)).toEqual([cid('b'), cid('a')]);
  });

  it('count still outranks publish time', () => {
    const collections = [
      coll(cid('a'), { baseModelId: cid('1') }), // newer but no integrations
      coll(cid('b'), { baseModelId: cid('2') }), // older but has an integration
    ];
    const models = [model(cid('1'), 'Newer', '9000'), model(cid('2'), 'Older', '1000')];
    const counts = new Map([[cid('b'), { count: 1, latestRegisteredAtMs: 100 }]]);
    const rows = buildLeaderboardRows(collections, models, counts);
    expect(rows.map((r) => r.collectionId)).toEqual([cid('b'), cid('a')]);
  });

  it('excludes non-permissionless collections', () => {
    const collections = [
      coll(cid('a'), { integrationPolicy: 0 }),
      coll(cid('b'), { integrationPolicy: POLICY_PERMISSIONLESS }),
    ];
    const rows = buildLeaderboardRows(collections, [], new Map());
    expect(rows.map((r) => r.collectionId)).toEqual([cid('b')]);
  });

  it('joins the base model name, falling back to a truncated id', () => {
    const collections = [coll(cid('a'), { baseModelId: cid('d') })];
    const withName = buildLeaderboardRows(collections, [model(cid('d'), 'Tusk')], new Map());
    expect(withName[0].name).toBe('Tusk');
    const noName = buildLeaderboardRows(collections, [], new Map());
    expect(noName[0].name).toMatch(/^Collection 0x/);
  });
});
