import type { CSSProperties } from 'react';
import { useMemo } from 'react';
import { HelpIcon } from '../ux/HelpIcon';
import {
  HARMONIC_SCHEMES,
  type HarmonicScheme,
  generateVariantColors,
  hexToHsl,
} from './harmonics';
import { buttonOutline, buttonPrimary, monoLabel, tokens } from '../ux/tokens';

// plan-015 U8 — Random Gen controls (R11, D-056, AE5). Picks seed color +
// harmonic scheme, sets N, fires onGenerate. The button label reflects
// current state — "RANDOM GEN (N VARIANTS)" when nothing locked,
// "RANDOM GEN (M OF N, K LOCKED)" when K variants are locked.
//
// Scheme picker renders as 4 swatches; each swatch is a horizontal mini-
// row of 5 derived colors from the CURRENT seed under that scheme — a
// visual decision aid (origin OQ-6 resolution: "Visual decision beats
// dropdown.").

interface Props {
  /** Variant count to generate; capped by Move MAX_VARIANTS upstream. */
  N: number;
  /** Variant count limits, mirroring VariantEditor (default 1..16). */
  minN?: number;
  maxN?: number;
  onChangeN: (n: number) => void;
  /** Seed color as hex; HTML5 color picker drives this. */
  seedHex: string;
  onChangeSeed: (hex: string) => void;
  /** Active harmonic scheme. */
  scheme: HarmonicScheme;
  onChangeScheme: (s: HarmonicScheme) => void;
  /** Count of variants currently locked — drives the button label. */
  lockedCount: number;
  /** Fires RANDOM GEN. Parent owns the generate-and-distribute logic. */
  onGenerate: () => void;
  disabled?: boolean;
}

const SWATCH_PREVIEW_COUNT = 5;

export function RandomGenControls({
  N,
  minN = 1,
  maxN = 16,
  onChangeN,
  seedHex,
  onChangeSeed,
  scheme,
  onChangeScheme,
  lockedCount,
  onGenerate,
  disabled,
}: Props) {
  const seedHsl = useMemo(() => hexToHsl(seedHex), [seedHex]);

  // Pre-compute the 5-color preview row for each scheme so the swatch
  // mini-rows reflect the current seed live. Cheap (4 schemes × 5 colors
  // = 20 HSL→hex conversions) — fine to recompute on every render of the
  // user-touched seed picker.
  const swatchPreviews = useMemo(() => {
    const out: Record<HarmonicScheme, readonly string[]> = {} as never;
    for (const s of HARMONIC_SCHEMES) {
      out[s] = generateVariantColors(seedHsl, s, SWATCH_PREVIEW_COUNT, 1)[0]!;
    }
    return out;
  }, [seedHsl]);

  const buttonLabel = (() => {
    if (lockedCount === 0) return `RANDOM GEN (${N} VARIANT${N === 1 ? '' : 'S'})`;
    const remaining = N - lockedCount;
    return `RANDOM GEN (${remaining} OF ${N}, ${lockedCount} LOCKED)`;
  })();

  return (
    <div data-testid="random-gen-controls" style={panelStyle}>
      <div style={headerRow}>
        <span style={panelTitle}>RANDOM GEN</span>
        <HelpIcon
          testId="random-gen-help"
          title="What does Random Gen do?"
          body="Pick a seed color + harmonic scheme. Generates N coherent variant palettes — each palette uses your scheme's hue offsets so the colors stay related. Lock a variant to keep it across re-rolls."
        />
      </div>

      <div style={inputsRow}>
        <label style={inputCell}>
          <span style={monoLabel}>COUNT</span>
          <div style={stepperRow}>
            <button
              type="button"
              data-testid="random-gen-n-minus"
              onClick={() => onChangeN(Math.max(minN, N - 1))}
              disabled={disabled || N <= minN}
              style={stepperBtn}
            >
              −
            </button>
            <span data-testid="random-gen-n-value" style={nValueStyle}>
              {N}
            </span>
            <button
              type="button"
              data-testid="random-gen-n-plus"
              onClick={() => onChangeN(Math.min(maxN, N + 1))}
              disabled={disabled || N >= maxN}
              style={stepperBtn}
            >
              +
            </button>
          </div>
        </label>
        <label style={inputCell}>
          <span style={monoLabel}>SEED COLOR</span>
          <input
            type="color"
            data-testid="random-gen-seed"
            value={seedHex}
            onChange={(e) => onChangeSeed(e.target.value)}
            disabled={disabled}
            style={seedInputStyle}
          />
        </label>
      </div>

      <div data-testid="random-gen-schemes" style={schemeGrid}>
        {HARMONIC_SCHEMES.map((s) => {
          const active = s === scheme;
          return (
            <button
              key={s}
              type="button"
              data-testid={`random-gen-scheme-${s}`}
              onClick={() => onChangeScheme(s)}
              disabled={disabled}
              aria-pressed={active}
              style={schemeButton(active)}
            >
              <div style={schemeLabel}>{s.toUpperCase()}</div>
              <div style={schemePreviewRow}>
                {swatchPreviews[s].map((hex, i) => (
                  <div
                    key={i}
                    style={{ ...schemePreviewSwatch, background: hex }}
                    aria-hidden
                  />
                ))}
              </div>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        data-testid="random-gen-button"
        onClick={onGenerate}
        disabled={disabled}
        style={generateButton}
      >
        {buttonLabel}
      </button>
    </div>
  );
}

const panelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: 16,
  background: tokens.color.paperPure,
  border: tokens.border.primary,
  marginTop: 24,
};

const headerRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
};

const panelTitle: CSSProperties = {
  ...monoLabel,
  color: tokens.color.ink,
  letterSpacing: '1.5px',
  fontSize: 13,
};

const inputsRow: CSSProperties = {
  display: 'flex',
  gap: 24,
  flexWrap: 'wrap',
};

const inputCell: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const stepperRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

const stepperBtn: CSSProperties = {
  ...buttonOutline,
  padding: '4px 12px',
  fontSize: 14,
  minWidth: 36,
};

const nValueStyle: CSSProperties = {
  ...monoLabel,
  fontSize: tokens.size.md,
  color: tokens.color.ink,
  minWidth: 28,
  textAlign: 'center',
};

const seedInputStyle: CSSProperties = {
  width: 80,
  height: 36,
  padding: 0,
  border: tokens.border.primary,
  background: 'none',
  cursor: 'pointer',
};

const schemeGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
  gap: 8,
};

function schemeButton(active: boolean): CSSProperties {
  return {
    background: tokens.color.paperPure,
    border: active ? `2px solid ${tokens.color.accent}` : tokens.border.primary,
    cursor: 'pointer',
    padding: 8,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    textAlign: 'left',
  };
}

const schemeLabel: CSSProperties = {
  ...monoLabel,
  color: tokens.color.ink,
  letterSpacing: '1.5px',
};

const schemePreviewRow: CSSProperties = {
  display: 'flex',
  gap: 2,
  height: 16,
};

const schemePreviewSwatch: CSSProperties = {
  flex: 1,
  border: '0.5px solid rgba(0,0,0,0.2)',
};

const generateButton: CSSProperties = {
  ...buttonPrimary,
  alignSelf: 'flex-start',
};
