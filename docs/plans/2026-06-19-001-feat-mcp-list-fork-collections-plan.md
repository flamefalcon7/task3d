# feat: MCP `list_fork_collections` — list a model's fork collections

**Date:** 2026-06-19 · **Type:** feat · **Depth:** Standard
**Origin:** `docs/brainstorms/2026-06-19-mcp-list-fork-collections-requirements.md`
**Phase:** Phase 5 (UX polish window), ~2 days to 6/21 submission.

---

## Summary

Add one read-only MCP tool, `list_fork_collections`, that takes a `Model3D`
object id and returns every L2 `NftCollection` forking it
(`base_model_id === modelId`), each enriched with an `integrationCount`. This
closes the one gap in the shipped agent surface (D-104): the MCP can already
*find* models (`search_models` → `get_model`) but is blind to the **derivative
collections** built on them. After this, an agent can walk the L1 → L2
composable creator-economy graph end to end inside the protocol.

The tool mirrors the proven frontend reverse-lookup
(`frontend/src/integration/useCollections.ts`): a GraphQL `objects(filter:{type})`
enumeration of `NftCollection`, mapped and filtered by `base_model_id`,
left-joined with the integration leaderboard indexer for the count.

---

## Problem Frame

`NftCollection` carries `base_model_id` (`contracts/model3d/sources/model3d.move:334`),
but the MCP has no way to traverse that edge. The existing MCP read tools use
fullnode JSON-RPC `getObject` **by id** (D-043 — no indexer lag for a known
object). "List all forks of a model" is a **by-attribute discovery**, not a
by-id read, so per the read-layer learning
(`docs/solutions/tooling-decisions/sui-read-layer-indexer-vs-fullnode-2026-05-23.md`)
it must go through GraphQL or an indexer and accept lag — the D-043 by-id
principle does not apply here.

Scope is pure discovery (read-only). No L2 transaction path.

---

## Requirements (from origin)

- **R1** — New read-only MCP tool registered alongside the existing read tools; input is a single `modelId` (same `0x…` id shape as `get_model`).
- **R2** — Reverse-lookup: return every `NftCollection` whose `base_model_id === modelId`, sourced from the complete GraphQL type enumeration.
- **R3** — Per-collection result carries the on-chain summary (`collectionId`, `nftCreator`, `baseRoyaltyBps`, `registerFee`, `integrationPolicy`) plus the resolved **base model name**.
- **R4** — Enrich each result with `integrationCount` from `integrationIndexer.getLeaderboard()`, left-joined (zero-integration collections appear at `0`; count ranks, never filters). Order by `integrationCount` desc with a deterministic tiebreak.
- **R5** — Auth + failure posture mirror existing tools: bearer JWT verified first (no unauthenticated surface); GraphQL failure is fail-soft (`degraded: true` + empty list, never a throw); a model with no forks is a valid empty result.

---

## Key Technical Decisions

### KTD1 — Enumerate via GraphQL `objects(filter:{type})`, not a `CollectionLaunched` event index
Mirror `useCollections.ts`: one GraphQL query returns the full collection JSON
(royalty/fee/policy) for all `NftCollection`s, filtered by `base_model_id`
client-side. This is the least-code path and the query shape is already proven
live (the `/integrate` leaderboard left-joins it).
**Alternative considered — `CollectionLaunched` event index** (the event carries
`{collection_id, base_model_id, nft_creator}`, `model3d.move:416`): more idiomatic
to this backend (JSON-RPC + event indexers, no GraphQL today) but the event lacks
royalty/fee/policy, so it would need event-poll **plus N per-collection by-id
reads** — more code, identical lag. Rejected for this plan; recorded as the
fallback if the GraphQL read proves flaky on testnet.
**Consequence:** this is the backend's **first GraphQL read**. Testnet GraphQL
has shown schema drift and empty results on some package versions (claude-mem
obs 1242, and `docs/solutions/integration-issues/sui-graphql-events-type-indexed-discovery-2026-05-23.md`)
— mitigated by R5 fail-soft (`degraded`).

### KTD2 — `integrationCount` via an injected indexer dep, best-effort
`integrationIndexer` is a boot-time singleton (`backend/src/server.ts:59`) with no
env-backed lazy default — unlike `suiClient`/`memwal`, it cannot resolve at call
time. So it is threaded in as a new optional MCP dep; when absent (e.g. unit
tests, or a misconfigured boot) `integrationCount` defaults to `0` and never
blocks results. `getLeaderboard()` only returns collections with ≥1 integration,
so the join is a left-join: build a `Map<collectionId, count>` and default missing
ids to `0` (same semantics as the leaderboard route, plan-2026-06-17-002).

### KTD3 — Fail-soft degraded posture (mirror `search_models`)
Auth is hard-fail (`requireAgentSub` throws → isError). The GraphQL read is
fail-soft: any error/timeout/`errors[]` response returns
`{ collections: [], degraded: true }` in-band (MCP tools have no response
headers), never a throw. Wrap in `guarded()` like every other tool so an
unexpected throw still becomes a structured `upstream_error`.

### KTD4 — Ordering: `integrationCount` desc, then `collectionId` lexical
Primary sort by adoption (R4); `collectionId` lexical is the deterministic final
key. **No base-model timestamp tier** (correction from doc-review): every fork of
one `modelId` shares the same `base_model_id` — hence the same base-model
`createdAtMs` — so a base-model time key resolves zero ties here, and
`NftCollection` carries no per-collection timestamp (`model3d.move:332`) to
substitute. Two keys (count desc → `collectionId`) are fully deterministic. (The
leaderboard's extra time tier exists because it ranks *across different* base
models; this tool ranks forks of one model, so it doesn't apply.)

---

## High-Level Technical Design

```
agent (holds modelId from search_models / get_model)
        │  POST /mcp  tools/call: list_fork_collections { modelId }
        ▼
list_fork_collections handler  (backend/src/mcp/tools/listForkCollections.ts)
   1. requireAgentSub(extra)                 ── hard-fail on bad JWT (KTD3)
   2. GraphQL objects(filter:{type:NftCollection})   ── enumerate (KTD1)
        └─ fail-soft → { collections:[], degraded:true }
   3. map nodes → summary  +  filter base_model_id === modelId   (R2/R3)
   4. resolve base model name (modelId → Model3D.name)            (R3)
   5. left-join integrationIndexer.getLeaderboard() → count (default 0)  (KTD2/R4)
   6. sort: count desc → createdAt → id                          (KTD4)
        ▼
   toolResult({ collections:[…], degraded? })
```

DI seam (U2): `buildApp` already receives `integrationIndexer`
(`backend/src/app.ts` `BuildAppDeps`), but mounts `/mcp` at `app.ts:40` with only
`{ jwt }`. Thread the indexer (and optional `graphqlEndpoint`) through
`buildMcpRoute` → `BuildMcpServerDeps`, exactly as `/api/collections` already
receives it.

---

## Implementation Units

### U1. `list_fork_collections` tool + GraphQL enumeration + enrichment
**Goal:** The tool itself — schema, GraphQL reverse-lookup, mapping, name
resolution, count enrichment, ordering, fail-soft — registered on the MCP server.
**Requirements:** R1, R2, R3, R4, R5 · **Dependencies:** none (defines the new dep
field on `BuildMcpServerDeps`; U2 supplies the live value).
**Files:**
- `backend/src/mcp/tools/listForkCollections.ts` (new)
- `backend/src/mcp/tools/listForkCollections.test.ts` (new)
- `backend/src/mcp/server.ts` (register the tool; add `integrationIndexer?` + `graphqlEndpoint?` to `BuildMcpServerDeps`)
- `backend/.env.example` (**append-only**: add commented `# SUI_GRAPHQL_ENDPOINT=…` template line — the new mainnet knob; never rewrite the file)

**Approach:**
- Input schema `{ modelId: MODEL_ID_SHAPE }` (reuse the exported shape from `getModel.ts`).
- Output schema: `{ collections: Array<{ collectionId, baseModelId, baseModelName, nftCreator, baseRoyaltyBps, registerFee, integrationPolicy, integrationCount }>, degraded?: boolean }`. All u64 fee fields are strings (MIST), mirroring `MODEL_SUMMARY_SHAPE`. `baseModelId` is included for agent traceability (echoes the input; cheap, already on the mapped node). The `baseModelName` field description must mirror `searchModels`' UNVERIFIED-creator-text framing (see Security guard below).
- **Enumeration:** POST the `NftCollection` type-filter query (port `COLLECTIONS_QUERY` + `nodeToCollection` from `frontend/src/integration/useCollections.ts`). Resolve the endpoint at call time: `deps.graphqlEndpoint ?? process.env.SUI_GRAPHQL_ENDPOINT ?? 'https://graphql.testnet.sui.io/graphql'` (do NOT read env at module load — server.ts DI contract). Wrap the fetch in `withTimeout` (common.ts).
- **Type tag + packageId guard (SEC):** `${packageId}::model3d::NftCollection` using the call-time-resolved `packageId` (`resolveSuiDeps` from `getModel.ts`), exact-match — never a `::`-suffix check (mirror the `MODEL_TYPE_SUFFIX` discipline in `common.ts`). Before interpolating `packageId` into the GraphQL query body, assert it matches `/^0x[0-9a-fA-F]{1,64}$/` (same regex as `MODEL_ID_SHAPE`); a non-id-shaped `packageId` (misconfigured env / test fixture) throws `upstream_error` rather than splicing arbitrary text into the query. One line, closes the injection seam the `packageId` DI opens.
- **Endpoint guard (SEC, light):** the GraphQL endpoint comes only from operator env / DI (never agent input), so SSRF requires a self-attacking operator — but a cheap `new URL(endpoint).hostname.endsWith('.sui.io')` allowlist check (with a test-env bypass) bounds the blast radius of a typo/misconfig. Apply at first use; on failure, fail-soft `degraded` (don't fetch).
- **Filter:** keep nodes whose mapped `base_model_id === modelId`; drop nodes with missing/malformed json (null-safe, like `nodeToCollection`).
- **Untrusted on-chain strings (SEC):** `baseModelName` (from `Model3D.name`, user-set at mint) and `nftCreator` are unverified creator input — treat as data, not instructions (prompt-injection surface for the consuming agent). Cap `baseModelName` at 200 chars at the mapper; carry the UNVERIFIED framing in its schema `.describe()`, exactly as `searchModels` does for its `prompt` field.
- **Name resolution:** resolve `modelId → Model3D.name` once via `readModelSummary(deps, modelId)` (reuse from `getModel.ts`); on a not-found/upstream model read, still return the forks with `baseModelName: ''` rather than failing the whole call (the forks are the payload).
- **Enrichment:** `const counts = new Map(deps.integrationIndexer?.getLeaderboard()?.map(e => [e.collectionId, e.count]) ?? []); integrationCount = counts.get(collectionId) ?? 0` — the optional chain short-circuits the whole expression to `[]` when `integrationIndexer` is absent (KTD2), so every count defaults to `0`, never a throw.
- **Order:** KTD4. **Fail-soft:** KTD3. Register via `registerListForkCollections(server, deps)` in `server.ts`, after the other read tools.
- Export the pure helpers (`mapCollectionNode`, `filterForksFor`, `sortForks`) for direct unit testing (pattern: `getModel.ts` exports `unwrapMoveFields`/`readModelSummary`).

**Patterns to follow:** `backend/src/mcp/tools/searchModels.ts` (fail-soft degraded contract, `guarded`, `requireAgentSub`, `toolResult`); `frontend/src/integration/useCollections.ts` (`COLLECTIONS_QUERY`, `nodeToCollection`, type tag); `getModel.ts` (`resolveSuiDeps`, `MODEL_ID_SHAPE`, `readModelSummary`).

**Test scenarios** (`listForkCollections.test.ts`, inject a fake GraphQL fetch + fake indexer + fake sui client, per `testUtils.ts`):
- Covers R1/R5. Missing/invalid bearer → isError (auth hard-fail), no GraphQL call made.
- Covers R2/R3. Three on-chain collections, two with `base_model_id === modelId` → exactly those two returned, each with the mapped summary fields + resolved `baseModelName`.
- Covers R2. A collection with a different `base_model_id` is excluded.
- Covers R3. A node with null/absent `asMoveObject.contents.json` is dropped, not crashed.
- Covers R4. Two matching forks; indexer reports count 5 for one and nothing for the other → counts 5 and 0; result ordered count-desc (the 5 leads).
- Covers R4/KTD2. `integrationIndexer` dep absent → both forks returned with `integrationCount: 0`, no throw.
- Covers KTD4. Equal counts → deterministic tiebreak by `collectionId` lexical — assert stable order across runs (no base-model time tier).
- Covers R5/KTD3. GraphQL fetch rejects / returns `{errors:[…]}` / times out → `{ collections: [], degraded: true }`, never throws.
- Covers R5. `modelId` with zero matching collections → `{ collections: [] }` (no `degraded`).
- Covers R3 edge. Base model read fails but forks exist → forks returned with `baseModelName: ''` (degraded name, not a failed call).
- Covers SEC (packageId guard). A non-id-shaped `deps.packageId` (e.g. `0xabc", "x": "y`) → `upstream_error`, no GraphQL request issued.
- Covers SEC (endpoint guard). `deps.graphqlEndpoint` with a non-`.sui.io` host → fail-soft `degraded`, no fetch (with the test-env bypass path also asserted).
- Covers SEC (untrusted strings). A fork whose `baseModelName` exceeds 200 chars → truncated at the mapper; the field's schema description carries the UNVERIFIED framing.

**Verification:** Tool appears in `tools/list`; a `tools/call` with a known model id returns its forks ordered by count; backend test suite green; tsc clean.

### U2. Thread the live indexer (+ GraphQL endpoint) into the `/mcp` route
**Goal:** Wire the boot-time `integrationIndexer` singleton through to the tool so
`integrationCount` is live in production (without this, U1 silently defaults to 0).
**Requirements:** R4 · **Dependencies:** U1.
**Files:**
- `backend/src/app.ts` (line ~40: pass `integrationIndexer: deps.integrationIndexer` — and `graphqlEndpoint` if surfaced — into `buildMcpRoute`)
- `backend/src/mcp/route.ts` (no change expected — `McpRouteDeps` already spreads `BuildMcpServerDeps`; confirm the new fields pass through)
- `backend/src/app.test.ts` (or the nearest app-wiring test) — assert the `/mcp` route receives the indexer
**Approach:** `BuildAppDeps` already carries `Pick<IntegrationIndexer, 'getIntegrations' | 'getLeaderboard'>`; widen nothing — just forward it at the `/mcp` mount, mirroring the existing `/api/collections` and `/api/integrations` mounts. `graphqlEndpoint` can stay env/default-resolved in U1 (no wiring needed) unless a test seam is wanted; if surfaced, default it in `app.ts` from `process.env.SUI_GRAPHQL_ENDPOINT`.
**Patterns to follow:** `backend/src/app.ts` existing `app.route('/api/collections', buildCollectionsRoute({ indexer: … }))`.
**Test scenarios:**
- Covers R4. App built with a fake indexer → a `list_fork_collections` call through the mounted `/mcp` route reflects the indexer's counts (integration-level proof that the wiring is connected, which a U1 unit test with a directly-injected dep cannot show).
**Verification:** With the backend running and the indexer populated, a live `list_fork_collections` call returns non-zero counts for collections that have integrations.

### U3. Surface the tool in the agent discovery doc (`/llms.txt`)
**Goal:** Keep the agent-facing tool listing honest — a shipped tool that isn't
discoverable reads as "not built" (agent-native + report-don't-hide).
**Requirements:** R1 · **Dependencies:** U1.
**Files:**
- `backend/src/routes/llms.ts` (the `Tools:` line in `renderLlmsTxt()` hard-codes the tool list at `:26` — append `list_fork_collections`)
- `backend/src/routes/llms.test.ts` (assert the new tool name is present)
**Approach:** Non-conditional (doc-review verified the route *does* enumerate tools): `renderLlmsTxt()` at `llms.ts:26` carries a static `- Tools: search_models, get_model, …, download_content` line. Append `, list_fork_collections`. Single-line literal edit, not an investigation.
**Test scenarios:**
- Covers R1. `GET /llms.txt` response body includes `list_fork_collections` in the tools line.
**Verification:** `GET /llms.txt` lists the new tool alongside the existing six.

---

## Scope Boundaries

**In scope:** the new read tool, its GraphQL enumeration + mapper, count
enrichment, DI wiring, discovery-doc update.

### Deferred to Follow-Up Work
- **L2 transaction path** (list/buy `NftToken`, build purchase PTB) — origin "Out of scope"; pure discovery only.
- **Per-collection token count** ("how many `NftToken`s minted") — N+1, limited demo value (origin).
- **GraphQL pagination / result caps** — hackathon scale fetches all; bound it as the set grows (origin).
- **`CollectionLaunched` event-index source** — KTD1 fallback if testnet GraphQL proves flaky.
- **Sharing the `NftCollectionSummary` type into `shared/`** — backend defines its own Zod shape for now; unify only if a third consumer appears.

---

## Risks & Dependencies

- **Testnet GraphQL flakiness / schema drift** (KTD1) — mitigated by fail-soft `degraded`; the event-index fallback is pre-scoped if it recurs. If introducing the query, introspect the live endpoint rather than trusting docs (per the schema-drift learning).
- **Cold-start indexer lag** — `integrationCount` reflects whatever the in-memory indexer has scanned (re-scans from genesis on restart, same caveat the leaderboard already accepts). Counts are a ranking hint, never correctness-bearing.
- **Mainnet cutover (D-009)** — the package id follows the network via `NETWORK` (call-time). The GraphQL endpoint, however, is a **new backend env var**: `SUI_GRAPHQL_ENDPOINT` today lives only in the frontend (`frontend/src/browse/graphqlQueries.ts:10`) — it is NOT in `backend/.env`/`.env.example`, so the tool falls through to the hardcoded testnet default. **Latent trap:** on a mainnet deploy with the var unset, the tool silently keeps hitting testnet GraphQL and fail-softs to `degraded:[]` (masking the misconfig). Mitigation in U1: add a commented `# SUI_GRAPHQL_ENDPOINT=https://graphql.testnet.sui.io/graphql` template line to `backend/.env.example` (non-secret, **append-only** per CLAUDE.md — never rewrite the env file) so the mainnet knob exists.

---

## Sources & Research

- Origin requirements: `docs/brainstorms/2026-06-19-mcp-list-fork-collections-requirements.md`
- Reverse-lookup pattern + query: `frontend/src/integration/useCollections.ts`
- MCP tool patterns: `backend/src/mcp/tools/searchModels.ts`, `getModel.ts`, `common.ts`; server/route DI: `backend/src/mcp/server.ts`, `route.ts`, mount at `backend/src/app.ts:40`
- Indexer accessor: `backend/src/events/integrationIndexer.ts` (`getLeaderboard()`, `LeaderboardEntry`); boot wiring `backend/src/server.ts:59`
- Contract linkage + event: `contracts/model3d/sources/model3d.move:334` (`base_model_id`), `:416`/`:1063` (`CollectionLaunched`)
- Read-layer decision: `docs/solutions/tooling-decisions/sui-read-layer-indexer-vs-fullnode-2026-05-23.md`
- GraphQL schema drift: `docs/solutions/integration-issues/sui-graphql-events-type-indexed-discovery-2026-05-23.md`
- Leaderboard left-join precedent: `docs/plans/2026-06-17-002-feat-integration-ecosystem-leaderboard-plan.md` (D-109)
