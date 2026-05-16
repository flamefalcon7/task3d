// D-001 / D-002 / D-013: L1 (Model3D) + L3 (Access) of the composable creator
// economy. L2 Derivative (and its grant/mint/purchase_derivative_access entries)
// is deferred to v1.1; the design is preserved in `docs/spec.md` §2.8 but no L2
// code ships in Phase 2.
//
// Phase 3 (Collection Forge): adds `Collection` wrapping the Walrus quilt Blob.
// `Model3D` no longer holds a `Blob` directly — instead it references its parent
// `Collection` by `collection_id` and identifies its quilt patch by `patch_id`.
// Phase 2's `publish_and_share` entry is preserved as a degenerate-of-1 wrapper
// (one Collection + one Model3D, empty `patch_id`).
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

// Phase 3 — Collection / variant assertions
const ENotCollectionCreator:        u64 = 15;
const ESlugMalformed:               u64 = 16;
const ETooManyVariants:             u64 = 17;
const ESlugTooLong:                 u64 = 18;
const EVariantParamsJsonTooLong:    u64 = 19;

const MAX_TAGS:             u64 = 16;
const MAX_TAG_LEN:          u64 = 32;
const MAX_PARAMS_JSON_LEN:  u64 = 4096;
const MAX_NAME_LEN:         u64 = 128;
const MAX_BLOB_ID_LEN:      u64 = 128;

// Phase 3 — Collection / variant bounds
const MAX_SLUG_LEN:                 u64 = 64;
const MAX_VARIANTS:                 u64 = 16;
const MAX_VARIANT_PARAMS_JSON_LEN:  u64 = 1024;

// === Types ===

public struct LicenseTerms has store, copy, drop {
    policy: u8,
    derivative_mint_fee: u64,
    derivative_royalty_bps: u16,
    commercial_use: bool,
    require_attribution: bool,
}

// Phase 3 — wraps the Walrus quilt Blob that holds N×variants. Shared so any
// wallet can pass `&Collection` to read-only entries; only the original creator
// may add variants (see `mint_variant` F7 authorization).
public struct Collection has key, store {
    id: UID,
    blob: Blob,
    creator: address,
    name: String,
    slug: String,
    variant_count: u32,
    license: LicenseTerms,
    created_at_ms: u64,
}

// Phase 3 — declarative description of a single variant slot in a Collection.
// Consumed by `mint_variant` to produce a `Model3D`.
public struct VariantSpec has store, drop {
    patch_id: String,
    params_json: String,
    name: String,
    tags: vector<String>,
    direct_access_price: u64,
}

public struct Model3D has key, store {
    id: UID,
    collection_id: ID,
    patch_id: String,
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

public struct CollectionPublished has copy, drop {
    collection_id: ID,
    creator: address,
    name: String,
    slug: String,
    license_policy: u8,
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
public fun max_variants(): u64 { MAX_VARIANTS }
public fun max_slug_len(): u64 { MAX_SLUG_LEN }
public fun max_variant_params_json_len(): u64 { MAX_VARIANT_PARAMS_JSON_LEN }

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
public fun collection_id(model: &Model3D): ID { model.collection_id }
public fun patch_id(model: &Model3D): &String { &model.patch_id }
public fun license_policy(license: &LicenseTerms): u8 { license.policy }
public fun license_derivative_royalty_bps(license: &LicenseTerms): u16 {
    license.derivative_royalty_bps
}

public fun collection_creator(coll: &Collection): address { coll.creator }
public fun collection_name(coll: &Collection): &String { &coll.name }
public fun collection_slug(coll: &Collection): &String { &coll.slug }
public fun collection_variant_count(coll: &Collection): u32 { coll.variant_count }
public fun collection_license(coll: &Collection): &LicenseTerms { &coll.license }
public fun collection_created_at_ms(coll: &Collection): u64 { coll.created_at_ms }

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

// Phase 3 — Collection-level validation. Mirrors the `validate_publish_inputs`
// ladder; reused error codes where the semantic limit is identical.
public fun validate_collection_inputs(
    name: &String,
    slug: &String,
    license: &LicenseTerms,
) {
    assert!(string::length(slug) > 0, ESlugMalformed);
    assert!(string::length(slug) <= MAX_SLUG_LEN, ESlugTooLong);
    assert!(string::length(name) <= MAX_NAME_LEN, ENameTooLong);
    assert!(license.derivative_royalty_bps <= MAX_DERIVATIVE_ROYALTY_BPS, ERoyaltyTooHigh);
}

// Phase 3 — Variant-level validation invoked from `mint_variant`. Note tighter
// `params_json` bound (1024 vs 4096 for Phase 2) per SEC-004 — material-swap
// variants don't need the larger budget.
public fun validate_variant_spec(
    spec: &VariantSpec,
    lineage_blob_id: &String,
) {
    assert!(vector::length(&spec.tags) <= MAX_TAGS, ETooManyTags);
    let mut i = 0;
    let n = vector::length(&spec.tags);
    while (i < n) {
        assert!(string::length(vector::borrow(&spec.tags, i)) <= MAX_TAG_LEN, ETagTooLong);
        i = i + 1;
    };
    assert!(string::length(&spec.params_json) <= MAX_VARIANT_PARAMS_JSON_LEN, EVariantParamsJsonTooLong);
    assert!(string::length(&spec.name) <= MAX_NAME_LEN, ENameTooLong);
    assert!(string::length(&spec.patch_id) <= MAX_BLOB_ID_LEN, EBlobIdMalformed);
    assert!(string::length(lineage_blob_id) <= MAX_BLOB_ID_LEN, EBlobIdMalformed);
}

// === Phase 3: Collection + variant constructors ===

public fun new_variant_spec(
    patch_id: String,
    params_json: String,
    name: String,
    tags: vector<String>,
    direct_access_price: u64,
): VariantSpec {
    VariantSpec {
        patch_id,
        params_json,
        name,
        tags,
        direct_access_price,
    }
}

public fun publish_collection(
    blob: Blob,
    name: String,
    slug: String,
    license: LicenseTerms,
    clock: &Clock,
    ctx: &mut TxContext,
): Collection {
    validate_collection_inputs(&name, &slug, &license);
    let coll = Collection {
        id: object::new(ctx),
        blob,
        creator: ctx.sender(),
        name,
        slug,
        variant_count: 0,
        license,
        created_at_ms: clock.timestamp_ms(),
    };
    event::emit(CollectionPublished {
        collection_id: object::id(&coll),
        creator: ctx.sender(),
        name: coll.name,
        slug: coll.slug,
        license_policy: license.policy,
    });
    coll
}

// Phase 3 — Mint a single variant Model3D against a Collection. The `coll`
// parameter is `&mut` so we can increment `variant_count` while still using the
// Spike-B PASS pattern (b): the PTB passes the Collection Result handle through
// by reference, never by value. Only the Collection's creator may invoke this
// (F7 authorization) — the assertion guards the "single-creator collection"
// invariant the Phase 3 brainstorm assumes.
public fun mint_variant(
    coll: &mut Collection,
    spec: VariantSpec,
    shape_type: String,
    lineage_blob_id: String,
    is_encrypted: bool,
    clock: &Clock,
    ctx: &mut TxContext,
): Model3D {
    assert!(coll.creator == ctx.sender(), ENotCollectionCreator);
    assert!((coll.variant_count as u64) < MAX_VARIANTS, ETooManyVariants);
    validate_variant_spec(&spec, &lineage_blob_id);

    let VariantSpec {
        patch_id,
        params_json,
        name,
        tags,
        direct_access_price,
    } = spec;

    let model = Model3D {
        id: object::new(ctx),
        collection_id: object::id(coll),
        patch_id,
        creator: ctx.sender(),
        shape_type,
        params_json,
        name,
        tags,
        lineage_blob_id,
        direct_access_price,
        is_encrypted,
        license: coll.license,
        created_at_ms: clock.timestamp_ms(),
    };
    coll.variant_count = coll.variant_count + 1;

    event::emit(ModelPublished {
        model_id: object::id(&model),
        creator: ctx.sender(),
        direct_access_price,
        policy: coll.license.policy,
        lineage_blob_id: model.lineage_blob_id,
    });
    model
}

#[allow(lint(share_owned, custom_state_change))]
public fun share_collection(coll: Collection) {
    transfer::share_object(coll);
}

// === Phase 2 ABI compatibility — degenerate-of-1 wrapper ===

// D-016 — Phase 2 entry. Always shares the resulting Model3D so any wallet can
// pass `&Model3D` to `purchase_model_access` (Kiosk-mediated ownership is
// promoted to Phase 4 must-have per D-013; see OQ-013 for coexistence).
//
// Phase 3: internally produces a degenerate 1-variant Collection so the new
// struct shape is observable to indexers + the frontend even on the legacy
// entry. `shape_type` is preserved per-variant via `mint_variant`'s signature.
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
    // Re-run Phase 2's validation ladder so the legacy entry preserves its full
    // assertion semantics (params_json up to 4096, etc.) — the variant-spec
    // ladder uses a tighter 1024 bound which would reject Phase 2 inputs.
    validate_publish_inputs(&params_json, &name, &tags, &lineage_blob_id, &license);

    let mut coll = publish_collection(
        blob,
        copy name,
        // Degenerate-of-1 collections get a synthetic slug. Phase 2 callers
        // don't think in slug terms; "_legacy" sidesteps the empty-slug
        // assertion while remaining recognizable in indexer output.
        string::utf8(b"_legacy"),
        license,
        clock,
        ctx,
    );
    let spec = new_variant_spec(
        // Empty patch_id == "the whole blob" for degenerate-of-1 collections.
        string::utf8(b""),
        params_json,
        name,
        tags,
        direct_access_price,
    );
    let model = mint_variant(
        &mut coll,
        spec,
        shape_type,
        lineage_blob_id,
        is_encrypted,
        clock,
        ctx,
    );
    transfer::share_object(model);
    share_collection(coll);
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
public fun new_collection_for_testing(
    blob: Blob,
    name: String,
    slug: String,
    license: LicenseTerms,
    clock: &Clock,
    ctx: &mut TxContext,
): Collection {
    publish_collection(blob, name, slug, license, clock, ctx)
}

#[test_only]
public fun mint_variant_for_testing(
    coll: &mut Collection,
    spec: VariantSpec,
    shape_type: String,
    lineage_blob_id: String,
    is_encrypted: bool,
    clock: &Clock,
    ctx: &mut TxContext,
): Model3D {
    mint_variant(coll, spec, shape_type, lineage_blob_id, is_encrypted, clock, ctx)
}

#[test_only]
public fun destroy_collection_for_testing(coll: Collection): Blob {
    let Collection {
        id,
        blob,
        creator: _,
        name: _,
        slug: _,
        variant_count: _,
        license: _,
        created_at_ms: _,
    } = coll;
    object::delete(id);
    blob
}

#[test_only]
public fun destroy_model_for_testing(model: Model3D) {
    let Model3D {
        id,
        collection_id: _,
        patch_id: _,
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
}

#[test_only]
public fun destroy_access_for_testing(access: Access) {
    let Access { id, target_id: _, holder: _, expires_at_ms: _ } = access;
    object::delete(id);
}
