module foreign_witness::foreign_witness;

use sui::package;

// OTW for the foreign-witness package. Identical shape to model3d's MODEL3D
// OTW but lives in a different package, so `package::from_package<Model3D>`
// returns false on the resulting Publisher — which is the exact predicate
// plan-007 U3's `ensure_transfer_policy` asserts on.
public struct FOREIGN_WITNESS has drop {}

fun init(otw: FOREIGN_WITNESS, ctx: &mut TxContext) {
    let publisher = package::claim(otw, ctx);
    transfer::public_transfer(publisher, ctx.sender());
}

// Test-only entry to construct a Publisher when the production `init`
// can't run (test scenario doesn't publish packages). `model3d`'s test
// suite uses this to obtain a Publisher whose package address differs
// from `model3d::Model3D`'s package address, then passes it to
// `model3d::ensure_transfer_policy` to verify the abort branch fires.
#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(FOREIGN_WITNESS {}, ctx)
}
