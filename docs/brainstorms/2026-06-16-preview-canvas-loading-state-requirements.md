# Requirements — PreviewCanvas loading state

**Date:** 2026-06-16
**Scope:** Lightweight (frontend-touching)
**Status:** Ready for `ce-plan`

## Problem

`PreviewCanvas` (`frontend/src/babylon/PreviewCanvas.tsx`) mounts a bare Babylon
`<canvas>`. While a GLB loads — `LoadAssetContainerAsync` fetching the blob over
the network (often from the Walrus aggregator / CDN, multi-second) plus Babylon
parse + camera framing — the canvas shows only its `clearColor` (D-044 default
black). There is no in-component loading state, so every mount site renders a
"black box" during the load gap.

Affected surfaces (all consume `PreviewCanvas`): `/create`, `/market` tiles,
`/model/:id`, collection cards, NFT detail, `/track`, dev compare page. Read-path
surfaces (market, detail pages) are worst-hit because the blob fetch is remote.

Note: the `/create` page already has separate progress affordances — an
`IndeterminateBar` (`generate-progress`) for the Tripo generation phase and a
`WireframePlaceholder` (wireframe-cube SVG) for the empty/no-model state. The
uncovered gap is specifically "`glbUrl` set → canvas mounts → GLB still loading".

## Goal

While a GLB is loading inside `PreviewCanvas`, show an animated loading overlay
instead of a black box, on **all** mount sites via a single change inside the
component.

## Decisions (locked)

- **Visual:** reuse the existing wireframe-cube motif (the `WireframePlaceholder`
  shape) with a slow pulse/rotation animation + a `loading…` affordance, layered
  over the canvas. Chosen over a generic spinner / reused `IndeterminateBar` for
  brand consistency with the existing empty-state visual and continuity on
  `/create` (empty wireframe → loading wireframe → model).
- **Scope:** implement inside `PreviewCanvas` so all ~8 mount sites benefit at
  once. Single source of truth, no per-call-site wiring.

## Behavior / requirements

1. Overlay is visible only when `glbUrl` is non-null **and** the GLB load is
   in-flight. When `glbUrl` is null, render no overlay — the parent owns its own
   empty-state placeholder (e.g. `/create`'s `WireframePlaceholder`).
2. Overlay hides when the load settles — on success, on failure, and when the
   load is superseded/cancelled. The loading flag must be cleared in the
   token-stale branch and the cancel branch as well as the success path, so a
   races between rapid base re-picks (existing `loadTokenRef` pattern) can't
   leave a stuck spinner.
3. Must not trigger during the `LaunchCollectionPage` dispose/remount upload
   window. Tying the loading flag to the existing `[glbUrl, mounted]` GLB-load
   effect satisfies this (the effect doesn't run while disposed); verify no
   spurious overlay appears on remount with an already-resolved blob.
4. Overlay sits above the canvas but below the existing BG/mode toggle pills, and
   does not capture pointer events meant for those pills or the canvas.
5. The wireframe-cube animation respects `prefers-reduced-motion` (static cube,
   no spin) — nice-to-have, include if low-cost.

## Out of scope

- No change to the generation-phase `IndeterminateBar` or its copy.
- No determinate / percentage progress (the Babylon loader doesn't surface
  reliable byte progress for our blob URLs; an indeterminate animation is the
  honest affordance).

## Open questions

- **OQ:** On GLB load **failure** the overlay just hides and the canvas stays
  black (current behavior). MVP keeps this. Do we later want an explicit error
  glyph (⚠ + retry) in the well? Defer unless trivial to fold in.

## Implementation notes (for `ce-plan`, not prescriptive)

- `WireframePlaceholder` currently lives inline in `CreateModelPage.tsx`. Reuse
  requires extracting it to a shared module (e.g. `babylon/` or `ux/`) or
  reimplementing a small variant inside `PreviewCanvas`. ce-plan to choose.
- Add an internal `loading` state to `PreviewCanvas`, set true at the start of
  the GLB-load effect (when `glbUrl` is truthy) and false in every settle branch
  of the async loader.

## Verification (per CLAUDE.md Frontend Verification Protocol)

- Frontend-touching → browser-verify via `ce-test-browser` on `/create`
  (generate or upload a GLB, watch the load gap) and at least one read-path
  surface (`/market` or `/model/:id`) where the blob fetch is remote.
- Unit: `PreviewCanvas.test.tsx` — assert the overlay shows while the mocked
  load is pending and is gone after it resolves; assert no overlay when
  `glbUrl` is null.
- Default review roster for frontend-touching plans applies (includes
  `ce-julik-frontend-races-reviewer`) — the load-token / cancel race in req. 2
  is exactly its domain.
