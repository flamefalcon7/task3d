import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { TESTNET } from '../sui/networkConfig';
import { useListings } from './useListings';

const NFT_TOKEN_TYPE = `${TESTNET.model3dPackageId}::model3d::NftToken`;
const KIOSK_ID = '0x' + 'a'.repeat(64);
const TOKEN_A = '0x' + '1'.repeat(64);
const TOKEN_B = '0x' + '2'.repeat(64);
const OTHER = '0x' + '9'.repeat(64);

const { getKioskMock } = vi.hoisted(() => ({ getKioskMock: vi.fn() }));
vi.mock('@mysten/kiosk', () => ({
  KioskClient: vi.fn(() => ({ getKiosk: getKioskMock })),
}));

function detailsResponse(
  nodes: Array<{ address: string; json: Record<string, unknown> }>,
): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      data: {
        objects: {
          nodes: nodes.map((n) => ({
            address: n.address,
            asMoveObject: { contents: { json: n.json } },
          })),
        },
      },
    }),
  } as unknown as Response;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  getKioskMock.mockReset();
});

describe('useListings', () => {
  it('returns listed NftTokens joined with name + patch_id on the happy path', async () => {
    getKioskMock.mockResolvedValue({
      items: [
        { objectId: TOKEN_A, type: NFT_TOKEN_TYPE, listing: { price: '1000000000' } },
        { objectId: TOKEN_B, type: NFT_TOKEN_TYPE, listing: { price: '2500000000' } },
      ],
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        detailsResponse([
          { address: TOKEN_A, json: { name: 'Racer A', patch_id: 'pA', collection_id: '0xc1' } },
          { address: TOKEN_B, json: { name: 'Racer B', patch_id: 'pB', collection_id: '0xc1' } },
        ]),
      ),
    );

    const { result } = renderHook(() => useListings(KIOSK_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.listings).toEqual([
      { tokenId: TOKEN_A, priceMist: 1_000_000_000n, name: 'Racer A', patchId: 'pA', collectionId: '0xc1', kioskId: KIOSK_ID },
      { tokenId: TOKEN_B, priceMist: 2_500_000_000n, name: 'Racer B', patchId: 'pB', collectionId: '0xc1', kioskId: KIOSK_ID },
    ]);
  });

  it('ignores non-NftToken items and unlisted NftTokens', async () => {
    getKioskMock.mockResolvedValue({
      items: [
        { objectId: TOKEN_A, type: NFT_TOKEN_TYPE, listing: { price: '1000000000' } },
        { objectId: TOKEN_B, type: NFT_TOKEN_TYPE, listing: undefined }, // placed but not listed
        { objectId: OTHER, type: '0x2::foo::Bar', listing: { price: '5' } }, // wrong type
      ],
    });
    const fetchSpy = vi.fn(async () =>
      detailsResponse([{ address: TOKEN_A, json: { name: 'A', patch_id: 'pA', collection_id: '0xc1' } }]),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const { result } = renderHook(() => useListings(KIOSK_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.listings.map((l) => l.tokenId)).toEqual([TOKEN_A]);
    // the detail query is asked only for the one listed token
    const init = (fetchSpy.mock.calls[0] as unknown[])[1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.variables.ids).toEqual([TOKEN_A]);
  });

  it('skips fetching and returns empty when no kioskId is given', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { result } = renderHook(() => useListings(undefined));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.listings).toEqual([]);
    expect(getKioskMock).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('surfaces a kiosk read error via error state', async () => {
    getKioskMock.mockRejectedValue(new Error('kiosk 0x.. not found'));
    vi.stubGlobal('fetch', vi.fn());
    const { result } = renderHook(() => useListings(KIOSK_ID));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.listings).toEqual([]);
  });

  it('does not issue the detail query when the kiosk has no listed tokens', async () => {
    getKioskMock.mockResolvedValue({ items: [] });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { result } = renderHook(() => useListings(KIOSK_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.listings).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
