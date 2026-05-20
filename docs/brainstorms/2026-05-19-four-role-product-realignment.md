---
date: 2026-05-19
topic: four-role-product-realignment
revised: 2026-05-20
---

# Four-Role Product Realignment — NFT Collection Layer + Integration Registry in v1

> **Revision note (2026-05-20):** This doc was first written on the premise that D-013 stays (L2 deferred, nftCreator pitch-only). After a 7-persona doc-review and a design discussion, the user decided to **reverse D-013 (see D-029)** and ship the NFT collection layer as real v1 surface. The doc below reflects that decision. The agent recorded an explicit ROI dissent (D-029 Consequences) — this is a high-risk-for-6/21 path taken with eyes open. The mandatory contingency descope order is in Scope Boundaries.

## Summary

Realign the product around four real actors — mesh creator, nft creator, gameDev, user — backed by a new on-chain NFT collection layer. A mesh creator publishes a `Model3D`; an nft creator launches an `NftCollection` from a chosen Model3D and receives an `NftCollectionCreatorCap` holding the collection's register-fee config and integration registry; a gameDev pays the register fee to record an integration; a user browses, buys, and uses. Pay-per-generate is descoped to v1.1 (6/21 demo uses service-funded Tripo); procedural generation is removed.

---

## Problem Frame

Phase 4 plan-007 was mid-flight (U5 shipped, U6 dispatching) when role coherence broke down: two competing mint surfaces existed, procedural generation was being abandoned, and the team's model of "who uses this and for what" had drifted from D-013's narrow two-actor framing. A realignment brainstorm + doc-review surfaced that the register-fee and integration-registry concepts the team wanted are inherently **NFT-collection-level**, not base-Model3D-level — which only coheres if the NFT collection layer is a real object in v1.

D-013 had deferred exactly this layer (L2) to v1.1 on the grounds that 3D has no validated remix/derivative user. Reversing that is a foundational scope decision, captured as D-029. The agent's hackathon-ROI assessment recommended against building it for 6/21 (it adds unvalidated surface where the 70%-weighted Real-World Application + Product/UX axes reward concreteness and polish, and reverses D-013 on first-principles against a tight clock). The user weighed this and chose to build it anyway, valuing a demonstrable composable economy + Sui-native technical depth. This doc plans that path and foregrounds the contingency that makes it survivable.

---

## Actors

- A1. mesh creator (Tom): types a prompt, generates a Model3D via Tripo (service-funded for the demo), sets `license.policy`, publishes the base Model3D
- A2. nft creator (Lisa): selects/owns a Model3D, calls `launch_collection` to launch an `NftCollection` from it, receives the `NftCollectionCreatorCap` (sets `register_fee`, owns the integration registry), lists the collection. May be a different person than the mesh creator (second-party fork — the L2 economics)
- A3. gameDev (Tiny Racetrack dev): finds collections that accept integration, pays the collection's `register_fee`, calls `register_integration` to record on-chain that their game uses the collection, loads the asset in-game
- A4. user (Marcus): browses listed collections/NFTs, purchases via Kiosk, uses/drives the purchased asset, can see which apps integrated it
- A5. Judge: scans the 6/21 submission; weights Real-World Application 50%, Product/UX 20%, Technical 20%, Vision 10%

---

## Key Flows

- F1. mesh creator generate-and-publish (service-funded Tripo)
  - **Trigger:** mesh creator opens the mint page, types a prompt
  - **Actors:** A1
  - **Steps:** prompt → Tripo generation (service-funded; team absorbs cost for demo) → preview → set `license.policy` (radio: permissionless / restricted) → publish: Walrus upload + mint Model3D + list on Kiosk
  - **Outcome:** a Model3D on chain, listed, with chosen license.policy
  - **Covered by:** R3, R4, R5, R20, R21

- F2. nft creator launch-collection
  - **Trigger:** nft creator selects a Model3D to build a collection from
  - **Actors:** A2
  - **Steps:** choose base Model3D → `launch_collection(model_id, terms)` → receive `NftCollectionCreatorCap` → set `register_fee` on the cap → list the collection
  - **Outcome:** an `NftCollection` on chain tied to a base Model3D; cap held by the nft creator carrying fee config + integration registry
  - **Covered by:** R7, R8, R9, R10

- F3. gameDev pay-and-register integration
  - **Trigger:** gameDev wants to declare on-chain that their game uses a collection
  - **Actors:** A3
  - **Steps:** find a collection accepting integration (Browse filter) → `register_integration(collection, payment, app_metadata)` paying ≥ `register_fee` → fee routed to cap holder → registry records the integration → emits `IntegrationRegistered`
  - **Outcome:** an on-chain, paid attestation in the collection's registry; "Used by" reverse lookup resolves
  - **Covered by:** R11, R12, R13, R14, R15

- F4. user browse-buy-use
  - **Trigger:** user opens BrowsePage
  - **Actors:** A4
  - **Steps:** browse → purchase via Kiosk (royalty enforced) → use/drive the asset in `/track`
  - **Outcome:** user owns the asset; Access soulbound receipt; royalty routed
  - **Covered by:** R16 (+ existing Phase 4 purchase flow)

---

## Requirements

**Role framing**
- R1. The product ships four real actors (mesh creator, nft creator, gameDev, user). nftCreator and gameDev are product surfaces with their own flows — no longer pitch-narrative only (reverses the pre-revision R1/R2; per D-029)
- R2. The base/derivative split is explicit: `Model3D` is base mesh (mesh creator); `NftCollection` is launched from a Model3D (nft creator). The two creators may be different people. **Two sale paths coexist:** L1 direct purchase of a `Model3D` (existing `purchase_with_kiosk`, unchanged) and L2 purchase of collection NFT tokens (new, additive). nft creator pays-to-derive; mesh creator keeps the base + earns royalty (Fork A)

**mesh creator flow**
- R3. mesh creator generation goes through Tripo only; procedural generators (`backend/src/generators/` + `agent/router.ts` + ShapePicker) are removed. No Go backend exists (dropped at D-012)
- R4. For the 6/21 demo, Tripo calls are service-funded (team absorbs cost). Pay-per-generate (user pays SUI per call) is descoped to v1.1 / mainnet window (per D-029; supersedes D-014's creator-self-pays model)
- R5. mesh creator selects `license.policy` at publish time (radio: permissionless / restricted; default permissionless), gating whether collections built on the model accept integrations
- R6. After Tripo returns the GLB, mesh creator publishes (Walrus + mint + Kiosk list) or discards

**nft creator collection layer**
- R7. A Move entry fn `launch_collection(model_id, terms, ctx)` launches an `NftCollection` tied to a base `Model3D` and transfers an `NftCollectionCreatorCap` to the caller
- R8. The `NftCollectionCreatorCap` holds the collection's `register_fee` (settable by the cap holder) and is the authority for the collection's integration registry. The cap is **key-only (soulbound)** — re-anchoring the spec.md §1.7 #3 "soulbound by Move ability" selling point now that `Access` is cut
- R9. The nft creator sets/updates `register_fee` via a cap-gated entry fn (only the cap holder can change it)
- R10. The collection is listable on Kiosk; secondary-sale royalty continues to route via the existing TransferPolicy
- R11. The integration registry is owned by / addressable through the collection (or its cap); it is the source of truth for the "Used by" reverse lookup

**gameDev integration (register_integration)**
- R12. `register_integration(collection, payment, app_metadata, ctx)` records an integration; it aborts unless `payment >= register_fee` and routes the fee to the cap holder
- R13. `register_integration` aborts with `ELicenseRestricted` when the underlying Model3D's `license.policy = POLICY_RESTRICTED`, emitting no event. The gameDev-facing UI surfaces a human-readable message + a link to the Browse "available for integration" filter (no raw Move abort code)
- R14. `app_metadata` is length-bounded and schema-constrained (UTF-8 JSON: `name` + `url` only); the indexer validates the schema before storing; the frontend renders it as text nodes only (never innerHTML) — per security-lens review
- R15. Anti-spam: `register_fee` payment is the primary control; additionally enforce one registration per `(integrator, collection)` pair so a single integrator cannot flood a collection's registry
- R16. Successful `register_integration` emits `IntegrationRegistered`; the backend indexer captures it; the collection/NFT detail page shows a "Used by" section with each integrating app's name + tx (loading, empty, and restricted-license states all specified)

**Browse + filter**
- R17. BrowsePage supports an "available for game integration" filter showing only collections whose base Model3D `license.policy = POLICY_PERMISSIONLESS`. The listing indexer must capture `license.policy` at listing time (joining `ModelPublished.policy` or fetching the object) — per feasibility review

**Pitch + demo artifacts**
- R18. Pitch deck has a four-archetype slide (Tom / Lisa / gameDev / Marcus), each with a 30-second narrative
- R19. The 6/21 demo recording shows the four-actor arc; the Tiny Racetrack scene is narrated as the gameDev integration use case. The submission includes an honest disclosure that the four archetypes are team-controlled wallets for 6/21 (per adversarial + product-lens review) unless a real external integrator is recruited
- R20. README hero uses the four-archetype framing

**Frontend cleanup**
- R21. `/generate` route + `creator/CreatorFlow.tsx` + procedural UI delete. The mint flow consolidates to one canonical page (closes OQ-019; the OQ-019 grep gate is the acceptance check). `/generate` and `/forge` issue redirects to the canonical route — per design-lens review
- R22. Delete the dead `Access` surface: the `Access` struct + its accessors (`access_target_id` / `access_holder` / `access_expires_at_ms`) + `destroy_access_for_testing` in `model3d.move`, plus any frontend `useOwnedVariants` Access-based discovery path. v2 already flagged `Access` as a no-op (no constructor since Phase 2's `mint_model_access` was stripped); this formalizes the deletion the contract scheduled for U10. Ownership of the `key + store` NFT token is the purchase receipt

---

## Acceptance Examples

- AE1. **Covers R7, R8.** Given an nft creator selects a Model3D, when they call `launch_collection`, an `NftCollection` is created tied to that model and an `NftCollectionCreatorCap` is transferred to them carrying a settable `register_fee`
- AE2. **Covers R12.** Given a collection with `register_fee = X`, when a gameDev calls `register_integration` with `payment < X`, the tx aborts and no registry entry is created; with `payment >= X`, the fee routes to the cap holder and the registry records the integration
- AE3. **Covers R13.** Given a collection whose base Model3D is `POLICY_RESTRICTED`, when any account calls `register_integration`, the tx aborts `ELicenseRestricted`; the UI shows "This collection does not accept integrations" with a link to the Browse filter, not a raw abort code
- AE4. **Covers R14.** Given a gameDev submits `app_metadata` containing an HTML/script payload, when it is stored and rendered, the "Used by" section displays it as inert text (no script execution, no clickable injected markup beyond the validated `url`)
- AE5. **Covers R15.** Given a gameDev already registered an integration for collection C, when they call `register_integration` again for C, the second call aborts (one registration per integrator+collection)
- AE6. **Covers R16, R17.** Given a permissionless collection with one registered integration, when a user opens its detail page, the "Used by" section lists the integrating app; the Browse "available for integration" filter includes the collection
- AE7. **Covers R5.** Given a mesh creator at publish time, when they select `restricted`, the published Model3D records `POLICY_RESTRICTED` and collections built on it reject `register_integration`

---

## Success Criteria

- 6/21 demo shows the full four-actor arc end-to-end on testnet: mesh creator publishes → nft creator launches a collection + sets fee → gameDev pays + registers integration → user buys + uses; with the "Used by" reverse lookup resolved on screen
- A judge can name all four archetypes from the pitch deck within 60 seconds, AND the demo shows each archetype taking a real on-chain action (not deck-only)
- `register_integration` fee routing is visible on Sui Explorer (fee → cap holder)
- The submission honestly discloses team-controlled-wallet staging for the four archetypes (or recruits ≥1 real external integrator)
- `pnpm test` green; no procedural references survive; `/generate` gone; OQ-019 grep gate passes
- After realignment work lands, Phase 4 still has a non-negative working-day buffer (see Dependencies — this is the at-risk criterion)

---

## Scope Boundaries

### Deferred for later (v1.1 / mainnet window)

- Pay-per-generate backend (user pays SUI per Tripo call; replay protection, session binding, refund semantics all move with it) — v1.1 / mainnet window
- Seal encryption for Walrus blobs (hard enforcement of license.policy) — v1.1
- Forensic watermark on serve — v1.1
- nft creator dashboard ("my collections + who integrated them") beyond the per-collection detail page — v1.1
- gameDev full discovery directory beyond the Browse filter + detail-page reverse lookup — v1.1

### Mandatory contingency — worst-case descope order (per D-029)

The realignment makes the 6/21 buffer thin-to-negative (see Dependencies). If buffer hits zero, descope in this order (first to cut first):

1. Collection-layer UI polish (raw-but-functional flows over polished ones)
2. `register_fee` mechanics (fall back to free `register_integration` with per-pair uniqueness as the only anti-spam — recovers the fee-routing dev-days)
3. nft creator as a separate flow (fall back to mesh-creator-launches-own-collection — path B — preserving the cap+registry but cutting the second-tier UI)
4. Last resort: narrative-only (the pre-revision plan) — collection layer becomes a vision slide

### Outside this product's identity

- "Cross-game asset portability" as a primary pitch claim (spec.md §1.7 — StepN/Axie failure mode)
- Bring-your-own-Tripo-key per-creator subscription (superseded by service-funded demo + v1.1 pay-per-generate)

---

## Key Decisions

- **D-029 (this realignment): reverse D-013, ship the NFT collection layer in v1.** nft creator is a real actor; `NftCollection` + `NftCollectionCreatorCap` (fee + registry) are real Move surface. Recorded ROI dissent: agent assessed low hackathon-ROI; user proceeded knowingly
- **Pay-per-generate descoped to v1.1**; 6/21 uses service-funded Tripo (supersedes D-014's creator-self-pays)
- **`license.policy` exposed in v1 UI** (mint radio + Browse filter); gates collection integration eligibility
- **register_fee + integration registry live on the `NftCollectionCreatorCap`, not on Model3D** — fee is collection-level, set by the launching nft creator; resolves the "NFT-level not model-level" requirement

**Resolved architecture (2026-05-20, the two prior Resolve-Before-Planning questions):**

- **Fork A — pay-to-derive (not buy-to-own).** nft creator pays a derive fee to `launch_collection`; the mesh creator **retains the base Model3D and earns ongoing royalty** on the collection's sales (base_royalty_bps snapshot at launch, ≤30% cap per D-004). This is the composable-IP economy; buy-to-own was rejected (one-shot sale kills the protocol-level perpetual-royalty story)
- **Fork B — tradeable NFT tokens; L1 direct + L2 collection coexist.** Users buy `key + store` NFT tokens minted from a collection (resellable on Kiosk, royalty enforced on resale). The existing L1 direct-purchase path (`purchase_with_kiosk` selling Model3D, U4/U5) **stays unchanged**; the L2 collection-token path is **additive**, not a replacement
- **Fork B' — soulbound `Access` is cut.** v2 already flagged `Access` as a dead no-op surface (no entry fn constructs it; only a test helper references it; scheduled for U10 deletion). We delete it now (struct + accessors + test helper). The "soulbound by Move ability" pitch point (spec.md §1.7 #3) **re-anchors to a key-only `NftCollectionCreatorCap`** — a more natural fit than a soulbound receipt alongside tradeable tokens
- **Fork C — register_integration is not coupled to ownership.** Gated by `register_fee` payment only (B2B integration license at the collection level); the gameDev does not need to own a token. register_fee + per-pair uniqueness are the anti-spam controls
- **Budget recomputed in working days** (see Dependencies) with a mandatory descope order (Scope Boundaries) — per scope-guardian review
- **Move package: adding `launch_collection` / `register_integration` as new entry fns is upgrade-compatible**, but `NftCollection` / `NftCollectionCreatorCap` are new structs (additive, also upgrade-safe). Whether any change touches the existing `Model3D` struct (forcing a v3 republish) is a plan-time question — default to keeping Model3D unchanged

---

## Dependencies / Assumptions

- Phase 4 v2 Move package (`0x563ab54bf9b6e76d6e61a7f0c8be3157e354750e8e435814dfa0b5232f4b0893`) is the deploy target; new entry fns + structs land via package upgrade (additive = upgrade-safe). Verify the UpgradeCap is held in the deployer wallet before planning the upgrade
- `Model3D.license.policy` field already exists (D-003, deployed on v2)
- The Phase 4 event poller (plan-007 R10 / U7-U8) can be extended for `IntegrationRegistered`, but note backend currently has no SuiClient instantiated — payment/event verification infra is new work, not a pure extension (per feasibility review)
- **Budget (working days, honest):** ~33 calendar days to 6/21 ≈ 23–24 working days. Committed: Phase 4 remaining (8–10) + Phase 5 pitch/video/submission (5–7) = 13–17. New net scope: collection layer + register_fee/registry + app_metadata + narrative ≈ +6.5–11.5 (pay-per-generate descope already netted out). **Total 19.5–28.5 vs 23–24 available → buffer −5 to +4.5 working days.** Worst case is negative; the descope order in Scope Boundaries is mandatory, not optional
- Demo recording: the four archetypes are team-controlled wallets unless a real external integrator is recruited; the submission discloses this honestly (per review)

---

## Outstanding Questions

### Resolve Before Planning

- (none — the two architecture questions were resolved 2026-05-20; see Key Decisions "Resolved architecture": sellable unit = L1 Model3D direct + L2 collection NFT tokens, coexisting; register_integration is fee-gated, not ownership-coupled.)

### Deferred to Planning

- [Affects R8][Technical] `register_fee` storage shape on the cap; whether changing it touches the `Model3D` struct (v3 republish risk)
- [Affects R12][Technical] Fee routing: `Coin<SUI>` argument vs split-from-gas; abort-code numbering for `ELicenseRestricted` (existing range 1–22)
- [Affects R16][Technical] "Used by" reverse-lookup query: event-history scan per collection vs derived indexer view
- [Affects R17][Technical] Listing indexer must capture `license.policy` (join `ModelPublished` or fetch object)
- [Affects R21][Technical] Canonical mint route (`/forge` vs `/create`) and interaction with plan-007 U6's existing CreatorFlow refactor
- [Affects R3][Technical] Procedural generator + ShapePicker removal blast radius (OQ-019 file set)
