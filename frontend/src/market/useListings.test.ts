import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { useListings } from './useListings';

const KIOSK_ID = '0x' + 'a'.repeat(64);
const TOKEN_A = '0x' + '1'.repeat(64);
const TOKEN_B = '0x' + '2'.repeat(64);

// useListings imports KioskClient (for fetchOwnedKiosk, used by the list flow,
// not by this hook). Stub the module so the import resolves; getKiosk is no
// longer used for prices (its withListingPrices decode is broken upstream).
vi.mock('@mysten/kiosk', () => ({ KioskClient: vi.fn(() => ({})) }));

interface ListingFixture {
  tokenId: string;
  price: string; // u64 MIST as a decimal string (raw Listing dynamic-field value)
  json: Record<string, unknown>;
}

function resp(data: unknown): Response {
  return { ok: true, status: 200, json: async () => data } as unknown as Response;
}

// Combined fetch mock: the kiosk dynamicFields query returns the Listing DFs;
// each object(address:) query returns that token's Move json. Extra non-Listing
// dynamic fields can be injected to verify they're ignored.
function marketFetch(listings: ListingFixture[], extraDfNodes: unknown[] = []) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse((init?.body as string) ?? '{}');
    if (String(body.query).includes('dynamicFields')) {
      const nodes = [
        ...listings.map((l) => ({
          name: { type: { repr: '0x2::kiosk::Listing' }, json: { id: l.tokenId, is_exclusive: false } },
          value: { __typename: 'MoveValue', json: l.price },
        })),
        ...extraDfNodes,
      ];
      return resp({ data: { object: { dynamicFields: { nodes } } } });
    }
    const id = body.variables?.id as string;
    const l = listings.find((x) => x.tokenId === id);
    return resp({
      data: { object: l ? { address: id, asMoveObject: { contents: { json: l.json } } } : null },
    });
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useListings', () => {
  it('reads the real Listing price from the dynamic field + joins token details', async () => {
    vi.stubGlobal(
      'fetch',
      marketFetch([
        { tokenId: TOKEN_A, price: '10000000', json: { name: 'Racer A', patch_id: 'pA', collection_id: '0xc1' } },
        { tokenId: TOKEN_B, price: '2500000000', json: { name: 'Racer B', patch_id: 'pB', collection_id: '0xc1' } },
      ]),
    );

    const { result } = renderHook(() => useListings([KIOSK_ID]));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.listings).toEqual([
      { tokenId: TOKEN_A, priceMist: 10_000_000n, name: 'Racer A', patchId: 'pA', collectionId: '0xc1', kioskId: KIOSK_ID },
      { tokenId: TOKEN_B, priceMist: 2_500_000_000n, name: 'Racer B', patchId: 'pB', collectionId: '0xc1', kioskId: KIOSK_ID },
    ]);
  });

  it('ignores non-Listing dynamic fields (e.g. Item/Lock entries)', async () => {
    vi.stubGlobal(
      'fetch',
      marketFetch(
        [{ tokenId: TOKEN_A, price: '10000000', json: { name: 'A', patch_id: 'pA', collection_id: '0xc1' } }],
        [{ name: { type: { repr: '0x2::kiosk::Item' }, json: { id: TOKEN_B } }, value: { __typename: 'MoveObject' } }],
      ),
    );

    const { result } = renderHook(() => useListings([KIOSK_ID]));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.listings.map((l) => l.tokenId)).toEqual([TOKEN_A]);
  });

  it('skips fetching and returns empty when no kioskId is given', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { result } = renderHook(() => useListings([]));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.listings).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('surfaces a GraphQL non-2xx as an error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502 }) as unknown as Response));
    const { result } = renderHook(() => useListings([KIOSK_ID]));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.listings).toEqual([]);
  });

  it('does not issue any detail query when the kiosk has no listings', async () => {
    const fetchSpy = marketFetch([]);
    vi.stubGlobal('fetch', fetchSpy);
    const { result } = renderHook(() => useListings([KIOSK_ID]));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.listings).toEqual([]);
    // only the dynamicFields query fired — no per-token detail queries
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
