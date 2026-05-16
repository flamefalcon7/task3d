// U4 — VariantEditor unit tests. Covers AE5 (variant count cap UI),
// KTD-5 (texture dropdown sourced from shared TEXTURE_LIBRARY), and D-005
// (per-variant pricing toggle).

import { afterEach, describe, expect, it } from 'vitest';
import { useState } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { TEXTURE_LIBRARY } from '@overflow2026/shared';
import {
  VariantEditor,
  MAX_VARIANTS,
  newVariantEditorState,
  hexToBaseColorRgb,
  type VariantEditorState,
} from './VariantEditor';

afterEach(() => cleanup());

// Tiny harness — VariantEditor is fully controlled; tests need a stateful host.
function Harness({ initial }: { initial?: VariantEditorState }) {
  const [state, setState] = useState<VariantEditorState>(
    initial ?? newVariantEditorState(),
  );
  return <VariantEditor state={state} onChange={setState} />;
}

describe('VariantEditor', () => {
  it('enforces_variant_count_cap_16', () => {
    render(<Harness />);
    // Click "+" 20 times — should cap at 16. Re-query each iteration because
    // the captured button reference re-renders along with the editor.
    for (let i = 0; i < 20; i++) {
      act(() => {
        fireEvent.click(screen.getByTestId('variant-add'));
      });
    }
    expect(screen.queryAllByTestId(/^variant-row-/)).toHaveLength(MAX_VARIANTS);
    expect(
      (screen.getByTestId('variant-add') as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('enforces_variant_count_floor_1', () => {
    render(<Harness />);
    const removeBtn = screen.getByTestId('variant-remove') as HTMLButtonElement;
    // Starts with 1 — remove should already be disabled
    expect(removeBtn.disabled).toBe(true);
    act(() => {
      fireEvent.click(removeBtn);
    });
    expect(screen.queryAllByTestId(/^variant-row-/)).toHaveLength(1);
  });

  it('texture_dropdown_options_match_TEXTURE_LIBRARY', () => {
    render(<Harness />);
    const select = screen.getByTestId('variant-texture-0') as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    // No hard-coded list — must equal shared constant exactly.
    expect(optionValues).toEqual([...TEXTURE_LIBRARY]);
    expect(optionValues).toHaveLength(8);
  });

  it('per_variant_pricing_toggle_off_uses_global_price', () => {
    // Start with 3 rows, pricing off, global price 500.
    const initial: VariantEditorState = {
      ...newVariantEditorState(),
      globalPriceMist: 500n,
      variants: [
        { colorHex: '#ff0000', textureId: 'matte', priceMist: 500n },
        { colorHex: '#00ff00', textureId: 'chrome', priceMist: 500n },
        { colorHex: '#0000ff', textureId: 'gold', priceMist: 500n },
      ],
      perVariantPricing: false,
    };
    render(<Harness initial={initial} />);
    // Per-row price inputs should NOT be visible when pricing toggle is off.
    expect(screen.queryByTestId('variant-price-0')).toBeNull();
    expect(screen.queryByTestId('variant-price-1')).toBeNull();
    expect(screen.queryByTestId('variant-price-2')).toBeNull();
    // Global price input present.
    const globalInput = screen.getByTestId(
      'global-price-input',
    ) as HTMLInputElement;
    expect(globalInput.value).toBe('500');
  });

  it('per_variant_pricing_toggle_on_uses_row_prices', () => {
    const initial: VariantEditorState = {
      ...newVariantEditorState(),
      globalPriceMist: 100n,
      variants: [
        { colorHex: '#ff0000', textureId: 'matte', priceMist: 100n },
        { colorHex: '#00ff00', textureId: 'chrome', priceMist: 100n },
      ],
      perVariantPricing: false,
    };
    render(<Harness initial={initial} />);
    const toggle = screen.getByTestId(
      'per-variant-pricing-toggle',
    ) as HTMLInputElement;
    act(() => {
      fireEvent.click(toggle);
    });
    // Per-row price inputs should now be visible.
    const row0 = screen.getByTestId('variant-price-0') as HTMLInputElement;
    const row1 = screen.getByTestId('variant-price-1') as HTMLInputElement;
    expect(row0.value).toBe('100');
    expect(row1.value).toBe('100');
    // Edit row 1 only.
    act(() => {
      fireEvent.change(row1, { target: { value: '999' } });
    });
    expect(
      (screen.getByTestId('variant-price-1') as HTMLInputElement).value,
    ).toBe('999');
    // Row 0 unchanged.
    expect(
      (screen.getByTestId('variant-price-0') as HTMLInputElement).value,
    ).toBe('100');
  });

  it('global_price_change_syncs_to_all_rows_when_pricing_off', () => {
    render(<Harness />);
    const globalInput = screen.getByTestId(
      'global-price-input',
    ) as HTMLInputElement;
    // Add 2 more rows (must be separate acts — clicking the same captured
    // reference twice synchronously batches against stale props).
    act(() => {
      fireEvent.click(screen.getByTestId('variant-add'));
    });
    act(() => {
      fireEvent.click(screen.getByTestId('variant-add'));
    });
    act(() => {
      fireEvent.change(globalInput, { target: { value: '777' } });
    });
    // Toggle pricing on to inspect row values (they'll have been synced).
    act(() => {
      fireEvent.click(screen.getByTestId('per-variant-pricing-toggle'));
    });
    expect(
      (screen.getByTestId('variant-price-0') as HTMLInputElement).value,
    ).toBe('777');
    expect(
      (screen.getByTestId('variant-price-1') as HTMLInputElement).value,
    ).toBe('777');
    expect(
      (screen.getByTestId('variant-price-2') as HTMLInputElement).value,
    ).toBe('777');
  });

  it('hexToBaseColorRgb_converts_to_glTF_PBR_floats', () => {
    expect(hexToBaseColorRgb('#ffffff')).toEqual([1, 1, 1, 1]);
    expect(hexToBaseColorRgb('#000000')).toEqual([0, 0, 0, 1]);
    const [r, g, b, a] = hexToBaseColorRgb('#ff8040');
    expect(r).toBeCloseTo(1, 5);
    expect(g).toBeCloseTo(128 / 255, 5);
    expect(b).toBeCloseTo(64 / 255, 5);
    expect(a).toBe(1);
  });
});
