---
name: fix-walrus-oom
description: Eliminate the V8 heap OOM that crashes Brave on 8-variant /launch uploads. Multi-quilt batch (4 variants/quilt) + Babylon scene dispose during upload + memory-pressure pre-flight banner + crash-recovery breadcrumb. Surfaces Walrus quilt structure to users via a stepped progress UI so the extra wallet signatures are predictable, not surprising.
status: active
created: 2026-05-28
origin: docs/brainstorms/2026-05-28-walrus-oom-fix-requirements.md
phase: Phase 4 follow-up (Plan-017)
depth: Standard
---

# Plan-017: Fix Walrus 8-Variant OOM on /launch

## Problem Frame

The user's Brave renderer dies during the Walrus encode phase of an 8-variant `/launch`. Plan-016's `TestWalletAdapter` bypassed the symptom for agent-browser recording (clean Chromium, no extensions, ~200 MB baseline heap) but the underlying bug is **signer-orthogonal**: it triggers identically whether Slush or the test wallet signs.

Root cause is confirmed via the Brave minidump captured at `2026-05-28 09:53:41` (`b69ca99a-…ead.dmp`). V8 GC traces:

```
10797704 ms: Mark-Compact (reduce) 3997.3 (4000.5) -> 3997.3 (4000.5) MB,
  1286.71 / 0.00 ms (average mu = 0.003, current mu = 0.000)
  last resort; GC in old space requested
```

V8 ran for 1.28 s at its 4 GB ceiling, freed nothing (mu ≈ 0.3 %), flagged `last resort`, Brave killed the unresponsive renderer. The user's dose-response observation (**5 variants OK, 8 variants crash**) matches OOM exactly — peak heap scales monotonically with variant count, breaching the V8 cap somewhere between 6 and 8.

Memory accounting (per encoded variant during `flow.encode()` in `@mysten/walrus.writeFilesFlow`):

- GLB input ArrayBuffer: ~3–6 MB
- Reed-Solomon encoded sliver matrix: ~10–20 MB
- React state + dapp-kit cache: ~5–10 MB
- **≈ 20–40 MB per variant**

Eight variants encoded via `Promise.all` inside `client.encodeQuilt({blobs})` → 160–320 MB peak Walrus allocation on top of:

- Brave baseline + sibling tabs + extensions: 3.0–3.5 GB
- Babylon `PreviewCanvas` scene (held during upload): 200–400 MB
- Cached GLBs + dapp-kit + React: 150–300 MB

= breaches V8's 4 GB ceiling once N crosses ~6 variants.

---

## Scope Boundaries

### In scope

- Multi-quilt batching strategy (R1) — `useWalrusUpload` chunks N variants into K quilts of `QUILT_SIZE = 4` each, runs `writeFilesFlow` K times sequentially
- Babylon `PreviewCanvas` scene dispose around the LAUNCH execution window (R2)
- Variant cap unchanged at 8 (R3)
- `performance.memory` pre-flight warning banner with dismiss + bypass (R4)
- `sessionStorage` breadcrumb trail ported from `debug/walrus-upload-crash` (R5, trimmed form)
- Multi-quilt progress UI with pre-flight transaction breakdown + stepped progress (R6, NEW vs brainstorm) — surfaces Walrus quilt structure so the additional wallet signatures are predictable, not surprising

### Deferred to Follow-Up Work

- GLB input texture downscaling (origin OQ-E) — separate concern, attacks input size
- True single-quilt sequential encode via `@mysten/walrus` SDK patch — discussed and rejected as not worth the half-day cost for ~20 MB peak savings (Multi-quilt + Babylon dispose covers the heap envelope with simpler code)
- Walrus SDK upstream PR to make `encodeQuilt` sequential — long-term right answer, out of hackathon scope

### Out of scope

- Mainnet path (testnet only for 6/21 submission)
- Solving Brave-specific behavior (Brave Wallet, Shields, Adblock) — the fix targets the heap envelope, not Brave
- Raising V8 old-space cap via Chrome `--js-flags` (not deployable to end users)
- Restructuring `@mysten/walrus` writeFilesFlow's quilt assembly — we use what the SDK exposes
- Forcing users to install agent-browser (it remains a dev/test tool)

---

## Requirements Trace

| ID | Requirement | Implementation Units | AE |
|---|---|---|---|
| R1 | Multi-quilt batching with `QUILT_SIZE = 4` | U1 | AE1, AE2, AE3 |
| R2 | Pre-LAUNCH Babylon dispose, post-LAUNCH remount | U2, U3 | AE2, AE3 |
| R3 | Variant cap unchanged at 8 | U1 (constant choice) | AE2 |
| R4 | `performance.memory` pre-flight warning banner | U5 | AE4 |
| R5 | `sessionStorage` breadcrumb trail | U6 | AE5 |
| R6 | Multi-quilt progress UI with pre-flight breakdown | U4 | AE2 |

Origin Acceptance Examples carried forward verbatim:
- **AE1**: 6-variant /launch in sibling-tab-heavy Brave succeeds (no crash)
- **AE2**: 8-variant /launch in same Brave succeeds; UI shows 2-quilt breakdown
- **AE3**: agent-browser test-wallet 8-variant smoke still passes (no regression)
- **AE4**: With deliberate 800 MB heap leak, banner appears, dismissable, LAUNCH still works
- **AE5**: `sessionStorage` post-launch contains breadcrumb markers covering the upload arc

---

## Key Technical Decisions

### D-062: Multi-quilt batching with QUILT_SIZE = 4, exposed in UX

- **Decision**: `useWalrusUpload` chunks N variants into K = ⌈N / 4⌉ quilts of up to 4 variants each. Each quilt is one `writeFilesFlow({files: [chunk]})` call → 2 wallet signatures per quilt (register + certify). Frontend UI explicitly explains this in a pre-flight breakdown and stepped progress panel.
- **Rejected alternatives**:
  - *Per-variant `writeBlobFlow` loop* — `docs/solutions/architecture-patterns/walrus-writefilesflow-popup-batching-2026-05-15.md` explicitly catalogs this as anti-pattern; produces 2N popups (16 for 8 variants), unusable for Slush users.
  - *SDK patch to make `encodeQuilt` sequential* — adds 0.5–1 day of work, peak savings only ~20 MB (the quilt assembly buffer is the true ceiling), pnpm-patch fragility through SDK upgrades. Multi-quilt achieves the same heap envelope with no SDK dependency.
- **Why expose in UX**: 2 → 4 popups looks like UX regression in isolation. A pre-flight "Your collection has 8 variants → 5 transactions (2 quilts of 4, plus launch)" + stepped progress reframes it as **honest Walrus-protocol surfacing**, not a regression. This is also a positioning win for the Walrus track submission ("we expose Walrus's quilt structure clearly").
- **Constant location**: `QUILT_SIZE` exported from `frontend/src/walrus/useWalrusUpload.ts` so the UI computes the same K as the data layer.

### D-063: PreviewCanvas dispose via imperative `useImperativeHandle` ref

- **Decision**: Add an imperative dispose/remount handle to `PreviewCanvas` via `forwardRef + useImperativeHandle`. `LaunchCollectionPage` calls `previewRef.current?.dispose()` immediately before `uploadFiles()` and `previewRef.current?.remount()` in the `finally` block.
- **Rejected alternatives**:
  - *Conditional render gated on `phase === 'uploading'`* — risks `react-strictmode-cleanup-only-effect-with-useref` (docs/solutions/integration-issues/...) bug where StrictMode's double-mount disposes the scene and never restores. Imperative ref is more deterministic.
  - *Engine-level destroy + recreate* — triggers WebGL context loss which can ripple into other GL features. Disposing scene/meshes/materials while keeping the Engine alive is the safer scope.
- **Test coverage**: U2 unit test wraps render in `<StrictMode>` explicitly so the cleanup-only-effect trap is caught at test time.

### D-064: `performance.memory` threshold = 2.5 GB; Chromium-only is acceptable scope

- **Decision**: R4 banner fires when `performance.memory.usedJSHeapSize > 2.5 GB`. Threshold chosen to leave 1.5 GB headroom for encode + dapp state. Graceful no-op on browsers without the API (Firefox, Safari).
- **Rationale**: Slush wallet is Chromium-only. Test wallet (plan-016) doesn't care. Production users without `performance.memory` would have already failed at Slush connection. R4 is best-effort signal, not a correctness gate.
- **Banner behavior**: Non-blocking. User can dismiss and proceed at own risk. Re-check fires on LAUNCH click in addition to mount.

### D-065: `sessionStorage` (not localStorage) for crash breadcrumb

- **Decision**: Trail breadcrumb writes to `sessionStorage`, not `localStorage`. Trail survives Brave's "Aw Snap" tab recovery reload (sessionStorage persists across recovered-tab reload). Cleared on `done` or `error`, surfaced on hook init if a stale trail from prior crash is found.
- **Correction from brainstorm**: brainstorm doc said `localStorage`; debug branch actually used `sessionStorage`. The latter is correct — `localStorage` would persist across all tabs and sessions, polluting diagnostic signal. `sessionStorage` scopes to the tab session.
- **Key structure**: a single key `sessionStorage['walrus_upload_diagnostic']` holds a JSON array of `{stage, tMs, heapUsedMb, heapLimitMb}` entries, cap MAX_ENTRIES=16, oldest dropped on overflow. Not per-stage keys (cheaper to read, simpler to clear, doesn't pollute storage namespace).
- **Ported from**: `debug/walrus-upload-crash` branch's `useWalrusUpload.ts` lines 41-46 + helper functions; trimmed by dropping the SDK-internal substage wrappers, keeping `writeDiag` + `readHeapMb` + the surface-on-init effect.

---

## Output Structure

```
frontend/src/
├── walrus/
│   ├── useWalrusUpload.ts          # MODIFY: multi-quilt batching, trail integration
│   ├── useWalrusUpload.test.tsx    # MODIFY: multi-quilt test cases
│   └── uploadTrail.ts              # NEW: sessionStorage breadcrumb (R5)
│   └── uploadTrail.test.ts         # NEW: trail unit tests
├── babylon/
│   ├── PreviewCanvas.tsx           # MODIFY: forwardRef + useImperativeHandle for dispose/remount
│   └── PreviewCanvas.test.tsx      # MODIFY: dispose handle tests
└── collection/
    ├── LaunchCollectionPage.tsx    # MODIFY: previewRef wire-up, BatchProgressPanel integration
    ├── LaunchCollectionPage.test.tsx  # MODIFY: dispose lifecycle test
    ├── BatchProgressPanel.tsx      # NEW: multi-quilt UX (R6)
    ├── BatchProgressPanel.test.tsx # NEW
    ├── MemoryPressureBanner.tsx    # NEW: R4 warning UI
    └── MemoryPressureBanner.test.tsx  # NEW
```

ADRs land in `docs/decisions.md` as D-062 through D-065.

---

## Implementation Units

### U1. Multi-quilt batching in `useWalrusUpload`

**Goal**: Refactor `useWalrusUpload.uploadFiles` to split N variants into K = ⌈N / QUILT_SIZE⌉ quilts of up to `QUILT_SIZE` (= 4) variants each, then run `writeFilesFlow` once per quilt sequentially.

**Requirements**: R1, R3 (variant cap stays at 8 — multi-quilt accommodates it)

**Dependencies**: none

**Files**:
- `frontend/src/walrus/useWalrusUpload.ts` (modify, currently 223 lines → estimate ~280)
- `frontend/src/walrus/useWalrusUpload.test.tsx` (modify; mirror existing mock pattern)

**Approach**:
- **Pre-impl probe (NOT optional)**: before refactoring `uploadFiles`, write a throwaway 2-quilt spike test that calls `client.walrus.writeFilesFlow({files: [a]})` twice in succession. Verify two distinct `blobObject.id` values returned, no shared state contamination (test wallet sufficient). If contamination found, plan must pivot — see Risks table. Read `node_modules/@mysten/walrus/dist/flows/write-files.mjs` first to confirm each `writeFilesFlow()` call returns an independent flow instance with no module-level shared mutable state.
- Export `QUILT_SIZE = 4` constant so the UI (U4) consumes the same value.
- Inside `uploadFiles(files, signer)`, replace the single `writeFilesFlow({files: walrusFiles})` call with a `for` loop over chunks of `walrusFiles`, awaiting each `flow.encode → executeRegister → upload → executeCertify` cycle in turn.
- **After each chunk iteration**: explicitly set `flow = null` and the chunk's encode buffers to null so V8 can reclaim quilt-N's working set before quilt-(N+1) allocates. React closure refs (status object accumulator, txDigests array) should hold only digest strings, never raw flow objects.
- Each chunk gets its own `flow.listFiles()` result; accumulate into a flat result array preserving global file index ordering (the zero-padded `file-NN` identifier convention at current line 142–148 must remain stable across chunks).
- Status / stage object expanded: `{ stage: 'encoding' | 'registering' | 'uploading' | 'certifying' | 'done', batchIndex: number, batchTotal: number, txDigests: string[] }`. UI in U4 consumes this.
- Sequential **between** quilts; encode **inside** one quilt remains the SDK's `Promise.all` (we can't change that without a patch — see D-062 rejected alts). With `QUILT_SIZE = 4` the inside-one-quilt peak is ~120 MB, comfortably under the heap budget.
- Failure mid-batch (quilt 2 register fails after quilt 1 succeeds): surface the failed batch index in `error`, leave quilt 1's already-uploaded blob alive on Walrus (it will expire on epoch boundary if unused). Do NOT attempt rollback — Walrus blobs aren't deletable. Error surface (consumed by U4) carries the partial-success cost so UX can warn user: "You paid for {batchIndex} quilt(s) of storage; retry will re-publish all {batchTotal}."

**Patterns to follow**:
- Current `uploadFiles` at `frontend/src/walrus/useWalrusUpload.ts:122-205` — keep the existing high-level structure, just wrap the single flow in a chunked loop
- Plan-016 commit `cf26fb0` (PTB chain shape) is the reference for how single-quilt currently sequences register → upload → certify
- Solution doc `docs/solutions/architecture-patterns/walrus-writefilesflow-popup-batching-2026-05-15.md` informed D-062

**Test scenarios** (`frontend/src/walrus/useWalrusUpload.test.tsx`):
- **Happy path / batching math**:
  - 4 variants → 1 quilt of 4 → signer called twice (register + certify) — preserves current single-quilt behavior. Covers AE2 boundary.
  - 5 variants → 2 quilts (size 4 + 1) → signer called 4 times
  - 8 variants → 2 quilts (size 4 + 4) → signer called 4 times. Covers AE2 / AE3.
  - 1 variant → 1 quilt of 1 → signer called twice
- **Edge cases**:
  - Empty `files` array → throw before signing (no wasted popup)
  - Exactly `QUILT_SIZE` (4) → exactly 1 quilt (boundary check)
  - Heap-retention regression check: assert mock `flow` object reference is unreachable after iteration (verify via mock cleanup count or weak-ref polyfill in test)
- **Error paths**:
  - Quilt 1 register fails → `error` set, `stage = 'error'`, no subsequent quilts attempted
  - Quilt 2 register fails after quilt 1 success → `error` includes `batchIndex: 1`, returned partial result contains quilt 1's file refs
  - Quilt 1 certify fails after quilt 1 register success → same as above, distinct error stage
  - Signer throws (user cancels popup) → `error = SignerCancelled`, stage = 'error'
- **Integration**:
  - File identifier ordering invariant: with 8 variants split into 2 quilts, returned `listFiles()` aggregate respects global index 0–7 ordering, not per-quilt 0–3 + 0–3
  - Trail (U6) writes pre-encode + post-encode-N entries — assert via mock `uploadTrail.writeDiag` is called for each batch step

**Verification**: `pnpm --dir frontend test useWalrusUpload` passes all scenarios green. Manual: open `/launch`, configure 5 variants, hit LAUNCH on agent-browser (test wallet, no popups) and verify 2 quilts complete on testnet (2 distinct register tx digests on Suiscan).

---

### U2. PreviewCanvas dispose handle

**Goal**: Expose imperative `dispose()` and `remount()` methods on `PreviewCanvas` via `forwardRef + useImperativeHandle`, so `LaunchCollectionPage` can free Babylon scene/mesh/texture memory during the upload window.

**Requirements**: R2

**Dependencies**: none

**Files**:
- `frontend/src/babylon/PreviewCanvas.tsx` (modify, currently 376 lines)
- `frontend/src/babylon/PreviewCanvas.test.tsx` (modify)

**Approach**:
- Convert `PreviewCanvas` to `forwardRef<PreviewCanvasHandle, Props>` where `PreviewCanvasHandle = { dispose(): void; remount(): void }`.
- `useImperativeHandle(ref, () => ({ dispose, remount }))` exposes the existing teardown logic at lines 206–217 plus a `remount` that re-runs the engine-creation effect.
- `remount()` sets an internal `mountKey` state which forces the existing useEffect to re-run via dep change.
- During `dispose`, render a static placeholder `<div>` with the same dimensions so layout doesn't shift.
- Do NOT destroy the `Engine` — only `scene.dispose()` + `highlightLayer.dispose()` + null the refs. Engine destruction triggers WebGL context loss which is heavier than we need.
- **GPU reclamation belt-and-suspenders**: after `scene.dispose()`, call `engine.wipeCaches(true)` to flush Babylon's effect/material caches. On macOS Metal/WebGL2, `scene.dispose()` alone does not guarantee VBO/texture release back to the OS; `wipeCaches(true)` is cheap and forces it. Verify GPU process RSS drop via `chrome://memory-internals` during U3 verification.
- **Async-load race guard**: the existing `glbUrl` effect (line 230+) calls `LoadAssetContainerAsync` which is async — if `dispose()` fires while the load is in flight, the resolved container will write to a disposed scene. Add an `isDisposedRef` boolean ref; set true in `dispose`, check before any post-load scene mutation, and reset to false in `remount`. This is in addition to the existing `loadTokenRef` (which guards state mutation but not scene mutation).

**Patterns to follow**:
- Existing cleanup at `frontend/src/babylon/PreviewCanvas.tsx:206-217` — already does the right thing in the cleanup function
- React `forwardRef + useImperativeHandle` pattern (no in-repo prior art for this specific use, but standard React)
- Solution doc `docs/solutions/integration-issues/react-strictmode-cleanup-only-effect-with-useref-2026-05-23.md` informs the test approach

**Test scenarios** (`frontend/src/babylon/PreviewCanvas.test.tsx`):
- **Happy path**:
  - `ref.current.dispose()` calls `scene.dispose` and `highlightLayer.dispose` on the mocked Babylon objects
  - After dispose, `ref.current.dispose()` again is a no-op (idempotent)
  - `ref.current.remount()` after dispose re-creates the scene (verify via mock `Engine` construction count)
- **Edge cases**:
  - Dispose called before scene fully constructed (component just mounted) → no throw
  - Remount called without prior dispose → no-op or recreates harmlessly
- **Integration (StrictMode trap)**:
  - Render inside `<StrictMode>`. Initial mount → double-effect runs but final state is mounted. Then `dispose()` → scene gone. Then `remount()` → scene back. This explicitly catches the `react-strictmode-cleanup-only-effect-with-useref` regression mode.
- **Async-load race**:
  - Mock `LoadAssetContainerAsync` with a pending promise. Render component, then call `ref.current.dispose()` before the load resolves. Resolve the load — assert no scene-mutation side effects fire (no `.scene.addMesh` calls, no throw from operating on disposed objects). Verifies the `isDisposedRef` guard.

**Verification**: `pnpm --dir frontend test PreviewCanvas` green including the new `<StrictMode>` test.

---

### U3. LaunchCollectionPage Babylon lifecycle hook

**Goal**: Wire `PreviewCanvas`'s new dispose/remount handle into the LAUNCH flow so the Babylon scene is freed during upload and restored after launch settles.

**Requirements**: R2

**Dependencies**: U2

**Files**:
- `frontend/src/collection/LaunchCollectionPage.tsx` (modify, currently 1100+ lines)
- `frontend/src/collection/LaunchCollectionPage.test.tsx` (modify)

**Approach**:
- Add `const previewRef = useRef<PreviewCanvasHandle | null>(null)` in the component.
- Pass `ref={previewRef}` to the `<PreviewCanvas />` mounted at the variant strip / preview region.
- In `onLaunch` handler (currently lines 551–607):
  - Immediately after `setPhase('building-variants')` but before `runBuildVariants()`: call `previewRef.current?.dispose()`.
  - In a `try/finally` block wrapping the upload + sign sequence: in `finally`, call `previewRef.current?.remount()`. (Already has a try/finally pattern from plan-016.)
- The double-click guard `launchingRef` (line 550) is unaffected.
- Ensure remount fires whether the LAUNCH succeeded, failed mid-flight, or was cancelled by signer.

**Patterns to follow**:
- `onLaunch` handler at `frontend/src/collection/LaunchCollectionPage.tsx:551-607` for the existing flow
- Plan-016 commit `9bb95fb` (review-pass) for the double-click guard pattern
- `TestWalletBanner` mock pattern at `LaunchCollectionPage.test.tsx:72` shows how to extend a component mock with new methods

**Test scenarios** (`frontend/src/collection/LaunchCollectionPage.test.tsx`):
- **Happy path**:
  - LAUNCH click → `previewRef.current.dispose` called once before `uploadFiles` resolves
  - After `uploadFiles` + `signAndExecuteTransaction` resolve → `previewRef.current.remount` called once
- **Failure paths**:
  - `uploadFiles` rejects → `remount` still called (via finally)
  - `signAndExecuteTransaction` rejects after upload succeeded → `remount` called
  - User cancels signer popup → `remount` called
- **Edge cases**:
  - Rapid double-click LAUNCH → dispose called once (guarded by `launchingRef`)
  - LAUNCH clicked with `previewRef.current === null` (component never mounted preview?) → no throw

**Verification**: `pnpm --dir frontend test LaunchCollectionPage` green. Manual: agent-browser drives /launch with 8 variants on test wallet, devtools heap snapshot at `phase === 'uploading'` shows Babylon scene's mesh/material/texture objects gone vs pre-LAUNCH snapshot.

---

### U4. BatchProgressPanel — multi-quilt UX

**Goal**: Replace the current single-line upload status with a stepped progress panel that surfaces multi-quilt structure: pre-flight transaction breakdown + per-batch ✓/⟳/○ progress per step.

**Requirements**: R6

**Dependencies**: U1 (consumes `useWalrusUpload`'s expanded status shape)

**Files**:
- `frontend/src/collection/BatchProgressPanel.tsx` (new)
- `frontend/src/collection/BatchProgressPanel.test.tsx` (new)
- `frontend/src/collection/LaunchCollectionPage.tsx` (integration; replace the current status line in the launching state)

**Approach**:
- Component props: `{ variantCount: number; stage: WalrusUploadStage; batchIndex: number; batchTotal: number; txDigests: string[]; }`
- Pre-flight section (shown before LAUNCH click or in initial 'preparing' phase):
  - "Your collection has N variants"
  - "Walrus packs into quilts of up to 4 — N variants = K quilt(s)"
  - "You'll sign: 2 × register quilt, 2 × certify upload, 1 × launch collection = 2K + 1 transactions"
- Stepped progress section (shown during launch flow):
  - Per quilt (1..K): "Quilt {i} of {K}" with two sub-steps "Register" + "Certify"
  - Final step: "Launch collection"
  - Each step shows ✓ (done, tx digest as link to Suiscan if present), ⟳ (active), ○ (pending)
  - Use existing `tokens.color.accent` / `tokens.color.ink` / `tokens.font.mono` for styling
- Mirror the visual language of `TestWalletBanner` (the existing in-page banner pattern at `LaunchCollectionPage.tsx:314-340`): same 1.5px accent border, 10×12 padding, mono font 12px, 0.5px letter-spacing
- `data-testid="batch-progress-panel"` and per-step `data-testid="batch-step-{batchIndex}-{stepName}"` for agent-browser introspection
- Pure component — no internal state; everything driven by props from `useWalrusUpload`'s status
- **Partial-failure state**: when `error` is present with `batchIndex > 0` (some quilts succeeded before failure), the panel surfaces a small explanatory line: "Quilts 1–{batchIndex} were stored on Walrus and paid for. Retrying will re-publish all {batchTotal} quilts (the failed ones aren't recoverable, and Walrus blobs can't be deleted)." This makes the orphan-storage cost honest. On testnet this is a non-issue; on mainnet (8/27 deploy) it's small but real.

**Patterns to follow**:
- `TestWalletBanner` at `frontend/src/collection/LaunchCollectionPage.tsx:314-340` for visual language
- Conditional render based on phase, similar to the signer-error banner at lines 858/875
- Token imports at top of `LaunchCollectionPage.tsx`

**Test scenarios** (`frontend/src/collection/BatchProgressPanel.test.tsx`):
- **Happy path / breakdown rendering** (formula: `totalTxs(N) = 2 * Math.ceil(N / QUILT_SIZE) + 1`):
  - `variantCount=4` → 1 quilt, **3 transactions** (2×1 walrus + 1 launch)
  - `variantCount=5` → 2 quilts, **5 transactions** (2×2 + 1)
  - `variantCount=8` → 2 quilts, **5 transactions**. Covers AE2 visible UX.
  - `variantCount=6` → 2 quilts (sizes 4 + 2), **5 transactions** (boundary: chunk-not-full case)
- **Step progression**:
  - `stage='encoding'`, `batchIndex=0` → batch 0 "Register" shows ⟳, all others ○
  - `stage='registering'`, `batchIndex=0` → batch 0 "Register" shows ⟳
  - `stage='certifying'`, `batchIndex=0`, `txDigests=['0xabc']` → batch 0 "Register" ✓ with link, batch 0 "Certify" ⟳
  - `stage='done'`, all batches → all ✓
- **Edge cases**:
  - `variantCount=0` → renders empty or graceful zero state
  - `variantCount=1` → 1 quilt of 1, breakdown reads "1 transaction" plural-handling
  - `txDigests` length mismatch with batchIndex → no throw, missing digests render without link
- **Integration**:
  - In `LaunchCollectionPage.test.tsx`: mount with mock `useWalrusUpload` returning various stage states; verify panel renders + transitions through visible step states

**Verification**: `pnpm --dir frontend test BatchProgressPanel LaunchCollectionPage` green. Manual: agent-browser drives /launch with 5 variants, screenshots show the pre-flight breakdown ("5 transactions, 2 quilts") then progresses through ✓/⟳/○ states.

---

### U5. MemoryPressureBanner — pre-flight heap warning

**Goal**: When `performance.memory.usedJSHeapSize > 2.5 GB` on `/launch` mount or LAUNCH click, show a dismissable banner warning the user that high memory usage increases crash risk; recommend closing other tabs.

**Requirements**: R4

**Dependencies**: none

**Files**:
- `frontend/src/collection/MemoryPressureBanner.tsx` (new)
- `frontend/src/collection/MemoryPressureBanner.test.tsx` (new)
- `frontend/src/collection/LaunchCollectionPage.tsx` (integration; mount the banner near the top of the page)

**Approach**:
- Component reads `performance.memory.usedJSHeapSize` (Chromium-only) via a small helper `readHeapMb()` shared with `uploadTrail.ts` from U6.
- Threshold = 2_500 * 1024 * 1024 bytes (2.5 GB). Constant exported so tests can override.
- **Pre-impl probe (U5 first step)**: log `performance.memory.usedJSHeapSize` on user's actual Brave over ~10 seconds with a few state changes. Brave's fingerprint-protection rounds heap values to ~100 MB buckets — if confirmed, snap threshold to a bucket boundary (e.g. 2_400 * 1024 * 1024 for cleaner trigger). Capture finding in OQ-C resolution comment.
- **Hysteresis**: once banner shows, it stays until heap drops *below* a lower threshold (e.g. 2_200 MB) — prevents on/off flicker if usedJSHeapSize sits near the boundary across snapshot quantization. Implement as two constants: `HEAP_WARN_ON_BYTES` and `HEAP_WARN_OFF_BYTES`.
- Internal `dismissed` state via `useState(false)` — once dismissed, stays dismissed for that page session (not persisted).
- Re-check fires on a hook prop `recheckSignal: number` — `LaunchCollectionPage` bumps it on LAUNCH click so dismissed banner re-fires if the new check still trips.
- If `performance.memory` is undefined (Firefox/Safari), component returns `null` — graceful no-op.
- Mirror `TestWalletBanner` visual language but use `tokens.color.warn` if available, fall back to `tokens.color.err` (will check tokens.ts during impl).
- Copy: "High memory usage detected — close other tabs to reduce crash risk during upload."
- `data-testid="memory-pressure-banner"`

**Patterns to follow**:
- `TestWalletBanner` at `LaunchCollectionPage.tsx:314-340`
- `readHeapMb()` helper from `debug/walrus-upload-crash` branch's `useWalrusUpload.ts` — move to `frontend/src/walrus/uploadTrail.ts` (shared with U6)

**Test scenarios** (`frontend/src/collection/MemoryPressureBanner.test.tsx`):
- **Happy path**:
  - `performance.memory.usedJSHeapSize = 3 * 1024 * 1024 * 1024` (3 GB) → banner visible
  - `performance.memory.usedJSHeapSize = 1 * 1024 * 1024 * 1024` (1 GB) → banner hidden
  - Dismiss button → banner disappears; state stays hidden until `recheckSignal` increments
- **Edge cases**:
  - `performance.memory` undefined (mock as `undefined`) → component returns null (no banner, no error)
  - `usedJSHeapSize` exactly at threshold → banner shows (>= 2.5 GB)
  - `recheckSignal` increments while heap still > threshold → banner re-appears
- **Error path**: none — component should not throw under any input

**Verification**: `pnpm --dir frontend test MemoryPressureBanner` green. Manual on user's Brave: load `/launch` with 12 other tabs open, banner should appear; with only `/launch` open, banner should be absent.

---

### U6. uploadTrail — sessionStorage crash breadcrumb

**Goal**: Port a trimmed version of the upload trail breadcrumb from `debug/walrus-upload-crash` to main. `useWalrusUpload` writes stage markers to `sessionStorage`; on hook init, surface any stale trail from a prior crash as `[WALRUS CRASH DIAGNOSTIC]` log.

**Requirements**: R5

**Dependencies**: none (U1 calls `writeDiag` but the trail module is independent)

**Files**:
- `frontend/src/walrus/uploadTrail.ts` (new, ~60 lines)
- `frontend/src/walrus/uploadTrail.test.ts` (new)
- `frontend/src/walrus/useWalrusUpload.ts` (integration; called by U1's batch loop)

**Approach**:
- Module exports:
  - `STAGE_KEY = 'walrus_upload_diagnostic'`
  - `readHeapMb(): { used: number; limit: number } | null` — wraps `performance.memory` access with Chromium-only graceful fallback. Shared with U5.
  - `writeDiag(stage: string, startedAt: number, extra?: Record<string, unknown>): void` — appends a `{stage, tMs, heapUsedMb, heapLimitMb, ...extra}` entry to a JSON array in `sessionStorage`, capped at MAX_ENTRIES = 16
  - `surfaceStaleTrail(): void` — called once on hook init; if a complete trail exists from a prior session, `console.warn('[WALRUS CRASH DIAGNOSTIC]', trail)` and clear
  - `clearTrail(): void` — called on `done` or `error`
- Stages written by U1: `'pre-encode'`, `'post-encode-{batchIndex}'`, `'pre-register-{batchIndex}'`, `'post-register-{batchIndex}'`, `'pre-upload-{batchIndex}'`, `'post-upload-{batchIndex}'`, `'pre-certify-{batchIndex}'`, `'post-certify-{batchIndex}'`, `'pre-launch-tx'`, `'post-launch-tx'`
- Do NOT wrap the SDK's internal substages (the debug branch did this with monkey-patching; that's expensive and brittle; out of scope)
- **Defer `setItem` off the React render path**: `sessionStorage.setItem` is synchronous and can stall 5–50 ms under memory pressure (precisely when the trail is most valuable). Wrap the actual `setItem` call in `queueMicrotask(() => sessionStorage.setItem(...))` so the React state-setter that triggered `writeDiag` completes before the storage I/O runs. Trail order is preserved because microtasks queue in order.
- Trail is a tap, not a load-bearing dependency — exceptions in `writeDiag` swallowed (better breadcrumb fails silent than upload crashes from a sessionStorage quota error)

**Patterns to follow**:
- `debug/walrus-upload-crash` branch's `useWalrusUpload.ts` lines for `readHeapMb` and `writeDiag` — port verbatim but drop the SDK monkey-patch wrappers

**Test scenarios** (`frontend/src/walrus/uploadTrail.test.ts`):
- **Happy path**:
  - `writeDiag('pre-encode', 0)` then `readTrail()` returns array with one entry having `stage: 'pre-encode'`, `tMs >= 0`
  - 17 successive `writeDiag` calls → trail length is 16 (oldest dropped)
  - `clearTrail()` after writes → `readTrail()` returns empty
- **Edge cases**:
  - `sessionStorage.setItem` throws quota error → `writeDiag` swallows, doesn't throw to caller
  - `performance.memory` undefined → `readHeapMb()` returns null; `writeDiag` writes entry with heapUsedMb=null
  - `surfaceStaleTrail` with no prior trail → no console call, no throw
  - `surfaceStaleTrail` with stale trail → console.warn called once, trail cleared after
- **Integration with U1**:
  - Verify in U1's tests that `writeDiag` is called at each batch step boundary (mock the module)

**Verification**: `pnpm --dir frontend test uploadTrail` green. Manual on user's Brave: trigger an intentional pre-fix-state crash (e.g., 10 variants), reload, devtools console shows `[WALRUS CRASH DIAGNOSTIC]` with the prior trail.

---

## System-Wide Impact

- **Existing tests**: U1 changes `useWalrusUpload`'s return shape (expanded `status` object). All existing `useWalrusUpload` consumers must be audited for `.stage` usage: currently only `LaunchCollectionPage.tsx:344` uses it. Backward-compat: existing `.stage` values (`'idle'`, `'encoding'`, `'registering'`, `'uploading'`, `'certifying'`, `'done'`, `'error'`) preserved; new fields `batchIndex`, `batchTotal`, `txDigests` are additive.
- **CreateModelPage**: Uses `useWalrusUpload` for single-file blob upload (not file-flow). The U1 refactor's chunking logic only triggers when `files.length > QUILT_SIZE`. For single-blob uploads via `uploadBlob`, no behavior change.
- **Agent-browser smoke (plan-016 AE5)**: Must continue to pass. The 4-popup UX is silent under test wallet (Ed25519Keypair direct sign). U1 test scenarios include "8 variants → signer called 4 times" which directly validates this. Agent-browser end-to-end re-run is part of plan-017 verification.
- **Network budget**: Multi-quilt creates 2K distinct on-chain transactions (vs current 2). For a 8-variant collection = 4 register/certify pairs on testnet. Gas budget per Sui tx is small (~0.001 SUI); 4 extra txs ≈ 0.004 SUI additional cost. Negligible.
- **Pitch story**: Multi-quilt UX is a Walrus-positive narrative ("we expose Walrus's quilt structure as a first-class concept in the user journey"). Worth a beat in the demo voiceover.

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `QUILT_SIZE = 4` still OOMs in some sibling-tab-heavy Brave state | medium | high (crash recurs) | R2 (Babylon dispose) adds 200–400 MB headroom. R4 banner warns user before LAUNCH. If still OOMs in U3 verification, drop to QUILT_SIZE=2 (config change, no architecture impact) |
| `useImperativeHandle` ref racey with React's render cycle | low | medium (dispose called on stale ref) | StrictMode-wrapped test (U2) explicitly exercises double-mount; double-click guard (U3) handles user-side races |
| Failure mid-batch leaves orphan Walrus blobs paid for | medium | low (blob expires on epoch boundary unused) | Surface batchIndex in error; user pays for unrecovered blob but no on-chain Collection object created so no UX confusion |
| `BatchProgressPanel` clutters /launch UI | low | low (UX regression) | Mirror existing TestWalletBanner visual; only shown during launch flow (not at idle); conditionally hidden when N ≤ QUILT_SIZE (single quilt = current minimal UX) |
| Trail breadcrumb interferes with non-test sessionStorage usage | low | low | Single key `walrus_upload_diagnostic` namespaced; cleared on done/error; capped at 16 entries |

---

## Verification Plan

**Per-unit**: each U-IDs verification section above defines the unit-local check.

**End-to-end** (after U1–U6 land):
1. `pnpm --dir frontend test` — all 591+ tests green plus the new ones from U1–U6
2. `pnpm --dir frontend typecheck` — zero new tsc errors
3. **Agent-browser smoke (test wallet path)**: drive `/launch` with 8 variants → on-chain Collection minted; 2 distinct register tx digests on Suiscan; no crash
4. **User's Brave smoke (the headline AE2 check)**: user manually loads `/launch` with their typical 10+ sibling tabs, configures 8 variants, hits LAUNCH → should complete (Slush 4 popups) without renderer crash. This is the success criterion the whole plan exists to satisfy
5. **Stale-trail surface**: trigger an intentional crash pre-fix (or simulate by manually writing `sessionStorage['walrus_upload_diagnostic']` before reload), confirm console emits `[WALRUS CRASH DIAGNOSTIC]` on next /launch mount

If E2E #4 fails (user's Brave still crashes at 8 variants), fallback: lower `QUILT_SIZE` to 2 (8-variant becomes 4 quilts → 8 popups + 1 launch = 9 sigs). Update `BatchProgressPanel` math and re-test. This is a one-line constant change, not a redesign.

---

## Deferred to Implementation

- **OQ-A (origin)**: Confirmed answered by research — Walrus quilt is atomic per-quilt; multi-quilt is the right shape. R1 path is fixed.
- **OQ-B (origin)**: `Scene.dispose()` reliability on macOS Metal — verify during U2 impl. If GPU buffers don't actually free after `dispose()`, add explicit `engine.releaseEffects()` and document.
- **OQ-C (origin)**: `performance.memory.usedJSHeapSize` accuracy in Brave — measure on user's Brave during U5 impl. Brave's fingerprint-protection quantization is rumored but unconfirmed; if values are too coarse, adjust threshold or fall back to a heuristic.
- **OQ-D (origin)**: Resolved — D-063 picks "dispose scene/meshes, keep engine" approach.
- **OQ-E (origin)**: Deferred to follow-up (GLB texture downscaling).

---

## Open Questions for User (Plan-Time)

None blocking. All resolved during ce-debug + Phase 1 research + this planning conversation:
- Multi-quilt vs SDK patch vs cap reduction → user picked multi-quilt with UX education
- QUILT_SIZE value → 4 chosen (D2 from menu)
- R6 added during planning after multi-quilt anti-pattern surfaced

---

## Execution Notes

- **Session split**: brainstorm estimated S1 (U1+U2) and S2 (U3-U6). With R6 added, U4 grew. Realistic split: **S1: U1, U2, U6 (foundation: data layer + dispose + trail)**. **S2: U3, U4, U5 (UI: page integration + progress UI + memory banner)** + verification on user's Brave. ~2 hr each session.
- **Parallel-safety**: U1, U2, U5, U6 have no file overlap with each other — parallel-safe if executed via subagents in worktree isolation. U3 depends on U2; U4 depends on U1.
- **Browser verification** per CLAUDE.md frontend protocol: agent-browser smoke required after S2 lands (drives test-wallet 8-variant path). User's Brave smoke (AE2) is the killer acceptance check.
- **No execution-posture override**: standard implementation order (write code → write test → run test). Test scenarios are specific enough to write test-first for U4/U5/U6 if the implementer prefers.
