// Rage Racing — third-party game identity (plan 2026-06-05-001).
//
// `/track` is reskinned to read as a SEPARATE indie studio's game ("Rage
// Racing by Deksat Studio") that imported a Tusk3D collection, not as a Tusk3D
// feature tab. This module is the single source of truth for that identity and
// is DELIBERATELY distinct from the brutalist `tokens` (../../ux/tokens): an
// "Electric Arcade" palette + condensed sporty display face. The visual
// distance from Tusk3D is the proof — if the two share an accent or typeface,
// a viewer reads "same team" and the composability story collapses.
//
// Constraint guarded by brand.test.ts: `accent` must NOT equal Tusk3D's
// `tokens.color.accent` (#FF4500), and the display font must differ too.

import type { CSSProperties } from 'react';

export const RAGE_RACING = {
  // Electric Arcade palette — near-black track, electric-yellow accent, hot-
  // magenta highlight. None of these are Tusk3D's orangered.
  color: {
    surface: '#0B0B0F', // near-black canvas/page bg
    accent: '#FFE500', // electric yellow — wordmark, selected, primary signal
    secondary: '#FF2D7E', // hot magenta — secondary highlights
    ink: '#FFFFFF',
    inkDim: 'rgba(255,255,255,0.7)',
    inkFaint: 'rgba(255,255,255,0.45)',
    err: '#FF4D4D',
  },
  font: {
    // Oswald (loaded in index.html) is a condensed, sporty grotesque — the
    // arcade-racing register. Falls back to system condensed faces.
    display: "'Oswald', 'Arial Narrow', 'Roboto Condensed', system-ui, sans-serif",
    body: "'Inter', -apple-system, system-ui, sans-serif",
    mono: "'JetBrains Mono', 'SF Mono', Menlo, monospace",
  },
  // Studio / game strings — the identity a viewer reads on screen.
  game: 'RAGE RACING',
  studio: 'Deksat Studio',
  studioCredit: 'by Deksat Studio',
} as const;

// --- Ready-to-spread style helpers (mirror the eyebrow/headline/monoLabel
// pattern from ux/tokens so TrackPage stays ergonomic) ---

// The big sporty wordmark.
export const wordmark: CSSProperties = {
  fontFamily: RAGE_RACING.font.display,
  fontWeight: 700,
  fontSize: 40,
  lineHeight: 0.95,
  letterSpacing: '1px',
  textTransform: 'uppercase',
  color: RAGE_RACING.color.accent,
  margin: 0,
};

// "by Deksat Studio" credit under the wordmark.
export const studioCredit: CSSProperties = {
  fontFamily: RAGE_RACING.font.body,
  fontSize: 12,
  letterSpacing: '0.5px',
  color: RAGE_RACING.color.inkDim,
};

// Mono micro-label (HUD, provenance, hints) — arcade voice.
export const arcadeLabel: CSSProperties = {
  fontFamily: RAGE_RACING.font.mono,
  fontSize: 10,
  letterSpacing: '1.5px',
  textTransform: 'uppercase',
  color: RAGE_RACING.color.inkDim,
};

// Large title used in empty/error states.
export const arcadeTitle: CSSProperties = {
  fontFamily: RAGE_RACING.font.display,
  fontWeight: 600,
  fontSize: 34,
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
  color: RAGE_RACING.color.ink,
  margin: 0,
};
