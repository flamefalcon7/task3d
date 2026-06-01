import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useModelById } from './hooks';

function mockFetch(impl: (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(impl));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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

  it('maps license.access_fee → accessFee; defaults to "0" when the license is absent', async () => {
    // plan-027 D-078 — ALLOW_LIST base carrying an access_fee.
    mockFetch(async () =>
      new Response(
        JSON.stringify({
          data: {
            object: {
              address: '0xPAID',
              asMoveObject: {
                contents: {
                  json: {
                    blob: { blob_id: 'b' },
                    creator: '0xCAFE',
                    name: 'Gated',
                    license: { policy: 1, derivative_mint_fee: '0', access_fee: '5000000' },
                    is_encrypted: true,
                  },
                },
              },
            },
          },
        }),
        { status: 200 },
      ),
    );
    const { result } = renderHook(() => useModelById('0xPAID'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.model?.accessFee).toBe('5000000');
  });

  it('defaults accessFee to "0" when the model carries no license', async () => {
    mockFetch(async () =>
      new Response(
        JSON.stringify({
          data: {
            object: {
              address: '0xLEGACY',
              asMoveObject: { contents: { json: { blob: { blob_id: 'b' }, name: 'Legacy' } } },
            },
          },
        }),
        { status: 200 },
      ),
    );
    const { result } = renderHook(() => useModelById('0xLEGACY'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.model?.accessFee).toBe('0');
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
