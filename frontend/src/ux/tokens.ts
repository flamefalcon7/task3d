// Brutalist editorial design tokens (D-044). Single source of truth for color,
// type, spacing, and component primitives. See docs/ux/design-tokens.md.
//
// Pattern: inline React.CSSProperties matches the existing convention in
// MarketPage.tsx and SignInButton.tsx. CSS variables live in index.css for
// the body reset and :focus-visible rings; the same hex values mirror here
// so component primitives don't need to round-trip through CSS.

import type { CSSProperties } from 'react';

export const tokens = {
  color: {
    ink: '#000000',
    paper: '#F5F5F0',
    paperPure: '#FFFFFF',
    well: '#000000',
    wellInk: '#FFFFFF',
    accent: '#FF4500',
    accentInk: '#FFFFFF',
    muted: 'rgba(0,0,0,0.9)',
    hint: 'rgba(0,0,0,0.6)',
    subtle: '#595959',
    ok: '#0F8A4A',
    warn: '#B58900',
    err: '#C81E1E',
  },
  font: {
    display: "'Newsreader', Georgia, serif",
    body: "'Inter', -apple-system, system-ui, sans-serif",
    mono: "'JetBrains Mono', 'SF Mono', Menlo, monospace",
  },
  size: {
    xs: 10,
    sm: 12,
    base: 14,
    md: 16,
    lg: 22,
    display: 40,
  },
  weight: {
    regular: 400,
    medium: 500,
  },
  space: {
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    6: 24,
    8: 32,
    12: 48,
  },
  border: {
    primary: '1.5px solid #000000',
    hairline: '0.5px solid #000000',
    divider: '1px solid #000000',
    accent: '1.5px solid #FF4500',
    err: '1.5px solid #C81E1E',
  },
  radius: 0,
} as const;

// Component primitives (design-tokens.md §6). Spread into element style props.

export const buttonPrimary: CSSProperties = {
  background: tokens.color.accent,
  color: tokens.color.accentInk,
  border: tokens.border.primary,
  borderRadius: tokens.radius,
  padding: '10px 18px',
  fontSize: tokens.size.sm,
  fontWeight: tokens.weight.medium,
  fontFamily: tokens.font.mono,
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
  cursor: 'pointer',
};

export const buttonOutline: CSSProperties = {
  background: tokens.color.paperPure,
  color: tokens.color.ink,
  border: tokens.border.primary,
  borderRadius: tokens.radius,
  padding: '6px 14px',
  fontSize: 11,
  fontWeight: tokens.weight.medium,
  fontFamily: tokens.font.mono,
  letterSpacing: '1px',
  textTransform: 'uppercase',
  cursor: 'pointer',
};

export const buttonDestructive: CSSProperties = {
  ...buttonOutline,
  borderColor: tokens.color.err,
  color: tokens.color.err,
};

export const input: CSSProperties = {
  background: tokens.color.paperPure,
  color: tokens.color.ink,
  border: tokens.border.primary,
  borderRadius: tokens.radius,
  padding: '8px 10px',
  fontSize: tokens.size.base,
  fontFamily: tokens.font.body,
  outline: 'none',
};

export const card: CSSProperties = {
  background: tokens.color.paperPure,
  border: tokens.border.primary,
  borderRadius: tokens.radius,
};

export const viewerWell: CSSProperties = {
  background: tokens.color.well,
  color: tokens.color.wellInk,
  position: 'relative',
  overflow: 'hidden',
};

// Landing live-3D wells — SCOPED D-044 EXCEPTION (D-093, updated D-094). The
// hero now BLENDS into the page (paper clearColor + feathered edges + contact
// shadow — see LedeHero), so the grey-viewport/grid tokens are retired. These
// remaining values apply ONLY to the lifecycle panels, which keep black wells:
//   - variant1/2/3: three desaturated, non-accent tints for the VARIANT triptych
//     (none equal tokens.color.accent).
//   - glow: neutral IN-GAME emissive glow; never the #FF4500 accent.
export const landingWells = {
  variant1: '#C9B27A',
  variant2: '#6E8FA8',
  variant3: '#8E7EA8',
  glow: '#E8E4D8',
} as const;

export const badge: CSSProperties = {
  fontSize: 9,
  fontFamily: tokens.font.mono,
  letterSpacing: '1.5px',
  textTransform: 'uppercase',
  padding: 0,
  color: tokens.color.wellInk,
};

export const badgeAccent: CSSProperties = {
  ...badge,
  color: tokens.color.accent,
};

export const statusBanner: CSSProperties = {
  background: tokens.color.well,
  color: tokens.color.wellInk,
  padding: '12px 16px',
  fontFamily: tokens.font.mono,
  fontSize: 11,
  display: 'flex',
  alignItems: 'center',
  gap: 10,
};

export const navBar: CSSProperties = {
  background: tokens.color.paperPure,
  borderBottom: tokens.border.primary,
  padding: '14px 20px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

// Page-level helpers used across screens.

export const pagePaper: CSSProperties = {
  background: tokens.color.paper,
  color: tokens.color.ink,
  fontFamily: tokens.font.body,
  minHeight: '100vh',
};

// Eyebrow + display headline pattern (— L1 / PUBLISH \n Make a model.)
export const eyebrow: CSSProperties = {
  fontFamily: tokens.font.mono,
  fontSize: tokens.size.xs,
  letterSpacing: '1.5px',
  textTransform: 'uppercase',
  color: tokens.color.muted,
};

export const displayHeadline: CSSProperties = {
  fontFamily: tokens.font.display,
  fontStyle: 'italic',
  fontSize: tokens.size.display,
  fontWeight: tokens.weight.medium,
  lineHeight: 1.0,
  letterSpacing: '-1px',
  margin: 0,
};

// Uppercase mono label used everywhere for form labels, status pills, etc.
export const monoLabel: CSSProperties = {
  fontFamily: tokens.font.mono,
  fontSize: tokens.size.xs,
  letterSpacing: '1.5px',
  textTransform: 'uppercase',
};
