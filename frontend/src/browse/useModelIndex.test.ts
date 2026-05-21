import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useModelIndex } from './useModelIndex';

function stubEnv(packageId: string | undefined): void {
  // why: vi.stubEnv mutates the shared import.meta.env that Vitest exposes to
  // every module — assigning to the test file's import.meta.env directly only
  // mutates the local module's view, so the hook (a different module) still
  // sees the original value.
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
  stubEnv('0x123');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
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

    const raw = globalThis.localStorage?.getItem('overflow2026:model-index:v1');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.models).toHaveLength(1);
    expect(parsed.models[0].objectId).toBe('0xabc');
  });
});
