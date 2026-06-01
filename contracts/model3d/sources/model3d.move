// D-001 / D-002 / D-031 / D-032: the composable creator economy.
//
//   - L1 `Model3D` sells ACCESS, not ownership (D-031). It is published as a
//     SHARED object via `publish` (D-032) — NOT placed in a Kiosk. Sharing
//     makes it referenceable by ANY wallet, which is exactly what
//     `launch_collection(model: &Model3D, …)` needs so a different-wallet nft
//     creator can fork it. D-032 SUPERSEDES the Kiosk-on-Model3D path of D-016
//     (`mint_and_list` / `purchase_with_kiosk` / `TransferPolicy<Model3D>` are
//     all removed). L1 monetization = the pay-to-derive fee (launch_collection)
//     + perpetual `base_royalty_bps` on downstream NftToken sales. Seal-gated
//     direct access-sale on L1 is the v1.1 flagship.
//   - L2 `NftCollection` + `NftToken` sell OWNERSHIP (D-029). `mint_nft_token`
//     yields a PLAIN OWNED token (D-036) — no auto-Kiosk; the creator opt-in
//     lists it for sale in a separate Kiosk PTB. The per-type
//     `TransferPolicy<NftToken>` carries ONLY the royalty rule (D-036 dropped
//     lock + personal_kiosk so bought tokens are freely usable). Each token
//     binds one quilt-patch variant (D-035: `NftCollection.quilt_blob_id` +
//     `NftToken.patch_id`).
//   - Phase 2 entries `publish_and_share` / `purchase_model_access` and Phase 3
//     `Collection` / `VariantSpec` plumbing were already REMOVED. The old L3
//     `Access` soulbound receipt is DELETED; its "soulbound by Move ability"
//     role re-anchors to `NftCollectionCreatorCap`.
//   - MODEL3D one-time-witness + `init` claims `Publisher`, consumed by
//     `ensure_collection_policy` to attach the RoyaltyRule (only) to
//     `TransferPolicy<NftToken>` (D-036).
module model3d::model3d;

use std::string::{Self, String};
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::event;
use sui::kiosk;
use sui::table::{Self, Table};
use sui::package::{Self, Publisher};
use sui::sui::SUI;
use sui::transfer_policy::{Self as tp};
use walrus::blob::Blob;
use kiosk::royalty_rule;
use kiosk::personal_kiosk;

// === Constants ===

const POLICY_RESTRICTED:     u8 = 0;
const POLICY_ALLOW_LIST:     u8 = 1;
const POLICY_PERMISSIONLESS: u8 = 2;

// === Seal content protection (D-074 / D-075 / D-076) ===
//
// Package version stamped onto every Model3D at publish (`seal_version`) and
// asserted in `seal_approve_*`. A future COMPATIBLE upgrade that changes the gate
// logic MUST bump VERSION; already-encrypted models carry the OLD version and then
// fail `seal_approve` (fail-CLOSED) rather than being silently re-gated by the new
// rule. It is a tripwire forcing a conscious migration, NOT seamless versioning.
// plan-027 bumps it 1→2 (the decrypt-gate relocation from the cap to the
// AccessEntitlement is a logic change): every abandoned v9 object carries the
// OLD version and fails seal_approve (fail-CLOSED). The check rides the gas-free
// key-server dry-run.
const VERSION: u64 = 2;

// Bounds for the Seal envelope fields (defensive, matching the module's
// validate-everything posture). `sealed_key` is the Seal-wrapped 32-byte AES key
// (a BCS EncryptedObject — a few hundred bytes); `seal_id` is the client's random
// per-model Seal-identity prefix (32 bytes today); 1024 / 64 are generous ceilings.
const MAX_SEALED_KEY_LEN:   u64 = 1024;
const MAX_SEAL_ID_LEN:      u64 = 64;
const MAX_PREVIEW_BLOBS:    u64 = 8;

// Cap on the per-license `derivative_royalty_bps` field (D-004: 30%).
// This is L2 derivative-royalty territory, deferred to v1.1. It is NOT
// the Phase 4 primary-sale royalty rate — see AMOUNT_BP_DEFAULT below.
// Two constants, two different concerns; do not unify.
const MAX_DERIVATIVE_ROYALTY_BPS: u16 = 3000;

// Phase 4 U3 — TransferPolicy royalty rule configuration.
//
// Naming relationship to MAX_DERIVATIVE_ROYALTY_BPS above: NONE. That is
// the per-license cap on the deferred L2-derivative royalty field;
// AMOUNT_BP_DEFAULT below is the live Phase 4 primary-sale royalty rate
// applied by the built-in RoyaltyRule. Phase 4 sales pay AMOUNT_BP_DEFAULT;
// L2 derivative creators (v1.1) will pay their own per-derivative bps
// capped by MAX_DERIVATIVE_ROYALTY_BPS via a custom split rule.
//
// AMOUNT_BP_DEFAULT (5% = 500 bps) is the single global royalty rate applied
// to every NftToken listing (D-032: Model3D is no longer Kiosk-traded).
// Per-listing variation is out of scope here — RoyaltyRule's Config has no
// setter, and changing the rate requires remove_rule + re-add
// (TransferPolicyCap-holder authority). v1.1's multi-beneficiary case will swap
// the built-in rule for a custom `split_royalty_rule` on the same policy ID
// (see `docs/solutions/architecture-patterns/sui-kiosk-multi-beneficiary-royalty-2026-05-19.md`).
//
// MIN_ROYALTY_AMOUNT_MIST (0.001 SUI = 1_000_000 mist) is the **floor**
// (not a rounding tiebreaker) applied by the built-in royalty_rule:
// `royalty_owed = max(price * amount_bp / 10_000, MIN_ROYALTY_AMOUNT_MIST)`.
// Consequences:
//   - 0-price listing (free) → buyer still pays 1_000_000 mist royalty.
//   - 1-mist listing → buyer pays 1_000_001 mist total; effective rate
//     vastly exceeds amount_bp until price ≥ 0.02 SUI (the crossover).
//   - The `amount * 10_000 / price == royalty_bps` invariant holds ONLY when
//     `price * amount_bp / 10_000 >= MIN_ROYALTY_AMOUNT_MIST`. An NftToken-sale
//     indexer must implement both branches; otherwise sub-0.02-SUI sales trip
//     false-positive replay-mismatch alerts.
const AMOUNT_BP_DEFAULT:     u16 = 500;
const MIN_ROYALTY_AMOUNT_MIST: u64 = 1_000_000;

// === Errors ===

const ERoyaltyTooHigh:      u64 = 0;
// D-018 — input bound assertions
const ETooManyTags:         u64 = 10;
const ETagTooLong:          u64 = 11;
const EParamsJsonTooLong:   u64 = 12;
const ENameTooLong:         u64 = 13;
const EBlobIdMalformed:     u64 = 14;
// Codes 15-19 reserved for future Phase 2-style input validations
// (preserves the contiguous 10-14 block above for related family).
// Phase 4 codes start at 20.
const EWrongPublisher:      u64 = 20;
// Code 21 (EWrongRoyaltyRate) retired with the L1 `purchase_with_kiosk` path
// (D-032). Not reused — abort codes are part of the on-chain ABI history.

// D-029 — NFT collection layer + integration registry. Existing range is
// 0,10-14,20,21; this block starts at 30 (no collision).
const EIntegrationsClosed:   u64 = 30; // register_integration when collection integration_policy != permissionless
const EFeeTooLow:            u64 = 31; // register_integration payment < register_fee
const EAlreadyRegistered:    u64 = 32; // per-(integrator,collection) uniqueness
const EAppMetadataTooLong:   u64 = 33; // app_metadata exceeds APP_METADATA_MAX
const EWrongCollectionCap:   u64 = 34; // cap does not authorize this collection
const EInsufficientDeriveFee: u64 = 35; // launch_collection payment < derivative_mint_fee
// D-035 — mint_nft_token's patch_id exceeds MAX_PATCH_ID_LEN.
const EPatchIdMalformed:     u64 = 36;
// D-038 — launch_collection_with_tokens: token_names / token_patch_ids lengths differ.
const EBatchLenMismatch:     u64 = 37;
// D-040 — base model's license.policy is non-permissionless and caller is not the creator.
const EPolicyRestricted:     u64 = 38;
// plan-013 — per-part label bounds on the segmented-mesh `part_labels` vector.
const ETooManyParts:         u64 = 39;
const EPartLabelTooLong:     u64 = 40;
// D-076 — ALLOW_LIST base published with derivative_mint_fee == 0. With no
// on-chain address allowlist in v1, ALLOW_LIST means "pay to fork"; fee==0 makes
// it logically identical to PERMISSIONLESS-with-pointless-encryption.
const EAllowListNeedsFee:    u64 = 41;
// D-075 — Seal envelope field bounds.
const ESealedKeyTooLong:     u64 = 42;
const ESealIdTooLong:        u64 = 43;
const ETooManyPreviews:      u64 = 44;
// D-075 — Seal field/policy consistency: `is_encrypted` (derived from policy)
// must agree with the presence of sealed_key + seal_id, and previews/seal fields
// must be absent on an unencrypted (PERMISSIONLESS) publish. Forces each policy
// through its correct entry (`publish` vs `publish_encrypted`).
const ESealFieldsInconsistent: u64 = 45;
// D-075 — `publish_encrypted` called with a PERMISSIONLESS license (must use the
// plain `publish`).
const ENotEncryptedPolicy:   u64 = 46;
// D-075 — `seal_id` already recorded in the SealIdRegistry (global-uniqueness
// guard that defeats the copy attack — see D-075 Resolution G).
const ESealIdReused:         u64 = 47;
// Codes 48 (ECapCollectionMismatch) + 49 (ECollectionModelMismatch) retired with
// the seal_approve_cap path (plan-027 — decrypt gate relocated to AccessEntitlement).
// Not reused — abort codes are part of the on-chain ABI history.
const EIdPrefixMismatch:       u64 = 50; // Seal id not prefixed by model.seal_id
const ESealVersionMismatch:    u64 = 51; // model.seal_version != VERSION
// D-075 — seal_approve_creator: caller is not the base creator (RESTRICTED).
const ENotBaseCreator:         u64 = 52;
// plan-027 — paid access entitlement split.
const EInsufficientAccessFee:  u64 = 53; // purchase_access payment < access_fee
const ENotPurchasable:         u64 = 54; // purchase_access / entitlement entry on a non-ALLOW_LIST base
const EAlreadyHasEntitlement:  u64 = 55; // wallet already holds an entitlement for this model
const EEntitlementModelMismatch: u64 = 56; // entitlement.model_id != id(model)
const ENotEntitlementHolder:   u64 = 57; // entitlement.holder != ctx.sender()
const EEntitlementRequired:    u64 = 58; // ALLOW_LIST launch attempted via a non-entitlement entry

const MAX_TAGS:             u64 = 16;
const MAX_TAG_LEN:          u64 = 32;
const MAX_PARAMS_JSON_LEN:  u64 = 4096;
const MAX_NAME_LEN:         u64 = 128;
const MAX_BLOB_ID_LEN:      u64 = 128;
// D-035 — bound on an NftToken's quilt-patch id (URL-safe base64 quilt patch
// identifier). Same generous 128-byte ceiling as a Walrus blob id.
const MAX_PATCH_ID_LEN:     u64 = 128;
// plan-013 — bound on the segmented-mesh per-part label vector. Tripo's
// mesh_segmentation produces variable N (spike: 12 parts on a car); 64 is the
// safety ceiling with linear cost in `validate_publish_inputs`. Each element
// reuses MAX_TAG_LEN (32) for per-label string length — identical pattern to
// `tags`, distinct vector cap so the two bounds can evolve independently.
//
// LOCKSTEP CONTRACT: this constant must equal `MAX_PARTS_FE` in
// `shared/src/types.ts`. A divergence ships as either an unforkable base (TS
// allows publish, Move rejects) or wasted UI surface (TS rejects, Move would
// have accepted). No cross-language enforcement is feasible at hackathon
// scope; the safety net is grep + code review.
const MAX_PARTS:            u64 = 64;
// D-029 — on-chain length cap on register_integration's app_metadata blob.
// Length-only guard; the backend (U7) validates the full UTF-8 JSON schema
// (name+url). 512 bytes comfortably holds {name<=64, url<=256} + JSON syntax.
const APP_METADATA_MAX:     u64 = 512;

// === One-Time Witness ===

// Uppercase per Sui OTW convention (module-name-uppercased struct, `drop` only,
// constructed exactly once at package publish by the runtime + passed to `init`).
public struct MODEL3D has drop {}

// === Types ===

public struct LicenseTerms has store, copy, drop {
    policy: u8,
    derivative_mint_fee: u64,
    derivative_royalty_bps: u16,
    commercial_use: bool,
    require_attribution: bool,
    // plan-027 — one-time access fee a buyer pays via `purchase_access` to mint a
    // soulbound AccessEntitlement (gates Seal decryption). Distinct from
    // derivative_mint_fee (per-launch). ALLOW_LIST requires access_fee > 0 at
    // publish (EAllowListNeedsFee, meaning shifted from derive→access).
    access_fee: u64,
}

// `has key, store`. Published as a SHARED object by `publish` (D-032) — sells
// access, not ownership, so it is NOT Kiosk-placed. `store` is retained (inert
// for a shared object, which cannot be owned/transferred) to avoid an
// ability-shape change; the access gate is Seal (v1.1), not Kiosk.
public struct Model3D has key, store {
    id: UID,
    creator: address,
    shape_type: String,
    params_json: String,
    name: String,
    tags: vector<String>,
    lineage_blob_id: String,
    // D-037 — the Walrus blob holding this L1 model's GLB mesh, uploaded as a
    // STANDALONE blob (not quilted) and resolved via `/v1/blobs/<glb_blob_id>`.
    // Closes the L1 GLB-resolution gap: Browse previews the base mesh and an
    // nft creator forks it. Mirrors lineage_blob_id exactly (same
    // MAX_BLOB_ID_LEN bound + EBlobIdMalformed code).
    glb_blob_id: String,
    // plan-013 — per-part semantic labels for a segmented-mesh GLB (one entry
    // per material/node index from Tripo's mesh_segmentation output). Empty
    // vector is the legacy sentinel ("single-material base, route through the
    // pre-segmentation editor"). Variant authoring derives `uniqueLabels` from
    // this vector and resolves a per-label palette to a positional per-part
    // color array at build time. Length-bounded by MAX_PARTS; per-element by
    // MAX_TAG_LEN.
    part_labels: vector<String>,
    // D-075 — encryption is DERIVED from license.policy (PERMISSIONLESS → false,
    // ALLOW_LIST/RESTRICTED → true) and fixed at publish. Closes the decorative-
    // flag gap (was a caller-supplied bool that was never enforced). The client
    // reads this to choose the read path: plaintext GLB vs AES-ciphertext + Seal.
    is_encrypted: bool,
    // D-075 — Seal envelope fields (empty/0 on the PERMISSIONLESS path):
    //   sealed_key — the Seal-wrapped AES-256-GCM key (BCS EncryptedObject) that
    //     decrypts the (now ciphertext) blob at `glb_blob_id`.
    //   seal_id    — the client's random per-model Seal-identity PREFIX. Made
    //     globally unique at publish via SealIdRegistry (D-075 Resolution G), so
    //     `is_prefix(seal_id, id)` in seal_approve binds a ciphertext to exactly
    //     one model and the copy attack is impossible.
    //   seal_version — VERSION at publish; asserted in seal_approve (tripwire).
    sealed_key: vector<u8>,
    seal_id: vector<u8>,
    // D-075 — public preview-still Walrus blob ids. ALLOW_LIST only (lets a
    // prospective forker evaluate an encrypted base before paying); RESTRICTED is
    // off-catalog with none; PERMISSIONLESS shows the real mesh so none.
    preview_blob_ids: vector<String>,
    seal_version: u64,
    license: LicenseTerms,
    created_at_ms: u64,
    // plan-027 — duplicate-purchase guard for `purchase_access`. A wallet present
    // here already holds an AccessEntitlement for this model, so a re-purchase
    // (double-click / dropped-connection retry) aborts EAlreadyHasEntitlement
    // rather than minting a second entitlement and charging twice. The Table
    // value is unit `true` (set membership).
    buyers: Table<address, bool>,
}

// D-075 — singleton registry of every `seal_id` ever used, bootstrapped once in
// `init` and shared. `publish_encrypted` asserts a new model's `seal_id` is absent
// here before recording it, guaranteeing global uniqueness. That uniqueness is the
// load-bearing defense behind the `is_prefix(model.seal_id, id)` binding in
// seal_approve: without it, an attacker could publish a throwaway model carrying a
// victim's `seal_id`, fork it cheaply, and decrypt the victim's ciphertext (see
// D-075 Resolution G). The Table value is unit `true` (set membership).
public struct SealIdRegistry has key {
    id: UID,
    used: Table<vector<u8>, bool>,
}

// === D-029 — NFT collection layer (L2) ===
//
// Reverses D-013's deferral: the NFT collection layer ships as real v1 surface.
// `Access` (the old L3 soulbound receipt) is DELETED — its "soulbound by Move
// ability" role re-anchors to `NftCollectionCreatorCap` below (spec.md §1.7 #3).
// Receipt-of-ownership is now the key+store token / Model3D object itself.

// One integrator's B2B attestation record, keyed by integrator address inside
// the collection's `integrations` Table. `app_metadata` is a length-bounded
// (APP_METADATA_MAX) opaque blob; the backend validates its JSON schema.
public struct IntegrationRecord has store {
    app_metadata: vector<u8>,
    registered_at_ms: u64,
}

// L2 collection derived from a base Model3D by an nft creator via
// `launch_collection` (pay-to-derive, Fork A). Shared so `register_integration`
// callers (gameDevs) can mutate the registry without owning it.
//
// `base_royalty_bps` is a SNAPSHOT taken at launch from the base model's
// `license` (does not track later base-license edits).
public struct NftCollection has key {
    id: UID,
    base_model_id: ID,
    base_creator: address,
    // The nft creator (cap holder) who launched this collection. Recorded at
    // launch so `register_integration` can route the register_fee to them
    // without needing the soulbound cap as an argument (the integrator/gameDev
    // who pays does not hold it). Distinct from `base_creator` (mesh creator,
    // who is paid the derive fee + secondary royalty).
    nft_creator: address,
    base_royalty_bps: u16,
    // D-035 — the Walrus quilt blob holding this collection's colored variant
    // patches (one quilt, N patches). Each minted NftToken binds one patch by
    // id; the frontend resolves token.patch_id → this quilt → the variant GLB
    // via the by-quilt-patch-id aggregator. Snapshot at launch, length-bounded
    // by MAX_BLOB_ID_LEN.
    quilt_blob_id: String,
    // L2 integration gate, set by the nft creator (cap holder) via
    // `set_integration_policy`; defaults to POLICY_PERMISSIONLESS at launch.
    // Whether gameDevs may `register_integration` against THIS collection is a
    // collection-level (L2) decision — NOT inherited from the L1 model license
    // (D-030 refines D-029: the integration gate lives at the level whose owner
    // earns the register fee).
    integration_policy: u8,
    register_fee: u64,
    integrations: Table<address, IntegrationRecord>,
}

// Authority over one `NftCollection`. `has key` ONLY (no `store`) → soulbound:
// cannot be wrapped, Kiosk-placed, or `public_transfer`'d. Re-anchors the
// "soulbound by Move ability" pattern formerly held by `Access`.
public struct NftCollectionCreatorCap has key {
    id: UID,
    collection_id: ID,
}

// plan-027 — soulbound, permanent receipt of paid access to an ALLOW_LIST base.
// `has key` ONLY (no `store`) → cannot be wrapped, Kiosk-placed, or
// `public_transfer`'d; the only exit is `transfer::transfer(x, ctx.sender())`
// from inside this module (mirrors NftCollectionCreatorCap). Gates Seal
// decryption via `seal_approve_entitlement` and authorizes an ALLOW_LIST launch
// via `launch_collection_with_entitlement`.
public struct AccessEntitlement has key {
    id: UID,
    model_id: ID,
    holder: address,
}

// Fork B — a tradeable token minted from an `NftCollection` by its cap holder.
// `key + store` so it can be Kiosk-`place`'d (like `Model3D`) and resold under
// its OWN per-type `TransferPolicy<NftToken>` (created once by
// `ensure_collection_policy`). Coexists with the unchanged L1 `Model3D` sale.
public struct NftToken has key, store {
    id: UID,
    collection_id: ID,
    base_model_id: ID,
    name: String,
    // D-035 — the quilt-patch id this token binds (one colored variant inside
    // the collection's quilt). Resolves to a variant GLB via the parent
    // collection's `quilt_blob_id` + the by-quilt-patch-id aggregator. Multiple
    // tokens may share one patch_id (a "red edition").
    patch_id: String,
}

// === Events ===

public struct ModelPublished has copy, drop {
    model_id: ID,
    creator: address,
    policy: u8,
    lineage_blob_id: String,
    // plan-013 — carried so the indexer populates `Model3DSummary.partLabels`
    // straight from the event payload (no follow-up `getObject` on the new
    // shared model).
    part_labels: vector<String>,
    // D-075 — carried so the indexer routes the read path (ciphertext vs
    // plaintext) and renders ALLOW_LIST preview stills without a getObject.
    // RESTRICTED is filtered OFF the public catalog by the indexer (private).
    is_encrypted: bool,
    preview_blob_ids: vector<String>,
}

// D-029 — emitted by `launch_collection` when an nft creator derives a
// collection from a base Model3D.
public struct CollectionLaunched has copy, drop {
    collection_id: ID,
    base_model_id: ID,
    nft_creator: address,
}

// plan-027 — emitted by `purchase_access` when a buyer pays the access fee on an
// ALLOW_LIST base and receives a soulbound AccessEntitlement. The indexer reads
// this to surface the buyer's owned-access set; `paid` is the access fee routed
// to the base creator.
public struct AccessPurchased has copy, drop {
    entitlement_id: ID,
    model_id: ID,
    buyer: address,
    paid: u64,
}

// D-029 — emitted by `mint_nft_token`. The L2 analog of `ModelPublished`:
// surfaces the new token's id for the frontend/indexer (resolving the listing
// without parsing the PTB) and links it to its collection + base model.
public struct NftTokenMinted has copy, drop {
    token_id: ID,
    collection_id: ID,
    base_model_id: ID,
    nft_creator: address,
    // D-035 — carried so the indexer can resolve the variant GLB straight from
    // the event (no follow-up getObject on the now-owned token).
    patch_id: String,
}

// D-029 — emitted by `register_integration` (inside the call frame, so an
// aborted registration rolls the event back atomically). Deliberately LEAN:
// `app_metadata` is NOT carried here — the collection's `integrations` Table is
// the single source of truth. The U7 indexer reads this event to learn a
// (collection, integrator) pair registered, then resolves `app_metadata` from
// the Table via `getDynamicFieldObject`. No data is duplicated on-chain.
public struct IntegrationRegistered has copy, drop {
    collection_id: ID,
    integrator: address,
    registered_at_ms: u64,
}

// (RoyaltyPaid event + emit_royalty_paid retired with the L1 Kiosk sale path,
// D-032. NftToken resale royalty flows through the Kiosk RoyaltyRule directly;
// the indexer reads framework `kiosk::ItemPurchased<NftToken>` events.)

// === Module initializer (one-time, on publish) ===

// Claims `Publisher` from the MODEL3D OTW and transfers it to the deployer
// (= whoever runs `sui client publish`; for testnet this is the dev's
// interactive Sui CLI keychain per R2). `ensure_collection_policy` consumes
// the Publisher to create `TransferPolicy<NftToken>`.
fun init(otw: MODEL3D, ctx: &mut TxContext) {
    let publisher = package::claim(otw, ctx);
    transfer::public_transfer(publisher, ctx.sender());
    // D-075 — bootstrap the singleton SealIdRegistry exactly once, at publish.
    // Sharing it here (rather than via a separate ceremony) guarantees there is
    // precisely one canonical registry per package; the frontend pins its id.
    transfer::share_object(SealIdRegistry { id: object::new(ctx), used: table::new(ctx) });
}

// === D-029 / D-032 — TransferPolicy<NftToken> bootstrap ===
//
// The ONLY TransferPolicy this package creates (D-032 removed the
// `TransferPolicy<Model3D>` bootstrap — Model3D is shared, not Kiosk-traded).
// Creates the per-type `TransferPolicy<NftToken>`, attaches ONLY the built-in
// royalty rule (D-036 dropped the lock + personal_kiosk rules so a bought token
// is freely usable — gameDev-friendly), shares the policy, and hands the
// `TransferPolicyCap<NftToken>` to the caller. One-time per package (run at the
// v4 bootstrap, U17).
//
// D-036 consequence on the resale hot-potato: with only the royalty rule, a
// buyer's `confirm_request<NftToken>` needs just the royalty receipt — no
// `kiosk_lock_rule::prove` / `personal_kiosk_rule::prove` — and the purchased
// token is taken out of the sale rather than re-locked into a Kiosk.
//
// Ordering invariant (R12 —
// `docs/solutions/kiosk-ptb-patterns/transfer-policy-before-place.md`): rules
// MUST be attached BEFORE the policy is shared (and before any
// `kiosk::place<NftToken>` runs anywhere). Doing this all inside one entry fn
// makes the order fail-safe by construction.
//
// Publisher type check: `package::from_package<NftToken>` asserts the supplied
// Publisher was claimed by THIS package; a foreign Publisher aborts
// `EWrongPublisher`.
//
// Phase 4 wires a single global royalty (AMOUNT_BP_DEFAULT bps / MIN floor).
// v1.1's multi-beneficiary case removes the built-in rule and adds a custom
// `split_royalty_rule` on the same policy ID (`TransferPolicyCap` holder
// authority required) — see
// `docs/solutions/architecture-patterns/sui-kiosk-multi-beneficiary-royalty-2026-05-19.md`.
//
// **NOT idempotent despite the `ensure_` prefix.** Each call creates a fresh
// policy + cap; calling twice yields two competing policies. U5 pins the policy
// ID in `networks/{net}.json` at first deploy. See `contracts/UPGRADE.md`.
//
// TODO(mainnet): TransferPolicyCap holds `withdraw` + `remove_rule` + `add_rule`
// authority. Testnet hands it to `ctx.sender()` (deployer hot wallet); mainnet
// ceremony must move it to a hardware wallet or multisig immediately.
public entry fun ensure_collection_policy(publisher: &Publisher, ctx: &mut TxContext) {
    assert!(package::from_package<NftToken>(publisher), EWrongPublisher);

    let (mut policy, cap) = tp::new<NftToken>(publisher, ctx);
    royalty_rule::add<NftToken>(&mut policy, &cap, AMOUNT_BP_DEFAULT, MIN_ROYALTY_AMOUNT_MIST);

    transfer::public_share_object(policy);
    transfer::public_transfer(cap, ctx.sender());
}

// === LicenseTerms constructor ===

// plan-027 — `access_fee` is appended as the LAST param (after the original five)
// to minimize positional churn across the many call sites. It is the one-time
// pay-to-decrypt price; ALLOW_LIST requires it > 0 at publish.
public fun new_license_terms(
    policy: u8,
    derivative_mint_fee: u64,
    derivative_royalty_bps: u16,
    commercial_use: bool,
    require_attribution: bool,
    access_fee: u64,
): LicenseTerms {
    LicenseTerms {
        policy,
        derivative_mint_fee,
        derivative_royalty_bps,
        commercial_use,
        require_attribution,
        access_fee,
    }
}

public fun policy_restricted(): u8 { POLICY_RESTRICTED }
public fun policy_allow_list(): u8 { POLICY_ALLOW_LIST }
public fun policy_permissionless(): u8 { POLICY_PERMISSIONLESS }
public fun max_derivative_royalty_bps(): u16 { MAX_DERIVATIVE_ROYALTY_BPS }
public fun amount_bp_default(): u16 { AMOUNT_BP_DEFAULT }
public fun min_royalty_amount_mist(): u64 { MIN_ROYALTY_AMOUNT_MIST }

// === Read-only accessors (used by Phase 4 frontend + indexers + tests) ===

public fun creator(model: &Model3D): address { model.creator }
public fun shape_type(model: &Model3D): &String { &model.shape_type }
public fun params_json(model: &Model3D): &String { &model.params_json }
public fun name(model: &Model3D): &String { &model.name }
public fun tags(model: &Model3D): &vector<String> { &model.tags }
public fun lineage_blob_id(model: &Model3D): &String { &model.lineage_blob_id }
public fun glb_blob_id(model: &Model3D): &String { &model.glb_blob_id }
public fun part_labels(model: &Model3D): &vector<String> { &model.part_labels }
public fun is_encrypted(model: &Model3D): bool { model.is_encrypted }
public fun sealed_key(model: &Model3D): &vector<u8> { &model.sealed_key }
public fun seal_id(model: &Model3D): &vector<u8> { &model.seal_id }
public fun preview_blob_ids(model: &Model3D): &vector<String> { &model.preview_blob_ids }
public fun seal_version(model: &Model3D): u64 { model.seal_version }
public fun license(model: &Model3D): &LicenseTerms { &model.license }
public fun created_at_ms(model: &Model3D): u64 { model.created_at_ms }
public fun license_policy(license: &LicenseTerms): u8 { license.policy }
public fun license_derivative_royalty_bps(license: &LicenseTerms): u16 {
    license.derivative_royalty_bps
}
// plan-027 — one-time access fee (mist) for `purchase_access`.
public fun license_access_fee(license: &LicenseTerms): u64 { license.access_fee }

// === D-029 — NftCollection / cap accessors ===

public fun collection_base_model_id(c: &NftCollection): ID { c.base_model_id }
public fun collection_base_creator(c: &NftCollection): address { c.base_creator }
public fun collection_nft_creator(c: &NftCollection): address { c.nft_creator }
public fun collection_integration_app_metadata(c: &NftCollection, who: address): &vector<u8> {
    &c.integrations.borrow(who).app_metadata
}
public fun collection_base_royalty_bps(c: &NftCollection): u16 { c.base_royalty_bps }
public fun collection_quilt_blob_id(c: &NftCollection): &String { &c.quilt_blob_id }
public fun collection_integration_policy(c: &NftCollection): u8 { c.integration_policy }
public fun collection_register_fee(c: &NftCollection): u64 { c.register_fee }
public fun collection_has_integration(c: &NftCollection, who: address): bool {
    c.integrations.contains(who)
}
public fun cap_collection_id(cap: &NftCollectionCreatorCap): ID { cap.collection_id }

public fun nft_token_collection_id(t: &NftToken): ID { t.collection_id }
public fun nft_token_base_model_id(t: &NftToken): ID { t.base_model_id }
public fun nft_token_name(t: &NftToken): &String { &t.name }
public fun nft_token_patch_id(t: &NftToken): &String { &t.patch_id }

// === Input validation (D-018) ===

// Extracted so unit tests can exercise the assertion ladder without
// constructing a Walrus Blob (which requires the full System + Storage flow).
// `public(package)` because no external caller has a legitimate reason to
// validate inputs without then constructing a Model3D — keeping the ABI
// surface minimal reduces future-upgrade-compat risk.
public(package) fun validate_publish_inputs(
    params_json: &String,
    name: &String,
    tags: &vector<String>,
    lineage_blob_id: &String,
    glb_blob_id: &String,
    part_labels: &vector<String>,
    license: &LicenseTerms,
) {
    assert!(license.derivative_royalty_bps <= MAX_DERIVATIVE_ROYALTY_BPS, ERoyaltyTooHigh);
    assert!(vector::length(tags) <= MAX_TAGS, ETooManyTags);
    let mut i = 0;
    let n = vector::length(tags);
    while (i < n) {
        assert!(string::length(vector::borrow(tags, i)) <= MAX_TAG_LEN, ETagTooLong);
        i = i + 1;
    };
    assert!(string::length(params_json) <= MAX_PARAMS_JSON_LEN, EParamsJsonTooLong);
    assert!(string::length(name) <= MAX_NAME_LEN, ENameTooLong);
    assert!(string::length(lineage_blob_id) <= MAX_BLOB_ID_LEN, EBlobIdMalformed);
    // D-037 — same bound + abort code as lineage_blob_id.
    assert!(string::length(glb_blob_id) <= MAX_BLOB_ID_LEN, EBlobIdMalformed);
    // plan-013 — bound the per-part label vector (cap + per-element string len).
    // Reuses MAX_TAG_LEN for label string length so labels and tags share the
    // same per-string ceiling; MAX_PARTS is the dedicated cap on the count.
    assert!(vector::length(part_labels) <= MAX_PARTS, ETooManyParts);
    let mut j = 0;
    let m = vector::length(part_labels);
    while (j < m) {
        assert!(string::length(vector::borrow(part_labels, j)) <= MAX_TAG_LEN, EPartLabelTooLong);
        j = j + 1;
    };
}

// D-075 / D-076 — Seal-specific publish validation, split out so tests can
// exercise the fee assert + envelope bounds directly (mirroring why
// `validate_publish_inputs` is package-public). Called from `new_model` alongside
// the general validator. Bounds-only on the seal fields here; the policy↔field
// CONSISTENCY check (encrypted ⇔ key/id present) lives in `new_model`, which is
// where `is_encrypted` is derived.
public(package) fun validate_seal_publish(
    sealed_key: &vector<u8>,
    seal_id: &vector<u8>,
    preview_blob_ids: &vector<String>,
    license: &LicenseTerms,
) {
    // plan-027 (amends D-076) — the ALLOW_LIST fee gate moves derive→access: the
    // ACCESS fee is now the content gate (pay-to-decrypt), so ALLOW_LIST requires
    // access_fee > 0. The derive fee may now be 0 (it became a per-launch
    // provenance/convenience charge, no longer the content gate). fee == 0 access
    // would collapse ALLOW_LIST to PERMISSIONLESS + pointless encryption.
    assert!(
        license.policy != POLICY_ALLOW_LIST || license.access_fee > 0,
        EAllowListNeedsFee,
    );
    // D-075 — Seal envelope field bounds.
    assert!(vector::length(sealed_key) <= MAX_SEALED_KEY_LEN, ESealedKeyTooLong);
    assert!(vector::length(seal_id) <= MAX_SEAL_ID_LEN, ESealIdTooLong);
    assert!(vector::length(preview_blob_ids) <= MAX_PREVIEW_BLOBS, ETooManyPreviews);
    let mut pv = 0;
    let npv = vector::length(preview_blob_ids);
    while (pv < npv) {
        assert!(string::length(vector::borrow(preview_blob_ids, pv)) <= MAX_BLOB_ID_LEN, EBlobIdMalformed);
        pv = pv + 1;
    };
}

// === Model3D constructor (foundation; `publish` shares it — D-032) ===

// Pure constructor — does NOT share the returned Model3D. The public entry fn
// `publish` (below) calls this and then `transfer::share_object` in the same
// PTB, so the "ONE wallet popup" R3 contract holds.
//
// `public(package)` so the only public surface is `publish` (which shares the
// model). Exposing `new_model` as `public` would let external PTBs construct a
// Model3D and `public_transfer` it into private ownership, defeating the
// shared-object/access model. Same-package callers (`publish`, tests) keep
// access.
//
// Blob lifecycle is FIXED in this constructor: the Blob is `public_transfer`'d
// to `ctx.sender()` before the Model3D is constructed. `ctx.sender()` ==
// intended Blob owner == `creator` field on the resulting Model3D.
//
// **R12 — Sponsored-tx constraint**: `ctx.sender()` is recorded as `creator`.
// Caller MUST NOT wrap `publish` in a sponsored PTB unless the sponsor IS the
// intended creator. Phase 4 zkLogin flow signs directly; this constraint is
// documentary for any future sponsored-mint path.
public(package) fun new_model(
    blob: Blob,
    shape_type: String,
    params_json: String,
    name: String,
    tags: vector<String>,
    lineage_blob_id: String,
    glb_blob_id: String,
    part_labels: vector<String>,
    sealed_key: vector<u8>,
    seal_id: vector<u8>,
    preview_blob_ids: vector<String>,
    license: LicenseTerms,
    clock: &Clock,
    ctx: &mut TxContext,
): Model3D {
    validate_publish_inputs(
        &params_json, &name, &tags, &lineage_blob_id, &glb_blob_id, &part_labels, &license,
    );
    validate_seal_publish(&sealed_key, &seal_id, &preview_blob_ids, &license);

    // D-075 — encryption is DERIVED from policy and fixed at publish (closes the
    // decorative-flag gap): anything other than PERMISSIONLESS is encrypted.
    let is_encrypted = license.policy != POLICY_PERMISSIONLESS;

    // D-075 — Seal field/policy consistency. An encrypted model MUST carry both a
    // wrapped key and a seal_id (else it is bricked: undecryptable + unforkable);
    // an unencrypted model MUST carry neither, and no previews. This forces each
    // policy through its correct entry (`publish` vs `publish_encrypted`).
    let has_key = !vector::is_empty(&sealed_key);
    let has_id = !vector::is_empty(&seal_id);
    assert!(has_key == is_encrypted, ESealFieldsInconsistent);
    assert!(has_id == is_encrypted, ESealFieldsInconsistent);
    assert!(is_encrypted || vector::is_empty(&preview_blob_ids), ESealFieldsInconsistent);

    // Fixed Blob lifecycle (see fn-header note): transferred to creator BEFORE
    // model construction. Walrus storage stays paid for the registered epoch
    // span; the Blob object becomes a creator-owned pointer the frontend
    // resolves to bytes via the aggregator. When encrypted, the bytes at
    // `glb_blob_id` are AES-ciphertext (Seal gates the key, not the blob).
    transfer::public_transfer(blob, ctx.sender());

    let model = Model3D {
        id: object::new(ctx),
        creator: ctx.sender(),
        shape_type,
        params_json,
        name,
        tags,
        lineage_blob_id,
        glb_blob_id,
        part_labels,
        is_encrypted,
        sealed_key,
        seal_id,
        preview_blob_ids,
        seal_version: VERSION,
        license,
        created_at_ms: clock.timestamp_ms(),
        // plan-027 — empty at publish; populated by `purchase_access`.
        buyers: table::new(ctx),
    };
    event::emit(ModelPublished {
        model_id: object::id(&model),
        creator: ctx.sender(),
        policy: license.policy,
        lineage_blob_id: model.lineage_blob_id,
        part_labels: model.part_labels,
        is_encrypted: model.is_encrypted,
        preview_blob_ids: model.preview_blob_ids,
    });
    model
}

// === Model3D publish (D-032) — shared object, sells access not ownership ===

// `publish` — atomic mint + share in one PTB → one wallet popup (R3 / AE1).
// Constructs the Model3D via `new_model` (emits `ModelPublished`, transfers the
// Blob to the creator) and `transfer::share_object`s it. The model is SHARED,
// not Kiosk-placed: it sells access (Seal-gated, v1.1), and sharing makes it
// referenceable by any wallet so a different-wallet nft creator can fork it via
// `launch_collection(model: &Model3D, …)`. License/royalty cap is enforced
// inside `new_model` (ERoyaltyTooHigh), so `publish` cannot bypass it.
// `publish` — the UNENCRYPTED (PERMISSIONLESS) path. Seal fields are empty; the
// `new_model` consistency guard aborts (`ESealFieldsInconsistent`) if this is
// called with a non-PERMISSIONLESS license, forcing encrypted policies through
// `publish_encrypted`. `is_encrypted` is no longer a caller argument (D-075 — it
// is derived from policy inside `new_model`).
public entry fun publish(
    blob: Blob,
    shape_type: String,
    params_json: String,
    name: String,
    tags: vector<String>,
    lineage_blob_id: String,
    glb_blob_id: String,
    part_labels: vector<String>,
    license: LicenseTerms,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let model = new_model(
        blob,
        shape_type,
        params_json,
        name,
        tags,
        lineage_blob_id,
        glb_blob_id,
        part_labels,
        vector<u8>[],     // sealed_key — unencrypted
        vector<u8>[],     // seal_id    — unencrypted
        vector<String>[], // preview_blob_ids — unencrypted
        license,
        clock,
        ctx,
    );
    transfer::share_object(model);
}

// D-075 — the ENCRYPTED (ALLOW_LIST / RESTRICTED) publish path. Identical
// one-transaction shape to `publish` (upload ciphertext → publish blob), plus:
// the bytes at `glb_blob_id` are AES-ciphertext, `sealed_key` is the Seal-wrapped
// AES key, and `seal_id` is the client's random Seal-identity prefix. Resolution G:
// the registry asserts `seal_id` has never been used before recording it, which is
// what makes `is_prefix(model.seal_id, id)` in seal_approve an unforgeable per-model
// binding (a copied seal_id is rejected here). PERMISSIONLESS is rejected — it must
// use `publish`.
public entry fun publish_encrypted(
    registry: &mut SealIdRegistry,
    blob: Blob,
    shape_type: String,
    params_json: String,
    name: String,
    tags: vector<String>,
    lineage_blob_id: String,
    glb_blob_id: String,
    part_labels: vector<String>,
    sealed_key: vector<u8>,
    seal_id: vector<u8>,
    preview_blob_ids: vector<String>,
    license: LicenseTerms,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(license.policy != POLICY_PERMISSIONLESS, ENotEncryptedPolicy);
    // Global-uniqueness guard (copy-attack defense). `seal_id` has `copy`, so the
    // membership check + the recording insert + the constructor each take a copy.
    assert!(!table::contains(&registry.used, seal_id), ESealIdReused);
    table::add(&mut registry.used, seal_id, true);

    let model = new_model(
        blob,
        shape_type,
        params_json,
        name,
        tags,
        lineage_blob_id,
        glb_blob_id,
        part_labels,
        sealed_key,
        seal_id,
        preview_blob_ids,
        license,
        clock,
        ctx,
    );
    transfer::share_object(model);
}

// === ensure_creator_kiosk — the nft creator's PersonalKiosk for NftTokens ===

// `ensure_creator_kiosk(ctx)` is the first-time helper for an nft creator who
// wants to LIST an owned `NftToken` for sale. Post-D-036 `mint_nft_token` does
// NOT place into a Kiosk (it `public_transfer`s a plain owned token); Kiosk
// placement is a separate opt-in step the creator runs only when selling (a
// `kiosk::place_and_list<NftToken>` PTB). So this helper is a prerequisite for
// the listing path, NOT for mint. It:
//   1. Creates a fresh `Kiosk` + `KioskOwnerCap` via `sui::kiosk::new`,
//   2. Wraps the `KioskOwnerCap` in a `PersonalKioskCap` via
//      `kiosk::personal_kiosk::new` (sets the OwnerMarker dynamic field). NOTE
//      (D-036): the `TransferPolicy<NftToken>` no longer carries
//      `personal_kiosk_rule`, so the OwnerMarker is no longer load-bearing for
//      policy enforcement — a plain Kiosk would also satisfy the royalty-only
//      confirm chain. Personal kiosk is kept as the mainstream listing form.
//   3. Shares the Kiosk (so buyers can read listings and `purchase`),
//   4. Transfers the `PersonalKioskCap` (key-only, soulbound) to ctx.sender().
//
// Once `personal_kiosk::new` runs, the underlying `KioskOwnerCap` cannot be
// extracted as a freely-transferable value (only `borrow` / `borrow_mut` / the
// hot-potato `borrow_val`/`return_val` pair) — this is what makes the Kiosk
// "personal": it can never change owner.
//
// **NOT idempotent.** Calling twice yields two Kiosks + two PersonalKioskCaps.
// The frontend pins the creator's "primary" Kiosk and avoids a second call.
public entry fun ensure_creator_kiosk(ctx: &mut TxContext) {
    let (mut kiosk_obj, owner_cap) = kiosk::new(ctx);
    // `personal_kiosk::new` consumes the KioskOwnerCap and returns a
    // PersonalKioskCap wrapping it. Mutates the Kiosk to add the OwnerMarker
    // dynamic field (the receipt personal_kiosk_rule checks at purchase).
    let personal_cap = personal_kiosk::new(&mut kiosk_obj, owner_cap, ctx);
    transfer::public_share_object(kiosk_obj);
    personal_kiosk::transfer_to_sender(personal_cap, ctx);
}

// === plan-027 — paid access entitlement (purchase_access) ===

// A buyer pays the one-time access fee on an ALLOW_LIST base and receives a
// soulbound, permanent `AccessEntitlement` that gates Seal decryption. The fee
// routes to the base creator (mirroring launch_collection_internal's coin
// handling). `&mut Model3D` is required to mutate the duplicate-purchase guard
// (`buyers`); the model is a shared object, so the `&mut` is acceptable.
//
// RESTRICTED / PERMISSIONLESS are NOT purchasable (ENotPurchasable) — RESTRICTED
// decrypts only via the creator gate, PERMISSIONLESS is plaintext (no gate).
public entry fun purchase_access(
    model: &mut Model3D,
    mut payment: Coin<SUI>,
    ctx: &mut TxContext,
) {
    assert!(model.license.policy == POLICY_ALLOW_LIST, ENotPurchasable);
    let buyer = ctx.sender();
    // Duplicate-purchase guard (idempotency teeth): a wallet already holding an
    // entitlement for this model cannot re-purchase (no second charge / mint).
    assert!(!model.buyers.contains(buyer), EAlreadyHasEntitlement);
    let fee = model.license.access_fee;
    assert!(coin::value(&payment) >= fee, EInsufficientAccessFee);
    // Read the model id + creator BEFORE the `&mut model.buyers` borrow below.
    let model_id = object::id(model);
    let creator = model.creator;

    // Route the access fee to the base creator; refund any remainder; destroy a
    // zero remainder (zero-coin hygiene).
    if (fee > 0) {
        let fee_coin = coin::split(&mut payment, fee, ctx);
        transfer::public_transfer(fee_coin, creator);
    };
    if (coin::value(&payment) == 0) {
        coin::destroy_zero(payment);
    } else {
        transfer::public_transfer(payment, buyer);
    };

    model.buyers.add(buyer, true);

    let entitlement = AccessEntitlement {
        id: object::new(ctx),
        model_id,
        holder: buyer,
    };
    let entitlement_id = object::id(&entitlement);
    event::emit(AccessPurchased { entitlement_id, model_id, buyer, paid: fee });
    // Soulbound: plain `transfer`, NOT `public_transfer` (AccessEntitlement has
    // `key` only, no `store`).
    transfer::transfer(entitlement, buyer);
}

// === D-029 — NFT collection layer (launch_collection, pay-to-derive Fork A) ===

// An nft creator derives an `NftCollection` from a base `Model3D`. Pay-to-derive
// (Fork A): the caller pays the base license's `derivative_mint_fee` to the base
// creator and receives a soulbound `NftCollectionCreatorCap`. The base creator
// keeps the Model3D and the perpetual-royalty story (`base_royalty_bps` snapshot).
//
// `base_royalty_bps` is a SNAPSHOT read here from the base model's live
// `license`; later edits to the base license do not propagate. The collection's
// own `integration_policy` defaults to POLICY_PERMISSIONLESS (open) and
// `register_fee` to 0 — both are the nft creator's to set afterward via
// `set_integration_policy` / `set_register_fee` (D-030). D-040 — the base
// model's `license.policy` IS now consulted: PERMISSIONLESS allows any payer to
// derive; anything else is creator-only (see the assert in
// `launch_collection_internal`). Integration is still gated separately by the
// collection-level policy.
//
// No `clock` param: the collection carries no timestamp and `CollectionLaunched`
// has no `ts` field. Per-integration timestamps are set in `register_integration`.
// D-038 — launch core: runs the pay-to-derive coin handling + collection/cap
// construction + `CollectionLaunched`, and RETURNS the still-unshared collection
// and cap so a caller can compose more steps in the same tx before sharing.
// Package-private on purpose: the ONLY legal place to `share_object` an
// `NftCollection` or `transfer` the soulbound cap is this module, so each public
// entry wrapper finishes the lifecycle itself (a client PTB cannot, since both
// types are `key`-only). Behavior is identical to the pre-D-038 `launch_collection`.
fun launch_collection_internal(
    model: &Model3D,
    mut payment: Coin<SUI>,
    quilt_blob_id: String,
    ctx: &mut TxContext,
): (NftCollection, NftCollectionCreatorCap) {
    // D-040, amended by D-076 — enforce the base model's L1 license policy. Only
    // RESTRICTED (0) is creator-only; PERMISSIONLESS (2) AND ALLOW_LIST (1) both
    // permit any fee-paying forker. ALLOW_LIST's fee is guaranteed > 0 at publish
    // (EAllowListNeedsFee), so a non-creator ALLOW_LIST fork always pays — that is
    // exactly the Seal pay-to-fork gate (the encrypted base only decrypts once the
    // forker holds the cap this call issues). This is the ONLY gate that consults
    // license.policy; integration is gated separately at the collection level (D-030).
    assert!(
        model.license.policy != POLICY_RESTRICTED || ctx.sender() == model.creator,
        EPolicyRestricted,
    );

    // D-035 — the collection's variant quilt blob (length-bounded, same ceiling
    // + abort code as the model's lineage_blob_id).
    assert!(string::length(&quilt_blob_id) <= MAX_BLOB_ID_LEN, EBlobIdMalformed);

    let base_royalty_bps = model.license.derivative_royalty_bps;
    // D-004 belt-and-suspenders: the base model already passed this bound at
    // mint (validate_publish_inputs), but snapshot defensively in case a future
    // mint path bypasses the validator.
    assert!(base_royalty_bps <= MAX_DERIVATIVE_ROYALTY_BPS, ERoyaltyTooHigh);

    let fee = model.license.derivative_mint_fee;
    assert!(coin::value(&payment) >= fee, EInsufficientDeriveFee);

    // Route the derive fee to the base creator; return any remainder to caller.
    if (fee > 0) {
        let fee_coin = coin::split(&mut payment, fee, ctx);
        transfer::public_transfer(fee_coin, model.creator);
    };
    if (coin::value(&payment) == 0) {
        coin::destroy_zero(payment);
    } else {
        transfer::public_transfer(payment, ctx.sender());
    };

    let collection = NftCollection {
        id: object::new(ctx),
        base_model_id: object::id(model),
        base_creator: model.creator,
        nft_creator: ctx.sender(),
        base_royalty_bps,
        quilt_blob_id,
        integration_policy: POLICY_PERMISSIONLESS,
        register_fee: 0,
        integrations: table::new(ctx),
    };
    let collection_id = object::id(&collection);

    let cap = NftCollectionCreatorCap {
        id: object::new(ctx),
        collection_id,
    };

    event::emit(CollectionLaunched {
        collection_id,
        base_model_id: object::id(model),
        nft_creator: ctx.sender(),
    });

    (collection, cap)
}

public entry fun launch_collection(
    model: &Model3D,
    payment: Coin<SUI>,
    quilt_blob_id: String,
    ctx: &mut TxContext,
) {
    // plan-027 (U3b) — ALLOW_LIST launch MUST go through
    // `launch_collection_with_entitlement` (the entitlement-gated entry); this
    // bare entry is PERMISSIONLESS (RESTRICTED still hits the internal
    // creator-only gate). Closes the free-fork bypass hole: without this assert a
    // wallet could fork an ALLOW_LIST base for free (derive fee may now be 0)
    // without ever buying access.
    assert!(model.license.policy != POLICY_ALLOW_LIST, EEntitlementRequired);
    let (collection, cap) = launch_collection_internal(model, payment, quilt_blob_id, ctx);
    transfer::share_object(collection);
    transfer::transfer(cap, ctx.sender());
}

// plan-027 (U3b) — the entitlement-gated ALLOW_LIST launch (mint step-1 for the
// 3-step encrypted fork). The caller proves access by passing the soulbound
// AccessEntitlement they bought via `purchase_access`. ALLOW_LIST-only by
// construction (ENotPurchasable on any other policy — PERMISSIONLESS uses the
// bare `launch_collection`, RESTRICTED the creator gate). The derive fee is
// charged inside `launch_collection_internal` (may be 0 post-plan-027).
public entry fun launch_collection_with_entitlement(
    model: &Model3D,
    entitlement: &AccessEntitlement,
    payment: Coin<SUI>,
    quilt_blob_id: String,
    ctx: &mut TxContext,
) {
    assert!(model.license.policy == POLICY_ALLOW_LIST, ENotPurchasable);
    assert!(entitlement.model_id == object::id(model), EEntitlementModelMismatch);
    assert!(entitlement.holder == ctx.sender(), ENotEntitlementHolder);
    let (collection, cap) = launch_collection_internal(model, payment, quilt_blob_id, ctx);
    transfer::share_object(collection);
    transfer::transfer(cap, ctx.sender());
}

// Cap holder sets/updates the collection's `register_fee` (the SUI a gameDev
// pays to `register_integration`). Authority is the matching soulbound cap;
// `fee == 0` is valid (free integration). Setting the fee does not touch the
// integration registry — only future `register_integration` calls read it.
public entry fun set_register_fee(
    cap: &NftCollectionCreatorCap,
    collection: &mut NftCollection,
    fee: u64,
) {
    assert!(cap.collection_id == object::id(collection), EWrongCollectionCap);
    collection.register_fee = fee;
}

// Cap holder opens/closes their collection to gameDev integrations (D-030).
// The integration gate is a collection-level (L2) decision owned by the nft
// creator — independent of the base model's L1 `license.policy`. Pass a
// POLICY_* constant: PERMISSIONLESS opens it, anything else closes it
// (register_integration aborts EIntegrationsClosed). Defaults PERMISSIONLESS at
// launch. Authority is the matching soulbound cap.
public entry fun set_integration_policy(
    cap: &NftCollectionCreatorCap,
    collection: &mut NftCollection,
    policy: u8,
) {
    assert!(cap.collection_id == object::id(collection), EWrongCollectionCap);
    collection.integration_policy = policy;
}

// Cap holder mints an `NftToken` from their collection and `public_transfer`s
// it to the caller as a PLAIN OWNED object (D-036) — NO auto-Kiosk placement.
// The token binds one quilt-patch variant (D-035 `patch_id`) and carries the
// collection + base-model linkage so the frontend can resolve provenance.
// Authority is the matching soulbound cap.
//
// Listing-for-sale is a SEPARATE opt-in step (D-036): the owner composes a
// Kiosk `place_and_list<NftToken>` PTB when they choose to sell. Resale then
// runs the royalty-only confirm chain (see `ensure_collection_policy`).
// D-038 — mint core: validates the per-token inputs, builds the `NftToken`, and
// emits `NftTokenMinted`, RETURNING the (un-transferred) token. Package-private:
// the cap-authority check lives in the public `mint_nft_token` wrapper; the batch
// `launch_collection_with_tokens` holds the freshly-created cap inherently and so
// skips the redundant check. `nft_creator` on the event is `ctx.sender()` (the
// caller in both paths). Behavior is identical to the pre-D-038 `mint_nft_token`.
fun mint_nft_token_internal(
    collection: &NftCollection,
    name: String,
    patch_id: String,
    ctx: &mut TxContext,
): NftToken {
    assert!(string::length(&name) <= MAX_NAME_LEN, ENameTooLong);
    assert!(string::length(&patch_id) <= MAX_PATCH_ID_LEN, EPatchIdMalformed);

    let token = NftToken {
        id: object::new(ctx),
        collection_id: object::id(collection),
        base_model_id: collection.base_model_id,
        name,
        patch_id,
    };
    event::emit(NftTokenMinted {
        token_id: object::id(&token),
        collection_id: object::id(collection),
        base_model_id: collection.base_model_id,
        nft_creator: ctx.sender(),
        patch_id: token.patch_id,
    });
    token
}

public entry fun mint_nft_token(
    cap: &NftCollectionCreatorCap,
    collection: &NftCollection,
    name: String,
    patch_id: String,
    ctx: &mut TxContext,
) {
    assert!(cap.collection_id == object::id(collection), EWrongCollectionCap);
    let token = mint_nft_token_internal(collection, name, patch_id, ctx);
    transfer::public_transfer(token, ctx.sender());
}

// D-076 — step 3 of the encrypted ALLOW_LIST 3-step fork. The cap-issuing
// `launch_collection` (step 1) creates the collection with an as-yet-unknown
// quilt: the variants are baked in step 2, AFTER the base is decrypted, so the
// quilt blob id is not known at launch. This entry — cap-gated — sets the
// collection's `quilt_blob_id` and batch-mints the colored fleet in one tx.
// PERMISSIONLESS keeps the atomic `launch_collection_with_tokens` (base is public,
// so the quilt is baked before launch). `token_names`/`token_patch_ids` MUST be
// the same length (`EBatchLenMismatch`); per-token bounds are inherited from the
// shared core. `&mut collection` reborrows immutably for the mint core.
public entry fun mint_tokens(
    cap: &NftCollectionCreatorCap,
    collection: &mut NftCollection,
    quilt_blob_id: String,
    token_names: vector<String>,
    token_patch_ids: vector<String>,
    ctx: &mut TxContext,
) {
    assert!(cap.collection_id == object::id(collection), EWrongCollectionCap);
    assert!(
        vector::length(&token_names) == vector::length(&token_patch_ids),
        EBatchLenMismatch,
    );
    assert!(string::length(&quilt_blob_id) <= MAX_BLOB_ID_LEN, EBlobIdMalformed);
    collection.quilt_blob_id = quilt_blob_id;

    let n = vector::length(&token_names);
    let mut i = 0;
    while (i < n) {
        let token = mint_nft_token_internal(
            collection,
            *vector::borrow(&token_names, i),
            *vector::borrow(&token_patch_ids, i),
            ctx,
        );
        transfer::public_transfer(token, ctx.sender());
        i = i + 1;
    };
}

// D-038 — one-signature L2 launch: launches the collection (pay-to-derive),
// sets `register_fee`, mints one plain owned `NftToken` per (name, patch_id)
// pair, then shares the collection and transfers the soulbound cap — all atomic.
// Lets the nft creator launch a whole colored fleet in a single wallet popup
// (the standalone `launch_collection` / `set_register_fee` / `mint_nft_token`
// entries remain for incremental flows). `token_names` and `token_patch_ids`
// MUST be the same length (`EBatchLenMismatch`); N = 0 launches an empty
// collection. Per-token bounds + the derive-fee routing are inherited from the
// shared cores. The cap-authority check is unnecessary here — the cap is created
// in this same call and provably matches the collection.
public entry fun launch_collection_with_tokens(
    model: &Model3D,
    payment: Coin<SUI>,
    quilt_blob_id: String,
    register_fee: u64,
    token_names: vector<String>,
    token_patch_ids: vector<String>,
    ctx: &mut TxContext,
) {
    // plan-027 (U3b) — PERMISSIONLESS-only atomic path. ALLOW_LIST must route
    // through `launch_collection_with_entitlement` + `mint_tokens` (the 3-step
    // encrypted fork), so reject ALLOW_LIST here to keep the bypass hole closed.
    assert!(model.license.policy != POLICY_ALLOW_LIST, EEntitlementRequired);
    assert!(
        vector::length(&token_names) == vector::length(&token_patch_ids),
        EBatchLenMismatch,
    );

    let (mut collection, cap) = launch_collection_internal(model, payment, quilt_blob_id, ctx);
    collection.register_fee = register_fee;

    let n = vector::length(&token_names);
    let mut i = 0;
    while (i < n) {
        let token = mint_nft_token_internal(
            &collection,
            *vector::borrow(&token_names, i),
            *vector::borrow(&token_patch_ids, i),
            ctx,
        );
        transfer::public_transfer(token, ctx.sender());
        i = i + 1;
    };

    transfer::share_object(collection);
    transfer::transfer(cap, ctx.sender());
}

// === D-029 U4 — register_integration (B2B integration registry) ===
//
// A gameDev attests an on-chain integration with a collection: fee-gated,
// license-gated, and anti-spammed by per-(integrator, collection) uniqueness.
// The integrator does NOT need to hold the cap or own a token — the gate is
// the fee + the base license being permissionless.
//
// Gate order is intentional: ALL aborts happen before the `event::emit` at the
// end, so an aborted registration emits nothing (AE3) and the registry stays
// untouched. The `app_metadata` blob is length-bounded on-chain only; the
// backend (U7) validates its JSON schema before surfacing it in "Used by".
public entry fun register_integration(
    collection: &mut NftCollection,
    mut payment: Coin<SUI>,
    app_metadata: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let sender = ctx.sender();

    // 1. Integration gate — the nft creator (cap holder) opens/closes this via
    //    set_integration_policy (defaults PERMISSIONLESS at launch). A
    //    collection-level (L2) decision, NOT the base model's L1 license (D-030).
    assert!(collection.integration_policy == POLICY_PERMISSIONLESS, EIntegrationsClosed);
    // 2. Fee gate.
    assert!(coin::value(&payment) >= collection.register_fee, EFeeTooLow);
    // 3. Anti-spam — one registration per (integrator, collection).
    assert!(!collection.integrations.contains(sender), EAlreadyRegistered);
    // 4. Bound the metadata blob (schema validated off-chain by U7).
    assert!(vector::length(&app_metadata) <= APP_METADATA_MAX, EAppMetadataTooLong);

    // 5. Route the fee to the nft creator; return any overpayment to the
    //    integrator (mirrors launch_collection's coin handling).
    let fee = collection.register_fee;
    if (fee > 0) {
        let fee_coin = coin::split(&mut payment, fee, ctx);
        transfer::public_transfer(fee_coin, collection.nft_creator);
    };
    if (coin::value(&payment) == 0) {
        coin::destroy_zero(payment);
    } else {
        transfer::public_transfer(payment, sender);
    };

    // 6. Record (Table is the single source of truth for "Used by").
    let now = clock.timestamp_ms();
    collection.integrations.add(sender, IntegrationRecord {
        app_metadata,
        registered_at_ms: now,
    });

    // 7. Emit inside the frame — rolls back atomically on any earlier abort.
    event::emit(IntegrationRegistered {
        collection_id: object::id(collection),
        integrator: sender,
        registered_at_ms: now,
    });
}

// === D-075 — Seal access policy (`seal_approve_*`) ===
//
// The Seal key servers DRY-RUN these against the LATEST package version (no gas,
// no state change) and release key shares iff the call does NOT abort — abort =
// deny. Both are `entry` (invokable in the dry-run PTB) but NOT `public`: only the
// key-server dry-run and the forge's decrypt PTB call them; no other module
// composes them.
//
// `id` is the Seal identity the client passed to `SealClient.encrypt`:
// `[ model.seal_id ][ nonce ]` (Seal prepends the package id itself, so `id` here
// is the inner bytes only). The prefix check binds the ciphertext to THIS model
// via its registry-unique `seal_id` — a cap (or creator) for one model cannot
// unlock another model's blob.

// Returns true iff `prefix` is a prefix of `word`.
fun is_prefix(prefix: &vector<u8>, word: &vector<u8>): bool {
    let pl = vector::length(prefix);
    if (pl > vector::length(word)) return false;
    let mut i = 0;
    while (i < pl) {
        if (*vector::borrow(prefix, i) != *vector::borrow(word, i)) return false;
        i = i + 1;
    };
    true
}

// plan-027 — ALLOW_LIST decrypt gate, relocated from the per-collection cap to
// the per-buyer AccessEntitlement (the cap no longer decrypts — its only role is
// now collection authority / register fee). Single-object gate (like
// seal_approve_creator) so a never-launched consumer can decrypt: (1) the
// entitlement is bound to THIS model, (2) the caller IS the entitlement holder,
// (3) the Seal id is prefix-bound to this model's seal_id — plus the
// seal_version tripwire. Dropping any leg lets one buyer unlock another model's
// ciphertext (the canonical Seal binding pitfall).
entry fun seal_approve_entitlement(
    id: vector<u8>,
    entitlement: &AccessEntitlement,
    model: &Model3D,
    ctx: &TxContext,
) {
    assert!(entitlement.model_id == object::id(model), EEntitlementModelMismatch);
    assert!(entitlement.holder == ctx.sender(), ENotEntitlementHolder);
    assert!(is_prefix(&model.seal_id, &id), EIdPrefixMismatch);
    assert!(model.seal_version == VERSION, ESealVersionMismatch);
}

// RESTRICTED — only the recorded base creator may decrypt; no third party forks.
entry fun seal_approve_creator(
    id: vector<u8>,
    model: &Model3D,
    ctx: &TxContext,
) {
    assert!(is_prefix(&model.seal_id, &id), EIdPrefixMismatch);
    assert!(ctx.sender() == model.creator, ENotBaseCreator);
    assert!(model.seal_version == VERSION, ESealVersionMismatch);
}

// === ModelPublished accessors (test-only — production indexers parse via BCS) ===

#[test_only] public fun model_published_model_id(e: &ModelPublished): ID { e.model_id }
#[test_only] public fun model_published_creator(e: &ModelPublished): address { e.creator }
#[test_only] public fun model_published_policy(e: &ModelPublished): u8 { e.policy }
#[test_only] public fun model_published_part_labels(e: &ModelPublished): &vector<String> { &e.part_labels }
#[test_only] public fun model_published_is_encrypted(e: &ModelPublished): bool { e.is_encrypted }
#[test_only] public fun model_published_preview_blob_ids(e: &ModelPublished): &vector<String> { &e.preview_blob_ids }

#[test_only] public fun nft_token_minted_token_id(e: &NftTokenMinted): ID { e.token_id }
#[test_only] public fun nft_token_minted_collection_id(e: &NftTokenMinted): ID { e.collection_id }
#[test_only] public fun nft_token_minted_base_model_id(e: &NftTokenMinted): ID { e.base_model_id }
#[test_only] public fun nft_token_minted_nft_creator(e: &NftTokenMinted): address { e.nft_creator }
#[test_only] public fun nft_token_minted_patch_id(e: &NftTokenMinted): &String { &e.patch_id }

#[test_only] public fun integration_registered_collection_id(e: &IntegrationRegistered): ID { e.collection_id }
#[test_only] public fun integration_registered_integrator(e: &IntegrationRegistered): address { e.integrator }
#[test_only] public fun integration_registered_at_ms(e: &IntegrationRegistered): u64 { e.registered_at_ms }

#[test_only] public fun collection_launched_collection_id(e: &CollectionLaunched): ID { e.collection_id }
#[test_only] public fun collection_launched_base_model_id(e: &CollectionLaunched): ID { e.base_model_id }
#[test_only] public fun collection_launched_nft_creator(e: &CollectionLaunched): address { e.nft_creator }

// plan-027 — AccessPurchased accessors + AccessEntitlement field accessors (test-only).
#[test_only] public fun access_purchased_entitlement_id(e: &AccessPurchased): ID { e.entitlement_id }
#[test_only] public fun access_purchased_model_id(e: &AccessPurchased): ID { e.model_id }
#[test_only] public fun access_purchased_buyer(e: &AccessPurchased): address { e.buyer }
#[test_only] public fun access_purchased_paid(e: &AccessPurchased): u64 { e.paid }
#[test_only] public fun entitlement_model_id(e: &AccessEntitlement): ID { e.model_id }
#[test_only] public fun entitlement_holder(e: &AccessEntitlement): address { e.holder }

// === Test-only helpers ===

// `init` is private (Sui runtime enforces it runs exactly once at publish);
// this helper lets tests reach the same body. The OTW non-instantiation
// invariant is enforced by `init`'s `fun` (not `public fun`) qualifier plus
// `package::claim` recording the witness type — no production caller can
// construct a fresh `MODEL3D{}` and replay init at runtime.
#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(MODEL3D {}, ctx)
}

#[test_only]
public fun destroy_model_for_testing(model: Model3D) {
    let Model3D {
        id,
        creator: _,
        shape_type: _,
        params_json: _,
        name: _,
        tags: _,
        lineage_blob_id: _,
        glb_blob_id: _,
        part_labels: _,
        is_encrypted: _,
        sealed_key: _,
        seal_id: _,
        preview_blob_ids: _,
        seal_version: _,
        license: _,
        created_at_ms: _,
        buyers,
    } = model;
    // plan-027 — Table<address, bool>: bool has `drop`, so a populated table can
    // be dropped directly (mirrors destroy_seal_id_registry_for_testing).
    buyers.drop();
    object::delete(id);
}

// D-075 — tear down the shared SealIdRegistry in tests (Table value `bool` has
// `drop`, so a populated table can be dropped directly).
#[test_only]
public fun destroy_seal_id_registry_for_testing(registry: SealIdRegistry) {
    let SealIdRegistry { id, used } = registry;
    used.drop();
    object::delete(id);
}

// D-075 — construct a standalone SealIdRegistry for tests (without running `init`).
#[test_only]
public fun new_seal_id_registry_for_testing(ctx: &mut TxContext): SealIdRegistry {
    SealIdRegistry { id: object::new(ctx), used: table::new(ctx) }
}

// D-075 — force a model's seal_version so the version-tripwire branch of
// seal_approve can be exercised (normal construction always stamps VERSION).
#[test_only]
public fun set_seal_version_for_testing(model: &mut Model3D, v: u64) {
    model.seal_version = v;
}

// D-075 — test-only public wrappers for the non-public `seal_approve_*` entries,
// so the sibling test module can exercise the gate assertions directly (abort
// codes propagate unchanged for `expected_failure`).
#[test_only]
public fun seal_approve_entitlement_for_testing(
    id: vector<u8>,
    entitlement: &AccessEntitlement,
    model: &Model3D,
    ctx: &TxContext,
) {
    seal_approve_entitlement(id, entitlement, model, ctx)
}

// plan-027 — AccessEntitlement has `key` only (no `drop`), so tests that take it
// from an inbox need a destructor.
#[test_only]
public fun destroy_entitlement_for_testing(e: AccessEntitlement) {
    let AccessEntitlement { id, model_id: _, holder: _ } = e;
    object::delete(id);
}

#[test_only]
public fun seal_approve_creator_for_testing(
    id: vector<u8>,
    model: &Model3D,
    ctx: &TxContext,
) {
    seal_approve_creator(id, model, ctx)
}

// D-036 — NftToken is now a plain owned object (mint no longer Kiosk-locks it),
// so tests that take it from an inbox need a destructor (NftToken has no `drop`).
#[test_only]
public fun destroy_nft_token_for_testing(token: NftToken) {
    let NftToken { id, collection_id: _, base_model_id: _, name: _, patch_id: _ } = token;
    object::delete(id);
}

// D-029 test helpers — tear down a launched collection + its soulbound cap.
// Requires an empty `integrations` Table (IntegrationRecord has no `drop`, so a
// populated table cannot be bulk-dropped — U4 tests must `remove` records first).
#[test_only]
public fun destroy_collection_for_testing(collection: NftCollection) {
    let NftCollection {
        id,
        base_model_id: _,
        base_creator: _,
        nft_creator: _,
        base_royalty_bps: _,
        quilt_blob_id: _,
        integration_policy: _,
        register_fee: _,
        integrations,
    } = collection;
    integrations.destroy_empty();
    object::delete(id);
}

#[test_only]
public fun destroy_collection_cap_for_testing(cap: NftCollectionCreatorCap) {
    let NftCollectionCreatorCap { id, collection_id: _ } = cap;
    object::delete(id);
}

// Removes + drops one integration record so a populated collection can be torn
// down via `destroy_collection_for_testing` (which requires an empty Table).
#[test_only]
public fun remove_integration_for_testing(c: &mut NftCollection, who: address) {
    let IntegrationRecord { app_metadata: _, registered_at_ms: _ } = c.integrations.remove(who);
}

