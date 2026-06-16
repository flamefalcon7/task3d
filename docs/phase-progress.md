# Phase Progress

## Last Updated: 2026-06-16 23:58 (**feat: PreviewCanvas GLB-load wireframe overlay shipped (plan-2026-06-16-001)**)

### Hackathon Tracker
- Days to submission (6/21): **~5** · demo day (7/20–21): ~34 · winners (8/27): ~72

### Current Phase
Phase 5 — UX polish window.

### Completed This Session (continued)
- **Loading-overlay feature shipped** on branch `feat/preview-loading-overlay` (commit `d3a444a`). Plan `docs/plans/2026-06-16-001-feat-preview-canvas-loading-overlay-plan.md` executed U1–U4:
  - **U1** new shared `frontend/src/babylon/WireframeLoadingOverlay.tsx` + `.module.css` (animated wireframe cube, `prefers-reduced-motion` fallback mirroring `IndeterminateBar`).
  - **U2** wired into `PreviewCanvas` via `meshLoaded` state; overlay shows only when `mounted && glbUrl && !meshLoaded`; cleared on success/failure/superseded loads, all token-gated (no stuck spinner). 5 new race/dispose/null tests.
  - **U3** `TaggingCanvas` refactored onto the shared component (its `tagging-canvas-loading` behavior preserved, gains the animation; dead inline styles + unused `CSSProperties` import removed).
  - **U4** typecheck clean; 155 babylon tests green; headed-browser verified on `/dev/compare` — 8 overlays render during load (animated cube), clear after; gray wells (D-107) confirmed live.
- Known pre-existing dev-only warning: `CompareGlbsPage` wraps PreviewCanvas in a `<button>` → `<div>`-in-`<button>` hydration warning (not introduced here; dev page only).

### Next Concrete Step
Decide review depth (frontend roster incl. `ce-julik-frontend-races-reviewer` per CLAUDE.md) and merge `feat/preview-loading-overlay` → main. D-107 (commits `364b3f0`/`711807f`) is still on `main` directly from earlier.

### Notes for Next Session
- The race paths (stale-token, error, dispose) are unit-tested in `PreviewCanvas.test.tsx` → "load overlay" describe block.

---

## Last Updated: 2026-06-16 23:20 (**D-107: viewer-well default bg black → GRAY (global + encrypted snapshot)**)

### Hackathon Tracker
- Days to submission (6/21): **~5** · demo day (7/20–21): ~34 · winners (8/27): ~72

### Current Phase
Phase 5 — UX polish window.

### Completed This Session
- **D-107 — viewer-well default background gray (amends D-044).** Single `DEFAULT_BG` constant in `frontend/src/babylon/bgPalette.ts`; `PreviewCanvas` + `TaggingCanvas` default props + `useBgCycle` fallback now reference it. Default well backdrop is mid-gray across all PreviewCanvas/TaggingCanvas mounts (`/create`, `/market`, `/model`, collection, NFT, `/track`-tagging) and the **encrypted-base watermarked snapshot** (inherits `scene.clearColor` at capture — no override needed). `--well` CSS token stays `#000` (deferred). Tests updated (`bgPalette.test.tsx`, `PreviewCanvas.test.tsx`); `design-tokens.md` line 54 amended. Typecheck + 62 babylon/browse tests green.
- **Open brainstorm:** `docs/brainstorms/2026-06-16-preview-canvas-loading-state-requirements.md` — GLB-load spinner (wireframe-cube pulse) inside PreviewCanvas; not yet planned/implemented. Note: `TaggingCanvas` already ships a load-overlay pattern (`TaggingCanvas.tsx:114`) worth reusing.

### Next Concrete Step
Commit D-107, then (optional) `/ce-plan` the PreviewCanvas loading-state brainstorm.

### Notes for Next Session
- D-107 moved only the Babylon `clearColor` default; if the `--well` CSS frame should also go gray, that's a follow-up design-token decision.

---

## Last Updated: 2026-06-16 23:10 (**✅ END-TO-END LIVE: full stack deployed + paid Tripo generation verified working on `tusk3d.store` (D-105 + D-106)**)

### Hackathon Tracker
- Days to submission (6/21): **~5** · demo day (7/20–21): ~34 · winners (8/27): ~72

### Current Phase
Phase 4 — **submission stack is LIVE and generation works end-to-end on testnet.** Long deploy + bugfix session.

### Completed This Session (the whole arc)
- **Deployed the full stack** (D-105): frontend → Cloudflare Pages (`tusk3d.store`), backend → DO droplet `152.42.213.241` (Caddy `tls internal` + CF "Full" → Node:3001, systemd, swap), same-origin `/api` Pages-Function proxy (no CORS). Domain corrected `.space → .store`.
- **Fixed live 524** (D-106): generation was a single ~7-min synchronous request crossing Cloudflare's 100s cap. Made it **async (dispatch→202 jobId, poll `/result/:jobId`)** with a bounded in-memory job store. Backend 398 + frontend 1207 tests green.
- **Verified paid generation END-TO-END on production**: user paid SUI → preview appeared → Tripo balance dropped 340→280 (one full base+segmentation chain). 🎉
- **Honest credit-dry copy**: pre-flight already blocks (no charge) when the operator's Tripo credits are dry, but said "temporarily unavailable — try again shortly" (misleading). Now: *"Generation credits are exhausted for now. You can still upload your own model manually (.glb)."* — points to the no-Tripo path.
- **`VITE_COPILOT_ENABLED=true`** set in CF Pages (Riff Copilot UI surfaced; behind wallet login).
- Added backend failure logging (was silently swallowing classified errors — the deploy blind-spot).

### Next Concrete Step
- Demo prep: the live arc (`/ → /create generate → /launch → /market → /track`) + the agent MCP arc (`claude mcp add tusk3d https://api.tusk3d.store/mcp`). Monitor Tripo credits (280 left, ~55–60/gen).

### Blockers / Open Questions
- **Pre-flight stale-cache gap (KNOWN, NOT fixed — user chose wording over code change)**: a warm cache showing a stale-high balance can pass a generation that the real (lower) balance can't finish → charges SUI for a doomed run. Mitigated by honest copy + the fact it self-corrects within ~60s. The code fix (live re-query near threshold) was drafted then reverted at user request. Revisit post-submission.
- OQ-035 (copilot availability should derive from backend) — post-submission.
- Accepted D-106 residual: backend restart mid-generation loses that in-flight job.

### Notes for Next Session
- **Ops**: SSH `ssh -i ~/.ssh/id_tusk3d tusk@152.42.213.241`; redeploy backend `… '~/app/deploy.sh'`; logs `journalctl -u tusk3d-api -f`. Frontend = `git push` (CF auto-build). **Always `pnpm --filter backend... build` locally before deploy** (tsc checks tests; vitest doesn't).
- Tripo account credits deplete ~55–60/generation; top up at api.tripo3d.ai before demo day.
- Pre-flight threshold = 120cr (`TRIPO_PREFLIGHT_MIN_CREDITS` to override).

---

## Last Updated: 2026-06-16 21:05 (**D-106: async (dispatch+poll) generation — fixes live 524 on /create; backend deployed, frontend redeploying**)

### Hackathon Tracker
- Days to submission (6/21): **~5** · demo day (7/20–21): ~34 · winners (8/27): ~72

### Current Phase
Phase 4 — post-deploy bugfix. Live `/create` generation 524'd (paid SUI, no model). Root-caused + fixed.

### Completed This Session (D-106)
- **Root cause**: backend polls Tripo up to ~7 min (`generators/tripo.ts`: 180s base + 240s seg) but Cloudflare aborts proxied requests at ~100s → **HTTP 524** before the synchronous `POST /api/generate` returns. Not payment/Tripo/key (all verified fine: Tripo balance 200/0.33s from VM, treasury+fee config matches frontend). The 524 was the only clue (backend silently swallowed errors — now logged).
- **Fix (D-106)**: generation is **async** — `POST /api/generate` verifies payment synchronously then returns **202 `{jobId}`**; Tripo runs in the background; client polls **`GET /api/generate/result/:jobId`** every 3s (poll-first-then-sleep). Every HTTP hop <5s → no CDN timeout.
- **New** `backend/src/lib/generate-jobs.ts` — in-memory store, bounded 3 ways (delete-on-fetch, TTL sweep unref'd 15min, hard cap 30, oldest-eviction). `generate.ts` split into POST dispatch + GET result (owner-scoped); reused D-083 Tripo error taxonomy in the bg job.
- **Frontend** `lib/api.ts` `generate()` → dispatch+poll; same `GenerateError` mapping so page copy unchanged. `shared`: `GenerateDispatchResponse` + `GenerateJobResult`.
- **Tests** migrated to async shape: backend **398 green**, frontend **1207 green**, typecheck + full `tsc` build clean. (Caught a test-helper type error only `tsc` build surfaces, not vitest — fixed.)
- Backend **deployed to VM** (`724e7bf`), endpoints verified live (POST 401 / GET result 401 / proxy forwards). Frontend CF Pages rebuild in flight.

### Next Concrete Step
- Confirm frontend bundle redeployed, then **user retries a paid generation** at `tusk3d.store/create` (Slush) — expect it to complete (no 524). Each attempt costs 0.4 SUI.

### Blockers / Open Questions
- Accepted residual (D-106): backend restart mid-generation loses that in-flight job (digest already spent → refundable/contact path). Rare on single VM.
- OQ-035 (copilot availability should derive from backend) still open, post-submission.

### Notes for Next Session
- Redeploy backend: `ssh -i ~/.ssh/id_tusk3d tusk@152.42.213.241 '~/app/deploy.sh'`. **Always run `pnpm --filter backend... build` locally before deploy** — `tsc` build type-checks test files (vitest/esbuild does not).
- `VITE_COPILOT_ENABLED=true` is set in CF Pages (D-106 session); copilot UI is behind wallet login (verify in real Chrome, not agent-browser).

---

## Last Updated: 2026-06-16 19:10 (**🚀 FULL STACK DEPLOYED LIVE — frontend + backend + same-origin /api proxy all green on `tusk3d.store`**)

### Hackathon Tracker
- Days to submission (6/21): **~5** · demo day (7/20–21): ~34 · winners (8/27): ~72

### Current Phase
Phase 4 — **submission stack is LIVE on testnet.** Executed D-105 runbook end-to-end this session.

### Completed This Session (deploy execution)
- **Frontend LIVE**: `https://tusk3d.store` (Cloudflare Pages, GitHub auto-build from `main`). HTTP 200. Fixed two build blockers: wrong workspace filter (`@overflow2026/frontend` → `frontend`) and the Namecheap parking DNS records (A `192.64.119.23` + CNAME `parkingpage.namecheap.com`) that caused 522/525 — deleted them, added the domain via Pages → Custom domains.
- **Backend LIVE**: `https://api.tusk3d.store` on DO droplet **`152.42.213.241`** (1 GB, Singapore, Ubuntu 24.04.3). Caddy (`tls internal`) → Node :3001, `systemd` unit `tusk3d-api`, 2 GB swap, UFW (22+443). CF SSL mode **Full**. `/llms.txt` 200, `GET /mcp` 405. MemWal loaded (no unconfigured banner).
- **Frontend↔backend wired**: app uses relative `/api/*`; added a **Pages Function** `functions/api/[[path]].js` forwarding `tusk3d.store/api/*` → `api.tusk3d.store/api/*`. Same-origin ⇒ **CORS bypassed** (backend's localhost-only CORS untouched). Verified: `POST /api/auth/challenge` → `{"nonce":...}` 200.
- **One-command deploys ready**: VM `~/app/deploy.sh` (git pull → `pnpm --filter backend... build` → restart). Frontend = `git push`.
- **Deploy key**: `~/.ssh/id_tusk3d` (local) authorized for `root` + `tusk` on the VM.
- Docs synced: D-105 live-deploy addendum + runbook A8 (proxy) + A5 note (tls internal vs Origin cert).

### Next Concrete Step
- **Functional end-to-end test** (infra is up; app flows not yet exercised live): wallet sign-in in the user's own Chrome (Slush) at `tusk3d.store`, then the agent arc `claude mcp add tusk3d https://api.tusk3d.store/mcp` → search → buy (testnet) → decrypt.

### Blockers / Open Questions
- **`www.tusk3d.store`** not added (apex works). Optional: add in Pages → Custom domains, or a www→apex redirect.
- **VITE_* on CF Pages**: confirm wallet/zkLogin env (`VITE_ENOKI_API_KEY`, `VITE_GOOGLE_CLIENT_ID`) are set in Pages → Variables, else only Slush works. `VITE_TEST_WALLET` MUST stay unset in prod.
- Optional hardening (post-6/21): CF Origin cert + Full (Strict); restrict VM :443 to Cloudflare IP ranges; GitHub-Actions auto-deploy; `cdn.tusk3d.store` Worker; mainnet swap.

### Notes for Next Session
- SSH: `ssh -i ~/.ssh/id_tusk3d tusk@152.42.213.241`. Logs: `journalctl -u tusk3d-api -f`. Redeploy backend: `ssh -i ~/.ssh/id_tusk3d tusk@152.42.213.241 '~/app/deploy.sh'`.
- VM `backend/.env` was scp'd from local + 3 overrides appended (`PUBLIC_ORIGIN`, `TUSK_DB_PATH=/home/tusk/data/quota.db`, `MCP_TRUST_FORWARDED=true`). Never clobber it.

---

## Last Updated: 2026-06-16 18:00 (**ce-brainstorm: app deployment plan — CF Pages + DO VM + domain `tusk3d.store`; ADR D-105 + runbook written**)

### Hackathon Tracker
- Days to submission (6/21): **~5** · demo day (7/20–21): ~34 · winners (8/27): ~72

### Current Phase
Phase 4 — pre-submission deploy planning. Session was brainstorm + docs (one small code change: domain switch). No backend logic changed.

### Completed This Session
- **Deployment topology decided (ADR `D-105`)**: frontend → **Cloudflare Pages** (CF-cloud build from GitHub `main`); backend → **single DigitalOcean droplet** (1 GB + swap) behind **CF orange proxy → Caddy (CF Origin cert, Full Strict) → Node :3001**, **systemd**-managed; deploy model = **manual `deploy.sh` + systemd** (Actions/Docker rejected for the 5-day window).
- **End-to-end runbook written**: `docs/runbooks/app-deploy.md` — one-time setup (CF zone, droplet, runtime, TLS, secrets, systemd, CF Pages) + recurring deploy + smoke test + rollback + troubleshooting + env inventory.
- **Domain correction `tusk3d.space → tusk3d.store`** (user holds `.store`, never `.space`): switched the **5 functional refs** (test fixture `llms.test.ts`, 3 code comments, `cdn-worker/wrangler.toml` route); historical docs left as records. `llms.test.ts` green (4/4).
- **Key code-truths verified for the runbook** (not assumed): backend holds **no signing key** (returns unsigned PTBs; TRIPO_FEE_* are addresses) → VM needs no wallet key; backend keeps a **`node:sqlite`** quota DB (`TUSK_DB_PATH`) = persistent state to keep outside rebuilds; **zero native npm modules** → on-VM build compiles nothing; MCP/llms URLs honor `PUBLIC_ORIGIN`.

### In Progress
- Nothing mid-flight. Runbook ready to execute; D-105 Accepted.

### Next Concrete Step
- **Suggest commit** of this session (domain switch + D-105 + runbook + phase-progress), then **execute Part A1 first** (add `tusk3d.store` zone to Cloudflare + repoint registrar nameservers — propagation lag, start before everything else).

### Blockers / Open Questions
- MCP agent interface (D-104) is **already merged into `main`** (merge `c6d0080`, 2026-06-11; `backend/src/mcp/server.ts` + `/mcp` route on main; no feature branch remains). Deploy ships `main` as-is — the public `/mcp` hero demo is included. (An earlier phase-progress note said "unmerged"; that predated the 06-11 merge.)
- Deferred (post-6/21): `cdn.tusk3d.store` Worker; GitHub-Actions auto-deploy; mainnet contract swap.

### Notes for Next Session
- Deploy-specific env overrides for the VM: `PORT=3001`, `PUBLIC_ORIGIN=https://api.tusk3d.store`, `TUSK_DB_PATH=/home/tusk/data/quota.db`, `MCP_TRUST_FORWARDED=true`. Secrets copied (not regenerated) from local `backend/.env`.
- `node:sqlite` emits an "experimental" warning on Node 22.22.3 but loads **unflagged** — runbook covers the version-gate caveat.

---

## Last Updated: 2026-06-10 19:25 (**ce-work execution: MCP agent interface SHIPPED on feat/mcp-agent-interface — U0–U8 complete + Tier-2 review + all validated findings fixed**)

### Hackathon Tracker
- Days to submission (6/21): **11 of 38** · demo day (7/20–21): ~40 · winners (8/27): ~78

### Current Phase
Phase 4 — feature/UX polish. Plan `docs/plans/2026-06-10-001-feat-mcp-agent-interface-plan.md` (D-104) fully executed on branch **`feat/mcp-agent-interface`** (12 commits, NOT pushed/merged yet).

### Completed This Session
- **U0 precheck PASSED**: live testnet package `0xbf0affb8…` confirmed as the D-085 republish (on-chain prevTx == v12 publish digest `9gzrkk2s…`); 32-byte seal_id gate live. No republish needed.
- **U1**: `buildPurchaseAccessPtb` + `jsonToSummary` lifted to `shared/` (packageId-parameterized; frontend re-points via thin wrapper).
- **U2**: stateless MCP server at `/mcp` (`@modelcontextprotocol/sdk@1.29.0`, WebStandard transport, per-request server, scoped CORS mounted before global CORS). No hono bump needed.
- **U3**: bearer auth via `authInfo` seam → `requireAgentSub` (tool-level errors, not 401s) + per-address rate limit (120/min, capped map, unref sweep).
- **U4–U6**: all six tools — search_models (MemWal, global/personal, fail-soft degraded), get_model (+`unwrapMoveFields` for JSON-RPC nested structs — KEY: shared jsonToSummary expects GraphQL-flat), get_license_terms, get_preview (W-4 charset), build_purchase_tx (unsigned dry-run-validated PTB, KTD-7, Move-precondition fast-fails), download_content (fail-closed entitlement gate per capVerifier pattern, fullnode by-id, D-085 mirror, W-9 asserted in tests).
- **U7**: `frontend/scripts/agentDecrypt.ts` (+CLI `agent-decrypt.ts`) — agent-side Seal decrypt to `samples/<modelId>.glb`; invocation: `AGENT_SECRET_KEY=suiprivkey1… pnpm --dir frontend exec tsx scripts/agent-decrypt.ts <json|->`.
- **U8**: `/llms.txt` manifest (request-origin-derived URL + PUBLIC_ORIGIN/x-forwarded override).
- **Tier-2 ce-code-review** (9 personas + 2 CE agents + 10 validators): all validated findings FIXED in `365ec25` + `2af2842`, incl. llms.txt auth wording (P1), denylist/over-fetch parity in search_models, on-chain-verified global mirror (SEC-1: /remember now reads chain before mirroring), per-IP cap on /mcp (RATE-1), fullnode read timeouts, GET→405 (transport leak), guarded() error wrapper, shared tools/common.ts.
- Also: fixed pre-existing tripo.test.ts timeout drift (3271d2f).

### In Progress
- Nothing mid-flight. Branch ready for user review + merge/PR.

### Next Concrete Step
- **User reviews + merges `feat/mcp-agent-interface`** (or asks for a PR), then: fund a fresh agent keypair on testnet faucet and run the hero demo arc end-to-end in Claude Code (search → license check → buy → decrypt → samples/) against the live backend.

### Blockers / Open Questions
- Demo prep (not build blockers): testnet E2E of the full arc; verify `/mcp` also works in Cursor for the 5-second "standard, not bespoke" beat (plan OQ).
- Accepted residuals (advisory, in review report): per-process limiters don't span workers (R-003); `decryptKeyWithRetry` burns 4 retries on permanent NoAccessError (**pre-existing**, untouched); agent-side fetch has timeout but no host allowlist/size cap; shared `buildPurchaseAccessPtb` is now 2-arg (frontend wrapper keeps 1-arg).
- Plan OQ: run `/ce-compound` on three seams (MemWal namespace, purchase_access/AccessEntitlement flow, Walrus read-path CDN) — `unwrapMoveFields` (JSON-RPC vs GraphQL shape) is a prime capture candidate.

### Notes for Next Session
- MCP env knobs: `MCP_RATE_WINDOW_MS`/`MCP_RATE_MAX_PER_WINDOW` (per-address), `MCP_IP_RATE_MAX_PER_WINDOW` + `MCP_TRUST_FORWARDED` (per-IP), `MCP_FULLNODE_TIMEOUT_MS`, `WALRUS_AGGREGATOR`, `PUBLIC_ORIGIN`; agent script: `AGENT_SECRET_KEY`, `SUI_FULLNODE_URL`/`SUI_NETWORK`, `AGENT_DECRYPT_FETCH_TIMEOUT_MS`. None are secrets; consider .env.example entries.
- `/remember` now does ONE fullnode read per non-RESTRICTED publish (global-mirror verification, fail-closed). The seed script `backend/scripts/sync-models-to-memory.ts` still uses `memoryWrites` directly (trusted indexed data) — unaffected.
- Subagent worktree gotcha: shell cwd drifted into `.claude/worktrees/*` twice this session — always `cd` explicitly / use `git -C` before merges.

---

## Last Updated: 2026-06-10 (**research session (Cowork): AI-agent interface → MCP server recommendation + demo design + pain-point narrative; no code**)

### Hackathon Tracker
- Days to submission (6/21): **11 of 38** · demo day (7/20–21): ~40 · winners (8/27): ~78

### Current Phase
Phase 4 — feature/UX polish. This session was research-only (no code, no commits).

### Completed This Session
- **Researched the "AI agent interface" question** (MCP vs REST vs x402 vs A2A) and wrote the full brief: **`docs/brainstorms/2026-06-10-agent-interface-research.md`**. Key conclusions:
  - **Recommend a thin MCP server** (`@modelcontextprotocol/sdk`, Streamable HTTP) mounted as a route on the existing Hono backend. MCP is the 2026 de-facto agent-access standard (Linux Foundation, 10k+ servers); Walrus Memory itself launched 2026-06-03 with MCP connectors — same idiom Mysten promotes; we already use MemWal (D-080).
  - **x402 rejected as the payment rail** — our fees are already native Sui Move calls; an agent with its own keypair pays `access_fee` on-chain like a human. Pitch line: "Other platforms need x402 to charge agents; our contract never cared whether the buyer was human." x402 = roadmap mention only (off-chain metering, e.g. Tripo).
  - **Tool surface**: v0 read-only (search_models via MemWal recall, get_model, get_license_terms, get_preview) ~1–1.5d; v1 transaction path (build_purchase_tx returns unsigned PTB — agent signs locally; download_content gated on on-chain entitlement + Seal) +1–2d. Agent auth reuses existing `/auth/challenge`+`/verify`.
  - **90-second demo arc** (brief §7): one human prompt → agent searches → **rejects a candidate on license terms** (autonomy proof) → buys on testnet (split-screen: AccessEntitlement appears live) → Seal-decrypts GLB into `samples/` game scene → kicker: creator balance ticks up → outro `claude mcp add tusk3d <url>` + QR.
  - **Pain-point narrative** (brief §8): lead = three stacked gaps for agents (payment: no credit card / license: fuzzy human terms vs machine-readable on-chain LicenseTerms / delivery: link rot vs hash-addressed Walrus); kicker = "an AI used your work = you got paid" (Move-enforced royalties); ecosystem M2M-trust argument held for Q&A.

### Next Concrete Step
**Plan-mode: draft ADR D-104 (MCP agent interface) + implementation plan.** Two risks to verify first: (1) Seal session-key/decryption flow for a non-browser MCP client; (2) whether `purchase_access` has any frontend-only assumption an agent path would bypass (check 2026-06-04 security audit, esp. C-1 fix). Then user decides v0-only vs v0+v1 cut-line (11 days left, deck + video still pending).

### Blockers / Open Questions
- Scope cut-line: v0 read-only alone still demos; v1 purchase path is the hero shot but +1–2d.
- Brainstorm doc uncommitted — suggest `docs: agent-interface MCP research + demo + pain points`.
- Carry-over from 6/09: confirm the live Vercel deploy renders post-D-103 (may need redeploy from `main`).

### Notes for Next Session
- New dependency (`@modelcontextprotocol/sdk`) + new public API surface ⇒ Full ADR + plan-mode per CLAUDE.md discipline.
- MCP server design principle locked in brief: server NEVER holds agent keys; build_purchase_tx returns tx bytes, agent signs client-side.
- Demo agent can reuse the test-wallet keypair pattern (it legitimately owns that key); fund on testnet faucet.

---

## Last Updated: 2026-06-09 (**root-caused + fixed the `/launch` upload renderer crash; pushed `main` to GitHub**)

### Hackathon Tracker
- Days to submission (6/21): **12 of 38** · demo day (7/20–21): ~41 · winners (8/27): ~79

### Current Phase
Phase 4 — feature/UX polish + stability. **Repo now has a GitHub remote** (`origin` → `flamefalcon7/task3d`); `main` pushed (security-scanned: no secrets in tree or history, `.env*` gitignored).

### Completed This Session
- **Root-caused the long-standing "uploading to Walrus crashes the tab" bug.** It is NOT the Walrus encoder and NOT GPU/Brave/extensions. A Brave Crashpad minidump showed a **V8 JS-heap OOM** (4 GB cage full; malloc ~1 MB) whose allocation stack was React's **dev-mode** prop serializer (`addObjectToProperties`) doing `for...in` over `variantGlbs: Uint8Array[]` (8 × ~6 MB) passed as a prop to `<VariantPreview>` → ~48 M byte-index keys → OOM. Confirmed the serializer is **absent from the production bundle** (prod always immune; dev-only crash).
- **Fixed (D-100):** `VariantPreview` now takes `variantGlbUrl?: string | null`; `LaunchCollectionPage` owns the bytes and creates/revokes the selected variant's blob URL (StrictMode-safe effect lifted up). Raw bytes no longer cross a prop boundary. Typecheck clean, **81/81** affected tests pass, **user verified** the crash is gone in Brave dev (`pickup-truck` × 8).
- Earlier in session: security check + first GitHub push of `main`; verified the standalone `docs/walrus-oom-bugreport/` repro can't reproduce (different mechanism) — that bugreport's premise is now superseded by D-100.

### Known issues found, NOT yet fixed
- **Local `pnpm build` produces a BLANK app.** `useAppSigner.ts`/`useAppAccount.ts` statically import `test-wallet/loadKeypair.ts`, whose **top-level `if (import.meta.env.PROD) throw`** is a side effect that survives tree-shaking → fires on every local prod build → React root unmounts silently. (`.env.local` has `VITE_TEST_WALLET=0` but the static import + side-effect throw is flag-independent.) **May affect the Vercel deploy** unless its build env differs — worth confirming the live site renders. Fix: make the test-wallet import dynamic/conditional or move the guard off module top-level.
- `frontend/dist` inlines the test private key when built locally — treat as secret-bearing; rm after local builds.

### Also this session (after D-100)
- **D-100 committed** on branch `fix/launch-variant-prop-oom` (`3a0e5aa`).
- **D-101 — retired multi-quilt batching; launch now uploads a single quilt.** (committed `d771da1` on `refactor/launch-single-quilt`.) Both forker upload call sites pass `{ quiltSize: swapped.length }` → 1 register + 1 certify (8 variants = 2 popups, not 4). `BatchProgressPanel` pre-flight → single-quilt plan; `QUILT_SIZE`/chunking kept latent + tested. D-062 superseded; mesh-decimation fix moot. **User-verified in Brave** (2 popups, completes — after one transient `signal timed out` that succeeded on retry).
- **D-102 — Walrus timeout hardening (the `signal timed out` the user hit).** Raised the SDK request timeout 30s→60s (`storageNodeClientOptions.timeout` + `uploadRelay.timeout` in `walrusClient.ts`) and added a 3-attempt retry around ONLY the idempotent `flow.upload()` relay step (`retryAsync.ts` + test; gated on `isRetryableUploadError`). Never retries on-chain register/certify (gas). Typecheck clean, **full suite 1200 pass / 2 skip**. Not yet committed (on `refactor/launch-single-quilt`).

- **D-102 committed.** (`feat(walrus): 60s timeout + retry the idempotent relay upload`.)
- **D-103 — fixed the prod-build-blank guard bug.** `test-wallet/loadKeypair.ts`'s module-top `if (PROD) throw` (statically imported by the wallet hooks, side-effect un-tree-shakeable) blanked every prod build. Moved the guard into `assertNotProductionBuild()` called inside the entry functions. **Verified: prod bundle now renders** (agent-browser, `#root` populates, no window error). Bonus: the test-wallet module now tree-shakes out → the test private key is no longer baked into `dist`. On branch `fix/prod-build-test-wallet-guard` (off the D-102 branch). Typecheck clean; test-wallet + wallet suites green (13).

### Next Concrete Step
**Session shipped:** D-100→D-103 fast-forwarded onto `main` and **pushed to GitHub** (`origin/main` = `ec07d80`). Stale `debug/walrus-upload-crash` branch + obsolete `docs/walrus-oom-bugreport/` deleted. The three now-merged feature branches still exist locally (harmless; deletable).
**Remaining user action:** **confirm the live Vercel deploy renders** — the D-103 blank bug may have been serving a broken build; redeploy from updated `main` if so.

### Notes for Next Session
- Servers may be left running: backend `:3001`, frontend `:5173` (started with `VITE_TEST_WALLET=1`).
- Full memory of this investigation in `[[project_walrus_oom_repro_not_reproducible_standalone]]`.

---

## Last Updated: 2026-06-08 (**post-ship UX pass on browse/market/launch cards — split results, preview drag-only, name hover; all on `feat/browse-semantic-search`**)

### Hackathon Tracker
- Days to submission (6/21): **13 of 38** · demo day (7/20–21): ~42 · winners (8/27): ~80

### Current Phase
Phase 4 — feature/UX polish. **No git remote** — "shipping" = local commits/branches.

### Completed This Session (UX follow-ups, continuing `feat/browse-semantic-search`)
- **Search results split** on BOTH `/browse` and `/launch`: an active query with matches renders a labeled **RESULTS** band over the matched cards, separated from an **ALL MODELS** / **MORE BASES** band (rest stays visible, R9 no-hide). No query / zero matches → single grid. (`BrowsePage` `splitView`; `LaunchCollectionPage` `baseSplitView` with the card render extracted into `renderBaseCard`.)
- **Preview wells are drag-only, no nav-hijack** across `/browse` + `/market` + `/launch`:
  - Card root is a container; the **text body/title is the detail `<Link>`**, the 3D preview well is a sibling (Babylon `ArcRotateCamera.attachControl` already gives orbit). A stationary click on the preview no longer navigates (browse/market) or selects the base (`/launch` uses `onClick stopPropagation` on the base-option preview).
- **Accent hover cue on clickable card titles** (`/browse` + `/market` + `/launch` launchable base): new `.nav-name` / `.nav-link:hover .nav-name` rule in `frontend/src/index.css`; titles carry no inline color so the `:hover { color: var(--accent) }` wins (had to drop inline `color` from `cardName`/`baseOptionName`). Verified live in DOM on `/browse` (class applied + rule loaded).
- **Preview well default GRAY** for live 3D previews (`CollectionCard` `PreviewCanvas defaultBg="gray"`); **VARIANT badge moved top-LEFT** (was being covered by the top-right BG-toggle pill).
- **Verification:** full suite **1190 frontend pass / 2 skip**, tsc clean. Browser-verified (headed screenshot) the badge move + gray live wells + preview-outside-link structure on `/browse`.

### Known limitation (reported to user)
- **Encrypted (Seal) models' preview thumbnails stay BLACK.** They render watermarked preview *stills* (`<img>`), and those WebPs are **~62% opaque black** (black baked into the model band, only edges transparent) — confirmed by downloading one and inspecting alpha. The frontend cannot recolor them to gray without washing the model (blend hacks turn the red car pink) or **re-baking the stills on gray at publish time** (backend + Seal republish). Live (public) previews are gray; encrypted stills are black. Deferred unless the user wants the publish-time re-bake.

### Next Concrete Step
User's post-wallet pass (own Chrome, Slush): (1) drag a card preview → rotates, doesn't navigate; click title → detail; titles tint orange on hover (incl. `/launch` base cards, which only show when signed in). (2) signed-in `/browse` search → RESULTS / ALL MODELS split. Then decide merge strategy.

### Blockers / Open Questions
- Merge-to-main of the stacked branches still user's call. Stack: `main` → `feat/model-description-surfacing` → `feat/browse-semantic-search` (HEAD). Merge in dependency order.

### Notes for Next Session
- Hover affordance pattern: `.nav-name` (no inline color on the title) + `.nav-link` on the clickable ancestor → accent on hover. Reuse for any new clickable card title.
- Preview-not-nav pattern: keep the 3D well a sibling of the nav `<Link>`/action, never a descendant.
- `feat/launch` base cards + signed-in `/browse` search + `/market` listings all need a wallet to view live — headless agent-browser only covers the signed-out / public surfaces.

---

## Last Updated: 2026-06-08 (**/browse semantic search SHIPPED (local) — plan 2026-06-08-002, 3 code units + 5-reviewer hardening, browser-verified**)

### Hackathon Tracker
- Days to submission (6/21): **13 of 38** · demo day (7/20–21): ~42 · winners (8/27): ~80

### Current Phase
Phase 4 — feature/UX polish. **No git remote** — "shipping" = local commits/branches.

### Completed This Session
- **plan 2026-06-08-002 browse-semantic-search — BUILT + tested + 5-reviewer hardened + browser-verified + committed** on `feat/browse-semantic-search`, **stacked on `feat/model-description-surfacing`** (NOT off main — it genuinely depends on that branch's `useMemoryRecall` / `baseSearchRanking` / `modelDescription`; a main-based branch wouldn't compile). Commits: docs → U1 → U2 → U3 → review-fixes.
  - **U1** `frontend/src/browse/browseSearchRanking.ts` — `rankCollectionMatches`: reuses `rankForkableMatches`' per-objectId join/dedupe/NaN-guard, collapses matches up to per-collection cards (closest variant wins), preserves every group key incl. `_orphan:` (R9 no-hide). 12 tests.
  - **U2** `frontend/src/browse/CollectionCard.tsx` — optional `match?: BaseMatch` → non-accent ring (ink/subtle, coexists with ink border) + `MatchReason` + description dedupe. 6 new tests.
  - **U3** `frontend/src/browse/BrowsePage.tsx` — semantic "Ask" field above filterRow; `useMemoryRecall` wired unconditionally (hooks-before-early-return safe); single `gridKeys` render path; honest-state micro-statuses (loading/showing-all/degraded, tag-aware copy); signed-out = **non-input login teaser** (no recall path). 12 new tests incl. StrictMode.
  - **5-reviewer hardening** (correctness/testing/api-contract/adversarial/julik — all came back with **no P0/P1 defects**): gate grid reorder/highlight on `searchActive` (single source of truth); re-issue recall on auth change (`session?.address` dep); defensive `collectionGroups.get` guard; relabeled the vacuous BrowsePage StrictMode test (real mounted-ref guard lives in `useMemoryRecall.test.ts`); added degraded/showing-all mutual-exclusion, AE5 promote-within-subset, exact strong-boundary, Escape-clear, signed-in integration-view-hide tests.
- **Verification:** full suite **1185 frontend pass / 2 skip + 23 shared pass**, `tsc --noEmit` clean. **Browser-verified** (agent-browser, `VITE_TEST_WALLET=0` → signed-out): `/browse` shows the login teaser ("Sign in to search models by description" + Sign-in-with-Google), NO search input when signed out, grid + description snippets render, no console errors. **Post-wallet step for user:** sign in via Slush in own Chrome, type e.g. "a steampunk robot", confirm the robot card promotes with a "↳ …" reason line.

### Decisions as shipped (supersede the stale notes in the 2 blocks below)
- **Auth: signed-out shows a login TEASER** (not the plain grid). The earlier "Option A = no field when signed out" lock was superseded in-session by the user.
- **Scope: personal + global** (mirrors /launch; a signed-in creator's own models match too). The earlier "leaning global-only" note was superseded in-session.
- No backend / `/api/memory/recall` change. Match highlight is non-accent (D-044 budget untouched).

### Next Concrete Step
User decides merge strategy. Branch stack is now: `main` → `feat/model-description-surfacing` → `feat/browse-semantic-search` (HEAD). To land both, merge in dependency order (model-description first, then browse-search) into main.

### Blockers / Open Questions
- Merge-to-main of the stacked branches (+ `feat/landing-scroll-spine`) is still user's call — no remote, all local.

### Notes for Next Session
- Branch base lesson: browse-search depends on model-description-surfacing; they're stacked, not independent. Don't rebase browse-search onto bare main.
- Deferred follow-up (in the plan): consolidate `/launch` + `/browse` match-highlight helpers into one shared module (left duplicated to avoid touching shipped `/launch` near submission).
- Background: frontend dev :5173 running; `VITE_TEST_WALLET=0` (signed-out by default — restart dev after changing it).

---

## Last Updated: 2026-06-08 (**description-surfacing + base-finder MERGED on one branch · next: brainstorm /browse AI search**)

### Hackathon Tracker
- Days to submission (6/21): **13 of 38** · demo day (7/20–21): ~42 · winners (8/27): ~80

### Current Phase
Phase 4 — feature/UX polish. **No git remote** — "shipping" = local commits/branches.

### Completed This Session (continued)
- **model-description-surfacing** fully shipped on `feat/model-description-surfacing` (U1 resolver → U4 publish nudge + 5-reviewer fixes; browser-verified). Then a round of **user-review fixes** (commits `f33d765`, `bbc15a3`):
  - Description snippet moved to the REAL browse card **`CollectionCard`** (ModelCard was dead code → deleted; `/market` shows NftToken listings, not model cards).
  - **"AI description" → neutral "Description"** via shared `modelDescriptionLabel()` (caption is user-editable, not necessarily AI). Tripo stays "Prompt".
  - Added **Browse** nav entry (`/browse`); removed the L1/L2/L3 three-CTA grid from `/browse`.
- **MERGED `feat/launch-ask-model-finder` → `feat/model-description-surfacing`** (commit `ecef211`). One conflict in `LaunchCollectionPage.tsx` (kept both `baseOptionDescription` + `MatchReason`/`matchRing`). **Wired the documented dedupe**: base-option static snippet gated on `!match` — a search match shows MatchReason, suppresses the static snippet (never both). Added a dedupe test. **Full suite 1153 pass / 2 skip, tsc + build clean.**

### Next Concrete Step
**Run `/ce-brainstorm` on: reuse the AI search field on `/browse`** (user asked; compacting first, brainstorm right after).

**DECISION LOCKED by user — Auth = Option A: search field shows ONLY when signed in.** No backend change. Logged-out users see the plain `/browse` grid; signed-in users get the search box. (`/api/memory/recall` requires `Authorization: Bearer <jwt>`; `useMemoryRecall` no-ops without a session — so gating the UI on session is the whole story. Global recall is invoked server-side by the backend; the client only triggers it via the authed endpoint.)

Two decisions still open for the brainstorm:
1. **Search unit**: `/browse` groups models into collections (`CollectionCard` per collection); recall returns modelIds → map matched modelId back to its collection group, then reorder/highlight collection cards.
2. **Scope**: global fits /browse (discovering OTHERS' published models) better than personal+global (which /launch uses). Likely **global-only**, but confirm whether a signed-in creator also wants their own (personal) surfaced.

- Reusable pieces: `useMemoryRecall` (hook), `rankForkableMatches` (core merge/dedupe/sort is general despite the name), the search-box UI + reorder/highlight/MatchReason pattern from `LaunchCollectionPage.tsx`.

### Blockers / Open Questions
- Browse-search auth decision (A vs B) is the gating question — ask before planning.
- 3 local unmerged branches remain: `feat/landing-scroll-spine`, `feat/launch-ask-model-finder` (now merged INTO the description branch but still exists), `feat/model-description-surfacing` (current, HEAD). None merged to `main` yet — user hasn't decided merge-to-main.

### Notes for Next Session
- Background: backend dev :3001 (MemWal-configured), frontend dev :5173 — likely still running.
- `shared/dist` is gitignored + rebuilt locally; a fresh clone must build `shared` before the frontend.
- MemWal recall relevance gate `MEMORY_MAX_DISTANCE=0.66`: single-word queries ("robot") miss; descriptive phrases ("steampunk robot") match — affects browse-search UX too.

---

## Last Updated: 2026-06-08 (**model-description-surfacing SHIPPED (local) — 4 units + 5-reviewer fixes, browser-verified**)

### Hackathon Tracker
- Days to submission (6/21): **13 of 38**
- Days to demo day (7/20–21): ~42 · Days to winners (8/27): ~80

### Current Phase
Phase 4 — feature/UX polish. **Note: this repo has NO git remote** — "shipping" = local commits/branches, no PR/push.

### Completed This Session
- **plan 2026-06-08-001 model-description-surfacing — BUILT + tested + reviewed + browser-verified + committed** on a fresh branch `feat/model-description-surfacing` (off `main`; NOT merged; no remote). 5 commits:
  - **U1** `shared/src/modelDescription.ts` — pure resolver `(Model3DSummary)→{text,kind:'prompt'|'caption'}|null` (Tripo prompt / D-082 upload caption / null for uncaptioned+malformed). 12 co-located tests; re-exported via `shared/src/index.ts`.
  - **U2** `frontend/src/buy/ModelDetailPage.tsx` — labeled "Prompt"/"AI description" block + 3D viewer caption; raw Params(json) expander demoted+kept. 5 tests.
  - **U3** `frontend/src/browse/ModelCard.tsx` (market card snippet) + `LaunchCollectionPage.tsx` (base-picker card snippet both variants + picked-base preview caption). 8 tests.
  - **U4** `frontend/src/creator/CreateModelPage.tsx` — publish-time no-caption nudge: split `onMint`→validation gate + `proceedMint`; styled Continue/Cancel inline panel replaces MintButton for an uncaptioned upload (R7/R8, context-aware copy). Test-first, 11 tests.
  - **5-reviewer fixes** (correctness/testing/api-contract/adversarial/julik): reset `noCaptionConfirm` on model swap/mode switch; `proceedMint` re-validates required fields (panel leaves form editable); `mintInFlight` ref guards double-publish. +6 tests.
- **Verification:** full suite **1110 frontend pass / 2 skip + 21 shared pass**, `tsc --noEmit` clean, frontend build clean. **Browser-verified live** (agent-browser, read-only surfaces through the real `@overflow2026/shared` dist boundary): robot(Tripo) detail shows Prompt block + viewer caption; turbo-seg(upload) shows neither (R6); `/create`+`/launch` load to sign-in gate, no console errors.

### Next Concrete Step
User decides: (a) merge strategy for the 3 unmerged local branches (`feat/landing-scroll-spine`, `feat/launch-ask-model-finder`, `feat/model-description-surfacing`), or (b) next feature. **MERGE SEAM**: when `feat/launch-ask-model-finder` (base-finder) merges with `feat/model-description-surfacing`, wire the U3 dedupe — suppress the static `/launch` snippet on a card whose search match-reason is showing (documented inline at `LaunchCollectionPage.tsx` base-option map; no match state exists on the description branch alone).

### Blockers / Open Questions
- None blocking.
- **Deferred copy polish** (adversarial P3): the no-caption nudge's "actionable" copy variant ("Add one with Describe with AI") still shows when the captioner is quota-exhausted (status='quota' keeps `available=true`) — fine per plan's "final copy strings deferred", but could branch on `captioner.status` later.
- **shared/dist build-ordering** (api-contract, pre-existing not a regression): `shared/dist` is gitignored; the new export reaches the frontend only after a shared build. Full-repo `pnpm -r build` handles ordering; verify any frontend-only deploy (Vercel/CF) runs a shared build first — same as the already-shipped `memory.ts` export.
- **ModelCard snippet is on `/market` (wallet-gated)**, NOT `/browse` (which uses collection-level cards, out of scope per R4). Verified via unit tests; not driveable headless.

### Notes for Next Session
- Background processes: **backend dev :3001** (MemWal-configured), **frontend dev :5173** — likely still running.
- `shared/dist` was rebuilt locally (`pnpm --dir shared build`) so the frontend resolves `modelDescription`; a fresh clone must build shared before the frontend.
- Wallet-gated surfaces NOT live-verified (covered by unit tests, per pre/post-wallet split): ModelCard `/market` snippet, `/launch` picker snippets + picked-base caption, `/create` publish nudge. Offer the user a post-wallet pass in their own Chrome if desired.

---

## Last Updated: 2026-06-08 (**/launch base-finder shipped (local) · MemWal restored + .env safeguards · model-description plan ready**)

### Hackathon Tracker
- Days to submission (6/21): **13 of 38**
- Days to demo day (7/20–21): ~42 · Days to winners (8/27): ~80

### Current Phase
Phase 4 — feature/UX polish. **Note: this repo has NO git remote** — "shipping" = local commits/branches, no PR/push.

### Completed This Session
- **plan-002 `/launch` natural-language base-finder — BUILT + tested + reviewed + committed** on branch `feat/launch-ask-model-finder` (NOT merged; no remote). 6 commits (`87b6051`→`e4c403a` + plan-status + ops). U1 extracted a neutral `frontend/src/memory/useMemoryRecall.ts` from `creator/useCreatorMemory.ts` (public API byte-identical, 17-test /create suite green); U2 `frontend/src/collection/baseSearchRanking.ts` (pure merge/dedupe/join); U3 search box + grid reorder/highlight in `LaunchCollectionPage.tsx`. Full suite **1127 pass / 2 skip**, build clean. 5-reviewer pass (incl. julik) → folded fixes: degraded≠empty note, query-reset on pick, NaN-distance guard, +9 tests.
- **MemWal restored.** `backend/.env` had lost `MEMWAL_*` (a prior session clobbered the file — mtime 6/4, not this session). Re-provisioned a fresh delegate key on the **existing** account `0x55c2…229c6` via `backend/scripts/memwal-spike.ts` (owner = deployer `VITE_TEST_WALLET_KEY`); wired `MEMWAL_ACCOUNT_ID/DELEGATE_KEY/SERVER_URL` into `backend/.env`. Backend running on **:3001**, recall live.
- **.env-clobber safeguards** (commit `87a12e9`): new CLAUDE.md "Secrets & `.env` files" rule (never overwrite/regenerate; append-only; STOP+report) + MemWal recovery runbook; backend `server.ts` prints a loud startup warning when MemWal is unconfigured.
- **Catalog→memory sync** (commit `32fdbab`): new `backend/scripts/sync-models-to-memory.ts` reads on-chain Model3D objects → writes memory via the live `memoryWrites` helper. Synced 3 published models (`robot` tripo / `nasty-guy`, `turbo-seg` uploads); verified recallable.
- **plan 2026-06-08-001 model-description-surfacing — PLANNED, ready for `/ce-work` (NOT started).** Brainstorm `docs/brainstorms/2026-06-08-model-description-surfacing-requirements.md` + plan `docs/plans/2026-06-08-001-feat-model-description-surfacing-plan.md`. Doc-reviewed (3 personas, no P0/P1, 7 fixes folded). Display-only (caption write-path already exists, D-082): shared `shared/src/modelDescription.ts` resolver + render on detail/cards/preview + a styled publish-time no-caption confirm panel. 4 units (U1 resolver → U2 detail → U3 cards/launch → U4 publish nudge).

### Next Concrete Step
Resume after compaction: **`/ce-work` on `docs/plans/2026-06-08-001-feat-model-description-surfacing-plan.md`**, on a **fresh branch off `main`** (keep it separate from the unmerged `feat/launch-ask-model-finder`).

### Blockers / Open Questions
- None blocking. **MemWal recall relevance gate** = `MEMORY_MAX_DISTANCE` 0.66 — bare single-word queries ("robot","car") fall past it; descriptive queries ("steampunk robot") match. Tunable if demo needs looser matching (cost: noise).
- Two unmerged local feature branches exist (`feat/landing-scroll-spine`, `feat/launch-ask-model-finder`) — no remote, so they live locally until manually merged.

### Notes for Next Session
- Background processes from this session: **backend dev on :3001** (MemWal-configured) and **frontend dev on :5173** — may still be running.
- `/launch` live reorder verification was deferred to the user (wallet-gated; agent-browser has no wallet). Data is synced + recallable; descriptive queries surface matches.
- Description-surfacing scope decisions locked: caption stored under `params_json.caption` (separate from `prompt`); `/create` upload preview already shows the live caption (out of scope); `/launch` card must dedupe its description snippet against the existing `MatchReason` (per-card boolean); 2 existing uncaptioned uploads = no backfill.

---

### Hackathon Tracker
- Days to submission (6/21): **14 of 38**
- Days to demo day (7/20–21): ~43
- Days to winners (8/27): ~81

### Current Phase
Phase 4 — demo/pitch polish (landing cinematicness).

### Completed This Session
- **Landing cinematic scroll spine** (D-098 + D-099), Approach 丙 — a scroll-orchestration layer over the existing sections; the 2026-06-06 live-3D wells were **not** rebuilt and their separate canvases **not** merged. Branch `feat/landing-scroll-spine`, 7 units, each its own commit:
  - **U1** `gsap@3.15.0` + `lenis@1.3.23` added (spec.md §4); `frontend/src/landing/spineConfig.ts` — `SPINE_FLAG_ENABLED` (`VITE_LANDING_SCROLL_SPINE`), `registerScrollTrigger()`, shared `prefersReducedMotion()`.
  - **U2** `useSmoothScroll.ts` — Lenis inertial scroll bridged to ScrollTrigger via one `gsap.ticker`; gated; StrictMode-safe.
  - **U3** `RevealSection.tsx` — once-per-entry fade+translate reveal; gated; gsap.context/revert.
  - **U4** `ScrollSpineIndicator.tsx` — fixed CARVE/MINT/RIFF rail tracking page progress; **zero `#FF4500`** (CSS asserted accent-free); + design-tokens.md D-099 note.
  - **U5** `LedeHero.tsx` — scroll-coupled "farewell" camera move (beta up + radius back) driven through the **existing** `onBeforeRenderObservable` via a scalar ref written by ScrollTrigger — **no new render loop / rAF** (R9 asserted in test).
  - **U6** `LandingPage.tsx` — `useSmoothScroll()`, mounts the indicator, wraps the three below-fold sections in `RevealSection` (hero/masthead/telemetry left unwrapped — above the fold).
  - **U7** verification (this entry).
- **Three-gate engage rule everywhere**: `SPINE_FLAG_ENABLED && useLedeRenderMode()==='live' && !prefersReducedMotion()`. Reduced-motion / mobile-no-WebGL / flag-off all degrade to a plain native-scroll page.
- **Tests**: full frontend suite green — **103 files / 1084 tests pass, 0 fail** (2 skipped). New: spineConfig (4), useSmoothScroll (5), RevealSection (6), ScrollSpineIndicator (6), LedeHero +6 farewell, LandingPage +2.
- **Production build** clean (`tsc -b && vite build`).
- **Browser-verified live mode** (agent-browser, WebGL2): renderMode=live, all 6 sections render, indicator present and **tracks scroll** (Riff active at page bottom), smooth scroll engaged, 3 reveals all opacity:1 (none stranded), **zero gsap/lenis/ScrollTrigger/React console errors** (only the expected placeholder-CID Walrus 400→embedded GLB fallback).

### KTD-5 divergence (recorded)
Plan KTD-5 proposed tree-shaking gsap/lenis out when the flag is off (dist grep zero hits). Implemented instead as **static imports + runtime flag kill-switch** (matching the existing `VITE_LANDING_LIVE_WELLS` convention): true tree-shake would require dynamic imports, which complicate the StrictMode-safe synchronous lifecycle. gsap+lenis (~75 KB gz) ride the landing chunk, which already loads Babylon (hundreds of KB) — negligible. U7's verification was adjusted from "dist grep zero hits" to "flag-off → no spine at runtime" (covered by unit tests on every surface).

### Next Concrete Step
**User visual pass needed**: confirm the live spine *feels* smooth (eased scroll, restrained reveals, hero farewell move) and holds frame rate with **no jank on the tallest demo viewport during an inertial fling** (R9/AE5 — the one item that needs a real GPU + human eyes; agent-browser can't judge smoothness). Then: optional 5-reviewer pass (incl. `ce-julik-frontend-races-reviewer`), merge `feat/landing-scroll-spine` → main.

### Blockers / Open Questions
- None blocking. Tuning values (Lenis duration/easing, farewell camera deltas, reveal timing) are first-pass — adjust to taste during the visual pass.

### Notes for Next Session
- Spine kill-switch: build/run with `VITE_LANDING_SCROLL_SPINE=0` to ship a plain-scroll landing without touching code.
- The farewell camera move is **hero-only** by design (KTD-2): panels dispose off-screen + MODEL has a ±30° clip-plane constraint, so panels get DOM reveal transitions, not camera scrubbing.

---

## Last Updated: 2026-06-07 (**Brand mark shipped — logo assets + D-095, uncommitted on main**)

### Hackathon Tracker
- Days to submission (6/21): **14 of 38**
- Days to demo day (7/20–21): ~43
- Days to winners (8/27): ~81

### Current Phase
Phase 4 — demo/pitch polish (brand identity).

### Completed This Session
- **Tusk3D brand mark** (D-095): low-poly wireframe tusk, Nano Banana-generated, background removed, colors normalized to exact D-044 tokens (`#000000` / `#FF4500`), vectorized via potracer (two-layer trace). Full asset set in `pitch/brand/`: primary SVG + inverse SVG (for `--well`), transparent PNG master + 512/180/64/32 + inverse PNG. Verified at 32px and on black.
- **Docs**: `pitch/brand/README.md` (asset inventory, usage mapping, generation prompt, rebuild process) + ADR D-095.

### Next Concrete Step
~~Commit brand assets~~ done (`1871605`). **Uncommitted frontend work (D-096 + D-097)**: (a) logo rollout — favicon.svg replaced, apple-touch-icon added, TopNav 20px symbol, Masthead tusk-ridge → tusk-facet.svg (black no-accent variant), Masthead tests updated; (b) masthead alignment fix — row `align-items: center` + new `.titleGroup` baseline sub-group (the square mark had pushed "Tusk3D №NNN" to the line-box top); (c) **TopNav hidden on `/` (D-097)** — NavGuard HIDDEN_ROUTES + isLanding branch deleted, TopNav tests reworked (wallet-pill tests moved to /market). `tsc --noEmit` clean ×3. **Sandbox can't run vitest (macOS node_modules) — user must run `pnpm --dir frontend test` + browser-verify `/` and one inner route per protocol, then commit** (`feat(frontend): brand mark rollout + chrome-free landing (D-096, D-097)`). ⚠️ Known accepted gap: /market unreachable from landing (D-097).

### Blockers / Open Questions
- None. (Housekeeping done: raw Gemini PNG moved to `pitch/brand/tusk3d-logo-source.png`; `check.png` junk deleted.)

### Notes for Next Session
- SVG is a potrace draft — Figma cleanup pass (snap vertices, unify stroke weight) before any print-scale use.
- potracer pip package has inverted foreground convention (pass `~mask`) — documented in pitch/brand/README.md.

---

## Last Updated: 2026-06-07 (**Doc-sync: CLAUDE.md slimmed + spec.md §4 reconciled — on `docs/sync-claudemd-spec`**)

### Hackathon Tracker
- Days to submission (6/21): **14 of 38**
- Days to demo day (7/20–21): ~43
- Days to winners (8/27): ~81

### Current Phase
Phase 4 — housekeeping. A prior session flagged CLAUDE.md as drifted; verified true and fixed the **structural** cause (volatile facts duplicated into a principles doc → guaranteed drift).

### Completed This Session
- **CLAUDE.md 345 → 199 lines.** Stripped the volatile `Stack at a Glance` version enumeration + `Core Architecture` detail down to **pointers** (spec.md §4 / §1.7 / §2.8 + decisions.md as source of truth); kept all protocol/principle content. Added a header note: this file holds principles only.
- **spec.md §4 reconciled** (it was *more* stale than CLAUDE.md): backend table still listed `@anthropic-ai/sdk` as the active "LLM router" — **removed per D-023**; added the real shipped deps: `ai` + `@ai-sdk/google` (Gemini, D-081/082), `@mysten-incubation/memwal` (D-080/090), `node:sqlite` (D-083/088), `meshoptimizer`. Seal row: `若加` → **shipped v1 `1.1.3` (D-074)**.
- **spec.md framing forward-notes** — the dated 2026-05-14 block's flatly-false lines (`MemWal 待調研`, `MVP 不要做 Seal`) got non-destructive `⚠️ 已定案/已反轉` markers pointing to D-080 / D-074 (history preserved, current truth flagged).
- **Corrected stale state below** — the 06-06 block's "Next Step: push `feat/landing-live-3d-wells` (not pushed)" is **done**: that branch + `feat/rage-racing-track-reskin` are both **merged into main** (commits `4ced101`, `c0a228a`).

### Next Concrete Step
Review the `docs/sync-claudemd-spec` diff; if good, commit (`docs:` — references D-023/074/080/081) and merge to main. No code touched — docs only.

### Notes for Next Session
- Root cause of the drift: D-080→D-094 (June 2–6) landed in `decisions.md` but were never written back to the "resident" docs (CLAUDE.md/spec.md), both last touched 6/01 (`4d6a337`). The slimming makes CLAUDE.md drift-resistant; spec.md remains the one place stack/arch facts must be kept current.
- Untracked at root (pre-existing, unrelated): `docs/brainstorms/2026-06-02-*` + several `.glb` files. Left alone.

---

## Last Updated: 2026-06-06 (**Landing live-3D wells — 8-unit plan shipped + a long user-driven visual redesign pass; all on `feat/landing-live-3d-wells`, NOT yet pushed/PR'd**)

### Hackathon Tracker
- Days to submission (6/21): **15 of 38**
- Days to demo day (7/20–21): ~44
- Days to winners (8/27): ~82

### Current Phase
Phase 4 — landing polish. Reskinned the landing page's five visual wells from static into live Babylon scenes (brainstorm → plan → ce-work, full 8-unit plan). Branch `feat/landing-live-3d-wells` off `main` (separate from the unmerged `feat/rage-racing-track-reskin`).

### Completed This Session
- **Brainstorm + plan** — `docs/brainstorms/2026-06-06-landing-live-3d-wells.md`, `docs/plans/2026-06-06-001-feat-landing-live-3d-wells-plan.md` (5-reviewer doc-review pass; caught + fixed a P1: the MODEL split clip-plane is world-space, so the panel oscillates ±30° instead of a full turntable).
- **U1** — swapped canonical model to `tusk.glb` (345KB) via shared `frontend/src/landing/tuskModel.ts`.
- **U2** — **D-092** (reverse plan-023: LifecycleStrip now live) + **D-093** (scoped D-044 exception: grey Blender hero well only). `landingWells` tokens + design-tokens.md block. Took D-092/D-093, NOT D-091 (held by the unmerged rage-racing branch — avoids merge collision).
- **U3** — `useInView` hook (first IntersectionObserver in repo) + `frontend/src/babylon/LiveWell.tsx` (lazy-mount Babylon well; dispose-on-exit default / pause for hero; static fallback + mount placeholder; `VITE_LANDING_LIVE_WELLS` kill-switch; StrictMode-safe).
- **U4** — `LedeHero` Blender viewport: grey clearColor + `GridMaterial` ground + `AxesViewer` XYZ + auto-rotate; sweep removed; keyframe placeholder until sceneReady; pause off-screen. Walrus-fetch flow unchanged.
- **U5/U6/U7** — MODEL (half-solid/half-wireframe via frozen sweep + bounded oscillation), VARIANT (3 recolored clones, D-093 tokens), IN-GAME (neutral scene + emissive-glow-primary + guarded GPU particle burst looping off the render clock).
- **U8** — `TypewriterPrompt` (typing loop, blinking caret, reduced-motion, aria) + `LifecycleStrip` rewired to live panels; tests rewritten.
- **Verified** — full suite **1042 pass**, `tsc -b` clean, `pnpm build` succeeds, browser-verified via agent-browser (--headed): all 5 wells render live, no React crash; fixed a `data-testid` collision found there (panel well → `lifecycle-well-*`). Screenshot confirms Blender hero + live panels.

### Design Iterations (post-plan, user-driven via HMR)
The 8-unit plan shipped, then a long interactive design pass reshaped the visuals (all committed on the branch):
- **Hero** — removed axis gizmo + caption; **D-094 supersedes D-093**: hero no longer a grey viewport — it **blends into the page** (paper clearColor + soft contact shadow + radial edge-feather + faint grid floor). Then made it a **left-image / right-text editorial hero**: tusk shifted left (`targetScreenOffset`), right column adds `Carve. Mint. Riff.` + plain-language sub + jargon-free spec block + CTA. Copy uses **fork**, not "remix" (product vocabulary).
- **Lifecycle panels** — iterated dark-pocket → filmstrip → **final: full-bleed brutalist cards mirroring ActorCards (`.section`), light-grey (`#E2E0DA`) thumbnails**. MODEL = dark hidden-line low-poly wireframe (enableEdgesRendering, faces painted grey). VARIANT = 3 tusks closer+bigger. PROMPT dark text.
- **IN-GAME** — a game vignette: monster (`monster.glb`, copied from the user's `walrus-tusk.glb`) is struck (red flash + smoke burst) and **drops a gold tusk reward** (ease-out bounce + amber sparkle), looping. Floor is a **game-editor grid** (opaque, sits at the bottom). VFX uses STANDARD blend + deep colors (additive washes out on the light card).

### Next Concrete Step
Push `feat/landing-live-3d-wells` and open a PR (**awaiting user go — not pushed**).

### Notes for Next Session
- **agent-browser can't reliably screenshot the IN-GAME 3D** (renders the grid but not the model in this headless Chromium, though MODEL/VARIANT render). I wasted time chasing a phantom "invisible monster" bug that was just the tool. **Lesson: for IN-GAME, verify in the user's real browser, don't trust the headless screenshot.** A throw in a panel's `onSceneReady` blocks LiveWell's `setReady` → blank well; IN-GAME now guards the GPU-particle path so VFX failure can't blank it.
- `walrus-tusk.glb` (667KB) still untracked/unused in `frontend/public/models/tusk3d/`; the IN-GAME monster is the separate `monster.glb` (506KB).
- D-091 is held by the unmerged `feat/rage-racing-track-reskin` branch; this branch took **D-092/D-093/D-094** — `design-tokens.md` will have a predictable top-of-file conflict (both scoped-exception blocks) at merge; keep both.
- All visual values are tuned-default constants (grid line color, variant tints, IN-GAME phase timings/colors/drop height) — adjust in `tokens.ts` / `LedeHero.tsx` / `InGamePanel.tsx`.
- **`feat/rage-racing-track-reskin` is now MERGED in** (this merge): `/track` → Rage Racing reskin (D-091), `/market` card click-through, new `/nft/:tokenId` page, rebuilt `/collection/:slug`. Frontend-only, no contract/Walrus changes.

---

## Last Updated: 2026-06-04 (**Audit Track 4–5 backend+Walrus run + all-Medium remediation — in working tree on `fix/seal-id-prefix-bypass`, NOT committed**)

### Hackathon Tracker
- Days to submission (6/21): **17 of 38**
- Days to demo day (7/20–21): ~46
- Days to winners (8/27): ~84

### Current Phase
Phase 4 — security hardening. Ran the deferred audit **Track 4–5** (backend TS/Hono + Walrus), read-only Workflow (4 dimensions + adversarial verify), then implemented **all 7 confirmed Medium + the 1 High** per plan `docs/plans/agile-orbiting-pearl.md`. Report updated: `docs/audits/2026-06-04-security-audit-seal-move-frontend.md` §Track 4–5.

### Completed This Session
- **Track 4–5 audit** — 8 agents, read-only, no mcp-server build, no chain tx. Adversarial verify DROPPED 2 false-High (W-6 SSRF, W-7 namespace); confirmed B-1 (High) + 6 Medium. "@mysten/walrus unpinned" refuted (pinned).
- **B-1 (High) → D-088** — durable replay guard: `spent_payments` SQLite table + atomic `INSERT OR IGNORE` (`isPaymentSpent`/`markPaymentSpent`) wired into `paymentVerifier.ts` + injected in `server.ts`; + 1h recency window. Full per-request binding (Option B) deferred → OQ-033.
- **B-4 (Med) → D-089** — self-pay bypass gated on explicit `TRIPO_FEE_OPERATOR` (default deployer) not `sender==treasury`. `client.ts` + `.env.example`.
- **B-3 (Med)** — `/challenge` per-IP rate limit (30/min) + nonce Map 100k cap (sweep→evict-oldest) in `auth.ts`.
- **W-2 (Med)** — 50k cap + evict-oldest on the limiter `hits` Map in `collections.ts` / `memory.ts` / `auth.ts`.
- **W-1 (Med)** — `cdn-worker/src/worker.js`: drop `url.search` from origin fetch + cache key (pathname-only).
- **W-3 (Med)** — `WALRUS_AGGREGATOR` env-driven via `VITE_WALRUS_AGGREGATOR` (testnet default) in `frontend/src/walrus/aggregator.ts` + `.env.example`.
- **W-4 (Med)** — `BLOB_ID_RE` charset guard in aggregator.ts (malformed id → ''/null) + worker id-segment charset check (400).
- **B-2 (Med)** — `memwal-spike.ts` writes the delegate key to a 0600 gitignored file (`backend/.env.memwal-delegate`), prints only the path; error handler message-only.
- **Tests** — backend **306** pass (+paymentVerifier/quota-store/auth additions); worker smoke **6/6** (new `cdn-worker/test/`); frontend aggregator **13** + TrackPage suite pass. Frontend `tsc -b` is **pre-existingly red (46 errors, unrelated)** — flagged separately.
- **Browser-verified** (`/browse`, agent-browser): 4/4 thumbnails resolve real on-chain ids, 0 empty/broken, no new console errors (W-4 doesn't false-reject real base64url ids; W-3 default resolves).
- **6-reviewer pass** (correctness/adversarial/security/testing/api-contract/julik-races): no exploitable bypass. Found + **fixed 1 real defect** — `TrackPage.tsx:252` direct `fetch(glbUrlForToken())` of the new ''-return → added `if (!url)` guard + recency-fail-open + retry tests.
- **Docs** — ADR D-088/D-089; audit report remediation table + residuals; OQ-033 (Option B) + OQ-034 (residual hardening). `docs/decisions.md` reserved marker → D-090.

### In Progress / Not Done
- Merged to `main` (`2171c6b`, --no-ff) — the full audit-remediation stack (C-1/H-1/Move guards + Track 4–5).
- **Frontend `tsc -b` cleanup DONE** (`799efff`) — the 46 pre-existing errors are fixed; `pnpm --dir frontend test` now green (1014 pass).
- **Testnet republish DONE (v12)** — fresh republish of v11 for the audit DENY-tightening (per UPGRADE.md v7/D-040: a compatible upgrade would leave the old id callable as a bypass). New package `0xbf0affb8…`, SealIdRegistry `0x048e36ee…`, TransferPolicy `0x8f7ef10d…` (+cap `0xe8a9586a…`), publisher `0x0e23f912…`, upgrade_cap `0xf420fabf…`. publish digest `9gzrkk2s…`, bootstrap `3S71jY8U…`. testnet.json + networkConfig.ts + Published.toml updated; parity test + backend config test green; SealIdRegistry confirmed live on-chain. Supersedes v11 `0x1cf8aa4d…` (abandoned). v11 demo models are now unreadable by the app — re-publish fresh at demo time.

### Next Concrete Step
Resolve N-1 (Enoki key portal check) for submission. Defer: OQ-033/OQ-034. Note: the testnet republish (v12) is live — a quick browser smoke of the live app against the fresh package (publish a model end-to-end) is worth doing before the demo since v12 starts with empty state.

### Notes for Next Session
The frontend tsc red (46 errors) is NOT from this work (confirmed via `git stash`: same 46 on clean HEAD). The backend SQLite store (`quota-store.ts`) now also holds `spent_payments` — its file is `TUSK_DB_PATH` (default `./data/quota.db`); a fresh deploy starts with an empty spent-set (acceptable — durability is per-deployment-lifetime, which is the point).

---

## Last Updated: 2026-06-04 (**Security audit remediation — D-085 committed; D-086/D-087/M-4 + M-2 verify in working tree, NOT committed**)

### Hackathon Tracker
- Days to submission (6/21): **17 of 38**
- Days to demo day (7/20–21): ~46
- Days to winners (8/27): ~84

### Current Phase
Phase 4 — security hardening. Ran a read-only multi-agent audit (sui-dev-agents plugin) over Seal / Move+red-team / frontend signing (backend+Walrus deferred). Report: `docs/audits/2026-06-04-security-audit-seal-move-frontend.md` (1 Critical, 1 High, 5 Med, 8 Low, 4 Info).

### Completed This Session
- **Audit** — 6 agents via Workflow, read-only, no mcp-server build, no chain tx. All findings ground-truthed against source.
- **D-085 — fixed C-1 (Critical) seal_id prefix-truncation bypass** (also closes M-3). Contract change in `contracts/model3d/sources/model3d.move`: `SEAL_ID_LEN=32` + `ESealIdWrongLength=59`; `new_model` asserts encrypted seal_id `== 32` (after consistency guard); both `seal_approve_*` gates re-assert length; corrected the misleading "exact-uniqueness ⇒ unforgeable" comments. Chose fixed-length (Alt B) over object-id binding (Alt A) — keeps 1-wallet-popup, ~6 lines, equiv security; Alt A deferred to v1.1 (OQ-032).
- **Tests** — 4 fixtures bumped to 32-byte seal_ids + 2 new regression tests incl. the C-1 red-team case. **`sui move test` = 90/90 PASS, `sui move build` clean (no warnings).**
- **Docs** — ADR D-085 in `decisions.md`; root-cause + B-vs-A tradeoff in `docs/solutions/design-patterns/seal-id-prefix-binding-fixed-length-2026-06-04.md`; audit checklist C-1/M-3 marked done; OQ-032 (C-1 testnet repro + v1.1 Alt-A revisit).

### Second remediation batch (this session, on branch `fix/seal-id-prefix-bypass`)
- **D-085 — COMMITTED** as `490180c` (C-1 + M-3; 5 regression tests; reviewed by sui-red-team [C-1 CLOSED] + ce-correctness).
- **M-2 — verified NON-issue** (downgraded Info): on-chain `royalty_rule::pay` (rev 7a07937) computes the fee from `policy::paid(request)` + asserts `coin::value == amount` (exact) → no underpay; client value is non-load-bearing. Audit report updated.
- **D-086 — fixed H-1** (mint_tokens quilt rug): write-once quilt (`EQuiltAlreadySet`). Supply cap (Info) deferred per user (option a).
- **D-087 — fixed L-1/L-2/L-3**: `EInvalidPolicy` (policy whitelist) / `ESelfRegistrationNotAllowed` / `ECreatorCannotSelfPurchase`.
- **M-4 — fixed** (frontend): `clearSession` calls `clearAllSessions()`; the account-switch `useEffect` now routes through `clearSession` too, so a SILENT account switch (the common shared-device case) also wipes the Seal cache — not just the disconnect button. Two useSession assertions.
- **Review** — `ce-correctness-reviewer` on the batch diff: **D-086/D-087 correct & regression-free**; one low M-4 completeness gap (account-switch bypassed the wipe) — **fixed** as above. Residuals accepted: `clearAllSessions` wipes all addresses (no multi-address flow today); `mint_tokens` empty-quilt-first ordering quirk (benign, cap-gated).
- **Tests**: `sui move test` **96/96**, build clean; `useSession.test.tsx` **10/10**; renamed the D-085 unknown-policy test to expect `EInvalidPolicy`. ADRs D-086/D-087 + audit checklist updated.

### In Progress / Not Done
- **NOT committed** — D-086/D-087/M-4 + the M-2 doc update are uncommitted on `fix/seal-id-prefix-bypass`. Suggest a second commit.
- **Testnet republish pending** — D-085/D-086/D-087 (contract) only take effect after republish (new package id → `networkConfig` update + Seal re-bind). Demo re-publishes fresh models.

### Next Concrete Step
Commit the D-086/D-087/M-4 batch. Then the only remaining pre-submission item is **N-1** (confirm Enoki `VITE_ENOKI_API_KEY` is the public/origin-locked key — portal check, user). Defer: M-1 (deployer-gated on testnet), M-5, L-4–L-8, N-2/N-3/N-4, and the backend/Walrus tracks (post-demo).

---

## Last Updated: 2026-06-03 (**Third-Party AI Degradation UX — U1–U8 BUILT**; branch `feat/ai-degradation-ux` off `main`, NOT merged)

### Hackathon Tracker
- Days to submission (6/21): **18 of 38**
- Days to demo day (7/20–21): ~47
- Days to winners (8/27): ~85

### Current Phase
Phase 4 (hardening / demo-readiness). Feature: wrap the two paid third-party AI deps (Tripo, Gemini) in a degradation layer so quota/failure never surfaces as a raw 500 or a vanished feature. **ADR D-083**. Plan: `docs/plans/2026-06-03-002-feat-third-party-ai-degradation-ux-plan.md`. Origin: `docs/brainstorms/2026-06-03-third-party-ai-degradation-ux-requirements.md` (R1–R12, AE1–AE7).

### Completed This Session (8 units, per-commit, D-083-tagged)
- **U1** `backend/src/lib/quota-store.ts` — first persistent store. `node:sqlite` `DatabaseSync` (loaded via createRequire + computed specifier — Vite dep-scanner can't externalize the experimental builtin). Cached Tripo balance + per-day Gemini counters keyed `(capability, scope, day)` + cooldown. Factory + `getQuotaStore()` singleton (single-connection invariant). 11 tests.
- **U2** `gemini-quota.ts` (checkBudget/recordSuccess/recordRateLimited/isRateLimited; self-count primary, 429-reset authoritative) + widened the copilot/caption `generate` seam to `{text,headers?,usage?}` and record 429 **inside the closure** (before withTimeout masks a slow 429). 14 + updated client suites.
- **U3** copilot + caption routes: `checkBudget` → visible `{available:true, error:'quota_exhausted', retryAfterMs}` (NOT available:false); per-address cap (R8) default-ON 50; `available:false` stays the only hide (AE7). Shared `geminiQuotaGate.ts`.
- **U4** `tripoBalancePoller.ts` (mirrors integrationIndexer + **unref()**) + `tripo-client.getBalance()` + `GET /api/generate/preflight` (JWT + per-address limiter + single-flight live fetch; stale-TTL forces live re-query; fail-closed, no quantitative balance). Wired in server.ts invokedDirectly.
- **U5** `generate.ts` — classify Tripo errors → typed codes + non-500 (`tripo_unavailable` 503 / `tripo_timeout` 504 / `tripo_failed` 502), `refundable:true` only when paid. New generate.test.ts.
- **U6** `api.ts` `preflightGenerate` + structured `GenerateError`; `CreateModelPage.onGenerate` pre-flights before pay (R1, blocks without charge) + classified messages (`'preflight'` genStatus, "CHECKING…").
- **U7** `formatRetryAfter.ts` + both Gemini hooks gain `'quota'` status + auto-recovery `useEffect` (mounted.current read inside the timeout); caption button "AI QUOTA REACHED" + hint (no retry); CopilotChat quota panel. Never-hide.
- **U8** D-083 ADR + `.env.example` (5 new env vars + VITE_ security warning) + this block + OQ-029/030.

### Test + typecheck status
- Backend: **293 green**, tsc clean. Frontend: **1006 green**, tsc (`typecheck`/`tsc --noEmit`) clean.
- NOTE: `pnpm build` (`tsc -b && vite build`) is RED on PRE-EXISTING type errors in unrelated test files (`useLedeRenderMode.test.tsx`, `racetrackScene.test.ts`, `fetchWithTimeout.test.ts` — landing/track/walrus, present on `main`, not touched by this branch). Not introduced here.

### 5-reviewer pass — DONE
Ran correctness / testing / api-contract / adversarial / julik-frontend-races on the branch diff. Confirmed defects FIXED in `fix(quota): 5-reviewer pass …`: per-address counter desync (R8 now attempt-counted past the gate), `GEMINI_*=0`/negative config footgun (`posEnv` → `=0` disables), over-broad `isRateLimited` (narrowed + structured Google status), cooldown reset clamp (`safeCooldown`), copilot `quota` send guard. Deferred (low-impact) findings recorded in **OQ-031** (onGenerate unmount/session guard, shared-type promotion, a few test gaps).

### D-084 — never hide a built AI feature (user direction)
Reversed AE7's keyless-hide: keyless now shows a VISIBLE disabled "AI UNAVAILABLE" (Copilot: "⚠ AI unavailable"), the only hide is the build flag `VITE_COPILOT_ENABLED`. Frontend-only (backend still returns `{available:false}`); AE7 frontend tests flipped. ADR D-084.

### Browser verification — DONE (agent-browser, test-wallet auto-login + GET-mock / real-backend env)
- ① pre-flight block: gen-error "temporarily unavailable", NO wallet/charge (`/tmp/verify-1-preflight-block.png`).
- ② Gemini quota visible: Copilot "⏳ AI QUOTA REACHED — try again ~5m", toggle still visible (`/tmp/verify-2-quota-visible.png`).
- ③ keyless: now shows "⚠ AI UNAVAILABLE", toggle still visible — NOT hidden (`/tmp/verify-3-keyless-unavailable.png`, post-D-084).
- Also: headless backend self-check `backend/scripts/verify-degradation.ts` (real Tripo+Gemini keys) — ①②③ all PASS.
- Caption "Describe with AI" real path needs `--headed` (Babylon WebGL); covered by jsdom tests + Copilot demonstrates the same logic.

### Test + typecheck (final)
- Backend **293 green** + tsc clean; Frontend **1006 green** + tsc clean.

### Next Concrete Step
Shipped to `main`. Follow-ups: OQ-029 (finalize refundable contact string before 6/21), OQ-030 (auto-refund @ 8/27 mainnet window), OQ-031 (onGenerate guard + shared-type + minor test gaps), live-calibrate `TRIPO_PREFLIGHT_MIN_CREDITS` post-deploy.

### Blockers / Open Questions
- **OQ-029** — finalize the refundable-failure contact destination (currently placeholder "the Tusk3D team"); before 6/21.
- **OQ-030** — automatic Tripo refund deferred (feasible; needs a server hot wallet) → 8/27 mainnet window.
- **OQ-031** — deferred 5-reviewer findings (onGenerate guard + shared-type + test gaps).
- Live calibration of `TRIPO_PREFLIGHT_MIN_CREDITS` (diff balance across one real chain) is a post-deploy operational task.

### Notes for Next Session
- `node:sqlite` runtime default DB path is `./data/quota.db` (gitignored); deploy must mount a volume at `TUSK_DB_PATH`'s dir. The poller + balance source are wired ONLY in server.ts's invokedDirectly block (R12) — `buildApp` mounts the pre-flight route but resolves the store lazily at request time, so tests/imports never open the DB.
- 2 `glb.ts` tsc errors seen intermittently are pre-existing (TS 5.7 TypedArray-generic, commit `77bb053`), unrelated.

---

## Last Updated: 2026-06-03 (MemWal **Upload Captioning — U1–U6 BUILT**; branch `feat/memwal-upload-captioning` off `main`)

### Hackathon Tracker
- Days to submission (6/21): **18**
- Days to demo day (7/20–21): ~47
- Days to winners (8/27): ~85

### MemWal Upload Captioning (BUILT, branch `feat/memwal-upload-captioning`, NOT merged)
Ran the remaining MemWal stretch: brainstorm → plan → `/ce-work`. **ADR D-082** (extends D-081's prompt-authoring LLM seam from text→text to **vision/image→text**; does NOT touch D-023's LLM-free dispatch). Plan: `docs/plans/2026-06-03-001-feat-memwal-upload-captioning-plan.md`. Origin: `docs/brainstorms/2026-06-03-memwal-upload-captioning-requirements.md` (R1–R14, AE1–AE7).

**What it is:** an opt-in **"Describe with AI"** button on `/create` **upload** mode. Captures 3–4 clean (un-watermarked) turntable frames from the Babylon preview → POSTs base64 WebP (images only, **no filename/mesh text hints** — they mislead vision) to a new JWT-authed `/api/caption` route → Gemini `gemini-2.5-flash` (multimodal, **reuses the L2 key + `VITE_COPILOT_ENABLED` gate**, no new dep/key) → short low-poly description into an **editable** field. On mint, a captioned upload writes the caption **personal-only** to MemWal (no global mirror — AI guesses stay out of the human-authored community pool) + `params_json = { source:'upload', caption }`. An always-on DESCRIPTION field lets creators hand-type even with no key. Fail-soft throughout: no key / capture failure / model error → upload→mint unchanged, no caption. Closes the memory-story gap (uploads were invisible to recall).

**Units (per-commit, conventional, D-082-tagged):**
- **U1** `backend/src/lib/caption-client.ts` — Gemini vision single-shot; INERT without key; `CaptionDegradedError`; clamps ≤1000; `generate` seam for tests. (9 tests)
- **U2** `backend/src/routes/caption.ts` (`/api/caption`) — mirrors copilot.ts: JWT bindNamespace (hard-401), per-address limiter (30/min), zod frames schema (min1/max6, base64 bounded, mediaType literal `image/webp` — **no text field**), INERT→`{available:false}`+`x-caption-degraded`, transient→`{available:true,retryable:true}` (never 5xx/leak). Registered in `app.ts`. (12 tests)
- **U3** `captureStills.ts` clean variant (`frameStill` no-watermark + `captureFramesFromScene` + `CAPTION_FRAME_COUNT=4`) + `PreviewCanvasHandle.captureFrames`; watermarked publish path untouched. (5 tests)
- **U4** `frontend/src/creator/useUploadCaption.ts` — single-shot describe hook; token/seq/mounted guards (StrictMode re-assert), `{available:false}`→hide, transient→error+retry, base64-encode frames. (6 tests)
- **U5** CreateModelPage wiring — DESCRIPTION field + "Describe with AI" button in upload mode (gated `VITE_COPILOT_ENABLED && captioner.available`), `previewRef.captureFrames()`→describe→fill, IndeterminateBar on wait, `params_json` + personal-only remember branch (no `policy`). (7 new tests)
- **U6** ADR D-082 + `.env.example` (CAPTION_MODEL note) + this block.

**Tests:** backend **221 green**, backend tsc clean (pre-existing 2 errors in `glb.ts` unrelated). Frontend **990 green** (2 pre-existing skips), frontend tsc **clean**.

**5-reviewer pass DONE** (correctness/testing/api-contract/adversarial/julik-races). Fixed: **bodyLimit(3 MB) on /api/caption** (was: `c.req.json()` buffered full body before zod caps → OOM vector); **clear caption + `captioner.reset()` on `glb`/sourceMode change** (was: a stale caption could ride onto the next model's `params_json` + personal-memory write — data-integrity, flagged by 2 reviewers); **`describe()` re-entrancy guard** + **textarea locked while `thinking`** (was: rapid clicks fired duplicate paid calls; a slow response could clobber a mid-flight edit); **skip `frameCameraToMeshes` in the caption capture** (was: re-frame mutated radius/target/limits that only-alpha-restore left lost — killed the camera race + pose loss). Added tests: 413 oversized body, latest-wins stale-drop, stale-caption-cleared-on-reupload, edit-lock-while-thinking. **Accepted (pre-existing/hackathon-scope, shared with copilot.ts):** per-address-only limiter + shared-key fan-out (no global key cap), rate-limit map no sweep, quota-vs-transient not distinguished, `frameStill`/`captureFrames` browser-only fns tested via DI seam not directly.

**BROWSER-VERIFIED (2026-06-03, headed Chromium via agent-browser + user manual check):** sign-in → upload mode → GLB upload → preview render → DESCRIPTION field + "DESCRIBE WITH AI" button (design-token aligned) → click → `captureFrames` (real WebGL) → POST `/api/caption` → Gemini → accurate caption filled (e.g. "Low-poly game asset of a white classic pickup truck, slightly lifted with an empty bed and chunky black tires"); "DESCRIBING…" label + textarea disabled during the call (edit-lock verified live); caption editable after; no console errors. Backend+Gemini path also confirmed standalone (real WebP → 200 + accurate caption). NOTE: headless Chromium can't drive it (Babylon `Tools.CreateScreenshotAsync` needs real WebGL → `captureFrames` returns [] → fail-soft no-op; correct behavior). D-082 **Accepted**. Merged to `main`.

---

### (prior) MemWal L2 — merged to `main` 2026-06-03 via `aa509da`. Snapshot below.

### Hackathon Tracker (L2 snapshot)
- Days to submission (6/21): **19**
- Days to demo day (7/20–21): ~48
- Days to winners (8/27): ~86

### MemWal L2 — Conversational Riff Copilot (BUILT, branch `feat/memwal-riff-copilot`, stacked on L0/L1, NOT merged)
Ran ideate-context → brainstorm → plan → `/ce-work`. **ADR D-081** (reintroduce an LLM — Gemini — at the *prompt-authoring* seam; does NOT supersede D-023, which still governs the LLM-free generation-dispatch path). Plan: `docs/plans/2026-06-02-002-feat-memwal-l2-conversational-copilot-plan.md`. Origin: `docs/brainstorms/2026-06-02-memwal-l2-conversational-copilot-requirements.md` (R1–R14, AE1–AE7).

**What it is:** an opt-in **"Chat with Copilot"** toggle on the Tripo path of `/create`. Gemini asks ≤3 turns (server-enforced hard cap, forced synthesis on turn 3), skips what it can infer from the user's recalled MemWal memory, and synthesizes a Tripo prompt **into the existing input box** (editable; never auto-generates). Fail-soft: no key / LLM error → toggle hidden, `/create` degrades to L0/L1 + raw textarea. On mint, only the final prompt is remembered (reuses the shipped remember-on-publish; no L1 pollution).

**Units (per-commit, conventional, D-081-tagged):**
- **U1** ADR D-081 + D-023 cross-ref (Status unchanged — it's a *separate seam*, not a reversal).
- **U2** deps `ai@6` + `@ai-sdk/google@3` + `GOOGLE_GENERATIVE_AI_API_KEY` env (backend-only, inert when absent).
- **U3** `backend/src/lib/copilot-client.ts` — Gemini single-shot synthesis; **server decides question-vs-prompt** from turnIndex/forceSynthesize (robust to LLM drift); INERT without key; typed `CopilotDegradedError`; clamps ≤1000 chars. *test-first.*
- **U4** `backend/src/routes/copilot.ts` (`/api/copilot/turn`) — mirrors memory.ts: JWT bindNamespace (hard-401), server-derived turnIndex, per-address limiter (30/min), server-side personal recall→memoryContext (fail-soft), degraded→clean `{available:false}`+`x-copilot-degraded` (never 5xx, never leaks key). Registered in `app.ts`.
- **U5** `frontend/src/creator/useRiffCopilot.ts` — bounded convo hook; token/seq/mounted guards + clear-on-token-change (mirrors useCreatorMemory); error/`available:false`→`available=false`; surfaces `synthesizedPrompt`; never auto-generates.
- **U6** `frontend/src/creator/CopilotChat.tsx` + CreateModelPage integration — Write/Chat toggle (hidden when unavailable, R10/R13), synthesis→`setPrompt`+flip-to-Write (editable, AE5), remember-on-publish untouched. testids `copilot-toggle`/`copilot-chat`/`copilot-send`/`copilot-generate-now`.
- **U7** docs (this block). Demo seed = **reuse** `backend/scripts/seed-memory.ts` (no new mechanism) so the history-aware greeting is real, not hardcoded (R14).

**Tests:** copilot-client 10, copilot route 16 → backend full suite **196 green**, backend tsc **0**. useRiffCopilot 8 + CopilotChat 7 + CreateModelPage copilot-integration 8 → frontend creator suite **122 green**. Frontend tsc: my files **0 new** (40 pre-existing errors in unrelated track/landing/babylon test files — confirmed via stash that they predate this work).

**5-reviewer pass DONE** (correctness/testing/api-contract/adversarial/julik-races). Fixed: synthesis modeled as a one-shot `synthSeq` event + `reset()` wired on toggle (was a second-session dead-end + edit-clobber, correctness P1 / julik P1·P2); recall+parse wrapped fail-soft (R10 — a malformed relayer record could 500); message-array must end with a user turn (rejects role-spoofed arrays); recalled memory fenced as reference-data-not-instructions (prompt-injection); +8 CreateModelPage integration tests (AE5 edit-drives-generation, toggle hide, synthesis fill, second-session reset). **Accepted/documented:** per-process limiter (single-instance demo, mirrors memory.ts), uniform fail-soft status flattening, no AbortController (mirrors useCreatorMemory), cross-account textarea residue (clearing prompt on token-change would wipe a normal JWT-refresh — worse than the rare wallet-switch case).

**Added a default-OFF `VITE_COPILOT_ENABLED` gate** (non-secret feature flag): the toggle shows only when the flag is `true` AND the backend reports the LLM available — so a key-less 6/21 deploy stays clean (no broken-on-click toggle). Browser-verify: pre-wallet `/create` renders clean in the real Vite bundle, **0 console errors** (new modules resolve). Post-sign-in toggle behavior is wallet+key-gated → USER-RUN.

**LIVE-VERIFIED (2026-06-03) with a real paid-tier Gemini key:**
- Key works (free tier was `limit:0` in user's region → user enabled billing; `serviceTier: standard`). **Default model bumped `gemini-2.0-flash`→`gemini-2.5-flash`** (2.0 retired with a 404).
- `backend/scripts/copilot-smoke.ts` (client→Gemini) + `copilot-route-smoke.ts` (full HTTP /api/copilot/turn via minted JWT) both green. Synthesis quality good out-of-box, **no system-prompt tuning needed**: e.g. "a treasure chest"→`Low-poly wooden treasure chest, metal bands, ornate lock, game asset.`
- **Hero-shot confirmed live (R6/R7):** turn-0 with vehicle history → *"Welcome back! You've made some great ground vehicles like a low-poly red sports car… What's the primary purpose or style you envision for this flying vehicle?"*
- **Fail-soft confirmed live (R10):** MemWal recall timed out (2s) mid-call → route still returned `available:true` with the question (empty memory context); copilot kept working.
- Config: key in `backend/.env` (`GOOGLE_GENERATIVE_AI_API_KEY`), `VITE_COPILOT_ENABLED=true` in `frontend/.env.local`, `VITE_TEST_WALLET=0` (real Slush).

**Hands-on UX polish pass (2026-06-03, real Slush + real Gemini key):** driven by the user testing the live flow end to end. All committed on the branch, all suites green (backend 199, frontend 972 +2 skipped).
- **L2 copilot interaction (Q1):** synthesized prompt now delivered IN-PANEL (no jarring auto-snap to Write) — editable result + Generate gate (the real D-053 `SignConfirmation`, single instance) + Start-over, all on the brutalist design tokens. Toggle renamed "🧠 Brainstorm with AI".
- **L2 copilot bugs found live + fixed:** (a) "Generate now" right after a question 400'd (relaxed the msg-array refine: "≥1 user msg" not "must end with user") AND then returned a *question* instead of synthesizing — fixed by appending a user "output the prompt now" turn (Gemini needs a user-terminated convo; also steers synthesis). (b) transient failures no longer hide the feature for the session — they show a retryable "⚠ That didn't go through / Try again" (was the P3 the reviewer flagged). (c) default model bumped to `gemini-2.5-flash` (2.0-flash retired → 404).
- **Wait-state feedback (the "feels frozen" sweep):** shared `IndeterminateBar` (`ux/IndeterminateBar`) on Walrus upload (+ paint-yield before the blocking WASM encode so the label shows) and Tripo generation; defined the missing global `.spinner` so the **Seal decrypt** indicator (ModelDetailPage) is actually visible + a bar on the Launch unlock decrypt.
- **Required-field validation (no silent dead buttons):** Mint highlights missing required fields on attempt (MODEL NAME + ALLOW_LIST unlock price) with inline errors that clear on fill; the part-naming Continue flags unnamed parts (red rows + "name the N highlighted parts") instead of a silent disabled button.

**Only remaining for L2:** the merge decision for `feat/memwal-riff-copilot` (40 commits ahead of main: L0/L1 + L2 + UX polish). Optional: demo seed (reuse `seed-memory.ts`) for the "remembers you" hero. To run locally: `GOOGLE_GENERATIVE_AI_API_KEY` in `backend/.env` + `VITE_COPILOT_ENABLED=true` in `frontend/.env.local`.

---

## Last Updated: 2026-06-02 (MemWal "Riff Copilot" — **U1–U10 BUILT + reviewed + UX/relevance polish + live-API verified**; on branch, not merged)

### Hackathon Tracker
- Days to submission (6/21): **19**
- Days to demo day (7/20–21): ~48
- Days to winners (8/27): ~86

### MemWal Riff Copilot — FULLY BUILT (branch `feat/memwal-riff-copilot`, off main, NOT merged)
`/ce-work` ran the whole plan (D-080, docs/plans/2026-06-02-001-...). All 10 units committed (one commit each, conventional, D-080-tagged) + a review-fix commit. **Tests: shared 9, backend 170, frontend 919 (+2 skipped) — all green. tsc: backend 0; frontend 38 = pre-existing baseline, 0 added.**
- **Personal recall (U1–U7, must-ship):** shared codec `shared/src/memory.ts` (escaped trailer) · backend `lib/memwal-client.ts` (fail-soft wrapper, 2s timeout) · `routes/memory.ts` (JWT→namespace proxy, hard-401 binding, fail-soft recall, address-keyed limiter) · frontend `useCreatorMemory.ts` (debounced SWR hook) · `PromptMemoryChips.tsx` · remember-on-publish in `CreateModelPage.tsx` (Tripo-only, objectChanges→modelId via `extractModelId.ts`) · `scripts/seed-memory.ts`.
- **Global community recall (U8–U10):** dual-write gated on policy≠RESTRICTED (`memoryWrites` shared by route+seed) · global recall exclude-self + drop-missing-`c` + over-fetch×4 + operator denylist · `useCreatorMemory.recallCommunity` (parallel) · `CommunityRecall.tsx` (open-in-new-tab, mobile-collapse, a11y).
- **5-reviewer pass done** (correctness, testing, api-contract, adversarial, julik-races). Trust boundaries all held. Fixed: clear chips on session-change (cross-account leak), normalize derived namespace (ADDRESS_RE vs auth-schema), shared `RecallChip` type, raised recall rate-limit (2 recalls/keystroke), +out-of-order-race & U5-publish-integration tests. Accepted (documented): per-process limiter/denylist (single-instance hackathon deploy), over-fetch heuristic, degraded-200 replaces chips.
- **Browser verify:** pre-wallet PASSED (agent-browser — `/create` sign-in gate + landing render clean in the real Vite bundle, 0 console errors → new hook/components/shared-import resolve). Post-wallet (chips appear for a seeded account, click-to-fill, community open-in-new-tab) is **wallet-gated → USER-RUN**.
- **Baked creds** in `backend/.env` (gitignored, MEMWAL_*). For a live demo: run `seed-memory.ts` (ideally point modelIds at real published models from 2–3 wallets) + set `VITE_TEST_WALLET=0` for real Slush.
- **NOT merged.** Next: user post-wallet browser pass on `/create`, then merge decision.

#### Post-build UX + quality pass (same session, also committed on the branch)
Driven by live hands-on testing with the local dev servers + real Slush:
- **Live API e2e verified (no wallet):** `backend/scripts/memwal-smoke.ts` mints JWTs for 2 addresses and drives the real relayer — proved dual-write, policy gate (RESTRICTED→personal only), exclude-self, RESTRICTED-not-in-global, codec round-trip, 401-on-unauth. This is the end-to-end backend↔relayer proof the unit tests mock.
- **Legible agent presence:** added a persistent **`CopilotBar.tsx`** (`🧠 Riff Copilot` status line, always present once signed in: idle-invite / "Recalling from Walrus memory…"+spinner / found / neutral "No similar models found"). Sections now show skeleton + Walrus provenance line (`N · …Walrus`); the bar is the single "voice" (no duplicate captions). Loading status surfaced via `personalStatus`/`communityStatus` from the hook (SWR-safe, no stuck spinner). reduced-motion gated via `memoryRecall.module.css`.
- **Relevance gate (the "why does 'z'/'penis' match a car" fix):** frontend min-query-length 3 + backend `MEMORY_MAX_DISTANCE` (cosine ceiling, default **0.66**, env-tunable). Probe-tuned: descriptive prompts ≤~0.62 kept; junk/vague (`penis` 0.709, bare `car` 0.710, `dog`) dropped. **Honest limitation captured in `memory.ts`:** a single global threshold can't perfectly separate relevant from irrelevant (junk overlaps real matches); real robustness needs a larger/diverse pool. Deferred option: profanity denylist for demo hardening.
- Tests after polish: creator suite 100 green; backend memory 21; tsc 0 new. All committed.

### U1 spike result (2026-06-02 — on branch `spike/memwal-u1`, NOT merged)
Ran the plan's spike-first U1 only (user scoped "U1 spike only, then stop"). **All gates PASSED** against the live testnet relayer — full findings in **D-080 → "U1 Spike Findings"**. Headlines:
- **`@mysten-incubation/memwal@0.0.6` pinned** in `backend/package.json`. **No wasm** (thin ed25519 HTTP client; +2 `@noble` deps only) → the "ESM+wasm in Node" risk is moot. Compat gate passes (relayer apiVersion 1, minSdk 0.0.4).
- **Plan assumptions corrected:** testnet host is **`relayer.dev.memwal.ai`** (not `staging`); `MemWalConfig` has **no `suiNetwork`** (only `{key,accountId,serverUrl,namespace}`); provisioning needs an explicit `suiClient` (pass `SuiJsonRpcClient`) since `@mysten/sui` 2.6+ removed the auto client.
- **Baked account provisioned** (owner = deployer): `accountId 0x55c2bb7f…`; delegate key + `MEMWAL_*` config saved in **`backend/.env`** (gitignored, server-side only).
- **U8 GATE PASSED** — shared `global` namespace gives independent, well-ranked multi-record recall; namespace isolation holds. **U8–U10 technically unblocked.**
- Throwaway repro: `backend/scripts/memwal-spike.ts` (lives on the spike branch).

### Where we are (read this first after compact)
A **BONUS** feature: integrate **MemWal** (Walrus's AI-agent memory SDK) into `/create`. Ran ideate → brainstorm → plan → ce-doc-review (twice) → **U1 spike (passed)**. Captured as **ADR D-080**. *(Historical: this block is the spike-stage record. The whole plan U1–U10 is now BUILT — see the latest block at the top of this file.)*

Artifacts (all committed, none built):
- `docs/ideation/2026-06-02-memwal-integration-ideation.md` — 7 survivors.
- `docs/brainstorms/2026-06-02-memwal-riff-copilot-requirements.md` — requirements + Global Recall follow-on.
- `docs/plans/2026-06-02-001-feat-memwal-riff-copilot-l0-l1-plan.md` — **U1–U10**, the operative doc.

**Feature shape (reframed after review — it is a CREATION-RECALL assistant, NOT a "save-SUI déjà-vu guard"):**
- **Personal recall (U1–U7, must-ship):** on publish, `remember()` the prompt to the user's namespace; `/create` shows "your past prompts" chips (click = fill, strong-match highlight).
- **Global recall (U8–U10, cuttable next layer):** dual-write non-RESTRICTED prompts to a shared `global` namespace; "from the community" section (click = open model in new tab). Scope-by-policy: **personal = all policies; global excludes RESTRICTED** (PERMISSIONLESS + ALLOW_LIST in).
- Architecture: **backend proxy** (delegate key in `backend` env, NEVER VITE_; `namespace` = JWT `sub`, hard-fail 401 on unbound); **Gemini** chosen for the (out-of-scope) LLM stretches; fail-soft everywhere.

**Key facts verified from MemWal `dev` source:** no `ask()` method (use `recall`/`remember`/`withMemWal`); 1536-dim embeddings; the published prompt is **already public on-chain** (`Model3D.params_json = {prompt}`). *(Earlier "suiNetwork:testnet + staging relayer" note superseded by the U1 spike — see D-080 findings.)*

### Next concrete step
*(Superseded — U1–U10 are now built; see the top block.)* Remaining: user post-wallet browser pass on `/create` (real Slush + seeded pool), then merge `feat/memwal-riff-copilot` decision.

### Deferred / open (MemWal)
- The "global = semantic search over already-public data" framing is the weaker half; handle at pitch time (personal = private-memory story; global = discovery layer on Walrus). Not a bug.
- L2 conversational Gemini copilot + Upload Captioning (GLB→vision→prompt) are captured stretches, unsequenced.
- Demo-day reliability: managed relayer is beta/no-SLA → plan a pre-recorded clip; global demo needs a curated pool seeded from ≥2 non-presenter wallets (exclude-self trap).

---

## Last Updated: 2026-06-01 (plan-028 track scene visual polish — SHIPPED on feat/track-visual-polish)

### Where we are (read this first after compact)
**plan-028 COMPLETE** (`docs/plans/2026-06-01-028-feat-track-visual-polish-plan.md`, ADR **D-079**) on branch **`feat/track-visual-polish`** (off `main`; NOT merged). Upgraded the `/track` Babylon racing scene from "dark/2000s-flat" to a modern render. **Full frontend suite 887 tests green, tsc 0 new errors.** All 6 units committed (1 commit each) + ADR + review-fix commit + pitch stills.

Root cause was lighting, not geometry. Shipped (all in `frontend/src/track/racetrackScene.ts` + its test):
- **U1 IBL + tonemap** (`58b853a`): `scene.environmentTexture` from a committed prefiltered `.env` (`frontend/public/textures/env/environment.env`, Babylon's official, 268KB) — fixes the near-black PBR car; exposure/contrast lift the ACES-crushed midtones.
- **U2 directional key + shadows** (`90d746b`): DirectionalLight aligned to the SkyMaterial sun + ShadowGenerator (car casts a contact shadow; road+grass receive). Hemispheric dropped to fill.
- **U3 PBR** (`8f2cdba`): asphalt + grass StandardMaterial→PBRMaterial (outer barriers stay Standard — they're `isVisible=false`, replaced by trees).
- **U4 SSAO** (`8a0402d`): perf-gated SSAO2RenderingPipeline; later gated on `IsSupported` too.
- **U5 fog** (`0537dab`): EXP2 atmospheric fog.
- **U6 tuning + browser verify** (`9cec9aa`): drove `/track?blob=…` in agent-browser; before/after stills in `pitch/track-visual-polish/`.
- **Review fix** (`b6ccdc1`): 5-reviewer pass caught an **inverted sun** — a first U6 pass set `SKY_INCLINATION=0.58`, which put the sun BELOW the horizon (light pointed UP). Corrected to 0.35 (sun ~27° up, light down); added a regression test asserting `direction.y < 0`, an SSAO `IsSupported` gate, and roughness + dispose-order assertions.

### Browser verification (done, no wallet needed)
Used the `/track?blob=<id>` dev hatch. The prior dev blob had expired (Walrus testnet blobs are ephemeral), so minted a **fresh** one via the public Walrus testnet publisher (no wallet): uploaded `frontend/public/models/tusk3d/walrus-tusk.glb` → blob `7WOezE8xWP0uCIv-GQh_8iRWTQ2pc4q3Tg6Zqy65dRc` (valid ~5 epochs from epoch 415). Verified: model lit, contact shadow grounding, bright midtones, fog depth.

### Next concrete step
Merge `feat/track-visual-polish` → main (or open a PR), or continue the plan-027 real-Slush demo arc below. The track polish is independent of the plan-027 stack.

### Deferred / open (plan-028, all P3, intentionally not fixed)
- IBL async-load failure (404 `.env` on a broken deploy) isn't caught by the sync try/catch — outcome is still graceful (PBR renders unlit, scene doesn't blank) and honestly documented; asset verified present (200). 
- env-texture load can resolve after a sub-second carousel-switch dispose — Babylon 9 guards the late callback internally; benign.
- `/textures/*` absolute paths assume a root-base deploy (pre-existing convention, not introduced here).

---

## Last Updated: 2026-06-01 (plan-027 post-ship: creator-self-pay fix + v11 republish + AUTO-NAME button)

### Where we are (read this first after compact)
plan-027 shipped (see block below). This session added **3 post-ship fixes** on branch `feat/access-entitlement-split`, all committed, **873 frontend tests + 88 move tests green, tsc 32 baseline**:

1. **AUTO-NAME button** (`e0a9d70`) — `/create` tagging step: one click fills every part `part1..partN` (uploaders don't have to type each). buttonOutline, opt-in, overwrites whole map.
2. **Creator self-pay fix** — a creator publishing an ALLOW_LIST model was paying access_fee to THEMSELVES to view/fork their own content (confirmed via tx `FvQCPsZA…`: only gas moved, fee round-tripped). Fixed both surfaces:
   - **View** (`d7799a4`, frontend-only): `/model/:id` — `isCreator` skips Buy-access, decrypts via `seal_approve_creator` (`buildSealApproveCreatorPtb` + `decryptViaCreator`; `decryptEncryptedBase` now has a `DecryptGate = entitlement | creator` discriminator).
   - **Fork** (`e36de95` contract + `b05dc22` deploy + `0db279e` frontend): needed a contract change → **v11 republish**. `launch_collection`/`_with_tokens` now allow ALLOW_LIST when `sender == creator` (non-creators still rejected → bypass stays closed). `/launch`: `isOwnBase` → own base launchable (not locked), unlock via creator gate, mint via legacy `launch_collection` (`launchEncryptedCollection` gained a `launchAuth = entitlement | creator` discriminator).

**v11 deploy (live testnet, supersedes v10 0x01baf4fc…):** package `0x1cf8aa4d81788469a5ccfe8f6e119872c2afa7840b02f76013273421c90b3b6a` (publish `4B8Nv5NF…`, bootstrap `BMApE44B…`); publisher `0x4fd038cd…`, SealIdRegistry `0xb303ecb4…`, TransferPolicy `0x2e35d5bf…` (+cap `0xa0040ab6…`), upgradeCap `0x1a480d47…`. VERSION still 2 (seal gate unchanged). Wired in testnet.json + networkConfig.ts; parity green. **NOTE: the user's v10 test model is now superseded — re-create on v11.**

### Also this session — live-Slush UX fixes (committed)
- **`signWithIntent` bug** (`<commit>`): `/launch` unlock crashed live with "this.signWithIntent is not a function" — `LaunchCollectionPage` passed `signer.signPersonalMessage` UNBOUND (Signer class method → lost `this`). Wrapped in an arrow. (ModelDetailPage already did this.) Unit tests mock signPersonalMessage so they never caught it — this was the never-live-verified Seal seam surfacing.
- **Masthead DISCONNECT button** (`<commit>`): the top-right wallet pill was passive (no disconnect anywhere on-nav). Added an explicit `DISCONNECT` button (testid `disconnect-wallet`).
- **Root cause of "can't switch wallet"**: `frontend/.env.local` had `VITE_TEST_WALLET=1` → app signed with the baked **deployer key (= creator 0x3116881c…)**, NOT Slush. So disconnect/Slush-account-switch did nothing AND "buying access to my own model" happened because the app's identity WAS the creator. Set `VITE_TEST_WALLET=0` (gitignored file, not committed) → real Slush; **requires a dev-server restart** (Vite bakes env at start).

### Next concrete step (USER, wallet-gated)
Real-Slush demo arc on v11 (now that VITE_TEST_WALLET=0 + dev restarted): /create ALLOW_LIST base → as creator, /model/:id shows NO buy CTA + free in-app view; /launch shows your own base launchable → free unlock → mint. Multi-wallet: 2nd Slush account buys access + forks (the buyer-variable seal_approve_entitlement seam). Report any failure.

### Deferred / open
- AUTO-NAME button: unit-tested, NOT browser-verified.
- Not merged to main (linear stack). Merge/demo/deck pending.
- D-078 covers the entitlement model; the v11 creator-launch relax is in D-078's Consequences (no separate ADR).
- `VITE_TEST_WALLET` is per-dev `.env.local` (gitignored) — toggle 0/1 + restart dev server to switch between real Slush and the baked deployer-key identity. The baked key == the deployer/creator, so test-wallet mode can only ever act AS the creator.

---

## Last Updated: 2026-06-01 (plan-027 paid-access entitlement split — ALL 11 units shipped + v10 DEPLOYED; pending user real-Slush demo arc)

### Where we are (read this first after compact)
**plan-027 COMPLETE** (`docs/plans/2026-06-01-027-feat-access-entitlement-split-plan.md`, D-078) on branch **`feat/access-entitlement-split`** (off `feat/upload-segmentation`; linear, none merged to main). All 11 units done + committed; v10 contract **deployed to testnet**. Splits the fork fee into a one-time soulbound **AccessEntitlement** (gates Seal decrypt, L1 entitlement) + a per-launch derive fee; decrypt gate moved cap→entitlement.

**v10 deploy (live testnet):** package `0x01baf4fc457047d6ae6d818063feca20038eb2d878ecae7ec9b0d1dd259cd065` (publish `Ckpi288e…`, bootstrap `BJYZrgyC…`); publisher `0xa01e054f…`, SealIdRegistry `0x051c7ec1…`, TransferPolicy<NftToken> `0xd151395b…` (+cap `0xfc0198a5…`), upgradeCap `0x19664fa5…`. Supersedes v9 `0xba1e84ba…`. Wired in `testnet.json` + `networkConfig.ts`; parity test green.

**All 11 units committed:**
- **U1–U4 contract** (`b7f14ba`): purchase_access + AccessEntitlement (soulbound, dup-guard via Model3D.buyers), access_fee (ALLOW_LIST⇒access_fee>0, derive may be 0), seal_approve_entitlement replaces seal_approve_cap, VERSION 1→2, launch_collection_with_entitlement (legacy entries reject ALLOW_LIST → no bypass). **87 move tests green.**
- **U9** (`cc4c074`) useOwnedEntitlements · **U6** (`c3ffb53`) ABI types+PTB builders+decryptAndView · **U7** (`4f8c4b9`) create-page access fee.
- **U5** (`06dfbc3`) v10 republish + wiring.
- **U10** (`de62b77`) /launch catalog (launchable ∪ locked) + FREE entitlement decrypt at unlock + derive-fee-at-mint via launch_collection_with_entitlement.
- **U8** (`4b2b707`) /model/:id buy-access + 9-state in-app consumer view, no-download.
- **U11** (`<this commit>`): D-078 ADR + spec §3.7 entitlement-gate rewrite + CLAUDE.md L1/L2 relabel.
- **Full frontend suite: 860 tests green, tsc 32 baseline (zero new).**

### Next concrete step (USER — wallet-gated, can't be agent-driven)
Real-Slush **demo-arc dress rehearsal** in your Chrome+Slush: (1) /create an ALLOW_LIST base w/ access_fee>0; (2) /model/:id buy access → in-app view renders the mesh; (3) /launch → base appears launchable → free unlock-decrypt → author variants → mint (pays derive fee). This is also the live confirmation of the `seal_approve_entitlement` buyer-variable dry-run (the one seam unit tests mock). Report back any failure.

### Open / deferred
- Backend cap-hardening (`encryptedBase` JWT-owns-cap check) was dropped from the encrypted mint build call — the cap no longer exists at bake time; on-chain entitlement assert is the authority now. Backend still accepts the optional field (nothing breaks). Follow-up could re-harden via entitlement-id. (U10 deviation.)
- Not merged to main yet (linear stack: seal → upload-seg → entitlement-split). Merge decision + demo/deck pending.

### Notes for next session
- Move can't express `Option<&AccessEntitlement>` (no refs in Option/structs) — ALLOW_LIST enforcement is "reject in legacy entries + dedicated entitlement entry." Don't re-litigate.
- The Seal "buyer-variable dry-run" worry is largely de-risked: v9's deleted seal_approve_cap ALSO gated on a buyer-held owned soulbound object (the cap) and key servers accepted it; seal_approve_entitlement is the same shape.
- `npx tsc` via RTK proxy emits spurious TS6046/5069 — use `./node_modules/.bin/tsc -b` directly for the real 32 baseline.

---

## Last Updated: 2026-06-01 (Encrypted-base LIVE variant authoring — "unlock-first" reorder; double-charge bug caught+fixed)

### Where we are (read this first after compact)
Two forge features shipped this session on branch **`feat/upload-segmentation`** (stacked on the unmerged `feat/seal-content-protection`; NONE merged to main yet):
1. **Upload-path segmentation** (Option A2 / D-077) — see block below.
2. **Encrypted-base live variant authoring** ("unlock-first") — NEW, just done.

**Encrypted live authoring (the user's "nft creator can't see recolored variants" problem):** forking an encrypted base used to make the creator color BLIND (decrypt happened at the very end). Reordered to **unlock-first**: pay fork fee + decrypt UP FRONT (new `onUnlock`), then author every variant on the LIVE decrypted mesh (WYSIWYG), then `onMintEncrypted` bakes+mints. Split the old monolithic `onLaunchEncrypted`; gated the editor behind an "Unlock to design" panel (`needsUnlock = isEncryptedBase && !unlockedCap`). **No contract/backend change** — reuses `launch_collection` + `mint_tokens` + Seal helpers, just reordered; same total sigs (2 unlock + 2 mint). Key enabler: `VariantPreview.displayGlbUrl` already prefers the mesh, so setting `baseGlb`=plaintext makes the existing live UI "just work".
- **Review caught a real HIGH bug + fixed**: `onUnlock` step1 (pay+cap, on-chain) then decrypt (fallible). If decrypt failed after step1, retry **double-charged** the fork fee. Fixed with `pendingCapRef` — resume from the paid cap, re-run only the free decrypt dry-run. Tested.
- Commits: `c7292ca` (feature) + `e121a5f` (double-charge fix). Tests: frontend **833** green, `tsc -b` = 32 baseline (the 32 are pre-existing errors in edgesGradientSweep/landing/some .test files — NOT mine; my files are clean). Backend 136.
- **Verification**: unit tests cover the gate + unlock→live→mint wiring + idempotent retry (Seal seam mocked). `/launch` is sign-in gated so agent-browser can't drive it → the real wallet arc (unlock 2 sigs incl. SessionKey → author live → mint) is **user-run in real Chrome+Slush**. NOTE: 2 of 3 review subagents hit socket/infra errors; the races reviewer completed and cross-covered correctness/adversarial turf (re-entrancy guarded, re-pick blocked by busy, no plaintext-download leak, mint-without-unlock guarded).

### Next concrete step
User wallet-tests the encrypted unlock→author→mint arc in real Chrome. Then decide merge (seal → upload-segmentation stacked → main) and/or demo/deck.

---

## Older: 2026-05-31 / 11:25pm GMT+8 (Upload-path segmentation SHIPPED — Option A2 name-keyed swap, D-077; 5-reviewer pass applied)

### Where we are (read this first after compact)
The "OPEN QUESTION — segmentation on Upload path" below is **RESOLVED + BUILT**. Uploaded GLBs can now be tagged + per-part recolored — but safely, via **Option A2 (ADR D-077)**: the backend recolors by **material name** (order-independent) instead of array position, closing a latent silent-miscolor hole (browser tags by Babylon mesh order; backend recolored by gltf-transform material order — these diverge for arbitrary uploads). All on a NEW branch **`feat/upload-segmentation`** (branched off `feat/seal-content-protection`, which is still unmerged → this stacks on it).

**What shipped (6 commits 57a8f58..4759d44):**
- **U1** name-keyed backend swap + `materialName` optional transport field (`gltf-material-swap.ts`, `shared/types.ts`, route 422s `material_name_not_found` / `ambiguous_material_name`).
- **U2** forge derives per-part material names headlessly (`extractMaterialNames.ts` NullEngine) + `partMaterials.ts` pure helpers (single source of "what is a part" / taggability); `runBuildVariants` attaches names when the base is bijective+unique.
- **U3** uploads route through the existing `TaggingStep` (file pick = the confirm); auto-skips to metadata (`partLabels=[]`) when not taggable (1 part / dup names / >64); `TaggingCanvas.onLoaded` now reports `{partCount, materialNames}`.
- **U4** ADR D-077 + `verify-material-name-parity.mjs` (PROVED Babylon `material.name` == gltf-transform `getName()` on pickup-truck: 14 unique `Material_tripo_part_N`, set+order equal — the core A2 assumption).
- **review fixes** (5-reviewer pass): dup-name backend guard (no silent last-write-wins), `key={glbUrl}` on TaggingStep (re-upload stale-state), frontend surfaces the new 422s, warn (not swallow) on extract failure, fork-time-drift test.

**Tests/build:** backend **136** green, frontend **830** green, `tsc -b` clean (delete stale `*.tsbuildinfo` if it shows phantom 32/33 — clean build = 0). Move untouched (no contract change, no republish).

**Verification status:** core safety verified headlessly (parity script + order-independence unit test). The post-sign-in upload→tag→publish→fork→recolor arc is **wallet-gated** (agent-browser can't sign), so it's a **user-run check** — the user should drive it in real Chrome+Slush before the demo.

### Deferred review findings (tracked in open-questions OQ-027/028 — acceptable for hackathon)
- Babylon↔gltf-transform name parity verified on ONE Tripo file; multi-primitive-per-mesh / other-exporter GLBs not corpus-tested (dup-material case IS guarded; unreferenced-extra-material is benign/uncolored).
- `TaggingStep` shows "LOADING PARTS…" forever if a magic-valid GLB fails Babylon parse (no onLoadError path) — pre-existing for Tripo, more reachable via upload.
- `extractMaterialNames` real-NullEngine path covered by the manual parity script, not a CI test.

### Next concrete step
User decision: (a) drive the wallet-gated upload→fork→recolor arc in real Chrome to confirm end-to-end, and/or (b) merge plan — `feat/seal-content-protection` then `feat/upload-segmentation` (stacked) to main, and/or (c) back to demo video + pitch deck.

---

## Older: 2026-05-31 / 9:00pm GMT+8 (Seal v1 SHIPPED + LIVE-VERIFIED + post-ship UX polish; one open question)

### Where we are (read this first after compact)
plan-026 (Seal content protection) is **functionally complete, deployed to v9 testnet, and end-to-end LIVE-verified** (headless round-trip: encrypt→quilt upload→publish_encrypted→launch_collection→SessionKey→**live key servers released the key**→decrypt→byte-exact GLB). All on branch `feat/seal-content-protection` (NOT merged to main). Frontend **810 tests / tsc 32 baseline**, Move **79**, backend **128**.

**Post-ship UX fixes done this session (all committed, browser-tested by user):**
- 9-popup publish → **one quilt = 3 popups** (`uploadFiles` `quiltSize` override).
- `ModelDetailPage` + `VariantPreview` (fork page) were feeding the **ciphertext to Babylon** → "LOADING BASE MESH…" forever; now render the preview still / honest placeholder for encrypted bases. Full surface sweep done (catalog/detail/fork/market/forge all handle `isEncrypted`).
- **Faux-turntable**: `TurntablePreview` cycles all preview stills (was showing only the first). Revolution-based speed (~1.8s/rev).
- Preview stills: PNG→**WebP**, **8 frames** (= the contract cap `MAX_PREVIEW_BLOBS=8`; lockstep guard test added — do NOT raise past 8 without bumping the on-chain const + redeploy). 512px kept.
- Fee copy de-jargoned ("UNLOCK PRICE" / "what people pay you to unlock your model…").
- Tooling: `frontend/scripts/seal-roundtrip.ts` (re-run before demo: `cd frontend && ../backend/node_modules/.bin/tsx scripts/seal-roundtrip.ts`). `docs/seal-live-verification-checklist.md`.

### ~~OPEN QUESTION~~ → RESOLVED + BUILT (see top block: Option A2 / D-077, branch `feat/upload-segmentation`)
User asked why an **uploaded** GLB has no segmentation. Answer: mesh_segmentation is a **Tripo-only** step (D-033 — Upload bypasses Tripo by design), so uploaded GLBs get `partLabels=[]` and no per-part coloring; the tagging step is gated to `sourceMode === 'tripo'`. I OFFERED an enhancement: for uploaded **multi-material** GLBs (like the user's pickup-truck, which Tripo had segmented), read the GLB's existing materials as parts and enable tagging/per-part coloring **without Tripo**. **User has not answered yet.** If yes: (1) verify the truck GLB's material count, (2) enable TaggingStep for upload mode when material count > 1, (3) derive partLabels from the GLB. This is a NEW feature (multi-file) — confirm before building.

### Other open threads (lower priority)
- `feat/seal-content-protection` not merged to main (awaiting user's merge/PR call).
- Demo video + pitch deck (the user's original priority; Seal is now a live on-chain differentiator for the Walrus track).
- Tripo account is OUT OF CREDITS (top up before demoing the prompt→3D path; or demo via Upload).

### v9 ids (live testnet)
package `0xba1e84ba…876c5c` · SealIdRegistry `0xdb6e97f7…372e3` (shared) · Publisher `0x863582ff…cede0` · TransferPolicy `0x81850ced…2c44` · UpgradeCap `0xfbda72ec…c88d`. After pulling: `pnpm --dir shared build` (else +17 stale-dist tsc errors). Deployer `0x3116881c…` = active sui/walrus CLI addr (28 SUI + 1.31 WAL).

---

## Older: 2026-05-31 / 3:35pm GMT+8 (Seal content protection → **plan-026 100% COMPLETE**; v9 live; all 7 units + deploy shipped)

### plan-026 status: DONE ✅ (17 commits on `feat/seal-content-protection`)
All 7 units + the D0 gate + the v9 deploy shipped & merged. **Frontend 801/801 · backend 128/128 · Move 79/79 · tsc 32 baseline (frontend, zero new) · backend tsc 0.**
- ✅ U1 Seal client · ✅ U2 Move v9 (79/79) · ✅ U3 encrypted publish + ALLOW_LIST · ✅ U4 preview stills · ✅ **v9 deployed to testnet** (`8c785ac`) · ✅ U5 forker decrypt 3-step + catalog RESTRICTED-exclusion + backend cap-verify (`d827ab4`) · ✅ U7 spec §3.7 + OQ-026 · ✅ U6 honest Seal beat on the modelCreator landing card (`7a3a62c`, R14 mitigation framing, browser-verified desktop).
- Branch `feat/seal-content-protection` is **not yet merged to `main`** — awaiting the live wallet round-trip + user's merge call.
- Note for reruns: after pulling, run `pnpm --dir shared build` (the +17 tsc errors otherwise are just stale `shared/dist`, which is gitignored).

### ✅ LIVE end-to-end verification PASSED (2026-05-31, headless)
The full round-trip was verified against live testnet + live Seal key servers via a headless Node script (`frontend/scripts/seal-roundtrip.ts`, run with the deployer keypair — no wallet popups): encrypt → Walrus quilt upload (walrus CLI) → `publish_encrypted` on-chain → `launch_collection` (pay-to-fork) → SessionKey sign → **`seal_approve_cap` dry-run → key servers RELEASED the AES key** → fetch ciphertext by-quilt-patch-id → AES-GCM decrypt → **byte-exact match to the original GLB**. The previously-unverified bit (live key-server release on a real `seal_approve_cap`) is now PROVEN. Re-run anytime: `cd frontend && ../backend/node_modules/.bin/tsx scripts/seal-roundtrip.ts`.

### Remaining (optional, lower-value)
- A real **browser + Slush** run of `/create`→fork (manual checklist Part B in `docs/seal-live-verification-checklist.md`) would additionally confirm the UI wiring live — but the UI is unit-tested and the crypto/contract/key-server path is now headlessly proven, so this is UI-confidence only, not feature-confidence.
- `feat/seal-content-protection` not yet merged to `main` (awaiting merge call).
- Demo recording: warm up the round-trip script once before recording (testnet key servers have no SLA).

### ⚠️ Live verification still pending (user's manual step — wallet-gated)
The decrypt path needs real Slush signatures (can't drive in agent-browser). Untested-against-live-key-servers: the exact `seal_approve_cap` txBytes acceptance + step-1 `objectChanges` id extraction (forkerDecrypt/encryptedFork report §7). Do one real ALLOW_LIST encrypted publish + forker decrypt round-trip on testnet before the demo recording.

### Quick status (this session, branch `feat/seal-content-protection`)
Commits: `77cc703` D0 (ADRs) · `c5dd1c2` U1 (Seal client) · `01484ba` U2 (Move v9, 79/79) · `1ca5fc9` U3 (encrypted publish + ALLOW_LIST) · `6a38385` U4 (preview stills) · `8c785ac` **v9 DEPLOYED to testnet**. Frontend suite **765/765**, tsc baseline **32** (zero new). **Remaining: U5** (forker decrypt 3-step + catalog RESTRICTED-exclusion + backend hardening — the largest unit, demo climax) · **U6** (landing guard tests — has a product decision: whether to surface Seal on the landing) · **U7** (rewrite spec §3.7 onto cap/creator/registry + close OQ-026 — pure docs).

### ✅ v9 LIVE on testnet (publish/ensure_collection_policy succeeded 2026-05-31)
The publish side now runs against a real contract — the deploy gate is CLEARED. v9 ids (in `testnet.json` + `networkConfig.ts`):
- package `0xba1e84ba…876c5c` · Publisher `0x863582ff…cede0` · **SealIdRegistry `0xdb6e97f7…372e3`** (shared, init-bootstrapped — Resolution G confirmed working) · TransferPolicy `0x81850ced…2c44` (+cap `0x8b626d92…14f6`, royalty-only) · UpgradeCap `0xfbda72ec…c88d`
- publish digest `2sFX6yuy…` · bootstrap digest `6LDJwf9z…` · supersedes v8 `0x9e673aa7…` (abandoned)
- The CLI deployer (`0x3116881c…`) is the active testnet address with ~28 SUI gas. Published.toml regenerated to v9.
Next live validation (deferred to U5 / browser + wallet): a real ALLOW_LIST encrypted publish (proves U1–U4 against live Seal key servers) and the forker decrypt round-trip.


### Hackathon Tracker
- Days to submission (6/21): **22 of 38** · demo day (7/20–21): 51 · winners (8/27): 89

### Current Phase
Phase 4 — executing **plan-026 (Seal content protection)** via `/ce-work` on branch `feat/seal-content-protection`.

### What happened / decisions
- User decided to **pull Seal content protection from post-6/21 v1.1 INTO the v1 / 6/21 submission**, FULL feature (option A). Rationale: Walrus-track differentiator; the demo is a **recorded video** so the testnet key-server no-SLA risk is neutralized (re-take until decrypt succeeds). → **D-074**.
- **D-075** (Seal architecture) + **D-076** (amends D-040). Key implementation refinement surfaced mid-build: the plan's `id = [model_id][nonce]` binding is a **chicken-and-egg** (object id doesn't exist until publish, but encryption precedes publish) — resolved as **Resolution G**: client-random `seal_id` + a shared `SealIdRegistry` that enforces global uniqueness (defeats the copy attack), keeping encrypted publish ONE transaction.

### Completed this session
- **D0** (`77cc703`): ADRs D-074/075/076, amended D-040 status, re-framed plan-026 off its "post-6/21" labels.
- **U1** (merged `c5dd1c2`): `frontend/src/seal/{sealClient,envelope,sessionKey}.ts` + tests; `@mysten/seal@1.1.3` (peer `^2.16.2` exact). Envelope = AES-256-GCM + Seal-wrapped key. 21/21 vitest, 0 new tsc errors. (Built in an isolated worktree, reviewed, merged, worktree cleaned up.)
- **U2** (`01484ba`): Move v9 republish surface — `Model3D` gains `sealed_key`/`seal_id`/`preview_blob_ids`/`seal_version`; `is_encrypted` derived from policy; `SealIdRegistry` (bootstrapped in `init`); `publish_encrypted` (registry-unique); `seal_approve_cap` (named triple-check) + `seal_approve_creator` + version tripwire; `validate_seal_publish` (ALLOW_LIST⇒fee>0); D-040 gate amended (only RESTRICTED creator-only); `mint_tokens` (batch + post-bake quilt). **79/79 `sui move test`** (64 existing unbroken + 15 new).

### In Progress
- **U3** (task #4, in_progress): encrypted publish flow + re-expose ALLOW_LIST in `/create` (`frontend/src/creator/CreateModelPage.tsx`, `modelTxBuilders.ts`, `useWalrusUpload.ts`). Then U4 (preview stills), U5 (forker decrypt + catalog + backend hardening), U6 (landing guard tests), U7 (spec §3.7 rewrite + close OQ-026).

### Next Concrete Step
Implement U3: replace the hardcoded `isEncrypted:false` (CreateModelPage.tsx:641) with policy-derived; route encrypted publishes through `encryptBase` → `publish_encrypted` PTB (now takes the `SealIdRegistry` + `sealed_key`/`seal_id`/`preview_blob_ids`); re-add ALLOW_LIST to the policy selector with the fee>0 requirement.

### ⚠️ Deploy handoff (blocks end-to-end verification, NOT code)
The Move changes are a **fresh v9 republish** — they need an on-chain `sui client publish` ceremony (user's keys/gas) to produce the new package id, which then wires into `contracts/networks/testnet.json` + `frontend/src/sui/networkConfig.ts` (+ the bootstrapped `SealIdRegistry` object id, discoverable from the publish tx). U3/U5 code can be written + unit-tested now; the live encrypted publish/decrypt verification waits on this ceremony. Existing v8 public models stay on v8, untouched.

### Notes for next session
- Seal testnet key servers (2-of-3, threshold 2): `0x73d05d62…356db75`, `0xf5d14a81…591623c8` (hardcoded in `sealClient.ts` with provenance).
- The U1→U5 chain assumes the app passes its shared Sui client into `getSealClient`/SessionKey (the modules default to a `SuiJsonRpcClient` for tests).
- Untracked `frontend/public/models/tusk3d/walrus-tusk.glb` still deliberately unstaged.

---

## Older: 2026-05-30 / 12:40am GMT+8 (Walrus read-path CDN — **METHOD A KILLED, PIVOTED TO METHOD B (Worker); non-blocking prep done, awaiting human Cloudflare steps**)

### What happened this session
User asked to discuss the Walrus read-path CDN (plan-018 / D-069). While prepping to implement Method A (proxied CNAME + Cache Rule), an empirical probe killed it:
- `curl -sI https://aggregator.walrus-testnet.walrus.space/` → `server: cloudflare` + `cf-ray`: **the aggregator is itself on Cloudflare** → a proxied cross-account CNAME hits **Error 1014 "CNAME Cross-User Banned"**.
- `curl -I -H "Host: cdn.tusk3d.space" …` → **403**: aggregator rejects unknown Host (which a CF reverse proxy forwards).
→ Pivoted to **Method B (Cloudflare Worker)**: a server-side `fetch()` uses the aggregator's own Host/SNI, sidesteps both. Captured in **D-073 (supersedes D-069)**.

User purchased **`tusk3d.space`** (Namecheap) — NOT the old `tusk3d.xyz` placeholder. All `.xyz` refs renamed project-wide.

### Completed this session (non-blocking, no Cloudflare access needed)
- **D-073** ADR written; **D-069** marked Superseded.
- `tusk3d.xyz` → `tusk3d.space` everywhere (decisions.md, plan-018, plan-021, brainstorm-s2, `TelemetryStrip.tsx`); grep confirms zero `.xyz` left.
- **plan-018 rewritten** to Method B (Worker deploy steps, `x-tusk-cache` verify, honest latency caveat).
- **`cdn-worker/`** authored & ready to deploy: `src/worker.js` (GET|HEAD `/v1/blobs/*`, immutable edge cache, ordered `WALRUS_AGGREGATORS` failover, `x-tusk-cache`/`x-tusk-origin` headers), `wrangler.toml` (custom-domain route `cdn.tusk3d.space`), `package.json`, `README.md`, `.gitignore`.
- Memory updated: `project_walrus_read_cdn_method_b.md` (old method-a file deleted), MEMORY.md index line.

### Blocked on user (doing 5/31)
Step 1–4 of plan-018 Prerequisites: (1) add `tusk3d.space` zone to Cloudflare, (2) repoint Namecheap NS → Cloudflare, (3) wait Active, (4) create scoped API token (Account→Workers Scripts:Edit, Zone→Workers Routes:Edit + DNS:Edit) and `export CF_API_TOKEN=…` in-session.

### Next Concrete Step (when user returns with zone Active + token)
`cd cdn-worker && CLOUDFLARE_API_TOKEN="$CF_API_TOKEN" npx wrangler deploy`, then verify `x-tusk-cache: MISS→HIT`, then make `frontend/src/walrus/aggregator.ts` read `VITE_WALRUS_READ_BASE` (fallback = current testnet host) and set it to `https://cdn.tusk3d.space`. Then measure latency (plan-018 Step 5) — remember the honest caveat: aggregator already on CF edge, so raw RTT win may be modest; durable wins are our cache + failover + URL control.

### Deploy sequencing decided this session
CDN deploy (`wrangler deploy` + `aggregator.ts` swap) is **off the 6/21 critical path** and deferred to LAST. The frontend reads fine from the direct testnet aggregator (fallback) without it; CDN value (cache-HIT survivability + failover) only matters once a live app has traffic. Critical path is instead: deploy backend → contract (if needed) → frontend (Vercel + `tusk3d.space`) → demo arc end-to-end. The ONE non-deferred Cloudflare step is adding the `tusk3d.space` zone + repointing NS now (same zone fronts both the frontend domain per D-070 AND `cdn.tusk3d.space`; NS propagation is slow, so start it in the background).

### Backend deploy blocked on cost — see OQ-025
User does NOT want to open a paid always-on VM for the backend. **OQ-025** opened: the backend (Hono) is stateless and likely runs free on **Cloudflare Workers** (same account as the CDN zone) or **Vercel Functions** — spike that before provisioning any paid VM. Caveats to check: Tripo dispatch latency vs Workers CPU limits, Node-only deps (`@gltf-transform/core`), secrets as env bindings. Resolve at the start of the deploy push.

### Notes for next session
- Session wrapped with a commit of the CDN-prep batch on `feat/s2-telemetry-strip`: `feat(cdn): Walrus read-path Worker + D-073 (supersedes D-069 Method A)`.
- `frontend/src/walrus/aggregator.ts` is still hardcoded — the config-var swap (plan-018 Step 3) is deliberately deferred until the Worker is live, so nothing breaks before then.
- Domain `tusk3d.space` purchased; **next human action = add zone to Cloudflare + repoint Namecheap NS** (plan-018 Prereqs). API token + Worker deploy wait until after the app is deployed.
- Untracked `frontend/public/models/tusk3d/walrus-tusk.glb` predates this session, unrelated to CDN — left alone.

---

## Older: 2026-05-29 / 4:00pm GMT+8 (S3 Topology Mark — **SHIPPED + REVIEWED**. The 7-survivor landing set is now **COMPLETE**. Full canonical arc (form pre-decided + ridgeline visual user-confirmed → plan-025 → ce-work → 5-reviewer ce-code-review → browser-verify), direct-to-trunk on `feat/s2-telemetry-strip`. 4 commits: `ab24293` plan-025 + `5f12514` U1 SVG + `4f325ce` U2 mount + `e793e20` review-pass. 734/734 vitest; tsc 32. Browser-verified at `/` desktop + 375px.

### S3 — what shipped
- **U1** (`5f12514`): `frontend/public/mark/tusk-ridge.svg` — a Joy-Division "Unknown Pleasures" ridgeline rendered into a tapered tusk silhouette (5 stacked contour lines clipped to the profile). Black ink on transparent (sits on the paper masthead, INVERTED from the paper-on-black lifecycle SVGs). Zero accent.
- **U2** (`4f325ce`): mounted as a decorative `<img>` (`alt=""`) in `Masthead.tsx`'s reserved slot, leading the wordmark. `.mark` 30px (26px @767px), `align-self:center` against the baseline row.
- **Review pass** (`e793e20`): 5-reviewer ce-code-review (report-only) — all P2/P3, no P0/P1. **Honesty confirmed clean**: baking the mark static (vs the ideation's original live-Walrus framing) is defensible — S1 LedeHero carries the live-Walrus proof, and the masthead makes NO competing claim (no fake spinner/decentralization label). Fixes: removed the SVG's `role`/`aria-label` (contradicted the `alt=""` decorative contract — double-announce trap if inlined; 4 reviewers); `display:none` not `visibility:hidden` on `onError` (phantom-gap in the flex row; 4 reviewers); added intrinsic `width`/`height` (CLS); added onError + decorative-lock tests (untested fallback, all 5); broadened the accent guard beyond literal `ff4500`.

### S3 — form decision (carry-forward)
S3 is a **static baked mark, NOT a live Walrus fetch**. Rationale (durable): S1 already carries the live-Walrus proof + CID; a 2nd masthead fetch = redundant proof + 2nd Babylon WebGL context (D-003 cap) + masthead↔S1 coupling, and the ridgeline look is better pre-rendered. If the **demo/pitch narration** frames a Walrus-proof beat, point it at **LedeHero (S1)**, not the masthead mark (adversarial residual-risk note).

### 🎉 Landing complete — all 7 survivors shipped
- ✅ S1 LedeHero (plan-019) · ✅ S2 TelemetryStrip (plan-021) · ✅ **S3 Topology Mark (plan-025, this session)** · ✅ S4 Lifecycle Strip (plan-023) · ✅ S5 Actor Cards (plan-024) · ✅ S6 KeycapRow (plan-020) · ✅ S7 Masthead (plan-022)
- Page flow top→bottom: **Masthead(S7, now with S3 mark) → TelemetryStrip(S2) → LedeHero(S1) → LifecycleStrip(S4) → ActorCards(S5) → KeycapRow(S6)**.

### Hackathon Tracker
- Days to submission (6/21): **23 of 38** · demo day (7/20–21): 52 · winners (8/27): 90

### Next Concrete Step
Landing build is done. **Pivot to demo-video + pitch-deck prep** (the user's stated priority: finish early, leave runway for polish). The compound assets are ready to harvest: S4's 3 lifecycle SVGs (`/lifecycle/*.svg`), S5's actor cards, and S3's ridgeline mark all screenshot well and were authored to feed the README architecture diagram + pitch-deck "how it works"/"who it's for" slides + demo-video opening (KD-5, still unwired). Also pending product-side: the real minted tusk CID (S1 + lifecycle still on placeholder/embedded GLB) and the Walrus read-path CDN (plan-018). Confirm direction with user.

### Notes for Next Session
- Branch is `feat/s2-telemetry-strip` (working trunk; no remote; ALL landing survivors landed here despite the name — a rename/merge to a cleaner branch is a possible housekeeping step before submission).
- Compound-asset harvest (README/deck/demo) is the highest-leverage unwired follow-up.
- Known pre-existing nits (non-blocking): `KeycapRow.tsx` missing `import { type JSX }`; `modePalette.ts:40` stale MAX_VARIANTS comment.

---

## Older: 2026-05-29 / 2:52pm GMT+8 (S5 MTG Actor Cards — **SHIPPED + REVIEWED**: the LAST full landing survivor. Full canonical arc ideate→brainstorm→plan→ce-work→5-reviewer ce-code-review→browser-verify, direct-to-trunk on `feat/s2-telemetry-strip`. 5 commits: `03e0701` brainstorm + `c9ff211` plan-024 + `41776de` U1 + `b1e7a46` U2 + `421e610` review-pass. 729/729 vitest; tsc baseline unchanged (32). Browser-verified at `/` desktop + 375px.

### S5 — what shipped
- **U1** (`41776de`): `frontend/src/landing/ActorCards.tsx` + `.module.css` + `.test.tsx`. Static 4-card MTG actor row (modelCreator / nftCreator / buyer / gameDev), full 5-part anatomy: name (Newsreader italic) / cost (mono, qualitative honest cost — NO hardcoded SUI) / ability / flavor / clickable provenance `<Link>`. Mirrors LifecycleStrip grid→2×2@767px; KeycapRow Link + focus-visible. gameDev marked downstream (`.downstream` tint + `data-downstream` + `↳ CONSUMES OUTPUT` kicker). Zero accent.
- **U2** (`b1e7a46`): mounted between `<LifecycleStrip />` and `<KeycapRow />`; extended `LandingPage.test.tsx` doc-order to Masthead → TelemetryStrip → LedeHero → LifecycleStrip → **ActorCards** → KeycapRow.
- **Review pass** (`421e610`): 5-reviewer ce-code-review (report-only). Fixes: **P1 (adversarial) gameDev overclaim** — "drop collections into any game" implied a non-existent in-game runtime (same class as S4 IN-GAME); reworded to "Registers an on-chain integration that any game can verify" (honest to `register_integration`). P2 **hover-tilt overflow** (adversarial+julik agreed) → `overflow-x:clip` on `.section`. P2 **reduced-motion** now zeroes the `:hover` transform itself. P3 hover affordance → `outline` (was inset box-shadow that skewed under rotation). P2 **AC-2 vacuous period assertion** → scoped to the `<p>`. P3 **AC-3 forbidden-vocab** now scans innerHTML (catches attributes; load-bearing). P2 kicker `aria-hidden` assertion. Relocated stale S3 comment.

### S5 — honest-semantics carry-forward (same correction as S4)
Card copy is honest to **shipped v1** (per `model3d.move` + spec D-029 chain): modelCreator publishes base + license terms (L1) · nftCreator forks a variant collection via `launch_collection` (pay-to-derive, L2) · **buyer OWNS the NftToken** via `mint_nft_token` (ownership, NOT access — L2) · gameDev **registers an integration** via `register_integration` (L3). **Access / Seal / Derivative never appear** (v1.1/unshipped) — AC-3 enforces via innerHTML word-boundary test.

### S5 — accepted (not changed, per review)
- buyer **"5% royalty"** is headline-rate shorthand (`AMOUNT_BP_DEFAULT` 500 bps); omits the `MIN_ROYALTY_AMOUNT_MIST` floor that only dominates below ~0.02 SUI — both correctness + adversarial deemed it defensible marketing copy. Revisit only if a judge tests a sub-0.02-SUI listing.
- `KeycapRow.tsx` missing `import { type JSX }` (uses ambient) — pre-existing, out of scope; future 1-line cleanup.

### Hackathon Tracker
- Days to submission (6/21): **23 of 38** · demo day (7/20–21): 52 · winners (8/27): 90

### Landing survivors status (7-survivor ideation `docs/ideation/2026-05-28-tusk3d-landing-page-ideation.md`)
- ✅ S1 LedeHero (plan-019) · ✅ S2 TelemetryStrip (plan-021) · ✅ S4 Lifecycle Strip (plan-023) · ✅ **S5 Actor Cards (plan-024, this session)** · ✅ S6 KeycapRow (plan-020) · ✅ S7 Masthead (plan-022)
- ⏸️ **S3 topology mark** — the ONLY remaining survivor. DEFERRED + form decided (static baked mark in Masthead's reserved slot, NOT a live fetch). ~30-min polish. Landing page page-flow top→bottom is now: Masthead(S7) → TelemetryStrip(S2) → LedeHero(S1) → LifecycleStrip(S4) → **ActorCards(S5)** → KeycapRow(S6).

### Next Concrete Step
The 6 full landing survivors are shipped. Two clean options: **(a) S3 static topology mark** — the last ~30-min masthead-slot polish, closing out the 7-survivor set; or **(b) pivot to demo/deck prep** — the S4 lifecycle SVGs + S5 cards are deliberately compound assets (screenshot well, feed README architecture diagram + pitch-deck "how it works" / "who it's for" slides + demo-video opening). Given the user's stated priority (finish early, leave runway for pitch + demo), S3 is small enough to finish first, then pivot. Confirm direction with user.

### Notes for Next Session
- S5 is structurally contained to LandingPage; full demo-arc browser check scoped to `/` (per CLAUDE.md, noted not silently skipped).
- The S5 actor cards + S4 lifecycle SVGs are the **compound-asset reserve** for deck/demo/README (KD-5 follow-up, still unwired).
- Branch is `feat/s2-telemetry-strip` (working trunk; no remote; all recent survivors landed here despite the name).

---

## Older: 2026-05-29 / 2:10pm GMT+8 (S4 Lifecycle Strip — **SHIPPED + REVIEWED + MERGED TO main**: full canonical arc ideate→brainstorm→plan→ce-work→5-reviewer ce-code-review→browser-verify, all on `main` direct-to-trunk. 7 commits: `5e90ffb` brainstorm + `e46011d` plan-023 + `f31106e` U1 + `a2e01d9` U2 + `c2d69da` U3 + `51a4f7a` review-pass. 720/720 vitest; tsc baseline unchanged (32). Browser-verified at `/`: 4-panel strip renders between LedeHero and KeycapRow — PROMPT / MODEL / VARIANT (16-fork grid) / IN-GAME OBJ, layer captions INPUT · Tripo / L1 · Model3D / L2 · NftToken / L3 · Integration, Newsreader-italic tagline, zero accent.

### S4 — what shipped
- **U1** (`f31106e`): 3 zero-accent panel SVGs at `frontend/public/lifecycle/` (model / variant / in-game), all derived from the tusk silhouette in `public/lede/tusk-keyframe.svg`.
- **U2** (`a2e01d9`): `frontend/src/landing/LifecycleStrip.tsx` + `.module.css` + `.test.tsx`. Static, no Babylon/canvas/fetch; `import { type JSX }`; PANELS array (panel 1 mono text-well, 2–4 `<img>`); mirrors KeycapRow grid + 767px 2×2 stack.
- **U3** (`c2d69da`): mounted between `<LedeHero />` and `<KeycapRow />`; extended `LandingPage.test.tsx` doc-order.
- **Review pass** (`51a4f7a`): 5-reviewer ce-code-review (report-only). Fixes: (a) **variant.svg 8→16 cells** — adversarial P1: tagline "Sixteen forks" contradicted the 8 tusks drawn; (b) `onError` fallback on panel imgs (broken-image robustness on sub-path deploy); (c) **asset-level zero-accent test** via `it.each` reading the 3 SVG files — the DOM `ff4500` check is vacuous for `<img>` SVGs; (d) word-boundary regex for the Access/Seal/Derivative guard.

### S4 — KEY ARCHITECTURE CORRECTION (user caught a wrong premise — carry forward)
The layer mapping was initially wrong; user corrected it and we reconciled against `docs/spec.md` §1.7/§2.8 ADR chain (D-029/031/032/035-040) + `contracts/model3d/sources/model3d.move`:
- **L1 `Model3D`** = creator publishes base content (sells *access*, but access-sale is **Seal-gated v1.1, NOT shipped**; `Access` struct deleted in v3).
- **L2 `NftToken`** = buyer **owns** the token (ownership, not access) — the **shipped v1 sales surface**.
- **L3 = Integration** (`register_integration` / `NftCollection.integration_policy`, gameDev pays) — shipped v1. The old "L3 = Access" framing is dead.
- **Landing must not advertise Access/Seal/Derivative** — all v1.1/unshipped. Enforced by S4's AC-3 test.

### S4 — deferred / noted (non-blocking)
- **IN-GAME OBJ panel framing** (adversarial, user-approved): the image + header read as an end-to-end in-game demo, but shipped L3 is a B2B registry write (`register_integration`) — there is no "tusk rendered in a running game" flow for 6/21. Caption `L3 · Integration` is accurate; if a judge asks "show the tusk in a game," nothing to show. User chose this framing; revisit if demo script wants a minimal GLB viewer.
- **"Sixteen" is frontend-only** (`MAX_VARIANTS=16` in `VariantEditor.tsx`), **not a contract cap** — a direct PTB could mint >16. Pre-existing. Also `frontend/src/babylon/modePalette.ts:40` has a stale comment asserting a non-existent "Move-contract MAX_VARIANTS (16)" — worth a 1-line fix in a future cleanup.
- **MODEL panel vs LedeHero** visual rhyme (both tusk + model↔mesh, one screen apart) — intentional per KD-2; reviewer flagged mild redundancy.

### Hackathon Tracker
- Days to submission (6/21): **23 of 38** · demo day (7/20–21): 52 · winners (8/27): 90

### Landing survivors status (7-survivor ideation `docs/ideation/2026-05-28-tusk3d-landing-page-ideation.md`)
- ✅ S1 LedeHero (plan-019) · ✅ S2 TelemetryStrip (plan-021) · ✅ S6 KeycapRow (plan-020) · ✅ S7 Masthead (plan-022) · ✅ **S4 Lifecycle Strip (plan-023, this session)**
- ⏸️ **S3 topology mark** — DEFERRED + form decided (static baked mark in Masthead slot, NOT a live fetch; see the 12:35pm entry below). ~30-min polish.
- ⬜ **S5 MTG actor cards** — the last unshipped survivor.

### Next Concrete Step
Two clean options: **(a) S5 MTG actor cards** — the final landing survivor (modelCreator / nftCreator / buyer / gameDev as trading cards; mid-size; note the corrected L1/L2/L3 actor semantics above so the card "provenance" lines are accurate); or **(b) S3 static tusk mark** — the quick ~30-min masthead-slot polish. Either via canonical flow. After both, the 7-survivor landing set is complete and focus shifts to demo-video + pitch-deck prep (the compound assets from S4 feed directly into that — see S4 KD-5 follow-up).

### Notes for Next Session
- S4 strip is structurally contained to LandingPage; full demo-arc browser check scoped to `/` (per CLAUDE.md, noted not silently skipped).
- The 3 lifecycle SVGs are authored as a reusable **compound asset** (KD-5): they can feed the README architecture diagram (currently a stale ASCII block + outdated `/forge` routes), a pitch-deck slide, and the demo-video opening. Wiring them in is a follow-up.
- Landing page top-to-bottom is now: Masthead(S7) → TelemetryStrip(S2) → LedeHero(S1) → LifecycleStrip(S4) → KeycapRow(S6). Only S3 (masthead-slot) and S5 (after S4, before keycaps per ideation layout) remain.

---

## Previous: 2026-05-29 / 12:35pm GMT+8 (S7 Versioned Masthead — **SHIPPED + REVIEWED + MERGED TO main**: full canonical arc ideate→brainstorm→plan→ce-work→ce-code-review→browser-verify in one session, all on `main` direct-to-trunk (no remote per user constraint). 6 commits: `69d4401` brainstorm + `c641c37` plan-022 + `c1c5e77` U1 + `a164f7e` U2 + `9365086` U3 + `80df265` review-pass. **S2 also merged to main this session** (`e34feac`, was on `feat/s2-telemetry-strip`). 710/710 vitest pass; tsc baseline unchanged (32 pre-existing). Browser-verified at `/`: masthead renders `Tusk3D №316` (real `git rev-list --count main`, live-injected via vite define) + `TESTNET EDITION`, first child above S2 strip, single Tusk3D wordmark after TopNav dedup, no masthead overflow at 375px.

### S7 — what shipped
- **U1** (`c1c5e77`): build-time `__ISSUE_NUMBER__` injection via new vite `define` block in `frontend/vite.config.ts` (`git rev-list --count main`, try/catch→sentinel 0). New `frontend/src/vite-env.d.ts` types the global. **ADR D-072** captures the build-time-constant pattern (sibling to D-071).
- **U2** (`a164f7e`): `frontend/src/landing/Masthead.tsx` + `.module.css` + `.test.tsx` (7 tests). Newsreader-italic wordmark + mono `№NNN` + `TESTNET EDITION`, 1.5px rule, zero #FF4500 accent. `typeof` guard makes it safe in vitest (no define there). Optional `issueNumber` prop is the test seam. S3 topology slot reserved as a comment.
- **U3** (`9365086`): mounted `<Masthead />` as first child of `LandingPage` above `<TelemetryStrip />`; extended `LandingPage.test.tsx` doc-order to Masthead→TelemetryStrip→LedeHero→KeycapRow.
- **Review pass** (`80df265`): 5-reviewer ce-code-review (correctness/testing/api-contract/adversarial/julik, report-only). Two fixes applied: (a) vite.config build-log warning when count→sentinel (else S7's № silently vanishes in a Vercel shallow-clone deploy — adversarial+correctness P2); (b) **TopNav brand-mark + TESTNET badge suppressed on `/` only** (user picked option A) — browser-verify surfaced two stacked Tusk3D + two TESTNET (global TopNav vs new Masthead); ideation's page layout hadn't accounted for the global nav. Masthead now owns the wordmark on `/`; nav links + wallet pill stay. `tusk3dWordmarkCount === 1` confirmed.

### S7 — deferred (non-blocking, recorded for follow-up; hackathon anti-gold-plating)
- **P3 extract+unit-test `resolveIssueNumber()`** — cross-reviewer flagged (testing+correctness+api-contract): the 8-line build helper is inline in vite.config.ts, untestable as-is, and the real build-time injection path (define→number) is covered only by manual browser check, not vitest. Extract to a build-only module + stub-execSync test if revisited.
- **P3 main-vs-HEAD count semantics** — adversarial(80)+correctness: `git rev-list --count main` stamps `main`'s count, so a feature-branch / Vercel-*preview* build can show a stale number. Brainstorm KD-3 deliberately chose `main`; the *production* deploy builds from main (HEAD==main) so it's correct there. Left as-is; revisit only if preview-deploy numbers matter.
- **P3 AC-5 jsdom-inert assertion** — testing(90): the `innerHTML` check for `ff4500` can't catch CSS-module color rules in jsdom. Documented in the test comment; the real guard is "component introduces no accent element by construction."
- **SHIP NOTE**: the masthead `№` only renders when the build env has a full git clone with the `main` ref. Vercel default is `--depth=1` shallow → number drops to nothing (now logged on stderr). If the deployed landing must show the №, ensure a full clone / fetch `main` in the deploy config (D-070 Vercel/CF Pages).

### Hackathon Tracker
- Days to submission (6/21): **23 of 38** · demo day (7/20–21): 52 · winners (8/27): 90

### Landing survivors status (7-survivor ideation `docs/ideation/2026-05-28-tusk3d-landing-page-ideation.md`)
- ✅ S1 LedeHero (plan-019) · ✅ S2 TelemetryStrip (plan-021) · ✅ S6 KeycapRow (plan-020) · ✅ **S7 Versioned Masthead (plan-022)**
- 🔜 **S4 PROMPT→MODEL→VARIANT→IN-GAME lifecycle strip — CHOSEN AS NEXT** (highest compounding: same asset feeds README architecture diagram + pitch-deck slide + demo-video opening → directly serves the "leave runway for deck + demo" priority).
- ⏸️ **S3 topology mark — DEFERRED behind S4 + form decided** (brainstorm 2026-05-29). Decision: when built, S3 is a **static baked tusk line-mark** in the masthead's reserved slot (`Masthead.tsx`), **NOT a live Walrus fetch** as the ideation originally framed. Rationale: S1 LedeHero already carries the live-Walrus-proof + prints the CID, so a 2nd masthead fetch is redundant proof and would put two tusks on the first screen (same redundancy class as the two-Tusk3D bug just fixed) + a 2nd Babylon WebGL context (D-003 cap) + masthead↔S1 lifecycle coupling. The Joy-Division ridgeline look is also better pre-rendered than as a live 3D wireframe. Asset blocker bites equally (no real minted CID yet — S1 runs on placeholder + embedded GLB). S3 is ~30-min polish, slot-in anytime.
- ⬜ **S5 MTG actor cards** — remaining.

### Next Concrete Step
**S4 lifecycle strip** — run canonical flow ce-brainstorm → ce-plan → ce-work. Key things the S4 brainstorm must resolve: the 4 panel visualizations (PROMPT text / MODEL gradient / VARIANT grid / IN-GAME scene) and whether to share S1's model↔mesh gradient asset (visual rhyme, ideation §S4); the L1/L2/L3 sub-captions; and the "build once, reuse in README+deck+demo" compound-asset goal. Panel 4 = a neutral "any Babylon/Unity/Godot scene," explicitly NOT the existing /track racing demo.

### Notes for Next Session
- S7 masthead is **structurally contained to LandingPage**; full demo-arc browser check scoped to `/` (per CLAUDE.md, noted not silently skipped).
- The `№` is live to `main`'s commit count — it will keep climbing across judging windows (the intended progress signal). Currently №316.
- S3 will mount into the documented slot in `Masthead.tsx` (the leading comment before the wordmark span); the flex row already accommodates a leading mark without restructuring.
- TopNav now branches on `location.pathname === '/'` to hide brand+badge. If a future survivor changes what `/` mounts, re-verify that branch.

---

## Previous: 2026-05-29 / 11:10am GMT+8 (S2 Telemetry Strip — **SHIPPED + REVIEWED + ALL PUNCHLIST CLEARED, READY TO MERGE**: branch `feat/s2-telemetry-strip` now carries 4 commits — `e42d002` initial impl + `d1cf2ad` overnight phase-progress wrap + `73f76ad` fix-pass landing 5 ce-code-review findings + `399a33c` D-071 ADR + plan-021 stub. **All 7 morning-punchlist items + bonus #9 done.** Browser re-verified post-fix: canonical URL `aggregator.walrus-testnet.walrus.space` resolves the live CID in 0.9s (HTTP 200), strip shows `●LIVE · L1 MODELS 3 · L2 NFTS 26 · WALRUS BLOBS 3 · LATEST CID JAlh…oHY` against real testnet. 702/702 vitest pass. Pre-existing tsc baseline (32 errors on main) unchanged net. Next step: push branch + open PR (user action).

### Morning Punchlist — COMPLETE
- ✅ **#1 P0** (was empirically broken) canonical aggregator URL — `73f76ad`
- ✅ **#2 P0** zero-event guard against package-rotation cascade — `73f76ad`
- ✅ **#3 P1** unhandled promise rejection on race loser — `73f76ad`
- ✅ **#4 P2** thread `AbortSignal` into `queryEvents` — `73f76ad`
- ✅ **#5 P2** D-071 ADR (build-time baked snapshot pattern + canonical-constant SoT rule) — `399a33c`
- ✅ **#6 P3** plan-021 stub redirecting to brainstorm doc — `399a33c`
- ✅ **#7 P3** D-071 reference + KD-1/3/4 reference in commit messages — `73f76ad` + `399a33c`
- ✅ **#9 P3 bonus** tighten `QueryEventsLikeClient.hasNextPage` to required (folded into #4 commit) — `73f76ad`

### Deferred to follow-up (not blocking 6/21)
- **P2 hook unit tests** for `useTelemetryData.ts` — timeout race / pagination loop / AbortController / alive guard / empty-event guard. Currently only component-with-mock coverage. Listed in plan-021 follow-up section.
- **P2 walrusBlobs field redundancy** — `walrusBlobs === l1Models` invariant; label "WALRUS BLOBS" vs spec "WALRUS N MB". Refactor opportunity, not bug.
- **P3 polish**: `formatAsOf` invalid-ISO test, `truncateCid` ≤10-char branch test, pagination 5000-event ceiling signaling, `Object.freeze(FALLBACK_TELEMETRY)`.

### Original 2026-05-29 / 01:55am session note (overnight, pre-fix-pass)

S2 Telemetry Strip — **SHIPPED ON BRANCH, NOT MERGED**: branch `feat/s2-telemetry-strip` carries 1 commit `e42d002` implementing the brainstorm doc end-to-end. 702/702 frontend vitest pass (697 baseline + 5 new TelemetryStrip render-contract tests). Pre-existing tsc baseline (32 errors on main) unchanged net. **Autonomous overnight chain ran**: user said "ce-brainstorm → ce-work → ce-code-review, sleeping, morning review" — chain executed as requested. 9-reviewer ce-code-review surfaced 1 P0 + 3 P1s. **CRITICAL MORNING ITEM**: the WALRUS_BLOB_URL_PREFIX I baked into TelemetryStrip.tsx line 12 (`aggregator.testnet.walrus.atalma.io`) was **a verification miss on my part** — 4 of 9 reviewers independently flagged that `frontend/src/walrus/aggregator.ts` already exports `WALRUS_AGGREGATOR = 'https://aggregator.walrus-testnet.walrus.space'` as the documented single-source-of-truth for Walrus testnet reads. Empirically verified post-review with `curl --max-time 10`: my atalma.io URL **times out at 10s after pulling 900KB / 6MB** (~90 KB/s); the canonical walrus-testnet URL returns **HTTP 200 in 3.4s**. Demo-day judge clicking LATEST CID would hit a near-broken host. **One-line fix**: replace local constant with import of canonical `WALRUS_AGGREGATOR`. Pre-merge MUST.

### Hackathon Tracker
- Days to submission (6/21): **23 of 38** · demo day (7/20–21): 52 · winners (8/27): 90

### Current Phase
Phase 4 polish — landing-page survivor execution. S2 is the third Tusk3D-landing survivor shipped (after S1 LedeHero in plan-019 and S6 KeycapRow in plan-020). Remaining survivors S3 / S4 / S5 / S7 still pending per the 7-survivor ideation doc.

### Completed This Session (overnight chain)
- **Brainstorm doc**: `docs/brainstorms/2026-05-29-s2-telemetry-strip-requirements.md` with KD-1..KD-7 + 3 OQ resolutions during impl
- **5 new files**: `frontend/src/landing/TelemetryStrip.tsx`, `.module.css`, `.test.tsx` (5 tests), `useTelemetryData.ts` (Sui event-sweep with 2s timeout race + AbortController + baked fallback), `telemetryFallback.ts` (build-time snapshot)
- **2 modified files**: `LandingPage.tsx` (mounted `<TelemetryStrip />` above `<LedeHero />`), `LandingPage.test.tsx` (extended doc-order assertion to 3 children)
- **Browser-verified at `/`**: real testnet sweep returns L1=3 MODELS, L2=26 NFTS, real Walrus CID `JAlh6_R_…oHY`, accent budget at 5/5 site-wide, mobile 375px horizontal scroll works
- **Spec violation caught mid-flight + fixed**: initially colored both dot AND "LIVE" text orange (6 accent instances). Fixed `.statusLive` to black ink so only the dot is the accent. Now exactly 5/5 budget.
- **9-agent ce-code-review** ran in report-only mode; full report delivered in chat with table-formatted findings.
- **Empirical post-review verification**: tested both aggregator URLs against the real testnet blob — confirmed my URL is the broken one.
- **Branch**: `feat/s2-telemetry-strip` at `e42d002`. **Not pushed. No PR.** Awaiting morning fix-pass before merge.

### Morning Punchlist (in priority order, all 1-line fixes except where noted)
**MUST land before merge** (all reviewers + empirical eval agree):
1. **#2 P1→P0 (empirically confirmed broken)** — `frontend/src/landing/TelemetryStrip.tsx:12`: replace `const WALRUS_BLOB_URL_PREFIX = 'https://aggregator.testnet.walrus.atalma.io/v1/blobs/';` with `import { WALRUS_AGGREGATOR } from '../walrus/aggregator';` and build href as `` `${WALRUS_AGGREGATOR}/v1/blobs/${data.latestCid}` ``. Also update `TelemetryStrip.test.tsx:75` to assert the canonical URL. **Empirically: my URL times out at 10s, canonical returns 200 in 3.4s.**
2. **#1 P0 zero-cascade guard** — `useTelemetryData.ts:95-115`: when `modelRes.count === 0 && firstEvent === null`, fall back to status='cache' instead of declaring LIVE with all zeros + placeholder CID. Prevents "LIVE · L1=0 · L2=0 · WALRUS=0 · baked…fallback" on package rotation or stale package ID.
3. **#3 P1 unhandled promise rejection** — `useTelemetryData.ts:119`: add `live.catch(() => {});` immediately after the IIFE, BEFORE the `Promise.race`. The race-result `.catch` doesn't subscribe to the losing promise; when timeout wins → `controller.abort()` → `sweepEventStream` throws → `live` rejects unhandled. Fires twice per page-load under StrictMode in dev.

**Should land before merge** (small changes, prevent resource leaks / paperwork debt):
4. **#4 P2** — thread `AbortSignal` into `queryEvents` call. Add `signal` to `QueryEventsLikeClient` interface + pass `signal: controller.signal` in `sweepEventStream`. Otherwise aborted requests run to completion server-side.
5. **#5 P2 ADR D-071** — capture in `docs/decisions.md`: (a) build-time baked snapshot pattern + 2s race semantics (KD-4 promoted), (b) Walrus aggregator URL = the canonical `aggregator.ts` constant pending plan-018 CDN swap. CLAUDE.md decision discipline rule says new pattern + new dep = ADR.
6. **#10 P3 plan-021 stub** — 1-paragraph `docs/plans/plan-021-s2-telemetry-strip.md` redirecting to brainstorm doc. CLAUDE.md ">2 files / new patterns → plan-mode first" rule; user-authorized exception, but explicit redirect closes the audit loop.
7. **#11 P3 commit message** — amend or follow-up commit referencing `(KD-4)` or `(D-071)` once #5 lands. Matches repo's convention from recent commits.

**Defer to follow-up** (post-submission window):
- **#6 P2 hook unit tests** — `useTelemetryData.ts` has zero direct tests; timeout race, pagination loop, AbortController all only exercised via component-with-mock. Real bug class but doesn't affect 6/21 demo.
- **#7 P2 walrusBlobs duplicate field** — refactor only; both label ("WALRUS BLOBS" vs spec "WALRUS N MB") and data field (`walrusBlobs === l1Models` invariant) are KD-3-acknowledged trade-offs but worth tightening.
- **#8 #9 #12** — P3 polish (truncateCid <=10 branch untested, `hasNextPage` SDK type drift, pagination silent under-count past 5000 events).

### Residual Risks (carried forward, no immediate action)
- **Latest CID points at `lineage_blob_id`, not `glb_blob_id`** — user-acknowledged trade-off from the brainstorm chat. Clicking gives metadata JSON not a renderable 3D model. If you want judges to see actual 3D when clicking, would need extra `getObject(model_id)` round-trip. User explicitly accepted current behavior.
- **Fallback CID is placeholder `baked000000fallback…`** — clicking under `●cache` 404s. Ship-checklist says bump on each deploy; no CI gate.
- **`atalma.io` was a verification miss on my part** — I made up the URL in the brainstorm doc instead of importing from canonical `aggregator.ts`. After morning-fix #2 lands, this risk goes away. Lesson worth noting for self: when brainstorm doc says "current testnet aggregator" without a canonical reference, *check the repo for an existing constant before baking a new one*.
- **L2 Derivative architecture may eventually break KD-3** (`WALRUS == L1` invariant) — out of scope today but worth knowing.

### Next Concrete Step
Apply morning punchlist items 1–7 in order (all 1-line edits except #5 which is an ADR write). Then push branch + open PR with the ce-code-review report linked. **Item #1 is empirically confirmed broken on live testnet — do this first.**

### Notes for Next Session
- Branch `feat/s2-telemetry-strip` is at `e42d002`. Don't rebase; just add fix commits on top, run vitest, push.
- Untracked `frontend/public/models/tusk3d/walrus-tusk.glb` (667K spike GLB) is intentionally still untracked — pre-existing from plan-020 era; not part of S2.
- 9-agent ce-code-review run was in `report-only` mode (no /tmp artifacts written). The full structured report is in the conversation transcript at the end of last night's session.
- Browser verification was `/` only — TelemetryStrip is structurally contained to LandingPage so the full demo arc check (per CLAUDE.md) is explicitly skipped, not silently ignored.
- The user explicitly delegated implementation (`只是展示用的 我沒意見`) and said `直接呼叫 ce-work` skipping `ce-plan`. The brainstorm doc captures the canonical-flow override. Per durable feedback memory `feedback_run_ce_plan_after_ideate.md` the canonical flow is ideate → brainstorm → plan → implement; user override on this particular display-only mid-size task. Don't generalize.

---

## Previous: 2026-05-29 / Early-Morning (plan-020 Tusk3D landing S6 dispatch row + route migration — **SHIPPED + MERGED to main**: 6 commits, U1+U2+U3+U4+U5 + RegisterIntegrationPage test, ff-merged at 9c580b7. `/` mounts LandingPage (= LedeHero + KeycapRow); `/browse` mounts BrowsePage; 4 internal Link callsites flipped from `/` → `/browse` (CollectionDetail x2, RegisterIntegration, TrackPage empty-state). Agent-browser smoke verified the route swap end-to-end. /integrate `← Browse` link asserted via new unit test (wallet-gated, agent-browser can't drive). 697/697 frontend tests + tsc clean. **Post-ship cleanup (commit 847c10d)**: D-068 brand finally applied to TopNav brand-mark + index.html title + TopNav test — `Model3D → Tusk3D`; Move struct names intentionally unchanged. **Embedded GLB stopgap dropped** at `frontend/public/models/tusk3d/walrus-tusk.glb` (= `dev-glbs/spike-gen-2026-05-23T12-05-45.glb`, 667K) to unblock GLB-load chain verification while waiting on Rick's Tripo mint. Console "GLB load failed" warning gone; only the expected Walrus-CID-placeholder warning remains. Visual: viewer well still pure black — spike GLB loads but renders invisible (likely edgesGradientSweep clipPlane d=0 OR material absorbs all light against black scene clearColor; not a plan-020 regression, surfaces on every embedded-fallback render). Next session: either (A) Rick mints canonical tusk via `/create` + `/launch` → update `WALRUS_BLOB_CID` + replace stopgap GLB → real-Chrome verification closes plan-019, or (B) start S2 telemetry strip ideation (next landing survivor; reserved accent slot allocated; mid-size plan).

## Previous: 2026-05-28 / Late-Night (plan-019 Tusk3D landing lede S1 — **SHIPPED on `feat/tusk3d-landing-lede`**: 8 commits, U1+U2+U3+U4+U5 + recall-pass fixes + 5-reviewer fixes; 691/691 frontend tests + tsc clean. Component not yet wired into a route — `/` still hosts BrowsePage; surrounding-survivor plan (S2/S6/S7) owns the route move. Asset prerequisites pending Rick: real Walrus blob CID + walrus-tusk.glb from his Tripo pre-flight run. Deferred to follow-up: AC-03 classifyAbort fallthrough comment, cascade fallback when both Walrus+embedded fail (operational; gated on Rick's mint), unexported FetchBlobOptions/EdgesGradientSweepOptions, Babylon bundle tree-shake (explicit plan scope decision). Next session = either ship plan-019 as PR + plan a surrounding survivor (S2/S6/S7 for route integration), or pivot to demo prep / shuriken verification per plan-017 follow-up.)

## Previous: 2026-05-28 / Night (plan-017 walrus-OOM-fix — **SHIPPED AS-IS, complex-base OOM open + mentor consult pending**: AE2 testing revealed R1 multi-quilt batching is functionally inert against the encoder OOM; root cause is total-bytes × 85-100x encoder multiplier, not chunk count. shuriken × 8 (35 MB) passes, pickup truck × 8 (46 MB) crashes regardless of QUILT_SIZE. R2/R4/R5/R6 plan-017 work landed cleanly + actively useful. R1 kept (functional but inert) for demo UX storytelling. Detailed investigation + 6 open questions for Walrus team filed at `docs/solutions/integration-issues/walrus-encoder-oom-investigation-2026-05-28.md`.)

### Hackathon Tracker
- Days to submission (6/21): **23 of 38** · demo day (7/20–21): 52 · winners (8/27): 90

---

### Plan-017 walrus-OOM-fix — CE-WORK COMPLETE (this session, 2026-05-28 evening continued)

After preparing plan-017 earlier in the day, ran `/ce-work` against it in a single session. Branch `fix/walrus-oom` carries 8 commits implementing all 6 units + ADRs + post-smoke hotfix.

**Branch commits (`main..fix/walrus-oom`):**
- 95268f1 — U6 uploadTrail sessionStorage breadcrumb (13 tests)
- be84622 — U2 PreviewCanvas dispose/remount handle (5 new tests + mock extension)
- ddcf4a5 — U1 multi-quilt batching in useWalrusUpload (12 new tests, identifier-padding test updated for per-chunk semantics)
- fb6c88f — U3 LaunchCollectionPage Babylon lifecycle wire-up via VariantPreview ref forwarding (4 new tests; vi.hoisted mock state)
- 795377b — U4 BatchProgressPanel multi-quilt UX (19 tests; pre-flight breakdown + stepped progress + orphan-blob warning + Suiscan links)
- 1785f09 — U5 MemoryPressureBanner pre-flight warning with hysteresis (9 tests; recheckSignal re-fires on LAUNCH click)
- ac5d178 — ADRs D-062..D-065 in docs/decisions.md
- f64b7e6 — hotfix from agent-browser smoke: `engine.wipeCaches` guard against `engine.isDisposed`. React 19's component-delete cleanup path doesn't strictly run useEffect cleanups in reverse declaration order; the engine effect's cleanup can run before the scene effect's cleanup, throwing inside `Engine.unbindAllAttributes`. Added `isDisposed` check + test mock update.

**Verification done in-session:**
- ✅ 652/652 frontend tests (61 new across U1–U6)
- ✅ `tsc --noEmit` zero new errors
- ✅ agent-browser smoke on `/launch`: test wallet auto-signs in, base picker renders 3 forkable models with PreviewCanvas thumbnails. No render crash, no error boundary. (Hotfix f64b7e6 was needed before this passed.)

**Verification pending user-side:**
- ⏳ **AE2 killer check**: user manually loads `/launch` on their actual Brave (10+ sibling tabs, Slush extension, ~3 GB baseline heap), configures 8 variants, clicks LAUNCH. Expected: no renderer crash. 4 Slush popups (2 quilts × register+certify) + 1 launch popup = 5 total signatures. BatchProgressPanel should surface the structure. MemoryPressureBanner may fire pre-LAUNCH given the user's typical baseline.
- ⏳ Stale-trail console surface check: trigger an intentional pre-fix-state crash (or simulate by writing `sessionStorage['walrus_upload_diagnostic']` + reloading), confirm `[WALRUS CRASH DIAGNOSTIC]` appears in DevTools on next /launch mount.
- ⏳ If AE2 fails (renderer still crashes at 8 variants), fallback: `QUILT_SIZE = 2` in `frontend/src/walrus/useWalrusUpload.ts` (one-line change). 8 variants becomes 4 quilts → 8 popups + 1 launch = 9 sigs. Update U4 test math + re-run.

**Plan unit metadata preserved:**
- U1 / R1, R3 / D-062: multi-quilt batching with `QUILT_SIZE=4`, exposed in UX
- U2 / R2 / D-063: PreviewCanvas dispose via useImperativeHandle, engine stays alive
- U3 / R2: LaunchCollectionPage previewRef wire-up (VariantPreview accepts ref prop, threads to inner PreviewCanvas)
- U4 / R6: BatchProgressPanel — pre-flight breakdown + per-quilt stepped progress + Suiscan links + partial-failure orphan-blob warning
- U5 / R4 / D-064: MemoryPressureBanner — 2.5 GB ON / 2.2 GB OFF hysteresis, recheckSignal on LAUNCH click
- U6 / R5 / D-065: uploadTrail — sessionStorage (not localStorage), queueMicrotask defer, in-memory cache to prevent race, surface-once-per-page-load guard

**5-reviewer P1 sweep (commit f65076d, after ce-work):**
- 5 parallel reviewers (ce-correctness, ce-testing, ce-api-contract, ce-adversarial, ce-julik-frontend-races) ran against `main..fix/walrus-oom`. 45 findings total, 11 P1s with overlap.
- Dedup'd 5 P1s, all fixed:
  - **P1-A** (3 reviewers): extend `engine.isDisposed` guard to whole scene-effect cleanup body (the original hotfix only guarded the explicit outer `wipeCaches` call; `scene.dispose()` internally calls `wipeCaches` per Babylon `scene.js:4748`, same crash class)
  - **P1-B** (adversarial): add `await new Promise(r => setTimeout(r, 0))` between multi-quilt chunks — V8's opportunistic major-GC may not reclaim previous chunk's encode buffer without a task-queue boundary; without this fix the heap envelope this plan was designed around (~120 MB/chunk) doubles to ~240 MB transient peak, defeating the OOM fix itself on the very Brave that motivated it
  - **P1-C** (adversarial): one-time `performance.memory` probe logged on `/launch` mount so user can verify on actual Brave whether fingerprint protection is capping the heap reading (if it is, R4 banner never fires regardless of real memory pressure — known Brave behavior is `~10 MB cap` in some profiles)
  - **P1-D** (correctness): `stepStatusForRegister` was falling through to `'done'` on `stage='error'`, painting ✓ green-check on a tx that never landed. Added `errorStage` prop threading `UploadError.stage` so register row shows ✗ on register-failure, ✓ + Suiscan link on certify-failure-after-register-success. New `StepStatus = 'error'` + ✗ glyph.
  - **P1-E** (correctness): tighten pre-flight panel render gate to exclude `phase === 'error'` — `busy` doesn't cover error, so without the explicit guard both pre-flight ("you'll sign N transactions") AND progress panels rendered simultaneously with contradictory copy
- **Deferred P2/P3** (not blockers): stale uploadError state flashes on retry, orphan-blob warning undercount on register-success-certify-failure (partially mitigated by errorStage threading), `clearTrail()` on caught error wipes diagnostic, 5 PreviewCanvas test mocks not migrated to forwardRef, `popupCount` semantic change without rename. Plan-doc inaccuracy: §System-Wide-Impact claims preserved stage names that differ from actual code (real names kept — plan was misremembered). All captured for follow-up.

**AE2 post-mortem (2026-05-28 night session, after the 5-reviewer P1 sweep):**

Tested AE2 on user's real Brave with both shuriken and pickup truck × 8 variants. Three QUILT_SIZE values tested empirically (4 → 2 → 16 single-quilt). All three produce identical V8 OOM signatures on pickup truck × 8. **Multi-quilt batching does not save the encoder OOM it was designed for.**

Hard data:
- shuriken (3 paintable, 4.40 MB/variant) × 8 = 35 MB total → ✅ passes at any QS (17.8s encode)
- pickup truck (14 paintable, 5.80 MB/variant) × 8 = 46 MB total → ❌ V8 OOM at any QS
- sport car seg × 8 → ❌ V8 OOM at any QS

Working theory: `@mysten/walrus-wasm` Reed-Solomon encoder allocates working memory proportional to total quilt input × ~85-100× constant (likely a sliver-matrix materialization step that scales with shard count). Chunk count is independent of this peak.

**What's shipped on `fix/walrus-oom` and merged:** plan-017 in its entirety (R1-R6) plus a 5-reviewer P1 sweep (commit f65076d) plus post-mortem cleanup (commit 4b2e542). R1's multi-quilt path is functionally inert against the OOM but kept for UX storytelling. R2/R4/R5/R6 deliver real value.

**ADRs added in post-mortem:** D-066 (restore QS=4 after testing all values), D-067 (encoder-memory-cliff finding supersedes D-062 premise).

**Mentor consult brief:** `docs/solutions/integration-issues/walrus-encoder-oom-investigation-2026-05-28.md` — full investigation record + 6 specific questions for Walrus team. User will raise these at upcoming hackathon mentor office hours.

**Demo strategy:** shuriken (verified passing). Complex bases documented as v1.1 work in README. The Walrus-track positioning beat (BatchProgressPanel showing "8 variants → 2 quilts → 5 transactions") still works for shuriken at any QS.

**User-explicitly-declined paths** (don't re-propose without new evidence):
- Backend mesh decimation to shrink variants. User: "我不想犧牲 model 品質" — don't pursue without mentor confirmation that there's no other way.

---

**Engineering posture observations (for next session if any drift):**
- Both `editorState.variants.length > QUILT_SIZE` checks in LaunchCollectionPage drive conditional UX (pre-flight panel + in-progress panel). If we change the variant cap from 8, need to revisit the multi-quilt UX threshold story.
- The U6 module-scope `surfacedThisLoad` guard means only ONE useWalrusUpload mount per page load surfaces a stale trail. CreateModelPage and LaunchCollectionPage both mount useWalrusUpload; whichever mounts first wins. Acceptable for v1.

---

### Plan-017 walrus-OOM-fix — PLAN READY (earlier this session, 2026-05-28 evening)

After plan-016 wrap-up, user surfaced "what about the original Walrus crash issue?" Triggered `/ce-debug` for root-cause analysis. Brave minidump `b69ca99a-…ead.dmp` at 2026-05-28 09:53:41 caught the V8 GC signature `Mark-Compact 3997.3 / 4000.5 MB, mu=0.003, last resort` — confirms **V8 heap exhaustion**, not Slush, not Brave Wallet, not dapp-kit IPC, not extension interception. User's dose-response observation (5 variants OK, 8 crash) matches OOM exactly. All 11 prior debug-branch hypotheses (RPC swap, GPU collapse, prewarm) falsified.

**Plan-017 architecture (post-review-pass):**
- R1 = D2 multi-quilt batching with `QUILT_SIZE=4` (rejected: per-variant 16-popup anti-pattern + SDK-patch ~20MB savings not worth half-day)
- R2 PreviewCanvas dispose via `forwardRef + useImperativeHandle` (frees 200-400 MB) — keeps Engine alive, only disposes scene/highlightLayer; adds `engine.wipeCaches(true)` belt-and-suspenders + `isDisposedRef` async-load race guard
- R3 variant cap unchanged at 8 (R1+R2 budget math fits)
- R4 `performance.memory` pre-flight warning banner with hysteresis + Brave quantization probe (OQ-C elevated to U5 first step)
- R5 `sessionStorage` breadcrumb trail (corrected from brainstorm's localStorage) with `queueMicrotask` defer
- R6 (NEW vs brainstorm) BatchProgressPanel surfacing Walrus quilt structure to users — pre-flight transaction breakdown + stepped ✓/⟳/○ progress + partial-failure orphan-cost surfacing

**3 commits on main:**
- 542169e — brainstorm doc
- cba4567 — plan doc (6 units, 4 ADRs D-062–D-065)
- df8fdfb — review pass (10 fixes from ce-coherence + ce-feasibility + ce-scope-guardian)

**Reviewer findings dispatched:**
- Coherence: 0 P0 · 2 P1 (math typo, key structure) — both fixed
- Feasibility: 3 P1 + 3 P2 + 2 P3 — all fixed (pre-impl probe, flow=null + retention check, async-load race, engine.wipeCaches, quantization hysteresis, orphan-blob UX, queueMicrotask)
- Scope-guardian: 2 P1 + 2 P2 + 1 P3 — 3 fixed (typo, 9-variant test, key drift); 2 declined (BatchProgressPanel "overscope" → R6 was explicit user choice; ADR weight → already right-sized)

**Verification killer check** (deferred to ce-work S2): user's Brave with 10+ sibling tabs + 8 variants → Slush 4 popups → completes without crash. This is AE2.

**Decisions captured on the way to the plan (this session, in chat):**
- D-062 candidate: multi-quilt + UX education chosen over per-variant (16 popups) or SDK patch (half-day for ~20MB)
- D-063 candidate: forwardRef imperative dispose + isDisposedRef async guard
- D-064 candidate: 2.5GB threshold with hysteresis + Brave quantization probe
- D-065 candidate: sessionStorage single-array key (corrected from brainstorm's localStorage)

ADRs will land in `docs/decisions.md` during U-impl commits (per CLAUDE.md decision protocol — capture before each unit's implementation).

### Plan-016 test-wallet-adapter — DONE (this session + previous)

Bypasses Slush for `/launch` after an 11-commit debug session (branch `debug/walrus-upload-crash`) failed to clear the user's environmental Chrome crash on writeFilesFlow encode. Adapter signs locally with an Ed25519 keypair loaded from `frontend/.env.local` (same key as Slush deploy key — address-matched). Demo unblock; secondary win = agent-browser CI integration enabled.

**Final state on main:**
- 13 commits land on main: a499850 (docs) → 7baa96c (U1) → 6ee2937 (U2) → e82a5eb (U3) → bbe668b (S1 ckpt) → 01bd89e (U4) → 347d82c (U5) → 969f8c3 (U6) → 63780d7 (U7 ADRs) → b0a5b23 (hotfix) → 2b7b34b (code review fixer) → 403d76a (OQs) → wrap-up (this commit)
- 591/591 vitest green · 0 plan-016 tsc errors (17 pre-existing in unrelated files per AE5)
- 4 ADRs: D-058 (Ed25519Keypair-as-Signer) · D-059 (build-time env + wrapper hooks) · D-060 (/launch-only scope) · D-061 (test-wallet subtree + ESLint allow-list)
- 4 OQs appended to canonical docs/open-questions.md: OQ-021 (Slush co-existence) · OQ-022 (stale JWT survival) · OQ-023 (vite.config build-time gate) · OQ-024 (testnet/mainnet runtime check, won't-fix with rationale)
- 3 reusable solution docs: `architecture-patterns/ed25519-keypair-is-sui-signer-2026-05-28.md` · `design-patterns/vite-build-time-flag-tree-shake-gate-2026-05-28.md` · `integration-issues/react-hooks-after-early-return-oauth-mask-2026-05-28.md`

**Implementation arc (U1-U7 + 2 hotfixes + review-fix):**

U1-U6 (single session, 2026-05-27): adapter core + wrapper hooks + useSession refactor + LaunchCollectionPage refactor + wallet pill + missing-key banner + env.example + ESLint allow-list + AE4 grep PASS. Plan budgeted 2 sessions / 6-10 hr; actual one session.

U7: ADRs D-058–D-061 written to docs/decisions.md.

Browser smoke 2026-05-27 (deployer key loaded from ~/.sui/sui_config via `sui keytool export`, written to .env.local, agent-browser drove /launch end-to-end): on-chain TX `CndwZBuDApr3W3a4pPZ6fFt2bXJaJLbZsSNiowPD9ac7` — collection minted via test wallet, 3 objects created, walrus encode (the original crash spot) DID NOT crash. AE1 + AE5 verified.

Hotfix b0a5b23 (smoke surfaced 2 pre-existing bugs):
- **Hooks-after-early-return**: LaunchCollectionPage had 11 hooks after `if (!session) return ...`. Slush OAuth-redirect signin masked it for 5 weeks (first render is always post-signin via localStorage). Test wallet in-page signin exposed the transition. Fix: early return moved to after all hooks. Captured as solution doc.
- **TransactionResult shape lie**: U4 changed launch PTB sign to walrus-shape `signer.signAndExecuteTransaction({transaction, client})` but `setTxDigest(res.digest)` assumed flat shape; real SDK returns discriminated union `{$kind, Transaction|FailedTransaction}`. Fix: unwrap via `$kind`.

Code-review pass 2b7b34b (12-reviewer parallel ce-code-review against feat branch):
- Reviewers: correctness, testing, maintainability, project-standards, agent-native, learnings (always-on) + security, api-contract, reliability, adversarial (cross-cutting) + kieran-typescript, julik-frontend-races (stack)
- 19 unique findings (after dedup + cross-reviewer promotion): 4 P1 · 7 P2 · 8 P3
- Auto-resolve-best-judgment route: 11 fixer edits across 12 files (PROD guard relocation, signTransaction interface drop, TransactionResult return-type honesty, useAppAccount memoization, LAUNCH HTML-disabled, FailedTransaction error.message access, banner Vite restart hint, double-click race guard, data-test-wallet attribute gating, __resetCacheForTests internalization, OQ docs)
- 2 deferred-design + 4 advisory: captured as OQ-023/024 and noted in review report

**Manual smoke status:**
- AE1 ✓ verified (on-chain TX above)
- AE2 ✓ verified (banner copy verbatim assertion)
- AE3 ✓ verified (prod-mode setup.ts stub keeps existing tests in prod path)
- AE4 ✓ verified (grep on vite build dist, 7 identifiers → 0 hits)
- AE5 ✓ verified (smoke ran through /launch end-to-end via test wallet)
- OQ-021 (Slush co-existence): not yet smoked under unlocked Slush — user-side check
- OQ-022 (stale Slush JWT survives test-mode toggle): not yet smoked — user-side check

**What's left in the post-016 queue (carried from plan-015 retrospective, still open):**
- 5 learnings entries that ce-learnings-researcher flagged during plan-015 review (HighlightLayer single-effect coordination, LoadAssetContainerAsync cancellation, etc.)
- 8 plan-015 suppressed findings (anchor < 75 from that run, kept in artifact for later triage)
- 4 prior-session deferred UX-judgment items
- U15 demo recording prep (plan-007 pitch deck + demo video)

### --- Prior session (plan-015) below this line, kept verbatim ---

### Hackathon Tracker
- Days to submission (6/21): 25 of 38 · demo day (7/20–21): 54 · winners (8/27): 92

### This session — plan-015 brainstorm → plan → ce-work → ce-code-review (end-to-end compound-engineering arc)

The largest single feature push since plan-013. Started yesterday afternoon's PM-first discussion (framing A/B/C tradeoff for tagging UX coherence gap), produced the requirements doc + 4 ADRs that same evening, then this overnight session ran the full implementation + review pass.

**Origin + planning (committed pre-implementation):**
- `296e103` brainstorm: `docs/brainstorms/2026-05-26-l1l2-tagging-ux-requirements.md` — framing B (`NAME WHAT BUYERS CAN CUSTOMIZE`) wins; 13 R-IDs + 4 actors + 3 flows + 7 acceptance examples + 7 OQs resolved inline.
- `4fbced6` decisions: D-054 (preset labels removed) / D-055 (4-mode canvas standard) / D-056 (random gen harmonic-from-seed) / D-057 (texture customization deferred to v1.1).
- `96bd770` plan: `docs/plans/2026-05-26-015-feat-l1l2-tagging-ux-refactor-plan.md` — 8 implementation units (4 parallel-safe foundation + 4 layered integration), 13/13 R coverage, status `active`.

**Implementation — 8 units, serial inline, commit-per-unit:**
- `a6bfaa7` **U1** framing B copy — `LABEL_PRESETS` dropdown removed, freeform input with `maxLength=32`, Continue gates on every part named (no skip escape hatch), new shared `HelpIcon` component. Tests: 18 added (4 HelpIcon + 14 CreateModelPage rewrite covering AE1/AE2). Covers R1, R2, R12-L1, AE1, AE2.
- `aba309d` **U2** canvas mode infrastructure (D-055) — new `modePalette.ts` (4-mode + 12-hue PARTS palette), `ModeTogglePill.tsx` (top-left mirror of BG pill), `applyCanvasMode.ts` (snapshot/restore/overlay algorithm via `Symbol.for()`-keyed mesh property). PreviewCanvas + TaggingCanvas extended with mode/highlightedParts/onPartClick/autoRotate props. Defaults preserve every existing call site. Tests: 47 added across 5 test files. Covers R4, R10.
- `d1a9de9` **U3** `MeshInfoPanel` — segment count + size (B/KB/MB) + material count + Walrus blob pill. 12 tests. Covers R3.
- `b9fd9ae` **U4** `PartListPanel` — vertical scrollable list with two-way canvas wiring, click → onSelect, scrollIntoView on selectedIndex change. 9 tests. Covers R5.
- `edad92e` **U5** /create tagging step integration — wires U1-U4 into CreateModelPage: PARTS-mode default, MeshInfoPanel + PartListPanel side rail, partsColorHex swatches mirror canvas palette. 10 tests (7 integration + 3 modePalette additions). Covers F1, AE1, AE3-origin.
- `6a4af12` **U6** /launch scaffold — customization-axes strip below picker, 2-col preview layout, page-level `useModeCycle('pbr')` for hover-driven mode flips, `selectedPartIndex` bidirectional. VariantPreview extended for pass-through props. 7 tests. Covers R6, R10-mount, AE3-recognition.
- `e351109` **U7** VariantEditor coherence + live recolor — subhead row, `onColumnHover` prop, hover→SOLO effective-mode derivation (stash-and-restore flattened to a pure derivation, no useEffect). R9 live recolor: applyCanvasMode gains `partColors` arg + PreviewCanvas `partColors` prop + VariantPreview `baseGlbUrl` fallback. Snapshot semantics changed (durable across mode transitions; no longer cleared on PBR). 14 tests. Covers R7, R8, R9, R12-L2, AE4.
- `8112440` **U8** Random Gen + harmonic palette + variant strip + lock (AE5 demo moment) — new `harmonics.ts` (pure HSL math, no deps; analogous/complementary/triadic/tetradic with seed rotation), `RandomGenControls.tsx` (N stepper, seed picker, 4 scheme swatches with live previews, state-aware button label), `VariantStrip.tsx` (60×80 wells with [L] lock badges). Locks survive re-rolls; base switch clears locks. 50 tests (25 harmonics + 9 RGC + 9 VariantStrip + 7 integration). Covers R11, R13, AE5.

**Code review run (interactive multi-agent):**
- Run id `20260527-001939-4202b781` (artifact at `/tmp/compound-engineering/ce-code-review/20260527-001939-4202b781/`).
- Reviewers (per CLAUDE.md frontend-touching 5-reviewer default + learnings researcher): ce-correctness (Opus), ce-testing (Sonnet), ce-api-contract (Sonnet), ce-adversarial (Opus), ce-julik-frontend-races (Sonnet), ce-learnings-researcher (Sonnet).
- Raw findings: 34. After dedup + cross-reviewer promotion + anchor-75 gate: 19 actionable. Suppressed below anchor 75: 8 (see "Suppressed findings" below).
- Walk-through (per-finding interactive): 18 Apply + 1 Acknowledge + 0 Defer (no tracker — local-only checkout) + 0 Skip.

**Review-fixer commit:**
- `9bb95fb` **fix(ux): plan-015 review pass** — 18 fixes in one fixer pass, single commit. Highlights: baseGlbUrl URL.createObjectURL co-located with revokeObjectURL inside useEffect at 3 sites (P1, 3-reviewer concur); PreviewCanvas gains `loadTokenRef` parity with TaggingCanvas; onPickBase reset chain extended with `setSelectedPreview(0)` + `setHoveredColumnLabel(null)`; SOLO + empty highlightedParts no longer blanks canvas; `highlightedParts` wrapped in `useMemo`; VariantStrip restructured from nested-interactive `<button><span role=checkbox>` to sibling buttons (a11y); 50ms debounce on column-hover null transition; `LEGACY_LABEL` imported in both resolvers; `PARTS_PALETTE_HUE_COUNT` raised 12→16 to match Move `MAX_PARTS=16`; PreviewCanvas mode effect gains `getScene()` guard. Plus 10 new tests (partColors flow, __root__ skip, snapshot-immutability, AE4 bridge, TaggingCanvas mode + auto-rotate parity).

**Tests:** frontend 564/564 passing (up from 409 pre-plan-015). 54 test files. tsc clean. No backend / Move / shared-types changes.

### Suppressed findings (anchor < 75, kept in run artifact for later triage)
Eight findings below the confidence gate, recorded for potential follow-up:
1. **MAX_VARIANTS=16 vs origin "1-20"** (correctness conf 50) — plan-015 R11 specified N range 1-20 but Move contract caps at 16. Implementation matches contract; plan doc has a typo or aspirational mismatch.
2. **TaggingStep gate uses size-equality not key-presence** (correctness conf 50) — defense-in-depth gap, not a current bug.
3. **partColors length-1 fallback for legacy bases** (correctness conf 50) — backend material swap behavior for legacy bases not fully validated.
4. **Latent state-mutation during upload** (adversarial conf 50) — WYSIWYG divergence risk only manifests if a future feature lets variant.palette change while phase='uploading'.
5. **meshesRef + onPartClick race window** (adversarial conf 50) — addAllToScene happens before meshesRef update; sub-frame click can miss. Closed largely by loadTokenRef port in fix-pass.
6. **PartListPanel scrollIntoView prototype stub leaks between tests** (julik conf 72) — test hygiene only.
7. **VariantStrip style-attr regex brittle if styles move to CSS modules** (testing conf 70) — works today, breaks under hypothetical CSS-module refactor.
8. **U8 AE5 test uses unequal-assertion vs explicit harmonic verification** (testing conf 68) — weaker but still passes; tightening would catch rotation-offset regressions.

### Residual risks (carried forward, NOT addressed in fix-pass)
- Babylon mock returns plain object for `Color3.FromHexString` — production-vs-mock divergence; needs real-browser smoke test before demo recording.
- Whitespace-only labels pass `length > 0` gate (documented deferral per plan-015 OQ-2).
- VariantStrip uses CSS-color thumbnails not live canvases (D-003 WebGL context cap) — N=16 can't compare per-segment colors visually from the strip.
- 20+ base-picker PreviewCanvas mounts on /launch may exceed WebGL context cap (pre-existing; pre-plan-015).
- `LoadAssetContainerAsync` uncancellable fetch in onPickBase — rapid sequential picks can leave multiple fetches in flight (julik RR-003).

### Deferred for capture (post-fix-pass, not done this session)

**5 learnings entries the ce-learnings-researcher identified as worth writing to `docs/solutions/`:**
1. HighlightLayer single-effect coordination ("two effects fighting over `removeAllMeshes`/`addMesh` pairs" — combined with selectedIndex glow in TaggingCanvas, with SOLO highlights in PreviewCanvas).
2. `LoadAssetContainerAsync` cancellation via `cancelled` boolean closure + `loadTokenRef` token-ref pattern (now consistent across PreviewCanvas + TaggingCanvas).
3. `URL.createObjectURL` + `revokeObjectURL` lifecycle in React effects (the post-fix LaunchCollectionPage:678 / VariantPreview:106 pattern IS the canonical example).
4. Babylon material snapshot/restore via `Symbol.for()` key on AbstractMesh — survives container swap, immutable across mode transitions.
5. Nested-interactive a11y violation refactor pattern (VariantStrip [L] badge → sibling buttons in absolute-positioned container).

### Prior-session deferred UX-judgment items (still open from 2026-05-26 sweep)
Carried forward unchanged from the polish-sweep entry below:
1. `bgToggle = true` default on thumbnails (api-contract — visual dominance on small cards).
2. BG state lost on parent remount (adversarial conf 70).
3. STEP 1/2 → STEP 2/2 wall-clock predicate misleads when real step 1 >30s (adversarial conf 80).
4. `defaultBg` prop rename to `initialBg` (correctness + adversarial NIT — breaking change deferred).

### Next concrete step (priorities for the next session)

1. **Browser-verify via `agent-browser` (pre-wallet portions)** — CLAUDE.md "Frontend Verification Protocol" mandates this for every commit changing user-visible frontend behavior. 9 commits in this session (8 unit + 1 fix-pass) all deferred. Drive `/` → `/create` (up to Tripo SUI fee popup), `/launch` (up to PREVIEW VARIANTS), `/market`, `/track`, the walk-through hover/SOLO interaction, RandomGen swatch picker, VariantStrip lock toggle. Assert UI states; flag visual issues. Recommended to do in a fresh session — `agent-browser` works best with clean context.
2. **Manual real-Chrome + Slush wallet testing** (user-driven only — `agent-browser` can't drive wallet popups) — Tripo SUI fee popup → /create mint sign → /launch 3-popup sequence (writeFilesFlow register + certify + buildLaunchCollectionWithTokensPtb). The wallet-popup pause-and-resume affordance applies only to the sign/cert handoffs; agent-browser sees up to the popup, you confirm in real Chrome.
3. **Capture 5 learnings entries to `docs/solutions/`** — see "Deferred for capture" above. Each ~10-30 lines. Compound the institutional knowledge before context drifts.
4. **Decide on 8 suppressed findings + 4 prior-session deferred items** — triage; most are user-judgment UX choices not code correctness.
5. **U15 demo recording prep** — script, pitch deck, README hero. The plan-015 work substantially improves the demo arc (AE3 + AE4 + AE5 are the "the win" moments per origin doc).

Recommended sequence: (1) before (3) so any browser-surfaced issues feed into the learnings; (5) after to leverage the polished demo arc.

### Commits this session (on main, no remote — direct-to-trunk per user security constraint)
- `296e103` docs(brainstorm): L1/L2 tagging UX refactor requirements
- `4fbced6` docs(decisions): D-054 .. D-057 for L1/L2 tagging UX refactor
- `96bd770` docs(plan): plan-015 — L1/L2 tagging UX refactor
- `a6bfaa7` feat(ux): plan-015 U1 — framing B, remove preset labels, HelpIcon
- `aba309d` feat(babylon): plan-015 U2 — canvas mode infra + auto-rotate
- `d1a9de9` feat(ux): plan-015 U3 — MeshInfoPanel
- `b9fd9ae` feat(ux): plan-015 U4 — PartListPanel
- `edad92e` feat(ux): plan-015 U5 — /create tagging step integration
- `6a4af12` feat(ux): plan-015 U6 — /launch scaffold (axes strip, side rail, mode pill)
- `e351109` feat(ux): plan-015 U7 — VariantEditor coherence + live recolor
- `8112440` feat(ux): plan-015 U8 — Random Gen + harmonic palette + VariantStrip + lock
- `9bb95fb` fix(ux): plan-015 review pass — 18 fixes from 5-reviewer code review

12 commits. Plan-015 status: status: `active` (plan body unchanged per ce-work protocol); execution is complete and review-hardened. Flip to `status: completed` only after browser-verify confirms the demo arc.

### Notes for next session
- **Plan-015 is implementation-complete, review-hardened, but NOT browser-verified.** This is the gap to close before any further plan-015 follow-up or demo recording. Reviewer mocks cannot exercise real Babylon (Color3 instanceof checks, HighlightLayer in actual scene, blob URL lifetime under real LoadAssetContainerAsync, WebGL context cap on /launch base picker).
- **Walk-through pattern proved high-value** — 19 findings → 18 applied → 1 acknowledged with concrete fixer dispatch in one batch. The Symbol-keyed snapshot pattern survived a non-trivial semantic change (U7 swapped PBR-clears for durable-snapshot) and the tests held.
- **Three-reviewer concurrence on baseGlbUrl race was the highest-signal finding** — julik P1 + adversarial P2 + correctness P3, three independent paths into the same useMemo + revoke split anti-pattern at 3 call sites. Cross-reviewer agreement validated; same pattern in future would be auto-promoted to P1.
- **Fixer subagent in worktree-isolated mode would have been cleaner** for the 18-fix pass, but we're on main with no worktree — single fixer against shared tree worked because all 18 had concrete suggested_fix and the test suite caught any incidental regressions. For larger fix sets, consider `ce-worktree` first.
- **MAX_VARIANTS contradiction (suppressed)** — origin says 1-20, Move contract is 16, code matches contract. Either plan-015 doc is wrong or origin was aspirational. Reconcile during U15 demo doc pass.
- **Context utilization was high (~75% peak)** but acceptable. The 6-reviewer parallel dispatch + walk-through + fixer-subagent + commits + report all fit in one session. The cache-miss zone (>300s) was crossed during walk-through; minor cost.

---

## Last Updated: 2026-05-26 / Late Night (polish-backlog sweep #1/#4/#5/#6/#7 shipped + 5-reviewer parallel review run + 4 reviewer-driven follow-up fixes) — **Next = browser-verify the sweep in real Chrome + decide on 4 deferred UX-judgment items (see below), then either continue polish (§2/§3 spec refactor) OR pivot to U15 demo recording prep.**

### Hackathon Tracker
- Days to submission (6/21): 26 of 38 · demo day (7/20–21): 55 · winners (8/27): 93

### This session (overnight) — polish sweep + parallel review + cleanup

**Polish-backlog sweep (5 items, separate commits):**
- `6a9d30a` **#1 /track mesh dynamic resize** — new `frontend/src/babylon/normalizeMeshScale.ts` (helper + 7 tests) + `racetrackScene.ts` wires `TARGET_CAR_LENGTH = 2.8` BB-derived scale. Replaces the hardcoded 1.728 that made Tripo cars look like ants.
- `321dd89` **#4 /create two-step Tripo pill** — split label at 30s threshold: STEP 1/2 GENERATING MESH → STEP 2/2 SEGMENTING PARTS. Bottom pill `~30S TYPICAL` → `~120S TWO-STEP TYPICAL`.
- `ee2f6e2` **#7 /launch integration fee label** — `REGISTER FEE FOR GAME DEVS` → `INTEGRATION FEE (SUI)` + inline `fieldHint` style explaining `register_integration()` semantics.
- `b9309d0` **#5 Walrus elapsed pill (initial)** — `/create` and `/launch` get an elapsed-time pill below the action button during `uploading` phase, covering the silent encoding + relay-upload Walrus stages.
- `8ff1d4a` **#6 PreviewCanvas / TaggingCanvas BG toggle** — new `bgPalette.ts` + `useBgCycle` hook + `BgTogglePill` component. Three-state cycle (BLACK / PAPER / GRAY) anchored top-right of every well (8 PreviewCanvas mount sites + 1 TaggingCanvas mount).

**5-reviewer parallel code review** (first dispatch stalled on watchdog; retry succeeded). Findings consolidated to 4 SHOULD-FIX (real bugs) + several NIT (verified safe / cosmetic) + 4 user-judgment UX items (deferred):

**Reviewer-driven fixes shipped:**
- `b80aab9` **Timer-reset bug** — 3-reviewer consensus (adversarial / julik-frontend-races / correctness all caught independently). Pre-fix elapsed timers re-keyed on status string, so paying→generating and uploading→signing transitions snapped the counter back to 0 right before wallet popups. Fix: shared `useElapsedSeconds(active)` hook in `frontend/src/ux/` with `start` anchored in a ref + 5 tests covering the regression. Both `/create` and `/launch` now consume the hook.
- `5553667` **`computeUniformScale` safety clamp** — adversarial reviewer. Pre-fix `target / longest` had no bounds → a sub-mm Tripo mesh produced scale=2800 → Havok BOX collider NaN / wafer. Clamp to `[0.01, 100]`; outside range fall back to 1 (native size, mesh renders visibly wrong instead of breaking physics). Console.warn on clamp + 4 new tests.
- `9a68ab1` **Walrus pill narrowed to silent stages** — correctness reviewer conf 100. Pill duplicated MintButton's internal label during wallet-popup stages (both said "UPLOADING TO WALRUS"). Narrowed pill render predicate to `uploadStage === 'encoding' || 'relay-upload'` — the actually-silent phases. MintButton handles awaiting-register/awaiting-certify popups.
- `df9732d` **PreviewCanvas cleanup** — julik-frontend-races + correctness + api-contract. (a) dropped the mount-effect `scene.clearColor.set` (dead code — bg-cycle effect already owns clearColor end-to-end). (b) new optional `testIdSuffix` prop on PreviewCanvas so multi-mount pages (`/market` grid) can disambiguate `data-testid="bg-toggle-pill"`. (c) JSDoc clarifying `defaultBg` is one-shot (mount-time only).

**Tests:** frontend 409/409 (up from 389), typecheck green. No backend or Move changes this session.

**Risk-management discipline:** First reviewer dispatch returned 2 stalls (watchdog). Rather than do solo review (own-work blindness), re-dispatched and got clean reports. Multi-reviewer convergence on the timer-reset bug (3/5 caught it independently) validates that the pattern was worth running.

### Deferred for user decision (4 reviewer findings that involve UX judgment, not code correctness)

1. **`bgToggle = true` default on thumbnails** — api-contract reviewer flags that an 8px-inset BG pill on /market list cards (~150px) and CollectionCard visually dominates. Polish-backlog originally said "every mount." Tradeoff: thumbnail UX vs. discoverability. Action options: opt-out at thumbnail mount sites, OR narrow default to `false` + opt-in at full-page mounts, OR keep current behavior.
2. **BG state lost on parent remount** (adversarial conf 70) — if `/create` regenerates and remounts PreviewCanvas, user's chosen BG resets to black. Could persist via sessionStorage or lift state up. Today probably acceptable since regenerate is rare; flag if a tester hits it.
3. **STEP 1/2 → STEP 2/2 threshold misleads when real step 1 >30s** (adversarial conf 80) — wall-clock predicate over backend phase. Options: rename to "PHASE 1/2 (approx)" / drive label from backend SSE / leave as-is (the bottom pill says `~120S TWO-STEP TYPICAL` so user is anchored). Recommend rename to "(approx)" if you want to ship that today.
4. **`defaultBg` prop rename to `initialBg`** (correctness + adversarial NIT) — name implies reactivity but the value is one-shot. Today: documented in JSDoc. Rename is a breaking change for any future caller; deferred.

### Polish-backlog items still pending (post-sweep)

Updated `docs/ux/polish-backlog.md` — marked #1, #4, #5, #6, #7 as completed. **Remaining MUST items (per user's plan):**
- §1 **Tagging step UX** (#3 in the discussed-then-deferred set) — PM-first refactor with §2.
- §2 **`/launch` column-to-mesh visual mapping** (#2) — pair with §1 tagging step. User's instruction: "discuss as PM, refactor spec first, then implement."
- Plus all the foundational §0 / §1–§5 brutalist editorial polish that wasn't UAT-driven (header treatment, source-mode toggle, MintButton primary style, /market reframe, hero section on /, etc.).

### Next concrete step

Pick ONE next session:

1. **Browser-verify the sweep + ship the 4 deferred items** (~1-2 hr) — open `pnpm dev`, visit each touched route, confirm STEP 1/2 pill / Walrus pill / BG toggle / integration fee hint / `/track` car size all read as intended. Then make calls on the 4 deferred items above.
2. **§2 + §3 PM-first refactor** (~2-3 hr) — the tagging step + L2 column-mapping spec work the user deferred. Outcome: requirements doc for plan-015 or direct spec.md update.
3. **U15 demo recording prep** (~half day) — script, pitch deck, README hero, honest disclosure.
4. **Mainnet deploy spike** (~3-5 hr) — 8/27 prize threshold.

Recommend (1) then (2): browser-verify catches anything reviewers missed (esp. clearColor reactivity, which only ce-test-browser can confirm), then PM session sets up the next implementation slot.

### Commits this overnight session (on main, no remote)
- `6a9d30a` fix(track): dynamic uniform-scale (#1)
- `321dd89` feat(create): two-step Tripo pill (#4)
- `ee2f6e2` feat(launch): integration fee label (#7)
- `b9309d0` feat(walrus): elapsed-time pill (#5)
- `8ff1d4a` feat(babylon): BG toggle (#6)
- `b80aab9` fix(ux): elapsed timer survives transitions (reviewer-driven)
- `5553667` fix(babylon): clamp computeUniformScale (reviewer-driven)
- `9a68ab1` fix(walrus): pill narrowed to silent stages (reviewer-driven)
- `df9732d` refactor(babylon): single-owner clearColor + testId thread (reviewer-driven)

Pre-sweep anchor tag: `pre-polish-sweep-2026-05-26` at `cd2c8b7` (for diff replay).

### Notes for next session
- **Browser verification not yet done** for this sweep — agent-browser stalled twice; reviewers caught code-level issues but only a real browser confirms the BG cycle's clearColor reactivity, the STEP 1/2 label transition timing, and the Walrus pill visibility during actual Tripo runs.
- **Multi-reviewer pattern proved value here** — 3 reviewers independently caught the timer reset, which a single reviewer might have missed and a self-review almost certainly would have. The diff was ~447 lines, well above the 50-line adversarial threshold.
- **`useElapsedSeconds` hook is reusable** — any future status-bar timer (Sui tx confirmation, Walrus relay polling, etc.) can consume it instead of hand-rolling.
- **`normalizeMeshScale` clamp** assumes target-divided-by-extent semantics; if a future caller wants a different scale axis (e.g. height-only for tall props), the helper signature needs `axis` param. Not built today.
- **`docs/solutions/` writeup deferred** — the timer-state-machine pattern + the bounding-box-derived-scale clamp pattern are both worth capturing for future plans. Out of scope tonight.

---

## Last Updated: 2026-05-26 (plan-013 UAT walked end-to-end on testnet v8; 3 real bugs fixed mid-UAT; 8 polish-backlog items captured; plan-013 status: completed) — **Next = polish-backlog cleanup (with /track resize first) OR U15 demo recording prep OR mainnet deploy spike.**

### Hackathon Tracker
- Days to submission (6/21): 26 of 38 · demo day (7/20–21): 55 · winners (8/27): 93

### This session — plan-013 UAT closeout + 3 real-bug fixes + UX gap capture

Walked plan-013's demo arc end-to-end in real Chrome with Slush wallet on testnet v8: `/create` (Tripo two-step + tagging + publish) → `/launch` (per-label palette VariantEditor + build + launch) → `/market` (list + buy + royalty hot-potato) → `/track` (drive). Hit and fixed three real-bug classes that prior unit-test + agent-browser + code-review layers all missed.

**Real bugs surfaced during UAT (all fixed):**
- `abe4478` **Indexer race** — dapp-kit `signAndExecute` resolves at fullnode execute, but the testnet read-replica RPC (which backend's `paymentVerifier` queries) hasn't indexed yet → 402 `payment_not_found` despite SUI correctly spent. Fix: `suiClient.waitForTransaction({ digest })` between sign and POST. Regression test asserts `signAndExecute → waitForTransaction → fetch` call order.
- `44edc17` **Self-pay verifier reject** — Sui RPC `balanceChanges` is per-address NET; when sender == TRIPO_FEE_TREASURY (deployer pays themselves, hackathon default per D-034), the 0.4 SUI in/out cancels to ~-gas and the verifier 402s `payment_insufficient_or_wrong_destination`. Fix: short-circuit acceptance when sender == treasury (fraud model collapses — user can't defraud themselves).
- `55f0724` **Tripo URL fallback regression** — `mesh_segmentation` task returns URL in `output.model`, but production `pollTask` only tried 4 field names. The deleted two-step spike (`0ba975c`) had the 5th fallback; refactor dropped it. Step 2 silently 500'd after ~180s with `TripoFormatError: Tripo task done but no model URL field found`. Fix: restore `output.model` + diagnostic console.error logging output keys when ALL fields fail.

All three were inherited code (not in plan-013's diff), classic plan-014 checklist category-3 hits (real-data vs fixture drift — unit tests mocked the failure surfaces away). UAT was the only layer that could catch them.

**D-053 + SignConfirmation component (plan-013 UX gap fix):**
- `6989fad` ADR + `frontend/src/ux/SignConfirmation.tsx` + 6 unit tests + integration on `/create` Tripo fee trigger.
- Drove by Slush popup rendering `splitCoins` u64 inputs as raw BCS hex (`0x4000…` form) in a collapsed details section instead of as a "Send 0.4 SUI to X" headline. Research confirmed our PTB is canonical, Slush UX limitation, no SDK fix exists; published Sui-ecosystem principle (Ethos engineering writeup) assigns this responsibility to the dApp layer.
- Pattern: in-app pre-sign confirmation panel (summary + recipient + walletCaveat) before any wallet popup. Extends incrementally to other PTB sites (publish, build, list, buy) as touched.

**Polish-backlog captures (`410d443`, `543c00c`, `199e208` — 8 items):**
- §0 cross-cutting — PreviewCanvas / TaggingCanvas BG toggle (BLACK / PAPER / GRAY) for dark Tripo meshes vanishing into D-044 black wells.
- §1 /create — L1 tagging step custom-label nudge + two-step Tripo timing UX (`~30S TYPICAL` → `~120S` etc).
- §1 /create — Tripo task IDs surfaced in UI after success + Tripo model_version selector (Turbo / v2.5 / P1) promoted from POST to NICE (niche concepts like "shuriken" fail on Turbo).
- §2 /launch — REGISTER FEE FOR GAME DEVS label needs explanation tooltip (it's D-013 `integration_fee_mist` for game integrators).
- §2 /launch — Walrus upload silent during BUILD VARIANTS.
- §2 /launch — VariantEditor column-to-mesh visual mapping (user confirmed design intent A correct + UX gap D — no visual link between abstract column header and the mesh parts it drives).
- §4 /track — **Dynamic mesh resize on load** (demo-blocking — Tripo-bought cars appear as ants on the racetrack because Tripo native scale is non-deterministic vs. the procedural cars the track was sized for).

**Plan-013 status: `active → completed` (this session).** All technical acceptance criteria met. Remaining items are polish, captured.

### Live testnet state (v8 — proven end-to-end this session)
- Package `0x9e673aa7…` · Publisher `0xd966383…` · TransferPolicy<NftToken> `0x308fc893…`.
- First Model3D, NftCollection, and NftToken objects created on v8 during this UAT. List + buy on Sui Kiosk verified with the royalty-only hot-potato.
- `/track` drives the bought car, just visually too small (resize fix item §4).

### Open / deferred (carried forward)
- 8 polish-backlog items above — prioritize `/track resize` (demo-blocking) → `/launch column-to-mesh mapping` (highest learning-curve fix) → others.
- **U15 demo recording + pitch deck + README + honest disclosure + logo** — biggest remaining item for 6/21.
- **Mainnet deploy** — 8/27 = 100% prize threshold.
- **Network-mismatch guard** — still not built.
- **`TestWalletAdapter` fixture** — plan-014 deferred; only revisit if overnight regression sweep becomes blocking.
- Pre-existing: stale-listing → buy abort cascade (CR adv-003), full-test-suite StrictMode wrap, `/dev/compare` route hide.

### Next concrete step
Pick ONE next session:

1. **Polish-backlog sweep** (~2-4 hr) — `/track` resize first (30 min, demo-blocking visual quality) → `/launch` column-to-mesh visual mapping (1-2 hr, highest UX leverage) → other items as time permits. Best path if you want demo recording to look right.
2. **U15 demo recording prep** (~half day) — 4-actor screencap script, pitch deck (4 vibe mockups re-render to `pitch/`), README hero + honest disclosure. Best path if you want to lock in submission early.
3. **Mainnet deploy spike** (~3-5 hr) — Walrus mainnet cost estimate, Move package republish to mainnet, `networkConfig.ts` switch, `.env` mainnet RPC. Best path if you want to front-load the 8/27 prize threshold.

Recommend (1) before (2) — a few hours of polish lifts the demo recording quality more than the polish hours cost. (3) can run in parallel later.

### Commits this session (on main, no remote)
- `f432594` docs(phase-progress) — plan-013 UAT pending framing
- `6989fad` feat(ux): D-053 SignConfirmation
- `abe4478` fix(create): waitForTransaction
- `44edc17` fix(verifier): self-pay accept
- `55f0724` fix(tripo): restore output.model
- `410d443` docs(ux): polish-backlog batch 1
- `543c00c` docs(ux): polish-backlog batch 2
- `199e208` docs(ux): polish-backlog Tripo notes
- this commit: phase-progress + plan-013 status

### Notes for next session
- Tagging step UX was the user's biggest learning-curve complaint. L1 tagging UX (encourage custom labels) + L2 part-to-label visual mapping must ship as a pair, or the L2 confusion recurs (per polish-backlog §2 callout).
- agent-browser pre-check (plan-014's tool) caught zero of this session's UAT bugs — all 3 were wallet-mediated. Reinforces plan-014 §Scope Boundaries call-out that wallet flows need either real-Chrome manual or TestWalletAdapter. agent-browser still useful for DOM render + empty-state checks.
- The 3 bug fixes are all "inherited code" (not in plan-013's own diff). Code review focused on the diff doesn't audit unchanged paths. Worth a `docs/solutions/` write-up on these three patterns so future ce-learnings-researcher dispatches catch them: (1) Sui RPC propagation race + wait-for-indexing, (2) sender-equals-treasury balance-change netting, (3) Tripo URL field-name drift + diagnostic logging.
- Plan-014 SignConfirmation pattern only on /create Tripo fee; extend to other PTB sites incrementally.

---

## Last Updated: 2026-05-25 (plan-013 UAT started but NOT completed — sidetracked into a `useSession` bugfix + plan-014 frontend UAT enablement; branches consolidated to single main) — **Next = RESUME plan-013 UAT on testnet v8 demo arc (the original goal of this session).**

### Hackathon Tracker
- Days to submission (6/21): 27 of 38 · demo day (7/20–21): 56 · winners (8/27): 94

### This session — original goal vs what actually got built

**Original session goal:** UAT (驗收) of plan-013's deliverables on testnet — walk the full demo arc (`/` → `/create` with real Tripo + segmentation tagging → `/launch` with real forge variants → `/market` list + buy → `/track` drive) on the v8 republished package and confirm the mesh-seg per-part coloring story works end-to-end.

**What actually happened:**
1. Started UAT. Browser-tested `/` → `/create`.
2. **Bug #1**: `challenge failed: 502` — backend wasn't running. Started backend on port 3001 (NOT 8787). Vite proxy targets `localhost:3001`.
3. **Bug #2**: "I have to refresh page after signed in then it show the UI". Diagnosed `useSession` as per-component `useState` — sibling components stayed stale. Fixed via CustomEvent broadcast pattern (`69ef26a`). Solution-doc captured.
4. **Sidetracked into meta-improvement.** User asked "frontend 怎麼避免這類 bug" → ce-brainstorm → plan-014 frontend UAT checklist + `agent-browser` install + `CLAUDE.md` §🖥 Frontend Verification Protocol.
5. **plan-014 U4 validation drive** drove agent-browser through pre-wallet UI on all 5 routes — confirms gating chrome works. But this is NOT the plan-013 UAT — it's plan-014's own acceptance test.
6. Branch consolidation: phase-4 + plan-014 merged to main, 4 tags, single-branch state.

**The plan-013 UAT itself was never completed.** Steps 2-4 of the original demo arc — real Tripo mint with tagging, forge variant mint, market list/buy, track drive — are still UNTESTED on testnet v8.

### What's actually shipped (since last entry 2026-05-24)

**plan-013 (mesh segmentation + per-part coloring) — code complete:**
- U5 `TaggingCanvas.tsx` (Babylon picker, StrictMode-safe).
- U9 v8 testnet republish (`part_labels` is breaking — fresh package). Package `0x9e673aa7…` · Publisher `0xd966383…` · TransferPolicy<NftToken> `0x308fc893…`. v7 objects abandoned.
- U6 `/create` tagging step + `buildPublishPtb` extended. TRIPO_FEE_MIST 0.1 → 0.4 SUI.
- U7 `/launch` VariantEditor → `palette: Record<label, hex>` with dynamic columns per uniqueLabel.
- Review pass F1-F8 fixes, ADRs D-045..D-052, UX G1/G2/G3 polish, `useSession` broadcast fix.

**plan-014 (frontend UAT enablement) — fully shipped:**
- `docs/brainstorms/2026-05-25-frontend-uat-requirements.md` (167 lines).
- `docs/plans/2026-05-25-014-feat-frontend-uat-checklist-plan.md` (4 units).
- U1 `agent-browser 0.27.0` installed globally + Chrome 149 binary + skill registered.
- U2 `docs/ux/frontend-checklist.md` — 5 bug-pattern categories with verified commit-hash examples.
- U3 `CLAUDE.md` §🖥 Frontend Verification Protocol section.
- U4 partial — pre-wallet drive on all 5 routes ✅; AE2 (sign-in broadcast regression) deferred to manual real-Chrome (agent-browser's isolated Chromium has no Slush extension).
- Brainstorm + CLAUDE.md amended to acknowledge wallet-handoff doesn't work in v1 (only file-picker / OAuth-tab pauses do).

**Branch consolidation (207 commits → linear main):**
- phase-4 (204) fast-forwarded into main.
- plan-014 (3) rebased cleanly onto new main, fast-forwarded in.
- `feat/racetrack-scene-polish` was subset of phase-4 → tagged + deleted.
- `main` is now the single branch.
- Tags: `phase-3-complete` (9a9a91e) · `phase-4-complete` (69ef26a) · `plan-014-complete` (6c53fc6) · `plan-014-pre-rebase` (af14244, safety net — delete after a week).

### Live testnet state (v8 — the version to UAT against)
- Package `0x9e673aa7…` · Publisher `0xd966383…` · TransferPolicy<NftToken> `0x308fc893…` (+cap `0x46ed256d…`).
- Bootstrap digest `4s2aAmRW…`. No seed Model3D objects yet — UAT will create them.

### Next concrete step — RESUME plan-013 UAT

Walk the full demo arc on testnet v8 in your real Chrome (with Slush wallet), in this order:

1. **`/` landing** — confirm `/market` index renders (will be empty on v8 — no seed objects yet).
2. **`/create` L1 publish** — sign in → enter Tripo prompt → segmentation completes → TAGGING STEP (the new U5/U6 thing — verify clicking parts highlights, label dropdown + custom-text works, 0/N → N/N progress) → metadata form → SUI fee = 0.4 SUI → publish PTB → Model3D object created with `partLabels` on chain.
3. **`/launch` L2 forge collection** — pick the Model3D you just published → VariantEditor renders **per-label columns** (this is U7 — the new shape) → set palette per row → preview tiles update → 4-variant collection mint.
4. **`/market`** — list one variant for sale → switch to a second wallet (or use a friend's address) → buy with royalty hot-potato.
5. **`/track`** — drive the bought variant; lap-time HUD, kiosk attribution, no regressions vs plan-012 polish.

Bugs found → split into separate fix commits (not on plan-014 branch — that's done). UAT pass → flip plan-013 status to `completed`, then U15 demo recording / pitch / README.

### Open / deferred (carried forward)
- **U15 demo recording + pitch deck + README + honest disclosure + logo** — biggest remaining item for 6/21.
- **Mainnet deploy** — 8/27 = 100% prize threshold.
- **Network-mismatch guard** — still not built.
- **`TestWalletAdapter` fixture** — plan-014 deferred; only revisit if overnight regression sweep becomes blocking.
- **Local backup strategy** — Time Machine + external-drive bare repo + daily tar (advised this session, not yet implemented per user preference for local-only).
- Pre-existing: stale-listing → buy abort cascade (CR adv-003), full-test-suite StrictMode wrap, `/dev/compare` route hide.

### Notes for next session
- The 502 fix wasn't a code change — backend wasn't running. Make sure `pnpm --dir backend dev` is up before UAT begins. Backend on port 3001, Vite proxy targets it.
- `useSession` is now broadcast-synced — sibling components should refresh without page reload. Cross-component sign-in test in `useSession.test.tsx` guards regression.
- v8 has NO seed Model3D objects — UAT must create from scratch. First Tripo mint will be the first object on v8.
- plan-014 §Wallet pause-and-resume clarified: agent-browser CAN'T validate wallet flows in v1 (its Chromium has no Slush extension). UAT remains a real-Chrome activity. The frontend-checklist + agent-browser kit help with FUTURE bug prevention, not THIS UAT.
- `docs/spec.md` last verified 2026-05-14; plan-012 / 013 / 014 may have introduced spec drift. Worth a 10-min scan before mainnet deploy.

---

## Last Updated: 2026-05-24 (after midnight — plan-013 U1-U4 + review pass shipped) — **Next = U5 TaggingCanvas (Babylon click-to-select picker).**

### Hackathon Tracker
- Days to submission (6/21): 28 of 38 · demo day (7/20–21): 57 · winners (8/27): 95

### This session — plan-013 backend + types + Move foundation landed AND review-pass S1-S5 cleared

`/ce-work` against `docs/plans/2026-05-23-013-feat-mesh-segmentation-per-part-coloring-plan.md` shipped 4 of 7 implementation units. After committing all four, ran a parallel ce-reviewer pass (correctness + testing + data-migrations + api-contract + adversarial) and addressed 5 review findings (S1-S5) before pausing. Tree is fully green: Move 64/64, backend 121/121, frontend 353/353.

**Commits (this session):**
- `6fa45c0` U1 Move contract — `part_labels: vector<String>` on Model3D + ModelPublished event, MAX_PARTS=64, ETooManyParts=39, EPartLabelTooLong=40, validate_publish_inputs extended, destroy_model_for_testing destructure, 7 new test scenarios.
- `9c62dee` U2 Shared types — positional `VariantMaterialSpec.partColors`, `Model3DSummary.partLabels`, `MAX_PARTS_FE=64`, `collectionBuildRequestSchema` per-variant `partColors` array. Removed old top-level `baseColorRgb` from schema (callers migrated). 4 frontend test mocks updated with `partLabels: []`.
- `8fb2940` U4 Backend swap pipeline N-material refactor — `swapMaterial` loops all N materials in TINT mode (baseColorFactor per part, baseColorTexture preserved unless overridden). New `PartCountMismatchError` → 422 `part_count_mismatch` envelope with materialCount + partColorsCount. R2-era "only swap first material" test replaced; +3 new scenarios.
- `bf1be58` U3 Backend Tripo two-step chain — `TripoClient.submitMeshSegmentation(originalTaskId)` + `TripoGenerator.generate` chains text_to_model → poll(90s) → mesh_segmentation → poll(180s) → downloadGlb. +5 new tests including "step-2 timeout discards step-1 bytes".
- `a04aa0d` Review-pass S1-S5 — TINT-mode preservation test no longer vacuous (fixtures pre-seed baked textures; assert flags `[true,true,true,true]` post-swap). localStorage cache bumped v1→v2 to invalidate pre-`partLabels` entries. `paramsJson` zod refine tightened to require non-null object. Step-2 timeout test asserts `submitMeshSegmentation` was actually called. MAX_PARTS ↔ MAX_PARTS_FE lockstep documented in both files.

### Review findings DEFERRED (no fix this session)
- **A1 (operational)**: D-034 SUI fee `paymentVerifier.spent.add` fires before Tripo touched; step-2 failure burns SUI + 40 Tripo credits with no retry path. Re-credit-on-failure OR document acceptance for hackathon.
- **A2 (frontend safety)**: Move can't enforce `part_labels.length == materials.length`; mismatched publish creates a permanently-unforkable Model3D. **U6 must validate at publish time.**
- **A3 (load)**: 16-variant × 12 MiB × 64-parts `Promise.all(swapMaterial)` could OOM at max-allowed payload. Already in plan Open Questions.
- **A4 (test pin)**: `partColors[i] → materials[i]` ordering relies on `listMaterials()` stability across gltf-transform versions; no test pins it. Consider in U7 cleanup.
- **A5 (cosmetic)**: `equal-count PartCountMismatchError` unreachable branch could mask malformed-GLB bugs as confusing envelopes. Minor.

### Coordination blockers from review (resolved by normal sequencing)
- **B1**: `frontend/src/sui/modelTxBuilders.ts` `buildPublishPtb` still passes 9 args; post-U9 republish Move requires 10. **U6 must ship before U9** (it does in the plan order).
- **B2**: `LaunchCollectionPage` unconditionally sends length-1 `partColors`; any segmented base published via U6 would fail every Forge build with 422. **U7 must ship before any segmented base goes live**.

### Remaining plan-013 units
- **U5 TaggingCanvas** (frontend, new component): Babylon click-to-select picker with HighlightLayer. Imperative Engine/Scene mirroring PreviewCanvas. StrictMode useRef setup+cleanup discipline. Controlled component, parent owns `selectedIndex`.
- **U6 L1 publish + tagging step** (frontend): TaggingStep between Tripo `confirmed` and metadata form. `buildPublishPtb` gains `partLabels: vector<String>` arg. TRIPO_FEE_MIST 0.1 → 0.4 SUI (4× credit cost). Depends on U1, U2, U3, U5, U9.
- **U7 L2 variant editor** (frontend): VariantRow.palette `Record<label, hex>`. VariantEditor renders one row per uniqueLabel. LaunchCollectionPage resolves palette × base.partLabels → positional partColors before POSTing /api/collection/build. Depends on U1, U2, U4, U9.
- **U9 Move republish ceremony + networkConfig pin**: adding `part_labels` is breaking; full package republish. Update contracts/Published.toml + frontend/src/sui/networkConfig.ts. Existing testnet objects abandoned (acceptable per hackathon phase).
- **ADRs**: 8 captures pending (two-step Tripo, TINT, manual tagging, free-text + 4 presets, lineage = per-part array, full-GLB v1, fee bump, republish ceremony).

### Next concrete step
Continue `/ce-work plan-013`. U5 (TaggingCanvas) is the natural next unit — independent of U6/U7, unblocks U6. Read `docs/solutions/integration-issues/babylon-gpu-particle-emission-control-and-getactivecount-misread-2026-05-18.md` on first Babylon surprise (HighlightLayer.addMesh, sub-mesh picking).

### Notes for next session
- Backend tree is GREEN; U2's removal of the old single-color `VariantMaterialSpec` shape forced the LaunchCollectionPage to migrate to a length-1 `partColors` array (the legacy single-material UX form). U7 will then expand that to a per-label resolution.
- The `Model3D` struct shape change in U1 means existing testnet demo objects from prior phases are abandoned at U9 republish — acceptable per CLAUDE.md "Don't gold-plate during build phases."
- `partLabels = []` is the legacy single-material sentinel. LaunchCollectionPage in U7 will route empty-array bases through the existing single-row VariantEditor unchanged. No data migration needed.
- ADR captures deferred until ship: keep momentum on units; capture all 8 decisions in one PR-ready batch before U9 republish ceremony.

---

## Last Updated: 2026-05-23 (late evening — mesh segmentation per-part coloring brainstorm) — **Next = `/ce-plan` on the new requirements doc.**

### Hackathon Tracker
- Days to submission (6/21): 29 of 38 · demo day (7/20–21): 58 · winners (8/27): 96

### This session — Tripo `mesh_segmentation` validated + per-part coloring requirements written

User asked whether we can swap to a Tripo segmented model and recolor each segment dynamically — the current variant flow only mutates `materials[0].baseColorFactor` on a single-mesh GLB, which produces "same car, different body color" variants that read flat in the L2 collection grid.

**What got validated (60 Tripo credits, 440 → 380 balance):**
- Tripo segmentation is a **two-step API**, not a `text_to_model` parameter as third-party aggregators claim. `text_to_model` (Turbo, ~20cr, ~35s) returns a `task_id`; `mesh_segmentation` with `original_model_task_id` referencing it (~40cr, ~85s) returns a 12-part GLB with per-part PBR materials.
- Output structure matches the reference `frontend/public/dev-glbs/turbo-seg.glb` exactly: `tripo_part_N` nodes, per-part materials with baked `baseColorTexture`, no `baseColorFactor`.
- **Part count is non-deterministic** (reference 9, spike 12). Variable N must be handled in product UX.
- **Tripo exposes zero semantic part labels** — `extras` is `undefined` everywhere in the GLB and the task response only has model URL + thumbnail. Visually the cuts ARE along natural body/wheel/glass boundaries, but the API never tells you which.
- **TINT mode wins** the color-strategy spike — set `baseColorFactor` per material while keeping each material's baked `baseColorTexture`; the multiplication produces clean reds without losing PBR surface detail. Flat-color (texture-stripped) variants read as plastic.

**Spike artifacts:**
- `backend/scripts/spike-tripo-segmentation.ts` — two-step API reference flow (kept).
- `backend/scripts/spike-seg-color-modes.ts` — generates TINT / FLAT / MULTI-FLAT comparison variants from the spike-seg base (kept).
- `frontend/public/dev-glbs/spike-gen-2026-05-23T12-05-45.glb` (683KB, upstream single-mesh).
- `frontend/public/dev-glbs/spike-seg-2026-05-23T12-05-45.glb` (6.0MB, 12 parts — base for the color-mode variants).
- `frontend/public/dev-glbs/spike-seg-{tint-red,flat-red,multi-flat}.glb` (4 visual-compare GLBs).
- `frontend/src/dev/CompareGlbsPage.tsx` — extended SAMPLES with 4 spike rows for visual comparison.
- Three throwaway probe scripts (version-probe / seg-probe / seg-metadata) deleted after their evidence was captured.

**Requirements doc:** `docs/brainstorms/2026-05-23-mesh-segmentation-per-part-coloring-requirements.md` — 11 R-IDs, 4 AEs, 5 key decisions, 6 deferred-to-planning questions, zero resolve-before-planning blockers.

### Decisions baked into the requirements doc
- **Two-step Tripo flow** = canonical (`text_to_model` → `mesh_segmentation`).
- **TINT over FLAT** for variant coloring.
- **Manual tagging at L1 publish** over geometric heuristics — demo isn't domain-limited to cars, so largest-bbox-equals-body breaks on animals / furniture / weapons.
- **Free-text labels with 4 dropdown presets** (`primary` / `secondary` / `accent` / `detail`) — domain-agnostic, low cognitive load.
- **Lineage canonical = resolved per-part color array** `[ColorHex × N]`, not label-keyed palette — keeps on-chain shape stable across UI label-vocabulary changes, and makes the eventual painter UI (option `a`) a pure UI add-on.

### Next concrete step
Run `/ce-plan` against `docs/brainstorms/2026-05-23-mesh-segmentation-per-part-coloring-requirements.md`. Plan should decompose into: backend swap pipeline N-material refactor, Move contract changes (Model3D gains `partLabels`, Variant stores per-part color array), L1 tagging UI in `/create`, L2 variant editor refactor (`/launch` VariantEditor → label-grouped rows), Babylon click-to-select interaction.

### Open / deferred (next session)
- **Phase 4 demo-arc browser QA + U15 recording / pitch / README** still pending from the plan-012 closeout earlier today. Mesh-seg work and demo-recording work are independent; prioritize against the 6/21 submission deadline (29 days).
- **Walrus mainnet storage cost** for 6 MB × 16 variant collections — flagged in the new doc's Deferred-to-Planning section. Influences whether ce-plan chooses "store full GLB per variant" vs "store base+factor-array overrides".
- **Tripo segmentation cross-domain reliability** — confirmed on cars only; one 60cr spike per additional domain category covers it.
- All open items from the plan-012 closeout below carry forward (browser QA the polished arc, auxiliary routes, network-mismatch guard, etc.).

### Notes for next session
- Don't reopen the TINT vs FLAT decision; it's locked with visual evidence at `/dev/compare`.
- The "Path 3 — no semantic labels, dumb N-tuple palette" approach is dead — was killed when Tripo's API was confirmed to expose zero part labels AND the user confirmed segmentation cuts ARE semantically meaningful, making manual tagging worth the small UX cost.
- L1 SUI fee gate (D-034) currently anchors on Turbo's ~15cr cost; new ~60cr flow is 4× more expensive — ce-plan should re-derive the fee threshold.

---

## Previous Last-Updated: 2026-05-23 (night — plan-012 SHIPPED, D-044 Brutalist editorial rolled out across the full demo arc) — **Next = browser-QA the polished arc, then U15 demo recording / pitch / README.**

### Hackathon Tracker
- Days to submission (6/21): 29 of 38 · demo day (7/20–21): 58 · winners (8/27): 96

### This session — plan-012 shipped end-to-end (6 units + 2 follow-ups, 11 commits)

D-044 Brutalist editorial applied to every demo-arc screen. Off-white #F5F5F0 paper + 1.5px black borders + italic-serif (Newsreader) + monospace (JetBrains Mono) + accent #FF4500 rationed to primary CTAs / exception states + pure-black inset viewer wells for 3D content. Cross-cutting `frontend/src/ux/tokens.ts` is the single source of truth; CSS variables in `index.css` mirror it for the body reset and `:focus-visible` rings.

**Commit chain** (`088dba2` → `c1fc28e`, 11 commits):
- `088dba2` docs: D-044 + design-tokens + polish-backlog
- `8e1be5b` docs(plans): plan-012 — brutalist UX polish rollout
- `e23ae4b` **U1** foundation — `frontend/src/ux/tokens.ts` (+ inline-style primitives), `frontend/src/ux/TopNav.tsx` + `TopNav.test.tsx` (brand mark, 4 route links, wallet pill, TESTNET badge, NavGuard hides on `/dev/compare`), `index.css` rewritten (brutalist `:root` + body reset + italic-serif h1/h2/h3 + `border-radius: 0` global), Google Fonts `<link>` in `index.html`, `PreviewCanvas.tsx` clearColor → pure black
- `027ff4b` **U2** /create — paper bg + `— L1 / PUBLISH` eyebrow + `Make a model.` h1, two-cell source-mode toggle (accent fill on active), prompt textarea with `tokens.input`, mono uppercase ticking generate label, black PreviewCanvas well with wireframe-cube SVG empty state, two-card license policy (Open / Restricted), MintButton → `tokens.buttonPrimary`, error UI `× FAILED · {reason}`
- `854a321` **U3** /launch — `— L2 / MINT` header, base picker grid (cards initially text-only — see follow-up), VariantEditor table with brutalist hairlines + mono header cells, VariantPreview well + tiles with accent borders, outline preview / primary launch buttons + `SIGNS 3× · PAYS GAS · MINTS L2` helper row
- `9202191` **U4** /market — replaces ad-hoc #15171b dark theme. Editorial card grid with shared borders, viewer wells (black, 4:3, counter `001/004` + L2 NFT / YOURS badge), italic-serif name + mono KIOSK attribution, two-line price (`0.10 SUI` + mono `+ 0.005 ROYALTY (5.0%)`), emoji status → mono pills in page-foot status banner stack (`✓ CONFIRMED`, `× CONFIRM FAILED`, `— SYNCING`), drive-it link ink not blue
- `47ef20d` **U5** /track — full-bleed black page (canvas is the well, no border), mono HUDs without boxed chrome, Countdown italic-serif 15vw numerals (`3. → 2. → 1. → GO.` with editorial period), ResultOverlay → paper card with italic-serif 56px lap time + mono accent NEW PB banner, carCarousel mono `— SELECTED` label on active
- `d9c22ec` /launch — base mesh fallback in VariantPreview well *(reverted by `3bcc118` — user intended preview in the picker grid, not the lower well)*
- `5f11334` **U6** / landing — paper-only page (TopNav supplies chrome, in-header SignInButton row removed), hero (`— SUI OVERFLOW 2026 / WALRUS TRACK` eyebrow + `A model marketplace. On Sui. With composable IP.` h1 + L1/L2/L3 inline pills paragraph), mono uppercase tag chips with accent active fill, editorial-shared-border catalog grid, CollectionCard brutalist refit, three-CTA row (FOR CREATORS / FOR BUYERS / FOR DRIVERS → /create /market /track)
- `3bcc118` revert d9c22ec (user clarified intent)
- `b522c67` /launch — **base picker** cards now render a 4:3 mini PreviewCanvas above name + meta (user's actual intent from the d9c22ec correction)
- `c1fc28e` /market — render the actual mesh in listing + owned-card viewer wells (U4 had left a "— PREVIEW" placeholder; wired up `glbUrlForToken({ patchId, blobId })` with PreviewCanvas mock added to MarketPage.test.tsx)

**Verification end state:** `pnpm typecheck` clean · `pnpm test` 353/353 green (+8 new TopNav tests; copy assertions all survived via CSS textTransform; PreviewCanvas tests confirmed clearColor change is value-agnostic per plan KD5) · `pnpm build` clean (bundle warnings pre-existing — Babylon chunk).

### Decisions / lessons baked in
- **Inline-style primitives stay** (no Tailwind / CSS-modules). Matches the existing `MarketPage.tsx` pattern; `tokens.ts` exports both the `tokens` object and pre-built `React.CSSProperties` helpers (`buttonPrimary`, `card`, `viewerWell`, `statusBanner`, `navBar`, `pagePaper`, `eyebrow`, `displayHeadline`, `monoLabel`).
- **CSS `textTransform: uppercase` keeps DOM textContent intact** — test assertions like `toMatch(/Step 1 of 3/)`, `toBe('Mint')`, `getAllByText('Retry')` all survive without label rewrites.
- **NavGuard pattern** for global chrome — `useLocation()` hide-list (`/dev/compare`) inside a small co-located component, tested independently of the full App provider chain.
- **WebGL context cap accepted** — one Babylon canvas per card (CollectionCard, base picker, market cards). At demo catalog size this is fine; lazy-mount / shared-engine thumbnails is a Phase 5 follow-up.
- **PreviewCanvas mocking in tests** — jsdom has no WebGL; tests that render cards with PreviewCanvas must stub it. New mock added to MarketPage.test.tsx; existing mocks already in CreateModelPage / LaunchCollectionPage / TrackPage.

### Open / deferred (next session)
- **Browser QA the polished arc** end-to-end: `/ → /create → /launch → /market → /track` on testnet (live v7 listings still up). Spot the anti-pattern misses (accent count >5 per page, accidental rounded corners, off-system tints).
- **Auxiliary routes** — `/model/:id`, `/collection/:slug`, `/integrate` still unstyled (polish-backlog §6 POST). Demo path doesn't link to them, but they're reachable.
- **`/dev/compare`** — render is hidden by NavGuard but the route still mounts. Polish-backlog calls for production 404; not done.
- **NICE items deferred:** `<PageHeader>` / `<StatusBanner>` / `<MonoPill>` helper extraction (still inlined, ≤3 sites each), PreviewCanvas auto-rotation motion mitigation (D-044 ⚠️ stillness consequence), `/market` Kiosk grouping divider, `/track` race-time HUD bar + lineage badge.
- **U15 remaining**: demo-arc recording (four-actor screencap), pitch deck (re-render the 4 vibe mockups from Cowork chat into `pitch/` if needed), README hero + honest disclosure, logo (OQ-016 §2).
- **Pre-existing carry-overs**: network-mismatch guard (block wrong-network wallet), Tier C backend indexer for /market, stale-listing → buy abort cascade (CR adv-003), full-test-suite StrictMode wrap.

### Next concrete step
**Browser smoke test the polished demo arc** before recording. Run `pnpm --filter frontend dev`, walk `/ → /create → /launch → /market → /track`, validate against `docs/ux/polish-backlog.md` §8 definition-of-done per screen (paper bg, no emoji, no rounded corners, ≤5 accent uses per page, three font families loaded, loading + empty + error states all use the system). If everything reads coherent, start U15 demo recording.

### Notes for next session
- Plan-012 file `docs/plans/2026-05-23-012-feat-brutalist-ux-polish-plan.md` is frontmatter-flipped to `status: completed`.
- All mockups + visual exploration from this morning's Cowork session live ONLY in chat transcript. If pitch deck needs them, re-render to `pitch/`.
- `d9c22ec` was a misread of "preview in the box" — interpreted as the VariantPreview lower well; user actually wanted preview in each picker card. Lesson: when ambiguous, ask which "box" before writing.

---

## Previous Last-Updated: 2026-05-23 (evening — U15 UX polish kickoff: D-044 Brutalist editorial locked) — **Next = foundation (tokens.ts + TopNav) then walk demo-arc screen by screen.**

### Hackathon Tracker
- Days to submission (6/21): 29 of 38 · demo day (7/20–21): 58 · winners (8/27): 96

### This session — Visual identity locked + UX polish plan written (no code changes yet)

Interactive style exploration walked four candidate visual systems with full-fidelity mockups of `/market` in each: Dark techno (cool dark + cyan), Industrial studio (warm dark + amber), Toy soft pastel, Brutalist editorial — plus a Dark+amber hybrid. After comparing all five on the same page content, locked **Brutalist editorial** (D-044). Off-white #F5F5F0 paper, 1.5px black borders, italic-serif (Newsreader), monospace chain data (JetBrains Mono), single accent #FF4500 rationed to primary CTAs + exception states. Pure-black inset wells for 3D viewer areas solve white-bg 3D-content washout (Apple-product-page move).

**Three deliverables this session** (all cross-linked):
- `docs/ux/design-tokens.md` — full 4+2+4 system: 12 color tokens, type scale (Newsreader / Inter / JetBrains Mono — 3 families, 6 sizes, 2 weights), 6-value spacing scale, component primitives (button/input/card/badge/viewer-well/statusBanner/navBar), 11-item anti-patterns list, drop-in `frontend/src/ux/tokens.ts` + `index.css` block + Google Fonts `<link>`. Implementation order: tokens → App shell + TopNav → /create → /launch → /market → /track → /. ~14 hrs estimated polish work, fits U15 window.
- `docs/decisions.md` D-044 — full ADR per CLAUDE.md template. Alternatives rejected: Dark techno (visually generic in Overflow pile), Industrial studio (less differentiation per effort), Dark+amber hybrid (same), Toy soft pastel (fights D-031 narrative + 3D washout). Reserved D-045+.
- `docs/ux/polish-backlog.md` — per-screen MUST/NICE/POST polish items for every demo-arc route in execute order. Includes "definition of done" checklist per screen, plus out-of-scope list (Move contracts, backend API, logo, pitch deck, README, mainnet deploy).

### Other notes
- Recon: frontend uses inline `React.CSSProperties` (no Tailwind, no CSS modules) — design system written to match. `tokens.ts` exports plain CSSProperties objects.
- `App.tsx` currently has NO global nav — each page rolls its own chrome or none. Adding `<TopNav>` once is the biggest cross-screen consistency fix.
- `MarketPage` ad-hoc dark theme (`#15171b` bg, `#1a1c20` cards, status emojis) is the most prototype-looking screen and the headline new feature — highest polish yield per hour.
- D-044 honest tradeoff: Brutalist demands typography confidence. Without the recommended display serif, the system collapses to "unstyled black-on-white." 30 min budget for font selection as hard prerequisite.
- Mockups from the style exploration (4 vibes + hybrid) live only in the chat transcript; re-render and save to `pitch/` if needed for the pitch deck.

### Next concrete step
Cross-cutting foundation (~1–2 hrs): create `frontend/src/ux/tokens.ts` from the spec, add CSS variables + body reset to `frontend/src/index.css`, add Google Fonts `<link>` to `frontend/index.html`, build `<TopNav>` component at `frontend/src/ux/TopNav.tsx` and mount in `App.tsx` above `<Routes>`. Then start applying to `/create` per polish-backlog §1.

### Open / deferred (decide next session)
- Babylon `PreviewCanvas` clearColor → `#000000` to seam with the viewer well (cross-cutting MUST item).
- Auxiliary routes (`/model/:id`, `/collection/:slug`, `/integrate`) — only if time remains.
- `/dev/compare` route — production-hide before demo recording.
- Carry-over from earlier 5-23 session below (commits + market type-filter + Tier C indexer — all still pending).

---

## Previous Last-Updated: 2026-05-23 (Plan 011 D-043 shipped + full multi-agent review + buyer fullnode read-back + StrictMode latent bug fix) — **Next = commit + U15 demo/pitch.**

### Hackathon Tracker
- Days to submission (6/21): 29 of 38 · demo day (7/20–21): 58 · winners (8/27): 96

### This session — Plan 011 marketplace event discovery + full code review + buyer-side fullnode read-back + StrictMode latent bug

**Plan 011 shipped (D-043).** localStorage kiosk tracking in `/market` replaced with frontend-only event discovery: `useListings.fetchListedKioskIds()` queries Sui GraphQL `kiosk::ItemListed<NftToken>` events (∪ wallet's own kiosks) → reconciles against each kiosk's current `Listing` dynamic fields. `joinTokenDetails` now strict full-type guards against foreign NFTs (also resolves yesterday's pending type-filter). Marketplace shows cross-wallet listings regardless of which browser made them. No backend. See `docs/solutions/integration-issues/sui-graphql-events-type-indexed-discovery-2026-05-23.md` for the verified testnet GraphQL schema gotcha (`type` not `eventType`, `contents.type.repr` for event type).

**Full multi-agent code review (12 reviewers, narrow scope `base:1c59e4b`).** Applied 11 fixes across P1/P2 — `Promise.allSettled` per-kiosk + soft-fail wallet leg (regression vs pre-D-043), strict full-type equality (security: stops `0xEVIL::model3d::NftToken` spoof), D-041 status reversal-protocol fix, pollRefresh in-flight guard, MAX_PAGES=100 cap + AbortSignal plumbing, 15s fetch timeout, solution-doc relocation to `integration-issues/` subdir + frontmatter `problem_type` correction, dead-export hygiene. Suppressed 2 false-positive "loading=stuck" claims (JS spec: `try { return } finally {}` runs finally).

**Buyer-side fullnode read-back (Path Y).** User pushed back on optimistic UI; spike confirmed RPC `getObject` is ~300ms vs GraphQL indexer lag of seconds-to-minutes. `MarketPage.onBuy` now calls `useSuiClient().getObject({ id, options })` directly after `signAndExecute` resolves. Bought NftToken parsed and injected into "Your cars" immediately with `⏳ → ✅` status banner. Failure → `⚠️` + Refresh button. Hides bought item from "For sale". Honest UX — no optimistic lying.

**Discovered + fixed silent `aliveRef` StrictMode bug.** Pattern `useEffect(() => () => { aliveRef.current = false; }, [])` (cleanup-only) is broken under React.StrictMode: refs persist across the dev-mode mount→cleanup→mount cycle, leaving `aliveRef.current = false` permanently. This silently no-opped `pollRefresh` AND the new buy-confirm IIFE. Fix: setup MUST re-assert `true`. Captured in new solution doc `react-strictmode-cleanup-only-effect-with-useref-2026-05-23.md`. **Root cause for yesterday's "buy → My item not refreshing" symptom** (pollRefresh was no-op all along).

**Tests: StrictMode wrap added to `MarketPage.test.tsx` `renderPage()`.** Verified empirically — revert aliveRef fix → 3 buy-confirm tests fail loudly with DOM dump; restore → green. Scope intentionally narrow (this file only) to avoid 39-file audit; expanding test-wide is a Phase-5 follow-up.

**UX polish.** `useListings` + `useOwnedTokens` both gained `hasLoadedRef` → only first fetch shows "Loading…" placeholder; subsequent `reloadKey` bumps swap silently (header `·updating…` is the refresh hint). Listing card now reads `0.X SUI (asking) · 0.Y SUI (you pay, incl. 5% royalty)` instead of the ambiguous `price · +royalty` split.

**Verification:** 345 frontend tests green (+10 new across plan-011 + review fixes + StrictMode wrap), `tsc -b` clean, `vite build` clean. Live-verified via testnet GraphQL probe + RPC spike + browser smoke (user-driven).

### Live testnet state (unchanged from yesterday)
- v7 package `0x3f53506b…`; royalty-only `TransferPolicy<NftToken>` `0x3ffa22b3…`; kiosk-apps `0xe308bb3e…`.
- Live listings: kiosk `0x7480ce…` + kiosk `0x6e0e76…` (capy's) + new listings made by user this session. All visible cross-wallet via D-043 event discovery.

### Uncommitted (suggest split into 2 or 3 commits before U15)
- **docs**: D-041 status + D-043 ADR + plan-011 + 2 new solution docs (sui-graphql-events-type-indexed-discovery, react-strictmode-cleanup-only-effect-with-useref)
- **feat(market): D-043 network-wide marketplace event discovery + buyer fullnode read-back + UX polish** — `frontend/src/market/{useListings,MarketPage}.{ts,tsx}` + tests + `frontend/src/track/useOwnedTokens.ts`
- (judgment call whether to split feat into "base D-043" + "review hardening + read-back" — they touch overlapping lines so single feat commit is cleaner)

### Open / deferred (decide next session)
- **Network-mismatch guard** (block when wallet ≠ testnet) — still not built.
- **Tier C backend indexer** for marketplace listings — deferred per D-043 to whenever the backend is hosted for U15.
- **StrictMode wrap on all tests** — Phase-5 audit task; only MarketPage is wrapped today.
- **Stale-listing → buy abort cascade** (adv-003 from code review): re-check kiosk Listing before signing if listed item delisted between render and click. Not done.
- `KIOSK_LISTINGS_QUERY` is unpaginated (CR-003, pre-existing from D-041). Demo-OK; review tagged pre-existing.

---

## Previous Last-Updated: 2026-05-22 (Plan 010 shipped + browser-hardening bug-fix chain) — **Next = (optional) market type-filter, then U15 demo/pitch.**

### Hackathon Tracker
- Days to submission (6/21): 30 of 38 · demo day (7/20–21): 59 · winners (8/27): 97

### This session — Plan 010 live + a chain of browser-test bug fixes (all committed, 335 fe tests green, build clean)
Plan 010 marketplace (D-041) is implemented (U1–U4: `bc89d78`, `750ad7f`) and chain-logic verified live cross-wallet (see the v7 report). User then browser-tested `/create` → `/launch` → `/market` and surfaced a series of real bugs, all fixed:
- **`a87f706` + `bb3555a`** — `/api/collection/build` 422 on Tripo GLBs. Backend `gltf-transform` NodeIO registered no extensions → rejected `KHR_mesh_quantization` **and** `EXT_meshopt_compression`. Registered both (+`meshoptimizer` codec for meshopt decode/encode). Verified against the user's real 1.29 MB `penis_small` GLB.
- **`9f8e38a` + `cc8dcdd`** — expired-JWT UX. 24h token expiry showed raw 401. Added `useSession.clearSession()` + `isJwtExpired()`; expired stored tokens are dropped on read (both pages gate to sign-in); `/launch` build 401 → re-sign-in prompt; `/create` guards the SUI payment behind an expiry pre-check (no charge-then-401).
- **`813038f`** — market listings query used `objects(filter:{objectIds})` which this Sui GraphQL schema lacks → fetch each token by `object(address:)`.
- **`b2d2c42`** — `@mysten/kiosk` `getKiosk` `withListingPrices` returns **garbage prices** (6.7e18 for a real 1e7) on both GraphQL+JSON-RPC paths in this SDK version. Now read the `0x2::kiosk::Listing` dynamic field directly (authoritative).
- **`458037a`** — auto-refresh after list/buy (poll the indexer ~7.5s; signAndExecute resolves before GraphQL indexes). Threaded `reloadKey` into `useOwnedTokens`.
- **`49b354d`** — marketplace now aggregates listings across a SET of kiosks (connected wallet's own via `getOwnedKiosks` ∪ kiosks listed-into on this browser, localStorage). Fixes "listing vanished" when a listing landed in a kiosk other than the single one tracked. `useListings` now takes `string[]`.
- **`4a52051`** — D-042 ADR: royalty = global 5% + 0.001 SUI floor rationale (retroactive capture; floor stops dust-price royalty bypass).

### Live testnet state (v7) for the demo / next session
- Kiosk `0x7480cefaa623…` (owned by `0xc731848b…`): 3 listings @ 0.01 SUI (tokens a197/cc6b/ea96).
- Kiosk `0x6e0e766044…` (owned by capy `0x3116881c…`): 1 listing `penis_small #1` (ced9) @ 0.1 SUI.
- v7 Model3D: `penis_small` `0x3a86f02661…` (glb `gJLPqfep…`, creator 0xc731), `Smoke Model` `0x6f60c598…` (capy).
- The user's uploaded car GLBs live in `frontend/public/dev-glbs/` (`turbo-v1.glb`, `turbo-seg.glb`, `v1.4.glb`, + `p1.glb` seed) — committed in git.

### Open / deferred (decide next session)
- **PENDING (not done): market type-filter.** `useListings.fetchListedRefs` reads ALL Listing dynamic fields in a kiosk with NO type filter — a non-model3d NFT in the same kiosk would show as a blank-name/broken-preview listing. Fix = also fetch each token's `type` in `joinTokenDetails` and drop non-`<v7pkg>::model3d::NftToken`. Cheap (one extra field). User was asked, hasn't confirmed.
- **Discovery is approach (a)** (known-kiosk set, demo-grade); true global marketplace = option (b) `kiosk::ItemListed` event indexer (extend U7), deferred post-submission (D-041).
- Network-mismatch guard (block when wallet ≠ testnet) — suggested, not built.
- U15 (four-actor demo recording + pitch + README + honest disclosure) still the big remaining item.

---

## (2026-05-21) Plan 010 implemented — Kiosk simple marketplace, D-041

### Hackathon Tracker
- Days to submission (6/21): 31 of 38 · demo day (7/20–21): 60 · winners (8/27): 98

### Plan 010 DONE (code) — simple Kiosk marketplace (D-041 Accepted; 0 Move changes; targets v7 ids)
Closes the last broken leg of the four-actor journey: there was **no in-app way for a separate user to acquire an NftToken** (mint transfers to the creator). Built a simple Kiosk marketplace — list-for-sale + purchase — pure frontend on the already-deployed royalty-only `TransferPolicy<NftToken>`.
- **D-041 decision discipline:** hand-rolled raw `0x2::kiosk` moveCalls instead of `@mysten/kiosk` `KioskTransaction` (SDK is JSON-RPC-oriented; we're on dapp-kit/gRPC). The SDK's `purchaseAndResolve` doesn't fit anyway — it places the bought item into the *buyer's* kiosk and resolves against the SDK's default royalty package, not our `0xe308bb3e…`. SDK used only for **reads** (`getKiosk`/`getOwnedKiosks`), which accept a `SuiGraphQLClient` so we stay on the same GraphQL endpoint — no JSON-RPC client.
- **U1 (`frontend/src/sui/kioskTxBuilders.ts`):** `buildListNftTokenForSalePtb` — `place_and_list<NftToken>`; creates the seller kiosk in-PTB when absent (`kiosk::new`→`place_and_list`→`public_share_object`→cap to seller). Pure builder, mirrors `collectionTxBuilders.ts`.
- **U2 (same file):** `buildPurchaseNftTokenPtb` — royalty-only hot-potato: `kiosk::purchase` → `royalty_rule::pay` (our pkg) → `confirm_request` → `public_transfer` freed token to buyer (plain owned → /track discovers it). `royaltyOwedMist(price)` = `max(price×500/10000, 1e6)` exported for the UI.
- **U3 (`frontend/src/market/useListings.ts`):** `useListings(kioskId, reloadKey?)` — approach (a), demo-grade: read ONE seller kiosk via `getKiosk` (GraphQL client), join `patch_id`/`name` via the standard `objects` query. Plus `fetchOwnedKiosk(addr)` (first kiosk+cap) for the list flow.
- **U4 (`frontend/src/market/MarketPage.tsx`, route `/market`):** "For sale" grid (Buy → purchase PTB) + "Your cars" (price input → List PTB). Seller kiosk id bridged buyer↔seller via `localStorage` (`overflow2026:market:kiosk`). Browse nav "Marketplace →" added; route wired in `App.tsx`. Buy success → `/track?model=<tokenId>` link.
- **Verified (unit):** 331/331 frontend tests (+12: 11 builder + 5 useListings + 7 MarketPage, minus overlap), tsc clean, prod build OK.
- **Verified (LIVE on v7, cross-wallet — 2026-05-21):** keystore-signed smoke (`/tmp/market-smoke.mjs`, not committed) bootstrapped a v7 token from scratch and ran the full chain: publish Model3D `46VaNbxg…` → launch+mint `GJXfUmCr…` → **list** `39Hqw3Bh…` → **purchase** `Ziugq72a…`. Buyer `0x43d9a9…` ends up owning the token as a plain `AddressOwner` (type = v7 NftToken). PROVES the royalty-only `confirm_request` hot-potato (kiosk::purchase → royalty_rule::pay@`0xe308bb3e` → confirm_request → public_transfer) succeeds on v7 with exactly the royalty receipt, royalty = 0.05 SUI on a 1 SUI price, and no lock rule → bought token is plain-owned (so /track discovers it). Only the **dapp-kit browser signing path** remains unverified (user's UI check).
- **v7 seed objects now live** (from the smoke): forkable Model3D `0x6f60c598f0910603f1f9895bc339146844c02e8726b8d0c6ede301a65efc2a12` (PERMISSIONLESS); NftToken `0xc88e0691d8d36de7f13d4358f74ec141b1a8d0f7f83631a8f09920e3d9bd7397` owned by `0x43d9a99cd822b27afbbc3dad3e274789b008633e67bca1f05e70f2daecb165b2`. Useful for the UI check + U15 demo.
- Committed: `750ad7f` (D-041 + builders); UI layer commit next.
- **Custom `purchase_with_kiosk` Move fn is retired** (v3 relic) — we use standard `0x2::kiosk::purchase`. The solutions doc `kiosk-ptb-patterns/confirm-request-hot-potato.md` is STALE (describes the v3 3-rule design); v7 is royalty-only.

## Last Updated: 2026-05-21 (Plan 009 DONE + code-reviewed — L1 license policy ENFORCED via fresh v7 republish) — **Next = commit, then Plan 010 (Kiosk simple marketplace), then U15 demo.**

### Hackathon Tracker
- Days to submission (6/21): 31 of 38 · demo day (7/20–21): 60 · winners (8/27): 98

### Plan 009 DONE + code review applied — L1 license policy enforcement (D-040; v7 republish; uncommitted)
`Model3D.license.policy` was stored but never enforced; now RESTRICTED/ALLOW_LIST base models are creator-only to fork, PERMISSIONLESS open to any payer.
- **U1 (Move):** `EPolicyRestricted = 38` + `assert!(policy == POLICY_PERMISSIONLESS || ctx.sender() == model.creator)` at top of `launch_collection_internal` (covers both `launch_collection` + `launch_collection_with_tokens`). 4 new Move tests (restricted non-creator / restricted creator-ok / allow-list non-creator / **batch-path** restricted non-creator). Fixed pre-existing `set_integration_policy_opens_and_closes_collection` (RESTRICTED→PERMISSIONLESS base). **58/58 Move green.**
- **U2 (deploy) — FRESH v7 republish, NOT a compatible upgrade.** A compatible upgrade was done first, then **reverted** after the code review: a compatible upgrade leaves the prior *unenforced* package version permanently callable → a raw PTB to the old id bypasses the gate. A fresh republish has no prior version of itself, so enforcement is real for all v7 content — and it keeps a **single package id** (no published-at/original-id split). Follows the D-038 republish precedent.
  - **v7 ids** (single `model3dPackageId`): pkg `0x3f53506b076bb9e43fbf8fc1333375530aeb97ad54e2ad81fdd36a9d595d0861` · UpgradeCap `0xcd587052…` · Publisher `0xee62b464…` · TransferPolicy\<NftToken\> `0x3ffa22b3…` (+cap `0x76cc6960…`, royalty-only verified). publish `Cdubzmx8…`, bootstrap `B8MXhFp1…`. Superseded v6 `0x57e20a13…` + its abandoned upgrade `0x134807cd…`. Report: `docs/reports/phase-4-v7-republish.md`.
- **U3 (/create UI):** Open(2)/Restricted(0) only (dropped ALLOW_LIST); default Open. policy state now typed to the `{0,2}` union (review fix #4).
- **Code review (10 reviewers) applied:** #1 batch-path Move test added; #2 resolved structurally — fresh republish means D-040 *follows* (not reverses) D-038, so no Decision-Reversal violation; spec.md + UPGRADE.md + D-040 updated for v7; #3 split-test-hardening **mooted** (split deleted); #4 policy type narrowed. Headline P1 (stale-package bypass) is **eliminated** by choosing fresh republish.
- **Verified:** 58/58 Move · 308/308 frontend · 110/110 backend · prod build clean · v7 package + TransferPolicy live on chain (royalty-only). Live cross-wallet abort deferred into U15.
- **Next:** suggest a commit, then start Plan 010 (targets the v7 ids above).

### U14 DONE — Browse integration filter + XSS-safe Used-by (commit `b4ecb5c`, data path verified live)
- **`collection/UsedBySection.tsx`** (NEW): `GET /api/collections/:id/integrations`. AE4 defense-in-depth: `name` as React text node (markup → inert text), `url` as `<a>` ONLY after a fresh https allowlist check (else plain text); never `dangerouslySetInnerHTML`. States loading / list / empty / restricted.
- **`collection/CollectionDetailPage.tsx`** (rewritten): v6 `Model3D` has no `collection_id`, so the old `useCollectionBySlug` path was dead. Now resolves the L2 `NftCollection` via `useCollectionById` (name joined from base model), shows fee + royalty + UsedBySection. No 3D variant grid (driving is on /track).
- **`integration/useCollections.ts`**: `enabled` flag (skip fetch off the integration view) + `useCollectionById` hook.
- **`browse/BrowsePage.tsx`**: `?filter=integration` toggle → permissionless-only L2 collection grid, cards link to `/collection/:id`. Deleted dead `useCollectionBySlug.{ts,test}`; fixed dead `/generate`→`/create` empty-state link.
- Verified end-to-end on live testnet + running backend: `IntegrationRegistered` event (collection `0xcbea3c1c…`, integrator = user wallet) → indexer → `/api/collections/:id/integrations` returns `{name:"race1", url:"https://localhost:5173/track"}`; collection GraphQL `integration_policy=2` (PERMISSIONLESS) → appears in the filter. tsc clean, prod build OK, **325 fe tests green**.
- **Known demo-content note**: the registered url `https://localhost:5173/track` won't resolve (local dev is http, no https server). https-only validation is correct (public clickable href = XSS surface) and stays. For the demo, deploy the dapp to an https host (Walrus Sites preferred — on-track) and register a real URL; the localhost record is already on chain (immutable) but harmless.

### Cleanup since U14 (commit `4f81076`) — Access/buy dead-code purge + /model rework
The Phase-2 buy-access flow targeted `purchase_model_access` (removed in v6), so `/model/:id` — the landing page for **every Browse card** — had a broken "Buy access" button. Reworked `ModelDetailPage` into an L1 content detail page (preview + fork terms + "Fork → /launch" CTA; not-forkable note when no `glb_blob_id`). Removed `useOwnsAccess` (queried the deleted `Access` type) and deleted `BuyAccessButton`, `sui/purchaseAccessPtb`, `sui/publishPtb` (+ tests). Net −588 lines; 307 fe tests green. **Residual (intentionally left)**: `Model3DSummary.directAccessPrice` still in the type (always '0' in v6); `ModelCard`/`CollectionCard` still show a price → render "Free". Removing it is a separate type-wide pass.

### NEW plans written (2026-05-21) — two functional gaps found post-U14
Reviewed "what's not implemented" and found two real gaps (verified against Move source). Plans written, **not yet started**:
- **Plan 009** (`docs/plans/2026-05-21-009-feat-l1-license-policy-enforcement-plan.md`, ADR D-040 pending): `Model3D.license.policy` is **stored but never enforced** (model3d.move:588 — fork gated only by fee). Fix: enforce RESTRICTED (creator-only) vs PERMISSIONLESS in `launch_collection_internal` (1 additive assert → **compatible upgrade possible, no fresh republish**), drop ALLOW_LIST from `/create` UI (no allow-list field in LicenseTerms). Small, standalone — **do first**.
- **Plan 010** (`docs/plans/2026-05-21-010-feat-kiosk-simple-marketplace-plan.md`, ADR D-041 pending): **no in-app way for a user to acquire a token** (mint goes to creator; /track demo only works because nftCreator==user). Fix: simple **Kiosk** marketplace (user rejected hand-rolled store). **0 Move changes expected** — `TransferPolicy<NftToken>`+royalty already deployed (U17), `@mysten/kiosk@1.2.6` installed. Units: list PTB (#48) + purchase PTB (hot-potato+royalty) + discovery (main unknown) + /market UI. Frontend-heavy; **do after 009**.
- ✅ Plan 009 SHIPPED 2026-05-21 as a **fresh v7 republish** (D-040 Accepted; compatible upgrade was tried then reverted after code review — see top section). U15 demo remains **deferred** by user (folds in the live policy-abort confirmation).
- Plan 010 (D-041 pending) is next.

### Next Concrete Step — commit Plan 009, then Plan 010 (Kiosk simple marketplace)
Plan 009 done (uncommitted — suggest a commit first). Start Plan 010 U1 (`buildListNftTokenForSalePtb`, the deferred #48) per `docs/plans/2026-05-21-010-feat-kiosk-simple-marketplace-plan.md`. Write D-041 at impl start (confirm text per CLAUDE.md). NOTE for Plan 010: it builds on the **v7** `transferPolicyId` `0x3ffa22b3…` / `transferPolicyCapId` `0x76cc6960…` (fresh from the v7 bootstrap, royalty-only). Single package id again — no PKG/CALL split; builders use `TESTNET.model3dPackageId` for everything.

### (deferred) U15 (four-actor demo + pitch + README + honest disclosure)
All four actors now work in-app on v6: ✅ modelCreator (/create) · ✅ nftCreator (/launch) · ✅ user (/track) · ✅ gameDev (/integrate) + Used-by reverse lookup (/collection/:id, Browse `?filter=integration`). Remaining: (1) deploy frontend to an https host — **Walrus Sites** is the on-theme choice (Walrus track) — so the Used-by link + demo are publicly reachable; (2) record the four-actor arc (mesh publish → nft launch+fee → gameDev pay+register → user buy+drive → Used-by resolves on screen); (3) four-archetype pitch slide + README hero + honest disclosure (the four wallets are team-controlled for 6/21 unless a real external integrator is recruited). See plan U15 + carried plan-007 demo units.

### U13 DONE — gameDev `/integrate` page (commit `a4f3826`, integrate tx succeeded on chain)
gameDev registers an on-chain integration against a permissionless L2 collection: pick collection → {name,url} → pay register_fee → `register_integration` (fee routes to nft creator).
- **`integration/useCollections.ts`**: GraphQL list of `NftCollection` (no on-chain name → joins `base_model_id` to `useModelIndex` Model3D.name for display) + `fetchCollectionById` (TOCTOU re-fetch of live `register_fee` right before signing).
- **`integration/appMetadataValidation.ts`**: client mirror of backend schema — `url` **https-only** (reject http/javascript/data/schemeless), `name` ≤64 + control/bidi-char-free. Fails fast pre-popup; backend `parseAppMetadata` stays authoritative.
- **`sui/abortMessages.ts`**: maps `register_integration` MoveAbort codes (30 closed / 31 fee-too-low / 32 already-reg / 33 metadata-too-long) → human copy (AE3), never raw code. Regex anchors on the `}` closing MoveLocation (Sui errors contain nested `)`).
- **`RegisterIntegrationPage.tsx`**: picker filtered to `integration_policy == PERMISSIONLESS` (D-030), live-validated form, friendly abort + `/?filter=integration` link on the closed-collection case. Route `/integrate` + **Browse nav "Integrate →" link** (was missing — `/integrate` was URL-only at first).
- Verified: tsc clean, prod build OK, **323 fe tests green** (+24); user confirmed integrate tx succeeded in browser.
- **Four-role status: ✅ modelCreator · ✅ nftCreator · ✅ user (/track) · ✅ gameDev (/integrate).** All four actors functional on v6.

### Next Concrete Step — U14 (Browse integration filter + Used-by section, XSS-safe)
The integrate tx works but registered integrations aren't visible in-app yet (only on suiscan). Build: (1) Browse `?filter=integration` → show only collections with `integration_policy == PERMISSIONLESS` — needs Browse to query L2 `NftCollection` (today it only queries L1 Model3D via `useModelIndex`); reuse `useCollections` from U13. (2) `collection/UsedBySection.tsx` (NEW) → `GET /api/collections/:id/integrations` (U7 backend, already built) → render `name` + sanitized `<a href>` as **text nodes only** (never `dangerouslySetInnerHTML`); states: loading / "No integrations yet" / "Not accepting integrations". Covers R16/R17, AE4 (render half), AE6. Depends on U7 (done) + U8.

### U11 DONE — `/track` owned-NftToken discovery (commit `1e2afd7`, browser-smoke-passed by user)
Rewrote the dead `Access`-based discovery into owned `NftToken` → `patch_id` quilt resolution (D-035/D-036).
- **New `frontend/src/track/useOwnedTokens.ts`**: single owned-objects GraphQL query (`objects(owner, type=<v6pkg>::model3d::NftToken)` — D-036 plain owned tokens, no Kiosk walk, no two-pass). Plus `useTokenById` for the `?model=` single-drive path. New `OwnedToken` type.
- **`walrus/aggregator.glbUrlForToken`**: `patchId` → `by-quilt-patch-id`; `blobId` only for the `?blob=` dev hatch.
- **`TrackPage`**: 3 discovery paths (owned carousel / `?model=` chain-resolve / `?blob=` dev hatch). PB keyed on `tokenId`. Empty-state copy now NFT-ownership framed.
- **`carCarousel`** takes `OwnedToken[]`. **Deleted** `useOwnedVariants.{ts,test}` + `stubListingLookup.ts` (dead).
- Verified: tsc clean, **299 fe tests green**; track-scope grep clean of `Access`/`buy_access`. User confirmed in browser ("剛測了一下沒啥問題").
- **Four-role status: ✅ modelCreator · ✅ nftCreator · ✅ user (/track) · ⬜ gameDev (U13).**

### Next Concrete Step — U13 (gameDev register-integration page, F3)
New `frontend/src/integration/RegisterIntegrationPage.tsx` + route in `App.tsx`. Form `name` + `url` (client-validate `https:`-only, reject `javascript:`/`data:`/`http:` before submit, match U7 backend schema). **Re-fetch the collection's `register_fee` via getObject right before signing** (TOCTOU vs `EFeeTooLow`). `buildRegisterIntegrationPtb`. Map aborts → friendly copy: `ELicenseRestricted` → "doesn't accept integrations" + link to `/browse?filter=integration`; `EFeeTooLow` → "increase to ≥ {fee}"; `EAlreadyRegistered` → "already registered". Depends on U6 (builder) + U7 (backend Used-by API/indexer, already done). Covers AE3 UI half.

### Live e2e verification — `/launch` works (real wallet, in browser)
The user ran the full nft-creator flow in-browser. Confirmed on chain (tx `DYCbVcVt…` = `launch_collection_with_tokens`, ONE signature):
- **`NftCollection 0xab907e2ad49fdcc1680868d7313b0fdee87f792b764e467f2bba4d6b792db689`** — base_model_id `0x3220615b…` (the user's own L1 model), quilt_blob_id `BHZ3BtQ1…`, register_fee 0, base_royalty_bps 500 (snapshot), nft_creator = user wallet `0xc731848b…`.
- **2 owned `NftToken`** ("Avocado variants #1/#2"), distinct patch_ids; patch resolves via `by-quilt-patch-id` → HTTP 200 / 8.3 MB / `glTF`. So D-038 batch fn + the whole L1→L2 fork is real.
- Four-role status: ✅ modelCreator (/create) · ✅ **nftCreator (/launch)** · ⛔ user (/track is broken — see U11) · ⬜ gameDev (U13).

### Read-path / preview fixes shipped this session (all committed, tsc clean, 292 fe + 110 be green)
- **`e886dff`** — all index/detail hooks read `TESTNET.model3dPackageId`, NOT the stale `VITE_MODEL3D_PACKAGE_ID` env (was pinned to Phase-3 `0x18a480b3…` → Browse queried wrong package, showed nothing). Single source of truth; republish only bumps `networkConfig.ts`.
- **`4e53ac4`** — v6 L1 Model3D is standalone content (no `collection_id`/`patch_id`/`blob`). New `walrus/aggregator.glbUrlForSummary` (patchId → glbBlobId → legacy blobId) used at all 4 resolvers; `CollectionCard` routes `_orphan:` (standalone) models to `/model/:objectId` not the dead collection slug. Fixed empty-preview + "Collection not found".
- **`ae3e708`** — `PreviewCanvas` auto-frames the ArcRotateCamera to mesh bounding box (fixed-radius made small meshes a speck / clipped big ones).
- **`45a32dc`** — `/api/collection/build` size caps aligned to the 12 MiB `/create` upload ceiling (zod 16.8M chars + bodyLimit 18 MiB); an 8.3 MB model that published couldn't be forked (400 too_big).
- **`b344b33`** — **D-039** ADR: material-swap stays backend for v1; move to client-side gltf-transform post-submission (task #53). The 12 MiB cap is an app guard, NOT a Walrus limit (~GB).

### Seed data on v6 (for pickers/demo)
- Seed L1 Model3D **`0x38d3bdbb…`** ("Seed Roadster", glb `yCv__…`, fork fee 0.1 SUI, royalty 5%). User's own L1 `0x3220615b…` (8.3 MB avocado — high-poly, not low-poly; fine functionally, small cars are better game content). User wallet topped up with 0.5 WAL (from deployer, digest `6PipeAzG…`).

### Notes for next session
- **RTK gotcha**: the curl hook summarizes `curl` stdout (breaks JSON parsing). Use `python3 -c "...urllib..."` for chain/GraphQL queries. Aggregator 403s urllib's default UA → send `User-Agent: Mozilla/5.0`.
- `publishPtb.ts` + `purchaseAccessPtb.ts` still orphaned dead Phase-2 code (separate purge). `forge/` now holds only `VariantEditor`/`VariantPreview` (reused by `/launch`).
- After U11: U13 (gameDev register-integration page), U14 (Browse shows L2 NftCollections — currently Browse only queries L1 Model3D), U15 (demo/pitch).

---

## (earlier 2026-05-21) U12a + D-038 builder + U12b + seed DONE — nft-creator launch flow live on v6

### Hackathon Tracker
- Days to submission (6/21): 31 of 38
- Days to demo day (7/20–21): 60
- Days to winners (8/27): 98

### Shipped this session (3 commits, all green: tsc clean, 294 vitest, prod bundle builds)
- **U12a (commit `2f35739`)** — `glb_blob_id` frontend wiring (option A). New `useWalrusUpload.uploadBlob()` (writeBlobFlow → standalone raw blob, 2 popups). `buildPublishPtb` threads `glbBlobId` into the v6 `publish` moveCall after `lineageBlobId`. `CreateModelPage` uploads the GLB standalone; `lineageBlobId = glbBlobId` (lineage.json no longer separately persisted — it was never resolved anywhere; keeps both mint paths at 3 popups). `Model3DSummary += glbBlobId`; 5 mappers read `json.glb_blob_id`.
- **D-038 builder (commit `ee8ca91`)** — `buildLaunchCollectionWithTokensPtb({ modelId, feeMist, quiltBlobId, registerFeeMist, tokenNames[], tokenPatchIds[] })` in `collectionTxBuilders.ts`. Guards name/patch length parity client-side; structural + live-RPC build-resolution tests against v6.
- **U12b (commit `9d0aa0a`, net −749 lines)** — new `/launch` `LaunchCollectionPage`: pick base Model3D (`useModelIndex`, forkable = non-empty `glbBlobId`) → fetch base GLB from aggregator `/v1/blobs/<glbBlobId>` → author N variants (`VariantEditor`/`VariantPreview`) → `/api/collection/build` → quilt upload → **one-signature** `launch_collection_with_tokens`. Derive fee read from base model's `license.derivative_mint_fee` (so `Model3DSummary += derivativeMintFee + derivativeRoyaltyBps`, mapped in all 5 summary builders). **Deleted dead forge path** (`ForgePage`, `buildCollectionPtb` + tests — targeted removed Move fns); kept `VariantEditor`/`VariantPreview`. Browse nav: `/forge`→`/launch`, dead `/generate`→`/create`.

### Seed-publish DONE (CLI option b) — `/launch` base picker now has live data
- `walrus store frontend/public/dev-glbs/p1.glb --epochs 10` → standalone blob `yCv__aLMlFZxf8MwXLGViS2Ik0cjcf3UYE61yt9ZVe8` (Blob obj `0x69439961…`, ~0.0012 WAL).
- `sui client ptb` (`new_license_terms` 2/0.1SUI/500bps/true/false → `publish`) under deployer keystore → **seed Model3D `0x38d3bdbb4da15954e26fd1ab55cbd68962705a965618b4fe9ef8fa4a18811b42`** ("Seed Roadster"), ~0.0036 SUI.
- Verified via the picker's exact GraphQL endpoint: `glb_blob_id` set, `license.derivative_mint_fee=100000000` (0.1 SUI), `derivative_royalty_bps=500`. Aggregator `/v1/blobs/<glb_blob_id>` → HTTP 200, 780988 B, `glTF` magic. So the base picker lists "Seed Roadster" (forkable), `feeMist=100000000n`.

### Next Concrete Step
**Browser e2e of `/launch`** (interactive — needs a wallet): connect → pick "Seed Roadster" → author variants → `/api/collection/build` → quilt upload → sign `launch_collection_with_tokens`. Then pick up **U11 (/track owned-NftToken discovery)** or **U13 (gameDev register-integration page)**.

### Notes for next session
- `/launch` interactive wallet path not browser-tested here; unit wiring is covered (5 tests incl. asserting `feeMist` = base model `derivative_mint_fee`), and all chain-data deps are verified live (seed above).
- **RTK gotcha:** the curl hook summarizes `curl` stdout into a token-optimized structure (breaks JSON parsing). For raw chain/GraphQL queries use `python3 -c "...urllib..."` instead of curl.
- Seed base for the demo: Model3D `0x38d3bdbb…` on v6.
- `publishPtb.ts` + `purchaseAccessPtb.ts` remain orphaned dead Phase-2 code — separate purge, not in U12 scope.
- `forge/` dir now holds only `VariantEditor` + `VariantPreview` (reused by `/launch`); slightly misnamed but low-risk to leave.

---

## Last Updated: 2026-05-21 (U20 + U21 DONE — v6 live; batch launch fn) — **Next = U12a (glb_blob_id frontend wiring, targets v6) → buildLaunchCollectionWithTokensPtb builder → U12b LaunchCollectionPage.**

### Shipped this session (D-038 + 2 units, committed)
- **D-038 (Accepted)** — `launch_collection_with_tokens` batch entry fn: one-signature launch + set_register_fee + mint-N owned tokens + share + transfer cap. Collapses the nft-creator flow from ~4 wallet popups to 3 (2 Walrus upload + 1 launch-everything). Additive-only (extract package-private cores; existing signatures unchanged) — shipped fresh-republish for consistency.
- **U20 (commit `4313caa`)** — Move v6 source. New `launch_collection_with_tokens` + cores `launch_collection_internal`/`mint_nft_token_internal`; existing `launch_collection`/`mint_nft_token` are thin wrappers (signatures unchanged). New abort `EBatchLenMismatch=37`. Test-first; `sui move test` 54/54, build clean.
- **U21 (commit `2c2a811`)** — v6 fresh republish to testnet. **package `0x57e20a13…af4094`**, UpgradeCap `0x03e7b1a2…`, Publisher `0x73ccb3d9…`, **`TransferPolicy<NftToken> 0x0e3981e9…`** (+ cap `0x8f049a6e…`). Bootstrap rules VecSet = 1 (royalty only). publish digest `Ck933Viq…`, bootstrap `DETEAvJU…`. Both config mirrors updated (parity green); `docs/reports/phase-4-v6-republish.md`. Supersedes v5 `0xe0d65c4a…`.

### Next Concrete Step — U12, now targeting v6
**U12a — `glb_blob_id` frontend wiring (prerequisite, no Move change):**
- `modelTxBuilders.buildPublishPtb` (the LIVE publish builder — `publishPtb.ts` is orphaned dead code) — add `glbBlobId` to `PublishArgs` + the `publish` moveCall arg (positionally after `lineageBlobId`, matching v5/v6 signature).
- `CreateModelPage.tsx` — upload the GLB as its **own standalone blob** (separate from the lineage quilt) so it resolves via `/v1/blobs/<id>`; pass its blob id as `glbBlobId`.
- `shared` `Model3DSummary` + `browse/useModelIndex.ts` (+ its GraphQL query) — read `glb_blob_id`.
- Update affected tests. Then publish one model on v6 so the U12 base picker has data.

**New builder (D-038):** `buildLaunchCollectionWithTokensPtb({ modelId, feeMist, quiltBlobId, registerFeeMist, tokenNames[], tokenPatchIds[] })` in `collectionTxBuilders.ts` (+ test) — the one-signature path for U12b.

**U12b — `LaunchCollectionPage`:** new `frontend/src/collection/LaunchCollectionPage.tsx` (+test); `/launch` route. Flow: pick base Model3D (`useModelIndex`) → fetch base GLB from `/v1/blobs/<glb_blob_id>` → author N variants (`VariantEditor`/`VariantPreview`) → `/api/collection/build` → upload N GLBs as one quilt (`useWalrusUpload`) → **`buildLaunchCollectionWithTokensPtb`** (one popup). **Delete dead path:** `forge/ForgePage.tsx` + `forge/buildCollectionPtb.ts`, `/forge` route, BrowsePage `/forge` link (keep `VariantEditor`/`VariantPreview`).

### Decisions locked
- Popup shape: 2 Walrus + 1 batch launch = 3 total (Walrus 2 are SDK-owned; Enoki sponsored = demo-day concern).
- base GLB round-trip stays client-side (browser fetches aggregator → base64 → `/api/collection/build`); no backend change.

### Blockers / Open Questions
- None blocking. v6 (`0x57e20a13…`) is the active package everywhere. `publishPtb.ts` + `purchaseAccessPtb.ts` are orphaned dead Phase-2 code — flagged for a separate purge, not in U12 scope.

---

## Last Updated: 2026-05-21 (U18 + U19 DONE — v5 live on testnet) — **Next = U12 (nft-creator launch page), with the U10 follow-up GLB-wiring folded into its prep.**

### Shipped this session (2 units, committed)
- **U18 (commit `7137a8e`)** — Move v5 source delta (D-037). `Model3D += glb_blob_id: String` (+ accessor `glb_blob_id()`) mirroring `lineage_blob_id` (same `MAX_BLOB_ID_LEN` + `EBlobIdMalformed`); `new_model`/`publish` gain a `glb_blob_id` param threaded into `validate_publish_inputs`; `ModelPublished` event layout unchanged (resolve via object field). Test-first: glb stored/accessor + 128-accept/129-reject; threaded all 4 constructor + 14 validate callsites. `sui move test` 51/51, build clean. UPGRADE.md v5 rationale + spec §2.8 D-037 callout.
- **U19 (commit `4acc145`)** — v5 fresh republish to testnet (ran via local keystore, deployer `0x3116881c…`, ~0.05 SUI). **package `0xe0d65c4a…05309b`**, UpgradeCap `0x9642c230…`, Publisher `0xcd1943f4…`, **`TransferPolicy<NftToken> 0xd7677bb0…4774e8`** (+ cap `0xb09e9a2e…`). Bootstrap `ensure_collection_policy`; on-chain read confirms rules VecSet = exactly `royalty_rule` (1 rule). publish digest `FMfF83md…`, bootstrap `Fxq1XDj6…`. Both config mirrors updated (parity green); `docs/reports/phase-4-v5-republish.md` + UPGRADE.md v5-shipped line. Supersedes v4 `0x3b6b7258…`.

### Next Concrete Step
**U12 — nft-creator launch page** (the U10 GLB-wiring follow-up folds into its prep, since both touch the L1 publish + Browse-resolve path). Decisions already locked below (D1/D2/D3). The **U10 follow-up** to do alongside: `/create` uploads the GLB as a **standalone** Walrus blob (not quilted) → `buildPublishPtb({ …, glbBlobId })` (publish now takes `glbBlobId` positionally after `lineageBlobId`); `useModelIndex` reads `json.glb_blob_id`; resolve via `/v1/blobs/<glb_blob_id>` (sub-decision (i)). **Large multi-file UI unit — align on scope/file plan before coding; cannot browser-test here, flag it.**

### U12 decisions already locked
- **D1 = (b)+(i)**: real `glb_blob_id` field (D-037, now live on v5), standalone-blob resolution.
- **D2**: build new `collection/LaunchCollectionPage.tsx`; **delete the dead Phase-3 forge path** (`forge/buildCollectionPtb.ts` + `ForgePage` target the removed `publish_collection`).
- **D3**: batch the per-patch mints into **one PTB / one wallet popup**.
- Reuse as-is: `forge/VariantEditor` + `VariantPreview`, `walrus/useWalrusUpload`, backend `POST /api/collection/build`, the dapp-kit→Walrus signer bridge.

### Blockers / Open Questions
- None blocking. v5 is the active package everywhere (testnet.json + networkConfig.ts). Any indexer/Browse filter must target v5 `0xe0d65c4a…`.

---

## Last Updated: 2026-05-20 (v4 shipped + reviewed; D-037 accepted) — **Next = U18 (Move v5: Model3D += glb_blob_id), then U19 republish, then U12.**

### Since last entry
- **v4 code review** (multi-agent, `base:76603f5`) → no P0/P1 code defects. Applied the cheap cluster (commit `2f5fe57`): doc/comment rot, D-029 status (Decision Reversal step 2), spec §2.8 callout, D-036 royalty-opt-in tradeoff made explicit, Move + TS test hardening. Move 49/49, TS 11/11, all clean. By-design items accepted (royalty opt-in, patch_id length-only, etc.).
- **U12 scoping → surfaced a real blocker (D-037).** To fork a base Model3D, U12 needs the base GLB bytes, but v4 `Model3D` has **no on-chain GLB pointer** (Browse can't even preview L1 models today — `useModelIndex` reads a non-existent `blob_id`). User rejected the `?blob=` paste hatch and the params_json side-channel as not-legit. **Decision (D-037): add a typed `glb_blob_id: String` to `Model3D`, v5 republish.** Sub-decision (i): GLB uploaded as its own standalone blob, resolved via aggregator `/v1/blobs/<glb_blob_id>`.

### New dependency chain
**U18 (Move v5 source: `glb_blob_id`, test-first, solo) → U19 (v5 republish, user-in-loop CLI publish like U17; + U10 follow-up: `/create` uploads GLB standalone + passes `glbBlobId`, `useModelIndex` reads it) → U12 (nft-creator launch page).**

### U12 decisions already locked (for when we get there)
- **D1 = (b)+(i)**: real `glb_blob_id` field (D-037), standalone blob resolution. (NOT the paste hatch, NOT params_json.)
- **D2**: build new `collection/LaunchCollectionPage.tsx`; **delete the dead Phase-3 forge path** (`forge/buildCollectionPtb.ts` + `ForgePage` target the removed `publish_collection`).
- **D3**: batch the per-patch mints into **one PTB / one wallet popup** (new batched builder), not N popups.
- Reuse as-is: `forge/VariantEditor` + `VariantPreview`, `walrus/useWalrusUpload` (returns blobIds+patchIds), backend `POST /api/collection/build`, the dapp-kit→Walrus signer bridge.

### Next Concrete Step
**Start U18** — `contracts/model3d/sources/model3d.move`: add `Model3D.glb_blob_id: String` (+ accessor) mirroring `lineage_blob_id`; `new_model`/`publish` take a `glb_blob_id` param (bound `MAX_BLOB_ID_LEN`/`EBlobIdMalformed`); thread through all Move test callsites + add stored/accessor/128-accept/129-reject tests (test-first). `sui move build` + `test` green. Then U19 republish (needs user to run `sui client publish`).

### Blockers / Open Questions
- Context ~50% at this checkpoint — consider `/compact` before U18 (the U18→U19→U12 road is long).
- D-037 ADR text written — confirm with user before implementing U18.

---

## Last Updated: 2026-05-20 (U16 + U17 + U6-v4 DONE) — **v4 live on testnet. Next = U12 (nft-creator quilt/mint UI), then U11 (/track).**

### Shipped this session (3 units, all committed)
- **U16 (commit `2bb5ba3`)** — Move v4 source delta. `NftCollection += quilt_blob_id`, `NftToken += patch_id` (+ accessors); `launch_collection` += `quilt_blob_id` (bounded by `MAX_BLOB_ID_LEN`/`EBlobIdMalformed`); `mint_nft_token` drops kiosk args + `price` + `place_and_list`, adds `patch_id` (`MAX_PATCH_ID_LEN`/`EPatchIdMalformed=36`), `public_transfer`s a plain owned token; `NftTokenMinted` carries `patch_id`; `ensure_collection_policy` royalty-only. `sui move test` 47/47, build clean. UPGRADE.md + per-type-transfer-policy.md updated.
- **U17 (commit `a7f76ff`)** — v4 fresh republish to testnet. **package `0x3b6b7258…`**, UpgradeCap `0xe39adcd3…`, Publisher `0x09f80e91…`, `TransferPolicy<NftToken> 0x9607bcf1…` (+ cap `0x85de8533…`). Bootstrap ran royalty-only `ensure_collection_policy`; on-chain read confirms rules VecSet = exactly `royalty_rule` (1 rule). Both config mirrors updated (testnet.json + networkConfig.ts, parity green); `docs/reports/phase-4-v4-republish.md` written. Supersedes v3 `0x35ba17b3…`. publish ~0.0496 SUI.
- **U6 v4 delta (commit `0643e86`)** — `buildLaunchCollectionPtb += quiltBlobId`; `buildMintNftTokenPtb` drops kiosk args + price + ItemListed, adds `patchId` (plain mint→transfer). vitest 11/11, tsc clean; dry-run smokes hit the v4 package.

### Decisions taken this session
- **Listing builder = option C (deferred).** `buildListNftTokenForSalePtb` not built — nothing before the demo needs L2 listing (U11 shows owned tokens, U12 mints owned tokens). Tracked as task #48. When built it uses **option A** = personal-kiosk `borrow_val`→`place_and_list`→`return_val` (personal kiosk is mainstream + matches `ensure_creator_kiosk`).
- **U11 `/track` discovery = option (a):** official `suiClient.getOwnedObjects({ filter: { StructType: <pkg>::model3d::NftToken } })` — owned, *unlisted* tokens only. NO third-party API (Kiosk SDK / Blockberry / TradePort only needed if we ever show kiosk-listed tokens; that's out of scope for 6/21). Then `getObject(token) → patch_id → by-quilt-patch-id aggregator → variant GLB`.

### Next Concrete Step
**U12 — nft-creator launch page.** VariantEditor (Phase-3 `forge/`) for color/patch authoring → `/api/collection/build` (material-swap quilt) → Walrus quilt upload → `buildLaunchCollectionPtb({ modelId, feeMist, quiltBlobId })` → cap → `buildSetRegisterFeePtb` → `buildMintNftTokenPtb({ capId, collectionId, name, patchId })` per patch. Produces the real minted tokens U11 then discovers. **Large UI unit — discuss scope/file plan before coding (multi-file); cannot browser-test here, flag it.**

### Blockers / Open Questions
- U12 is substantial UI work spanning several files — align on scope first.

---

## Last Updated: 2026-05-20 (D-035/D-036 accepted; plan-008 revised) — **Next = U16 (Move v4 source delta).**

### What happened (design pivot, no code yet)
While scoping U11 (/track discovery), reading the v3 contract surfaced two things the user decided to fix as real on-chain features → **two new ADRs + a v4 republish**:
- **D-035** — L2 `NftToken` reconnects to Phase-3 quilt variants: `NftCollection += quilt_blob_id`, `NftToken += patch_id`; `launch_collection`/`mint_nft_token` gain those params. Each token binds one colored quilt patch (reuses Phase-3 `/api/collection/build` + `by-quilt-patch-id` + `forge/VariantEditor`). Closes the L2 GLB-blob-id resolution gap (v3 `Model3D`/`NftToken` store no GLB blob id; L1 still uses the `?blob=` hatch).
- **D-036** — `mint_nft_token` mints a **plain owned token** (no auto-Kiosk place_and_list; drops kiosk args); listing-for-sale is a separate opt-in. `ensure_collection_policy` keeps **only `royalty_rule`** (drops lock + personal_kiosk rules) so bought tokens are freely usable — gameDev/`/track`-friendly.
- Both ship in **one v4 fresh republish** (Move struct field adds aren't in-place upgradeable).

### Plan + ADRs revised (uncommitted)
- `docs/decisions.md` — added D-035, D-036 (Accepted).
- `docs/plans/2026-05-20-008-feat-four-role-collection-layer-plan.md` — added amendment banners (D-032/D-035/D-036), **new U16 (Move v4 source) + U17 (v4 republish)**, rewrote **U11** (/track = owned `NftToken` → `patch_id` quilt resolution; track-scoped Access grep) + **U12** (variant authoring + quilt + mint-per-patch), U6 v4-revision note, and a "Deferred to Follow-Up" item for the frontend `Access` dead-code purge (~12 files, NOT folded into U11).
- Tasks: #45 U16, #46 U17 created; #35 U11 + #36 U12 rewritten; dep chain U16→U17→U12→U11.

### New dependency chain (U11 is now BLOCKED)
**U16 (Move v4 source, test-first) → U17 (v4 republish, user-in-loop like U5) → U12 (nft creator quilt/mint UI) → U11 (/track).**

### Next Concrete Step
**Start U16** — Move v4 source delta in `contracts/model3d/sources/model3d.move`: add `NftCollection.quilt_blob_id` + `NftToken.patch_id` (+ accessors), `launch_collection` += `quilt_blob_id`, `mint_nft_token` drop kiosk args + add `patch_id` + `public_transfer` to caller, `ensure_collection_policy` royalty-only. Update Move tests (test-first: owned-mint/no-ItemListed/patch_id/single-rule policy). `sui move build` + `test` green. Then U17 republish (needs user-in-loop CLI publish).

### Blockers / Open Questions
- Uncommitted: `docs/decisions.md`, `docs/plans/2026-05-20-008-…-plan.md`, this file. Suggest commit before compaction.
- U17 republish needs the user to run `sui client publish` (interactive keychain), same as U5.

---

## Last Updated: 2026-05-20 (U9 DONE) — **procedural generation removed. Next = U11/U12 (or U8).**

### U9 — procedural teardown (done, green)
Implements D-033: `Model3D` content now comes only from Tripo prompt-mode (D-023) or user GLB upload (U10). Procedural generation gone.
- **Deleted (backend):** `generators/{box,chest,cylinder,sphere,sword,hammer,platform}.ts` (+ tests, 14 files), `routes/shapes.ts`, `lib/catalog.ts`. `generators/tripo.ts` (+test) **kept** — it's the surviving Tripo dispatch.
- **Deleted (frontend):** `creator/CreatorFlow.tsx` (+test), `components/ShapePicker.tsx` (+test). `components/` dir now empty/removed. `creator/PromptInput` + `NameInput` **kept** (ForgePage still imports them).
- **Rewritten:** `generators/index.ts` (TripoGenerator only); `agent/router.ts` (`HardcodedRouter(tripo?)` — single injected Tripo generator, prompt-only `route`, slider branch gone, `TripoDisabledError` kept); `routes/generate.ts` (prompt-only — drops `generateParamsSchema`/slider branch, keeps auth + D-034 pay-gate); `lib/schema.ts` (drops `generateParamsSchema`); `lib/lineage.ts` (`shape:'tripo'`, `TripoParams`); `app.ts` (unmount `/api/shapes`); `server.ts` (`buildRouter` injects only Tripo); `frontend/lib/api.ts` (drops `fetchShapes`/`ShapeCatalog`, `generate(params: TripoParams)`); `CreateModelPage.tsx` (`generate({shape:'tripo',prompt})`, dropped `as never`).
- **`shared/src/types.ts`:** removed `ShapeId`/`GeneratorId`/`PlatformStyle`/`paramRanges`/all `*Params` except `TripoParams`/`GenerateParams` union/all procedural zod schemas/`proceduralParamsSchemas`/`GenerateParamsSchema`/`ParamFieldSpec`/`ShapeSpec`/`ShapeCatalog`. `GeneratorSource = 'tripo'`. Kept `TripoParams`/`tripoParamsSchema`/`GenerateResult`/`Generator`/`Router`/`LineageRecord`/`GenerateResponse` + all Phase-3 Collection types.
- Tests rewritten: `routes.test.ts`, `agent/router.test.ts`, `lib/lineage.test.ts`.
- **Gates:** grep for deleted symbols → only comments. shared/backend/frontend `pnpm exec tsc` clean. **Backend 110/110** (−56, all deleted-generator tests), **frontend 293/293** (−9, CreatorFlow+ShapePicker tests).

### ⚠️ Doc follow-up (not done in U9)
`CLAUDE.md` §Core Constraints still says "Input restricted to predefined shape categories" + "Procedural generation in Go" — **contradicted by D-033**. D-033 records the supersession; left CLAUDE.md edit for the user to approve (it's the project instruction file). Flag for Phase 5 doc cleanup or a quick edit.

### Next Concrete Step
Pick **U11** (/track discovery off `?model=` getObject), **U12** (nft-creator launch-collection + set_register_fee UI), or **U8** (browse carries `license.policy`). U12 unblocks the four-actor demo arc (modelCreator→nftCreator fork).

### Blockers / Open Questions
- Uncommitted (U9): see `git status`. Suggest commit.

---

## Last Updated: 2026-05-20 (U10 DONE) — **/create mint wizard shipped. Next = U9 (procedural teardown) then U11/U12.**

### U10 chunk 2 — the `/create` wizard (done, green)
- **`frontend/src/creator/CreateModelPage.tsx`** (+test, 4✓) — two sources: Tripo prompt (pay 0.1 SUI → `buildPayForApiCallPtb` → sign → `/api/generate` with `paymentDigest` → preview → regen/confirm) | upload `.glb` (magic-byte + 12MB validation). Then name/tags/`license.policy` radio + derivative fee/royalty → `useWalrusUpload` → `buildPublishPtb` → sign. Reuses `MintButton` (3-popup labels), `PreviewCanvas`, `useSession`, the `useDappKitSigner` Walrus bridge.
- `App.tsx`: `/generate`→`/create` (CreatorFlow no longer routed; U9 deletes the file). `lib/api.ts` `generate()` gains `paymentDigest`.
- **Removed obsolete `sui/kioskTxBuilders.ts` + test** (dead Model3D-Kiosk purchase builder, D-032; its live-RPC leg broke once v3 dropped `purchase_with_kiosk`). No external importers.
- **Full frontend suite 302/302; tsc -b clean.**

### ⚠️ Honest caveat
The wizard is **component-tested only** (mocked Tripo/Walrus/sign). The real pay→Tripo→Walrus→publish E2E was **not browser-tested** (can't here). Click through `/create` live (both sources) before the demo.

### Next Concrete Step
**U9 — procedural teardown** (now safe; `/create` replaces it). Delete `CreatorFlow`/`ShapePicker`/`backend generators`/`/api/shapes`; rewrite `generate.ts` prompt-only (drop slider/`ShapeId`/`GenerateParams`/`paramRanges`); ripple through `shared/types.ts` + `lib/lineage.ts`/`catalog.ts`/`schema.ts`. Grep-gate empty + suites green. (Then U11 /track, U12 nft-creator page, etc.)

### Blockers / Open Questions
- Uncommitted (U10 chunk 2): `CreateModelPage.tsx`(+test), `App.tsx`, `lib/api.ts`, deleted `kioskTxBuilders.*`, this file. Suggest commit.

---

## Last Updated: 2026-05-20 (U10 in progress — chunk 1 done) — **L1 builders + Tripo pay-gate done. Next = U10 chunk 2 (the /create wizard UI).**

### Hackathon Tracker
- Days to submission (6/21): **32 of 38**

### Decisions this session (new)
- **D-033** — `Model3D` creation = Tripo prompt-mode **+ user GLB upload**; procedural generation removed. Retires the "predefined shapes only" constraint + D-011's procedural half. **Order flipped: U10 before U9.**
- **D-034** — Tripo generation is SUI-fee-gated (0.1 SUI → deployer treasury), verified **off-chain (Approach A)**: frontend builds exact transfer PTB (no fat-finger), backend verifies `paymentDigest` (= tx hash) before Tripo. Publish is user-funded (SUI gas + WAL). Rejected Approach B (`pay_for_api_call` Move fn) for demo to avoid contract churn — revisit v1.1.

### U10 chunk 1 (done, green)
- **`frontend/src/sui/modelTxBuilders.ts`** (+test, 7 green) — `buildPayForApiCallPtb` (split 0.1 SUI from gas → treasury) + `buildPublishPtb` (`model3d::publish` shared object). `TRIPO_FEE_MIST`/`TRIPO_FEE_TREASURY`.
- **Backend pay-gate** — `sui/paymentVerifier.ts` (+test, 9 green): verify digest via `getTransactionBlock` (success + sender==payer + ≥fee to treasury + in-memory replay guard). Wired into `generate.ts` prompt-mode (402 when verifier present + payment missing/invalid), conditional on injected verifier so legacy tests stay green. `client.ts` exports treasury/fee (from testnet.json deployer + env override). `server.ts` injects live verifier. `schema.ts` prompt schema gains optional `paymentDigest`. **Backend 166/166, tsc clean.** Slider mode left intact (U9 removes it).

### Next Concrete Step — U10 chunk 2 (the big UI)
`/create` wizard (replaces `/generate`): source tab [Tripo prompt | upload .glb] → Tripo path (pay→generate→preview→regen/confirm) → name/tags/`license.policy` radio + fees → Walrus upload (`useWalrusUpload`) → `buildPublishPtb`. Rework `MintButton`; add route in `App.tsx`; `lib/api.ts` generate call sends `paymentDigest`. **Caveat: cannot browser-test here** — will cover with component tests + typecheck and flag for live click-through before demo.

### Blockers / Open Questions
- Uncommitted (U10 chunk 1 + D-033/D-034): `decisions.md`, `modelTxBuilders.ts`(+test), `paymentVerifier.ts`(+test), `client.ts`, `schema.ts`, `generate.ts`, `app.ts`, `server.ts`, this file. Suggest commit before the UI.

---

## Last Updated: 2026-05-20 (U7 SHIPPED) — **backend on-chain read path done. Next = U8 (browse policy) / U9 / U10.**

### Hackathon Tracker
- Days to submission (6/21): **32 of 38**
- Days to winners (8/27): **99 of 105**

### What happened
**U7 — backend's first on-chain read capability, from zero.** Four new modules + tests, wired into the Hono app:
- `backend/src/sui/client.ts` — `SuiJsonRpcClient` (D-019); reads `model3d_package_id` from `contracts/networks/testnet.json` via `fs` at load (single source of truth, no second mirror). Env `SUI_RPC_URL` override.
- `backend/src/lib/appMetadataSchema.ts` — `parseAppMetadata`: exact `{name,url}`, name ≤64 codepoints + NFC + reject control/format/bidi/zero-width/surrogate/private-use, url ≤256 + **https-only**. (Residual: full homoglyph-confusables table out of scope — invisible/bidi class is rejected, visually-confusable printable homoglyphs are not.)
- `backend/src/events/integrationIndexer.ts` — self-contained single-topic poll (2s) of `IntegrationRegistered`; per event resolves `app_metadata` from the collection's `integrations` Table (getObject→Table UID cached, getDynamicFieldObject→record; vector<u8> accepted as base64 or number[]), validates, drops invalid. In-memory `Map<collectionId, Map<integrator, record>>` + cursor. Client injected → mock-tested (testnet has zero registrations).
- `backend/src/api/collections.ts` — `GET /api/collections/:id/integrations`; `:id` regex-validated; coarse per-IP fixed-window limiter (60/min); returns `{integrations:[{name,url,integrator,registered_at_ms}]}`.
- `app.ts` mounts `/api/collections` (empty-indexer fallback); `server.ts` creates + `.start()`s the live indexer only on direct invoke (not in test imports).

**25 new tests; full backend suite 157/157 green; `pnpm exec tsc --noEmit` clean.**

### Next Concrete Step
**U8** (Browse query carries `license.policy`, client-side) or **U9/U10** (procedural removal + canonical mint page on `publish`). For the demo's L1 path, U9→U10 is the higher-leverage chain. U14 ("Used by" UI) now has its backend (U7) ready.

### Blockers / Open Questions
- Uncommitted: 6 new backend files + `app.ts`/`server.ts` + this file. Suggest commit.
- Indexer state is in-memory (restart re-scans from genesis cursor) — acceptable for demo; a real deployment needs a persisted cursor.

---

## Last Updated: 2026-05-20 (U6 SHIPPED) — **collectionTxBuilders.ts done. Next = U7 backend indexer OR U9/U10 frontend migration.**

### Hackathon Tracker
- Days to submission (6/21): **32 of 38**
- Days to winners (8/27): **99 of 105**

### What happened
**U6 — `frontend/src/sui/collectionTxBuilders.ts` (NEW) + `.test.ts`.** Typed PTB builders for the 4 collection-layer entry fns, mirroring `kioskTxBuilders.ts` (TxResult<T> envelope, struct-arg discipline, RPC-reachability test leg):
- `buildLaunchCollectionPtb({ modelId, feeMist })` — `tx.object(modelId)` (shared Model3D per D-032) + fee split from gas; CollectionLaunched.
- `buildSetRegisterFeePtb({ capId, collectionId, feeMist })` — cap-gated, no event.
- `buildMintNftTokenPtb({ capId, collectionId, kioskId, personalKioskCapId, name, priceMist })` — NftTokenMinted + kiosk::ItemListed<NftToken>.
- `buildRegisterIntegrationPtb({ collectionId, feeMist, appMetadata })` — fee split from gas, `app_metadata` as `vector<u8>`, clock 0x6; IntegrationRegistered.

Choices: fee paid via `tx.splitCoins(tx.gas, [feeMist])` (Move refunds excess) — callers pass `feeMist`, not a pre-split coin. No `@mysten/kiosk` dep (these 4 builders are pure moveCalls). **10/10 vitest green; `pnpm exec tsc -b` clean** (note: bare `npx tsc` grabs an older TS that errors on tsconfig options — use `pnpm exec`).

### Not done in U6 (deferred, by design)
- `set_integration_policy` builder — trivial sibling of set_register_fee; add in U12 if the nft-creator page needs it.
- NftToken **buyer/resale** PTB (the 6-call Kiosk chain) — not in U6's 4-fn scope; a later buyer-flow unit.
- Obsolete `kioskTxBuilders.ts` (dead Model3D mint/purchase) NOT deleted — still TS-compiles (string targets); U9/U10 remove it + migrate L1 to `publish` + `take_shared<Model3D>`.

### Next Concrete Step
Pick up **U7** (backend SuiClient + single-topic `IntegrationRegistered` indexer + `app_metadata` schema + Used-by API) **or** jump to **U9/U10** (procedural removal + canonical mint page on `publish`). U7 unblocks U14's "Used by"; U9/U10 unblock the demo's L1 story. Suggest U10 next if prioritizing demo-visible path.

### Blockers / Open Questions
- Uncommitted: `collectionTxBuilders.ts` + `.test.ts` + this file. Suggest commit.

---

## Last Updated: 2026-05-20 (U5 SHIPPED) — **v3 republished to testnet (D-032). Next = U6 frontend builders.**

### Hackathon Tracker
- Days to submission (6/21): **32 of 38**
- Days to winners (8/27): **99 of 105**

### What happened
**U5 — v3 republish to testnet, done.** Environment verified first (active-env testnet, 11.46 SUI gas, `SUI_MAINNET_DEPLOY_KEY` not set). `Published.toml`'s v2 `[published.testnet]` entry blocked the republish (CLI address-management); removed it (git-recoverable) → CLI rewrote it with the v3 ID. Bootstrap = **only `ensure_collection_policy`** (D-032 dropped `ensure_transfer_policy`).

v3 testnet IDs (also in `contracts/networks/testnet.json` + `docs/reports/phase-4-v3-republish.md`):
- package `0x35ba17b3…`, UpgradeCap `0x0a3c1c5f…`, Publisher `0x00808fed…`
- `TransferPolicy<NftToken>` `0xf1816cae…` (+ cap `0xc2b91b69…`) — verified 3 rules (royalty/lock/personal_kiosk under `0xe308bb3e…`, unchanged from v2)
- publish digest `AuzWcL4f…` (~0.049 SUI); bootstrap digest `CA6oX21R…`
- supersedes v2 `0x563ab54b…`

Config updated: `testnet.json` (restructured for D-032 — one NftToken policy, generic `transfer_policy_id` key holds it) + `frontend/src/sui/networkConfig.ts` (values only, field names kept stable for the obsolete `kioskTxBuilders.ts`). **Parity test green.** `UPGRADE.md` v3 note added.

### Next Concrete Step
**U6 — `frontend/src/sui/collectionTxBuilders.ts`** (typed PTB wrappers for `launch_collection` / `set_register_fee` / `mint_nft_token` / `register_integration`, mirroring `kioskTxBuilders.ts` shape). U6 also reworks/deletes the obsolete `kioskTxBuilders.ts` (Model3D purchase chain is dead post-D-032) and should switch L1 to the new `publish` (shared object) + `take_shared<Model3D>` browse. Note OQ-019 (legacy PTB routes pinned to superseded package) clears here.

### Blockers / Open Questions
- Uncommitted (this U5 batch): `Published.toml`, `contracts/networks/testnet.json`, `frontend/src/sui/networkConfig.ts`, `contracts/UPGRADE.md`, `docs/reports/phase-4-v3-republish.md`, this file. Suggest a commit.
- Frontend still on pre-D-032 flow (publishPtb/buildCollectionPtb call non-existent Move fns; kioskTxBuilders targets the removed Model3D purchase path). U6/U9/U10 own the migration. Build/typecheck not re-verified beyond the parity test — frontend was already known-obsolete.

---

## Last Updated: 2026-05-20 (latest) — **D-032: `Model3D` → shared object, L1 Kiosk path removed. Move layer green. Next = U5 republish.**

### Hackathon Tracker
- Days to submission (6/21): **32 of 38**
- Days to winners (8/27): **99 of 105**

### What happened
Working OQ-020 + AC-003 surfaced a wrong premise in the shipped contract: `Model3D` was Kiosk-locked by `mint_and_list`, so a different-wallet nft creator could not get the `&Model3D` reference `launch_collection` needs → four-actor demo structurally broken (AC-003). User confirmed the fix ("model 不該被放到 Kiosk 因為他是賣 Access;只有 nft 會被放到 Kiosk").

**D-032 (new ADR, supersedes D-016, resolves OQ-020 path (b) + AC-003):**
- `Model3D` now published as a **shared object** via new `publish` entry fn (`new_model` + `share_object`).
- **Removed the entire L1 Kiosk path:** `mint_and_list`, `purchase_with_kiosk`, `ensure_transfer_policy` (`TransferPolicy<Model3D>`), `RoyaltyPaid` + `emit_royalty_paid`, abort code `EWrongRoyaltyRate` (21, retired).
- All Kiosk / `TransferPolicy` / royalty machinery now lives only on L2 `NftToken`. `ensure_creator_kiosk` retained (nft creator's PersonalKiosk for `NftToken`).
- L1 v1 monetization = `derivative_mint_fee` (launch_collection) + downstream `NftToken` `base_royalty_bps`. Seal access-sale = v1.1.
- Tests: removed L1-Kiosk tests, added `publish_shares_model_and_emits_model_published`. **43/43 Move tests pass, 0 warnings.**

Docs updated: D-032 ADR + D-016 marked superseded + D-031 status note; spec §1.7/§2.8 D-032 banners; OQ-020 resolved (path b).

### Next Concrete Step
**U5 — v3 republish to testnet (USER-IN-LOOP).** `sui client publish` (fresh PackageID) + bootstrap **only `ensure_collection_policy`** (D-032 dropped `ensure_transfer_policy`) + update `contracts/networks/testnet.json` + `frontend/src/sui/networkConfig.ts` (parity test) + capture UpgradeCap. Walk the checklist with the user before running — needs their keychain + testnet SUI; abort guard if `SUI_MAINNET_DEPLOY_KEY` in env. RR-001: after republish, all event subscribers use the new package ID.

### Blockers / Open Questions
- U5 is a hard stop requiring the user (external, irreversible-ish).
- Uncommitted: `model3d.move` + tests (D-032), `decisions.md` (D-032/D-016/D-031), `spec.md`, `open-questions.md` (OQ-020), this file — **plus** the prior-session D-031 docs. All want one commit before U5.
- Frontend units (U6/U10) must build on `publish` + `take_shared<Model3D>`, not the removed `mint_and_list`/`purchase_with_kiosk`. plan-008 unit bodies still say `mint_and_list` — adjust at implementation time (plan is a decision artifact, not edited mid-execution).

---

## Last Updated: 2026-05-20 (later) — **plan-008 U1–U4 (whole Move layer) SHIPPED + reviewed + D-030. Next = U5 republish.**

### Hackathon Tracker
- Days to submission (6/21): **32 of 38**
- Days to winners (8/27): **99 of 105**

### What happened
Executed `/ce-work` plan-008 U1–U4 (the entire local Move collection layer), inline-serial, `sui move build`+`test` gated, committed per unit:
- **U1** `c2f9a03` — delete `Access`; add `NftCollection` (shared) + soulbound key-only `NftCollectionCreatorCap` + `launch_collection` (pay-to-derive Fork A).
- **U2** `1079dd9` — `set_register_fee` (cap-gated).
- **U3** `8048114` — `NftToken` (key+store) + `ensure_collection_policy` (own `TransferPolicy<NftToken>`) + `mint_nft_token` + `NftTokenMinted`.
- **U4 + D-030** `5cfc943` — `register_integration` (fee/license/uniqueness/length-gated, fee→nft_creator, emit-in-frame) **plus** the D-030 amendment.

Ran `/ce-code-review` (9 agents) on U1–U4 → no P0; surfaced 2 architecture questions. User ruled:
- **D-030 (new ADR):** integration gate is **collection-level**, not a model-license snapshot. `NftCollection.base_policy` removed → `integration_policy` (cap-set via `set_integration_policy`, default PERMISSIONLESS); `register_integration` gates on it; `ELicenseRestricted`→`EIntegrationsClosed`.
- **Decision A = path ii:** base `license.policy` is display-only; derivation is fee-gated. A RESTRICTED base **can** still be forked (accepted for v1).
- Folded review quick-wins (event-field assertions, coin-branch/name-too-long/foreign-publisher/cap-mismatch tests). Focused correctness+security re-review of the D-030 delta: **clean**. **58/58 Move tests, 0 warnings.**

Accepted-as-v1 (not fixed): NftToken resale royalty → policy balance not base_creator (v1.1 split-rule); sybil/no-deregister registry; base_royalty_bps dead state (v1.1 pre-lay); D-004 dead assert.

### Next Concrete Step
**U5 — v3 republish to testnet (USER-IN-LOOP).** `sui client publish` (fresh PackageID) + bootstrap `ensure_transfer_policy` + `ensure_collection_policy` + update `contracts/networks/testnet.json` + `frontend/src/sui/networkConfig.ts` (parity test) + capture UpgradeCap. Walk the checklist with the user before running — needs their keychain + testnet SUI; abort guard if `SUI_MAINNET_DEPLOY_KEY` in env. RR-001 (api-contract review): after republish, all event subscribers must use the new package ID.

### Blockers / Open Questions
- U5 is a hard stop requiring the user (external, irreversible-ish).
- U6 (`collectionTxBuilders.ts`) + api-contract finding AC-003 to revisit: `launch_collection(&Model3D)` can't be called by a different-wallet nft creator when the model is Kiosk-locked — the four-role pay-to-derive flow needs a resolution (buy-first / wrapper / collapse roles for demo). Flagged for U6/U12; not yet decided.

---

## Last Updated: 2026-05-20 (earlier) — **plan-008 written + doc-reviewed. plan-007 superseded for U6+.**

### Hackathon Tracker
- Days to submission (6/21): **32 of 38**
- Days to shortlist (7/8): **49 of 55**
- Days to Demo Day (7/20–21): **61 of 67**
- Days to winners (8/27): **99 of 105**

### What happened
Ran `/ce-plan` on plan-007 → decided (with user) to write a **new plan-008** rather than amend plan-007. `docs/plans/2026-05-20-008-feat-four-role-collection-layer-plan.md` (status active) is the go-forward Phase-4 plan; plan-007 flipped to `status: superseded-for-U6+`.

Key decisions made during planning:
- **v3 republish (locked):** physically deleting the public `Access` struct (R22) breaks compatible-upgrade rules → fresh PackageID. User chose clean republish over keep-dead-code. Low cost now (frontend unmigrated, no pre-bake yet).
- **No backend listing indexer:** plan-007 U6–U14 were **never built** (only U1–U5 shipped: v2 Move contract + `kioskTxBuilders.ts` + `contracts/networks/testnet.json`/`networkConfig.ts`). Browse stays **client-side GraphQL** (`useModelIndex`); only a single-topic `IntegrationRegistered` backend indexer is new. This was a correction caught by the feasibility reviewer and cut scope in the right direction (negative buffer).

plan-008 = 15 units (U1–U15) + 6 pending plan-007 units carried by reference. Move collection layer (launch_collection / set_register_fee / NftToken / register_integration) → v3 republish → frontend builders → backend integration indexer → mint consolidation + procedural removal → collection/integration UI → four-actor demo. 4-persona doc-review applied: foundation correction, security commitments (https-only + name/url caps + homoglyph + fee TOCTOU), descope reorder flag.

### Next Concrete Step
**Open `/ce-work docs/plans/2026-05-20-008-feat-four-role-collection-layer-plan.md`** starting at **U1** (Move v3: delete Access + launch_collection + key-only cap). U1→U4 are Move (test-locally), U5 is the single v3 republish, then frontend/backend. Descope order (Scope Boundaries) is final: 0) drop L2 NftToken, 1) UI polish, 2) nft-creator-separate-flow (→ path B), 3) register_fee mechanics, 4) narrative-only. (#2↔#3 swapped from D-029 origin order, user-confirmed 2026-05-20 — keep the Explorer-visible fee story alive longer than a UI page.)

### Blockers / Open Questions
- (Resolved) Descope #2↔#3 swap — confirmed, applied to plan.
- Nothing committed yet this session: plan-008 (new), plan-007 (status flip), this file are modified-uncommitted. The earlier pivot (D-029/decisions.md/spec.md/brainstorm) was committed (`899fc92`, `2127354`).

---

## Last Updated: 2026-05-20 — **MAJOR PIVOT: D-013 reversed (D-029). plan-007 needs restructure before U6 resumes.**

### What happened this session (2026-05-20)

Started `/ce-work skip to U6`, but surfaced a role-coherence problem → paused U6 → ran `/ce-brainstorm` (four-role realignment) → `/ce-doc-review` (7 personas) → a design discussion that ended in a **foundational scope reversal**:

- **D-029 supersedes D-013.** The L2 / NFT collection layer is un-deferred and is now real v1 product surface. Four real actors: mesh creator (Model3D) → nft creator (`launch_collection` → `NftCollectionCreatorCap` holding `register_fee` + integration registry) → gameDev (pays `register_fee` → `register_integration`) → user. ADR written; D-013 status flipped; spec.md §1.7 banner added; brainstorm doc rewritten at `docs/brainstorms/2026-05-19-four-role-product-realignment.md`.
- **Recorded ROI dissent:** agent assessed this as low hackathon-ROI (hurts the 70%-weighted Real-World Application + Product/UX axes; reverses D-013 on first-principles; +6.5–11.5 net dev-days against ~23–24 working days → buffer −5 to +4.5). User chose path A with eyes open. **Mandatory descope order is in the brainstorm doc's Scope Boundaries.**
- **Pay-per-generate descoped to v1.1** (demo uses service-funded Tripo). Procedural generation removed.
- doc-review walk-through was concluded early (its findings were against the pre-reversal premise). Surviving findings folded into the rewritten brainstorm doc (app_metadata XSS, working-day budget, descope order, demo honesty disclosure, OQ-019 cross-ref, route redirects).

### Next Concrete Step (2026-05-20)

**Run `/ce-plan docs/plans/2026-05-19-007-feat-phase-4-kiosk-race-on-mint-plan.md`** to restructure plan-007 from U6 onward for the collection layer. Two **Resolve-Before-Planning** questions block unit decomposition (in the brainstorm doc's Outstanding Questions):
1. `NftCollection` ↔ `Model3D` ↔ Kiosk relationship — what is the sellable unit (collection vs minted NFT tokens vs Model3D)? Determines the batch-mint surface + what "buy" returns.
2. Is `register_integration` coupled to ownership (must the gameDev own the asset)?

Resolve those two first (likely a short focused brainstorm or a plan-mode discussion), then decompose. Carry the mandatory descope order into the plan as explicit drop-priority.

Nothing committed yet — decisions.md, spec.md, brainstorm doc, this file are all modified-uncommitted. Suggest committing the docs pivot before starting ce-plan.

---

## Last Updated: 2026-05-19 late — **plan-007 U5 landed (commit `20ec24d`). 5/14 units complete; typed PTB builder ships 6-call chain (was claimed 5; framework-docs review caught missing `kiosk_lock_rule::prove` + PersonalKioskCap `borrow_val`/`return_val` wrapping → 8 PTB Move calls total). 298/298 frontend tests + tsc clean + live testnet dry-run green.**

### Hackathon Tracker
- Days to submission (6/21): **33 of 38**
- Days to shortlist announcement (7/8): **50 of 55**
- Days to Demo Day live virtual present-back (7/20–21): **62 of 67**
- Days to winners (8/27): **100 of 105**

### Current Phase

**Phase 4 — Kiosk integration + race-on-mint demo centerpiece** (`docs/plans/2026-05-19-007-feat-phase-4-kiosk-race-on-mint-plan.md`). 14 implementation units (U1–U14). After U5 landed: 5/14 units complete (~36%). Move foundation + typed frontend PTB wrapper both shipped against testnet v2; U6 (ForgePage refactor) is the next unblocked unit and inherits an OQ-019 cleanup obligation.

### Completed This Session — U5 (typed `kioskTxBuilders.ts` PTB wrapper)

#### U5 — `kioskTxBuilders.ts` + 6-call PTB chain + parity test (commit: `20ec24d`)

- **`buildMintAndListPtb(args)`** — atomic mint + place + list. Single popup (R3 / AE1). Wraps `model3d::mint_and_list` (13 params) + same-PTB `new_license_terms` for the LicenseTerms struct-arg (learnings #1 discipline — struct args via on-chain construction, NOT BCS).
- **`buildPurchaseWithKioskPtb(args)`** — buyer's full PTB chain. Plan + R12 doc originally claimed 5 calls; framework-docs review caught 2 omissions, real chain is **8 PTB Move calls + 1 splitCoins**:
  1. `model3d::purchase_with_kiosk` → `(item, request)`
  2. `personal_kiosk::borrow_val` → `(OwnerCap, Borrow)` — wraps step 3 because PersonalKioskCap stores `Option<KioskOwnerCap>` internally (no standalone OwnerCap object)
  3. `kiosk::lock<Model3D>` (consumes item)
  4. `kiosk_lock_rule::prove(request, kiosk)` — receipt; `kiosk::lock` alone doesn't add one (this was the silent-bug catch)
  5. `splitCoins(tx.gas, royaltyAmount)` (PTB primitive — non-MoveCall)
  6. `royalty_rule::pay`
  7. `personal_kiosk_rule::prove`
  8. `transfer_policy::confirm_request` (consumes request hot-potato)
  9. `personal_kiosk::return_val` (consumes Borrow hot-potato)
- **`policyId` hardcoded** to `TESTNET.transferPolicyId` per ADV-001 mitigation (model3d.move:567-577 explicitly delegates policy-pinning to this builder; accepting it as a caller arg would enable parallel-policy attacks).
- **`KIOSK_APPS_PACKAGE` discovery** — pinned to `0xe308bb3ed5367cd11a9c7f7e7aa95b2f3c9a8f10fa1d2b3cff38240f7898555d` in `contracts/networks/testnet.json::kiosk_apps_package_id`. This DIFFERS from the `@mysten/kiosk` SDK's testnet defaults (`0xbd8fc194…` + `0x06f6bdd3…`). Discovery method: read the deployed TransferPolicy<Model3D>'s rules VecSet; all three rule TypeNames resolved to the same `0xe308…555d` package. Raw `tx.moveCall` approach bypasses SDK resolver (which would have picked the WRONG default address).
- **`networkConfig.ts`** — frontend-local typed mirror of `contracts/networks/testnet.json`. Justified because `tsconfig.app.json::include: ["src"]` doesn't reach `contracts/`. R4 parity test `networkConfig.test.ts` imports BOTH files + asserts field equality — drift guard for U13 mainnet ceremony.
- **R12 doc updated** — `docs/solutions/kiosk-ptb-patterns/confirm-request-hot-potato.md` now describes the 6-call rule/confirm chain + 2 borrow/return wrappers (8 total). Plan-007 Mermaid diagram + U4 Approach + U5 Approach + U5 test scenario all corrected to match.
- **Plan §U5 line 365**: `@mysten/kiosk ^0.x` → `^1.2` (0.x peer-deps `@mysten/sui@1.x`, incompatible with our `@mysten/sui@2.16.2`).
- **OQ-019 opened** — Phase 3 legacy PTBs (`publishPtb.ts`, `purchaseAccessPtb.ts`) NOT deleted this session per agreement; still imported by `CreatorFlow.tsx` + `BuyAccessButton.tsx` + `buildCollectionPtb.ts`. `.env.local` still pins superseded v1 package `0x18a480b3…`. **U6 must refactor consumers and delete the 4 Phase 3 files** — gating release.
- 4-reviewer parallel review (correctness + framework-docs + testing + adversarial) → 15 R-revisions applied in this commit. Notable: F-001/F-002 = the missing `kiosk_lock_rule::prove` + borrow/return wrappers; ADV-001 = policy-pinning; ADV-007 = networkConfig parity test; T-001 = `tsc -b` wired into `npm test` so `@ts-expect-error` directives are now load-bearing.
- Verification: **36/36 frontend test files; 298/298 tests; `tsc -b` clean; live testnet dry-run green** against `fullnode.testnet.sui.io:443`.

### Next Concrete Step

**U6: ForgePage refactor — mint flow + purchase trigger** (plan-007 §U6). Replaces the Phase 3 2-popup writeFilesFlow with the U5 `buildMintAndListPtb` single-popup flow. **Must also satisfy OQ-019 cleanup**:
1. Refactor `CreatorFlow.tsx` to call `buildMintAndListPtb` (needs PersonalKiosk + LicenseTerms + Walrus Blob inputs already produced by upstream forge state).
2. Refactor `BuyAccessButton.tsx` to call `buildPurchaseWithKioskPtb` (needs buyer PersonalKioskCap + royaltyAmount pre-query via `royalty_rule::fee_amount`).
3. Delete `frontend/src/sui/publishPtb.ts` + `purchaseAccessPtb.ts` + their .test.ts companions.
4. Update `.env.local`: either remove `VITE_MODEL3D_PACKAGE_ID` (frontend should source via `networkConfig.ts`) OR update to the v2 ID `0x563ab54b…`.
5. Acceptance: `grep -rn "publishPtb\|purchaseAccessPtb" frontend/src/` returns zero hits.

Per plan §U6 patterns + the U5 `TxResult<T>` envelope shape. Recommended invocation after compact:
```
/ce-work docs/plans/2026-05-19-007-feat-phase-4-kiosk-race-on-mint-plan.md skip to U6
```

### Earlier in session — U4 (mint_and_list + purchase_with_kiosk + testnet v2 deploy)

#### U4 — `mint_and_list` + `purchase_with_kiosk` entry/public fns + testnet republish (commit: _this commit_)

- `ensure_creator_kiosk(ctx)` — creates PersonalKiosk + PersonalKioskCap for first-time creators. NOT idempotent (matches U3's `ensure_transfer_policy` pattern; frontend U6 pins via `networks/testnet.json`).
- `mint_and_list(13 params)` — flat-primitive entry fn (Kiosk + PersonalKioskCap refs + Blob + 8 Model3D fields + Clock + price). Calls `new_model` → `kiosk::place_and_list`. Single-popup R3 satisfied. License-cap aborts inherit from `validate_publish_inputs` via `new_model`.
- `purchase_with_kiosk(kiosk, policy, model_id, payment, ctx) → (Model3D, TransferRequest<Model3D>)` — `public fun` NOT `entry` (TransferRequest has no `drop`; entry requires droppable returns). Returns the hot potato so frontend PTB chains `kiosk::lock → royalty_rule::pay → personal_kiosk_rule::prove → tp::confirm_request`. Reads royalty amount via `royalty_rule::fee_amount` + emits `RoyaltyPaid` atomically inside the call. R6 guard `assert!(fee_amount(policy, 1e9) * 10_000 / 1e9 == AMOUNT_BP_DEFAULT, EWrongRoyaltyRate)` (code 21) catches cap-compromise + legitimate rate drift before lying-event emission.
- 12 new tests (was 24, now 36 total). Includes AE1/AE2/lock/personal_kiosk/floor-branch/payment-too-low/policy-drift/soulbound-owner-pinning coverage. `expected_failure(abort_code = ::module::ECONST)` syntax used throughout for source-discriminated abort matching.
- 4-reviewer parallel pass (correctness + framework-docs + testing + adversarial) → 15 R-revisions applied in this commit (2 P0 from testing + 1 P1 from framework-docs + 12 P1/P2 cluster). Notable: F-P1 confirmed `::`-qualified abort_code IS Move 2024 supported (subagent originally misdiagnosed as parser bug); T-002 PersonalKioskCap soulbound test added (compile-fail pattern); R6 guard pattern + ADV-002 second-policy attack documented at `purchase_with_kiosk` header.
- **Testnet v2 republish (FRESH package, NOT upgrade — `key`→`key+store` is breaking per UPGRADE.md):**
  - PackageID: `0x563ab54bf9b6e76d6e61a7f0c8be3157e354750e8e435814dfa0b5232f4b0893`
  - UpgradeCap: `0xdff36101c84bff6c3d2d0a781bbb89f263da85e5aefcb43c42cc08773dd7ef2b`
  - Publisher: `0x740773948b164712f622aabe503545de118dceea132cf165883e97a0a8dbc6f1`
  - TransferPolicy<Model3D> (shared): `0x198bfe335f7844b117cc1cb3f38e9f99956259bb21bacce07490dc31e7bc3735` — verified 3 rules attached on-chain (royalty_rule, kiosk_lock_rule, personal_kiosk_rule).
  - TransferPolicyCap: `0xb673e31b2e03d8e599b51b7e729a4243c136f27c6f1bae8716b955258d6cc906`
  - Publish tx: `DkEopatczgtrZWBzRHr9Ei9yXNsyvMGnN7NQSkf9rXvL`
  - ensure_transfer_policy tx: `BKxYvbRmrFmEJmmH57o6GKugD1pZ3hTHEkTZdmMYKXK2`
  - Phase 3 v1 package (`0x18a480b3…`) superseded; Phase 3 mints stay abandoned on chain per D-016.
- NEW `contracts/networks/testnet.json` — single source of truth for the v2 deploy artifacts; U5+ frontend imports.
- NEW `docs/solutions/kiosk-ptb-patterns/confirm-request-hot-potato.md` (third R12 doc) — TransferRequest hot-potato semantics + Move-side vs frontend-side responsibilities; documents why `purchase_with_kiosk` is `public fun` (drop-check) + the buyer's 5-call PTB chain that enforces R3.
- OQ-018 opened — Move 2024 statically rejects the would-be runtime test for hot-potato un-droppability (the compile-time rejection IS the framework guarantee).
- Plan-007 §U4 edits: deleted `duration_ms` bullet (stale Phase 2 carryover per D-016); updated `purchase_with_kiosk` from `entry fn` to `public fun` in 3 spots.

### Next Concrete Step

**U5: typed `kioskTxBuilders.ts` PTB wrapper module.** Frontend module that composes the canonical 5-call buyer chain (purchase_with_kiosk → kiosk::lock → royalty_rule::pay → personal_kiosk_rule::prove → tp::confirm_request) as a typed PTB. Pins `model3d_package_id` + `transfer_policy_id` from `networks/testnet.json`. Per plan-007 U5 execution note: dry-run discipline from day 1 against live testnet (Sui CLI `--dry-run`) to catch PTB struct-arg pitfalls and confirm_request cardinality at build time.

OQ-017 frontend cleanup (8 stale Phase 3 files) becomes load-bearing once U5 imports the new package ID — U6/U9 must delete or rewrite them before the frontend typechecks against v2.

### Earlier in session — U1 + U2 + U3 ship trilogy

#### U1 — Day-1 verifications + tooling (commit `a4bcdf9`)

- §1 R1 public visibility check → **GO**. No GitHub remote yet; 7 in-repo references to Phase 2 testnet package ID (`0x18a480b3ff…`) are documentation only, no external CTAs.
- §2 Phase 3 racetrack mount sanity → **GO** (user confirmed via normal `/track` lap).
- §3 U1-prelim `?model=<id>` route prototype → **GO**. `frontend/src/track/TrackPage.tsx` + new `frontend/src/track/stubListingLookup.ts`; override mode bypasses `useOwnedVariants` + wallet gates entirely. `?blob=` dev escape hatch lets end-to-end Babylon scene-mount be tested before U7's real listings API.
- §4 Slush switch latency → **DEFERRED** to U12 demo prep (re-fires when U6+U7+U10 mergeable; measurement in vacuum doesn't predict recording-day behavior). Memory `feedback_defer_synthetic_measurements` captures the principle.
- §5 Handbook verbatim → **GO**. All 4 load-bearing claims confirmed (6/21 submission, 8/27 winners, mainnet 100% prize, Walrus track $35K). 5 discoveries spawned: 7/8 shortlist + 7/20–21 live virtual Demo Day milestones added to CLAUDE.md + tracker; OQ-016 opened for Phase 5 submission asset checklist; plan-007 U14 README must include Phase 2 → Phase 4 migration note.
- §6 tx_digest Move spike → **GO option (a)**. Published throwaway-spike to testnet at `0x6f3fc901…3101673`. TestEvent.tx_digest byte-equal to RPC-returned CALL_DIGEST after base58/base64 normalization. U2 `RoyaltyPaid.tx_digest: vector<u8>` locked. U8 must ship encoding normalization helper.

#### U2 — Move v2 foundation (commit `1a6e291`)

- `Model3D has key, store` (was `key` only — Kiosk-placeable per R1 + D-013).
- Stripped Phase 2 entry fns + Phase 3 Collection/VariantSpec plumbing. v2 diagram is authoritative.
- `MODEL3D` OTW + `fun init` claims Publisher and transfers to deployer.
- `RoyaltyPaid` struct extended from `{ buyer, creator, amount, model_id, tx_digest }` to also include `kiosk_id: ID` + `royalty_bps: u16` (per U2 review — UPGRADE.md says copy+drop events can't evolve later; fix now while testnet-disposable).
- `public(package) emit_royalty_paid(...ctx)` captures tx_digest internally — callers cannot fabricate the U8 join key.
- `public(package) new_model(...)` pure constructor with FIXED Blob lifecycle (transfer to ctx.sender()). U4 mint_and_list wraps it + kiosk::place + kiosk::list.
- 19 tests + 4-reviewer parallel pass + 10 review-driven revisions applied in same commit.
- NEW `contracts/UPGRADE.md` (60 lines) + first R12 `docs/solutions/kiosk-ptb-patterns/model3d-key-store-migration.md`.

#### U3 — TransferPolicy bootstrap with 3 rules (commit `561137b`)

- `ensure_transfer_policy(publisher: &Publisher, ctx)` creates `TransferPolicy<Model3D>` and attaches **three built-in rules** in one entry fn (rules-before-share fail-safe by construction):
  1. `royalty_rule::add` with `AMOUNT_BP_DEFAULT=500` bps + `MIN_ROYALTY_AMOUNT_MIST=1_000_000` mist floor
  2. `kiosk_lock_rule::add` (forces post-purchase lock — required for resale royalty enforcement)
  3. `personal_kiosk_rule::add` (buyer must use PersonalKiosk; frontend U5/U6 must `kiosk::personal_new`)
- `EWrongPublisher = 20` abort on wrong-type Publisher.
- Mysten apps/kiosk dep pinned to commit SHA `7a07937149c0af057be8f6747e60d0f1acd88fde` (NOT `main`).
- 24 tests + 4-reviewer parallel pass + 10 review-driven revisions applied in same commit (R12 doc text fixes, true e2e EWrongPublisher abort via NEW `contracts/foreign-witness/` sibling Move package, MIN floor semantics correction, AMOUNT_BP_DEFAULT vs MAX_DERIVATIVE_ROYALTY_BPS naming clarity, Cap-custody mainnet TODO, idempotency clarification).
- Second R12 doc: `docs/solutions/kiosk-ptb-patterns/transfer-policy-before-place.md`.

### Spawned / open items requiring future action

- **OQ-016** (Phase 5 submission asset checklist) — live virtual Demo Day prep + project logo (1:1 JPG/PNG). Fires at Phase 5 kickoff.
- **OQ-017** (Phase 3 stale frontend callers) — 8 files in `frontend/src/{sui,collection,creator,buy,forge}/` typecheck-pass but will runtime-fail after U4 republishes. U6 / U7 / U9 own deletion before U4 testnet republish so CI doesn't false-green.
- **U13 deploy script idempotency** — must pin `policy_id` in `networks/{net}.json` and refuse to re-call `ensure_transfer_policy` if populated. Documented in `ensure_transfer_policy` source comment + UPGRADE.md.
- **Re-audit Kiosk @ SHA before mainnet** — `TODO(mainnet, U13)` in Move.toml; diff apps/main vs pinned SHA, re-test, bump.
- **TransferPolicyCap mainnet custody** — `TODO(mainnet, U13)` in `ensure_transfer_policy` source. Move Cap to hardware wallet / multisig immediately after mainnet publish; cap-compromise cascade explained.

### Next Concrete Step

`/ce-work` on plan-007 **U4 (mint_and_list + purchase_with_kiosk entry functions + rule-driven royalty)**:

- U4 adds `ensure_creator_kiosk`, `mint_and_list` (flat 13-param entry fn per resolved decision D1), `purchase_with_kiosk` returning `(Model3D, TransferRequest)`.
- Royalty is NOT computed in Move — RoyaltyRule handles payment via `royalty_rule::pay` at the frontend builder layer (U5). U4 just returns the hot-potato TransferRequest and emits `RoyaltyPaid` after the PTB chain completes.
- Same pattern: subagent → 4-reviewer parallel → revise → commit.
- U4 verification includes the REAL testnet publish (Phase 4's first non-throwaway deploy of model3d v2). Writes new package ID to `networks/testnet.json`.
- After U4: U5/U6/U7/U8/U9/U10/U11/U12/U13/U14 unblocked in dependency order per plan-007.

### Notes for Next Session

- **Frontend cascade is locked in**: OQ-017 lists every file U4-republish would break. U6/U7/U9 must delete these in their respective commits before U4's `sui client publish` lands the new package ID. Otherwise CI green / runtime broken.
- **`emit_royalty_paid` is `public(package)`** — U4's `purchase_with_kiosk` body (same package) calls it directly. No PTB-layer emit needed.
- **`new_model` Blob lifecycle is fixed** — U4 must accept that the Blob goes to `ctx.sender()` (the creator); U4 cannot redirect to a buyer or Kiosk without changing U2's constructor signature. Comment in source clarifies.
- **U4 test-first execution note** (plan-007 U4 Approach) — write the Move integration test (Tom mints+lists, Marcus purchases via builder, RoyaltyPaid emitted, royalty arrived at creator address) BEFORE implementing entry functions.
- **U5 dry-run-from-day-1 discipline** — when we get to U5 (typed PTB wrapper), every new builder ships with a `client.dryRunTransactionBlock` smoke test against LIVE testnet. Fallback PROVISIONAL marker if testnet RPC unavailable.
- **Memory** `feedback_defer_synthetic_measurements` is now load-bearing: future units that include latency-style pre-flight measurements should consult this before scheduling them.

---

## Previously Last Updated: 2026-05-19 evening — **3 manual decisions resolved + Kiosk multi-beneficiary research captured. Plan is implementation-ready; next is `/ce-work` U1.**

### Hackathon Tracker
- Days to submission (6/21): **33 of 38**
- Days to shortlist announcement (7/8): **50 of 55**
- Days to Demo Day live virtual present-back (7/20–21): **62 of 67**
- Days to winners (8/27): **100 of 105**

(7/8 + 7/20–21 milestones added 2026-05-19 from plan-007 U1 handbook verbatim capture — they are not new dates, just newly tracked. Demo Day requires live virtual pitch, not just submission of the 6/21 video.)

### Completed This Session

1. **Sui Kiosk multi-beneficiary royalty research** (ce-framework-docs-researcher) — confirmed forward-compatibility of Phase 4 single-beneficiary built-in `royalty_rule` with v1.1 multi-beneficiary custom rule via UpgradeCap hot-swap. Pattern documented in `docs/solutions/architecture-patterns/sui-kiosk-multi-beneficiary-royalty-2026-05-19.md` with Move code sketch, footgun list, and Phase 4 forward-compat constraints (keep Derivative as separate struct; preserve UpgradeCap + TransferPolicyCap custody).
2. **3 manual decisions resolved** (walked through with the user, written into plan-007 Resolved Decisions section + synced into brainstorm AE3 line):
   - **D1 → `mint_and_list` = flat 13-param**. PTB struct-arg-pitfall reasoning reversed: pitfall applies to passing existing on-chain struct refs, not constructing fresh structs from primitives. Split-via-`Model3DMetadata` would actually introduce a Result-handle struct-arg risk.
   - **D2 → AE3 = 5s** (raised from 2s). Honest math: Sui finality 1.5-3s + backend poll 1s + frontend poll 1s = 3-6s worst case. Polling cadences unchanged (1s/1s). Demo timing rationale: overlay landing at 3-5s mark co-locates with buyer driving the bought car — narrative-positive.
   - **D3 → Cascade U13 → U11 → U7 with U11 hard floor.** Original order kept; added rule that U11 (demo recording capture-replay) is the last to drop because 6/19-20 recording is the root deliverable for pitch + video.

### Artifacts updated this session

- `docs/plans/2026-05-19-007-feat-phase-4-kiosk-race-on-mint-plan.md` — Outstanding Questions section replaced with Resolved Decisions; 6 in-line references (AE3, mint_and_list, risks) synced
- `docs/brainstorms/2026-05-19-phase-4-kiosk-race-on-mint-requirements.md` — AE3 changed from 2s to 5s
- `docs/solutions/architecture-patterns/sui-kiosk-multi-beneficiary-royalty-2026-05-19.md` (NEW)

### Next Concrete Step

`/ce-work` against plan-007 U1 day-1:
1. Pre-flight verifications: R1 (Kiosk SDK package install + import smoke) + R11a (Phase 3 `/track` racetrack mount with carousel variant) + R11 (Slush wallet switcher latency measurement)
2. Handbook verbatim quote capture
3. `tx_digest` Move spike (gates U2 RoyaltyPaid event schema design — 3 fallback paths identified: event_seq+sender / nonce / buyer-only filter)
4. U1-prelim `?model=<id>` route prototype on `/track`

### Notes for Next Session

- All 3 Outstanding Question blockers are now closed; no more "Resolve Before Implementation" items
- Kiosk research note (`docs/solutions/architecture-patterns/sui-kiosk-multi-beneficiary-royalty-2026-05-19.md`) is v1.1's primary reference for the `split_royalty_rule` custom rule. Don't re-research.
- U5 PTB wrapper design choice: if generic (royalty-pay step is an injectable PTB segment), v1.1 custom rule swap is one-line config; if hardcoded `royalty_rule::pay`, refactor needed at v1.1. Not Phase 4 work to plumb the abstraction, but worth flagging at U5 implementation.

---

## Previously Last Updated: 2026-05-19 late — **Phase 4 planning chain complete: ce-ideate → ce-brainstorm → ce-doc-review → ce-plan → ce-doc-review (round 2 walkthrough). Plan ready; 3 manual decisions queued for ce-work day 1.**

### Hackathon Tracker
- Days to submission (6/21): **33 of 38**
- Days to demo day (7/20–21): **62 of 67**
- Days to winners (8/27): **100 of 105**

### Current Phase

Phase 4 — Kiosk integration + race-on-mint demo (planning complete; implementation pending). Window 6/11–6/20.

### Completed This Session (planning, no code)

Full compound-engineering workflow chain for Phase 4:

1. **`/ce-ideate`** (run-id 69f67b9e) — 48 raw ideas → 7 survivors → `docs/ideation/2026-05-18-phase-4-kiosk-mainnet-demo-ideation.md`. 5 cross-cutting convergences identified; S1 ("D-009 reread: 6/21 = pitch artifact, 8/27 = mainnet tier") picked as next-step seed.
2. **`/ce-brainstorm`** — seeded by S1 → variant A locked (mainnet completely deferred to 7/22-8/27 window) → A1+A3 精選 hybrid (Kiosk integration depth pruned to PersonalKioskRule + LockRule + RoyaltyRule; race-on-mint demo arc as Phase 4 centerpiece) → `docs/brainstorms/2026-05-19-phase-4-kiosk-race-on-mint-requirements.md`.
3. **`/ce-doc-review`** round 1 on requirements (7 personas interactive) — 47 raw findings → 23 applied / 2 skipped. R15+AE5+F3 extracted to new runbook; D-028 ADR added.
4. **`/ce-plan`** — 14 implementation units (U1-U14) → `docs/plans/2026-05-19-007-feat-phase-4-kiosk-race-on-mint-plan.md`. KTDs include event polling cadences, in-memory ring buffer, typed PTB wrapper, Kiosk-protocol-level architectural principle.
5. **`/ce-doc-review`** round 2 on plan (6 personas headless then interactive walkthrough + bulk auto-resolve) — 27 actionable findings → 24 applied / 3 deferred to Outstanding Questions / 0 skipped. Plan rewritten end-to-end with Kiosk-protocol KTD, fixed file ownership (U10 = TrackPage.tsx not racetrackScene.ts), royalty mechanism switched to rule-driven (no manual coin::split), tx_digest spike moved to U1 day-1, U13 separate rehearsal key env var, full security hygiene.

### Artifacts created / updated this session

- `docs/ideation/2026-05-18-phase-4-kiosk-mainnet-demo-ideation.md` (new)
- `docs/brainstorms/2026-05-19-phase-4-kiosk-race-on-mint-requirements.md` (new, twice-reviewed)
- `docs/plans/2026-05-19-007-feat-phase-4-kiosk-race-on-mint-plan.md` (new, twice-reviewed; final rewrite includes Kiosk-protocol architectural KTD)
- `docs/runbooks/mainnet-deploy.md` (new — extracted post-Phase-4 mainnet deploy policy + bug severity matrix + WAL acquisition timing)
- `docs/decisions.md` — D-028 added (mainnet milestone-gated, supersedes D-009 implicit calendar gating)

### Blockers / Open Questions

**3 manual decisions in plan's Outstanding Questions → Resolve Before Implementation section (resolve at ce-work day 1 before U2/U4/U8 start):**

1. **`mint_and_list` 13-param entry function**: split via a `Model3DMetadata` constructor entry fn (lower struct-arg-pitfall risk) OR accept 13-param (U5 wrapper test scope grows). Affects U4 + U5.
2. **AE3 end-to-end latency math**: (a) websocket scoped to 90s recording window, (b) backend royaltyIndexer poll → 500ms during recording, (c) accept 3-6s worst case + raise AE3 to 5s. Affects U8.
3. **10-day budget descope cascade**: pre-decide cut order if reserve consumed → U13 rehearsal → U11 capture-replay → U7 CreatorDetail. Affects schedule.

### Next Concrete Step

`/ce-work` against `docs/plans/2026-05-19-007-feat-phase-4-kiosk-race-on-mint-plan.md` — but FIRST resolve the 3 Outstanding Questions above. U1 day 1 includes the tx_digest Move spike that gates U2 RoyaltyPaid event schema design. Budget for day 1: pre-flight verifications (R1 + R11a + R11) + handbook quote capture + tx_digest spike + U1-prelim `?model=` route prototype.

### Notes for Next Session

- Plan deliberately uses Kiosk SDK's `royalty_rule::pay` for royalty payment, NOT manual `coin::split + transfer` in entry fn. Architectural principle in KTDs.
- `useOwnedVariants.ts` is marked REWRITE (not preserve) — Access-based discovery deleted; Kiosk-protocol query OR delete entirely if `?model=` covers all paths.
- BrowsePage.tsx is REWRITE not NEW (existing useModelIndex/CollectionCard structure replaces Kiosk-listings grid).
- Mainnet rehearsal key MUST be separate from production deploy key: `SUI_MAINNET_REHEARSAL_KEY` vs `SUI_MAINNET_DEPLOY_KEY`.
- Polling cadences split: frontend royalty = 1s, backend royaltyIndexer = 1s (recording window), backend listingIndexer = 2s, frontend BrowsePage = 5s. Each has its rationale in KTDs.
- 9 FYI observations in round-2 review report — none required action; revisit if time permits.

---

## Previously Last Updated: 2026-05-18 late afternoon — **Plan-006 racetrack scene polish shipped end-to-end on `feat/racetrack-scene-polish`.**

### Current Phase

Phase 3 — Sample Game Scene (Tiny Racetrack polish complete; Phase 4 Kiosk + mainnet pending)

### Hackathon Tracker

- Days to submission (6/21): **34 of 38**
- Days to demo day (7/20–21): **63 of 67**
- Days to winners (8/27): **101 of 105**

### Completed This Session

- Shipped plan-006 (8 implementation units, 10 commits)
- See "Unit completion table" below for per-unit details
- All 7 visual + game-feel polish items landed (R1–R7 plus D-027 ADR)

### Blockers / Open Questions

- None.

All 8 implementation units of plan-006 landed in 8 feature commits (+1 docs commit for ideation/plan files). Branch `feat/racetrack-scene-polish` is forked from `feat/phase-2-sui-integration` and ready to merge back. Frontend test count: **246 → 276 (+30)**; typecheck clean across the workspace.

### Commits this session

```
9b47fc1 feat(track): plan-006 U8 — cinematic intro: orbit + countdown (R7)
76a8349 feat(track): plan-006 U7 — GPU tire-smoke when drifting (R6)
b24acb5 feat(track): plan-006 U6 — emissive center stripe + checker start line (R4)
b0219cc feat(track): plan-006 U5 — FOV pump on acceleration (R5)
d1d8b24 feat(track): plan-006 U4 — alternating kerb stripes on barriers (R3)
ba4816d feat(track): plan-006 U3 — SkyMaterial procedural sky (R1)
ab8492a feat(track): plan-006 U2 — DefaultRenderingPipeline (bloom + FXAA + ACES tonemap)
04e9469 feat(track): plan-006 U1 — D-027 ADR + install @babylonjs/materials
+ docs(plan): plan-006 racetrack scene polish — ideation + plan
```

### What ships visually

- **Sky**: warm golden-hour Preetham atmosphere via `@babylonjs/materials/sky/skyMaterial` (D-027)
- **Post-processing**: bloom + FXAA + ACES tonemap pipeline lifts every subsequent visual upgrade
- **Track surface**: yellow emissive center stripe (continuous, picks up bloom); checker grid start line replaces the single white plane
- **Barriers**: alternating F1-style kerbs — red/white outer, green/white inner
- **Camera**: FOV expands ~8° as you approach top speed (clamped, reverse-safe)
- **Drift FX**: GPU tire smoke from both rear wheels when lateral speed crosses the skid threshold; mirrors the skidMarks.ts hardcoded-sizing pattern (no BB derivation per project memory)
- **Cinematic intro**: 2s camera orbit → React countdown overlay (3→2→1→GO) → input unlocks. Hold W >200ms to skip.

### Unit completion table

| Unit | Files | Tests delta | Commit |
|---|---|---|---|
| U1 | docs/decisions.md (D-027), frontend/package.json | none — config/ADR | `04e9469` |
| U2 | racetrackScene.ts + .test.ts | +0 (existing 38 still pass; mock factory extended for DefaultRenderingPipeline) | `ab8492a` |
| U3 | racetrackScene.ts + .test.ts | +0 (barrier-count assertion updated 48 → 49 for skybox) | `ba4816d` |
| U4 | racetrackScene.ts | +0 | `d1d8b24` |
| U5 | racetrackScene.ts | +0 | `b0219cc` |
| U6 | racetrackScene.ts + .test.ts | +0 (ExtrudeShape/CreatePlane assertions updated for stripe + checker) | `b24acb5` |
| U7 | tireSmoke.ts (NEW) + .test.ts (NEW) + racetrackScene wiring | +9 (tireSmoke unit tests) | `76a8349` |
| U8 | lapState.ts/.test.ts, Countdown.tsx (NEW) + .test.tsx (NEW), racetrackScene.ts/.test.ts, TrackPage.tsx/.test.tsx | +18 lapState + 4 Countdown + 5 racetrackScene U8 + 4 TrackPage U8 = +21 net (lapState gained 7 new + 11 updated to use waitingLapState) | `9b47fc1` |

### Key technical decisions captured

- **D-027**: `@babylonjs/materials` adopted for SkyMaterial. Tree-shakable subpath import keeps bundle delta ~50KB. Pinned to `^9.6.0` to track `@babylonjs/core` majors.

### Process / collaboration notes

- **Test-first executed correctly for U8 per plan execution note**: wrote 18 lapState reducer tests (intro lifecycle + race transitions retrofit to `waitingLapState()`), confirmed RED, then implemented the reducer changes. All went GREEN on first run.
- **Parallel safety check applied per ce-work**: all 8 units serialize because they share `racetrackScene.ts`. No worktree isolation; serial-subagent equivalent (inline) was the right call given strong plan metadata.
- **U6 design simplified vs plan**: plan suggested optional dashed stripe; chose single continuous emissive ribbon instead (sharper at race speed, no strobing, fewer drawcalls). Documented in commit body.

### In Progress

- Branch `feat/racetrack-scene-polish` ready to merge back to `feat/phase-2-sui-integration`.
- Manual /track smoke verification (visual polish judged by eye per plan KTDs) — user can spin up dev server and judge.

### Next Concrete Step

- User Hard-refreshes `/track` and confirms the visual upgrade (sky, bloom, kerbs, stripe, FOV pump, tire smoke, intro orbit, countdown)
- If satisfied: merge `feat/racetrack-scene-polish` into `feat/phase-2-sui-integration`
- Then **Phase 4 (Sui Kiosk + TransferPolicy + mainnet redeploy)** — biggest unstarted risk per the user's hackathon priority order

### Notes for Next Session

- Intro orbit duration is `INTRO_ORBIT_DURATION_MS = 2000` in racetrackScene.ts; bump for more dramatic intro or shorten for fast iteration.
- Hold-W skip threshold is `INTRO_HOLD_W_SKIP_MS = 200`; can be lowered if dev-mode skip feels sluggish.
- `Countdown.tsx` accepts an injectable `scheduler` prop — used in tests for deterministic timing, ignored in prod.
- Deferred follow-ups per plan: engine audio, skid-mark emissive material, DirectionalLight + shadows. All gated on perf budget after pitch video direction is set.

---

## Previously Last Updated: 2026-05-18 afternoon — **Manual /track smoke iteration loop (post-plan-005 tuning).**

User ran the /track combined smoke and reported real defects across multiple short cycles. Worked through them with tight back-and-forth. Net result: car has stronger throttle + higher top speed (drift-required cornering), car visual scaled 1.728× from spawn size, skid marks rewritten as twin tire ribbons emitted **in front of** the car (per user request), velocity-predicted to land under the wheels live. All BB derivation removed after Tripo GLBs returned unreliable extents — sizing is now hardcoded constants in `skidMarks.ts` as single source of truth.

**Files touched this session (uncommitted)**: `frontend/src/track/racetrackScene.ts`, `frontend/src/track/racetrackScene.test.ts`, `frontend/src/track/skidMarks.ts`, `frontend/src/track/skidMarks.test.ts`. Frontend tests in `src/track/`: 107 passing (suite restructured — fewer tests because BB derivation paths + test infrastructure deleted, each remaining test is sharper). Typecheck clean.

### What got fixed / tuned this session

1. **Brake-then-reverse never engaged** (root cause: asymptotic brake math). Originally flagged in plan-005 code-review #17 (PERF-003) as "feel-tuning" and deferred — user hit it in real testing. `BRAKE_FORCE` 0.04 → **0.12** (3× decel) and `BRAKE_REVERSE_SPEED_THRESHOLD` 0.5 → **1.0 u/s** (widens "near stopped" band against physics noise).
2. **Skid marks not visible**. `SKID_LATERAL_SPEED_THRESHOLD` 3 → **1.5 u/s** (3 u/s was unreachable with the arcade-grip model — `LATERAL_GRIP_PER_FRAME = 0.15` kills lateral motion in 6-7 frames).
3. **Drift not required at top speed** (user-requested feel). `MAX_FORWARD_SPEED` 18 → **28 u/s**, `FORWARD_IMPULSE` 60 → **110**. At 28 u/s with steering rate 1.4 rad/s, turning radius (20 u) exceeds the track's outside-line corner radius — must brake or drift to stay on the road. Drift becomes a strategic tool, not optional.
4. **Skid marks looked like one fat shadow stripe**, not real tire marks. Rewrote `skidMarks.ts` as **twin parallel rear-axle ribbons** (left + right wheels), each `TIRE_WIDTH = 0.10` u wide, separated by `REAR_AXLE_HALF_TRACK × 2`. Each "segment" is now a pair of meshes that FIFO together atomically.
5. **Skid trail visibly lagged behind the car** (vertex-emission lag from `MIN_VERTEX_DISTANCE`). Dropped 1.0 → **0.3 u** (trail-end stays within ~7% of car length of the rear wheels). Plus per-frame **velocity-predicted position** in racetrackScene tick — adds `pivot.position + velocity / 60` to land vertex where the wheel WILL be after one render frame, compensating render lag at high speed.
6. **Two failed attempts at BB-derived skid dimensions**, then **deleted entirely** after the user's "I feel like your code is error prone, talk to me not doing first" feedback. Console.log inside `createSkidMarks` revealed Tripo GLB BB was returning halfWidth ≤ 0.3 u (failing guard) and halfLength = 0.5 u (vs visually-normal car size) — sub-mesh selection issue. BB-derivation became a dual-source-of-truth bug factory (multipliers in racetrack + fallback constants in skidMarks + hardcoded values in tests, all needing manual sync). Picked **Option A**: hardcode in `skidMarks.ts` as the only place. Removed `SkidMarksOptions` interface, all BB-derivation code in racetrackScene, and 3 BB-related tests. Cleaner mental model going forward.
7. **Skid marks moved to front of car** per user request. Renamed `REAR_OFFSET` → `WHEEL_OFFSET` (semantics: positive = in front of pivot, negative = behind). Flipped the sign in `axleCenter`. User can revert to rear by negating the constant.
8. **Car scaled up** 1.0 → 1.2 → 1.44 → **1.728** total (3 user-requested +20% bumps). Applied to `carGeometry.scaling` before PhysicsAggregate so collider matches visual. Skid mark constants intentionally NOT auto-scaled (user picked Option a for this).

### Current `skidMarks.ts` tunables (single source of truth)

```typescript
const TIRE_WIDTH = 0.10;            // each stripe width
const REAR_AXLE_HALF_TRACK = 0.35;  // stripe separation = × 2 = 0.7u
const WHEEL_OFFSET = 0.5;           // positive = in front of pivot; negative = behind
const MIN_VERTEX_DISTANCE = 0.3;    // trail-end follow tightness
const MAX_SEGMENT_PAIRS = 12;       // FIFO cap
```

### Process / collaboration learnings (worth holding)

- **User explicitly pushed back on speculative code complexity** ("I feel like your code is error prone, talk to me not doing first"). Two-source-of-truth (BB-derived multipliers in one file + fallback constants in another + hardcoded test values) was the concrete failure mode. Going forward: when adding fallback paths or "just in case" defensive code, justify the case is real-not-imagined; otherwise pick a single path and let it fail loudly. CLAUDE.md says this; I drifted from it during the BB-derivation attempts and got bit.
- **Plan-005 code-review #17 (asymptotic brake) was wrongly deferred** as "feel-tuning". It was math, not preference — user hit it on day-1 smoke. Lesson: when a reviewer flags PERF/correctness math, treat as defect by default; only defer with explicit user sign-off.
- **Manual smoke catches bugs unit tests can't** (vertex-emission cadence visibility, BB-derivation mismatch, sub-mesh selection in Tripo GLBs). 107 passing tests + UI smoke = real coverage; tests alone wouldn't have surfaced any of this session's fixes.

### In Progress

- **Manual smoke verification** — user iterating on visual feel. Last unresolved item: scale 1.728 + WHEEL_OFFSET = 0.5 + tire size to verify after Hard refresh.
- **Code-review residual items from plan-005** still open: #3 plan-vs-impl handbrake-in-reverse (product call), #5 racetrackScene.ts split (refactor — file now ~770+ LOC), #15/16 agent-native tunables export (design call), AN-004/AN-005 agent-native data attrs (design call), project-standards reviewer never returned (could re-dispatch).

### Next Concrete Step

- User to Hard refresh /track and confirm final visual feel
- If satisfied: commit the 4 uncommitted files as a single tuning/refactor commit (`feat(track): hardcode skid mark sizing + scale car 1.728× + emit in front`)
- Then **Phase 4 (Sui Kiosk + TransferPolicy + mainnet redeploy)** — biggest unstarted risk, per the user's hackathon priority order

### Notes for Next Session

- If user wants skid marks back behind car: change `WHEEL_OFFSET = 0.5` → `WHEEL_OFFSET = -0.5` (one constant, one line).
- If skid marks ever need to auto-scale with car size: add a `SKID_SCALE` constant in `skidMarks.ts` and multiply the 3 dimension constants by it (still single source). Don't re-introduce BB derivation — it failed twice this session.
- Velocity compensation in racetrackScene uses `1 / 60` hardcoded for dt. If the game ever drops below 60fps consistently, replace with `engine.getDeltaTime() / 1000` for honest predictions. Currently safe assumption.

### Hackathon Tracker

- Days to submission (6/21): **34 of 38**
- Days to demo day (7/20–21): **63 of 67**
- Days to winners (8/27): **101 of 105**

---

## Previously Last Updated: 2026-05-18 morning — **Plan-005 shipped end-to-end.** All 3 units (U1 brake state machine, U2 handbrake mode, U3 skid mark ribbons) landed in 3 feature commits + 1 docs commit on `feat/phase-2-sui-integration`. Frontend tests: 217 → 241 (+24 new across U1/U2/U3), backend 132, workspace typecheck clean. /track now has W=throttle, S=brake-then-reverse (200ms hold gate), Space=Mario-Kart handbrake (grip drop + 1.5× steering), and visible skid mark trails when lateral velocity crosses threshold. **Manual /track smoke (plan-004 + plan-005 combined) remains user-driven.**

## Session 2026-05-18 morning — Plan-005 throttle/brake/handbrake-drift

### Commits this session

```
fa6eaa6 feat(track): plan-005 U3 — skid mark ribbons emitted on lateral-speed threshold
4720ac3 feat(track): plan-005 U2 — handbrake mode (Space = grip drop + 1.5× steering)
e3e4059 feat(track): plan-005 U1 — brake state machine (S = brake-then-reverse)
dff33b4 docs(plan): brainstorm + plan-005 — throttle/brake/handbrake-drift for /track
```

### Workflow trace

`/ce-brainstorm` (Standard tier, ~3 turns of focused dialogue) → 4-option scope synthesis confirmed → requirements doc written → `/ce-plan` (Standard tier, ~5 KTDs) → `/ce-doc-review` round 1 surfaced 7 blockers including the load-bearing F-FEAS-001 (Babylon 9.7.0's `MeshBuilder.ExtrudeShape({updatable, instance})` silently truncates path-length growth — KTD-3's primary path was broken as written) → user picked "fix all 7 blockers and re-run" → blocker-fix rewrite pass → `/ce-doc-review` round 2 returned APPROVE with all 7 blockers RESOLVED → user picked Done for Now → next session (now) → `/ce-work` dispatched plan-005 → 3 units implemented serially (all touch `frontend/src/track/racetrackScene.ts`, parallel safety check failed for shared file → serial execution).

### Unit completion

| Unit | Files added/modified | Tests delta | Commit |
|---|---|---|---|
| U1 | racetrackScene.ts + .test.ts | +5 (AE1, AE2, transition, exit, W-cancel) | `e3e4059` |
| U2 | racetrackScene.ts + .test.ts | +4 (normalization regression, AE3 boost, AE4 gate-off, R7 throttle) | `4720ac3` |
| U3 | skidMarks.ts (new) + .test.ts (new), racetrackScene.ts + .test.ts | +15 (11 module unit + 4 wiring) | `fa6eaa6` |

### Key infrastructure facts surfaced + resolved

- **F-FEAS-001 (KTD-3 broken)**: `MeshBuilder.ExtrudeShape({updatable, instance})` only supports same-length path updates in 9.7.0. Verified via `shapeBuilder.d.ts:15` ("Remember you can only change the shape or path point positions, not their number when updating an extruded shape") and `ribbonBuilder.js:277-314` (loops over `min(oldLen, newLen)` and silently truncates new vertices). KTD-3 rewritten to dispose-and-recreate per growth tick as the primary path. At MIN_VERTEX_DISTANCE=0.5 u and MAX_FORWARD_SPEED=18 u/s, this fires at ~30 Hz per active segment — Babylon handles trivially.
- **F-FEAS-002 (space-key normalization)**: `KeyboardEvent.key` for the space bar is the literal `' '` character, not the string `'space'`. Without `if (k === ' ') k = 'space'` in the keyboard observer, U2's `keys.has('space')` check never matches and handbrake silently fails. Verified via UI Events spec; shipped with a regression test that fails loudly if the shim is removed.
- **F-FEAS-003 (lateralSpeed sharing)**: chose recompute in the lap-state observer rather than introducing a cross-observer closure variable. 5-line decomposition, divergence-safe.
- **DL-002 (REAR_OFFSET grounding)**: derived from `carGeometry.getBoundingInfo().boundingBox.extendSize.max(x,z) × 0.5` at scene init with REAR_OFFSET_FALLBACK=1.5 fallback if extents are degenerate.

### Outstanding tunables (per plan-005 R-r4 — time-boxed to 2 in-browser iteration rounds)

- `BRAKE_FORCE = 0.04` — starting guess; tune until decel feel is right
- `SKID_LATERAL_SPEED_THRESHOLD = 3` — starting guess; tune until skid marks appear at the "actually drifting" feel point, not on every minor turn
- `HANDBRAKE_STEER_MULTIPLIER = 1.5` — bracket 1.3-1.7× per DL-005; drop if it pirouettes, raise if it feels tame

### Verification status

- ✅ Frontend tests: 241 passed (217 → 241, +24 net new across U1/U2/U3)
- ✅ Backend tests: 132 passed (no change — plan-005 was frontend-only)
- ✅ Move tests: untouched (21 passed, no contract changes)
- ✅ Workspace typecheck: clean
- ⏳ **Manual /track smoke** combined for plan-004 + plan-005: drive a lap with W (throttle smooth taper), brake with S (then continue holding 200ms past stop to enter reverse), hold Space mid-corner for power-slide drift (see skid marks behind car), retry via R-key clears trails + teleports. Per CLAUDE.md "if you can't test the UI, say so explicitly" — this requires user.

### In Progress

- **Manual /track smoke for plan-004 + plan-005 combined** (user-driven).

### Notes for Next Session

- Plan-005 doc-review surfaced 6 advisory items (DL-006 alpha compositing, DL-007 stripe width, DL-008 dispose synchrony doc, COH-006 LinesMesh note, F-FEAS-009 2-point degenerate ribbon, DL-002 fallback value) — all tunable knobs or doc clarifications, none blocking. If in-browser smoke reveals issues, the constants to tune are documented inline in `frontend/src/track/skidMarks.ts` and `frontend/src/track/racetrackScene.ts`.
- The user's hackathon priority order (stated 2026-05-17): finish features → deploy + record at end. Plan-005 was nice-to-have polish. Next priority remains Phase 4 (Sui Kiosk + TransferPolicy + mainnet redeploy) — biggest unstarted risk.
- All plan-004 + plan-005 work is on `feat/phase-2-sui-integration`. Branch is 30+ commits since main; PR would bundle Phase 2 + Phase 3 + plan-005. Decision deferred until Phase 4 lands.
- Skid mark colour (Color3(0.05, 0.05, 0.05) at alpha 0.8): if visible blotching at overlap points on demo recording (DL-006), drop alpha to ~0.55. One-line change.

### Hackathon Tracker

- Days to submission (6/21): **34 of 38**
- Days to demo day (7/20–21): **63 of 67**
- Days to winners (8/27): **101 of 105**

---

## Previously Last Updated: 2026-05-17 evening — **Plan-004 shipped end-to-end.** All 5 units (U1 car-physics fix, U2 extruded ribbon track, U3 lap state machine + triggers, U4 HUD + PB + retry, U5 carousel teardown) landed in 6 commits on `feat/phase-2-sui-integration`. Frontend tests: 159 → 214 (+55), backend 132, workspace typecheck clean. **Manual /track smoke remains user-driven** — drive a lap with the dev fixture, beat a PB, switch cars, confirm per-car PB isolation. See plan's §Verification.

## Session 2026-05-17 evening — Plan-004 tiny-racetrack game loop

### Commits this session

```
77bb053 chore(backend): revert glb.ts cast to Float32Array<ArrayBuffer>
a0aad59 feat(track): U5 — carousel switching teardown + PB isolation across cars
068d11b feat(track): U4 — HUD overlay + per-car PB + result modal + retry
76f5ea2 feat(track): U3 — lap state machine + per-frame trigger volumes + reset
1f9a363 feat(track): U2 — procedural oval track (ribbon + tangent-aligned barriers)
3936401 feat(track): U1 — fix car physics (pivot + steer via physics API)
fd55d1b docs(plan): brainstorm + plan-004 — tiny racetrack 1-lap game loop
e3e458e feat(browse): top-nav links to Forge + Racetrack; relabel single mint
e9b1dea feat(frontend): dev /dev/compare page for Tripo model_version diffing
5a386f5 chore(backend): TS-compat GLB cast + Tripo Turbo-v1.0 + verbose submit errors
```

### Unit completion

| Unit | Files added/modified | Tests delta | Commit |
|---|---|---|---|
| U1 | racetrackScene.{ts,test.ts} | +7 (KTD-1/KTD-2 wiring) | `3936401` |
| U2 | oval.{ts,test.ts} + racetrackScene.{ts,test.ts} | +12 (9 oval + 3 net scene) | `1f9a363` |
| U3 | lapState.{ts,test.ts} + racetrackScene.{ts,test.ts} | +14 (10 reducer + 4 wiring) | `76f5ea2` |
| U4 | personalBest.{ts,test.ts}, ResultOverlay.{tsx,test.tsx}, TrackPage.{tsx,test.tsx} | +20 (6 PB + 7 modal + 7 page) | `068d11b` |
| U5 | TrackPage.{tsx,test.tsx} | +2 (AE6 isolation scenarios) | `a0aad59` |

### Key decisions made during execution

- **KTD-7 ribbon track** delivered. Catmull-Rom math implemented inline in `oval.ts` rather than wrapping Babylon's `Curve3.CreateCatmullRomSpline` — keeps the module pure (no WebGL needed in tests) and decouples us from Babylon's spline behavior changing across versions. Lap perimeter ~150 units at the chosen (35×50, r=10) config.
- **KTD-4 Havok trigger volumes** → **AA-3 fallback chosen.** Used per-frame distance-check (TRIGGER_RADIUS=8) instead of `PhysicsShape.isTrigger`. Plan accepts both; AA-3 was cheaper to wire, deterministic, and avoided the 15-min spike into the 1.3.12 Havok type definitions. Documented inline.
- **R-r4b safety ground** preserved underneath the road. Wide flat invisible floor at y=-0.5 catches the car if it bounces over a barrier. Road ribbon's MESH collider is the primary driving surface; ground is the fallback floor (kept the implementation cost ~5 LOC and removes a class of "car falls into void" demo failures).
- **HUD stays mounted during scene reload.** During carousel switching, the loading overlay covers the HUD visually but the values for the new car are already in the DOM — no flash of empty state. Surfaced by writing the U5/AE6 test.
- **glb.ts cast reverted.** Earlier 5a386f5's "unknown-cast for compat" was actually a regression; @gltf-transform/core's setArray() pins to `Float32Array<ArrayBuffer>` (narrow). Restored explicit narrow cast — works on both backend TS 5.5 and frontend TS 5.8.

### Current Phase

**Phase 3 — Real-World Application (final close).** Plan-004 (Tiny Racetrack game loop) shipped on top of plan-003 (Forge + Tiny Racetrack scaffold). Phase 3 is code-complete pending the manual /track smoke; next is Phase 4 (Sui Kiosk + TransferPolicy + mainnet redeploy).

### Verification status

- ✅ Frontend tests: 214 passed (159 → 214, +55 new — U1+U2+U3+U4+U5 collectively); 78 in `frontend/src/track/` alone after /ce-code-review fix batch
- ✅ Backend tests: 132 passed (no change — backend untouched in plan-004 logic; tripo-client.ts errBody truncation added without test gap)
- ✅ Move tests: untouched (21 passed, no contract changes)
- ✅ Workspace typecheck: clean (shared + backend + frontend)
- ⏳ **Manual /track smoke** (user-driven — per CLAUDE.md "if you can't test the UI, say so explicitly"): drive a lap with `/dev-glbs/p1.glb`, beat the PB, retry via button + R-key, switch cars in carousel, confirm per-car PB isolation. See plan's §Verification.

### In Progress

- **Manual /track smoke** (user-driven) — sole remaining plan-004 verification item. All code changes shipped + all 8 P1 code-review findings addressed.

### Notes for Next Session

- /ce-code-review on plan-004 dispatched 12 reviewers; all 8 P1 findings + ~14 P2 findings landed as fixes this session. Residual P2/P3 items surfaced in the run artifact at `/tmp/compound-engineering/ce-code-review/20260517-163813-5e7e39f0/` — five items deliberately deferred:
  1. **#11 60fps React re-render from tick action** — needs rAF-based HUD timer refactor (decouple display from reducer). Profile before fixing; not yet a frame-dropper.
  2. **#12 dev/CompareGlbsPage + dev-glbs fixtures shipping to prod build** — D-024 (Turbo-v1.0 Accepted) was the stated deletion trigger but user may want to keep the tool for a future Tripo model evaluation. Add `frontend/public/dev-glbs/` to `.gitignore` AT MINIMUM before Phase 5 prod deploy.
  3. **#26 Test for scene.dispose() racing in-flight Walrus fetch** — needs deferred-promise test setup; defensively the AbortController fix from #2 already mitigates the underlying bug.
  4. **#29 Lap-quartering bypass (drive past checkpoint, U-turn, hit start)** — game-design decision: add `dot(velocity, startTangent) > 0` check at finish-line entry. May affect feel. Worth a one-time test during manual smoke to see if it actually matters.
  5. **#32 useOwnedVariants returns variants with empty blobId/patchId** — validation should happen upstream in the indexer, not here.
- Three ADR-debt items also surfaced (PS-002/003/004): KTD-5 (localStorage PB keying), KTD-6 (cross-boundary reducer), AA-3 (per-frame trigger fallback chosen over Havok-native). All documented in plan-004 + phase-progress but no formal D-XXX ADRs landed. Per CLAUDE.md "Hackathon Reality Check" judgement call — these are new patterns worth capturing before Phase 4 expands them. Suggested: D-027 / D-028 / D-029 inline ADRs in a single batch.
- The `scene.onKeyboardObservable` agent-native trap is now fixed (canvas.tabIndex=-1 + focus on init) — agents and Playwright tests no longer need to manually focus the canvas before WASD dispatch.

### Insights worth carrying forward

- **Plan-time hard-time-box + named fallback worked.** U2 carried a "2-day box, fall back to AA-2 inner-wall-ring if ribbon doesn't land by EOD-1". Implementation landed within the first attempt at the primary path. The fallback being named in the plan meant zero second-guessing during execution. Worth re-using on any "longest unit in the plan" that has known risk surface.
- **Pure-module + tiny mock pattern.** `oval.ts` uses only Babylon's Vector3 as a value type. Test mocks just Vector3 with a `{x,y,z}` class — no full Babylon mock surface needed. 9 tests in 6ms. Pattern reusable for any geometric/math helper that's "Babylon-adjacent but doesn't need WebGL".
- **Per-frame trigger volumes are simpler than Havok-native triggers.** AA-3 (plane intersection / distance check) shipped in ~15 LOC + 4 scene tests. Havok-native triggers would have required spelunking 1.3.12 .d.ts files + handling collision observable lifecycles + cleanup on dispose. For lap-detection-style "did X enter zone Y" gameplay, distance checks are correct by construction and easier to test.
- **HUD-during-reload surfaced by writing the U5 test.** The plan didn't explicitly call out "HUD stays mounted during scene reload" — I'd hidden it on sceneLoading initially. The AE6 test forced me to think about what the user actually sees during a carousel switch (loading overlay covers HUD visually anyway, so the conditional was strictly worse UX). Tests-as-spec working as intended.

### Hackathon Tracker

- Days to submission (6/21): **35 of 38**
- Days to demo day (7/20–21): **64 of 67**
- Days to winners (8/27): **102 of 105**

### Next concrete step

User runs the manual /track smoke per plan-004's §Verification. After that lands ✅: Phase 3 is fully closed (Forge + Tiny Racetrack both demo-ready). Next priority per the prior session's roadmap: **Phase 4 — Sui Kiosk + TransferPolicy royalty integration** (D-013 v1 must-have, biggest unstarted risk; OQ-013 → Phase 4 ADR needed first).

### Previous session notes preserved below

---

## Previously Last Updated: 2026-05-17 PM — **U7 path debugged.** 8 commits this session on `feat/phase-2-sui-integration` removing every latent blocker between Forge → Walrus → Sui that the Phase 3 test suite (mocked) couldn't catch. First successful live testnet mint produced collection `0x38bad19ea39a007cca17311275d99f7a15994b18632a2938a5a7e296ee4925b4` (1 variant `0x46f248975df4c202d8950efa26d9892b3bf62e9764d39829cea2f4786ae86a58`). Walrus round-trip script proven byte-identical end-to-end. Frontend tests: 159/159, tsc clean. **U7 capture artifacts (multi-variant mint, two-wallet buy + drive, 90-sec recording, Suiscan screenshots) still pending** — those are the human-driven steps the user runs through `pitch/demo-script.md`.

## Session 2026-05-17 PM — live-testnet debugging pass

User started this session asking how to test U7. Read past phase-progress + plan-003 §U7 + demo-script for context. Then ran the live mint path and surfaced 8 distinct blockers — each one a latent bug that vitest mocks couldn't surface. All fixed in-session with tests + typecheck green throughout.

### Commits this session

```
d155dff feat(preview): render real Babylon previews on browse/collection/model pages
a76bbc6 fix(forge): drop hardcoded 'Neon Drift Series' default collection name
7c1fa14 chore(walrus): node round-trip smoke test (upload + aggregator download)
ceebf17 fix(walrus): pass register tx digest into flow.upload()
cf98acf fix(babylon): pass pluginExtension '.glb' so blob: URLs load
a0a2cbe feat(forge): preview button — render variants before minting
3f5099e fix(walrus): add signAndExecuteTransaction to dapp-kit signer shim
```

### Bug-by-bug log

| # | Symptom (live testnet) | Layer | Root cause | Commit |
|---|---|---|---|---|
| 1 | `signer.signAndExecuteTransaction is not a function` at popup 1 | dapp-kit ↔ Walrus | `@mysten/walrus@1.1.7` client.mjs:1298 calls `signer.signAndExecuteTransaction({transaction,client})`; our shim only exposed `toSuiAddress + signTransaction`. Comment in code even claimed otherwise — true of older SDK, not 1.1.7. | `3f5099e` |
| 2 | No way to preview variants before signing 3 popups | Forge UX | Mint button ran build → upload → sign as one block. Added Preview button + freshness hash check; Mint reuses GLBs if state unchanged. | `a0a2cbe` |
| 3 | Variant preview canvas empty (load silently fails) | Babylon | `LoadAssetContainerAsync` infers loader from URL extension; `blob:` URLs have none. Passing `pluginExtension: '.glb'` unconditionally (we only ever load GLB per D-006). | `cf98acf` |
| 4 | `Either resume.blobObjectId or upload digest must be provided` at Walrus relay step | Walrus upload flow | `useWalrusUpload` called `flow.upload({})`. The canonical pattern (SDK's own `run` generator) captures `txDigest` from `executeRegister` and forwards it into `upload({digest})`. | `ceebf17` |
| 5 | Need offline confidence Walrus path actually works | infra | Wrote `frontend/scripts/walrus-roundtrip.mjs` — mirrors `useWalrusUpload` line-by-line but driven by an Ed25519 keypair. Verified 781 KB GLB + 4 KB random both round-trip byte-identical in 12.4 s. Quilt batching confirmed (same `blobObjectId` across patches). | `7c1fa14` |
| 6 | Collection name pre-filled "Neon Drift Series" on every visit | Forge UX | The plan-003 brainstorm example name leaked into `useState` default. Reset to empty; placeholder + `canMint` length check already gate the button. | `a76bbc6` |
| 7 | `/`, `/collection/<id>`, `/model/<id>` all show static ◇ glyph instead of model | preview UX | All 3 pages had hidden `<img>` tags pointing at GLB URLs (which `<img>` can't render). Comments labelled it "Phase 5 polish may render Babylon" — promoted now since user is actually browsing live mints. Each page swapped to per-tile `PreviewCanvas`. | `d155dff` |
| (additional) | Earlier session's `bdefe91` / `16c023c` / `b56b50d` etc. were the prior-session batch of similar live-testnet fixes. Same theme: vitest covers code shape, not API contract reality. | — | — | — |

### Live-testnet artifacts produced this session

```
Mint tx digest:    AZSBMxc2RcHTtBrPiKVRHaM3y7xEXCsStsoPsxE234nr   (Walrus quilt round-trip script)
Collection object: 0x38bad19ea39a007cca17311275d99f7a15994b18632a2938a5a7e296ee4925b4
Model3D variant:   0x46f248975df4c202d8950efa26d9892b3bf62e9764d39829cea2f4786ae86a58
Walrus blob:       OSRXKPVDiQhXzif8G11QsRjLXPX11Ul4c9sgWf7AAzM
Walrus blob obj:   0x92f8c97ffa12d8564be0f79177a31e07f8b7a6dc9242bf8d04f1020672f19ef7
Wallet (creator):  0x3116881ca3ebeb80f4ec82f1f11572d6341875d6c3f2cbeaf6990fb5723591ed (capy)
```

### Insights worth carrying forward

- **Vitest blind spots are systemic, not bug-of-the-day.** Every blocker this session was a contract mismatch between our code and a third-party SDK — and every one had tests that mocked the SDK with our wrong assumption baked in (`useWalrusUpload.test` mocked `executeRegister` shape; `ForgePage.test` mocked `useWalrusUpload` entirely; `PreviewCanvas.test` mocked Babylon's loader so the `blob:` URL extension issue couldn't fire). Captured CLAUDE.md note already says "type checking and test suites verify code correctness, not feature correctness." Reinforced 5x this session. **Action**: any new SDK adapter should ship with at least one integration test that hits the real SDK (or a recorded fixture), not a fully mocked one.
- **A Node-side round-trip script is a force multiplier.** `walrus-roundtrip.mjs` decouples Walrus debugging from React + wallet popups + Babylon. When a browser-side bug surfaces, we can split-test: does the Node script pass? If yes → bug is React/wallet-side; if no → bug is Walrus-side. Saved at least 2 wrong directions this session.
- **D-006 GLB-only assumption simplifies Babylon plumbing.** Unconditional `pluginExtension: '.glb'` is correct precisely because the decision is locked. Worth re-examining when v1.1 considers FBX/USDZ — the unconditional pattern would silently break.
- **WebGL context cap is going to bite on Browse/Collection pages.** Capped now via per-tile canvases that work fine ≤8 cards but degrade past that. Acceptable for v1 (variant cap is 16; marketplace card count is small in demo). Phase 5 fix: lazy-mount via IntersectionObserver, or generate static thumbnails at mint time.

### What still needs to happen for U7 dev verification (per D-026: capture deferred to Phase 5)

1. Mint a real **5-variant** collection via Forge on localhost-testnet (multi-variant flow not yet exercised live)
2. Switch to a **second wallet** (faucet ~5 SUI), click Buy Access on a variant — confirm tx succeeds
3. Open `/track` on wallet B, confirm the owned variant appears in the carousel and drives

Recording, Suiscan screenshots, and production URLs are explicitly **out of scope until Phase 5** (D-026 — record once against the final mainnet + Kiosk flow rather than re-record after every phase).

### Feature priorities going forward (per user direction 2026-05-17 PM)

User priority order: **complete all features first → deploy + record at the end.** Two ADRs landed this session capturing the resulting scope edits:

- **D-025**: drop the seed catalog. Live mints during demo recording are viable now that Turbo-v1.0 (D-024) brings prompt-mode to ~15s; the seed catalog mitigation no longer applies. Frees ~5–8 Tripo calls as recording-day buffer.
- **D-026**: defer production deploy + demo capture + traction signals to Phase 5. Avoids re-recording after Phase 4 mainnet redeploy + Kiosk integration. Project stays localhost-only until Phase 5.

**Remaining feature work (in priority order):**

1. **Phase 3 close**: U7 dev verification (5-variant mint + buy + drive on localhost-testnet) — small remaining lift, no recording
2. **Phase 4**: Sui Kiosk + TransferPolicy royalty integration (D-013 v1 must-have, zero LOC today — biggest unstarted risk)
3. **Phase 4**: Mainnet redeploy + network switcher in frontend
4. **Phase 4 Stretch A**: Seal encryption for `is_encrypted=true` models
5. **Phase 4 Stretch B**: Forensic watermark
6. **Phase 5**: Production deploy (Vercel + cloud VM), demo recording, Suiscan capture, DeepSurge submission, README polish, pitch deck slides, traction signals — all batched at the end

### Hackathon Tracker
- Days to submission (6/21): **35 of 38**
- Days to demo day (7/20–21): **64 of 67**
- Days to winners (8/27): **102 of 105**

---

## Phase 3 closeout (2026-05-16 PM) — kept for context

### Commits this session

```
d811870 refactor(router): drop AnthropicRouter; prompt mode dispatches to Tripo (D-023)
+1 docs(env) — Enoki vars documented in frontend/.env.example
b56b50d fix(dev): backend env loading + correct Sui testnet GraphQL endpoint
638b9c5 feat(frontend): U6 — /track Havok physics + WASD + chase camera
773feee feat(frontend): U5 — Browse grouping + /collection/:slug
80344ce feat(frontend): U4 — /forge + buildCollectionPtb
417474f feat(backend): U3 — POST /api/collection/build
73eb32f chore(phase-3): pre-stage shared types + route stubs (U3/U4/U5 parallel-batch prep)
0d0e0ab feat(deploy): U2 — publish model3d to testnet — Phase 3 contract live
0769617 feat(contract): U1 — Phase 3 Collection struct + N×variant mint flow
3ff78ee docs(adr): D-022 @babylonjs/havok adoption for Tiny Racetrack physics
cf26fb0 fix(walrus): spikes A+B+C — patch useWalrusUpload wiring; verify PTB chain shape
```

### ADRs landed this session

- **D-020** — Phase 3 demo pivot (Collection Forge + Tiny Racetrack)
- **D-021** — Walrus testnet dep subtree fix (one-line Move.toml change)
- **D-022** — `@babylonjs/havok` adoption for Tiny Racetrack rigid-body physics
- **D-023** — drop `AnthropicRouter`; prompt mode dispatches directly to Tripo (narrows D-011 + D-014)

### Sui testnet artifacts (live, verified)

```
PackageID:  0x18a480b3ff2219ac6666177221bafb37aa79a81122890581025b4737aef05ac3
UpgradeCap: 0x11b63b1f9a1677e20a6f7015416da8dde4e291b72ed7563cc5de2bf0268fd795
Deploy tx:  8gKrqemFVcAeBr3rifQurRDGuSF7pm2Yp44wXo15Kv5A
Gas used:   ~0.029 SUI on testnet
Deployed wallet (creator):
            0x3116881ca3ebeb80f4ec82f1f11572d6341875d6c3f2cbeaf6990fb5723591ed
Sui Scan:   https://suiscan.xyz/testnet/tx/8gKrqemFVcAeBr3rifQurRDGuSF7pm2Yp44wXo15Kv5A
```

### Plan-003 unit completion

| Unit | Status | Commit | Test delta |
|---|---|---|---|
| **Spike-A** useWalrusUpload wiring | ✅ PASS | `cf26fb0` | +1 regression test |
| **Spike-B** PTB chain shape (pattern b) | ✅ PASS | `cf26fb0` | +5 structural tests |
| **Spike-C** Walrus aggregator URL (outcome a) | ✅ PASS | docs only | n/a |
| **U1** Move Collection struct + entries | ✅ | `0769617` | Move 21 → 37 |
| **U2** Testnet deploy + Phase 2 regression smoke | ✅ | `0d0e0ab` | All 250 tests at deploy time |
| **U3** Backend material-swap endpoint | ✅ | `417474f` | Backend 113 → 130 |
| **U4** Forge page + buildCollectionPtb | ✅ | `80344ce` | Frontend 100 → 119 |
| **U5** Browse grouping + Collection detail | ✅ | `773feee` | Frontend 119 → 158 |
| **U6** Tiny Racetrack + Havok | ✅ R1 PASS (no fallback) | `638b9c5` | Frontend 158 (+20 in track/) |
| **U7** E2E + demo capture | ⏳ User-driven (manual) | — | n/a |

### Live-tested endpoints (post-D-023, current dev server state)

All 6 backend endpoints + 4 external services verified working via curl. See `docs/process.md` for the full endpoint matrix.

Two issues we discovered ONLY by running the live dev server (vitest had passed but missed both):
1. Backend died at startup with `JwtConfigError: JWT_SECRET must be set` — fixed in `b56b50d` by adding `--env-file=.env` to the `tsx watch` dev script + generating + documenting `backend/.env` template.
2. Browse "Failed to fetch" — `SUI_GRAPHQL_ENDPOINT` pointed at the deprecated + DNS-removed `sui-testnet.mystenlabs.com`. Replaced with `graphql.testnet.sui.io/graphql` per current Sui docs.

CLAUDE.md captures the underlying lesson: "type checking and test suites verify code correctness, not feature correctness — if you can't test the UI, say so explicitly rather than claiming success." Failed to honour that twice this session; ChatGPT-equivalent learnings captured in process doc.

### Insights worth carrying forward

- **Pre-flight spikes pattern works.** Three 30-min spikes (R7/R8/R9) all landed PASS verdicts BEFORE U1 dispatched — saved ABI churn that would have wasted ~1 day if we'd discovered them mid-U1.
- **D-023 lesson** (LLM router as decorative-for-committed-flow-UX): when the user-facing surface has already pre-committed to a generator choice, an LLM "deciding which generator" call is decorative — pay the latency + cost + failure-mode tax for zero signal. Reusable for any AI-routed app: ask "is the routing decision actually open at this UX surface?" before integrating an LLM router.
- **Worktree isolation false-negative.** `Agent isolation: "worktree"` failed for this repo with `Cannot create agent worktree: not in a git repository`, despite the repo being a real one. Fell back to shared-directory mode + pre-staging shared files (commit `73eb32f`) to avoid collisions. Worked cleanly. Worth filing this with the harness team — the git-detection has a false-negative case.
- **Parallel-batch with pre-staging.** Even without worktree isolation, U3+U4+U5 parallel-dispatched successfully by pre-staging shared files (`shared/src/types.ts`, route stubs in `App.tsx`) so each subagent had clean isolated file ownership. Pattern worth re-using.
- **Subagent dispatch tight-reads pattern held up.** All 4 U-units (U3/U4/U5/U6) used inline skeletons + 5-8 file read lists per the captured 2026-05-15 learning. Zero subagent OOM'd at 40-50K tokens this round — Phase 2's failure mode didn't reappear.

### Hackathon Tracker
- Days to submission (6/21): **37 of 38**
- Days to demo day (7/20–21): **66 of 67**
- Days to winners (8/27): **104 of 105**

---

## Pre-Phase-3 history (prior sessions, kept for context)

## Original log header (kept for history):

## ~2026-05-16 AM Snapshot~ — Plan-003 written, doc-reviewed (headless), 9 P0+P1 fixes walkthrough applied. **Ready for `/ce-work`.** Plan file: `docs/plans/2026-05-15-003-feat-phase-3-collection-forge-plan.md`. 3 pre-flight spikes (A/B/C) documented in plan's Risks & Dependencies section — they run before U1. Branch `feat/phase-2-sui-integration` carries uncommitted docs (D-020, D-021, brainstorm, plan, Move.toml fix, phase-progress, solutions update) — recommend committing before `/ce-work` dispatches.

### Hackathon Tracker
- Days to submission (6/21): **37 of 38**
- Days to demo day (7/20–21): **66 of 67**
- Days to winners (8/27): **104 of 105**

### Current Phase
**Phase 2: Sui Integration — CODE COMPLETE 2026-05-15.** 10 units shipped on `feat/phase-2-sui-integration` branch (17 commits since `main`); 104 backend + 91 frontend + 21 Move tests all green. Two operational blockers before merge to `main`:
1. **Testnet deploy** — Walrus + WAL `published-at` dep linking unresolved (3 paths documented in `contracts/model3d/Move.toml`). Phase 2 code is testnet-ready; just need the deploy step.
2. **Live e2e smoke** — depends on deploy; will produce real `MODEL3D_PACKAGE_ID` and demo screenshots.

Next: **Phase 3 — Real-World Application** (5/30 – 6/10 per `docs/spec.md` §6); see Notes.

See `docs/spec.md` §6 for full 5-phase plan.

### Completed This Session

**Pre-Phase 1 (prior sessions)**:
- Pre-work research: Walrus + Seal deep dive, Sui Overflow 2026 handbook verification, SDK landscape (2026-05-08 release train), Tripo competitive analysis, industry pain points
- Architecture: Composable Creator Economy / Programmable IP Layer (D-001), 3-tier `Model3D + Access + Derivative` (D-002), policy modes (D-003), royalty cap (D-004), snapshot immutability (D-005)
- Tech stack locks: GLB only (D-006), drop react-babylonjs (D-007), @mysten/* pinned (D-008), Walrus upload relay (D-010)
- Strategy: testnet submission, mainnet by 8/27 (D-009)
- Office-hours session (D-011): agentic framing pivot — LLM router orchestrates procedural + Tripo generators; lineage on Walrus
- Office-hours session (D-012): TS unified across browser + server; drop Go; `@gltf-transform/core` + Hono + Node 22 LTS
- Office-hours session (D-013): v1 scope refocus — cut L2 Derivative, promote Kiosk to v1 must-have, framing narrows to 5 Sui+Walrus exclusive selling points

**Phase 1 (this session)**:
- Phase 1 plan `docs/plans/2026-05-14-001-feat-phase-1-scaffold-plan.md` (Lightweight depth, 5 units, ~5 days estimate)
- Local env: Node 22.22.3 installed via nvm, locked via `.nvmrc`; pnpm 8.14.1 (Homebrew) used for workspace
- **U1 — Monorepo skeleton**: root `package.json` + `pnpm-workspace.yaml` + `tsconfig.base.json` + `.editorconfig` + 6 top-level dirs. `pnpm install` clean
- **U2 — `shared/`**: `@overflow2026/shared` workspace with `GenerateParams` (discriminated union), `LineageRecord`, `Generator`, `Router`, `ShapeCatalog`. Builds clean
- **U3 — `backend/`**: Hono on `:3001`, 4 procedural generators (box / chest / cylinder / sphere) via `@gltf-transform/core`, `HardcodedRouter` stub behind `Router` interface, zod-validated `POST /api/generate` + `GET /api/preview/:id` + `GET /api/shapes`. **26/26 unit + route tests green**. Live e2e verified: GLB magic `glTF`, 864 B for a 1×1×1 box
- **U4 — `frontend/`**: Vite + React 19 + imperative Babylon wrapper (per D-007 — no `react-babylonjs`), shape picker with dynamic sliders, `Generate` button, Vite proxy `/api` → backend. **6/6 component tests green** (Babylon mocked for jsdom). Live proxy round-trip verified via curl
- **U5 — E2E + docs**: root `pnpm dev` brings both servers up in parallel; README updated with `Run locally (Phase 1)` section + Stack corrections (Go → Node, missed in earlier README pass); this phase-progress update; Phase 1 dev loop confirmed working
- **Post-implementation review** (`/review` skill): scope clean, 7 findings. Applied 2 [P2] fixes: schema ranges aligned to catalog ranges (`backend/src/lib/schema.ts`) + 2 boundary tests added (`width: -1` → 400, `width: 99` → 400)
- **Real-browser smoke** (D-007 / Plan Risk row 3 mitigation): opened `:5173` in browser, exercised all 4 shapes. **Found: cylinder appeared hollow.** Root cause: top + bottom cap fan winding was CW (faces pointing inward), back-face culled → user saw through the caps. Fix in `backend/src/generators/cylinder.ts:54-64` (swap last two indices on each cap fan) + 2 regression tests (`top cap triangles face +Y`, `bottom cap triangles face -Y`). Tests now catch any future cap-winding regression on cylinder. Other 3 shapes verified visually correct.

### Phase 2 Code Closeout (2026-05-15)

- **Branch**: `feat/phase-2-sui-integration` (17 commits since `main`)
- **Plan**: `docs/plans/2026-05-14-002-feat-phase-2-sui-integration-plan.md` — 10 units, Deep depth. 6-persona doc review applied (6 P1 patches + cross-persona escalations landed before dispatch).
- **ADRs landed**: D-015 (Model3D tags + lineage_blob_id), D-016 (publish_and_share + purchase_model_access + duration_ms + Phase 4 Kiosk caveat), D-017 (react-router-dom@7.5.x), D-018 (Move input bound assertions), D-019 (SuiClient → SuiJsonRpcClient split). Spec §2.5 + §2.8 amended.
- **OQs**: OQ-004 RESOLVED by U4 (dapp-kit 1.0 is a single package, no -core/-react split; real import paths captured). OQ-013 (Phase 4 Kiosk coexistence) added — defer to Phase 4 ADR. OQ-014 RESOLVED by U3 (writeFilesFlow quilts N files into one blob → 2 popups regardless of file count).

#### Units shipped (commit hashes)

| Unit | Commit | Adds | Tests |
|---|---|---|---|
| U1 | `3fa0f1e` | API refactor — inline GLB bytes + lineage in `POST /api/generate` response; drop `/api/preview/:id` + `backend/tmp/` | backend 26 → 31, frontend 6 |
| U2 | `fbea2d3` | Move contract `model3d::model3d` — L1 + Access + tags + lineage_blob_id + D-018 input assertions | Move 21 |
| U10 | `b832137` | sword/hammer/platform procedural generators + normal-direction tests | backend 31 → 62 |
| U3 | `3004f2a` | Walrus frontend — `getWalrusClient`, `useWalrusUpload` driving writeFilesFlow + relay | frontend 6 → 17 |
| U5 | `7064f28` | AnthropicRouter — tool-use structured output + zod, `paramRanges` single-source-of-truth, `HardcodedRouter` fallback | backend 62 → 72 |
| U4 | `ff73b01` | Auth — dApp Kit + Enoki + Slush + signed-challenge JWT (flag-byte scheme dispatch) | backend 72 → 89, frontend 17 → 29 |
| U6 | `20b9c54` + `42d345d` | TripoGenerator — async polling client (Tripo P1 v2/openapi); env-gated; server.ts wiring | backend 89 → 104 |
| U8 | `5a79d64` | Browse marketplace — Sui GraphQL indexer + grid + BrowserRouter shell; `Model3DSummary` type | frontend 29 → 42 |
| U7 | `ed01a1b` | Creator e2e — CreatorFlow + PromptInput + NameInput + MintButton (Step X of 3) + publishPtb + BCS LicenseTerms snapshot | frontend 42 → 67 |
| U9 | `ce626e1` | Buyer e2e — ModelDetailPage + BuyAccessButton + purchaseAccessPtb + useModelById + useOwnsAccess (DL-009 guard) | frontend 67 → 91 |

**Final test counts: backend 104, frontend 91, Move 21 = 216 total tests, all green.**

### Phase 2 Knowledge Capture (2026-05-15 PM)

Eight `docs/solutions/` entries written via 8 sequential `/ce-compound` lightweight passes — captures Phase 2's non-obvious learnings while context is fresh, so future Phase 3+ sessions (and `ce-learnings-researcher`) inherit them:

| # | Doc | Category | Why it's worth capturing |
|---|---|---|---|
| 1 | `sui-ptb-struct-arg-pitfall-2026-05-15.md` (prior session) | integration-issues | P0 PTB struct-as-`vector<u8>` bug — `dryRunTransactionBlock` test rule |
| 2 | `walrus-wal-published-at-deploy-block-2026-05-15.md` | integration-issues | The current testnet deploy block + 3 documented resolution paths |
| 3 | `mysten-sui-client-split-jsonrpc-grpc-2026-05-15.md` | tooling-decisions | D-019 — `SuiClient` → `SuiJsonRpcClient`/`SuiGrpcClient` migration |
| 4 | `walrus-writefilesflow-popup-batching-2026-05-15.md` | architecture-patterns | OQ-014 — N files = 2 popups via quilt batching |
| 5 | `param-ranges-single-source-of-truth-2026-05-15.md` | design-patterns | R14 — `paramRanges` shared by zod + catalog + RouterDecisionSchema |
| 6 | `cors-is-browser-only-cost-bearing-endpoints-need-server-auth-2026-05-15.md` | best-practices | P0 #2 — CORS doesn't gate `curl` against metered upstreams |
| 7 | `in-memory-nonce-store-needs-explicit-ttl-sweep-2026-05-15.md` | best-practices | Parked P1 — lazy-delete leaks abandoned nonces |
| 8 | `subagent-dispatch-tight-reads-inline-skeletons-2026-05-15.md` | conventions | Compound-engineering workflow learning: broad-read subagents die at 40-50K |

CLAUDE.md project-structure tree already references `docs/solutions/` (added with the first capture). All 8 docs are now discoverable to `ce-learnings-researcher` runs starting Phase 3.

### Phase 2 Polish Batch (2026-05-15 late PM, commit `48a480e`)

5 P1/P2 mechanical fixes from the code-review batch (the user picked "Demo-risk + mechanical (Recommended)"):

| # | Fix | Files | Tests added |
|---|---|---|---|
| 1 | **MintButton dead-branch step labels** — replaced unreachable `popupCount === 0/1` branches with reactive `uploadStage` from `useWalrusUpload`. Walrus stages (`awaiting-register` / `relay-upload` / `awaiting-certify`) now drive accurate Step 1/2 of 3 labels. | `useWalrusUpload.ts`, `MintButton.tsx`, `CreatorFlow.tsx` | +3 (uploadStage coverage) |
| 2 | **Tripo per-request timeout** — `TripoClient.submitTask` / each `pollTask` fetch / `downloadGlb` now ride `AbortSignal.timeout(30s)`. A hung TCP connection no longer outlives `pollTask` `maxWaitMs`. AbortError surfaces as `TripoTimeoutError`. | `tripo-client.ts` | +3 (per-fetch AbortError → TimeoutError) |
| 3 | **JWT verify zod-parse** — replaced `as unknown as SessionClaims` with `SessionClaimsSchema` (zod) parse. New `JwtMalformedError` class. Forged-but-validly-signed malformed payloads now reject loudly. | `jwt.ts`, `auth.test.ts` | +2 (missing sub, non-Sui-address sub) |
| 4 | **Schema drift consolidation** — exported `boxParamsSchema`...`platformParamsSchema` + `proceduralParamsSchemas` array from shared. Backend's `generateParamsSchema` now composes from the shared array. Single authoring site. | `shared/src/types.ts`, `backend/src/lib/schema.ts` | (no new tests; existing pass) |
| 5 | **Nonce TTL sweep** — `createInMemoryNonceStore` now runs `setInterval`-based eviction (unref'd) instead of relying on lazy delete-on-read. New `stopSweep()` on `NonceStore`. Existing expired-nonce test cleaned up. | `auth.ts`, `auth.test.ts` | +1 (sweep evicts expired) |

**Final test counts after polish: backend 113, frontend 94, Move 21 = 228 total tests, all green.** Branch state: 24 commits since `main`.

### Phase 2 Deploy Investigation (2026-05-15 late PM)

Investigated path (c) "MVR / Sui CLI re-check" per the user's preference for lowest-friction path. **Result: path (c) fully blocked.**

- **Sui CLI 1.72.1** is the latest release on `MystenLabs/sui` (verified via WebFetch of GitHub releases). No 1.72.2+ exists.
- **`sui client publish --help`** does not include any flag to assert "this dep is already published at X" from the consumer side. The `--with-unpublished-dependencies` flag does the wrong thing (would publish our own copy of Walrus, not reference the deployed one). `--pubfile-path` is for compilation, not deploy.
- **MVR alias syntax** (`Walrus = { mvr = "@walrus/core" }`) is rejected by CLI 1.72.1 — `mvr` key not wired into the manifest parser at all.
- **Walrus upstream Move.toml** (`MystenLabs/walrus@testnet`) still declares `walrus = "0x0"` with no `[package] published-at`. Same for the transitive `wal` package (`wal = "0x0"`). Mysten has not added it.

Verdict: the deploy block is real and requires **path (a) fork** or **path (b) local-clone + patch**. Estimated 10-30 min of mechanical work; can be done anytime before 6/21 submission. **Phase 3 onward does NOT depend on deploy** — the contract code is correct and tested, only the on-chain instantiation is parked.

### 🚧 Blocking issues for `main` merge

1. ~~**Testnet deploy**~~ — ✅ **RESOLVED 2026-05-15 PM (D-021)**. The block was a wrong-subtree diagnosis: `contracts/walrus@testnet` is the source tree, deployed artifact lives at `testnet-contracts/walrus@main` with `Published.toml`. `Move.toml` fixed; `sui client publish --dry-run` reports `execution status: success`. Real publish deferred until Phase 3's Move contract change is ready (avoids 2 redeploys). See D-021 + `docs/solutions/integration-issues/walrus-wal-published-at-deploy-block-2026-05-15.md` (resolution header).
2. **Live e2e on testnet** — Once Phase 3 Move contract change lands and real publish executes, run two-wallet smoke: Wallet A (active address `0x3116...91ed`) mints a 16-variant car collection via `/forge`; Wallet B (new keypair) browses, buys variant Access, opens `/track` and drives it. Capture tx hashes + Sui Explorer screenshots for pitch deck.

### Next concrete step

**Phase 3 demo shape locked**: Collection Forge + Tiny Racetrack (Car + Racing). D-020 strategy + D-021 deploy unblocking both applied. Brainstorm doc final: `docs/brainstorms/2026-05-15-collection-forge-requirements.md`.

All 6 brainstorm OQs resolved 2026-05-15 PM:

| OQ | Decision |
|---|---|
| OQ-D1 | **Car** (Tripo: 1 base car + N paint variants via material swap, ~60-120 credits per collection — large headroom on free tier) |
| OQ-D2 | Path A dead (SDK source read); quilt = 1 Sui Blob; Move change required |
| OQ-D3 | Variant cap **16** |
| OQ-D4 | **Texture + color** (8 curated textures bundled + RGB picker per variant) |
| OQ-D5 | Tiny Racetrack **L2 driveable, minimum-viable scope** (WASD + Havok physics + bounded oval; no opponents, no timer, no SFX, no wheel spin) |
| OQ-D6 | **B.ii** — Collection wrapper + N Model3D objects (each variant is its own NFT; Phase 2 frontend mostly reusable) |

**→ Next action: run `/ce-plan`** with brainstorm doc as origin, depth = **Standard**, target ~6-8 build days. Plan-003 must cover:

- Move contract change: new `Collection` struct + `publish_collection` entry + `mint_variant` entry. Move test additions ~10 new tests on top of existing 21.
- Testnet redeploy via D-021 path (`sui client publish --gas-budget 200000000` — drop `--dry-run`), produces real `MODEL3D_PACKAGE_ID`.
- Backend `POST /api/collection/build` — accepts base GLB + N variant specs, returns N GLBs via `@gltf-transform/core` material swap.
- Frontend Collection Forge page (variant editor + curated 8-texture library + 3-popup mint flow).
- Frontend Browse adjustment: group by collection.
- Frontend Tiny Racetrack page (Babylon scene + Havok rigid-body + WASD + chase camera + procedural oval track mesh).
- E2E smoke test on testnet with two wallets.

Parallel tracks (don't gate on plan-003):
- **(Phase 3 parallel)** Seed catalog: generate 5-8 hero collections (mix of car + sword/hammer for procedural-path coverage) for wider marketplace demo content.
- **(Phase 4)** Kiosk + TransferPolicy ADR needed before plan-004 (resolves OQ-013, target ~6/11).
- **(Phase 5)** Pitch deck + demo video — Forge + Racetrack 90-sec arc is the centerpiece.

**Time budget:** 37 days to submission (6/21). Phase 2 shipped 8 days ahead of its 5/29 deadline; Phase 3 brainstorm + 2 ADRs (D-020, D-021) all landed today. Healthy buffer for Phase 5 polish.

### Notes for next session

- Phase 2 was a 38-day-budget sprint; we shipped in **2 calendar days** (2026-05-14 → 2026-05-15). That's ~8 days ahead of the 5/29 Phase 2 deadline per spec §6. Buffer goes to Phase 5 pitch deck + demo video polish per user preference.
- Subagent dispatch pattern that worked: **inline code skeletons + tight 3-6 file read list + explicit "don't touch X" lists**. The pattern that failed: broad "read whatever you need" prompts (3 subagents died at 40-50K tokens mid-investigation; one rate-limited on Anthropic API).
- Phase 4 Kiosk decision (OQ-013) needs to happen before Phase 4 starts (~6/11). Phase 2 used `share_object(Model3D)` per D-016 which has the bifurcation caveat (shared Model3Ds can't be retroactively placed in Kiosks).
- Backend has graceful fallback for missing `ANTHROPIC_API_KEY` (HardcodedRouter takes over). For Phase 5 demo, set the env var so prompt-mode works.
- `useOwnsAccess` (U9) silently returns false on GraphQL errors — pessimistic default. Acceptable for v1 since Move-level doesn't prevent duplicate Access.

### Next Concrete Step
**Dispatch /ce-work on the Phase 2 plan.** The 9 units have meaningful parallelism: U1 (API refactor), U2 (Move contract), U3 (Walrus), U4 (Auth), U5 (AnthropicRouter), U6 (TripoGenerator), U10 (3 procedural generators) are mostly independent and can dispatch in parallel via worktree-isolated subagents. U7 (Creator e2e), U8 (Browse), U9 (Buyer e2e) are integration units and run sequentially after foundations land.

Original sequencing reference per `docs/spec.md §6 Phase 2`:

Sequencing per `docs/spec.md` §6 Phase 2:
1. **Move contract** — `model3d::model3d` package in `contracts/`. Reference `SharedBlob` pattern from `@mysten/walrus`. **D-014**: add `tags: vector<String>` field on `Model3D`. Local `sui move test` for mint/extend/burn. Deploy to testnet, record `MODEL3D_PACKAGE_ID`
2. **Walrus** — wire `@mysten/walrus@1.1.7` + `@mysten/walrus-wasm@0.2.2` in frontend, Vite WASM config, upload relay endpoint in backend, `writeFilesFlow` upload from browser
3. **Auth** — dApp Kit 1.0 + Enoki Google zkLogin + Slush wallet; backend verifies signed challenge → Sui address, JWT session
4. **LLM router (D-011)** — replace `HardcodedRouter` with `AnthropicRouter` using `@anthropic-ai/sdk` + structured output + zod schema. Cost ~$0.001/call (Haiku). Keep `Router` interface unchanged so frontend code does not refactor. **D-014**: LLM also extracts tags from prompt
5. **`TripoGenerator` (D-014, from D-011 Phase 3 → Phase 2)** — `backend/src/generators/tripo.ts` implements `Generator` interface. Async polling client. Fixed params: P1 model, `face_limit=5000`, `texture=false`. Used in seed phase only; demo观众不直接呼叫
6. **Lineage on Walrus (D-011)** — backend writes `lineage.json` blob alongside GLB per generation (prompt, LLM decision trace, params, generator source)
7. **End-to-end creator flow** — type → LLM route → procedural/Tripo generate → preview → Walrus upload → PTB `model3d::mint(tags)` → testnet wallet shows Model3D NFT
8. **Browse marketplace (D-014)** — Sui indexer query for all `Model3D` on testnet; frontend `/` Browse page with grid + Walrus aggregator preview + Buy Access flow; frontend `/generate` becomes secondary route
9. **End-to-end buyer flow (D-014)** — Browse → click card → Connect Wallet → Buy Access → wallet shows soulbound `Access`
10. **Generator catalog expansion** — add sword / hammer / platform procedural generators (total 7 procedural shapes)

### Blockers / Open Questions
See `docs/open-questions.md`. None block Phase 2 start. Open follow-ups:
- Anthropic API budget tracking (Haiku ~$0.001/call; demo budget ~$0.10 — not material)
- **D-014a Phase 3 game scene form factor** (G1/G2/G3) — decide at end of Phase 2 (~5/29) once catalog content is known. See OQ-011
- **OQ-012 catalog search** — v1 ships browse + tag filter only; semantic search v1.1+
- **Tripo free tier budget** — 300 credits/month × 2 months (May+June) = 6-10 P1 calls total. Reserve for Phase 3 seed catalog (5-8 hero models). Do not burn on Phase 2 testing — use `texture=false` (60 credits/call) or fewer test calls

### Notes for Next Session
- **Phase 1 invariants to preserve in Phase 2**:
  - `Router` interface in `shared/src/types.ts` is the seam — Phase 2's `AnthropicRouter` must implement it; frontend `lib/api.ts` and Hono route handlers should not change
  - `Generator` interface is the second seam — Phase 3's optional `TripoGenerator` slots in here
  - `LineageRecord` is the third seam — Phase 2 fills `prompt` and `llmDecision`, Phase 3 may flip `generatorSource` to `'tripo'`
- Backend GLB store is currently `backend/tmp/<uuid>.glb` (local disk). Phase 2 replaces with Walrus upload — `backend/tmp/` writes can be kept as a transient staging area before Walrus PUT, or dropped entirely if frontend uploads directly via upload relay
- Per D-013: Kiosk + TransferPolicy is v1 must-have (Phase 4), L2 Derivative is v1.1 deferred (preserve `Derivative` / `DerivativeApproval` Move structs in `spec.md §2.8` but do not implement in v1)
- User stated preference: **finish early, more time for pitch deck + demo video polish**. Bias toward compressing Phase 1–4, expanding Phase 5
- All 14 ADRs (D-001 ... D-014) in `docs/decisions.md` — do not reopen without prompting. **D-014 reframes Tripo to "creator's optional self-paid tool" + demo to "browse-first marketplace"** — the previous mental model of "every user types prompt → service generates" is wrong now
- Frontend TS pin is `~5.8.0` (matches Vite scaffold's `erasableSyntaxOnly` requirement); backend + shared are on `~5.5.0`. Not unified yet — bump when convenient
- `vite.config.ts` and `vitest.config.ts` are split intentionally — Vitest 2.x's bundled Vite 5 types conflict with Vite 8's `server.proxy`. Don't merge them back without a Vitest 3 upgrade
- **Procedural mesh testing lesson (Phase 1 cylinder bug)**: vertex-count + triangle-count assertions are NOT enough. They pass while winding is inverted — only browser rendering reveals it. **For every new generator added in Phase 2+, write a normal-direction test for at least one representative triangle per face/cap.** See `backend/src/generators/cylinder.test.ts:triNormalY` for the helper pattern; Phase 2 generators (sword, hammer, platform) should each carry equivalents
- v2+ vision (post-hackathon): full Composable Creator Economy / Programmable IP Layer (D-001 vision) once L2 PMF validated
