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

import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit';
import { SignInButton } from '../auth/SignInButton';
import { useOwnedTokens, type OwnedToken } from '../track/useOwnedTokens';
import { useListings, fetchOwnedKiosk, type Listing } from './useListings';
import {
  buildListNftTokenForSalePtb,
  buildPurchaseNftTokenPtb,
  royaltyOwedMist,
} from '../sui/kioskTxBuilders';
import { TESTNET } from '../sui/networkConfig';
import { PreviewCanvas } from '../babylon/PreviewCanvas';
import { LazyCanvasMount } from '../babylon/LazyCanvasMount';
import { glbUrlForToken } from '../walrus/aggregator';
import {
  buttonOutline,
  buttonPrimary,
  displayHeadline,
  eyebrow,
  input as inputStyle,
  monoLabel,
  pagePaper,
  statusBanner,
  tokens,
  viewerWell,
} from '../ux/tokens';

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
// the buyer's new NFT appears in "Your NFTs" without waiting for the indexer.
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

// Page-local styles (page-level helpers come from tokens).

const mainStyle: CSSProperties = {
  maxWidth: 1280,
  margin: '0 auto',
  padding: '32px 24px 64px',
};

const headerStack: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 32 };
const sectionH2: CSSProperties = {
  fontFamily: tokens.font.display,
  fontStyle: 'italic',
  fontSize: tokens.size.lg,
  fontWeight: tokens.weight.medium,
  marginBottom: 16,
};

const sectionHeaderRow: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 12,
  marginBottom: 16,
};

const updatingHint: CSSProperties = { ...monoLabel, color: tokens.color.hint };

const cardGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
  border: tokens.border.primary,
  background: tokens.color.paperPure,
};

// Editorial grid: each card has right + bottom hairlines; the outer container's
// left + top borders close the frame. Adjacent cards share borders cleanly.
const gridCell: CSSProperties = {
  borderRight: tokens.border.primary,
  borderBottom: tokens.border.primary,
  padding: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  background: tokens.color.paperPure,
};

const cardWell: CSSProperties = {
  ...viewerWell,
  aspectRatio: '4 / 3',
  position: 'relative',
};

const cardWellPlaceholder: CSSProperties = {
  ...monoLabel,
  color: 'rgba(255,255,255,0.4)',
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const cardCounter: CSSProperties = {
  ...monoLabel,
  position: 'absolute',
  top: 8,
  left: 8,
  color: 'rgba(255,255,255,0.6)',
};

const cardLayerBadge: CSSProperties = {
  ...monoLabel,
  position: 'absolute',
  top: 8,
  right: 8,
  color: tokens.color.accent,
  letterSpacing: '1.5px',
};

const cardName: CSSProperties = {
  fontFamily: tokens.font.display,
  // plan 2026-06-17-001 — upright (not italic) NFT name, consistent with Browse
  // + /launch cards.
  fontStyle: 'normal',
  fontSize: tokens.size.md,
  fontWeight: tokens.weight.medium,
  // No inline color: inherits ink, so the `.nav-name` :hover accent rule can win
  // (an inline color would out-specify the CSS hover).
};

const cardMeta: CSSProperties = {
  ...monoLabel,
  color: tokens.color.hint,
  letterSpacing: '0.5px',
  textTransform: 'none',
  fontSize: 11,
};

// Click target: the preview well + name navigate to the collection detail
// page. Reproduces gridCell's column gap so wrapping two children in one Link
// doesn't collapse the spacing; the buy/list controls stay OUTSIDE the link.
const cardLink: CSSProperties = {
  textDecoration: 'none',
  color: 'inherit',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  cursor: 'pointer',
};

// Small accent affordance so the card reads as clickable.
const cardDetailHint: CSSProperties = {
  ...monoLabel,
  color: tokens.color.accent,
  letterSpacing: '1px',
  fontSize: 10,
  marginTop: 4,
};

const priceRow: CSSProperties = {
  paddingTop: 12,
  borderTop: tokens.border.divider,
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 12,
};

const priceMain: CSSProperties = {
  fontFamily: tokens.font.display,
  fontStyle: 'italic',
  fontSize: tokens.size.lg,
  fontWeight: tokens.weight.medium,
};

const priceRoyalty: CSSProperties = {
  ...monoLabel,
  color: tokens.color.hint,
  letterSpacing: '1px',
};

const emptyState: CSSProperties = {
  ...monoLabel,
  color: tokens.color.muted,
  textTransform: 'none',
  letterSpacing: '0.5px',
  padding: 24,
  border: `1.5px dashed ${tokens.color.ink}`,
  textAlign: 'center',
};

const errorBanner: CSSProperties = {
  ...monoLabel,
  color: tokens.color.err,
  marginTop: 16,
  padding: '10px 12px',
  border: `1.5px solid ${tokens.color.err}`,
};

const statusBannerStack: CSSProperties = {
  marginTop: 24,
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
  background: tokens.color.ink,
};

const driveLink: CSSProperties = {
  ...monoLabel,
  color: tokens.color.ink,
  textDecoration: 'underline',
  marginLeft: 'auto',
};

const trackLink: CSSProperties = {
  ...monoLabel,
  color: tokens.color.wellInk,
  textDecoration: 'underline',
  marginLeft: 4,
};

const accentText: CSSProperties = { color: tokens.color.accent, fontWeight: 500 };

export function MarketPage() {
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const suiClient = useSuiClient();

  const [reloadKey, setReloadKey] = useState(0);
  const { listings, loading: listingsLoading, error: listingsError } = useListings(
    account?.address,
    reloadKey,
  );

  const { tokens: ownedTokens, loading: tokensLoading } = useOwnedTokens(account?.address, reloadKey);

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
    const filtered = boughtTokenId
      ? listings.filter((l) => l.tokenId !== boughtTokenId)
      : listings;
    // plan 2026-06-17-001 U3 — newest-listed first. A listing with no indexed
    // ItemListed event yet (just-listed via the wallet union, indexer lag)
    // has listedAtMs === undefined → treated as newest so it leads rather than
    // sinking to the bottom while the indexer catches up.
    const at = (l: Listing) => l.listedAtMs ?? Number.POSITIVE_INFINITY;
    return [...filtered].sort((a, b) => at(b) - at(a));
  }, [listings, boughtTokenId]);

  // Tokens already listed are filtered out of the "list" section so the seller
  // can't double-list the same object.
  const listedIds = useMemo(
    () => new Set(visibleListings.map((l) => l.tokenId)),
    [visibleListings],
  );
  const sellable = useMemo(() => {
    const owned = ownedTokens.filter((t) => !listedIds.has(t.tokenId));
    // Inject the fullnode-confirmed buy immediately, ahead of GraphQL indexer
    // catching up. Dedups when useOwnedTokens eventually returns the same id.
    if (confirmedToken && !owned.some((t) => t.tokenId === confirmedToken.tokenId)) {
      owned.push(confirmedToken);
    }
    return owned;
  }, [ownedTokens, listedIds, confirmedToken]);

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
        // it shows in "Your NFTs" without waiting for GraphQL's owner→objects
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
      <div data-testid="market-page" style={pagePaper}>
        <main style={mainStyle}>
          <div style={headerStack}>
            <span style={eyebrow}>— L2 / MARKET</span>
            <h1 style={displayHeadline}>The marketplace.</h1>
            <p style={{ ...monoLabel, color: tokens.color.muted, textTransform: 'none', letterSpacing: '0.5px' }}>
              Connect a wallet to buy and sell NFTs.
            </p>
          </div>
          <SignInButton />
        </main>
      </div>
    );
  }

  return (
    <div data-testid="market-page" style={pagePaper}>
      <main style={mainStyle}>
        <div style={headerStack}>
          <span style={eyebrow}>— L2 / MARKET</span>
          <h1 style={displayHeadline}>The marketplace.</h1>
        </div>

        {/* For sale */}
        <section data-testid="for-sale" style={{ marginBottom: 40 }}>
          <div style={sectionHeaderRow}>
            <h2 style={sectionH2}>For sale.</h2>
            {syncing && (
              <span data-testid="market-syncing" style={updatingHint}>
                · UPDATING…
              </span>
            )}
          </div>
          {listingsError && (
            <p data-testid="listings-error" style={{ ...monoLabel, color: tokens.color.err, letterSpacing: '0.5px', textTransform: 'none' }}>
              × FAILED · Couldn't load listings: {listingsError.message}
            </p>
          )}
          {listingsLoading && (
            <p style={{ ...monoLabel, color: tokens.color.hint }}>— SYNCING LISTINGS</p>
          )}
          {!listingsLoading && visibleListings.length === 0 && (
            <p data-testid="no-listings" style={emptyState}>
              NOTHING FOR SALE YET — LIST ONE OF YOUR NFTS BELOW
            </p>
          )}
          {visibleListings.length > 0 && (
            <div style={cardGrid}>
              {visibleListings.map((l, idx) => {
                const royalty = royaltyOwedMist(l.priceMist);
                const total = l.priceMist + royalty;
                const royaltyPct = (Number(royalty) / Number(l.priceMist)) * 100;
                const well = (
                  <div style={cardWell} data-testid={`listing-preview-${l.tokenId}`}>
                    {l.patchId ? (
                      // Lazy-mount the WebGL canvas (plan 2026-06-17-001 U4) so a
                      // long For-sale grid doesn't blow the WebGL-context cap.
                      <LazyCanvasMount testId={`listing-lazy-${l.tokenId}`}>
                        <PreviewCanvas glbUrl={glbUrlForToken({ patchId: l.patchId, blobId: '' })} />
                      </LazyCanvasMount>
                    ) : (
                      <span style={cardWellPlaceholder}>— NO PREVIEW</span>
                    )}
                    <span style={cardCounter}>{String(idx + 1).padStart(3, '0')}/{String(visibleListings.length).padStart(3, '0')}</span>
                    <span style={cardLayerBadge}>L2 NFT</span>
                  </div>
                );
                return (
                  <div
                    key={l.tokenId}
                    data-testid={`listing-${l.tokenId}`}
                    style={gridCell}
                  >
                    {/* Interactive 3D preview — kept OUTSIDE the details link so a
                        click/drag to rotate it doesn't navigate to the detail page. */}
                    {well}
                    <Link
                      to={`/nft/${l.tokenId}`}
                      data-testid={`listing-details-${l.tokenId}`}
                      aria-label={`View details for ${l.name || l.tokenId}`}
                      className="nav-link"
                      style={cardLink}
                    >
                      <div>
                        <div style={cardName} className="nav-name">{l.name || truncate(l.tokenId)}</div>
                        <div style={cardMeta}>KIOSK {truncate(l.kioskId)}</div>
                        <div style={cardDetailHint}>VIEW DETAILS →</div>
                      </div>
                    </Link>
                    <div style={priceRow}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={priceMain}>{mistToSui(l.priceMist)} SUI</span>
                        <span style={priceRoyalty}>
                          + {mistToSui(royalty)} ROYALTY ({royaltyPct.toFixed(1)}%)
                        </span>
                      </div>
                      <button
                        type="button"
                        data-testid={`buy-${l.tokenId}`}
                        disabled={busy}
                        onClick={() => void onBuy(l.tokenId, l.priceMist, l.kioskId)}
                        style={buttonPrimary}
                      >
                        {busy ? 'APPROVE…' : `BUY · ${mistToSui(total)} SUI`}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Your NFTs → list */}
        <section data-testid="your-nfts">
          <h2 style={sectionH2}>Your NFTs.</h2>
          {tokensLoading && (
            <p style={{ ...monoLabel, color: tokens.color.hint }}>— SYNCING OWNERSHIP</p>
          )}
          {!tokensLoading && sellable.length === 0 && (
            <p data-testid="no-owned" style={emptyState}>
              YOU DON'T OWN ANY UNLISTED NFTS — MINT A COLLECTION ON{' '}
              <Link to="/launch" style={{ color: tokens.color.ink, textDecoration: 'underline' }}>/LAUNCH</Link>
            </p>
          )}
          {sellable.length > 0 && (
            <div style={cardGrid}>
              {sellable.map((t, idx) => {
                const well = (
                  <div style={cardWell} data-testid={`owned-preview-${t.tokenId}`}>
                    {t.patchId || t.blobId ? (
                      <LazyCanvasMount testId={`owned-lazy-${t.tokenId}`}>
                        <PreviewCanvas glbUrl={glbUrlForToken({ patchId: t.patchId, blobId: t.blobId })} />
                      </LazyCanvasMount>
                    ) : (
                      <span style={cardWellPlaceholder}>— NO PREVIEW</span>
                    )}
                    <span style={cardCounter}>{String(idx + 1).padStart(3, '0')}/{String(sellable.length).padStart(3, '0')}</span>
                    <span style={cardLayerBadge}>YOURS</span>
                  </div>
                );
                return (
                <div key={t.tokenId} data-testid={`owned-${t.tokenId}`} style={gridCell}>
                  {/* Interactive 3D preview — outside the details link (rotate ≠ navigate). */}
                  {well}
                  <Link
                    to={`/nft/${t.tokenId}`}
                    data-testid={`owned-details-${t.tokenId}`}
                    aria-label={`View details for ${t.name || t.tokenId}`}
                    className="nav-link"
                    style={cardLink}
                  >
                    <div>
                      <div style={cardName} className="nav-name">{t.name || truncate(t.tokenId)}</div>
                      <div style={cardMeta}>{truncate(t.tokenId)}</div>
                      <div style={cardDetailHint}>VIEW DETAILS →</div>
                    </div>
                  </Link>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 12, borderTop: tokens.border.divider }}>
                    <input
                      data-testid={`price-${t.tokenId}`}
                      placeholder="PRICE IN SUI"
                      value={priceInputs[t.tokenId] ?? ''}
                      onChange={(e) =>
                        setPriceInputs((p) => ({ ...p, [t.tokenId]: e.target.value }))
                      }
                      disabled={busy}
                      style={{ ...inputStyle, width: '100%' }}
                    />
                    <button
                      type="button"
                      data-testid={`list-${t.tokenId}`}
                      disabled={busy}
                      onClick={() => void onList(t.tokenId)}
                      style={buttonOutline}
                    >
                      {busy ? 'APPROVE…' : 'LIST FOR SALE'}
                    </button>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </section>

        {phase === 'error' && errorMsg && (
          <div data-testid="market-error" style={errorBanner}>
            × FAILED · {errorMsg}
          </div>
        )}

        {(boughtTokenId || confirmStatus !== 'idle') && (
          <div style={statusBannerStack}>
            {boughtTokenId && (
              <div data-testid="buy-success" style={statusBanner}>
                <span style={accentText}>✓ PURCHASED</span>
                <span>· {truncate(boughtTokenId)} → YOUR WALLET ·</span>
                <Link
                  to={`/track?model=${boughtTokenId}`}
                  style={trackLink}
                >
                  DRIVE IT ON THE TRACK →
                </Link>
              </div>
            )}
            {confirmStatus === 'syncing' && (
              <div data-testid="confirm-syncing" style={statusBanner}>
                <span style={accentText}>— SYNCING</span>
                <span>· READING NEW TOKEN FROM FULLNODE</span>
              </div>
            )}
            {confirmStatus === 'confirmed' && (
              <div data-testid="confirm-ok" style={statusBanner}>
                <span style={accentText}>✓ CONFIRMED</span>
                <span>· YOUR NEW NFT IS IN YOUR NFTS</span>
              </div>
            )}
            {confirmStatus === 'failed' && (
              <div data-testid="confirm-failed" style={statusBanner}>
                <span style={{ ...accentText, color: tokens.color.err }}>× CONFIRM FAILED</span>
                <span>· {confirmErrorMsg ?? 'Could not confirm via fullnode.'} ·</span>
                <button
                  type="button"
                  onClick={() => setReloadKey((k) => k + 1)}
                  style={{
                    ...monoLabel,
                    background: 'none',
                    border: `1px solid ${tokens.color.wellInk}`,
                    color: tokens.color.wellInk,
                    padding: '4px 10px',
                    cursor: 'pointer',
                    marginLeft: 'auto',
                  }}
                >
                  REFRESH
                </button>
              </div>
            )}
            {boughtTokenId && (
              <div style={{ ...statusBanner, paddingTop: 4, paddingBottom: 12 }}>
                <Link
                  to={`/track?model=${boughtTokenId}`}
                  style={driveLink}
                />
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
