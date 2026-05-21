import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCollections, fetchCollectionById } from './useCollections';
import { TESTNET } from '../sui/networkConfig';

function objectsResponse(nodes: unknown[]): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: { objects: { nodes } } }),
  } as unknown as Response;
}

function objectResponse(node: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: { object: node } }),
  } as unknown as Response;
}

function collectionNode(address: string, overrides: Record<string, unknown> = {}) {
  return {
    address,
    asMoveObject: {
      contents: {
        json: {
          base_model_id: '0xbase',
          base_creator: '0xbasecreator',
          nft_creator: '0xnftcreator',
          base_royalty_bps: 500,
          integration_policy: 2,
          register_fee: '100000000',
          ...overrides,
        },
      },
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useCollections', () => {
  it('maps NftCollection objects → summaries filtered by the live package type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(objectsResponse([collectionNode('0xc1')]));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useCollections());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.collections).toHaveLength(1);
    expect(result.current.collections[0]!.collectionId).toBe('0xc1');
    expect(result.current.collections[0]!.integrationPolicy).toBe(2);
    expect(result.current.collections[0]!.registerFee).toBe('100000000');

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.variables.type).toBe(`${TESTNET.model3dPackageId}::model3d::NftCollection`);
  });

  it('surfaces transport errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response));
    const { result } = renderHook(() => useCollections());
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error?.message).toMatch(/500/);
  });
});

describe('fetchCollectionById', () => {
  it('resolves one collection id → summary', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(objectResponse(collectionNode('0xc9', { register_fee: '7' }))));
    const c = await fetchCollectionById('0xc9');
    expect(c.collectionId).toBe('0xc9');
    expect(c.registerFee).toBe('7');
  });

  it('throws when the object is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(objectResponse(null)));
    await expect(fetchCollectionById('0xmissing')).rejects.toThrow(/not found/);
  });
});
