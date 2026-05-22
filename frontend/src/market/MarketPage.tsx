// plan-010 U4 (D-041) — the simple Kiosk marketplace (`/market`).
//
// Completes the four-actor journey's "user buys" leg: an nft creator lists an
// owned NftToken for sale; a (different) wallet buys it; the bought token lands
// as a plain owned object and is immediately drivable on /track (U11).
//
// Discovery is approach (a), demo-grade (D-041): the kiosk a token was listed
// into is remembered in localStorage so a buyer on the same browser sees it.
// A global, multi-seller marketplace would index kiosk::ItemListed events
// (deferred post-submission).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { SignInButton } from '../auth/SignInButton';
import { useOwnedTokens } from '../track/useOwnedTokens';
import { useListings, fetchOwnedKiosk } from './useListings';
import {
  buildListNftTokenForSalePtb,
  buildPurchaseNftTokenPtb,
  royaltyOwedMist,
} from '../sui/kioskTxBuilders';

const MARKET_KIOSK_KEY = 'overflow2026:market:kiosk';

function readStoredKiosk(): string | undefined {
  try {
    return globalThis.localStorage?.getItem(MARKET_KIOSK_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}
function writeStoredKiosk(id: string): void {
  try {
    globalThis.localStorage?.setItem(MARKET_KIOSK_KEY, id);
  } catch {
    // ignore (private mode / disabled storage) — demo continues without it
  }
}

function mistToSui(mist: bigint): string {
  return (Number(mist) / 1e9).toString();
}
function truncate(addr: string, head = 6, tail = 4): string {
  if (!addr || addr.length <= head + tail + 1) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

type Phase = 'idle' | 'busy' | 'error';

export function MarketPage() {
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  const [kioskId, setKioskId] = useState<string | undefined>(readStoredKiosk);
  const [reloadKey, setReloadKey] = useState(0);
  const { listings, loading: listingsLoading, error: listingsError } = useListings(
    kioskId,
    reloadKey,
  );

  const { tokens, loading: tokensLoading } = useOwnedTokens(account?.address, reloadKey);

  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<Phase>('idle');
  const [syncing, setSyncing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [boughtTokenId, setBoughtTokenId] = useState<string | null>(null);

  const busy = phase === 'busy';

  // Avoid setState after unmount when the post-tx poll is still running.
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);

  // signAndExecute resolves on fullnode execution, but the GraphQL endpoint we
  // read from indexes a beat later — a single immediate refetch comes back
  // stale. Poll a few times so the new listing/ownership shows without a manual
  // page refresh. `resolveOwnKiosk` re-reads the seller's kiosk id after a
  // listing (it may be a brand-new kiosk); a buyer must NOT overwrite kioskId.
  const pollRefresh = useCallback(
    async (resolveOwnKiosk: boolean) => {
      setSyncing(true);
      for (let i = 0; i < 5 && aliveRef.current; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        if (!aliveRef.current) return;
        if (resolveOwnKiosk && account) {
          try {
            const k = await fetchOwnedKiosk(account.address);
            if (k && aliveRef.current) {
              writeStoredKiosk(k.kioskId);
              setKioskId(k.kioskId);
            }
          } catch {
            // transient indexer error — keep polling
          }
        }
        if (aliveRef.current) setReloadKey((v) => v + 1);
      }
      if (aliveRef.current) setSyncing(false);
    },
    [account],
  );

  // Tokens already listed are filtered out of the "list" section so the seller
  // can't double-list the same object.
  const listedIds = useMemo(() => new Set(listings.map((l) => l.tokenId)), [listings]);
  const sellable = useMemo(
    () => tokens.filter((t) => !listedIds.has(t.tokenId)),
    [tokens, listedIds],
  );

  const onList = useCallback(
    async (tokenId: string) => {
      if (!account) return;
      const raw = priceInputs[tokenId];
      const sui = Number(raw);
      if (!Number.isFinite(sui) || sui <= 0) {
        setErrorMsg('Enter a price in SUI greater than 0.');
        setPhase('error');
        return;
      }
      setErrorMsg(null);
      setPhase('busy');
      try {
        const owned = await fetchOwnedKiosk(account.address);
        const { tx } = buildListNftTokenForSalePtb({
          tokenId,
          priceMist: BigInt(Math.round(sui * 1e9)),
          ownerAddress: account.address,
          kioskId: owned?.kioskId,
          kioskCapId: owned?.kioskCapId,
        });
        await signAndExecute({ transaction: tx });
        // The listing now lives in the seller's kiosk; resolve + remember it so
        // the marketplace (and a buyer on this browser) can find it.
        const after = await fetchOwnedKiosk(account.address);
        if (after) {
          writeStoredKiosk(after.kioskId);
          setKioskId(after.kioskId);
        }
        setReloadKey((k) => k + 1);
        setPhase('idle');
        void pollRefresh(true);
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : 'Listing was rejected.');
        setPhase('error');
      }
    },
    [account, priceInputs, signAndExecute, pollRefresh],
  );

  const onBuy = useCallback(
    async (tokenId: string, priceMist: bigint, fromKiosk: string) => {
      if (!account) return;
      setErrorMsg(null);
      setPhase('busy');
      try {
        const { tx } = buildPurchaseNftTokenPtb({
          kioskId: fromKiosk,
          tokenId,
          priceMist,
          buyerAddress: account.address,
        });
        await signAndExecute({ transaction: tx });
        setBoughtTokenId(tokenId);
        setReloadKey((k) => k + 1);
        setPhase('idle');
        void pollRefresh(false);
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : 'Purchase was rejected.');
        setPhase('error');
      }
    },
    [account, signAndExecute, pollRefresh],
  );

  if (!account) {
    return (
      <div data-testid="market-page" style={pageStyle}>
        <h1>Marketplace</h1>
        <p>Connect a wallet to buy and sell NFT cars.</p>
        <SignInButton />
      </div>
    );
  }

  return (
    <div data-testid="market-page" style={pageStyle}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Marketplace</h1>
        <Link to="/" style={{ color: '#7aa2ff' }}>← Browse</Link>
      </header>

      {/* For sale */}
      <section data-testid="for-sale" style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 15 }}>
          For sale{' '}
          {syncing && (
            <span data-testid="market-syncing" style={{ fontSize: 12, color: '#888', fontWeight: 400 }}>
              · updating…
            </span>
          )}
        </h2>
        {listingsError && (
          <p data-testid="listings-error" style={{ color: 'crimson' }}>
            Couldn’t load listings: {listingsError.message}
          </p>
        )}
        {listingsLoading && <p style={{ color: '#888' }}>Loading listings…</p>}
        {!listingsLoading && listings.length === 0 && (
          <p data-testid="no-listings" style={{ color: '#888' }}>
            Nothing for sale yet. List one of your cars below.
          </p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {listings.map((l) => {
            const total = l.priceMist + royaltyOwedMist(l.priceMist);
            return (
              <div
                key={l.tokenId}
                data-testid={`listing-${l.tokenId}`}
                style={cardStyle}
              >
                <div style={{ fontWeight: 600 }}>{l.name || truncate(l.tokenId)}</div>
                <div style={{ fontSize: 12, color: '#9aa' }}>
                  price {mistToSui(l.priceMist)} SUI · +royalty {mistToSui(royaltyOwedMist(l.priceMist))} SUI
                </div>
                <button
                  type="button"
                  data-testid={`buy-${l.tokenId}`}
                  disabled={busy}
                  onClick={() => void onBuy(l.tokenId, l.priceMist, l.kioskId)}
                  style={{ marginTop: 8 }}
                >
                  {busy ? 'Approve in wallet…' : `Buy — ${mistToSui(total)} SUI`}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Your NFTs → list */}
      <section data-testid="your-nfts">
        <h2 style={{ fontSize: 15 }}>Your cars</h2>
        {tokensLoading && <p style={{ color: '#888' }}>Loading your NFTs…</p>}
        {!tokensLoading && sellable.length === 0 && (
          <p data-testid="no-owned" style={{ color: '#888' }}>
            You don’t own any unlisted cars. Mint a collection on{' '}
            <Link to="/launch" style={{ color: '#7aa2ff' }}>/launch</Link>.
          </p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {sellable.map((t) => (
            <div key={t.tokenId} data-testid={`owned-${t.tokenId}`} style={cardStyle}>
              <div style={{ fontWeight: 600 }}>{t.name || truncate(t.tokenId)}</div>
              <input
                data-testid={`price-${t.tokenId}`}
                placeholder="price in SUI"
                value={priceInputs[t.tokenId] ?? ''}
                onChange={(e) =>
                  setPriceInputs((p) => ({ ...p, [t.tokenId]: e.target.value }))
                }
                disabled={busy}
                style={{ marginTop: 8, width: '90%' }}
              />
              <button
                type="button"
                data-testid={`list-${t.tokenId}`}
                disabled={busy}
                onClick={() => void onList(t.tokenId)}
                style={{ marginTop: 8 }}
              >
                {busy ? 'Approve in wallet…' : 'List for sale'}
              </button>
            </div>
          ))}
        </div>
      </section>

      {phase === 'error' && errorMsg && (
        <div data-testid="market-error" style={{ color: 'crimson', marginTop: 12 }}>
          {errorMsg}
        </div>
      )}
      {boughtTokenId && (
        <div data-testid="buy-success" style={{ color: '#7CFC00', marginTop: 12 }}>
          Purchased!{' '}
          <Link to={`/track?model=${boughtTokenId}`} style={{ color: '#7aa2ff' }}>
            Drive it on the track →
          </Link>
        </div>
      )}
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  padding: 24,
  color: '#ddd',
  background: '#15171b',
  minHeight: '100vh',
  fontFamily: 'system-ui',
};

const cardStyle: React.CSSProperties = {
  padding: 12,
  minWidth: 200,
  background: '#1a1c20',
  border: '1px solid #333',
  borderRadius: 8,
};
