---
status: active
date: 2026-06-02
type: feat
title: "feat: MemWal L2 — conversational Riff Copilot on /create"
origin: docs/brainstorms/2026-06-02-memwal-l2-conversational-copilot-requirements.md
decision: D-081
---

# feat: MemWal L2 — Conversational Riff Copilot on /create

## Summary

Add an opt-in **"Chat with Copilot"** sub-mode to the Tripo path on `/create`. When on, a Gemini-driven copilot asks ≤3 clarifying turns — skipping what it can already infer from the user's recalled MemWal memory — then synthesizes a Tripo prompt into the **existing** prompt input box (editable; never auto-generates). All LLM calls go through a new backend route mirroring `/api/memory`; the Gemini key stays server-side. The whole layer fails soft: any LLM/relayer error hides the toggle and leaves the shipped L0/L1 + raw textarea experience untouched. On a successful mint the existing remember-on-publish path stores only the final prompt (no Q&A, no facts → no L1 pollution).

---

## Problem Frame

`/create` makes a returning creator re-type a prompt cold even though L0/L1 already recalls their history — the page *surfaces* memory but nothing *reasons* with it. For the Walrus-track narrative this is the missing "agent" beat: judges see storage, not an agent. L2 closes that gap with the single most legible "remembers you" moment in the product (the hero demo: "welcome back — you made three low-poly vehicles; want a new one?" → ≤3 turns → synthesized prompt → preview). It is an explicit **bonus / non-critical-path** stretch for demo day (7/20), not required for the 6/21 submission, so the plan optimizes for tightness and zero regression to the core flow over completeness.

---

## Architecture Decision (resolves origin Deferred-to-Planning #1 and #2)

The origin doc tentatively leaned on MemWal's `withMemWal(model, config)` AI middleware (auto-injects recalled memory, auto-saves facts) but deferred the wiring and flagged the fact-auto-save as an R9 pollution risk.

**This plan does NOT use the `@mysten-incubation/memwal/ai` middleware for v1.** Instead it calls Gemini directly via the Vercel AI SDK (`ai` + `@ai-sdk/google`, single-shot `generateText`) and assembles memory context from the **existing, shipped recall path** (`recall` in `backend/src/lib/memwal-client.ts`, already used by `/api/memory`). Rationale:

- **R9 satisfied by construction** — no middleware means no fact auto-save, so nothing can pollute the L1 personal recall namespace. The only write remains the shipped remember-on-publish (final prompt only, R8).
- **Less beta surface** — the relayer is already a no-SLA beta; not stacking the beta AI middleware on top reduces demo-day failure modes.
- **Skip behavior is fully controlled** — "question-skipping" (R6) is an explicit, testable step (recall → fold into the system prompt) rather than opaque middleware injection.
- **No rework cost to upgrade later** — `withMemWal` is itself built on the Vercel AI SDK, so a future move to the middleware reuses the same model/provider setup.

This is a HOW decision squarely within planning's mandate (origin marked it Deferred-to-Planning); it does not reopen any confirmed product decision.

---

## Requirements Trace

Origin: `docs/brainstorms/2026-06-02-memwal-l2-conversational-copilot-requirements.md` (R1–R14, AE1–AE7, F1–F3).

| Requirement | Where addressed |
|---|---|
| R1 Toggle Write/Chat, opt-in, default preserves today | U6 |
| R2 Compact panel, no redesign, textarea reachable | U6 |
| R3 Synthesis fills existing input box, editable, never auto-generates | U5, U6 |
| R4 ≤3 turns hard cap, must emit by turn 3 | U3, U4, U5 |
| R5 "Generate now" forces early synthesis | U4, U5, U6 |
| R6 Skip questions answerable from recalled memory | U3, U4 |
| R7 Greeting reflects history; neutral when empty; no fabrication | U3, U4 |
| R8 Mint remembers only final prompt via existing path | U6 (reuses shipped IIFE) |
| R9 No non-prompt facts in L1 namespace | Architecture Decision (no middleware) |
| R10 Fail-soft to L0/L1 + textarea on any error | U3, U4, U5, U6 |
| R11 Gemini key backend-only, never VITE_, browser never calls Gemini | U2, U4 |
| R12 Per-user rate/turn guardrails | U4 |
| R13 No regression to L0/L1 when toggle off | U6 + full regression check |
| R14 "Remembers you" honestly gated; demo seed reflects real prompts | U7 (deferred seed) + Risks |
| AE1–AE7 | Test scenarios in U3–U6 (AE-linked) |
| F1 hero / F2 cold-start / F3 degraded | U3–U6 collectively |

---

## Key Technical Decisions

- **No MemWal AI middleware for v1** — direct Gemini via Vercel AI SDK + explicit recall context assembly (see Architecture Decision). New deps: `ai`, `@ai-sdk/google`. `@mysten-incubation/memwal/ai` is NOT added.
- **Backend copilot route mirrors `backend/src/routes/memory.ts`** — same `bindNamespace` (JWT → Sui address), same address-keyed fixed-window limiter shape, same fail-soft posture (errors → a clean degraded response, never a 5xx that breaks the page). Registered in `backend/src/app.ts` next to `/api/memory`.
- **Stateless turns** — the browser holds the conversation and sends the full (bounded ≤3) message list each turn; the backend is stateless per request (no server session store). Turn cap enforced both client (U5) and server (U4) side.
- **Server-side recall** — the copilot route recalls the caller's personal namespace itself (never trusts a client-supplied namespace), reusing `getMemwalClient().recall`. Memory context is folded into the system prompt.
- **Single-shot per turn (non-streaming)** — `generateText`, not streaming; adequate for a ≤3-turn wizard and more demo-reliable.
- **Inert when unconfigured** — missing `GOOGLE_GENERATIVE_AI_API_KEY` makes the route report "unavailable" (mirrors memwal-client `INERT_STUB`); the frontend then hides the toggle. Local dev and the 6/21 submission are unaffected when the key is absent.
- **Env var name** = `GOOGLE_GENERATIVE_AI_API_KEY` (the `@ai-sdk/google` default). Backend-only; never `VITE_`-prefixed.
- **ADR D-081 gates implementation** — reintroducing an LLM reverses D-023; the ADR is U1 and must be drafted + user-confirmed before U2+.

---

## Output Structure

New files (per-unit `Files` are authoritative):

```
backend/src/lib/copilot-client.ts          # Gemini factory + synthesis logic (inert when no key)
backend/src/lib/copilot-client.test.ts
backend/src/routes/copilot.ts              # /api/copilot route, mirrors memory.ts
backend/src/routes/copilot.test.ts
frontend/src/creator/useRiffCopilot.ts     # conversation hook
frontend/src/creator/useRiffCopilot.test.ts
frontend/src/creator/CopilotChat.tsx       # conversation panel + Write/Chat toggle UI
frontend/src/creator/CopilotChat.test.tsx
```

Modified: `backend/package.json`, `backend/.env.example`, `backend/src/app.ts`, `frontend/src/creator/CreateModelPage.tsx`, `docs/decisions.md`, `docs/spec.md` (D-023 cross-ref), `docs/phase-progress.md`.

---

## Implementation Units

### U1. Draft ADR D-081 (LLM reintroduction; reverses D-023)

**Goal:** Capture the decision to reintroduce an LLM (Gemini, for L2 only) and follow the Decision Reversal Protocol. Gate before any code.
**Requirements:** Dependencies/Assumptions (origin); CLAUDE.md Decision Reversal Protocol.
**Dependencies:** none.
**Files:** `docs/decisions.md` (add D-081), `docs/spec.md` (note D-023's narrow reversal where the LLM-router removal is recorded).
**Approach:** New `## D-081` entry, status `Accepted`, stating: an LLM returns to the stack **scoped to the L2 copilot only** (prompt synthesis at `/create`), via Gemini + Vercel AI SDK, backend-only key; the original D-023 rationale (no LLM in the *generation dispatch* path — prompt mode still goes straight to Tripo) is preserved. Relate to D-023 and D-080. Per the reversal protocol, update D-023's status line to note it is **narrowed/partially superseded by D-081** (D-023's core — Tripo dispatch has no LLM router — still holds; only the "no LLM anywhere" implication is lifted). Confirm the decision text with the user before implementing (CLAUDE.md ADR step).
**Patterns to follow:** existing ADR entries (D-080, D-023) and the ADR template at the bottom of `CLAUDE.md`; Decision Reversal Protocol (new D-XXX + update old status + spec.md).
**Test scenarios:** Test expectation: none — documentation unit.
**Verification:** D-081 present and internally consistent; D-023 status updated to reference D-081; user has confirmed the decision text.

### U2. Backend deps + Gemini env scaffolding

**Goal:** Add the LLM dependencies and the server-side key configuration, inert by default.
**Requirements:** R11; Key Technical Decisions (deps, env).
**Dependencies:** U1.
**Files:** `backend/package.json`, `backend/.env.example`.
**Approach:** Add `ai` and `@ai-sdk/google` to backend deps (pin to current stable at install time; record the resolved versions). Add a `GOOGLE_GENERATIVE_AI_API_KEY` block to `.env.example` with the same SERVER-SIDE-ONLY / NEVER-`VITE_` warning used for the MemWal block, plus a one-line note that absence makes the copilot inert (toggle hidden). Add an optional `COPILOT_MODEL` note (default model id chosen in U3).
**Patterns to follow:** the MemWal env block already in `backend/.env.example` (the `NEVER prefix with VITE_` warning).
**Test scenarios:** Test expectation: none — dependency + config scaffolding, no behavioral code.
**Verification:** `pnpm --dir backend install` resolves; backend still boots with the key absent (no startup hard-fail); `.env.example` documents the key and the inert behavior.

### U3. Backend copilot client + synthesis logic

**Goal:** A factory (mirroring `memwal-client.ts`) that, given the conversation so far + recalled memory + turn number, returns either the copilot's next question or the final synthesized Tripo prompt — inert and fail-soft when unconfigured.
**Requirements:** R4, R6, R7, R10; AE2.
**Dependencies:** U2.
**Files:** `backend/src/lib/copilot-client.ts`, `backend/src/lib/copilot-client.test.ts`.
**Approach:** `buildCopilotClient(env, deps?)` pure factory + `getCopilotClient()` lazy singleton; `INERT` sentinel when `GOOGLE_GENERATIVE_AI_API_KEY` is missing (mirrors memwal `INERT_STUB`). One method, e.g. `turn({ messages, memoryContext, turnIndex, forceSynthesize })` → `{ kind: 'question', text }` or `{ kind: 'prompt', text }`. Internally: build a system prompt that (a) instructs ≤3 turns and "by turn 3 (or when forceSynthesize) you MUST output a final Tripo prompt", (b) folds in `memoryContext` (the recalled past prompts) and instructs the model to **skip** asking what memory already answers and to **greet using that history only when present** (R6/R7, never fabricate), (c) constrains the final prompt to the Tripo input shape (≤1000 chars, low-poly-friendly). Call Gemini single-shot via `generateText` with `@ai-sdk/google`, wrapped in `withTimeout` (reuse the helper). Any error/timeout → throw a typed degraded error the route turns into "unavailable" (the client itself never returns junk). The system prompt text is the main tuning surface (see Risks).
**Execution note:** Implement the synthesis contract test-first — the turn-cap and memory-skip behavior are the riskiest logic and benefit from a failing test pinning the contract.
**Patterns to follow:** `backend/src/lib/memwal-client.ts` (factory + lazy singleton + INERT + `withTimeout`).
**Test scenarios:**
- Covers AE2. Given turnIndex at the cap (3rd turn), when `turn` is called, then the result kind is `'prompt'` (forced synthesis) even with sparse messages — verified with a stubbed model.
- Given `forceSynthesize: true` at turn 1, then kind is `'prompt'` (supports R5/AE1 from the client side).
- Given non-empty `memoryContext`, then the assembled system prompt includes the recalled prompts (assert on the prompt passed to the stubbed model) — pins R6 wiring.
- Given empty `memoryContext`, then the system prompt contains no fabricated history and instructs a neutral opener (R7) — assert the prompt does not inject placeholder history.
- Given the model call rejects/times out, then `turn` throws the typed degraded error (not a malformed result).
- Given no API key, then the factory returns the INERT client and `turn` reports unavailable without attempting a network call.
- Given the model returns a >1000-char prompt, then the client clamps/guards to the Tripo limit (R3 input shape).
**Verification:** unit tests pass against a stubbed model; no real Gemini call in tests; inert path proven.

### U4. Backend copilot route (`/api/copilot`)

**Goal:** A JWT-authed, rate-limited, fail-soft route that recalls the caller's memory server-side, drives one copilot turn, and returns the next question or synthesized prompt.
**Requirements:** R4, R5, R6, R10, R11, R12; AE1, AE2.
**Dependencies:** U3.
**Files:** `backend/src/routes/copilot.ts`, `backend/src/routes/copilot.test.ts`, `backend/src/app.ts` (register `app.route('/api/copilot', buildCopilotRoute({ jwt: deps.jwt }))`).
**Approach:** `buildCopilotRoute({ jwt, client?, memory? })` returning a Hono router with `POST /turn`. Reuse `bindNamespace` semantics from `memory.ts` (verify JWT → canonical address; missing/invalid → 401, never empty 200). Body schema (zod): `messages` (array, server-enforced length ≤ 2× the turn cap to bound payload), `forceSynthesize?` boolean. Derive `turnIndex` from the message list server-side (do not trust a client-supplied counter for the cap — R4 must hold even against a crafted client). Rate-limit per address (reuse the fixed-window shape; pick a sane per-window cap for copilot calls — far lower than memory recall since each call is an LLM hit, R12). Recall the caller's personal namespace via `getMemwalClient().recall` (fail-soft: recall failure → empty memoryContext, copilot still works). Call `getCopilotClient().turn(...)`. On copilot/LLM error or INERT → respond with a clear "degraded/unavailable" JSON (e.g. `{ available: false }`) and a `x-copilot-degraded` header — a clean 200/503 the frontend treats as "hide the toggle", NOT a 5xx that surfaces as a broken page. Never echo the API key or raw model errors to the client.
**Patterns to follow:** `backend/src/routes/memory.ts` end-to-end (bindNamespace, zod schema, rate limiter, fail-soft, `x-memwal-degraded` header, `setMemoryDenylistForTest`-style test seams).
**Test scenarios:**
- Covers AE1. Given `forceSynthesize: true`, when POST /turn, then the response is a synthesized prompt regardless of message count.
- Covers AE2. Given a message list already at the turn cap, when POST /turn, then the response is a synthesized prompt (server-enforced cap, not client-trusted).
- Given no/expired/invalid JWT, then 401 (never a degraded-200) — namespace binding is hard-fail.
- Given a malformed body, then 400 with issues.
- Given the caller exceeds the per-address window, then 429.
- Given the recall call fails, then the route still returns a valid question/prompt with empty memory context (fail-soft, R10).
- Given the copilot client is INERT or throws, then the route returns `available:false` + degraded header (a clean status the frontend can branch on), and never leaks the key or raw error.
- Given a client-supplied namespace field, then it is ignored; recall uses the JWT-derived address only.
**Verification:** route tests pass with a fake copilot + fake memory client injected; auth/ratelimit/fail-soft/turn-cap all proven; registered in `app.ts`.

### U5. Frontend copilot hook (`useRiffCopilot`)

**Goal:** Manage the bounded conversation client-side, call `/api/copilot/turn`, expose synthesized prompt + status, and fail soft (mark unavailable on error so the UI can hide the toggle).
**Requirements:** R3, R4, R5, R10; AE1, AE2, AE7.
**Dependencies:** U4.
**Files:** `frontend/src/creator/useRiffCopilot.ts`, `frontend/src/creator/useRiffCopilot.test.ts`.
**Approach:** Hook exposing `{ messages, status, available, sendAnswer, generateNow, reset }` and surfacing the synthesized prompt (via callback or return value) so the page can `setPrompt`. Reuse the auth-token pattern from `useCreatorMemory.ts` (`session.jwt` guarded by `isJwtExpired`, `Authorization: Bearer`, `tokenRef` stale-check, mounted-guard, seq-guard). Enforce the ≤3-turn cap client-side too (UX), but treat the server's response as authoritative. On any fetch error or `available:false` response → set `available=false` (the page hides the toggle / falls back). `generateNow` sends `forceSynthesize:true`. Clear conversation when the auth token changes (mirror the cross-account clear in `useCreatorMemory`). Never auto-trigger generation — only surface the synthesized text for the page to place in the input box.
**Patterns to follow:** `frontend/src/creator/useCreatorMemory.ts` (token guard, seq-guard, mounted-guard, clear-on-token-change).
**Test scenarios:**
- Covers AE1. Given two answered turns, when `generateNow` is called, then it requests synthesis (forceSynthesize) and surfaces a prompt without a third question.
- Covers AE2. Given the hook reaches the turn cap, then the next response is treated as a synthesized prompt and the conversation ends.
- Covers AE7. Given the endpoint returns `available:false` (or errors), then `available` becomes false and no error is thrown to the page (fail-soft).
- Given a stale in-flight response arrives after a newer turn, then the seq-guard drops it (no out-of-order message render).
- Given the auth token changes mid-session, then the conversation state clears (no cross-account leak).
- Given the synthesized prompt arrives, then it is surfaced to the consumer but generation is NOT auto-fired (R3).
**Verification:** hook tests pass (jsdom + mocked fetch); fail-soft, seq-guard, cap, and token-change clear all proven.

### U6. Frontend UI — Write/Chat toggle + conversation panel on /create

**Goal:** Add the opt-in toggle and a compact conversation panel to the Tripo path; route the synthesized prompt into the existing input box; provide escape paths; hide everything when the copilot is unavailable — with zero change to behavior when the toggle is off.
**Requirements:** R1, R2, R3, R5, R7, R8, R10, R13; F1, F2, F3; AE3, AE4, AE5, AE7.
**Dependencies:** U5.
**Files:** `frontend/src/creator/CopilotChat.tsx`, `frontend/src/creator/CopilotChat.test.tsx`, `frontend/src/creator/CreateModelPage.tsx`.
**Approach:** A `CopilotChat` presentational/container component rendering the conversation (greeting + Q&A bubbles + an input for the user's answer + a "Generate now" button) wired to `useRiffCopilot`. In `CreateModelPage`, within the **Tripo branch only**, add a Write/Chat toggle near the prompt field (a sub-mode of the existing `sourceMode==='tripo'`, distinct from the `tripo`/`upload` `sourceMode` toggle). Chat mode renders `CopilotChat` in place of / above the textarea; the textarea remains reachable by flipping to Write. When the copilot synthesizes, call the existing `setPrompt(...)` so the prompt lands in the **same** input the Generate button reads; the user can edit before generating (R3/AE5). **Hide the toggle entirely** when `useRiffCopilot.available === false` (R10/F3) so the page silently degrades to today's L0/L1 + textarea. Leave the remember-on-publish IIFE (CreateModelPage ~L822, Tripo-only) untouched — it already stores the final `prompt`, satisfying R8 for copilot-originated prompts at no extra cost. Give the toggle and panel stable testids (e.g. `copilot-toggle`, `copilot-chat`, `copilot-generate-now`) near `prompt-input`. Upload mode is unaffected (no toggle).
**Patterns to follow:** the existing `sourceMode` toggle and the L1 memory components already mounted in `CreateModelPage` (`CopilotBar`, `PromptMemoryChips`, `CommunityRecall`); their testid + conditional-render conventions.
**Test scenarios:**
- Covers AE5. Given a synthesized prompt has filled the input, when the user edits it and Generate is clicked, then the edited text drives generation (assert `setPrompt`/submit uses the edited value, not the synthesis).
- Covers AE3. Given the hook surfaces a greeting built from history, when Chat mode opens, then the greeting renders (history-aware) — with a mocked hook returning history.
- Covers AE4. Given the hook surfaces a neutral greeting (empty memory), then no past-model references render.
- Covers AE7. Given `available===false`, then the toggle is not rendered and the plain textarea + L1 chips render unchanged (R13).
- Given Chat mode then flip to Write, then the textarea is reachable and retains the current prompt value (escape path, R2/R5).
- Given the toggle is off (default), then the page renders byte-for-byte today's behavior (no copilot calls fire) — regression guard for R13.
- Given upload `sourceMode`, then no copilot toggle appears.
**Verification:** component tests pass; manual browser-verify per protocol (see Verification Strategy); toggle-off path proven identical to current behavior.

### U7. Demo seed + docs (deferred-friendly)

**Goal:** Make the "remembers you" hero reproducible honestly, and update tracking docs.
**Requirements:** R14; CLAUDE.md end-of-session protocol.
**Dependencies:** U6.
**Files:** `backend/scripts/` (extend the existing seed approach if needed), `docs/phase-progress.md`, `docs/decisions.md` (mark D-081 shipped if applicable).
**Approach:** Reuse the L0/L1 seed path (`backend/scripts/seed-memory.ts`) to ensure a demo account has genuine stored prompts so the copilot's history-aware greeting is real, not hardcoded (R14). Update `phase-progress.md`. This unit can be done last / deferred to demo-prep without blocking U1–U6.
**Test scenarios:** Test expectation: none — scripting + docs (seed correctness covered by the existing seed tests).
**Verification:** a seeded demo account produces a history-aware greeting end to end; phase-progress updated.

---

## Verification Strategy

- **Unit/integration:** vitest across shared/backend/frontend (no Playwright in repo). Backend route tests inject fake copilot + fake memory clients (mirror `memory.test.ts`). Frontend hook/component tests use jsdom + mocked fetch.
- **Browser-verify (Frontend Verification Protocol):** with `pnpm --dir frontend dev` running, drive `/create` via `agent-browser`: toggle Write↔Chat, confirm the panel renders, confirm a synthesized prompt lands in `prompt-input` and is editable, confirm toggle-off path is unchanged, confirm the toggle is absent when the backend reports unavailable (run backend without the key to simulate). This is the **pre-wallet** portion; the actual mint (wallet-signed) is the **post-wallet** portion the user runs in real Chrome/Slush and reports back.
- **Regression (R13):** explicitly verify that with the toggle off, the shipped L0/L1 chips / community recall / remember-on-publish behave exactly as before.
- **Review roster (frontend-touching default, per CLAUDE.md):** ce-correctness, ce-testing, ce-api-contract, ce-adversarial, ce-julik-frontend-races.

---

## Scope Boundaries

(Carried from origin; this plan implements R1–R14 only.)

- Upload Captioning; remembering learned preferences/facts or full Q&A; conversational-takeover UI; token streaming; per-user MemWal account ownership / browser key management; L2 on pages other than `/create`; mainnet; self-hosted relayer; multi-language tuning beyond model defaults.

### Deferred to Follow-Up Work

- `@mysten-incubation/memwal/ai` (`withMemWal`) middleware adoption — only if a future need for auto fact-memory justifies the added beta surface; current plan deliberately avoids it (see Architecture Decision).
- Streaming copilot replies (polish).
- Synthesis-prompt quality tuning beyond a usable baseline (see Risks) — iterative, demo-prep timeframe.

---

## Risks & Mitigation

- **LLM→Tripo synthesis quality (ideation's top risk).** Two stochastic systems compound; a synthesized prompt may yield a poor GLB, and tuning burns SUI per Tripo iteration. *Mitigation:* the system prompt (U3) is the tuning surface; ship a usable baseline, defer fine-tuning to demo prep; the user always edits the prompt before generating (R3), so the human is a quality backstop. **Implementation-time unknown** — exact prompt wording is tuned against real output, not settled in this plan.
- **Beta relayer / Gemini reliability on demo day.** *Mitigation:* fail-soft everywhere (R10) + keep a pre-recorded clip for demo day; the copilot is additive, never on the critical path.
- **Cost / key abuse.** *Mitigation:* per-address rate/turn limiter (U4), turn cap (U3/U4/U5), key server-side only (R11).
- **`@ai-sdk/google` API shape / version drift.** The exact `generateText` + provider wiring and current stable versions are confirmed at install time (U2). *Implementation-time unknown* — pin and record resolved versions.
- **Regression to core /create.** *Mitigation:* toggle-off regression test (U6) + R13 explicit check + 5-reviewer roster.

---

## Deferred to Implementation

- Exact `@ai-sdk/google` / `ai` versions and the `generateText` call signature (U2/U3) — resolved at install against live packages.
- Final system-prompt wording for synthesis + skip behavior (U3) — tuned against real Gemini/Tripo output.
- Concrete per-window copilot rate-limit number (U4) — pick against expected demo usage.
- Default Gemini model id / `COPILOT_MODEL` (U3) — choose current cost-appropriate model at implementation.
- Demo seed account + its prompt history (U7) — chosen at demo prep.

---

## Sequencing

U1 (ADR, gate) → U2 (deps/env) → U3 (copilot client) → U4 (route) → U5 (hook) → U6 (UI) → U7 (seed/docs, deferrable). Linear dependency chain; no parallelism needed. **Do not start U2 until U1's D-081 text is user-confirmed.**
