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
use sui::event;
use sui::package;
use walrus::blob::Blob;

// === Constants ===

const POLICY_RESTRICTED:     u8 = 0;
const POLICY_ALLOW_LIST:     u8 = 1;
const POLICY_PERMISSIONLESS: u8 = 2;

const MAX_DERIVATIVE_ROYALTY_BPS: u16 = 3000;

// === Errors ===

const ERoyaltyTooHigh:      u64 = 0;
// D-018 — input bound assertions
const ETooManyTags:         u64 = 10;
const ETagTooLong:          u64 = 11;
const EParamsJsonTooLong:   u64 = 12;
const ENameTooLong:         u64 = 13;
const EBlobIdMalformed:     u64 = 14;

const MAX_TAGS:             u64 = 16;
const MAX_TAG_LEN:          u64 = 32;
const MAX_PARAMS_JSON_LEN:  u64 = 4096;
const MAX_NAME_LEN:         u64 = 128;
const MAX_BLOB_ID_LEN:      u64 = 128;

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

// DEPRECATION FLAG (2026-05-19, plan-007 U2 review): no entry fn in v2
// constructs `Access` — Phase 2's `mint_model_access` was stripped and U2
// did NOT add a replacement. Plan-007 U10 (Kiosk-protocol KTD) may delete
// this type entirely if the `?model=` route covers all discovery paths.
// Until U10 decides, retained as a no-op surface so U10's rewrite is local.
//
// Soulbound by Move type system: `has key` only (no `store`) — cannot be
// wrapped in another struct, placed in a Kiosk, or moved via `public_transfer`.
public struct Access has key {
    id: UID,
    target_id: ID,
    holder: address,
    expires_at_ms: u64,
}

// === Events ===

public struct ModelPublished has copy, drop {
    model_id: ID,
    creator: address,
    policy: u8,
    lineage_blob_id: String,
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
//   - royalty_bps: snapshot of the rule's basis points at emit time, so
//     `amount * 10_000 / price == royalty_bps` is verifiable from the event
//     alone (U8 sanity check + U11 replay parity).
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

public fun access_target_id(access: &Access): ID { access.target_id }
public fun access_holder(access: &Access): address { access.holder }
public fun access_expires_at_ms(access: &Access): u64 { access.expires_at_ms }

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

#[test_only]
public fun destroy_access_for_testing(access: Access) {
    let Access { id, target_id: _, holder: _, expires_at_ms: _ } = access;
    object::delete(id);
}
