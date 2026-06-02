---
date: 2026-06-02
topic: memwal-riff-copilot-l0-l1
---

# MemWal Riff Copilot — L0+L1 Memory Layer (6/21 MVP)

## Summary

A fail-soft **creation-recall** memory layer on `/create`: when a creator publishes a Tripo model, its prompt is stored to MemWal (isolated per wallet via namespace); on return, the creator's own semantically-similar past published prompts surface as clickable chips below the prompt field (a very strong match is highlighted). Runs free on testnet via the managed staging relayer. Two LLM-based extensions (a conversational copilot and upload captioning) are deliberately out of this scope.

> **Reframe (2026-06-02, post ce-doc-review):** First framed as a pre-payment "save SUI on near-duplicate generations" déjà-vu guard. Review showed that mechanism can't reach the SUI-wasting case (SUI is spent at `generate`, memory is curated at `publish`), so the guard (R8/R9) is **dropped and folded into recall chips**, and the value is reframed to **recalling your past creations** — not intra-session fee savings. The plan (`docs/plans/2026-06-02-001-feat-memwal-riff-copilot-l0-l1-plan.md`) reflects the reframed scope.

---

## Problem Frame

Tusk3D's `/create` flow is stateless: a returning creator faces a blank textarea with no trace of what they made before, and Tripo prompt-mode is SUI-fee-gated (D-033/D-034), so re-describing something they already generated burns real money. There is no prompt history anywhere today (localStorage is device-local and non-semantic). For the hackathon, the audience that feels this most is the **demo/judges** — the value must be *visible* in a single session, and it must showcase a real, non-trivial use of a Walrus-ecosystem product rather than a vector-DB-with-extra-steps. MemWal (Walrus's agent-memory SDK) provides cross-session, semantic, Walrus-backed memory that fits this gap.

---

## Actors

- A1. Creator: the connected-wallet user generating models on `/create`. The only human actor; all memory is scoped to them.
- A2. MemWal managed relayer: external system (Walrus Foundation public good) that embeds, encrypts, stores to Walrus, and serves semantic recall. Trusted, beta, no SLA.

---

## Key Flows

- F1. Capture on creation
  - **Trigger:** A successful Tripo prompt generation (and/or mint).
  - **Actors:** A1, A2
  - **Steps:** User generates → system fires a background `remember()` of the prompt scoped to the wallet namespace → UX continues immediately without waiting.
  - **Outcome:** The prompt is durably in the creator's memory for future recall.
  - **Covered by:** R1, R2, R10, R11

- F2. Recall on return
  - **Trigger:** Creator opens `/create` and focuses/types in the prompt field.
  - **Actors:** A1, A2
  - **Steps:** On mount, recall (and restore index if empty) the wallet's memory → as the user focuses/types (debounced), surface their semantically-similar past prompts as chips → clicking a chip refills the textarea.
  - **Outcome:** The creator continues from their own prior work instead of a blank slate.
  - **Covered by:** R3, R5, R6, R7, R10

- F3. Déjà-vu guard
  - **Trigger:** Creator is about to run a paid Tripo generation.
  - **Actors:** A1, A2
  - **Steps:** System checks for a near-duplicate among the user's past prompts → if found, shows a soft warning card (prior thumbnail + open + "generate anyway") → user chooses.
  - **Outcome:** The creator avoids accidentally re-paying for a near-duplicate, but is never blocked.
  - **Covered by:** R8, R9, R10

---

## Requirements

**Memory capture (L0)**
- R1. On a successful Tripo prompt generation, store the prompt text to MemWal as a fire-and-forget background job, scoped to the connected wallet's namespace. The UX must not wait on the job.
- R2. The stored memory record must carry a reference to the resulting model sufficient to later display a thumbnail and open the model, so recalled prompts and duplicate warnings can link back to the actual creation. (Encoding approach is a planning question.)
- R3. On `/create` mount, recall the connected wallet's memory; when the local index is empty/stale, restore the namespace index from Walrus first.
- R4. Uploaded GLBs (no prompt) are intentionally NOT captured into memory in this scope (no text to embed). This is a known, stated boundary, not a defect.

**Recall UI (L1)**
- R5. When the creator focuses or types in the prompt field (debounced), surface the creator's own semantically-similar past prompts as clickable chips.
- R6. Clicking a chip refills the prompt textarea with that past prompt.
- R7. Recall is scoped to the creator's own namespace only — no cross-user results.

**~~Déjà-vu guard (L1)~~ — DROPPED, folded into recall (see Reframe above)**
- ~~R8. Before a paid Tripo generation, check for a near-duplicate...~~ → folded: a very strong recall match is highlighted among the chips (R5), no pre-payment interception.
- ~~R9. Soft warning card with thumbnail + "generate anyway"...~~ → dropped (no thumbnail mechanism exists; no pre-payment seam). Strong-match highlight on a chip replaces it.

**Resilience / identity**
- R10. All memory operations are fail-soft: if the relayer is unavailable, slow, or rate-limited, `/create` behaves exactly as today; memory features silently no-op and never block or error the create/generate flow.
- R11. Memory runs on testnet via the managed staging relayer using a pre-provisioned (baked) `MemWalAccount` + delegate key; per-user isolation is by `namespace` = connected wallet address; no per-user on-chain onboarding.
- R12. The MemWal SDK version is pinned (beta compatibility gate).

---

## Acceptance Examples

- AE1. **Covers R8, R9.** Given the creator previously generated "a low-poly red sports car", when they type "a low poly red race car" and trigger generate, then a soft warning card shows the prior car's thumbnail with open + "generate anyway", and generation proceeds only if they choose to continue.
- AE2. **Covers R10.** Given the managed relayer is down or rate-limited, when the creator uses `/create`, then no chips and no warning appear, no error is surfaced, and generation works exactly as it does without the memory layer.
- AE3. **Covers R5.** Given a connected wallet with no memory history (cold start), when the creator focuses the prompt field, then no chips appear and the field behaves as a normal textarea.
- AE4. **Covers R1.** Given a successful generation, when the creator immediately continues interacting, then the UX is not blocked waiting on the memory write (the write completes in the background).

---

## Success Criteria

- In a seeded demo session, a judge can visibly see the copilot recall the creator's own past prompts and warn on a near-duplicate — memory persistence across the session is observable, not just claimed.
- The memory layer never degrades the core create/generate flow: with the relayer disabled, `/create` is unchanged.
- Runs at zero cost on testnet (managed relayer sponsors storage + gas + embeddings).
- A downstream planner can implement L0+L1 without inventing product behavior, scope, or success criteria.

---

## Scope Boundaries

- **L2 conversational Gemini copilot** (multi-turn elicitation, memory-aware question-skipping, prompt synthesis) — roadmap stretch, not this scope.
- **Upload Captioning** (uploaded GLB → Babylon snapshot → Gemini vision → description / suggested prompt; would later bring uploads into memory) — roadmap stretch, not this scope. The two stretches are not yet sequenced relative to each other.
- Uploaded models participating in the memory layer (depends on Upload Captioning).
- Cross-user / shared memory ("Riff Seed Bank"), Creator DNA card, semantic lineage/drift score, memory-as-tradeable-asset — all later ideas (see `docs/ideation/2026-06-02-memwal-integration-ideation.md`).
- Real per-user MemWal account ownership (`createAccount` / `addDelegateKey` onboarding + browser key management) — roadmap; memory is deployer-owned for now.
- Style-tag extraction / prompt analytics.
- Mainnet deployment of the memory layer.
- Self-hosted relayer (managed only; revisit only if demo-day reliability forces it).
- Memory features on pages other than `/create` (model / collection / market).

---

## Key Decisions

- **Single baked account + namespace-per-wallet isolation** (vs. real per-user accounts): demo-legible with zero on-chain onboarding. Tradeoff: memory is technically deployer-owned, weakening the "user owns their memory" narrative; accepted for the hackathon, with real per-user ownership on the roadmap.
- **Soft warn, never block** on déjà-vu: generation is fee-gated, but blocking risks paternalism and demo-killing false positives; informing-and-allowing keeps the "save SUI" value without the failure mode.
- **No style-tag extraction in MVP:** `recall` is already semantic over the raw prompt; tags belong to later LLM features (Creator DNA / copilot). YAGNI.
- **Gemini for all LLM-based extensions** (the two stretches), not a local-on-VM model: eliminates local-model quality risk; local is a post-hackathon cost optimization.
- **Both stretches kept, unsequenced:** L2 and Upload Captioning are both captured; ordering decided after the core product is done.

---

## Dependencies / Assumptions

- New dependency `@mysten-incubation/memwal` — an ADR is owed before implementation.
- The managed staging relayer is beta with no SLA and possible usage limits → demo-day live reliability risk; mitigate with a pre-recorded demo clip and/or self-host fallback.
- The pain ("creators lose prompts / waste SUI") is reasoned, not yet observed — the product is unlaunched and the primary audience is judges; success is framed accordingly.
- A demo requires seeding the demo wallet's namespace with a few prior creations (cold-start: chips/guard only have value with history).
- `remember(text)` embeds the stored text and `recall` returns `{ text, distance, blob_id }` with no arbitrary metadata field — so the R2 model-reference must be encoded into the stored text or a side channel (planning question).
- Babylon already renders the GLB preview (relevant only to the Upload Captioning stretch) — reasoned, unverified against the preview component.

---

## Outstanding Questions

### Resolve Before Planning

- (none — all product decisions resolved in this brainstorm)

### Deferred to Planning

- [Affects R2][Technical] How to encode the resulting-model reference into the memory record without polluting the prompt embedding (e.g., delimiter-appended id vs. a parallel lookup).
- [Affects R8][Needs research] The semantic-distance threshold value for "near-duplicate" — tune empirically.
- [Affects R11][Technical] Where the baked delegate key + accountId live in the app/config, and how the namespace is derived from the dapp-kit address.
- [Affects R3][Technical] When to call `restore()` vs. rely on the relayer's index (cost/latency of restore on mount).

---

## Follow-on Feature: Global Recall (community discovery)

Added 2026-06-02. Builds on the same MemWal subsystem; planned as units U8–U10 in `docs/plans/2026-06-02-001-feat-memwal-riff-copilot-l0-l1-plan.md` (personal recall is must-ship; global is the immediate next layer, cuttable). This is ideation survivor #4 ("Riff Seed Bank") + #5 (discovery), now designed.

**What:** When generating, `/create` also surfaces **similar models from the whole community** (not just the creator's own), so a user sees "here are related models / the prompts that made them."

**Decisions:**
- **Coexist with personal recall** — two clearly-labeled sections under the prompt field: "Your past prompts" (personal) and "Similar in the community" (global).
- **Distinct actions by source** — personal chip click = **fill the prompt** (re-use your own); community item click = **open the model** (discovery/riff, NOT prompt-copy — the Riff economy wants forking the model, not copying the prompt).
- **Mechanism** — on publish, dual-write the prompt to both the creator namespace and a shared `global` namespace; recall queries both in parallel; community results **exclude the caller's own** entries.
- **Scope-by-policy (resolves privacy, post-review 2026-06-02):** **personal namespace = ALL policies** (user's own private memory); **global namespace = exclude RESTRICTED** (PERMISSIONLESS + ALLOW_LIST in; RESTRICTED out). RESTRICTED is off-catalog/private (creator chose not to be discoverable → must not enter the shared pool); ALLOW_LIST is on-catalog/for-sale (discovery matches intent). For included policies, the prompt is **already public on-chain** (`Model3D.params_json = { prompt }`, set at `frontend/src/creator/CreateModelPage.tsx` publish), so global surfacing exposes nothing new → **no opt-in needed**. (Uploads store `{ source: 'upload' }` — no prompt — consistent with R4.)
- **Demo (exclude-self trap):** global recall excludes the viewer's own entries, so a single-presenter demo must seed the global pool from ≥2 other addresses (publish a few models from separate test wallets). Anti-pollution on testnet leans on an operator denylist, not the (free) publish fee.
- **Honest framing** — because the data is already public, global recall's MemWal value is the **semantic-discovery layer on the same Walrus infra** (the chain has no semantic search), NOT "owned/private memory." Personal recall is the private-memory half.
- **Anti-pollution (MVP)** — the **publish fee-gate is the spam cost** (every global entry required a paid, on-chain publish) + per-address rate-limit + exclude-self. Content moderation (NSFW/profanity) deferred.
- **Cold-start win** — global has the whole community, so a brand-new creator sees value immediately (covers personal recall's empty-history gap).

**Deferred:** "use this prompt" copy on community items; riff/fork shortcut from a community item; content moderation; thumbnails (none exist).
