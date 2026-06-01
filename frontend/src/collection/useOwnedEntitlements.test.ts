import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useOwnedEntitlements } from './useOwnedEntitlements';
import { TESTNET } from '../sui/networkConfig';

function objectsResponse(nodes: unknown[]): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: { objects: { nodes } } }),
  } as unknown as Response;
}

function entitlementNode(
  address: string,
  modelId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    address,
    asMoveObject: {
      contents: {
        json: {
          model_id: modelId,
          holder: '0xWALLET',
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

describe('useOwnedEntitlements', () => {
  it('returns empty (no fetch) when no wallet connected', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useOwnedEntitlements(undefined));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.modelIds.size).toBe(0);
    expect(result.current.entitlementByModel.size).toBe(0);
    expect(result.current.error).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps two owned entitlements → modelIds set + entitlementByModel lookup', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      objectsResponse([
        entitlementNode('0xent1', '0xbaseA'),
        entitlementNode('0xent2', '0xbaseB'),
      ]),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useOwnedEntitlements('0xWALLET'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Single owned-objects query.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect([...result.current.modelIds].sort()).toEqual(['0xbaseA', '0xbaseB']);
    expect(result.current.entitlementByModel.get('0xbaseA')).toBe('0xent1');
    expect(result.current.entitlementByModel.get('0xbaseB')).toBe('0xent2');
  });

  it('filters the owned-objects query by the live package AccessEntitlement type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(objectsResponse([]));
    vi.stubGlobal('fetch', fetchMock);
    renderHook(() => useOwnedEntitlements('0xWALLET'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(
      (fetchMock.mock.calls[0]![1] as RequestInit).body as string,
    );
    expect(body.variables.type).toBe(
      `${TESTNET.model3dPackageId}::model3d::AccessEntitlement`,
    );
    expect(body.variables.owner).toBe('0xWALLET');
  });

  it('empty wallet → empty set, no error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(objectsResponse([]));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useOwnedEntitlements('0xWALLET'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.modelIds.size).toBe(0);
    expect(result.current.entitlementByModel.size).toBe(0);
    expect(result.current.error).toBeNull();
  });

  it('surfaces GraphQL transport errors via the error field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503 } as Response),
    );
    const { result } = renderHook(() => useOwnedEntitlements('0xWALLET'));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error?.message).toMatch(/503/);
  });

  it('reloadKey change triggers a refetch', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(objectsResponse([entitlementNode('0xe1', '0xbaseA')]))
      .mockResolvedValueOnce(
        objectsResponse([
          entitlementNode('0xe1', '0xbaseA'),
          entitlementNode('0xe2', '0xbaseB'),
        ]),
      );
    vi.stubGlobal('fetch', fetchMock);

    const { result, rerender } = renderHook(
      ({ key }: { key: number }) => useOwnedEntitlements('0xWALLET', key),
      { initialProps: { key: 0 } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect([...result.current.modelIds].sort()).toEqual(['0xbaseA']);

    rerender({ key: 1 });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect([...result.current.modelIds].sort()).toEqual(['0xbaseA', '0xbaseB']),
    );
  });

  it('reload() callback triggers a refetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(objectsResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useOwnedEntitlements('0xWALLET'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    result.current.reload();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
