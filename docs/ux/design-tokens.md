# Design Tokens — Brutalist Editorial

**Status**: Locked (see D-044)
**Last updated**: 2026-05-23
**Applies to**: `frontend/` — all routes, all components

This document is the single source of truth for the visual system. Every screen, every component, every state must reference values from here. If you find yourself reaching for a value not in this doc, stop and add it here first, then use it.

> **Scoped exception — landing hero well (blends into page), D-094 (supersedes D-093).** The landing **hero** well (`frontend/src/landing/LedeHero.tsx`) is the one 3D-viewer well exempt from the "wells are pure black" rule: it renders on the **page paper background** (`--paper`) with a soft contact shadow + radial edge-feather so the tusk blends into the page rather than sitting in its own window (no grid/axis — D-093's grey-viewport idea was superseded). The exemption is well-scoped — every other 3D well, including the four `LifecycleStrip` panels, stays pure-black `--well` (#000). Panels remain accent-free; the VARIANT panel uses three desaturated non-accent tints (`--variant-1/2/3`) and the IN-GAME glow is neutral, so the ≤5-accent page budget is untouched. See D-094 and `docs/plans/2026-06-06-001-feat-landing-live-3d-wells-plan.md`. (Companion to the `/track` exemption, D-091.)

---

## 1. Vibe

One sentence: **off-white editorial page with heavy black borders, italic-serif headlines, monospace chain data, and a single red-orange accent used only for primary actions and exception states.**

The page reads like a printed catalog or a design publication, not a crypto exchange. 3D content sits in pure-black inset wells so the white page becomes a *frame* for the model rather than washing it out.

The visual system is a constraint, not a palette. Discipline is the design.

---

## 2. Color tokens

Twelve total values. Do not introduce a thirteenth without updating this file.

| Token | Hex | Role |
|---|---|---|
| `--ink` | `#000000` | All text, all borders, all hairlines, all stroked icons |
| `--paper` | `#F5F5F0` | Page background. Off-white, warmed, not pure |
| `--paper-pure` | `#FFFFFF` | Cards, nav, input fields, modal surfaces |
| `--well` | `#000000` | 3D viewer area, code blocks, demo-tape banner |
| `--well-ink` | `#FFFFFF` | Text on `--well`, wireframe strokes in viewer |
| `--accent` | `#FF4500` | Primary CTA fill, active-nav underline, `YOURS` badge, `CONFIRMED` status |
| `--accent-ink` | `#FFFFFF` | Text on `--accent` fill |
| `--muted` | `#000000` (90% opacity) | Body text on `--paper` and `--paper-pure` |
| `--hint` | `#000000` (60% opacity) | Hints, helper text, secondary metadata |
| `--ok` | `#0F8A4A` | Success states (rare — most successes go to `CONFIRMED` accent banner) |
| `--warn` | `#B58900` | Warning toasts (rare) |
| `--err` | `#C81E1E` | Form validation errors, destructive confirmations |

**Rules.**
- The accent `#FF4500` appears at most five times on any one page. Counting includes underlines, fills, and outlines. If you can't count them on one hand, you're using accent as decoration. Stop.
- Never use a gray. All "muted" states are black at reduced opacity (`rgba(0,0,0,0.6)` for hints, `rgba(0,0,0,0.9)` for body). This keeps the system to two colors of ink: full black or transparent black.
- Never tint a surface. `--paper`, `--paper-pure`, and `--well` are the only allowed backgrounds. No `#FAFAFA`, no `#F0F0E8`, no almost-white-but-different.
- 3D viewer wells are always `--well` (pure black), never `--paper`. The contrast is what makes the model visible.

---

## 3. Type scale

Three font families, no more.

| Family | Token | Use |
|---|---|---|
| Italic serif | `--font-display` | All page-level headlines (h1, h2), card titles, decorative quotes |
| Sans | `--font-body` | Body copy, navigation, button labels, form labels |
| Monospace | `--font-mono` | Wallet addresses, package IDs, object IDs, blob IDs, network status, badges, transaction digests, status banners |

**Recommended faces.**
- `--font-display`: **Newsreader** (italic, weights 400/500), or **PP Editorial New**, or **Source Serif 4**. All free.
- `--font-body`: **Inter** (weights 400/500). Free, ubiquitous.
- `--font-mono`: **JetBrains Mono** or **IBM Plex Mono** (weight 400 only). Free.

Embed via `<link rel="stylesheet" href="...">` in `index.html`. Do not bundle locally — these are well-cached on Google Fonts CDN.

**Sizes.** Six sizes, no in-between values.

| Token | Pixels | Use |
|---|---|---|
| `--text-xs` | 10 | Monospace labels, badges, demo-tape captions |
| `--text-sm` | 12 | Helper text, hints, status banners |
| `--text-base` | 14 | Body copy, button labels, form inputs |
| `--text-md` | 16 | Card titles, section subheadings |
| `--text-lg` | 22 | Page section headings (h2 in body) |
| `--text-display` | 40 | Page hero headlines (h1, hero h2) |

**Weights.** Two values only: **400** (regular) and **500** (medium). Never 600, never 700, never 900. Brutalist usually trades on heavy weights — we use *size* and *italic* contrast instead, which is what makes the system read as editorial rather than aggressive.

**Letter-spacing.**
- Monospace labels in caps: `letter-spacing: 1.5px`.
- Display headlines: `letter-spacing: -1px` (tighten so big italics don't sprawl).
- Everything else: default.

**Line height.**
- Display: `1.0` (tight, intentional).
- Body: `1.5`.
- Mono labels: `1.2`.

---

## 4. Spacing scale

Six values, named after their pixel size. Never use a value off the scale.

| Token | Pixels |
|---|---|
| `--space-1` | 4 |
| `--space-2` | 8 |
| `--space-3` | 12 |
| `--space-4` | 16 |
| `--space-6` | 24 |
| `--space-8` | 32 |
| `--space-12` | 48 |

Component-internal gaps use 4–16. Section rhythm uses 24–48. There is no `--space-5` or `--space-10` and there never will be.

---

## 5. Borders, corners, dividers

| Property | Value |
|---|---|
| Border weight (primary) | `1.5px solid var(--ink)` |
| Border weight (hairline) | `0.5px solid var(--ink)` (use sparingly — only inside cards) |
| Border radius | **`0`** — everywhere. No rounded corners. No exceptions. |
| Hairline divider (in-card) | `1px solid var(--ink)` |
| Dotted accent (rare) | `1.5px dashed var(--ink)` (use for "loading" tape, optional) |

The 0-radius rule is the single most important visual decision in this system. If you round a corner, you've broken the vibe.

---

## 6. Component primitives

These are inline-style helpers. Drop them into `frontend/src/ux/tokens.ts` and import where used. Match the existing inline-style pattern already in `MarketPage.tsx`.

### Button (primary)

```ts
export const buttonPrimary: React.CSSProperties = {
  background: 'var(--accent)',
  color: 'var(--accent-ink)',
  border: '1.5px solid var(--ink)',
  borderRadius: 0,
  padding: '10px 18px',
  fontSize: 12,
  fontWeight: 500,
  fontFamily: 'var(--font-mono)',
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
  cursor: 'pointer',
};
```

### Button (secondary / outline)

```ts
export const buttonOutline: React.CSSProperties = {
  background: 'var(--paper-pure)',
  color: 'var(--ink)',
  border: '1.5px solid var(--ink)',
  borderRadius: 0,
  padding: '6px 14px',
  fontSize: 11,
  fontWeight: 500,
  fontFamily: 'var(--font-mono)',
  letterSpacing: '1px',
  textTransform: 'uppercase',
  cursor: 'pointer',
};
```

### Button (destructive)

```ts
export const buttonDestructive: React.CSSProperties = {
  ...buttonOutline,
  borderColor: 'var(--err)',
  color: 'var(--err)',
};
```

### Input (text)

```ts
export const input: React.CSSProperties = {
  background: 'var(--paper-pure)',
  color: 'var(--ink)',
  border: '1.5px solid var(--ink)',
  borderRadius: 0,
  padding: '8px 10px',
  fontSize: 14,
  fontFamily: 'var(--font-body)',
  outline: 'none',
};
// On focus, swap border color to var(--accent) — no glow, no shadow.
```

### Card (catalog item)

```ts
export const card: React.CSSProperties = {
  background: 'var(--paper-pure)',
  border: '1.5px solid var(--ink)',
  borderRadius: 0,
};
// When laying out a card grid, prefer grouping cards into a single bordered
// outer container with shared borders between cells. This is the editorial
// grid look — see the /market mockup. Each cell uses border-right and
// border-bottom of 1.5px on the outer container instead of independent
// borders on the cards.
```

### 3D viewer well

```ts
export const viewerWell: React.CSSProperties = {
  background: 'var(--well)',
  color: 'var(--well-ink)',
  aspectRatio: '16/10',
  position: 'relative',
};
// Wireframe SVGs inside use stroke='var(--well-ink)' at 1.5px weight, 30% opacity
// for placeholder/empty state, 100% opacity when a model is loaded.
// Babylon canvas just renders directly into this well — clearColor must be #000.
```

### Badge (mono label)

```ts
export const badge: React.CSSProperties = {
  fontSize: 9,
  fontFamily: 'var(--font-mono)',
  letterSpacing: '1.5px',
  textTransform: 'uppercase',
  padding: 0, // no fill, just the label
  color: 'var(--well-ink)', // when placed on dark well
};

export const badgeAccent: React.CSSProperties = {
  ...badge,
  color: 'var(--accent)',
};
```

### Status banner (page-foot)

```ts
export const statusBanner: React.CSSProperties = {
  background: 'var(--well)',
  color: 'var(--well-ink)',
  padding: '12px 16px',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  display: 'flex',
  alignItems: 'center',
  gap: 10,
};
// The "CONFIRMED" or "PENDING" label inside this banner uses
// color: 'var(--accent)' and letter-spacing: 1px.
```

### Top navigation

```ts
export const navBar: React.CSSProperties = {
  background: 'var(--paper-pure)',
  borderBottom: '1.5px solid var(--ink)',
  padding: '14px 20px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};
// The active route link is underlined with 2px solid var(--accent), padding-bottom: 2px.
// Brand mark uses var(--font-display) italic at 16px.
// All nav items use var(--font-body) at 12px.
// Wallet address pill uses var(--font-mono) at 11px, no border, no background.
```

---

## 7. State rules

| Element | Default | Hover | Active | Disabled | Focus |
|---|---|---|---|---|---|
| Button (primary) | Accent fill, ink border | Invert: ink fill, accent text | Translate (1px, 1px) | Opacity 0.4, cursor not-allowed | 2px solid accent outline, 2px offset |
| Button (outline) | Paper-pure fill, ink border, ink text | Ink fill, paper-pure text | Translate (1px, 1px) | Opacity 0.4, cursor not-allowed | Same as primary focus |
| Input | Ink border 1.5px | (no change) | (no change) | Opacity 0.5 | Accent border 1.5px (swap, no outline) |
| Card | Ink border | (no change) | (no change) | — | — |
| Link (in-text) | Ink, underlined | Accent | Accent | — | Accent outline |

**Hover transitions:** all `transition: 0.0s` — no fading. Brutalist is instant. This is the rule.

**Focus:** keyboard-only. Don't suppress `:focus-visible` rings.

---

## 8. Anti-patterns

Things that will break the system. Reject in code review.

- Rounded corners *anywhere*, including on icons or avatars.
- Gradients of any kind, including `linear-gradient(to bottom, ...)` background washes.
- Drop shadows, box shadows, glows, neon halos, blur effects.
- Soft borders (`#E5E5E5`, anything ≠ `--ink`).
- Tints — `#0066CC10`, `rgba(255, 69, 0, 0.08)`, anything that creates a fourth surface.
- More than two font-weights on one screen.
- Accent color used for decoration (heart icons, generic badges, hover backgrounds).
- Mid-sentence bolding in body copy. Italic-serif headlines are the emphasis device, period.
- Emoji in status messages. Use mono labels: `CONFIRMED`, `PENDING`, `FAILED`.
- Localized "fun" deviations ("just this once we'll use blue"). The discipline is the design.
- Hover scale transforms (`transform: scale(1.05)`). Hovers are instant inversions, not animations.

---

## 9. Implementation as `frontend/src/ux/tokens.ts`

Drop the following at `frontend/src/ux/tokens.ts`:

```ts
// Brutalist editorial design tokens — see docs/ux/design-tokens.md, D-044.
// Single source of truth for color, type, spacing in the frontend. Inline-style
// pattern (no Tailwind, no CSS modules) per existing convention in MarketPage.

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
    1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32, 12: 48,
  },
  border: {
    primary: '1.5px solid #000000',
    hairline: '0.5px solid #000000',
    divider: '1px solid #000000',
  },
  radius: 0,
} as const;
```

Then add to `frontend/src/index.css`:

```css
:root {
  --ink: #000000;
  --paper: #F5F5F0;
  --paper-pure: #FFFFFF;
  --well: #000000;
  --well-ink: #FFFFFF;
  --accent: #FF4500;
  --accent-ink: #FFFFFF;
  --muted: rgba(0,0,0,0.9);
  --hint: rgba(0,0,0,0.6);
  --ok: #0F8A4A;
  --warn: #B58900;
  --err: #C81E1E;

  --font-display: 'Newsreader', Georgia, serif;
  --font-body: 'Inter', -apple-system, system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', 'SF Mono', Menlo, monospace;
}

body {
  background: var(--paper);
  color: var(--ink);
  font-family: var(--font-body);
  font-size: 14px;
  line-height: 1.5;
  margin: 0;
}

h1, h2, h3 {
  font-family: var(--font-display);
  font-style: italic;
  font-weight: 500;
  line-height: 1.0;
  letter-spacing: -0.5px;
  margin: 0;
}

input, button, textarea, select {
  font-family: inherit;
  border-radius: 0;
}

*, *::before, *::after {
  box-sizing: border-box;
}
```

And the Google Fonts import at the top of `frontend/index.html`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&family=JetBrains+Mono:wght@400&family=Newsreader:ital,wght@1,400;1,500&display=swap">
```

---

## 10. Implementation order

Apply this system screen-by-screen, demo-arc-first, in this exact order. Don't move to the next screen until the current one is fully Brutalist.

1. `frontend/src/ux/tokens.ts` + `index.css` + `index.html` font link — the foundation. ~1 hour.
2. `App.tsx` shell + top navigation — every screen sees this. ~1 hour.
3. `/create` (`creator/CreateModelPage.tsx`) — the L1 publish flow. The first thing the demo touches. ~3 hours.
4. `/launch` (`collection/LaunchCollectionPage.tsx`) — L2 mint. ~2 hours.
5. `/market` (`market/MarketPage.tsx`) — sell + buy. The headline screen. ~3 hours.
6. `/track` (`track/TrackPage.tsx`) — drive the bought car. Babylon scene + sparse UI chrome. ~2 hours.
7. `/` (`browse/BrowsePage.tsx`) — the landing page. Last because it's seen but not interacted with on the critical demo path. ~2 hours.
8. Auxiliary pages — `/model/:id`, `/collection/:slug`, `/integrate` — only if time permits. Otherwise leave plain and ensure they're not on the demo path.

Total estimate: **~14 hours of polish work**, fits inside the U15 window (current plan budgets ~3–4 days for demo + pitch).

See `docs/ux/polish-backlog.md` for per-screen item lists.

---

## 11. References

- D-044 (this decision)
- `docs/ux/polish-backlog.md` — per-screen work items
- The four Brutalist editorial mockups exchanged in chat on 2026-05-23 (Marketplace page, full fidelity)
- Type inspiration: read.cv, are.na, ssense.com editorial pages
