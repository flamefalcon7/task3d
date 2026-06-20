# MCP: list a model's fork collections — Requirements

**Date:** 2026-06-19 · **Status:** Ready for `/ce-plan` · **Scope tier:** Standard
**Submission context:** Sui Overflow 2026 (Walrus track), Phase 5 polish window, ~2 days to 6/21.

## Outcome

An AI agent connected to Tusk3D's MCP server can take a known `Model3D` id and
list every L2 `NftCollection` that forks it (`base_model_id === modelId`), as a
**read-only discovery** step. This closes the one gap in the existing agent
surface: the MCP can already *find* models (`search_models` → `get_model`) but
has no way to see the **derivative collections** built on top of a model.

The deliverable is one new MCP read tool that composes with the shipped ones —
`search_models → get_model → list_fork_collections` — so an agent can walk the
L1 → L2 creator-economy graph end to end without leaving the protocol.

## Why this, why now

- The MCP surface already shipped (6 tools, D-104) and the L1→L2 composable
  creator economy is the product's core story (D-029/D-078). The agent can see
  L1 but is blind to L2 — an asymmetry an evaluator browsing the agent surface
  would notice.
- The reverse-lookup mechanism already exists and is proven in the UI:
  `NftCollection.base_model_id` (`contracts/model3d/sources/model3d.move:334`)
  is filtered client-side in `frontend/src/integration/useCollections.ts` and on
  `BrowsePage`. The new tool ports a known-good pattern to the agent layer.
- The enrichment signal (`integrationCount`) is nearly free — the leaderboard
  indexer that computes it just shipped (D-109,
  `backend/src/events/integrationIndexer.ts` `getLeaderboard()`).

## Requirements

### R1 — New read-only MCP tool
Add one tool (working name `list_fork_collections`; final name is an open
question) registered in `backend/src/mcp/server.ts` alongside the existing read
tools. Input: a single `modelId` (same `0x…` id shape as `get_model`).

### R2 — Reverse-lookup by base model
Return every `NftCollection` whose `base_model_id` equals the input `modelId`.
Source of truth is the GraphQL type-filter enumeration
(`objects(filter:{ type: "<pkg>::model3d::NftCollection" })`) filtered in-memory
by `base_model_id` — the same query `useCollections.ts` uses. This is the only
**complete** source; the event indexer is enrichment only (see R4).

### R3 — Per-collection result shape
Each result carries the existing on-chain `NftCollectionSummary` fields —
`collectionId`, `nftCreator`, `baseRoyaltyBps`, `registerFee`,
`integrationPolicy` — plus the resolved **base model name** (join
`base_model_id → Model3D.name`, mirroring how the UI labels collections).

### R4 — Enrich with `integrationCount` (non-filtering)
Left-join each result with the integration count from
`integrationIndexer.getLeaderboard()`. A collection with zero registered
integrations still appears, with `integrationCount: 0` — the count is a ranking
signal an agent may sort on, **never a filter**. Results are returned ordered by
`integrationCount` desc (ties broken deterministically, e.g. by collection id)
so the most-adopted forks lead.

### R5 — Auth and failure posture mirror existing tools
- Bearer JWT is verified first via `requireAgentSub` — no unauthenticated tool
  surface, consistent with every other MCP tool.
- Read failures are **fail-soft**: a GraphQL error/timeout returns an empty list
  with a `degraded: true` flag rather than throwing (mirrors `search_models`'s
  in-band degraded contract). Auth failure remains a hard error.
- A model id that resolves to no forks is a valid empty result, not an error.

## Scope boundaries

### Out of scope (explicitly deferred)
- **Any L2 transaction path** — listing or buying `NftToken`s, building a
  purchase PTB for a token. The user chose pure discovery; `build_purchase_tx`
  stays L1-access-only.
- **Per-collection token count** ("how many `NftToken`s minted") — an extra
  per-collection (N+1) query for limited demo value. Deferrable to a later
  enrichment if an agent flow needs it.
- **GraphQL pagination / result caps** — at hackathon scale the all-collections
  fetch is fine; bounding it as the collection set grows is a later concern.
- **Augmenting `get_model` output inline** — kept as a separate opt-in tool
  (single responsibility; the agent calls it only when it wants forks).

### Outside this tool's identity
This is a discovery read, not a recommendation engine or a marketplace. It
reports the on-chain fork graph for one model; ranking is a simple adoption
sort, not a scored relevance model.

## Dependencies / Assumptions

- **GraphQL completeness** — assumes `objects(filter:{type})` enumerates all
  live `NftCollection`s. Known risk: testnet GraphQL returned `null` for this
  type once (claude-mem obs 1242, 2026-06-05). Plan must decide the exact
  fail-soft behavior and whether a fullnode fallback is warranted.
- **Indexer freshness** — `integrationCount` is eventually-consistent and
  resets on backend restart (in-memory indexer, same caveat as the leaderboard).
  Acceptable for a ranking hint; documented, not fixed here.
- **Shared mapper reuse** — base model name resolution should reuse the existing
  `Model3D` summary mapping (`jsonToSummary` / `useModelIndex` equivalents) so
  the agent and UI surfaces can't drift on naming.

## Success criteria

- An agent holding a valid model id receives the full set of its fork
  collections, each with the R3 fields + `integrationCount`, ordered by adoption.
- A model with no forks returns an empty list (not an error); a transient
  GraphQL failure returns empty + `degraded` (not a throw).
- Zero-integration collections appear at `integrationCount: 0` (left-join, not
  inner-join).
- Tool requires a valid bearer JWT; unauthenticated calls fail.
- Composes cleanly: `search_models → get_model → list_fork_collections` is a
  walkable agent path with no missing glue.

## Outstanding questions (for planning)

1. **Tool name** — `list_fork_collections` vs `list_collections_for_model` vs
   another verb. Pick one consistent with the existing `search_models` /
   `get_model` naming.
2. **Fail-soft specifics** — on GraphQL `null`/error, return `degraded` empty
   only, or attempt a fullnode fallback? Weigh against the 6/21 deadline.
3. **Tie-break ordering** — confirm the secondary sort after `integrationCount`
   desc (collection id? base model publish time, as the leaderboard now uses?).
