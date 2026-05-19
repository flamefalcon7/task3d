module spike::spike;

use sui::event;

public struct TestEvent has copy, drop {
    sender: address,
    tx_digest: vector<u8>,
    epoch: u64,
    epoch_timestamp_ms: u64,
}

public entry fun emit_test_event(ctx: &mut TxContext) {
    event::emit(TestEvent {
        sender: tx_context::sender(ctx),
        tx_digest: *tx_context::digest(ctx),
        epoch: tx_context::epoch(ctx),
        epoch_timestamp_ms: tx_context::epoch_timestamp_ms(ctx),
    });
}
