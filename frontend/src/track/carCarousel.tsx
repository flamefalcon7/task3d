import type { CSSProperties } from 'react';
import type { OwnedToken } from './useOwnedTokens';
import { RAGE_RACING, truncateId } from './rageRacing/brand';

// Rage Racing garage strip — horizontal row of the cars the player owns,
// IMPORTED from a Tusk3D collection (plan 2026-06-05-001). Click a tile to
// swap the loaded car. v1 has no GLB thumbnails (would need a second Babylon
// render-to-texture pass per token), so each tile shows the car name + a
// colored swatch derived from its id.
//
// Reskinned to the Electric Arcade identity (rageRacing/brand): near-black
// background, electric-yellow selected state — DELIBERATELY not Tusk3D's
// orangered, so the strip reads as a different studio's UI.

// Pure objectId-hash → CSS color. Deterministic so the same variant always
// gets the same swatch, gives the carousel some visual variety without
// shipping thumbnails.
function swatch(objectId: string): string {
  let h = 0;
  for (let i = 0; i < objectId.length; i++) {
    h = (h * 31 + objectId.charCodeAt(i)) | 0;
  }
  const hue = ((h % 360) + 360) % 360;
  return `hsl(${hue} 55% 60%)`;
}

export interface CarCarouselProps {
  tokens: OwnedToken[];
  selectedIdx: number;
  onSelect: (idx: number) => void;
}

const carouselRow: CSSProperties = {
  display: 'flex',
  gap: 12,
  overflowX: 'auto',
  padding: '16px 0',
  background: RAGE_RACING.color.surface,
};

function tileStyle(selected: boolean): CSSProperties {
  return {
    minWidth: 140,
    padding: 0,
    border: selected
      ? `2px solid ${RAGE_RACING.color.accent}`
      : '1.5px solid rgba(255,255,255,0.2)',
    background: 'transparent',
    cursor: 'pointer',
    textAlign: 'left',
    display: 'flex',
    flexDirection: 'column',
  };
}

const tileSwatch: CSSProperties = {
  width: '100%',
  height: 64,
};

const tileBody: CSSProperties = {
  padding: '8px 12px',
  background: RAGE_RACING.color.surface,
  color: RAGE_RACING.color.ink,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const tileName: CSSProperties = {
  fontFamily: RAGE_RACING.font.display,
  fontWeight: 600,
  fontSize: 14,
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
  color: RAGE_RACING.color.ink,
};

const tileId: CSSProperties = {
  fontFamily: RAGE_RACING.font.mono,
  color: RAGE_RACING.color.inkFaint,
  fontSize: 9,
  letterSpacing: '1px',
};

const selectedLabel: CSSProperties = {
  fontFamily: RAGE_RACING.font.mono,
  color: RAGE_RACING.color.secondary,
  fontSize: 9,
  letterSpacing: '1.5px',
  textTransform: 'uppercase',
};

export function CarCarousel({
  tokens: ownedTokens,
  selectedIdx,
  onSelect,
}: CarCarouselProps) {
  return (
    <div data-testid="car-carousel" style={carouselRow}>
      {ownedTokens.map((t, idx) => {
        const selected = idx === selectedIdx;
        return (
          <button
            key={t.tokenId}
            data-testid={`carousel-tile-${idx}`}
            data-selected={selected ? 'true' : 'false'}
            onClick={() => onSelect(idx)}
            type="button"
            style={tileStyle(selected)}
          >
            <div aria-hidden style={{ ...tileSwatch, background: swatch(t.tokenId) }} />
            <div style={tileBody}>
              <span style={tileName}>{t.name || `Car ${truncateId(t.tokenId, 4)}`}</span>
              <span style={tileId}>imported · {truncateId(t.tokenId, 4)}</span>
              {selected && <span style={selectedLabel}>▶ in garage</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}
