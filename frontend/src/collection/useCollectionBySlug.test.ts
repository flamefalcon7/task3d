import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCollectionBySlug } from './useCollectionBySlug';

function stubEnv(packageId: string | undefined): void {
  if (packageId === undefined) {
    vi.unstubAllEnvs();
  } else {
    vi.stubEnv('VITE_MODEL3D_PACKAGE_ID', packageId);
  }
}

function graphqlResponse(nodes: unknown[]): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: { objects: { nodes } } }),
  } as unknown as Response;
}

function makeNode(
  overrides: Partial<{ address: string; json: Record<string, unknown> }> = {},
) {
  return {
    address: overrides.address ?? '0xabc',
    asMoveObject: {
      contents: {
        json: {
          blob: { blob_id: 'blob-1' },
          lineage_blob_id: 'lin-1',
          creator: '0xfeed',
          shape_type: 'box',
          params_json: '{"shape":"box"}',
          name: 'My Box',
          direct_access_price: '100000000',
          tags: [],
          created_at_ms: '1700000000000',
          collection_id: '0xcoll-1',
          patch_id: 'patch-1',
          ...overrides.json,
        },
      },
    },
  };
}

beforeEach(() => {
  stubEnv('0x123');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('useCollectionBySlug', () => {
  it('returns variants matching the collectionId (slug)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      graphqlResponse([
        makeNode({ address: '0xa', json: { collection_id: '0xtarget', patch_id: 'p1' } }),
        makeNode({ address: '0xb', json: { collection_id: '0xtarget', patch_id: 'p2' } }),
        makeNode({ address: '0xc', json: { collection_id: '0xother', patch_id: 'p3' } }),
      ]),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useCollectionBySlug('0xtarget'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.variants).toHaveLength(2);
    expect(result.current.variants.map((v) => v.objectId).sort()).toEqual(['0xa', '0xb']);
  });

  it('returns an empty array when no variants match', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        graphqlResponse([
          makeNode({ address: '0xa', json: { collection_id: '0xother' } }),
        ]),
      ),
    );

    const { result } = renderHook(() => useCollectionBySlug('0xnotfound'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.variants).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('returns empty (no fetch) when slug is empty', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useCollectionBySlug(''));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.variants).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns empty (no fetch) when package id is "0x0"', async () => {
    stubEnv('0x0');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useCollectionBySlug('0xany'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.variants).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces fetch errors via error state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503 } as Response),
    );
    const { result } = renderHook(() => useCollectionBySlug('0xtarget'));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error?.message).toMatch(/503/);
  });
});
