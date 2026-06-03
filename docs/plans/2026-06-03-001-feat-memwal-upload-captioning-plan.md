---
status: active
date: 2026-06-03
type: feat
title: "feat: MemWal Upload Captioning — vision describe-on-upload on /create"
origin: docs/brainstorms/2026-06-03-memwal-upload-captioning-requirements.md
decision: D-082
---

# feat: MemWal Upload Captioning — vision describe-on-upload on /create

## Summary

Give an uploaded GLB a text identity so it can enter the creator's memory. On `/create` in **upload** mode, an opt-in **"Describe with AI"** button captures 3–4 clean (un-watermarked) turntable frames from the live Babylon preview, base64-encodes them, and POSTs them to a new JWT-authed backend route that calls Gemini (`gemini-2.5-flash`, multimodal) and returns one short low-poly description. The description lands in an **editable** field; the user can fix it, then mint as normal. On a successful mint of a captioned upload, the (edited) caption is written to the creator's **personal** MemWal namespace (NOT the global pool) and stored in `params_json` as `{ source: 'upload', caption }`. The whole layer is **fail-soft**: no key, capture failure, model error, or timeout leaves today's upload→mint flow completely untouched, with no caption written.

This closes the only gap in the memory story — uploads are currently published as `{ source: 'upload' }` with no text (`frontend/src/creator/CreateModelPage.tsx:881`), so they can never surface in recall, seed the copilot, or be riffed. It extends D-081 ("LLM at the prompt-authoring seam") from text→text to image→text, reusing the wired multimodal model and key — **no new dependency, no new key**.

---

## Problem Frame

Tusk3D's memory layer (L0/L1, D-080) recalls a creator's past *prompts*, and the L2 copilot (D-081) reasons over them. But uploaded models have no prompt, so a creator who builds their library by uploading gets none of the "remembers you" behavior — the submission's most legible agentic beat. The fix is to give uploads the one thing they're missing (a description) the way the rest of the Riff Copilot works: the AI drafts, the human edits, the result enters memory.

This is an explicit **bonus / non-critical-path** stretch (18 days to the 6/21 submission, core product mid-Phase-4). The plan optimizes for tightness and zero regression to the core upload→mint flow over completeness.

---

## Architecture Decisions (resolve origin Deferred-to-Planning items)

These are HOW decisions squarely within planning's mandate; none reopen a confirmed product decision.

1. **Separate `caption-client` + `caption` route, cloning the copilot pattern** (resolves origin "shape of the backend route"). Rather than adding a `caption()` method to the conversational copilot client, add a parallel `backend/src/lib/caption-client.ts` + `backend/src/routes/caption.ts` mirroring `copilot-client.ts` / `copilot.ts` exactly (server-side key, `configured`/INERT, `withTimeout`, `DegradedError`, JWT `bindNamespace`, per-address rate limit, `{available:false}` vs transient `{available:true, retryable:true}` + `x-caption-degraded`). Rationale: the conversational `turn()` and single-shot vision `caption()` have different inputs, schemas, and system prompts; keeping them separate keeps each interface and its tests clean. The repo already duplicates `bindNamespace`/limiter per route (`memory.ts`, `copilot.ts`), so this follows the established convention. (A shared JWT-bind/limiter helper extraction is noted as deferred follow-up.)

2. **Reuse the existing Gemini key and `VITE_COPILOT_ENABLED` flag** (resolves origin "feature flag"). Captioning rides the same `GOOGLE_GENERATIVE_AI_API_KEY` (server-side) as the copilot; the button is gated behind the same public `VITE_COPILOT_ENABLED` flag (both capabilities live or die with the same key). Optional `CAPTION_MODEL` env mirrors `COPILOT_MODEL` for override. No new key, no `VITE_`-prefixed secret (the key-inlining footgun — `docs/solutions/design-patterns/vite-build-time-flag-tree-shake-gate-2026-05-28.md`).

3. **Clean-frame capture via a no-watermark variant** (resolves origin "no-watermark snapshot variant"). The shipped `captureStills` watermarks frames (`tusk3d`) for encrypted-base preview thumbnails. Add a sibling clean path so vision gets unstamped frames (R6). Reuse the DI seam `captureStillsWith(count, startAlpha, deps)` with a passthrough (no-stamp) encoder, plus the existing alpha save/restore-in-`finally` and per-shot `scene.render()` discipline.

4. **Frames sent images-only, WebP, 4 turntable angles at 512px** (resolves origin "frame count + angles" / "multimodal message shape"). `gemini-2.5-flash` accepts `image/webp`; 512px frames are ~258 tokens each (negligible cost, far under the 20 MB inline cap). AI SDK v6 user-message content shape: `[{ type:'text', text }, { type:'image', image: <base64>, mediaType:'image/webp' }, …]` — `type:'image'` is current in v6 (not deprecated); `mediaType` set explicitly to avoid the `image/*`→`image/jpeg` fallback. **No filename or mesh-name text is ever sent** (R6).

---

## Requirements Trace

Origin: `docs/brainstorms/2026-06-03-memwal-upload-captioning-requirements.md`

| Origin | Where addressed |
|---|---|
| R1 opt-in button, upload mode + loaded GLB only | U5 |
| R2 editable field, never auto-mints/spends | U5 |
| R3 not SUI-gated, rate-limited | U2 |
| R4 gated behind `VITE_COPILOT_ENABLED` | U5 (Decision 2) |
| R5 3–4 frames, single multimodal call | U1, U3, U5 |
| R6 images only, no text hints | U1, U2, U5 |
| R7 short, low-poly, ≤1000 chars | U1 |
| R8 personal memory write on mint (caption + model id) | U5 |
| R9 personal-only, NOT global | U5 (omit `policy` from remember body) |
| R10 no caption → `{source:'upload'}`, no memory write | U5 |
| R11 fail-soft everywhere | U1, U2, U4, U5 |
| R12 key server-side, browser never calls Gemini | U1, U2 (Decision 2) |
| R13 JWT-authed, rate-limited, bounded payload | U2 |
| R14 no regression when flag off / unused | U3, U5 |
| AE1–AE7 | mapped per-unit Test Scenarios |

---

## High-Level Technical Design

*This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
[ /create upload mode, GLB loaded ]
        │ user clicks "Describe with AI"   (button gated: VITE_COPILOT_ENABLED && caption.available && sourceMode==='upload' && haveModel)
        ▼
PreviewCanvasHandle.captureFrames(4)  ── clean WebP Uint8Array[]  (U3, no watermark)
        ▼
useUploadCaption.describe(frames)     ── base64-encode, POST /api/caption  (U4)
        │  Authorization: Bearer <jwt>
        ▼
caption route (U2): bindNamespace(401) → rateLimit(429) → zod(frames bounded)
        │  INERT(no key) → { available:false } + x-caption-degraded
        ▼
caption-client.caption({frames}) (U1): generateText({ model: google('gemini-2.5-flash'),
        system: "<short low-poly describer>",
        messages:[{ role:'user', content:[ {type:'text',...}, {type:'image',image,mediaType:'image/webp'} × N ] }] })
        │  withTimeout(15s); throw CaptionDegradedError on any failure/empty
        ▼
{ available:true, caption } ──► editable description field (U5)  ── user edits ──►
        ▼
onMint (U5):  params_json = caption.trim() ? {source:'upload', caption} : {source:'upload'}
        └─ after tx, if upload && caption.trim(): rememberCreation({ prompt: caption, modelId })  // NO policy ⇒ personal-only
```

Failure at any step (no key / capture empty / network / timeout / model error) → no caption, button hidden or shows non-blocking retry, upload→mint proceeds exactly as today.

---

## Implementation Units

### U1. Backend caption client (Gemini vision, fail-soft)

**Goal:** A server-side, fail-soft client that turns N image frames into one short low-poly description, mirroring `copilot-client.ts`.

**Requirements:** R5, R6, R7, R11, R12.

**Dependencies:** none.

**Files:**
- `backend/src/lib/caption-client.ts` (create)
- `backend/src/lib/caption-client.test.ts` (create)

**Approach:**
- Mirror `backend/src/lib/copilot-client.ts`: `CaptionClient { readonly configured; caption(input): Promise<string> }`; `INERT` when no key; `buildCaptionClient(env, deps?)`; `getCaptionClient()` memoized singleton from `process.env.GOOGLE_GENERATIVE_AI_API_KEY` + optional `process.env.CAPTION_MODEL`; `resetCaptionClientForTest()`.
- `CaptionDegradedError` thrown on any failure (no key, model error, timeout, empty output).
- Input `{ frames: CaptionFrame[] }` where `CaptionFrame = { base64: string; mediaType: 'image/webp' }`. Build one user message: `content: [{type:'text', text: <instruction>}, ...frames.map(f => ({type:'image', image: f.base64, mediaType: f.mediaType}))]`. Pass `system` describing the role.
- System/instruction prompt: "Describe the single 3D object shown across these turntable views as one concise low-poly / game-asset prompt. No preamble, no questions, no quotes." Clamp result to `PROMPT_MAX_CHARS = 1000` (mirror copilot).
- `generate` seam (`GenerateFn`) injected for tests (no network), exactly like copilot's. `withTimeout` default 15000ms.
- **No text hint** beyond the fixed instruction — never accept or embed filename/mesh names (R6).

**Patterns to follow:** `backend/src/lib/copilot-client.ts` (INERT, `withTimeout`, `CopilotDegradedError`, `generate` seam, singleton + reset, `clamp`).

**Test scenarios:**
- Happy: given a fake `generate` returning "low-poly red pickup truck", `caption({frames:[...]})` returns that text (trimmed, ≤1000).
- `Covers AE2.` Multi-frame: the message passed to `generate` contains one `text` part + one `image` part per frame, each with `mediaType:'image/webp'`, in order.
- `Covers AE5.` Images-only: no filename/mesh/any caller-supplied text beyond the fixed instruction reaches `generate` (assert message parts contain only the instruction text + images).
- Clamp: a >1000-char model output is truncated to ≤1000.
- Edge: empty model output ('' / whitespace) → throws `CaptionDegradedError`.
- Error: `generate` rejects → `CaptionDegradedError`; timeout (generate never resolves within budget) → `CaptionDegradedError`.
- `Covers AE7.` INERT: `buildCaptionClient({})` (no key) has `configured===false` and `caption()` throws `CaptionDegradedError` without calling network.

---

### U2. Backend caption route (JWT, rate-limit, bounded payload, degraded shape)

**Goal:** `POST /api/caption` that authenticates, bounds the payload, calls the client, and returns the copilot-style available/degraded envelope.

**Requirements:** R3, R6, R11, R12, R13.

**Dependencies:** U1.

**Files:**
- `backend/src/routes/caption.ts` (create)
- `backend/src/routes/caption.test.ts` (create)
- `backend/src/app.ts` (modify — register route)

**Approach:**
- Mirror `backend/src/routes/copilot.ts`: `buildCaptionRoute({ jwt, client? })` → `new Hono()` with `route.post('/', ...)`. `bindNamespace(c)` identical (503 if no jwt, 401 missing/invalid Bearer, `normalizeSuiAddress(sub)`); hard-fail on Response. Per-address fixed-window limiter (`WINDOW_MS=60_000`, `MAX_PER_WINDOW=30`) + `resetCaptionRateLimitForTest()`.
- zod schema (R13): `{ frames: z.array(z.object({ base64: z.string().min(1).max(BASE64_MAX), mediaType: z.literal('image/webp') })).min(1).max(MAX_FRAMES) }` with `MAX_FRAMES=6`, `BASE64_MAX` ≈ 400_000 (a 512px WebP is a few KB; cap generously but bounded). `safeParse` → 400 `invalid_params`. **No text field accepted** (R6) — the schema has no caption/hint/filename input.
- INERT: `if (!client.configured) { c.header('x-caption-degraded','1'); return c.json({ available:false }); }`.
- Success: `return c.json({ available:true, caption })`.
- Transient (`CaptionDegradedError` from a configured client, or any throw): `c.header('x-caption-degraded','1'); return c.json({ available:true, error:'unavailable', retryable:true })` — never 5xx (R11).
- Register in `backend/src/app.ts`: `app.route('/api/caption', buildCaptionRoute({ jwt: deps.jwt }))` (import near existing copilot import).
- Namespace is derived but unused for the call itself (no memory read here); still bind it for auth + rate-limit keying (R12/R13), matching the copilot posture.

**Patterns to follow:** `backend/src/routes/copilot.ts` (bindNamespace, limiter, INERT vs transient envelope, `x-*-degraded` header, zod safeParse), `backend/src/app.ts:34` registration.

**Test scenarios:**
- `Covers AE7.` No Bearer → 401; invalid/expired token → 401; valid token + configured client → `{available:true, caption}` from an injected fake client.
- INERT client (no key) → `{available:false}` + `x-caption-degraded` header.
- `Covers AE6.` Configured client throws `CaptionDegradedError` → 200 `{available:true, error:'unavailable', retryable:true}` + header (NOT 5xx).
- `Covers AE2/R13.` Payload bounds: 0 frames → 400; > `MAX_FRAMES` frames → 400; a frame with `mediaType:'image/png'` → 400; an over-size base64 string → 400.
- `Covers AE5.` A body carrying an extra `hint`/`filename`/`text` field is ignored/rejected by the schema (no text reaches the client).
- Rate limit: the (N+1)th call within the window → 429.
- Invalid JSON body → 400.

---

### U3. Clean (no-watermark) frame capture seam

**Goal:** Expose un-watermarked turntable frames from the live preview for vision input, without touching the existing watermarked publish path.

**Requirements:** R5, R14.

**Dependencies:** none.

**Files:**
- `frontend/src/babylon/captureStills.ts` (modify — add clean variant)
- `frontend/src/babylon/captureStills.test.ts` (modify — cover clean variant)
- `frontend/src/babylon/PreviewCanvas.tsx` (modify — add `captureFrames` to handle)
- `frontend/src/babylon/PreviewCanvas.test.tsx` (modify, if a handle test exists)

**Approach:**
- Add `frameStill(dataUrl): Promise<Uint8Array>` — same as `watermarkStill` but **without** the text stamp: draw image to canvas, return `toDataURL('image/webp', WEBP_QUALITY)` bytes. Add `captureFramesFromScene(engine, camera, count)` reusing `captureStillsWith(count, startAlpha, { screenshot, watermark: frameStill })` (the DI seam makes this a one-line wiring; keeps alpha save/restore-in-`finally` + per-shot `scene.render()`).
- Extend `PreviewCanvasHandle` with `captureFrames(count?: number): Promise<Uint8Array[]>` calling `captureFramesFromScene(engine, camera, count ?? CAPTION_FRAME_COUNT)` with `CAPTION_FRAME_COUNT = 4`. Return `[]` if engine/camera not ready (fail-soft, mirroring existing `captureStills` handle behavior).
- Do **not** change `captureStillsFromScene`, `watermarkStill`, `DEFAULT_STILL_COUNT`, or the existing `captureStills` handle method — publish-preview path stays byte-identical (R14).

**Patterns to follow:** existing `captureStills.ts` (`captureStillsWith` DI, `dataUrlToBytes`, alpha restore), `PreviewCanvas.tsx:203-228` `useImperativeHandle`.

**Test scenarios:**
- Happy: `captureStillsWith(4, alpha, deps)` with a fake `screenshot` + identity `watermark` produces 4 byte arrays at evenly-spaced alphas (assert the alphas passed to `screenshot`).
- `frameStill` produces bytes and does **not** invoke any text-stamp (assert via a canvas/`toDataURL` spy that no `fillText` watermark path runs — or assert output differs from `watermarkStill` for the same input).
- Regression: existing `captureStillsFromScene` / `watermarkStill` tests still pass unchanged (R14).
- Edge: handle `captureFrames` returns `[]` when engine/camera refs are null.

---

### U4. Frontend caption hook (network + state, fail-soft, latest-wins)

**Goal:** A hook owning the POST + status/availability state for captioning, mirroring `useRiffCopilot`'s gating and fail-soft posture.

**Requirements:** R11, R14.

**Dependencies:** U2.

**Files:**
- `frontend/src/creator/useUploadCaption.ts` (create)
- `frontend/src/creator/useUploadCaption.test.ts` (create)

**Approach:**
- State: `status: 'idle' | 'thinking' | 'done' | 'error'`, `available` (start `true`, optimistic). `describe(frames: Uint8Array[]): Promise<string | null>` — base64-encode frames, POST `/api/caption` with `Authorization: Bearer <token>` and `{ frames: [{base64, mediaType:'image/webp'}] }`.
- Availability lifecycle exactly like `useRiffCopilot.ts`: no session/token → `available=false`; response `{available:false}` → `available=false` (persistent hide); network !ok / 429 / transient `{available:true,error}` → `status='error'`, **keep** `available=true` (offer `retry()`); reset `available=true` on auth-token change.
- **Latest-wins guard**: `seq` ref; ignore a stale response if a newer `describe` started or the component unmounted. Re-assert `mounted.current = true` in the effect **setup body** (StrictMode cleanup-only footgun — `docs/solutions/integration-issues/react-strictmode-cleanup-only-effect-with-useref-2026-05-23.md`). Keep `lastFrames` for `retry()`.
- The hook does **not** capture frames or touch `previewRef` — CreateModelPage drives capture and passes frames in (separation mirrors copilot: hook = network+state, page = orchestration).
- Returns `{ status, available, describe, retry, reset }`.

**Patterns to follow:** `frontend/src/creator/useRiffCopilot.ts` (seq/mounted/inFlight refs, available lifecycle, retry via lastArgs), `frontend/src/creator/useCreatorMemory.ts` (stale-response guard, Bearer token, fail-soft fetch).

**Test scenarios:**
- `Covers AE1.` Happy: `describe(frames)` POSTs base64 frames and resolves the returned caption; `status` goes `thinking`→`done`.
- `Covers AE6.` `{available:false}` response → `available=false`, status idle (button will hide).
- `Covers AE6.` Network error / 429 / `{available:true,error,retryable}` → `status='error'`, `available` stays `true`; `retry()` re-POSTs the same frames.
- No session/token → `available=false`, no fetch fired.
- Latest-wins: a slow first `describe` whose response arrives after a second `describe` started does not overwrite the newer result.
- Encoding: `Uint8Array` frames are base64-encoded in the body (assert request payload shape, `mediaType:'image/webp'`).

---

### U5. Wire captioning into CreateModelPage (button, editable field, mint + personal remember)

**Goal:** Add the opt-in "Describe with AI" button + editable description in upload mode, thread the caption into `params_json` and a personal-only remember on mint.

**Requirements:** R1, R2, R4, R8, R9, R10, R14 (+ AE1–AE7).

**Dependencies:** U3, U4 (and U2 live for browser-verify).

**Files:**
- `frontend/src/creator/CreateModelPage.tsx` (modify)
- `frontend/src/creator/CreateModelPage.test.tsx` (modify)

**Approach:**
- Add `caption` state (string) + `const captioner = useUploadCaption()`. Place new hooks **above** any early return (hooks-order footgun — `docs/solutions/integration-issues/react-hooks-after-early-return-oauth-mask-2026-05-28.md`).
- Gate: `const captionOn = import.meta.env.VITE_COPILOT_ENABLED === 'true' && captioner.available` (mirror `copilotOn` at line 675). Render the button + editable description in the **upload block** (`CreateModelPage.tsx:1115-1132`, under the file input) only when `captionOn && sourceMode==='upload' && haveModel`.
- Button handler: `const frames = (await previewRef.current?.captureFrames(4)) ?? []; if (!frames.length) { /* soft error */ return } const text = await captioner.describe(frames); if (text) setCaption(text)`. **No auto-snap** — the description textarea is editable; user edits override (do not clobber after edit — the hook's latest-wins covers the async race, and the field is user-owned once populated).
- Loading feedback: reuse `IndeterminateBar` (`frontend/src/ux/IndeterminateBar.tsx`) while `captioner.status==='thinking'`; show retry on `status==='error'` (non-blocking).
- Editable description field: a `<textarea>` (testid `caption-input`) bound to `caption`, max 1000 chars, visible whenever upload mode + haveModel (even before captioning, so the user can type their own). Button label "Describe with AI" (testid `caption-describe`).
- `params_json` (line 881): change upload branch to `caption.trim() ? { source:'upload', caption: caption.trim() } : { source:'upload' }` (R10 — no placeholder).
- Remember on mint (currently `sourceMode==='tripo' && prompt.trim()` at lines 911-932): add an upload branch — after the tx + `extractCreatedModelId`, if `sourceMode==='upload' && caption.trim()`, call `void rememberCreation({ prompt: caption.trim(), modelId })` **without `policy`** so `memoryWrites` writes personal-only (R8/R9 — `backend/src/routes/memory.ts:79` skips the global write when `policy` is absent). Reuse the existing tx-wait/id-extract pattern.
- Fail-soft (R14): if `captionOn` is false (no key / unavailable) the button is simply absent; upload→mint works exactly as today, and an empty `caption` yields `{source:'upload'}` + no remember.

**Execution note:** Frontend-touching → after implementation, browser-verify the full demo arc per CLAUDE.md (upload → Describe with AI → edit → mint), with the 5-reviewer roster (ce-correctness, ce-testing, ce-api-contract, ce-adversarial, ce-julik-frontend-races).

**Patterns to follow:** `CreateModelPage.tsx` copilot wiring (`copilotOn` line 675, toggle render 1028, `previewRef.captureStills` usage line 848, remember block 911-932, params_json 881), `frontend/src/ux/IndeterminateBar.tsx`.

**Test scenarios:**
- `Covers AE1.` Upload mode + loaded GLB + flag on: clicking "Describe with AI" calls `previewRef.captureFrames` then `describe`, and fills `caption-input` with the result; no mint/SUI action fires.
- `Covers AE1/R2.` Editing `caption-input` after a draft changes what gets stored (the edited text, not the draft).
- `Covers AE3.` Captioned upload mint → `rememberCreation` called once with `{prompt: caption, modelId}` and **no `policy`** (personal-only); assert no global write path.
- `Covers AE3.` `params_json` for a captioned upload mint is `{source:'upload', caption}`.
- `Covers AE4.` Upload + never captioned (or caption cleared) → mint `params_json` is `{source:'upload'}` and `rememberCreation` is NOT called.
- `Covers AE6.` Flag off OR `captioner.available===false` → no "Describe with AI" button; upload→mint flow renders and works unchanged.
- `Covers AE6.` `captureFrames` returns `[]` (preview not ready) → soft error, no crash, no POST.
- `Covers R14.` Tripo mode is unaffected: no caption field/button shows; existing prompt + copilot tests still pass.
- Capture failure / `describe` returns null → `status='error'`, retry visible, mint still possible without a caption.

---

### U6. ADR D-082, env docs, phase-progress

**Goal:** Capture the decision and update project docs.

**Requirements:** project protocol (CLAUDE.md), origin "ADR" assumption.

**Dependencies:** U1–U5 (write once the shape is final).

**Files:**
- `docs/decisions.md` (modify — add D-082; bump Reserved Decision Numbers to D-083)
- `docs/decisions.md` (modify — cross-ref in D-081 Related, D-033 Related)
- `backend/.env.example` (modify — note optional `CAPTION_MODEL`; reaffirm `GOOGLE_GENERATIVE_AI_API_KEY` powers caption too)
- `docs/phase-progress.md` (modify — record the captioning build)

**Approach:**
- D-082 (status Accepted): "Extend the prompt-authoring LLM seam to vision (image→text) for upload captioning; AI drafts an editable description for uploaded GLBs, stored personal-only in MemWal + in `params_json` as `{source:'upload', caption}`." Relate D-081 (same seam, text→text), D-080 (memory layer), D-033 (GLB upload). Note it does NOT change the dispatch path (D-023 stays intact). Confirm wording with the user per CLAUDE.md before finalizing.
- Light ADR per the hackathon decision-discipline table (new public-contract behavior: `caption` in `params_json`).

**Test scenarios:** `Test expectation: none -- docs/ADR only, no behavioral code.`

---

## Scope Boundaries

Carried from origin (`docs/brainstorms/2026-06-03-memwal-upload-captioning-requirements.md` Scope Boundaries):
- Captioning Tripo-generated models (they already have a prompt) — out of scope.
- Feeding filename / mesh / material names as text hints — rejected (R6); revisit only behind a strict "weak hint, ignore if it conflicts with the image" fence if pure vision proves insufficient.
- Auto-captioning on file drop — rejected (opt-in only, R1).
- Mirroring AI captions to the global/community recall pool — rejected (R9; personal-only).
- Per-part/per-mesh captioning or auto-tagging part names from vision — out of scope (part-naming stays manual).
- Editing/re-meshing the GLB from vision — out of scope (description only).
- Captioning on pages other than `/create` upload mode; token-by-token streaming; mainnet deployment of the captioning layer; self-hosted relayer.

### Deferred to Follow-Up Work
- Extract a shared `bindNamespace` + fixed-window limiter helper used by `memory.ts`, `copilot.ts`, and `caption.ts` (currently duplicated per route by repo convention).
- Frame-angle tuning (fixed informative angles — front-3/4, side, top — vs reused turntable spacing) if recognition quality on low-poly shapes proves weak; cheap to iterate (vision calls, no SUI).
- System-prompt tuning for caption quality (a few empirical iterations).
- A demo seed of a captioned upload for the "remembers you" hero (reuse `seed-memory.ts`).

---

## System-Wide Impact

- **New external contract surface:** `POST /api/caption` (JWT-authed, internal to the app's own frontend). New optional env `CAPTION_MODEL`. New `params_json` shape `{source:'upload', caption}` (additive; readers tolerant — model detail / market render `params_json` defensively today; verify the model-detail view handles the new key gracefully during browser-verify).
- **Shared component touched:** `PreviewCanvas` handle gains `captureFrames` (additive; `/launch` only uses `dispose`/`remount`, unaffected). `captureStills.ts` gains a sibling function; existing watermarked publish path untouched.
- **Affected parties:** creators using upload mode (new capability); no change for Tripo creators, buyers, or forkers. Recall pool: personal namespace gains caption-origin records (intended — surfaces in `PromptMemoryChips`); global pool unchanged.

---

## Risks & Mitigations

- **Vision misidentifies a low-poly shape** → editable field is the explicit backstop (R2); 4 frames reduce single-view ambiguity; angle/prompt tuning deferred.
- **Caption records dilute personal recall** (they share the namespace with Tripo prompts and surface as pickable chips) → intended per R8; the caption is short and prompt-shaped, so it behaves like a prompt. If noisy, the deferred angle/prompt tuning tightens quality.
- **Async caption clobbers a user edit** → latest-wins `seq` guard (U4) + user-owned field after first populate (U5).
- **StrictMode cleanup-only ref latching** → re-assert mounted ref in effect setup body (U4, documented learning).
- **Key/availability flips mid-session** → optimistic `available=true`, only `{available:false}` (no-key/INERT) hides persistently; transient errors keep the button + offer retry (R11).
- **Payload abuse** → server-side frame-count + base64-size caps + per-address rate limit (U2, R13).

---

## Verification Strategy

- Backend: `pnpm --dir backend test` green incl. new `caption-client.test.ts` + `caption.test.ts`; existing 199 tests unregressed.
- Frontend: `pnpm --dir frontend test` green incl. new `useUploadCaption.test.ts` + `CreateModelPage` additions; existing copilot/upload/mint tests unregressed.
- Browser-verify (CLAUDE.md frontend protocol): upload a GLB → "Describe with AI" → assert `caption-input` fills, is editable, IndeterminateBar shows during the wait; flag-off path shows no button and mints `{source:'upload'}`; degraded path (point to a bad key locally) hides the button. Wallet-gated mint asserted pre-wallet up to the sign step; post-sign state reported by the user.
- 5-reviewer roster on the frontend-touching units (U3, U4, U5).
