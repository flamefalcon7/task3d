---
date: 2026-06-02
topic: memwal-integration
focus: Best ways Tusk3D could integrate MemWal (Walrus AI-agent memory SDK) as a hackathon bonus feature
mode: repo-grounded
---

# Ideation: MemWal × Tusk3D Integration

> Run 56e97719. ce-ideate → (chosen idea handed to ce-brainstorm). This is a BONUS / demo-day flourish, NOT 6/21 critical path. New dependency (`@mysten-incubation/memwal`) → an ADR is owed after brainstorm.

## Grounding Context

### Codebase Context
- `/create` (`frontend/src/creator/CreateModelPage.tsx`) holds the Tripo prompt textarea (1–1000 chars, testid `prompt-input`).
- Backend `POST /api/generate` → `backend/src/lib/tripo-client.ts` dispatches prompt → GLB. **No existing LLM/AI code anywhere** (clean slate; `@anthropic-ai/sdk` dropped per D-023).
- `shared/src/types.ts`: `LineageRecord` already stores `{ prompt, params, shape, llmDecision?(reserved/unused), createdAt }`.
- Auth: `@mysten/dapp-kit` `useCurrentAccount()` → address; `frontend/src/auth/useSession.ts`. (zkLogin/Enoki listed in stack but not in active use.)
- **No prompt history exists today.** localStorage used in a few spots (personalBest, session, model index).
- Tripo prompt-mode is SUI-fee-gated (D-034) → duplicate/wasted generations cost real money.

### MemWal facts (verified from MystenLabs/MemWal `dev` branch, 2026-06-02)
- npm `@mysten-incubation/memwal`. Architecture: SDK → Relayer (embedding + SEAL encrypt + Walrus up/down + vector search) → Sui contract (ownership/delegates) + indexer + Postgres/pgvector (1536-dim, HNSW cosine).
- **Real SDK surface** (NO `ask()` method — earlier sources were wrong):
  - `remember` / `rememberAndWait` / `rememberBulk` / `waitForRememberJob` — store (async background job).
  - `recall({ query, limit?, topK?, maxDistance? })` → `{ results: [{ text, distance, blob_id }], total }` (cosine distance, lower = closer).
  - `analyze(text)` — **ingestion**, not Q&A: LLM extracts "facts" from text, then stores them.
  - `restore(namespace, limit?)` — re-index from Walrus. `embed(text)` — get a vector. `health()`, `compatibility()`.
  - `withMemWal(model, config)` from `@mysten-incubation/memwal/ai` — **Vercel AI SDK middleware**: before generation runs `recall()` and injects matching memories as a system message; after generation optionally `analyze()` + autosaves. Knobs: `maxMemories`(5), `minRelevance`(0.3), `autoSave`(true).
- **Cost / network**: managed relayer is a free public good (server wallet covers Walrus storage fees + sponsors gas; runs embeddings). Mainnet `https://relayer.memwal.ai`; **testnet `https://relayer.staging.memwal.ai`**. `suiNetwork` config **defaults to `mainnet` — must set `"testnet"` explicitly** + testnet `packageId`.
- **Caveats**: managed relayer is beta, **no SLA, beta usage limits may apply** (demo-day reliability risk). SDK runs relayer version-compatibility gate (`MemWalCompatibilityError`) → pin versions.
- Auth uses an Ed25519 **delegate key** + `accountId` (a `MemWalAccount` object, one per Sui address). Per-user setup = `createAccount` (owner tx) + `generateDelegateKey` + `addDelegateKey` (owner tx) = **2 wallet txs + a client-side secret** before memory works. For demo: pre-bake account + delegate key (à la `VITE_TEST_WALLET`).

### Decisions taken during ideation
- **Conversational LLM = Gemini API** (`@ai-sdk/google`), not local-on-VM (eliminates local-model quality risk). Demo uses cheap API; local/VM is a post-hackathon cost optimization.
- **L2 uses `withMemWal(google(...))`** rather than a hand-rolled agent loop.

## Topic Axes
- A. Creation-time copilot (prompt crafting at /create)
- B. Personal creative memory (own prompts/style across sessions)
- C. Shared / social memory (opt-in permissioned sharing)
- D. Lineage & provenance memory (riff/derivation, verifiable)
- E. Discovery & recommendation (semantic recall over corpus) — *deliberate gap: candidates were weak "vector-DB-over-public-data" fits; folded into B/C as sub-features.*

## Chosen direction (→ ce-brainstorm)

**"Riff Copilot", nested in three layers so risk is contained:**

| Layer | Content | Survivors | Verdict |
|---|---|---|---|
| **L0 memory plumbing** | `remember()` on generate/mint (prompt + style tags + model id); `recall()`/`restore()` on `/create` mount | #1 | Solid, ~half day |
| **L1 recall UI + dup guard** | debounced `recall()` "your similar prompts" chips; pre-paid `recall({ maxDistance })` déjà-vu guard | #1 + #2 | Solid, ~1 day |
| **L2 conversational synthesis** | `withMemWal(google("gemini-..."))` + a system prompt: ask 2–3 clarifying turns, skip what memory already knows, emit a Tripo prompt | #3 | Stretch — residual risk lives here |

- **6/21 deliverable = L0 + L1** (zero of the L2 risks; testnet; free).
- **Demo-day (7/20) upgrade = L2** (the "agent that remembers you" wow; failure does not block submission).
- **Demo hero shot**: returning creator opens `/create` → copilot says "welcome back — you made three low-poly vehicles last time; want a flying one?" → user: "yeah, sci-fi" → copilot skips known questions, synthesizes the Tripo prompt → preview. Proves cross-session memory + semantic recall + agent behavior in one shot.

### Residual risks (manage post-build, not blockers)
1. **L2 LLM→Tripo chaining quality** — two stochastic systems compound; tuning the synthesized prompt to produce a good GLB burns SUI each iteration. **Top remaining risk.**
2. **Cold-start** — the "remembers you" magic only exists for accounts with history → demo needs a seeded account (staged, be honest about it).
3. **Live-demo reliability** — beta relayer no-SLA + non-determinism → keep a pre-recorded clip for demo day; consider self-host.
4. **Delegate-key onboarding** (2 txs + browser secret) — invisible in demo via pre-baked key; real concern only for multi-user roadmap.

## Ranked Ideas

### 1. Prompt Recall & Creative Vault
**Description:** `/create` drawer — `remember()` on generate/mint, `restore()` on mount, debounced `recall()` surfaces your own semantically-similar past prompts (click to refill); also recovers drafts lost to tab-close/disconnect.
**Axis:** B
**Basis:** `direct:` grounding confirms "no prompt history today"; localStorage is device-local + non-semantic; `recall()` returns ranked `{text, distance}`.
**Rationale:** Fixes the most obvious UX gap and is the substrate every other idea builds on (L0).
**Downsides:** Foundational, not flashy on its own.
**Confidence:** 90%  **Complexity:** Low  **Status:** Explored

### 2. Déjà-Vu Guard
**Description:** Before a paid Tripo generation, `recall({ query: prompt, maxDistance: X })`; if a near-duplicate exists, show the prior thumbnail + mint link inline so the user reuses instead of re-burning SUI.
**Axis:** A
**Basis:** `direct:` Tripo is SUI-fee-gated (D-034); `recall` supports `maxDistance` client-side filtering.
**Rationale:** Makes MemWal load-bearing on every generation; sharp "save money" demo aha.
**Downsides:** Threshold tuning; false positives annoy.
**Confidence:** 85%  **Complexity:** Low–Med  **Status:** Explored

### 3. Riff Copilot (conversational synthesis)
**Description:** Conversational assistant on `/create` via `withMemWal(google("gemini-..."))` — asks a couple of clarifying questions, uses injected memory to skip what it already knows, synthesizes the Tripo prompt. The genuine "agent" answer to the "Tusk3D has no agent" tension.
**Axis:** A
**Basis:** `reasoned:` `withMemWal` middleware auto-injects recalled memory + auto-saves facts; only a system prompt + standard Vercel AI SDK loop remains.
**Rationale:** Headline demo-day wow; directly embodies the "Riff" pillar.
**Downsides:** Residual risks #1–#4 above; needs strict demo scoping.
**Confidence:** 70%  **Complexity:** Med–High  **Status:** Explored (chosen, scoped as L2 stretch)

### 4. Riff Seed Bank (opt-in shared prompt memory)
**Description:** Creators opt in at mint to push prompts into a shared MemWal corpus; anyone at `/create` can `recall("riff on vehicles")` and get prompts that shipped successful mints. Network effect.
**Axis:** C
**Basis:** `direct:` permissioned sharing is MemWal's unique differentiator; on-brand "Riff".
**Rationale:** Only idea that exercises cross-user permissioned sharing — the most judge-distinctive MemWal capability.
**Downsides:** Needs seeding/multiple accounts for a real demo; sparse data at 19 days.
**Confidence:** 60%  **Complexity:** Med  **Status:** Explored — designed 2026-06-02 as "Global Recall (community discovery)", planned as U8–U10 (layers onto the personal-recall MVP). Privacy verified clean (published prompt already public on-chain). See requirements doc "Follow-on Feature: Global Recall" + plan U8–U10.

### 5. Semantic Lineage / Drift Score
**Description:** At fork time `analyze()`/`embed()` to compute semantic distance between the new prompt and ancestor prompt(s); store a "creative drift" score in `LineageRecord.llmDecision`; render "minor remix vs creative leap" on the model page.
**Axis:** D
**Basis:** `direct:` LineageRecord has `prompt` + reserved `llmDecision`; 1-layer derivation is core.
**Rationale:** Makes 1-layer derivation a visible creative statement, not just a legal constraint.
**Downsides:** Score semantics need careful definition to avoid gimmick.
**Confidence:** 75%  **Complexity:** Med  **Status:** Unexplored (good 2nd feature)

### 6. Creator DNA Card
**Description:** Summarize a creator's corpus (dominant style, most-riffed model, avg iterations) into a "Creator DNA" card on profile/collection pages; updates as they mint.
**Axis:** B/E
**Basis:** `external:` Spotify Wrapped / GitHub readme-stats identity artifacts.
**Rationale:** Turns memory synthesis into a visible demo moment; adds style-based creator discovery on-chain data can't.
**Downsides:** Presentational; judges may say the LLM summary is the main work.
**Confidence:** 80%  **Complexity:** Low–Med  **Status:** Unexplored (cheap polish)

### 7. Memory-as-Tradeable-Asset
**Description:** Creator's memory corpus as a SEAL-encrypted, priceable asset — buyers purchase read-access to "creative process memory" gated by the same AccessEntitlement pattern. "Sell the methodology, not just the model."
**Axis:** D / reframe
**Basis:** `reasoned:` MemWal SEAL integration + existing access_fee/AccessEntitlement template.
**Rationale:** Strongest alignment with the composable-creator-economy thesis; extends the economy into the cognitive layer.
**Downsides:** New contract + depends on MemWal beta SEAL maturity → not feasible in 19 days.
**Confidence:** 40%  **Complexity:** High  **Status:** Unexplored (north-star / pitch-deck roadmap only)

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | Pure semantic catalog search / "describe to find" / personalized market sort | Weak fit — vector-DB over already-public on-chain data (judges see through it); overlaps existing browse → folded into #4/#6 as sub-feature |
| 2 | Restore in-flight Tripo job | Good but pure plumbing → folded into #1 (L0) |
| 3 | "Model remembers being made" composite blob | Uses Walrus more than MemWal → covered by #1/#5 |
| 4 | Mendelian trait inheritance / Prompt Blame diff | Client-side diff, MemWal thin → visual folds into #5 |
| 5 | Mint-regret / auto-mutation behavioral loops | Needs implicit-signal instrumentation, scope risk → folded into #3 |
| 6 | Trending / Hive Muse / Vibes Cluster / "Carved It" gallery | Duplicate variants of #4 |
| - | axis: E (discovery) | Deliberate gap — only weak vector-DB-over-public-data candidates surfaced; folded into B/C |
