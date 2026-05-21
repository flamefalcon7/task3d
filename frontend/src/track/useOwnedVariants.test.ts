import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useOwnedVariants } from './useOwnedVariants';

function stubEnv(packageId: string | undefined): void {
  if (packageId === undefined) vi.unstubAllEnvs();
  else vi.stubEnv('VITE_MODEL3D_PACKAGE_ID', packageId);
}

function graphqlResponse(nodes: unknown[]): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: { objects: { nodes } } }),
  } as unknown as Response;
}

function accessNode(targetId: string) {
  return {
    asMoveObject: {
      contents: {
        json: { target_id: targetId },
      },
    },
  };
}

function modelNode(
  address: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    address,
    asMoveObject: {
      contents: {
        json: {
          blob: { blob_id: 'blob-1' },
          lineage_blob_id: 'lin-1',
          creator: '0xfeed',
          shape_type: 'car',
          params_json: '{"shape":"car"}',
          name: `Car ${address}`,
          direct_access_price: '100000000',
          tags: [],
          created_at_ms: '1700000000000',
          collection_id: '0xcoll',
          patch_id: `patch-${address}`,
          ...overrides,
        },
      },
    },
  };
}

beforeEach(() => {
  stubEnv('0xPKG');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('useOwnedVariants', () => {
  it('returns empty (no fetch) when no wallet connected', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useOwnedVariants(undefined));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.variants).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });


  it('starts in loading=true when a fetch is in flight', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
    const { result } = renderHook(() => useOwnedVariants('0xWALLET'));
    expect(result.current.loading).toBe(true);
    expect(result.current.variants).toEqual([]);
  });

  it('resolves Access target_ids → Model3D variants', async () => {
    const fetchMock = vi
      .fn()
      // 1st call: Access objects
      .mockResolvedValueOnce(
        graphqlResponse([accessNode('0xa'), accessNode('0xb')]),
      )
      // 2nd call: all Model3D
      .mockResolvedValueOnce(
        graphqlResponse([
          modelNode('0xa'),
          modelNode('0xb'),
          modelNode('0xc'), // not owned
        ]),
      );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useOwnedVariants('0xWALLET'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.variants.map((v) => v.objectId).sort()).toEqual([
      '0xa',
      '0xb',
    ]);
    expect(result.current.variants[0]!.patchId).toMatch(/^patch-/);
  });

  it('returns empty array when wallet owns zero Access objects', async () => {
    const fetchMock = vi.fn().mockResolvedValue(graphqlResponse([]));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useOwnedVariants('0xWALLET'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.variants).toEqual([]);
    // Should only fetch Access objects, not all models, when none owned.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces GraphQL errors via the error field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503 } as Response),
    );
    const { result } = renderHook(() => useOwnedVariants('0xWALLET'));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error?.message).toMatch(/503/);
  });
});
