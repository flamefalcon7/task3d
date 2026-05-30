# tusk3d-walrus-cdn

Cloudflare Worker that fronts a public Walrus aggregator at **`cdn.tusk3d.space`**,
edge-caching immutable 3D-model blob reads and failing over across aggregators.

Method B per **D-073** (Method A — a proxied CNAME — was impossible: the aggregator is
itself on Cloudflare → Error 1014, and rejects unknown Host headers → 403). Full rationale
and steps: `../docs/plans/2026-05-28-018-feat-walrus-cdn-read-cache-plan.md`.

## What it does

- Proxies `GET|HEAD /v1/blobs/*` (covers `/v1/blobs/<id>` and `/v1/blobs/by-quilt-patch-id/<id>`).
- Caches successful reads in the edge Cache API with `cache-control: public, max-age=31536000, immutable`
  (blobs are content-addressed → immutable → safe forever, no invalidation).
- Fails over across the ordered `WALRUS_AGGREGATORS` list on non-404 origin errors.
- Annotates responses: `x-tusk-cache: HIT|MISS`, `x-tusk-origin: <aggregator>`.
- Everything outside `/v1/blobs/` → 404. Non-GET/HEAD → 405.

## Config

`wrangler.toml` → `[vars] WALRUS_AGGREGATORS` — comma-separated, ordered failover list.
Currently the **testnet** aggregator; swap to mainnet (by 8/27) here, not in code.

## Deploy

Prereqs: `tusk3d.space` is an **Active** zone in our Cloudflare account, and a scoped
API token (Account→Workers Scripts:Edit, Zone→Workers Routes:Edit, Zone→DNS:Edit).

```sh
npm install
CLOUDFLARE_API_TOKEN="$CF_API_TOKEN" npx wrangler deploy
```

`custom_domain = true` on the route auto-creates the `cdn.tusk3d.space` DNS record.

## Verify

```sh
# MISS then HIT
curl -sI "https://cdn.tusk3d.space/v1/blobs/<blob_id>" | grep -i x-tusk-cache
curl -sI "https://cdn.tusk3d.space/v1/blobs/<blob_id>" | grep -i x-tusk-cache
```

(`cf-cache-status` may read `DYNAMIC` — caching is managed in the Worker via the Cache API,
so trust `x-tusk-cache`.)
