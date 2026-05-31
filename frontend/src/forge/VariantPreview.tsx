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

import type { CSSProperties, Ref } from 'react';
import { useEffect, useState } from 'react';
import { PreviewCanvas, type PreviewCanvasHandle } from '../babylon/PreviewCanvas';
import type { CanvasMode } from '../babylon/modePalette';
import { LEGACY_LABEL, type VariantRow } from './VariantEditor';
import { monoLabel, tokens, viewerWell } from '../ux/tokens';
import { TurntablePreview } from '../ux/TurntablePreview';

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
  // plan-015 U6 — canvas-prop pass-through. Defaults preserve existing
  // call sites (no mode pill, no picking, no auto-rotate).
  mode?: CanvasMode;
  onModeCycle?: () => void;
  modeToggle?: boolean;
  highlightedParts?: readonly number[];
  onPartClick?: (index: number) => void;
  autoRotate?: boolean;
  /**
   * plan-015 U7 / R9 — live-recolor channel. The active variant's resolved
   * per-part hex colors. PreviewCanvas applies these as a material overlay,
   * so a color picked in VariantEditor updates the preview within frame
   * without a backend rebuild.
   */
  partColors?: readonly string[];
  /**
   * plan-015 U7 / R9 — fallback mesh URL shown when no swapped variant GLB
   * exists yet. Lets the live-recolor overlay paint on top of the base mesh
   * before the user has ever clicked PREVIEW.
   */
  baseGlbUrl?: string | null;
  /**
   * plan-026 — for an ENCRYPTED base there is NO plaintext mesh to live-recolor
   * (it decrypts only after the forker pays). Instead of the misleading
   * "LOADING BASE MESH…" spinner (which never resolves), cycle the public
   * preview stills (faux-turntable) + an honest caption. Colors picked still
   * apply server-side at bake time, after the base decrypts.
   */
  encryptedPreviewUrls?: string[];
  /**
   * plan-017 U3 — imperative dispose/remount handle forwarded to the inner
   * PreviewCanvas so LaunchCollectionPage can free Babylon scene memory
   * during the Walrus upload window.
   */
  previewRef?: Ref<PreviewCanvasHandle>;
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
  mode,
  onModeCycle,
  modeToggle,
  highlightedParts,
  onPartClick,
  autoRotate,
  partColors,
  baseGlbUrl,
  encryptedPreviewUrls = [],
  previewRef,
}: VariantPreviewProps) {
  // Resolve a blob URL only for the currently-selected variant — sidesteps the
  // WebGL context cap and the URL-revocation churn of creating N URLs upfront.
  // plan-015 F1 — URL creation co-located with revocation inside one effect.
  // The pre-fix useMemo/useEffect split could leak a URL under React 19
  // StrictMode's mount→unmount→mount double-invoke (the useMemo ran twice
  // but the cleanup only chased the second value).
  const [selectedGlbUrl, setSelectedGlbUrl] = useState<string | null>(null);
  useEffect(() => {
    const bytes = variantGlbs?.[selectedIndex];
    if (!bytes) {
      setSelectedGlbUrl(null);
      return;
    }
    const url = URL.createObjectURL(
      new Blob([bytes as BlobPart], { type: 'model/gltf-binary' }),
    );
    setSelectedGlbUrl(url);
    return () => {
      URL.revokeObjectURL(url);
      setSelectedGlbUrl(null);
    };
  }, [variantGlbs, selectedIndex]);

  // plan-015 U7 / R9 — live-recolor fallback. When no swapped variant GLB
  // exists yet, show the base mesh so partColors can paint live before the
  // user clicks PREVIEW. selectedGlbUrl (the swapped GLB) wins when present
  // — it carries any baked textures the swap pipeline produced.
  // NOTE (plan-015 F11): the "LOADING BASE MESH…" placeholder below is only
  // reachable when BOTH selectedGlbUrl AND baseGlbUrl are null. In the
  // normal /launch flow, baseGlbUrl is provided by LaunchCollectionPage as
  // soon as onPickBase finishes downloading the base — so that placeholder
  // is effectively unreachable post-base-pick. It remains as defensive
  // fallback for non-/launch consumers (e.g. preview-only mounts that don't
  // pass baseGlbUrl).
  const displayGlbUrl = selectedGlbUrl ?? baseGlbUrl ?? null;

  return (
    <div data-testid="variant-preview">
      <div style={wellSized} data-testid="variant-preview-canvas">
        {displayGlbUrl ? (
          <PreviewCanvas
            ref={previewRef}
            glbUrl={displayGlbUrl}
            mode={mode}
            onModeCycle={onModeCycle}
            modeToggle={modeToggle}
            highlightedParts={highlightedParts}
            onPartClick={onPartClick}
            autoRotate={autoRotate}
            partColors={partColors}
          />
        ) : encryptedPreviewUrls.length > 0 ? (
          // plan-026 — encrypted base: no plaintext mesh to recolor live; cycle the
          // public preview stills (faux-turntable) + an honest caption. Picked
          // colors apply at bake.
          <div
            data-testid="variant-preview-encrypted-still"
            style={{ position: 'relative', width: '100%', height: '100%' }}
          >
            <TurntablePreview
              urls={encryptedPreviewUrls}
              style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
            />
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                padding: '6px 8px',
                fontSize: 11,
                textAlign: 'center',
                background: 'rgba(0,0,0,0.55)',
              }}
            >
              Encrypted base — pick colors now; they apply when you pay to fork & it decrypts.
            </div>
          </div>
        ) : (
          <div style={placeholderText} data-testid="variant-preview-placeholder">
            — LOADING BASE MESH…
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
