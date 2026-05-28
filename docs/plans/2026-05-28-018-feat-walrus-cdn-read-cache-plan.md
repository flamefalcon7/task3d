---
name: feat-walrus-cdn-read-cache
description: Put a Cloudflare edge cache in front of a public Walrus aggregator (Method A — DNS proxy + Cache Rule, zero application code) so 3D model reads are fast for global users. Read path only; no write/storage changes. Frontend URL base becomes config-driven so a future Worker-based Method B is a one-line swap.
status: active
created: 2026-05-28
phase: Phase 4 — read-path performance
depth: Standard
---

# Plan-018: Optimize Walrus Blob Read Latency via Cloudflare Edge Cache (Method A)

## Goal
Make 3D model reads from Walrus fast for global users by putting a Cloudflare
edge cache in front of a public Walrus aggregator. We are ONLY optimizing the
read path. We are NOT touching how blobs are written/stored.

## Scope boundary (do not expand)
- IN scope: read-path caching, DNS/Cache Rule config, frontend URL swap, latency measurement.
- OUT of scope: self-hosting an aggregator, self-hosting a publisher, the write/upload
  path, Move contract changes, zkLogin, Walrus storage cost optimization.
- This is the "Method A" approach: pure Cloudflare DNS proxy + Cache Rule, ZERO
  application code. A Worker (Method B) is explicitly deferred until we need clean
  URLs or aggregator failover — see "Future: when to migrate to Method B".

## Adjacent decision (frontend hosting is NOT in scope of this plan)
The frontend itself does NOT deploy to Walrus Sites for hackathon submission — it ships on Vercel
(or Cloudflare Pages) with a clean URL fronting Vercel via the same `tusk3d.xyz` Cloudflare zone
used here. Walrus Sites deployment was considered and rejected per **D-070**: b36 URLs are unspeakable in
demo, epoch expiry is a demo-day risk, and the Sui-native story is owned by the data layer (model
blobs on Walrus + Move contract + Sui index + this CDN), not the hosting layer. The demo-talking-track
in D-070 covers this verbally. Don't drift this plan into frontend-deploy scope; that's a separate
decision deliberately settled elsewhere.

## Decisions already made (do NOT re-debate these)
1. Method A (DNS proxy + Cache Rule), not Method B (Worker). Reason: MVP stage,
   fastest path to measuring whether edge caching actually helps. No code to maintain.
2. Walrus content is immutable (content-addressed by blob ID), so cache TTL is set
   to maximum with `immutable`. A blob ID's bytes never change; updates = new blob = new ID.
3. We accept the raw aggregator path shape in the public URL for now
   (e.g. `cdn.<domain>/v1/blobs/<blob_id>`). Clean URLs are a Method B concern, deferred.
4. Aggregator and blob IDs on the Walrus side are unchanged. We only add a cache layer.

## Background facts (verified, for context)
- Reading via a Walrus aggregator performs NO Sui on-chain action and consumes NO
  gas / SUI / WAL. The read path is free.
- Aggregator read endpoint format: `GET https://<aggregator-host>/v1/blobs/<blob_id>`
- Public aggregators exist but may be temporarily unavailable (this is the main
  risk of Method A — single aggregator dependency; accepted for MVP).
- Cloudflare free plan is sufficient for this use case.
- Mainnet epoch is 2 weeks; blobs expire if not stored for enough epochs. (Storage
  concern, out of scope here, but noted so reads don't mysteriously 404 later.)

## Prerequisites (human actions — Claude Code cannot do these)
- [ ] A domain managed in Cloudflare (or a subdomain delegated to Cloudflare).
- [ ] A chosen public Walrus mainnet aggregator host. (Verify it's live first by
      curling a known blob ID through it — see Step 0.)
- [ ] At least one known-good blob ID to test with (store a small test file via
      `walrus store` CLI, or reuse an existing model's blob ID).

## Implementation steps

### Step 0 — Verify the aggregator works (before touching Cloudflare)
Run, replacing placeholders:
```
curl -s -o /tmp/test.bin -w "%{http_code} %{size_download} bytes\n" \
  "https://<aggregator-host>/v1/blobs/<blob_id>"
```
Expect HTTP 200 and a non-zero byte count. If this fails, pick a different public
aggregator before proceeding. Record the working aggregator host in the project's
session notes / CLAUDE.md.

### Step 1 — Point a subdomain at the aggregator (Cloudflare dashboard)
NOTE: This is dashboard config, not code. Document the exact values chosen so a
future session can reproduce them.
- DNS > Records > Add record:
  - Type: CNAME
  - Name: `cdn` (becomes `cdn.<domain>`)
  - Target: `<aggregator-host>`
  - Proxy status: Proxied (orange cloud ON) ← REQUIRED, this is what enables edge caching
- Save.

### Step 2 — Add a Cache Rule (Cloudflare dashboard)
- Caching > Cache Rules > Create rule:
  - Rule name: `walrus-blob-immutable-cache`
  - Match: Hostname equals `cdn.<domain>` AND URI Path starts with `/v1/blobs/`
  - Then:
    - Cache eligibility: Eligible for cache
    - Edge TTL: Override origin — set to a long value (e.g. 1 year / 31536000s)
    - Browser TTL: Override origin — long (e.g. 1 year)
- Deploy.
Rationale: blob content is immutable, so long TTL is always safe; no invalidation needed.

### Step 3 — Swap the frontend read URL (React + BabylonJS) — THIS is the only code change
Find where the app currently builds the Walrus read URL. It likely looks like:
```
const url = `https://<aggregator-host>/v1/blobs/${blobId}`;
```
Change the host to our cached subdomain, keep the path identical:
```
const url = `https://cdn.<domain>/v1/blobs/${blobId}`;
```
- Put the base in an env/config var (e.g. `VITE_WALRUS_READ_BASE=https://cdn.<domain>`),
  do not hardcode, so the Method B migration later is a one-line config change.
- BabylonJS loader call stays the same — only the URL string source changes.
- Grep the codebase for any other place the aggregator host is referenced and update
  all of them to use the same config var.

### Step 4 — Verify caching is working
First request (expect MISS), second request (expect HIT):
```
curl -sI "https://cdn.<domain>/v1/blobs/<blob_id>" | grep -i cf-cache-status
curl -sI "https://cdn.<domain>/v1/blobs/<blob_id>" | grep -i cf-cache-status
```
Expect `cf-cache-status: MISS` then `HIT`. If it stays MISS/DYNAMIC, the Cache Rule
match or TTL override is wrong — recheck Step 2 (path match + edge TTL override).

### Step 5 — Measure the win (the whole point of doing Method A first)
Compare latency direct-to-aggregator vs through-cache, ideally from a region far
from the aggregator:
```
# Direct (baseline)
curl -s -o /dev/null -w "direct:  %{time_total}s\n" "https://<aggregator-host>/v1/blobs/<blob_id>"
# Cached (warm — run twice, use the second)
curl -s -o /dev/null -w "cached:  %{time_total}s\n" "https://cdn.<domain>/v1/blobs/<blob_id>"
curl -s -o /dev/null -w "cached:  %{time_total}s\n" "https://cdn.<domain>/v1/blobs/<blob_id>"
```
Record the numbers in session notes. This confirms whether the read optimization is
worth keeping / extending.

## Acceptance criteria
- [ ] `cf-cache-status: HIT` on repeat requests through `cdn.<domain>`.
- [ ] Frontend loads models through `cdn.<domain>` (config-driven, not hardcoded).
- [ ] Warm cached latency measurably lower than direct-to-aggregator from a distant region.
- [ ] No write/upload code or Walrus storage logic was modified.

## Future: when to migrate to Method B (Worker) — DO NOT do now
Trigger either of these, then revisit:
1. Need clean/branded URLs (e.g. `cdn.<domain>/<blob_id>` or `/model/<name>`) — e.g.
   blob URLs going into NFT metadata or shared links. DNS proxy can't rewrite paths;
   a Worker can.
2. Need aggregator failover — public aggregators go temporarily down; a Worker can
   try a primary then fall back to a secondary aggregator. Method A is locked to one.
Migration cost is low BECAUSE Step 3 used a config var: swap the read base / drop in
a Worker bound to `cdn.<domain>`, frontend untouched.

## Notes / gotchas
- Large model files: the 10 MiB limit is a *publisher (write)* limit, NOT a read limit.
  Reads through the aggregator have no such cap, so it does not affect this task.
- If a model 404s later, suspect blob epoch expiry (2-week epochs), not the cache.
- Keep all chosen values (aggregator host, domain, blob IDs used for testing) in the
  project session notes so a fresh session has full context.
