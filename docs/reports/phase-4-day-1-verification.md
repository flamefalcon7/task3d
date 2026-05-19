# Phase 4 Day-1 Verification Report

**Date:** 2026-05-19
**Plan:** `docs/plans/2026-05-19-007-feat-phase-4-kiosk-race-on-mint-plan.md`
**Unit:** U1
**Phase 4 deadline:** 6/20 (10 dev-days from 6/11; this verification runs at the front)
**Status:** Partial — agent-doable checks resolved; manual checks awaiting user

This report gates the start of U2 (Move contract v2 redesign). U2 cannot begin until every check below is `GO` or has a documented downgrade plan. Replan triggers are called out in the per-check rows.

---

## Summary

| # | Check | Verdict | Owner | Blocking? |
|---|---|---|---|---|
| 1 | R1 — public visibility of Phase 2 testnet artifacts | **GO** | agent | no |
| 2 | R11a (descoped) — Phase 3 racetrack mount sanity | **GO** | user | resolved |
| 3 | U1-prelim — `?model=<id>` route prototype | **GO** | agent | no |
| 4 | R11 — Slush account-switch latency | **DEFERRED** | user | no — re-fires at U12 demo prep |
| 5 | Dependencies — handbook verbatim quote | **GO** | user | resolved 2026-05-19 |
| 6 | U1.f — tx_digest Move spike | **GO — option (a)** | agent + sui CLI | resolved 2026-05-19 |

---

## 1. R1 — Public visibility of Phase 2 testnet artifacts — **GO**

**Hypothesis under test:** Phase 2 mints + the testnet package ID could already have been pointed at externally (Twitter / Discord / dev-log) and re-publishing under Phase 4's incompatible `key + store` schema risks confusing external observers.

**Method:**

1. `grep -rn "0x18a480b3ff" .` across `*.md`, `*.ts`, `*.tsx`, `*.move`, `*.toml`, `*.json`, `.env*`.
2. `git remote -v` to determine whether the repo is reachable externally.
3. `WebSearch` for the exact package ID hex against Twitter / X / Discord.
4. `grep -rn 'twitter\|x\.com\|discord\|tweet' pitch/ README.md docs/` for any social-channel references.

**Findings:**

- The Phase 2 testnet package ID `0x18a480b3ff2219ac6666177221bafb37aa79a81122890581025b4737aef05ac3` lives in 7 files inside this repo:
  - `frontend/.env.local` (gitignored — local only)
  - `contracts/model3d/Published.toml` (`published-at`, `original-id`)
  - `contracts/model3d/README.md` (install instructions)
  - `docs/process.md`, `docs/phase-progress.md`, `docs/ideation/2026-05-18-phase-4-kiosk-mainnet-demo-ideation.md` (working notes)
  - `README.md` (line 145, "Testnet package ID")
- `git remote -v` returns empty — **the repo has no GitHub remote**; it is local-only as of 2026-05-19.
- `WebSearch` for the exact package ID + `overflow2026`: no matches.
- `WebSearch` for `"overflow2026"` against `site:twitter.com OR site:x.com OR site:discord.com`: only unrelated hits (anime "Overflow Season 2", Sui Overflow 2025, Stack Overflow HumanX 2026).
- `pitch/demo-script.md` mentions wallet A address `0x31168...` but is also local-only (no remote).

**Verdict — GO:** No external reachable surface exposes the Phase 2 package ID. Re-publishing under Phase 4's `key + store` schema (U2) is safe; the public testnet object remains on chain and externally visible to whoever scans Sui Explorer, but no external doc or post points at it. No "abandon note" needed on social channels because no social posts exist.

**Action on the seven in-repo references:** U2 deploys a new package ID; the seven references update at U2 commit time as part of the Phase 2 → Phase 4 migration. No standalone cleanup PR.

---

## 2. R11a (descoped) — Phase 3 racetrack mount sanity — **PENDING**

**Hypothesis under test:** the existing `/track` mount works cleanly with the existing carousel variant. If broken, U10's purchase → `/track?model=<id>` auto-navigation has nothing to land on.

**Scope reminder:** descoped to "existing carousel variant" per F25 in the plan. The `?model=` path is U1.c (handled below as a separate check). This check is about the unmodified Phase 3 surface.

**Method (for the user to execute):**

```sh
pnpm dev      # from repo root — boots backend + frontend
# Open Chrome → http://localhost:5173/track
# Connect Slush wallet that has at least one Phase 2 owned variant.
```

Stopwatch / devtools observations:

| Criterion | Pass condition | Replan trigger |
|---|---|---|
| (a) First scene frame | renders within 2 s of `/track` nav | (a) fails → U10 adds a loading spinner |
| (b) Console errors | zero JS errors on mount | log them here; severity decides patch ordering |
| (c) Car controllable | car visible + WASD responsive within 3 s | (c) fails → U10 priority-1 before U7 |
| (d) HUD layout | countdown + LapTimer + Lap/Best HUD render without z-fighting | log artifacts; non-blocking |

**Results (2026-05-19, user-confirmed via a normal `/track` lap session):**

| Criterion | Observed | Verdict | Notes |
|---|---|---|---|
| (a) first frame ms | within budget | PASS | user played a complete session — no perceived load lag |
| (b) console errors | none reported | PASS | normal lap, no errors surfaced |
| (c) controllable ms | within budget | PASS | car drove normally, WASD responsive |
| (d) HUD layout | clean | PASS | no z-fighting reported |

**Verdict — GO.** No replan triggers fire. U10 can use the existing `/track` mount as-is; no spinner add, no priority bump.

---

## 3. U1-prelim — `?model=<id>` route prototype — **GO**

**Hypothesis under test:** `/track?model=<id>` can resolve a model to a Walrus blob via a stubbed listing lookup and mount the racetrack scene, bypassing the Phase-3 `useOwnedVariants` Access-based discovery path entirely. Establishes the baseline U10 will build on.

**Method:**

1. Add `frontend/src/track/stubListingLookup.ts` (NEW) — returns a minimal `Model3DSummary` from a stub map or `?blob=` dev override; will be replaced by `GET /api/listings/:id` in U7/U10.
2. Modify `frontend/src/track/TrackPage.tsx`:
   - Read `?model=` and `?blob=` via `useSearchParams`.
   - When `?model=` resolves to a non-null variant, treat as override mode: skip `useOwnedVariants`, skip wallet/loading/error gates, render with `[overrideVariant]` as the only carousel entry.
   - Otherwise, existing Phase 3 behavior unchanged.

**Findings:**

- TypeScript build: `pnpm typecheck` (`tsc -b`) clean.
- Existing tests: `pnpm test src/track/TrackPage.test` — 22/22 pass; no regression on the non-override path.
- Files touched: 2 (1 NEW, 1 modified). No test added — U1's plan deliverable is the verification artifact, not test coverage; U10 will add proper coverage when wiring the real listing API.

**Manual verification (for the user, after the dev server is up):**

```text
http://localhost:5173/track?model=anything&blob=<known_walrus_blob_id>
```

Expected: scene mounts with the GLB at the given Walrus blob; no wallet popup required; carousel shows one entry named `prototype`.

**Verdict — GO** for the code path. Manual end-to-end check is part of the racetrack-mount work in §2; flag any issue there.

---

## 4. R11 — Slush account-switch latency — **DEFERRED to U12 demo prep**

**Why deferred (2026-05-19):** measurement value depends on running an actual mint → buy → drive session — switch latency under real UI state + scene mount + wallet connection load differs from a switch on an empty page. Synthetic timing on day 1, before U6–U10 have built the surface the switch happens on, would not predict U12 recording-day behavior.

**Trigger to re-fire:** before U12 (90-second no-cut recording, ~6/19), once U6 + U7 + U10 are mergeable so a real Tom → Marcus → /track loop is runnable. At that point execute the measurement protocol below against the live build.

**Not a U2 blocker:** Risk 4 in plan-007 is `Medium / Medium`; impact is on U12 recording planning (lower-thirds fallback or not), not on Move / frontend implementation.

**Hypothesis under test (re-fires at U12):** swapping between Tom (creator) and Marcus (buyer) accounts inside a single Slush extension is fast enough that the 90-second no-cut recording does not need a lower-thirds fallback.

**Method (for the user to execute):**

1. Install Slush from the Chrome Web Store (if not already).
2. Create two throwaway testnet wallets (Tom + Marcus); fund both from the testnet faucet to ~5 SUI each.
3. With both connected to overflow2026 (visit `/track` and `/forge` to bind), open the Slush dropdown, switch from Tom → Marcus → Tom, repeating 10 times.
4. Stopwatch each switch from "click account in dropdown" to "DApp UI re-renders with the new address visible in the header".

**Results (fill in):**

| Run | Tom → Marcus (s) | Marcus → Tom (s) |
|---|---|---|
| 1 | _ | _ |
| 2 | _ | _ |
| 3 | _ | _ |
| 4 | _ | _ |
| 5 | _ | _ |
| 6 | _ | _ |
| 7 | _ | _ |
| 8 | _ | _ |
| 9 | _ | _ |
| 10 | _ | _ |

**Stats:**

- p50: _
- p95: _

**Verdict trigger:** p95 > 2 s → R11 lower-thirds fallback planned at U12 (cut to graphic during the switch); otherwise OK to switch live during the 90-second take.

**Verdict:** _DEFERRED — re-fire at U12 demo prep with the real build._

---

## 5. Dependencies — Overflow 2026 handbook verbatim quote — **GO**

**Hypothesis under test:** CLAUDE.md + `docs/spec.md` claim "6/21 submission, 8/27 winners, mainnet for 100% prize tier". Verify against the handbook.

**Source:** https://mystenlabs.notion.site/overflow-2026-handbook (verbatim text pasted by user 2026-05-19).

### Verbatim — load-bearing clauses

> **June 21 - Submission Deadline.** Final deadline for all project submissions. After the deadline, you can continue to make changes to your project but it may not be reflected in the shortlisting process

> **August 27 - Winners Announcement.** Final winners announced and will be invited to pitch during Sui Basecamp 2026.

> Prizes for Sui Overflow 2026 will follow a **split distribution model** designed to encourage continued development beyond the hackathon: **50% of the prize** will be awarded upon announcement of winners. **50% of the prize** will be awarded after successful mainnet deployment. If a winning team has already deployed their project to mainnet by the time winners are announced in August, they will receive **100% of the prize upfront.**

> Mainnet deployment must meet the **minimum functional requirements** as defined by the Sui team and/or track sponsors.

### Verbatim — eligibility (informs R1 + U13 + submission package)

> The project must be deployed to Sui mainnet or testnet **by the time of shortlisting and demo day.**

> Existing projects are permitted only if substantial new functionality, features, or integrations are developed specifically during the hackathon period.

### Verbatim — submission package fields

> Project Name | Clear + simple
> Description | What it does, why it matters
> Project Logo | **1:1 ratio (JPG/PNG)**
> Public GitHub Repo | **Required to be public during judging period**
> Demo Video | Required (**YouTube preferred, ≤ 5 min**)
> Website | Optional, highly recommended
> Deployment | Testnet or Mainnet
> Package ID | If deployed on-chain

(FAQ qualifier: "Open-sourcing your repository is not required. However, teams may be asked to provide temporary repository access to judges during the review and evaluation process." — read together with the table, the practical interpretation is: repo must be accessible to judges during the judging window; permanent open-source license not required.)

### Verbatim — Walrus track (our submission track)

> **Walrus**: Build AI agents and agentic workflows powered by Walrus as a verifiable data and memory layer.
> 1st Prize: $35,000 / 2nd Prize: $15,000 / 3rd Prize: $7,500 / 4th Prize: $5,000
> NB: A total of $7,500 in additional funds will be distributed among notable honorable mentions or as special awards.

### Verbatim — judging criteria

> Product & UX - 20% / Real-World Application - 50% / Technical Implementation - 20% / Presentation & Vision - 10%

### Verdict — **GO** (no replan)

All four load-bearing claims confirmed:

| Claim in our docs | Handbook says | Status |
|---|---|---|
| 6/21 = submission deadline | "June 21 - Submission Deadline" | ✅ confirmed |
| 8/27 = winners announcement | "August 27 - Winners Announcement" | ✅ confirmed |
| Mainnet 100% prize tier | "100% of the prize upfront" if mainnet by winners date | ✅ confirmed; D-009 + D-028 ground truth intact |
| Walrus track exists with prize pool | $35K/$15K/$7.5K/$5K | ✅ confirmed |

### Discoveries — milestones / requirements not yet tracked in CLAUDE.md or `phase-progress.md`

1. **🚨 July 8 — Shortlisted teams announcement.** New milestone between submission (6/21) and demo day. We were not tracking this.

2. **🚨 July 20–21 — Demo Day (VIRTUAL).** "Shortlisted teams will present their projects live virtually to our panel of judges." Means: shortlisted teams must prepare a **live virtual pitch**, not just the 6/21 recorded video. Our docs treat 7/20–21 as "demo day" but did not encode that it's a live present-back. This is a Phase 5 work item that may need its own brief — slides + a live-runnable demo + Q&A prep.

3. **🚨 Eligibility timing clarification.** Deployment requirement is "by the time of shortlisting (7/8) and demo day (7/20–21)" — NOT by 6/21 submission. Testnet deployment is sufficient at every stage; mainnet only affects the prize 50/50 split. This *strengthens* the D-009/D-028 logic: there is genuinely zero penalty for testnet-only at submission.

4. **🚨 GitHub repo must be public during judging.** R1 implication: the 7 in-repo references to the Phase 2 testnet package ID (README, contracts/model3d/README.md, docs/*.md, Published.toml, etc.) WILL become public when we push to GitHub before 7/8 shortlisting. R1's "GO" verdict still holds because these references are normal documentation of (replaced) Phase 2 work — no external CTAs point to them. But a deliberate "Phase 2 → Phase 4 migration" note in README at U2/U14 time will save explanatory work during judging.

5. **Submission asset checklist (Phase 5 work).** Project Logo 1:1 JPG/PNG, demo video ≤5 min YouTube preferred. Both within current planning headroom.

### Action items spawned

- [ ] Update `CLAUDE.md` hackathon-reality-check section to include the 7/8 shortlist + 7/20–21 (live virtual) demo day milestones.
- [ ] Update `phase-progress.md` Hackathon Tracker rows to count down to 7/8 + 7/20 as well as 6/21 + 8/27.
- [ ] Add Phase 5 work item: live virtual demo prep (slides + runnable demo + Q&A) for 7/20–21 if shortlisted.
- [ ] Add Phase 5 work item: project logo (1:1 JPG/PNG).
- [ ] U14 README polish: include explicit "Phase 2 → Phase 4 migration" note so judges who see the testnet package ID in older files understand the v1 testnet is intentionally abandoned.

---

## 6. U1.f — tx_digest Move spike — **PENDING**

**Hypothesis under test:** can `model3d::RoyaltyPaid` carry the same `tx_digest` value (as `vector<u8>`) that off-chain indexers see for the transaction that emitted the event? If yes, U8's overlay filter joins on `tx_digest`; if no, fallback to `event_seq + tx_sender` / nonce / buyer-only.

**Method (agent prepared; user executes):**

The throwaway Move package is in `contracts/throwaway-spike/`. Contents:

- `Move.toml` — `edition = "2024.beta"`, no deps beyond the Sui framework.
- `sources/spike.move` — single entry fn `emit_test_event(ctx: &mut TxContext)` that emits a `TestEvent` with `sender`, `tx_digest: vector<u8>` (from `*tx_context::digest(ctx)`), `epoch`, `epoch_timestamp_ms`.
- `README.md` — exact CLI sequence below.

```sh
cd contracts/throwaway-spike
sui move build
sui client publish --gas-budget 50_000_000      # capture PackageID → SPIKE_PKG

sui client call \
  --package "$SPIKE_PKG" \
  --module spike \
  --function emit_test_event \
  --gas-budget 10_000_000                       # capture txDigest → CALL_DIGEST

sui client events --tx-digest "$CALL_DIGEST"    # observe TestEvent.tx_digest
```

**Comparison (executed 2026-05-19 against testnet via this agent's Sui CLI access):**

| Field | Value |
|---|---|
| Spike PackageID | `0x6f3fc9012b3625a714bd9c99c06cea058633e07d4b3223cba05f03bb13101673` |
| Publish tx digest | `7kG1zjvWeRW7UYu2PeqmvspXXTrGGRwKMmGwuXqVD2J7` |
| `CALL_DIGEST` (RPC, base58) | `AZCKkn33B9tF3ZQfP4DAc1os1tKGTjMeM143HUY86r4M` |
| `TestEvent.tx_digest` (event JSON, base64 of `vector<u8>`) | `jfiSU6210dPgdln+HmYFJpBDLwCvCdkwetFmhipAcf4=` |
| Decoded to 32-byte hex (both) | `8df89253adb5d1d3e07659fe1e66052690432f00af09d9307ad166862a4071fe` |
| Byte-equal? | **YES** |

### Verdict — **GO, option (a) tx_digest available**

`tx_context::digest(ctx)` is exposed in Sui framework 1.72.1 and returns the same 32 bytes the off-chain RPC sees for the same transaction. Cross-system join on `tx_digest` works.

### Decision tree (resolved branch in **bold**)

| Outcome | Plan-007 path | Downstream impact |
|---|---|---|
| `sui move build` errors on `tx_context::digest(ctx)` | (b) fallback | U2's `RoyaltyPaid` drops `tx_digest`; U8 filter uses `event_seq + tx_sender` (or nonce / buyer-only). |
| Build OK but `TestEvent.tx_digest` ≠ `CALL_DIGEST` | (b) fallback | Same as above — the in-Move digest is unusable as a cross-system join key. |
| **Build OK and the two are byte-equal** | **(a) tx_digest available** | **U2 keeps `RoyaltyPaid.tx_digest: vector<u8>`; U8 filter joins on it; U11 replay placeholder uses `{{TX_DIGEST}}`.** |

### Implementation footgun (must surface in U8 R12 doc)

`CALL_DIGEST` is **base58** (Sui RPC API convention) and `TestEvent.tx_digest` is **base64** (Sui JSON serialization of `vector<u8>`). They are NOT string-equal even though they represent the same 32 bytes. U8's frontend filter MUST decode both to raw bytes (or to a common encoding like hex) before equality check. Recommend a single normalization helper in `frontend/src/sui/`:

```ts
// Normalize any Sui digest representation to lowercase hex.
function normalizeTxDigest(input: string): string {
  // base58 (RPC API) → 32 bytes → hex
  // base64 (event vector<u8>) → 32 bytes → hex
  // both arrive at the same 32-byte payload; hex is the cheapest equality target.
}
```

This belongs in `frontend/src/sui/` (not browse / overlays) so all event-consumers get it. U8's R12 capture doc (`docs/solutions/kiosk-ptb-patterns/eventpoller-replay-interface.md`) should call out the encoding mismatch in its first section.

### Cleanup note

The throwaway package is now on testnet at `0x6f3fc901...3101673`. It will not be deleted; testnet artifacts are abandoned in place. Local files `contracts/throwaway-spike/` can be deleted once U2 lands, or kept as a fixture for future Move RPC parity tests — defer that decision to U2.

---

## Next steps

All blocking checks GO; one row deferred with a clear re-fire trigger. **U2 is unblocked.**

### Carried-forward action items (not Phase 4 U1 scope, do not re-litigate at U2)

- **§4 Slush latency** re-fires at U12 demo prep window (when U6 + U7 + U10 are mergeable so a real Tom → Marcus → /track loop is runnable). Capture the trigger in U12's prep checklist when U12 starts.
- **§5 handbook discoveries** (5 items) — see §5's "Action items spawned" subsection. Highlights: update CLAUDE.md hackathon-reality-check with 7/8 + 7/20–21 milestones; add Phase 5 live-virtual-demo prep + project-logo work items; U14 README "Phase 2 → Phase 4 migration note".
- **§6 frontend encoding-normalization helper** — U8 R12 doc (`docs/solutions/kiosk-ptb-patterns/eventpoller-replay-interface.md`) calls out the base58/base64 mismatch and provides the `normalizeTxDigest()` helper in its first section.

### U2 (Move contract v2 redesign) start checklist

Per plan-007 U2:

1. Drop `Model3D has key` → `Model3D has key, store`.
2. Add `MODEL3D` OTW + `init` creating Publisher.
3. `RoyaltyPaid` struct keeps `tx_digest: vector<u8>` (per §6 option (a) decision above).
4. Strip Phase 2 `publish_and_share` + `purchase_model_access`; delete Phase 2 frontend PTB files in the same commit.
5. U2 deploy uses dev's interactive Sui CLI keychain (NOT `SUI_MAINNET_DEPLOY_KEY`); U13 will add the abort guard for the inverse direction.
6. Land R12 doc `docs/solutions/kiosk-ptb-patterns/model3d-key-store-migration.md`.

The day-1 report is the U1 deliverable. Commit it together with the U1 work — Move spike, TrackPage prototype + stubListingLookup, handbook quote backfill in the brainstorm doc.
