---
name: feat-s2-telemetry-strip
description: Display-only S2 telemetry strip on the Tusk3D landing page (`/`) showing live Sui event counts and the latest Walrus blob CID, with a build-time baked fallback that always renders on first paint. Stub plan — implementation details, decisions, and open questions live in the linked brainstorm doc.
status: shipped
created: 2026-05-29
phase: Phase 4 — landing page surface
depth: Lightweight (single-unit, brainstorm-only flow)
---

# Plan-021: S2 Telemetry Strip (brainstorm-only redirect)

## Status

**SHIPPED** on branch `feat/s2-telemetry-strip` — commits `e42d002` (initial implementation) + `73f76ad` (ce-code-review fix pass). Awaiting merge to `main`.

## Where the real decisions live

This entry is a deliberate **plan-mode override redirect**. The user explicitly authorized skipping the canonical `ce-plan` step for this display-only, mid-size, hackathon-scoped UI:

> 「ok 你寫完後直接呼叫 ce-work / 做完後再 ce-code-review / 我要去睡了 明早驗收」
> — 2026-05-29 conversation transcript, ce-brainstorm session

The brainstorm document **carries the unit-level decisions** normally captured here (KD-1..KD-7, OQ-S2-1..OQ-S2-3 with resolutions, file inventory, success criteria, dependency / assumption boundaries):

→ **`docs/brainstorms/2026-05-29-s2-telemetry-strip-requirements.md`**

The brainstorm-only flow was a per-task delegation, NOT a generalized exception to the canonical `ideate → brainstorm → plan → implement` workflow. See `feedback_run_ce_plan_after_ideate.md` in agent memory for the standing rule.

## Why this stub exists

`CLAUDE.md` §Workflow Rules / Planning before coding states:

> For work touching > 2 files or introducing new patterns: plan-mode first. Confirm plan with user before implementation. Save approved plans into `docs/plans/<feature-name>.md` if substantial.

This work touched 8 files and introduced two new patterns (build-time baked snapshot, Promise.race timeout). The `ce-plan` step was skipped by explicit user authorization; this stub closes the documentation loop so a future session reading `docs/plans/` finds an entry rather than a silent gap, and can navigate to the actual decision artifact (the brainstorm doc) and the ADR that promotes the new patterns.

## Key artifacts

- **Brainstorm (requirements + unit-level decisions)**: `docs/brainstorms/2026-05-29-s2-telemetry-strip-requirements.md`
- **ADR (architectural pattern promoted)**: D-071 in `docs/decisions.md`
- **Implementation surface**:
  - `frontend/src/landing/TelemetryStrip.tsx`
  - `frontend/src/landing/TelemetryStrip.module.css`
  - `frontend/src/landing/TelemetryStrip.test.tsx`
  - `frontend/src/landing/useTelemetryData.ts`
  - `frontend/src/landing/telemetryFallback.ts`
  - `frontend/src/landing/LandingPage.tsx` (mount)
  - `frontend/src/landing/LandingPage.test.tsx` (doc-order assertion)
- **Code review report**: 9-agent `ce-code-review` run delivered in 2026-05-29 conversation transcript (report-only mode, no run artifact)
- **Phase-progress entry**: `docs/phase-progress.md` 2026-05-29 / 01:55am section

## Scope (already shipped — listed for retrospective)

- Single horizontal monospace strip mounted between TopNav and `<LedeHero />` on `/`
- Five fields: `AS OF · ●live/●cache · L1 MODELS N · L2 NFTS N · WALRUS BLOBS N · LATEST CID bafy…XXX ↗`
- Client-side `queryEvents` sweep against the deployed `model3d::model3d` package on testnet
- Build-time baked fallback rendered immediately on mount; live sweep races a 2s timeout — win swaps to fresh + `●live`, loss/error stays on cache + `●cache`
- Zero-event guard prevents `●live` from pairing with all-zero data after live sweep
- D-044 brutalist editorial tokens (JetBrains Mono, paper #F5F5F0, ink #000, single #FF4500 accent on the live dot)
- Mobile 375px: horizontal scroll, single line preserved

## Out of scope

Documented in the brainstorm doc §"Out of Scope (explicitly)".

## Follow-up work (not blocking 6/21 submission)

Surfaced by 9-agent `ce-code-review` run:

- P2 — direct hook unit tests for `useTelemetryData.ts` (timeout race, pagination cursor loop, AbortController, alive guard). Currently tested only via component-with-mock; the hook's internal async behavior has no automated coverage.
- P2 — reconsider the `walrusBlobs` field in `TelemetrySnapshot` — it's permanently identical to `l1Models`, and the display label "WALRUS BLOBS" diverges from the brainstorm-doc KD-2 spec ("WALRUS N MB"). Either drop the field and render `data.l1Models` directly, or restore the byte-count via a backend snapshot.
- P3 — additional render-contract tests: `formatAsOf` invalid-ISO catch branch, `truncateCid` short-CID ≤10 branch, zero-count rendering, `FALLBACK_TELEMETRY` immutability via `Object.freeze`.
- P3 — pagination silent under-count past 5000 events: emit `console.warn` or carry a `truncated: true` field when the 100-page ceiling fires.
- Cleanup — when D-069 plan-018 CDN ships, `WALRUS_AGGREGATOR` in `frontend/src/walrus/aggregator.ts` updates to `cdn.tusk3d.xyz`; `TelemetryStrip.tsx` picks it up automatically via the canonical-constant import (D-071 SoT rule).
