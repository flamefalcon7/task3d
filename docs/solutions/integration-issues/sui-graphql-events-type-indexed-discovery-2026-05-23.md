---
title: "Sui testnet GraphQL events schema differs from docs; type-indexed ItemListed discovery"
date: 2026-05-23
status: pattern-documented
category: integration-issues
module: frontend-market
problem_type: integration_issue
component: frontend
tags:
  - sui-graphql
  - kiosk
  - events
  - marketplace-discovery
  - schema-introspection
---

## Problem

We needed to discover **all** kiosk listings of our `NftToken` across the
network (not just kiosks we tracked in `localStorage`), to replace the
demo-grade `useListings` discovery (D-041 approach (a)). The official Sui docs
describe an `events(filter: { eventType: ... })` query and an `Event.type`
field. **Both are wrong for the live testnet endpoint** — querying them returns
`GRAPHQL_VALIDATION_FAILED: unknown field "eventType"` and
`Unknown field "type" on type "Event"`.

This is API schema drift: docs (and LLM training data) describe a schema version
that does not match what `https://graphql.testnet.sui.io/graphql` actually
serves as of 2026-05-23. Don't trust the docs — **introspect the live endpoint**.

## Investigation

Introspected the live testnet schema directly:

```python
# POST {query: "query($n:String!){ __type(name:$n){ inputFields{name} fields{name} } }"}
# headers: content-type: application/json, User-Agent: Mozilla/5.0
# (User-Agent matters: the RTK curl hook mangles JSON; use python3 urllib instead of curl)
```

Live `EventFilter` inputFields: `afterCheckpoint`, `atCheckpoint`,
`beforeCheckpoint`, `sender`, `module`, **`type`** (NOT `eventType`).

Live `Event` fields: `contents`, `eventBcs`, `sender`, `sequenceNumber`,
`timestamp`, `transaction`, `transactionModule`. There is **no `Event.type`** —
the event's Move type and payload are reached via `contents` (a `MoveValue`):
`contents { type { repr } json }`.

## Solution

### Working query (filter by full generic type → type-indexed)

```graphql
query($t: String!) {
  events(filter: { type: $t }, first: 50, after: $cursor) {
    nodes {
      contents { type { repr } json }
      sender { address }
      timestamp
      transaction { digest }
    }
    pageInfo { hasNextPage endCursor }
  }
}
```

With `$t = "0x2::kiosk::ItemListed<0x3f53…0861::model3d::NftToken>"` this returns
**only** our token's ItemListed events — kiosk events are type-indexed by the
generic `T`, so the full type filters out all other projects' kiosk listings
(athlete_nft, experience_pass, …) at the indexer. Verified against testnet:
6 events, `hasNextPage=false`, prices correct (e.g. `10000000`), and the known
`place_and_list` tx (`4yit4UFJ…`) appears regardless of any local state.

Event payload shapes (`contents.json`):
- `kiosk::ItemListed<T>` → `{ kiosk, id, price }`
- `kiosk::ItemPurchased<T>` → `{ kiosk, id, price }`
- `kiosk::ItemDelisted<T>` → `{ kiosk, id }`

Filter forms, broad → narrow: `module: "0x2::kiosk"` (all kiosk events incl.
Purchased/Delisted), `type: "0x2::kiosk::ItemListed"` (module+struct, all T),
`type: "0x2::kiosk::ItemListed<…::NftToken>"` (single T). You **cannot** combine
`module` + `type` in one filter — it errors. Use `type` alone for our case.

## Critical caveat: ItemListed is append-only history, NOT current truth

The same item id can appear in **multiple** ItemListed events (relist, or the
token moved to another kiosk after a purchase). A token `0xced9…` showed up in
two different kiosks at two prices in our verification. So you **must not**
render every ItemListed event as an active listing.

Reconciliation pattern we adopted (cheap, robust, reuses existing code):

1. **Discovery**: query `ItemListed<NftToken>` → collect the distinct set of
   kiosk ids that have ever listed our token.
2. **Truth**: for each kiosk, read its current `0x2::kiosk::Listing` dynamic
   fields (existing `fetchListedRefs`) → authoritative still-active listings +
   correct price.
3. **Join**: `joinTokenDetails` per token as before.

Events answer "which kiosks to look at"; dynamic fields answer "what's actually
listed right now". This avoids reconciling Purchased/Delisted ordering by hand.

## Related

- Supersedes the `localStorage` discovery in D-041 approach (a); see [[D-043]].
- Kiosk PTB choreography: `docs/solutions/kiosk-ptb-patterns/confirm-request-hot-potato.md`.
- SDK note: `@mysten/kiosk@1.2.6` `getKiosk` `withListingPrices` decode is broken
  (returns garbage u64s) — another reason we read Listing dynamic fields directly.
