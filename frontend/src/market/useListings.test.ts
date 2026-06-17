import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { useListings } from './useListings';
import { TESTNET } from '../sui/networkConfig';

const NFT_TYPE = `${TESTNET.model3dPackageId}::model3d::NftToken`;
const KIOSK_A = '0x' + 'a'.repeat(64);
const KIOSK_B = '0x' + 'b'.repeat(64);
const TOKEN_A = '0x' + '1'.repeat(64);
const TOKEN_B = '0x' + '2'.repeat(64);
const FOREIGN = '0x' + '9'.repeat(64);
const WALLET = '0x' + '3'.repeat(64);

// fetchOwnedKioskIds (own-kiosk union path) goes through KioskClient.getOwnedKiosks.
const getOwnedKiosksMock = vi.fn(async () => ({
  kioskOwnerCaps: [] as Array<{ kioskId: string; objectId: string }>,
}));
vi.mock('@mysten/kiosk', () => ({
  KioskClient: vi.fn(() => ({ getOwnedKiosks: getOwnedKiosksMock })),
}));

interface ListingFix {
  tokenId: string;
  price: string; // u64 MIST as a decimal string (raw Listing dynamic-field value)
  name?: string;
  typeRepr?: string; // defaults to our NftToken type
  timestamp?: string; // ISO DateTime on the ItemListed event (recency)
}

function resp(data: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => data } as unknown as Response;
}

// Combined fetch mock covering all three query shapes:
//   - events(...)        → ItemListed discovery (contents.json.kiosk)
//   - dynamicFields      → a kiosk's current Listing DFs (authoritative price)
//   - TokenDetail        → a token's type repr + json (name/patch/collection)
// `eventKioskIds` controls which kiosks appear in the event feed (defaults to all
// kiosks in the fixture); pass it to simulate a wallet-only kiosk absent from events.
function marketFetch(
  kiosks: Record<string, ListingFix[]>,
  opts: { eventKioskIds?: string[] } = {},
) {
  const eventKioskIds = opts.eventKioskIds ?? Object.keys(kiosks);
  const tokenIndex = new Map<string, ListingFix>();
  for (const arr of Object.values(kiosks)) for (const l of arr) tokenIndex.set(l.tokenId, l);

  return vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse((init?.body as string) ?? '{}');
    const q = String(body.query);

    if (q.includes('events(')) {
      const nodes = eventKioskIds.flatMap((kioskId) =>
        (kiosks[kioskId] ?? [{ tokenId: 'x', price: '0' } as ListingFix]).map((l) => ({
          contents: { json: { kiosk: kioskId, id: l.tokenId, price: l.price } },
          timestamp: l.timestamp,
        })),
      );
      return resp({ data: { events: { nodes, pageInfo: { hasNextPage: false, endCursor: null } } } });
    }

    if (q.includes('dynamicFields')) {
      const kioskId = body.variables?.id as string;
      const nodes = (kiosks[kioskId] ?? []).map((l) => ({
        name: { type: { repr: '0x2::kiosk::Listing' }, json: { id: l.tokenId, is_exclusive: false } },
        value: { __typename: 'MoveValue', json: l.price },
      }));
      return resp({ data: { object: { dynamicFields: { nodes } } } });
    }

    // TokenDetail
    const id = body.variables?.id as string;
    const l = tokenIndex.get(id);
    return resp({
      data: {
        object: l
          ? {
              address: id,
              asMoveObject: {
                contents: {
                  type: { repr: l.typeRepr ?? NFT_TYPE },
                  json: { name: l.name ?? '', patch_id: 'p', collection_id: '0xc1' },
                },
              },
            }
          : null,
      },
    });
  });
}

beforeEach(() => {
  getOwnedKiosksMock.mockReset();
  getOwnedKiosksMock.mockResolvedValue({ kioskOwnerCaps: [] });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useListings', () => {
  it('discovers kiosks from ItemListed events and joins current listings (price from DF)', async () => {
    vi.stubGlobal(
      'fetch',
      marketFetch({
        [KIOSK_A]: [{ tokenId: TOKEN_A, price: '10000000', name: 'Racer A' }],
      }),
    );

    const { result } = renderHook(() => useListings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.listings).toEqual([
      { tokenId: TOKEN_A, priceMist: 10_000_000n, name: 'Racer A', patchId: 'p', collectionId: '0xc1', kioskId: KIOSK_A },
    ]);
  });

  it('drops a foreign NFT that shares a discovered kiosk (type guard)', async () => {
    vi.stubGlobal(
      'fetch',
      marketFetch({
        [KIOSK_A]: [
          { tokenId: TOKEN_A, price: '10000000', name: 'Racer A' },
          { tokenId: FOREIGN, price: '5', name: 'Imposter', typeRepr: '0xabc::other::Thing' },
        ],
      }),
    );

    const { result } = renderHook(() => useListings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.listings.map((l) => l.tokenId)).toEqual([TOKEN_A]);
  });

  it("unions the connected wallet's own kiosk even when absent from events", async () => {
    getOwnedKiosksMock.mockResolvedValue({
      kioskOwnerCaps: [{ kioskId: KIOSK_B, objectId: '0xcap' }],
    });
    vi.stubGlobal(
      'fetch',
      marketFetch(
        {
          [KIOSK_A]: [{ tokenId: TOKEN_A, price: '10000000', name: 'A' }],
          [KIOSK_B]: [{ tokenId: TOKEN_B, price: '2500000000', name: 'B' }],
        },
        { eventKioskIds: [KIOSK_A] }, // KIOSK_B only reachable via the wallet union
      ),
    );

    const { result } = renderHook(() => useListings(WALLET));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(new Set(result.current.listings.map((l) => l.tokenId))).toEqual(new Set([TOKEN_A, TOKEN_B]));
  });

  it('returns empty and fires no detail query when nothing is discovered', async () => {
    const fetchSpy = marketFetch({}); // no events, no wallet kiosks
    vi.stubGlobal('fetch', fetchSpy);

    const { result } = renderHook(() => useListings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.listings).toEqual([]);
    const queries = fetchSpy.mock.calls.map((c) => JSON.parse((c[1]?.body as string) ?? '{}').query as string);
    expect(queries.some((q) => q.includes('dynamicFields'))).toBe(false);
    expect(queries.some((q) => q.includes('TokenDetail'))).toBe(false);
  });

  it('surfaces a GraphQL non-2xx as an error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => resp(null, false, 502)));
    const { result } = renderHook(() => useListings());
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.listings).toEqual([]);
  });

  it('paginates fetchListedKioskIds across multiple ItemListed pages, forwarding the cursor', async () => {
    let call = 0;
    const fetchSpy = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse((init?.body as string) ?? '{}');
      const q = String(body.query);
      if (q.includes('events(')) {
        call++;
        if (call === 1) {
          return resp({
            data: {
              events: {
                nodes: [{ contents: { json: { kiosk: KIOSK_A, id: TOKEN_A, price: '10000000' } } }],
                pageInfo: { hasNextPage: true, endCursor: 'CURSOR1' },
              },
            },
          });
        }
        // Second page MUST receive the forwarded cursor.
        expect(body.variables?.after).toBe('CURSOR1');
        return resp({
          data: {
            events: {
              nodes: [{ contents: { json: { kiosk: KIOSK_B, id: TOKEN_B, price: '2500000000' } } }],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        });
      }
      if (q.includes('dynamicFields')) {
        const kioskId = body.variables?.id as string;
        const map: Record<string, { tokenId: string; price: string }> = {
          [KIOSK_A]: { tokenId: TOKEN_A, price: '10000000' },
          [KIOSK_B]: { tokenId: TOKEN_B, price: '2500000000' },
        };
        const f = map[kioskId];
        return resp({
          data: { object: { dynamicFields: { nodes: f ? [{
            name: { type: { repr: '0x2::kiosk::Listing' }, json: { id: f.tokenId, is_exclusive: false } },
            value: { __typename: 'MoveValue', json: f.price },
          }] : [] } } },
        });
      }
      const id = body.variables?.id as string;
      return resp({
        data: { object: { address: id, asMoveObject: { contents: {
          type: { repr: NFT_TYPE },
          json: { name: id === TOKEN_A ? 'A' : 'B', patch_id: 'p', collection_id: '0xc1' },
        } } } },
      });
    });
    vi.stubGlobal('fetch', fetchSpy);

    const { result } = renderHook(() => useListings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.listings.map((l) => l.tokenId).sort()).toEqual([TOKEN_A, TOKEN_B].sort());
    // events query fired exactly twice.
    const eventsCalls = fetchSpy.mock.calls.filter((c) =>
      String(JSON.parse((c[1]?.body as string) ?? '{}').query).includes('events('),
    );
    expect(eventsCalls).toHaveLength(2);
  });

  it('surfaces a 200+errors[] GraphQL response on the events query', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      const q = String(JSON.parse((init?.body as string) ?? '{}').query);
      if (q.includes('events(')) {
        return resp({ data: null, errors: [{ message: 'access denied' }] });
      }
      return resp({ data: null });
    }));
    const { result } = renderHook(() => useListings());
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error?.message).toMatch(/access denied/);
    expect(result.current.listings).toEqual([]);
  });

  it('soft-fails the wallet leg: fetchOwnedKioskIds rejection does not blank the marketplace', async () => {
    getOwnedKiosksMock.mockRejectedValue(new Error('indexer lag'));
    vi.stubGlobal(
      'fetch',
      marketFetch({ [KIOSK_A]: [{ tokenId: TOKEN_A, price: '10000000', name: 'A' }] }),
    );
    const { result } = renderHook(() => useListings(WALLET));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.listings.map((l) => l.tokenId)).toEqual([TOKEN_A]);
  });

  it('per-kiosk soft-fail: one bad kiosk does not wipe the others', async () => {
    const fetchSpy = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse((init?.body as string) ?? '{}');
      const q = String(body.query);
      if (q.includes('events(')) {
        return resp({
          data: { events: {
            nodes: [
              { contents: { json: { kiosk: KIOSK_A, id: TOKEN_A, price: '10000000' } } },
              { contents: { json: { kiosk: KIOSK_B, id: TOKEN_B, price: '2500000000' } } },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          } } });
      }
      if (q.includes('dynamicFields')) {
        const kioskId = body.variables?.id as string;
        if (kioskId === KIOSK_A) {
          // Simulate a transient 5xx for kiosk A only.
          return resp(null, false, 502);
        }
        return resp({
          data: { object: { dynamicFields: { nodes: [{
            name: { type: { repr: '0x2::kiosk::Listing' }, json: { id: TOKEN_B, is_exclusive: false } },
            value: { __typename: 'MoveValue', json: '2500000000' },
          }] } } },
        });
      }
      const id = body.variables?.id as string;
      return resp({
        data: { object: { address: id, asMoveObject: { contents: {
          type: { repr: NFT_TYPE },
          json: { name: 'B', patch_id: 'p', collection_id: '0xc1' },
        } } } },
      });
    });
    vi.stubGlobal('fetch', fetchSpy);

    const { result } = renderHook(() => useListings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.listings.map((l) => l.tokenId)).toEqual([TOKEN_B]);
  });

  it('rejects a same-module NftToken from a different package id (strict full-type match)', async () => {
    vi.stubGlobal(
      'fetch',
      marketFetch({
        [KIOSK_A]: [{
          tokenId: TOKEN_A,
          price: '10000000',
          name: 'Spoof',
          typeRepr: `0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef::model3d::NftToken`,
        }],
      }),
    );
    const { result } = renderHook(() => useListings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.listings).toEqual([]);
  });

  it('does not double-render an item that recurs across ItemListed events (history)', async () => {
    vi.stubGlobal(
      'fetch',
      marketFetch(
        { [KIOSK_A]: [{ tokenId: TOKEN_A, price: '10000000', name: 'A' }] },
        { eventKioskIds: [KIOSK_A, KIOSK_A] }, // same kiosk emitted twice (relist history)
      ),
    );

    const { result } = renderHook(() => useListings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.listings).toHaveLength(1);
  });

  // ─── U3: listing-time recency (listedAtMs) ───

  it('U3: stamps listedAtMs from the ItemListed event timestamp', async () => {
    const ts = '2026-06-10T00:00:00.000Z';
    vi.stubGlobal(
      'fetch',
      marketFetch({
        [KIOSK_A]: [{ tokenId: TOKEN_A, price: '10000000', name: 'A', timestamp: ts }],
      }),
    );
    const { result } = renderHook(() => useListings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.listings[0]?.listedAtMs).toBe(Date.parse(ts));
  });

  it('U3: leaves listedAtMs undefined when the event carries no timestamp', async () => {
    vi.stubGlobal(
      'fetch',
      marketFetch({ [KIOSK_A]: [{ tokenId: TOKEN_A, price: '10000000', name: 'A' }] }),
    );
    const { result } = renderHook(() => useListings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.listings[0]?.listedAtMs).toBeUndefined();
  });

  it('U3: uses the latest timestamp when a token relists across events', async () => {
    const older = '2026-06-01T00:00:00.000Z';
    const newer = '2026-06-12T00:00:00.000Z';
    const fetchSpy = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse((init?.body as string) ?? '{}');
      const q = String(body.query);
      if (q.includes('events(')) {
        return resp({
          data: { events: {
            // Same token id, two ItemListed events out of chronological order.
            nodes: [
              { contents: { json: { kiosk: KIOSK_A, id: TOKEN_A, price: '10000000' } }, timestamp: newer },
              { contents: { json: { kiosk: KIOSK_A, id: TOKEN_A, price: '10000000' } }, timestamp: older },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          } } });
      }
      if (q.includes('dynamicFields')) {
        return resp({
          data: { object: { dynamicFields: { nodes: [{
            name: { type: { repr: '0x2::kiosk::Listing' }, json: { id: TOKEN_A, is_exclusive: false } },
            value: { __typename: 'MoveValue', json: '10000000' },
          }] } } },
        });
      }
      const id = body.variables?.id as string;
      return resp({
        data: { object: { address: id, asMoveObject: { contents: {
          type: { repr: NFT_TYPE },
          json: { name: 'A', patch_id: 'p', collection_id: '0xc1' },
        } } } },
      });
    });
    vi.stubGlobal('fetch', fetchSpy);

    const { result } = renderHook(() => useListings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.listings[0]?.listedAtMs).toBe(Date.parse(newer));
  });
});
