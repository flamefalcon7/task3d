---
date: 2026-05-18
topic: phase-4-kiosk-mainnet-demo
focus: Phase 4 = Sui Kiosk + TransferPolicy 整合 + mainnet 重新部署 + e2e demo 录制
mode: repo-grounded
---

# Ideation: Phase 4 — Sui Kiosk + Mainnet + E2E Demo

## Grounding Context

### Codebase context
- **Stack**: Sui Move 2024 (`contracts/model3d/` — single module, 536 LOC, currently `model3d::model3d`); React + Vite + Babylon imperative frontend; Node 22 + Hono backend; pnpm workspace
- **Current Sui state**: testnet package `0x18a480b3ff2219ac6666177221bafb37aa79a81122890581025b4737aef05ac3`; entry fns `publish_and_share()` + `purchase_model_access()`; `Model3D` published as `transfer::share_object` (D-016)
- **Current frontend Sui**: `@mysten/dapp-kit@1.0.6` (single package), `@mysten/sui@2.16.2` JSON-RPC path (D-019), Slush + optional Enoki zkLogin; **no network switcher; testnet hardcoded; no Kiosk references anywhere**
- **Current Walrus**: testnet upload-relay, no mainnet config; lineage GLB+JSON multi-file `writeFilesFlow`
- **Demo scene**: Phase 3 racetrack (`frontend/src/track/`) shipped — sky + bloom + tire smoke + intro orbit + countdown + asphalt + foliage. `/track` route playable.
- **No prior Kiosk/TransferPolicy code, no v1.1 derivative code, no mainnet deploy script**

### Past learnings (relevant)
- `docs/solutions/integration-issues/sui-ptb-struct-arg-pitfall-2026-05-15.md` — Kiosk PTBs return struct-typed values that MUST flow through `tx.moveCall(...).Result`, never `tx.pure.*`
- `docs/solutions/tooling-decisions/mysten-sui-client-split-jsonrpc-grpc-2026-05-15.md` — keep `SuiJsonRpcClient` for Phase 4; gRPC migration post-submission
- `docs/solutions/integration-issues/walrus-wal-published-at-deploy-block-2026-05-15.md` — Move.toml mainnet stanza: `subdir = "mainnet-contracts/walrus"`, `rev = "main"`, no `override-addresses`
- `docs/solutions/architecture-patterns/walrus-writefilesflow-popup-batching-2026-05-15.md` — `writeFilesFlow` N files = 2 popups not 2N
- `docs/solutions/best-practices/cors-is-browser-only-cost-bearing-endpoints-need-server-auth-2026-05-15.md` — any Enoki sponsor endpoint must JWT-gate + PTB-allowlist

### External context (web research)
- **Kiosk SDK migrated to builder pattern** (`KioskTransaction` + `TransferPolicyTransaction`); pre-2026 standalone functions deprecated. Source: [sdk.mystenlabs.com/kiosk/from-v1](https://sdk.mystenlabs.com/kiosk/from-v1)
- **No shared→Kiosk migration path exists**; community consensus = v2 contract + burn v1. Source: [forums.sui.io/t/how-can-a-shared-object-represent-a-kiosk/46643](https://forums.sui.io/t/how-can-a-shared-object-represent-a-kiosk/46643)
- **Publisher object (OTW in `init`) required** before any `TransferPolicy` can be created. Source: [Code in Move #6](https://medium.com/the-sui-stack/code-in-move-6-minting-nfts-on-sui-with-kiosk-5d9ba1636a7b)
- **TransferPolicy must precede first `place`** — else item locked forever
- **PersonalKioskRule mandatory** to prevent royalty bypass via `KioskOwnerCap` transfer
- **`confirm_request` hot potato** — buyer PTB missing this aborts whole tx
- **Walrus mainnet $0.023/GB/mo paid in WAL**; on-ramp Suilend/Bluefin/Binance; no faucet. Source: [blog.walrus.xyz/public-mainnet-launch](https://blog.walrus.xyz/public-mainnet-launch/)
- **Enoki Pro $120/mo (100K sponsored tx)** OR **$100 one-time Sponsored Add-on (400K tx)**. Source: [enoki.mystenlabs.com/pricing](https://enoki.mystenlabs.com/pricing)
- **Relay URLs**: `https://upload-relay.testnet.walrus.space` / `https://upload-relay.mainnet.walrus.space`
- **TransferPolicy rule API** (chainable): `addRoyaltyRule(bps, min_mist)`, `addLockRule()`, `addPersonalKioskRule()`, `addFloorPriceRule(amount)`. Source: [sdk.mystenlabs.com/kiosk/.../using-the-manager](https://sdk.mystenlabs.com/kiosk/kiosk-client/transfer-policy-transaction/using-the-manager)

### Constraints (decided, do not reopen)
- D-009: testnet OK for 6/21, mainnet by 8/27 for 100% prize
- D-013: Kiosk + TransferPolicy v1 must-have; L2 Derivative deferred to v1.1
- D-016: Phase 2 `Model3D` is `transfer::share_object` (Kiosk-incompatible)
- D-019: `SuiJsonRpcClient` (no gRPC migration in Phase 4)
- D-021: Walrus testnet via `testnet-contracts/walrus@main` subtree
- 38-day hackathon, 34 days to 6/21, 101 days to 8/27
- 1-dev team; user preference = finish early, leave time for pitch + video
- User pushed back on speculative complexity; project memory: skid marks use hardcoded sizing not BB derivation

## Topic Axes

1. **Move contract + Kiosk shape** — struct + entry fn design, TransferPolicy rule set, v2 break decision
2. **Frontend integration** — Kiosk PTB builders, network switcher, browse query, popup count
3. **Mainnet deployment + provisioning** — package deploy, WAL acquisition, env config, sponsored tx setup
4. **Demo recording + pitch optics** — script choreography, Explorer evidence, fallback plan, gas visibility, royalty drama

## Ranked Ideas

### 1. Reread D-009: Phase 4 is a pitch artifact, mainnet is the 8/27 deliverable
**Description:** Reread D-009 against the convergence. 6/21 = pitch artifact; 8/27 = feature ship. Phase 4 (6/11-6/20) optimizes for a *polished testnet submission* with mainnet config pre-baked but not deployed. Mainnet redeploy slides to 7/22-8/27 winners window (67 days soak).
**Axis:** 3
**Basis:** `reasoned:` D-009 text "testnet OK 6/21, mainnet by 8/27 for 100% prize"; convergence of 5 independent ideation frames (F6.1, F6.3, F6.6, F3.4, F3.6).
**Rationale:** If 6/21 = pitch judging and 8/27 = mainnet judging, optimizing the 6/21 artifact for polish (not feature surface) and pushing mainnet ceremony to the long soak window cuts ~6-8 days from Phase 4 critical path. Phase 5 then becomes pitch+video iteration on a stable testnet base.
**Downsides:** Loses the "we shipped mainnet at submission" pitch line. Requires re-reading handbook to confirm submission rules don't force mainnet on 6/21.
**Confidence:** 75%
**Complexity:** Low (re-planning decision; touches scope not code)
**Status:** Explored

### 2. "Throwaway testnet" → close OQ-013 + v2 clean-deploy + single-popup mint via one PTB
**Description:** Acknowledge that the Phase 2 testnet `share_object Model3D` cannot coexist with Kiosk. Treat testnet as throwaway. Ship `model3d::model3d` v2 with `Model3D` as `key + store`, plus a single entry function `mint_and_list(creator, kiosk_cap, terms, walrus_blob_id, price, …)` that constructs + places + lists in one PTB. Frontend never sees a bare `Model3D` object. One popup for creator publish. Same PTB shape later powers v1.1 L2 `Derivative` (mint+place+list with `parent_id` field added).
**Axis:** 1
**Basis:** `direct:` web research confirmed no shared→Kiosk migration; consensus = v2 + burn v1. D-009 = testnet replaceable. Convergence of F3.1 (throwaway dissolves OQ-013) + F2.1/F4.2/F2.6 (single-popup mint).
**Rationale:** OQ-013 dissolves — no migration owed to Phase 2 testnet holders. Single entry fn removes "object stranded outside Kiosk" failure mode and shortens demo to one signature. PTB shape generalizes to v1.1 Derivative.
**Downsides:** Phase 2 testnet test data becomes zombie objects. Need 1-line "v1 testnet abandoned" README notice.
**Confidence:** 90%
**Complexity:** Medium
**Status:** Unexplored

### 3. Race-on-mint 60-90s demo arc — racetrack as Kiosk payload + Spotify-style royalty receipt + speedrun no-cut recording
**Description:** Single demo script concentrating three independent moves: (1) buyer drives the actual Model3D they just bought in `/track`; (2) Spotify-style on-screen royalty receipt overlay fires at purchase moment from live `RoyaltyPaid` event; (3) no-cut single-take recording with on-screen tx hashes + Sui Explorer overlay. Same recording yields 60-90s pitch cut + 30s social trailer.
**Axis:** 4
**Basis:** `direct:` Phase 3 racetrack shipped (foliage, asphalt, tire smoke, intro orbit, countdown). `external:` Spotify for Artists royalty UI; speedrun.com no-reset verification. F4.4 (single-frame insight) + F5.1 + F2.4 + F5.5 + F6.6.
**Rationale:** Reuses Phase 3 polish as the pitch payoff, not just tech demo. Surfaces the protocol-level royalty claim VISUALLY at the frame it happens (currently invisible in wallet popup). No-cut recording with Explorer overlay reads as authenticity signal in a sea of cut-heavy crypto demos.
**Downsides:** Recording requires rehearsal. Royalty overlay needs live event indexer wiring.
**Confidence:** 85%
**Complexity:** Medium-High
**Status:** Unexplored

### 4. Skip Enoki; show gas as authenticity; redirect the $100 to a Fiverr demo edit
**Description:** Don't buy Enoki sponsored tx for v1. Use Enoki zkLogin free tier for Google sign-in UX without sponsorship. Let real gas appear on Sui Explorer ("0.0021 SUI gas") and narrate it as evidence beat. Reallocate the $100 to Fiverr video editing, mainnet WAL purchase, or buffer.
**Axis:** 3
**Basis:** `direct:` Enoki tier pricing confirmed. `reasoned:` judges are evaluators not end-users — sponsored tx is invisible polish to crypto-skeptic judges and "smoke and mirrors" suspicion to crypto-native ones. F3.5 + F6.4.
**Rationale:** Removes a provisioning blocker (account verification, sponsored PTB allowlisting, cap monitoring, key rotation — all attack surface). Saves $100-220. zkLogin UX still gained from free tier.
**Downsides:** Loses the "click Buy, no gas" wow moment. Mitigation: on-screen gas line is itself an evidence beat.
**Confidence:** 70%
**Complexity:** Low (negative work)
**Status:** Unexplored

### 5. Drop runtime network switcher; single-network builds + `NETWORK` env config + `pnpm deploy:mainnet` idempotent script
**Description:** No runtime testnet/mainnet toggle. Ship `overflow.app/testnet` and `overflow.app/` (mainnet) as two static builds, network baked at build time. One `networks/{testnet,mainnet}.json` is single source of truth. `pnpm deploy:mainnet` script codifies the full mainnet ceremony (publish package → capture PackageID/UpgradeCap/Publisher → create TransferPolicy with rules → write addresses to networks/mainnet.json).
**Axis:** 2 (frontend) + 3 (deploy)
**Basis:** `reasoned:` D-009 puts testnet on submission and mainnet on winners date — no user-facing reason to switch at runtime. F2.2 + F4.3 + F2.3. `direct:` per-network config touches package ID, Walrus aggregator URL, upload-relay URL, Enoki app id, WAL token type.
**Rationale:** Removes known demo-day failure mode (mid-stream network desync); turns mainnet cutover from multi-day risk into one script run.
**Downsides:** Two URLs in submission docs vs one. Loses live network-switch sub-demo.
**Confidence:** 85%
**Complexity:** Low-Medium
**Status:** Unexplored

### 6. Typed `kioskTxBuilders.ts` from day 1 + capture `docs/solutions/kiosk-ptb-patterns.md` during, not after
**Description:** Build a 150-200 LOC `frontend/src/sui/kioskTxBuilders.ts` returning typed `{ tx, kioskCap, model3dResult }` tuples wrapping Kiosk SDK calls. Each non-trivial PTB pattern (publish+place+list, list, purchase+confirm_request, take+delist) gets a one-page `docs/solutions/` entry at the moment it works (failing-first-attempt + fix).
**Axis:** 2 (frontend) + 4 (pitch evidence)
**Basis:** `direct:` learnings #1 (PTB struct-arg pitfall) — bit Phase 2 already. `external:` Kiosk SDK returns struct-typed values requiring `tx.moveCall(...).Result` threading. F1.2 + F4.6.
**Rationale:** Saves recurring 30-90min/session debugging tax on PTB threading. docs/solutions entries become Demo Day pitch material ("we hit this, we wrote it up") and post-hackathon Sui blog post candidates.
**Downsides:** Half-day upfront investment. Risk of premature abstraction if Kiosk surface ends small.
**Confidence:** 80%
**Complexity:** Low
**Status:** Unexplored

### 7. UpgradeCap discipline from day 1 of v2 publish + UPGRADE.md
**Description:** On v2 publish (testnet then mainnet), capture `UpgradeCap` to a named multisig/dev address. Document upgrade ABI rules in `contracts/UPGRADE.md`: additive-only on public structs, no field reorders. Lock `Model3D` / `LicenseTerms` / `Access` struct shapes now with "v1.1 will add fields after these" comments.
**Axis:** 1
**Basis:** `direct:` learnings note: "Move package upgrade vs re-publish on mainnet — uncharted". `direct:` D-013 says v1.1 ships L2 Derivative. `reasoned:` additive field upgrade << re-publish + burn.
**Rationale:** v1.1 L2 ships via `sui client upgrade` not v3-republish-and-burn — frontends keep working against same package ID. Avoids the worst category of post-hackathon pain.
**Downsides:** Forward-thinking struct design while still learning. UpgradeCap is custody item needing safe home.
**Confidence:** 75%
**Complexity:** Low
**Status:** Unexplored

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| F1.1 | Royalty cut breakdown invisible at signing | Duplicates S3 (Spotify receipt overlay is the solution) |
| F1.3 | Creator can't preview listing before paying | Addressed by S2 (single-popup mint removes the multi-step problem) |
| F1.5 | Browse query for all listed Model3D — Marketplace registry vs event indexer | Real engineering question but downstream of S2 contract-shape decision; surfaces in ce-brainstorm/ce-plan, not ideation |
| F1.6 | Network switcher desyncs config mid-demo | Subsumed by S5 (don't build the switcher at all) |
| F1.7 | Sponsored-tx budget exhausts silently mid-demo | Subsumed by S4 (no Enoki, no exhaustion) |
| F1.8 | v1→v2 burn migration story unwritten | Reduced to a 1-line README note inside S2 |
| F2.7 | Skip TransferPolicy royalty rule for v1 | Contradicts D-013's "Kiosk + TransferPolicy is the v1 protocol-level royalty story" |
| F2.8 | Automate Enoki key rotation + cap monitoring | Premature complexity if S4 wins |
| F3.2 | "Kiosk-compatible" without `kiosk::place` in demo | Same defect as F2.7 — pitch goes hollow if Kiosk is facade |
| F3.6 | 1-wallet fast-switch demo (not Tom+Marcus 2-actor) | Weakens the composable-creator narrative; 2-actor is the D-013 story shape |
| F3.7 | Reframe derivative royalty as TransferPolicy rule (collapse L1+L2) | L2 is D-013 deferred to v1.1; can't reopen contract shape for v1.1 work during v1 ship |
| F4.4 | Use racetrack scene as Kiosk demo payload | Promoted into S3 (synthesized demo arc) — not rejected, merged |
| F4.5 + F5.4 | LockRule + RoyaltyRule combo + MTG Reserved List framing | Implementation detail; surfaces in ce-brainstorm/ce-plan; not standalone decision |
| F4.7 | Kiosk PTB integration tests as demo script | Test-as-doc pattern compatible with S3 and S6; not standalone survivor |
| F4.8 | useSuiObject + useKioskListing hooks | Standard React data layer; not reshape-worthy at ideation level |
| F5.2 | Sotheby's provenance card on model detail page | Concrete deliverable but Phase 5 polish, not Phase 4 contract |
| F5.3 | Software escrow framing for Walrus in pitch deck | Pitch material, not Phase 4 work |
| F5.6 | Pharma pre-registration for LicenseTerms type | LicenseTerms already designed; pitch fluff with limited differentiator |
| F5.7 | TV news handoff for multi-actor demo | Merged into S3 |
| F5.8 | Steam Workshop single-click derivative UX | Out of scope — L2 deferred per D-013 |
| F6.2 | Custom 200-LOC Kiosk-equivalent module | D-013 chose Kiosk for protocol-level enforcement claim; bespoke voids the pitch differentiator |
| F6.5 | 10 parallel AI agents | Process not deliverable; below ambition floor |
| F6.7 | 30-item Roadmap page in README | Cheap pitch upside, deserves a slot in Phase 5 polish; not Phase 4-reshape |
| F6.8 | Zero-infrastructure `npx model3d-demo` against testnet | Massive engineering surface; conflicts with judge-clickable hosted demo |

## Notable convergences

- **5 frames converged on "6/21 = pitch, 8/27 = ship"** → S1
- **3 frames converged on "single-popup mint via one PTB"** → folded into S2
- **2 frames surfaced Enoki opportunity cost** → S4
- **F4.4 (racetrack as demo payload) is single-frame but uniquely concrete** → fed into S3
