import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useModelById, useOwnsAccess } from './hooks';

function mockFetch(impl: (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(impl));
}

beforeEach(() => {
  vi.stubEnv('VITE_MODEL3D_PACKAGE_ID', '0xPKG');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('useModelById', () => {
  it('returns model on happy path', async () => {
    mockFetch(async () =>
      new Response(
        JSON.stringify({
          data: {
            object: {
              address: '0xMODEL',
              asMoveObject: {
                contents: {
                  json: {
                    blob: { blob_id: 'walrus_blob_demo' },
                    creator: '0xCAFE',
                    shape_type: 'chest',
                    params_json: '{}',
                    name: 'Demo',
                    direct_access_price: '100000000',
                    tags: ['fantasy'],
                    created_at_ms: '0',
                    lineage_blob_id: 'walrus_lineage',
                  },
                },
              },
            },
          },
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useModelById('0xMODEL'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.model?.name).toBe('Demo');
    expect(result.current.model?.blobId).toBe('walrus_blob_demo');
    expect(result.current.model?.directAccessPrice).toBe('100000000');
  });

  it('sets error on GraphQL non-2xx', async () => {
    mockFetch(async () => new Response('boom', { status: 500 }));
    const { result } = renderHook(() => useModelById('0xMODEL'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.model).toBeNull();
  });

  it('skips fetch when objectId is empty', async () => {
    const fetchSpy = vi.fn();
    mockFetch(fetchSpy);
    const { result } = renderHook(() => useModelById(''));
    await act(async () => {
      // let useEffect flush
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });

  it('skips fetch when objectId is 0x0 (no contract deployed)', async () => {
    const fetchSpy = vi.fn();
    mockFetch(fetchSpy);
    const { result } = renderHook(() => useModelById('0x0'));
    await act(async () => {});
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });
});

describe('useOwnsAccess', () => {

  it('returns false when no walletAddress', async () => {
    const fetchSpy = vi.fn();
    mockFetch(fetchSpy);
    const { result } = renderHook(() => useOwnsAccess(undefined, '0xMODEL'));
    await act(async () => {});
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.current).toBe(false);
  });

  it('returns true when buyer owns Access with matching target_id', async () => {
    mockFetch(async () =>
      new Response(
        JSON.stringify({
          data: {
            objects: {
              nodes: [
                {
                  asMoveObject: {
                    contents: { json: { target_id: '0xMODEL' } },
                  },
                },
              ],
            },
          },
        }),
        { status: 200 },
      ),
    );
    const { result } = renderHook(() =>
      useOwnsAccess('0xBUYER', '0xMODEL'),
    );
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('returns false when buyer has Access tokens for other models', async () => {
    mockFetch(async () =>
      new Response(
        JSON.stringify({
          data: {
            objects: {
              nodes: [
                {
                  asMoveObject: {
                    contents: { json: { target_id: '0xOTHER' } },
                  },
                },
              ],
            },
          },
        }),
        { status: 200 },
      ),
    );
    const { result } = renderHook(() =>
      useOwnsAccess('0xBUYER', '0xMODEL'),
    );
    // Give the effect a tick to run
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(result.current).toBe(false);
  });
});
