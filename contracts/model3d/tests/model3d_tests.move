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
    Collection,
    Model3D,
    new_license_terms,
    policy_permissionless,
    policy_restricted,
    max_derivative_royalty_bps,
    max_variants,
    max_slug_len,
    max_variant_params_json_len,
    validate_publish_inputs,
    validate_collection_inputs,
    new_variant_spec,
    publish_collection,
    mint_variant,
    share_collection,
    mint_model_access,
    destroy_model_for_testing,
    destroy_collection_for_testing,
    destroy_access_for_testing,
};

const CREATOR: address = @0xC0FFEE;
const BUYER:   address = @0xBABE;
const OTHER:   address = @0xBADBAD;

const BLOB_SIZE: u64 = 1024;
const EPOCHS_AHEAD: u32 = 3;
const RS2: u8 = 1;
const ROOT_HASH: u256 = 0xABC;
const N_WAL: u64 = 1_000_000_000;

const ASCII_A: u8 = 97;
const ASCII_N: u8 = 110;
const ASCII_X: u8 = 120;
const ASCII_B: u8 = 98;
const ASCII_S: u8 = 115;

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

// Build a Collection + a single Model3D variant using the Phase 3 flow. Used by
// Phase 2 ABI compatibility tests + access purchase tests that don't care about
// the variant-level details.
fun mint_collection_and_one_model(
    system: &mut System,
    clk: &clock::Clock,
    ctx: &mut tx_context::TxContext,
    direct_access_price: u64,
): (Collection, Model3D) {
    let b = mint_blob(system, ctx);
    let mut coll = publish_collection(
        b,
        s(b"Cube"),
        s(b"cube-set"),
        default_license(),
        clk,
        ctx,
    );
    let spec = new_variant_spec(
        s(b"patch-0"),
        s(b"{}"),
        s(b"Cube"),
        empty_tags(),
        direct_access_price,
    );
    let model = mint_variant(
        &mut coll,
        spec,
        s(b"cube"),
        s(b"lin1"),
        false,
        clk,
        ctx,
    );
    (coll, model)
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

// === Phase 3 — Collection validation tests (no Blob needed) ===

#[test, expected_failure(abort_code = model3d::ESlugMalformed)]
fun validate_collection_inputs_rejects_empty_slug() {
    validate_collection_inputs(&s(b"Cube"), &s(b""), &default_license());
}

#[test, expected_failure(abort_code = model3d::ESlugTooLong)]
fun publish_collection_rejects_slug_too_long() {
    validate_collection_inputs(
        &s(b"Cube"),
        &repeat_byte(ASCII_S, max_slug_len() + 1),
        &default_license(),
    );
}

#[test]
fun validate_collection_inputs_accepts_slug_at_cap() {
    validate_collection_inputs(
        &s(b"Cube"),
        &repeat_byte(ASCII_S, max_slug_len()),
        &default_license(),
    );
}

#[test, expected_failure(abort_code = model3d::ENameTooLong)]
fun validate_collection_inputs_rejects_name_too_long() {
    validate_collection_inputs(
        &repeat_byte(ASCII_N, 129),
        &s(b"cube-set"),
        &default_license(),
    );
}

#[test, expected_failure(abort_code = model3d::ERoyaltyTooHigh)]
fun validate_collection_inputs_rejects_royalty_over_cap() {
    let bad = new_license_terms(policy_permissionless(), 0, max_derivative_royalty_bps() + 1, true, true);
    validate_collection_inputs(&s(b"Cube"), &s(b"cube-set"), &bad);
}

// === Phase 3 — Collection + variant end-to-end tests ===

#[test]
fun publish_collection_happy_path_sets_creator_and_fields() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let b = mint_blob(&mut system, sc.ctx());
    let clk = clock::create_for_testing(sc.ctx());

    let coll = publish_collection(
        b,
        s(b"Excalibur Set"),
        s(b"excalibur"),
        default_license(),
        &clk,
        sc.ctx(),
    );

    assert!(model3d::collection_creator(&coll) == CREATOR, 1000);
    assert!(*string::as_bytes(model3d::collection_name(&coll)) == b"Excalibur Set", 1001);
    assert!(*string::as_bytes(model3d::collection_slug(&coll)) == b"excalibur", 1002);
    assert!(model3d::collection_variant_count(&coll) == 0, 1003);

    let recovered = destroy_collection_for_testing(coll);
    blob::burn(recovered);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

#[test]
fun mint_variant_creates_model3d_referencing_collection() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let b = mint_blob(&mut system, sc.ctx());
    let clk = clock::create_for_testing(sc.ctx());

    let mut coll = publish_collection(
        b,
        s(b"Set"),
        s(b"set"),
        default_license(),
        &clk,
        sc.ctx(),
    );
    let expected_collection_id = object::id(&coll);

    let spec = new_variant_spec(
        s(b"patch-42"),
        s(b"{\"length\":1.0}"),
        s(b"Variant A"),
        make_tags(2),
        1_000_000,
    );
    let model = mint_variant(
        &mut coll,
        spec,
        s(b"sword"),
        s(b"lineageBlobIdABC"),
        false,
        &clk,
        sc.ctx(),
    );

    assert!(model3d::collection_id(&model) == expected_collection_id, 1100);
    assert!(*string::as_bytes(model3d::patch_id(&model)) == b"patch-42", 1101);
    assert!(model3d::creator(&model) == CREATOR, 1102);
    assert!(model3d::direct_access_price(&model) == 1_000_000, 1103);
    assert!(*string::as_bytes(model3d::name(&model)) == b"Variant A", 1104);
    assert!(*string::as_bytes(model3d::lineage_blob_id(&model)) == b"lineageBlobIdABC", 1105);
    assert!(model3d::collection_variant_count(&coll) == 1, 1106);

    destroy_model_for_testing(model);
    let recovered = destroy_collection_for_testing(coll);
    blob::burn(recovered);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

#[test]
fun mint_variant_carries_per_variant_pricing() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let b = mint_blob(&mut system, sc.ctx());
    let clk = clock::create_for_testing(sc.ctx());

    let mut coll = publish_collection(
        b, s(b"Set"), s(b"set"), default_license(), &clk, sc.ctx(),
    );

    let spec_a = new_variant_spec(
        s(b"a"), s(b"{}"), s(b"A"), empty_tags(), 100,
    );
    let spec_b = new_variant_spec(
        s(b"b"), s(b"{}"), s(b"B"), empty_tags(), 5_000,
    );
    let model_a = mint_variant(&mut coll, spec_a, s(b"cube"), s(b"linA"), false, &clk, sc.ctx());
    let model_b = mint_variant(&mut coll, spec_b, s(b"cube"), s(b"linB"), false, &clk, sc.ctx());

    assert!(model3d::direct_access_price(&model_a) == 100, 1200);
    assert!(model3d::direct_access_price(&model_b) == 5_000, 1201);
    assert!(model3d::collection_variant_count(&coll) == 2, 1202);

    destroy_model_for_testing(model_a);
    destroy_model_for_testing(model_b);
    let recovered = destroy_collection_for_testing(coll);
    blob::burn(recovered);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

#[test]
fun mint_variant_accepts_16_variants_boundary() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let b = mint_blob(&mut system, sc.ctx());
    let clk = clock::create_for_testing(sc.ctx());

    let mut coll = publish_collection(
        b, s(b"Set"), s(b"set"), default_license(), &clk, sc.ctx(),
    );

    let mut models = vector::empty<Model3D>();
    let mut i = 0;
    while (i < max_variants()) {
        let spec = new_variant_spec(s(b"p"), s(b"{}"), s(b"V"), empty_tags(), 0);
        let m = mint_variant(&mut coll, spec, s(b"cube"), s(b"lin"), false, &clk, sc.ctx());
        vector::push_back(&mut models, m);
        i = i + 1;
    };

    assert!(model3d::collection_variant_count(&coll) == 16, 1300);

    while (!vector::is_empty(&models)) {
        destroy_model_for_testing(vector::pop_back(&mut models));
    };
    vector::destroy_empty(models);

    let recovered = destroy_collection_for_testing(coll);
    blob::burn(recovered);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

#[test, expected_failure(abort_code = model3d::ETooManyVariants)]
fun mint_variant_aborts_when_17th_call_exceeds_cap() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let b = mint_blob(&mut system, sc.ctx());
    let clk = clock::create_for_testing(sc.ctx());

    let mut coll = publish_collection(
        b, s(b"Set"), s(b"set"), default_license(), &clk, sc.ctx(),
    );

    let mut models = vector::empty<Model3D>();
    let mut i = 0;
    while (i < max_variants()) {
        let spec = new_variant_spec(s(b"p"), s(b"{}"), s(b"V"), empty_tags(), 0);
        let m = mint_variant(&mut coll, spec, s(b"cube"), s(b"lin"), false, &clk, sc.ctx());
        vector::push_back(&mut models, m);
        i = i + 1;
    };

    // 17th call — must abort
    let overflow_spec = new_variant_spec(s(b"p"), s(b"{}"), s(b"V"), empty_tags(), 0);
    let overflow_model = mint_variant(
        &mut coll, overflow_spec, s(b"cube"), s(b"lin"), false, &clk, sc.ctx(),
    );

    // Cleanup unreachable on the abort path; required for type-checking the test.
    destroy_model_for_testing(overflow_model);
    while (!vector::is_empty(&models)) {
        destroy_model_for_testing(vector::pop_back(&mut models));
    };
    vector::destroy_empty(models);
    let recovered = destroy_collection_for_testing(coll);
    blob::burn(recovered);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

#[test, expected_failure(abort_code = model3d::ENotCollectionCreator)]
fun mint_variant_rejects_non_creator_sender() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let b = mint_blob(&mut system, sc.ctx());
    let clk = clock::create_for_testing(sc.ctx());

    let mut coll = publish_collection(
        b, s(b"Set"), s(b"set"), default_license(), &clk, sc.ctx(),
    );

    sc.next_tx(OTHER);
    let spec = new_variant_spec(s(b"p"), s(b"{}"), s(b"V"), empty_tags(), 0);
    let model = mint_variant(&mut coll, spec, s(b"cube"), s(b"lin"), false, &clk, sc.ctx());

    destroy_model_for_testing(model);
    let recovered = destroy_collection_for_testing(coll);
    blob::burn(recovered);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

#[test, expected_failure(abort_code = model3d::EVariantParamsJsonTooLong)]
fun variant_spec_rejects_params_json_over_1024_chars() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let b = mint_blob(&mut system, sc.ctx());
    let clk = clock::create_for_testing(sc.ctx());

    let mut coll = publish_collection(
        b, s(b"Set"), s(b"set"), default_license(), &clk, sc.ctx(),
    );

    let spec = new_variant_spec(
        s(b"p"),
        repeat_byte(ASCII_X, max_variant_params_json_len() + 1),
        s(b"V"),
        empty_tags(),
        0,
    );
    let model = mint_variant(&mut coll, spec, s(b"cube"), s(b"lin"), false, &clk, sc.ctx());

    destroy_model_for_testing(model);
    let recovered = destroy_collection_for_testing(coll);
    blob::burn(recovered);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

#[test]
fun variant_spec_accepts_params_json_at_1024() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let b = mint_blob(&mut system, sc.ctx());
    let clk = clock::create_for_testing(sc.ctx());

    let mut coll = publish_collection(
        b, s(b"Set"), s(b"set"), default_license(), &clk, sc.ctx(),
    );
    let spec = new_variant_spec(
        s(b"p"),
        repeat_byte(ASCII_X, max_variant_params_json_len()),
        s(b"V"),
        empty_tags(),
        0,
    );
    let model = mint_variant(&mut coll, spec, s(b"cube"), s(b"lin"), false, &clk, sc.ctx());

    destroy_model_for_testing(model);
    let recovered = destroy_collection_for_testing(coll);
    blob::burn(recovered);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

#[test]
fun publish_collection_then_3_variants_then_share_collection() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let b = mint_blob(&mut system, sc.ctx());
    let clk = clock::create_for_testing(sc.ctx());

    let mut coll = publish_collection(
        b, s(b"Set"), s(b"set"), default_license(), &clk, sc.ctx(),
    );
    let coll_id = object::id(&coll);

    let m1 = mint_variant(
        &mut coll,
        new_variant_spec(s(b"p0"), s(b"{}"), s(b"V0"), empty_tags(), 10),
        s(b"cube"), s(b"l0"), false, &clk, sc.ctx(),
    );
    let m2 = mint_variant(
        &mut coll,
        new_variant_spec(s(b"p1"), s(b"{}"), s(b"V1"), empty_tags(), 20),
        s(b"cube"), s(b"l1"), false, &clk, sc.ctx(),
    );
    let m3 = mint_variant(
        &mut coll,
        new_variant_spec(s(b"p2"), s(b"{}"), s(b"V2"), empty_tags(), 30),
        s(b"cube"), s(b"l2"), false, &clk, sc.ctx(),
    );

    assert!(model3d::collection_variant_count(&coll) == 3, 1500);
    assert!(model3d::collection_id(&m1) == coll_id, 1501);
    assert!(model3d::collection_id(&m2) == coll_id, 1502);
    assert!(model3d::collection_id(&m3) == coll_id, 1503);

    // Models go to shared (Phase 3 frontend will do this in the PTB).
    transfer::public_share_object(m1);
    transfer::public_share_object(m2);
    transfer::public_share_object(m3);
    share_collection(coll);

    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

#[test]
fun publish_and_share_phase2_compatibility() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let b = mint_blob(&mut system, sc.ctx());
    let clk = clock::create_for_testing(sc.ctx());

    model3d::publish_and_share(
        b,
        s(b"sword"),
        s(b"{\"length\":1.0}"),
        s(b"Excalibur"),
        make_tags(2),
        s(b"lineageBlobId123"),
        1_000_000,
        false,
        default_license(),
        &clk,
        sc.ctx(),
    );

    // Verify the shared Model3D matches Phase 2 expectations.
    sc.next_tx(CREATOR);
    let shared_model = sc.take_shared<Model3D>();
    assert!(model3d::creator(&shared_model) == CREATOR, 1600);
    assert!(model3d::direct_access_price(&shared_model) == 1_000_000, 1601);
    assert!(*string::as_bytes(model3d::name(&shared_model)) == b"Excalibur", 1602);
    assert!(*string::as_bytes(model3d::shape_type(&shared_model)) == b"sword", 1603);
    assert!(*string::as_bytes(model3d::lineage_blob_id(&shared_model)) == b"lineageBlobId123", 1604);
    // Degenerate Collection has empty patch_id (whole blob).
    assert!(*string::as_bytes(model3d::patch_id(&shared_model)) == b"", 1605);
    ts::return_shared(shared_model);

    // Verify the degenerate Collection was also shared.
    let shared_coll = sc.take_shared<Collection>();
    assert!(model3d::collection_creator(&shared_coll) == CREATOR, 1610);
    assert!(*string::as_bytes(model3d::collection_slug(&shared_coll)) == b"_legacy", 1611);
    assert!(model3d::collection_variant_count(&shared_coll) == 1, 1612);
    ts::return_shared(shared_coll);

    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

#[test]
fun validate_collection_inputs_royalty_carryover() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let b = mint_blob(&mut system, sc.ctx());
    let clk = clock::create_for_testing(sc.ctx());

    let license = new_license_terms(policy_restricted(), 0, 2500, true, false);
    let mut coll = publish_collection(
        b, s(b"Set"), s(b"set"), license, &clk, sc.ctx(),
    );
    assert!(
        model3d::license_derivative_royalty_bps(model3d::collection_license(&coll)) == 2500,
        1700,
    );

    let spec = new_variant_spec(s(b"p"), s(b"{}"), s(b"V"), empty_tags(), 0);
    let model = mint_variant(&mut coll, spec, s(b"cube"), s(b"lin"), false, &clk, sc.ctx());

    // Royalty carries over from Collection to each Model3D's inherited license.
    assert!(
        model3d::license_derivative_royalty_bps(model3d::license(&model)) == 2500,
        1701,
    );

    destroy_model_for_testing(model);
    let recovered = destroy_collection_for_testing(coll);
    blob::burn(recovered);
    clock::destroy_for_testing(clk);
    system.destroy_for_testing();
    sc.end();
}

// === End-to-end publish + purchase tests (real Walrus Blob) ===
// These exercise the Phase 2 purchase flow under the new struct shape.

#[test]
fun publish_happy_path_sets_creator_and_fields() {
    let mut sc = ts::begin(CREATOR);
    let mut system = system::new_for_testing(sc.ctx());
    sc.next_tx(CREATOR);
    let clk = clock::create_for_testing(sc.ctx());

    let (coll, model) = mint_collection_and_one_model(&mut system, &clk, sc.ctx(), 1_000_000);

    assert!(model3d::creator(&model) == CREATOR, 100);
    assert!(model3d::direct_access_price(&model) == 1_000_000, 101);
    assert!(model3d::is_encrypted(&model) == false, 102);

    destroy_model_for_testing(model);
    let recovered = destroy_collection_for_testing(coll);
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
    let clk = clock::create_for_testing(sc.ctx());
    let (coll, model) = mint_collection_and_one_model(&mut system, &clk, sc.ctx(), 500);

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

    destroy_model_for_testing(model);
    let recovered = destroy_collection_for_testing(coll);
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
    let mut clk = clock::create_for_testing(sc.ctx());
    clock::set_for_testing(&mut clk, 1_000_000);
    let (coll, model) = mint_collection_and_one_model(&mut system, &clk, sc.ctx(), 100);

    sc.next_tx(BUYER);
    let payment = coin::mint_for_testing<SUI>(100, sc.ctx());
    let access = mint_model_access(&model, payment, 86_400_000, &clk, sc.ctx());

    assert!(model3d::access_expires_at_ms(&access) == 1_000_000 + 86_400_000, 300);

    destroy_access_for_testing(access);
    destroy_model_for_testing(model);
    let recovered = destroy_collection_for_testing(coll);
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
    let clk = clock::create_for_testing(sc.ctx());
    let (coll, model) = mint_collection_and_one_model(&mut system, &clk, sc.ctx(), 0);

    sc.next_tx(BUYER);
    let payment = coin::zero<SUI>(sc.ctx());
    let access = mint_model_access(&model, payment, 0, &clk, sc.ctx());
    assert!(model3d::access_holder(&access) == BUYER, 400);
    destroy_access_for_testing(access);

    destroy_model_for_testing(model);
    let recovered = destroy_collection_for_testing(coll);
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
    let clk = clock::create_for_testing(sc.ctx());
    let (coll, model) = mint_collection_and_one_model(&mut system, &clk, sc.ctx(), 777);

    sc.next_tx(BUYER);
    let payment = coin::mint_for_testing<SUI>(777, sc.ctx());
    let access = mint_model_access(&model, payment, 0, &clk, sc.ctx());
    destroy_access_for_testing(access);
    destroy_model_for_testing(model);
    let recovered = destroy_collection_for_testing(coll);
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
    let clk = clock::create_for_testing(sc.ctx());
    let (coll, model) = mint_collection_and_one_model(&mut system, &clk, sc.ctx(), 1_000);

    sc.next_tx(BUYER);
    let payment = coin::mint_for_testing<SUI>(999, sc.ctx());
    let access = mint_model_access(&model, payment, 0, &clk, sc.ctx());
    destroy_access_for_testing(access);

    destroy_model_for_testing(model);
    let recovered = destroy_collection_for_testing(coll);
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
    assert!(max_variants() == 16, 5);
    assert!(max_slug_len() == 64, 6);
    assert!(max_variant_params_json_len() == 1024, 7);
}
