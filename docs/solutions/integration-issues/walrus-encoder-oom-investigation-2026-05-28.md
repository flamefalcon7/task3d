---
title: "Walrus WASM encoder OOM with complex segmented bases at 8 variants"
date: 2026-05-28
category: integration-issues
module: walrus
problem_type: integration_issue
component: frontend
severity: high
status: open
tags:
  - walrus
  - oom
  - encodeQuilt
  - reed-solomon
  - mesh-segmentation
  - mentor-question
applies_when:
  - "Uploading 8+ variants of a segmented base (plan-013 mesh segmentation)"
  - "Per-variant GLB size ≥ ~5 MB"
  - "Total variant bytes per launch ≥ ~40 MB"
related_components:
  - frontend/src/walrus/useWalrusUpload.ts
  - backend/routes/collection/build.ts
  - "@mysten/walrus": 1.1.7
  - "@mysten/walrus-wasm": (bundled)
---

# Walrus WASM encoder OOM at the 4 GB V8 ceiling

This is an open investigation. We have empirical data + a working theory but
no solution within the trade-offs we're willing to make (we don't want to
sacrifice mesh quality). Filed for hackathon mentor / Walrus team consult.

## The problem in one paragraph

Calling `client.walrus.writeFilesFlow({ files }).encode()` on the browser
side with N ≥ 5 mesh-segmented GLB variants (each ~5–10 MB) reproducibly
crashes the Brave renderer with a V8 OOM at the 4 GB old-space ceiling.
The crash occurs inside `client.encodeQuilt(blobs)` — the SDK's Reed-Solomon
erasure-coding step — before any wallet popup fires. JS heap baseline at
the moment of crash is ~370 MB, total tab process memory hits the cap
during encode. Identical code path on simpler (less-segmented) bases of
the same variant count succeeds, suggesting the gate is total input
bytes, not variant count.

## Reproduction

`frontend/src/walrus/useWalrusUpload.ts` `uploadFiles()` is called from
`LaunchCollectionPage` `onLaunch` with N variant GLBs (Uint8Arrays
produced by a backend material-swap pipeline).

```ts
const flow = client.walrus.writeFilesFlow({
  files: variants.map((bytes, i) =>
    WalrusFile.from({ contents: bytes, identifier: `file-${i}` }),
  ),
});
await flow.encode();  // ← OOM happens here
await flow.executeRegister({ signer, epochs: 10, ... });
// ...
```

## Empirical data (collected 2026-05-28)

| Base | Paintable parts | Variant size | N variants | Total bytes | Result |
|---|---|---|---|---|---|
| shuriken | 3 | 4.40 MB | 5 | 22 MB | ✅ pass |
| shuriken | 3 | 4.40 MB | 8 | 35 MB | ✅ pass (17.8 s encode) |
| pickup truck | 14 | 5.80 MB | 5 | 29 MB | ✅ pass |
| pickup truck | 14 | 5.80 MB | 8 | 46 MB | ❌ V8 OOM at 4 GB |
| sport car seg | (complex) | (not measured) | 8 | (presumed >46 MB) | ❌ V8 OOM at 4 GB |

The pass/fail boundary lies somewhere between 35 MB and 46 MB of total
input bytes. Per-variant size correlates with the base's
`paintable_count` (= mesh segment count from our plan-013 segmentation
feature) — more segments → more geometry primitives in GLB → larger
file size.

## Crash signature (V8 minidump)

Brave's Crashpad-collected minidump (`aa8a9112-…001b6.dmp`,
2026-05-28 13:28) shows V8 GC in last-resort mode:

```
[75386] 11043370 ms: Mark-Compact (reduce)
  3998.1 (4000.8) -> 3998.1 (4000.8) MB,
  pooled: 0.0 MB, 1294.83 / 0.00 ms
  (average mu = 0.005, current mu = 0.000)
  last resort; GC in old space requested
has-wasm
```

V8 ran 1.3 seconds of GC against the 4000 MB ceiling and reclaimed
zero. `has-wasm` flag confirms WebAssembly involvement. This signature
is identical to the morning crash on the same hardware, confirming the
issue is reproducible.

## Diagnostic surface (sessionStorage trail)

Our `useWalrusUpload` writes a `[WALRUS CRASH DIAGNOSTIC]` breadcrumb
trail (see `frontend/src/walrus/uploadTrail.ts`). The trail consistently
shows the renderer dying at `pre-encode-${batchIndex}` — i.e., between
the `writeFilesFlow().encode()` call's start and the first stage update
that would mark encode complete. No catch block ever runs — V8 just
kills the renderer mid-WASM-call.

## Hypotheses tested

### H1: V8 baseline heap pressure (sibling tabs / extensions)

**Theory:** Brave with many sibling tabs has ~3 GB baseline; only ~1 GB
headroom for the upload. Reducing baseline (closing tabs) would fix it.

**Test:** User reported crashing on relatively low-baseline sessions.
The `performance.memory` probe we added shows `usedJSHeapSize = 175 MB`
on a fresh load — Brave isn't capping the reading. The crash isn't
about Brave baseline.

**Status:** Rejected. Plan-017 R4 MemoryPressureBanner kept as best-effort
signal but not the root cause.

### H2: Browser tab process competing with other tabs (GPU / network)

**Theory:** GPU or network subprocess crash kills the renderer.

**Test:** Console output before crash shows clean execution — no GPU
errors, no "Lost WebGL context", no extension warnings, no subprocess
death messages. The minidump's V8 GC signature is explicit about the
cause: out-of-memory in old space.

**Status:** Rejected. Pure V8 heap OOM.

### H3: Babylon scene holding 200–400 MB during encode

**Theory:** The 3D preview canvas (Babylon.js) holds mesh / texture
buffers that compete with the encoder's allocation.

**Test:** Plan-017 R2: added imperative `dispose()` handle on
`PreviewCanvas`. `LaunchCollectionPage.onLaunch` calls
`previewRef.current?.dispose()` before `runBuildVariants()` so the
Babylon scene is fully torn down (scene, HighlightLayer, observers
disposed; engine `wipeCaches(true)` flushed) before any encode begins.

**Result:** Tested with `dispose()` active → pickup truck × 8 still
OOMs. **The Babylon scene is not the bottleneck.** Babylon dispose
reclaims ~200–400 MB which gives headroom for marginal cases, but
isn't load-bearing for this specific bug.

**Status:** Plan-017 R2 kept (real heap savings, helps marginal cases)
but doesn't solve this specific OOM.

### H4: Multi-quilt batching reduces per-call encoder peak

**Theory:** Split N variants into K = ⌈N/QUILT_SIZE⌉ separate
`writeFilesFlow` calls. Each call encodes a smaller chunk
(QUILT_SIZE files). Smaller input → smaller encoder peak → fits
inside the heap envelope. With explicit `flow = null` between chunks
and `setTimeout(0)` to yield for GC.

**Test:** Tested with `QUILT_SIZE` = 4, 2, and 16 (= MAX_VARIANTS,
effectively single-quilt). All three OOM identically on pickup
truck × 8. Single-quilt mode also passes shuriken × 8 (35 MB total)
just as well as multi-quilt.

**Conclusion:** **Multi-quilt batching does not reduce the encoder's
peak memory.** The Walrus WASM encoder has a per-call baseline working
memory that's roughly independent of the input chunk size. Whether we
encode 2 × 5.80 MB or 8 × 5.80 MB or 4 × 4.40 MB, the encoder allocates
GB-scale memory.

**Status:** Rejected as a fix. Plan-017 R1 kept for UX (BatchProgressPanel
shows users the quilt structure as a Walrus-track positioning beat),
but functionally inert against the OOM it was designed for.

### H5: Hot-module-reload accumulation in dev mode

**Theory:** Vite HMR after many code changes had left orphaned WASM
modules in memory.

**Test:** Hard reload (Cmd+Shift+R) before each test cycle.

**Status:** Rejected. Crash reproduces immediately on fresh load.

## Working theory of root cause

`@mysten/walrus-wasm`'s Reed-Solomon encoder appears to allocate
working memory proportional to the *total quilt input size* with a
high multiplier. Empirically observed:

- 35 MB input → succeeds (peak unknown but < 4 GB)
- 46 MB input → fails at 4 GB

If we assume the encoder is hitting the 4 GB ceiling at roughly 46 MB
input, that's an effective multiplier of **~85–100×** between input
bytes and peak memory. This is high but not impossible for a naive
Reed-Solomon implementation that materializes the full sliver matrix
before streaming it out — for `n` shards (Walrus testnet has many
hundreds), a fully-materialized intermediate matrix of
`input_size × n × redundancy` can easily reach tens of gigabytes for
even modest inputs.

We did not source-dive the WASM module. The behavior is consistent
with a naive implementation; could also be a tunable parameter we're
missing or a known SDK limitation.

## Open questions for the Walrus team / hackathon mentor

1. **Is `client.encodeQuilt(blobs)` known to have super-linear memory
   complexity in total input bytes?** If yes, is there a documented or
   empirical "max recommended bytes per quilt" for browser-side encoding?

2. **Is there a way to encode a quilt incrementally / in streaming
   fashion** without materializing the full sliver matrix in memory?
   We need to upload N files with shared blob-object semantics (so they
   share storage epoch + cost), but we'd accept higher CPU cost in
   exchange for bounded peak memory.

3. **Is the shard count or other RS parameter configurable** from
   client-side? If we could reduce the encoded-sliver-matrix dimensions
   for browser uploads (at the cost of fewer redundancy targets), that
   might fit the heap budget.

4. **Is `writeBlobFlow` per file** (sequential, separate Walrus blobs
   instead of a single quilt) **a recommended pattern** for our use
   case? We'd lose the quilt-patch indexing (one blob object → many
   logical files), but we'd encode one ~6 MB file at a time. Is the
   encoder peak for `writeBlobFlow` proportionally smaller?

5. **Is there a planned fix** for browser-side OOM during encode? Mainnet
   shard count is roughly the same as testnet, so if this is a known
   issue users will hit it post-launch too.

6. **Are there any browser-tunable knobs** (e.g., shared array buffer,
   workers, OffscreenCanvas with WebAssembly memory) that the SDK
   supports for offloading encode to a worker thread? Even if peak
   memory stays the same, isolating it from the main React tree's
   heap might help.

## Constraints we're operating under

- Hackathon submission deadline 2026-06-21 (24 days out as of writing).
- Two acceptable paths we identified ourselves: (a) backend mesh
  decimation to reduce per-variant size, (b) per-file `uploadBlob`
  with redesigned content addressing. User has explicitly declined (a)
  because it sacrifices mesh visual quality. (b) is structurally
  similar to deferring to a future SDK that supports streaming
  encode.
- Demo can use simpler bases (shuriken-class) that work today. The
  product story works for v1; complex-base support is a v1.1 line in
  the README.

## What plan-017 actually delivered

Despite the headline "OOM fix" goal not being met for complex bases,
plan-017 shipped substantial value:

- **R2 PreviewCanvas dispose** (D-063): real ~200–400 MB heap reclamation
  during upload window. Helps marginal cases.
- **R4 MemoryPressureBanner** (D-064): pre-flight warning for users
  with high baseline heap. Probe code (commit f65076d) verified
  `performance.memory` readings aren't capped on Brave.
- **R5 sessionStorage crash diagnostic trail** (D-065): tab-survival
  breadcrumb that surfaces the dying stage on next page load.
  Production-ready diagnostic.
- **R6 BatchProgressPanel UX**: surfaces Walrus quilt structure to users
  as a first-class concept — strong Walrus-track positioning.
- **R1 multi-quilt batching** (D-062): functionally inert against this
  OOM, but the code is correct and tested. Kept as future-proofing
  against SDK improvements + UX storytelling.

## What's still unsolved

Complex segmented bases (mesh segment count ≥ 10) at 8 variants OOM
inside the Walrus WASM encoder regardless of client-side mitigations.
Resolution pending mentor consult.

## Where to look

- Crash trail: open DevTools console, search for `[WALRUS CRASH
  DIAGNOSTIC]` — surfaces the last stage written before crash.
- Heap probe: `[plan-017 P1-C heap probe]` log on `/launch` mount —
  shows `performance.memory` readings.
- Branch: this investigation happened on the merged `fix/walrus-oom`
  branch; all commits are on `main` after merge.
