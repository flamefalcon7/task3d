---
title: Kiosk simple marketplace (primary list + purchase of NftTokens)
type: feat
status: active
created: 2026-05-21
origin: conversation (post-U14 "what's missing" review — user-acquire gap)
related_adr: D-041 (to be written at impl start)
---

# Kiosk simple marketplace

## Problem

There is **no in-app way for a real user to acquire an NftToken**.
`mint_nft_token` mints a plain owned token and `public_transfer`s it to the
**caller (nft creator)**, so after minting N tokens the creator holds all N in
their wallet — nothing is for sale. The /track demo only works because
nftCreator == user (same wallet). This is the biggest gap in the user journey
and the only thing standing between us and a real four-actor flow.

## Decision (proposed D-041)

Use **Sui Kiosk** (the standard marketplace primitive) — **not** a hand-rolled
protocol-level store (user explicitly rejected reinventing it). Build a *simple*
marketplace on top of Kiosk: list-for-sale + purchase, with resale royalty
enforced automatically by the already-deployed `TransferPolicy<NftToken>`.

**Key finding — Move side is already done:**
- `TransferPolicy<NftToken>` + royalty rule are deployed (U17):
  `TESTNET.transferPolicyId` / `transferPolicyCapId` in
  `frontend/src/sui/networkConfig.ts`; royalty wired via `ensure_collection_policy`
  (royalty_rule only, D-036).
- `@mysten/kiosk@1.2.6` is installed.
- So this feature is expected to need **0 Move changes** — pure frontend PTBs
  + UI. (If Plan 009 republishes fresh, re-confirm the policy/ids carry over.)

This makes it a **primary-sale-via-Kiosk** flow: the nft creator lists their
owned tokens in a Kiosk; a buyer purchases (paying the seller); royalty applies
on any later resale. Resale UI itself stays minimal (purchase already exercises
the policy).

## Scope boundaries (non-goals)
- No custom `Store` / `buy_token` Move entry (rejected — use Kiosk).
- No auctions, offers, or bulk listing management UI.
- No cross-kiosk global search beyond what's needed for the demo (see U3).
- Resale royalty *enforcement* comes for free via the policy; we do not build a
  separate "resell" UX beyond the same purchase path.

## Implementation Units

### U1. List-for-sale PTB (the deferred #48)
**Goal:** an owner lists an NftToken for sale at a price.
**Files:** `frontend/src/sui/kioskTxBuilders.ts` (NEW) — `buildListNftTokenForSalePtb({ tokenId, priceMist, kioskId?, kioskCapId? })`; test.
**Approach:** use `@mysten/kiosk` `KioskTransaction` (SDK v2 builder). If the
seller has no Kiosk, create one in the same PTB; then `place_and_list` the token
at `priceMist`. Token type = `${PKG}::model3d::NftToken`. Return kioskId for
discovery. Reference the existing `collectionTxBuilders.ts` TxResult<T> envelope
shape for consistency.
**Test scenarios:** structural PTB test (moveCall targets `0x2::kiosk::place_and_list`
or SDK equivalent; price + token threaded); create-kiosk-if-absent branch.
**Verification:** structural test green; live: list a token, confirm a Kiosk
listing object on chain.

### U2. Purchase PTB (hot-potato + royalty)
**Goal:** a buyer purchases a listed token; royalty paid; token ends up owned by buyer.
**Files:** `frontend/src/sui/kioskTxBuilders.ts` — `buildPurchaseNftTokenPtb({ kioskId, tokenId, priceMist, policyId })`; test.
**Approach:** `kiosk::purchase` → returns `(NftToken, TransferRequest)` hot
potato → `royalty_rule::pay(policy, request, fee_coin)` →
`transfer_policy::confirm_request(policy, request)`. Then place the token into
the buyer's own Kiosk (or `public_transfer` to buyer if the policy allows taking
it out). Use `TESTNET.transferPolicyId` + `kioskAppsPackageId` for the royalty
rule type. The `@mysten/kiosk` SDK's purchase helpers handle most of the
hot-potato choreography — prefer them over raw moveCalls.
**Test scenarios:** structural — purchase + royalty_pay + confirm_request appear
in order; royalty coin split from payment; under-payment path.
**Verification:** structural test green; live: a *second* wallet buys a listed
token; seller receives payment; royalty enforced; buyer owns the token (drives
on /track via U11 owned-token discovery).

### U3. Listing discovery
**Goal:** find tokens currently for sale so the marketplace UI can show them.
**MAIN UNKNOWN — resolve at impl.** Options:
- (a) Track seller Kiosk id(s) (from U1's return) and query that Kiosk's items
  / `kiosk::Listing` dynamic fields via GraphQL — simplest, demo-grade.
- (b) Index `kiosk::ItemListed` events (backend indexer, mirrors U7 pattern).
- (c) Query all `Kiosk` dynamic fields holding our NftToken type — broadest,
  most work.
**Recommendation:** start with (a) for the demo (we control the seller wallet),
note (b) as the scalable follow-up.
**Files:** `frontend/src/market/useListings.ts` (NEW) + test.
**Verification:** lists the tokens listed in U1.

### U4. Marketplace UI (list + buy)
**Goal:** a user can browse listed tokens and buy one; an owner can list a token.
**Files:** `frontend/src/market/MarketPage.tsx` (NEW, route `/market`) + test;
a "List for sale" affordance on owned tokens (extend `/track` carousel or a
token detail surface); Browse nav link.
**Approach:** MarketPage consumes `useListings` → grid of listed tokens (preview
via `glbUrlForToken`/patch) + price + "Buy" → `buildPurchaseNftTokenPtb` →
signAndExecute. List affordance → `buildListNftTokenForSalePtb`. Reuse the
auth/sign patterns from `LaunchCollectionPage` / `RegisterIntegrationPage`.
**Test scenarios:** renders listings; buy calls purchase builder + signs; list
calls list builder; wallet-rejection toast.
**Verification:** tests green; live four-actor smoke — creator lists, a second
wallet buys, buyer drives it on /track.

## Risks / unknowns
- **Kiosk SDK v2 API surface** — `@mysten/kiosk@1.2.6` builder pattern; confirm
  the exact `KioskTransaction` / purchase helper signatures (the earlier Phase-4
  research noted v2 breaking changes + `client.$extend(kiosk())`).
- **Hot-potato `confirm_request`** — must complete in the same PTB or the tx
  aborts; the TransferPolicy must have all rules satisfied (royalty_rule only here).
- **Discovery (U3)** is the real design risk — pick (a) for demo.
- **Buyer Kiosk** — purchasing typically requires the buyer to also have a Kiosk
  to receive the item under policy; confirm whether we place-in-buyer-kiosk or
  can transfer out.
- If Plan 009 does a **fresh** republish, re-derive `transferPolicyId` etc. for
  the new package before building these PTBs.

## Sequencing
After Plan 009 (so the package id is final). Frontend-heavy; **0 Move changes
expected**. Largest unit is U3/U4 (discovery + UI). Demo value is high — completes
the only broken leg of the four-actor journey.
