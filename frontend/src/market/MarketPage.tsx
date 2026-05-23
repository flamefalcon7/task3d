// plan-010 U4 (D-041) — the simple Kiosk marketplace (`/market`).
//
// Completes the four-actor journey's "user buys" leg: an nft creator lists an
// owned NftToken for sale; a (different) wallet buys it; the bought token lands
// as a plain owned object and is immediately drivable on /track (U11).
//
// Discovery is approach (b), network-wide (D-043): useListings finds every kiosk
// that has listed our NftToken via kiosk::ItemListed events (∪ the connected
// wallet's own kiosks). No localStorage tracking — a buyer sees a listing made
// from any wallet.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit';
import { SignInButton } from '../auth/SignInButton';
import { useOwnedTokens, type OwnedToken } from '../track/useOwnedTokens';
import { useListings, fetchOwnedKiosk } from './useListings';
import {
  buildListNftTokenForSalePtb,
  buildPurchaseNftTokenPtb,
  royaltyOwedMist,
} from '../sui/kioskTxBuilders';
import { TESTNET } from '../sui/networkConfig';

function mistToSui(mist: bigint): string {
  return (Number(mist) / 1e9).toString();
}
function truncate(addr: string, head = 6, tail = 4): string {
  if (!addr || addr.length <= head + tail + 1) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

// Buyer-side read-back of the just-bought NftToken via fullnode RPC. Mysten's
// public GraphQL endpoint is indexer-backed; the owner→objects filter that
// `useOwnedTokens` uses can lag seconds to minutes behind fullnode. Reading the
// object by id from fullnode is ~300ms and reflects state as of tx commit, so
// the buyer's new car appears in "Your cars" without waiting for the indexer.
const NFT_TOKEN_TYPE = `${TESTNET.model3dPackageId}::model3d::NftToken`;

function parseOwnedNftToken(resp: unknown): OwnedToken | null {
  const data = (resp as {
    data?: {
      objectId?: string;
      type?: string;
      content?: { dataType?: string; fields?: Record<string, unknown> | null } | null;
    };
  }).data;
  if (!data || !data.objectId) return null;
  if (data.type !== NFT_TOKEN_TYPE) return null;
  if (data.content?.dataType !== 'moveObject') return null;
  const fields = (data.content.fields ?? {}) as Record<string, unknown>;
  return {
    tokenId: data.objectId,
    name: String(fields.name ?? ''),
    patchId: String(fields.patch_id ?? ''),
    collectionId: String(fields.collection_id ?? ''),
    baseModelId: String(fields.base_model_id ?? ''),
    blobId: '',
  };
}

type Phase = 'idle' | 'busy' | 'error';
type ConfirmStatus = 'idle' | 'syncing' | 'confirmed' | 'failed';

export function MarketPage() {
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const suiClient = useSuiClient();

  const [reloadKey, setReloadKey] = useState(0);
  const { listings, loading: listingsLoading, error: listingsError } = useListings(
    account?.address,
    reloadKey,
  );

  const { tokens, loading: tokensLoading } = useOwnedTokens(account?.address, reloadKey);

  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<Phase>('idle');
  const [syncing, setSyncing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [boughtTokenId, setBoughtTokenId] = useState<string | null>(null);
  const [confirmStatus, setConfirmStatus] = useState<ConfirmStatus>('idle');
  const [confirmedToken, setConfirmedToken] = useState<OwnedToken | null>(null);
  const [confirmErrorMsg, setConfirmErrorMsg] = useState<string | null>(null);

  const busy = phase === 'busy';

  // Avoid setState after unmount when the post-tx poll is still running.
  // The setup MUST re-set true: refs are preserved across React StrictMode's
  // double-mount in dev (mount → cleanup → mount), so a cleanup-only effect
  // leaves aliveRef.current = false forever after the second mount. That
  // silently no-ops pollRefresh and any aliveRef-guarded async work — fix is to
  // explicitly re-assert the live state on every effect setup.
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  // Two rapid txs (or a slow first poll) can otherwise launch overlapping
  // 7.5-second poll chains that compound fetch fan-out.
  const pollRunningRef = useRef(false);

  // signAndExecute resolves on fullnode execution, but the GraphQL endpoint we
  // read from indexes a beat later — a single immediate refetch comes back
  // stale. Poll a few times (bumping reloadKey re-runs the kiosk-set resolve +
  // listings + owned-tokens) so a new listing/ownership shows without a manual
  // page refresh.
  const pollRefresh = useCallback(async () => {
    if (pollRunningRef.current) return;
    pollRunningRef.current = true;
    setSyncing(true);
    try {
      // 10×1.5s = 15s ceiling for indexer to catch up — the immediate fullnode
      // read-back in onBuy/onList primary-displays the change; this loop is the
      // backup that lets useOwnedTokens/useListings dedup back to real state.
      for (let i = 0; i < 10 && aliveRef.current; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        if (!aliveRef.current) return;
        setReloadKey((v) => v + 1);
      }
    } finally {
      pollRunningRef.current = false;
      if (aliveRef.current) setSyncing(false);
    }
  }, []);

  // Hide the just-bought item from "For sale": the seller's Listing dynamic
  // field removal may still be unindexed, and showing it as buyable misleads
  // the buyer (they already own it; the purchase tx succeeded).
  const visibleListings = useMemo(() => {
    if (!boughtTokenId) return listings;
    return listings.filter((l) => l.tokenId !== boughtTokenId);
  }, [listings, boughtTokenId]);

  // Tokens already listed are filtered out of the "list" section so the seller
  // can't double-list the same object.
  const listedIds = useMemo(
    () => new Set(visibleListings.map((l) => l.tokenId)),
    [visibleListings],
  );
  const sellable = useMemo(() => {
    const owned = tokens.filter((t) => !listedIds.has(t.tokenId));
    // Inject the fullnode-confirmed buy immediately, ahead of GraphQL indexer
    // catching up. Dedups when useOwnedTokens eventually returns the same id.
    if (confirmedToken && !owned.some((t) => t.tokenId === confirmedToken.tokenId)) {
      owned.push(confirmedToken);
    }
    return owned;
  }, [tokens, listedIds, confirmedToken]);

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
        // The seller's own kiosk is in useListings' wallet union, so the new
        // listing shows on the next reload (poll covers GraphQL index lag).
        setReloadKey((k) => k + 1);
        setPhase('idle');
        void pollRefresh();
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
        setConfirmStatus('syncing');
        setConfirmedToken(null);
        setConfirmErrorMsg(null);
        setReloadKey((k) => k + 1);
        setPhase('idle');
        void pollRefresh();
        // Bypass the indexer: read the bought token from fullnode (~300ms) so
        // it shows in "Your cars" without waiting for GraphQL's owner→objects
        // filter to catch up. The pollRefresh loop above + useOwnedTokens are
        // the eventual-consistency backup.
        void (async () => {
          try {
            const resp = await suiClient.getObject({
              id: tokenId,
              options: { showContent: true, showOwner: true, showType: true },
            });
            if (!aliveRef.current) return;
            const owned = parseOwnedNftToken(resp);
            if (owned) {
              setConfirmedToken(owned);
              setConfirmStatus('confirmed');
            } else {
              setConfirmStatus('failed');
              setConfirmErrorMsg(
                'Bought, but the token read back from fullnode did not match our NftToken shape.',
              );
            }
          } catch (e) {
            if (!aliveRef.current) return;
            setConfirmStatus('failed');
            setConfirmErrorMsg(
              e instanceof Error ? e.message : 'Fullnode read-back failed',
            );
          }
        })();
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : 'Purchase was rejected.');
        setPhase('error');
      }
    },
    [account, signAndExecute, pollRefresh, suiClient],
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
        {!listingsLoading && visibleListings.length === 0 && (
          <p data-testid="no-listings" style={{ color: '#888' }}>
            Nothing for sale yet. List one of your cars below.
          </p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {visibleListings.map((l) => {
            const total = l.priceMist + royaltyOwedMist(l.priceMist);
            return (
              <div
                key={l.tokenId}
                data-testid={`listing-${l.tokenId}`}
                style={cardStyle}
              >
                <div style={{ fontWeight: 600 }}>{l.name || truncate(l.tokenId)}</div>
                <div style={{ fontSize: 12, color: '#9aa' }}>
                  {mistToSui(l.priceMist)} SUI (asking) ·{' '}
                  {mistToSui(total)} SUI (you pay, incl. 5% royalty)
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
      {confirmStatus === 'syncing' && (
        <div data-testid="confirm-syncing" style={{ color: '#9bd', marginTop: 8 }}>
          ⏳ Reading your new token from fullnode…
        </div>
      )}
      {confirmStatus === 'confirmed' && (
        <div data-testid="confirm-ok" style={{ color: '#7CFC00', marginTop: 8 }}>
          ✅ Confirmed — your new car is in Your cars below.
        </div>
      )}
      {confirmStatus === 'failed' && (
        <div data-testid="confirm-failed" style={{ color: '#fcb', marginTop: 8 }}>
          ⚠️ {confirmErrorMsg ?? 'Could not confirm via fullnode.'}{' '}
          <button type="button" onClick={() => setReloadKey((k) => k + 1)}>
            Refresh
          </button>
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
