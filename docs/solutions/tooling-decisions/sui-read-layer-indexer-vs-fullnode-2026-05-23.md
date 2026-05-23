---
title: "Sui read layer: fullnode by-id vs indexer-backed filter reads"
date: 2026-05-23
category: docs/solutions/tooling-decisions/
module: sui-client
problem_type: tooling_decision
component: tooling
severity: high
applies_when:
  - "Showing post-purchase confirmation without waiting for indexer lag"
  - "Reading a known object id or tx digest immediately after signAndExecute resolves"
  - "Choosing between Sui JSON-RPC and GraphQL for a read"
  - "Building any post-tx UX path where the Mysten public GraphQL indexer's seconds-of-lag would be user-visible"
tags:
  - sui
  - fullnode-rpc
  - graphql
  - indexer
  - post-tx-ux
  - dapp-kit
  - kiosk
---

# Sui read layer: fullnode by-id vs indexer-backed filter reads

## Context

During D-043 (post-buy confirmation in `/market`), the goal was to show a
freshly purchased `NftToken` in "Your cars" immediately after `kiosk::purchase`
committed — without waiting for the Mysten GraphQL indexer to catch up. The
initial proposal reached for Sui GraphQL's `object(address:)` query on the
theory that a per-object lookup "bypasses the owner-index filter." The user
corrected this: **all Sui GraphQL queries — including point lookups by object
address — are served from the indexer database, not directly from the
fullnode.** A read-only spike against testnet confirmed it and put numbers on
each layer.

Spike results (testnet, 2026-05-23):

| Read | Layer | Latency |
|---|---|---|
| `sui_getObject(id, {showContent,showOwner,showType})` | fullnode JSON-RPC, by-id | **318 ms** |
| `sui_getTransactionBlock(digest, {showEffects,showObjectChanges})` | fullnode JSON-RPC, by-digest | **263 ms** |
| GraphQL `events(filter:{type:"0x2::kiosk::ItemListed<…>"})` | GraphQL, indexer-backed | **923 ms** (plus indexer-vs-fullnode lag, see below) |

The distinction that matters is **by-id vs by-filter**, not JSON-RPC vs GraphQL.

## Guidance

When you know the object id or transaction digest, use fullnode JSON-RPC
directly and skip the indexer entirely. When you need to discover objects by
attribute (owner, type, event filter), use GraphQL or an indexer — and accept
that lag is part of the deal.

**Right path — fullnode RPC by id, ~300 ms, no indexer lag:**

```ts
// dapp-kit's useSuiClient() returns the project's SuiJsonRpcClient
// (wired in frontend/src/auth/WalletProvider.tsx)
const suiClient = useSuiClient();

const resp = await suiClient.getObject({
  id: tokenId,
  options: { showContent: true, showOwner: true, showType: true },
});
// resp.data is available within ~300 ms of fullnode commit — no indexer wait
const token = parseOwnedNftToken(resp);
```

If you only have the digest (e.g. from `signAndExecute`'s return), pull the
relevant object ids from `objectChanges` first:

```ts
const txResp = await suiClient.getTransactionBlock({
  digest,
  options: { showEffects: true, showObjectChanges: true },
});
const created = txResp.objectChanges?.filter(c => c.type === 'created') ?? [];
// then getObject on each id you care about
```

**Wrong path for "I know the id" — still indexer-backed:**

```ts
// Do NOT use this when you already have the object id.
const resp = await fetch(GRAPHQL_ENDPOINT, {
  method: 'POST',
  body: JSON.stringify({
    query: `query($id: SuiAddress!) { object(address: $id) { contents { ... } } }`,
    variables: { id: tokenId },
  }),
});
// This hits the indexer DB — same lag shape as any other indexer query.
```

## Why This Matters

- Mysten's public GraphQL indexer lags the fullnode. On testnet during this
  session the gap was measured at multiple seconds; the worst observed gap
  exceeded a minute, though that observation also coincided with a separate
  client bug that was silently no-opping refetches, so the true tail is
  somewhere "seconds, occasionally longer under load." Either way the lag is
  non-zero and unpredictable.
- For post-transaction UX — "show the thing the user just bought/minted" —
  that lag is directly visible as a broken or frozen UI. The user just paid
  gas; "wait 30s" is not an acceptable confirmation experience.
- The two layers have different SLAs. Calling them both "the Sui API" loses
  load-bearing information. Fullnode RPC answers the moment the object exists
  on-chain; the indexer answers when its pipeline has caught up.
- GraphQL is the "newer" API and gets reached for by reflex. **For by-id reads
  it is strictly worse latency than fullnode JSON-RPC** — it adds the indexer
  DB round-trip on top of the same underlying data.

## When to Apply

**Use fullnode `getObject` / `getTransactionBlock` when:**

- You are in the `onSuccess` / `.then()` handler of `signAndExecute` — the
  digest is in scope, and usually the relevant object id was passed into the
  PTB builder.
- The UI received an object id from a route param, a prior listing response,
  or a prior tx return value.
- You need the data to be consistent with what just committed — indexer
  staleness would be a user-visible bug.

**Use GraphQL / indexer when:**

- You have no id and need discovery by filter: `owner → [objectIds]`,
  `type → [objectIds]`, event streams, historical queries.
- The use case tolerates seconds of lag (background refresh of a marketplace
  view, leaderboards, analytics).
- You need rich filtering, pagination, or joins — fullnode RPC has no
  equivalent.

The rule is not "avoid GraphQL." It is: **don't reach for GraphQL when a by-id
fullnode call would do**, because you pay indexer lag for zero benefit.

## Examples

**Before (D-043 first iteration, broken UX):** `MarketPage` relied on a poll
loop after purchase — up to 10 × 1.5 s = 15 s of `setReloadKey` bumps waiting
for the indexer's owner-filtered view to surface the buyer's new token. On
testnet the indexer was frequently still stale at the end of the window;
"Your cars" stayed empty after a confirmed purchase. Slow AND unreliable.

**After (D-043 shipped):** `MarketPage.onBuy` resolves the bought token
directly from the fullnode in the purchase callback (`frontend/src/market/MarketPage.tsx`):

```ts
const suiClient = useSuiClient();

const onBuy = async (listing: Listing) => {
  setConfirmStatus('pending');
  const { digest } = await signAndExecute({ transaction: buildPurchaseTx(listing) });

  // tokenId is known from the listing — go straight to fullnode, skip indexer.
  const resp = await suiClient.getObject({
    id: listing.tokenId,
    options: { showContent: true, showOwner: true, showType: true },
  });

  const token = parseOwnedNftToken(resp); // SuiObjectResponse → app NftToken
  injectBoughtToken(token);                // merges into local sellable state
  setConfirmStatus('confirmed');           // ⏳ syncing → ✅ confirmed banner
};
```

`parseOwnedNftToken` reads `content.fields` (the Move struct fields),
`owner.AddressOwner`, and `type` from the `SuiObjectResponse`. The bought
token appears in "Your cars" within ~300 ms of tx finality, regardless of
indexer state. The poll loop remains as a secondary safety net for the rest of
`useListings` / `useOwnedTokens`, not as the primary UX path.

## Related

- `docs/solutions/integration-issues/sui-graphql-events-type-indexed-discovery-2026-05-23.md`
  — concrete example of the **by-filter / indexer** path: a verified GraphQL
  `events(filter:{type})` query for `kiosk::ItemListed<NftToken>` discovery.
  Its reconciliation section ("events for discovery, dynamic fields for truth")
  is itself an instance of the rule formalized here.
- `docs/solutions/tooling-decisions/mysten-sui-client-split-jsonrpc-grpc-2026-05-15.md`
  — establishes that `SuiJsonRpcClient` (from `@mysten/sui/jsonRpc`) is the
  handle for fullnode JSON-RPC, and `SuiGrpcClient` is the forward-compatible
  alternative. dapp-kit's `useSuiClient()` returns one of these — that's the
  client class you call `getObject` / `getTransactionBlock` on.
