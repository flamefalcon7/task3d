import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useOwnedTokens, useTokenById } from './useOwnedTokens';
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

function tokenNode(
  address: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    address,
    asMoveObject: {
      contents: {
        json: {
          collection_id: '0xcoll',
          base_model_id: '0xbase',
          name: `Token ${address}`,
          patch_id: `patch-${address}`,
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

describe('useOwnedTokens', () => {
  it('returns empty (no fetch) when no wallet connected', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useOwnedTokens(undefined));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tokens).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('starts in loading=true when a fetch is in flight', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
    const { result } = renderHook(() => useOwnedTokens('0xWALLET'));
    expect(result.current.loading).toBe(true);
    expect(result.current.tokens).toEqual([]);
  });

  it('maps owned NftToken objects → OwnedToken[] in a single query', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        objectsResponse([tokenNode('0xa'), tokenNode('0xb')]),
      );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useOwnedTokens('0xWALLET'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Single owned-objects query — no two-pass receipt lookup.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.tokens.map((t) => t.tokenId).sort()).toEqual([
      '0xa',
      '0xb',
    ]);
    expect(result.current.tokens[0]!.patchId).toMatch(/^patch-/);
  });

  it('filters the owned-objects query by the live package NftToken type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(objectsResponse([]));
    vi.stubGlobal('fetch', fetchMock);
    renderHook(() => useOwnedTokens('0xWALLET'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(
      (fetchMock.mock.calls[0]![1] as RequestInit).body as string,
    );
    expect(body.variables.type).toBe(
      `${TESTNET.model3dPackageId}::model3d::NftToken`,
    );
    expect(body.variables.owner).toBe('0xWALLET');
  });

  it('returns empty array when the wallet owns zero tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue(objectsResponse([]));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useOwnedTokens('0xWALLET'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tokens).toEqual([]);
  });

  it('surfaces GraphQL transport errors via the error field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503 } as Response),
    );
    const { result } = renderHook(() => useOwnedTokens('0xWALLET'));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error?.message).toMatch(/503/);
  });
});

describe('useTokenById', () => {
  it('returns null (no fetch) when no token id given', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useTokenById(undefined));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.token).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('resolves one token id → OwnedToken with its patch_id', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(objectResponse(tokenNode('0xtok')));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useTokenById('0xtok'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.token?.tokenId).toBe('0xtok');
    expect(result.current.token?.patchId).toBe('patch-0xtok');
  });

  it('errors when the object does not exist', async () => {
    const fetchMock = vi.fn().mockResolvedValue(objectResponse(null));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useTokenById('0xmissing'));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error?.message).toMatch(/not found/);
  });
});
