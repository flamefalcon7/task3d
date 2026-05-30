---
name: feat-walrus-cdn-read-cache
description: Front the public Walrus aggregator with a Cloudflare Worker (Method B) at cdn.tusk3d.space so 3D model reads are cached at the edge, fail over across aggregators, and serve from a branded URL. Read path only; no write/storage changes. Frontend URL base is config-driven (VITE_WALRUS_READ_BASE).
status: active
created: 2026-05-28
updated: 2026-05-30
phase: Phase 4 — read-path performance
depth: Standard
---

# Plan-018: Optimize Walrus Blob Read Latency via Cloudflare Worker (Method B)

> **⚠️ Approach changed 2026-05-30 — see [D-073].** This plan originally specified
> **Method A** (a proxied orange-cloud CNAME to the aggregator + Cache Rule, zero code).
> Empirical testing killed Method A on two counts: (1) the Walrus aggregator is itself
> served through Cloudflare, so a proxied CNAME from our zone to it triggers
> **Error 1014 "CNAME Cross-User Banned"**; (2) the aggregator returns **HTTP 403** to a
> Host header it doesn't recognize, which is exactly what a Cloudflare reverse proxy would
> forward. The implementation below is now **Method B (Worker)** — a server-side `fetch()`
> uses the aggregator's own Host/SNI and sidesteps both problems. The Worker source lives in
> `cdn-worker/`.

## Goal
Make 3D model reads from Walrus fast and resilient for global users by fronting a
public Walrus aggregator with a Cloudflare Worker. We are ONLY optimizing the read
path. We are NOT touching how blobs are written/stored.

## Scope boundary (do not expand)
- IN scope: read-path edge caching, the Worker, aggregator failover, frontend URL swap, latency measurement.
- OUT of scope: self-hosting an aggregator or publisher, the write/upload path, Move
  contract changes, zkLogin, Walrus storage-cost optimization.

## Adjacent decision (frontend hosting is NOT in scope of this plan)
The frontend itself does NOT deploy to Walrus Sites for hackathon submission — it ships on Vercel
(or Cloudflare Pages) with a clean URL fronting Vercel via the same `tusk3d.space` Cloudflare zone
used here. Walrus Sites deployment was considered and rejected per **D-070**: b36 URLs are unspeakable in
demo, epoch expiry is a demo-day risk, and the Sui-native story is owned by the data layer (model
blobs on Walrus + Move contract + Sui index + this CDN), not the hosting layer. Don't drift this plan
into frontend-deploy scope; that's a separate decision deliberately settled elsewhere.

## Decisions already made (do NOT re-debate these)
1. **Method B (Cloudflare Worker), not Method A.** Method A is infeasible against the
   aggregator (Error 1014 + Host 403 — see the banner above and D-073). This is settled.
2. Walrus content is immutable (content-addressed by blob ID), so the Worker sets
   `cache-control: public, max-age=31536000, immutable` and stores in the edge Cache API.
   A blob ID's bytes never change; updates = new blob = new ID. No invalidation ever needed.
3. We accept the raw aggregator path shape in the public URL for now
   (`cdn.tusk3d.space/v1/blobs/<blob_id>` and `/v1/blobs/by-quilt-patch-id/<id>`).
   Clean/branded path rewrites are possible later in the same Worker.
4. Aggregator and blob IDs on the Walrus side are unchanged. We only add a Worker cache layer.
5. Origin aggregator(s) are config, not code: the `WALRUS_AGGREGATORS` Worker var holds an
   ordered, comma-separated failover list. Testnet→mainnet is a var change, not a redeploy.

## Background facts (verified, for context)
- Reading via a Walrus aggregator performs NO Sui on-chain action and consumes NO
  gas / SUI / WAL. The read path is free.
- Aggregator read endpoint format: `GET https://<aggregator-host>/v1/blobs/<blob_id>`
- The current frontend aggregator is **testnet**: `https://aggregator.walrus-testnet.walrus.space`
  (see `frontend/src/walrus/aggregator.ts`). plan originally referenced mainnet; we are on
  testnet until the 6/21 submission, so the Worker's primary origin is the testnet host.
- Public aggregators may be temporarily unavailable — Method B's failover list mitigates this
  (Method A could not).
- Cloudflare free plan includes Workers (100k req/day) — sufficient for this use case.
- Mainnet epoch is 2 weeks; blobs expire if not stored for enough epochs (storage concern,
  out of scope here, but noted so reads don't mysteriously 404 later).

## Prerequisites (human actions — Claude Code cannot do these)
- [x] A domain — `tusk3d.space` purchased on Namecheap (2026-05-30).
- [ ] `tusk3d.space` added as a zone in **our** Cloudflare account; Namecheap nameservers
      repointed to the Cloudflare NS pair; zone shows **Active**.
- [ ] A scoped Cloudflare API token (Account→Workers Scripts:Edit, Zone→Workers Routes:Edit,
      Zone→DNS:Edit, limited to the `tusk3d.space` zone), exported as `CF_API_TOKEN` in-session.
- [ ] At least one known-good blob ID to test with (reuse an existing model's blob ID, or
      `walrus store` a small test file).

## Implementation steps

### Step 0 — Verify the aggregator works (already done 2026-05-30)
`curl -sI https://aggregator.walrus-testnet.walrus.space/` → reachable (404 on root is expected;
a real `/v1/blobs/<id>` returns 200). If a chosen aggregator fails, swap it in `WALRUS_AGGREGATORS`.

### Step 1 — Worker source (CODE — already authored in `cdn-worker/`)
- `cdn-worker/src/worker.js` — proxies `GET|HEAD /v1/blobs/*`, edge-caches immutable, fails
  over across `WALRUS_AGGREGATORS`, annotates `x-tusk-cache: HIT|MISS` and `x-tusk-origin`.
- `cdn-worker/wrangler.toml` — name, `compatibility_date`, `WALRUS_AGGREGATORS` var, and the
  `cdn.tusk3d.space` custom-domain route (auto-creates the proxied DNS record on deploy).

### Step 2 — Deploy the Worker (after zone Active + token in-session)
```
cd cdn-worker
CLOUDFLARE_API_TOKEN="$CF_API_TOKEN" npx wrangler deploy
```
`custom_domain = true` on the route makes wrangler create the `cdn.tusk3d.space` DNS record and
bind it to the Worker. No manual DNS or Cache Rule needed (Method A's dashboard steps are gone).

### Step 3 — Swap the frontend read URL (config-driven) — small code change
`frontend/src/walrus/aggregator.ts` currently hardcodes `WALRUS_AGGREGATOR`. Make it read
`import.meta.env.VITE_WALRUS_READ_BASE` with the current testnet host as fallback, then set
`VITE_WALRUS_READ_BASE=https://cdn.tusk3d.space` in the deploy env. The three URL builders
(`glbUrlForSummary`, `glbUrlForToken`) keep their identical `/v1/blobs/...` paths — only the host
source changes. `TelemetryStrip.tsx` picks it up automatically via the canonical import (D-071).

### Step 4 — Verify caching is working
First request (expect MISS), second (expect HIT):
```
curl -sI "https://cdn.tusk3d.space/v1/blobs/<blob_id>" | grep -i x-tusk-cache
curl -sI "https://cdn.tusk3d.space/v1/blobs/<blob_id>" | grep -i x-tusk-cache
```
Expect `x-tusk-cache: MISS` then `HIT`. (Cloudflare's own `cf-cache-status` may read `DYNAMIC`
because we manage caching in the Worker via the Cache API — trust `x-tusk-cache`, which the
Worker sets explicitly.)

### Step 5 — Measure the win (the whole point)
Compare latency direct-to-aggregator vs through the Worker, ideally from a region far from the
aggregator. Capture TTFB, not just total:
```
# Direct (baseline)
curl -s -o /dev/null -w "direct: total=%{time_total}s ttfb=%{time_starttransfer}s\n" \
  "https://aggregator.walrus-testnet.walrus.space/v1/blobs/<blob_id>"
# Worker (warm — run twice, use the second)
curl -s -o /dev/null -w "cached: total=%{time_total}s ttfb=%{time_starttransfer}s\n" \
  "https://cdn.tusk3d.space/v1/blobs/<blob_id>"
curl -s -o /dev/null -w "cached: total=%{time_total}s ttfb=%{time_starttransfer}s\n" \
  "https://cdn.tusk3d.space/v1/blobs/<blob_id>"
```
Record the numbers in session notes / phase-progress. **Honest caveat (D-073):** the aggregator
is *already* on Cloudflare's edge, so the raw RTT win may be modest. The durable wins are our own
immutable cache (HITs survive aggregator slowness/outages), failover, and URL control — measure,
don't assume.

## Acceptance criteria
- [ ] `x-tusk-cache: HIT` on repeat requests through `cdn.tusk3d.space`.
- [ ] Frontend loads models through `cdn.tusk3d.space` (config-driven via `VITE_WALRUS_READ_BASE`, not hardcoded).
- [ ] Worker fails over to a secondary aggregator when the primary returns a non-404 error (manually verifiable by reordering `WALRUS_AGGREGATORS`).
- [ ] Warm cached latency measured and recorded (vs direct), from a distant region.
- [ ] No write/upload code or Walrus storage logic was modified.

## Future enhancements (not now)
- **Clean/branded URLs** (e.g. `cdn.tusk3d.space/model/<name>`) — a path rewrite inside the same
  Worker; do it when blob URLs go into NFT metadata or shared links.
- **Stale-while-revalidate / health-aware failover** — current failover is try-in-order on error;
  could add per-aggregator health caching if a public aggregator becomes chronically flaky.

## Notes / gotchas
- Large model files: the 10 MiB limit is a *publisher (write)* limit, NOT a read limit. Reads
  through the aggregator (and the Worker) have no such cap.
- If a model 404s later, suspect blob epoch expiry (2-week epochs), not the cache. The Worker
  passes a 404 straight through (it does not fail over on 404 — a 404 means the blob is genuinely
  absent, not that the aggregator is down).
- Keep all chosen values (aggregator hosts, blob IDs used for testing) in session notes so a fresh
  session has full context.
</content>
</invoke>
