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
use sui::sui::SUI;
use sui::kiosk::{Self, Kiosk, KioskOwnerCap};
use kiosk::royalty_rule::{Self, Rule as RoyaltyRule};
use kiosk::kiosk_lock_rule;
use kiosk::kiosk_lock_rule::Rule as LockRule;
use kiosk::personal_kiosk;
use kiosk::personal_kiosk::PersonalKioskCap;
use kiosk::personal_kiosk_rule;
use kiosk::personal_kiosk_rule::Rule as PersonalKioskRule;
use foreign_witness::foreign_witness;
use model3d::model3d::{
    Self,
    Model3D,
    NftCollection,
    NftCollectionCreatorCap,
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
    ensure_creator_kiosk,
    mint_and_list,
    purchase_with_kiosk,
    launch_collection,
    destroy_collection_for_testing,
    destroy_collection_cap_for_testing,
};

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

// === Phase 4 U4 — `ensure_creator_kiosk`, `mint_and_list`, `purchase_with_kiosk` ===
//
// Plan-007 U4 implements three new entry functions on top of U2/U3:
//
//   - `ensure_creator_kiosk(ctx)` — first-time creator helper that constructs
//     a fresh Kiosk + PersonalKioskCap (via `kiosk::personal_kiosk::new`),
//     shares the Kiosk, and transfers the PersonalKioskCap to the caller.
//     The PersonalKioskCap is `key`-only (soulbound) so the Kiosk owner is
//     pinned at the wrapping moment (satisfies `personal_kiosk_rule` for
//     every future buyer who lands a Model3D in this Kiosk).
//
//   - `mint_and_list(...)` — flat 13-param entry fn that (a) constructs a
//     Model3D via `new_model` (already emits `ModelPublished` + transfers
//     the Blob to ctx.sender()), (b) `kiosk::place`s the Model3D into the
//     creator's PersonalKiosk, and (c) `kiosk::list`s it at the given price.
//     The atomicity contract: exactly one `ModelPublished` + one
//     `kiosk::ItemListed<Model3D>` event per call. R3 / AE1.
//
//   - `purchase_with_kiosk(kiosk, policy, model_id, payment, ctx)` — wraps
//     `kiosk::purchase` and emits the `RoyaltyPaid` event using
//     `royalty_rule::fee_amount<Model3D>(policy, price)` to compute the
//     royalty (the rule's `pay` step happens later in the buyer's PTB chain;
//     this fn ONLY captures the amount for the event). Returns the hot
//     potato `TransferRequest<Model3D>` — if the caller's PTB skips
//     `confirm_request`, the tx aborts. R5 / AE2.
//
// Test count for U4: 8 new tests (24 → 32).

// === Helpers (U4) ===

// `ensure_creator_kiosk` is an entry fn that shares a Kiosk and transfers
// a PersonalKioskCap to ctx.sender(). Tests that exercise mint_and_list
// + purchase need the Kiosk + cap surfaced into the next-tx inbox; this
// helper consolidates the setup.
fun new_creator_kiosk(sc: &mut ts::Scenario, who: address): (Kiosk, PersonalKioskCap) {
    ensure_creator_kiosk(sc.ctx());
    sc.next_tx(who);
    let kiosk = ts::take_shared<Kiosk>(sc);
    let cap = sc.take_from_sender<PersonalKioskCap>();
    (kiosk, cap)
}

// Mints a default-license Model3D via the Walrus blob-faking flow + U4's
// `mint_and_list`. Returns the listing's model_id so purchase tests can
// drive the PTB chain. The Kiosk + PersonalKioskCap are returned mutated.
fun do_mint_and_list(
    sc: &mut ts::Scenario,
    system: &mut system::System,
    kiosk: &mut Kiosk,
    personal_cap: &PersonalKioskCap,
    price: u64,
): object::ID {
    let b = mint_blob(system, sc.ctx());
    let clk = clock::create_for_testing(sc.ctx());
    mint_and_list(
        kiosk,
        personal_cap,
        b,
        s(b"car"),
        s(b"{\"variant\":3}"),
        s(b"Aero"),
        make_tags(1),
        s(b"lineageBlobU4"),
        false,
        default_license(),
        &clk,
        price,
        sc.ctx(),
    );
    clock::destroy_for_testing(clk);
    // Resolve the model_id from the emitted ModelPublished event (most recent).
    let events = event::events_by_type<model3d::ModelPublished>();
    // R13: defensive bounds check. If a future refactor inserts `next_tx`
    // between mint and read, the event scope would empty and `length() - 1`
    // would underflow u64. Loud failure beats silent wraparound.
    assert!(vector::length(&events) >= 1, 538);
    let e = vector::borrow(&events, vector::length(&events) - 1);
    model3d::model_published_model_id(e)
}

// Stand-up the full Phase 4 deploy state: Publisher → TransferPolicy +
// Cap → creator's PersonalKiosk. Consolidates the U2+U3+U4 prologue so
// individual U4 tests stay focused on their assertion.
fun phase4_bootstrap(sc: &mut ts::Scenario): (TransferPolicy<Model3D>, Kiosk, PersonalKioskCap) {
    init_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let publisher = sc.take_from_sender<Publisher>();
    ensure_transfer_policy(&publisher, sc.ctx());
    sc.return_to_sender(publisher);
    sc.next_tx(CREATOR);
    let policy = ts::take_shared<TransferPolicy<Model3D>>(sc);
    let (kiosk, personal_cap) = new_creator_kiosk(sc, CREATOR);
    (policy, kiosk, personal_cap)
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

// === U4 test 2 — atomicity: one Mint + one Place + one List event ===
//
// AE1 verification. `mint_and_list` MUST emit exactly one ModelPublished
// (from `new_model`) and exactly one `kiosk::ItemListed<Model3D>` (from
// `kiosk::list`). `kiosk::place` does NOT emit a separate event in the
// current framework; place's observable side effect is `kiosk::has_item`.
// We assert all three: ModelPublished cardinality, ItemListed cardinality
// with the right payload, and `has_item` for the placed Model3D.
#[test]
fun mint_and_list_emits_one_mint_one_place_one_list_event() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let (policy, mut kiosk, personal_cap) = phase4_bootstrap(&mut sc);

    // Event scope = this tx. Run mint_and_list inside one tx so we can
    // count *its* events without prior-tx noise.
    sc.next_tx(CREATOR);
    let model_id = do_mint_and_list(&mut sc, &mut system, &mut kiosk, &personal_cap, 1_000_000_000);

    // (a) Exactly one ModelPublished from new_model.
    let mp = event::events_by_type<model3d::ModelPublished>();
    assert!(vector::length(&mp) == 1, 510);

    // (b) Exactly one kiosk::ItemListed<Model3D>.
    let listed = event::events_by_type<sui::kiosk::ItemListed<Model3D>>();
    assert!(vector::length(&listed) == 1, 511);

    // (c) Model3D is actually in the kiosk after the place step.
    assert!(kiosk::has_item(&kiosk, model_id), 512);
    // (d) Model3D is listed (kiosk holds the Listing df).
    assert!(kiosk::is_listed(&kiosk, model_id), 513);
    // (e) R5: pin rule-count on the shared policy. Three rules were
    // attached at U3 bootstrap (royalty + lock + personal_kiosk). A future
    // change that drops a rule attachment would surface here BEFORE the
    // purchase-time rule-satisfaction tests caught it.
    assert!(sui::vec_set::size(tp::rules<Model3D>(&policy)) == 3, 514);

    sc.return_to_sender(personal_cap);
    ts::return_shared(kiosk);
    ts::return_shared(policy);
    system.destroy_for_testing();
    sc.end();
}

// === U4 test 3 — happy purchase returns (Model3D, TransferRequest) ===
//
// `purchase_with_kiosk` returns the hot-potato `TransferRequest<Model3D>`.
// To satisfy the framework's drop semantics (TransferRequest has no `drop`),
// the test drives the full buyer-side PTB chain INSIDE the test body:
//   1. `purchase_with_kiosk(kiosk, policy, model_id, payment, ctx)` →
//      (Model3D, TransferRequest)
//   2. Lock into a PersonalKiosk via `kiosk::lock` → satisfy kiosk_lock_rule
//   3. `royalty_rule::pay(policy, request, royalty_coin)` → satisfy royalty
//   4. `personal_kiosk_rule::prove(kiosk, request)` → satisfy personal-kiosk
//   5. `tp::confirm_request(policy, request)` → consume the hot potato.
//
// To avoid `take_shared<Kiosk>` ambiguity (sui-test-scenario returns shared
// objects of a given type via internal indexing — calling `take_shared<Kiosk>`
// when two shared Kiosks of the same type exist is fragile), the buyer
// re-uses the creator's PersonalKiosk in this test. The mechanism under
// test (purchase → rule receipts → confirm_request → item locked) does
// not depend on buyer-distinct-from-seller; that's a frontend-flow concern
// covered by U6/U9 integration tests.
//
// Asserts: paid value on the request matches the listing price; Model3D
// ends up locked in the Kiosk after confirm; the receipt cardinality
// matches the rule cardinality (otherwise confirm_request would abort).
#[test]
fun purchase_with_kiosk_returns_request_and_item() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let (mut policy, mut kiosk, personal_cap) = phase4_bootstrap(&mut sc);

    let price: u64 = 1_000_000_000; // 1 SUI
    sc.next_tx(CREATOR);
    let model_id = do_mint_and_list(&mut sc, &mut system, &mut kiosk, &personal_cap, price);
    sc.next_tx(CREATOR);

    let payment = coin::mint_for_testing<SUI>(price, sc.ctx());
    let (item, mut request) = purchase_with_kiosk(
        &mut kiosk,
        &policy,
        model_id,
        payment,
        sc.ctx(),
    );

    // `paid()` accessor on the hot-potato request — pin that the price
    // recorded in the TransferRequest matches the listing.
    assert!(tp::paid<Model3D>(&request) == price, 520);

    // Buyer-side: lock into the (same) PersonalKiosk — `kiosk::lock` requires
    // `&TransferPolicy<T>` (sui-framework constraint: items can't be locked
    // without an existing policy to enforce on resale).
    {
        let owner_cap = personal_kiosk::borrow(&personal_cap);
        kiosk::lock<Model3D>(&mut kiosk, owner_cap, &policy, item);
    };
    // Three receipts (one per rule), order doesn't matter; cardinality +
    // membership is checked by confirm_request.
    kiosk_lock_rule::prove<Model3D>(&mut request, &kiosk);
    personal_kiosk_rule::prove<Model3D>(&kiosk, &mut request);
    let owed = royalty_rule::fee_amount<Model3D>(&policy, price);
    let royalty_coin = coin::mint_for_testing<SUI>(owed, sc.ctx());
    royalty_rule::pay<Model3D>(&mut policy, &mut request, royalty_coin);

    // Consume the hot potato. confirm_request returns (item_id, paid, from).
    let kiosk_id_for_from = object::id(&kiosk);
    let (returned_item_id, paid_amount, from_kiosk_id) = tp::confirm_request<Model3D>(&policy, request);
    assert!(paid_amount == price, 521);
    assert!(returned_item_id == model_id, 522);
    // R9: `from` is the source Kiosk's ID; test 3 reuses the creator's kiosk
    // for buyer-side too, so it must equal that kiosk's id. A future change
    // that misroutes the from field would surface here.
    assert!(from_kiosk_id == kiosk_id_for_from, 525);

    // Item now locked.
    assert!(kiosk::has_item(&kiosk, model_id), 523);
    assert!(kiosk::is_locked(&kiosk, model_id), 524);

    sc.return_to_sender(personal_cap);
    ts::return_shared(kiosk);
    ts::return_shared(policy);
    system.destroy_for_testing();
    sc.end();
}

// === U4 test 4 — confirm_request with insufficient receipts → tx aborts ===
//
// AE2 verification. Driving `confirm_request` after `purchase_with_kiosk` but
// WITHOUT satisfying any of the three rules (no royalty pay, no lock prove,
// no personal-kiosk prove) means receipts.size()==0 != rules.size()==3 →
// the framework aborts the call with `EPolicyNotSatisfied`.
//
// `::`-qualified abort code pins the exact module that asserts; survives
// framework SHA bumps (code-number reshuffles are invisible at the source).
#[test]
#[expected_failure(abort_code = ::sui::transfer_policy::EPolicyNotSatisfied)]
fun confirm_request_aborts_when_receipts_missing_rules() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let (policy, mut kiosk, personal_cap) = phase4_bootstrap(&mut sc);

    let price: u64 = 1_000_000_000;
    sc.next_tx(CREATOR);
    let model_id = do_mint_and_list(&mut sc, &mut system, &mut kiosk, &personal_cap, price);
    sc.next_tx(CREATOR);

    let payment = coin::mint_for_testing<SUI>(price, sc.ctx());
    let (item, request) = purchase_with_kiosk(
        &mut kiosk,
        &policy,
        model_id,
        payment,
        sc.ctx(),
    );

    // Skip all rule satisfaction. confirm_request sees receipts.len()==0
    // != rules.size()==3 → abort EPolicyNotSatisfied. The test framework
    // catches the abort via expected_failure.
    let (_id, _paid, _from) = tp::confirm_request<Model3D>(&policy, request);

    // Unreachable: lines below silence the linter only.
    transfer::public_transfer(item, CREATOR);
    sc.return_to_sender(personal_cap);
    ts::return_shared(kiosk);
    ts::return_shared(policy);
    system.destroy_for_testing();
    sc.end();
}

// === U4 — TransferRequest unconsumed: NO runtime test possible ===
//
// Companion to test 4. We attempted to add a runtime test proving "leaving
// the TransferRequest hot potato unconsumed aborts the tx," but Move 2024
// rejects such a function at COMPILE time with E06001 ("unused value
// without 'drop'"). The check is stronger than runtime: the bytecode never
// reaches the VM. This is the framework's guarantee.
//
// The compile-fail attempt itself is the proof — see open-questions.md
// entry "Q-R2-2026-05-19" for the full transcript. Test 4
// (`confirm_request_aborts_when_receipts_missing_rules`) is the runtime
// companion: it drives `confirm_request` with insufficient receipts and
// catches the framework-level abort.

// === U4 test 5 — RoyaltyPaid event matches Kiosk-protocol-computed amount ===
//
// `purchase_with_kiosk` emits RoyaltyPaid with amount =
// `royalty_rule::fee_amount(policy, price)`. The U8 indexer reconstructs
// the rate via `amount * 10_000 / price == royalty_bps`. This test pins
// that invariant at 1 SUI price (above the 0.02-SUI crossover where
// floor math doesn't dominate).
#[test]
fun royalty_paid_event_fields_match_kiosk_protocol_computed_amount() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let (mut policy, mut kiosk, personal_cap) = phase4_bootstrap(&mut sc);

    let price: u64 = 1_000_000_000; // 1 SUI — above the 0.02-SUI floor crossover
    sc.next_tx(CREATOR);
    let model_id = do_mint_and_list(&mut sc, &mut system, &mut kiosk, &personal_cap, price);
    let kiosk_id = object::id(&kiosk);
    sc.next_tx(CREATOR);

    let expected_amount = royalty_rule::fee_amount<Model3D>(&policy, price);
    // Sanity: 500 bps × 1 SUI = 0.05 SUI = 50_000_000 mist.
    assert!(expected_amount == 50_000_000, 530);

    // Pin the tx_digest BEFORE calling purchase_with_kiosk. The fn captures
    // its own ctx digest internally; this MUST match because both reads
    // happen in the same tx scope (sc.next_tx earlier opened one tx; no
    // intervening next_tx call between this read and the purchase).
    let expected_digest: vector<u8> = *tx_context::digest(sc.ctx());

    let payment = coin::mint_for_testing<SUI>(price, sc.ctx());
    let (item, mut request) = purchase_with_kiosk(
        &mut kiosk,
        &policy,
        model_id,
        payment,
        sc.ctx(),
    );

    // Assert RoyaltyPaid event payload (event is emitted INSIDE
    // purchase_with_kiosk; current-tx scope).
    let rp = event::events_by_type<model3d::RoyaltyPaid>();
    assert!(vector::length(&rp) == 1, 531);
    let e = vector::borrow(&rp, 0);
    assert!(model3d::royalty_paid_amount(e) == expected_amount, 532);
    assert!(model3d::royalty_paid_royalty_bps(e) == amount_bp_default(), 533);
    assert!(model3d::royalty_paid_kiosk_id(e) == kiosk_id, 534);
    assert!(model3d::royalty_paid_model_id(e) == model_id, 535);
    assert!(model3d::royalty_paid_creator(e) == CREATOR, 536);
    // R10: tx_digest is captured internally by emit_royalty_paid via
    // `tx_context::digest(ctx)`. Pin that purchase_with_kiosk correctly
    // threads ctx to the emit (regression-proof if a future signature
    // change misforwards ctx).
    assert!(model3d::royalty_paid_tx_digest(e) == expected_digest, 537);

    // Drain the hot potato so the tx doesn't abort on the request value.
    // Buyer is CREATOR for simplicity here — the event-shape test doesn't
    // need a distinct buyer.
    let royalty_coin = coin::mint_for_testing<SUI>(expected_amount, sc.ctx());
    royalty_rule::pay<Model3D>(&mut policy, &mut request, royalty_coin);

    // Buyer-side: place + lock + prove rules. CREATOR's kiosk acts as
    // buyer too in this test (we already have access to its cap).
    {
        let owner_cap = personal_kiosk::borrow(&personal_cap);
        kiosk::lock<Model3D>(&mut kiosk, owner_cap, &policy, item);
    };
    kiosk_lock_rule::prove<Model3D>(&mut request, &kiosk);
    personal_kiosk_rule::prove<Model3D>(&kiosk, &mut request);
    let (_id, _paid, _from) = tp::confirm_request<Model3D>(&policy, request);

    sc.return_to_sender(personal_cap);
    ts::return_shared(kiosk);
    ts::return_shared(policy);
    system.destroy_for_testing();
    sc.end();
}

// === U4 test 5b — RoyaltyPaid amount in FLOOR regime (below 0.02 SUI crossover) ===
//
// R4: complement to test 5 (which exercises the bps regime at 1 SUI). Below
// the crossover price = MIN_ROYALTY_AMOUNT_MIST * 10_000 / AMOUNT_BP_DEFAULT
// = 1_000_000 * 10_000 / 500 = 20_000_000 mist (0.02 SUI), the rule's
// `max(price * bps / 10_000, min_amount)` returns min_amount → effective
// rate vastly exceeds the nominal 5%. U8 indexer must implement both
// branches; the `amount * 10_000 / price == royalty_bps` invariant BREAKS
// here (1_000_000 * 10_000 / 1_000 = 10_000_000 != 500).
#[test]
fun royalty_paid_event_amount_matches_floor_branch_below_crossover() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let (mut policy, mut kiosk, personal_cap) = phase4_bootstrap(&mut sc);

    let price: u64 = 1_000; // 1_000 mist — well below 0.02-SUI floor crossover
    sc.next_tx(CREATOR);
    let model_id = do_mint_and_list(&mut sc, &mut system, &mut kiosk, &personal_cap, price);
    sc.next_tx(CREATOR);

    // bps regime: 1_000 * 500 / 10_000 = 50. Floor: 1_000_000. max → 1_000_000.
    let expected_amount = royalty_rule::fee_amount<Model3D>(&policy, price);
    assert!(expected_amount == min_royalty_amount_mist(), 550);

    let payment = coin::mint_for_testing<SUI>(price, sc.ctx());
    let (item, mut request) = purchase_with_kiosk(
        &mut kiosk,
        &policy,
        model_id,
        payment,
        sc.ctx(),
    );

    let rp = event::events_by_type<model3d::RoyaltyPaid>();
    assert!(vector::length(&rp) == 1, 551);
    let e = vector::borrow(&rp, 0);
    assert!(model3d::royalty_paid_amount(e) == min_royalty_amount_mist(), 552);
    // royalty_bps field is still AMOUNT_BP_DEFAULT (event payload always
    // carries the nominal rule rate). U8 must detect the floor regime by
    // comparing amount to MIN_ROYALTY_AMOUNT_MIST, not by the bps field.
    assert!(model3d::royalty_paid_royalty_bps(e) == amount_bp_default(), 553);
    // Document the invariant BREAK: amount * 10_000 / price != royalty_bps.
    // amount=1_000_000, price=1_000 → 1_000_000 * 10_000 / 1_000 = 10_000_000.
    assert!(min_royalty_amount_mist() * 10_000 / price != amount_bp_default() as u64, 554);

    // Drain hot potato + complete the buyer flow so the test doesn't fail
    // on TransferRequest non-drop. Buyer reuses creator's kiosk for
    // simplicity (event-shape test).
    let royalty_coin = coin::mint_for_testing<SUI>(expected_amount, sc.ctx());
    royalty_rule::pay<Model3D>(&mut policy, &mut request, royalty_coin);
    {
        let owner_cap = personal_kiosk::borrow(&personal_cap);
        kiosk::lock<Model3D>(&mut kiosk, owner_cap, &policy, item);
    };
    kiosk_lock_rule::prove<Model3D>(&mut request, &kiosk);
    personal_kiosk_rule::prove<Model3D>(&kiosk, &mut request);
    let (_id, _paid, _from) = tp::confirm_request<Model3D>(&policy, request);

    sc.return_to_sender(personal_cap);
    ts::return_shared(kiosk);
    ts::return_shared(policy);
    system.destroy_for_testing();
    sc.end();
}

// === U4 test 5c — purchase_with_kiosk aborts on royalty-rule bps drift ===
//
// R6: `purchase_with_kiosk` hardcodes `royalty_bps = AMOUNT_BP_DEFAULT` in
// the RoyaltyPaid event payload. The R6 guard probes the live rule via
// `fee_amount(policy, sentinel_price)` and aborts if the rule's effective
// bps != AMOUNT_BP_DEFAULT. ADV-002 attack vector: TransferPolicyCap holder
// (or attacker who compromised it) reconfigured the rule with a different
// rate. The event would lie about the bps but the actual royalty flowed at
// the new rate; this aborts loud instead of emitting bad telemetry.
//
// To exercise the guard without needing access to the private
// `royalty_rule::Config` (no public `remove` helper exists), we build a
// SECOND, independent TransferPolicy with bps=700 and pass it to
// `purchase_with_kiosk`. This is the same shape as ADV-002 — an attacker
// frontend gets the buyer to pass the wrong policy ID.
#[test]
#[expected_failure(abort_code = model3d::EWrongRoyaltyRate)]
fun purchase_with_kiosk_aborts_when_rule_bps_drifted() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let (canonical_policy, mut kiosk, personal_cap) = phase4_bootstrap(&mut sc);

    let price: u64 = 1_000_000_000;
    sc.next_tx(CREATOR);
    let model_id = do_mint_and_list(&mut sc, &mut system, &mut kiosk, &personal_cap, price);
    sc.next_tx(CREATOR);

    // Build a SECOND policy with bps=700 (≠ AMOUNT_BP_DEFAULT=500). Uses
    // a fresh Publisher via init_for_testing; in production an attacker
    // who controlled an old/leaked Publisher would do similar.
    let publisher = sc.take_from_sender<Publisher>();
    let (mut drift_policy, drift_cap) = tp::new<Model3D>(&publisher, sc.ctx());
    royalty_rule::add<Model3D>(&mut drift_policy, &drift_cap, 700, min_royalty_amount_mist());
    sc.return_to_sender(publisher);

    // Buyer tricked into passing the drifted policy. Guard aborts BEFORE
    // kiosk::purchase consumes the payment.
    let payment = coin::mint_for_testing<SUI>(price, sc.ctx());
    let (item, mut request) = purchase_with_kiosk(
        &mut kiosk,
        &drift_policy,
        model_id,
        payment,
        sc.ctx(),
    );

    // Unreachable — but the compiler needs the TransferRequest consumed on
    // every path. Drive the buyer-side chain so the binding type-checks.
    let owed = royalty_rule::fee_amount<Model3D>(&drift_policy, price);
    let royalty_coin = coin::mint_for_testing<SUI>(owed, sc.ctx());
    royalty_rule::pay<Model3D>(&mut drift_policy, &mut request, royalty_coin);
    {
        let owner_cap = personal_kiosk::borrow(&personal_cap);
        kiosk::lock<Model3D>(&mut kiosk, owner_cap, &drift_policy, item);
    };
    kiosk_lock_rule::prove<Model3D>(&mut request, &kiosk);
    personal_kiosk_rule::prove<Model3D>(&kiosk, &mut request);
    let (_id, _paid, _from) = tp::confirm_request<Model3D>(&drift_policy, request);

    transfer::public_share_object(drift_policy);
    sc.return_to_sender(drift_cap);
    sc.return_to_sender(personal_cap);
    ts::return_shared(kiosk);
    ts::return_shared(canonical_policy);
    system.destroy_for_testing();
    sc.end();
}

// === U4 test 5d — purchase_with_kiosk aborts on payment less than price ===
//
// R8: `kiosk::purchase` asserts `price == payment.value()` (strict equality)
// → abort `EIncorrectAmount`. A buyer who under-funds the payment Coin gets
// loud failure. Frontend's `splitCoins` to exact amount is the defensive
// pattern; this test pins the framework-level enforcement.
#[test]
#[expected_failure(abort_code = ::sui::kiosk::EIncorrectAmount)]
fun purchase_with_kiosk_aborts_on_payment_less_than_price() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let (policy, mut kiosk, personal_cap) = phase4_bootstrap(&mut sc);

    let price: u64 = 1_000_000_000;
    sc.next_tx(CREATOR);
    let model_id = do_mint_and_list(&mut sc, &mut system, &mut kiosk, &personal_cap, price);
    sc.next_tx(CREATOR);

    // Buyer under-funds by 1 mist. EIncorrectAmount uses strict equality.
    let short_payment = coin::mint_for_testing<SUI>(price - 1, sc.ctx());
    let (item, mut request) = purchase_with_kiosk(
        &mut kiosk,
        &policy,
        model_id,
        short_payment,
        sc.ctx(),
    );

    // Unreachable — but the compiler needs all paths to consume the
    // non-droppable TransferRequest.
    let owed = royalty_rule::fee_amount<Model3D>(&policy, price);
    let royalty_coin = coin::mint_for_testing<SUI>(owed, sc.ctx());
    let mut policy_mut = policy;
    royalty_rule::pay<Model3D>(&mut policy_mut, &mut request, royalty_coin);
    {
        let owner_cap = personal_kiosk::borrow(&personal_cap);
        kiosk::lock<Model3D>(&mut kiosk, owner_cap, &policy_mut, item);
    };
    kiosk_lock_rule::prove<Model3D>(&mut request, &kiosk);
    personal_kiosk_rule::prove<Model3D>(&kiosk, &mut request);
    let (_id, _paid, _from) = tp::confirm_request<Model3D>(&policy_mut, request);

    sc.return_to_sender(personal_cap);
    ts::return_shared(kiosk);
    ts::return_shared(policy_mut);
    system.destroy_for_testing();
    sc.end();
}

// === U4 test 6 — license royalty cap > 3000 bps in mint_and_list aborts ===
//
// `mint_and_list` calls `new_model` which calls `validate_publish_inputs`.
// `license.derivative_royalty_bps > MAX_DERIVATIVE_ROYALTY_BPS` (3000)
// aborts with ERoyaltyTooHigh. This test exercises the abort *through*
// `mint_and_list` (not just direct validate call) to pin that the new
// entry fn doesn't bypass the existing validator.
#[test]
#[expected_failure(abort_code = model3d::ERoyaltyTooHigh)]
fun mint_and_list_aborts_when_license_derivative_royalty_bps_exceeds_cap() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let (policy, mut kiosk, personal_cap) = phase4_bootstrap(&mut sc);
    sc.next_tx(CREATOR);

    let b = mint_blob(&mut system, sc.ctx());
    let clk = clock::create_for_testing(sc.ctx());
    let bad_license = new_license_terms(
        policy_permissionless(),
        0,
        max_derivative_royalty_bps() + 1, // 3001 > 3000 cap
        true,
        true,
    );

    mint_and_list(
        &mut kiosk,
        &personal_cap,
        b,
        s(b"car"),
        s(b"{}"),
        s(b"Bad"),
        empty_tags(),
        s(b"lineageBad"),
        false,
        bad_license,
        &clk,
        1_000,
        sc.ctx(),
    );

    // Unreachable.
    clock::destroy_for_testing(clk);
    sc.return_to_sender(personal_cap);
    ts::return_shared(kiosk);
    ts::return_shared(policy);
    system.destroy_for_testing();
    sc.end();
}

// === U4 test 7 — LockRule prevents `take` after purchase ===
//
// After the buyer satisfies the lock rule by calling `kiosk::lock<Model3D>`,
// the item is marked locked in the dynamic-field set. `kiosk::take` asserts
// `!is_locked(id)` → abort `EItemLocked` from `sui::kiosk`.
//
// `::`-qualified abort code pins the exact module that asserts; survives
// framework SHA bumps (code-number reshuffles are invisible at the source).
#[test]
#[expected_failure(abort_code = ::sui::kiosk::EItemLocked)]
fun lock_rule_prevents_take_after_purchase() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let (mut policy, mut kiosk, personal_cap) = phase4_bootstrap(&mut sc);

    let price: u64 = 1_000_000_000;
    sc.next_tx(CREATOR);
    let model_id = do_mint_and_list(&mut sc, &mut system, &mut kiosk, &personal_cap, price);
    sc.next_tx(CREATOR);

    let payment = coin::mint_for_testing<SUI>(price, sc.ctx());
    let (item, mut request) = purchase_with_kiosk(
        &mut kiosk,
        &policy,
        model_id,
        payment,
        sc.ctx(),
    );

    // Lock into the kiosk — this is the buyer-side action that satisfies
    // the lock rule. For the take-after-purchase test, we reuse the
    // creator's own kiosk as the lock destination.
    {
        let owner_cap = personal_kiosk::borrow(&personal_cap);
        kiosk::lock<Model3D>(&mut kiosk, owner_cap, &policy, item);
    };
    kiosk_lock_rule::prove<Model3D>(&mut request, &kiosk);
    personal_kiosk_rule::prove<Model3D>(&kiosk, &mut request);
    let owed = royalty_rule::fee_amount<Model3D>(&policy, price);
    let royalty_coin = coin::mint_for_testing<SUI>(owed, sc.ctx());
    royalty_rule::pay<Model3D>(&mut policy, &mut request, royalty_coin);
    let (_id, _paid, _from) = tp::confirm_request<Model3D>(&policy, request);

    // Now the item is locked. Attempt to take it — aborts EItemLocked.
    let owner_cap_for_take = personal_kiosk::borrow(&personal_cap);
    let taken: Model3D = kiosk::take<Model3D>(&mut kiosk, owner_cap_for_take, model_id);

    // Unreachable.
    destroy_model_for_testing(taken);
    sc.return_to_sender(personal_cap);
    ts::return_shared(kiosk);
    ts::return_shared(policy);
    system.destroy_for_testing();
    sc.end();
}

// === U4 test 8 — PersonalKioskRule blocks vanilla-kiosk purchase confirm ===
//
// A buyer who builds a vanilla Kiosk via `sui::kiosk::new` (not
// `personal_kiosk::new`) cannot satisfy `personal_kiosk_rule::prove` —
// `personal_kiosk::is_personal(kiosk)` is false → abort `EKioskNotOwned`
// from `kiosk::personal_kiosk_rule`.
//
// `::`-qualified abort code pins the exact module that asserts; survives
// framework SHA bumps (code-number reshuffles are invisible at the source).
#[test]
#[expected_failure(abort_code = ::kiosk::personal_kiosk_rule::EKioskNotOwned)]
fun personal_kiosk_rule_blocks_vanilla_kiosk_purchase() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let (mut policy, mut kiosk, personal_cap) = phase4_bootstrap(&mut sc);

    let price: u64 = 1_000_000_000;
    sc.next_tx(CREATOR);
    let model_id = do_mint_and_list(&mut sc, &mut system, &mut kiosk, &personal_cap, price);
    sc.next_tx(CREATOR);

    let payment = coin::mint_for_testing<SUI>(price, sc.ctx());
    let (item, mut request) = purchase_with_kiosk(
        &mut kiosk,
        &policy,
        model_id,
        payment,
        sc.ctx(),
    );

    // Vanilla buyer Kiosk — NOT wrapped via personal_kiosk::new.
    let (mut vanilla_kiosk, vanilla_cap) = kiosk::new(sc.ctx());
    kiosk::lock<Model3D>(&mut vanilla_kiosk, &vanilla_cap, &policy, item);
    kiosk_lock_rule::prove<Model3D>(&mut request, &vanilla_kiosk);

    // Aborts here: vanilla_kiosk lacks the OwnerMarker dynamic field that
    // `personal_kiosk::is_personal` checks for.
    personal_kiosk_rule::prove<Model3D>(&vanilla_kiosk, &mut request);

    // Unreachable.
    let owed = royalty_rule::fee_amount<Model3D>(&policy, price);
    let royalty_coin = coin::mint_for_testing<SUI>(owed, sc.ctx());
    royalty_rule::pay<Model3D>(&mut policy, &mut request, royalty_coin);
    let (_id, _paid, _from) = tp::confirm_request<Model3D>(&policy, request);
    transfer::public_share_object(vanilla_kiosk);
    transfer::public_transfer(vanilla_cap, CREATOR);
    sc.return_to_sender(personal_cap);
    ts::return_shared(kiosk);
    ts::return_shared(policy);
    system.destroy_for_testing();
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
    launch_collection(&model, payment, sc.ctx());

    sc.next_tx(NFT_CREATOR);
    let cap = sc.take_from_sender<NftCollectionCreatorCap>();
    let collection = sc.take_shared<NftCollection>();

    assert!(model3d::collection_base_model_id(&collection) == model_id, 300);
    assert!(model3d::collection_base_creator(&collection) == CREATOR, 301);
    assert!(model3d::collection_base_policy(&collection) == policy_permissionless(), 302);
    assert!(model3d::collection_base_royalty_bps(&collection) == 500, 303);
    assert!(model3d::collection_register_fee(&collection) == 0, 304);
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
    launch_collection(&model, payment, sc.ctx());

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

// Covers AE7: a restricted base records base_policy == POLICY_RESTRICTED (0).
#[test]
fun launch_collection_snapshots_restricted_policy() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let clk = clock::create_for_testing(sc.ctx());
    let license = new_license_terms(policy_restricted(), 0, 0, false, false);
    let model = mint_base_model(&mut system, &clk, license, sc.ctx());

    sc.next_tx(NFT_CREATOR);
    let payment = coin::mint_for_testing<SUI>(0, sc.ctx());
    launch_collection(&model, payment, sc.ctx());

    sc.next_tx(NFT_CREATOR);
    let collection = sc.take_shared<NftCollection>();
    assert!(model3d::collection_base_policy(&collection) == policy_restricted(), 320);
    let cap = sc.take_from_sender<NftCollectionCreatorCap>();

    destroy_collection_cap_for_testing(cap);
    destroy_collection_for_testing(collection);
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
    launch_collection(&model, payment, sc.ctx()); // aborts

    // Unreachable — kept so the borrow checker is satisfied.
    destroy_model_for_testing(model);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

