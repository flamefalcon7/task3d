// D-001 / D-002 / D-013 / D-016: L1 (Model3D) + L3 (Access) of the composable
// creator economy. L2 Derivative is deferred to v1.1 (design preserved in
// `docs/spec.md` §2.8). Phase 4 rewrites Phase 2 + Phase 3 plumbing:
//
//   - Model3D: `has key, store` (Kiosk-placeable per R1; Phase 2 was `has key`
//     + share_object, Phase 3 carried Collection/VariantSpec around it).
//   - Phase 2 entries `publish_and_share` + `purchase_model_access` REMOVED;
//     Phase 4 replaces with Kiosk-mediated `mint_and_list` + `purchase_with_kiosk`
//     (added by U4; U2 is the foundation rewrite only).
//   - Phase 3 `Collection` / `VariantSpec` / `publish_collection` / `mint_variant`
//     plumbing REMOVED. The v2 module shape (plan-007 §"Move contract structure (v2)")
//     mints `Model3D` directly into a Kiosk; the quilt-collection abstraction
//     is not used in Phase 4. Testnet Phase 3 mints stay on chain abandoned
//     (per R1 + D-016).
//   - Access remains `has key` (soulbound). The Phase 2/3 `useOwnedVariants`
//     Access-based discovery path is rewritten at U10 (Kiosk-protocol KTD);
//     U2 leaves Access otherwise unchanged.
//   - MODEL3D one-time-witness + `init` claims `Publisher` (consumed by U3
//     `ensure_transfer_policy` to attach RoyaltyRule + LockRule + PersonalKioskRule).
//   - RoyaltyPaid event struct defined here; emitted by U4 `purchase_with_kiosk`.
//     Carries `tx_digest: vector<u8>` per U1.f spike (option (a)) — `tx_context::digest`
//     returns the same 32 bytes off-chain RPC sees, enabling cross-system join.
module model3d::model3d;

use std::string::{Self, String};
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::event;
use sui::kiosk::{Self, Kiosk};
use sui::table::{Self, Table};
use sui::package::{Self, Publisher};
use sui::sui::SUI;
use sui::transfer_policy::{Self as tp, TransferPolicy, TransferPolicyCap, TransferRequest};
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
// to every Model3D listing in Phase 4. Per-listing variation is out of scope
// here — RoyaltyRule's Config has no setter, and changing the rate requires
// remove_rule + re-add (TransferPolicyCap-holder authority). v1.1's
// multi-beneficiary case will swap the built-in rule for a custom
// `split_royalty_rule` on the same policy ID (see
// `docs/solutions/architecture-patterns/sui-kiosk-multi-beneficiary-royalty-2026-05-19.md`).
//
// MIN_ROYALTY_AMOUNT_MIST (0.001 SUI = 1_000_000 mist) is the **floor**
// (not a rounding tiebreaker) applied by the built-in royalty_rule:
// `royalty_owed = max(price * amount_bp / 10_000, MIN_ROYALTY_AMOUNT_MIST)`.
// Consequences:
//   - 0-price listing (free) → buyer still pays 1_000_000 mist royalty.
//   - 1-mist listing → buyer pays 1_000_001 mist total; effective rate
//     vastly exceeds amount_bp until price ≥ 0.02 SUI (the crossover).
//   - The `amount * 10_000 / price == royalty_bps` invariant claimed in
//     `RoyaltyPaid`'s comment holds ONLY when
//     `price * amount_bp / 10_000 >= MIN_ROYALTY_AMOUNT_MIST`. U8 indexer
//     must implement both branches; otherwise sub-0.02-SUI sales trip
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
// R6 — defensive guard in `purchase_with_kiosk`: if the live RoyaltyRule's
// configured bps differs from AMOUNT_BP_DEFAULT (the value the RoyaltyPaid
// event hardcodes), the event would lie. Probe the rule via fee_amount on
// a high-priced sentinel that escapes the floor regime; abort if drift.
// Triggered by a legitimate rate change (TransferPolicyCap holder removed
// + re-added rule with different bps) OR by cap compromise (ADV-002).
const EWrongRoyaltyRate:    u64 = 21;

// D-029 — NFT collection layer + integration registry. Existing range is
// 0,10-14,20,21; this block starts at 30 (no collision).
const ELicenseRestricted:    u64 = 30; // register_integration on a non-permissionless base
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

// R1: `has key, store` (Phase 4) — `store` is required for Kiosk's `place<T>`.
// Phase 2 had `has key` only + `transfer::share_object`; Phase 3 had `key + store`
// but still used `share_object`. Phase 4's `mint_and_list` (U4) places the object
// into a creator-owned PersonalKiosk instead.
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
// `base_royalty_bps` + `base_policy` are SNAPSHOTS taken at launch from the
// base model's `license` — they do not track later base-license edits.
public struct NftCollection has key {
    id: UID,
    base_model_id: ID,
    base_creator: address,
    base_royalty_bps: u16,
    base_policy: u8,
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

// Phase 4: emitted by U4 `purchase_with_kiosk` (via `emit_royalty_paid` below)
// after the Kiosk's RoyaltyRule has paid the creator.
//
// Field set is locked here — per `contracts/UPGRADE.md`, `copy + drop` event
// structs cannot evolve under a compatible upgrade (adding/removing fields
// breaks layout). Any later field requires a parallel `RoyaltyPaidV2` migration
// window. We carry these extras over `tx_digest` alone so U8 indexer + U11
// replay can verify the payment without a second on-chain lookup:
//
//   - tx_digest: U8 frontend filter join key. 32-byte raw — base58 from RPC vs
//     base64 from event-JSON serialization of `vector<u8>`; U8 normalizes to
//     lowercase hex before equality check. Captured via `tx_context::digest(ctx)`
//     inside `emit_royalty_paid` so callers cannot supply a fabricated digest.
//   - kiosk_id: identifies the Kiosk the purchase flowed through, so U8 can
//     cross-reference Listing events without parsing the PTB.
//   - royalty_bps: snapshot of the rule's basis points at emit time. The
//     invariant `amount * 10_000 / price == royalty_bps` holds ONLY when
//     `price > MIN_ROYALTY_AMOUNT_MIST * 10_000 / AMOUNT_BP_DEFAULT`
//     (0.02 SUI for the current config; see constants block lines 67-79).
//     Below the crossover, `amount == MIN_ROYALTY_AMOUNT_MIST` (floor
//     regime) and the bps formula breaks. Division by zero for price=0 is
//     the floor regime's degenerate case (also returns MIN_ROYALTY_AMOUNT_MIST).
//     U8 indexer must implement BOTH branches; otherwise sub-0.02-SUI sales
//     trip false-positive replay-mismatch alerts (R11D).
public struct RoyaltyPaid has copy, drop {
    buyer: address,
    creator: address,
    amount: u64,
    model_id: ID,
    kiosk_id: ID,
    royalty_bps: u16,
    tx_digest: vector<u8>,
}

// === Module initializer (one-time, on publish) ===

// Claims `Publisher` from the MODEL3D OTW and transfers it to the deployer
// (= whoever runs `sui client publish`; for testnet this is the dev's
// interactive Sui CLI keychain per R2). U3 `ensure_transfer_policy` consumes
// the Publisher to create `TransferPolicy<Model3D>`.
fun init(otw: MODEL3D, ctx: &mut TxContext) {
    let publisher = package::claim(otw, ctx);
    transfer::public_transfer(publisher, ctx.sender());
}

// === Phase 4 U3 — TransferPolicy bootstrap ===

// Creates the `TransferPolicy<Model3D>`, attaches three built-in rules
// (`royalty_rule` + `kiosk_lock_rule` + `personal_kiosk_rule`), shares the
// policy as a shared object, and transfers the `TransferPolicyCap<Model3D>`
// to the caller.
//
// Ordering invariant (R12 capture —
// `docs/solutions/kiosk-ptb-patterns/transfer-policy-before-place.md`):
// rules MUST be attached BEFORE the policy is shared (and before any
// `kiosk::place<Model3D>` runs anywhere). Doing this all inside a single
// entry fn makes the order fail-safe by construction — there is no window
// in which a caller could share a half-configured policy.
//
// Publisher type check: `package::from_package<Model3D>` asserts the
// supplied Publisher was claimed by THIS package (and that `Model3D` is
// a type defined here). A foreign Publisher (e.g. from a malicious package
// imitating the layout) aborts with `EWrongPublisher`.
//
// Phase 4 wires a single global royalty (500 bps / 0.001 SUI min). v1.1's
// multi-beneficiary case removes the built-in rule and adds a custom
// `split_royalty_rule` on the same policy ID (`TransferPolicyCap` holder
// authority required) — see
// `docs/solutions/architecture-patterns/sui-kiosk-multi-beneficiary-royalty-2026-05-19.md`.
//
// One entry fn vs N: an alternative `create_policy` + N `add_rule` entry fns
// would let the deployer share the policy before all rules are attached. The
// monolithic shape eliminates that footgun.
//
// **NOT idempotent despite the `ensure_` prefix.** Each successful call
// creates a fresh `TransferPolicy<Model3D>` shared object + a fresh
// `TransferPolicyCap<Model3D>` transferred to the caller. There is no
// sentinel guard; the contract does not refuse a second invocation.
// Calling twice produces two competing shared policies of the same type,
// at which point U4/U5 frontend MUST resolve by the specific policy ID
// captured at first deploy (`networks/testnet.json` field). The U13
// deploy script enforces this externally: it pins the policy ID at first
// run and aborts if asked to call `ensure_transfer_policy` again with
// a populated `networks/{net}.json`. See `contracts/UPGRADE.md`.
public entry fun ensure_transfer_policy(publisher: &Publisher, ctx: &mut TxContext) {
    assert!(package::from_package<Model3D>(publisher), EWrongPublisher);

    let (mut policy, cap) = tp::new<Model3D>(publisher, ctx);

    // Rule 1: built-in royalty_rule — collects `AMOUNT_BP_DEFAULT` bps of
    // every sale into the TransferPolicy's internal Balance<SUI>. Cap holder
    // (creator/deployer) withdraws via `transfer_policy::withdraw`.
    royalty_rule::add<Model3D>(&mut policy, &cap, AMOUNT_BP_DEFAULT, MIN_ROYALTY_AMOUNT_MIST);

    // Rule 2: built-in kiosk_lock_rule — forces purchased items to be
    // `lock`'d in the buyer's Kiosk (no post-purchase `kiosk::take`).
    // Required by D-013 for protocol-level royalty enforcement on resale.
    kiosk_lock_rule::add<Model3D>(&mut policy, &cap);

    // Rule 3: built-in personal_kiosk_rule — restricts purchases to
    // PersonalKiosk-typed Kiosks. Frontend (U5/U6) must build buyer-side
    // Kiosks via `kiosk::personal_new`, never `kiosk::new`.
    personal_kiosk_rule::add<Model3D>(&mut policy, &cap);

    // Share the now fully-configured policy. TransferPolicy is intended to
    // be a shared object (every buyer reads its `rules` set during
    // `confirm_request`).
    transfer::public_share_object(policy);
    // TODO(mainnet, U13): TransferPolicyCap is the single point of authority
    // for `withdraw` + `remove_rule` + `add_rule`. Testnet hands it to
    // `ctx.sender()` (deployer's hot wallet) for the demo; mainnet ceremony
    // must move it to a hardware wallet or multisig immediately after this
    // call lands. See `contracts/UPGRADE.md` §"Before any upgrade — checklist"
    // item 8. Cap-compromise scenario: attacker removes RoyaltyRule and
    // future RoyaltyPaid events keep claiming `royalty_bps=500` while no
    // royalty flows, because `emit_royalty_paid` hardcodes the bps field.
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
public fun collection_base_royalty_bps(c: &NftCollection): u16 { c.base_royalty_bps }
public fun collection_base_policy(c: &NftCollection): u8 { c.base_policy }
public fun collection_register_fee(c: &NftCollection): u64 { c.register_fee }
public fun collection_has_integration(c: &NftCollection, who: address): bool {
    c.integrations.contains(who)
}
public fun cap_collection_id(cap: &NftCollectionCreatorCap): ID { cap.collection_id }

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

// === Model3D constructor (Phase 4 foundation; U4 builds `mint_and_list` on top) ===

// Pure constructor — does NOT share or place the returned Model3D. U4's
// `mint_and_list` calls this and then `kiosk::place` + `kiosk::list` in the
// same PTB so the Phase 4 "ONE wallet popup" R3 contract holds.
//
// `public(package)` because the Model3D MUST be Kiosk-placed (D-013 protocol-
// level royalty enforcement) — exposing this as `public` would let external
// PTBs call `new_model` then `transfer::public_transfer` directly, bypassing
// TransferPolicy entirely. Same-package callers (U4 mint_and_list) keep access.
//
// Blob lifecycle is FIXED in this constructor: the Blob is `public_transfer`'d
// to `ctx.sender()` before the Model3D is constructed. U4 cannot override
// without a second tx (which would break R3). This means `mint_and_list` MUST
// run under a creator-signed PTB — `ctx.sender()` == intended Blob owner ==
// `creator` field on the resulting Model3D. If a future flow needs the Blob
// in the Kiosk or in a buyer's wallet, the constructor signature must add a
// `blob_recipient: address` parameter (additive — fine under UPGRADE.md rules
// for new public fn signatures, but the OLD signature stays for compat).
//
// **R12 — Sponsored-tx constraint**: `ctx.sender()` is recorded as `creator`.
// Caller MUST NOT wrap `mint_and_list` in a sponsored PTB unless the sponsor
// IS the intended creator (otherwise the creator address recorded on-chain
// would be the sponsor, not the user). Phase 4 zkLogin flow signs directly;
// this constraint is documentary for any future sponsored-mint path.
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
    // unilaterally — Kiosk-listed Model3D would survive but the aggregator
    // would 404 on its `lineage_blob_id`. Out-of-scope mitigation: encourage
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

// === RoyaltyPaid emit (production; U4 calls this) ===

// `public(package)` so only U4's `purchase_with_kiosk` (same package) can
// emit RoyaltyPaid. tx_digest is captured internally via `tx_context::digest`
// so callers cannot fabricate the join key U8's overlay relies on.
//
// `amount` is NOT range-checked here — the caller (U4) is responsible for the
// invariant `amount == price * royalty_bps / 10_000`. Adding an upper bound
// in the event emit would complicate the Kiosk-protocol-level RoyaltyRule
// composition (rule computes payment internally; U4 reads after the fact).
public(package) fun emit_royalty_paid(
    buyer: address,
    creator: address,
    amount: u64,
    model_id: ID,
    kiosk_id: ID,
    royalty_bps: u16,
    ctx: &TxContext,
) {
    event::emit(RoyaltyPaid {
        buyer,
        creator,
        amount,
        model_id,
        kiosk_id,
        royalty_bps,
        tx_digest: *tx_context::digest(ctx),
    })
}

// === Phase 4 U4 — `ensure_creator_kiosk` / `mint_and_list` / `purchase_with_kiosk` ===

// `ensure_creator_kiosk(ctx)` is the first-time creator helper. It:
//   1. Creates a fresh `Kiosk` + `KioskOwnerCap` via `sui::kiosk::new`,
//   2. Wraps the `KioskOwnerCap` in a `PersonalKioskCap` via
//      `kiosk::personal_kiosk::new` (this also sets the OwnerMarker dynamic
//      field on the Kiosk so `personal_kiosk_rule::prove` will pass for
//      any future Model3D landed in this Kiosk),
//   3. Shares the Kiosk (Kiosks are intended to be shared so other callers
//      can read listings and execute `purchase` against them),
//   4. Transfers the `PersonalKioskCap` (key-only, soulbound by the Move
//      type system) to `ctx.sender()`.
//
// Once `personal_kiosk::new` runs, the underlying `KioskOwnerCap` cannot be
// extracted as a freely-transferable value (only `borrow` / `borrow_mut` /
// the hot-potato `borrow_val`/`return_val` pair). This is what makes the
// Kiosk "personal" — it can never change owner.
//
// **NOT idempotent.** As with `ensure_transfer_policy`, the contract does
// not refuse a second invocation; calling twice yields two Kiosks + two
// PersonalKioskCaps. The frontend (U6) is responsible for pinning the
// creator's "primary" Kiosk via `useOwnedVariants` / network config and
// avoiding a second call.
public entry fun ensure_creator_kiosk(ctx: &mut TxContext) {
    let (mut kiosk_obj, owner_cap) = kiosk::new(ctx);
    // `personal_kiosk::new` consumes the KioskOwnerCap and returns a
    // PersonalKioskCap wrapping it. Mutates the Kiosk to add the OwnerMarker
    // dynamic field (the receipt personal_kiosk_rule checks at purchase).
    let personal_cap = personal_kiosk::new(&mut kiosk_obj, owner_cap, ctx);
    transfer::public_share_object(kiosk_obj);
    personal_kiosk::transfer_to_sender(personal_cap, ctx);
}

// `mint_and_list` — atomic mint + place + list in one PTB → one wallet
// popup (R3 / AE1). 13 primitive-or-struct-by-value params (license is a
// by-value struct constructed in the same PTB via `new_license_terms`;
// PTB struct-arg pitfall does NOT apply since LicenseTerms is a result
// handle, not an on-chain object ref).
//
// Order of side effects in one tx:
//   1. `new_model(...)` — emits `ModelPublished`, transfers Blob to ctx.sender().
//   2. `kiosk::place_and_list<Model3D>(kiosk, &KioskOwnerCap, model, price)` —
//      internally places then lists; emits exactly one
//      `sui::kiosk::ItemListed<Model3D>` and no separate place event
//      (the framework's bundled wrapper makes atomicity self-documenting).
//
// Per-tx event cardinality (asserted by `mint_and_list_emits_one_mint_one_place_one_list_event`):
//   - exactly 1 `ModelPublished`
//   - exactly 1 `kiosk::ItemListed<Model3D>`
//
// The creator's `&PersonalKioskCap` is borrowed (not consumed) — soulbound
// invariant preserved across the call.
public entry fun mint_and_list(
    kiosk_obj: &mut Kiosk,
    personal_cap: &PersonalKioskCap,
    blob: Blob,
    shape_type: String,
    params_json: String,
    name: String,
    tags: vector<String>,
    lineage_blob_id: String,
    is_encrypted: bool,
    license: LicenseTerms,
    clock: &Clock,
    price: u64,
    ctx: &mut TxContext,
) {
    // `new_model` runs the full input validator (validate_publish_inputs);
    // license.derivative_royalty_bps > MAX_DERIVATIVE_ROYALTY_BPS aborts
    // here with ERoyaltyTooHigh, so mint_and_list cannot bypass the cap.
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
    let owner_cap = personal_kiosk::borrow(personal_cap);
    // place_and_list is the framework's bundled `place` + `list`; using it
    // (instead of separate calls) makes the atomicity self-documenting.
    // Emits `sui::kiosk::ItemListed<Model3D>` with `price` payload.
    kiosk::place_and_list<Model3D>(kiosk_obj, owner_cap, model, price);
}

// `purchase_with_kiosk` wraps `kiosk::purchase<Model3D>` and emits
// `RoyaltyPaid` so U8's indexer + overlay can join on `tx_digest`. Returns
// the hot-potato `TransferRequest<Model3D>` so the buyer's PTB MUST:
//   1. Lock the item into a PersonalKiosk via `kiosk::lock<Model3D>` (or
//      `kiosk::place` + force-lock pattern) → satisfies `kiosk_lock_rule`.
//   2. Call `royalty_rule::pay(policy, request, royalty_coin)` →
//      satisfies the built-in royalty rule by adding `Rule {}` receipt +
//      moving the royalty SUI into the policy's internal balance.
//   3. Call `personal_kiosk_rule::prove(kiosk, request)` → satisfies
//      personal-kiosk rule.
//   4. Call `tp::confirm_request(policy, request)` to consume the hot
//      potato. If omitted, the tx aborts because `TransferRequest<T>`
//      has no `drop` ability.
//
// `policy` arg is REQUIRED to enable `royalty_rule::fee_amount` for the
// event payload's `amount` field. Without it, the indexer would have to
// recompute the rate off-chain. Decision rationale: a 5-arg signature is
// cheaper than fragmenting the emit step across two Move calls (which
// would also break the "purchase_with_kiosk emits RoyaltyPaid" contract
// the U8 indexer subscribes to).
//
// **POLICY-PINNING CONSTRAINT (R7 / ADV-002)**: the `policy` arg MUST be
// the canonical `TransferPolicy<Model3D>` ID pinned in
// `networks/{net}.json`. Secondary policies created by extra
// `ensure_transfer_policy` calls (or by an attacker with leaked Publisher
// access) are protocol violations. This contract does NOT enforce policy
// identity — it cannot, because TransferPolicy IDs are not known at Move
// build time. The R6 `EWrongRoyaltyRate` guard catches one symptom (drifted
// bps) but a parallel attacker policy with bps=AMOUNT_BP_DEFAULT but a
// different recipient Balance would slip past. The frontend (U5
// `kioskTxBuilders.ts`) MUST hard-code the policy_id from the network
// config, NEVER take it as user input.
//
// `payment` must EXACTLY equal the listing price (`kiosk::purchase`
// asserts `price == payment.value()` → abort `sui::kiosk::EIncorrectAmount`).
// The buyer's PTB should `splitCoins` to the exact amount before this call.
//
// **NOT entry (R11C / ADV-007)**: this is `public fun` (NOT `public entry`)
// because `TransferRequest<Model3D>` has no `drop` ability — entry fns
// require droppable return types. The buyer PTB MUST compose 5 calls
// (purchase_with_kiosk → kiosk::lock → royalty_rule::pay →
// personal_kiosk_rule::prove → tp::confirm_request) in a single PTB to
// satisfy R3's "ONE wallet popup" contract. See U5 `kioskTxBuilders.ts`
// for the canonical chain.
//
// **R11B** — Framework-side event noise: `kiosk::purchase` also emits
// `sui::kiosk::ItemPurchased<Model3D> { kiosk, id, price }`. The U8
// indexer ignores it (joins on `RoyaltyPaid` instead) — but cross-system
// correlation tools should be aware both events fire per purchase tx.
public fun purchase_with_kiosk(
    kiosk_obj: &mut Kiosk,
    policy: &TransferPolicy<Model3D>,
    model_id: ID,
    payment: Coin<SUI>,
    ctx: &mut TxContext,
): (Model3D, TransferRequest<Model3D>) {
    // Capture price BEFORE consuming the payment Coin.
    let price = payment.value();

    // R6 guard: the RoyaltyPaid event hardcodes `royalty_bps =
    // AMOUNT_BP_DEFAULT`. If a TransferPolicyCap holder reconfigured the
    // RoyaltyRule (legitimate rate change OR cap compromise per UPGRADE.md
    // item 8), that hardcoded payload would lie. Probe the rule's effective
    // bps via `fee_amount` on a sentinel price that escapes the floor regime.
    //
    // Math: at price = 1 SUI (1_000_000_000 mist) and bps = 500, bps_path =
    // 50_000_000. Floor = 1_000_000. max(50_000_000, 1_000_000) = 50_000_000
    // — the bps branch dominates by 50x, so fee_amount(policy, 1_000_000_000)
    // recovers AMOUNT_BP_DEFAULT exactly via `amount * 10_000 / price`.
    assert!(
        royalty_rule::fee_amount<Model3D>(policy, 1_000_000_000) * 10_000 / 1_000_000_000
            == AMOUNT_BP_DEFAULT as u64,
        EWrongRoyaltyRate
    );

    let (item, request) = kiosk::purchase<Model3D>(kiosk_obj, model_id, payment);
    let amount = royalty_rule::fee_amount<Model3D>(policy, price);
    emit_royalty_paid(
        ctx.sender(),
        item.creator,
        amount,
        model_id,
        object::id(kiosk_obj),
        AMOUNT_BP_DEFAULT,
        ctx,
    );
    (item, request)
}

// === D-029 — NFT collection layer (launch_collection, pay-to-derive Fork A) ===

// An nft creator derives an `NftCollection` from a base `Model3D`. Pay-to-derive
// (Fork A): the caller pays the base license's `derivative_mint_fee` to the base
// creator and receives a soulbound `NftCollectionCreatorCap`. The base creator
// keeps the Model3D and the perpetual-royalty story (`base_royalty_bps` snapshot).
//
// `base_royalty_bps` + `base_policy` are SNAPSHOTS read here from the base
// model's live `license`; later edits to the base license do not propagate.
// `register_fee` starts at 0 — the cap holder sets it via `set_register_fee` (U2).
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
        base_royalty_bps,
        base_policy: model.license.policy,
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

// === RoyaltyPaid accessors (test-only — production indexers parse via BCS) ===

#[test_only] public fun royalty_paid_buyer(e: &RoyaltyPaid): address { e.buyer }
#[test_only] public fun royalty_paid_creator(e: &RoyaltyPaid): address { e.creator }
#[test_only] public fun royalty_paid_amount(e: &RoyaltyPaid): u64 { e.amount }
#[test_only] public fun royalty_paid_model_id(e: &RoyaltyPaid): ID { e.model_id }
#[test_only] public fun royalty_paid_kiosk_id(e: &RoyaltyPaid): ID { e.kiosk_id }
#[test_only] public fun royalty_paid_royalty_bps(e: &RoyaltyPaid): u16 { e.royalty_bps }
#[test_only] public fun royalty_paid_tx_digest(e: &RoyaltyPaid): vector<u8> { e.tx_digest }

// === ModelPublished accessors (test-only — production indexers parse via BCS) ===

#[test_only] public fun model_published_model_id(e: &ModelPublished): ID { e.model_id }
#[test_only] public fun model_published_creator(e: &ModelPublished): address { e.creator }
#[test_only] public fun model_published_policy(e: &ModelPublished): u8 { e.policy }

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
        base_royalty_bps: _,
        base_policy: _,
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
