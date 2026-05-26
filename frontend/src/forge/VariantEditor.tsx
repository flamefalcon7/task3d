// U4 — VariantEditor: 1-16 rows, each with a color picker + texture dropdown.
// Per-variant pricing toggle (D-005): default off (all rows share globalPrice).
// AE5: variant count is hard-capped at 16 by the Move contract (MAX_VARIANTS)
// AND by the UI here so users can't even ask for more than the chain allows.
//
// Brutalist editorial styling per D-044: paper-pure rows separated by ink
// hairlines, mono uppercase labels, no rounded corners, accent border on
// active inputs (via CSS focus state).

import type { CSSProperties } from 'react';
import { useCallback } from 'react';
import { TEXTURE_LIBRARY, type TextureId } from '@overflow2026/shared';
import { HelpIcon } from '../ux/HelpIcon';
import { buttonOutline, input as inputStyle, monoLabel, tokens } from '../ux/tokens';

export const MIN_VARIANTS = 1;
export const MAX_VARIANTS = 16;

// plan-013 U7 — per-variant palette is a label→hex map. Each entry covers a
// single unique semantic part label (typically 3-5 entries: primary, secondary,
// accent, detail). `LaunchCollectionPage.runBuildVariants` resolves the palette
// against the base model's `partLabels` array to produce the positional
// `partColors[]` the backend swap pipeline consumes. The legacy single-material
// shape collapses to `{ primary: '#cc3333' }` (uniqueLabels = ['primary']).
export const LEGACY_LABEL = 'primary';
const DEFAULT_HEX = '#cc3333';

export interface VariantRow {
  /**
   * Hex colors keyed by part label. Hex format mirrors `<input type="color">`
   * output (e.g., '#ff0033'). Converted to [r,g,b,1] 0-1 floats by
   * `hexToBaseColorRgb` at build-request time.
   */
  palette: Record<string, string>;
  textureId: TextureId;
  // Per-variant price in MIST. Only consulted when pricing toggle is on.
  priceMist: bigint;
}

export interface VariantEditorState {
  variants: VariantRow[];
  globalPriceMist: bigint;
  // null = single-price mode (all variants use globalPriceMist).
  // Map (by index) = per-variant prices, each row's `priceMist` is canonical.
  perVariantPricing: boolean;
}

export interface VariantEditorProps {
  state: VariantEditorState;
  onChange: (next: VariantEditorState) => void;
  /**
   * Positional per-part labels from the base Model3D (plan-013). Empty array
   * is the legacy single-material sentinel; the editor renders one color
   * picker per unique label (typically 3-5 rows for segmented bases, 1 for
   * legacy bases).
   */
  partLabels?: string[];
  /**
   * plan-015 U7 — fires when the user hovers / leaves a column header.
   * Parent uses this to flip the canvas into SOLO mode with matching part
   * indices highlighted (AE4 win). `null` on mouseleave.
   */
  onColumnHover?: (label: string | null) => void;
  disabled?: boolean;
}

/**
 * Derive the ordered list of distinct labels driving the editor UI. Order is
 * first-occurrence in `partLabels` so the palette columns reflect GLB node
 * order. Legacy (empty) bases collapse to `['primary']` — one color picker
 * per variant, preserving the pre-segmentation UX.
 */
export function deriveUniqueLabels(partLabels: string[]): string[] {
  if (partLabels.length === 0) return [LEGACY_LABEL];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of partLabels) {
    if (!seen.has(l)) {
      seen.add(l);
      out.push(l);
    }
  }
  return out;
}

export function newVariantRow(opts: { uniqueLabels?: string[]; seed?: Partial<VariantRow> } = {}): VariantRow {
  const labels = opts.uniqueLabels ?? [LEGACY_LABEL];
  const palette: Record<string, string> = Object.fromEntries(
    labels.map((l) => [l, DEFAULT_HEX]),
  );
  return {
    palette,
    textureId: TEXTURE_LIBRARY[0],
    priceMist: 100_000_000n,
    ...opts.seed,
  };
}

export function newVariantEditorState(uniqueLabels?: string[]): VariantEditorState {
  return {
    variants: [newVariantRow({ uniqueLabels })],
    globalPriceMist: 100_000_000n,
    perVariantPricing: false,
  };
}

// Convert hex (#rrggbb) → [r,g,b,1] floats in 0-1, glTF PBR convention.
export function hexToBaseColorRgb(hex: string): [number, number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [1, 1, 1, 1];
  const n = parseInt(m[1]!, 16);
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255, 1];
}

const headerRow: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  marginBottom: 12,
};

const countLabel: CSSProperties = {
  ...monoLabel,
  color: tokens.color.muted,
};

const stepperBtn: CSSProperties = {
  ...buttonOutline,
  padding: '4px 12px',
  fontSize: 14,
  minWidth: 36,
};

const stepperRow: CSSProperties = { display: 'flex', gap: 8 };

const pricingRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  flexWrap: 'wrap',
  marginBottom: 16,
  paddingBottom: 16,
  borderBottom: tokens.border.primary,
};

const sublabel: CSSProperties = { ...monoLabel, color: tokens.color.muted };

const table: CSSProperties = {
  borderCollapse: 'collapse',
  width: '100%',
  border: tokens.border.primary,
};

const thStyle: CSSProperties = {
  ...monoLabel,
  textAlign: 'left',
  padding: '8px 10px',
  borderBottom: tokens.border.primary,
  background: tokens.color.paperPure,
  color: tokens.color.muted,
};

const tdStyle: CSSProperties = {
  padding: '8px 10px',
  borderBottom: '0.5px solid rgba(0,0,0,0.2)',
  fontFamily: tokens.font.body,
  fontSize: 14,
};

const rowIndex: CSSProperties = {
  ...monoLabel,
  color: tokens.color.muted,
};

// plan-015 U7 — heading + help-icon row above the palette table (R12 L2).
const columnAreaHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  marginBottom: 8,
};

const columnAreaTitle: CSSProperties = {
  ...monoLabel,
  color: tokens.color.ink,
  letterSpacing: '1.5px',
};

// plan-015 U7 — subhead below column headers (R7 / AE3 "the win"). Mono
// uppercase, muted, lives inside the thead as a colspan row so it scrolls
// with the table if the user widens the variant count to scrollable depth.
const subheadCell: CSSProperties = {
  ...monoLabel,
  color: tokens.color.hint,
  textAlign: 'left',
  padding: '6px 10px',
  background: tokens.color.paperPure,
  borderBottom: tokens.border.primary,
  letterSpacing: '1.5px',
  fontWeight: tokens.weight.regular,
};

export function VariantEditor({
  state,
  onChange,
  partLabels,
  onColumnHover,
  disabled,
}: VariantEditorProps) {
  const canAdd = state.variants.length < MAX_VARIANTS;
  const canRemove = state.variants.length > MIN_VARIANTS;
  const uniqueLabels = deriveUniqueLabels(partLabels ?? []);
  // plan-015 U7 — column count for the subhead colspan (index + N labels +
  // texture + optional price column).
  const totalColumnCount =
    1 + uniqueLabels.length + 1 + (state.perVariantPricing ? 1 : 0);

  const updateRow = useCallback(
    (i: number, patch: Partial<VariantRow>) => {
      const next = state.variants.map((row, idx) =>
        idx === i ? { ...row, ...patch } : row,
      );
      onChange({ ...state, variants: next });
    },
    [state, onChange],
  );

  const setRowPalette = useCallback(
    (i: number, label: string, hex: string) => {
      const next = state.variants.map((row, idx) =>
        idx === i ? { ...row, palette: { ...row.palette, [label]: hex } } : row,
      );
      onChange({ ...state, variants: next });
    },
    [state, onChange],
  );

  const addRow = useCallback(() => {
    if (!canAdd) return;
    onChange({
      ...state,
      variants: [
        ...state.variants,
        newVariantRow({
          uniqueLabels,
          // When per-variant pricing is off, seed each new row with the current
          // global price so it's correct if the user later toggles on.
          seed: { priceMist: state.globalPriceMist },
        }),
      ],
    });
  }, [state, onChange, canAdd, uniqueLabels]);

  const removeRow = useCallback(() => {
    if (!canRemove) return;
    onChange({ ...state, variants: state.variants.slice(0, -1) });
  }, [state, onChange, canRemove]);

  const setGlobalPrice = useCallback(
    (mist: bigint) => {
      // In single-price mode, also sync every row's priceMist so the value is
      // canonical and the mint flow can read row.priceMist regardless of mode.
      if (!state.perVariantPricing) {
        const synced = state.variants.map((r) => ({ ...r, priceMist: mist }));
        onChange({ ...state, globalPriceMist: mist, variants: synced });
      } else {
        onChange({ ...state, globalPriceMist: mist });
      }
    },
    [state, onChange],
  );

  const togglePerVariantPricing = useCallback(() => {
    const turningOn = !state.perVariantPricing;
    if (turningOn) {
      // Preserve the existing per-row priceMist values — they're already
      // seeded from globalPriceMist when rows were added.
      onChange({ ...state, perVariantPricing: true });
    } else {
      // Reset every row to the current global price (D-005: toggle OFF discards
      // per-row edits).
      const synced = state.variants.map((r) => ({
        ...r,
        priceMist: state.globalPriceMist,
      }));
      onChange({ ...state, perVariantPricing: false, variants: synced });
    }
  }, [state, onChange]);

  return (
    <div data-testid="variant-editor">
      <div style={headerRow}>
        <span style={countLabel}>
          — {state.variants.length} VARIANT{state.variants.length === 1 ? '' : 'S'} (MAX {MAX_VARIANTS})
        </span>
        <div style={stepperRow}>
          <button
            type="button"
            onClick={removeRow}
            disabled={disabled || !canRemove}
            data-testid="variant-remove"
            style={stepperBtn}
          >
            −
          </button>
          <button
            type="button"
            onClick={addRow}
            disabled={disabled || !canAdd}
            data-testid="variant-add"
            style={stepperBtn}
          >
            +
          </button>
        </div>
      </div>

      <div style={pricingRow}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={sublabel}>PRICE PER VARIANT (MIST)</span>
          <input
            type="text"
            inputMode="numeric"
            value={state.globalPriceMist.toString()}
            disabled={disabled}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9]/g, '');
              setGlobalPrice(v === '' ? 0n : BigInt(v));
            }}
            data-testid="global-price-input"
            style={{ ...inputStyle, width: 160 }}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={state.perVariantPricing}
            disabled={disabled}
            onChange={togglePerVariantPricing}
            data-testid="per-variant-pricing-toggle"
          />
          <span style={sublabel}>PER-VARIANT PRICING</span>
        </label>
      </div>

      <div style={columnAreaHeader}>
        <span style={columnAreaTitle}>PALETTE COLUMNS</span>
        <HelpIcon
          testId="variant-editor-help"
          title="Why these columns?"
          body="Each column is a customization axis the base's creator named. Pick a color for each axis to define this variant's identity."
        />
      </div>
      <table style={table}>
        <thead>
          <tr>
            <th style={thStyle}>#</th>
            {uniqueLabels.map((label) => (
              <th
                key={label}
                style={thStyle}
                data-testid={`palette-col-${label}`}
                onMouseEnter={onColumnHover ? () => onColumnHover(label) : undefined}
                onMouseLeave={onColumnHover ? () => onColumnHover(null) : undefined}
              >
                {label.toUpperCase()}
              </th>
            ))}
            <th style={thStyle}>TEXTURE</th>
            {state.perVariantPricing && <th style={thStyle}>PRICE (MIST)</th>}
          </tr>
          {/* plan-015 U7 / R7 / AE3 — subhead row reinforces authorship of
              the column labels. Colspan covers every column so the line
              spans the full table width regardless of pricing mode. */}
          <tr data-testid="variant-editor-subhead">
            <th colSpan={totalColumnCount} style={subheadCell}>
              — COLUMNS REFLECT THE LABELS THIS BASE'S CREATOR SET WHEN
              PUBLISHING.
            </th>
          </tr>
        </thead>
        <tbody>
          {state.variants.map((row, i) => (
            <tr key={i} data-testid={`variant-row-${i}`}>
              <td style={{ ...tdStyle, ...rowIndex }}>{String(i + 1).padStart(3, '0')}</td>
              {uniqueLabels.map((label) => (
                <td key={label} style={tdStyle}>
                  <input
                    type="color"
                    value={row.palette[label] ?? DEFAULT_HEX}
                    disabled={disabled}
                    onChange={(e) => setRowPalette(i, label, e.target.value)}
                    data-testid={`variant-color-${i}-${label}`}
                    style={{ border: tokens.border.primary, padding: 0, width: 40, height: 28, background: 'none' }}
                  />
                </td>
              ))}
              <td style={tdStyle}>
                <select
                  value={row.textureId}
                  disabled={disabled}
                  onChange={(e) =>
                    updateRow(i, { textureId: e.target.value as TextureId })
                  }
                  data-testid={`variant-texture-${i}`}
                  style={{ ...inputStyle, padding: '4px 8px', fontSize: 13 }}
                >
                  {TEXTURE_LIBRARY.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </td>
              {state.perVariantPricing && (
                <td style={tdStyle}>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={row.priceMist.toString()}
                    disabled={disabled}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9]/g, '');
                      updateRow(i, { priceMist: v === '' ? 0n : BigInt(v) });
                    }}
                    data-testid={`variant-price-${i}`}
                    style={{ ...inputStyle, width: 140 }}
                  />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
