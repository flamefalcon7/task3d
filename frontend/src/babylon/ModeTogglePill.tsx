import type { CSSProperties } from 'react';
import type { ModePaletteEntry } from './modePalette';

// plan-015 U2 — mono-uppercase pill anchored to the TOP-LEFT of the viewer
// well, sibling of BgTogglePill (which sits top-right). Click cycles
// PBR → PARTS → SOLO → WIREFRAME → PBR via the parent-owned `useModeCycle`
// hook. Owned by PreviewCanvas / TaggingCanvas — not a standalone component.
const pillStyle: CSSProperties = {
  position: 'absolute',
  top: 8,
  left: 8,
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
  entry: ModePaletteEntry;
  onCycle: () => void;
  // Used by tests to find the pill regardless of mount site (mirrors the
  // BG pill's testId-suffix pattern for multi-mount disambiguation).
  testId?: string;
}

export function ModeTogglePill({ entry, onCycle, testId = 'mode-toggle-pill' }: Props) {
  return (
    <button
      type="button"
      data-testid={testId}
      style={pillStyle}
      onClick={onCycle}
      aria-label={`Cycle viewer mode (current: ${entry.label})`}
    >
      {entry.label}
    </button>
  );
}
