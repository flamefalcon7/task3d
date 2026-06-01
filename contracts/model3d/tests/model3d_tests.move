#[test_only]
#[allow(deprecated_usage)]
module model3d::model3d_tests;

use std::string;
use sui::clock;
use sui::event;
use sui::package::Publisher;
use sui::test_scenario as ts;
use sui::transfer_policy::{Self as tp, TransferPolicy};
use sui::tx_context;
use walrus::blob::{Self, Blob};
use walrus::encoding;
use walrus::storage_resource::Storage;
use walrus::system::{Self, System};
use wal::wal::WAL;
use sui::coin;
use sui::sui::SUI;
use sui::kiosk::{Self, Kiosk};
use kiosk::royalty_rule;
use kiosk::personal_kiosk;
use kiosk::personal_kiosk::PersonalKioskCap;
use foreign_witness::foreign_witness;
use model3d::model3d::{
    Self,
    Model3D,
    NftCollection,
    NftCollectionCreatorCap,
    NftToken,
    new_license_terms,
    policy_permissionless,
    policy_restricted,
    policy_allow_list,
    max_derivative_royalty_bps,
    amount_bp_default,
    min_royalty_amount_mist,
    validate_publish_inputs,
    new_model,
    publish,
    destroy_model_for_testing,
    init_for_testing,
    ensure_creator_kiosk,
    launch_collection,
    set_register_fee,
    set_integration_policy,
    ensure_collection_policy,
    mint_nft_token,
    launch_collection_with_tokens,
    register_integration,
    destroy_collection_for_testing,
    destroy_collection_cap_for_testing,
    destroy_nft_token_for_testing,
    remove_integration_for_testing,
};

const GAMEDEV: address = @0x6A3E;

// A buyer distinct from the nft creator — used by the resale test so the
// "buyer takes the token out and freely owns it" invariant is verified across
// two different addresses (not a self-purchase).
const BUYER: address = @0xB0B;

const NFT_CREATOR: address = @0xD15C0;

const CREATOR: address = @0xC0FFEE;

const BLOB_SIZE: u64 = 1024;
const EPOCHS_AHEAD: u32 = 3;
const RS2: u8 = 1;
const ROOT_HASH: u256 = 0xABC;
const N_WAL: u64 = 1_000_000_000;

const ASCII_A: u8 = 97;
const ASCII_N: u8 = 110;
const ASCII_X: u8 = 120;
const ASCII_B: u8 = 98;

// === Helpers ===

fun default_license(): model3d::LicenseTerms {
    // plan-027 — access_fee = 0 (PERMISSIONLESS is not purchasable; the field is inert here).
    new_license_terms(policy_permissionless(), 0, 500, true, true, 0)
}

fun s(bytes: vector<u8>): string::String { string::utf8(bytes) }

fun repeat_byte(c: u8, n: u64): string::String {
    let mut bytes = vector::empty<u8>();
    let mut i = 0;
    while (i < n) {
        vector::push_back(&mut bytes, c);
        i = i + 1;
    };
    string::utf8(bytes)
}

fun make_tags(n: u64): vector<string::String> {
    let mut v = vector::empty<string::String>();
    let mut i = 0;
    while (i < n) {
        vector::push_back(&mut v, s(b"tag"));
        i = i + 1;
    };
    v
}

fun empty_tags(): vector<string::String> {
    vector::empty<string::String>()
}

// plan-013 — per-part label helpers. `make_part_labels(n)` produces n copies of
// `"part"` for cap/length tests; `four_label_palette()` returns the canonical
// (primary, secondary, accent, detail) preset for the happy-path scenarios.
fun empty_part_labels(): vector<string::String> {
    vector::empty<string::String>()
}

fun make_part_labels(n: u64): vector<string::String> {
    let mut v = vector::empty<string::String>();
    let mut i = 0;
    while (i < n) {
        vector::push_back(&mut v, s(b"part"));
        i = i + 1;
    };
    v
}

fun four_label_palette(): vector<string::String> {
    let mut v = vector::empty<string::String>();
    vector::push_back(&mut v, s(b"primary"));
    vector::push_back(&mut v, s(b"secondary"));
    vector::push_back(&mut v, s(b"accent"));
    vector::push_back(&mut v, s(b"detail"));
    v
}

// D-035 — default quilt blob id (the L2 collection's one Walrus quilt) and a
// default patch id (one colored variant patch inside it) for collection tests.
fun quilt(): string::String { s(b"quiltBlobIdABC") }
fun patch(): string::String { s(b"patchId01") }

fun get_storage(system: &mut System, ctx: &mut tx_context::TxContext): Storage {
    let mut wal = coin::mint_for_testing<WAL>(N_WAL, ctx);
    let storage_size = encoding::encoded_blob_length(BLOB_SIZE, RS2, system.n_shards());
    let storage = system.reserve_space(storage_size, EPOCHS_AHEAD, &mut wal, ctx);
    coin::burn_for_testing(wal);
    storage
}

fun mint_blob(system: &mut System, ctx: &mut tx_context::TxContext): Blob {
    let storage = get_storage(system, ctx);
    let mut wal = coin::mint_for_testing<WAL>(N_WAL, ctx);
    let blob_id = blob::derive_blob_id(ROOT_HASH, RS2, BLOB_SIZE);
    let b = system.register_blob(storage, blob_id, ROOT_HASH, BLOB_SIZE, RS2, false, &mut wal, ctx);
    coin::burn_for_testing(wal);
    b
}

// === init: Publisher creation ===

#[test]
fun init_creates_exactly_one_publisher_owned_by_sender() {
    let mut sc = ts::begin(CREATOR);
    init_for_testing(sc.ctx());

    // Advance to the next tx so transferred objects become visible in the
    // sender's inbox via `take_from_sender`.
    sc.next_tx(CREATOR);
    let publisher = sc.take_from_sender<Publisher>();

    // Stronger "exactly one" check (plan-007 U2 review): after taking the
    // single Publisher, the sender's inbox must hold zero more. If init were
    // ever to claim Publisher twice (e.g., a regression duplicating
    // `package::claim`), this assertion would fail.
    assert!(!ts::has_most_recent_for_sender<Publisher>(&sc), 110);

    sc.return_to_sender(publisher);
    sc.end();
}

// === Model3D ability validation: key + store ===
//
// `key` is required by `object::new`. `store` is required by `transfer::public_transfer`
// and by Kiosk's `place<T>` (U4). We exercise both abilities by:
//   1. Constructing a Model3D (requires `key` — object::new),
//   2. Calling `transfer::public_transfer` on it (requires `T: store`),
//   3. Re-taking it from the address (round-trip proves transfer succeeded).
// If `store` were absent from Model3D the `public_transfer` call would not
// type-check at compile time.

#[test]
fun model3d_has_key_and_store_abilities() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let b = mint_blob(&mut system, sc.ctx());
    let clk = clock::create_for_testing(sc.ctx());

    let model = new_model(
        b,
        s(b"sword"),
        s(b"{\"length\":1.0}"),
        s(b"Excalibur"),
        make_tags(2),
        s(b"lineageBlobIdABC"),
        s(b"glbBlobIdABC"),
        empty_part_labels(),
        vector<u8>[],     // sealed_key (unencrypted)
        vector<u8>[],     // seal_id
        vector<string::String>[], // preview_blob_ids
        default_license(),
        &clk,
        sc.ctx(),
    );

    assert!(model3d::creator(&model) == CREATOR, 100);
    assert!(*string::as_bytes(model3d::name(&model)) == b"Excalibur", 101);
    assert!(model3d::is_encrypted(&model) == false, 102);

    // Exercise `store` ability — `public_transfer` requires `T: store`.
    transfer::public_transfer(model, CREATOR);

    sc.next_tx(CREATOR);
    let received = sc.take_from_sender<Model3D>();
    destroy_model_for_testing(received);

    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// === new_model: 3 observable side effects (event + Blob transfer + field set) ===
//
// Plan-007 U2 review (2026-05-19): without this test, a regression that
// dropped `event::emit(ModelPublished{...})` or that misrouted the Blob
// would pass all of the prior 18 tests.

#[test]
fun new_model_emits_model_published_and_transfers_blob() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let b = mint_blob(&mut system, sc.ctx());
    let clk = clock::create_for_testing(sc.ctx());

    let model = new_model(
        b,
        s(b"car"),
        s(b"{\"variant\":3}"),
        s(b"Aero"),
        make_tags(1),
        s(b"lineageBlobZ"),
        s(b"glbBlobZ"),
        empty_part_labels(),
        vector<u8>[],     // sealed_key (unencrypted)
        vector<u8>[],     // seal_id
        vector<string::String>[], // preview_blob_ids
        default_license(),
        &clk,
        sc.ctx(),
    );
    let expected_model_id = object::id(&model);

    // (a) ModelPublished event fires with the right payload — regression
    // guard if a future refactor drops the `event::emit(...)` line.
    // Type-filtered count (NOT `num_events()`) — Walrus `mint_blob` helpers
    // also emit events into the same tx scope, so a global count would
    // include those. We assert exactly-one ModelPublished, not exactly-one
    // event overall.
    let events = event::events_by_type<model3d::ModelPublished>();
    assert!(vector::length(&events) == 1, 301);
    let ep = vector::borrow(&events, 0);
    assert!(model3d::model_published_model_id(ep) == expected_model_id, 302);
    assert!(model3d::model_published_creator(ep) == CREATOR, 303);
    assert!(model3d::model_published_policy(ep) == policy_permissionless(), 304);

    // (b) Field assignments — every constructor input lands in the right place.
    assert!(model3d::creator(&model) == CREATOR, 305);
    assert!(*string::as_bytes(model3d::shape_type(&model)) == b"car", 306);
    assert!(*string::as_bytes(model3d::params_json(&model)) == b"{\"variant\":3}", 307);
    assert!(*string::as_bytes(model3d::name(&model)) == b"Aero", 308);
    assert!(model3d::is_encrypted(&model) == false, 309);
    assert!(*string::as_bytes(model3d::lineage_blob_id(&model)) == b"lineageBlobZ", 310);
    // D-037 — glb_blob_id stored + accessor returns it.
    assert!(*string::as_bytes(model3d::glb_blob_id(&model)) == b"glbBlobZ", 311);

    transfer::public_transfer(model, CREATOR);
    sc.next_tx(CREATOR);

    // (c) Blob landed at ctx.sender() — proves the public_transfer side
    // effect inside new_model (lifecycle-fixed-to-sender per source comment).
    // take + return-to-sender is the existence-only check; consuming the
    // Blob via test would require a Walrus burn helper not used elsewhere
    // in this suite.
    let blob_in_inbox = sc.take_from_sender<Blob>();
    sc.return_to_sender(blob_in_inbox);

    let received_model = sc.take_from_sender<Model3D>();
    destroy_model_for_testing(received_model);

    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// === plan-013 — part_labels carried through new_model + ModelPublished event ===
//
// Verifies that a segmented-mesh publish (the 4-label palette case) stores the
// vector on the Model3D struct AND emits it on the ModelPublished event so the
// indexer can populate `Model3DSummary.partLabels` without a follow-up
// `getObject`. The "happy path: variable N" plan scenario is covered indirectly
// here by selecting 4 labels (vs the existing empty-vector tests which cover
// legacy single-material bases).

#[test]
fun new_model_stores_and_emits_part_labels() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let b = mint_blob(&mut system, sc.ctx());
    let clk = clock::create_for_testing(sc.ctx());

    let model = new_model(
        b,
        s(b"car"),
        s(b"{}"),
        s(b"Segmented"),
        empty_tags(),
        s(b"lineageSeg"),
        s(b"glbSeg"),
        four_label_palette(),
        vector<u8>[],     // sealed_key (unencrypted)
        vector<u8>[],     // seal_id
        vector<string::String>[], // preview_blob_ids
        default_license(),
        &clk,
        sc.ctx(),
    );

    // (a) Field is stored on the Model3D and accessor returns it.
    let labels = model3d::part_labels(&model);
    assert!(vector::length(labels) == 4, 320);
    assert!(*string::as_bytes(vector::borrow(labels, 0)) == b"primary", 321);
    assert!(*string::as_bytes(vector::borrow(labels, 1)) == b"secondary", 322);
    assert!(*string::as_bytes(vector::borrow(labels, 2)) == b"accent", 323);
    assert!(*string::as_bytes(vector::borrow(labels, 3)) == b"detail", 324);

    // (b) ModelPublished event carries the same vector (indexer entry point).
    let events = event::events_by_type<model3d::ModelPublished>();
    assert!(vector::length(&events) == 1, 325);
    let ep = vector::borrow(&events, 0);
    let evt_labels = model3d::model_published_part_labels(ep);
    assert!(vector::length(evt_labels) == 4, 326);
    assert!(*string::as_bytes(vector::borrow(evt_labels, 0)) == b"primary", 327);
    assert!(*string::as_bytes(vector::borrow(evt_labels, 3)) == b"detail", 328);

    transfer::public_transfer(model, CREATOR);
    sc.next_tx(CREATOR);
    let blob_in_inbox = sc.take_from_sender<Blob>();
    sc.return_to_sender(blob_in_inbox);
    let received_model = sc.take_from_sender<Model3D>();
    destroy_model_for_testing(received_model);

    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// === Phase 2 entry-fn removal — implicit at compile-time ===
//
// `publish_and_share` and `purchase_model_access` no longer exist in the
// module. Any reference here would fail compilation; their absence from
// this test file is the verification artifact. Same for Phase 3 Collection
// plumbing (`publish_collection`, `mint_variant`, `share_collection`,
// `Collection`, `VariantSpec`).

// === LicenseTerms validation — assertion-ladder coverage (Phase 2 carryover) ===

#[test]
fun validate_inputs_happy_minimum() {
    validate_publish_inputs(&s(b""), &s(b""), &empty_tags(), &s(b""), &s(b""), &empty_part_labels(), &default_license());
}

#[test]
fun validate_inputs_happy_ten_tags() {
    validate_publish_inputs(
        &s(b"{\"x\":1}"),
        &s(b"sword"),
        &make_tags(10),
        &s(b"abc123"),
        &s(b""),
        &empty_part_labels(),
        &default_license(),
    );
}

#[test, expected_failure(abort_code = model3d::ERoyaltyTooHigh)]
fun validate_inputs_rejects_royalty_over_cap() {
    let bad = new_license_terms(policy_permissionless(), 0, max_derivative_royalty_bps() + 1, true, true, 0);
    validate_publish_inputs(&s(b""), &s(b""), &empty_tags(), &s(b""), &s(b""), &empty_part_labels(), &bad);
}

#[test]
fun validate_inputs_accepts_royalty_at_cap() {
    let edge = new_license_terms(policy_permissionless(), 0, max_derivative_royalty_bps(), true, true, 0);
    validate_publish_inputs(&s(b""), &s(b""), &empty_tags(), &s(b""), &s(b""), &empty_part_labels(), &edge);
}

#[test, expected_failure(abort_code = model3d::ETooManyTags)]
fun validate_inputs_rejects_17_tags() {
    validate_publish_inputs(&s(b""), &s(b""), &make_tags(17), &s(b""), &s(b""), &empty_part_labels(), &default_license());
}

#[test]
fun validate_inputs_accepts_16_tags() {
    validate_publish_inputs(&s(b""), &s(b""), &make_tags(16), &s(b""), &s(b""), &empty_part_labels(), &default_license());
}

#[test, expected_failure(abort_code = model3d::ETagTooLong)]
fun validate_inputs_rejects_tag_33_chars() {
    let mut tags = empty_tags();
    vector::push_back(&mut tags, repeat_byte(ASCII_A, 33));
    validate_publish_inputs(&s(b""), &s(b""), &tags, &s(b""), &s(b""), &empty_part_labels(), &default_license());
}

#[test]
fun validate_inputs_accepts_tag_32_chars() {
    let mut tags = empty_tags();
    vector::push_back(&mut tags, repeat_byte(ASCII_A, 32));
    validate_publish_inputs(&s(b""), &s(b""), &tags, &s(b""), &s(b""), &empty_part_labels(), &default_license());
}

#[test, expected_failure(abort_code = model3d::EParamsJsonTooLong)]
fun validate_inputs_rejects_params_json_4097() {
    validate_publish_inputs(
        &repeat_byte(ASCII_X, 4097),
        &s(b""),
        &empty_tags(),
        &s(b""),
        &s(b""),
        &empty_part_labels(),
        &default_license(),
    );
}

#[test]
fun validate_inputs_accepts_params_json_4096() {
    validate_publish_inputs(
        &repeat_byte(ASCII_X, 4096),
        &s(b""),
        &empty_tags(),
        &s(b""),
        &s(b""),
        &empty_part_labels(),
        &default_license(),
    );
}

#[test, expected_failure(abort_code = model3d::ENameTooLong)]
fun validate_inputs_rejects_name_129() {
    validate_publish_inputs(
        &s(b""),
        &repeat_byte(ASCII_N, 129),
        &empty_tags(),
        &s(b""),
        &s(b""),
        &empty_part_labels(),
        &default_license(),
    );
}

#[test]
fun validate_inputs_accepts_name_128() {
    validate_publish_inputs(
        &s(b""),
        &repeat_byte(ASCII_N, 128),
        &empty_tags(),
        &s(b""),
        &s(b""),
        &empty_part_labels(),
        &default_license(),
    );
}

#[test, expected_failure(abort_code = model3d::EBlobIdMalformed)]
fun validate_inputs_rejects_lineage_blob_id_129() {
    validate_publish_inputs(
        &s(b""),
        &s(b""),
        &empty_tags(),
        &repeat_byte(ASCII_B, 129),
        &s(b""),
        &empty_part_labels(),
        &default_license(),
    );
}

#[test]
fun validate_inputs_accepts_lineage_blob_id_128() {
    validate_publish_inputs(
        &s(b""),
        &s(b""),
        &empty_tags(),
        &repeat_byte(ASCII_B, 128),
        &s(b""),
        &empty_part_labels(),
        &default_license(),
    );
}

// D-037 — glb_blob_id shares lineage_blob_id's MAX_BLOB_ID_LEN bound +
// EBlobIdMalformed code. Lineage stays valid (empty) so the abort is
// attributable to glb_blob_id, not lineage.
#[test, expected_failure(abort_code = model3d::EBlobIdMalformed)]
fun validate_inputs_rejects_glb_blob_id_129() {
    validate_publish_inputs(
        &s(b""),
        &s(b""),
        &empty_tags(),
        &s(b""),
        &repeat_byte(ASCII_B, 129),
        &empty_part_labels(),
        &default_license(),
    );
}

#[test]
fun validate_inputs_accepts_glb_blob_id_128() {
    validate_publish_inputs(
        &s(b""),
        &s(b""),
        &empty_tags(),
        &s(b""),
        &repeat_byte(ASCII_B, 128),
        &empty_part_labels(),
        &default_license(),
    );
}

// === plan-013 — part_labels bounds (MAX_PARTS + per-element MAX_TAG_LEN) ===

#[test]
fun validate_inputs_accepts_four_label_palette() {
    validate_publish_inputs(
        &s(b""),
        &s(b""),
        &empty_tags(),
        &s(b""),
        &s(b""),
        &four_label_palette(),
        &default_license(),
    );
}

#[test]
fun validate_inputs_accepts_max_parts_64() {
    validate_publish_inputs(
        &s(b""),
        &s(b""),
        &empty_tags(),
        &s(b""),
        &s(b""),
        &make_part_labels(64),
        &default_license(),
    );
}

#[test, expected_failure(abort_code = model3d::ETooManyParts)]
fun validate_inputs_rejects_part_labels_65() {
    validate_publish_inputs(
        &s(b""),
        &s(b""),
        &empty_tags(),
        &s(b""),
        &s(b""),
        &make_part_labels(65),
        &default_license(),
    );
}

#[test]
fun validate_inputs_accepts_part_label_32_chars() {
    let mut labels = empty_part_labels();
    vector::push_back(&mut labels, repeat_byte(ASCII_A, 32));
    validate_publish_inputs(
        &s(b""),
        &s(b""),
        &empty_tags(),
        &s(b""),
        &s(b""),
        &labels,
        &default_license(),
    );
}

#[test, expected_failure(abort_code = model3d::EPartLabelTooLong)]
fun validate_inputs_rejects_part_label_33_chars() {
    let mut labels = empty_part_labels();
    vector::push_back(&mut labels, repeat_byte(ASCII_A, 33));
    validate_publish_inputs(
        &s(b""),
        &s(b""),
        &empty_tags(),
        &s(b""),
        &s(b""),
        &labels,
        &default_license(),
    );
}

// === Royalty cap policy constants ===

#[test]
fun policy_constants_match_spec() {
    assert!(policy_restricted() == 0, 1);
    assert!(model3d::policy_allow_list() == 1, 2);
    assert!(policy_permissionless() == 2, 3);
    // L2 derivative-royalty cap (D-004 — deferred to v1.1).
    assert!(max_derivative_royalty_bps() == 3000, 4);
    // Phase 4 primary-sale royalty rate (5% — single global value).
    assert!(amount_bp_default() == 500, 5);
    // Phase 4 minimum royalty floor (0.001 SUI — kicks in below 0.02 SUI price).
    assert!(min_royalty_amount_mist() == 1_000_000, 6);
}

// === publish (D-032) — shares the Model3D + emits ModelPublished ===
//
// `publish` constructs a Model3D via `new_model` and `share_object`s it (no
// Kiosk — Model3D sells access, not ownership). After publish the model is a
// shared object: any wallet can `take_shared<Model3D>` it, which is what
// `launch_collection(&Model3D)` needs to fork it cross-wallet.
#[test]
fun publish_shares_model_and_emits_model_published() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let b = mint_blob(&mut system, sc.ctx());
    let clk = clock::create_for_testing(sc.ctx());

    publish(
        b,
        s(b"car"),
        s(b"{\"variant\":3}"),
        s(b"Aero"),
        make_tags(1),
        s(b"lineageBlobPub"),
        s(b"glbBlobPub"),
        empty_part_labels(),
        default_license(),
        &clk,
        sc.ctx(),
    );

    // Exactly one ModelPublished in this tx (Walrus helpers also emit; filter
    // by type rather than counting all events).
    let mp = event::events_by_type<model3d::ModelPublished>();
    assert!(vector::length(&mp) == 1, 360);
    let ep = vector::borrow(&mp, 0);
    let published_id = model3d::model_published_model_id(ep);
    assert!(model3d::model_published_creator(ep) == CREATOR, 361);
    assert!(model3d::model_published_policy(ep) == policy_permissionless(), 362);

    // The model is now a SHARED object — take_shared resolves it, and any
    // sender (not just CREATOR) can reference it.
    sc.next_tx(NFT_CREATOR);
    let model = sc.take_shared<Model3D>();
    assert!(object::id(&model) == published_id, 363);
    assert!(model3d::creator(&model) == CREATOR, 364);
    ts::return_shared(model);

    // Blob landed at the creator's inbox (lifecycle fixed in new_model).
    sc.next_tx(CREATOR);
    let blob_in_inbox = sc.take_from_sender<Blob>();
    sc.return_to_sender(blob_in_inbox);

    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// === ensure_creator_kiosk — the nft creator's PersonalKiosk for NftTokens ===

// `ensure_creator_kiosk` shares a Kiosk and transfers a PersonalKioskCap to
// ctx.sender(). The NftToken tests need the Kiosk + cap surfaced into the
// next-tx inbox; this helper consolidates the setup.
fun new_creator_kiosk(sc: &mut ts::Scenario, who: address): (Kiosk, PersonalKioskCap) {
    ensure_creator_kiosk(sc.ctx());
    sc.next_tx(who);
    let kiosk = ts::take_shared<Kiosk>(sc);
    let cap = sc.take_from_sender<PersonalKioskCap>();
    (kiosk, cap)
}

// === U4 test 1 — `ensure_creator_kiosk` basic existence ===
//
// Verifies the entry fn (a) creates exactly one shared `Kiosk` taken via
// `take_shared`, (b) transfers exactly one `PersonalKioskCap` to ctx.sender(),
// (c) the resulting Kiosk is marked "personal" (df-OwnerMarker set), and
// (d) `personal_kiosk::owner(kiosk)` returns the caller's address.
#[test]
fun ensure_creator_kiosk_creates_personal_kiosk_owned_by_caller() {
    let mut sc = ts::begin(CREATOR);
    ensure_creator_kiosk(sc.ctx());
    sc.next_tx(CREATOR);

    let kiosk = ts::take_shared<Kiosk>(&sc);
    let cap = sc.take_from_sender<PersonalKioskCap>();

    // (a) + (b) cardinality — only one PersonalKioskCap was transferred.
    assert!(!ts::has_most_recent_for_sender<PersonalKioskCap>(&sc), 500);
    // (c) Kiosk has the OwnerMarker dynamic field (personal_kiosk::is_personal).
    assert!(personal_kiosk::is_personal(&kiosk), 501);
    // (d) Owner registered as CREATOR (ctx.sender()).
    assert!(personal_kiosk::owner(&kiosk) == CREATOR, 502);

    sc.return_to_sender(cap);
    ts::return_shared(kiosk);
    sc.end();
}

// === U4 test 1b — PersonalKioskCap is soulbound (compile + runtime checks) ===
//
// Plan-007 §U4 line 346: "PersonalKioskRule prevents Cap transfer (soulbound
// at type level)". Two complementary proofs.
//
// (1) COMPILE-TIME proof (commented, illustrative). The following call would
// fail to type-check because `PersonalKioskCap has key` only (no `store`),
// and `transfer::public_transfer<T>` requires `T: store`. If a future
// kiosk-package upgrade ever adds `store` to PersonalKioskCap, uncommenting
// this line would make it compile — that contradicts apps@7a07937 and is
// the regression we want loud:
//
//     transfer::public_transfer<PersonalKioskCap>(cap, @0xBEEF);
//
// We CANNOT leave this line uncommented because Move 2024 has no "expected
// compile failure" attribute and the build would break. Keep it as a
// commented marker; sync-check on framework bump.
//
// (2) RUNTIME proof. `personal_kiosk::owner(&kiosk)` returns the same
// address across multiple txs after `ensure_creator_kiosk` runs. Ownership
// cannot be reassigned through any public surface — there is no
// `personal_kiosk::set_owner` or equivalent in the kiosk package at our
// pinned SHA, so the owner is locked at construction time.
#[test]
fun personal_kiosk_cap_is_soulbound_owner_pinned_across_txs() {
    let mut sc = ts::begin(CREATOR);
    ensure_creator_kiosk(sc.ctx());
    sc.next_tx(CREATOR);
    let kiosk = ts::take_shared<Kiosk>(&sc);
    let cap = sc.take_from_sender<PersonalKioskCap>();

    // tx 1: owner is CREATOR.
    assert!(personal_kiosk::owner(&kiosk) == CREATOR, 540);

    // Advance multiple times with arbitrary unrelated activity.
    sc.return_to_sender(cap);
    ts::return_shared(kiosk);
    sc.next_tx(@0xBABE);
    sc.next_tx(@0xBEEF);
    sc.next_tx(CREATOR);

    let kiosk2 = ts::take_shared<Kiosk>(&sc);
    let cap2 = sc.take_from_sender<PersonalKioskCap>();

    // tx N: owner is still CREATOR. No public API can reassign.
    assert!(personal_kiosk::owner(&kiosk2) == CREATOR, 541);

    sc.return_to_sender(cap2);
    ts::return_shared(kiosk2);
    sc.end();
}

// === D-029 U1 — launch_collection (pay-to-derive, Fork A) ===

// Build a base Model3D owned by CREATOR with a caller-chosen license. Returns
// the model by value (the caller keeps it for the duration of the test).
#[test_only]
fun mint_base_model(
    system: &mut System,
    clk: &clock::Clock,
    license: model3d::LicenseTerms,
    ctx: &mut tx_context::TxContext,
): Model3D {
    let b = mint_blob(system, ctx);
    // D-075 — encryption is derived from policy, so a non-PERMISSIONLESS base
    // MUST carry seal fields (new_model's consistency guard). Supply dummy values
    // for the gate/launch tests (which don't exercise real decryption). new_model
    // doesn't touch the registry, so a constant dummy seal_id is fine here.
    let encrypted = model3d::license_policy(&license) != policy_permissionless();
    let sealed_key = if (encrypted) { b"dummy-sealed-key" } else { vector<u8>[] };
    let seal_id = if (encrypted) { b"dummy-seal-id-01" } else { vector<u8>[] };
    new_model(
        b,
        s(b"car"),
        s(b"{\"variant\":1}"),
        s(b"BaseCar"),
        make_tags(1),
        s(b"lineageBlobBase"),
        s(b"glbBlobBase"),
        empty_part_labels(),
        sealed_key,
        seal_id,
        vector<string::String>[], // preview_blob_ids (none needed for gate/launch tests)
        license,
        clk,
        ctx,
    )
}

// Covers AE1: launch_collection with a 0-fee base → one shared NftCollection
// tied to base_model_id, one soulbound cap owned by the caller, register_fee == 0,
// snapshots match the base license. (0-fee path: no derive payment moves.)
#[test]
fun launch_collection_creates_collection_and_soulbound_cap() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let clk = clock::create_for_testing(sc.ctx());
    // 0 derive fee, permissionless, 500 bps derivative royalty.
    let model = mint_base_model(&mut system, &clk, default_license(), sc.ctx());
    let model_id = object::id(&model);

    sc.next_tx(NFT_CREATOR);
    // Even at fee 0 the entry fn takes a Coin<SUI>; a zero coin is valid.
    let payment = coin::mint_for_testing<SUI>(0, sc.ctx());
    launch_collection(&model, payment, quilt(), sc.ctx());

    // CollectionLaunched fires in this tx — assert its fields before next_tx
    // consumes the event buffer.
    let launched = event::events_by_type<model3d::CollectionLaunched>();
    assert!(vector::length(&launched) == 1, 307);
    let le = vector::borrow(&launched, 0);
    assert!(model3d::collection_launched_base_model_id(le) == model_id, 308);
    assert!(model3d::collection_launched_nft_creator(le) == NFT_CREATOR, 309);

    sc.next_tx(NFT_CREATOR);
    let cap = sc.take_from_sender<NftCollectionCreatorCap>();
    let collection = sc.take_shared<NftCollection>();

    assert!(model3d::collection_base_model_id(&collection) == model_id, 300);
    assert!(model3d::collection_base_creator(&collection) == CREATOR, 301);
    // base_creator (mesh creator) and nft_creator (cap holder) are distinct.
    assert!(model3d::collection_nft_creator(&collection) == NFT_CREATOR, 306);
    // integration_policy defaults to PERMISSIONLESS at launch (D-030).
    assert!(model3d::collection_integration_policy(&collection) == policy_permissionless(), 302);
    assert!(model3d::collection_base_royalty_bps(&collection) == 500, 303);
    assert!(model3d::collection_register_fee(&collection) == 0, 304);
    // D-035 — the quilt blob id passed at launch is stored + readable.
    assert!(*string::as_bytes(model3d::collection_quilt_blob_id(&collection)) == b"quiltBlobIdABC", 312);
    assert!(model3d::cap_collection_id(&cap) == object::id(&collection), 305);
    // Soulbound proof is compile-time: `transfer::public_transfer(cap, …)` here
    // would NOT compile because NftCollectionCreatorCap lacks `store`.

    destroy_collection_cap_for_testing(cap);
    destroy_collection_for_testing(collection);
    destroy_model_for_testing(model);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// === D-040 — L1 license policy enforcement in launch_collection ===
//
// PERMISSIONLESS lets any payer fork (covered by the cross-wallet test above,
// where CREATOR mints and NFT_CREATOR launches). The cases below pin the
// RESTRICTED / fail-safe behavior the assert introduces.

// RESTRICTED base + non-creator caller → aborts EPolicyRestricted, even with a
// valid (here zero-fee) payment. The policy gate fires before the fee check.
#[test, expected_failure(abort_code = model3d::EPolicyRestricted)]
fun launch_collection_restricted_non_creator_aborts() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let clk = clock::create_for_testing(sc.ctx());
    let license = new_license_terms(policy_restricted(), 0, 500, true, true, 0);
    let model = mint_base_model(&mut system, &clk, license, sc.ctx());

    sc.next_tx(NFT_CREATOR);
    launch_collection(&model, coin::mint_for_testing<SUI>(0, sc.ctx()), quilt(), sc.ctx());

    destroy_model_for_testing(model);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// RESTRICTED base + the base creator forks their own model → allowed.
#[test]
fun launch_collection_restricted_creator_ok() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let clk = clock::create_for_testing(sc.ctx());
    let license = new_license_terms(policy_restricted(), 0, 500, true, true, 0);
    let model = mint_base_model(&mut system, &clk, license, sc.ctx());
    let model_id = object::id(&model);

    // Same wallet (CREATOR) that owns the model launches the collection.
    launch_collection(&model, coin::mint_for_testing<SUI>(0, sc.ctx()), quilt(), sc.ctx());

    sc.next_tx(CREATOR);
    let cap = sc.take_from_sender<NftCollectionCreatorCap>();
    let collection = sc.take_shared<NftCollection>();
    assert!(model3d::collection_base_model_id(&collection) == model_id, 380);
    assert!(model3d::collection_nft_creator(&collection) == CREATOR, 381);

    destroy_collection_cap_for_testing(cap);
    destroy_collection_for_testing(collection);
    destroy_model_for_testing(model);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// plan-027 (U3b / R9) — the BARE `launch_collection` entry rejects an ALLOW_LIST
// base for a NON-CREATOR (EEntitlementRequired): they must route through the
// entitlement entry. Closes the free-fork bypass hole. (v11 relaxes this for the
// creator only — see launch_collection_allow_list_creator_ok below.)
#[test, expected_failure(abort_code = model3d::EEntitlementRequired)]
fun launch_collection_allow_list_without_entitlement_aborts() {
    let fee: u64 = 1_000_000;
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let clk = clock::create_for_testing(sc.ctx());
    let license = new_license_terms(policy_allow_list(), fee, 500, true, true, fee);
    let model = mint_base_model(&mut system, &clk, license, sc.ctx());

    sc.next_tx(NFT_CREATOR);
    // Non-creator bare launch on an ALLOW_LIST base → aborts before any state change.
    launch_collection(&model, coin::mint_for_testing<SUI>(fee, sc.ctx()), quilt(), sc.ctx());

    destroy_model_for_testing(model);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// plan-027 v11 — the base CREATOR may launch their OWN ALLOW_LIST base via the
// bare entry without an entitlement (no pointless self-pay for access to their
// own content). Non-creators are still rejected (test above).
#[test]
fun launch_collection_allow_list_creator_ok() {
    let fee: u64 = 1_000_000;
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let clk = clock::create_for_testing(sc.ctx());
    let license = new_license_terms(policy_allow_list(), fee, 500, true, true, fee);
    let model = mint_base_model(&mut system, &clk, license, sc.ctx());

    // CREATOR launches their own ALLOW_LIST base via the bare entry → succeeds.
    sc.next_tx(CREATOR);
    launch_collection(&model, coin::mint_for_testing<SUI>(fee, sc.ctx()), quilt(), sc.ctx());

    sc.next_tx(CREATOR);
    let collection = sc.take_shared<model3d::NftCollection>();
    let cap = sc.take_from_sender<model3d::NftCollectionCreatorCap>();
    assert!(model3d::cap_collection_id(&cap) == object::id(&collection), 900);
    ts::return_shared(collection);
    sc.return_to_sender(cap);

    destroy_model_for_testing(model);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// plan-027 (U3b / R9) — the entitlement-gated launch succeeds for the
// entitlement holder: charges the derive fee, mints the soulbound cap + shared
// collection. Here derive_fee > 0 (distinct from access_fee) to prove the derive
// fee is charged at launch.
#[test]
fun launch_collection_with_entitlement_holder_ok() {
    let access_fee: u64 = 1_000_000;
    let derive_fee: u64 = 2_000_000;
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let clk = clock::create_for_testing(sc.ctx());
    let license = new_license_terms(policy_allow_list(), derive_fee, 500, true, true, access_fee);
    let mut model = mint_base_model(&mut system, &clk, license, sc.ctx());
    let model_id = object::id(&model);

    // NFT_CREATOR buys access.
    sc.next_tx(NFT_CREATOR);
    model3d::purchase_access(&mut model, coin::mint_for_testing<SUI>(access_fee, sc.ctx()), sc.ctx());
    sc.next_tx(NFT_CREATOR);
    let entitlement = sc.take_from_sender<model3d::AccessEntitlement>();

    // Drain the access fee routed to CREATOR.
    sc.next_tx(CREATOR);
    let af = sc.take_from_sender<coin::Coin<SUI>>();
    assert!(coin::value(&af) == access_fee, 393);
    coin::burn_for_testing(af);

    // Entitlement-gated launch — pays the derive fee.
    sc.next_tx(NFT_CREATOR);
    model3d::launch_collection_with_entitlement(
        &model, &entitlement, coin::mint_for_testing<SUI>(derive_fee, sc.ctx()), quilt(), sc.ctx());

    // CREATOR received the derive fee.
    sc.next_tx(CREATOR);
    let df = sc.take_from_sender<coin::Coin<SUI>>();
    assert!(coin::value(&df) == derive_fee, 394);
    coin::burn_for_testing(df);

    sc.next_tx(NFT_CREATOR);
    let cap = sc.take_from_sender<NftCollectionCreatorCap>();
    let collection = sc.take_shared<NftCollection>();
    assert!(model3d::collection_base_model_id(&collection) == model_id, 390);
    assert!(model3d::collection_nft_creator(&collection) == NFT_CREATOR, 391);

    model3d::destroy_entitlement_for_testing(entitlement);
    destroy_collection_cap_for_testing(cap);
    destroy_collection_for_testing(collection);
    destroy_model_for_testing(model);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// plan-027 (U3b / R9) — entitlement-gated launch aborts when the entitlement is
// held by a DIFFERENT wallet than the caller (ENotEntitlementHolder).
#[test, expected_failure(abort_code = model3d::ENotEntitlementHolder)]
fun launch_collection_with_wrong_holder_entitlement_aborts() {
    let fee: u64 = 1_000_000;
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let clk = clock::create_for_testing(sc.ctx());
    let license = new_license_terms(policy_allow_list(), 0, 500, true, true, fee);
    let mut model = mint_base_model(&mut system, &clk, license, sc.ctx());

    // NFT_CREATOR buys the entitlement.
    sc.next_tx(NFT_CREATOR);
    model3d::purchase_access(&mut model, coin::mint_for_testing<SUI>(fee, sc.ctx()), sc.ctx());
    sc.next_tx(NFT_CREATOR);
    let entitlement = sc.take_from_sender<model3d::AccessEntitlement>();
    sc.next_tx(CREATOR);
    coin::burn_for_testing(sc.take_from_sender<coin::Coin<SUI>>());

    // A DIFFERENT wallet (@0xBEEF) tries to launch with NFT_CREATOR's entitlement.
    sc.next_tx(@0xBEEF);
    model3d::launch_collection_with_entitlement(
        &model, &entitlement, coin::mint_for_testing<SUI>(0, sc.ctx()), quilt(), sc.ctx());

    model3d::destroy_entitlement_for_testing(entitlement);
    destroy_model_for_testing(model);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// D-040 batch path: launch_collection_with_tokens routes through the same
// launch_collection_internal, so the policy gate covers it too. A non-creator
// forking a RESTRICTED base via the one-signature batch fn must abort
// EPolicyRestricted (guards against the gate being lost on the batch path).
#[test, expected_failure(abort_code = model3d::EPolicyRestricted)]
fun launch_collection_with_tokens_restricted_non_creator_aborts() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let clk = clock::create_for_testing(sc.ctx());
    let license = new_license_terms(policy_restricted(), 0, 500, true, true, 0);
    let model = mint_base_model(&mut system, &clk, license, sc.ctx());

    sc.next_tx(NFT_CREATOR);
    launch_collection_with_tokens(
        &model,
        coin::mint_for_testing<SUI>(0, sc.ctx()),
        quilt(),
        0,
        str_vec(b"N", 1),
        str_vec(b"p", 1),
        sc.ctx(),
    );

    destroy_model_for_testing(model);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// Pay-to-derive: a non-zero derivative_mint_fee is routed to the base creator;
// the remainder of the payment returns to the caller.
#[test]
fun launch_collection_routes_derive_fee_to_base_creator() {
    let fee: u64 = 2_000_000;
    let extra: u64 = 500_000;

    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let clk = clock::create_for_testing(sc.ctx());
    let license = new_license_terms(policy_permissionless(), fee, 500, true, true, 0);
    let model = mint_base_model(&mut system, &clk, license, sc.ctx());

    sc.next_tx(NFT_CREATOR);
    let payment = coin::mint_for_testing<SUI>(fee + extra, sc.ctx());
    launch_collection(&model, payment, quilt(), sc.ctx());

    // Base creator (CREATOR) received exactly the derive fee.
    sc.next_tx(CREATOR);
    let fee_coin = sc.take_from_sender<coin::Coin<SUI>>();
    assert!(coin::value(&fee_coin) == fee, 310);
    coin::burn_for_testing(fee_coin);

    // Caller (NFT_CREATOR) received the remainder.
    sc.next_tx(NFT_CREATOR);
    let change = sc.take_from_sender<coin::Coin<SUI>>();
    assert!(coin::value(&change) == extra, 311);
    coin::burn_for_testing(change);

    let cap = sc.take_from_sender<NftCollectionCreatorCap>();
    let collection = sc.take_shared<NftCollection>();
    destroy_collection_cap_for_testing(cap);
    destroy_collection_for_testing(collection);
    destroy_model_for_testing(model);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// D-030: integration_policy is collection-level, set by the nft creator via the
// cap (NOT snapshotted from the base model). Default is PERMISSIONLESS; the cap
// holder can close (and reopen) the collection to integrations.
#[test]
fun set_integration_policy_opens_and_closes_collection() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let clk = clock::create_for_testing(sc.ctx());
    // Base model is PERMISSIONLESS at the L1 license (so a cross-wallet fork is
    // allowed post-D-040). The collection's integration_policy is set
    // independently by the cap holder and does NOT derive from the base L1
    // policy — proven below by toggling it open→closed→open via the cap (D-030).
    let license = new_license_terms(policy_permissionless(), 0, 0, false, false, 0);
    let model = mint_base_model(&mut system, &clk, license, sc.ctx());

    sc.next_tx(NFT_CREATOR);
    launch_collection(&model, coin::mint_for_testing<SUI>(0, sc.ctx()), quilt(), sc.ctx());

    sc.next_tx(NFT_CREATOR);
    let cap = sc.take_from_sender<NftCollectionCreatorCap>();
    let mut collection = sc.take_shared<NftCollection>();
    // Default open at launch (D-030).
    assert!(model3d::collection_integration_policy(&collection) == policy_permissionless(), 320);

    // Close it.
    set_integration_policy(&cap, &mut collection, policy_restricted());
    assert!(model3d::collection_integration_policy(&collection) == policy_restricted(), 321);
    // Reopen it.
    set_integration_policy(&cap, &mut collection, policy_permissionless());
    assert!(model3d::collection_integration_policy(&collection) == policy_permissionless(), 322);

    destroy_collection_cap_for_testing(cap);
    destroy_collection_for_testing(collection);
    destroy_model_for_testing(model);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// A cap from a DIFFERENT collection cannot set this collection's
// integration_policy (parity with set_register_fee's cap-mismatch guard).
#[test]
#[expected_failure(abort_code = model3d::EWrongCollectionCap)]
fun set_integration_policy_with_mismatched_cap_aborts() {
    let second_creator: address = @0xBEEF;

    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let clk = clock::create_for_testing(sc.ctx());
    let model = mint_base_model(&mut system, &clk, default_license(), sc.ctx());

    sc.next_tx(NFT_CREATOR);
    launch_collection(&model, coin::mint_for_testing<SUI>(0, sc.ctx()), quilt(), sc.ctx());
    sc.next_tx(second_creator);
    launch_collection(&model, coin::mint_for_testing<SUI>(0, sc.ctx()), quilt(), sc.ctx());

    sc.next_tx(NFT_CREATOR);
    let cap_a = sc.take_from_sender<NftCollectionCreatorCap>();
    sc.next_tx(second_creator);
    let cap_b = sc.take_from_sender<NftCollectionCreatorCap>();

    let id_b = model3d::cap_collection_id(&cap_b);
    let mut collection_b = ts::take_shared_by_id<NftCollection>(&sc, id_b);

    // cap_a does NOT authorize collection_b → abort EWrongCollectionCap.
    set_integration_policy(&cap_a, &mut collection_b, policy_restricted());

    // Unreachable.
    destroy_collection_cap_for_testing(cap_a);
    destroy_collection_cap_for_testing(cap_b);
    destroy_collection_for_testing(collection_b);
    destroy_model_for_testing(model);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// Underpaying the derive fee aborts with EInsufficientDeriveFee (35).
#[test]
#[expected_failure(abort_code = model3d::EInsufficientDeriveFee)]
fun launch_collection_aborts_when_payment_below_fee() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let clk = clock::create_for_testing(sc.ctx());
    let license = new_license_terms(policy_permissionless(), 1_000_000, 500, true, true, 0);
    let model = mint_base_model(&mut system, &clk, license, sc.ctx());

    sc.next_tx(NFT_CREATOR);
    let payment = coin::mint_for_testing<SUI>(999_999, sc.ctx());
    launch_collection(&model, payment, quilt(), sc.ctx()); // aborts on derive-fee

    // Unreachable — kept so the borrow checker is satisfied.
    destroy_model_for_testing(model);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// Exact-fee path (fee > 0, payment == fee): base creator gets the fee and the
// zero remainder is destroyed (no change coin lands in the caller's inbox).
#[test]
fun launch_collection_exact_fee_destroys_zero_remainder() {
    let fee: u64 = 1_500_000;

    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let clk = clock::create_for_testing(sc.ctx());
    let license = new_license_terms(policy_permissionless(), fee, 500, true, true, 0);
    let model = mint_base_model(&mut system, &clk, license, sc.ctx());

    sc.next_tx(NFT_CREATOR);
    launch_collection(&model, coin::mint_for_testing<SUI>(fee, sc.ctx()), quilt(), sc.ctx());

    sc.next_tx(CREATOR);
    let fee_coin = sc.take_from_sender<coin::Coin<SUI>>();
    assert!(coin::value(&fee_coin) == fee, 330);
    coin::burn_for_testing(fee_coin);

    // No change coin for the caller (remainder was destroy_zero'd).
    sc.next_tx(NFT_CREATOR);
    assert!(!ts::has_most_recent_for_sender<coin::Coin<SUI>>(&sc), 331);
    let cap = sc.take_from_sender<NftCollectionCreatorCap>();
    let collection = sc.take_shared<NftCollection>();

    destroy_collection_cap_for_testing(cap);
    destroy_collection_for_testing(collection);
    destroy_model_for_testing(model);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// Zero-fee path (fee == 0) with an overpaying coin: the whole payment is
// returned to the caller (no split).
#[test]
fun launch_collection_zero_fee_returns_overpayment() {
    let overpay: u64 = 600_000;

    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let clk = clock::create_for_testing(sc.ctx());
    let model = mint_base_model(&mut system, &clk, default_license(), sc.ctx());

    sc.next_tx(NFT_CREATOR);
    launch_collection(&model, coin::mint_for_testing<SUI>(overpay, sc.ctx()), quilt(), sc.ctx());

    sc.next_tx(NFT_CREATOR);
    let refund = sc.take_from_sender<coin::Coin<SUI>>();
    assert!(coin::value(&refund) == overpay, 332);
    coin::burn_for_testing(refund);
    let cap = sc.take_from_sender<NftCollectionCreatorCap>();
    let collection = sc.take_shared<NftCollection>();

    destroy_collection_cap_for_testing(cap);
    destroy_collection_for_testing(collection);
    destroy_model_for_testing(model);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// D-035 — a quilt_blob_id over MAX_BLOB_ID_LEN (128) aborts EBlobIdMalformed
// (same bound + code as the model's lineage_blob_id).
#[test]
#[expected_failure(abort_code = model3d::EBlobIdMalformed)]
fun launch_collection_quilt_blob_id_too_long_aborts() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let clk = clock::create_for_testing(sc.ctx());
    let model = mint_base_model(&mut system, &clk, default_license(), sc.ctx());

    sc.next_tx(NFT_CREATOR);
    // 129 bytes — one over MAX_BLOB_ID_LEN.
    launch_collection(&model, coin::mint_for_testing<SUI>(0, sc.ctx()), repeat_byte(ASCII_B, 129), sc.ctx());

    // Unreachable.
    destroy_model_for_testing(model);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// D-035 — a quilt_blob_id at exactly MAX_BLOB_ID_LEN (128) is accepted and
// stored (boundary-accept companion to the 129-reject above).
#[test]
fun launch_collection_quilt_blob_id_at_128_accepts() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let clk = clock::create_for_testing(sc.ctx());
    let model = mint_base_model(&mut system, &clk, default_license(), sc.ctx());

    sc.next_tx(NFT_CREATOR);
    launch_collection(&model, coin::mint_for_testing<SUI>(0, sc.ctx()), repeat_byte(ASCII_B, 128), sc.ctx());

    sc.next_tx(NFT_CREATOR);
    let cap = sc.take_from_sender<NftCollectionCreatorCap>();
    let collection = sc.take_shared<NftCollection>();
    assert!(string::length(model3d::collection_quilt_blob_id(&collection)) == 128, 390);

    destroy_collection_cap_for_testing(cap);
    destroy_collection_for_testing(collection);
    destroy_model_for_testing(model);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// === D-029 U2 — set_register_fee (cap-gated) ===

// Matching cap sets the fee; a subsequent read reflects it. Setting to 0 is
// allowed (free integration is a valid configuration).
#[test]
fun set_register_fee_with_matching_cap_updates_fee() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let clk = clock::create_for_testing(sc.ctx());
    let model = mint_base_model(&mut system, &clk, default_license(), sc.ctx());

    sc.next_tx(NFT_CREATOR);
    let payment = coin::mint_for_testing<SUI>(0, sc.ctx());
    launch_collection(&model, payment, quilt(), sc.ctx());

    sc.next_tx(NFT_CREATOR);
    let cap = sc.take_from_sender<NftCollectionCreatorCap>();
    let mut collection = sc.take_shared<NftCollection>();

    set_register_fee(&cap, &mut collection, 7_000_000);
    assert!(model3d::collection_register_fee(&collection) == 7_000_000, 330);

    // Fee 0 is explicitly allowed.
    set_register_fee(&cap, &mut collection, 0);
    assert!(model3d::collection_register_fee(&collection) == 0, 331);

    destroy_collection_cap_for_testing(cap);
    destroy_collection_for_testing(collection);
    destroy_model_for_testing(model);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// A cap from a DIFFERENT collection cannot set this collection's fee.
#[test]
#[expected_failure(abort_code = model3d::EWrongCollectionCap)]
fun set_register_fee_with_mismatched_cap_aborts() {
    let second_creator: address = @0xBEEF;

    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let clk = clock::create_for_testing(sc.ctx());
    let model = mint_base_model(&mut system, &clk, default_license(), sc.ctx());

    // Collection A — cap to NFT_CREATOR.
    sc.next_tx(NFT_CREATOR);
    launch_collection(&model, coin::mint_for_testing<SUI>(0, sc.ctx()), quilt(), sc.ctx());
    // Collection B — cap to second_creator.
    sc.next_tx(second_creator);
    launch_collection(&model, coin::mint_for_testing<SUI>(0, sc.ctx()), quilt(), sc.ctx());

    sc.next_tx(NFT_CREATOR);
    let cap_a = sc.take_from_sender<NftCollectionCreatorCap>();
    sc.next_tx(second_creator);
    let cap_b = sc.take_from_sender<NftCollectionCreatorCap>();

    // Borrow collection B by its id (the one cap_b authorizes).
    let id_b = model3d::cap_collection_id(&cap_b);
    let mut collection_b = ts::take_shared_by_id<NftCollection>(&sc, id_b);

    // cap_a does NOT authorize collection_b → abort EWrongCollectionCap.
    set_register_fee(&cap_a, &mut collection_b, 5);

    // Unreachable.
    destroy_collection_cap_for_testing(cap_a);
    destroy_collection_cap_for_testing(cap_b);
    destroy_collection_for_testing(collection_b);
    destroy_model_for_testing(model);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// === D-029 U3 — NftToken: mint + per-type TransferPolicy + resale royalty ===

// Stand up: Publisher → TransferPolicy<NftToken> (royalty-only, D-036) → base
// Model3D → launched NftCollection (+cap). No Kiosk: D-036 mint yields a plain
// owned token, so the Kiosk is created only by the resale test that lists one.
// Returns everything the caller must tear down. `model`/`system`/`clk` are kept
// alive for teardown.
#[test_only]
fun nfttoken_bootstrap(sc: &mut ts::Scenario): (
    system::System,
    clock::Clock,
    Model3D,
    TransferPolicy<NftToken>,
    NftCollection,
    NftCollectionCreatorCap,
) {
    init_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let publisher = sc.take_from_sender<Publisher>();
    ensure_collection_policy(&publisher, sc.ctx());
    sc.return_to_sender(publisher);

    sc.next_tx(CREATOR);
    let policy = ts::take_shared<TransferPolicy<NftToken>>(sc);
    let mut system = system::new_for_testing(sc.ctx());
    let clk = clock::create_for_testing(sc.ctx());
    let model = mint_base_model(&mut system, &clk, default_license(), sc.ctx());

    sc.next_tx(NFT_CREATOR);
    launch_collection(&model, coin::mint_for_testing<SUI>(0, sc.ctx()), quilt(), sc.ctx());
    sc.next_tx(NFT_CREATOR);
    let cap = sc.take_from_sender<NftCollectionCreatorCap>();
    let collection = ts::take_shared<NftCollection>(sc);

    (system, clk, model, policy, collection, cap)
}

// D-036 — mint_nft_token yields a PLAIN OWNED token (no Kiosk placement, no
// ItemListed), carrying the supplied patch_id; the per-type policy now has
// exactly the royalty rule (lock + personal_kiosk rules removed).
#[test]
fun mint_nft_token_yields_owned_token_with_patch_no_listing() {
    let mut sc = ts::begin(CREATOR);
    let (system, clk, model, policy, collection, cap) = nfttoken_bootstrap(&mut sc);

    sc.next_tx(NFT_CREATOR);
    mint_nft_token(&cap, &collection, s(b"Racer #1"), patch(), sc.ctx());

    // Exactly one NftTokenMinted, linked to this collection + carrying the patch.
    let minted = event::events_by_type<model3d::NftTokenMinted>();
    assert!(vector::length(&minted) == 1, 340);
    let me = vector::borrow(&minted, 0);
    assert!(model3d::nft_token_minted_collection_id(me) == object::id(&collection), 341);
    assert!(model3d::nft_token_minted_base_model_id(me) == object::id(&model), 346);
    assert!(model3d::nft_token_minted_nft_creator(me) == NFT_CREATOR, 347);
    assert!(*string::as_bytes(model3d::nft_token_minted_patch_id(me)) == b"patchId01", 348);

    // No Kiosk listing happened — zero ItemListed<NftToken> events (D-036).
    let listed = event::events_by_type<sui::kiosk::ItemListed<NftToken>>();
    assert!(vector::length(&listed) == 0, 344);

    // Per-type policy has EXACTLY the royalty rule (D-036 dropped lock + personal).
    assert!(sui::vec_set::size(tp::rules<NftToken>(&policy)) == 1, 345);

    // The minted token is a plain owned object in the creator's inbox.
    sc.next_tx(NFT_CREATOR);
    let token = sc.take_from_sender<NftToken>();
    assert!(model3d::nft_token_collection_id(&token) == object::id(&collection), 349);
    assert!(model3d::nft_token_base_model_id(&token) == object::id(&model), 350);
    assert!(*string::as_bytes(model3d::nft_token_name(&token)) == b"Racer #1", 351);
    assert!(*string::as_bytes(model3d::nft_token_patch_id(&token)) == b"patchId01", 352);
    destroy_nft_token_for_testing(token);

    destroy_collection_cap_for_testing(cap);
    destroy_collection_for_testing(collection);
    destroy_model_for_testing(model);
    ts::return_shared(policy);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// ensure_collection_policy attaches ONLY the royalty rule (D-036): assert the
// rule set has exactly one rule.
#[test]
fun collection_policy_has_only_royalty_rule() {
    let mut sc = ts::begin(CREATOR);
    let (system, clk, model, policy, collection, cap) = nfttoken_bootstrap(&mut sc);
    // Exactly one rule…
    assert!(sui::vec_set::size(tp::rules<NftToken>(&policy)) == 1, 380);
    // …and it is specifically the royalty rule: fee_amount aborts if the
    // royalty Config dynamic field is absent, so a non-royalty single rule
    // would fail here rather than silently passing the count==1 check.
    let owed = royalty_rule::fee_amount<NftToken>(&policy, 1_000_000_000);
    assert!(owed == (1_000_000_000 * (amount_bp_default() as u64)) / 10_000, 382);
    destroy_collection_cap_for_testing(cap);
    destroy_collection_for_testing(collection);
    destroy_model_for_testing(model);
    ts::return_shared(policy);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// Many tokens can share one patch_id (a "red edition"): both events + both
// minted objects carry the same patch.
#[test]
fun mint_multiple_tokens_share_one_patch_id() {
    let mut sc = ts::begin(CREATOR);
    let (system, clk, model, policy, collection, cap) = nfttoken_bootstrap(&mut sc);

    sc.next_tx(NFT_CREATOR);
    mint_nft_token(&cap, &collection, s(b"Red #1"), s(b"redPatch"), sc.ctx());
    mint_nft_token(&cap, &collection, s(b"Red #2"), s(b"redPatch"), sc.ctx());

    let minted = event::events_by_type<model3d::NftTokenMinted>();
    assert!(vector::length(&minted) == 2, 370);
    assert!(*string::as_bytes(model3d::nft_token_minted_patch_id(vector::borrow(&minted, 0))) == b"redPatch", 371);
    assert!(*string::as_bytes(model3d::nft_token_minted_patch_id(vector::borrow(&minted, 1))) == b"redPatch", 372);

    sc.next_tx(NFT_CREATOR);
    let t1 = sc.take_from_sender<NftToken>();
    let t2 = sc.take_from_sender<NftToken>();
    assert!(*string::as_bytes(model3d::nft_token_patch_id(&t1)) == b"redPatch", 373);
    assert!(*string::as_bytes(model3d::nft_token_patch_id(&t2)) == b"redPatch", 374);
    destroy_nft_token_for_testing(t1);
    destroy_nft_token_for_testing(t2);

    destroy_collection_cap_for_testing(cap);
    destroy_collection_for_testing(collection);
    destroy_model_for_testing(model);
    ts::return_shared(policy);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// === D-038 U20 — launch_collection_with_tokens (batch: launch + fee + mint N) ===

// Build [s(prefix0), s(prefix1), …] of length n with a per-index byte suffix so
// each string is distinct.
#[test_only]
fun str_vec(base: vector<u8>, n: u64): vector<string::String> {
    let mut v = vector::empty<string::String>();
    let mut i = 0;
    while (i < n) {
        let mut bytes = base;
        vector::push_back(&mut bytes, (48 + (i as u8))); // ascii '0'+i
        vector::push_back(&mut v, string::utf8(bytes));
        i = i + 1;
    };
    v
}

// Happy path (D-038): one call launches the collection, sets the register fee,
// and mints N owned tokens — all atomically. Asserts: exactly one
// CollectionLaunched, N NftTokenMinted (in loop order, carrying each patch_id),
// the shared collection with the supplied quilt + register_fee, the soulbound
// cap to the caller, and N plain owned tokens in the caller's inbox.
#[test]
fun launch_collection_with_tokens_launches_sets_fee_and_mints_fleet() {
    let register_fee: u64 = 2_000_000;

    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let clk = clock::create_for_testing(sc.ctx());
    let model = mint_base_model(&mut system, &clk, default_license(), sc.ctx());
    let model_id = object::id(&model);

    sc.next_tx(NFT_CREATOR);
    launch_collection_with_tokens(
        &model,
        coin::mint_for_testing<SUI>(0, sc.ctx()),
        quilt(),
        register_fee,
        str_vec(b"Racer #", 3),
        str_vec(b"patch", 3),
        sc.ctx(),
    );

    // Exactly one CollectionLaunched.
    let launched = event::events_by_type<model3d::CollectionLaunched>();
    assert!(vector::length(&launched) == 1, 700);
    assert!(model3d::collection_launched_base_model_id(vector::borrow(&launched, 0)) == model_id, 701);
    assert!(model3d::collection_launched_nft_creator(vector::borrow(&launched, 0)) == NFT_CREATOR, 702);

    // N NftTokenMinted, in loop order, each carrying its patch.
    let minted = event::events_by_type<model3d::NftTokenMinted>();
    assert!(vector::length(&minted) == 3, 703);
    assert!(*string::as_bytes(model3d::nft_token_minted_patch_id(vector::borrow(&minted, 0))) == b"patch0", 704);
    assert!(*string::as_bytes(model3d::nft_token_minted_patch_id(vector::borrow(&minted, 1))) == b"patch1", 705);
    assert!(*string::as_bytes(model3d::nft_token_minted_patch_id(vector::borrow(&minted, 2))) == b"patch2", 706);

    sc.next_tx(NFT_CREATOR);
    let cap = sc.take_from_sender<NftCollectionCreatorCap>();
    let collection = sc.take_shared<NftCollection>();
    assert!(model3d::collection_base_model_id(&collection) == model_id, 707);
    assert!(model3d::collection_nft_creator(&collection) == NFT_CREATOR, 708);
    // register_fee was set inside the batch call (no separate set_register_fee tx).
    assert!(model3d::collection_register_fee(&collection) == register_fee, 709);
    assert!(*string::as_bytes(model3d::collection_quilt_blob_id(&collection)) == b"quiltBlobIdABC", 710);
    assert!(model3d::cap_collection_id(&cap) == object::id(&collection), 711);

    // Exactly N plain owned tokens in the caller's inbox, each linked to the collection.
    let t0 = sc.take_from_sender<NftToken>();
    let t1 = sc.take_from_sender<NftToken>();
    let t2 = sc.take_from_sender<NftToken>();
    assert!(model3d::nft_token_collection_id(&t0) == object::id(&collection), 712);
    assert!(model3d::nft_token_collection_id(&t1) == object::id(&collection), 713);
    assert!(model3d::nft_token_collection_id(&t2) == object::id(&collection), 714);
    assert!(!ts::has_most_recent_for_sender<NftToken>(&sc), 715);
    destroy_nft_token_for_testing(t0);
    destroy_nft_token_for_testing(t1);
    destroy_nft_token_for_testing(t2);

    destroy_collection_cap_for_testing(cap);
    destroy_collection_for_testing(collection);
    destroy_model_for_testing(model);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// The batch fn routes a non-zero derive fee to the base creator and returns the
// remainder — same coin handling as standalone launch_collection.
#[test]
fun launch_collection_with_tokens_routes_derive_fee() {
    let fee: u64 = 2_000_000;
    let extra: u64 = 500_000;

    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let clk = clock::create_for_testing(sc.ctx());
    let license = new_license_terms(policy_permissionless(), fee, 500, true, true, 0);
    let model = mint_base_model(&mut system, &clk, license, sc.ctx());

    sc.next_tx(NFT_CREATOR);
    launch_collection_with_tokens(
        &model,
        coin::mint_for_testing<SUI>(fee + extra, sc.ctx()),
        quilt(),
        0,
        str_vec(b"T", 1),
        str_vec(b"p", 1),
        sc.ctx(),
    );

    sc.next_tx(CREATOR);
    let fee_coin = sc.take_from_sender<coin::Coin<SUI>>();
    assert!(coin::value(&fee_coin) == fee, 720);
    coin::burn_for_testing(fee_coin);

    sc.next_tx(NFT_CREATOR);
    let change = sc.take_from_sender<coin::Coin<SUI>>();
    assert!(coin::value(&change) == extra, 721);
    coin::burn_for_testing(change);

    let cap = sc.take_from_sender<NftCollectionCreatorCap>();
    let collection = sc.take_shared<NftCollection>();
    let tok = sc.take_from_sender<NftToken>();
    destroy_nft_token_for_testing(tok);
    destroy_collection_cap_for_testing(cap);
    destroy_collection_for_testing(collection);
    destroy_model_for_testing(model);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// Mismatched names/patch_ids vector lengths abort EBatchLenMismatch.
#[test]
#[expected_failure(abort_code = model3d::EBatchLenMismatch)]
fun launch_collection_with_tokens_length_mismatch_aborts() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let clk = clock::create_for_testing(sc.ctx());
    let model = mint_base_model(&mut system, &clk, default_license(), sc.ctx());

    sc.next_tx(NFT_CREATOR);
    // 2 names, 3 patches → abort before any state change.
    launch_collection_with_tokens(
        &model,
        coin::mint_for_testing<SUI>(0, sc.ctx()),
        quilt(),
        0,
        str_vec(b"N", 2),
        str_vec(b"p", 3),
        sc.ctx(),
    );

    abort 0
}

// D-036 — resale of an NftToken now runs the ROYALTY-ONLY chain: the creator
// opt-in places+lists the owned token in their PersonalKiosk (a separate step
// from mint), a DISTINCT buyer purchases, pays royalty, confirms, and TAKES the
// token out (no lock rule → no re-lock required). The buyer-side assertion
// proves cross-address ownership transfer + free use, not a self-purchase.
#[test]
fun nft_token_resale_runs_royalty_only_chain_and_buyer_takes() {
    let price: u64 = 1_000_000_000; // 1 SUI — above the floor crossover

    let mut sc = ts::begin(CREATOR);
    let (system, clk, model, mut policy, collection, cap) = nfttoken_bootstrap(&mut sc);

    // Mint a plain owned token (D-036), then opt-in list it for sale.
    sc.next_tx(NFT_CREATOR);
    mint_nft_token(&cap, &collection, s(b"Racer #1"), patch(), sc.ctx());
    let (mut kiosk, personal_cap) = new_creator_kiosk(&mut sc, NFT_CREATOR);
    sc.next_tx(NFT_CREATOR);
    let token = sc.take_from_sender<NftToken>();
    let token_id = object::id(&token);
    {
        let owner_cap = personal_kiosk::borrow(&personal_cap);
        kiosk::place_and_list<NftToken>(&mut kiosk, owner_cap, token, price);
    };

    // A DISTINCT buyer (not the seller) purchases with an exact-price payment.
    sc.next_tx(BUYER);
    let payment = coin::mint_for_testing<SUI>(price, sc.ctx());
    let (item, mut request) = kiosk::purchase<NftToken>(&mut kiosk, token_id, payment);

    // Provenance + patch survive the round-trip.
    assert!(model3d::nft_token_collection_id(&item) == object::id(&collection), 350);
    assert!(model3d::nft_token_base_model_id(&item) == object::id(&model), 351);
    assert!(*string::as_bytes(model3d::nft_token_patch_id(&item)) == b"patchId01", 352);

    // Royalty is the ONLY rule: pay it, then confirm. No lock / personal prove.
    let owed = royalty_rule::fee_amount<NftToken>(&policy, price);
    assert!(owed == (price * (amount_bp_default() as u64)) / 10_000, 353);
    royalty_rule::pay<NftToken>(&mut policy, &mut request, coin::mint_for_testing<SUI>(owed, sc.ctx()));

    let (returned_id, paid_amount, _from) = tp::confirm_request<NftToken>(&policy, request);
    assert!(paid_amount == price, 354);
    assert!(returned_id == token_id, 355);

    // No lock rule → the buyer holds the token by value and freely owns it.
    // Transfer to BUYER and re-take to prove it is a plain owned object in the
    // buyer's inbox (would be impossible if a lock rule had re-locked it).
    transfer::public_transfer(item, BUYER);
    sc.next_tx(BUYER);
    let owned = sc.take_from_sender<NftToken>();
    assert!(object::id(&owned) == token_id, 356);
    assert!(*string::as_bytes(model3d::nft_token_patch_id(&owned)) == b"patchId01", 357);
    destroy_nft_token_for_testing(owned);

    // personal_cap was taken from NFT_CREATOR; return it there (current sender
    // is now BUYER, so return_to_sender would abort ECantReturnObject).
    ts::return_to_address(NFT_CREATOR, personal_cap);
    destroy_collection_cap_for_testing(cap);
    destroy_collection_for_testing(collection);
    destroy_model_for_testing(model);
    ts::return_shared(kiosk);
    ts::return_shared(policy);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// A cap from a different collection cannot mint into this collection.
#[test]
#[expected_failure(abort_code = model3d::EWrongCollectionCap)]
fun mint_nft_token_with_mismatched_cap_aborts() {
    let second_creator: address = @0xBEEF;

    let mut sc = ts::begin(CREATOR);
    let (system, clk, model, policy, collection, cap) = nfttoken_bootstrap(&mut sc);

    // Launch a SECOND collection from the same base; its cap goes to second_creator.
    sc.next_tx(second_creator);
    launch_collection(&model, coin::mint_for_testing<SUI>(0, sc.ctx()), quilt(), sc.ctx());
    sc.next_tx(second_creator);
    let foreign_cap = sc.take_from_sender<NftCollectionCreatorCap>();

    sc.next_tx(NFT_CREATOR);
    // foreign_cap authorizes the second collection, NOT `collection` → abort.
    mint_nft_token(&foreign_cap, &collection, s(b"X"), patch(), sc.ctx());

    // Unreachable.
    destroy_collection_cap_for_testing(foreign_cap);
    destroy_collection_cap_for_testing(cap);
    destroy_collection_for_testing(collection);
    destroy_model_for_testing(model);
    ts::return_shared(policy);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// mint_nft_token enforces its own name length bound (ENameTooLong) — a 129-char
// name aborts. (Distinct code path from validate_publish_inputs.)
#[test]
#[expected_failure(abort_code = model3d::ENameTooLong)]
fun mint_nft_token_name_too_long_aborts() {
    let mut sc = ts::begin(CREATOR);
    let (system, clk, model, policy, collection, cap) = nfttoken_bootstrap(&mut sc);

    sc.next_tx(NFT_CREATOR);
    let long_name = repeat_byte(ASCII_A, 129); // MAX_NAME_LEN is 128
    mint_nft_token(&cap, &collection, long_name, patch(), sc.ctx());

    // Unreachable.
    destroy_collection_cap_for_testing(cap);
    destroy_collection_for_testing(collection);
    destroy_model_for_testing(model);
    ts::return_shared(policy);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// patch_id longer than MAX_PATCH_ID_LEN (128) aborts EPatchIdMalformed.
#[test]
#[expected_failure(abort_code = model3d::EPatchIdMalformed)]
fun mint_nft_token_patch_id_too_long_aborts() {
    let mut sc = ts::begin(CREATOR);
    let (system, clk, model, policy, collection, cap) = nfttoken_bootstrap(&mut sc);

    sc.next_tx(NFT_CREATOR);
    mint_nft_token(&cap, &collection, s(b"ok"), repeat_byte(ASCII_A, 129), sc.ctx());

    // Unreachable.
    destroy_collection_cap_for_testing(cap);
    destroy_collection_for_testing(collection);
    destroy_model_for_testing(model);
    ts::return_shared(policy);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// patch_id at exactly MAX_PATCH_ID_LEN (128) is accepted and carried on the
// minted token (boundary-accept companion to the 129-reject above).
#[test]
fun mint_nft_token_patch_id_at_128_accepts() {
    let mut sc = ts::begin(CREATOR);
    let (system, clk, model, policy, collection, cap) = nfttoken_bootstrap(&mut sc);

    sc.next_tx(NFT_CREATOR);
    mint_nft_token(&cap, &collection, s(b"ok"), repeat_byte(ASCII_A, 128), sc.ctx());

    sc.next_tx(NFT_CREATOR);
    let token = sc.take_from_sender<NftToken>();
    assert!(string::length(model3d::nft_token_patch_id(&token)) == 128, 391);
    destroy_nft_token_for_testing(token);

    destroy_collection_cap_for_testing(cap);
    destroy_collection_for_testing(collection);
    destroy_model_for_testing(model);
    ts::return_shared(policy);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// ensure_collection_policy rejects a Publisher from a different package
// (parity with ensure_transfer_policy's EWrongPublisher guard).
#[test]
#[expected_failure(abort_code = model3d::EWrongPublisher)]
fun ensure_collection_policy_aborts_on_foreign_publisher() {
    let mut sc = ts::begin(CREATOR);
    foreign_witness::init_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let foreign_publisher = sc.take_from_sender<Publisher>();
    // Aborts: from_package<NftToken>(&foreign_publisher) == false.
    ensure_collection_policy(&foreign_publisher, sc.ctx());
    sc.return_to_sender(foreign_publisher);
    sc.end();
}

// === D-029 U4 — register_integration (B2B integration registry) ===

// Launch a collection from a base model with the given license; nft_creator =
// NFT_CREATOR. No Publisher/init needed (register_integration is policy-free).
#[test_only]
fun launch_for_test(
    sc: &mut ts::Scenario,
    license: model3d::LicenseTerms,
): (system::System, clock::Clock, Model3D, NftCollection, NftCollectionCreatorCap) {
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let clk = clock::create_for_testing(sc.ctx());
    let model = mint_base_model(&mut system, &clk, license, sc.ctx());

    sc.next_tx(NFT_CREATOR);
    launch_collection(&model, coin::mint_for_testing<SUI>(0, sc.ctx()), quilt(), sc.ctx());
    sc.next_tx(NFT_CREATOR);
    let cap = sc.take_from_sender<NftCollectionCreatorCap>();
    let collection = ts::take_shared<NftCollection>(sc);
    (system, clk, model, collection, cap)
}

const APP_META: vector<u8> = b"{\"name\":\"TinyRacetrack\",\"url\":\"https://example.com\"}";

// Covers AE2 (happy half) + R16 emit: fee routed to nft_creator, change returned
// to integrator, record stored, IntegrationRegistered emitted with the pair.
#[test]
fun register_integration_routes_fee_records_and_emits() {
    let fee: u64 = 3_000_000;
    let extra: u64 = 1_000_000;

    let mut sc = ts::begin(CREATOR);
    let (system, clk, model, mut collection, cap) = launch_for_test(&mut sc, default_license());

    sc.next_tx(NFT_CREATOR);
    set_register_fee(&cap, &mut collection, fee);

    sc.next_tx(GAMEDEV);
    let payment = coin::mint_for_testing<SUI>(fee + extra, sc.ctx());
    register_integration(&mut collection, payment, APP_META, &clk, sc.ctx());

    // Registry holds the pair + the exact app_metadata bytes.
    assert!(model3d::collection_has_integration(&collection, GAMEDEV), 360);
    assert!(*model3d::collection_integration_app_metadata(&collection, GAMEDEV) == APP_META, 361);

    // Exactly one IntegrationRegistered, carrying (collection, integrator).
    let evs = event::events_by_type<model3d::IntegrationRegistered>();
    assert!(vector::length(&evs) == 1, 362);
    let e = vector::borrow(&evs, 0);
    assert!(model3d::integration_registered_collection_id(e) == object::id(&collection), 363);
    assert!(model3d::integration_registered_integrator(e) == GAMEDEV, 364);
    // Event timestamp matches the clock (same source as the stored record's).
    assert!(model3d::integration_registered_at_ms(e) == clk.timestamp_ms(), 367);

    // nft_creator received the fee; integrator got the change.
    sc.next_tx(NFT_CREATOR);
    let fee_coin = sc.take_from_sender<coin::Coin<SUI>>();
    assert!(coin::value(&fee_coin) == fee, 365);
    coin::burn_for_testing(fee_coin);
    sc.next_tx(GAMEDEV);
    let change = sc.take_from_sender<coin::Coin<SUI>>();
    assert!(coin::value(&change) == extra, 366);
    coin::burn_for_testing(change);

    remove_integration_for_testing(&mut collection, GAMEDEV);
    destroy_collection_cap_for_testing(cap);
    destroy_collection_for_testing(collection);
    destroy_model_for_testing(model);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// Exact-fee boundary (payment == register_fee) succeeds; zero change.
#[test]
fun register_integration_exact_fee_succeeds() {
    let fee: u64 = 2_500_000;

    let mut sc = ts::begin(CREATOR);
    let (system, clk, model, mut collection, cap) = launch_for_test(&mut sc, default_license());
    sc.next_tx(NFT_CREATOR);
    set_register_fee(&cap, &mut collection, fee);

    sc.next_tx(GAMEDEV);
    register_integration(&mut collection, coin::mint_for_testing<SUI>(fee, sc.ctx()), APP_META, &clk, sc.ctx());
    assert!(model3d::collection_has_integration(&collection, GAMEDEV), 370);

    remove_integration_for_testing(&mut collection, GAMEDEV);
    destroy_collection_cap_for_testing(cap);
    destroy_collection_for_testing(collection);
    destroy_model_for_testing(model);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// Covers AE2 (abort half): payment < register_fee aborts EFeeTooLow.
#[test]
#[expected_failure(abort_code = model3d::EFeeTooLow)]
fun register_integration_below_fee_aborts() {
    let fee: u64 = 5_000_000;

    let mut sc = ts::begin(CREATOR);
    let (system, clk, model, mut collection, cap) = launch_for_test(&mut sc, default_license());
    sc.next_tx(NFT_CREATOR);
    set_register_fee(&cap, &mut collection, fee);

    sc.next_tx(GAMEDEV);
    register_integration(&mut collection, coin::mint_for_testing<SUI>(fee - 1, sc.ctx()), APP_META, &clk, sc.ctx());

    // Unreachable.
    destroy_collection_cap_for_testing(cap);
    destroy_collection_for_testing(collection);
    destroy_model_for_testing(model);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// Covers AE3 (D-030): when the nft creator has CLOSED the collection
// (integration_policy = RESTRICTED), register_integration aborts
// EIntegrationsClosed and emits nothing (emit is after every assert).
#[test]
#[expected_failure(abort_code = model3d::EIntegrationsClosed)]
fun register_integration_when_closed_aborts() {
    let mut sc = ts::begin(CREATOR);
    let (system, clk, model, mut collection, cap) = launch_for_test(&mut sc, default_license());

    // nft creator closes the collection to integrations.
    sc.next_tx(NFT_CREATOR);
    set_integration_policy(&cap, &mut collection, policy_restricted());

    sc.next_tx(GAMEDEV);
    register_integration(&mut collection, coin::mint_for_testing<SUI>(0, sc.ctx()), APP_META, &clk, sc.ctx());

    // Unreachable.
    destroy_collection_cap_for_testing(cap);
    destroy_collection_for_testing(collection);
    destroy_model_for_testing(model);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// ALLOW_LIST is also non-permissionless → register_integration aborts
// EIntegrationsClosed (the gate is strictly == PERMISSIONLESS).
#[test]
#[expected_failure(abort_code = model3d::EIntegrationsClosed)]
fun register_integration_when_allow_list_aborts() {
    let mut sc = ts::begin(CREATOR);
    let (system, clk, model, mut collection, cap) = launch_for_test(&mut sc, default_license());

    sc.next_tx(NFT_CREATOR);
    set_integration_policy(&cap, &mut collection, policy_allow_list());

    sc.next_tx(GAMEDEV);
    register_integration(&mut collection, coin::mint_for_testing<SUI>(0, sc.ctx()), APP_META, &clk, sc.ctx());

    // Unreachable.
    destroy_collection_cap_for_testing(cap);
    destroy_collection_for_testing(collection);
    destroy_model_for_testing(model);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// Free integration (register_fee == 0, the default) with an overpaying coin:
// the whole payment is returned to the integrator (fee==0 → no split).
#[test]
fun register_integration_zero_fee_returns_overpayment() {
    let overpay: u64 = 750_000;

    let mut sc = ts::begin(CREATOR);
    let (system, clk, model, mut collection, cap) = launch_for_test(&mut sc, default_license());

    sc.next_tx(GAMEDEV);
    register_integration(&mut collection, coin::mint_for_testing<SUI>(overpay, sc.ctx()), APP_META, &clk, sc.ctx());
    assert!(model3d::collection_has_integration(&collection, GAMEDEV), 380);

    // fee==0 → the full overpayment comes back to GAMEDEV.
    sc.next_tx(GAMEDEV);
    let refund = sc.take_from_sender<coin::Coin<SUI>>();
    assert!(coin::value(&refund) == overpay, 381);
    coin::burn_for_testing(refund);

    remove_integration_for_testing(&mut collection, GAMEDEV);
    destroy_collection_cap_for_testing(cap);
    destroy_collection_for_testing(collection);
    destroy_model_for_testing(model);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// Covers AE5: the same integrator registering twice aborts EAlreadyRegistered.
#[test]
#[expected_failure(abort_code = model3d::EAlreadyRegistered)]
fun register_integration_duplicate_aborts() {
    let mut sc = ts::begin(CREATOR);
    let (system, clk, model, mut collection, cap) = launch_for_test(&mut sc, default_license());
    // register_fee stays 0 (free) — isolates the uniqueness gate.

    sc.next_tx(GAMEDEV);
    register_integration(&mut collection, coin::mint_for_testing<SUI>(0, sc.ctx()), APP_META, &clk, sc.ctx());

    sc.next_tx(GAMEDEV);
    register_integration(&mut collection, coin::mint_for_testing<SUI>(0, sc.ctx()), APP_META, &clk, sc.ctx());

    // Unreachable.
    remove_integration_for_testing(&mut collection, GAMEDEV);
    destroy_collection_cap_for_testing(cap);
    destroy_collection_for_testing(collection);
    destroy_model_for_testing(model);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// app_metadata longer than APP_METADATA_MAX (512) aborts EAppMetadataTooLong.
#[test]
#[expected_failure(abort_code = model3d::EAppMetadataTooLong)]
fun register_integration_metadata_too_long_aborts() {
    let mut sc = ts::begin(CREATOR);
    let (system, clk, model, mut collection, cap) = launch_for_test(&mut sc, default_license());

    sc.next_tx(GAMEDEV);
    // 513 bytes — one over the cap.
    let oversized = *string::as_bytes(&repeat_byte(ASCII_A, 513));
    register_integration(&mut collection, coin::mint_for_testing<SUI>(0, sc.ctx()), oversized, &clk, sc.ctx());

    // Unreachable.
    destroy_collection_cap_for_testing(cap);
    destroy_collection_for_testing(collection);
    destroy_model_for_testing(model);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// ===========================================================================
// D-074 / D-075 / D-076 — Seal content protection
// ===========================================================================

// A Seal identity correctly prefix-bound to mint_base_model's dummy seal_id
// (b"dummy-seal-id-01"). is_prefix(seal_id, this) holds.
fun valid_seal_id(): vector<u8> { b"dummy-seal-id-01--nonce--" }

// plan-027 — Build an ENCRYPTED ALLOW_LIST base (access_fee > 0) and have
// NFT_CREATOR buy access, returning (model, entitlement). model.seal_id ==
// b"dummy-seal-id-01"; the entitlement is held by NFT_CREATOR and bound to model.
// Consumes the access-fee coin routed to CREATOR. Leaves the caller in
// NFT_CREATOR's tx context (the entitlement holder). The seal_approve_entitlement
// tests consume this directly (no collection/cap needed — the gate is the
// entitlement alone).
#[test_only]
fun buy_access_encrypted_allow_list(
    sc: &mut ts::Scenario,
    system: &mut System,
    clk: &clock::Clock,
): (Model3D, model3d::AccessEntitlement) {
    // Mint the base as CREATOR (reset context — a prior fork may have left us in
    // NFT_CREATOR's tx, which would mis-set the new model's creator + fee route).
    sc.next_tx(CREATOR);
    let fee: u64 = 1_000_000;
    // derive_mint_fee = 0 (access_fee carries the value); fork_encrypted_allow_list
    // launches with a 0 coin, so the derive fee must be 0.
    let license = new_license_terms(policy_allow_list(), 0, 500, true, true, fee);
    let mut model = mint_base_model(system, clk, license, sc.ctx());

    sc.next_tx(NFT_CREATOR);
    model3d::purchase_access(&mut model, coin::mint_for_testing<SUI>(fee, sc.ctx()), sc.ctx());

    // CREATOR received the access fee — drain it so the inbox stays clean.
    sc.next_tx(CREATOR);
    let fee_coin = sc.take_from_sender<coin::Coin<SUI>>();
    coin::burn_for_testing(fee_coin);

    sc.next_tx(NFT_CREATOR);
    let entitlement = sc.take_from_sender<model3d::AccessEntitlement>();
    (model, entitlement)
}

// plan-027 — extends buy_access_encrypted_allow_list by launching the collection
// via the entitlement-gated entry, returning (model, collection, cap). The
// entitlement is consumed (destroyed) internally so existing collection-centric
// teardown is unchanged. Derive fee is 0 here (access_fee carried the value), so
// no extra fee coin is routed at launch. Leaves the caller in NFT_CREATOR's ctx.
#[test_only]
fun fork_encrypted_allow_list(
    sc: &mut ts::Scenario,
    system: &mut System,
    clk: &clock::Clock,
): (Model3D, NftCollection, NftCollectionCreatorCap) {
    let (model, entitlement) = buy_access_encrypted_allow_list(sc, system, clk);

    sc.next_tx(NFT_CREATOR);
    model3d::launch_collection_with_entitlement(
        &model, &entitlement, coin::mint_for_testing<SUI>(0, sc.ctx()), quilt(), sc.ctx());

    sc.next_tx(NFT_CREATOR);
    let cap = sc.take_from_sender<NftCollectionCreatorCap>();
    let collection = sc.take_shared<NftCollection>();
    model3d::destroy_entitlement_for_testing(entitlement);
    (model, collection, cap)
}

// === plan-027 — purchase_access ===

// AE1 — happy path: ALLOW_LIST base, pay >= access_fee → entitlement minted to
// the buyer (model_id binds, holder set), the fee routes to the base creator,
// AccessPurchased emitted. Buyer (NFT_CREATOR) != base creator (CREATOR).
#[test]
fun purchase_access_mints_entitlement_and_routes_fee() {
    let fee: u64 = 3_000_000;
    let extra: u64 = 1_000_000;
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let clk = clock::create_for_testing(sc.ctx());
    let license = new_license_terms(policy_allow_list(), 0, 500, true, true, fee);
    let mut model = mint_base_model(&mut system, &clk, license, sc.ctx());
    let model_id = object::id(&model);

    sc.next_tx(NFT_CREATOR);
    model3d::purchase_access(&mut model, coin::mint_for_testing<SUI>(fee + extra, sc.ctx()), sc.ctx());

    // Exactly one AccessPurchased, carrying (model_id, buyer, paid).
    let evs = event::events_by_type<model3d::AccessPurchased>();
    assert!(vector::length(&evs) == 1, 800);
    let e = vector::borrow(&evs, 0);
    assert!(model3d::access_purchased_model_id(e) == model_id, 801);
    assert!(model3d::access_purchased_buyer(e) == NFT_CREATOR, 802);
    assert!(model3d::access_purchased_paid(e) == fee, 803);

    // Base creator (CREATOR) received exactly the access fee.
    sc.next_tx(CREATOR);
    let fee_coin = sc.take_from_sender<coin::Coin<SUI>>();
    assert!(coin::value(&fee_coin) == fee, 804);
    coin::burn_for_testing(fee_coin);

    // Buyer (NFT_CREATOR) got the overpayment change + the soulbound entitlement.
    sc.next_tx(NFT_CREATOR);
    let change = sc.take_from_sender<coin::Coin<SUI>>();
    assert!(coin::value(&change) == extra, 805);
    coin::burn_for_testing(change);
    let entitlement = sc.take_from_sender<model3d::AccessEntitlement>();
    assert!(model3d::entitlement_model_id(&entitlement) == model_id, 806);
    assert!(model3d::entitlement_holder(&entitlement) == NFT_CREATOR, 807);
    // Soulbound proof is compile-time: `transfer::public_transfer(entitlement, …)`
    // here would NOT compile because AccessEntitlement lacks `store`.
    assert!(model3d::access_purchased_entitlement_id(e) == object::id(&entitlement), 808);

    model3d::destroy_entitlement_for_testing(entitlement);
    destroy_model_for_testing(model);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// purchase_access underpay → EInsufficientAccessFee.
#[test, expected_failure(abort_code = model3d::EInsufficientAccessFee)]
fun purchase_access_underpay_aborts() {
    let fee: u64 = 2_000_000;
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let clk = clock::create_for_testing(sc.ctx());
    let license = new_license_terms(policy_allow_list(), 0, 500, true, true, fee);
    let mut model = mint_base_model(&mut system, &clk, license, sc.ctx());

    sc.next_tx(NFT_CREATOR);
    model3d::purchase_access(&mut model, coin::mint_for_testing<SUI>(fee - 1, sc.ctx()), sc.ctx());

    destroy_model_for_testing(model);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// purchase_access exact-pay → no leftover change coin (destroy_zero path).
#[test]
fun purchase_access_exact_pay_no_change() {
    let fee: u64 = 1_500_000;
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let clk = clock::create_for_testing(sc.ctx());
    let license = new_license_terms(policy_allow_list(), 0, 500, true, true, fee);
    let mut model = mint_base_model(&mut system, &clk, license, sc.ctx());

    sc.next_tx(NFT_CREATOR);
    model3d::purchase_access(&mut model, coin::mint_for_testing<SUI>(fee, sc.ctx()), sc.ctx());

    // Creator got the fee.
    sc.next_tx(CREATOR);
    let fee_coin = sc.take_from_sender<coin::Coin<SUI>>();
    assert!(coin::value(&fee_coin) == fee, 810);
    coin::burn_for_testing(fee_coin);

    // No change coin for the buyer (remainder was destroy_zero'd) — only the entitlement.
    sc.next_tx(NFT_CREATOR);
    assert!(!ts::has_most_recent_for_sender<coin::Coin<SUI>>(&sc), 811);
    let entitlement = sc.take_from_sender<model3d::AccessEntitlement>();

    model3d::destroy_entitlement_for_testing(entitlement);
    destroy_model_for_testing(model);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// purchase_access twice by the same wallet on the same model → 2nd aborts
// EAlreadyHasEntitlement (the duplicate-purchase guard / AE1 reinforcement).
#[test, expected_failure(abort_code = model3d::EAlreadyHasEntitlement)]
fun purchase_access_twice_same_wallet_aborts() {
    let fee: u64 = 1_000_000;
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let clk = clock::create_for_testing(sc.ctx());
    let license = new_license_terms(policy_allow_list(), 0, 500, true, true, fee);
    let mut model = mint_base_model(&mut system, &clk, license, sc.ctx());

    sc.next_tx(NFT_CREATOR);
    model3d::purchase_access(&mut model, coin::mint_for_testing<SUI>(fee, sc.ctx()), sc.ctx());

    // Same wallet, same model → second purchase aborts.
    sc.next_tx(NFT_CREATOR);
    model3d::purchase_access(&mut model, coin::mint_for_testing<SUI>(fee, sc.ctx()), sc.ctx());

    destroy_model_for_testing(model);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// AE6 — purchase_access on a RESTRICTED base aborts ENotPurchasable.
#[test, expected_failure(abort_code = model3d::ENotPurchasable)]
fun purchase_access_on_restricted_aborts() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let clk = clock::create_for_testing(sc.ctx());
    let mut model = mint_base_model(
        &mut system, &clk, new_license_terms(policy_restricted(), 0, 500, true, true, 0), sc.ctx());

    sc.next_tx(NFT_CREATOR);
    model3d::purchase_access(&mut model, coin::mint_for_testing<SUI>(0, sc.ctx()), sc.ctx());

    destroy_model_for_testing(model);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// AE6 — purchase_access on a PERMISSIONLESS base aborts ENotPurchasable.
#[test, expected_failure(abort_code = model3d::ENotPurchasable)]
fun purchase_access_on_permissionless_aborts() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let clk = clock::create_for_testing(sc.ctx());
    let mut model = mint_base_model(&mut system, &clk, default_license(), sc.ctx());

    sc.next_tx(NFT_CREATOR);
    model3d::purchase_access(&mut model, coin::mint_for_testing<SUI>(0, sc.ctx()), sc.ctx());

    destroy_model_for_testing(model);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// R1 / AE4 — is_encrypted is DERIVED from policy (not a caller arg), fixed at
// publish; seal fields present iff encrypted; seal_version stamped.
#[test]
fun encryption_derived_from_policy() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let clk = clock::create_for_testing(sc.ctx());

    let m_open = mint_base_model(&mut system, &clk, default_license(), sc.ctx());
    assert!(!model3d::is_encrypted(&m_open), 600);
    assert!(vector::is_empty(model3d::sealed_key(&m_open)), 601);
    assert!(vector::is_empty(model3d::seal_id(&m_open)), 602);
    assert!(model3d::seal_version(&m_open) == 2, 603); // plan-027 — VERSION bumped 1→2

    let m_restr = mint_base_model(
        &mut system, &clk, new_license_terms(policy_restricted(), 0, 500, true, true, 0), sc.ctx());
    assert!(model3d::is_encrypted(&m_restr), 604);
    assert!(!vector::is_empty(model3d::sealed_key(&m_restr)), 605);
    assert!(!vector::is_empty(model3d::seal_id(&m_restr)), 606);

    let m_allow = mint_base_model(
        &mut system, &clk, new_license_terms(policy_allow_list(), 1_000_000, 500, true, true, 1_000_000), sc.ctx());
    assert!(model3d::is_encrypted(&m_allow), 607);

    destroy_model_for_testing(m_open);
    destroy_model_for_testing(m_restr);
    destroy_model_for_testing(m_allow);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// plan-027 (AE2, amends D-076) — ALLOW_LIST publish with access_fee == 0 aborts
// EAllowListNeedsFee (the fee gate moved derive→access). derive_fee is non-zero
// here to prove the abort is attributable to access_fee, not derive_fee.
#[test, expected_failure(abort_code = model3d::EAllowListNeedsFee)]
fun allow_list_zero_access_fee_aborts() {
    let lic = new_license_terms(policy_allow_list(), 1_000_000, 500, true, true, 0);
    let sk = b"k"; let sid = b"id"; let pv = vector<string::String>[];
    model3d::validate_seal_publish(&sk, &sid, &pv, &lic);
}

// plan-027 (AE2) — ALLOW_LIST with a positive access_fee AND a ZERO derive_fee
// validates (derive fee may now be 0; only access_fee gates publish).
#[test]
fun allow_list_positive_access_fee_zero_derive_validates() {
    let lic = new_license_terms(policy_allow_list(), 0, 500, true, true, 1);
    let sk = b"k"; let sid = b"id"; let pv = vector<string::String>[];
    model3d::validate_seal_publish(&sk, &sid, &pv, &lic);
}

// D-075 — the unencrypted `publish` entry with a non-PERMISSIONLESS license is
// rejected by the policy<->field consistency guard (is_encrypted derived true, but
// no seal fields). Forces encrypted policies through `publish_encrypted`.
#[test, expected_failure(abort_code = model3d::ESealFieldsInconsistent)]
fun publish_entry_with_restricted_policy_aborts() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let clk = clock::create_for_testing(sc.ctx());
    let b = mint_blob(&mut system, sc.ctx());
    publish(
        b, s(b"car"), s(b"{}"), s(b"X"), empty_tags(), s(b"lin"), s(b"glb"),
        empty_part_labels(), new_license_terms(policy_restricted(), 0, 500, true, true, 0),
        &clk, sc.ctx(),
    );
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// D-075 — `publish_encrypted` with a PERMISSIONLESS license aborts.
#[test, expected_failure(abort_code = model3d::ENotEncryptedPolicy)]
fun publish_encrypted_permissionless_aborts() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let clk = clock::create_for_testing(sc.ctx());
    let mut registry = model3d::new_seal_id_registry_for_testing(sc.ctx());
    let b = mint_blob(&mut system, sc.ctx());
    model3d::publish_encrypted(
        &mut registry, b, s(b"car"), s(b"{}"), s(b"X"), empty_tags(), s(b"lin"), s(b"glb"),
        empty_part_labels(), b"key", b"sid", vector<string::String>[],
        default_license(), &clk, sc.ctx(),
    );
    model3d::destroy_seal_id_registry_for_testing(registry);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// D-075 — `publish_encrypted` records the seal fields on the shared model and the
// seal_id in the registry.
#[test]
fun publish_encrypted_records_seal_fields() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let clk = clock::create_for_testing(sc.ctx());
    let mut registry = model3d::new_seal_id_registry_for_testing(sc.ctx());
    let b = mint_blob(&mut system, sc.ctx());
    model3d::publish_encrypted(
        &mut registry, b, s(b"car"), s(b"{}"), s(b"A"), empty_tags(), s(b"lin"), s(b"glbA"),
        empty_part_labels(), b"keybytes", b"unique-seal-id-1", vector<string::String>[],
        new_license_terms(policy_restricted(), 0, 500, true, true, 0), &clk, sc.ctx(),
    );

    sc.next_tx(CREATOR);
    let m = sc.take_shared<Model3D>();
    assert!(model3d::is_encrypted(&m), 610);
    assert!(*model3d::seal_id(&m) == b"unique-seal-id-1", 611);
    assert!(*model3d::sealed_key(&m) == b"keybytes", 612);
    assert!(model3d::seal_version(&m) == 2, 613); // plan-027 — VERSION bumped 1→2
    ts::return_shared(m);

    model3d::destroy_seal_id_registry_for_testing(registry);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// D-075 Resolution G — a duplicate seal_id is rejected by the registry (the
// copy-attack defense).
#[test, expected_failure(abort_code = model3d::ESealIdReused)]
fun publish_encrypted_duplicate_seal_id_aborts() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let clk = clock::create_for_testing(sc.ctx());
    let mut registry = model3d::new_seal_id_registry_for_testing(sc.ctx());

    let b1 = mint_blob(&mut system, sc.ctx());
    model3d::publish_encrypted(
        &mut registry, b1, s(b"car"), s(b"{}"), s(b"A"), empty_tags(), s(b"lin"), s(b"glbA"),
        empty_part_labels(), b"k1", b"dup-seal-id", vector<string::String>[],
        new_license_terms(policy_restricted(), 0, 500, true, true, 0), &clk, sc.ctx(),
    );

    sc.next_tx(CREATOR);
    let b2 = mint_blob(&mut system, sc.ctx());
    // Same seal_id -> aborts ESealIdReused.
    model3d::publish_encrypted(
        &mut registry, b2, s(b"car"), s(b"{}"), s(b"B"), empty_tags(), s(b"lin"), s(b"glbB"),
        empty_part_labels(), b"k2", b"dup-seal-id", vector<string::String>[],
        new_license_terms(policy_restricted(), 0, 500, true, true, 0), &clk, sc.ctx(),
    );

    model3d::destroy_seal_id_registry_for_testing(registry);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// plan-027 (AE3) — seal_approve_entitlement passes when holder + model + prefix +
// version all hold. The current tx sender is NFT_CREATOR (the entitlement holder,
// per the helper), so ctx.sender() == entitlement.holder.
#[test]
fun seal_approve_entitlement_passes_when_all_hold() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let clk = clock::create_for_testing(sc.ctx());
    let (model, entitlement) = buy_access_encrypted_allow_list(&mut sc, &mut system, &clk);

    // Sender is NFT_CREATOR == entitlement.holder.
    model3d::seal_approve_entitlement_for_testing(valid_seal_id(), &entitlement, &model, sc.ctx());

    model3d::destroy_entitlement_for_testing(entitlement);
    destroy_model_for_testing(model);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// plan-027 isolation #1 — only entitlement.model_id mismatches (entitlement is
// for m1, but the passed model is m2).
#[test, expected_failure(abort_code = model3d::EEntitlementModelMismatch)]
fun seal_approve_entitlement_aborts_on_model_mismatch() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let clk = clock::create_for_testing(sc.ctx());
    let (m1, ent1) = buy_access_encrypted_allow_list(&mut sc, &mut system, &clk);
    // A second ALLOW_LIST base with the SAME dummy seal_id prefix (so the abort
    // is attributable to the model_id check, not the prefix check).
    let m2 = mint_base_model(
        &mut system, &clk, new_license_terms(policy_allow_list(), 1, 500, true, true, 1), sc.ctx());

    sc.next_tx(NFT_CREATOR);
    // ent1 is bound to m1, not m2.
    model3d::seal_approve_entitlement_for_testing(valid_seal_id(), &ent1, &m2, sc.ctx());

    model3d::destroy_entitlement_for_testing(ent1);
    destroy_model_for_testing(m1);
    destroy_model_for_testing(m2);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// plan-027 isolation #2 — only the sender is not the entitlement holder.
#[test, expected_failure(abort_code = model3d::ENotEntitlementHolder)]
fun seal_approve_entitlement_aborts_on_non_holder() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let clk = clock::create_for_testing(sc.ctx());
    let (model, entitlement) = buy_access_encrypted_allow_list(&mut sc, &mut system, &clk);

    // Switch sender away from the holder (NFT_CREATOR) to CREATOR.
    sc.next_tx(CREATOR);
    model3d::seal_approve_entitlement_for_testing(valid_seal_id(), &entitlement, &model, sc.ctx());

    model3d::destroy_entitlement_for_testing(entitlement);
    destroy_model_for_testing(model);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// plan-027 isolation #3 — only the Seal id prefix mismatches.
#[test, expected_failure(abort_code = model3d::EIdPrefixMismatch)]
fun seal_approve_entitlement_aborts_on_id_prefix_mismatch() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let clk = clock::create_for_testing(sc.ctx());
    let (model, entitlement) = buy_access_encrypted_allow_list(&mut sc, &mut system, &clk);

    // id not prefixed by model.seal_id (b"dummy-seal-id-01"). Sender is still the holder.
    model3d::seal_approve_entitlement_for_testing(b"WRONG-prefix-bytes", &entitlement, &model, sc.ctx());

    model3d::destroy_entitlement_for_testing(entitlement);
    destroy_model_for_testing(model);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// plan-027 — seal_version tripwire: a model whose stored version != VERSION is denied.
#[test, expected_failure(abort_code = model3d::ESealVersionMismatch)]
fun seal_approve_entitlement_aborts_on_version_mismatch() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let clk = clock::create_for_testing(sc.ctx());
    let (mut model, entitlement) = buy_access_encrypted_allow_list(&mut sc, &mut system, &clk);

    // Force a stale version (VERSION is now 2; 99 != VERSION).
    model3d::set_seal_version_for_testing(&mut model, 99);
    model3d::seal_approve_entitlement_for_testing(valid_seal_id(), &entitlement, &model, sc.ctx());

    model3d::destroy_entitlement_for_testing(entitlement);
    destroy_model_for_testing(model);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// AE3 — seal_approve_creator passes for the base creator, aborts for anyone else.
#[test]
fun seal_approve_creator_passes_for_creator() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let clk = clock::create_for_testing(sc.ctx());
    let model = mint_base_model(
        &mut system, &clk, new_license_terms(policy_restricted(), 0, 500, true, true, 0), sc.ctx());

    // Current tx sender is CREATOR == model.creator.
    model3d::seal_approve_creator_for_testing(valid_seal_id(), &model, sc.ctx());

    destroy_model_for_testing(model);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

#[test, expected_failure(abort_code = model3d::ENotBaseCreator)]
fun seal_approve_creator_aborts_for_non_creator() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let clk = clock::create_for_testing(sc.ctx());
    let model = mint_base_model(
        &mut system, &clk, new_license_terms(policy_restricted(), 0, 500, true, true, 0), sc.ctx());

    sc.next_tx(NFT_CREATOR);
    model3d::seal_approve_creator_for_testing(valid_seal_id(), &model, sc.ctx());

    destroy_model_for_testing(model);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// D-076 — step 3 of the encrypted fork: mint_tokens sets the (post-bake) quilt and
// batch-mints the fleet to the cap holder in one tx.
#[test]
fun mint_tokens_sets_quilt_and_batch_mints() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let clk = clock::create_for_testing(sc.ctx());
    let (model, mut collection, cap) = fork_encrypted_allow_list(&mut sc, &mut system, &clk);

    sc.next_tx(NFT_CREATOR);
    model3d::mint_tokens(
        &cap, &mut collection, s(b"bakedQuiltId"),
        str_vec(b"t", 2), str_vec(b"p", 2), sc.ctx());

    assert!(*string::as_bytes(model3d::collection_quilt_blob_id(&collection)) == b"bakedQuiltId", 620);

    sc.next_tx(NFT_CREATOR);
    let t1 = sc.take_from_sender<NftToken>();
    let t2 = sc.take_from_sender<NftToken>();
    assert!(model3d::nft_token_collection_id(&t1) == object::id(&collection), 621);
    destroy_nft_token_for_testing(t1);
    destroy_nft_token_for_testing(t2);

    destroy_collection_cap_for_testing(cap);
    destroy_collection_for_testing(collection);
    destroy_model_for_testing(model);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

