// U4 — VariantEditor: 1-16 rows, each with a color picker + texture dropdown.
// Per-variant pricing toggle (D-005): default off (all rows share globalPrice).
// AE5: variant count is hard-capped at 16 by the Move contract (MAX_VARIANTS)
// AND by the UI here so users can't even ask for more than the chain allows.

import { useCallback } from 'react';
import { TEXTURE_LIBRARY, type TextureId } from '@overflow2026/shared';

export const MIN_VARIANTS = 1;
export const MAX_VARIANTS = 16;

export interface VariantRow {
  // Hex color string from <input type="color"> (e.g., '#ff0033').
  // Converted to [r,g,b,1] 0-1 floats by toBaseColorRgb at mint time.
  colorHex: string;
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
  disabled?: boolean;
}

export function newVariantRow(seed: Partial<VariantRow> = {}): VariantRow {
  return {
    colorHex: '#cc3333',
    textureId: TEXTURE_LIBRARY[0],
    priceMist: 100_000_000n,
    ...seed,
  };
}

export function newVariantEditorState(): VariantEditorState {
  return {
    variants: [newVariantRow({ colorHex: '#cc3333' })],
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

export function VariantEditor({ state, onChange, disabled }: VariantEditorProps) {
  const canAdd = state.variants.length < MAX_VARIANTS;
  const canRemove = state.variants.length > MIN_VARIANTS;

  const updateRow = useCallback(
    (i: number, patch: Partial<VariantRow>) => {
      const next = state.variants.map((row, idx) =>
        idx === i ? { ...row, ...patch } : row,
      );
      onChange({ ...state, variants: next });
    },
    [state, onChange],
  );

  const addRow = useCallback(() => {
    if (!canAdd) return;
    const seed: Partial<VariantRow> = {
      // When per-variant pricing is off, seed each new row with the current
      // global price so it's correct if the user later toggles on.
      priceMist: state.globalPriceMist,
    };
    onChange({ ...state, variants: [...state.variants, newVariantRow(seed)] });
  }, [state, onChange, canAdd]);

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
      <div style={{ marginBottom: 8 }}>
        <strong>{state.variants.length}</strong> variant
        {state.variants.length === 1 ? '' : 's'}{' '}
        <button
          type="button"
          onClick={addRow}
          disabled={disabled || !canAdd}
          data-testid="variant-add"
        >
          +
        </button>{' '}
        <button
          type="button"
          onClick={removeRow}
          disabled={disabled || !canRemove}
          data-testid="variant-remove"
        >
          −
        </button>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label>
          Price per variant (MIST):{' '}
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
            style={{ width: 140 }}
          />
        </label>{' '}
        <label>
          <input
            type="checkbox"
            checked={state.perVariantPricing}
            disabled={disabled}
            onChange={togglePerVariantPricing}
            data-testid="per-variant-pricing-toggle"
          />{' '}
          Per-variant pricing
        </label>
      </div>

      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr style={{ textAlign: 'left', fontSize: 12, color: '#888' }}>
            <th>#</th>
            <th>Color</th>
            <th>Texture</th>
            {state.perVariantPricing && <th>Price (MIST)</th>}
          </tr>
        </thead>
        <tbody>
          {state.variants.map((row, i) => (
            <tr key={i} data-testid={`variant-row-${i}`}>
              <td>{i + 1}</td>
              <td>
                <input
                  type="color"
                  value={row.colorHex}
                  disabled={disabled}
                  onChange={(e) => updateRow(i, { colorHex: e.target.value })}
                  data-testid={`variant-color-${i}`}
                />
              </td>
              <td>
                <select
                  value={row.textureId}
                  disabled={disabled}
                  onChange={(e) =>
                    updateRow(i, { textureId: e.target.value as TextureId })
                  }
                  data-testid={`variant-texture-${i}`}
                >
                  {TEXTURE_LIBRARY.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </td>
              {state.perVariantPricing && (
                <td>
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
                    style={{ width: 120 }}
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
