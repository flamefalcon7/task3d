# spike — tx_digest probe (Phase 4 U1)

Throwaway Move package that resolves plan-007 U1.f: can `RoyaltyPaid` events carry the same `tx_digest` value that off-chain indexers see for the transaction that emitted them?

The package will be discarded after U1 — do not import or extend.

## Run the spike

```sh
cd contracts/throwaway-spike
sui move build
sui client publish --gas-budget 50_000_000
# Capture the PackageID from publish output → call it SPIKE_PKG.

sui client call \
  --package "$SPIKE_PKG" \
  --module spike \
  --function emit_test_event \
  --gas-budget 10_000_000
# Capture the txDigest from the call output → call it CALL_DIGEST.

# Read the event back and compare its tx_digest field with CALL_DIGEST.
sui client events --tx-digest "$CALL_DIGEST"
```

## Outcomes feeding plan-007

| Probe result | Plan-007 path |
|---|---|
| `TestEvent.tx_digest` (Move-side, from `tx_context::digest(ctx)`) byte-equal to the call's `txDigest` returned by the RPC | **(a) tx_digest available** — keep `RoyaltyPaid.tx_digest: vector<u8>`; U8 filter uses it. |
| Compile fails (`tx_context::digest` not exposed in our Sui framework version) | **(b) fallback** — switch to `event_seq + tx_sender` / nonce param / buyer-only filter. |
| Compile OK but value differs from the RPC-returned digest | **(b) fallback** — same; the in-Move digest is unusable as a cross-system join key. |

Record the result in `docs/reports/phase-4-day-1-verification.md`.
