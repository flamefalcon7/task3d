import type { CSSProperties } from 'react';
import type { BgPaletteEntry } from './bgPalette';

// Small mono-uppercase pill anchored to the top-right of the viewer well.
// Owned by PreviewCanvas / TaggingCanvas — not standalone.
const pillStyle: CSSProperties = {
  position: 'absolute',
  top: 8,
  right: 8,
  zIndex: 1,
  padding: '4px 8px',
  fontFamily: "'JetBrains Mono', 'SF Mono', Menlo, monospace",
  fontSize: 10,
  letterSpacing: '1.5px',
  textTransform: 'uppercase',
  background: 'rgba(0, 0, 0, 0.55)',
  color: '#FFFFFF',
  border: '1px solid rgba(255,255,255,0.35)',
  cursor: 'pointer',
  pointerEvents: 'auto',
};

interface Props {
  entry: BgPaletteEntry;
  onCycle: () => void;
  // Used by tests to find the pill regardless of mount site.
  testId?: string;
}

export function BgTogglePill({ entry, onCycle, testId = 'bg-toggle-pill' }: Props) {
  return (
    <button
      type="button"
      data-testid={testId}
      style={pillStyle}
      onClick={onCycle}
      aria-label={`Cycle viewer background (current: ${entry.label})`}
    >
      {entry.label}
    </button>
  );
}
