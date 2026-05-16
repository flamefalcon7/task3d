// U4 — VariantPreview: per plan-003 doc-review D-003, 16 live Babylon canvases
// risk hitting the per-page WebGL context cap (browsers typically 8-16). The
// optimal path is a single shared scene + offscreen thumbnail snapshots; the
// time-boxed v1 path (this implementation) renders ONLY the currently selected
// variant in a live Babylon canvas and shows CSS-color tiles for the rest. The
// CEO mode-review plan note explicitly allows this split (see U4 §Approach
// "PICK THE LATTER FOR V1").
//
// Reuses PreviewCanvas's Babylon lifecycle pattern (engine + scene + dispose
// on unmount) by simply rendering PreviewCanvas underneath, scoped to the
// selected variant's GLB URL.

import { useEffect, useMemo } from 'react';
import { PreviewCanvas } from '../babylon/PreviewCanvas';
import type { VariantRow } from './VariantEditor';

export interface VariantPreviewProps {
  variants: VariantRow[];
  // The per-variant GLB bytes after the backend material-swap. Undefined while
  // /api/collection/build is still in-flight or hasn't been called yet.
  variantGlbs?: Uint8Array[];
  selectedIndex: number;
  onSelect: (i: number) => void;
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
      <div
        style={{
          height: 320,
          background: '#15171b',
          marginBottom: 8,
          position: 'relative',
        }}
        data-testid="variant-preview-canvas"
      >
        {selectedGlbUrl ? (
          <PreviewCanvas glbUrl={selectedGlbUrl} />
        ) : (
          <div
            style={{
              color: '#666',
              padding: 16,
              fontSize: 12,
              textAlign: 'center',
              lineHeight: '288px',
            }}
            data-testid="variant-preview-placeholder"
          >
            {variantGlbs
              ? 'Select a variant to preview'
              : 'Click Mint to build variants for preview'}
          </div>
        )}
      </div>
      <div
        style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}
        data-testid="variant-tiles"
      >
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
              style={{
                width: 36,
                height: 36,
                background: v.colorHex,
                border: selected ? '2px solid #fff' : '2px solid #333',
                cursor: 'pointer',
                padding: 0,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
