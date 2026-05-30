# S2 Telemetry Strip — Requirements

**Date**: 2026-05-29
**Status**: Approved (synthesis confirmed; user delegated implementation calls overnight)
**Predecessor**: `docs/ideation/2026-05-28-tusk3d-landing-page-ideation.md` §S2 ("Live AS OF telemetry strip", confidence 88%, complexity Low–Medium)
**Adjacent**: D-044 (brutalist editorial tokens), D-068 (Tusk3D brand), D-069 (Walrus CDN read-cache, plan-018), plan-019 (LedeHero — shipped), plan-020 (KeycapRow — shipped)
**Implementation handoff**: per user direction, this doc is consumed directly by `ce-work` (skipping the canonical `ce-plan` step); brainstorm doc therefore carries unit-level decisions normally captured in a plan.

---

## Summary

S2 is a **single horizontal line of monospace text** mounted between the masthead area and `<LedeHero />` on `LandingPage.tsx`. It renders **live on-chain counters** computed from our package's event log, so a Sui Overflow judge skimming the page in 30 seconds gets unfalsifiable proof that Tusk3D is a deployed working system, not a deck. **Cheapest credibility-per-pixel on the page.**

Visual:

```
AS OF 2026-06-15 14:22 PT · ●live · L1 MODELS 47 · L2 NFTS 312 · WALRUS 18.3 MB · LATEST CID bafy…3kQ ↗
```

One red-orange `#FF4500` accent (the `●live` dot). Everything else black on `#F5F5F0` paper. JetBrains Mono. 1.5px black border, 0 radius, no glow/shadow/gradient.

---

## Problem

Most hackathon submissions are static slide-quality landing pages. A judge cannot tell from the landing page whether the system is actually deployed and used — they have to click in and try, and they often don't. Tusk3D's landing has a beautiful LedeHero and a CARVE/RIFF/BROWSE/INTEGRATE dispatch row, but neither **proves** the chain is live. A telemetry strip with real-time counters reads as proof-of-life in 2 seconds.

This is also the strongest available **Walrus-track-specific** signal on the landing — the `WALRUS N MB` field anchors the submission to the track category visually.

---

## Goals

- A judge landing on `/` sees numbers that **could not have been faked** (chain-verifiable via the package ID and the CID link).
- The `●live` indicator is **honest** — orange means we just fetched in real time; grey means we're showing a cached/baked fallback (e.g., RPC failed).
- The strip survives demo-day failure modes: RPC slow, RPC down, testnet quiet, mobile network.
- Zero motion bling (D-044 forbids it). Numbers update on page mount only.
- Ships in **≤ 1 dev day**, blocking nothing downstream.

## Non-Goals

- Real-time tickers / websocket subscriptions / animated count-up
- A new backend endpoint or any deploy concern beyond the existing frontend
- Walrus aggregator HTTP-API integration
- Server-side rendering / SSR considerations (we ship a Vite SPA per D-070)
- Catching up with `plan-018` (Walrus CDN) — if `cdn.tusk3d.space` is live by S2 ship, the CID link uses it; otherwise it falls back to wal.app. Either is acceptable.

---

## Key Decisions

### KD-1: Data source = client-side fetch, no new backend

The strip queries the chain **from the browser on component mount** via the `SuiGrpcClient` already wired up for `/browse`. No backend endpoint. No cache server. **Reasoning**: zero deploy concern, hackathon budget says don't grow infrastructure for display copy. RPC quota is fine for this scope (one extra round-trip per page-load is negligible vs. existing per-page indexer queries).

Specifically, fetch:
- `queryEvents({ MoveEventType: "<PKG>::model3d::ModelPublished" })` → L1 MODELS = total count; the latest event payload also yields LATEST CID (the `blob_id` field on the published `Model3D`) and the bytes contribution to WALRUS total.
- `queryEvents({ MoveEventType: "<PKG>::model3d::NftTokenMinted" })` → L2 NFTS = total count.
- WALRUS total bytes: sum of the `bytes` field from each `ModelPublished` payload **if the event carries it** (verify during implementation against `contracts/model3d/sources/model3d.move` ~line 537); if not, fall back to blob count (== L1 MODELS, acknowledged redundant — see KD-3).

If Sui events API caps pagination, the implementation iterates pages until exhausted (low N for testnet, fine). If iteration would exceed ~3s, abort and use fallback (KD-4).

### KD-2: Five fields, in this order

```
AS OF <TS PT>  ·  ●live  ·  L1 MODELS <N>  ·  L2 NFTS <N>  ·  WALRUS <N> MB  ·  LATEST CID <bafy…3kQ> ↗
```

- `AS OF <TS PT>`: ISO timestamp, Pacific Time per Sui Overflow handbook convention. Set at fetch time, not page-load time.
- `●live` / `●cache`: status indicator. `●live` is `#FF4500` (the page's only accent instance besides KeycapRow's `BROWSE●` dot — verify accent budget when shipping). `●cache` is `#888`.
- `L1 MODELS <N>`: total count of `ModelPublished` events.
- `L2 NFTS <N>`: total count of `NftTokenMinted` events.
- `WALRUS <N> MB`: total bytes uploaded to Walrus, summed from `ModelPublished` event payloads. Format: 1 decimal place when < 100 MB, integer when ≥ 100 MB.
- `LATEST CID <bafy…XXX> ↗`: truncated CID (first 4 + ellipsis + last 3 chars) hyperlinked to either `https://cdn.tusk3d.space/<cid>` (if plan-018 shipped) or `https://aggregator.testnet.walrus.atalma.io/v1/<cid>` (current testnet aggregator). Opens in new tab. `↗` arrow indicates external link.

Field separator: ` · ` (mono middle-dot with spaces).

### KD-3: WALRUS field — bytes preferred, blob count as fallback

The ideation draft used `WALRUS BLOBS N`. That field is **schema-redundant with L1 MODELS** (1 blob per Model3D). Replacing it with **total bytes** (`WALRUS N MB`) gives a genuinely independent data point AND reinforces the Walrus-track narrative (bytes = the thing Walrus is billed by).

**Verification during implementation**: confirm `ModelPublished` carries a `bytes` field. If it does not, the implementation either (a) drops back to `WALRUS BLOBS N` and accepts the redundancy, or (b) drops the field entirely and runs the strip with 4 fields. Decision deferred to implementation based on what the event schema actually exposes — do not block on this; either fallback is acceptable.

### KD-4: Failure mode = build-time baked snapshot fallback

Ship a `frontend/src/landing/telemetryFallback.ts` constants file with the last known counters, hand-bumped on each meaningful deploy (the bump itself is part of the ship checklist). The component:

1. Renders the baked fallback immediately on mount (so first paint is **never empty**).
2. Fires the live fetch in the background.
3. If the fetch resolves within ~2s, swaps in fresh numbers and shows `●live` orange.
4. If the fetch times out or errors, keeps the fallback rendered with `●cache` grey.

This means: **no broken state ever reaches a judge.** The worst case is a 2s-stale snapshot with an honest grey indicator.

The 2s timeout is wall-clock from fetch start. Implementation uses `Promise.race` against a `setTimeout`. No skeleton state, no loading flicker — the fallback IS the loading state.

### KD-5: No polling, no ticking, fetch-once on mount

Page-load fetches once. Navigation away then back triggers a re-mount → re-fetch. No `setInterval`, no websocket, no animation. D-044 explicitly forbids motion.

### KD-6: Mobile = horizontal scroll, not collapse

Below 640px viewport, the strip overflows horizontally with `overflow-x: auto` and a fade mask on the right edge. Numbers stay legible at their native size; the scroll is intentional and reads as brutalist-functional. **Do not collapse to vertical stacking** — that breaks the "single horizontal line" visual signature.

### KD-7: Mount position = top of `<LandingPage />` main, above `<LedeHero />`

```tsx
<main style={pagePaper} data-testid="landing-page">
  <TelemetryStrip />                {/* NEW */}
  <LedeHero />
  {/* S3 identity mark — future survivor plan */}
  {/* S4 lifecycle strip — future survivor plan */}
  {/* S5 actor cards — future survivor plan */}
  {/* S7 issue masthead — future survivor plan */}
  <KeycapRow />
</main>
```

Position: thin band above the lede. Eye-flow order: telemetry strip (proof) → lede (story) → keycap row (action). When S7 issue masthead lands later, it will sit above the strip; the strip's position relative to LedeHero is stable.

---

## Files Expected

New files:
- `frontend/src/landing/TelemetryStrip.tsx` — the component
- `frontend/src/landing/useTelemetryData.ts` — hook handling fetch + timeout + fallback swap
- `frontend/src/landing/telemetryFallback.ts` — baked snapshot constants (current testnet counters at time of writing — implementation should run a one-time fetch during dev to seed honest numbers, not zeros)
- `frontend/src/landing/__tests__/TelemetryStrip.test.tsx` — render + fallback + link target tests

Modified files:
- `frontend/src/landing/LandingPage.tsx` — one `<TelemetryStrip />` line added, comment removed
- `frontend/src/landing/index.ts` (if it exists; otherwise n/a) — re-export

No changes to: `tokens.ts`, any Move file, any backend file, any `walrus/` file, any `sui/networkConfig.ts`.

---

## Success Criteria

1. `pnpm --dir frontend test` passes with new test file green; existing 697 tests stay green.
2. `pnpm --dir frontend typecheck` clean.
3. On `pnpm --dir frontend dev` + `agent-browser` navigation to `/`:
   - Strip is visible above the LedeHero on first paint (fallback values).
   - Within ~2s the strip updates with real testnet counters and `●live` orange dot.
   - If RPC is artificially blocked (e.g., dev-tools throttle to offline), strip stays on fallback values with grey `●cache` dot — no console error spam, no broken layout.
   - Mobile viewport (375px): strip scrolls horizontally, no vertical collapse.
4. Click on `LATEST CID` opens the configured Walrus URL in a new tab with the actual blob CID.
5. Visual check: D-044 tokens — JetBrains Mono, `#F5F5F0` paper, `#000` ink, 1.5px border, 0 radius, exactly one `#FF4500` instance (the live dot).
6. Accent-budget audit: total `#FF4500` instances on `/` after S2 lands is ≤ 5 (see ideation §"Accent budget").

---

## Open Questions (resolve during implementation, do not block)

**OQ-S2-1**: Does the `ModelPublished` event payload include the `bytes` field? Verify against `contracts/model3d/sources/model3d.move` ~line 537. Resolution per KD-3 — either field works.

**OQ-S2-2**: Has plan-018 (`cdn.tusk3d.space`) shipped by the time S2 lands? If yes, use that URL; if no, use the current testnet aggregator URL. Both should be stored as a single constant in `useTelemetryData.ts` so the swap is one-line later.

**OQ-S2-3**: Pagination — does `queryEvents` cap at 50? If so, the implementation iterates `nextCursor` until exhausted. For testnet counts likely < a few hundred this is trivial; record actual numbers in the test fixture.

---

## Dependencies / Assumptions

- `SuiGrpcClient` is reachable from the browser via the configured testnet endpoint (confirmed by `/browse` working today).
- The Tusk3D testnet package is the canonical source of counts. **Counts include any test mints during dev/QA** — this is a feature, not a bug, since the live-system framing benefits from larger N. If we want a sanitized count later (production-only), filter by event sender; not in scope here.
- The user has accepted that this is **purely a display element** — no transactional logic, no wallet interaction, no Walrus writes from this component.

## Out of Scope (explicitly)

- Any data source other than client-side `SuiGrpcClient` event queries
- Any backend endpoint, including thin caches and snapshot servers
- Animated count-ups, number ticking, websocket subscriptions
- Walrus aggregator HTTP-API direct calls (we read CID/bytes from on-chain event payloads, not from Walrus's own API)
- L3 IntegrationRegistered counter (could become a 6th field in a future S2.1 if integrations land; out of scope tonight)
- Re-flowing accent budget across `BROWSE●` keycap or LedeHero "fork your own →" — those instances stay as-is
- Any change to S6 keycap row, S1 LedeHero, or planned S3/S4/S5/S7 survivors

---

## Next Step

This document is consumed by `ce-work` immediately following save. After `ce-work` completes, `ce-code-review` runs on the diff. End-of-session `phase-progress.md` update follows for morning hand-off.
