---
title: "Frontend pre-commit checklist — 5 bug-pattern categories"
date: 2026-05-25
category: conventions
module: frontend
problem_type: prevention
component: claude-workflow
tags:
  - checklist
  - pre-commit
  - frontend-uat
  - agent-browser
---

# Frontend Pre-Commit Checklist

Claude consults this checklist before declaring any frontend-touching commit done — alongside the `agent-browser` drive (see `CLAUDE.md` §Frontend Verification Protocol). Each category names what change-shapes trigger the check, what to verify, and at least one observed bug from this project's history so the lesson stays grounded.

---

## 1. Cross-component / cross-session state lifecycle

**When this applies:** You touched a hook that exposes shared state via `useState`, you added `localStorage` reads/writes, you added a `useEffect` with a `useRef` for cleanup, or you changed a cache key.

**What to check:**
- How many readers does this state have? If 2+ components call the same hook, a single component's `setState` will NOT update the others — you need a shared store, a context, or a CustomEvent broadcast pattern.
- `useEffect` with `useRef`: setup AND cleanup paths are symmetric? StrictMode double-mounts every effect in dev; cleanup-only effects will silently drop the second mount's setup.
- localStorage reads: do they have explicit invalidate conditions (expiry, address change, schema version)? Or will a stale value resurface forever?
- Cache key: is it pinned to a value that changes when the backing data changes (e.g., `package_id`)? Otherwise a republish leaves users on a stale cache.

**Observed-bug examples:**
- `69ef26a` — `useSession` per-component `useState` left every sibling stale after sign-in; fixed via CustomEvent broadcast.
- `cc8dcdd` — Expired JWT stayed in localStorage on read; UI presented "signed in" until the gated call 401'd.
- `docs/solutions/conventions/react-strictmode-cleanup-only-effect-with-useref-2026-05-23.md` — Cleanup-only `useEffect` with `useRef` silently broke under StrictMode.

---

## 2. Async UX feedback / loading affordance

**When this applies:** You added a button that triggers a >1s action (network, signed tx, mesh load, image upload), you added a post-tx state change, or you added a route-load-time external fetch.

**What to check:**
- From click to result, is there a visible "I'm working" signal within ~100ms? Spinner, label change, disabled button — something the user sees.
- Is the trigger button disabled while pending? Otherwise the user double-clicks and submits twice.
- Post-tx state: does the UI auto-refresh, or does the user have to navigate-then-back to see the result? If pull-only, the user thinks the tx failed.
- For long-running async (mesh load, base mesh fetch), does the viewer well show a placeholder (wireframe, label, percent) instead of staying black?

**Observed-bug examples:**
- `458037a` — After list/buy, market view didn't auto-refresh; users thought the tx silently failed.
- `16998ae` — Three UX gaps in plan-013: no "downloading base mesh" label, no "building N variants" count, no overlay on tagging canvas during async load.

---

## 3. Real-data vs test fixture drift

**When this applies:** You added a parser/decoder, you wrote tests against a hand-rolled fixture, you mocked an external SDK, or you assumed a wire format from docs.

**What to check:**
- Where did the fixture come from? If hand-crafted, what real-world variants does it hide — codec extensions, optional fields, RPC quirks, encoding differences?
- For binary formats (GLB, BCS), does the parser register all extensions the producer might emit, or just the ones in the fixture?
- For SDK calls, do you trust the SDK's return shape, or did you `console.log` at least one real response to see what actually comes back?
- If a unit test passes but an e2e against testnet fails, the mock is hiding something real.

**Observed-bug examples:**
- `a87f706` — Tripo GLBs use `EXT_meshopt_compression`; Babylon doesn't decode it by default. Fixture-only tests passed; real meshes were invisible.
- `bb3555a` — Same shape, different extension: `KHR_mesh_quantization`. Two extensions, two debug cycles, one lesson.
- `b2d2c42` — Kiosk SDK returned u64 listing prices as garbage strings; tests mocked clean numbers.

---

## 4. Source-of-truth drift

**When this applies:** You wrote the same constant in two places (FE + BE, env var + code pin, prod + test), you added a cache key that embeds a value pinned elsewhere, or you set a default for a value also configured upstream.

**What to check:**
- How many places hold this value? If more than one, which is canonical? Document it inline OR collapse to one source.
- For FE/BE shared constants (fees, limits, package IDs), is there a shared module they both import, or are they written twice by hand?
- For env-var defaults: does the BE default match the FE expectation? A divergent default fails silently when the env var is unset (dev, demo machines, CI).
- For cache keys: does it embed the version/id of the backing data so a republish invalidates it?

**Observed-bug examples:**
- `e886dff` — Frontend read-side hooks used `import.meta.env.VITE_*`; write-side used `TESTNET.model3dPackageId`. Different sources, divergent state in dev.
- `8706036` F1 — Backend default `TRIPO_FEE_MIST` was 100M MIST; frontend default was 400M MIST. Demo machines used the BE default and minted at the wrong price.
- `8706036` F2 — Model-index cache key embedded only `v1`, not the package id, so a v7→v8 republish left users on the v7 cached index.

---

## 5. Effect dependency completeness

**When this applies:** You added or modified a `useEffect`, `useCallback`, or `useMemo`. You read a prop, state, or ref value inside the closure.

**What to check:**
- Every value read inside the closure is in the dep array, OR explicitly justified inline.
- ESLint rule `react-hooks/exhaustive-deps` is **error**, not warn. If silenced, the silence comment explains why.
- "Safe by coincidence" today is a stale-closure bug tomorrow — the dep array is a contract, not a guess.
- If the effect captures a `useRef.current`, the value at effect-time may differ from the value at fire-time. Read `.current` inside the handler, not at closure-capture.

**Observed-bug examples:**
- `8706036` F6 — `runBuildVariants` callback in `LaunchCollectionPage` missed `base` in its dep array. As long as `base` was set during mount it worked by coincidence; if it changed mid-flow, the closure used the stale base.

---

## How to use

Before declaring any frontend commit done:

1. Decide which categories apply to this change. Most commits hit 1-2; some hit zero (pure copy edit, pure styling).
2. For each applicable category, run the "What to check" list against the diff.
3. If a category doesn't apply, say so explicitly in the self-review notes — don't silently skip.
4. If a check fails, fix it before commit. If unsure whether it fails, drive the surface in `agent-browser` and verify the symptom doesn't appear.

This is a living document. As new bug-pattern categories emerge from user-discovered regressions, add them here.
