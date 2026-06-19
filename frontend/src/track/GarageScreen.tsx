import type { CSSProperties } from 'react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PreviewCanvas } from '../babylon/PreviewCanvas';
import { SignInButton } from '../auth/SignInButton';
import { glbUrlForToken } from '../walrus/aggregator';
import type { OwnedToken } from './useOwnedTokens';
import {
  RAGE_RACING,
  DEFAULT_CAR_GLB_URL,
  arcadeLabel,
  arcadeTitle,
  studioCredit,
  truncateId,
  wordmark,
} from './rageRacing/brand';

// Plan-2026-06-18-002 — pre-race "Garage" car-select screen. Replaces the
// in-game carousel strip: the player picks a car HERE, then the race goes
// full-screen. Two cards, each with a slowly auto-rotating live 3D preview
// (reusing the proven `PreviewCanvas`): the always-available Starter Car, and
// the bound Tusk3D collection — locked-with-a-buy-prompt for non-owners, or a
// pickable list of the player's owned NFTs.

export interface GarageScreenProps {
  defaultCarToken: OwnedToken;
  /** Owned NFTs from the bound collection, newest first (excludes default car). */
  nfts: OwnedToken[];
  /** Whether a wallet is connected. */
  hasWallet: boolean;
  /** Owned-tokens query still in flight. */
  loading: boolean;
  /** Bound collection id, for the buy-collection link. */
  collectionId: string;
  onDrive: (token: OwnedToken) => void;
}

const stage: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: RAGE_RACING.color.surface,
  color: RAGE_RACING.color.ink,
  overflow: 'auto',
  display: 'flex',
  flexDirection: 'column',
  padding: '24px 24px 48px',
};

const header: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  marginBottom: 20,
};

const cardRow: CSSProperties = {
  display: 'flex',
  gap: 24,
  flexWrap: 'wrap',
  flex: 1,
  alignItems: 'stretch',
  maxWidth: 1100,
  width: '100%',
  margin: '0 auto',
};

const card: CSSProperties = {
  flex: '1 1 320px',
  minWidth: 300,
  display: 'flex',
  flexDirection: 'column',
  border: `1.5px solid rgba(255,229,0,0.25)`,
  background: '#101015',
};

const previewBox: CSSProperties = {
  position: 'relative',
  width: '100%',
  height: 300,
  background: '#0B0B0F',
  overflow: 'hidden',
};

const cardBody: CSSProperties = {
  padding: '16px 18px 18px',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  flex: 1,
};

const cardTitle: CSSProperties = {
  ...arcadeTitle,
  fontSize: 24,
};

const cardSub: CSSProperties = {
  ...arcadeLabel,
  color: RAGE_RACING.color.inkDim,
  textTransform: 'none',
  letterSpacing: '0.5px',
};

const driveButton: CSSProperties = {
  marginTop: 'auto',
  padding: '12px 16px',
  border: 'none',
  background: RAGE_RACING.color.accent,
  color: '#000',
  fontFamily: RAGE_RACING.font.display,
  fontWeight: 700,
  fontSize: 16,
  letterSpacing: '1px',
  textTransform: 'uppercase',
  fontStyle: 'italic',
  cursor: 'pointer',
};

const nftListRow: CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
};

function nftOptionStyle(selected: boolean): CSSProperties {
  return {
    padding: '6px 10px',
    border: selected
      ? `2px solid ${RAGE_RACING.color.accent}`
      : '1.5px solid rgba(255,255,255,0.2)',
    background: 'transparent',
    color: RAGE_RACING.color.ink,
    fontFamily: RAGE_RACING.font.mono,
    fontSize: 11,
    letterSpacing: '0.5px',
    cursor: 'pointer',
  };
}

const buyLink: CSSProperties = {
  ...arcadeLabel,
  color: RAGE_RACING.color.accent,
  textTransform: 'none',
  letterSpacing: '0.5px',
  textDecoration: 'none',
};

const lockedNote: CSSProperties = {
  ...arcadeLabel,
  color: RAGE_RACING.color.inkDim,
  textTransform: 'none',
  letterSpacing: '0.5px',
};

export function GarageScreen({
  defaultCarToken,
  nfts,
  hasWallet,
  loading,
  collectionId,
  onDrive,
}: GarageScreenProps) {
  // Which owned NFT is highlighted in card B (preview spins the highlighted one).
  const [nftIdx, setNftIdx] = useState(0);
  const owns = nfts.length > 0;
  const highlighted = owns ? nfts[Math.min(nftIdx, nfts.length - 1)] : null;

  return (
    <div style={stage} data-testid="garage-screen">
      <div style={header}>
        <h1 style={wordmark}>{RAGE_RACING.game}</h1>
        <span style={studioCredit}>{RAGE_RACING.studioCredit} · CHOOSE YOUR RIDE</span>
      </div>

      <div style={cardRow}>
        {/* Card A — Starter Car (always available, no wallet needed) */}
        <div style={card} data-testid="garage-default-card">
          <div style={previewBox}>
            <PreviewCanvas
              glbUrl={DEFAULT_CAR_GLB_URL}
              autoRotate
              bgToggle={false}
              testIdSuffix="-garage-default"
            />
          </div>
          <div style={cardBody}>
            <span style={cardTitle}>Starter Car</span>
            <span style={cardSub}>Free to drive · no wallet needed</span>
            <button
              type="button"
              style={driveButton}
              data-testid="garage-default-drive"
              onClick={() => onDrive(defaultCarToken)}
            >
              Drive ▶
            </button>
          </div>
        </div>

        {/* Card B — NFT Collection */}
        <div style={card} data-testid="garage-nft-card">
          <div style={previewBox}>
            {owns && highlighted && (
              <PreviewCanvas
                glbUrl={glbUrlForToken(highlighted)}
                autoRotate
                bgToggle={false}
                testIdSuffix="-garage-nft"
              />
            )}
            {!owns && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: RAGE_RACING.color.inkFaint,
                  fontFamily: RAGE_RACING.font.display,
                  fontSize: 40,
                }}
                aria-hidden
              >
                🔒
              </div>
            )}
          </div>
          <div style={cardBody}>
            <span style={cardTitle}>Your NFT Car</span>
            {loading && (
              <span style={cardSub} data-testid="garage-nft-loading">
                — loading your garage…
              </span>
            )}
            {!loading && owns && (
              <>
                <span style={cardSub}>Imported from a Tusk3D collection</span>
                <div style={nftListRow} data-testid="garage-nft-list">
                  {nfts.map((t, i) => (
                    <button
                      key={t.tokenId}
                      type="button"
                      data-testid={`garage-nft-option-${i}`}
                      data-selected={i === nftIdx ? 'true' : 'false'}
                      style={nftOptionStyle(i === nftIdx)}
                      onClick={() => setNftIdx(i)}
                    >
                      {t.name || `Car ${truncateId(t.tokenId, 4)}`}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  style={driveButton}
                  data-testid="garage-nft-drive"
                  onClick={() => highlighted && onDrive(highlighted)}
                >
                  Drive ▶
                </button>
              </>
            )}
            {!loading && !owns && (
              <>
                <span style={lockedNote}>
                  {hasWallet
                    ? "You don't own a car from this collection yet."
                    : 'Connect your wallet to drive a car you own.'}
                </span>
                <Link
                  to={`/collection/${collectionId}`}
                  style={buyLink}
                  data-testid="garage-buy-cta"
                >
                  Own a car from this collection to drive it here →
                </Link>
                {!hasWallet && (
                  <div style={{ maxWidth: 280 }} data-testid="garage-connect">
                    <SignInButton />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
