---
date: 2026-06-03
topic: memwal-upload-captioning
---

# MemWal — Upload Captioning (Riff Copilot vision stretch)

## Summary

Give an uploaded GLB a text identity. On `/create` in upload mode, an opt-in "Describe with AI" button captures a few turntable snapshots of the just-loaded model, sends them to a multimodal Gemini call (server-side), and returns a short low-poly description into an **editable** field. The user can fix it, then mint as normal; on mint, that description is written to the creator's **personal** MemWal memory so the uploaded model becomes recall-able and riff-able — closing the only gap in the memory story (uploads are currently invisible to recall). The whole layer fails soft: any error leaves the existing upload→mint flow untouched.

---

## Problem Frame

Tusk3D's memory layer (L0/L1, D-080) recalls a creator's past *prompts*. But uploaded GLBs have no prompt — `CreateModelPage.tsx` publishes them as `params_json = { source: 'upload' }`, with no text at all. So every uploaded model is a dead end for memory: it can never surface in similar-prompt recall, never seed the copilot, never be "riffed." A creator who builds half their library by uploading gets none of the "remembers you" behavior that is the submission's most legible agentic moment.

The fix is to give uploads the one thing they're missing — a description — and to do it the way the rest of the Riff Copilot works: an AI drafts, the human edits, the result enters memory. This also extends D-081's "LLM at the prompt-authoring seam" from text-to-text (the L2 copilot) to image-to-text (vision), with no new dependency or key (the wired `gemini-2.5-flash` is already multimodal).

---

## Actors

- A1. Uploading creator: a logged-in user who chose upload mode and loaded a `.glb`. The captioning button is offered only to this actor, only after a model is loaded in the preview.
- A2. The captioner (the agent): the server-side Gemini multimodal call that turns turntable snapshots into a short description.

---

## Key Flows

- F1. Caption an upload (hero flow)
  - **Trigger:** A1 loads a `.glb` in upload mode and clicks "Describe with AI".
  - **Actors:** A1, A2
  - **Steps:** (1) Frontend captures 3–4 evenly-spaced turntable snapshots from the live preview (reusing `captureStills`, no watermark). (2) Frontend POSTs the images to a server-side captioning route. (3) Gemini returns one short low-poly description. (4) The description lands in an editable description field. (5) User edits if desired. (6) User mints as normal.
  - **Outcome:** On a successful mint, the (possibly edited) description is stored to the creator's personal MemWal namespace and in `params_json` as `{ source: 'upload', caption }`, so the upload is now recall-able and shows a description on its model page.
  - **Escape path:** User ignores the button entirely and mints with no caption (today's behavior, fully preserved); or clears/overwrites the drafted text before mint.

- F2. Degraded fallback
  - **Trigger:** Gemini is unavailable/erroring, the key is unset, or snapshot capture fails.
  - **Actors:** A1
  - **Steps:** The button is hidden (key unset / feature off) or, on a transient call failure, shows a retry without blocking. The upload→mint flow works unchanged with no caption.
  - **Outcome:** Core upload flow never breaks; the user is never shown a broken captioner.

---

## Requirements

**Entry & interaction model**
- R1. Captioning is **opt-in**: a "Describe with AI" affordance, shown only in upload mode and only once a GLB is loaded in the preview. No auto-captioning on file drop.
- R2. The drafted caption lands in an **editable** field and remains fully user-editable before mint. The captioner never auto-mints and never spends SUI.
- R3. Captioning is **not SUI-fee-gated** (it dispatches no generation; it is a read). It is rate-limited per-user, consistent with the memory/copilot proxy posture.
- R4. The feature is gated behind a feature flag consistent with the copilot's (`VITE_COPILOT_ENABLED`) so a key-less deploy hides the button.

**Recognition quality**
- R5. The captioner is fed **3–4 turntable snapshots** of the model in a single multimodal call — not a single image — to reduce single-view ambiguity for low-poly shapes.
- R6. **No text hints** (filename, mesh/material names) are sent to the model. Filenames can be wrong or meaningless and mesh names from generators are non-semantic (`segmentation_1`), so either could confidently mislead; the images plus the human-editable backstop are the design, not text priors.
- R7. The returned description is short, low-poly / game-asset framed, and bounded to the same length ceiling as a prompt (≤1000 chars), so it is a usable Tripo-style prompt and a clean memory record.

**Memory write-back**
- R8. On a successful mint of a captioned upload, the final (edited) caption is written to the creator's **personal** MemWal namespace via the existing remember-on-publish path, with the model id — identical record shape to a prompt-origin memory.
- R9. A captioned upload is **personal-only**: it is **not** mirrored to the global/community pool, regardless of access policy. (Rationale: an AI caption is a guess, not human-authored; keep the shared recall pool human-authored. This intentionally differs from prompt write-back, which mirrors non-RESTRICTED prompts globally.)
- R10. If the user never captions (or clears the field), the upload mints exactly as today (`{ source: 'upload' }`, no memory write) — no empty/placeholder caption is stored.

**Reliability & safety**
- R11. Every captioning call is fail-soft: on key-unset, snapshot failure, model error, timeout, or empty output, the page degrades to the plain upload→mint flow with no caption and never blocks core `/create`.
- R12. The Gemini API key stays in backend env, server-side only; never exposed to the browser or prefixed `VITE_`. The browser never calls Gemini directly — it POSTs images to the backend route. (Same posture as the L2 copilot, D-081/R11.)
- R13. The captioning route is JWT-authed and rate-limited the same way the memory/copilot routes are; image payload size is bounded (small WebP frames) and the number of frames is capped server-side.
- R14. The feature must not regress any existing upload, Tripo, mint, or L0/L1/L2 behavior when the flag is off or the button is unused.

---

## Acceptance Examples

- AE1. **Covers R1, R2.** Given upload mode with a loaded GLB, when the user clicks "Describe with AI", then a description appears in an editable field and no mint/SUI action is triggered; editing the field changes what gets stored.
- AE2. **Covers R5, R7.** Given a loaded model, when captioning runs, then the backend receives multiple snapshot frames in one call and returns a single short (≤1000-char) low-poly description.
- AE3. **Covers R8, R9.** Given a captioned upload that mints successfully, then exactly one personal-namespace memory record is written (caption + model id) and **no** global-pool record is written.
- AE4. **Covers R10.** Given the user uploads but never captions (or clears the field), when they mint, then `params_json` is `{ source: 'upload' }` and no memory record is written.
- AE5. **Covers R6.** Given an upload whose filename and mesh names are non-semantic, when captioning runs, then the description is derived from the images alone (no filename/mesh text in the model input) and is not poisoned by the misleading name.
- AE6. **Covers R11, R14.** Given Gemini is unavailable, when the user is in upload mode, then the button is hidden or shows a non-blocking retry, and the upload→mint flow works unchanged.
- AE7. **Covers R3, R12.** Given captioning runs, then it consumes no SUI, the browser never calls Gemini directly, and the request is JWT-authed to the backend route.

---

## Success Criteria

- An uploaded model can be given an AI-drafted, human-edited description and, on mint, becomes recall-able in the creator's personal memory — verified by the description surfacing in a later similar-prompt recall.
- Recognition is robust enough on common low-poly game assets (multi-frame) that the drafted caption is a useful starting point the user lightly edits, not a coin flip — with the editable field as the explicit backstop for misses.
- Any failure in the vision/relayer path leaves the core upload→mint flow fully usable; no regression in shipped L0/L1/L2 behavior.
- A downstream implementer can build from this doc + the plan without re-deciding trigger, recognition inputs, memory scope, or degradation behavior.

---

## Scope Boundaries

- Captioning Tripo-generated models — out of scope; they already have a prompt.
- Feeding filename / mesh / material names to the model as text hints — explicitly rejected (R6) for v1; revisit only behind a strict "weak hint, ignore if it conflicts with the image" fence if pure vision proves insufficient.
- Auto-captioning on file drop — rejected in favor of opt-in (R1).
- Mirroring AI captions to the global/community recall pool — rejected (R9); personal-only.
- Per-part / per-mesh captioning, auto-tagging part names from vision — out of scope (the part-naming step stays manual).
- Editing or re-meshing the GLB based on vision — out of scope (description only).
- Vision captioning on pages other than `/create` upload mode.
- Streaming the caption token-by-token — single-shot; the caption is short.
- Mainnet deployment of the captioning layer; self-hosted relayer (managed/testnet only, as L0/L1/L2).

---

## Key Decisions

- Trigger = opt-in "Describe with AI" button, not auto-on-drop: cost control (a paid call only when wanted) and user agency, consistent with the opt-in L2 copilot toggle.
- Recognition input = 3–4 turntable frames, images only, no text priors: multi-frame beats single-view ambiguity on low-poly shapes at negligible cost; text hints (filename, mesh names) are rejected because a wrong/non-semantic name misleads more than it helps, and the human-editable field is the real backstop.
- Memory scope = personal-only: an AI caption is a guess; keep the shared community pool human-authored. Differs deliberately from prompt write-back (which mirrors non-RESTRICTED prompts globally).
- Architecture = frontend captures snapshots (reusing `captureStills`) → POSTs base64 frames to a JWT-authed backend route → server-side multimodal Gemini → caption; reuses the wired `gemini-2.5-flash` (already multimodal) and the copilot client/route patterns. No new dependency, no new key.
- Caption stored in `params_json` as `{ source: 'upload', caption }` (on-chain, visible on the model page) AND in personal memory; absent if the user never captions (no placeholder).
- Fee model = not SUI-gated, rate-limited only: captioning dispatches no generation, mirroring the copilot's posture (vs. Tripo's fee gate, D-034).

---

## Dependencies / Assumptions

- No new dependency or key: reuses the already-wired Vercel AI SDK + `@ai-sdk/google` and the existing `GOOGLE_GENERATIVE_AI_API_KEY`; `gemini-2.5-flash` is multimodal and accepts multiple images in one `generateText` call (to verify against the pinned SDK during planning).
- Reuses shipped infra: `captureStills.ts` (Babylon snapshot, needs a no-watermark variant + reachable handle from the upload preview), the copilot client/route pattern (`backend/src/lib/copilot-client.ts`, `backend/src/routes/copilot.ts`), the memory remember path (`backend/src/routes/memory.ts` `memoryWrites` — personal write only here), and `useCreatorMemory.ts`.
- The preview canvas in upload mode exposes (or can expose) an imperative handle to capture screenshots from the loaded GLB — to verify against `PreviewCanvas.tsx` during planning.
- ADR: this extends D-081 (LLM at the prompt-authoring seam) to the vision modality and adds a small new contract behavior (caption in `params_json`, personal memory write for uploads). Likely a light ADR relating D-081/D-080/D-033 rather than a new architecture decision — confirm at plan time.
- Constraint: 18 days to the 6/21 submission (today 2026-06-03), core product mid-Phase-4. This is an explicit BONUS / non-critical-path stretch — keep it tight; it must not consume time the core 6/21 path (real Slush demo arc, deploy, pitch/demo video) needs.
- Frontend-touching → default 5-reviewer roster (ce-correctness, ce-testing, ce-api-contract, ce-adversarial, ce-julik-frontend-races) + browser-verify per CLAUDE.md.

---

## Outstanding Questions

### Resolve Before Planning

- None — trigger (opt-in), recognition input (multi-frame, no text hints), memory scope (personal-only), fee model (free/rate-limited), and degradation are all resolved above.

### Deferred to Planning

- [Affects R5] [Technical] Optimal frame count (3 vs 4) and camera angles for low-poly recognition; whether to reuse the `captureStills` turntable spacing or pick fixed informative angles (front-3/4, side, top). Empirical, cheap to tune.
- [Affects R5, R12] [Technical] Multimodal message shape for the pinned `ai` + `@ai-sdk/google` (image parts in a single `generateText` content array); payload encoding (base64 WebP) and server-side size/frame caps.
- [Affects F1] [Technical] How the upload preview exposes a screenshot handle (extend the existing PreviewCanvas handle vs a dedicated capture path), and a no-watermark snapshot variant of `captureStills`.
- [Affects R2] [Technical] Where the "Describe with AI" button + editable description field mount in `CreateModelPage` upload mode (testids; relationship to the existing name/prompt fields), and whether upload mode gains a first-class description field or reuses the prompt input.
- [Affects R8] [Technical] Threading the caption into the existing remember-on-publish call for the upload path (which today passes no prompt), personal-only (no global mirror).
- [Affects R7] [Needs light research] System-prompt tuning so captions read as usable low-poly prompts; a few empirical iterations (cheap — vision calls, no SUI).
