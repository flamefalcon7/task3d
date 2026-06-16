---
title: "feat: PreviewCanvas GLB-load wireframe overlay (shared with TaggingCanvas)"
type: feat
date: 2026-06-16
origin: docs/brainstorms/2026-06-16-preview-canvas-loading-state-requirements.md
depth: lightweight
---

# feat: PreviewCanvas GLB-load wireframe overlay

## Summary

`PreviewCanvas` shows a bare clearColor backdrop (gray since D-107) while a GLB
loads — no indication anything is happening. Its sibling `TaggingCanvas` already
solves exactly this with a `meshLoaded` flag driving a wireframe-cube overlay
(`tagging-canvas-loading`). This plan extracts that overlay into a shared
`WireframeLoadingOverlay` component, adds it to `PreviewCanvas` (with the
null-`glbUrl` / dispose-window / error-race handling PreviewCanvas needs that
TaggingCanvas's simpler version skips), and upgrades the overlay with a slow
pulse/rotate animation that respects `prefers-reduced-motion`. Both sibling
canvases then render the same animated overlay.

---

## Problem Frame

While `LoadAssetContainerAsync` fetches + parses a GLB (often a multi-second
remote blob from the Walrus aggregator on `/market` and `/model/:id`), every
`PreviewCanvas` mount renders only its clearColor — a flat box with no progress
affordance. The fix lives inside `PreviewCanvas` so all ~8 mount sites benefit
from one change (see origin: `docs/brainstorms/2026-06-16-preview-canvas-loading-state-requirements.md`).

---

## Key Technical Decisions

### KTD1 — Mirror TaggingCanvas's `meshLoaded` pattern, not `loadEpoch`
`PreviewCanvas` already bumps `setLoadEpoch` on successful load, but that counter
exists to re-fire the mode effect, not to gate UI. Add a dedicated boolean
(`meshLoaded`), mirroring `TaggingCanvas.tsx:116` exactly, so the overlay's
visibility logic is explicit and matches the sibling. (Origin decision: reuse the
wireframe-cube motif.)

### KTD2 — Extract one shared `WireframeLoadingOverlay` (purely presentational)
Both canvases get the same overlay component. The component is presentation only —
it renders the cube SVG + `LOADING …` label and owns the animation; it does **not**
decide *when* to show. Each canvas keeps its own visibility condition (KTD3) so
TaggingCanvas's current behavior is preserved bit-for-bit while it gains the new
animation for free. (Confirmed call-out: shared component over inline copy.)

### KTD3 — Visibility condition stays per-call-site
- `PreviewCanvas`: render the overlay only when `mounted && glbUrl && !meshLoaded`.
  The `glbUrl` guard satisfies origin requirement "no overlay when `glbUrl` is null"
  (parent owns its own empty state); the `mounted` guard keeps the overlay off during
  the `LaunchCollectionPage` dispose/upload window.
- `TaggingCanvas`: keep `!meshLoaded` unchanged — it is always handed a `glbUrl` and
  has no dispose/remount cycle, so its existing condition stays correct.

### KTD4 — Settle the flag on every load outcome, guarded by the load token
The overlay must never stick. In `PreviewCanvas`'s GLB-load effect, all state
mutations are guarded by the existing race check (`token === loadTokenRef.current
&& !cancelled && !isDisposedRef.current`):
- start of effect (when `glbUrl` truthy): `setMeshLoaded(false)` → overlay shows
- success: `setMeshLoaded(true)` → overlay hides
- error (`catch`): `setMeshLoaded(true)` → overlay hides (canvas stays at clearColor;
  explicit error glyph is deferred per origin open question). "Loaded" here means
  "load attempt settled."
- stale token / cancelled / disposed: **do not** touch the flag — the winning load
  owns the state, preventing a slow first load from clearing a fast second load's
  spinner.

### KTD5 — Animation via a CSS module (mirrors IndeterminateBar)
The project styles with inline `CSSProperties` and has no keyframe infra, but
`IndeterminateBar` already establishes the pattern: a co-located CSS module
(`indeterminateBar.module.css`) holding `@keyframes`. `WireframeLoadingOverlay`
gets its own `*.module.css` with a slow pulse/rotate keyframe plus a
`@media (prefers-reduced-motion: reduce)` block that disables motion (origin
requirement 5).

---

## Requirements Traceability

| Origin requirement | Covered by |
|---|---|
| Overlay only when `glbUrl` set + load in-flight | U2 (KTD3) |
| Hide on success / failure / supersede | U2 (KTD4) |
| Not during dispose/remount window | U2 (KTD3 `mounted` guard) |
| Below pills, no pointer capture | U1 (`pointerEvents: none`), U2 |
| `prefers-reduced-motion` respected | U1 (KTD5) |
| Wireframe-cube visual, all mount sites | U1 + U2 |

---

## Implementation Units

### U1. Shared `WireframeLoadingOverlay` component + animation
**Goal:** One presentational overlay (cube SVG + label) with pulse/rotate animation
and reduced-motion fallback, reusable by both canvases.
**Requirements:** wireframe-cube visual; `prefers-reduced-motion`; no pointer capture.
**Dependencies:** none.
**Files:**
- `frontend/src/babylon/WireframeLoadingOverlay.tsx` (new)
- `frontend/src/babylon/wireframeLoadingOverlay.module.css` (new)
- `frontend/src/babylon/WireframeLoadingOverlay.test.tsx` (new)
**Approach:** Lift the SVG + `loadingOverlay`/`loadingLabel` styles from
`TaggingCanvas.tsx:296-348` into the component. Accept an optional `testId` and
`label` prop (default `LOADING …`) so each canvas keeps its own testid
(`tagging-canvas-loading` stays stable; PreviewCanvas uses `preview-canvas-loading`).
Root element: `position: absolute; inset: 0; pointerEvents: none`, `aria-hidden`.
Move keyframes (slow rotate on the cube `<g>`, gentle opacity pulse) into the CSS
module; reduced-motion media query removes the animation, leaving a static cube.
**Patterns to follow:** `IndeterminateBar` + `indeterminateBar.module.css` (CSS-module
keyframe pattern); `TaggingCanvas` overlay markup.
**Test scenarios:**
- Renders the cube SVG and the label text given a `label` prop.
- Applies the passed `testId` to the root element.
- Root carries `aria-hidden` and `pointer-events: none`.
- Test expectation: presentational only — no behavioral/animation assertion (jsdom
  doesn't run CSS animations; reduced-motion is verified visually in U4).

### U2. Wire the overlay into `PreviewCanvas`
**Goal:** Show the overlay while a GLB loads on every PreviewCanvas mount; hide it on
every load outcome without sticking.
**Requirements:** all origin requirements 1–5.
**Dependencies:** U1.
**Files:**
- `frontend/src/babylon/PreviewCanvas.tsx`
- `frontend/src/babylon/PreviewCanvas.test.tsx`
**Approach:** Add `const [meshLoaded, setMeshLoaded] = useState(false)`. In the
`[glbUrl, mounted]` GLB-load effect, `setMeshLoaded(false)` at the top (when `glbUrl`
truthy), `setMeshLoaded(true)` in the success path and the `catch`, both guarded by
the existing `token === loadTokenRef.current && !cancelled && !isDisposedRef.current`
check (KTD4). Render `{mounted && glbUrl && !meshLoaded && <WireframeLoadingOverlay
testId="preview-canvas-loading" />}` inside the existing relative wrapper, **before**
the `ModeTogglePill` / `BgTogglePill` in JSX so the pills paint above it (and the
overlay's `pointerEvents: none` leaves pill clicks unaffected).
**Patterns to follow:** `TaggingCanvas` load effect (`TaggingCanvas.tsx:168-205`) for
the false→true transition; existing `loadTokenRef` / `isDisposedRef` race guards in
`PreviewCanvas` itself.
**Test scenarios:**
- Overlay present immediately after mount with a non-null `glbUrl`, before the mocked
  load resolves.
- Overlay gone after the load resolves (`setMeshLoaded(true)`).
- No overlay when `glbUrl` is `null` (covers origin requirement 1).
- Overlay gone after the load rejects (mocked `LoadAssetContainerAsync` throws) — spinner
  cleared, not stuck (origin requirement 2).
- Stale-token race: a second `glbUrl` whose load resolves first does not leave the first
  load's overlay stuck; the superseded load's late resolution does not flip state.
- No overlay while `mounted === false` (dispose window) even with `glbUrl` set
  (origin requirement 3) — drive via the imperative `dispose()` handle.

### U3. Refactor `TaggingCanvas` onto the shared overlay
**Goal:** Replace TaggingCanvas's inline overlay with the shared component; behavior
identical, plus the new animation.
**Requirements:** consistency; no behavioral regression.
**Dependencies:** U1.
**Files:**
- `frontend/src/babylon/TaggingCanvas.tsx`
- `frontend/src/babylon/TaggingCanvas.test.tsx` (verify, likely unchanged)
**Approach:** Delete the inline SVG block and the `loadingOverlay`/`loadingLabel` style
consts; render `{!meshLoaded && <WireframeLoadingOverlay testId="tagging-canvas-loading"
label="LOADING MESH" />}`. Keep the `!meshLoaded` condition (KTD3). The existing
`tagging-canvas-loading` testid must remain so current tests pass untouched.
**Patterns to follow:** the existing TaggingCanvas render structure.
**Test scenarios:**
- Existing `tagging-canvas-loading` assertions still pass (overlay shown until
  `meshLoaded`, gone after) — confirm no regression.
- Label still reads "LOADING MESH".

### U4. Browser verification across mount surfaces
**Goal:** Confirm the overlay renders correctly on real WebGL across surfaces, per the
CLAUDE.md Frontend Verification Protocol.
**Requirements:** verification.
**Dependencies:** U2, U3.
**Files:** none (manual/agent-browser).
**Approach:** With `pnpm --dir frontend dev` running, drive a headed browser (Babylon
needs a real GPU context) to: `/dev/compare` (8 PreviewCanvas mounts — overlay visible
during load, gone after), `/create` (tagging step → TaggingCanvas overlay), and one
remote-blob read path (`/market` or `/model/:id`) where the load gap is longest. Assert
`preview-canvas-loading` / `tagging-canvas-loading` appear then disappear; eyeball the
animated cube and a `prefers-reduced-motion` run (DevTools emulation) showing a static
cube.
**Test expectation:** none — manual verification unit.
**Verification:** overlay appears during load and clears after on all three surfaces;
reduced-motion emulation shows no animation.

---

## Scope Boundaries

**In scope:** shared animated wireframe overlay in PreviewCanvas + TaggingCanvas; race/
dispose/error handling; reduced-motion fallback.

### Deferred to Follow-Up Work
- Explicit error glyph (⚠ + retry) on GLB-load **failure** — origin open question; MVP
  clears the spinner and leaves the clearColor backdrop.
- Determinate / percentage progress — the Babylon loader gives no reliable byte progress
  for blob URLs; indeterminate animation is the honest affordance.
- `--well` CSS token color — unrelated (tracked under D-107 follow-up).

---

## Risks & Dependencies

- **Stuck spinner via load races** — the highest-value correctness risk; covered by KTD4
  and the U2 stale-token / error / dispose test scenarios. This is the
  `ce-julik-frontend-races-reviewer` domain (default frontend review roster).
- **Pill click regression** — overlay must not capture pointer events; mitigated by
  `pointerEvents: none` (U1) and JSX ordering (U2).
- **TaggingCanvas regression** — refactor must preserve the `tagging-canvas-loading`
  testid and `!meshLoaded` behavior (U3 test scenarios).

---

## Verification Strategy

- Unit: U1–U3 scenarios via vitest (`frontend/src/babylon/*.test.tsx`).
- Browser: U4 across `/dev/compare`, `/create` tagging, and a remote read path (headed).
- Typecheck: `pnpm --dir frontend exec tsc --noEmit`.
- Review: default frontend-touching roster incl. `ce-julik-frontend-races-reviewer`.

---

## Sources & Research

- Origin: `docs/brainstorms/2026-06-16-preview-canvas-loading-state-requirements.md`
- Reference impl: `frontend/src/babylon/TaggingCanvas.tsx` (`meshLoaded` + overlay)
- Animation pattern: `frontend/src/ux/IndeterminateBar.tsx` + `indeterminateBar.module.css`
- No external research — the sibling component is a near-exact local pattern.
