---
title: "feat: Third-Party AI Degradation UX (Tripo + Gemini)"
type: feat
status: active
date: 2026-06-03
deepened: 2026-06-03
origin: docs/brainstorms/2026-06-03-third-party-ai-degradation-ux-requirements.md
---

# feat: Third-Party AI Degradation UX (Tripo + Gemini)

## Summary

Wrap the two third-party AI dependencies in a degradation layer so quota/failure never surfaces as a raw 500 or a vanished feature. Tripo (user-paid): a new backend pre-flight balance endpoint blocks generation **before** the SUI fee is charged when credit is insufficient, and `generate.ts` classifies live-Tripo errors into typed JSON codes instead of bubbling a 500. Gemini (operator-paid): a `node:sqlite`-backed quota store tracks self-counted daily usage as the reliable backbone, enriched opportunistically by response/429 rate-limit headers, and both Gemini routes report an explicit "quota reached — retry ~X" state that stays visible (hiding stays reserved for the keyless/flag-off case).

---

## Problem Frame

Both paid AI APIs can run dry mid-use, and today both fail badly. `backend/src/routes/generate.ts` catches only `TripoDisabledError`; every live-Tripo error (including credit exhaustion, which arrives as a wrapped `TripoFailedError`) re-throws into a generic 500 — and because the SUI fee is charged *before* Tripo runs, a credit-dry account means the creator pays and gets a 500. Gemini's caption/copilot are fail-soft but collapse 429 into a generic transient error, and the proposed "hide when low" behavior would make a built feature disappear during evaluation. See origin for the full pain narrative and product decisions.

---

## Requirements

- R1. Pre-check Tripo availability (spendable credit ≥ one generation's cost) **before** charging the SUI fee; insufficient → block at the pay step, never charge, show a clear message.
- R2. Classify Tripo failures into human-readable messages (English UI) — never a raw 500. Distinguish at least: service-unavailable/quota, timeout, task-failed.
- R3. Residual post-payment Tripo failures (timeout / task-failed / format drift) show an honest "fee may be refundable — contact us" message; no automatic refund.
- R4. Tripo balance synced by a background poller and cached; pre-flight reads cache with a live-query fallback on empty/stale cache (no cold-start lockout).
- R5. Read Gemini remaining headroom from response rate-limit headers (incl. daily dimension) and persist latest remaining/reset; back this with a self-counted daily usage counter as the primary signal.
- R6. On Gemini quota-exhaustion / 429, the feature stays visible and shows an explicit "AI quota reached — retry ~X" message; reset time surfaced when known; never hidden for quota reasons.
- R7. Gemini feature auto-recovers once the reset time passes — no manual step.
- R8. Retain per-address rate limiting; optional per-address daily cap.
- R9. (Optional) self-imposed operator daily cost/usage budget on top of Google's limits.
- R10. A built feature is never hidden for quota/transient failure — only for genuinely-undeployed (no key / flag off).
- R11. Persist quota/usage state (Gemini daily counters + cached Tripo balance) durably so it survives restart/redeploy (single instance + volume).
- R12. Quota state + background syncing run only in the live server process, not in tests or module imports.

**Origin actors:** A1 (Creator / end user), A2 (Operator), A3 (Judge / evaluator)
**Origin flows:** F1 (Tripo generate with pre-flight, pay-gated), F2 (Gemini-backed action under quota pressure)
**Origin acceptance examples:** AE1 (covers R1), AE2 (covers R1, R4), AE3 (covers R2, R3), AE4 (covers R6, R10), AE5 (covers R6, R7), AE6 (covers R11), AE7 (covers R10)

---

## Scope Boundaries

- No automatic on-chain refund for any Tripo failure — manual/contact path only (R3).
- No IP-based rate limiting (XFF behind Vercel/CF + shared-NAT false positives).
- Tripo stays SUI-fee-gated — not made free.
- No distributed / multi-instance / serverless quota store — single instance with a volume is assumed.
- No Google Cloud Monitoring / Cloud Quotas API integration for Gemini reconciliation.
- No active "dummy probe request" to refresh Gemini quota — remaining is read off real calls + the 429 path only.
- The SUI fee amount, Tripo model choice, and per-call credit cost are not changed here.

### Deferred to Follow-Up Work

- Extracting a fully shared `bindNamespace` + limiter helper across all three JWT-authed routes (memory/copilot/caption): this plan extracts only what the Gemini quota work needs (U3); the broader dedupe stays a follow-up noted in the caption plan.
- Persisting the per-minute rate-limit windows and the `paymentVerifier` replay `Set` to SQLite: out of scope here (per-minute windows don't benefit from persistence; only daily counters + balance cache are persisted in U1).

---

## Context & Research

### Relevant Code and Patterns

- **Background poller:** `backend/src/events/integrationIndexer.ts` (`createIntegrationIndexer` factory → `{ start, stop, ... }`, idempotent `start()`, `polling` reentrancy guard, try/catch-swallow per tick) wired ONLY in the `invokedDirectly` block of `backend/src/server.ts` (not in `buildServerApp`, so test imports never poll). Mirror this exactly for the Tripo balance poller.
- **Gemini clients:** `backend/src/lib/copilot-client.ts` + `backend/src/lib/caption-client.ts` — near-identical. The `ai` SDK call is the default value of an injectable `generate` dep: `const { text } = await generateText({ model: google(model), system, messages })`. `INERT` frozen client when `!env.apiKey` (`configured:false`); `CopilotDegradedError`/`CaptionDegradedError` thrown on any failure; `withTimeout` (15s); singleton `getCopilotClient()`/`getCaptionClient()` both read `GOOGLE_GENERATIVE_AI_API_KEY`; `resetXClientForTest()`. **The header read goes inside the `generate` closure** — `GenerateFn` currently returns `Promise<string>` and must widen to carry headers/usage out (touches both clients + all test fakes).
- **Rate limiter:** `backend/src/routes/copilot.ts` L38–55 + `backend/src/routes/caption.ts` L29–46 (duplicated): module-scope `hits` Map, synchronous `rateLimited(address, now?)`, `resetXRateLimitForTest()`. Keep synchronous — `node:sqlite` `DatabaseSync` is synchronous, so the limiter call sites stay sync.
- **Tripo path:** `backend/src/lib/tripo-client.ts` (error classes `TripoAuthError`/`TripoTimeoutError`/`TripoFailedError`/`TripoFormatError`; `AbortSignal.timeout`), `backend/src/generators/tripo.ts` (two-step chain, credit-cost comments), `backend/src/routes/generate.ts` (catches ONLY `TripoDisabledError` → 400; everything else `throw err` → 500; `paymentVerifier.verify` gate runs before Tripo).
- **Frontend:** `frontend/src/creator/CreateModelPage.tsx` `onGenerate` (L797–840: pay→generate, `setGenError(msg)`, 401 regex special-case; error renders at `data-testid="gen-error"`); `frontend/src/lib/api.ts` `generate()` throws a raw string `generate: HTTP <status> <text>`; caption UI (L1220–1263, button wrapped in `{captionOn && ...}` → fully hidden when unavailable); `frontend/src/creator/useUploadCaption.ts` + `frontend/src/creator/useRiffCopilot.ts` (429 currently collapses into generic `error`; `available:false` = permanent hide).
- **Env wiring:** threaded-env style (`buildRouter(env)`, `buildJwt(env)`) for `buildApp`-wired config; `process.env.X` at module load for singletons (`getCopilotClient`, `sui/client.ts`). New `TUSK_DB_PATH` / budget / threshold envs follow the singleton style or are injected in `invokedDirectly`. Documented in `backend/.env.example`.
- **Tests:** vitest, co-located `*.test.ts`, pure factories with injected fakes, Hono `route.request(...)` (no port), `beforeEach` resets module globals via `resetXForTest()`.

### Institutional Learnings

- `docs/solutions/best-practices/cors-is-browser-only-cost-bearing-endpoints-need-server-auth-2026-05-15.md` — rate limits ride **on top of** the JWT gate, never replace it; explicitly names Tripo/LLM metered upstreams. Keep the daily budget behind the existing JWT + per-address limiter.
- `docs/solutions/best-practices/in-memory-nonce-store-needs-explicit-ttl-sweep-2026-05-15.md` — every background timer must `unref()` its handle, expose a stop seam, and run only in `server.ts`. Applies to the Tripo poller (R12).
- ADRs: D-034 (Tripo SUI-fee-gate), D-045 (two-step chain ~60cr — but see live-cost correction below), D-051 (fee bump; FE/BE divergence precedent at commit `8706036` → pin the threshold in one place), D-081 (copilot Gemini seam, backend-only key), D-082 (caption; keyless→hide is the single sanctioned hiding case = AE7). **Next free ADR is D-083** (decisions.md ends at D-082, D-083 reserved).
- `docs/ux/frontend-checklist.md` §1 (multi-reader availability state — both copilot toggle + caption button read Gemini state), §2 (async UX feedback <100ms, auto-refresh after resolve), §4 (source-of-truth drift), §5 (stale-closure on the reset-time countdown — read `.current` in the handler). This is frontend-touching → 5-reviewer roster (add `ce-julik-frontend-races-reviewer`) + full demo-arc browser-verify.

### External References

- AI SDK v6 (`ai@6.0.194`): `generateText` result exposes `result.response.headers` (`Record<string,string>|undefined`, lowercased keys) — verified in installed `ai/dist/index.d.ts` L140/L927 and `@ai-sdk/google@3.0.80` `doGenerate` (passes provider headers through). On 429 the SDK **throws** `APICallError` carrying `responseHeaders`. `result.usage` + `result.providerMetadata.google.usageMetadata` give token usage (for self-count). [AI SDK generateText reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text). **Residual risk:** presence of `x-ratelimit-remaining` on 200 responses is not guaranteed by Google — hence self-count is the primary signal (see Key Technical Decisions).
- Tripo OpenAPI: `GET https://api.tripo3d.ai/v2/openapi/user/balance`, Bearer auth, `{ code, data: { balance, frozen } }`; spendable = `balance − frozen`. `mesh_segmentation` = **80 credits** (double-sourced), `text_to_model` Turbo ~20–30 → chain ~100–110cr (repo comment's ~55cr is stale). [Tripo docs](https://docs.tripo3d.ai/get-started/introduction.html), [Tripo Python SDK](https://github.com/VAST-AI-Research/tripo-python-sdk/blob/master/docs/API.md).
- `node:sqlite`: flag-free on Node 22.13.0+ (runtime is 22.22.3), synchronous `DatabaseSync`, still labeled experimental (emits one `ExperimentalWarning`). [Node SQLite docs](https://nodejs.org/api/sqlite.html).

---

## Key Technical Decisions

- **SQLite driver = `node:sqlite`** (over `better-sqlite3`): zero dependency, flag-free on the deploy's Node 22.22.3, synchronous `DatabaseSync` (keeps the rate-limiter call sites synchronous), and — decisively — no native-addon cross-arch build risk (dev macOS arm64 → Linux x64 deploy). Cost: one suppressible `ExperimentalWarning`. (D-083)
- **Gemini primary signal = self-counted daily usage**, with response/429 headers as enrichment (over header-primary): Google does not guarantee `x-ratelimit-remaining` on 200 responses, so a header-only proactive guard might never fire. Self-count (call count, optionally token usage from `result.usage`) is fully under our control and reliable; when present, `response.headers` remaining lets us degrade earlier, and the 429 `responseHeaders`/RetryInfo reset drives the "retry ~X" message and auto-recovery cooldown.
- **The 429-derived reset is authoritative for recovery; the self-count is an abuse/overspend bound, not a mirror of Google's quota** (resolves the adversarial UTC-vs-Pacific finding). Because the self-count is only an operator-budget guard — not an attempt to track Google's exact per-day window (which resets ~Pacific and also counts project-wide usage outside this process) — the rollover clock for the self-counter does not need to match Google's; a wrong-boundary self-count at worst trips our own conservative budget a few hours early/late, while the real 429 + its reset remains the true signal. Keep the self-count rollover simple (UTC date) and treat any divergence as acceptable; do NOT try to align it to Pacific.
- **Tripo pre-flight as a backend-only endpoint** (over a shared FE/BE threshold constant): the frontend calls the endpoint and reads `{ available }`; the credit threshold lives in exactly one place (backend env), structurally avoiding the FE/BE fee-divergence bug (D-051 / commit `8706036`).
- **Pre-flight threshold is env-configured + live-verified**, default conservative (≥ ~120 spendable credits) because exact Turbo-v1.0 cost is unpublished; an implementation task diffs `balance` across one real chain to calibrate.
- **Report-don't-hide as a third frontend state**: extend the existing `{available:true, retryable}` contract with a quota sub-state (distinct error code + reset hint) rather than forking; keep `available:false` (keyless) as the only hide path (AE7).
- **Persist only durable-worthy state** (daily Gemini counters + cached Tripo balance) in SQLite; per-minute windows + `paymentVerifier` replay stay in-memory (deferred).

---

## Open Questions

### Resolve Before / During Implementation (user decision)

- [Affects R3, U6][User decision] **Contact path for refundable Tripo failures** — R3's "fee may be refundable — contact us" needs a concrete destination (support email / Discord invite / in-app form). R3 cannot be fully implemented without it; ce-work can ship a placeholder string but the real value is the user's call. (Surfaced by design-lens.)
- [Affects R8][User decision] **Per-address daily Gemini cap default** — plan recommends default-ON at a generous value (~50/day/address) for defense-in-depth; confirm the number or opt to keep it default-off.

### Resolved During Planning

- AI SDK header access: confirmed viable via `result.response.headers` + `APICallError.responseHeaders`; self-count chosen as primary because 200-header presence is unguaranteed.
- Tripo balance endpoint + shape: confirmed (`/v2/openapi/user/balance`, `balance − frozen`).
- SQLite driver: `node:sqlite` (user-confirmed).
- Gemini signal strategy: self-count + header enrichment (user-confirmed).
- Balance staleness: `BALANCE_STALE_MS ≈ 2.5× TRIPO_BALANCE_POLL_MS`; "stale" (not just "empty") triggers the live fallback (covers cold-start + dead-poller).
- Gemini self-count clock boundary: UTC date is fine — the 429 reset is authoritative for recovery; self-count is only an abuse/overspend bound (see Key Technical Decisions).
- Pre-flight TOCTOU: accepted as a snapshot guarantee with concurrency-sized threshold + U5 refundable backstop; store-side reservation deferred.

### Deferred to Implementation

- Exact spendable-credit threshold for the pre-flight: calibrate by diffing `balance` before/after one real two-step chain on the live account; set the env default from that (size for concurrency).
- Whether to also fold token usage (`result.usage.totalTokens`) into the daily counter or count calls only — decide when wiring U2 (calls-only is the simpler default).
- Exact UI copy + reset-time formatting for the quota/refundable messages — strings drafted in U6/U7; finalize during implementation.
- Whether the operator cost budget (R9) ships in v1 or stays env-defaulted-off — optional.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
TRIPO (user-paid)                          GEMINI (operator-paid)
─────────────────                          ──────────────────────
balance poller ──┐                         each generateText call
(invokedDirectly)│  writes                   │  ├─ success: read result.response.headers
                 ▼                            │  │            + result.usage  → record()
        ┌───────────────┐  reads             │  └─ 429: catch APICallError    → record reset
        │  quota-store   │◄───── pre-flight   ▼
        │ (node:sqlite)  │       endpoint   quota-store.recordGeminiUsage / getGeminiState
        │  - tripoBalance│       GET /api/    │
        │  - geminiDaily │       generate/    ▼
        │  - geminiReset │       preflight  copilot.ts / caption.ts route:
        └───────────────┘         │           guard → call client → on quota:
                 ▲                 │             { available:true, error:'quota_exhausted', retryAfterMs }
   live-query fallback ───────────┘
   (cold cache)

FRONTEND
  onGenerate: GET preflight → if !available: message, NO signAndExecute (R1)
              else pay → generate → classified error mapping (R2/R3)
  useUploadCaption / useRiffCopilot: new 'quota' status (visible + reset hint), never hide (R6/R10)
```

---

## Implementation Units

### U1. Durable quota store (`node:sqlite`)

**Goal:** A tiny synchronous persistence primitive for durable quota state: cached Tripo balance, and per-day Gemini usage counters + reset/cooldown timestamps. First persistent store in the backend.

**Requirements:** R11, R12

**Dependencies:** None

**Files:**
- Create: `backend/src/lib/quota-store.ts`
- Create: `backend/src/lib/quota-store.test.ts`

**Approach:**
- **"Capability"** = one of the two Gemini-using features, `'copilot'` or `'caption'` (a store-key discriminator, not a feature-flag/permission). Counters and cooldowns are kept independently per capability so one feature topping out doesn't degrade the other.
- Export a `buildQuotaStore({ path })` factory returning a small typed interface — e.g. `getTripoBalance()`, `setTripoBalance(spendable, syncedAt)`, `getGeminiState(capability)`, `recordGeminiUsage(capability, { now, scope })`, `setGeminiCooldown(capability, resetAt)`. Synchronous (`DatabaseSync`).
- Schema: daily counter keyed as `(capability, scope, yyyymmdd) → count` where `scope` is the literal `'global'` (operator budget, R9) OR a normalized address (per-address cap, R8) — including the `scope` dimension from the start means R8 needs no later schema migration (review: scope-guardian). A singleton-ish row holds the cached Tripo balance (`spendable`, `syncedAt`); `geminiReset`/cooldown is tracked per capability. Daily rollover keyed on the date; see Key Technical Decisions for which clock boundary is authoritative.
- Default DB path from `TUSK_DB_PATH` env with a sensible local default; `:memory:` supported for tests. Open lazily / via the factory — never at module top-level import (R12). Suppress or accept the single `ExperimentalWarning`. Wrap DB open/schema-init in try/catch: log server-side, never let a raw DB error (which can carry the filesystem path) reach a client response (review: security).
- Provide `getQuotaStore()` singleton + `resetQuotaStoreForTest()` mirroring the `getCopilotClient`/`resetCopilotClientForTest` convention, but the factory (injectable path) is the primary seam tests use. **Single-connection invariant:** within the live process there is exactly ONE store instance — `server.ts` injects `getQuotaStore()` into the poller (U4), and the Gemini clients (U2) + routes (U3) + pre-flight (U4) all resolve that same singleton. Do not let any caller `buildQuotaStore` a second handle on the same file (review: feasibility — poller-vs-route handle split).

**Execution note:** Test-first — write the store contract tests against an in-memory DB before implementing.

**Patterns to follow:** singleton + `resetXForTest` seam in `backend/src/lib/copilot-client.ts`; injected-deps factory style in `backend/src/events/integrationIndexer.ts`.

**Test scenarios:**
- Happy path: `setTripoBalance` then `getTripoBalance` returns the value + `syncedAt`.
- Happy path: `recordGeminiUsage` increments the per-capability daily counter; `getGeminiState` reflects the count.
- Edge case: daily rollover — usage recorded "yesterday" does not count toward today's counter (inject `now`).
- Edge case: distinct capabilities (`copilot` vs `caption`) keep independent counters.
- Edge case: `setGeminiCooldown`/reset round-trips; expired cooldown reads as not-in-cooldown (inject `now`).
- Edge case: empty/cold store returns null/zero sentinels, not a throw.
- Integration: a fresh store on a real temp-file DB persists across a re-open (close + `buildQuotaStore` same path) — proves durability (AE6).

**Verification:** Store unit tests pass against both `:memory:` and a temp-file DB; re-opening a temp-file DB returns previously written values.

---

### U2. Gemini quota guard + header/usage capture

**Goal:** A shared module that decides whether a Gemini call may proceed (daily budget + active cooldown), records the outcome (self-count + opportunistic header remaining + 429 reset), and exposes the current state for routes. Widen the client `generate` seam to carry headers/usage out.

**Requirements:** R5, R6, R7, R9, R11

**Dependencies:** U1

**Files:**
- Create: `backend/src/lib/gemini-quota.ts`
- Create: `backend/src/lib/gemini-quota.test.ts`
- Modify: `backend/src/lib/copilot-client.ts`
- Modify: `backend/src/lib/caption-client.ts`
- Modify: `backend/src/lib/copilot-client.test.ts`
- Modify: `backend/src/lib/caption-client.test.ts`

**Approach:**
- `gemini-quota.ts`: `checkBudget(capability, store, { now })` → `{ ok } | { ok:false, reason:'quota_exhausted', retryAfterMs }` reading the store's daily counter (vs an env budget, default generous/off) and any active cooldown. `recordSuccess(capability, store, { headers, usage, now })` → increments the counter, parses `x-ratelimit-remaining`/`x-ratelimit-reset` when present to enrich state. `recordRateLimited(capability, store, { headers/error, now })` → extracts reset/retry-after (from `x-ratelimit-reset` or `APICallError` RetryInfo) and sets a cooldown.
- Widen `GenerateFn`/`CaptionGenerateFn` to return `{ text, headers?, usage? }` instead of `Promise<string>`; update the default closures to `const { text, response, usage } = await generateText(...)` and return `{ text, headers: response?.headers, usage }`. **This also changes the `turn`/`caption` bodies** — the value previously treated as a string (`raw.trim()`, empty-check) is now an object, so adapt those call sites in BOTH clients, not just the type. Update all injected test fakes (they currently return a bare string). **Definition of done: `tsc` compiles clean across both client files + both client test files before U2 is complete** (review: feasibility, scope-guardian).
- **Capture the 429 INSIDE the generate closure, not the outer catch** (review: adversarial — real bug). `withTimeout` (15s) wraps the model call in the outer `turn`/`caption` body; a throttled Gemini can return its 429 *slower* than 15s, so the outer catch would see a plain `timeout` error and `recordRateLimited` would never fire — silently degrading R6/R7 to generic-retryable exactly under quota pressure. The closure (where the raw `APICallError`/headers are in scope) is the only place that reliably sees the rate-limit signal, mirroring why the header read also lives there. So: in the closure, on success call `recordSuccess`; on a caught `APICallError`/429 shape call `recordRateLimited` then rethrow. The client's outer body still maps any failure to the existing `*DegradedError`; the *route* (U3) decides the response code.
- The quota store is the shared `getQuotaStore()` singleton (U1 single-connection invariant), injected as a new optional client dep defaulting to that singleton, kept out of test-import side effects.
- Env: `GEMINI_DAILY_BUDGET` (default high/off so nothing changes unless configured). Keep `GOOGLE_GENERATIVE_AI_API_KEY` server-only (D-081) — never `VITE_`-prefixed.

**Execution note:** Test-first for `gemini-quota.ts`; characterize the existing client `generate` contract before widening the type so the refactor doesn't change current behavior.

**Technical design:** *(directional)*
```
generate closure (raw APICallError + headers in scope, BEFORE withTimeout can mask):
  try { {text,response,usage} = await generateText(...) ; recordSuccess(cap,store,{headers:response?.headers,usage}) ; return {text,headers,usage} }
  catch e: if isRateLimited(e) recordRateLimited(cap, store, { error:e }) ; throw e

client.turn/caption():
  if checkBudget(cap, store).ok === false → throw DegradedError   // route maps to quota state
  try { {text} = await withTimeout(generate(...), 15s) ; return text }
  catch e: logError(...) ; throw new DegradedError()
```

**Patterns to follow:** the `generate` injectable seam + `withTimeout` + `INERT`/`configured` pattern already in `copilot-client.ts`; singleton/reset seam from U1.

**Test scenarios:**
- Happy path: `checkBudget` returns ok when under budget and no cooldown.
- Error path: `checkBudget` returns `quota_exhausted` + `retryAfterMs` when the daily counter ≥ budget OR a cooldown is active (inject `now`).
- Happy path: `recordSuccess` increments the counter; with an `x-ratelimit-remaining: 0` header it additionally trips early-degrade state.
- Error path: `recordRateLimited` reads `x-ratelimit-reset` / `APICallError` RetryInfo and sets a cooldown that `checkBudget` then honors.
- Edge case: missing headers (the unguaranteed-200 case) — `recordSuccess` still increments the self-count and does not throw.
- Integration (client): a fake `generate` returning `{text}` with no headers still flows through `recordSuccess`; a fake that throws a 429-shaped error triggers `recordRateLimited` then `CopilotDegradedError`/`CaptionDegradedError`.
- Regression: existing copilot/caption client tests still pass after the `GenerateFn` widening (update fakes to return `{text}`).

**Verification:** `gemini-quota` tests pass; both client test suites pass with the widened seam; a 429-shaped failure records a cooldown that suppresses the next `checkBudget`.

---

### U3. Gemini route quota contract (copilot + caption)

**Goal:** Both Gemini routes pre-check the budget/cooldown and return a distinct, machine-readable quota signal (with reset hint) instead of collapsing quota into the generic transient error — while keeping `available:false` reserved for the keyless case.

**Requirements:** R6, R8, R10

**Dependencies:** U2

**Files:**
- Modify: `backend/src/routes/copilot.ts`
- Modify: `backend/src/routes/caption.ts`
- Modify: `backend/src/routes/copilot.test.ts`
- Modify: `backend/src/routes/caption.test.ts`

**Approach:**
- The route resolves the store via the same `getQuotaStore()` singleton the client uses (U1 invariant), so the route's `checkBudget` and the client's `recordSuccess`/`recordRateLimited` observe one counter.
- Before the client call, run `checkBudget`; if exhausted, return `{ available: true, error: 'quota_exhausted', retryAfterMs }` (+ keep the `x-*-degraded` header) — NOT `available:false` (which means hide). The existing per-address `rateLimited()` per-minute path stays as-is (synchronous, in-memory).
- When the client throws after a recorded 429, surface the same `quota_exhausted` + `retryAfterMs` shape (read from the store) rather than the generic `{ available:true, error:'unavailable', retryable:true }`. Generic transient (timeout, model hiccup) still returns the existing retryable shape.
- Keep `available:false` ONLY for `!client.configured` (no key) — the one sanctioned hide (AE7).
- R8 per-address daily cap uses the U1 store `scope = address` dimension (no schema migration needed). **Recommended default-ON with a generous cap** (e.g. `GEMINI_PER_ADDRESS_DAILY` default ~50/day/address) as defense-in-depth against the multi-wallet budget-bypass vector (review: security — per-address per-minute limiter is trivially reset by churning cheap zkLogin wallets; the global `GEMINI_DAILY_BUDGET` backstop needs calibration, the per-address cap does not). Final default value is an Open Question.
- Extract the minimal shared piece the two routes now duplicate for the quota response shaping into a small helper (not the full `bindNamespace` extraction — that's deferred).

**Patterns to follow:** existing degraded-response branches + `x-copilot-degraded`/`x-caption-degraded` headers in `backend/src/routes/copilot.ts` / `caption.ts`; route-test injection via `fakeCopilot`/`fakeCaption` + `route.request`.

**Test scenarios:**
- Covers AE4. Budget exhausted → route returns `{ available:true, error:'quota_exhausted', retryAfterMs }`, status 200, `x-*-degraded` set, NOT `available:false`.
- Covers AE7. `!configured` (no key) → `{ available:false }` (the only hide path) — unchanged.
- Error path: client throws after a recorded 429 → route returns `quota_exhausted` + `retryAfterMs`, not the generic retryable shape.
- Happy path: under budget, configured → normal `{ available:true, result/caption }`.
- Edge case (R8, when enabled): N+1th call from one address in a day → `quota_exhausted`; a different address still succeeds.
- Regression: existing per-minute `rateLimited` 429 behavior + `resetXRateLimitForTest` still pass.

**Verification:** Both route suites pass; quota-exhaustion is distinguishable from keyless and from generic-transient in the response body.

---

### U4. Tripo balance poller + pre-flight endpoint

**Goal:** A background poller that syncs spendable Tripo balance into the store (mirroring `IntegrationIndexer`), a `tripo-client.getBalance()` method, and a lightweight pre-flight endpoint the frontend calls before paying.

**Requirements:** R1, R4, R12

**Dependencies:** U1

**Files:**
- Create: `backend/src/events/tripoBalancePoller.ts`
- Create: `backend/src/events/tripoBalancePoller.test.ts`
- Modify: `backend/src/lib/tripo-client.ts`
- Modify: `backend/src/lib/tripo-client.test.ts`
- Create: `backend/src/routes/preflight.ts` (or add a route to the generate route group)
- Create: `backend/src/routes/preflight.test.ts`
- Modify: `backend/src/server.ts`
- Modify: `backend/src/app.ts`

- `tripo-client.getBalance()`: `GET /v2/openapi/user/balance`, Bearer; parse `{ data: { balance, frozen } }`; return spendable = `balance − frozen`. Reuse the existing `AbortSignal.timeout` + error-class conventions (401 → `TripoAuthError`, non-ok → `TripoFailedError`).
- `createTripoBalancePoller({ client, store, pollMs })` → `{ start, stop }`; `start()` idempotent, fires one immediate poll then `setInterval`; reentrancy + try/catch-swallow per tick; writes spendable + `syncedAt` to the store (the shared `getQuotaStore()` singleton — U1 invariant). Constructed + started ONLY in the `invokedDirectly` block of `server.ts` (R12); a no-op default keeps tests clean. **`unref()` the interval handle immediately after `setInterval` — do NOT mirror `integrationIndexer.ts` verbatim here; it omits `unref()`, which would hold the event loop open and block clean exit / SQLite-lock handoff to a replacement process** (review: scope-guardian, security — direct contradiction in the original draft between "mirror exactly" and the unref learning).
- **Staleness TTL is load-bearing and explicit** (review: adversarial — the original "empty/stale" fallback only handled empty). Define `BALANCE_STALE_MS = ~2.5 × TRIPO_BALANCE_POLL_MS`. The pre-flight treats a cached value older than `BALANCE_STALE_MS` as **stale**, not just a missing value, and forces the live-query path. This single mechanism covers cold start AND a silently-dead poller (the indexer pattern swallows tick errors, so a durably-down balance API would otherwise leave a confidently-wrong fresh-looking cache forever).
- Pre-flight route `GET /api/generate/preflight` (JWT-gated, mirrors generate's auth; **apply the same per-address `rateLimited()` limiter the Gemini routes use, before any live query** — review: security, so churned/cheap new wallets can't fan out live Tripo balance calls): read cached balance; if missing OR stale, do a live `getBalance()` and refresh the cache (R4). **Single-flight the live fetch** (one in-flight balance promise shared across concurrent cold-cache callers) to avoid a thundering herd on Tripo's balance endpoint. Return `{ available: boolean, reason? }` where `available = spendable ≥ THRESHOLD`; **`reason` carries NO quantitative balance** (no `spendable`/`threshold` values — the boolean is all the client needs; don't leak operator credit level). On a balance-check failure, fail **closed** with `available:false, reason:'unknown'`, never a 500.
- **TOCTOU / concurrency is a known limitation, stated honestly** (review: adversarial). Pre-flight is a snapshot read against a moving balance; credit can drop between the check and the ~2–4-min two-step chain, or two concurrent callers can both pass one snapshot. So R1's guarantee is "**not charged when we already know it will fail**" (the common credit-dry case), NOT an absolute no-charge promise. Size `TRIPO_PREFLIGHT_MIN_CREDITS` as `per-chain-cost × expected-concurrency + buffer` so the snapshot absorbs realistic concurrency; U5's refundable-message path (R3) is the backstop for the residual mid-chain/concurrent drain. (A store-side credit *reservation* counter is the fuller fix but is deferred — see Scope Boundaries.)
- Env: `TRIPO_PREFLIGHT_MIN_CREDITS`, optional `TRIPO_BALANCE_POLL_MS` (drives `BALANCE_STALE_MS`).

**Execution note:** Test-first for `getBalance` parsing and the poller's write/guard behavior.

**Patterns to follow:** `backend/src/events/integrationIndexer.ts` (factory/start/stop/reentrancy/invokedDirectly wiring); `backend/src/lib/tripo-client.ts` fetch + error-class + `AbortSignal.timeout`; generate route's auth gate for the pre-flight's JWT check.

**Test scenarios:**
- Happy path: `getBalance` parses `{data:{balance,frozen}}` → spendable = balance − frozen.
- Error path: 401 → `TripoAuthError`; non-ok → `TripoFailedError`; abort → `TripoTimeoutError`.
- Happy path (poller): `start()` performs an immediate poll and writes spendable to the store; `stop()` clears the timer; double `start()` is idempotent.
- Edge case (poller): a failing tick is swallowed (no throw out of the interval) and leaves the prior cached value intact.
- Covers AE1. Pre-flight with cached spendable < threshold → `{ available:false }`.
- Covers AE2. Pre-flight with empty cache + healthy live balance ≥ threshold → live query runs, caches, returns `{ available:true }`.
- Error path: pre-flight when both cache empty AND live `getBalance` throws → `{ available:false, reason:'unknown' }` (fail-closed), never a 500.
- Auth: pre-flight without a valid JWT → 401 (mirrors generate).

**Verification:** Poller writes balance only in the live process; pre-flight returns a correct availability decision from cache with a working cold-start live fallback; no test import starts the poller.

---

### U5. Tripo generate error classification

**Goal:** `generate.ts` maps the Tripo error classes to typed JSON error codes + appropriate HTTP status (not 500), and marks post-payment failures as potentially refundable, so the frontend can render classified, honest messages.

**Requirements:** R2, R3

**Dependencies:** None (independent of U4; pairs with it in the frontend)

**Files:**
- Modify: `backend/src/routes/generate.ts`
- Modify: `backend/src/routes/generate.test.ts` (create if absent)

**Approach:**
- Extend the existing try/catch (currently only `TripoDisabledError` → 400): map `TripoAuthError` → `{ error:'tripo_unavailable' }` (operator misconfig/credit; 503), `TripoTimeoutError` → `{ error:'tripo_timeout', refundable:true }`, `TripoFailedError` → `{ error:'tripo_failed', refundable:true }` (quota-out arrives here too — treat as service-unavailable wording), `TripoFormatError` → `{ error:'tripo_failed', refundable:true }`. Choose statuses that the frontend can branch on (e.g., 502/503/504) without re-bubbling a 500.
- Because these all occur **after** the `paymentVerifier.verify` gate, set `refundable:true` on the post-payment failures (R3) so the frontend shows the "fee may be refundable — contact us" copy. (Quota-out is the case the U4 pre-flight is meant to catch *before* payment; this classification is the safety net for the residual + for any pre-flight bypass.)
- Keep the response body small and free of raw upstream HTML (the client already truncates upstream bodies).

**Execution note:** Test-first — assert each error class maps to its code/status before changing the catch.

**Patterns to follow:** the existing `TripoDisabledError` → 400 mapping in `backend/src/routes/generate.ts`; error classes in `backend/src/lib/tripo-client.ts`.

**Test scenarios:**
- Covers AE3. Generator throws `TripoFailedError` (after payment verified) → response carries `error:'tripo_failed', refundable:true` and a non-500 status.
- Error path: `TripoTimeoutError` → `tripo_timeout, refundable:true`.
- Error path: `TripoAuthError` → `tripo_unavailable` (operator-side; not user-refundable framing).
- Regression: `TripoDisabledError` still → 400 `tripo_disabled`; the happy path still returns the GLB response.
- Edge case: the catch never lets an unclassified error become a 500 for known Tripo error classes.

**Verification:** No live-Tripo error class produces a raw 500; each maps to a distinct, frontend-branchable code; happy path unchanged.

---

### U6. Frontend Tripo: pre-flight before pay + classified messages

**Goal:** `onGenerate` calls the pre-flight endpoint and blocks before `signAndExecute` when unavailable (no charge), and the catch maps the U5 error codes to friendly, honest messages (incl. the refundable case).

**Requirements:** R1, R2, R3, R10

**Dependencies:** U4, U5

**Files:**
- Modify: `frontend/src/creator/CreateModelPage.tsx`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/creator/CreateModelPage.test.tsx`
- Modify: `frontend/src/lib/api.test.ts` (if present)

**Approach:**
- `api.ts`: add a `preflightGenerate(jwt)` call returning the typed `{ available, reason }`; change `generate()` to surface a structured error (parse the JSON `error`/`refundable` code) instead of throwing a bare `HTTP <status> <text>` string, so the page can branch without regex.
- Add a `'preflight'` value to the `genStatus` enum (review: design-lens — the pre-flight round-trip currently has no UI state). During the call the Generate button shows a brief "CHECKING…" label (reuse the existing spinner) and `genError` is cleared.
- `onGenerate`: after the JWT-expiry pre-check and BEFORE `signAndExecute`, `setGenStatus('preflight')` → call `preflightGenerate`; if `!available`, `setGenError(...)`, set status `error`, and **return without charging** (R1). The button/section stays visible with the message (R10).
- catch: replace the raw `setGenError(msg)` with a classifier mapping `tripo_unavailable`/`tripo_timeout`/`tripo_failed` (+ `refundable`) to localized English copy; keep the existing 401 → session-expired branch.
- **Message copy (settle exact wording in-unit, but these are the distinct strings required** — review: design-lens flagged three otherwise-guessed strings): (1) balance-insufficient pre-flight → "Generation is temporarily unavailable — please try again shortly."; (2) pre-flight network failure (distinct from balance-dry) → "Couldn't check generation availability — please try again."; (3) post-payment `refundable:true` → "Generation failed after payment. Your service fee may be refundable — contact <CONTACT_PATH>." **`<CONTACT_PATH>` is an Open Question (R3 cannot be fully implemented without it).**

**Execution note:** Frontend-touching → browser-verify the full demo arc before declaring done; 5-reviewer roster incl. `ce-julik-frontend-races-reviewer`.

**Patterns to follow:** existing `onGenerate` flow + `gen-error` banner in `frontend/src/creator/CreateModelPage.tsx`; `generate()` in `frontend/src/lib/api.ts`.

**Test scenarios:**
- Covers AE1. Pre-flight returns `available:false` → `signAndExecute` is NOT called, `gen-error` shows the unavailable message, status `error`.
- Covers AE3. `generate()` rejects with `tripo_failed, refundable:true` → banner shows the "fee may be refundable" copy.
- Happy path: pre-flight `available:true` → flow proceeds to pay → generate → GLB set.
- Error path: `tripo_timeout` and `tripo_unavailable` map to their distinct messages; 401 still clears session.
- Edge case: pre-flight network failure → treated as unavailable (no charge), friendly message.

**Verification:** Browser-verified — a forced `available:false` blocks payment with a visible message; classified errors render distinct copy; happy path still mints.

---

### U7. Frontend Gemini: visible quota state (never hide)

**Goal:** `useUploadCaption` and `useRiffCopilot` gain a distinct `quota` status (visible + reset hint) instead of collapsing 429 into generic `error`, and the caption/copilot UI renders the quota state without hiding the feature.

**Requirements:** R6, R7, R10

**Dependencies:** U3

**Files:**
- Create: `frontend/src/lib/formatRetryAfter.ts`
- Create: `frontend/src/lib/formatRetryAfter.test.ts`
- Modify: `frontend/src/creator/useUploadCaption.ts`
- Modify: `frontend/src/creator/useRiffCopilot.ts`
- Modify: `frontend/src/creator/CreateModelPage.tsx`
- Modify: `frontend/src/creator/useUploadCaption.test.ts`
- Modify: `frontend/src/creator/useRiffCopilot.test.ts`
- Modify: `frontend/src/creator/CreateModelPage.test.tsx`

**Approach:**
- Add `'quota'` to BOTH status enums — `CaptionStatus` (useUploadCaption) and `CopilotStatus` (useRiffCopilot) — distinct from `available:false` (hide) and generic `error` (retry). Parse `{ error:'quota_exhausted', retryAfterMs }` into `status:'quota'` carrying `retryAfterMs`. Keep `available:false` → hide unchanged (AE7).
- **Auto-recovery timer = a `useEffect` keyed on `[status, retryAfterMs]`** (review: design-lens — the structure was unspecified and both hooks lack timer infra): when `status==='quota' && retryAfterMs>0`, `setTimeout(() => { if (mounted.current) setStatus('idle'); }, retryAfterMs)` and clear it on cleanup. The `mounted.current` read lives INSIDE the timeout callback (avoids the stale-closure checklist §5 trap). Reuse the existing `mounted`/`seq` guards.
- **Shared reset-time formatter** `frontend/src/lib/formatRetryAfter.ts`: `(ms:number) => string` → "~Xm" / "in a moment" / "later today" (>60min). BOTH hooks import it so the caption button and copilot panel never diverge (review: design-lens, safe_auto).
- `CreateModelPage` — caption section: the `{captionOn && ...}` wrapper renders the section in the `quota` state (carve-out, NOT removed). Concrete render: button **disabled, label "AI QUOTA REACHED"**, a secondary line below showing `formatRetryAfter(retryAfterMs)`, and **no separate RETRY button** (recovery is automatic). `captionOn` stays true in quota state (the hook keeps `available:true`); only `available:false` hides.
- `CreateModelPage` — copilot toggle: in `status:'quota'` the toggle stays **visible and enabled**; opening the panel shows the quota message + `formatRetryAfter` hint inline **instead of the input field** (keeps the feature present for the evaluator, R10). Hide ONLY on no-key / flag-off.

**Execution note:** Frontend-touching → browser-verify; watch the multi-reader availability trap (checklist §1) — both the copilot toggle and caption button read Gemini state.

**Patterns to follow:** existing status enums + `seq`/`mounted`/`inFlight`/latest-wins guards in `frontend/src/creator/useUploadCaption.ts` + `useRiffCopilot.ts`; the `{captionOn && ...}` gate + `caption-*` testids in `CreateModelPage.tsx`.

**Test scenarios:**
- Covers AE4. Route returns `quota_exhausted` → hook status becomes `quota`, `available` stays true, the section/button remains rendered (not hidden).
- Covers AE5. `quota` with `retryAfterMs` → UI shows the ~time; after the timer elapses (fake timers), status returns to usable with no manual action (R7).
- Covers AE7. `available:false` (no key) → button hidden (unchanged).
- Edge case: generic transient `error` still shows the retry affordance (distinct from `quota`).
- Edge case: stale-response/seq guard still drops superseded responses; reset timer cleared on unmount (no stale-closure fire).
- Integration: both copilot and caption reflect the quota state independently (multi-reader).
- Unit (`formatRetryAfter`): `<60s → "in a moment"`, minutes → `"~Xm"`, `>60min → "later today"`; both hooks render identical strings for the same `retryAfterMs`.

**Verification:** Browser-verified — with a forced quota response the feature stays visible with a reset message and recovers automatically; keyless still hides.

---

### U8. ADR + env docs + phase-progress

**Goal:** Capture D-083, document the new env vars, and update phase-progress.

**Requirements:** R11 (documentation of the new dependency/config)

**Dependencies:** U1–U7

**Files:**
- Modify: `docs/decisions.md`
- Modify: `backend/.env.example`
- Modify: `docs/phase-progress.md`

**Approach:**
- D-083: "Third-party AI degradation UX + first persistent store (`node:sqlite`)" — record the driver choice, the self-count-primary Gemini signal (429-reset authoritative), the pre-flight-before-payment Tripo strategy + its TOCTOU snapshot limitation, report-don't-hide, and the new env vars. **Document the known payment-replay restart window** (the in-memory `paymentVerifier` replay `Set` resets on restart, reopening a brief replay window bounded by Sui finality — deferred per Scope Boundaries). Cross-ref D-034/D-081/D-082; bump the reserved pointer to D-084.
- `.env.example`: document `TUSK_DB_PATH`, `TRIPO_PREFLIGHT_MIN_CREDITS`, optional `TRIPO_BALANCE_POLL_MS`, `GEMINI_DAILY_BUDGET`, optional `GEMINI_PER_ADDRESS_DAILY` — with the "single instance + volume" note and the live-calibration reminder for the threshold. **Add an explicit warning that `GOOGLE_GENERATIVE_AI_API_KEY` and `TRIPO_API_KEY` must NEVER be `VITE_`-prefixed or copied into `frontend/.env`** (review: security). Optionally add a CI grep that fails on `VITE_GOOGLE`/`VITE_TRIPO` in any `.env*`.
- phase-progress: record the feature + the live-cost calibration follow-up + the contact-path decision (Open Questions).

**Test expectation:** none — documentation only.

**Verification:** D-083 present + cross-referenced; every new env var documented; reserved ADR pointer advanced.

---

## System-Wide Impact

- **Interaction graph:** new `node:sqlite` store read/written by the Gemini clients (via U2), the Tripo poller (U4), and the pre-flight route (U4); the poller runs only in `server.ts`'s `invokedDirectly` block.
- **Error propagation:** Tripo errors now classified at the route (U5) instead of bubbling to a 500; Gemini quota becomes a distinct route signal (U3) consumed as a non-hiding frontend state (U7); both clients stay fail-soft and never 5xx `/create`.
- **State lifecycle risks:** daily-counter rollover keyed on UTC date; cooldown expiry must be time-injected for tests; the DB connection is opened and never explicitly closed (mirrors the never-stopped indexer — acceptable for a single long-running process); fail-closed pre-flight on unknown balance.
- **API surface parity:** the quota contract is added to BOTH Gemini routes identically; the report-don't-hide rule applies to all three AI surfaces (Tripo generate, caption, copilot).
- **Integration coverage:** store durability across re-open (U1), 429→cooldown→suppressed-next-call (U2/U3), pre-flight cold-start live fallback (U4), and the frontend never-hide + auto-recover (U7) need real-object/integration tests, not just mocks.
- **Unchanged invariants:** `GOOGLE_GENERATIVE_AI_API_KEY` stays server-only (never `VITE_`); keyless→hide remains the only hide path; the SUI fee amount, Tripo model, and per-minute rate limiter are unchanged.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Gemini doesn't emit `x-ratelimit-remaining` on 200 responses | Self-count is the primary signal (chosen decision); headers are enrichment only — the guard still works without them. |
| Exact Tripo Turbo-v1.0 credit cost unpublished → wrong threshold | Threshold is env-configured + a calibration task diffs `balance` across one real chain; default conservative. |
| `node:sqlite` experimental API churn on a future Node major | Tiny API surface (`DatabaseSync`, `prepare/run/get`); pinned to the deploy's Node 22.22.3; swap to `better-sqlite3` is mechanical if needed. |
| SQLite file lost on redeploy if the volume isn't actually mounted | Deploy assumption (single instance + volume) is explicit; balance re-syncs on startup and daily counters fail-open (worst case: a little over-spend window), never a crash. |
| Frontend `{captionOn && ...}` carve-out regresses the keyless-hide path | Explicit AE7 test + browser-verify both states (quota visible / keyless hidden). |
| `GenerateFn` widening breaks existing client tests | Update all injected fakes in the same unit (U2); `tsc`-clean DoD; regression scenario listed. |
| Pre-flight TOCTOU / concurrency: credit drops between snapshot and the ~2–4-min chain → charged-and-failed still possible | R1 reframed as a snapshot guarantee; threshold sized for `per-chain-cost × concurrency + buffer`; U5 refundable message is the backstop; store-side reservation deferred (U4, Scope Boundaries). |
| `withTimeout` (15s) masks a slow 429 → cooldown never records, quota silently degrades to generic-retry | Capture the 429/`APICallError` INSIDE the generate closure before `withTimeout` can convert it (U2). |
| Dead poller leaves a stale-but-fresh-looking cache (false available/unavailable) | `BALANCE_STALE_MS` (~2.5× poll interval) makes "stale" trigger the live fallback, covering cold-start AND a silently-dead poller (U4). |
| 429-recovery thundering herd: all clients re-enable on the same tick and re-trip the limit | Manual-button features bound the herd; add small per-client jitter to the surfaced `retryAfterMs` (U7). Acceptable for demo scale. |
| Live Tripo balance query DoS via churned wallets / cold-cache fan-out | Per-address `rateLimited()` on the pre-flight before any live query + single-flight the live fetch (U4). |
| Payment-replay `Set` is in-memory → a restart reopens a brief replay window | Known, documented in D-083/U8; bounded by Sui finality; persisting the replay Set is deferred (Scope Boundaries). |

---

## Documentation / Operational Notes

- New env vars must be set on the deploy (with the volume mounted at `TUSK_DB_PATH`'s directory). Document in `backend/.env.example` (U8).
- One-time operational task post-deploy: run a real two-step generation and diff the Tripo `balance` to calibrate `TRIPO_PREFLIGHT_MIN_CREDITS`.
- Frontend-touching plan → CLAUDE.md mandates the 5-reviewer roster (incl. `ce-julik-frontend-races-reviewer`) and full demo-arc browser verification before declaring done.

---

## Sources & References

- **Origin document:** [docs/brainstorms/2026-06-03-third-party-ai-degradation-ux-requirements.md](docs/brainstorms/2026-06-03-third-party-ai-degradation-ux-requirements.md)
- Related code: `backend/src/events/integrationIndexer.ts`, `backend/src/lib/copilot-client.ts`, `backend/src/lib/caption-client.ts`, `backend/src/lib/tripo-client.ts`, `backend/src/routes/generate.ts`, `frontend/src/creator/CreateModelPage.tsx`, `frontend/src/creator/useUploadCaption.ts`, `frontend/src/creator/useRiffCopilot.ts`
- External docs: [AI SDK generateText](https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text), [Tripo OpenAPI](https://docs.tripo3d.ai/get-started/introduction.html), [Node SQLite](https://nodejs.org/api/sqlite.html)
- Related decisions: D-034, D-045, D-051, D-081, D-082; new D-083
