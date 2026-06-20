// list_fork_collections tests (plan-2026-06-19-001 U1, R1-R5) — transport-level
// via buildMcpRoute (testUtils callTool).
//
// Contract under test: reverse-lookup forks of a modelId via an injected GraphQL
// transport, mapped + filtered by base_model_id, name-resolved via the fullnode
// client, left-joined with the integration indexer for integrationCount, ordered
// count-desc → id. Auth is fail-HARD; the GraphQL read is fail-SOFT (degraded).
import { describe, it, expect, beforeEach } from 'vitest';
import type { McpSuiClient } from '../server.js';
import { resetMcpRateLimitForTest } from '../auth.js';
import { callTool, errorText, stubJwt } from './testUtils.js';

const PKG = `0x${'9'.repeat(64)}`;
const MODEL_ID = `0x${'7'.repeat(64)}`;
const OTHER_MODEL = `0x${'8'.repeat(64)}`;
const CREATOR = `0x${'c'.repeat(64)}`;
const COL_A = `0x${'a'.repeat(64)}`;
const COL_B = `0x${'b'.repeat(64)}`;
const COL_C = `0x${'d'.repeat(64)}`;
const GQL = 'https://graphql.testnet.sui.io/graphql';

// JSON-RPC moveObject fields the fullnode returns for the base Model3D (the
// get_model.test fixture, trimmed to what jsonToSummary reads for `name`).
const MODEL_FIELDS: Record<string, unknown> = {
  id: { id: MODEL_ID },
  collection_id: `0x${'e'.repeat(64)}`,
  patch_id: 'patch-01',
  creator: CREATOR,
  shape_type: 'tripo',
  params_json: '{"shape":"tripo"}',
  name: 'Pickup Truck',
  direct_access_price: '5000000',
  tags: [],
  part_labels: [],
  created_at_ms: '1765432100000',
  lineage_blob_id: 'lineageA',
  glb_blob_id: 'glbB',
  license: {
    type: `${PKG}::model3d::LicenseTerms`,
    fields: { derivative_mint_fee: '7000000', access_fee: '2000000', derivative_royalty_bps: 500, policy: 2 },
  },
  is_encrypted: false,
  preview_blob_ids: [],
};

/** Fullnode getObject fake returning the base Model3D (or a rejection). */
function fakeSui(opts: { rejects?: boolean; name?: string } = {}): McpSuiClient {
  return {
    async getObject() {
      if (opts.rejects) throw new Error('fullnode down');
      const fields = opts.name !== undefined ? { ...MODEL_FIELDS, name: opts.name } : MODEL_FIELDS;
      return { data: { content: { dataType: 'moveObject', type: `${PKG}::model3d::Model3D`, fields } } };
    },
  };
}

interface GqlCall {
  endpoint: string;
  variables: Record<string, unknown>;
}

/** GraphQL transport fake. Records calls; returns the given collection nodes. */
function fakeGraphql(
  nodes: unknown[],
  opts: { throws?: boolean } = {},
): { query: NonNullable<Parameters<typeof callTool>[0]['graphqlQuery']>; calls: GqlCall[] } {
  const calls: GqlCall[] = [];
  return {
    calls,
    query: async (endpoint, _q, variables) => {
      calls.push({ endpoint, variables });
      if (opts.throws) throw new Error('graphql 503');
      return { data: { objects: { nodes } } };
    },
  };
}

function node(address: string, baseModelId: string, over: Record<string, unknown> = {}): unknown {
  return {
    address,
    asMoveObject: {
      contents: {
        json: {
          base_model_id: baseModelId,
          nft_creator: CREATOR,
          base_royalty_bps: 250,
          register_fee: '1000000',
          integration_policy: 2,
          ...over,
        },
      },
    },
  };
}

function fakeIndexer(entries: Array<{ collectionId: string; count: number }>) {
  return { getLeaderboard: () => entries.map((e) => ({ ...e, latestRegisteredAtMs: 0 })) };
}

beforeEach(() => {
  resetMcpRateLimitForTest();
});

describe('list_fork_collections — auth (public discovery, D-111)', () => {
  it('no bearer → anonymous discovery succeeds, GraphQL IS queried', async () => {
    const gql = fakeGraphql([node(COL_A, MODEL_ID)]);
    const result = await callTool(
      { jwt: stubJwt, suiClient: fakeSui(), packageId: PKG, graphqlEndpoint: GQL, graphqlQuery: gql.query },
      'list_fork_collections',
      { modelId: MODEL_ID },
      null,
    );
    expect(result.isError).toBeFalsy();
    expect(gql.calls).toHaveLength(1);
    expect((result.structuredContent as { collections: unknown[] }).collections).toHaveLength(1);
  });
});

describe('list_fork_collections — reverse lookup + mapping (R2/R3)', () => {
  it('returns only the forks whose base_model_id matches, with mapped fields + base name', async () => {
    const gql = fakeGraphql([
      node(COL_A, MODEL_ID),
      node(COL_B, OTHER_MODEL), // different base — excluded
      node(COL_C, MODEL_ID, { base_royalty_bps: 999, register_fee: '42' }),
    ]);
    const result = await callTool(
      { jwt: stubJwt, suiClient: fakeSui(), packageId: PKG, graphqlEndpoint: GQL, graphqlQuery: gql.query },
      'list_fork_collections',
      { modelId: MODEL_ID },
    );
    expect(result.isError).toBeFalsy();
    const { collections } = result.structuredContent as {
      collections: Array<Record<string, unknown>>;
    };
    expect(collections.map((c) => c.collectionId)).toEqual([COL_A, COL_C]); // COL_B excluded; tie → id asc
    expect(collections[0]).toEqual({
      collectionId: COL_A,
      detailUrl: `https://tusk3d.store/collection/${COL_A}`,
      baseModelId: MODEL_ID,
      baseModelName: 'Pickup Truck',
      nftCreator: CREATOR,
      baseRoyaltyBps: 250,
      registerFee: '1000000',
      integrationPolicy: 2,
      integrationCount: 0,
    });
    expect(collections[1]!.baseRoyaltyBps).toBe(999);
    // text content mirrors structuredContent
    expect(JSON.parse(errorText(result))).toEqual(result.structuredContent);
    // the type tag carries the resolved packageId
    expect(gql.calls[0]!.variables.type).toBe(`${PKG}::model3d::NftCollection`);
  });

  it('drops malformed nodes (null json / missing address)', async () => {
    const gql = fakeGraphql([
      node(COL_A, MODEL_ID),
      { address: COL_B, asMoveObject: { contents: { json: null } } },
      { asMoveObject: { contents: { json: { base_model_id: MODEL_ID } } } }, // no address
    ]);
    const result = await callTool(
      { jwt: stubJwt, suiClient: fakeSui(), packageId: PKG, graphqlEndpoint: GQL, graphqlQuery: gql.query },
      'list_fork_collections',
      { modelId: MODEL_ID },
    );
    const { collections } = result.structuredContent as { collections: unknown[] };
    expect(collections).toHaveLength(1);
  });
});

describe('list_fork_collections — integrationCount enrichment + ordering (R4/KTD2/KTD4)', () => {
  it('left-joins counts and orders count-desc', async () => {
    const gql = fakeGraphql([node(COL_A, MODEL_ID), node(COL_B, MODEL_ID)]);
    const result = await callTool(
      {
        jwt: stubJwt,
        suiClient: fakeSui(),
        packageId: PKG,
        graphqlEndpoint: GQL,
        graphqlQuery: gql.query,
        integrationIndexer: fakeIndexer([{ collectionId: COL_B, count: 5 }]),
      },
      'list_fork_collections',
      { modelId: MODEL_ID },
    );
    const { collections } = result.structuredContent as {
      collections: Array<{ collectionId: string; integrationCount: number }>;
    };
    expect(collections.map((c) => [c.collectionId, c.integrationCount])).toEqual([
      [COL_B, 5], // higher count leads
      [COL_A, 0], // left-joined zero
    ]);
  });

  it('indexer dep absent → all counts default to 0, no throw', async () => {
    const gql = fakeGraphql([node(COL_A, MODEL_ID), node(COL_B, MODEL_ID)]);
    const result = await callTool(
      { jwt: stubJwt, suiClient: fakeSui(), packageId: PKG, graphqlEndpoint: GQL, graphqlQuery: gql.query },
      'list_fork_collections',
      { modelId: MODEL_ID },
    );
    const { collections } = result.structuredContent as {
      collections: Array<{ collectionId: string; integrationCount: number }>;
    };
    // equal counts → deterministic collectionId-lexical tiebreak (KTD4)
    expect(collections.map((c) => c.collectionId)).toEqual([COL_A, COL_B]);
    expect(collections.every((c) => c.integrationCount === 0)).toBe(true);
  });
});

describe('list_fork_collections — fail-soft (R5/KTD3)', () => {
  it('GraphQL transport throws → { collections: [], degraded: true }, never isError', async () => {
    const gql = fakeGraphql([], { throws: true });
    const result = await callTool(
      { jwt: stubJwt, suiClient: fakeSui(), packageId: PKG, graphqlEndpoint: GQL, graphqlQuery: gql.query },
      'list_fork_collections',
      { modelId: MODEL_ID },
    );
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ collections: [], degraded: true });
  });

  it('zero matching collections → empty list, NO degraded flag', async () => {
    const gql = fakeGraphql([node(COL_A, OTHER_MODEL)]);
    const result = await callTool(
      { jwt: stubJwt, suiClient: fakeSui(), packageId: PKG, graphqlEndpoint: GQL, graphqlQuery: gql.query },
      'list_fork_collections',
      { modelId: MODEL_ID },
    );
    expect(result.structuredContent).toEqual({ collections: [] });
  });

  it('base model read fails but forks exist → baseModelName falls back to ""', async () => {
    const gql = fakeGraphql([node(COL_A, MODEL_ID)]);
    const result = await callTool(
      { jwt: stubJwt, suiClient: fakeSui({ rejects: true }), packageId: PKG, graphqlEndpoint: GQL, graphqlQuery: gql.query },
      'list_fork_collections',
      { modelId: MODEL_ID },
    );
    const { collections } = result.structuredContent as { collections: Array<{ baseModelName: string }> };
    expect(collections).toHaveLength(1);
    expect(collections[0]!.baseModelName).toBe('');
  });
});

describe('list_fork_collections — security guards (SEC)', () => {
  it('non-id-shaped packageId → upstream_error, no GraphQL request', async () => {
    const gql = fakeGraphql([node(COL_A, MODEL_ID)]);
    const result = await callTool(
      { jwt: stubJwt, suiClient: fakeSui(), packageId: '0xabc", "x": "y', graphqlEndpoint: GQL, graphqlQuery: gql.query },
      'list_fork_collections',
      { modelId: MODEL_ID },
    );
    expect(result.isError).toBe(true);
    expect(gql.calls).toHaveLength(0);
  });

  it('GraphQL endpoint host not on the .sui.io allowlist → degraded, no fetch', async () => {
    const gql = fakeGraphql([node(COL_A, MODEL_ID)]);
    const result = await callTool(
      {
        jwt: stubJwt,
        suiClient: fakeSui(),
        packageId: PKG,
        graphqlEndpoint: 'https://169.254.169.254/graphql',
        graphqlQuery: gql.query,
      },
      'list_fork_collections',
      { modelId: MODEL_ID },
    );
    expect(result.structuredContent).toEqual({ collections: [], degraded: true });
    expect(gql.calls).toHaveLength(0);
  });

  it('caps an over-long base model name at 200 chars', async () => {
    const gql = fakeGraphql([node(COL_A, MODEL_ID)]);
    const result = await callTool(
      {
        jwt: stubJwt,
        suiClient: fakeSui({ name: 'x'.repeat(500) }),
        packageId: PKG,
        graphqlEndpoint: GQL,
        graphqlQuery: gql.query,
      },
      'list_fork_collections',
      { modelId: MODEL_ID },
    );
    const { collections } = result.structuredContent as { collections: Array<{ baseModelName: string }> };
    expect(collections[0]!.baseModelName).toHaveLength(200);
  });

  it('an INVALID bearer (not just absent) → isError, no GraphQL request', async () => {
    const gql = fakeGraphql([node(COL_A, MODEL_ID)]);
    const result = await callTool(
      { jwt: stubJwt, suiClient: fakeSui(), packageId: PKG, graphqlEndpoint: GQL, graphqlQuery: gql.query },
      'list_fork_collections',
      { modelId: MODEL_ID },
      'garbage-token',
    );
    expect(result.isError).toBe(true);
    expect(gql.calls).toHaveLength(0);
  });

  it('a malformed (unparseable) graphqlEndpoint URL → degraded, no fetch', async () => {
    const gql = fakeGraphql([node(COL_A, MODEL_ID)]);
    const result = await callTool(
      { jwt: stubJwt, suiClient: fakeSui(), packageId: PKG, graphqlEndpoint: 'not a url at all', graphqlQuery: gql.query },
      'list_fork_collections',
      { modelId: MODEL_ID },
    );
    expect(result.structuredContent).toEqual({ collections: [], degraded: true });
    expect(gql.calls).toHaveLength(0);
  });
});

describe('list_fork_collections — robustness against malformed/duplicate upstream data', () => {
  it('a resolved-but-malformed envelope (non-array nodes) → degraded, never isError (ADV-1)', async () => {
    const result = await callTool(
      {
        jwt: stubJwt,
        suiClient: fakeSui(),
        packageId: PKG,
        graphqlEndpoint: GQL,
        // transport resolves, but objects.nodes is an object, not an array
        graphqlQuery: async () => ({ data: { objects: { nodes: { bogus: true } } } }),
      },
      'list_fork_collections',
      { modelId: MODEL_ID },
    );
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ collections: [], degraded: true });
  });

  it('deduplicates repeated collectionId nodes to a single row (ADV-2)', async () => {
    const gql = fakeGraphql([node(COL_A, MODEL_ID), node(COL_A, MODEL_ID), node(COL_B, MODEL_ID)]);
    const result = await callTool(
      { jwt: stubJwt, suiClient: fakeSui(), packageId: PKG, graphqlEndpoint: GQL, graphqlQuery: gql.query },
      'list_fork_collections',
      { modelId: MODEL_ID },
    );
    const { collections } = result.structuredContent as { collections: Array<{ collectionId: string }> };
    expect(collections.map((c) => c.collectionId)).toEqual([COL_A, COL_B]);
  });

  it('drops nodes with null asMoveObject / null contents (optional-chain guard)', async () => {
    const gql = fakeGraphql([
      node(COL_A, MODEL_ID),
      { address: COL_B, asMoveObject: null },
      { address: COL_C, asMoveObject: { contents: null } },
    ]);
    const result = await callTool(
      { jwt: stubJwt, suiClient: fakeSui(), packageId: PKG, graphqlEndpoint: GQL, graphqlQuery: gql.query },
      'list_fork_collections',
      { modelId: MODEL_ID },
    );
    const { collections } = result.structuredContent as { collections: unknown[] };
    expect(collections).toHaveLength(1);
  });

  it('matches a SHORT-FORM modelId against a canonical base_model_id (CORR-1)', async () => {
    const SHORT = '0x7';
    const CANON_7 = `0x${'0'.repeat(63)}7`; // normalizeSuiAddress('0x7')
    const gql = fakeGraphql([node(COL_A, CANON_7)]);
    const result = await callTool(
      { jwt: stubJwt, suiClient: fakeSui(), packageId: PKG, graphqlEndpoint: GQL, graphqlQuery: gql.query },
      'list_fork_collections',
      { modelId: SHORT },
    );
    const { collections } = result.structuredContent as { collections: Array<{ collectionId: string }> };
    expect(collections.map((c) => c.collectionId)).toEqual([COL_A]);
  });

  it('builds detailUrl from an injected webOrigin (DI knob, trailing slash trimmed)', async () => {
    const gql = fakeGraphql([node(COL_A, MODEL_ID)]);
    const result = await callTool(
      {
        jwt: stubJwt,
        suiClient: fakeSui(),
        packageId: PKG,
        graphqlEndpoint: GQL,
        graphqlQuery: gql.query,
        webOrigin: 'https://staging.example/',
      },
      'list_fork_collections',
      { modelId: MODEL_ID },
    );
    const { collections } = result.structuredContent as { collections: Array<{ detailUrl: string }> };
    expect(collections[0]!.detailUrl).toBe(`https://staging.example/collection/${COL_A}`);
  });

  it('a non-numeric register_fee is normalized to "0" (not passed through)', async () => {
    const gql = fakeGraphql([node(COL_A, MODEL_ID, { register_fee: 'not-a-number' })]);
    const result = await callTool(
      { jwt: stubJwt, suiClient: fakeSui(), packageId: PKG, graphqlEndpoint: GQL, graphqlQuery: gql.query },
      'list_fork_collections',
      { modelId: MODEL_ID },
    );
    const { collections } = result.structuredContent as { collections: Array<{ registerFee: string }> };
    expect(collections[0]!.registerFee).toBe('0');
  });
});
