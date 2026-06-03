---
date: 2026-06-03
topic: third-party-ai-degradation-ux
---

# Third-Party AI Degradation UX (Tripo + Gemini)

## Summary

Add a degradation layer over the two third-party AI dependencies so quota/failure never surfaces as a raw 500 or a vanished feature: Tripo (user-paid) is pre-checked for credit **before** the SUI fee is charged; Gemini (operator-paid) reads its real remaining headroom from response rate-limit headers and shows an explicit "quota reached" message while staying visible. Quota/usage state is persisted (SQLite on the single-instance + volume deploy) and Tripo balance is synced by a background poller.

---

## Problem Frame

Tusk3D depends on two paid third-party AI APIs, and both can run dry mid-use:

- **Tripo** powers prompt-mode generation. The flow charges the SUI service fee **first**, then calls Tripo. Today only `TripoDisabledError` is mapped to a clean 400; every other Tripo error (including credit exhaustion, which arrives as a 4xx wrapped in `TripoFailedError`) re-throws into a generic **500**. The frontend then prints the raw error string. Worst case: the creator **pays SUI, gets nothing, and sees a 500** — and during Demo Day a judge clicking "Generate" on a credit-dry account hits exactly this.
- **Gemini** powers the upload-captioning "Describe with AI" button and the Riff Copilot. The operator pays Google per call, so abuse or a runaway loop burns the operator's money, and a daily-quota exhaustion mid-demo is plausible. The current fail-soft keeps the button on transient failure but the message is generic, and the proposed "hide when low" behavior would make a built feature **disappear** — which an evaluator reads as "not implemented."

The cost is concentrated at the worst possible moment (live evaluation) and, for Tripo, involves real user money.

---

## Actors

- A1. Creator (end user): runs Tripo prompt-mode generation (pays a SUI service fee) or uploads a GLB; uses the Gemini-backed Describe-with-AI and Copilot features.
- A2. Operator (us): prepays Tripo credits, pays Google per Gemini call. Bears the cost of abuse, overspend, and topped-out quotas.
- A3. Judge / evaluator: exercises the live demo under unknown load; must perceive every built feature as present even when a quota is exhausted.

---

## Key Flows

- F1. Tripo generate with pre-flight (pay-gated)
  - **Trigger:** A1 clicks Generate in Tripo prompt-mode.
  - **Actors:** A1, A2
  - **Steps:** (1) System checks cached Tripo balance (live query if cache empty). (2) If balance < one generation's cost → block here, show "temporarily unavailable", **no charge**. (3) Else proceed: charge SUI fee → run the two-step Tripo chain. (4) On a post-payment failure, surface a classified, honest message.
  - **Outcome:** Either a generated model, or a clear message — never a raw 500, and never a silent charge for a generation the system already knew it couldn't fulfill.
  - **Covered by:** R1, R2, R3, R4

- F2. Gemini-backed action under quota pressure
  - **Trigger:** A1 opens upload mode (Describe with AI) or interacts with the Copilot.
  - **Actors:** A1, A2
  - **Steps:** (1) Feature renders visibly (key + flag present). (2) On call, system reads rate-limit headers from the response and records remaining/reset. (3) If quota is exhausted / 429, the feature stays visible and shows "AI quota reached — try again [~X / later]". (4) After the reset time passes, the feature works again with no manual step.
  - **Outcome:** A built feature is always visible to A3; quota state is explicit, not a disappearance.
  - **Covered by:** R5, R6, R7, R10

---

## Requirements

**Tripo failure UX (user-paid path)**
- R1. Before charging the SUI service fee, the system pre-checks Tripo availability (remaining credit ≥ one generation's cost). If insufficient, it blocks at the pay step — the creator is **never charged** — and shows a clear "generation temporarily unavailable" message.
- R2. Tripo failures are classified and surfaced as human-readable messages in the app UI language (English) — never a raw 500 or a raw technical string. At minimum distinguish: service-unavailable/quota, timeout, and task-failed.
- R3. For residual **post-payment** failures that the pre-flight cannot catch (timeout, task failed, output-format drift), the creator sees an honest message stating the fee may be refundable and how to contact the operator. No automatic refund is issued.
- R4. Tripo remaining balance is synced periodically by a background poller and cached; the pre-flight reads the cache and falls back to a live balance query when the cache is empty/stale (cold start), so cold start does not block legitimate users.

**Gemini abuse / overspend protection (operator-paid path)**
- R5. The system reads Gemini remaining headroom from each API response's rate-limit headers (including the per-day dimension) and persists the latest remaining/reset values.
- R6. When Gemini quota is exhausted or the call is rate-limited (429), the feature stays visible and shows an explicit "AI quota reached — try again [~X / later]" message; reset time is surfaced when known. The button is never hidden for quota reasons.
- R7. The Gemini-backed feature auto-recovers once the rate-limit reset time passes — no manual intervention or redeploy.
- R8. Existing per-address rate limiting is retained. A per-address daily cap may be added as abuse protection (optional — see Outstanding Questions).
- R9. (Optional) A self-imposed operator cost budget may cap daily Gemini spend on top of Google's own limits, for cost control.

**Shared degradation philosophy**
- R10. A built feature is **never hidden** due to quota exhaustion or transient failure — all such states show an explicit, visible message. Hiding is reserved solely for genuinely-undeployed features (no API key / feature flag off). This applies to both Tripo and Gemini surfaces.

**Persistence & quota-sync infrastructure**
- R11. Quota/usage/rate-limit state is persisted in a durable store so it survives restart and redeploy — primarily the Gemini daily usage counters and the cached Tripo balance. (Deploy target: single long-running instance with a persistent volume.)
- R12. Quota state and background syncing run only in the live server process, not during tests or module imports (mirrors the existing background-poller pattern).

---

## Acceptance Examples

- AE1. **Covers R1.** Given Tripo balance < one generation's cost, when A1 clicks Generate, then no SUI is charged and a "generation temporarily unavailable" message appears at the pay step.
- AE2. **Covers R1, R4.** Given the balance cache is empty (cold start) and Tripo is healthy, when A1 clicks Generate, then a live balance check runs, passes, and the flow proceeds to payment.
- AE3. **Covers R2, R3.** Given Tripo accepts payment but the generation task then fails or times out, when the failure returns, then A1 sees an honest message that the fee may be refundable plus a contact path — and no automatic refund is attempted.
- AE4. **Covers R6, R10.** Given Gemini's daily quota is exhausted, when A1 opens upload mode (Describe with AI) or the Copilot, then the feature remains **visible** and shows "AI quota reached — try later" rather than disappearing.
- AE5. **Covers R6, R7.** Given a 429 carrying a reset time, when A1 retries before reset, then the message shows the approximate time remaining; after the reset passes, the feature works again with no manual step.
- AE6. **Covers R11.** Given the server restarts, when it comes back up, then the Gemini daily usage counter and the cached Tripo balance are restored from the durable store (not reset to zero).
- AE7. **Covers R10.** Given no Gemini API key is configured (keyless deploy), when the page loads, then the feature is hidden — the one and only case where hiding is allowed.

---

## Success Criteria

- A judge hammering the live demo never sees a raw 500 or a vanished feature; the worst case is a clear "temporarily unavailable" / "quota reached" message.
- No creator is charged SUI for a generation the system already knew it could not fulfill (credit exhaustion is caught pre-payment).
- The operator's Gemini spend cannot run away unbounded, and quota/usage state survives restarts and redeploys.
- ce-plan can implement without having to invent degradation behavior, the messaging/hiding policy, or the persistence scope.

---

## Scope Boundaries

- No automatic on-chain refund for any Tripo failure — refunds go through a manual/contact path only.
- No IP-based rate limiting (X-Forwarded-For parsing behind Vercel/CF + shared-NAT false positives outweigh the marginal value).
- Tripo stays SUI-fee-gated — it is not made free to dodge the refund problem.
- No distributed / multi-instance / serverless quota store (the deploy is a single instance with a volume).
- No integration with Google Cloud Monitoring or the Cloud Quotas API to reconcile Gemini usage (too heavy for the timeline).
- No active "dummy probe request" to refresh Gemini quota — remaining is read only off real calls' response headers.
- The SUI fee amount, the Tripo model choice, and per-call credit cost are not changed here.

---

## Key Decisions

- **Tripo: pre-flight block before payment** (chosen over auto-refund and over "just show a message after charging"): cheapest to build, demo-safe, and avoids any on-chain refund path. The user never pays for a generation that will fail on a known-dry account.
- **Gemini: remaining read from response rate-limit headers** (`x-ratelimit-remaining` + reset, including the daily dimension; quota is per-project, not per-key) — chosen over blind self-counting against a guessed budget and over the heavyweight Cloud Monitoring/Quotas API. Google exposes no standalone "balance" endpoint, but the real number rides on every response.
- **Report, don't hide.** Degradation always shows an explicit visible message; hiding is reserved for undeployed (keyless / flag-off) features only — so an evaluator never mistakes a topped-out feature for an unbuilt one.
- **Durable quota state via SQLite** on the single-instance + persistent-volume deploy (driver — Node 22 `node:sqlite` vs `better-sqlite3` — decided in planning). Justified primarily by the Gemini daily counter needing to survive restarts; Tripo balance cache and rate-limit windows ride along.
- **Tripo balance background poller** mirrors the existing `IntegrationIndexer` pattern, with a live-query fallback when the cache is cold.

---

## Dependencies / Assumptions

- The backend deploys as a single long-running Node process with a persistent volume (confirmed direction).
- Tripo OpenAPI v2 exposes a balance endpoint (the `Balance` object carries `balance` / `frozen`) — confirmed via Tripo docs; exact path resolved in planning.
- Gemini returns `x-ratelimit-*` headers and they are readable through the `ai` v6 SDK (`response.headers`) for both `generateText` callers (caption + copilot) — to confirm in planning.
- The demo deployment has both the Tripo and Gemini API keys configured (so the only hidden-feature case does not occur in the demo).

---

## Outstanding Questions

### Deferred to Planning

- [Affects R5][Needs research] Confirm the `ai` v6 SDK surfaces raw response headers for `generateText` in the caption and copilot clients, and whether any streaming path changes header access.
- [Affects R4][Technical] Resolve the exact Tripo balance endpoint path and the credit cost of the two-step generation chain, to set the pre-flight threshold.
- [Affects R11][Technical] SQLite driver choice (`node:sqlite` vs `better-sqlite3`), the persistence schema, and whether to persist per-minute windows or only the durable daily counters + balance cache.
- [Affects R6][Technical] Exact message copy and how the reset time is formatted/surfaced in the UI for both Tripo and Gemini states.
- [Affects R8, R9][User decision] Whether to add a per-address daily Gemini cap and/or a self-imposed daily cost budget, and at what numbers (both optional).
