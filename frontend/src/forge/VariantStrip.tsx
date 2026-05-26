import type { CSSProperties } from 'react';
import { LEGACY_LABEL, type VariantRow } from './VariantEditor';
import { monoLabel, tokens, viewerWell } from '../ux/tokens';

// plan-015 U8 — variant strip (R13). Horizontal row of N 60×80 wells below
// the main preview. Each well shows the variant's representative color +
// a `[L]` lock badge top-right. Active variant gets a 2px accent border
// (sync with VariantPreview's selectedIndex). Locked variants show the [L]
// badge in accent fill — re-roll skips them. Mono `001/010` index sits at
// the bottom of each well.
//
// Wells are CSS rectangles, NOT live canvases — N=16 simultaneous Babylon
// contexts exceeds the browser cap (D-003 rationale). The strip is a
// thumbnail navigator; the active variant renders in the main preview.

const TILE_FALLBACK = '#cccccc';

// Mirror VariantPreview's tileColorFor — pick the variant's most
// representative single hex for the well swatch. Legacy bases collapse
// to palette.primary; segmented bases use the first palette entry by
// insertion order (matches deriveUniqueLabels' order).
function tileColorFor(row: VariantRow): string {
  return row.palette[LEGACY_LABEL] ?? Object.values(row.palette)[0] ?? TILE_FALLBACK;
}

interface Props {
  variants: readonly VariantRow[];
  selectedIndex: number;
  onSelect: (i: number) => void;
  lockedIndices: ReadonlySet<number>;
  onToggleLock: (i: number) => void;
  disabled?: boolean;
}

export function VariantStrip({
  variants,
  selectedIndex,
  onSelect,
  lockedIndices,
  onToggleLock,
  disabled,
}: Props) {
  const total = variants.length;
  return (
    <div data-testid="variant-strip" style={stripStyle}>
      {variants.map((v, i) => {
        const active = i === selectedIndex;
        const locked = lockedIndices.has(i);
        return (
          <button
            key={i}
            type="button"
            data-testid={`variant-strip-tile-${i}`}
            onClick={() => onSelect(i)}
            disabled={disabled}
            aria-pressed={active}
            style={wellStyle(active, locked, tileColorFor(v))}
          >
            <span
              data-testid={`variant-strip-lock-${i}`}
              role="checkbox"
              aria-checked={locked}
              aria-label={`Lock variant ${i + 1}`}
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation(); // don't fire onSelect
                if (!disabled) onToggleLock(i);
              }}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleLock(i);
                }
              }}
              style={lockBadgeStyle(locked)}
            >
              L
            </span>
            <span style={indexLabelStyle}>
              {String(i + 1).padStart(3, '0')}/{String(total).padStart(3, '0')}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const stripStyle: CSSProperties = {
  display: 'flex',
  gap: 6,
  padding: 8,
  overflowX: 'auto',
  border: tokens.border.primary,
  background: tokens.color.paperPure,
  marginTop: 12,
};

function wellStyle(active: boolean, locked: boolean, colorHex: string): CSSProperties {
  return {
    ...viewerWell,
    width: 60,
    height: 80,
    background: colorHex,
    border: active
      ? `2px solid ${tokens.color.accent}`
      : locked
        ? `2px solid ${tokens.color.ink}`
        : tokens.border.primary,
    position: 'relative',
    flexShrink: 0,
    padding: 0,
    cursor: 'pointer',
  };
}

function lockBadgeStyle(locked: boolean): CSSProperties {
  return {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 18,
    height: 18,
    background: locked ? tokens.color.accent : 'rgba(0, 0, 0, 0.55)',
    color: locked ? tokens.color.accentInk : '#FFFFFF',
    fontFamily: tokens.font.mono,
    fontSize: 10,
    letterSpacing: '1px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid rgba(255,255,255,0.35)',
    cursor: 'pointer',
    userSelect: 'none',
  };
}

const indexLabelStyle: CSSProperties = {
  ...monoLabel,
  position: 'absolute',
  bottom: 2,
  left: 2,
  right: 2,
  textAlign: 'center',
  color: '#FFFFFF',
  background: 'rgba(0, 0, 0, 0.55)',
  fontSize: 9,
  letterSpacing: '1px',
  padding: '2px 0',
};
