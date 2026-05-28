# Walrus /launch 8-Variant OOM Fix — Requirements

**Status**: requirements complete · ready for ce-plan
**Date**: 2026-05-28
**Origin**: ce-debug session 2026-05-28 (this conversation, Phase 2 root-cause
confirmation via Brave minidump strings extraction)
**Phase**: Phase 4 follow-up (Plan-017 candidate); supersedes
plan-016's framing of the crash as "environmental & unsolvable"

## Context

`/launch` page crashes the Brave renderer during the Walrus upload
phase when the user attempts to publish **8 variants**. The user
confirms **5 variants succeeds** in the same Brave + same tab state
(dose-response, monotonic in variant count).

The plan-016 TestWalletAdapter bypassed the symptom for agent-browser
recording (clean Chromium, no tabs/extensions, ~200 MB baseline heap),
but the underlying bug is still present in the user's day-to-day Brave
when running the dapp-kit signer OR the test-wallet signer — i.e. the
crash is NOT signer-related.

### Root cause (confirmed)

Brave minidump `b69ca99a-…ead.dmp` captured at 2026-05-28 09:53:41
contains V8 GC traces showing the killing signature:

```
[23207:0x134007a0000] 10797704 ms: Mark-Compact (reduce)
  3997.3 (4000.5) -> 3997.3 (4000.5) MB,
  1286.71 / 0.00 ms (average mu = 0.003, current mu = 0.000)
  last resort; GC in old space requested
```

- Heap usage **3997.3 MB / 4000.5 MB cap** (V8 default old-space limit
  is ~4 GB)
- Mark-Compact ran **1.28 seconds and reclaimed zero MB** (`mu = 0.003`
  = 0.3% efficiency)
- V8 explicitly flagged itself as `last resort` GC mode
- Brave killed the unresponsive renderer

The crash is NOT in any extension, NOT in dapp-kit IPC, NOT in
Slush/Brave Wallet content scripts. All previous hypotheses
(`debug/walrus-upload-crash` branch's 11 commits) are falsified by the
minidump evidence.

### Why the breadcrumb pointed at fetch

The diagnostic trail's last entry was always
`encoding:before-systemState` or `encoding:fetch-1-start` — fetch was a
**victim**, not the cause. fetch tries to allocate a response buffer,
V8 has zero free heap, alloc fails, last-resort GC, Chrome kill. The
breadcrumb stops because the renderer is gone.

### Memory math (estimated)

Per Walrus encoded variant:
- GLB ArrayBuffer ~3-6 MB
- Reed-Solomon encoded sliver matrix ~10-20 MB (RS overhead ~3x input)
- React state + dapp-kit cache ~5-10 MB
- ≈ **20-40 MB per variant** during encode peak

8 variants encoded in parallel (current `writeFilesFlow` batch
behavior) → 160-320 MB peak Walrus allocation, on top of:
- Brave baseline + sibling tabs + extension processes ≈ 3.0-3.5 GB
- Babylon `PreviewCanvas` scene (preserved during upload) ≈ 200-400 MB
- Cached GLBs (8 × base + 8 × variant) ≈ 50-100 MB
- dapp-kit + React + Vite HMR overhead ≈ 100-200 MB

= 3.5-4.0+ GB, crossing V8's 4 GB ceiling between 5 and 8 variants.

### Why agent-browser succeeds

Clean Chromium spawned by agent-browser has baseline ~200 MB heap, no
tabs, no extensions. 8 × 30 MB = 240 MB sits comfortably in 4 GB cap.
This is also why all prior workarounds (RPC swap, GPU collapse,
pre-warm) didn't shift the crash signature — none of them addressed
heap pressure.

## Goal

Make `/launch` 8-variant upload succeed in the user's Brave (with
sibling tabs, Brave Wallet, Slush extension all present — the realistic
demo-recording and production-user environment), without forcing them
to close everything. The dapp-kit (Slush) and test-wallet (plan-016)
paths must both benefit — the fix is signer-orthogonal.

## Non-goals

- Raising V8's old-space cap via Chrome `--js-flags` (not deployable to
  production users)
- Forcing users to install/use agent-browser (it's a dev tool)
- Solving Brave-specific behavior (Brave Wallet, Shields, etc.) — the
  fix targets the heap problem, not Brave
- Restructuring `writeFilesFlow` upstream (Mysten SDK) — we work
  within its existing public API
- Reducing GLB input size (texture downscaling) — separate concern,
  out of scope
- Mainnet path (testnet only for 6/21 submission)

## Requirements

- **R1 — Sequential Walrus encode**: `useWalrusUpload`'s
  `writeFilesFlow` invocation must encode + register variants **one at
  a time** rather than as a single 8-element batch. Peak memory
  pressure during encode becomes `1 × per-variant` instead of `8 ×
  per-variant`. Implementation may either:
  - (a) Call `writeFilesFlow({files: [single_variant]})` 8 times
    sequentially, OR
  - (b) Use whatever the SDK exposes as a streaming/chunked API if one
    exists.

  Resolve (a)-vs-(b) during plan-017 U1 by reading
  `@mysten/walrus/writeFilesFlow.ts` and picking whichever shape
  doesn't break the on-chain register chain (currently a single
  register tx batches all 8 quilt patch IDs).

- **R2 — Pre-LAUNCH Babylon scene dispose**: `LaunchCollectionPage`
  must `dispose()` the `PreviewCanvas` Babylon scene right before
  calling `uploadFiles()`, and restore it (or display a static
  placeholder) after the launch tx settles. Frees ~200-400 MB of GPU +
  heap held by Babylon's `Scene`, `Mesh`, `Material`, and
  `BaseTexture` arrays.

- **R3 — Variant cap unchanged at 8**: spec'd max stays. R1+R2 should
  be sufficient to fit 8 variants in the heap envelope. If post-impl
  measurement shows R1+R2 isn't enough for 8 (verify with the SAME
  user-Brave-state that caused the original crash), plan-017 can add a
  conditional cap as a fallback unit — but the default plan target is
  8.

- **R4 — Memory pressure pre-flight warning**: before LAUNCH executes,
  check `performance.memory.usedJSHeapSize` (Chromium-only API,
  available in Brave). If `usedJSHeapSize > 2.5 GB` (chosen so we
  leave 1.5 GB headroom for encode), show a non-blocking warning
  banner: "High memory usage detected — close other tabs to reduce
  crash risk." User can dismiss and proceed at own risk. Graceful
  no-op on browsers without `performance.memory`.

- **R5 — Telemetry breadcrumb survives in main**: keep the `append-N`
  localStorage breadcrumb trail from `debug/walrus-upload-crash`
  branch in a minimal form — at least the `pre-encode` /
  `post-encode-N` / `pre-register-N` / `post-launch-tx` markers, so if
  a user reports a crash in the wild we can read their localStorage to
  see how far they got. Drop the heavy per-fetch wrapping; keep only
  the stage markers.

## Actors

- **A1 (Creator, real Brave)**: User wants to publish a 1-8 variant
  collection from their day-to-day Brave with sibling tabs and
  extensions installed. The most realistic demo-recording and
  production-user case.
- **A2 (Creator, agent-browser)**: Future automation / regression
  tests. Already works post-plan-016; R1+R2 must not regress it.
- **A3 (Production user, fresh Chrome profile)**: Unknown demo
  attendees who load the dapp post-deploy. R1+R2 makes their
  experience strictly safer — never worse.

## Flows

- **F1 — 8-variant LAUNCH happy path (A1)**:
  1. User on `/launch`, picks base, configures 8 variants
  2. Click LAUNCH
  3. Pre-flight: if `usedJSHeapSize > 2.5 GB`, show warning banner
     (user can dismiss). (R4)
  4. PreviewCanvas Babylon scene `dispose()`d; preview slot shows
     static "LAUNCHING…" placeholder. (R2)
  5. `useWalrusUpload.uploadFiles` runs sequentially: encode variant
     1 → register quilt patch 1 → release encoder buffers → encode
     variant 2 → … → encode variant 8 → register quilt patch 8. (R1)
  6. Single `executeCertify` over all 8 patches (unchanged from
     current).
  7. `buildLaunchCollectionWithTokensPtb` runs (unchanged).
  8. Banner: "LAUNCHED" + on-chain tx digest. Preview restored or
     replaced by post-launch summary. (R2)

- **F2 — Heap pressure pre-flight warns (A1)**:
  1. User loaded /launch with 12 other tabs open + Brave Wallet
     sidebar + Slush unlocked
  2. Click LAUNCH
  3. `usedJSHeapSize` reads 3.1 GB
  4. Banner: "High memory usage detected — close other tabs to reduce
     crash risk." (R4)
  5. User dismisses, proceeds anyway. F1 sequential encode buys
     enough headroom to still succeed (with R1+R2 the per-variant
     peak is 30 MB, not 240 MB).

## Acceptance examples

- **AE1**: With sibling-tab-loaded Brave (≥10 tabs) + Brave Wallet
  enabled + Slush unlocked, user can /launch a **6-variant**
  collection without renderer crash. Pre-R1+R2 baseline crashed at 8;
  6 should be comfortable.
- **AE2**: Same environment, **8-variant** /launch succeeds. This is
  the headline win — the original crash repro now passes.
- **AE3**: agent-browser smoke (clean Chromium, plan-016 test wallet)
  still passes /launch with 8 variants on testnet. Sequential encode
  doesn't regress the working case. (Re-verify: AE5 from plan-016.)
- **AE4**: With deliberately-loaded heap (`window.__leak = new
  Array(1e8).fill(0)` in devtools, ~800 MB extra), pre-flight banner
  appears, user can dismiss, LAUNCH still completes. Validates R4.
- **AE5**: localStorage after a fresh `/launch` 8-variant run contains
  staged breadcrumb keys `walrus:trail:pre-encode`,
  `walrus:trail:post-encode-8`, `walrus:trail:post-launch-tx`.
  Validates R5.

## Key decisions

- **D-062 candidate**: Walrus 8-variant batch → sequential per-variant
  encode is the **primary** memory mitigation. NOT a backup. Reason:
  Babylon dispose alone (R2 only) is not deterministic enough — GPU
  driver can hold buffers past `dispose()` call on some macOS Metal
  versions. Sequential encode is enforceable from JS land; Babylon
  cleanup is best-effort.

- **D-063 candidate**: Variant cap stays at 8 per `Model3D`.
  Justification: R1+R2 budget math estimates 8 × 30 MB peak (one at a
  time) + 100 MB Babylon static placeholder = comfortably within
  Brave baseline +1.0 GB headroom. If post-impl measurement disproves
  this, fallback is to cap at 6 in a follow-up patch — but spec
  invariant should not regress preemptively.

- **D-064 candidate**: `performance.memory` is a Chromium proprietary
  API (works in Chrome, Edge, Brave; **NOT** Firefox or Safari).
  Since the dapp's wallet (Slush) is Chromium-only anyway, this is
  acceptable scope. Firefox/Safari users fall through the R4 gate
  silently (no warning, no harm).

- **D-065 candidate**: Telemetry breadcrumb (R5) goes to localStorage
  not Sentry/console. Reason: localStorage survives renderer crash;
  Sentry's send buffer is lost when the renderer dies. localStorage
  is what made the original investigation possible in the first
  place.

## Open / deferred questions

- **OQ-A**: Does the Walrus on-chain register chain require all
  quilt-patch IDs in a single tx, or can we register sequentially
  too? If sequential register is allowed, R1 implementation gets
  simpler. If batched register is required, R1 must encode 8 → batch
  register 8. (Verify by reading `useWalrusUpload.ts` and
  `@mysten/walrus` package during plan-017 U1.)
- **OQ-B**: Does `Babylon.Scene.dispose()` reliably free the GPU
  buffers on macOS Metal, or does it need a paired
  `engine.releaseEffects()` + force `engine.releaseTexturesByName()`?
  (Verify during R2 implementation; if not, document the limitation.)
- **OQ-C**: Is `performance.memory.usedJSHeapSize` accurate in Brave?
  Some Brave builds quantize it for fingerprinting protection.
  Threshold of 2.5 GB is conservative; if Brave returns rounded
  values, threshold may need adjustment. Measure during R4 impl.
- **OQ-D**: Should R2 dispose the entire scene and remount, or just
  dispose meshes and keep the engine? Engine destruction triggers
  WebGL context loss which can ripple to other GL features. (Lean:
  dispose meshes + materials + textures, keep engine alive, render a
  single static quad as placeholder.)
- **OQ-E**: GLB texture downscaling as a follow-up — out of plan-017
  scope but worth noting that input-side size reduction is the next
  lever if 8-variant peak still has headroom issues.

## Scope estimate

- `frontend/src/walrus/useWalrusUpload.ts` — sequential encode
  refactor (~50-100 lines changed) (R1)
- `frontend/src/collection/LaunchCollectionPage.tsx` — Babylon
  dispose lifecycle hook around `uploadFiles()` call (~20 lines added)
  (R2)
- `frontend/src/collection/PreviewCanvas.tsx` (or wherever the
  Babylon scene is owned) — expose `dispose()` and `restore()` /
  `mountPlaceholder()` (~30 lines) (R2)
- `frontend/src/collection/MemoryPressureBanner.tsx` — new component
  (~50 lines) (R4)
- `frontend/src/walrus/uploadTrail.ts` — breadcrumb helper, lifted
  from `debug/walrus-upload-crash` but trimmed (~40 lines) (R5)
- Tests: `useWalrusUpload.test.ts` covers sequential ordering;
  `LaunchCollectionPage.test.tsx` covers dispose lifecycle (mock
  PreviewCanvas)
- ADRs in `docs/decisions.md`: D-062, D-063, D-064, D-065
- ~3-4 hour implementation. One session feasible. Split if needed:
  (S1) U1-U2 sequential encode + Babylon dispose. (S2) U3-U4 warning
  banner + trail breadcrumb + verification on user's Brave with 8
  variants.

## Pre-impl verification responsibility

Before implementation, plan-017's U1 should verify R1's
implementability:
- Read `@mysten/walrus` source for `writeFilesFlow` — is encode/register
  separable per variant, or atomically batched?
- If atomically batched, R1 becomes "encode-and-release per variant"
  inside the SDK's batch call — may not be possible without forking
- If separable, the sequential refactor is straightforward

If the SDK shape blocks R1, plan-017 must pivot to R2-only + lower cap
(6 variants for v1.0, "we'll get 8 in v1.1 after Walrus SDK improves").
