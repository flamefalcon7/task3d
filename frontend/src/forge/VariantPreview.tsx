// U4 — VariantPreview: per plan-003 doc-review D-003, 16 live Babylon canvases
// risk hitting the per-page WebGL context cap (browsers typically 8-16). The
// optimal path is a single shared scene + offscreen thumbnail snapshots; the
// time-boxed v1 path (this implementation) renders ONLY the currently selected
// variant in a live Babylon canvas and shows CSS-color tiles for the rest. The
// CEO mode-review plan note explicitly allows this split (see U4 §Approach
// "PICK THE LATTER FOR V1").
//
// Brutalist editorial styling per D-044: pure-black viewer well, mono caption
// labels, 1.5px ink borders on tiles with accent on the active variant.

import type { CSSProperties } from 'react';
import { useEffect, useMemo } from 'react';
import { PreviewCanvas } from '../babylon/PreviewCanvas';
import { LEGACY_LABEL, type VariantRow } from './VariantEditor';
import { monoLabel, tokens, viewerWell } from '../ux/tokens';

const TILE_FALLBACK = '#cccccc';

// plan-013 U7 — tile swatch resolves to `palette.primary` for legacy bases,
// or the first palette entry as a stable fallback. The tile is a thumbnail
// for selection; the canvas viewport renders the actual swapped GLB so the
// per-segment colors are visible there.
function tileColorFor(row: VariantRow): string {
  return row.palette[LEGACY_LABEL] ?? Object.values(row.palette)[0] ?? TILE_FALLBACK;
}

export interface VariantPreviewProps {
  variants: VariantRow[];
  // The per-variant GLB bytes after the backend material-swap. Undefined while
  // /api/collection/build is still in-flight or hasn't been called yet.
  variantGlbs?: Uint8Array[];
  selectedIndex: number;
  onSelect: (i: number) => void;
}

const wellSized: CSSProperties = {
  ...viewerWell,
  height: 320,
  marginBottom: 12,
  border: tokens.border.primary,
};

const placeholderText: CSSProperties = {
  ...monoLabel,
  color: 'rgba(255,255,255,0.6)',
  textAlign: 'center',
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const tilesRow: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8 };

function tileStyle(active: boolean, colorHex: string): CSSProperties {
  return {
    width: 40,
    height: 40,
    background: colorHex,
    border: active ? `2px solid ${tokens.color.accent}` : tokens.border.primary,
    cursor: 'pointer',
    padding: 0,
  };
}

export function VariantPreview({
  variants,
  variantGlbs,
  selectedIndex,
  onSelect,
}: VariantPreviewProps) {
  // Resolve a blob URL only for the currently-selected variant — sidesteps the
  // WebGL context cap and the URL-revocation churn of creating N URLs upfront.
  const selectedGlbUrl = useMemo(() => {
    const bytes = variantGlbs?.[selectedIndex];
    if (!bytes) return null;
    return URL.createObjectURL(
      new Blob([bytes as BlobPart], { type: 'model/gltf-binary' }),
    );
  }, [variantGlbs, selectedIndex]);

  useEffect(() => {
    if (!selectedGlbUrl) return;
    return () => URL.revokeObjectURL(selectedGlbUrl);
  }, [selectedGlbUrl]);

  return (
    <div data-testid="variant-preview">
      <div style={wellSized} data-testid="variant-preview-canvas">
        {selectedGlbUrl ? (
          <PreviewCanvas glbUrl={selectedGlbUrl} />
        ) : (
          <div style={placeholderText} data-testid="variant-preview-placeholder">
            {variantGlbs
              ? '— SELECT A VARIANT TO PREVIEW'
              : '— CLICK PREVIEW TO BUILD VARIANTS'}
          </div>
        )}
      </div>
      <div style={tilesRow} data-testid="variant-tiles">
        {variants.map((v, i) => {
          const selected = i === selectedIndex;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(i)}
              data-testid={`variant-tile-${i}`}
              aria-pressed={selected}
              title={`Variant ${i + 1} — ${v.textureId}`}
              style={tileStyle(selected, tileColorFor(v))}
            />
          );
        })}
      </div>
    </div>
  );
}
