import type { CSSProperties } from 'react';
import type { OwnedToken } from './useOwnedTokens';
import { monoLabel, tokens } from '../ux/tokens';

// Phase 3 U6 / U11 — horizontal strip of owned-NFT thumbnails. Click a tile
// to swap the loaded car. v1 has no GLB thumbnails (would need a second
// Babylon render-to-texture pass per token), so each tile shows the token
// name + a colored swatch derived from its tokenId. Phase 5 polish can add
// real screenshots.
//
// Brutalist editorial styling per D-044: pure-black background to blend with
// the canvas, italic-serif name + mono uppercase SELECTED label on active.

function truncate(addr: string, head = 4, tail = 4): string {
  if (!addr || addr.length <= head + tail + 1) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

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
  background: tokens.color.well,
};

function tileStyle(selected: boolean): CSSProperties {
  return {
    minWidth: 140,
    padding: 0,
    border: selected ? `2px solid ${tokens.color.accent}` : '1.5px solid rgba(255,255,255,0.2)',
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
  background: tokens.color.well,
  color: tokens.color.wellInk,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const tileName: CSSProperties = {
  fontFamily: tokens.font.display,
  fontStyle: 'italic',
  fontSize: 13,
  fontWeight: tokens.weight.medium,
  color: tokens.color.wellInk,
};

const tileId: CSSProperties = {
  ...monoLabel,
  color: 'rgba(255,255,255,0.5)',
  fontSize: 9,
  letterSpacing: '1px',
};

const selectedLabel: CSSProperties = {
  ...monoLabel,
  color: tokens.color.accent,
  fontSize: 9,
  letterSpacing: '1.5px',
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
              <span style={tileName}>{t.name || `NFT ${truncate(t.tokenId)}`}</span>
              <span style={tileId}>{truncate(t.tokenId)}</span>
              {selected && <span style={selectedLabel}>— SELECTED</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}
