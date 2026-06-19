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
  studioCredit: 'by Deksat Studio',
} as const;

// --- Rage Racing game config (plan 2026-06-18-002) ---

// The single Tusk3D collection Rage Racing imports cars from. Holding an
// `NftToken` from this collection unlocks driving it in-game; everyone else
// drives the default car. Kept OUT of `TESTNET` (sui/networkConfig) on purpose:
// that object is asserted field-for-field against contracts/networks/testnet.json
// by networkConfig.test.ts, so a frontend-only id there would break parity.
//
// Network-overridable: the literal is the testnet collection (6/21 submission,
// zero-config). The mainnet cutover (D-009, by 8/27) sets
// VITE_RAGE_RACING_COLLECTION_ID — without that override every owned mainnet
// NftToken's collection_id would fail this filter and players would be silently
// stranded on the default car with a dead buy-CTA.
export const BOUND_COLLECTION_ID =
  import.meta.env.VITE_RAGE_RACING_COLLECTION_ID ??
  '0xa1945554a7cb572ff9fdf48469bbaebcbf367e4a70c66fd5034550c1a4dd1242';

// The always-available default car — drivable with no wallet. It loads a
// repo-bundled local GLB (below) through the SAME proven path the NFT cars use,
// so it renders identically (env/IBL timing, parenting, physics, chase camera)
// and carries no Walrus dependency (no testnet blob-expiry risk). This id doubles
// as the synthetic `OwnedToken.tokenId` on /track and the personal-best storage
// key, so it must be a stable string that can never collide with a real 0x… id.
export const DEFAULT_CAR_TOKEN_ID = 'default-car';
export const DEFAULT_CAR_NAME = 'Starter Car';
// Repo-bundled GLB served from frontend/public. Local → fast, never expires, and
// (being a real GLB fetch) follows the identical scene-build path as NFT cars.
export const DEFAULT_CAR_GLB_URL = '/dev-glbs/pickup-truck.glb';

// Truncate a chain / Walrus id for compact display (provenance caption, garage
// tile ids). Shared by TrackPage + carCarousel so the ellipsis/guard logic has
// one home. `!id` and the short-id fast path both return the input verbatim.
export function truncateId(id: string, head = 6, tail = 4): string {
  if (!id || id.length <= head + tail + 1) return id;
  return `${id.slice(0, head)}…${id.slice(-tail)}`;
}

// --- Ready-to-spread style helpers (mirror the eyebrow/headline/monoLabel
// pattern from ux/tokens so TrackPage stays ergonomic) ---

// The big sporty wordmark. fontStyle is set explicitly (not left to inherit
// from the global `h1 { font-style: italic }` rule in index.css) so the racing
// slant is owned by this module, not coupled to Tusk3D's brutalist h1 reset.
export const wordmark: CSSProperties = {
  fontFamily: RAGE_RACING.font.display,
  fontStyle: 'italic',
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
