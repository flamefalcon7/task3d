#[test_only]
#[allow(deprecated_usage)]
module model3d::model3d_tests;

use std::string;
use sui::clock;
use sui::coin;
use sui::sui::SUI;
use sui::test_scenario as ts;
use sui::tx_context;
use walrus::blob::{Self, Blob};
use walrus::encoding;
use walrus::storage_resource::Storage;
use walrus::system::{Self, System};
use wal::wal::WAL;
use model3d::model3d::{
    Self,
    new_license_terms,
    policy_permissionless,
    policy_restricted,
    max_derivative_royalty_bps,
    validate_publish_inputs,
    publish,
    mint_model_access,
    destroy_model_for_testing,
    destroy_access_for_testing,
};

const CREATOR: address = @0xC0FFEE;
const BUYER:   address = @0xBABE;

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

// === Validation tests (no Blob needed) ===

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

// === End-to-end publish + purchase tests (real Walrus Blob) ===

#[test]
fun publish_happy_path_sets_creator_and_fields() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let b = mint_blob(&mut system, sc.ctx());
    let clk = clock::create_for_testing(sc.ctx());

    let mut tags = empty_tags();
    vector::push_back(&mut tags, s(b"fantasy"));
    vector::push_back(&mut tags, s(b"weapon"));

    let model = publish(
        b,
        s(b"sword"),
        s(b"{\"length\":1.0}"),
        s(b"Excalibur"),
        tags,
        s(b"lineageBlobId123"),
        1_000_000,
        false,
        default_license(),
        &clk,
        sc.ctx(),
    );

    assert!(model3d::creator(&model) == CREATOR, 100);
    assert!(model3d::direct_access_price(&model) == 1_000_000, 101);
    assert!(model3d::is_encrypted(&model) == false, 102);
    assert!(*string::as_bytes(model3d::name(&model)) == b"Excalibur", 103);
    assert!(*string::as_bytes(model3d::lineage_blob_id(&model)) == b"lineageBlobId123", 104);
    assert!(vector::length(model3d::tags(&model)) == 2, 105);

    let recovered = destroy_model_for_testing(model);
    blob::burn(recovered);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

#[test]
fun purchase_model_access_permanent_pays_creator() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let b = mint_blob(&mut system, sc.ctx());
    let clk = clock::create_for_testing(sc.ctx());

    let model = publish(
        b,
        s(b"cube"),
        s(b"{}"),
        s(b"Cube"),
        empty_tags(),
        s(b"lin1"),
        500,
        false,
        default_license(),
        &clk,
        sc.ctx(),
    );

    sc.next_tx(BUYER);
    let payment = coin::mint_for_testing<SUI>(500, sc.ctx());
    let access = mint_model_access(&model, payment, 0, &clk, sc.ctx());

    assert!(model3d::access_holder(&access) == BUYER, 200);
    assert!(model3d::access_expires_at_ms(&access) == 0, 201);
    assert!(model3d::access_target_id(&access) == object::id(&model), 202);

    destroy_access_for_testing(access);

    sc.next_tx(CREATOR);
    let received = sc.take_from_sender<coin::Coin<SUI>>();
    assert!(coin::value(&received) == 500, 203);
    sc.return_to_sender(received);

    let recovered = destroy_model_for_testing(model);
    blob::burn(recovered);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

#[test]
fun purchase_model_access_subscription_sets_expiry() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let b = mint_blob(&mut system, sc.ctx());
    let mut clk = clock::create_for_testing(sc.ctx());
    clock::set_for_testing(&mut clk, 1_000_000);

    let model = publish(
        b,
        s(b"cube"),
        s(b"{}"),
        s(b"Cube"),
        empty_tags(),
        s(b"lin1"),
        100,
        false,
        default_license(),
        &clk,
        sc.ctx(),
    );

    sc.next_tx(BUYER);
    let payment = coin::mint_for_testing<SUI>(100, sc.ctx());
    let access = mint_model_access(&model, payment, 86_400_000, &clk, sc.ctx());

    assert!(model3d::access_expires_at_ms(&access) == 1_000_000 + 86_400_000, 300);

    destroy_access_for_testing(access);
    let recovered = destroy_model_for_testing(model);
    blob::burn(recovered);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

#[test]
fun purchase_model_access_free_with_zero_coin() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let b = mint_blob(&mut system, sc.ctx());
    let clk = clock::create_for_testing(sc.ctx());

    let model = publish(
        b,
        s(b"cube"),
        s(b"{}"),
        s(b"Free"),
        empty_tags(),
        s(b"lin1"),
        0,
        false,
        default_license(),
        &clk,
        sc.ctx(),
    );

    sc.next_tx(BUYER);
    let payment = coin::zero<SUI>(sc.ctx());
    let access = mint_model_access(&model, payment, 0, &clk, sc.ctx());
    assert!(model3d::access_holder(&access) == BUYER, 400);
    destroy_access_for_testing(access);

    let recovered = destroy_model_for_testing(model);
    blob::burn(recovered);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

#[test]
fun purchase_model_access_exact_payment_succeeds() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let b = mint_blob(&mut system, sc.ctx());
    let clk = clock::create_for_testing(sc.ctx());

    let model = publish(
        b,
        s(b"cube"),
        s(b"{}"),
        s(b"X"),
        empty_tags(),
        s(b"lin"),
        777,
        false,
        default_license(),
        &clk,
        sc.ctx(),
    );

    sc.next_tx(BUYER);
    let payment = coin::mint_for_testing<SUI>(777, sc.ctx());
    let access = mint_model_access(&model, payment, 0, &clk, sc.ctx());
    destroy_access_for_testing(access);
    let recovered = destroy_model_for_testing(model);
    blob::burn(recovered);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

#[test, expected_failure(abort_code = model3d::EInsufficientPayment)]
fun purchase_model_access_insufficient_payment_aborts() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let b = mint_blob(&mut system, sc.ctx());
    let clk = clock::create_for_testing(sc.ctx());

    let model = publish(
        b,
        s(b"cube"),
        s(b"{}"),
        s(b"X"),
        empty_tags(),
        s(b"lin"),
        1_000,
        false,
        default_license(),
        &clk,
        sc.ctx(),
    );

    sc.next_tx(BUYER);
    let payment = coin::mint_for_testing<SUI>(999, sc.ctx());
    let access = mint_model_access(&model, payment, 0, &clk, sc.ctx());
    destroy_access_for_testing(access);

    let recovered = destroy_model_for_testing(model);
    blob::burn(recovered);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

#[test]
fun policy_constants_match_spec() {
    assert!(policy_restricted() == 0, 1);
    assert!(model3d::policy_allow_list() == 1, 2);
    assert!(policy_permissionless() == 2, 3);
    assert!(max_derivative_royalty_bps() == 3000, 4);
}
