---
date: 2026-06-02
topic: memwal-l2-conversational-copilot
---

# MemWal L2 — Conversational Riff Copilot

## Summary

Add a "Chat with Copilot" toggle on `/create`. When on, a Gemini-driven copilot asks up to 3 clarifying questions — skipping anything it can already answer from the user's MemWal memory — then synthesizes a Tripo prompt into the existing input box, which the user can still edit before generating. The whole layer is a demo-day wow upgrade that fails soft back to plain L0/L1 + the raw textarea; it never blocks the core `/create` flow.

---

## Problem Frame

Tusk3D's `/create` today asks the user to type a raw prompt cold. Two pains compound there. First, prompt-craft is hard: a returning creator who made "three low-poly vehicles" last week still stares at an empty box and re-derives what they already know they like. Second, and sharper for the Walrus-track narrative, Tusk3D has no visible *agent* — the L0/L1 memory layer recalls and surfaces, but nothing on the page *reasons* with that memory. Judges scanning for "genuinely agentic" behavior see storage, not an agent.

The cost is twofold: creators burn cognitive effort (and SUI, since generation is fee-gated) re-specifying preferences the system already has on record, and the submission misses the single most legible "agent that remembers you" moment in the whole product. The shipped L0/L1 layer is the substrate; what's missing is the thing that *uses* it conversationally.

---

## Actors

- A1. Returning creator: a logged-in user with prior minted prompts in their personal MemWal namespace. The copilot's "remembers you" behavior is optimized for this actor.
- A2. First-time / cold-start creator: a logged-in user with no (or sparse) memory history. The copilot still works but has nothing to skip — it asks its full question budget.
- A3. Riff Copilot (the agent): the Gemini-backed conversational assistant that elicits, skips-from-memory, and synthesizes.

---

## Key Flows

- F1. Memory-aware synthesis (hero flow)
  - **Trigger:** Returning creator opens `/create` and flips the "Chat with Copilot" toggle on.
  - **Actors:** A1, A3
  - **Steps:** (1) Copilot greets using recalled memory ("welcome back — you made three low-poly vehicles; want a new one?"). (2) Copilot asks a clarifying question, skipping topics memory already answers. (3) User replies. (4) Within ≤3 turns total, copilot synthesizes a Tripo prompt. (5) Synthesized prompt lands in the existing input box, editable. (6) User edits if desired and clicks Generate — the normal fee-gated Tripo path.
  - **Outcome:** A Tripo prompt produced with fewer keystrokes than cold typing, demonstrably shaped by the user's history; on mint, the final prompt is remembered (existing L1 path).
  - **Escape path:** User can click "Generate now" to end the conversation early, or flip the toggle off to return to the raw textarea + L1 chips at any point.

- F2. Cold-start synthesis
  - **Trigger:** First-time creator (A2) flips the toggle on.
  - **Actors:** A2, A3
  - **Steps:** Copilot has nothing to skip, so it asks its full ≤3-turn budget, then synthesizes.
  - **Outcome:** A usable Tripo prompt; no "remembers you" personalization (honestly absent, not faked).

- F3. Degraded fallback
  - **Trigger:** Gemini or the MemWal relayer is unavailable/erroring when the user is on `/create`.
  - **Actors:** A1/A2
  - **Steps:** The toggle is hidden or disabled; the page silently presents the existing L0/L1 + raw textarea experience.
  - **Outcome:** Core `/create` flow is fully functional; the user is never blocked or shown a broken copilot.

---

## Requirements

**Entry & interaction model**
- R1. `/create` gains a mode toggle: "Write" (the existing raw textarea + L1 chips) and "Chat with Copilot". Default mode preserves today's behavior; the copilot is opt-in.
- R2. When Chat mode is on, a compact conversation panel sits in place of / alongside the textarea without redesigning the page. The raw textarea must remain reachable by flipping the toggle off.
- R3. The synthesized prompt is written into the **existing** prompt input box (the same one Generate reads, 1–1000 chars), and remains fully user-editable before Generate. The copilot never auto-generates or auto-spends SUI.

**Conversation behavior**
- R4. The copilot asks at most 3 clarifying turns. By the 3rd turn it must emit a synthesized prompt, completing with sensible defaults even if information is incomplete.
- R5. The user can end the conversation early at any turn via a "Generate now" affordance, which forces synthesis from whatever has been gathered.
- R6. Before/at conversation start the copilot incorporates the user's recalled personal memory so it can **skip** questions whose answers are already evident from history (topic, style preferences). "Skip" means: do not ask what memory already answers; reflect that knowledge in the greeting/first turn.
- R7. The copilot's greeting reflects recalled history when present (A1) and degrades to a neutral opener when memory is empty (A2) — it must not fabricate history.

**Memory write-back**
- R8. On a successful mint that originated from a copilot session, only the **final synthesized prompt** is remembered, via the existing remember-on-publish path. The Q&A transcript and any intermediate state are ephemeral and not persisted.
- R9. The copilot must not write non-prompt "facts"/preferences into the personal namespace used by L1 recall (no pollution of the similar-prompt chips).

**Reliability & safety**
- R10. Every copilot/LLM/relayer call is fail-soft: on error or timeout the layer degrades to L0/L1 + raw textarea (F3) and never blocks or breaks core `/create`.
- R11. The Gemini API key lives in backend env, server-side only; it is never exposed to the browser or prefixed `VITE_`. The browser never calls Gemini directly.
- R12. Per-user guardrails cap copilot LLM usage (rate/turn limits) to protect the shared key and cost, consistent with the existing memory-proxy limiter posture.
- R13. The L2 layer must not regress any existing L0/L1 behavior (chips, community recall, déjà-vu, remember-on-publish) when the toggle is off.

**Demo integrity**
- R14. The "remembers you" personalization is honestly gated on real history; for demo a seeded account is acceptable but must reflect genuine stored prompts, not hardcoded copy.

---

## Acceptance Examples

- AE1. **Covers R4, R5.** Given Chat mode is on, when the user answers two questions and clicks "Generate now" on turn 2, then the copilot immediately synthesizes a prompt into the input box without asking a third question.
- AE2. **Covers R4.** Given Chat mode is on, when the conversation reaches the 3rd turn, then a synthesized prompt is produced even if the user's answers were vague.
- AE3. **Covers R6, R7.** Given a returning creator whose memory contains several low-poly vehicle prompts, when they open Chat mode, then the greeting references that history and the copilot does not re-ask "what kind of style?" for an attribute memory already answers.
- AE4. **Covers R7.** Given a creator with no memory history, when they open Chat mode, then the copilot opens neutrally and asks its full question budget without referencing any past models.
- AE5. **Covers R3.** Given the copilot has synthesized a prompt, when the user edits the text in the input box and clicks Generate, then the edited text (not the original synthesis) is what drives generation.
- AE6. **Covers R8, R9.** Given a mint that came from a copilot session, when the mint succeeds, then exactly the final prompt is stored (matching the L1 format) and no preference/fact records or Q&A are written.
- AE7. **Covers R10, R13.** Given Gemini is unavailable, when the user is on `/create`, then the copilot toggle is hidden/disabled and the existing L0/L1 + textarea experience works unchanged.

---

## Success Criteria

- A returning creator can produce a Tripo prompt through the copilot in ≤3 turns, with the result visibly shaped by their history — the demo hero shot is reproducible end to end.
- Any failure in the Gemini or MemWal path leaves the core `/create` flow fully usable; no regression in shipped L0/L1 behavior with the toggle off.
- A downstream implementer can build from this doc + the L2 plan without re-deciding conversation shape, what gets remembered, UI placement, or degradation behavior.
- The feature reads as a genuine agent ("remembers you" + reasons over memory), strengthening the Walrus-track / "Riff" narrative — not as a generic prompt-helper.

---

## Scope Boundaries

- Upload Captioning (uploaded GLB → snapshot → vision → description/prompt) — a separate, independent stretch; not part of L2.
- Remembering "learned preferences"/facts or the full Q&A transcript — this version stores only the final prompt.
- A full conversational-takeover UI where chat replaces `/create` — rejected in favor of the opt-in toggle.
- Token-by-token streaming of copilot replies — single-shot per turn for v1; streaming is later polish.
- Real per-user MemWal account ownership / browser delegate-key management — memory remains deployer-owned, as in L0/L1.
- L2 on pages other than `/create` (model / collection / market).
- Mainnet deployment of the memory/copilot layer; self-hosted relayer (managed relayer only).
- Multi-language conversation tuning beyond what the model does out of the box.

---

## Key Decisions

- Interaction model = opt-in toggle coexisting with the raw textarea, synthesized prompt fills the existing input box: smallest UI change, cleanest degradation, zero impact on the core flow when off.
- Conversation discipline = hard cap ≤3 turns + always-available "Generate now": predictable LLM cost and demo-day reliability against the compounded LLM→Tripo non-determinism risk; never hangs without producing a prompt.
- Memory write-back = final prompt only, via the existing remember-on-publish path: reuses shipped infrastructure, keeps L1's similar-prompt recall pool clean, no new memory record type.
- LLM = Google Gemini via the MemWal `withMemWal(model, config)` AI middleware (Vercel AI SDK), called through a backend proxy mirroring `/api/memory`: keeps the API key server-side (honors the documented `VITE_` key-confusion gotcha) and reuses the established proxy + auth + limiter pattern.
- Single-shot per turn (non-streaming): adequate for a ≤3-turn wizard, simpler, and more demo-reliable.

---

## Dependencies / Assumptions

- New dependencies: Vercel AI SDK + `@ai-sdk/google` (Gemini provider). Reintroducing an LLM into the stack **reverses D-023** (which removed the LLM router and dropped `@anthropic-ai/sdk`) → a new ADR is owed, relating D-023 and D-080, before implementation.
- Reuses shipped L0/L1: the backend memory proxy (`backend/src/routes/memory.ts`), the memory codec (`shared/src/memory.ts`), and the frontend memory hook (`frontend/src/creator/useCreatorMemory.ts`). The MemWal account/delegate key and relayer are the existing deployer-owned testnet setup.
- The MemWal AI middleware `withMemWal(model, config)` from `@mysten-incubation/memwal/ai` auto-injects recalled memory and can auto-save facts — R9 requires that any such auto-save not land in the L1 personal recall namespace (configuration to be resolved in planning).
- Cold-start assumption: "remembers you" only exists for accounts with history; the demo requires a seeded account whose memory reflects genuine stored prompts (R14).
- User will supply the Gemini/Google API key; not required until implementation.
- Constraint: 19 days to the 6/21 submission, core product mid-Phase-4. L2 is an explicit BONUS / non-critical-path stretch — keep it tight; it must not consume time the core 6/21 path needs.
- Frontend-touching → default 5-reviewer roster (ce-correctness, ce-testing, ce-api-contract, ce-adversarial, ce-julik-frontend-races) + browser-verify per CLAUDE.md.

---

## Outstanding Questions

### Resolve Before Planning

- None — the product decisions (interaction model, conversation discipline, memory write-back, degradation) are resolved above.

### Deferred to Planning

- [Affects R6] [Technical] Exactly how "question-skipping" is wired: rely on `withMemWal` middleware auto-injection of recalled memory into the model context vs an explicit `recall()` → system-prompt-context assembly. Determine which gives reliable skip behavior with the pinned SDK.
- [Affects R8, R9] [Technical] How to ensure the middleware's fact auto-save (if active) does not write into the L1 personal namespace — disable it, or route it to a separate namespace not read by L1 recall.
- [Affects R11, R12] [Technical] Shape of the backend copilot/proxy route (turn handling, where the system prompt + memory context are assembled, rate/turn limiter keying) — mirror `backend/src/routes/memory.ts`.
- [Affects R4] [Needs research] Tune the system prompt so synthesis reliably yields prompts that produce good Tripo GLBs (the compounded LLM→Tripo quality risk noted in ideation); may need a few empirical iterations (burns SUI per iteration).
- [Affects R2] [Technical] Minimal conversation-panel UI that fits CreateModelPage without a redesign (testids, where it mounts relative to `prompt-input`).
- [Affects R14] [User decision, low] Which account to seed for the demo and with what prompt history.
