import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useModelIndex } from './useModelIndex';

function graphqlResponse(nodes: unknown[]): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: { objects: { nodes } } }),
  } as unknown as Response;
}

function makeNode(overrides: Partial<{ address: string; json: Record<string, unknown> }> = {}) {
  return {
    address: overrides.address ?? '0xabc',
    asMoveObject: {
      contents: {
        json: {
          blob: { blob_id: 'blob-1' },
          lineage_blob_id: 'lineage-1',
          creator: '0xfeed',
          shape_type: 'box',
          params_json: '{"shape":"box"}',
          name: 'My Box',
          direct_access_price: '100000000',
          tags: ['weapon', 'metal'],
          created_at_ms: '1700000000000',
          ...overrides.json,
        },
      },
    },
  };
}

beforeEach(() => {
  globalThis.localStorage?.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  globalThis.localStorage?.clear();
});

describe('useModelIndex', () => {
  it('maps GraphQL nodes into Model3DSummary on happy path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(graphqlResponse([
      makeNode({ address: '0xa' }),
      makeNode({ address: '0xb', json: { tags: ['armor'] } }),
    ]));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useModelIndex());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.models).toHaveLength(2);
    expect(result.current.models[0]).toMatchObject({
      objectId: '0xa',
      blobId: 'blob-1',
      creator: '0xfeed',
      shapeType: 'box',
      directAccessPrice: '100000000',
      tags: ['weapon', 'metal'],
      lineageBlobId: 'lineage-1',
    });
  });


  it('returns empty array when GraphQL returns zero nodes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(graphqlResponse([])));
    const { result } = renderHook(() => useModelIndex());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.models).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('surfaces fetch errors via error state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502 } as Response));
    const { result } = renderHook(() => useModelIndex());
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error?.message).toMatch(/502/);
  });

  it('filters by tag when tagFilter is supplied', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(graphqlResponse([
      makeNode({ address: '0xa', json: { tags: ['weapon'] } }),
      makeNode({ address: '0xb', json: { tags: ['armor'] } }),
      makeNode({ address: '0xc', json: { tags: ['weapon', 'metal'] } }),
    ])));

    const { result } = renderHook(() => useModelIndex({ tagFilter: 'weapon' }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.models.map((m) => m.objectId)).toEqual(['0xa', '0xc']);
  });

  it('maps policy / is_encrypted / preview_blob_ids; defaults to public for legacy objects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(graphqlResponse([
      // ALLOW_LIST encrypted base with previews.
      makeNode({
        address: '0xenc',
        json: {
          license: { policy: 1, derivative_mint_fee: '250000000', derivative_royalty_bps: 500 },
          is_encrypted: true,
          preview_blob_ids: ['p1', 'p2'],
        },
      }),
      // Legacy node with no policy/seal fields → PERMISSIONLESS / public.
      makeNode({ address: '0xlegacy' }),
    ])));
    const { result } = renderHook(() => useModelIndex());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const enc = result.current.models.find((m) => m.objectId === '0xenc')!;
    expect(enc).toMatchObject({ policy: 1, isEncrypted: true, previewBlobIds: ['p1', 'p2'] });
    const legacy = result.current.models.find((m) => m.objectId === '0xlegacy')!;
    expect(legacy).toMatchObject({ policy: 2, isEncrypted: false, previewBlobIds: [] });
  });

  it('maps license.access_fee → accessFee (string mist); defaults to "0" when absent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(graphqlResponse([
      // plan-027 D-078 — ALLOW_LIST base carrying an access_fee.
      makeNode({
        address: '0xpaid',
        json: {
          license: { policy: 1, derivative_mint_fee: '0', access_fee: '3000000' },
          is_encrypted: true,
        },
      }),
      // Legacy node with no license → accessFee defaults to '0'.
      makeNode({ address: '0xlegacy' }),
    ])));
    const { result } = renderHook(() => useModelIndex());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const paid = result.current.models.find((m) => m.objectId === '0xpaid')!;
    expect(paid.accessFee).toBe('3000000');
    const legacy = result.current.models.find((m) => m.objectId === '0xlegacy')!;
    expect(legacy.accessFee).toBe('0');
  });

  it('excludes RESTRICTED (policy 0) bases from the catalog entirely (private)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(graphqlResponse([
      makeNode({ address: '0xpublic', json: { license: { policy: 2 } } }),
      makeNode({ address: '0xallow', json: { license: { policy: 1 }, is_encrypted: true } }),
      makeNode({ address: '0xrestricted', json: { license: { policy: 0 }, is_encrypted: true } }),
    ])));
    const { result } = renderHook(() => useModelIndex());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const ids = result.current.models.map((m) => m.objectId);
    expect(ids).toContain('0xpublic');
    expect(ids).toContain('0xallow');
    // RESTRICTED is off-catalog — it appears neither in browse nor the fork picker.
    expect(ids).not.toContain('0xrestricted');
  });

  it('refetch re-issues the GraphQL request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(graphqlResponse([makeNode()]));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useModelIndex());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.refetch();
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('caches last-good response to localStorage', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(graphqlResponse([makeNode()])));
    const { result } = renderHook(() => useModelIndex());
    await waitFor(() => expect(result.current.models).toHaveLength(1));

    // plan-013 — cache key includes a slice of the live package id so a
    // republish auto-invalidates stale objectIds. Mirror the production key
    // shape verbatim instead of hardcoding the v8 prefix.
    const { TESTNET } = await import('../sui/networkConfig');
    const expectedKey = `overflow2026:model-index:${TESTNET.model3dPackageId.slice(0, 10)}:v2`;
    const raw = globalThis.localStorage?.getItem(expectedKey);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.models).toHaveLength(1);
    expect(parsed.models[0].objectId).toBe('0xabc');
  });
});
