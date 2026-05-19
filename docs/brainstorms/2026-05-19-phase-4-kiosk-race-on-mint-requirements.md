---
date: 2026-05-19
topic: phase-4-kiosk-race-on-mint
---

# Phase 4 — Kiosk Hybrid + Race-on-Mint Demo Centerpiece

## Summary

Ship a polished testnet Kiosk + TransferPolicy submission by 6/21, centered on a no-cut 90-second "buy a Model3D, drive it 5 seconds later" demo arc with on-screen royalty receipt overlay. Mainnet ceremony deferred entirely to the 7/22–8/27 winners window, with execution policy + bug severity matrix + WAL acquisition timing documented in `docs/runbooks/mainnet-deploy.md`. Phase 4 includes only the load-bearing subset of "deep Kiosk" (PersonalKioskRule + LockRule + typed PTB wrapper + live solutions captures); speculative depth (FloorPriceRule, multi-PTB variants, combinatorial test coverage) is deferred to v1.1.

---

## Problem Frame

Phase 4 (6/11–6/20) was originally planned as full Kiosk integration + mainnet redeploy + e2e demo recording for a 1-dev team in 10 days. Dialogue pressure-testing during `/ce-brainstorm` confirmed that Sui Overflow 2026 judges the submission twice on distinct dates: 6/21 evaluates the polished pitch artifact (video + repo + README + testnet URL), and 8/27 triggers a separate prize-tier gate for mainnet liveness (see Dependencies/Assumptions for the handbook clause). Trying to make mainnet live by 6/21 spends ~6–8 days of Phase 4 critical path on ceremony (WAL purchase, mainnet contract publish, mainnet UI wiring, e2e re-verification) that does not change the 6/21 score, while the 7/22–8/27 window offers 67 days of soak time for the same work.

Separately, the Phase 3 racetrack scene (plan-006: sky, bloom, kerbs, FOV pump, tire smoke, intro orbit, countdown, asphalt, foliage) is the strongest single asset in the repo but is currently disconnected from the publish/buy flow. Surfaced as a Kiosk demo payload, it produces a "buy → drive" sequence no other Sui 3D NFT submission can match — and the D-013 "protocol-level royalty enforcement" claim is currently invisible to evaluators (hidden in wallet popups + Sui Explorer tabs they may not open during a 30-second skim).

The "deep Kiosk integration" framing was pressure-tested in dialogue and most depth components scored low ROI for the 6/21 submission. Only PersonalKioskRule + LockRule on TransferPolicy are load-bearing for the D-013 pitch claim; the rest is speculative depth that violates the project's stated "reject speculative complexity" preference.

---

## Actors

- A1. Creator (Tom): publishes a Model3D, sets royalty policy, lists for sale
- A2. Buyer (Marcus): browses listed Model3Ds, purchases, drives the bought model in `/track`
- A3. Judge: scans the 6/21 submission (video + repo + README + testnet URL); separately evaluates mainnet liveness by 8/27
- A4. 1-dev team (the user): owns all of Phase 4 sequentially; no parallelization assumed

---

## Key Flows

- F1. Race-on-mint demo arc (the recorded video)
  - **Trigger:** Demo recording session (6/19–6/20)
  - **Actors:** A1, A2
  - **Steps:**
    1. Marcus opens marketplace browse
    2. Sees a car Tom listed earlier (pre-baked, not live during recording — see R11a)
    3. Clicks Buy, signs one wallet popup
    4. On tx confirmation (not on sign), UI shows a 1–2 second success interstitial ("Purchased. Loading your car…" with tx hash visible). If tx is still pending after 3s, a "Confirming on Sui… ~5s" pending state with spinner. Then UI auto-navigates to `/track` with the purchased model loaded as the drivable car
    5. Marcus drives the car live (manual control) for a few seconds; the racetrack scene must be controllable enough for a non-expert to complete a 5-second straight without visually failing (verified at recording rehearsal per R11)
    6. Screen overlay renders the royalty receipt (creator address, amount, tx hash short-link) triggered by the on-chain royalty event, per R10
    7. Marcus returns to marketplace, clicks "Who made this?" to surface Tom's profile (per R8)
  - **Outcome:** A single take captures Sui ownership + Walrus storage + Kiosk royalty + Babylon playability in one continuous sequence
  - **Covered by:** R3, R4, R5, R5a, R8, R10, R11, R11a

- F2. Mainnet pre-bake (no execution in Phase 4)
  - **Trigger:** Phase 4 close (6/20)
  - **Actors:** A4
  - **Steps:** (1) Idempotent mainnet deploy automation committed to repo; (2) static mainnet network config file committed as placeholder; (3) script dry-run verified on testnet (proves correctness without spending real WAL); (4) one rehearsal mainnet deploy of a *throwaway* package (different module name, no Walrus dep) to surface mainnet-specific surprises (gas calibration, RPC behavior, finality timing); (5) script NOT executed against the real mainnet package
  - **Outcome:** Mainnet deploy is one command + one WAL purchase away post-7/22, with mainnet-specific failure modes already discovered under Phase 4 cognitive context
  - **Covered by:** R13, R14

  *Note: post-7/22 deploy execution + milestone gating + bug severity matrix + WAL acquisition runbook live in `docs/runbooks/mainnet-deploy.md`; not in this requirements doc.*

---

## Requirements

**Move contract v2 (Kiosk-compatible)**

- R1. Redesign `Model3D` as `key + store` (Kiosk-compatible). Phase 2 testnet `share_object` Model3D objects are abandoned without a migration entry function; README adds a one-line note that v1 testnet data is not migrated. **Pre-flight verification (Phase 4 day 1):** search the user's Twitter, Discord, dev-logs, and prior pitch materials for references to Phase 2 testnet mint object IDs or transaction hashes; if any are found, add specific mitigation (a one-line "abandoned" addendum on the referencing post, or include a v1.1 migration item in the public roadmap).
- R2. Capture `UpgradeCap` on each publish:
  - **Testnet UpgradeCap** held by a hot dev wallet (acceptable — testnet is throwaway).
  - **Mainnet UpgradeCap** held by a hardware wallet (e.g., Ledger) OR Sui Multisig (≥2-of-3). Mainnet UpgradeCap holder identity + custody mechanism must be decided before `pnpm deploy:mainnet` execution post-7/22.
  - **Post-v1.1 decision point:** after L2 Derivative ships, decide whether to destroy the mainnet UpgradeCap (immutable contract, no upgrade path) or retain for further evolution.
  - Document upgrade ABI rules (additive-only on public struct fields; no field reorders) so v1.1 L2 Derivative ships via `sui client upgrade`, not republish-and-burn.
- R3. Provide one Move entry function that atomically constructs + places + lists a Model3D (a single PTB on the frontend side, one wallet popup). **Rationale:** atomicity minimizes wallet interactions to one popup per F1 step 3 choreography. Standalone `list`, `delist`, and `take_with_policy` are deferred to v1.1 per Scope Boundaries.

**TransferPolicy + Kiosk rules**

- R4. TransferPolicy carries exactly three rules: RoyaltyRule (creator-set bps, capped per D-004 at 30%), LockRule (item cannot leave the Kiosk except via purchase), PersonalKioskRule (KioskOwnerCap is soulbound — prevents royalty bypass via cap transfer).
- R5. Buyer purchase PTB includes `confirm_request` against all three attached rules. PTBs that omit `confirm_request` must fail loudly (transaction abort surfaced in UI), not silently leave stuck objects.
- R5a. Frontend handles three buyer-side failure modes: (a) wallet popup rejected by user, (b) on-chain tx abort (including missing `confirm_request`), (c) network timeout during tx submission. All three surface as a toast with a Retry CTA that re-attempts from the current step. All three leave the user on the browse surface with the listing still visible (not on a dead state).

**Frontend integration**

- R6. Typed PTB builder wrapper module exists from day 1 of v2 Kiosk integration. All Kiosk-related PTBs (mint+place+list, purchase, browse query support) go through it. Returns typed handles for struct-typed Kiosk values (Kiosk, KioskOwnerCap, TransferPolicy, TransferRequest).
- R7. Single-network testnet build for the 6/21 submission. No runtime network switcher UI. Per-network configuration (package id, Walrus aggregator URL, upload-relay URL, WAL token type) is read from a build-time network config file.
- R8. Browse query for "all currently listed Model3D" uses a simple event-indexer pattern (shares the same events stream the royalty overlay subscribes to). No `Marketplace` shared registry struct in v1.
  - **Card schema:** each listing card shows thumbnail (or render snapshot), model name, creator address (abbreviated), price in SUI, royalty bps
  - **Empty state:** "No models listed yet — visit `/forge` to create one"
  - **Sort order:** most-recent listing first
  - **"Who made this?" interaction:** inline creator address on the card is clickable; opens a creator detail card showing other listings by that creator + a Sui Explorer link to the creator's address

**Demo recording + pitch evidence**

- R9. No Enoki sponsored tx in v1. Buyer pays real gas; the on-screen gas line in the wallet popup is narrated in the demo as an authenticity beat.
- R10. On-screen royalty receipt overlay renders when the frontend observes an on-chain royalty event whose buyer address matches the currently-connected wallet AND whose tx digest matches the digest returned from the wallet's `signAndExecuteTransaction` for the current session's purchase. Shape: `+<amount> SUI from <buyer-abbrev> → <creator-abbrev>` with a tx hash short-link.
  - **Positioning:** bottom-center of the viewport, 24px above the bottom edge, rendered above the Babylon canvas z-layer (via React portal)
  - **Contrast:** semi-opaque dark pill (background ≈70% black) behind white text — readable on any scene background (bright sky to dark asphalt)
  - **Animation timing:** fade-in over 200ms; hold 2.5 seconds (minimum legibility window for reading both addresses + targeting the tx-hash click); fade-out over 1 second
  - **Stacking rule:** if a second event arrives during an in-progress fade, the new toast replaces the in-progress one (no vertical stack)
  - **Mismatch filter:** events whose buyer address does NOT match the connected wallet are suppressed entirely (no render)
- R11. The 6/21 demo video is recorded **no-cut** (single take) at 90-second main version. (The 30-second trailer cut from this master take is a Phase 5 polish deliverable — ensure the master take's first 30 seconds contain the full buy → drive → royalty-receipt sequence so a trailer cut is possible without re-shoot.) Two distinct wallets/addresses (Tom + Marcus) both installed in ONE Slush extension in ONE Chrome window; the Slush account-switcher dropdown is part of the visible choreography ("now switching to Marcus's account"). Lower-thirds identify the two-actor narrative on screen. 1-wallet-plays-both-roles (single Sui address pretending to be two people) is explicitly rejected — Tom and Marcus must be different addresses on-chain.
  - **Slush legibility:** dropdown text must be readable at 1080p without zoom; verified at rehearsal time
  - **Slush latency fallback:** if Slush account-reload latency exceeds 2 seconds in rehearsal measurement, the lower-thirds text overlay carries the actor-switch signal — dropdown animation becomes secondary
  - **Pre-recording verification:** measure Slush account-switch latency under testnet conditions during day-1 Phase 4 verification
- R11a. Race-on-mint demo arc mitigations (no-cut take has 3 coupled failure modes — event indexer + overlay + recording continuity):
  - **Pre-bake Tom's listing:** Tom publishes + lists his Model3D days before recording; only Marcus's purchase tx is live during the take. Removes Walrus relay outage as a take-time failure mode.
  - **Event-replay fallback:** record successful royalty event payloads from a test run; if live subscription drops during the take, replay them into the overlay (purist judges won't notice).
  - **Pre-recorded "belt and suspenders" backup cut:** keep a 2-cut version (buy → cut → drive) recorded by 6/19 as submission fallback if no-cut take isn't clean by 6/20.
  - **Kill-switch decision rule:** "attempted 10 takes, none fully clean → accept best take with one micro-cut."
  - **Phase 3 racetrack verification:** Phase 4 day-1 task — verify the racetrack scene mounts cleanly after auto-navigation from purchase flow (not assumed; tested explicitly).
- R12. Kiosk PTB pattern solutions doc captures each non-trivial PTB pattern at the moment it lands (failing-first-attempt + the fix), not as a post-Phase-4 retrospective.

**Mainnet pre-bake (no execution in Phase 4)**

- R13. Idempotent mainnet deploy automation committed to repo by 6/20. The script publishes the Move package, captures PackageID + UpgradeCap + Publisher, creates TransferPolicy with the R4 rule set, and writes addresses to the mainnet network config file. **Key custody:** signing key passed via environment variable; never written to disk; never committed. **Testnet dry-run + rehearsal deploy** use a purpose-made throwaway keypair distinct from the mainnet signing key. **Execution policy:** see `docs/runbooks/mainnet-deploy.md` for the post-7/22 milestone-gate, bug severity matrix, WAL acquisition timing, and D-028 ADR.
- R14. Static mainnet network config file committed as placeholder by 6/20 (real PackageID + UpgradeCap + TransferPolicy object ID are filled after the script's eventual post-7/22 execution). The committed file contains only derived public addresses — never key material.

---

## Acceptance Examples

- AE1. **Covers R3, R4, R5.** Given Tom is logged in with a connected wallet, when Tom calls the mint+place+list entry function with valid Model3D fields and a chosen royalty bps, the resulting PTB consumes exactly one wallet popup and the resulting transaction places the Model3D in Tom's personal Kiosk with all three rules attached and visible on Sui Explorer.
- AE2. **Covers R5, R5a.** Given a buyer constructs a purchase PTB but omits `confirm_request`, the transaction aborts on-chain, the frontend catches the inner Move abort (not just the outer PTB status), and surfaces a toast with the abort reason + Retry CTA. The user is left on the browse surface with the listing still visible.
- AE3. **Covers R10.** Given Marcus completes a purchase, when the frontend observes the corresponding on-chain royalty event (matched on tx digest), the royalty receipt overlay renders within 5 seconds of *event receipt by the frontend* (not of tx confirmation — indexer tail latency is uncontrollable and tracked separately). Hold time = 2.5 seconds; fade-out = 1 second. "Tx confirmation" in this AE means: wallet-returned tx digest is included in a checkpoint observable via `SuiJsonRpcClient.waitForTransaction`. (5s budget covers Sui finality 1.5-3s + backend poll 1s + frontend poll 1s; resolved 2026-05-19 over a 2s alternative — see plan-007 Resolved Decisions for demo-timing rationale.)
- AE4. **Covers R11.** Given a final demo recording, when reviewed, the video has zero hard cuts between "Marcus clicks Buy" and "Marcus is driving the bought car" — the entire arc is one continuous take. (Backup cut per R11a is held in reserve, not submitted unless no-cut take fails per R11a kill-switch.)

---

## Success Criteria

- 6/21 submission: testnet contract live with Kiosk + TransferPolicy + all three rules attached; race-on-mint demo video (90s master take) published on YouTube; README + GitHub repo + testnet URL + Sui Explorer evidence links present; submission posted to overflow.sui.io portal
- README at 6/21 explicitly frames the mainnet-by-8/27 plan as deliberate sequencing, not absence — example phrasing: "mainnet deploy is one command + ~10 WAL away, gated on demo-stability per `docs/runbooks/mainnet-deploy.md`." Prevents crypto-skeptic judges from reading testnet-only as "team didn't ship."
- A judge watching only the first 30 seconds of the trailer (Phase 5 cut from the master take) can correctly identify the differentiator (buy → drive sequence with visible protocol-level royalty enforcement)
- 8/27 winners date: mainnet contract deployed AND demo URL switched to mainnet build, OR a documented milestone-gated decision to defer (per `docs/runbooks/mainnet-deploy.md` + D-028) with a Phase 5+ recovery plan visible in the README
- Downstream `ce-plan` handoff: every R-ID has a clearly testable behavior or an explicit reason it is structural; no "what does Phase 4 ship?" question survives

---

## Scope Boundaries

- L2 Derivative struct + entry functions (D-013 deferral)
- FloorPriceRule, KioskExtensions, multi-creator collections
- Multi-PTB variants beyond the demo path: standalone `list` (split from mint), `delist`, `take_with_policy`
- Combinatorial Kiosk rule test coverage (Phase 4 covers demo happy path only)
- Sponsored tx via Enoki Pro / Sponsored Add-on (revisit in Phase 5 if needed)
- Mainnet WAL purchase (executed at mainnet deploy moment post-7/22, per runbook; not in Phase 4)
- Mainnet deploy execution itself (per runbook; not in Phase 4)
- `Marketplace` shared registry struct or cross-Kiosk discovery indexer
- Runtime network switcher UI
- 30-second trailer cut from the master take — Phase 5 polish work
- Frontend pitch-deck visual assets (Sotheby's provenance card, software escrow framing slide) — Phase 5
- 30-item Roadmap.md — Phase 5
- Kiosk SDK gRPC migration (post-submission per D-019)
- Seal encryption integration (Stretch A, post-Phase 4)
- Forensic watermark (Stretch B, post-Phase 4)
- 1-wallet-plays-both-roles demo (rejected — weakens two-actor narrative per D-013)
- Migration `delete_v1` entry function for Phase 2 testnet objects (one-line README note instead)
- Scripted input-replay system for Marcus's drive sequence (rejected — adds Phase 4 scope; live drive with R11 quality bar instead)

---

## Key Decisions

- **Variant A — mainnet completely deferred to post-7/22**. Reclaims ~6–8 days of Phase 4 critical path. Pitch line "we shipped mainnet at submission" is given up in exchange for higher 6/21 polish + bug-free demo. Rationale: 6/21 evaluates pitch artifact; 8/27 evaluates mainnet tier; spending pitch-window days on mainnet ceremony has poor ROI for 6/21.
- **Reclaimed 6–8 days partitioned**: ~4 days demo polish (event indexer + overlay + script) / ~1 day recording buffer (no-cut take risk per R11a) / ~1 day Phase 5 early-start (README + Roadmap draft). Adjust if R11a mitigations (pre-bake, event-replay, backup cut, day-1 verification) eat more than 4 demo-polish days.
- **Race-on-mint demo arc adopted as Phase 4 centerpiece**. Reclaimed days go to event-indexer + royalty overlay + recording rehearsal, NOT to deeper Kiosk integration or earlier Phase 5 start. Rationale: F4.4 (racetrack as payload) was the single most unique idea surfaced in ce-ideate; the resulting "buy → drive" sequence is not reproducible by other Sui 3D submissions.
- **Kiosk depth pruned to load-bearing subset**: only PersonalKioskRule + LockRule + RoyaltyRule on TransferPolicy. FloorPriceRule, multi-PTB variants, and combinatorial test coverage deferred to v1.1. Rationale: dialogue pressure-test showed PersonalKioskRule is load-bearing for the D-013 pitch claim (royalty bypass defense); LockRule is near-free signal; rest is speculative depth violating "reject speculative complexity."
- **No Enoki sponsored tx in v1**. Buyer pays real gas; on-screen gas line is an authenticity beat. Rationale: judges are evaluators not users — visible gas reads as authenticity, not friction; saves $100–220 and removes a provisioning blocker (account verification, sponsored-tx PTB allowlisting, cap monitoring, key rotation).
- **No runtime network switcher**. Single testnet build for 6/21; single mainnet build post-7/22. Rationale: D-009 puts each network on a separate judging date; runtime switch is a known demo-day failure mode with no user-side benefit.
- **Mainnet deploy milestone-gated, not date-gated**. Execution policy + trigger definition + bug severity matrix in `docs/runbooks/mainnet-deploy.md` + D-028 ADR (supersedes D-009's implicit calendar gating).
- **Phase 2 testnet `share_object` Model3D objects abandoned without migration**. README one-line note + R1 pre-flight visibility verification instead of `delete_v1` entry function. Rationale: testnet is throwaway by 8/27; cost of migration code exceeds the benefit. v1.1 backlog item added for schema migration patterns (see Outstanding Questions).
- **Two-actor demo narrative preserved with one-Chrome / one-Slush / two-accounts choreography**. Tom + Marcus are distinct Sui addresses (so the on-chain royalty event payload genuinely shows from→to between two addresses); both wallets live in one Slush extension and the dropdown switch is part of the visible recording. 1-wallet-plays-both-roles rejected. Rationale: keeps OBS scene setup simple while preserving the on-chain proof that royalty crossed between two real addresses; the account-switch act itself doubles as a Slush sub-pitch.
- **Default royalty bps for the demo = 500 (5%)**. Rationale: industry-standard creator royalty (matches OpenSea 2.5–10% default range); large enough to render visibly in the on-screen receipt overlay; not so large it reads as punitive.
- **Royalty receipt overlay shape = `+<amount> SUI from <buyer-abbrev> → <creator-abbrev>` + tx hash short-link**. Rationale: showing both sides makes the royalty enforcement evidence concrete; both addresses are in the event payload at zero extra implementation cost; from→to reads as a clear payment statement to crypto-skeptic judges who may not parse a one-sided amount.
- **Live drive for F1 step 5, not scripted replay**. Rationale: consistent with the rest of the demo's authenticity beats (real gas, real Slush, no editing); R11 quality bar makes it verifiable at rehearsal; scripted replay would add 1–2 days of Phase 4 implementation that competes with overlay work.

---

## Dependencies / Assumptions

- **Sui Overflow 2026 handbook clauses (verbatim quote required — TODO: paste from handbook URL during Phase 4 day-1):**
  - *Final submission date:* `[paste exact handbook text confirming 6/21 = submission close]`
  - *Winners date + mainnet eligibility:* `[paste exact handbook text confirming 8/27 = winners + mainnet tier for 100% prize]`
  - *Source URL:* https://mystenlabs.notion.site/overflow-2026-handbook (replace with the canonical link captured during reread)
  - *Note:* If handbook clauses surface nuance (e.g., "testnet-only submissions scored lower in technical category"), revisit Variant A. Currently treated as confirmed per user's prior reread.
- Sui Kiosk SDK builder API (`KioskTransaction`, `TransferPolicyTransaction`) is the canonical 2026 path; pre-2026 standalone function API not used
- `@mysten/sui@2.16.x` JSON-RPC client path (per D-019); no gRPC migration in Phase 4
- Walrus testnet upload relay remains operational through 6/21 (R11a pre-bake mitigates relay outage at take time)
- Phase 3 racetrack scene (`frontend/src/track/`) mount/teardown stability is **verified at Phase 4 day 1** per R11a (not assumed)
- D-013 narrowing remains accepted (L2 Derivative deferred to v1.1)
- 1-dev sequential execution; no parallelization assumed
- Vercel (or equivalent) free tier sufficient for hosting the testnet build

---

## Outstanding Questions

### Deferred to Planning

- [Affects R10] [Technical, resolve in ce-plan FIRST task] Event subscription mechanism decision: backend long-poll vs frontend direct polling vs `subscribeEvent` websocket. `SuiJsonRpcClient` supports `subscribeEvent` but reliability across the 90-second recording window matters more than mechanism elegance. Resolve before the rest of R10 spec is implemented. Pre-warm strategy (subscribe several seconds before recording starts) is the standard live-demo mitigation.
- [Affects R6] [Technical] Should the typed PTB wrapper return `Transaction` directly or a `TxResult<{ kioskCap, model3dResult }>` envelope that callers compose?
- [Affects R8] [Technical] Event indexer storage: in-memory only (rebuild on server restart) vs SQLite persistence vs Postgres. Defer to ce-plan with bias toward simplest (in-memory).
- [Affects R3, R4] [Technical] Move entry function signature for `mint_and_list`: parameters order, payment `Coin<SUI>` vs raw SUI value, `duration_ms` retention per D-016.

### v1.1 Backlog (post-hackathon, not Phase 4)

- **Schema migration patterns for `Model3D` evolution.** Define an upgrade-or-migrate path so future struct changes don't strand creator content. Rationale: the Phase 2-abandonment decision was correct for testnet throwaway, but a "we abandon when schema changes" pattern would contradict the creator-economy positioning long-term.
