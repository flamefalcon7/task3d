---
date: 2026-05-19
type: feat
title: "Phase 4 — Kiosk integration + race-on-mint demo centerpiece"
origin: docs/brainstorms/2026-05-19-phase-4-kiosk-race-on-mint-requirements.md
status: active
---

# Phase 4 — Kiosk integration + race-on-mint demo centerpiece

## Summary

Implement the Phase 4 Kiosk + TransferPolicy slice of the Sui Overflow 2026 submission on testnet (6/11–6/20). Centerpiece: a 90-second no-cut "buy a Model3D, drive it 5 seconds later" demo arc with on-screen royalty receipt overlay. Mainnet deploy is pre-baked (script + placeholder config + rehearsal-deploy of a throwaway package) but NOT executed in Phase 4 — execution policy lives in `docs/runbooks/mainnet-deploy.md`. Single-popup mint via one PTB. Three TransferPolicy rules (RoyaltyRule + LockRule + PersonalKioskRule). No Enoki sponsored tx. No runtime network switcher. Two distinct wallets in one Slush extension for the demo.

---

## Problem Frame

Phase 3 shipped the racetrack scene (sky + bloom + tire smoke + intro orbit + countdown + asphalt + foliage) but it's disconnected from the publish/buy flow. The D-013 "protocol-level royalty enforcement" pitch claim is currently invisible to evaluators — buried in wallet popups + Sui Explorer tabs judges may not open during a 30-second skim. Phase 4 closes both gaps: Kiosk + TransferPolicy makes the royalty enforcement real on-chain, and the race-on-mint demo arc makes it visible (Spotify-style receipt overlay fires at purchase; buyer drives the bought car 5 seconds later in the existing /track scene). Reclaimed days from deferring mainnet ceremony to post-7/22 go to event indexer + overlay + recording rehearsal, not deeper Kiosk depth or earlier Phase 5 start.

---

## Origin Document

`docs/brainstorms/2026-05-19-phase-4-kiosk-race-on-mint-requirements.md` (rewritten 2026-05-19 after a 7-persona `/ce-doc-review` pass — 23 decisions applied, 2 skipped, R15+AE5+F3 extracted to `docs/runbooks/mainnet-deploy.md`, D-028 ADR added).

**Carry-forward from origin (cite by R-ID through the plan):**

- 16 requirements (R1–R14 + R5a and R11a) across Move contract / TransferPolicy / frontend integration / demo recording / mainnet pre-bake. R15 not in origin (extracted to runbook).
- 4 acceptance examples (AE1–AE4). AE5 extracted to runbook.
- 4 actors (A1 Tom creator, A2 Marcus buyer, A3 Judge, A4 1-dev).
- 2 flows (F1 race-on-mint arc, F2 mainnet pre-bake).
- 8 Dependencies/Assumptions including the handbook verbatim quote placeholder (must be filled at U1).
- Scope Boundaries: L2 Derivative + FloorPriceRule + multi-PTB variants + combinatorial Kiosk rule tests + Enoki + Marketplace registry struct + runtime network switcher + trailer cut + Seal/watermark + 1-wallet demo all deferred (see origin).

---

## High-Level Technical Design

This section illustrates the intended approach and is directional guidance for review, not implementation specification.

### F1 race-on-mint demo arc — sequence

```mermaid
sequenceDiagram
    autonumber
    participant M as Marcus (browser, Slush account 2)
    participant FE as Frontend (overflow.app testnet)
    participant BE as Backend (event indexer)
    participant SUI as Sui testnet
    participant W as Walrus testnet relay
    participant T as /track (Babylon scene)

    Note over M, T: Pre-condition (per R11a): Tom listed model days before; only Marcus's purchase is live.

    M->>FE: opens browse page
    FE->>BE: poll listings (every 2s, browse-freshness cadence)
    BE-->>FE: listings array
    FE-->>M: renders card grid (R8 + F16 "Who made this?" affordance)
    M->>FE: clicks Buy on Tom's car
    FE->>SUI: signAndExecuteTransaction(purchase_with_kiosk PTB chain)
    Note right of SUI: PTB 5-call chain (built by U5): purchase_with_kiosk →<br/>kiosk::lock → royalty_rule::pay → personal_kiosk_rule::prove →<br/>transfer_policy::confirm_request (all 3 rule receipts satisfy cardinality)
    SUI-->>M: wallet popup (real gas, per R9)
    M-->>SUI: signs
    SUI-->>FE: tx digest
    FE-->>M: interstitial "Purchased. Loading your car..." + 8+4 tx hash link (z-index 1000)
    SUI-->>BE: emits RoyaltyPaid event (field shape resolved by U1 spike)
    BE-->>FE: poll surfaces event (royalty cadence: 1s during recording window)
    FE->>FE: filter event by session disambiguator (per U1 spike outcome) + connected wallet match
    FE-->>M: RoyaltyReceiptOverlay renders (z-index 9999, above interstitial)
    FE->>T: auto-navigate /track?model=0x...
    T->>BE: GET /api/listings/{model_id} → Walrus blob_id (Kiosk-protocol-level query, NOT useOwnedVariants Access path)
    T->>W: fetch GLB via Walrus aggregator (Tom's pre-published blob)
    W-->>T: GLB bytes
    T-->>M: spawns car as drivable Babylon mesh
    M->>T: drives for ~5 seconds (live, per R11 quality bar)
    Note over M, T: Marcus returns to browse, clicks "🔍 Who made this?" → CreatorDetail side panel slides in
```

### Event indexer + overlay — data shape

```
Backend ring buffer per topic (in-memory, N=100):
  topic "model3d::ListingCreated"  → poll Sui every 2s (browse freshness)
  topic "model3d::ListingDelisted" → poll Sui every 2s
  topic "model3d::RoyaltyPaid"     → poll Sui every 1s during recording window (AE3 budget)

Frontend poller (per topic):
  cursor: { txDigest, eventSeq }
  every 1000ms: GET /api/events/{topic}?since={cursor}&buyer={addr}
  pre-warm: first poll fires on component mount + on wallet-sign callback
  replay: loadReplayEvents(jsonPath, txDigest, buyerAddress) → ReplayEvent[]
          (substitutes {{TX_DIGEST}} + {{BUYER_ADDRESS}} before .replay() call)

RoyaltyReceiptOverlay subscriber (filter — exact predicate TBD by U1 spike):
  receives event → check session disambiguator (tx_digest OR event_seq+sender OR nonce OR buyer-only)
                AND event.buyer == connectedWallet.address
  → if match: render toast (positioning + contrast + timing per R10)
  → else: suppress
```

### Move contract structure (v2)

```
contracts/model3d/sources/model3d.move (v2)
├── struct Model3D has key, store          // R1: was share_object → now key+store for Kiosk
├── struct LicenseTerms has store
├── struct Access has key                   // soulbound; Phase 2 unchanged (NOT discovered via this in /track per Kiosk-protocol KTD)
├── struct MODEL3D                          // OTW for Publisher
├── struct RoyaltyPaid has copy, drop       // field set TBD per U1 spike outcome
├── fun init(otw, ctx)                      // creates Publisher
├── public entry ensure_creator_kiosk(...)  // PersonalKiosk helper, one-time per creator
├── public entry ensure_transfer_policy(publisher, ctx)  // attaches all three rules
├── public entry mint_and_list(...)         // R3: atomic mint+place+list, ONE wallet popup
├── public fun   purchase_with_kiosk(...)   // R5: returns (Model3D, TransferRequest) — NOT entry (return type non-droppable)
│                                            //      NO manual royalty split — RoyaltyRule handles it (per Kiosk-protocol KTD)
└── (Phase 2 publish_and_share + purchase_model_access REMOVED — testnet abandoned per R1)
```

---

## Output Structure

Tree is **representative, not exhaustive — total ~38 files across all units**. Per-unit `**Files:**` sections are authoritative for what each unit creates or modifies.

```
contracts/model3d/
├── sources/model3d.move                         (rewrite — U2/U3/U4 sequential)
├── tests/model3d_tests.move                     (rewrite — U2-U4 Move tests)
└── (UPGRADE.md, throwaway/* surfaced in per-unit Files)

frontend/src/
├── sui/
│   ├── kioskTxBuilders.ts                       (NEW — U5)
│   ├── eventPoller.ts                           (NEW — U8)
│   └── *.test.ts                                 (NEW)
├── browse/
│   ├── BrowsePage.tsx                           (REWRITE — U7; replaces useModelIndex/CollectionCard with Kiosk-listings grid)
│   ├── ListingCard.tsx                          (NEW — U7)
│   ├── CreatorDetail.tsx                        (NEW — U7)
│   └── *.test.tsx                                (existing tests REPLACED)
├── overlays/RoyaltyReceiptOverlay.tsx           (NEW — U8)
├── purchase/
│   ├── PurchaseFlow.tsx                         (NEW — U9 + U10)
│   └── PurchaseInterstitial.tsx                 (NEW — U10)
├── track/
│   ├── TrackPage.tsx                            (REFACTOR — U10; route param + Kiosk-protocol listing lookup; bypasses useOwnedVariants when ?model=)
│   └── useOwnedVariants.ts                      (REWRITE — Kiosk-protocol KTD: delete Access-based query, replace with PersonalKiosk content query OR delete entirely if `?model=` covers all paths)
├── config/network.ts                            (NEW — U14)
└── forge/ForgePage.tsx                          (refactor — U6)

backend/src/events/
├── eventPollerBase.ts                           (NEW — U7)
├── listingIndexer.ts                            (NEW — U7)
├── royaltyIndexer.ts                            (NEW — U8)
└── *.test.ts                                    (NEW)

backend/src/api/
├── listings.ts                                  (NEW — U7)
└── events.ts                                    (NEW — U8)

networks/{testnet,mainnet}.json                  (NEW — U13 + U14)
scripts/{deploy-mainnet,pre-bake-tom-listing,capture-replay-events}.ts  (NEW — U11 + U13)
docs/solutions/kiosk-ptb-patterns/*.md           (live captures per R12; per-unit owners below)
docs/reports/phase-4-{day-1-verification,rehearsal-notes,recording-report,mainnet-rehearsal,provisional-builders}.md  (NEW — U1, U11, U12, U13, U5)
pitch/recording-assets/{replay-events.json,tom-listing-info.txt,take-log.md,obs-scene.json,final-take.mov,backup-cut.mov}  (NEW — U11 + U12)

README.md                                         (update — U14 mainnet hedge per Success Criteria)
```

---

## Requirements Trace

| R-ID (origin) | Plan coverage |
|---|---|
| R1 Model3D as key+store + pre-flight visibility check | U1 verification + U2 struct rewrite |
| R2 UpgradeCap testnet hot / mainnet hardware-or-multisig | U2 (testnet capture via Sui CLI keychain wallet — NOT `SUI_MAINNET_DEPLOY_KEY`) + U13 (mainnet decision + abort guard if production key present during testnet publish) |
| R3 atomic mint+place+list entry function | U4 |
| R4 TransferPolicy with Royalty + Lock + PersonalKiosk | U3 |
| R5 confirm_request fails loudly | U4 + U6 PTB builder + tests |
| R5a buyer error states (wallet reject / tx abort / network timeout) | U9 |
| R6 typed PTB wrapper | U5 |
| R7 single-network testnet build | U14 |
| R8 browse query + card schema + empty state + sort + Who-made-this | U7 (frontend) + U7 (backend listings indexer) |
| R9 no Enoki sponsored tx | No active unit — Enoki sponsored tx never wired in Phase 2 and no new unit adds it in Phase 4; buyer pays real gas per R9 |
| R10 overlay positioning + contrast + stacking + animation timing + filter | U8 |
| R11 90s no-cut recording + Slush choreography + master-take composition for trailer | U12 (+ U1 day-1 Slush latency measurement) |
| R11a fallback set (pre-bake + event-replay + backup-cut + kill-switch + day-1 verification) | U1 racetrack verification + U11 pre-bake + U12 backup cut + U8 event-replay hook |
| R12 docs/solutions/kiosk-ptb-patterns.md live captures (named owners per unit) | U2 (model3d-key-store-migration.md) + U3 (transfer-policy-before-place.md) + U4 (confirm-request-hot-potato.md) + U6 (mint-and-list-ptb-shape.md) + U7 (event-poller-base-pattern.md) + U8 (eventpoller-replay-interface.md) |
| R13 idempotent mainnet deploy script + key custody + rehearsal | U13 (+ separate `SUI_MAINNET_REHEARSAL_KEY` env var) |
| R14 mainnet placeholder config | U13 |

| AE (origin) | Plan coverage |
|---|---|
| AE1 (R3, R4, R5) one popup, three rules attached, Explorer visible | U4 Move tests + U6 frontend integration test (dry-run on testnet) |
| AE2 (R5, R5a) missing confirm_request → loud abort + Retry CTA | U4 Move tests + U6 PTB negative test + U9 toast/Retry flow test |
| AE3 (R10) overlay renders within 5s of event receipt + 2.5s hold + 1s fade | U8 RoyaltyReceiptOverlay tests (resolved: 5s budget covers Sui finality 1.5-3s + backend poll 1s + frontend poll 1s + render; lands in `/track` driving moment by design) |
| AE4 (R11) zero hard cuts in final recording | U12 recording verification |

| F (origin) | Plan coverage |
|---|---|
| F1 race-on-mint demo arc | U7 (browse) + U6 (purchase PTB) + U9 (errors) + U10 (interstitial + nav + Kiosk-protocol listing lookup) + U8 (overlay) + U12 (recording) |
| F2 mainnet pre-bake | U13 |

---

## Implementation Units

### U1. Phase 4 day-1 verifications + handbook quote capture + tx_digest spike + U10-prelim

**Goal:** Verify the assumptions that gate all downstream work BEFORE Move/Kiosk implementation starts. **Plus** resolve the tx_digest availability question (U1 instead of "discover at U4") and prototype the `?model=` route shape as a U10-prelim subtask. Output goes to `docs/reports/phase-4-day-1-verification.md` with go/no-go on each.

**Requirements:** R1 (pre-flight visibility check), R11a (Phase 3 racetrack mount verification — descoped to "existing carousel variant" per F25), R11 (Slush latency measurement), Dependencies/Assumptions (handbook verbatim quote), Outstanding Question on tx_digest

**Dependencies:** None (this IS day 1)

**Files:**
- `docs/reports/phase-4-day-1-verification.md` (NEW — verification report)
- `docs/brainstorms/2026-05-19-phase-4-kiosk-race-on-mint-requirements.md` (update — paste handbook verbatim quote into Dependencies/Assumptions placeholder)
- `contracts/throwaway-spike/sources/spike.move` (NEW — 5-line Move module for tx_digest spike)

**Approach:**
1. **Public visibility check (R1)** — grep Twitter / Discord / dev-logs / prior pitch materials for Phase 2 testnet package ID + Phase 2 mint object IDs. Log findings; any positives → add 1-line abandon note to the referencing post.
2. **Phase 3 racetrack mount verification (R11a, descoped)** — boot dev server, hit `/track` with an existing carousel variant (NOT `?model=<id>` — that's the U10-prelim subtask). Pass/Fail criteria:
   - (a) Scene first frame renders within 2s of navigation (stopwatch)
   - (b) No JavaScript console errors on mount (devtools)
   - (c) Car mesh visible and controllable within 3s
   - (d) HUD elements (countdown, LapTimer) appear without z-fighting artifacts
   - Replan triggers: (a) fails → U10 adds loading spinner; (c) fails → U10 priority-1 before U7
3. **U1-prelim subtask: `?model=` route shape prototype** (0.5 day budgeted, replan to U10 if it eats more) — wire TrackPage to read `?model=<id>` query param, fetch listing's Walrus blob via stubbed backend, mount scene. Establish baseline that U10 will build on.
4. **Slush account-switch latency (R11)** — install Slush, create 2 throwaway testnet wallets, time dropdown switch 10x. Record p50 + p95. If p95 > 2s, plan the lower-thirds fallback.
5. **Handbook verbatim quote capture** — fetch Overflow 2026 handbook URL, paste exact text confirming 6/21 submission + 8/27 winners + mainnet tier, with source URL. Replace placeholder in origin doc.
6. **tx_digest Move spike** — `contracts/throwaway-spike/sources/spike.move` has a trivial entry fn `emit_test_event(ctx)` emitting a struct with all `TxContext`-accessible fields. Deploy to testnet, inspect event payload via `sui client events`. Decide:
   - **(a) tx_digest available** → keep RoyaltyPaid field as `tx_digest: vector<u8>`; U8 filter uses it
   - **(b) tx_digest unavailable** → switch to one of:
     - `event_seq + tx_sender` (unique within tx scope)
     - frontend-supplied `nonce: u64` parameter into `purchase_with_kiosk`
     - buyer-only filter (acceptable risk if OBS scene isolates concurrent test activity)
   - Decision feeds U2 RoyaltyPaid schema + U8 filter logic + U11 replay placeholder shape.

**Patterns to follow:** existing `docs/reports/` if present (else establish). Move spike module uses minimal struct + `event::emit` pattern from Sui framework.

**Test scenarios:** Test expectation: none — verification artifacts (report + spike output). The report itself is the deliverable.

**Verification:** Day-1 report committed with Go/No-go per check. Handbook quote replaces placeholder. tx_digest decision logged + downstream U2/U8/U11 updated to match.

---

### U2. Move contract v2 redesign + UpgradeCap discipline

**Goal:** Rewrite `model3d::model3d` with `Model3D` as `key + store`, strip Phase 2 entry fns, add MODEL3D OTW + `init` that creates Publisher, capture UpgradeCap to **dev's interactive Sui CLI keychain wallet (NOT `SUI_MAINNET_DEPLOY_KEY`)**.

**Requirements:** R1 (Model3D as key+store; Phase 2 share_object code removed), R2 (UpgradeCap + ABI rules — testnet uses interactive CLI keychain)

**Dependencies:** U1

**Files:**
- `contracts/model3d/sources/model3d.move` (rewrite)
- `contracts/model3d/tests/model3d_tests.move` (rewrite)
- `contracts/UPGRADE.md` (NEW — upgrade ABI rules)
- `frontend/src/sui/publishPtb.ts` + `purchaseAccessPtb.ts` + tests (delete — Phase 2 PTB files; replaced by U5)
- `docs/solutions/kiosk-ptb-patterns/model3d-key-store-migration.md` (NEW — first R12 capture: the key+store ability change + how Move-compile catches share_object holdovers)

**Approach:**
- Drop `Model3D has key` → `Model3D has key, store` (Kiosk compatibility)
- OTW: `struct MODEL3D has drop`; `init(otw: MODEL3D, ctx)` claims Publisher, transfers to deployer (= interactive CLI keychain wallet for testnet)
- `RoyaltyPaid` event struct: field set per U1 spike outcome (default: `{ buyer, creator, amount, model_id, tx_digest }` if (a); fallback shape if (b))
- Strip `publish_and_share()` and `purchase_model_access()`; delete Phase 2 frontend PTB files in same commit
- **Key custody guard rationale (R2 mechanism)**: testnet publish uses `sui client publish` via the interactive keychain — does NOT touch `SUI_MAINNET_DEPLOY_KEY` env var. U13 deploy script adds an abort guard for the inverse direction (refuses to run testnet target if `SUI_MAINNET_DEPLOY_KEY` is set).

**Test scenarios:**
- `init` creates exactly one `Publisher` object owned by sender
- `Model3D` has `key + store` abilities (compile-time + struct-tag)
- Phase 2 entry functions `publish_and_share` + `purchase_model_access` are absent (compile-time)
- `MODEL3D` OTW has only `drop`, non-public
- `RoyaltyPaid` event struct compiles + has expected fields (per U1 spike decision)
- README has the v1-testnet-abandoned note (grep verification)

**Verification:** `sui move build` clean; `sui move test` green; UPGRADE.md committed; testnet publish dry-run succeeds (real publish at end of U4); first R12 doc landed.

---

### U3. TransferPolicy bootstrap with three rules

**Goal:** `ensure_transfer_policy` consumes Publisher from U2, creates `TransferPolicy<Model3D>` + Cap, attaches `RoyaltyRule` + `LockRule` + `PersonalKioskRule`.

**Requirements:** R4 (three rules attached)

**Dependencies:** U2

**Files:**
- `contracts/model3d/sources/model3d.move` (add `ensure_transfer_policy`; constants block `MAX_ROYALTY_BPS = 3000` per D-004, `MIN_ROYALTY_AMOUNT_MIST = 1_000_000`)
- `contracts/model3d/tests/model3d_tests.move` (add TransferPolicy + rule tests)
- `contracts/model3d/Move.toml` (add `@mysten/kiosk` Move dep)
- `docs/solutions/kiosk-ptb-patterns/transfer-policy-before-place.md` (NEW — R12 capture: the TransferPolicy-MUST-precede-first-place gotcha + how to enforce order)

**Approach:**
- `ensure_transfer_policy(publisher: &Publisher, ctx)`: aborts if Publisher not Model3D's. Creates via `transfer_policy::new<Model3D>(publisher, ctx)`. Chains three rules. Shares policy as shared object. Transfers Cap to caller.
- Rules attached BEFORE first `place` anywhere (Kiosk gotcha)
- Document rule rationale inline → feeds R12 doc

**Test scenarios:**
- `ensure_transfer_policy` succeeds with correct Publisher → policy shared; Cap returned
- All three rules present (introspect via `transfer_policy::rules`)
- Wrong-type Publisher aborts (witness check)
- Royalty bps > 3000 aborts (D-004 cap)
- Royalty bps == 3000 succeeds
- Compile check: `transfer_policy::new` called before any `place` (static review)

**Verification:** `sui move test` green; testnet TransferPolicy creation via `sui client call` succeeds; Sui Explorer shows policy with three rules; second R12 doc landed.

---

### U4. `mint_and_list` (entry) + `purchase_with_kiosk` (public fun) (rule-driven royalty)

**Goal:** `mint_and_list` constructs + places + lists in one PTB (one popup). `purchase_with_kiosk` returns `(Model3D, TransferRequest)`. **Royalty is NOT computed/split in Move** — RoyaltyRule handles payment via `royalty_rule::pay` at the frontend builder layer (U5). Follows the Kiosk-protocol-level principle in KTDs.

**Requirements:** R3 (atomic mint+place+list, one popup), R5 (purchase emits TransferRequest; missing confirm_request aborts)

**Dependencies:** U3

**Files:**
- `contracts/model3d/sources/model3d.move` (add `ensure_creator_kiosk` + `mint_and_list` entry fns and `purchase_with_kiosk` public fn — the last one is non-entry because its return type contains the non-droppable `TransferRequest` hot potato)
- `contracts/model3d/tests/model3d_tests.move` (add purchase happy-path + missing-confirm_request abort + atomicity tests)
- `docs/solutions/kiosk-ptb-patterns/confirm-request-hot-potato.md` (NEW — R12 capture: TransferRequest hot-potato semantics + Move-side vs frontend-side responsibilities)

**Approach:**
- `ensure_creator_kiosk(ctx) → (Kiosk, PersonalKioskCap)`: PersonalKiosk helper for first-time creators
- `mint_and_list(...)`: **flat 13-param entry fn** (resolved decision; primitive args only — no struct-arg-pitfall exposure since no on-chain struct refs are passed in. PTB call site wraps args via TS named-object `Object.values()` for readability.)
- `purchase_with_kiosk(kiosk, payment: Coin<SUI>, model_id, ctx) → (Model3D, TransferRequest<Model3D>)`:
  - `public fun` (NOT `entry`) because it returns the non-droppable hot-potato `TransferRequest`. Frontend PTB chains the 5 calls; R3 "ONE wallet popup" is enforced by PTB composition, not by entry-fn boundary.
  - Calls `kiosk::purchase`
  - Returns the hot potato TransferRequest (does NOT split payment / does NOT transfer to creator — those are RoyaltyRule's job, satisfied by U5's PTB chain)
  - Emits `RoyaltyPaid` event with field shape per U1 spike
- Frontend (U5) PTB 5-call chain: `purchase_with_kiosk → kiosk::lock(buyer_kiosk, buyer_cap, policy, item) → royalty_rule::pay(policy, &mut request, royalty_coin) → personal_kiosk_rule::prove(&buyer_kiosk, &mut request) → transfer_policy::confirm_request(policy, request)`. All 3 rules attached at U3 (royalty + lock + personal_kiosk) each require their own receipt; `confirm_request` asserts `receipts.length() == rules.length()` (cardinality) AND each receipt's `TypeName ∈ rules` (membership). Skipping any receipt step aborts `EPolicyNotSatisfied`; omitting `confirm_request` itself fails at compile time via Move 2024's drop-check on the un-droppable `TransferRequest`. See `docs/solutions/kiosk-ptb-patterns/confirm-request-hot-potato.md` (R12 capture).
- Atomicity test: `mint_and_list` tx contains exactly one Mint + one Place + one List event

**Execution note:** Test-first. Write Move integration test (Tom mints+lists, Marcus purchases via builder, RoyaltyPaid emitted, royalty arrived at creator address through RoyaltyRule mechanism) BEFORE implementing entry functions. Test-first surfaces Move-side bugs (event payload shape, abort code wiring, atomicity) at Move-compile time. PTB struct-arg pitfall (learnings #1) is mitigated separately by U5's dry-run-from-day-1 discipline.

**Test scenarios:**
- **Covers AE1.** Tom calls `mint_and_list` → tx has one Mint + one Place + one List event; Model3D in Tom's PersonalKiosk; three rules attached on policy (visible on Explorer)
- **Covers AE2.** Buyer PTB omits `transfer_policy::confirm_request` → tx aborts (TransferRequest hot potato unconsumed); no RoyaltyPaid event; ownership unchanged
- Happy purchase via U5's full PTB chain → `RoyaltyPaid { buyer, creator, amount: 0.05 SUI, ... }`; Tom balance += royalty via RoyaltyRule's `pay`; Marcus owns Model3D
- Royalty math is rule-internal (read from `royalty_rule::current_royalty(policy)` not from manual split); test that the rule's computed royalty matches expected bps × price
- LockRule prevents `take` after purchase
- PersonalKioskRule prevents Cap transfer (soulbound at type level)
- `royalty_bps > 3000` in `mint_and_list` aborts

**Verification:** `sui move test` green; testnet `sui client publish` succeeds (real v2 publish); manual end-to-end mint + purchase succeeds with royalty flowing through rule; new testnet package ID written to `networks/testnet.json`; third R12 doc landed.

---

### U5. Typed `kioskTxBuilders.ts` PTB wrapper module

**Goal:** Typed PTB wrapper layer all Kiosk-related frontend calls thread through. Returns `TxResult<{ tx, model3dResult, ... }>` envelopes. Prevents PTB struct-arg pitfall (learnings #1) from recurring. **U5 owns the rule-driven royalty PTB chain** (per Kiosk-protocol KTD).

**Requirements:** R6 (typed wrapper from day 1)

**Dependencies:** U4

**Files:**
- `frontend/src/sui/kioskTxBuilders.ts` (NEW)
- `frontend/src/sui/kioskTxBuilders.test.ts` (NEW)
- `frontend/package.json` (add `@mysten/kiosk` ^0.x dep)
- `docs/reports/phase-4-provisional-builders.md` (NEW — testnet-RPC-outage fallback tracker per F26)
- `docs/solutions/kiosk-ptb-patterns/event-poller-base-pattern.md` (NEW — R12 capture for backend polling pattern; landed during U7 actually but listed here for cross-reference)

**Approach:**
- `buildMintAndListPtb(args)`: wraps `tx.moveCall('model3d::model3d::mint_and_list', ...)`. ALL struct args via `tx.object(objectId)`, NEVER `tx.pure.*`.
- `buildPurchaseWithKioskPtb(args)`: emits FULL 5-call chain: `purchase_with_kiosk` → `kiosk::lock` (against buyer's PersonalKiosk, with `policy` reference) → `royalty_rule::pay(policy, request, royalty_coin)` → `personal_kiosk_rule::prove(buyer_kiosk, request)` → `transfer_policy::confirm_request(policy, request)`. All five calls internal to the builder — frontend callers cannot accidentally omit any step. Per-call rationale + cross-references in `docs/solutions/kiosk-ptb-patterns/confirm-request-hot-potato.md`. The 5-call shape (not 3) is dictated by U3's policy bootstrap which attaches three rules.
- `TxResult<T>`: `{ tx, handles: T, metadata: { target, expectedEvents } }`
- Dry-run-from-day-1: every new builder ships with a `client.dryRunTransactionBlock` smoke test against LIVE testnet. **Fallback when testnet RPC unavailable**: builder lands marked PROVISIONAL in `docs/reports/phase-4-provisional-builders.md`; CANNOT merge to main until dry-run green. Multiple RPC endpoints configured in test runner (Mysten public + 1 backup).

**Execution note:** Test-first for dry-run smoke tests.

**Test scenarios:**
- `buildMintAndListPtb` valid args → dry-run on testnet succeeds; simulated tx contains exactly one Move call
- `buildPurchaseWithKioskPtb` → tx contains FIVE Move calls in order: `purchase_with_kiosk` → `kiosk::lock` → `royalty_rule::pay` → `personal_kiosk_rule::prove` → `confirm_request`
- Dry-run shows simulated `RoyaltyPaid` event in effects
- TypeScript: passing a string where ObjectRef is expected fails at compile time
- `metadata.expectedEvents` correctly lists `['model3d::model3d::RoyaltyPaid']` for purchase
- Manually-constructed purchase PTB omitting `confirm_request` aborts on dry-run (regression test for AE2)

**Verification:** Vitest green; dry-run smoke green against testnet; old `publishPtb.ts` + `purchaseAccessPtb.ts` deleted; first solutions doc captured (struct-arg wrapper pattern).

---

### U6. Frontend Kiosk integration — mint flow + purchase trigger refactor

**Goal:** Replace Phase 2 publish flow with `mint_and_list` builder. Wire purchase trigger from listing cards (U7) to `buildPurchaseWithKioskPtb`. Single-popup mint demonstrated.

**Requirements:** R3 (single popup), R5 (loud failure), F1 step 3

**Dependencies:** U5, U4

**Files:**
- `frontend/src/forge/ForgePage.tsx` (refactor — replace 2-popup `writeFilesFlow` + `publish_and_share` with `mint_and_list` builder)
- `frontend/src/forge/ForgePage.test.tsx` (rewrite affected tests)
- `frontend/src/creator/MintButton.tsx` (update copy: total 3 popups = Walrus register + Walrus certify + Sui mint_and_list)
- `docs/solutions/kiosk-ptb-patterns/mint-and-list-ptb-shape.md` (NEW — R12 capture)

**Approach:**
1. Existing Walrus upload via `writeFilesFlow` (2 popups, learnings #4 — unchanged)
2. Receive `walrus_blob_id` + `lineage_blob_id`
3. Build `mint_and_list` PTB via `buildMintAndListPtb` (U5)
4. Sign + execute (1 popup)
5. Show success state with Explorer link

For demo (R11a pre-bake), Tom's `mint_and_list` runs days before recording. Recorded take only shows Marcus's purchase (1 popup).

**Test scenarios:**
- Happy path: Mint → Walrus upload completes → mint_and_list signed → tx confirms → success state with Explorer link
- **Walrus upload wiring test (F24)**: writeFilesFlow mock returns blob_id; assert mock called with expected GLB bytes; assert returned blob_id is threaded into `walrus_blob_id` arg of mint_and_list builder
- Total popups = 3 (mock spy)
- Wallet rejection on Sui step → MintPage surfaces error toast + Retry CTA (integration with U9)
- After successful mint, no zombie state (Model3D in Tom's Kiosk + listed)

**Verification:** Tests green; manual testnet smoke — real mint visible in U7 BrowsePage, purchase via U9 flow, royalty fires; R12 doc landed.

---

### U7. Browse page + listings indexer + creator detail

**Goal:** Ship browse surface per R8 — listings card grid, empty state, sort, "🔍 Who made this?" creator detail card. Backend keeps polling indexer over `ListingCreated` / `ListingDelisted` events (no Marketplace registry).

**Requirements:** R8, F1 step 1, F1 step 7

**Dependencies:** U5, U6

**Files:**
- `backend/src/events/eventPollerBase.ts` (NEW — base class shared with U8)
- `backend/src/events/listingIndexer.ts` (NEW — `ListingCreated` + `ListingDelisted` subscription)
- `backend/src/events/listingIndexer.test.ts` (NEW)
- `backend/src/api/listings.ts` (NEW — `GET /api/listings` + `GET /api/creator/:address/listings` + per-IP rate-limit middleware + buyer regex validation; **public read, NO auth** per F12 decision)
- `backend/src/api/listings.test.ts` (NEW)
- `frontend/src/browse/BrowsePage.tsx` (**REWRITE** per F22 — replaces existing useModelIndex/CollectionCard structure with Kiosk-listings grid)
- `frontend/src/browse/BrowsePage.test.tsx` (existing tests REPLACED — old collection-grouping tests deleted; new ListingCard-grid tests added)
- `frontend/src/browse/ListingCard.tsx` (NEW)
- `frontend/src/browse/ListingCard.test.tsx` (NEW)
- `frontend/src/browse/CreatorDetail.tsx` (NEW)

**Approach:**
- **Backend `listingIndexer`**: extends `eventPollerBase`. Polls Sui every **2s** (browse-freshness cadence, NOT 1s — per F10 KTD clarification). Stores in `Map<modelId, ListingRecord>` (in-memory ring buffer, N=100 per topic per KTD#3). On restart, replays from chain start (~1-3s for <100 events).
- **API routes** (per F12 + F21):
  - `GET /api/listings?cursor=<>&limit=<>` — paginated, most-recent first, public read, rate-limited
  - `GET /api/creator/:address/listings` — public read, rate-limited
  - `GET /api/listings/:model_id` — single listing lookup (called by U10's TrackPage to resolve Walrus blob_id for `?model=`)
  - Backend validates address-shape params (`/^0x[0-9a-f]{1,64}$/`) before lookup; 400 on malformed
- **Frontend BrowsePage** polls `/api/listings` every 5s (UI freshness, not AE3-critical)
- **ListingCard** (per F16 + F17):
  - Card fields: thumbnail (Walrus aggregator URL), model name, creator address abbreviated (8+4 chars), price in SUI, royalty pill
  - Royalty pill format: `"X% royalty"` where X = bps/100 (no decimal for whole; one for half-points). bps=0 → gray "No royalty"; bps>0 → green pill
  - "🔍 Who made this?" affordance: explicit text label below abbreviated creator address (NOT just clicking the address); opens CreatorDetail as slide-in side panel from right (360px wide); dismiss via X button OR click-outside OR Escape key
- **CreatorDetail**: shows creator's other listings (`/api/creator/:address/listings`) + Sui Explorer link to creator address
- **Empty state**: "No models listed yet — visit `/forge` to create one" with link

**Test scenarios:**
- `listingIndexer` materializes listing from real `ListingCreated` event on testnet
- `listingIndexer` removes entry on `ListingDelisted`
- `listingIndexer` survives 5 polls with no new events
- `GET /api/listings` sort = most-recent-first
- `GET /api/listings` returns [] when no listings
- `GET /api/creator/:address/listings` filters correctly
- Malformed `buyer` query param → 400 without backend lookup (regex validation)
- Per-IP rate limit: 11th request within window → 429
- `BrowsePage` renders empty state with `/forge` link when API returns []
- `BrowsePage` renders N cards for N listings
- `ListingCard` abbreviated address regex: `^0x[0-9a-f]{4}…[0-9a-f]{4}$`
- `ListingCard` royalty pill: bps=500 → "5% royalty"; bps=250 → "2.5% royalty"; bps=0 → "No royalty" gray
- "🔍 Who made this?" click → CreatorDetail slides in
- CreatorDetail dismissal: X button + click-outside + Escape all close it (a11y baseline)
- CreatorDetail shows other listings + Explorer link

**Verification:** Tests green; manual testnet smoke — list via `/forge`, appears in BrowsePage in 5s, click "Who made this?" → CreatorDetail opens; R12 event-poller-base-pattern doc landed.

---

### U8. Event poller + RoyaltyReceiptOverlay component

**Goal:** R10's royalty receipt overlay. Frontend polls `RoyaltyPaid` events at 1s during recording window, filters per U1 spike outcome + connected wallet, renders overlay with positioning + contrast + timing per R10.

**Requirements:** R10 (overlay full spec), AE3 (render within 5s of event receipt), R11a (event-replay fallback)

**Dependencies:** U5 (event topics from builder metadata), U7 (eventPollerBase)

**Files:**
- `backend/src/events/royaltyIndexer.ts` (NEW — `RoyaltyPaid` subscription)
- `backend/src/events/royaltyIndexer.test.ts` (NEW)
- `backend/src/api/events.ts` (NEW — `GET /api/events/royalty?since=<cursor>&buyer=<address>` server-side filter; **public read, NO auth** per F12; rate-limited + buyer regex per F21)
- `backend/src/api/events.test.ts` (NEW)
- `frontend/src/sui/eventPoller.ts` (NEW — generic frontend poller; `loadReplayEvents()` substitution helper per F7)
- `frontend/src/sui/eventPoller.test.ts` (NEW)
- `frontend/src/overlays/RoyaltyReceiptOverlay.tsx` (NEW — React portal mounted at app root)
- `frontend/src/overlays/RoyaltyReceiptOverlay.test.tsx` (NEW)
- `frontend/src/App.tsx` (mount `<RoyaltyReceiptOverlay />` via portal)
- `docs/solutions/kiosk-ptb-patterns/eventpoller-replay-interface.md` (NEW — R12 capture)

**Approach:**
- **Backend `royaltyIndexer`**: same shape as U7's listingIndexer but polls every **1s during recording window** (per F10 KTD clarification). Server-side filter by `buyer` query param.
- **Frontend `eventPoller.ts`**:
  ```typescript
  class EventPoller<T> {
    constructor(endpoint, interval = 1000ms)
    subscribe(fn): () => void
    preWarm(): void   // fires first poll on mount + on wallet-sign callback
    replay(events: T[]): void   // R11a fallback
  }

  // F7 substitution helper:
  function loadReplayEvents(
    jsonPath: string,
    txDigest: string,
    buyerAddress: string
  ): ReplayEvent[]   // substitutes {{TX_DIGEST}} + {{BUYER_ADDRESS}} BEFORE replay()
  ```
- **`RoyaltyReceiptOverlay.tsx`**:
  - Subscribes to royalty poller on mount
  - **Filter logic** (per U1 spike outcome — exact field TBD):
    - `event.buyer === connectedWallet.address` (always)
    - AND session disambiguator match (tx_digest if (a), event_seq+sender if (b), nonce if (c), or buyer-only if accepting concurrent-purchase risk)
  - **`lastSignedTxDigestThisSession` storage (per F20)**: React Context, **in-memory only**, tab-scoped. NOT persisted zustand. Cleared on unmount + page refresh.
  - Renders as React portal to `document.body`
  - **Positioning (per F5)**: `position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: 9999` (above interstitial z=1000)
  - **Contrast**: `background: rgba(0, 0, 0, 0.7); color: #fff; padding: 12px 24px; border-radius: 24px; backdrop-filter: blur(8px)`
  - **Animation**: 200ms fade-in, 2500ms hold, 1000ms fade-out
  - **Stacking**: new event mid-fade replaces in-progress (no vertical stack)
  - **Mismatch filter**: events failing filter are silently suppressed
- **Pre-warm**: purchase flow calls `eventPoller.preWarm()` on wallet sign return (first poll within ~50ms)
- **Event-replay (R11a per F7)**: dev console call `eventPoller.replay(loadReplayEvents(path, txDigest, walletAddr))` — substitution happens before replay

**Test scenarios:**
- **Covers AE3.** Overlay renders within 5s of *event receipt by frontend* (simulated via `eventPoller.replay`); measure push timestamp → render commit
- Hold time 2500ms ± 50ms (fake timers)
- Fade-out 1000ms ± 50ms
- Positioning: bottom-center 24px above edge (DOM measurement)
- Contrast pill rendered with spec'd opacity + blur (computed-style assertion)
- z-index = 9999 (overlay) vs 1000 (interstitial): overlay visible while interstitial rendered (DOM + computed style)
- Two events within hold → second replaces first (DOM child count)
- Event with mismatched buyer → no render
- Event matching both filters → renders with `+0.05 SUI from 0x1234…5678 → 0xabcd…ef01` format
- Tx hash short-link href = `https://suiscan.xyz/testnet/tx/<digest>` (per F6 8+4 abbreviation in interstitial; full digest in overlay link)
- `eventPoller.preWarm()` fires within 50ms of call
- `eventPoller.replay([e1, e2])` fires subscribers in order with zero network calls (mock fetch)
- `loadReplayEvents(path, '0xabc...', '0xdef...')` substitutes BOTH `{{TX_DIGEST}}` AND `{{BUYER_ADDRESS}}`; resulting events render correctly in BOTH from-to text AND tx hash short-link
- `lastSignedTxDigestThisSession` cleared on component unmount (in-memory only verification)
- Backend `royaltyIndexer` filters by buyer query param correctly
- Per F1 step 6 integration test: simulated full purchase → backend → frontend poll → filter → overlay render

**Verification:** Tests green; manual smoke — testnet purchase triggers overlay within 2s; Alice's concurrent purchase does NOT trigger Marcus's overlay; R12 eventpoller-replay-interface doc landed.

---

### U9. Purchase error handling — R5a buyer-side failure modes

**Goal:** Three buyer-side failure modes (wallet rejection, on-chain abort incl. missing confirm_request, network timeout). Toast + Retry + back-to-browse.

**Requirements:** R5a, AE2

**Dependencies:** U6

**Files:**
- `frontend/src/purchase/PurchaseFlow.tsx` (NEW — wraps Buy → wallet sign → tx wait orchestration)
- `frontend/src/purchase/PurchaseFlow.test.tsx` (NEW)
- `frontend/src/components/Toast.tsx` (NEW or reuse — toast primitive with Retry CTA)

**Approach:** Error matrix:

| Failure mode | Detection | Toast text | Retry |
|---|---|---|---|
| Wallet popup rejected | `signAndExecute` throws `UserRejectionError` | "Wallet popup dismissed. Try again?" | Re-fires wallet popup |
| On-chain abort (incl missing `confirm_request`, Lock violation) | `signAndExecute` succeeds + `tx.effects.status !== 'success'` OR throws with Move abort code | "Transaction reverted: {abortReason}. Try again?" | Re-builds PTB + re-fires |
| Network timeout (no confirmation in 30s) | `client.waitForTransaction` timeout | "Transaction submitted but not yet confirmed. Check Sui Explorer or retry." | Polls Sui for digest before re-submitting |

Check the Move abort path, not just the outer PTB status (SEC-006 — security concern from origin: PTB can return outer success with inner Move abort encoded in effects).

**Test scenarios:**
- **Covers AE2.** Mock `tx.effects.status` shows `kiosk::transfer_policy: PolicyNotSatisfied` → toast with abort reason + Retry; BrowsePage state unchanged
- `UserRejectionError` → toast "Wallet popup dismissed"; Retry re-fires wallet sign (mock called 2x)
- `waitForTransaction` timeout (fake timers) → toast timeout message; Retry calls `queryTransactionByDigest` before re-submit
- After successful retry → toast dismisses, RoyaltyReceiptOverlay fires (integration with U8)
- Toast Retry keyboard-accessible (Enter fires Retry)
- After 3 failed retries → "Persistent error — please reload" (no infinite loop)

**Verification:** Tests green; manual smoke — dismiss wallet popup mid-purchase, see toast + Retry.

---

### U10. Post-purchase nav UX — interstitial + Kiosk-protocol listing lookup + auto-nav

**Goal:** F1 step 4 visual evidence beat between "Marcus signs" and "Marcus drives." Interstitial + pending state + auto-nav to `/track?model=<id>` + **Kiosk-protocol listing lookup** (per the KTD: bypass useOwnedVariants Access-based query; use `/api/listings/:model_id` to resolve Walrus blob_id).

**Requirements:** F1 step 4, R10 (overlay fires during nav transition), Kiosk-protocol KTD

**Dependencies:** U6, U7 (listings API), U8

**Files:**
- `frontend/src/purchase/PurchaseInterstitial.tsx` (NEW)
- `frontend/src/purchase/PurchaseFlow.tsx` (extend U9's file — add nav handoff)
- `frontend/src/purchase/PurchaseInterstitial.test.tsx` (NEW)
- `frontend/src/track/TrackPage.tsx` (**REFACTOR** — read `?model=<id>` query param; when present, bypass useOwnedVariants and fetch listing's Walrus blob_id via `GET /api/listings/:model_id` from U7; load GLB as drivable car. Reset effort estimate from "small extension" to "0.5-1 day" per F2.)
- `frontend/src/track/useOwnedVariants.ts` (**REWRITE per Kiosk-protocol KTD** — delete Access-based discovery; rewrite to query buyer's PersonalKiosk contents via Kiosk SDK; OR delete entirely if `?model=` covers all reachable demo paths)

**Approach:**
- **Interstitial sequence**:
  1. Wallet sign succeeds → PurchaseInterstitial renders: "Purchased. Loading your car…" + tx hash abbreviated 8+4 + suiscan link + small spinner + body-text size below headline
  2. z-index = 1000 (interstitial)
  3. Behind the scenes: `client.waitForTransaction({ digest })` polls for tx confirmation
  4. If confirmed within 1-2s → after 1s minimum interstitial display, `react-router` navigate to `/track?model=<modelId>`
  5. If still pending after 3s → swap interstitial text to "Confirming on Sui… ~5s" + clearer spinner. Continue polling until confirmed or timeout (handled by U9)
  6. On nav, `TrackPage` reads `model` query param, calls `GET /api/listings/:model_id` (U7) to get Walrus blob_id, fetches GLB, loads as drivable car
- **Royalty overlay (U8, z=9999) fires whenever filter matches** — typically during interstitial OR just after nav. Not gated by nav state.
- The Kiosk-protocol listing lookup is the load-bearing piece: it makes "Marcus owns the Model3D in Kiosk" → "Marcus can drive it in /track" work WITHOUT requiring the buyer to ALSO mint an Access object (the obsolete Phase 2 pattern).
- racetrackScene.ts itself is NOT touched — it still accepts pre-fetched `carGlbBytes: Uint8Array`. TrackPage just changes how it acquires those bytes.

**Test scenarios:**
- Interstitial renders within 100ms of successful wallet sign
- Interstitial shows "Purchased. Loading your car…" + tx hash 8+4 abbreviated + suiscan link href
- Tx confirms <3s → interstitial holds min 1s, then nav to `/track?model=<id>`
- Tx still pending at 3s → interstitial text swaps to "Confirming on Sui…"
- After nav, TrackPage reads `?model=`, calls `/api/listings/:id` mock, racetrackScene mounts with the model's GLB
- TrackPage `?model=` absent → falls back to existing carousel default car (backward compat with Phase 3 standalone /track)
- Royalty overlay renders DURING interstitial AND DURING racetrack scene (overlay z=9999 visible above both)
- Error path: tx confirmation fails after 30s → U9 R5a timeout flow takes over

**Verification:** Tests green; manual smoke — real testnet purchase → interstitial fires → racetrack mounts with the right car → royalty overlay fires.

---

### U11. R11a demo pre-bake setup — Tom's listing + event-replay capture

**Goal:** Tom's Model3D published + listed days before recording (only Marcus's purchase is live during take). Capture event payloads for event-replay fallback.

**Requirements:** R11a (pre-bake + event-replay fallback)

**Dependencies:** U7, U8, U10

**Files:**
- `scripts/pre-bake-tom-listing.ts` (NEW)
- `scripts/capture-replay-events.ts` (NEW — outputs JSON with `{{TX_DIGEST}}` + `{{BUYER_ADDRESS}}` placeholders for `loadReplayEvents()` substitution)
- `docs/reports/phase-4-rehearsal-notes.md` (NEW)
- `pitch/recording-assets/replay-events.json` (NEW)
- `pitch/recording-assets/tom-listing-info.txt` (NEW)

**Approach:**
- `pre-bake-tom-listing.ts`: Node script targeting Sui testnet, uses known throwaway GLB from `pitch/recording-assets/`. Outputs listing details.
- `capture-replay-events.ts`: runs full purchase against pre-baked listing with throwaway test buyer wallet; reads back royaltyIndexer event payload via API; writes JSON with placeholders.
- `replay-events.json` shape compatible with `loadReplayEvents(jsonPath, txDigest, buyerAddress)` (per F7 substitution contract).

**Test scenarios:**
- `pre-bake-tom-listing.ts` runs on testnet, listing visible in BrowsePage
- `capture-replay-events.ts` outputs valid JSON with placeholder shape
- `loadReplayEvents()` accepts the JSON shape without modification

**Verification:** Tom's listing visible in BrowsePage. `replay-events.json` exists. Rehearsal notes capture setup. Successful end-to-end rehearsal recorded before U12 real take.

---

### U12. 90-second no-cut recording — final take + backup cut

**Goal:** Final 90s no-cut master take per R11. Backup cut (2-cut version) recorded as R11a fallback. Kill-switch: 10 takes max.

**Requirements:** R11, R11a, AE4

**Dependencies:** U11

**Files:**
- `pitch/recording-assets/take-log.md` (NEW)
- `pitch/recording-assets/final-take.mov` (NEW — Git LFS or external)
- `pitch/recording-assets/backup-cut.mov` (NEW)
- `pitch/recording-assets/obs-scene.json` (NEW)
- `docs/reports/phase-4-recording-report.md` (NEW)

**Approach:**
- OBS scene: Chrome window source (1 Chrome + 1 Slush + 2 accounts) + lower-thirds text source ("Tom — Creator" / "Marcus — Buyer"). 1080p.
- Take choreography: browse page → click Buy → Slush popup → sign → interstitial appears → royalty overlay fires → nav to /track → drive 5s → return to browse → click "🔍 Who made this?" → CreatorDetail panel slides in
- Master take's first 30s must contain full buy → drive → royalty-receipt sequence so Phase 5 can extract 30s trailer (per R11)
- Kill-switch after 10 takes if none clean: ship backup cut OR accept best take with one micro-cut

**Test scenarios:** Test expectation: none — recording work; verification = output artifact.

**Verification:** `final-take.mov` exists; manual review confirms zero hard cuts (or documented micro-cut per kill-switch); take_log + recording_report committed.

---

### U13. Mainnet pre-bake script + rehearsal throwaway deploy + key isolation

**Goal:** Idempotent mainnet deploy script (R13) + placeholder config (R14). Rehearsal mainnet deploy of throwaway package via **separate** `SUI_MAINNET_REHEARSAL_KEY` (per F9).

**Requirements:** R13, R14, F2 (mainnet pre-bake)

**Dependencies:** U4

**Files:**
- `scripts/deploy-mainnet.ts` (NEW)
- `scripts/deploy-mainnet.test.ts` (NEW)
- `networks/mainnet.json` (NEW — placeholder)
- `networks/testnet.json` (NEW — populated from U4)
- `contracts/throwaway/sources/throwaway.move` (NEW — minimal Move pkg for rehearsal)
- `contracts/throwaway/Move.toml` (NEW)
- `docs/reports/phase-4-mainnet-rehearsal.md` (NEW)
- `README.md` (mention `pnpm deploy:mainnet` + reference runbook)

**Approach:**
- `deploy-mainnet.ts`: reads signing key from `SUI_MAINNET_DEPLOY_KEY` env var; never on disk; never committed. Behavior: verify env + balance → `sui client publish` → capture PackageID/UpgradeCap/Publisher → call `ensure_transfer_policy` → write addresses to `networks/mainnet.json` atomically → print receipt
- **Idempotency**: aborts if `networks/mainnet.json` already populated
- **Rehearsal**: `contracts/throwaway/` is single-file Move module + trivial entry fn. Command: `pnpm deploy:throwaway-mainnet`. **Uses separate `SUI_MAINNET_REHEARSAL_KEY` env var per F9** — script aborts if only `SUI_MAINNET_DEPLOY_KEY` is set. Writes to `/tmp/throwaway-mainnet.json` (NOT committed).
- **Testnet abort guard (per F19)**: testnet publish target aborts if `SUI_MAINNET_DEPLOY_KEY` is in env (prevents accidental production-key leak into testnet deploy environment)
- After rehearsal, write `phase-4-mainnet-rehearsal.md` documenting gas spent, RPC behavior, surprises

**Test scenarios:**
- Aborts when `SUI_MAINNET_DEPLOY_KEY` unset (clear error)
- Aborts when key has 0 SUI mainnet balance
- Aborts when `networks/mainnet.json` already has populated `package_id` (idempotency)
- `--dry-run` mode runs full PTB construction + simulation against testnet
- After successful run, `networks/mainnet.json` has all fields populated (no nulls)
- Receipt stdout includes PackageID + Explorer URL + UpgradeCap warning
- **Rehearsal mode aborts when only `SUI_MAINNET_DEPLOY_KEY` is set (no `SUI_MAINNET_REHEARSAL_KEY`)** — per F9
- **Testnet publish mode aborts when `SUI_MAINNET_DEPLOY_KEY` is in env** — per F19
- Rehearsal deploy `contracts/throwaway/` to mainnet succeeds → tx hash + gas captured to rehearsal report

**Verification:** Tests green; `pnpm deploy:throwaway-mainnet` with rehearsal key succeeds against real mainnet (~0.05 SUI gas); rehearsal report committed; placeholders + testnet config committed.

---

### U14. Single-network testnet build + README mainnet hedge

**Goal:** R7 — no runtime switcher; build-time network config. README per Success Criteria.

**Requirements:** R7, Success Criteria (README mainnet hedge)

**Dependencies:** U13, U7, U8

**Files:**
- `frontend/src/config/network.ts` (NEW — reads `VITE_NETWORK` build-time var; static import of matching JSON)
- `frontend/vite.config.ts` (update)
- `frontend/package.json` (add `build:testnet` + `build:mainnet` scripts)
- `backend/src/config/network.ts` (NEW)
- `backend/src/index.ts` (update — reads network config on boot)
- `README.md` (rewrite)
- `.env.example` (update — VITE_NETWORK doc)

**Approach:**
- `network.ts`:
  ```typescript
  import testnetConfig from '../../../networks/testnet.json'
  import mainnetConfig from '../../../networks/mainnet.json'
  const network = import.meta.env.VITE_NETWORK as 'testnet' | 'mainnet'
  export const config = network === 'mainnet' ? mainnetConfig : testnetConfig
  ```
- Build fails if `VITE_NETWORK` unset OR mainnet config empty (build:mainnet pre-deploy fails intentionally)
- **README hedge (per F17 Success Criteria)**: "Mainnet deploy is one command + ~10 WAL away, gated on demo stability per `docs/runbooks/mainnet-deploy.md`. Post-7/22 execution is milestone-gated per D-028 ADR."
- **Phase 2 → Phase 4 migration note (added 2026-05-19 from plan-007 U1 handbook check)**: README must explicitly state that the old testnet package `0x18a480b3ff2219ac6666177221bafb37aa79a81122890581025b4737aef05ac3` (referenced in `contracts/model3d/Published.toml`, `docs/process.md`, `docs/phase-progress.md`, prior README versions) is **Phase 2 work, deliberately abandoned** when Phase 4 republished under the `key + store` schema. The current Phase 4 testnet package ID (from `networks/testnet.json`) is the only one judges should test against. This is judging-period clarity, not historical revisionism — the old package remains on chain.

**Test scenarios:**
- `pnpm build:testnet` succeeds (assuming networks/testnet.json populated) → dist produced; `config.package_id` matches testnet
- `pnpm build:mainnet` FAILS when `networks/mainnet.json` has empty package_id
- After post-7/22 mainnet deploy populates file, `pnpm build:mainnet` succeeds
- README contains verbatim mainnet hedge language (regex check)
- README has clickable links to live demo + video + runbook + decisions + plan + brainstorm
- README doesn't reference absolute paths

**Verification:** Tests green; `pnpm build:testnet` produces deployable artifact; README renders cleanly on GitHub.

---

## Key Technical Decisions

- **Architectural principle: Kiosk-protocol-level features take precedence over hand-rolled app-level reimplementations. Delete obsolete pre-Kiosk discovery code.** Two concrete instances in Phase 4:
  - U4 does NOT hand-write `coin::split + transfer::public_transfer` for royalty payment — RoyaltyRule handles it via `royalty_rule::pay` at the frontend PTB layer (U5).
  - U10/`useOwnedVariants.ts` does NOT use Access-object discovery (Phase 2 pattern) for the demo flow — TrackPage uses `?model=<id>` + `/api/listings/:id` (Kiosk-protocol-level query) to resolve Walrus blob_id.
  Rationale: D-013 "protocol-level royalty enforcement" claim is genuine only if we actually use protocol-level mechanisms; reimplementing them in app code makes the pitch half-empty + creates two sources of truth.

- **Polling cadences split by latency budget (per F10):**
  - Frontend royalty poller: **1s** during recording window (AE3 budget)
  - Backend royaltyIndexer poll: **1s** during recording window (matches AE3)
  - Backend listingIndexer poll: **2s** (browse-freshness tolerance)
  - Frontend BrowsePage poll: **5s** (UI freshness, not AE3-critical)
  Each cadence has its own rationale; do not collapse to a single global value.

- **Backend uses `SuiJsonRpcClient` per D-019 (per F15).** Frontend retains GraphQL for owned-object queries (where still used post-Kiosk-protocol KTD) + `SuiJsonRpcClient` for tx execution. No gRPC migration in Phase 4.

- **Typed PTB wrapper return shape = `TxResult<T>` envelope.** Per learnings #1.

- **Event indexer storage = in-memory ring buffer per topic (N=100).** Rebuilds on server restart from chain start (~1-3s).

- **`mint_and_list` assumes pre-existing creator Kiosk + TransferPolicy.** Separate one-time `ensure_creator_kiosk` + `ensure_transfer_policy` entry fns. (Flat 13-param signature — resolved; no struct-arg-pitfall exposure.)

- **Backend stays Hono + TS (D-012).** Two new indexer modules sharing `eventPollerBase`. No queue, no Redis.

- **Browse becomes home page; `/forge` stays creator-specific.**

- **Royalty overlay lives at app root via React portal, not inside `racetrackScene.ts`.** Plus explicit z-index: overlay = 9999, interstitial = 1000.

- **`lastSignedTxDigestThisSession` in React Context only (per F20).** In-memory, tab-scoped; NOT persisted zustand; cleared on unmount + page refresh.

- **UpgradeCap key custody split (per F19):**
  - Testnet UpgradeCap captured to interactive Sui CLI keychain wallet (NOT `SUI_MAINNET_DEPLOY_KEY`)
  - Mainnet UpgradeCap to hardware wallet or multisig (per origin R2)
  - U13 deploy script aborts testnet target if `SUI_MAINNET_DEPLOY_KEY` is in env

- **`SUI_MAINNET_REHEARSAL_KEY` is distinct from `SUI_MAINNET_DEPLOY_KEY` (per F9).** Rehearsal mode aborts if only production key is set.

- **Public read APIs are unauthenticated + rate-limited + input-validated (per F12, F21):** `/api/listings/*` and `/api/events/royalty` are read-only public; per-IP rate limit middleware; `buyer` query param validated against `/^0x[0-9a-f]{1,64}$/`; 400 on malformed.

- **Tom's pre-baked listing on Walrus testnet, not stored in repo.**

---

## Test Strategy

- **Move tests** (U2-U4): full coverage of entry function happy + abort paths. AE1 + AE2 as integration tests.
- **PTB builder dry-run tests** (U5-U6): hit live testnet for dry-run on every new builder. Per learnings #1 + project memory. Fallback when testnet RPC unavailable: PROVISIONAL builders tracked in `docs/reports/phase-4-provisional-builders.md`; cannot land in main until dry-run green. Multiple RPC endpoints configured.
- **Backend indexer tests** (U7-U8): integration with real testnet event stream + unit tests with mocked payloads.
- **Backend API tests** (U7-U8): rate-limit + input-validation tests are mandatory; malformed `buyer` → 400; 429 on rate-limit breach.
- **Frontend component tests** (U7-U10): Vitest + React Testing Library; mock Babylon scene constructor; fake timers for overlay animation.
- **End-to-end integration tests** (manual, not automated): full F1 flow on testnet, recorded as rehearsal-as-test per R11a + U11.
- **Recording tests** (U12): take_log.md is the test artifact.

Per origin Scope Boundaries: "Phase 4 covers demo happy path only" — combinatorial Kiosk rule tests deferred to v1.1.

---

## Scope Boundaries

### Carried forward from origin (do not re-litigate)

- L2 Derivative struct + entry functions (D-013)
- FloorPriceRule, KioskExtensions, multi-creator collections
- Multi-PTB variants: standalone `list`, `delist`, `take_with_policy`
- Combinatorial Kiosk rule test coverage
- Sponsored tx via Enoki Pro / Add-on
- Mainnet WAL purchase (per runbook, post-7/22)
- Mainnet deploy execution (per runbook)
- `Marketplace` shared registry struct
- Runtime network switcher UI
- 30-second trailer cut (Phase 5)
- Frontend pitch-deck visual assets (Phase 5)
- 30-item Roadmap.md (Phase 5)
- Kiosk SDK gRPC migration (post-submission per D-019)
- Seal encryption integration (post-Phase 4)
- Forensic watermark (post-Phase 4)
- 1-wallet-plays-both-roles demo
- `delete_v1` Move migration helper
- Scripted input-replay for drive sequence

### Deferred to Follow-Up Work

- **v1.1 schema migration patterns** (per origin Outstanding Questions)
- **First-time creator UX polish** (`ensure_creator_kiosk` + `mint_and_list` = 2 popups). v1.1 may collapse to single combined PTB.
- **External tester recruitment** (Phase 5, runs 7/15-7/22 per runbook)
- **Sui blog post / Basecamp talk material** from `docs/solutions/kiosk-ptb-patterns/*` captures

---

## Risks & Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | Kiosk SDK gotcha bites (Publisher in init, TransferPolicy-before-place, PTB Result handle, PersonalKioskRule, confirm_request) | Medium | 1-2 day delay per occurrence | U5 typed wrapper + U4 test-first + day-1 dry-run discipline; R12 live captures so each gotcha is documented at fix time |
| 2 | Event polling latency > AE3 budget on testnet | Medium | Overlay misses or feels janky | U8 pre-warm; AE3 measured from event RECEIPT not tx confirmation. (Resolved: AE3 = 5s, which covers worst-case Sui finality 3s + backend poll 1s + frontend poll 1s. Demo timing intentionally co-locates overlay with buyer driving the bought car.) |
| 3 | `TrackPage.tsx` Kiosk-protocol-listing-lookup integration surfaces a regression | Medium-high | Demo arc broken at most visible moment | U1 day-1 verification + U1-prelim subtask for `?model=` route shape; if broken at U1, replan U10 priority before U7 |
| 4 | Slush switcher latency > 2s | Medium | Recording feels janky during actor handoff | U1 day-1 measurement; R11 lower-thirds fallback specified |
| 5 | Phase 4 day-1 verification (U1) surfaces a blocker forcing replan | Low-medium | 1-3 day plan rework | U1 budgets time + produces go/no-go signal; pre-decided descope cascade if reserve consumed: **U13 → U11 → U7** (see Resolved Decisions § Descope cascade for hard floor) |
| 6 | No-cut 90s take never clean | Medium | Demo lacks centerpiece | R11a backup cut recorded as fallback; kill-switch per R11a; trailer extracted from any working master |
| 7 | Tom's pre-baked listing breaks | Low | Pre-bake redone day-of | R11a pre-bake refreshable via U11 script (15min); verify pre-bake state at start of every recording session day |
| 8 | Mainnet rehearsal deploy (U13) surfaces SDK incompatibility | Low-medium | Mainnet path harder than expected | Rehearsal IS the mitigation — discover at Phase 4 day 8 not 8/26 |
| 9 | Backend in-memory ring buffer overflows | Very low | Older events fall off | N=100 buffer covers ~50 listings active; demo scale is well within |
| 10 | UpgradeCap key compromised | Low | Total contract compromise (per SEC-001) | R2 + KTDs split testnet hot vs mainnet hardware/multisig; U13 abort guard prevents production key in testnet env |
| 11 | tx_digest unavailable in Move events (per F4 deferred to U1 spike) | Medium-low | U8 filter logic + U11 replay placeholder require rework | U1 day-1 spike resolves this BEFORE U2 implementation; fallback options pre-specified (event_seq+sender / nonce / buyer-only) |

---

## System-Wide Impact

**Affected parties:**

- **End users (creators)**: Phase 2 publish flow replaced; new flow has cleaner one-popup mint (after pre-existing Kiosk setup). Phase 2 testnet mints unreachable.
- **End users (buyers)**: New purchase flow with on-screen royalty receipt. Walrus blob fetching for model preview unchanged. **Kiosk-purchased models discoverable in /track via `?model=` route** (Kiosk-protocol KTD); useOwnedVariants Access-based path removed.
- **The dev team (A4 = user)**: New `kioskTxBuilders.ts` discipline becomes standard. `docs/solutions/kiosk-ptb-patterns/*` becomes institutional reference for Kiosk patterns.
- **Mysten/Sui ecosystem reviewers**: At 6/21, testnet submission demonstrates protocol-level royalty enforcement via Kiosk's actual RoyaltyRule mechanism (not app-level reimplementation). At 8/27, mainnet deploy follows documented runbook + D-028.
- **Future v1.1 work (L2 Derivative)**: `mint_and_list` shape is reusable; UpgradeCap-via-additive-fields strategy avoids republish+burn.
- **Backend ops**: in-memory indexer means no DB to manage; restart = re-poll.

**Cross-cutting changes:**

- New `networks/` top-level directory
- New `scripts/` entries for deploy + pre-bake + rehearsal + capture-replay
- New `docs/runbooks/` (created by ce-doc-review)
- README rewrite (U14)
- `useOwnedVariants.ts` rewrite or deletion (Kiosk-protocol KTD)

---

## Dependencies / Prerequisites

- `@mysten/kiosk` SDK (latest 2026 version; pinned in U5)
- `@mysten/sui@2.16.x` JSON-RPC client (per D-019)
- `@mysten/dapp-kit@1.0.6` (per Phase 2)
- Sui CLI 1.72.1+
- Slush extension installed in Chrome for recording (one extension, two wallets)
- Walrus testnet upload relay operational through 6/21 (R11a pre-bake mitigates take-time outage)
- Testnet SUI in dev wallets — sufficient for ~50 publish + purchase ops
- **Mainnet SUI in deploy wallet by U13: ~0.5 SUI buffer** (covers throwaway rehearsal + real deploy + buffer)
- Day-1 verifications (U1) all Go — any No-go forces replan
- Multiple Sui testnet RPC endpoints configured (Mysten public + 1 backup) for U5 dry-run fallback

---

## Outstanding Questions

### Resolved Decisions (2026-05-19)

- **[U4 + U5] `mint_and_list` signature → FLAT 13-PARAM.**
  - Rationale: PTB struct-arg-pitfall (docs/solutions/integration-issues/sui-ptb-struct-arg-pitfall-2026-05-15.md) only applies to **passing existing on-chain struct refs**. `mint_and_list` takes 13 **primitives** + creates the struct internally — zero pitfall exposure. The rejected "split via `Model3DMetadata` constructor" alternative would actually *introduce* a Result-handle struct-arg risk (passing constructor output to `mint_and_list` as struct arg).
  - Cosmetic mitigation: PTB call site wraps args via TS `Object.values({ title, description, walrusBlobId, ... })` for readability.
  - Forward-compat: v1.1 adding a 14th field is breaking either way; flat path has no abstraction debt to unwind.

- **[U7/U8 + AE3] End-to-end latency → ACCEPT, AE3 = 5s.**
  - Honest math: Sui finality (1.5-3s) + backend royaltyIndexer poll (1s) + frontend poll (1s) + render = 3-6s worst case. Polling cadences stay 1s/1s (no change from KTD).
  - Demo timing rationale: F1 arc auto-navs buyer to `/track` over ~3-5s; overlay landing at 3-5s mark co-locates with "buyer drives the bought car" moment — narrative-positive, not a defect.
  - Forward-compat: if a v1.1 live marketplace needs <2s feedback, add `subscribeEvent` then. YAGNI today.

- **[Phase 4 schedule] Descope cascade → U13 → U11 → U7, with U11 hard floor.**
  - Original order kept: drop U13 first (rehearsal throwaway deploy → defer to post-7/22 runbook window), then U11 (capture-replay script → manual dev console fallback), then U7 (CreatorDetail panel → Phase 5).
  - **Hard floor added: U11 is the LAST to drop.** 6/19-20 demo recording is the root deliverable for pitch + video; losing U11 destroys Phase 5 recovery. If reserve is consumed by 6/18, drop U13 AND U7 together rather than touch U11.
  - "Implementation overflow" reserve: 0.5-1 day absorbed from "Phase 5 early-start" slot.
  - Note: user signaled "contracts are throwaway, redeploy is cheap" — 8/27 mainnet ceremony still matters per D-009/D-028 but does not block dropping U13 from Phase 4 (runbook 7/22-8/26 window has rehearsal-like behavior built in).

### Deferred to Implementation

- [Affects U5] Should typed PTB wrapper return `Transaction` directly or `TxResult<{ kioskCap, model3dResult }>` envelope? (Decision in ce-plan KTD = envelope, but exact handle composition pattern discovered at implementation)
- [Affects U8] Overlay positioning collision with existing HUDs (LapTimerHUD at bottom?) — verify in U10 integration; if collides, move overlay anchor
- [Affects U13] Mainnet RPC URL: private RPC (faster + more reliable) may be needed. Runbook research week (7/15) addresses.
