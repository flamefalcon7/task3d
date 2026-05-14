// D-001 / D-002 / D-013: L1 (Model3D) + L3 (Access) of the composable creator
// economy. L2 Derivative (and its grant/mint/purchase_derivative_access entries)
// is deferred to v1.1; the design is preserved in `docs/spec.md` §2.8 but no L2
// code ships in Phase 2.
module model3d::model3d;

use std::string::{Self, String};
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::event;
use sui::sui::SUI;
use walrus::blob::Blob;

// === Constants ===

const POLICY_RESTRICTED:     u8 = 0;
const POLICY_ALLOW_LIST:     u8 = 1;
const POLICY_PERMISSIONLESS: u8 = 2;

const MAX_DERIVATIVE_ROYALTY_BPS: u16 = 3000;

// === Errors ===

const ERoyaltyTooHigh:      u64 = 0;
const EInsufficientPayment: u64 = 5;
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

// === Types ===

public struct LicenseTerms has store, copy, drop {
    policy: u8,
    derivative_mint_fee: u64,
    derivative_royalty_bps: u16,
    commercial_use: bool,
    require_attribution: bool,
}

public struct Model3D has key, store {
    id: UID,
    blob: Blob,
    creator: address,
    shape_type: String,
    params_json: String,
    name: String,
    tags: vector<String>,
    lineage_blob_id: String,
    direct_access_price: u64,
    is_encrypted: bool,
    license: LicenseTerms,
    created_at_ms: u64,
}

// Soulbound by Move type system: `has key` only (no `store`) — cannot be wrapped
// in another struct, placed in a Kiosk, or moved via `public_transfer`.
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
    direct_access_price: u64,
    policy: u8,
    lineage_blob_id: String,
}

public struct AccessPurchased has copy, drop {
    access_id: ID,
    target_id: ID,
    buyer: address,
    paid: u64,
    base_royalty_paid: u64,
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

// === Read-only accessors (used by Phase 2 frontend + indexers + tests) ===

public fun creator(model: &Model3D): address { model.creator }
public fun direct_access_price(model: &Model3D): u64 { model.direct_access_price }
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
public fun validate_publish_inputs(
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

// === L1: Publish base ===

public fun publish(
    blob: Blob,
    shape_type: String,
    params_json: String,
    name: String,
    tags: vector<String>,
    lineage_blob_id: String,
    direct_access_price: u64,
    is_encrypted: bool,
    license: LicenseTerms,
    clock: &Clock,
    ctx: &mut TxContext,
): Model3D {
    validate_publish_inputs(&params_json, &name, &tags, &lineage_blob_id, &license);

    let model = Model3D {
        id: object::new(ctx),
        blob,
        creator: ctx.sender(),
        shape_type,
        params_json,
        name,
        tags,
        lineage_blob_id,
        direct_access_price,
        is_encrypted,
        license,
        created_at_ms: clock.timestamp_ms(),
    };
    event::emit(ModelPublished {
        model_id: object::id(&model),
        creator: ctx.sender(),
        direct_access_price,
        policy: license.policy,
        lineage_blob_id: model.lineage_blob_id,
    });
    model
}

// D-016 — Phase 2 entry. Always shares the resulting Model3D so any wallet can
// pass `&Model3D` to `purchase_model_access` (Kiosk-mediated ownership is
// promoted to Phase 4 must-have per D-013; see OQ-013 for coexistence).
#[allow(lint(share_owned))]
public fun publish_and_share(
    blob: Blob,
    shape_type: String,
    params_json: String,
    name: String,
    tags: vector<String>,
    lineage_blob_id: String,
    direct_access_price: u64,
    is_encrypted: bool,
    license: LicenseTerms,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let model = publish(
        blob,
        shape_type,
        params_json,
        name,
        tags,
        lineage_blob_id,
        direct_access_price,
        is_encrypted,
        license,
        clock,
        ctx,
    );
    transfer::share_object(model);
}

// === L3: Purchase access ===

// D-016: name matches spec §2.8 (`purchase_model_access`) for symmetry with the
// v1.1 `purchase_derivative_access` entry. `duration_ms` is retained in the
// signature so Phase 4 subscription pricing does not require a package redeploy
// — Phase 2 frontend always passes `0` (permanent Access).
public fun purchase_model_access(
    model: &Model3D,
    payment: Coin<SUI>,
    duration_ms: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let access = mint_model_access(model, payment, duration_ms, clock, ctx);
    transfer::transfer(access, ctx.sender());
}

public fun mint_model_access(
    model: &Model3D,
    payment: Coin<SUI>,
    duration_ms: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): Access {
    assert!(coin::value(&payment) >= model.direct_access_price, EInsufficientPayment);
    let paid = coin::value(&payment);
    if (paid == 0) {
        coin::destroy_zero(payment);
    } else {
        transfer::public_transfer(payment, model.creator);
    };
    let expires_at_ms = if (duration_ms == 0) { 0 } else { clock.timestamp_ms() + duration_ms };
    let access = Access {
        id: object::new(ctx),
        target_id: object::id(model),
        holder: ctx.sender(),
        expires_at_ms,
    };
    event::emit(AccessPurchased {
        access_id: object::id(&access),
        target_id: object::id(model),
        buyer: ctx.sender(),
        paid,
        base_royalty_paid: 0,
    });
    access
}

// === Test-only helpers ===

#[test_only]
public fun new_model_for_testing(
    blob: Blob,
    shape_type: String,
    params_json: String,
    name: String,
    tags: vector<String>,
    lineage_blob_id: String,
    direct_access_price: u64,
    is_encrypted: bool,
    license: LicenseTerms,
    clock: &Clock,
    ctx: &mut TxContext,
): Model3D {
    publish(
        blob,
        shape_type,
        params_json,
        name,
        tags,
        lineage_blob_id,
        direct_access_price,
        is_encrypted,
        license,
        clock,
        ctx,
    )
}

#[test_only]
public fun destroy_model_for_testing(model: Model3D): Blob {
    let Model3D {
        id,
        blob,
        creator: _,
        shape_type: _,
        params_json: _,
        name: _,
        tags: _,
        lineage_blob_id: _,
        direct_access_price: _,
        is_encrypted: _,
        license: _,
        created_at_ms: _,
    } = model;
    object::delete(id);
    blob
}

#[test_only]
public fun destroy_access_for_testing(access: Access) {
    let Access { id, target_id: _, holder: _, expires_at_ms: _ } = access;
    object::delete(id);
}
