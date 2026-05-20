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
//   - L2 `NftCollection` + `NftToken` sell OWNERSHIP via Kiosk (D-029). All
//     Kiosk + `TransferPolicy` + royalty machinery lives here, on `NftToken`
//     only (`ensure_collection_policy`, `mint_nft_token`).
//   - Phase 2 entries `publish_and_share` / `purchase_model_access` and Phase 3
//     `Collection` / `VariantSpec` plumbing were already REMOVED. The old L3
//     `Access` soulbound receipt is DELETED; its "soulbound by Move ability"
//     role re-anchors to `NftCollectionCreatorCap`.
//   - MODEL3D one-time-witness + `init` claims `Publisher`, consumed by
//     `ensure_collection_policy` to attach RoyaltyRule + LockRule +
//     PersonalKioskRule to `TransferPolicy<NftToken>`.
module model3d::model3d;

use std::string::{Self, String};
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::event;
use sui::kiosk::{Self, Kiosk};
use sui::table::{Self, Table};
use sui::package::{Self, Publisher};
use sui::sui::SUI;
use sui::transfer_policy::{Self as tp};
use walrus::blob::Blob;
use kiosk::royalty_rule;
use kiosk::kiosk_lock_rule;
use kiosk::personal_kiosk::{Self, PersonalKioskCap};
use kiosk::personal_kiosk_rule;

// === Constants ===

const POLICY_RESTRICTED:     u8 = 0;
const POLICY_ALLOW_LIST:     u8 = 1;
const POLICY_PERMISSIONLESS: u8 = 2;

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

const MAX_TAGS:             u64 = 16;
const MAX_TAG_LEN:          u64 = 32;
const MAX_PARAMS_JSON_LEN:  u64 = 4096;
const MAX_NAME_LEN:         u64 = 128;
const MAX_BLOB_ID_LEN:      u64 = 128;
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
    is_encrypted: bool,
    license: LicenseTerms,
    created_at_ms: u64,
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

// Fork B — a tradeable token minted from an `NftCollection` by its cap holder.
// `key + store` so it can be Kiosk-`place`'d (like `Model3D`) and resold under
// its OWN per-type `TransferPolicy<NftToken>` (created once by
// `ensure_collection_policy`). Coexists with the unchanged L1 `Model3D` sale.
public struct NftToken has key, store {
    id: UID,
    collection_id: ID,
    base_model_id: ID,
    name: String,
}

// === Events ===

public struct ModelPublished has copy, drop {
    model_id: ID,
    creator: address,
    policy: u8,
    lineage_blob_id: String,
}

// D-029 — emitted by `launch_collection` when an nft creator derives a
// collection from a base Model3D.
public struct CollectionLaunched has copy, drop {
    collection_id: ID,
    base_model_id: ID,
    nft_creator: address,
}

// D-029 — emitted by `mint_nft_token`. The L2 analog of `ModelPublished`:
// surfaces the new token's id for the frontend/indexer (resolving the listing
// without parsing the PTB) and links it to its collection + base model.
public struct NftTokenMinted has copy, drop {
    token_id: ID,
    collection_id: ID,
    base_model_id: ID,
    nft_creator: address,
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
}

// === D-029 / D-032 — TransferPolicy<NftToken> bootstrap ===
//
// The ONLY TransferPolicy this package creates (D-032 removed the
// `TransferPolicy<Model3D>` bootstrap — Model3D is shared, not Kiosk-traded).
// Creates the per-type `TransferPolicy<NftToken>`, attaches three built-in
// rules (royalty + lock + personal_kiosk), shares the policy, and hands the
// `TransferPolicyCap<NftToken>` to the caller. One-time per package (run at the
// U5 bootstrap).
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
    kiosk_lock_rule::add<NftToken>(&mut policy, &cap);
    personal_kiosk_rule::add<NftToken>(&mut policy, &cap);

    transfer::public_share_object(policy);
    transfer::public_transfer(cap, ctx.sender());
}

// === LicenseTerms constructor ===

public fun new_license_terms(
    policy: u8,
    derivative_mint_fee: u64,
    derivative_royalty_bps: u16,
    commercial_use: bool,
    require_attribution: bool,
): LicenseTerms {
    LicenseTerms {
        policy,
        derivative_mint_fee,
        derivative_royalty_bps,
        commercial_use,
        require_attribution,
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
public fun is_encrypted(model: &Model3D): bool { model.is_encrypted }
public fun license(model: &Model3D): &LicenseTerms { &model.license }
public fun created_at_ms(model: &Model3D): u64 { model.created_at_ms }
public fun license_policy(license: &LicenseTerms): u8 { license.policy }
public fun license_derivative_royalty_bps(license: &LicenseTerms): u16 {
    license.derivative_royalty_bps
}

// === D-029 — NftCollection / cap accessors ===

public fun collection_base_model_id(c: &NftCollection): ID { c.base_model_id }
public fun collection_base_creator(c: &NftCollection): address { c.base_creator }
public fun collection_nft_creator(c: &NftCollection): address { c.nft_creator }
public fun collection_integration_app_metadata(c: &NftCollection, who: address): &vector<u8> {
    &c.integrations.borrow(who).app_metadata
}
public fun collection_base_royalty_bps(c: &NftCollection): u16 { c.base_royalty_bps }
public fun collection_integration_policy(c: &NftCollection): u8 { c.integration_policy }
public fun collection_register_fee(c: &NftCollection): u64 { c.register_fee }
public fun collection_has_integration(c: &NftCollection, who: address): bool {
    c.integrations.contains(who)
}
public fun cap_collection_id(cap: &NftCollectionCreatorCap): ID { cap.collection_id }

public fun nft_token_collection_id(t: &NftToken): ID { t.collection_id }
public fun nft_token_base_model_id(t: &NftToken): ID { t.base_model_id }
public fun nft_token_name(t: &NftToken): &String { &t.name }

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
    is_encrypted: bool,
    license: LicenseTerms,
    clock: &Clock,
    ctx: &mut TxContext,
): Model3D {
    validate_publish_inputs(&params_json, &name, &tags, &lineage_blob_id, &license);

    // Fixed Blob lifecycle (see fn-header note): transferred to creator BEFORE
    // model construction. Walrus storage stays paid for the registered epoch
    // span; the Blob object becomes a creator-owned pointer the frontend
    // resolves to bytes via the aggregator. Creator can drop the Blob
    // unilaterally — the shared Model3D would survive but the aggregator would
    // 404 on its `lineage_blob_id`. Out-of-scope mitigation: encourage the
    // creator to keep the Blob until L2 derivative work lands (v1.1).
    transfer::public_transfer(blob, ctx.sender());

    let model = Model3D {
        id: object::new(ctx),
        creator: ctx.sender(),
        shape_type,
        params_json,
        name,
        tags,
        lineage_blob_id,
        is_encrypted,
        license,
        created_at_ms: clock.timestamp_ms(),
    };
    event::emit(ModelPublished {
        model_id: object::id(&model),
        creator: ctx.sender(),
        policy: license.policy,
        lineage_blob_id: model.lineage_blob_id,
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
public entry fun publish(
    blob: Blob,
    shape_type: String,
    params_json: String,
    name: String,
    tags: vector<String>,
    lineage_blob_id: String,
    is_encrypted: bool,
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
        is_encrypted,
        license,
        clock,
        ctx,
    );
    transfer::share_object(model);
}

// === ensure_creator_kiosk — the nft creator's PersonalKiosk for NftTokens ===

// `ensure_creator_kiosk(ctx)` is the first-time helper for an nft creator who
// will `mint_nft_token` (the ONLY Kiosk-traded type, D-032). It:
//   1. Creates a fresh `Kiosk` + `KioskOwnerCap` via `sui::kiosk::new`,
//   2. Wraps the `KioskOwnerCap` in a `PersonalKioskCap` via
//      `kiosk::personal_kiosk::new` (this also sets the OwnerMarker dynamic
//      field on the Kiosk so `personal_kiosk_rule::prove` passes for any future
//      NftToken landed in this Kiosk),
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
// `set_integration_policy` / `set_register_fee` (D-030). The base model's
// `license.policy` is NOT consulted here: derivation is gated by the
// pay-to-derive fee, integration by the collection-level policy.
//
// No `clock` param: the collection carries no timestamp and `CollectionLaunched`
// has no `ts` field. Per-integration timestamps are set in `register_integration`.
public entry fun launch_collection(
    model: &Model3D,
    mut payment: Coin<SUI>,
    ctx: &mut TxContext,
) {
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

// Cap holder mints an `NftToken` from their collection and atomically
// place+lists it into their PersonalKiosk in one wallet popup. The token
// carries the collection + base-model linkage so the frontend can resolve
// provenance. Authority is the matching soulbound cap. This is the ONLY
// Kiosk-traded type (D-032).
//
// Resale is NOT wrapped in Move: buyers compose `kiosk::purchase<NftToken>` +
// the lock/royalty/personal-prove/confirm_request chain in a PTB (U6 builder).
public entry fun mint_nft_token(
    cap: &NftCollectionCreatorCap,
    collection: &NftCollection,
    kiosk_obj: &mut Kiosk,
    personal_cap: &PersonalKioskCap,
    name: String,
    price: u64,
    ctx: &mut TxContext,
) {
    assert!(cap.collection_id == object::id(collection), EWrongCollectionCap);
    assert!(string::length(&name) <= MAX_NAME_LEN, ENameTooLong);

    let token = NftToken {
        id: object::new(ctx),
        collection_id: object::id(collection),
        base_model_id: collection.base_model_id,
        name,
    };
    event::emit(NftTokenMinted {
        token_id: object::id(&token),
        collection_id: object::id(collection),
        base_model_id: collection.base_model_id,
        nft_creator: ctx.sender(),
    });
    let owner_cap = personal_kiosk::borrow(personal_cap);
    kiosk::place_and_list<NftToken>(kiosk_obj, owner_cap, token, price);
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

// === ModelPublished accessors (test-only — production indexers parse via BCS) ===

#[test_only] public fun model_published_model_id(e: &ModelPublished): ID { e.model_id }
#[test_only] public fun model_published_creator(e: &ModelPublished): address { e.creator }
#[test_only] public fun model_published_policy(e: &ModelPublished): u8 { e.policy }

#[test_only] public fun nft_token_minted_token_id(e: &NftTokenMinted): ID { e.token_id }
#[test_only] public fun nft_token_minted_collection_id(e: &NftTokenMinted): ID { e.collection_id }
#[test_only] public fun nft_token_minted_base_model_id(e: &NftTokenMinted): ID { e.base_model_id }
#[test_only] public fun nft_token_minted_nft_creator(e: &NftTokenMinted): address { e.nft_creator }

#[test_only] public fun integration_registered_collection_id(e: &IntegrationRegistered): ID { e.collection_id }
#[test_only] public fun integration_registered_integrator(e: &IntegrationRegistered): address { e.integrator }
#[test_only] public fun integration_registered_at_ms(e: &IntegrationRegistered): u64 { e.registered_at_ms }

#[test_only] public fun collection_launched_collection_id(e: &CollectionLaunched): ID { e.collection_id }
#[test_only] public fun collection_launched_base_model_id(e: &CollectionLaunched): ID { e.base_model_id }
#[test_only] public fun collection_launched_nft_creator(e: &CollectionLaunched): address { e.nft_creator }

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
        is_encrypted: _,
        license: _,
        created_at_ms: _,
    } = model;
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

