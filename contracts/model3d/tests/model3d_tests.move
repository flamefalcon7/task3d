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
    register_integration,
    destroy_collection_for_testing,
    destroy_collection_cap_for_testing,
    destroy_nft_token_for_testing,
    remove_integration_for_testing,
};

const GAMEDEV: address = @0x6A3E;

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
    new_license_terms(policy_permissionless(), 0, 500, true, true)
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
        false,
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
        false,
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
    validate_publish_inputs(&s(b""), &s(b""), &empty_tags(), &s(b""), &default_license());
}

#[test]
fun validate_inputs_happy_ten_tags() {
    validate_publish_inputs(
        &s(b"{\"x\":1}"),
        &s(b"sword"),
        &make_tags(10),
        &s(b"abc123"),
        &default_license(),
    );
}

#[test, expected_failure(abort_code = model3d::ERoyaltyTooHigh)]
fun validate_inputs_rejects_royalty_over_cap() {
    let bad = new_license_terms(policy_permissionless(), 0, max_derivative_royalty_bps() + 1, true, true);
    validate_publish_inputs(&s(b""), &s(b""), &empty_tags(), &s(b""), &bad);
}

#[test]
fun validate_inputs_accepts_royalty_at_cap() {
    let edge = new_license_terms(policy_permissionless(), 0, max_derivative_royalty_bps(), true, true);
    validate_publish_inputs(&s(b""), &s(b""), &empty_tags(), &s(b""), &edge);
}

#[test, expected_failure(abort_code = model3d::ETooManyTags)]
fun validate_inputs_rejects_17_tags() {
    validate_publish_inputs(&s(b""), &s(b""), &make_tags(17), &s(b""), &default_license());
}

#[test]
fun validate_inputs_accepts_16_tags() {
    validate_publish_inputs(&s(b""), &s(b""), &make_tags(16), &s(b""), &default_license());
}

#[test, expected_failure(abort_code = model3d::ETagTooLong)]
fun validate_inputs_rejects_tag_33_chars() {
    let mut tags = empty_tags();
    vector::push_back(&mut tags, repeat_byte(ASCII_A, 33));
    validate_publish_inputs(&s(b""), &s(b""), &tags, &s(b""), &default_license());
}

#[test]
fun validate_inputs_accepts_tag_32_chars() {
    let mut tags = empty_tags();
    vector::push_back(&mut tags, repeat_byte(ASCII_A, 32));
    validate_publish_inputs(&s(b""), &s(b""), &tags, &s(b""), &default_license());
}

#[test, expected_failure(abort_code = model3d::EParamsJsonTooLong)]
fun validate_inputs_rejects_params_json_4097() {
    validate_publish_inputs(
        &repeat_byte(ASCII_X, 4097),
        &s(b""),
        &empty_tags(),
        &s(b""),
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
        false,
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
    new_model(
        b,
        s(b"car"),
        s(b"{\"variant\":1}"),
        s(b"BaseCar"),
        make_tags(1),
        s(b"lineageBlobBase"),
        false,
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
    let license = new_license_terms(policy_permissionless(), fee, 500, true, true);
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
    // Base model is RESTRICTED at the L1 license — proving the collection's
    // integration_policy does NOT inherit it (defaults open regardless).
    let license = new_license_terms(policy_restricted(), 0, 0, false, false);
    let model = mint_base_model(&mut system, &clk, license, sc.ctx());

    sc.next_tx(NFT_CREATOR);
    launch_collection(&model, coin::mint_for_testing<SUI>(0, sc.ctx()), quilt(), sc.ctx());

    sc.next_tx(NFT_CREATOR);
    let cap = sc.take_from_sender<NftCollectionCreatorCap>();
    let mut collection = sc.take_shared<NftCollection>();
    // Default open, even though the base model is restricted.
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
    let license = new_license_terms(policy_permissionless(), 1_000_000, 500, true, true);
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
    let license = new_license_terms(policy_permissionless(), fee, 500, true, true);
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
    assert!(sui::vec_set::size(tp::rules<NftToken>(&policy)) == 1, 380);
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

// D-036 — resale of an NftToken now runs the ROYALTY-ONLY chain: the creator
// opt-in places+lists the owned token in their PersonalKiosk (a separate step
// from mint), the buyer purchases, pays royalty, confirms, and TAKES the token
// out (no lock rule → no re-lock required). Self-purchase keeps the Kiosk
// reference unambiguous.
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

    // Buyer purchases the listed NftToken with an exact-price payment.
    sc.next_tx(NFT_CREATOR);
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

    // No lock rule → the buyer holds the token directly (took it out of the sale).
    destroy_nft_token_for_testing(item);

    sc.return_to_sender(personal_cap);
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

