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
import type { VariantRow } from './VariantEditor';
import { monoLabel, tokens, viewerWell } from '../ux/tokens';

export interface VariantPreviewProps {
  variants: VariantRow[];
  // The per-variant GLB bytes after the backend material-swap. Undefined while
  // /api/collection/build is still in-flight or hasn't been called yet.
  variantGlbs?: Uint8Array[];
  // The base GLB bytes — rendered as a "preview of the fork" while variantGlbs
  // is still undefined, so picking a base immediately shows what you're about
  // to mint. Once variantGlbs arrives it takes over.
  baseGlb?: Uint8Array;
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

const baseCaption: CSSProperties = {
  ...monoLabel,
  position: 'absolute',
  bottom: 10,
  left: 12,
  color: 'rgba(255,255,255,0.7)',
  letterSpacing: '1.5px',
  pointerEvents: 'none',
};

export function VariantPreview({
  variants,
  variantGlbs,
  baseGlb,
  selectedIndex,
  onSelect,
}: VariantPreviewProps) {
  // Variant render takes priority once it exists; base is the fallback so the
  // user sees what they're about to fork the moment they pick a base model.
  const selectedGlbUrl = useMemo(() => {
    const bytes = variantGlbs?.[selectedIndex];
    if (!bytes) return null;
    return URL.createObjectURL(
      new Blob([bytes as BlobPart], { type: 'model/gltf-binary' }),
    );
  }, [variantGlbs, selectedIndex]);

  const baseGlbUrl = useMemo(() => {
    if (!baseGlb || variantGlbs) return null;
    return URL.createObjectURL(
      new Blob([baseGlb as BlobPart], { type: 'model/gltf-binary' }),
    );
  }, [baseGlb, variantGlbs]);

  useEffect(() => {
    if (!selectedGlbUrl) return;
    return () => URL.revokeObjectURL(selectedGlbUrl);
  }, [selectedGlbUrl]);

  useEffect(() => {
    if (!baseGlbUrl) return;
    return () => URL.revokeObjectURL(baseGlbUrl);
  }, [baseGlbUrl]);

  const renderUrl = selectedGlbUrl ?? baseGlbUrl;
  const showingBase = !selectedGlbUrl && !!baseGlbUrl;

  return (
    <div data-testid="variant-preview">
      <div style={wellSized} data-testid="variant-preview-canvas">
        {renderUrl ? (
          <>
            <PreviewCanvas glbUrl={renderUrl} />
            {showingBase && (
              <span style={baseCaption} data-testid="variant-preview-base-caption">
                — BASE MODEL · CLICK PREVIEW TO APPLY VARIANTS
              </span>
            )}
          </>
        ) : (
          <div style={placeholderText} data-testid="variant-preview-placeholder">
            {variantGlbs
              ? '— SELECT A VARIANT TO PREVIEW'
              : '— PICK A BASE MODEL ABOVE'}
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
              style={tileStyle(selected, v.colorHex)}
            />
          );
        })}
      </div>
    </div>
  );
}
