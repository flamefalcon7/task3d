import type { CSSProperties } from 'react';
import { useEffect, useRef } from 'react';
import { tokens } from '../ux/tokens';

// plan-015 U4 — vertical part-list panel. One row per filtered mesh,
// two-way wired with the canvas: clicking a row fires onSelect(index)
// which (in the parent) drives canvas SOLO-highlight + camera focus;
// canvas POINTERPICK fires onSelect from the other direction and the
// matching row scrolls into view via the selectedIndex effect.
//
// Used on /create tagging step (U5, list of parts to name) and /launch
// (U6, list of parts coupled with VariantEditor columns).

export interface PartListItem {
  /** Filtered mesh index — stable across loads of the same GLB. */
  index: number;
  /** Display name; empty string renders the "—" placeholder. */
  label?: string;
  /**
   * Optional hex color swatch; in PARTS mode this should match the
   * canvas's deterministic per-index rainbow (partsColor()).
   */
  colorHex?: string;
}

interface PartListPanelProps {
  parts: readonly PartListItem[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  /** Max panel height — content scrolls past this. Default 320px. */
  maxHeight?: number | string;
  /** Test id suffix when multiple panels mount on one page. */
  testIdSuffix?: string;
}

export function PartListPanel({
  parts,
  selectedIndex,
  onSelect,
  maxHeight = 320,
  testIdSuffix,
}: PartListPanelProps) {
  const tid = (key: string) =>
    testIdSuffix ? `part-list-${key}-${testIdSuffix}` : `part-list-${key}`;

  const activeRowRef = useRef<HTMLButtonElement>(null);

  // Scroll the selected row into view whenever selectedIndex changes from
  // outside the panel (e.g., a canvas POINTERPICK). `block: 'nearest'`
  // avoids janky full-jumps when the row is already visible. Optional-chain
  // the method call itself because jsdom doesn't ship scrollIntoView; all
  // production browsers do.
  useEffect(() => {
    if (selectedIndex == null) return;
    activeRowRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [selectedIndex]);

  if (parts.length === 0) {
    return (
      <div data-testid={tid('empty')} style={emptyStyle}>
        <span style={emptyLabelStyle}>NO PARTS LOADED</span>
      </div>
    );
  }

  return (
    <div data-testid={tid('panel')} style={{ ...panelStyle, maxHeight }}>
      {parts.map((part) => {
        const active = part.index === selectedIndex;
        return (
          <button
            key={part.index}
            ref={active ? activeRowRef : null}
            type="button"
            data-testid={tid(`row-${part.index}`)}
            onClick={() => onSelect(part.index)}
            style={rowStyle(active)}
            aria-pressed={active}
          >
            <span style={indexStyle}>{formatIndex(part.index)}</span>
            {part.colorHex && (
              <span
                data-testid={tid(`swatch-${part.index}`)}
                style={{ ...swatchStyle, background: part.colorHex }}
                aria-hidden
              />
            )}
            <span style={labelStyle(part.label)}>
              {part.label && part.label.length > 0 ? part.label : '—'}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Zero-pad to 2 digits so single-digit indices align in the mono pill column.
// Indices above 99 are unlikely for variant collections (cap 20 parts) but
// render as plain numbers if they ever appear.
function formatIndex(i: number): string {
  return i < 100 ? String(i + 1).padStart(2, '0') : String(i + 1);
}

const panelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: 8,
  background: tokens.color.paperPure,
  border: tokens.border.primary,
  overflowY: 'auto',
};

const emptyStyle: CSSProperties = {
  ...panelStyle,
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
};

const emptyLabelStyle: CSSProperties = {
  fontFamily: tokens.font.mono,
  fontSize: tokens.size.xs,
  letterSpacing: '1.5px',
  textTransform: 'uppercase',
  color: tokens.color.hint,
};

function rowStyle(active: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 8px',
    background: active ? tokens.color.ink : tokens.color.paperPure,
    color: active ? tokens.color.paper : tokens.color.ink,
    border: active ? `2px solid ${tokens.color.accent}` : tokens.border.hairline,
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: tokens.font.body,
  };
}

const indexStyle: CSSProperties = {
  fontFamily: tokens.font.mono,
  fontSize: tokens.size.xs,
  letterSpacing: '1px',
  minWidth: 24,
};

const swatchStyle: CSSProperties = {
  width: 12,
  height: 12,
  border: '1px solid rgba(0,0,0,0.2)',
  flexShrink: 0,
};

function labelStyle(hasLabel: string | undefined): CSSProperties {
  return {
    fontFamily: tokens.font.mono,
    fontSize: tokens.size.sm,
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
    color: hasLabel ? 'inherit' : tokens.color.hint,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
  };
}
