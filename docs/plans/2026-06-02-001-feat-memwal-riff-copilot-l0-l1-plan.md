---
status: active
date: 2026-06-02
type: feat
title: "feat: MemWal Riff Copilot — creation-recall memory on /create"
origin: docs/brainstorms/2026-06-02-memwal-riff-copilot-requirements.md
decision: D-080
revised: 2026-06-02
---

# feat: MemWal Riff Copilot — Creation-Recall Memory on /create

> Revised after ce-doc-review (5 personas). The feature is reframed from a "save-SUI déjà-vu guard" to a **recall assistant for your past creations**; the pre-payment déjà-vu card is dropped (folded into recall chips). Review findings folded into units below.

## Summary

Add a fail-soft memory layer to `/create` backed by MemWal (Walrus agent-memory SDK). When a creator **publishes** a Tripo model, its prompt + model id is stored to MemWal via a thin **backend proxy** (delegate key stays server-side; namespace = the JWT's wallet address). On return, the creator's own semantically-similar **past published prompts** appear as clickable chips below the prompt field (a very strong match is highlighted), and — in a second labeled section — **similar models from the whole community** (global recall) appear with an "open model" action. No pre-payment interception; no SUI-saving claim. L2 conversational copilot and Upload Captioning remain out of scope.

---

## Problem Frame

`/create` is stateless — a returning creator faces a blank textarea with no trace of what they previously made, and no way to jump back to or riff on a past creation. For the hackathon the audience is the demo/judges, so the value must be visible in one session and must be a genuine, on-narrative use of a Walrus-ecosystem product (D-080). MemWal supplies cross-session, semantic, Walrus-backed memory. See origin: `docs/brainstorms/2026-06-02-memwal-riff-copilot-requirements.md`.

*(Reframe note: an earlier framing pitched this as a pre-payment "save SUI on near-duplicate generations" guard. ce-doc-review showed that mechanism can't reach the SUI-wasting case — SUI is spent at `generate`, but memory is curated at `publish` — so that claim is dropped. The honest value is recall of your past creations, not intra-session fee savings.)*

---

## Requirements Traceability

Implements R1–R7, R10–R12 from the origin (R8/R9 — the déjà-vu guard — are folded into recall per the reframe; see Scope Boundaries). Mapping: R1 → U5, U8 (capture on publish; U8 dual-writes non-RESTRICTED to the global namespace); R2 → U2 (model-ref encoding, `{ m, c }` trailer); R3 → U3, U4 (mount recall; `restore()` deferred); R4 → U5 (Tripo-only gate); R5/R6/R7 → U4, U6 (recall chips, own-namespace only); R10 (fail-soft) → U1, U3, U4 (with the namespace-binding exception in U3); R11 → U1, U3; R12 → U1.

---

## Key Technical Decisions

- **Recall-assistant framing, not a déjà-vu guard.** Memory = your *published* creations; the surface is recall chips, not a pre-payment interceptor. This drops the messiest integration (an interruptible seam inside the linear, charge-safety-ordered `onGenerate`) flagged by review.
- **`remember()` on publish/mint success.** Memory stays curated (only deliberate, published creations — no junk from throwaway intermediate generations) and the on-chain model id is available for clean `/model/:id` links. `remember()` is sponsored by the managed relayer (no user gas).
- **Backend proxy, not browser-direct.** The MemWal delegate key acts across ALL namespaces of the account, so it must never reach the browser. SDK runs in backend Node; frontend calls JWT-authed `/api/memory/*`; `namespace` is derived server-side from the verified token address.
- **Namespace binding is NOT fail-soft (review P1).** Fail-soft applies only to the MemWal network call. A missing/invalid JWT or a namespace that does not exactly match the verified token address → hard **401**, never a silent empty result (prevents a derivation bug from silently crossing user boundaries).
- **Model reference = escaped delimited trailer (U2).** Appended to the stored prompt text; the delimiter is escaped on write so a prompt containing it cannot corrupt parsing. Side-lookup (`blob_id → modelId`) was considered but rejected — it needs backend persistence we don't have; the trailer is self-contained. Trailer stays tiny (negligible embedding impact, asserted by test).
- **No thumbnail (review P1).** No model-card thumbnail mechanism exists (`ModelCard` is a placeholder; real rendering needs `useModelById` + Babylon). Chips are prompt text + a plain `/model/:id` link. A thumbnail is out of scope.
- **Skip `restore()` for MVP.** Managed relayer keeps the index server-side; `recall()` is called directly on mount. `restore()` is deferred — but the SDK assumption (recall is server-indexed, not local) is verified in the U1 spike.
- **Operator-visible health signal (review P1).** Because fail-soft makes "relayer down" and "genuinely empty namespace" look identical, a dev-only signal distinguishes error-empty from true-empty so a dead relayer doesn't silently demo as a working-but-empty feature.
- **Pinned SDK version (R12).** `@mysten-incubation/memwal` pinned to the exact version proven in the U1 spike; recorded in D-080.
- **Global recall coexists with personal recall (new).** On publish the prompt is **dual-written**: always to the creator's personal namespace, and — **only when policy ≠ RESTRICTED** — also to a shared `global` namespace. `/create` shows two labeled sections: "your past prompts" (personal; click = fill prompt) and "from the community" (global; click = open the model in a new tab — discovery, NOT prompt-copy). Distinct actions by design.
  - **Scope-by-policy (resolves the privacy finding):** **personal = ALL policies** (the user's own private namespace — only they recall it). **Global = exclude RESTRICTED** (PERMISSIONLESS + ALLOW_LIST in; RESTRICTED out). Rationale: RESTRICTED is off-catalog/private — the creator chose not to be discoverable, so it must not enter the shared pool; ALLOW_LIST is on-catalog/for-sale — discovery matches the creator's intent. The prompt is already public on-chain (`Model3D.params_json = {prompt}`), so for the included policies global surfacing exposes nothing new — **no opt-in needed**.
  - **Anti-pollution:** exclude-self + address-keyed rate-limit + an operator **denylist** break-glass. The publish fee-gate is a weak deterrent on **testnet** (test SUI is free), so the denylist — not the fee — is the real lever for the demo window.
  - **Cold-start win:** global has the whole community, so even a brand-new creator sees value immediately — but only if the global pool contains entries authored by **addresses other than the viewer** (see U7 demo seeding + the exclude-self trap).

---

## High-Level Technical Design

*Directional guidance for review, not implementation specification.*

```
Frontend (/create)                Backend (Hono)                 MemWal managed relayer (testnet)
publish success ──rememberCreation──▶ POST /api/memory/remember ──▶ memwal.remember(encode(prompt,modelId), ns=addr)
   (extract modelId from objectChanges)  (jwt→addr=ns; 401 if unbound)   (sponsored background job)

prompt focus/type ─(debounced)──────▶ POST /api/memory/recall ─────▶ memwal.recall({query, ns=addr})
   ◀── chips [{prompt,modelId}] ◀──── parse trailer, strip ◀──────────  {results:[{text,distance,blob_id}]}
       (strong match highlighted)
```

Recall is fail-soft (error → empty → no chips). Namespace binding is NOT (unbound → 401).

---

## Implementation Units

### U1. Backend MemWal client wrapper + config (spike-first)

**Goal:** A verified, fail-soft MemWal client for the backend, testnet-configured, SDK version pinned.
**Requirements:** R10, R11, R12.
**Dependencies:** none.
**Files:** `backend/src/lib/memwal-client.ts`, `backend/src/lib/memwal-client.test.ts`, `backend/.env.example`, `backend/package.json`.
**Execution note:** Start with a spike before writing the wrapper — `@mysten-incubation/memwal` is not yet installed and its ESM+wasm behavior in this `NodeNext` backend is unverified.
**Approach:** Spike: install at an exact version, write a throwaway `tsx` script that constructs the client (`suiNetwork:"testnet"`, staging relayer, baked key/accountId) and round-trips one `remember`/`recall`; confirm ESM import, wasm load in plain Node, the version-compatibility gate against staging, **and that `recall()` reads the server-side index (not a local DB)**. **Also write 2+ records to a shared `global` namespace and confirm independent, multi-record ranked recall works — this gates U8 (the shared-namespace usage profile is unverified).** Record the working version in D-080. Then build a lazy singleton from `process.env` (mirror `backend/src/sui/client.ts`). Wrap `remember(namespace, text)` (fire-and-forget, never throws) and `recall(namespace, query, opts)` (returns `[]` on failure) with a ~2s timeout + try/catch. Missing env → no-op stub (logs once). Expose a way for callers to distinguish "error" from "empty" (for the health signal) without surfacing errors to clients.
**Patterns to follow:** `backend/src/sui/client.ts`.
**Test scenarios:**
- Missing env → no-op stub; `recall` → `[]`, `remember` resolves.
- `recall` rejects / times out → `[]` within budget (error flag set internally).
- `remember` rejects → resolves (fire-and-forget).
- Config asserts `suiNetwork:"testnet"` + staging relayer when env unset.
- `package.json` pins `@mysten-incubation/memwal` to an exact version (no range/wildcard).
**Verification:** Spike round-trips against staging; unit tests pass; wrapper inert+silent with env unset.

### U2. Shared memory-record encode/parse helper

**Goal:** Encode `prompt + modelId` into one MemWal text record and parse it back, collision-safe.
**Requirements:** R2.
**Dependencies:** none.
**Files:** `shared/src/memory.ts`, `shared/src/memory.test.ts`.
**Approach:** `encodeMemory(prompt, ref)` = prompt + an escaped record-separator-delimited trailer `{ m: modelId }`. **Escape any occurrence of the delimiter in the prompt on write** so a prompt containing it cannot break parsing. `parseMemory(text)` returns `{ prompt, ref }`, tolerant of no-trailer records (`ref: null`). Keep the trailer tiny.
**Patterns to follow:** `shared/src/types.ts` (pure module).
**Test scenarios:**
- Round-trip returns original prompt + ref.
- Plain text, no trailer → `{ prompt, ref: null }`.
- **Prompt that contains the delimiter byte → round-trips intact (escaping works).**
- A ~1000-char prompt + trailer parses correctly; trailer is a small fraction of length.
**Verification:** Unit tests pass including the delimiter-in-prompt case.

### U3. Backend /api/memory route (recall + remember)

**Goal:** JWT-authed proxy scoped to the caller's address; fail-soft on the network call, hard-fail on auth/namespace.
**Requirements:** R1, R3, R4, R7, R10, R11.
**Dependencies:** U1, U2.
**Files:** `backend/src/routes/memory.ts`, `backend/src/app.ts` (mount), `backend/src/routes/memory.test.ts`.
**Approach:** `buildMemoryRoute({ jwt })` mirroring `backend/src/routes/collection.ts`. Verify JWT → `sub` (a 0x address) → `namespace`. **Validate the namespace is a well-formed Sui address; missing/invalid JWT or malformed namespace → 401 (never fail-soft).** `POST /remember` `{ prompt, modelId }` → `encodeMemory` → `memwalClient.remember` fire-and-forget → 202. `POST /recall` `{ query, limit? }` → `memwalClient.recall` → `parseMemory` → `[{ prompt, modelId, distance }]`; on MemWal failure → 200 + `[]`. **Per-address rate-limit** both endpoints (reuse the existing nonce/in-memory counter style) to protect the shared sponsored account from a single user's abuse.
**Patterns to follow:** `backend/src/routes/collection.ts`, `backend/src/routes/auth.ts` (`deps.jwt.verifySession(token).sub`), zod body validation as in `/api/generate`.
**Test scenarios:**
- Valid JWT → namespace = token address; any client-supplied namespace ignored (R7).
- Missing/invalid JWT → 401, no MemWal call.
- Malformed/empty derived namespace → 401 (NOT empty 200).
- `POST /remember` returns immediately without awaiting the job.
- MemWal client throws → `/recall` returns 200+`[]`; `/remember` returns 2xx (R10).
- Rate-limit: same address exceeding the bucket → 429.
- Malformed body → 400 before any MemWal call.
**Verification:** Route tests pass; no 5xx on relayer failure; 401 on unbound namespace; curl with a test JWT returns scoped results.

### U4. Frontend memory hook (recall + remember)

**Goal:** A thin, fail-soft, debounced recall client; auth-guarded.
**Requirements:** R5, R6, R10.
**Dependencies:** U3.
**Files:** `frontend/src/creator/useCreatorMemory.ts`, `frontend/src/creator/useCreatorMemory.test.ts`.
**Approach:** Reuse `frontend/src/lib/api.ts` authed-fetch. Expose `rememberCreation({ prompt, modelId })` (fire-and-forget) and `recallSimilar(query)` (debounced ~300ms, stale-while-revalidate). No-op/empty when no account, expired JWT (`isJwtExpired`), or any network error. Never throws.
**Patterns to follow:** `frontend/src/lib/api.ts`, `frontend/src/auth/useSession.ts`.
**Test scenarios:**
- No account / expired JWT → no fetch, empty return.
- `recallSimilar` debounces rapid calls (trailing only).
- fetch rejects / non-200 → `[]`, no throw (R10).
- stale-while-revalidate: prior chips remain until the new result resolves.
**Verification:** Hook tests pass; silent+empty with backend down.

### U5. Wire remember-on-publish + extract model id (L0 capture)

**Goal:** On publish success, extract the new `Model3D` object id and fire `rememberCreation`; Tripo-only.
**Requirements:** R1, R4.
**Dependencies:** U4.
**Files:** `frontend/src/creator/CreateModelPage.tsx` (mint/publish success handler).
**Approach:** The current `onMint` captures only the tx digest. **Add object-changes extraction** (request `objectChanges`/`showObjectChanges`, filter the created `model3d::Model3D` type) using the existing pattern in `frontend/src/buy/ModelDetailPage.tsx` (reads created object off `objectChanges` to dodge indexer lag) / `LaunchCollectionPage`'s `fetchObjectChanges`. Thread the resulting `modelId` + `prompt` **+ the model's `policy`** into `rememberCreation` fire-and-forget — the backend (U8) uses `policy` to gate the global dual-write (RESTRICTED → personal only). Gate on `sourceMode === 'tripo'` (R4). Must not block navigation or add a wallet popup.
**Patterns to follow:** `frontend/src/buy/ModelDetailPage.tsx` (objectChanges extraction), `sourceMode` discriminator in `CreateModelPage.tsx`.
**Test scenarios:**
- Tripo publish success → `modelId` extracted from objectChanges; `rememberCreation` called once with prompt+modelId (R1).
- Upload publish success → `rememberCreation` NOT called (R4).
- `rememberCreation` rejection does not affect publish-success UX (R10).
- objectChanges missing the Model3D type → no throw; remember skipped (degrade, not crash).
**Verification:** Browser-verified — publishing a Tripo model captures the right model id (inspected via mocked hook); uploads do not.

### U6. Recall chips UI (L1)

**Goal:** Surface the creator's similar past published prompts as chips below the textarea; highlight a very strong match.
**Requirements:** R5, R6, R7.
**Dependencies:** U4.
**Files:** `frontend/src/creator/PromptMemoryChips.tsx`, `frontend/src/creator/PromptMemoryChips.test.tsx`, `frontend/src/creator/CreateModelPage.tsx` (integrate).
**Approach:** Tripo mode only. On focus/typing, debounced `recallSimilar(prompt)` → render up to **N=5** chips; cap at N (no overflow control — truncate). Each chip = prompt text (truncated) + a small `Link to={/model/:modelId}` "open". **A chip whose distance is below a strong-match threshold is visually highlighted** ("you've made something very similar"). **Chip click behavior:** if the textarea is empty, set the prompt; if it has text, **prompt-confirm before replacing** (avoid destroying typed input — review P1). States: initial (no chip row until first recall), in-flight (stale-while-revalidate — keep prior chips), empty/cold-start (no row), error (no row). Accessibility: chips are `<button>`s in DOM order with a visible focus ring; chip row uses `aria-live="polite"`. Responsive: row wraps to max 2 lines then truncates. Motion gated on `prefers-reduced-motion`. Stable testids `memory-chip`, `memory-chip-strong`.
**Patterns to follow:** `frontend/src/ux/tokens.ts` (card, buttonOutline), existing testid conventions (`prompt-input`).
**Test scenarios:**
- Chips render only in Tripo mode; click on empty textarea sets prompt (R5/R6).
- Click with existing text → confirm before replace.
- Strong match (distance < threshold) → highlighted variant.
- Cold start / empty recall → no row; textarea behaves normally.
- In-flight re-query keeps prior chips (stale-while-revalidate).
- Recall failure → no row, generate unaffected (R10).
- A recalled modelId that no longer resolves → chip renders without a broken link.
- Keyboard: chips reachable via Tab, activatable via Enter/Space.
**Verification:** Browser-verified — chips appear for a seeded account, strong match highlighted, click-to-fill works, keyboard-navigable; with backend disabled, `/create` unchanged.

### U7. Demo-seeding script (tested)

**Goal:** A repeatable, tested way to seed a wallet namespace with prior creations through the real path, so chips show value on demo day.
**Requirements:** supports Success Criteria (demo legibility).
**Dependencies:** U2, U3.
**Files:** `backend/scripts/seed-memory.ts` (or a test-fixture helper), `backend/scripts/seed-memory.test.ts`.
**Approach:** Seed via the **same `/api/memory/remember` path** (same `encodeMemory` + extended `{ m, c }` trailer), then assert round-trip through `recall` + `parseMemory`. **Critical for the global demo (exclude-self trap):** the global pool must contain entries authored by **2–3 distinct non-presenter addresses** — otherwise the presenter wallet sees an empty community section (everything is excluded as self). Easiest path on testnet: actually publish a few models from 2–3 separate test wallets (so each carries a real distinct `creatorAddr`), rather than fabricating records under one address. Seed includes a mix of policies (PERMISSIONLESS/ALLOW_LIST in global; a RESTRICTED one to prove it's excluded).
**Test scenarios:**
- Seeding N records then `recall` returns them with prompts + modelIds intact.
- Seeded records use the identical `{ m, c }` trailer format as the live path.
- Global pool seeded under ≥2 distinct non-presenter addresses → the presenter wallet's global recall shows ≥3 community items (exclude-self does not empty it).
- A RESTRICTED seed does NOT appear in any global recall.
**Verification:** With the presenter wallet connected, the community section shows ≥3 items.

---

> **Global Recall (community discovery) — units below layer onto U1–U7. Personal recall (U1–U7) is must-ship; global is the immediate next layer, cuttable if time runs out.**

### U8. Backend: global dual-write + global recall

**Goal:** Mirror each published creation into a shared `global` namespace and serve community recall, excluding the caller's own entries.
**Requirements:** new (Global Recall — see origin "Global Recall" section).
**Dependencies:** U3.
**Files:** `backend/src/routes/memory.ts`, `backend/src/lib/memwal-client.ts`, `backend/src/routes/memory.test.ts`.
**Approach:** Extend `/remember` to **dual-write** (best-effort, non-atomic — both `remember()` calls are fire-and-forget; divergence is tolerated, consistent with fail-soft): the personal-namespace write (ALL policies) PLUS — **only when `policy ≠ RESTRICTED`** — a write to a fixed `global` namespace. Encode the creator into the record by extending the U2 trailer to `{ m: modelId, c: creatorAddr }`, where **`creatorAddr` = the JWT-verified `sub`** (same address that binds the personal namespace; no separate extraction). Add a global recall path (`POST /recall` with `scope: "global"`) that queries the `global` namespace and **excludes results whose trailer `c` == the caller's JWT `sub`**; a record with a **missing/unparseable `c` is dropped** (never leak unverifiable authorship, and never falsely show the caller's own). Because exclude-self filters *post-recall*, **over-fetch** (request `limit × ~4`) then trim to N so the page isn't silently short. Global recall is fail-soft. **Rate-limit is address-keyed** (from JWT `sub`) — NEW code modeled on the fixed-window shape in `backend/src/api/collections.ts`, NOT the IP-keyed limiter verbatim. Add an operator **denylist** (small in-memory set of addresses suppressed at global-recall time) as the real spam lever (testnet fee is free).
**Patterns to follow:** U3 route; U2 encode (extend trailer fields); `backend/src/api/collections.ts` fixed-window limiter shape (re-key to address).
**Test scenarios:**
- `/remember`: PERMISSIONLESS / ALLOW_LIST → writes BOTH personal and global; **RESTRICTED → personal only, never global**.
- Global recall excludes entries whose `c` == caller's JWT `sub`; entries with missing/unparseable `c` are dropped.
- Exclude-self over-fetch: a pool where the caller authored most near-matches still returns up to N community results.
- Global recall failure → 200 + `[]` (fail-soft); address-keyed rate-limit → 429.
- A denylisted address's entries are suppressed from global results.
- Trailer round-trips `{ m, c }` (extends U2 tests).
**Verification:** Route tests pass; a non-RESTRICTED model appears in another address's global recall but not its author's; a RESTRICTED model appears in neither global recall.

### U9. Frontend hook: parallel global recall

**Goal:** Add a global recall source alongside personal, both debounced and fail-soft.
**Requirements:** new (Global Recall).
**Dependencies:** U4, U8.
**Files:** `frontend/src/creator/useCreatorMemory.ts`, `frontend/src/creator/useCreatorMemory.test.ts`.
**Approach:** Add `recallCommunity(query)` that hits the global path; run it **in parallel** with `recallSimilar` off the same debounced query. Independent fail-soft (one empty/erroring doesn't affect the other).
**Test scenarios:**
- `recallCommunity` and `recallSimilar` fire from one debounced query; results are independent.
- Global error → personal still renders, and vice versa.
**Verification:** Hook tests pass; both sources resolve independently.

### U10. Frontend UI: "Similar in the community" section

**Goal:** A second labeled section under the prompt field showing community models; action = open model.
**Requirements:** new (Global Recall).
**Dependencies:** U6, U9.
**Files:** `frontend/src/creator/PromptMemoryChips.tsx` (or a sibling `CommunityRecall.tsx`), `CreateModelPage.tsx`, tests.
**Approach:** Implement the community section as a **sibling component `CommunityRecall.tsx`** (do NOT overload U6's `PromptMemoryChips` with a mode flag). Render two clearly-labeled sections, **personal first** (higher intent), then community: **"Your past prompts"** (U6, click = fill, replace-confirm) and **"From the community — tap to view"** (each item = prompt snippet + creator address truncated `0x1234…abcd` — check `frontend/src/lib` for an existing truncation util first). Community primary action = `Link to /model/:modelId` opened in a **new tab** (`target="_blank" rel="noopener"`) so a stray click never destroys the user's typed draft; the affordance reads as a link, not a fill-button (resolves the action-asymmetry/discoverability gap). Community **N=3** (smaller than personal N=5). On viewports **< 480px the community section is collapsed by default** behind a "Show community" disclosure so textarea + generate stay above the fold. Independent states (stale-while-revalidate while loading): personal-empty + community-results → community is the featured/expanded state (the cold-start win); community-empty → hide the section. a11y: each section is `role="group"` with `aria-label` matching its heading; community items carry `aria-label="View <prompt> by <addr> (opens model page)"`; keyboard order = textarea → generate → personal → community. The "use this prompt" copy action and a fork/riff shortcut are **deferred** — so community click only navigates (discovery); **do not claim global "drives forks"** in copy/pitch, it's discovery. Distinct testids `community-item`; reduced-motion as U6.
**Test scenarios:**
- Community section renders items with an open-model link; does not refill the prompt on primary click.
- New account (empty personal) still shows community results.
- Both sections fail-soft independently; with both empty, no rows and `/create` unchanged.
- Community item for an unresolvable modelId renders without a broken link.
**Verification:** Browser-verified — both sections visible, community "open" navigates to the model, personal "fill" works, new-account shows community only.

---

## Scope Boundaries

(from origin; updated by the reframe)

- **Pre-payment déjà-vu guard (origin R8/R9)** — dropped; folded into recall chips (strong-match highlight). No SUI-saving claim.
- **Thumbnails in chips/cards** — out (no thumbnail mechanism exists).
- **L2 conversational Gemini copilot** — out (stretch).
- **Upload Captioning** (GLB → Gemini vision) — out (stretch); uploaded models do not enter memory (R4).
- Creator DNA, semantic lineage drift, memory-as-tradeable-asset — out. (Cross-user/shared memory is now **IN** as Global Recall, U8–U10.)
- Content moderation of the global pool (NSFW/profanity) — deferred; the publish fee-gate + rate-limit + exclude-self are the MVP defenses.
- "Use this prompt" copy action on community items, and riff/fork shortcut from a community item — deferred.
- Real per-user MemWal account ownership — out; deployer-owned single baked account.
- Style-tag extraction, mainnet, self-hosted relayer, memory on pages other than `/create` — out.

### Deferred to Follow-Up Work

- Tune the strong-match highlight threshold empirically.
- Demo-day reliability fallback: **default to a pre-recorded clip captured against the seeded account** (live as a bonus); time-box a self-host-relayer spike decision early.

---

## Risks & Mitigations

- **Beta relayer (no SLA) + fail-soft hides failure.** Mitigation: operator-visible health signal (U1) + pre-demo smoke check + pre-recorded clip fallback.
- **JWT is HS256 (symmetric).** A `JWT_SECRET` leak lets an attacker forge any `sub` → read/write any namespace. Mitigation: treat `JWT_SECRET` confidentiality/rotation as a deployment control; namespace binding hard-fails (U3) so a derivation bug can't silently cross users. Document the blast radius.
- **Relayer sees plaintext prompts** (managed relayer, Walrus Foundation). Mitigation: acknowledge in a brief privacy note; demo prompts are non-sensitive; client-side encryption deferred.
- **Delegate-key exposure** — mitigated by backend-proxy; `.env` entry carries a "NEVER prefix with VITE_/add to frontend" comment (repo has a documented VITE_ key-confusion gotcha).
- **Cold start makes the feature invisible** — mitigated by the U7 seeding script.
- **Global pool poisoning (testnet fee is free).** The publish fee-gate does not deter spam on testnet. Mitigation: operator denylist (U8) + run the demo against the curated U7-seeded pool; consider disabling live-publish-into-global during the demo window.
- **Exclude-self empties the single-presenter demo.** Mitigation: U7 seeds global under ≥2 non-presenter addresses; verified by "community shows ≥3 items with presenter connected".
- **RESTRICTED prompt leak** — resolved by the policy gate (RESTRICTED never dual-writes to global).
- **`global` shared-namespace viability is unverified** — gated by the U1 spike; if a shared namespace doesn't behave, U8–U10 are cut (already cuttable).

---

## Verification Strategy

- Unit tests per unit as enumerated.
- **Frontend-touching → 5-reviewer roster** (ce-correctness, ce-testing, ce-api-contract, ce-adversarial, ce-julik-frontend-races).
- **Browser verification** on `/create`: chips appear for a seeded account, strong match highlighted, click-to-fill (with replace-confirm) works, keyboard-navigable; with the memory route disabled, `/create` is unchanged (fail-soft proof).
- Regression guard: existing `/api/generate`, publish, and upload flows behave identically.

---

## Deferred to Implementation

- Exact `@mysten-incubation/memwal` version (set by the U1 spike; record in D-080).
- Exact timeout/debounce/strong-match-threshold constants.
- Exact JWT→address extraction call (mirror `auth.ts`).
- Rate-limit bucket sizing.
