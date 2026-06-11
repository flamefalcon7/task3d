---
title: "feat: MCP agent interface for Tusk3D (read tools + on-chain purchase + client-side Seal decrypt)"
type: feat
date: 2026-06-10
status: ready
depth: deep
origin: docs/brainstorms/2026-06-10-agent-interface-research.md
decision: D-104
phase: Phase 4 — feature/UX polish
---

# feat: MCP agent interface for Tusk3D

> **Origin:** `docs/brainstorms/2026-06-10-agent-interface-research.md` (see §6a Resolution). **ADR:** D-104.
> Scope locked with the user: **v0 + v1 full**, payment rail = native Sui Move, **client-side Seal decrypt (pattern a)**, all tools behind a lightweight JWT, shared builders lifted to `shared/`.

## Summary

Mount a **thin, stateless MCP server** on the existing Hono backend (`@modelcontextprotocol/sdk` Streamable HTTP, `WebStandardStreamableHTTPServerTransport` + `c.req.raw`, new `app.route('/mcp', …)`), exposing Tusk3D content to AI agents as a **third user class**. Six tools: four read-only (`search_models`, `get_model`, `get_license_terms`, `get_preview`) and two transaction-path (`build_purchase_tx` returns an **unsigned** `purchase_access` PTB the agent self-signs; `download_content` returns the **material for the agent to decrypt locally**). The server **never holds agent keys and never touches plaintext content or AES keys** — preserving the audit W-9 invariant. The hero demo runs in **Claude Code**: one human prompt → agent searches (MemWal recall) → reads `LicenseTerms` and rejects an over-budget candidate → buys on testnet with its own keypair → soulbound `AccessEntitlement` appears live → agent decrypts the GLB locally into `samples/` → creator balance ticks up.

---

## Problem Frame

Content got API-ified; content **commerce** didn't. AI agents can write a game's code but can't acquire assets: no credit card (payment gap), fuzzy human-language licenses they can't reason over (license gap), and rot-prone delivery (delivery gap). Tusk3D already solves all three on-chain — structured `LicenseTerms`, soulbound `AccessEntitlement` receipts, hash-addressed Walrus content — but only a browser app can reach them today. An MCP interface exposes the **existing** Move economy to any agent: the contract never cared whether the buyer is human.

**Why now:** Walrus Memory launched 2026-06-03 with MCP connectors — an MCP interface puts Tusk3D in the exact idiom Mysten is promoting, three weeks before the 6/21 submission. Both pre-implementation risks were verified clear against the codebase (origin §6a): **no contract change is required.**

---

## Requirements Traceability

| Req | From origin | Advanced by |
|---|---|---|
| R1 — MCP server mounted on existing Hono, Streamable HTTP, same Node process | §TL;DR, §3 | U2 |
| R2 — `search_models` wraps MemWal semantic recall | §3 v0 | U4 |
| R3 — `get_model` / `get_license_terms` / `get_preview` read-only projections | §3 v0 | U4 |
| R4 — `build_purchase_tx` returns **unsigned** `purchase_access` PTB; agent signs; server keyless | §3 v1, §6a | U3, U5 |
| R5 — `download_content` gated on on-chain `AccessEntitlement`; **client-side** Seal decrypt (pattern a) | §6a Resolution | U6, U7 |
| R6 — server never holds keys, never touches plaintext/AES key (W-9 preserved) | §6a, §4 | U5, U6 |
| R7 — read tools cost-protected (auth + rate limit), MCP does **not** expose Tripo generation | §3 guardrails | U3, U4 |
| R8 — `/llms.txt` manifest advertising the MCP endpoint | §2 (F garnish) | U8 |
| R9 — demo arc runnable in Claude Code (search → reject → buy → decrypt → samples/) | §7 | U7 (+ all) |
| PRE — confirm live testnet package is the **D-085-republished** build before Seal-dependent demo | §6a precheck | U0 |

---

## Key Technical Decisions

**KTD-1 — Stateless WebStandard transport, mounted in-process.** Use `@modelcontextprotocol/sdk@^1.29.0` `WebStandardStreamableHTTPServerTransport` consuming `c.req.raw` and returning a Fetch `Response`; **stateless mode** (fresh `McpServer` + transport per request, per the SDK's documented reuse warning). Tools are request/response RPCs with no server-push, so stateless avoids the session-map bookkeeping and is horizontally scalable. Mount as `app.route('/mcp', buildMcpRoute(deps))` alongside existing sub-apps; CORS scoped to `/mcp` (expose `mcp-session-id`, `mcp-protocol-version`). *Rejected: stateful sessions (unneeded), separate Node process (no benefit, more ops).*

**KTD-2 — `download_content` decrypts client-side (pattern a).** The tool returns `{ ciphertextUrl, sealedKey, sealApprove: { modelId, entitlementId } }`; the agent finishes decryption locally with its own keypair. This **mirrors the existing frontend architecture** (ciphertext flows aggregator→client, client decrypts with the user account — backend never in the decrypt data path) and **preserves audit W-9** (backend never touches the plaintext AES key) — itself a pitch asset for a decentralized-storage submission ("even our own server can't read your content"). *Rejected: server-side decrypt (pattern b) — maximizes stock-no-code-client portability but breaks W-9 and adds server data-path load; captured as Alternatives / roadmap for stock Claude Desktop.*

**KTD-3 — Demo client = Claude Code.** Pattern (a) requires client-side code execution to run Seal. Claude Code has native Bash/Write, so it runs the local decrypt helper (U7) directly — no extra install. Stock Claude Desktop would need a local stdio decrypt tool installed; that's out of scope for the demo (roadmap).

**KTD-4 — Lightweight JWT on every tool, no payment.** MemWal recall derives its namespace from the JWT `sub` and is cost-amplifying (learnings: cost-bearing endpoints MUST sit behind a server-verifiable credential — CORS protects nothing for non-browser clients). The agent does the existing `/auth/challenge` + `/verify` handshake once (signs a nonce with its keypair, **no payment**) to get a JWT, then sends it as `Bearer` on every tool. Read tools stay "free" (just a signature) while satisfying namespace derivation + per-address rate limiting. *Rejected: fully unauthenticated global search — loses namespace + invites cost-amplification abuse.*

**KTD-5 — Lift shared builders into `shared/`.** `buildPurchaseAccessPtb` + `PurchaseAccessArgs` and `jsonToSummary` are pure, isomorphic functions living in `frontend/` today. Lift both into `shared/` (parameterize the package id instead of importing frontend `TESTNET`) so the MCP route and the frontend share one copy. *Rejected: copy into backend — guaranteed drift on a contract-shaped surface.*

**KTD-6 — Entitlement gate reads fullnode by-id, fail-closed.** `download_content`'s on-chain precondition reuses the `capVerifier.ts` pattern verbatim: `getSuiClient().getObject({ id: entitlementId, options:{ showContent, showOwner, showType } })`, assert type `::model3d::AccessEntitlement`, `owner.AddressOwner === jwt.sub`, and the entitlement's bound `model_id === requested modelId`; any RPC error → deny. Use **fullnode `getObject` by-id** (not GraphQL — indexer lag would false-negative right after the agent's purchase commits). Mirror the Move gate's `seal_id` length invariant (== 32, audit C-1 / D-085) when assembling `sealApprove` material.

**KTD-7 — `build_purchase_tx` dry-runs before returning.** Build the PTB via the shared builder, then `client.dryRunTransactionBlock(tx)` to validate (learnings: never validate a PTB by string-matching serialized JSON). Return BCS bytes (b64) of the unsigned tx; the agent sets sender + signs. Server never holds the key (Ed25519Keypair is itself the Signer on the agent side — no wrapper).

---

## High-Level Technical Design

End-to-end agent purchase + client-side decrypt arc. The MCP server (backend) only ever reads chain state and returns material; **signing and decryption happen on the agent side**; ciphertext flows aggregator→agent, never through the backend.

```mermaid
sequenceDiagram
    participant A as Agent (Claude Code, owns keypair)
    participant M as Tusk3D MCP server (/mcp, Hono)
    participant S as Sui (fullnode JSON-RPC)
    participant K as Seal key servers (2-of-2)
    participant W as Walrus aggregator (CDN)

    Note over A,M: one-time: /auth/challenge + /verify → JWT (sign nonce, no payment)
    A->>M: search_models(query)  [Bearer JWT]
    M->>M: MemWal recall (namespace = jwt.sub)
    M-->>A: candidates [{modelId, distance}]
    A->>M: get_license_terms(modelId)
    M->>S: getObject(model)
    M-->>A: {accessFee, derivativeMintFee, royaltyBps, policy}
    Note over A: reasons over terms, REJECTS over-budget candidate
    A->>M: build_purchase_tx(modelId, agentAddress)
    M->>S: read accessFee; build purchase_access PTB; dryRun
    M-->>A: unsigned PTB bytes (b64)
    A->>A: sign with own keypair
    A->>S: execute → AccessEntitlement (soulbound) minted to agent
    A->>M: download_content(modelId, entitlementId)  [Bearer JWT]
    M->>S: getObject(entitlement) — assert type+owner==sub+model_id (fail-closed)
    M->>S: getObject(model) — read sealed_key
    M-->>A: {ciphertextUrl, sealedKey, sealApprove:{modelId, entitlementId}}
    A->>A: SessionKey.create + sign personal message (own keypair)
    A->>K: SealClient.decrypt (seal_approve_entitlement dry-run → key shares)
    A->>W: fetch ciphertext
    A->>A: AES-256-GCM decrypt → plaintext GLB → write samples/
    Note over M: backend never saw the AES key or plaintext (W-9 preserved)
```

---

## Output Structure

New backend MCP surface + a client-side helper. Builders move into `shared/`.

```
shared/src/
  sui/purchaseAccessPtb.ts      # lifted from frontend (parameterized pkg id)
  model/jsonToSummary.ts        # lifted from frontend
backend/src/
  mcp/
    route.ts                    # buildMcpRoute(deps): Hono sub-app, stateless transport
    server.ts                   # McpServer factory + registerTool wiring
    tools/
      searchModels.ts
      getModel.ts
      getLicenseTerms.ts
      getPreview.ts
      buildPurchaseTx.ts
      downloadContent.ts
    auth.ts                     # bearer→sub helper (mirrors memory.ts bindNamespace) + rate limit
    *.test.ts
  routes/llms.ts                # static /llms.txt
scripts/
  agent-decrypt.ts              # client-side decrypt helper (U7), agent-run in Claude Code
```

---

## Scope Boundaries

**In scope:** the six MCP tools, lightweight JWT reuse, `/llms.txt`, the client-side decrypt helper, the D-085 republish precheck, the Claude-Code demo path.

### Deferred to Follow-Up Work
- **Server-side decrypt (pattern b) + stock Claude Desktop one-click delivery** — roadmap; would need a local stdio decrypt tool or the W-9 tradeoff.
- **x402 metering** for off-chain cost (e.g. Tripo generation) — roadmap mention only (origin §4).
- **`llms-full.txt`** expanded tool catalog — `/llms.txt` index is enough for v1.
- **Stateful MCP sessions / server-push notifications / resumable streams** — only if a future tool needs them.
- **gRPC migration** — backend stays on `SuiJsonRpcClient` (D-019); do not introduce `SuiGrpcClient` only in the MCP route.

### Outside this product's identity
- MCP does **not** expose Tripo generation or any LLM-cost-bearing capability for free (origin §3 guardrail). The existing JWT gate on `/api/generate` is untouched.

---

## Implementation Units

### U0. Precheck — confirm live testnet package is the D-085-republished build
**Goal:** Verify the deployed testnet `model3d` package includes the C-1 fix (`seal_approve_entitlement` asserts `seal_id` length == 32) **before** any Seal-dependent demo work relies on it.
**Requirements:** PRE.
**Dependencies:** none.
**Files:** none (verification only) — read `contracts/networks/testnet.json` (`packageId`) and cross-check against the D-085 republish.
**Approach:** Resolve the live `packageId`; confirm on-chain it is the republished build (publish a victim ALLOW_LIST model + an attacker short-prefix `seal_id` model and assert `seal_approve` aborts, OR confirm the deployed package digest matches the D-085 build). If the live package predates D-085, **republish before U6/U7 demo reliance** and record the new package id.
**Test expectation:** none — verification gate. Output is a recorded yes/no + package id in the plan's execution notes / phase-progress.
**Verification:** A written confirmation that the live testnet package enforces the 32-byte `seal_id` gate, with the package id.

### U1. Lift purchase-PTB builder + model-summary mapper into `shared/`
**Goal:** One isomorphic copy of `buildPurchaseAccessPtb` (+ `PurchaseAccessArgs`) and `jsonToSummary`, package-id parameterized, consumed by both frontend and the MCP route.
**Requirements:** R4, KTD-5.
**Dependencies:** U0 not required.
**Files:** `shared/src/sui/purchaseAccessPtb.ts`, `shared/src/model/jsonToSummary.ts` (+ `shared/src/index.ts` exports); modify `frontend/src/sui/collectionTxBuilders.ts` and `frontend/src/buy/hooks.ts` to import from `@overflow2026/shared`; `shared/src/**/*.test.ts`.
**Approach:** Move the pure functions verbatim; replace the frontend `TESTNET` import with a `packageId: string` parameter. Frontend call sites pass `TESTNET.model3dPackageId`; the MCP route passes the backend's `NETWORK.packageId` (from `contracts/networks/testnet.json`). No behavior change.
**Patterns to follow:** existing `shared/src/types.ts` export style; `Model3DSummary` field mapping documented in `frontend/src/buy/hooks.ts:jsonToSummary`.
**Test scenarios:**
- `jsonToSummary` maps a representative raw Move JSON (encrypted + public variants) to `Model3DSummary` including `accessFee`, `derivativeMintFee`, `derivativeRoyaltyBps`, `isEncrypted`, `previewBlobIds` — values byte-identical to the pre-lift frontend output.
- `buildPurchaseAccessPtb` with a given `packageId` + `accessFeeMist` produces a PTB whose `moveCall` target is `${packageId}::model3d::purchase_access` and that splits exactly `accessFeeMist` from gas.
- Frontend still compiles and its existing builder/summary tests pass against the re-exported shared functions (no drift).

### U2. MCP route scaffold — dependency, stateless transport, mount, CORS
**Goal:** A working `/mcp` endpoint that completes the MCP `initialize`/`tools/list` handshake with zero tools, mounted in the existing Node process.
**Requirements:** R1, KTD-1.
**Dependencies:** none.
**Files:** `backend/package.json` (add `@modelcontextprotocol/sdk@^1.29.0`); `backend/src/mcp/route.ts`, `backend/src/mcp/server.ts`; modify `backend/src/app.ts` (extend `BuildAppDeps`, `app.route('/mcp', buildMcpRoute(deps))`) and/or `backend/src/server.ts` for live-only deps; `backend/src/mcp/route.test.ts`.
**Approach:** Per request: `new McpServer({ name:'tusk3d', version })` + `new WebStandardStreamableHTTPServerTransport()` (stateless — `sessionIdGenerator: undefined`), `server.connect(transport)`, `return transport.handleRequest(c.req.raw)`. Register the route as `app.all('/mcp', …)` (POST + GET + DELETE). CORS scoped to `/mcp` with `mcp-session-id`/`mcp-protocol-version`/`last-event-id` in allow+expose. Do **not** consume `c.req.json()` before the transport.
**Patterns to follow:** sub-app DI in `backend/src/app.ts` (`buildMemoryRoute`/`buildAuthRoute`); the SDK's shipped Hono example shape (stateless, per-request server+transport).
**Test scenarios:**
- POST `initialize` over the route → 200 with a valid `InitializeResult` and negotiated protocol version.
- POST `tools/list` → returns an (initially empty, then populated by later units) tool list without error.
- A reused-transport smoke check is unnecessary in stateless mode, but assert a second concurrent request gets its own server (no message-id collision) by issuing two `initialize` calls and confirming both succeed.
- Verify backend `hono`/`@hono/node-server` versions satisfy the SDK transport (precheck: SDK example pins hono ^4.11 / node-server ^1.19; current backend is ^4.6 / ^1.13 — bump if the WebStandard `Request` handoff misbehaves).

### U3. MCP auth + rate-limit helper (bearer → sub)
**Goal:** A reusable helper that extracts and verifies the JWT from a tool call's bearer and yields the canonical `sub` address, plus a per-address fixed-window rate limiter for tool calls.
**Requirements:** R4, R7, KTD-4.
**Dependencies:** U2.
**Files:** `backend/src/mcp/auth.ts` (+ `auth.test.ts`); consumes `backend/src/lib/jwt.ts` (`verifySession`).
**Approach:** Mirror `backend/src/routes/memory.ts:bindNamespace` — read `Authorization: Bearer` (threaded into the tool via `handleRequest(req, { authInfo })` → `extra.authInfo`, OR validated in Hono middleware before the transport), `jwt.verifySession`, validate `sub` against `RAW_ADDRESS_RE`, `normalizeSuiAddress`. 401-equivalent tool error on missing/invalid. Rate limit per `sub` using the in-memory capped-map fixed-window pattern (with a TTL sweep — learnings: pair every TTL store with an `unref()`'d sweep).
**Patterns to follow:** `memory.ts` `bindNamespace` + its rate limiter + `resetMemoryRateLimitForTest`; cap the key map (e.g. 50k) and evict oldest.
**Test scenarios:**
- Valid JWT → returns the normalized `sub`.
- Missing / malformed / expired JWT → tool-level auth error (never silent empty).
- `sub` failing `RAW_ADDRESS_RE` → rejected.
- Rate limiter: N+1th call within the window for one `sub` → throttled; a different `sub` is unaffected; map respects its cap (oldest evicted), and the sweep clears expired entries.

### U4. v0 read tools — search_models, get_model, get_license_terms, get_preview
**Goal:** The four read-only tools, each behind the U3 auth/rate-limit helper.
**Requirements:** R2, R3, R7.
**Dependencies:** U1, U2, U3.
**Files:** `backend/src/mcp/tools/{searchModels,getModel,getLicenseTerms,getPreview}.ts` (+ co-located tests); register in `backend/src/mcp/server.ts`. Inject `MemwalClient`, sui client, and config via deps.
**Approach:**
- `search_models(query, limit?, scope?)` → calls `getMemwalClient().recall(ns, query, …)` with `ns = sub` (personal) / `GLOBAL_NAMESPACE` (global, default for discovery); returns `{ results: [{ modelId, prompt, distance, creator? }] }`. Fail-soft: degraded relayer → empty results + a degraded flag (mirror the `x-memwal-degraded` contract), never throw.
- `get_model(modelId)` → `getSuiClient().getObject({ id, options:{ showContent } })` → shared `jsonToSummary` → full `Model3DSummary`.
- `get_license_terms(modelId)` → projection of the summary: `{ accessFee, derivativeMintFee, derivativeRoyaltyBps, policy, isEncrypted }`.
- `get_preview(modelId)` → resolve `previewBlobIds` to CDN/aggregator URLs (`/v1/blobs/by-quilt-patch-id/<id>`); return URLs, not bytes; validate blobId charset (`BLOB_ID_RE`) before composing (audit W-4).
**Patterns to follow:** `memory.ts` recall request/response shape and `useMemoryRecall`; `capVerifier.ts`/`integrationIndexer.ts` `getObject` reads; `aggregator.ts` URL composition + `BLOB_ID_RE`.
**Test scenarios:**
- `search_models` (global) returns ranked `modelId`s from a faked `MemwalClient.recall`; degraded relayer → empty + flag, no throw; personal scope uses `sub` namespace.
- `get_model` maps a faked `getObject` payload to a full summary; unknown/non-Model3D object → clean tool error.
- `get_license_terms` returns exactly the license projection (no extraneous fields) with `accessFee` as a MIST string.
- `get_preview` returns CDN URLs for valid `previewBlobIds`; a malformed blobId (fails `BLOB_ID_RE`) is rejected/placeholdered, never path-traversed (Covers audit W-4).
- Every tool rejects an unauthenticated call (no/invalid bearer).

### U5. v1 build_purchase_tx
**Goal:** Return an **unsigned**, dry-run-validated `purchase_access` PTB for the agent to sign.
**Requirements:** R4, R6, KTD-7.
**Dependencies:** U1, U2, U3.
**Files:** `backend/src/mcp/tools/buildPurchaseTx.ts` (+ test); register in server.
**Approach:** Read the model's `accessFee` (U4 read path) → `buildPurchaseAccessPtb({ packageId, modelId, accessFeeMist })` (shared) → set sender to the agent address arg → `client.dryRunTransactionBlock(tx)` to validate → return `{ txBytes: b64, metadata:{ target, accessFeeMist, expectedEvents:['…::AccessPurchased'] } }`. **Never** sign; **never** hold a key. Surface the access fee in the response so the agent can confirm budget.
**Patterns to follow:** shared `buildPurchaseAccessPtb`; D-034 "builder fixes amount + destination, user only signs"; learnings — dry-run validates, struct args built via on-chain `new_*` moveCall (n/a here — `purchase_access` takes only `object` + coin).
**Test scenarios:**
- Given a model with `accessFee = X`, returns PTB bytes whose dry-run succeeds and whose `moveCall` target is `…::model3d::purchase_access`, splitting exactly `X`.
- A model id that doesn't resolve → clean error, no PTB.
- Response includes the access fee and expected `AccessPurchased` event; no signature/secret present anywhere in the output.
- Dry-run failure (e.g. malformed model) → tool error, never returns an unvalidated PTB.

### U6. v1 download_content — entitlement gate + decrypt material (no decryption server-side)
**Goal:** After verifying the caller holds the on-chain `AccessEntitlement`, return exactly the material the agent needs to decrypt **locally**; the server reads no plaintext and unwraps no key.
**Requirements:** R5, R6, KTD-2, KTD-6.
**Dependencies:** U1, U2, U3, U0 (Seal correctness).
**Files:** `backend/src/mcp/tools/downloadContent.ts` (+ test); reuse `backend/src/sui/capVerifier.ts` pattern; inject sui client + config.
**Approach:** (1) **Entitlement gate** (fail-closed): `getObject(entitlementId, { showContent, showOwner, showType })` via **fullnode by-id**, assert type `::model3d::AccessEntitlement`, `owner.AddressOwner === sub`, bound `model_id === modelId`; RPC error → deny. (2) Read the model's `sealed_key` + `glbBlobId` via `getObject(model, { showContent })`. (3) Return `{ ciphertextUrl: <CDN aggregator /by-quilt-patch-id/<glbBlobId>>, sealedKey, sealApprove:{ modelId, entitlementId } }`. Re-assert the `seal_id` 32-byte invariant when emitting `sealApprove` (defense in depth, mirrors the Move gate). The server **does not** call Seal key servers, **does not** fetch ciphertext, **does not** AES-decrypt.
**Patterns to follow:** `capVerifier.ts` (type+owner+binding, fail-closed); read-layer learning (fullnode by-id, not GraphQL, to avoid post-purchase indexer lag); `aggregator.ts` URL + `BLOB_ID_RE`.
**Test scenarios:**
- Caller owns a matching entitlement → returns `ciphertextUrl` + `sealedKey` + `sealApprove`; response contains **no** AES key and **no** plaintext (assert W-9 invariant explicitly).
- Entitlement owned by a **different** address than `sub` → denied.
- Entitlement bound to a **different** `model_id` than requested → denied.
- Object is not an `AccessEntitlement` type → denied.
- `getObject` RPC error → denied (fail-closed), never fall through to returning material.
- Right-after-purchase read uses fullnode by-id (no GraphQL) — covered by stubbing the injected client and asserting the call shape.
- A model whose `seal_id` length ≠ 32 → rejected before emitting `sealApprove` (Covers audit C-1 / D-085 mirror).

### U7. Client-side decrypt helper + samples/ integration (the agent-run piece)
**Goal:** A small, agent-runnable helper that, given the `download_content` output and the agent's keypair, completes Seal decryption locally and writes the plaintext GLB into `samples/` — the last mile of the hero demo in Claude Code.
**Requirements:** R5, R9, KTD-2, KTD-3.
**Dependencies:** U6.
**Files:** `scripts/agent-decrypt.ts` (Node/tsx, agent-run); reuses the **isomorphic** Seal helpers from `frontend/src/seal/*` (`sessionKey`, `sealClient`, `forkerDecrypt`, `envelope`, `decryptViaEntitlement` boundaries) — consider lifting the shared decrypt core into `shared/` if the import boundary is awkward; otherwise import directly. `scripts/agent-decrypt.test.ts`.
**Approach:** Input = `download_content` JSON + the agent's bech32 secret key (local env, never sent to the server). Steps: `SessionKey.create({ address: agentAddr, packageId })` → sign `getPersonalMessage()` with `Ed25519Keypair.fromSecretKey(...)` (the keypair **is** the Signer — no wrapper, D-058) → `decryptViaEntitlement`-style flow: build `seal_approve_entitlement` PTB (onlyTransactionKind) → `SealClient.decrypt` (fetch 2-of-2 shares) → `fetch(ciphertextUrl)` → AES-256-GCM decrypt (WebCrypto `crypto.subtle`, native in Node 22) → write GLB to `samples/<modelId>.glb`. Document the one-line invocation for the demo.
**Patterns to follow:** `frontend/src/seal/decryptAndView.ts:decryptViaEntitlement` injected-boundary design; `frontend/src/collection/encryptedFork.ts:decryptEncryptedBase`; D-058 keypair-as-Signer; D-085 seal_id length invariant (do not relax client-side).
**Execution note:** verify against U0 — the live package must enforce the 32-byte gate or `SealClient.decrypt` semantics can't be trusted for the demo.
**Test scenarios:**
- Given a faked `SealClient` + a known AES key + ciphertext fixture, the helper produces the expected plaintext GLB bytes and writes them to the target path.
- A SessionKey signed by the **wrong** keypair (not the entitlement holder) → key servers deny → helper errors clearly (no partial write).
- The fresh-object race (entitlement just minted) is handled by the existing bounded `decryptKeyWithRetry` backoff.
- The agent's secret key is read from local env only and never appears in any network request to the MCP server (assert by inspecting outbound calls in the test).

### U8. /llms.txt manifest
**Goal:** A static `/llms.txt` advertising the MCP endpoint + protocol, so LLM crawlers/agents can discover the connection.
**Requirements:** R8.
**Dependencies:** U2.
**Files:** `backend/src/routes/llms.ts` (+ test); mount in `app.ts`.
**Approach:** Serve a markdown `/llms.txt` per the llmstxt.org shape: H1 `# Tusk3D`, blockquote summary, an `## MCP` section linking the `/mcp` endpoint (Streamable HTTP, protocol `2025-11-25`) and a one-line tool overview, `## Docs` to the spec. `llms-full.txt` deferred.
**Test scenarios:**
- GET `/llms.txt` → 200, `text/markdown` (or `text/plain`), body contains the H1, the blockquote, and the `/mcp` endpoint URL.
- No auth required (it's public discovery metadata).

---

## Risks & Dependencies

- **New dependency `@modelcontextprotocol/sdk@^1.29.0`** (ESM, Node 22 OK). Verify backend `hono`/`@hono/node-server` (^4.6 / ^1.13) interoperate with the WebStandard transport's Fetch `Request` handoff; bump toward the SDK's example pins (hono ^4.11 / node-server ^1.19) if needed (U2 precheck).
- **First streaming surface in the backend** — even stateless POST-JSON works, but if SSE/GET is exercised, confirm `@hono/node-server` flushes correctly. Stateless request/response mode sidesteps most of this.
- **`@mysten/seal` server-side** — *not* added to the backend: pattern (a) keeps Seal on the **agent** side (helper U7 / frontend imports), so the backend gains **no** Seal dependency and the W-9 "backend never touches keys" invariant holds.
- **Seal correctness depends on U0** — the live testnet package must be the D-085 republish (32-byte `seal_id` gate). Republish before demo reliance if stale.
- **Demo wallet** — fund the agent keypair on testnet faucet; the agent legitimately owns the key (reuses the test-wallet keypair pattern). agent-browser can't sign — the demo runs in Claude Code with a real keypair, recorded for 6/21, live for 7/20.
- **CORS** — `/mcp` CORS is for browser-hosted MCP clients only; non-browser agents bypass it. Keep the permissive CORS scoped to `/mcp`, not `*`.

---

## Open Questions

- **OQ — capture-after-landing:** MemWal namespace handling, the `purchase_access`/`AccessEntitlement` flow, and the Walrus read-path CDN/aggregator/blobId details have no `docs/solutions/` entry yet. Run `/ce-compound` on these three seams once the MCP server lands.
- **OQ — second-client flash (demo §7):** confirm the same `/mcp` works in Cursor for the 5-second "standard, not bespoke" beat (read tools only; decrypt stays Claude-Code). Verify during demo prep, not a build blocker.

---

## Alternatives Considered

- **Pattern (b) server-side decrypt** — `download_content` runs Seal in the backend and returns plaintext bytes. *Pro:* any stock no-code MCP client (Claude Desktop) gets one-click delivery; simplest agent UX. *Con:* breaks audit W-9 (backend transiently unwraps the buyer's AES key + holds plaintext), puts ciphertext on the backend data path, adds load. Rejected for v1; kept as roadmap for stock-Desktop portability. (Note: the **expensive** step — the Seal key-server round-trip — is identical in (a) and (b); (b)'s only extra cost is fetch-CDN-ciphertext + a ~ms AES decrypt, so "load" was the weaker half of the argument — W-9 preservation is the deciding factor for (a).)
- **Hybrid local stdio decrypt tool** — ship a separate local MCP tool that decrypts on the user's machine, so even stock Desktop stays keyless-server + portable. *Con:* +1 installable component in an 11-day window. Deferred.
- **x402 payment rail** — rejected at brainstorm (origin §4): our fees are already native Sui Move; an agent with a keypair pays `access_fee` on-chain like a human. x402 = roadmap for off-chain metering only.
- **Separate Node process for MCP** — no benefit; same-process `app.route('/mcp')` reuses `getMemwalClient`, `getSuiClient`, `jwt`, rate-limit patterns.

---

## Sources & Research

- Origin: `docs/brainstorms/2026-06-10-agent-interface-research.md` (§3 tool surface, §4 x402, §6a Resolution).
- Audit: `docs/audits/2026-06-04-security-audit-seal-move-frontend.md` — C-1/D-085 (seal_id 32-byte gate), W-4 (blobId charset), W-9 (backend never touches AES key — the W-9 invariant pattern (a) preserves), B-1/B-4/B-11 (Tripo payment gate, out of MCP scope).
- Learnings: `docs/solutions/best-practices/cors-is-browser-only-cost-bearing-endpoints-need-server-auth-2026-05-15.md`; `…/in-memory-nonce-store-needs-explicit-ttl-sweep-2026-05-15.md`; `docs/solutions/design-patterns/seal-id-prefix-binding-fixed-length-2026-06-04.md`; `docs/solutions/architecture-patterns/ed25519-keypair-is-sui-signer-2026-05-28.md` (D-058); `docs/solutions/integration-issues/sui-ptb-struct-arg-pitfall-2026-05-15.md`; `docs/solutions/tooling-decisions/sui-read-layer-indexer-vs-fullnode-2026-05-23.md` (D-043); `…/mysten-sui-client-split-jsonrpc-grpc-2026-05-15.md` (D-019).
- MCP SDK: `@modelcontextprotocol/sdk@1.29.0` — `WebStandardStreamableHTTPServerTransport` (`server/webStandardStreamableHttp.js`), `registerTool` (Zod raw shape), stateless per-request transport, shipped Hono example. Spec: Streamable HTTP single endpoint (POST/GET/DELETE, `Mcp-Session-Id`, `MCP-Protocol-Version`). llms.txt: llmstxt.org.
- Backend map: `app.ts:buildApp` DI seam; `routes/memory.ts:bindNamespace` (namespace+rate-limit pattern); `sui/capVerifier.ts` (entitlement gate template); `sui/client.ts` (`SuiJsonRpcClient`, testnet packageId); `frontend/src/sui/collectionTxBuilders.ts:buildPurchaseAccessPtb`; `frontend/src/buy/hooks.ts:jsonToSummary`; `frontend/src/seal/*` (isomorphic decrypt helpers).
