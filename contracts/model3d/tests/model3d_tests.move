#[test_only]
#[allow(deprecated_usage)]
module model3d::model3d_tests;

use std::string;
use sui::clock;
use sui::event;
use sui::package::{Self as pkg, Publisher};
use sui::test_scenario as ts;
use sui::transfer_policy::{Self as tp, TransferPolicy, TransferPolicyCap};
use sui::tx_context;
use walrus::blob::{Self, Blob};
use walrus::encoding;
use walrus::storage_resource::Storage;
use walrus::system::{Self, System};
use wal::wal::WAL;
use sui::coin;
use kiosk::royalty_rule::{Self, Rule as RoyaltyRule};
use kiosk::kiosk_lock_rule::Rule as LockRule;
use kiosk::personal_kiosk_rule::Rule as PersonalKioskRule;
use foreign_witness::foreign_witness;
use model3d::model3d::{
    Self,
    Model3D,
    new_license_terms,
    policy_permissionless,
    policy_restricted,
    max_derivative_royalty_bps,
    amount_bp_default,
    min_royalty_amount_mist,
    validate_publish_inputs,
    new_model,
    destroy_model_for_testing,
    init_for_testing,
    ensure_transfer_policy,
    emit_royalty_paid,
};

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

// === RoyaltyPaid event: compiles + emits with expected fields ===
//
// U4 will emit this from `purchase_with_kiosk` after the RoyaltyRule pays
// the creator. U2's responsibility is the struct definition; U8's overlay
// joins on `tx_digest` (per U1.f spike — option (a), byte-equal to off-chain
// digest). This test proves the field shape compiles and the emit path works.

#[test]
fun royalty_paid_event_can_be_emitted_with_expected_fields() {
    let mut sc = ts::begin(CREATOR);
    sc.next_tx(CREATOR);

    let model_id = object::id_from_address(@0xDEAD);
    let kiosk_id = object::id_from_address(@0xCAFE);
    let expected_digest: vector<u8> = *tx_context::digest(sc.ctx());

    emit_royalty_paid(
        @0xBABE,    // buyer
        CREATOR,    // creator
        1_000_000,  // amount
        model_id,
        kiosk_id,
        500,        // royalty_bps (5%)
        sc.ctx(),
    );

    // event::num_events() returns count of events emitted in the current tx
    // scope. Must check BEFORE advancing to the next tx — the per-tx event
    // buffer is consumed at tx boundary.
    assert!(event::num_events() == 1, 200);

    // Plan-007 U2 review: assert each field byte-for-byte, especially
    // tx_digest. emit_royalty_paid captures the digest internally via
    // `tx_context::digest(ctx)`; the emitted event MUST carry the exact
    // bytes from the SAME ctx. U8's frontend filter joins on this exact
    // payload (after base58/base64 normalization).
    let events = event::events_by_type<model3d::RoyaltyPaid>();
    assert!(vector::length(&events) == 1, 201);
    let e = vector::borrow(&events, 0);
    assert!(model3d::royalty_paid_buyer(e) == @0xBABE, 202);
    assert!(model3d::royalty_paid_creator(e) == CREATOR, 203);
    assert!(model3d::royalty_paid_amount(e) == 1_000_000, 204);
    assert!(model3d::royalty_paid_model_id(e) == model_id, 205);
    assert!(model3d::royalty_paid_kiosk_id(e) == kiosk_id, 206);
    assert!(model3d::royalty_paid_royalty_bps(e) == 500, 207);
    assert!(model3d::royalty_paid_tx_digest(e) == expected_digest, 208);

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

// === Phase 4 U3 — TransferPolicy bootstrap ===
//
// `ensure_transfer_policy` creates `TransferPolicy<Model3D>`, attaches the
// three built-in rules (RoyaltyRule + LockRule + PersonalKioskRule), shares
// the policy, and returns the Cap to the caller. The R12 capture
// `transfer-policy-before-place.md` documents the rules-before-share-before-
// place ordering invariant.

// EWrongPublisher abort coverage (3 layers, complementary):
//   - `ensure_transfer_policy_succeeds_*` (positive happy path)
//   - `from_package_check_rejects_foreign_type` (pkg-discrimination sanity)
//   - `ensure_transfer_policy_aborts_on_foreign_publisher` (true e2e abort
//     via the `foreign_witness` dev-dep sibling Move package). The third
//     test closes the gap flagged in plan-007 U3 review (correctness +
//     testing + adversarial 3-hit P1).

// Happy path: correct Publisher → policy shared, Cap returned, three rules
// attached.
#[test]
fun ensure_transfer_policy_succeeds_with_correct_publisher_and_attaches_three_rules() {
    let mut sc = ts::begin(CREATOR);
    init_for_testing(sc.ctx());
    sc.next_tx(CREATOR);

    // init transferred Publisher to CREATOR; take it out of the inbox.
    let publisher = sc.take_from_sender<Publisher>();
    ensure_transfer_policy(&publisher, sc.ctx());
    sc.return_to_sender(publisher);

    // Cross tx boundary so the shared TransferPolicy and transferred Cap
    // both surface to the next tx's takers.
    sc.next_tx(CREATOR);

    // (a) Policy is a shared object — take_shared must find exactly one.
    let policy = ts::take_shared<TransferPolicy<Model3D>>(&sc);

    // (b) All three rules attached. `has_rule` introspects the policy's
    // `rules: VecSet<TypeName>`; witness types are Move-VM-distinct even
    // though all three are named `Rule` (different containing modules).
    assert!(tp::has_rule<Model3D, RoyaltyRule>(&policy), 401);
    assert!(tp::has_rule<Model3D, LockRule>(&policy), 402);
    assert!(tp::has_rule<Model3D, PersonalKioskRule>(&policy), 403);

    // (c) Cap was transferred to the caller (CREATOR == ctx.sender()).
    let cap = sc.take_from_sender<TransferPolicyCap<Model3D>>();
    sc.return_to_sender(cap);

    ts::return_shared(policy);
    sc.end();
}

// Pins the package-discrimination semantics of the `EWrongPublisher`
// guard. `pkg::from_package<T>(publisher)` returns true only when `T`'s
// package matches the Publisher's package. The legitimate `model3d`
// Publisher must reject `sui::sui::SUI` (sui-framework package) when asked.
// Composed with the happy-path test above (which proves the positive
// branch reaches share + transfer), this fully constrains the assertion.
#[test]
fun from_package_check_rejects_foreign_type() {
    let mut sc = ts::begin(CREATOR);
    init_for_testing(sc.ctx());
    sc.next_tx(CREATOR);

    let publisher = sc.take_from_sender<Publisher>();
    // True branch — sanity: Model3D lives in the same package as the
    // Publisher we just minted.
    assert!(pkg::from_package<Model3D>(&publisher), 410);
    // False branch — Wrong package (sui framework). Mirrors the negative
    // case `ensure_transfer_policy` aborts on.
    assert!(!pkg::from_package<sui::sui::SUI>(&publisher), 411);

    sc.return_to_sender(publisher);
    sc.end();
}

// True end-to-end EWrongPublisher abort, via a Publisher claimed under the
// foreign_witness dev-dep package (different package address than model3d).
// Plan-007 U3 review (correctness + testing + adversarial 3-hit P1).
#[test, expected_failure(abort_code = model3d::EWrongPublisher)]
fun ensure_transfer_policy_aborts_on_foreign_publisher() {
    let mut sc = ts::begin(CREATOR);
    foreign_witness::init_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let foreign_publisher = sc.take_from_sender<Publisher>();
    // Aborts here: from_package<Model3D>(&foreign_publisher) == false.
    ensure_transfer_policy(&foreign_publisher, sc.ctx());
    // Unreachable — function aborts above. Lines below silence linter.
    sc.return_to_sender(foreign_publisher);
    sc.end();
}

// Royalty rule's Config (bps + min_amount) is not directly readable from
// outside the `kiosk::royalty_rule` module (no public accessor on Config).
// Instead, pin both values through the public `fee_amount<T>(policy, paid)`
// helper that implements the rule's floor math:
//   royalty_owed = max(price * amount_bp / 10_000, min_amount)
// A regression that swapped the two args at `royalty_rule::add` call site
// (e.g., passed MIN_ROYALTY_AMOUNT_MIST as bps) would silently pass the
// has_rule check; this test breaks it.
#[test]
fun royalty_rule_config_pinned_via_fee_amount() {
    let mut sc = ts::begin(CREATOR);
    init_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let publisher = sc.take_from_sender<Publisher>();
    ensure_transfer_policy(&publisher, sc.ctx());
    sc.return_to_sender(publisher);
    sc.next_tx(CREATOR);
    let policy = ts::take_shared<TransferPolicy<Model3D>>(&sc);

    // 1 SUI price → 500 bps × 1_000_000_000 mist = 50_000_000 mist owed.
    // Well above the 1_000_000 mist floor; this pins amount_bp == 500.
    assert!(royalty_rule::fee_amount<Model3D>(&policy, 1_000_000_000) == 50_000_000, 420);
    // 0-price listing → bps math returns 0 → floor 1_000_000 kicks in.
    // Pins min_amount == 1_000_000.
    assert!(royalty_rule::fee_amount<Model3D>(&policy, 0) == 1_000_000, 421);

    ts::return_shared(policy);
    let cap = sc.take_from_sender<TransferPolicyCap<Model3D>>();
    sc.return_to_sender(cap);
    sc.end();
}

// Documents current behavior: `ensure_transfer_policy` is NOT idempotent.
// A second invocation with the same Publisher creates a SECOND shared
// TransferPolicy<Model3D> + a SECOND Cap. Per plan-007 U3 review, the
// production guarantee that only one policy exists is enforced externally
// by U13's deploy script (pins policy_id in networks/{net}.json and refuses
// to re-call if populated). This test pins the contract-level behavior so a
// future change to add an internal sentinel guard would surface as a test
// failure rather than silently changing semantics.
#[test]
fun ensure_transfer_policy_called_twice_creates_two_distinct_caps() {
    let mut sc = ts::begin(CREATOR);
    init_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let publisher = sc.take_from_sender<Publisher>();

    ensure_transfer_policy(&publisher, sc.ctx());
    sc.next_tx(CREATOR);
    let cap1 = sc.take_from_sender<TransferPolicyCap<Model3D>>();

    ensure_transfer_policy(&publisher, sc.ctx());
    sc.next_tx(CREATOR);
    let cap2 = sc.take_from_sender<TransferPolicyCap<Model3D>>();

    // Two distinct Caps → two distinct shared policies of the same type T.
    assert!(object::id(&cap1) != object::id(&cap2), 430);

    sc.return_to_sender(cap1);
    sc.return_to_sender(cap2);
    sc.return_to_sender(publisher);
    sc.end();
}

