import { useEffect, useRef, useState } from 'react';
import { KioskClient } from '@mysten/kiosk';
import { SuiGraphQLClient } from '@mysten/sui/graphql';
import { SUI_GRAPHQL_ENDPOINT } from '../browse/graphqlQueries';
import { TESTNET } from '../sui/networkConfig';

// plan-011 (D-043) — discover NftTokens currently listed for sale, network-wide.
//
// Approach (b), frontend-only (supersedes D-041 approach (a)'s localStorage
// tracking): we DISCOVER the set of kiosks that have ever listed our token by
// querying `kiosk::ItemListed<NftToken>` events on Sui GraphQL, unioned with the
// connected wallet's own kiosks (so a seller sees their just-made listing before
// the event is indexed). Events are append-only HISTORY (the same item recurs
// across relists / kiosk moves), so they answer only "which kiosks to look at" —
// the TRUTH (what is actually listed now + price) comes from each kiosk's current
// `Listing` dynamic fields (`fetchListedRefs`). A backend event indexer (Tier C,
// mirroring U7) stays deferred until the backend is hosted.
//
// Read mechanism notes + the verified query/schema-drift gotcha live in
// `docs/solutions/sui-graphql-events-type-indexed-discovery-2026-05-23.md`. We do
// NOT use @mysten/kiosk's getKiosk for prices (its withListingPrices decode is
// broken in 1.2.6); the raw `Listing` dynamic field is authoritative.

export interface Listing {
  tokenId: string;
  priceMist: bigint;
  name: string;
  patchId: string; // by-quilt-patch-id GLB resolution (preview)
  collectionId: string;
  kioskId: string; // the kiosk the buyer purchases from
}

// One object by id. Sui GraphQL's ObjectFilter has no `objectIds` field, so we
// fetch each listed token individually (kiosk-placed items keep their object id
// — they're stored as dynamic OBJECT fields — so this resolves them fine).
const TOKEN_DETAIL_QUERY = /* GraphQL */ `
  query TokenDetail($id: SuiAddress!) {
    object(address: $id) {
      address
      asMoveObject {
        contents {
          type { repr }
          json
        }
      }
    }
  }
`;

interface TokenDetailResponse {
  data?: {
    object?: {
      address?: string;
      asMoveObject?: {
        contents?: { type?: { repr?: string } | null; json?: Record<string, unknown> | null } | null;
      } | null;
    } | null;
  };
  errors?: Array<{ message: string }>;
}

// A discovered kiosk may hold listings of OTHER projects' NFTs; only ours are
// shown. Match on the FULL package-qualified type, not a suffix — `endsWith`
// would accept `0xEVIL::model3d::NftToken` from any attacker-deployed package
// (the wallet-union path can pull such kiosks before the event-side type filter
// gets to apply). Republishes update `TESTNET.model3dPackageId` anyway, so the
// "survive republishes" rationale for suffix-matching never paid off.
const NFT_TOKEN_TYPE = `${TESTNET.model3dPackageId}::model3d::NftToken`;

// Hard bounds so a misbehaving GraphQL endpoint can't hang the marketplace.
// FETCH_TIMEOUT_MS caps every individual fetch. MAX_EVENT_PAGES caps the
// ItemListed pagination loop — 100 pages * 50 events = 5000 historical events
// ceiling. At demo scale we expect 1 page; the cap exists so adversarial event
// spam or unbounded organic growth degrades gracefully instead of hanging.
const FETCH_TIMEOUT_MS = 15_000;
const MAX_EVENT_PAGES = 100;

/** Combine an upstream AbortSignal with a per-call timeout. Prefers
 * `AbortSignal.any` (modern wallet browsers + Node 20.3+); falls back to a
 * manual merge for older runtimes (notably the jsdom test environment). */
function withFetchTimeout(signal: AbortSignal | undefined): AbortSignal {
  const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  if (!signal) return timeout;
  const anyFn = (AbortSignal as unknown as {
    any?: (signals: AbortSignal[]) => AbortSignal;
  }).any;
  if (typeof anyFn === 'function') return anyFn.call(AbortSignal, [signal, timeout]);
  const merged = new AbortController();
  const forward = (src: AbortSignal) => {
    if (src.aborted) merged.abort(src.reason);
    else src.addEventListener('abort', () => merged.abort(src.reason), { once: true });
  };
  forward(signal);
  forward(timeout);
  return merged.signal;
}

/** Race a promise against a wall-clock deadline. Used for KioskClient calls
 * that don't expose an AbortSignal (background work isn't cancelled — the
 * leaked promise will settle eventually — but the caller stops waiting). */
function withDeadline<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timeout after ${ms}ms`)),
      ms,
    );
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

// Event-based discovery: which kiosks have listed our NftToken (network-wide).
// `ItemListed<T>` is type-indexed, so the full generic type returns only our
// token's listings. The filter field is `type` (NOT `eventType`); the kiosk id
// lives in `contents.json.kiosk` (the live endpoint's Event has no top-level
// `type` field). See the solution doc for the verified shape.
const ITEM_LISTED_EVENT_TYPE = `0x2::kiosk::ItemListed<${NFT_TOKEN_TYPE}>`;

const ITEM_LISTED_EVENTS_QUERY = /* GraphQL */ `
  query ListedKiosks($type: String!, $after: String) {
    events(filter: { type: $type }, first: 50, after: $after) {
      nodes { contents { json } }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

interface ItemListedEventsResponse {
  data?: {
    events?: {
      nodes?: Array<{ contents?: { json?: { kiosk?: string } | null } | null }>;
      pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
    } | null;
  };
  errors?: Array<{ message: string }>;
}

/** Distinct kiosk ids that have ever listed our NftToken. Public primitive —
 * shaped for direct reuse by other discovery surfaces (e.g. a future agent
 * tool); tests cover it indirectly via useListings. */
export async function fetchListedKioskIds(signal?: AbortSignal): Promise<string[]> {
  const ids = new Set<string>();
  let after: string | null = null;
  for (let page = 0; page < MAX_EVENT_PAGES; page++) {
    const resp = await fetch(SUI_GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: ITEM_LISTED_EVENTS_QUERY,
        variables: { type: ITEM_LISTED_EVENT_TYPE, after },
      }),
      signal: withFetchTimeout(signal),
    });
    if (!resp.ok) throw new Error(`Sui GraphQL ${resp.status}`);
    const json = (await resp.json()) as ItemListedEventsResponse;
    if (json.errors?.length) {
      throw new Error(json.errors.map((e) => e.message).join('; '));
    }
    const events = json.data?.events;
    for (const node of events?.nodes ?? []) {
      const kiosk = node.contents?.json?.kiosk;
      if (typeof kiosk === 'string') ids.add(kiosk);
    }
    if (events?.pageInfo?.hasNextPage && events.pageInfo.endCursor) {
      after = events.pageInfo.endCursor;
      if (page === MAX_EVENT_PAGES - 1) {
        console.warn(
          `[useListings] hit ${MAX_EVENT_PAGES}-page cap on ItemListed scan; results may be incomplete (Tier C backend indexer is the long-term fix).`,
        );
      }
    } else {
      break;
    }
  }
  return Array.from(ids);
}

/** Listed-token id + price as decoded from the seller kiosk. */
interface ListedRef {
  tokenId: string;
  priceMist: bigint;
}

function makeKioskClient(): KioskClient {
  return new KioskClient({
    client: new SuiGraphQLClient({ url: SUI_GRAPHQL_ENDPOINT, network: 'testnet' }),
    network: 'testnet',
  });
}

/** The connected wallet's first kiosk + its owner cap, or null if it has none. */
export interface OwnedKioskRef {
  kioskId: string;
  kioskCapId: string;
}

/**
 * Resolve a wallet's existing kiosk (first one) so the list flow can reuse it
 * instead of creating a new kiosk on every listing. Returns null when the
 * wallet has no kiosk yet (the list builder then creates one in-PTB).
 */
export async function fetchOwnedKiosk(address: string): Promise<OwnedKioskRef | null> {
  const kioskClient = makeKioskClient();
  const { kioskOwnerCaps } = await kioskClient.getOwnedKiosks({ address });
  const cap = kioskOwnerCaps[0];
  if (!cap) return null;
  return { kioskId: cap.kioskId, kioskCapId: cap.objectId };
}

/** All kiosk ids the wallet owns (a wallet may have several). Internal to the
 * hook's wallet-union path; not exported since no external caller uses it. */
async function fetchOwnedKioskIds(address: string): Promise<string[]> {
  const kioskClient = makeKioskClient();
  const { kioskOwnerCaps } = await kioskClient.getOwnedKiosks({ address });
  return kioskOwnerCaps.map((c) => c.kioskId);
}

// Read the kiosk's `Listing` dynamic fields directly. We do NOT use
// @mysten/kiosk's getKiosk for prices: in this SDK version its
// `withListingPrices` decode is broken and returns garbage u64s (e.g.
// 6778647746668833948 for a real price of 10000000). The raw dynamic field is
// authoritative — name is `0x2::kiosk::Listing { id, is_exclusive }` (id = the
// listed item) and value is the u64 price in MIST.
const KIOSK_LISTINGS_QUERY = /* GraphQL */ `
  query KioskListings($id: SuiAddress!) {
    object(address: $id) {
      dynamicFields {
        nodes {
          name { type { repr } json }
          value { __typename ... on MoveValue { json } }
        }
      }
    }
  }
`;

interface KioskListingsResponse {
  data?: {
    object?: {
      dynamicFields?: {
        nodes?: Array<{
          name?: { type?: { repr?: string }; json?: { id?: string } | null } | null;
          value?: { __typename?: string; json?: unknown } | null;
        }>;
      } | null;
    } | null;
  };
  errors?: Array<{ message: string }>;
}

/** Read the kiosk's listed token refs (id + price). Exported for testing. */
export async function fetchListedRefs(
  kioskId: string,
  signal?: AbortSignal,
): Promise<ListedRef[]> {
  const resp = await fetch(SUI_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: KIOSK_LISTINGS_QUERY, variables: { id: kioskId } }),
    signal: withFetchTimeout(signal),
  });
  if (!resp.ok) throw new Error(`Sui GraphQL ${resp.status}`);
  const json = (await resp.json()) as KioskListingsResponse;
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join('; '));
  }
  const refs: ListedRef[] = [];
  for (const node of json.data?.object?.dynamicFields?.nodes ?? []) {
    if (!node.name?.type?.repr?.includes('::kiosk::Listing')) continue;
    const tokenId = node.name.json?.id;
    const price = node.value?.json; // u64 emitted as a decimal string
    if (tokenId && (typeof price === 'string' || typeof price === 'number')) {
      refs.push({ tokenId, priceMist: BigInt(price) });
    }
  }
  return refs;
}

async function fetchTokenDetail(
  tokenId: string,
  signal?: AbortSignal,
): Promise<{ json: Record<string, unknown>; typeRepr: string }> {
  const resp = await fetch(SUI_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: TOKEN_DETAIL_QUERY, variables: { id: tokenId } }),
    signal: withFetchTimeout(signal),
  });
  if (!resp.ok) throw new Error(`Sui GraphQL ${resp.status}`);
  const json = (await resp.json()) as TokenDetailResponse;
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join('; '));
  }
  const contents = json.data?.object?.asMoveObject?.contents;
  return { json: contents?.json ?? {}, typeRepr: contents?.type?.repr ?? '' };
}

async function joinTokenDetails(
  refs: ListedRef[],
  kioskId: string,
  signal?: AbortSignal,
): Promise<Listing[]> {
  if (refs.length === 0) return [];
  const joined = await Promise.all(
    refs.map(async (ref) => {
      const { json: j, typeRepr } = await fetchTokenDetail(ref.tokenId, signal);
      // Drop foreign NFTs that happen to share a discovered kiosk. Strict
      // full-type equality, not endsWith — see the NFT_TOKEN_TYPE constant.
      if (typeRepr !== NFT_TOKEN_TYPE) return null;
      return {
        tokenId: ref.tokenId,
        priceMist: ref.priceMist,
        name: String(j.name ?? ''),
        patchId: String(j.patch_id ?? ''),
        collectionId: String(j.collection_id ?? ''),
        kioskId,
      } satisfies Listing;
    }),
  );
  return joined.filter((l): l is Listing => l !== null);
}

export interface UseListingsResult {
  listings: Listing[];
  loading: boolean;
  error: Error | null;
}

/**
 * Listings currently for sale across the network (approach (b), D-043). Kiosks
 * are discovered from `ItemListed<NftToken>` events, unioned with the connected
 * wallet's own kiosks (so a seller sees their just-made listing before the event
 * is indexed); each kiosk's current `Listing` dynamic fields then give the
 * authoritative active set + price. No listing → empty marketplace.
 */
export function useListings(
  walletAddress?: string,
  reloadKey?: unknown,
): UseListingsResult {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  // Only show the "Loading listings…" placeholder on the FIRST fetch. Once we
  // have data, subsequent reloadKey bumps (pollRefresh fires 10× over 15 s
  // after a tx) keep the existing cards on screen and swap silently — the
  // MarketPage header's "·updating…" indicator is the refresh hint.
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const signal = controller.signal;
    if (!hasLoadedRef.current) setLoading(true);
    setError(null);
    (async () => {
      try {
        // Wallet-leg soft-fails: a transient KioskClient error during indexer
        // lag must not blank the marketplace (D-041 → D-043 preserved this
        // tolerance; the regression of bundling it into Promise.all with the
        // events fetch was found in code review). KioskClient doesn't expose
        // an AbortSignal so we bound it with a wall-clock deadline.
        const [fromEvents, fromWallet] = await Promise.all([
          fetchListedKioskIds(signal),
          walletAddress
            ? withDeadline(
                fetchOwnedKioskIds(walletAddress),
                FETCH_TIMEOUT_MS,
                'fetchOwnedKioskIds',
              ).catch(() => [] as string[])
            : Promise.resolve<string[]>([]),
        ]);
        const ids = Array.from(new Set([...fromEvents, ...fromWallet]));
        if (ids.length === 0) {
          if (!cancelled) setListings([]);
          return;
        }
        // Per-kiosk soft-fail: one bad kiosk (deleted, transient 5xx, malformed
        // id from a stale event) must not wipe every other kiosk's listings.
        const perKioskResults = await Promise.allSettled(
          ids.map(async (id) =>
            joinTokenDetails(await fetchListedRefs(id, signal), id, signal),
          ),
        );
        const perKiosk: Listing[][] = [];
        for (const r of perKioskResults) {
          if (r.status === 'fulfilled') perKiosk.push(r.value);
          else console.warn('[useListings] kiosk read failed:', r.reason);
        }
        if (!cancelled) setListings(perKiosk.flat());
      } catch (e) {
        // AbortError on cleanup is expected; don't surface to the user.
        if (cancelled) return;
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (!cancelled) {
          setLoading(false);
          hasLoadedRef.current = true;
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [walletAddress, reloadKey]);

  return { listings, loading, error };
}
