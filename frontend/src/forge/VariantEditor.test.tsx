// U4 — VariantEditor unit tests. Covers AE5 (variant count cap UI),
// KTD-5 (texture dropdown sourced from shared TEXTURE_LIBRARY), and D-005
// (per-variant pricing toggle).

import { afterEach, describe, expect, it, vi } from 'vitest';
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
  newVariantRow,
  hexToBaseColorRgb,
  deriveUniqueLabels,
  type VariantEditorState,
} from './VariantEditor';

afterEach(() => cleanup());

// Tiny harness — VariantEditor is fully controlled; tests need a stateful host.
function Harness({
  initial,
  partLabels,
}: {
  initial?: VariantEditorState;
  partLabels?: string[];
}) {
  const [state, setState] = useState<VariantEditorState>(
    initial ?? newVariantEditorState(deriveUniqueLabels(partLabels ?? [])),
  );
  return <VariantEditor state={state} onChange={setState} partLabels={partLabels} />;
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
        { palette: { primary: '#ff0000' }, textureId: 'matte', priceMist: 500n },
        { palette: { primary: '#00ff00' }, textureId: 'chrome', priceMist: 500n },
        { palette: { primary: '#0000ff' }, textureId: 'gold', priceMist: 500n },
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
        { palette: { primary: '#ff0000' }, textureId: 'matte', priceMist: 100n },
        { palette: { primary: '#00ff00' }, textureId: 'chrome', priceMist: 100n },
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

  // ----- plan-013 U7 — label-grouped palette ------------------------------

  it('renders one color picker per unique label (4 distinct labels)', () => {
    render(<Harness partLabels={['primary', 'secondary', 'accent', 'detail']} />);
    expect(screen.getByTestId('variant-color-0-primary')).toBeTruthy();
    expect(screen.getByTestId('variant-color-0-secondary')).toBeTruthy();
    expect(screen.getByTestId('variant-color-0-accent')).toBeTruthy();
    expect(screen.getByTestId('variant-color-0-detail')).toBeTruthy();
  });

  it('deduplicates labels: 12-part GLB with 4 unique labels → 4 pickers per row (AE2, AE4)', () => {
    const partLabels = [
      'primary', 'primary', 'primary',
      'secondary', 'secondary',
      'accent', 'accent',
      'detail', 'detail', 'detail', 'detail', 'detail',
    ];
    render(<Harness partLabels={partLabels} />);
    expect(screen.getAllByTestId(/^variant-color-0-/)).toHaveLength(4);
    expect(screen.getByTestId('palette-col-primary')).toBeTruthy();
    expect(screen.getByTestId('palette-col-detail')).toBeTruthy();
  });

  it('legacy (partLabels = []) renders exactly one color picker per variant', () => {
    render(<Harness partLabels={[]} />);
    expect(screen.getAllByTestId(/^variant-color-0-/)).toHaveLength(1);
    expect(screen.getByTestId('variant-color-0-primary')).toBeTruthy();
    expect(screen.queryByTestId('variant-color-0-secondary')).toBeNull();
  });

  it('changing primary color mutates only palette.primary; other labels unchanged', () => {
    const initial: VariantEditorState = {
      ...newVariantEditorState(['primary', 'secondary', 'accent']),
      variants: [
        newVariantRow({ uniqueLabels: ['primary', 'secondary', 'accent'] }),
      ],
    };
    render(<Harness initial={initial} partLabels={['primary', 'secondary', 'accent']} />);
    const before = (screen.getByTestId('variant-color-0-secondary') as HTMLInputElement).value;
    act(() => {
      fireEvent.change(screen.getByTestId('variant-color-0-primary'), {
        target: { value: '#abcdef' },
      });
    });
    expect((screen.getByTestId('variant-color-0-primary') as HTMLInputElement).value).toBe('#abcdef');
    expect((screen.getByTestId('variant-color-0-secondary') as HTMLInputElement).value).toBe(before);
    expect((screen.getByTestId('variant-color-0-accent') as HTMLInputElement).value).toBe(before);
  });

  it('16 variants × 5 unique labels = 80 color pickers render without crashing', () => {
    const labels = ['primary', 'secondary', 'accent', 'detail', 'trim'];
    const initial: VariantEditorState = {
      variants: Array.from({ length: 16 }, () => newVariantRow({ uniqueLabels: labels })),
      globalPriceMist: 100_000_000n,
      perVariantPricing: false,
    };
    render(<Harness initial={initial} partLabels={labels} />);
    expect(screen.queryAllByTestId(/^variant-color-/)).toHaveLength(80);
  });

  it('custom free-text label "fur" renders alongside the four presets', () => {
    const partLabels = ['primary', 'secondary', 'accent', 'fur'];
    render(<Harness partLabels={partLabels} />);
    expect(screen.getByTestId('palette-col-fur')).toBeTruthy();
    expect(screen.getByTestId('variant-color-0-fur')).toBeTruthy();
  });

  it('deriveUniqueLabels preserves first-occurrence order and dedupes', () => {
    expect(deriveUniqueLabels(['accent', 'primary', 'accent', 'detail', 'primary'])).toEqual([
      'accent',
      'primary',
      'detail',
    ]);
    expect(deriveUniqueLabels([])).toEqual(['primary']);
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

  // -- plan-015 U7 — subhead, HelpIcon, onColumnHover wiring ---------------

  it('U7: subhead row reinforces column-label authorship under the palette columns (R7, AE3)', () => {
    render(<Harness partLabels={['chassis', 'wheels', 'spoiler']} />);
    const subhead = screen.getByTestId('variant-editor-subhead');
    expect(subhead).toBeTruthy();
    expect(subhead.textContent).toMatch(
      /COLUMNS REFLECT THE LABELS THIS BASE'S CREATOR SET WHEN PUBLISHING/,
    );
  });

  it('U7: HelpIcon renders next to the PALETTE COLUMNS heading (R12)', () => {
    render(<Harness partLabels={['chassis']} />);
    expect(screen.getByTestId('variant-editor-help')).toBeTruthy();
    fireEvent.mouseEnter(screen.getByTestId('variant-editor-help'));
    expect(screen.getByTestId('variant-editor-help-popover').textContent).toMatch(
      /customization axis/,
    );
  });

  it('U7: hovering a column header fires onColumnHover(label); leaving fires onColumnHover(null) (R8, AE4)', () => {
    const hover = vi.fn();
    function HarnessWithHover() {
      const [state, setState] = useState<VariantEditorState>(
        newVariantEditorState(['chassis', 'wheels']),
      );
      return (
        <VariantEditor
          state={state}
          onChange={setState}
          partLabels={['chassis', 'wheels']}
          onColumnHover={hover}
        />
      );
    }
    render(<HarnessWithHover />);
    fireEvent.mouseEnter(screen.getByTestId('palette-col-chassis'));
    expect(hover).toHaveBeenCalledWith('chassis');
    fireEvent.mouseLeave(screen.getByTestId('palette-col-chassis'));
    expect(hover).toHaveBeenCalledWith(null);
    fireEvent.mouseEnter(screen.getByTestId('palette-col-wheels'));
    expect(hover).toHaveBeenLastCalledWith('wheels');
  });

  it('U7: omitting onColumnHover leaves the column header inert (no listeners attached)', () => {
    render(<Harness partLabels={['chassis']} />);
    // No throws when hovering without a handler — sanity check the optional prop.
    expect(() => fireEvent.mouseEnter(screen.getByTestId('palette-col-chassis'))).not.toThrow();
  });
});
