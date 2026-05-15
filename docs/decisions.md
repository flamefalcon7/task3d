# Architecture Decisions Log

> **Bootstrap note**: D-001 to D-010 capture the most-referenced choices made during pre-Phase-1 research (2026-05-14). For the full historical change list (19 items), see `docs/spec.md` §5.
>
> From D-011 onwards, decisions are captured in real-time per the protocol in `CLAUDE.md`.

---

## D-001: Composable Creator Economy framing (not NFT collection)

**Status**: Accepted
**Date**: 2026-05-14
**Phase**: Pre-Phase-1 strategy

### Context
Original spec framed `Model3D` as per-user mint (each user mints their own NFT). After researching industry pain points (Sketchfab → Fab migration disaster, Unity 2023 runtime fee, OpenSea royalty enforcement failure) and competitive landscape (Story Protocol $140M raise for 2D / music / manga IP layer), the framing was too small for a Walrus-track 50%-real-world-application criterion.

### Decision
Position project as **Composable Creator Economy for 3D / Programmable IP Layer**, directly competing in the same narrative space as Story Protocol but vertical-differentiated (3D / game asset) and technically differentiated (Sui Move + Walrus native storage).

### Rationale
- Hits Sui Overflow 2026 "Real-World Application 50%" criterion harder than per-user-NFT framing
- Walrus track explicitly framed around "verifiable data and memory layer" — aligns
- Real industry pain points (license risk, royalty enforcement) are addressable
- Vertical IP layer for 3D is open ground; Story Protocol focuses on 2D / music / manga

### Alternatives Considered
- **NFT-per-user collection**: rejected — speculative-coded, no creator economy, no derivative composition
- **Pure storage marketplace (Walrus only)**: rejected — leaves "IP / composability / royalty" value on the table

### Consequences
- ✅ Differentiated pitch story
- ⚠️ Higher implementation complexity (derivative layer, royalty math)
- 🔮 Post-hackathon: clear "Story Protocol for 3D" venture path

### Related
- spec.md §1.7, §2.8
- Related: D-002, D-003, D-004

---

## D-002: 3-tier Move architecture (Model3D + Access + Derivative)

**Status**: Accepted
**Date**: 2026-05-14
**Phase**: Pre-Phase-1 architecture

### Context
NFT-per-user model produces 1000 mints per 1000 buyers and offers no derivative composition. Need a data model that supports content + many buyers + composable derivatives.

### Decision
Three Move types:

- `Model3D { blob, creator, license, ... }` — `has key, store` — the content; one per actual model
- `Access { target_id, holder, expires_at_ms }` — `has key` **only** (no `store`) — soulbound receipt
- `Derivative { blob, base_model_id, base_royalty_bps, ... }` — `has key, store` — 2nd-tier composition

### Rationale
- Same Model3D accessible by N buyers (1 publish, N Access tokens)
- Access cannot be placed in Kiosk or any container → soulbound by Move type system, not enforcement code
- Derivative references base by ID + carries snapshot royalty → immutable IP terms
- Both Model3D and Derivative are Kiosk-compatible for secondary market (TransferPolicy royalty)

### Alternatives Considered
- **Single struct with optional fields**: rejected — too many nullable / mode-dependent paths
- **Dynamic fields for derivative tracking**: rejected — less queryable, more gas

### Consequences
- ✅ Clean separation of concerns
- ✅ Soulbound by type system (no enforcement code needed)
- ⚠️ More types = more test surface
- 🔮 Future: more derivative types (collections, bundles) follow same pattern

### Related
- spec.md §2.8
- Related: D-001, D-003, D-004, D-005

---

## D-003: License policy = restricted / allow_list / permissionless

**Status**: Accepted
**Date**: 2026-05-14
**Phase**: Pre-Phase-1 product design

### Context
Need to give creators control over how derivative creators can use their base content, without overengineering. User asked for 3 policy modes.

### Decision
Three exclusive policy modes (u8 enum in `LicenseTerms.policy`):

- `POLICY_RESTRICTED (0)` — derivatives forbidden
- `POLICY_ALLOW_LIST (1)` — base creator grants `DerivativeApproval` (capability token, single-use, soulbound) to specific addresses
- `POLICY_PERMISSIONLESS (2)` — anyone may mint a derivative on paying `derivative_mint_fee`

### Rationale
- Three modes cover realistic creator intentions (lock / curate / open)
- Capability token pattern avoids on-chain `vector<address>` (gas-bomb risk)
- Mode is set at publish, not mutable — protects derivative creators from rug-pull

### Alternatives Considered
- **2 modes (open / closed)**: rejected — missing "curated / partnership" middle case
- **`vector<address>` allow list**: rejected — gas concerns at ~100+ entries
- **Mutable policy**: rejected — would let base creator rug existing derivatives

### Consequences
- ✅ Creator self-service, no platform gatekeeping
- ✅ Capability token is web3-native pattern
- ⚠️ Allow-list creator burden: must mint approval per approved derivative creator
- 🔮 4th mode (e.g. NFT-holders-only) addable via Move policy composition

### Related
- spec.md §2.8 (LicenseTerms struct, mint_derivative_* functions)
- Related: D-001, D-002, D-004

---

## D-004: 30% royalty cap (MAX_DERIVATIVE_ROYALTY_BPS = 3000)

**Status**: Accepted
**Date**: 2026-05-14
**Phase**: Pre-Phase-1 protocol invariant

### Context
Without a cap, base creators could set royalty arbitrarily high (90%+), suppressing derivative economics and inviting griefing ("lure creators to fork, then jack royalty"). Industry baselines: music mechanical licenses ~9%, NFT secondary 2.5–10%, Roblox 70% (despised).

### Decision
Hard cap base → derivative royalty at 30% of derivative sale price. Enforced in `publish()` function — abort if `derivative_royalty_bps > MAX_DERIVATIVE_ROYALTY_BPS (3000 bps)`.

### Rationale
- Generous upper bound for rare "I'm a famous IP" cases
- Most use cases will pick 5–15%; 30% is room, not target
- Protocol-level invariant: cannot be undermined by client UI
- Prevents griefing

### Alternatives Considered
- **No cap**: rejected — invites griefing
- **10% cap**: rejected — too restrictive for premium IP
- **Mutable cap via governance**: rejected — overkill for hackathon MVP

### Consequences
- ✅ Healthy derivative economics by default
- ⚠️ True high-IP brand might want > 30% — accept as edge case
- 🔮 Future: cap could become a governance parameter

### Related
- spec.md §2.8 const declarations
- Related: D-001, D-002, D-003

---

## D-005: base_royalty_bps snapshot at derivative mint (immutable)

**Status**: Accepted
**Date**: 2026-05-14
**Phase**: Pre-Phase-1 security

### Context
If `Derivative.base_royalty_bps` reads live from `Model3D.license.derivative_royalty_bps`, base creator could increase royalty after derivatives exist, stealing economics retroactively. This is the same pattern as Unity 2023's retroactive runtime-fee change.

### Decision
`Derivative` struct carries its own `base_royalty_bps: u16` set at mint and **never mutated**. `purchase_derivative_access` uses the snapshot, not the live base license.

### Rationale
- Mirrors music mechanical license: rate locked at license issuance, not at play time
- Eliminates an entire class of retroactive-change attacks
- Slightly more storage cost (u16 per derivative) — trivial

### Consequences
- ✅ Derivative economics permanent at mint
- ⚠️ Base creator changing royalty does not apply to existing derivatives (intended)
- 🔮 Future derivatives use new rate (creator can roll forward)

### Related
- spec.md §2.8 Derivative struct, spec.md §5 #19
- Related: D-002

---

## D-006: GLB only for v1 (no FBX, OBJ, USDZ)

**Status**: Accepted
**Date**: 2026-05-14
**Phase**: Phase 1 backend

### Context
Format proliferation increases test surface and Walrus storage cost. Need one universal format for game-dev consumption.

### Decision
v1 exports GLB (glTF 2.0 binary) only. No FBX, no OBJ, no USDZ.

### Rationale
- GLB is ISO/IEC 12113:2022 international standard
- Three.js / Babylon / PlayCanvas / Unity (`com.unity.cloud.gltfast` first-party) / Unreal (built-in + glTFRuntime) / Godot all support natively
- PlayCanvas measured 17× faster parse than JSON glTF
- Single binary file = single Walrus blob (clean storage model)

### Alternatives Considered
- **GLB + USDZ for iOS AR**: deferred to v1.1 stretch (Apple AR Quick Look exclusive path)
- **Add FBX for authoring re-import**: rejected — our users are game devs consuming, not 3D modelers re-editing

### Consequences
- ✅ Simple pipeline, one format end-to-end
- ⚠️ iOS AR Quick Look users out of v1 scope
- 🔮 GLB → USDZ conversion easily added in stretch with same Walrus blob ID pattern

### Related
- spec.md §1.8 format table

---

## D-007: Drop react-babylonjs, use Babylon imperatively

**Status**: Accepted
**Date**: 2026-05-14
**Phase**: Phase 1 frontend

### Context
Original spec proposed `react-babylonjs` for declarative React wrapper. Investigation found maintenance stale: last npm publish 2025-05 (~1 year ago), Snyk flags "Inactive", pinned against older Babylon 6.x types (conflicts with current 9.x).

### Decision
Use `@babylonjs/core` directly with a ~40 line imperative React wrapper (Engine + Scene held in refs, useEffect for setup/teardown). Babylon's own React documentation recommends this pattern.

### Rationale
- Active maintainer (Microsoft) vs single-maintainer Inactive
- Avoids TS type pinning conflicts with Babylon 9.x
- Wrapper small enough that we own it

### Consequences
- ✅ Fewer dependencies, no version conflict surface
- ⚠️ ~40 lines of glue code to maintain
- 🔮 Easy to swap to React Three Fiber if Babylon becomes a liability

### Related
- spec.md §4.3, spec.md §5 #1

---

## D-008: Lock all @mysten/* to 2026-05-08 release train

**Status**: Accepted
**Date**: 2026-05-14
**Phase**: Phase 1 dependency strategy

### Context
@mysten/* SDKs (sui, dapp-kit, enoki, walrus, walrus-wasm, slush-wallet, seal) share an internal `SuiClient` type. Version mismatch surfaces as cryptic TypeScript type errors during integration.

### Decision
Pin to:
- `@mysten/sui@2.16.2`
- `@mysten/dapp-kit@1.0.6`
- `@mysten/enoki@1.0.7`
- `@mysten/walrus@1.1.7`
- `@mysten/walrus-wasm@0.2.2`
- `@mysten/slush-wallet@1.0.5`
- `@mysten/seal@1.1.x` (if/when added)

All from the 2026-05-08 release train.

### Consequences
- ✅ No client-type mismatches
- ⚠️ Must bump all together when refreshing
- 🔮 Re-evaluate bundle before Phase 4 mainnet deploy

### Related
- spec.md §4 SDK lock table

---

## D-009: Testnet submission, mainnet by 8/27 winners announcement

**Status**: Accepted
**Date**: 2026-05-14
**Phase**: Strategy

### Context
Sui Overflow 2026 handbook states: "50% of prize awarded on winners announcement (8/27), 50% after mainnet deployment. If already mainnet by 8/27 → 100% upfront." Submission 6/21 allows testnet.

### Decision
Submit 6/21 on testnet (sufficient for shortlist + demo day). Deploy mainnet during Phase 4 (6/11–6/20). By 8/27 winners date, application is live on mainnet — eligible for 100% prize upfront on win.

### Rationale
- 6/21 testnet OK per handbook
- Mainnet deploy is a 50%-prize gate that costs almost nothing to clear with planning
- Phase 4 dedicated to it

### Consequences
- ✅ Eligible for 100% prize on win
- ⚠️ Real WAL acquisition needed for mainnet demos (no faucet)
- 🔮 Mainnet contract = real publication; treat upgrade path seriously

### Related
- spec.md §1.1.1, §6 Phase 4

---

## D-010: Walrus upload relay required for browser uploads

**Status**: Accepted
**Date**: 2026-05-14
**Phase**: Phase 2 Walrus integration

### Context
Direct browser → Walrus storage nodes write requires ~2,200 HTTP requests across ~1,000 shards. CORS-unfriendly, rate-limit-prone. Original spec did not address this.

### Decision
Configure `@mysten/walrus` with `uploadRelay: { host, sendTip: { max: 1_000 } }`. Use Mysten testnet relay `https://upload-relay.testnet.walrus.space` for v1; evaluate self-hosted or alternative for mainnet.

### Rationale
- Relay handles sliver fanout server-side
- User wallet still signs `register_blob` + `certify_blob` — relay never touches keys
- Tip in MIST is trivial vs the saved bandwidth and request overhead

### Consequences
- ✅ Clean browser UX, single relay round-trip
- ⚠️ Relay availability becomes operational dependency
- 🔮 Self-host relay if traffic warrants

### Related
- spec.md §2.4, spec.md §5 #5

---

## D-011: Agentic framing + hybrid generator architecture (LLM router → procedural | Tripo)

**Status**: Accepted
**Date**: 2026-05-14
**Phase**: Pre-Phase-1 strategy (expands D-001 framing scope)

### Context
Walrus track 2026 framing is literal: *"Build **AI agents and agentic workflows** powered by Walrus as a verifiable data and memory layer."* The framing established in D-001 (Composable Creator Economy / Programmable IP Layer) is strong on Real-World Application 50% but does not satisfy the track's AI-agent surface expectation. spec.md §0 point 4's prior reframe ("user is generator agent") is too thin — judges expecting AI agents will discount the project despite other dimensions scoring high.

Separately, pure procedural Go generation has bounded visual variety. Realistic 38-day output is 5–8 generators (box / cylinder / sphere / chest / stairs / column / tower). For "ornate / character / organic" demo asks procedural cannot compete. AI generators (Tripo / Meshy) have the opposite tradeoff: rich visuals, non-manifold output, unstable IP under free tier, slow gen (30–120s), per-call cost.

### Decision
1. **Pitch reframe**: position as *"LLM agent that orchestrates procedural and AI generators, treating Walrus as the agent's verifiable lineage memory."* The agent layer is real (decomposition, routing, batching, provenance) — not a thin wrapper.
2. **Architecture**: introduce `Generator` interface in `backend/generators/`. `ProceduralGenerator` is primary (cheap, manifold-guaranteed, < 2s, $0/gen). `TripoGenerator` is a pluggable secondary, wired only if Phase 3 demo evaluation indicates procedural catalog is visually insufficient.
3. **Agent layer**: a thin LLM router (Claude Haiku/Sonnet, ~$0.001/call) performs (a) NL → catalog lookup + param mapping, (b) multi-step decomposition (e.g. "5 dungeon props" → 5 individual generator calls + 1 series batch mint), (c) generator routing (catalog hit → procedural; miss → Tripo if wired, else degrade gracefully).
4. **Lineage on Walrus**: every generation commits a small `lineage.json` blob alongside the GLB containing prompt, decision trace, params, generator source, and base relation. This is the literal *"verifiable memory layer"* the track asks for.

### Rationale
- Walrus track Real-World Application 50% requires framing alignment, not just technical merit
- `Generator` interface defers procedural-vs-Tripo to Phase 3 with zero rework cost — Strategy pattern, ~30 LoC
- LLM as **router** (not generator) keeps it stable: LLM does classification + param mapping, never produces geometry directly. Verified during office-hours that LLM-as-geometry-producer is unstable (user reported tuning Gemini/Claude for chest geometry took "老半天")
- Procedural primacy preserves D-001 IP thesis, D-006 GLB-only, §1.8 manifold/scale/pivot guarantees
- Tripo Pro tier ($11.94/mo) commercial license resolves §1.8 IP blocker if/when wired
- Lineage record gives Walrus a real "memory layer" role beyond byte storage

### Alternatives Considered
- **Pure procedural** (prior spec): rejected — framing misalignment + bounded visual variety
- **Pure Tripo wrapper**: rejected — kills D-001 IP thesis (CC BY 4.0 free tier non-commercial), kills §1.8 differentiation, "wrapper" ≠ "agent"
- **Switch tracks** (Agentic Web): rejected — Walrus has best fit, biggest pool ($70K), Mysten resource access
- **No LLM, keep slider-only UI**: rejected — slider UI is a product surface, not an agent. Would not satisfy track framing
- **LLM generates geometry directly** (asking LLM to emit vertex arrays): rejected — unstable, user experience already verified bad

### Consequences
- ✅ Framing directly hits Walrus track's stated ask
- ✅ Architecture flexible (procedural primary, Tripo optional) — Phase 3 makes the call with full information
- ✅ Demo shows real agent behavior (decomposition + batch + lineage), not just an AI API wrapper
- ✅ All D-001 / D-002 / D-006 advantages preserved
- ⚠️ Adds dependency on LLM provider (Anthropic API). Per-call ≈ $0.001 — demo cost trivial
- ⚠️ Lineage blob = 1 extra Walrus write per generation (small, well under floor pricing — see spec §2.3)
- ⚠️ If Phase 3 wires Tripo, mainnet demo carries Tripo availability risk. Mitigation: pre-record demo video, cache key Tripo outputs
- 🔮 Post-hackathon: more generators (LumaAI, Meshy, custom) plug into same interface

### Related
- spec.md §0 (points 4 + 4.5 updated), §1.7 (agent layer paragraph added), §1.8 (Tripo nuance note), §1.9 (tagline updated), §6 Phase 1–3 (Generator interface, LLM router, Tripo decision point)
- Builds on: D-001 (framing scope expanded, not superseded), D-006 (still GLB only end-to-end)
- Throwaway proof: `/tmp/box-demo/box.go` + `chest.go` validated procedural pipeline (816 B box + 1008 B chest, both manifold) before this decision

---

## D-012: TypeScript unified across browser + server (drop Go backend)

**Status**: Accepted
**Date**: 2026-05-14
**Phase**: Pre-Phase-1 stack
**Supersedes**: implicit "Go backend" choice in prior spec.md §1.8 / §4 / §6 Phase 1 (no prior ADR — first explicit capture)

### Context
Spec.md before D-011 framed procedural generation as the project's "secret sauce" and selected Go (`qmuntal/gltf`) for the backend on that basis. D-011 reframed procedural as one of several pluggable generators under an LLM agent layer — generator is no longer differentiation. With that change, Go's rationale (compute server holds the secret sauce) lost its force, and the choice became a pure velocity / ecosystem question for the 38-day sprint.

User considered three options:
- **A**: Keep Go split (status quo) — 2 ecosystems (Go + TS), 2 services
- **B**: TS unified split — 1 ecosystem (TS), 2 services (browser + Node)
- **C**: Browser-only with edge function — 1 ecosystem, 1 service + edge

User's correct intuition: 2-service split is the right separation of concerns. Walrus + Sui must run in the browser (user wallet signs `register_blob` + `certify_blob` via upload relay); LLM API key protection + lineage signing + future caching belong on a server. The only remaining decision was the server's language.

### Decision
- **Browser** = TypeScript + Vite + React + Babylon.js + `@mysten/dapp-kit` + `@mysten/sui` + `@mysten/walrus` + `@mysten/walrus-wasm`
- **Server** = TypeScript on Node (default; Bun acceptable if user prefers) + Hono HTTP framework + `@gltf-transform/core` (procedural GLB construction) + `@anthropic-ai/sdk` (LLM router) + `@mysten/sui` (server-side lineage signing with a known agent keypair)
- **No Go**. Drop `qmuntal/gltf` and the `backend/` Go skeleton from spec.
- Repo layout (monorepo, single workspace):
  ```
  ├── frontend/      # Vite + React + Babylon
  ├── backend/       # Node + Hono + generators + agent router
  ├── shared/        # types shared by both (GenerateParams, LineageRecord, Generator interface)
  ├── contracts/     # Sui Move (unchanged)
  └── samples/       # Phase 3 sample game scene
  ```

### Rationale
- **One ecosystem**: solo developer in 38-day window pays a measurable context-switch tax for two languages. TS-only collapses to a single mental model.
- **Type sharing**: `Generator` interface, `GenerateParams`, `LineageRecord` live in `shared/` and are imported by both browser and backend. Under Go split the same types are hand-mirrored and drift.
- **SDK alignment**: `@mysten/sui`, `@mysten/walrus`, `@mysten/dapp-kit`, `@anthropic-ai/sdk` are all TS-native. Server reuses the same SDK as the browser for any Sui-side operation (e.g., signing lineage).
- **Library parity**: `@gltf-transform/core` is as mature as `qmuntal/gltf` for our procedural use case. The 20-line TS `generateBox` shown in office-hours is functionally equivalent to `/tmp/box-demo/box.go`.
- **Anthropic official SDK is TS** (Go SDK is community-maintained). D-011's LLM router stays on the officially supported path.
- **D-011 architecture unchanged**: 2-service split and Generator interface preserved; only the server's implementation language changes.

### Alternatives Considered
- **A. Keep Go (status quo)** — rejected. User has no Go-over-TS velocity advantage; Go's strengths (single-binary, low memory, perf) are not load-bearing at hackathon scale.
- **C. Browser-only + edge function** — rejected. Server-side lineage signing with a server keypair (proves "this was generated by our agent") strengthens D-011's verifiable-memory claim. Cache + rate-limit also simpler with a persistent server.
- **Bun vs Node** — left as a Phase 1 micro-decision. Both run the same stack; pick at scaffold time.

### Consequences
- ✅ Phase 1 work drops ~30% (no Go skeleton, no API contract handwriting between languages, single CI)
- ✅ Type drift between browser and server eliminated structurally
- ✅ Anthropic official SDK + Sui official TS SDK — D-011 implementation on supported paths
- ✅ Server-side `@mysten/sui` keypair signs lineage = stronger "verifiable memory layer" framing
- ⚠️ Node container ~50 MB vs Go binary ~10 MB — deployment cost negligible at our scale
- ⚠️ Procedural compute + HTTP share Node's event loop — fine for ~50 ms per request; if Phase 4 introduces heavy compute (CSG, smoothing) reconsider Worker threads or split a small Go service then
- 🔮 Headless GLB → PNG thumbnail (Phase 4 stretch) can still spin up a separate small Go service later without touching this architecture
- 🔮 If using Bun, pin a specific minor version (e.g., `bun@1.2.x`) — runtime evolves quickly

### Related
- spec.md §1.8 (Tripo comparison "跑你自己的 server" — keep claim, drop Go-specificity), §4 (SDK / stack — drop Go, add `@gltf-transform/core` + `@anthropic-ai/sdk` + Hono), §6 Phase 1 (TS scaffold instead of `go mod init`)
- Builds on: D-011 (architecture and split preserved). Supersedes the implicit Go choice from prior spec text.
- Throwaway proof at `/tmp/box-demo/` (Go) will **not** be ported; equivalent TS box generator written fresh in Phase 1 (~20 LoC)

---

## D-013: v1 scope refocus — cut L2 Derivative, promote Kiosk, narrow framing to Sui-native 3D NFT economy

**Status**: Accepted
**Date**: 2026-05-14
**Phase**: Pre-Phase-1 strategy (refines v1 scope from D-001 + D-002)
**Relates to**: D-001 (v1 narrows framing; v2 vision unchanged), D-002 (L2 layer deferred to v1.1), D-003 (license policy unchanged at type level; not exposed in v1 UI), D-005 (snapshot immutability still applies when L2 ships in v1.1)

### Context

Post-D-011/D-012 review of `docs/product.md` exposed three coupled problems:

1. **L2 Derivative has no real user.** 3D has no remix / derivative culture analog to 2D, music, or video. The Sarah persona in product.md was invented to demo the Derivative layer, not because anyone in the wild does "fork chest → 5-variant series". Pricing math for an individual L2 actor (paying 5 × `derivative_mint_fee` upfront, recouping at `derivative_price × (1 − base_royalty_bps)`) yields ~$5/variant net at SUI ≈ $2–3 — not enough to sustain her time.

2. **"Composable Creator Economy / 3D Story Protocol" framing is risk-prone.** Story Protocol is reference for some judges, unknown to others. It does not immediately read as Sui-ecosystem differentiation. Without a visible L2 actor in demo, "composable" sounds aspirational, not concrete.

3. **Sui Kiosk + TransferPolicy sits in Stretch A but is *the* mechanism by which Sui beats Ethereum NFT royalty enforcement.** Without Kiosk in v1, "protocol-level royalty enforcement" is half-hearted — only the direct `purchase_access` flow is enforced, secondary markets can still strip royalty (the OpenSea / Blur 2023 failure mode).

### Decision

Three coupled changes for v1 (submission 6/21):

1. **L2 Derivative moves to v1.1.** `Derivative`, `DerivativeApproval`, `mint_derivative_*` Move code design stays in `spec.md` §2.8 (already designed) but is **not** shipped, tested on testnet, demoed, or wired into UI for v1. Annotate §2.8 to mark Derivative-related structs and entry functions as `(v1.1 deferred per D-013)`.

2. **Sui Kiosk + TransferPolicy promoted from Stretch A to v1 must-have.** Both `Model3D` and `Access` (or whatever subset survives Phase 2 design) registered with Kiosk; royalty enforcement runs at the protocol layer, not in `purchase_access` logic alone. This makes the "protocol-level economy" claim concrete and verifiable on Sui Explorer.

3. **Public framing for v1 narrows to "Sui-native 3D NFT economy"** — pitched as five Sui+Walrus exclusive primitives:

   | # | Element | Mechanism | Why other chains / web2 can't match |
   |---|---|---|---|
   | 1 | Royalty enforced at protocol layer | Sui Kiosk + TransferPolicy | Ethereum NFTs failed at this — OpenSea/Blur 2023 royalty war |
   | 2 | License written into Move struct, unchangeable | `Model3D.license: LicenseTerms` | Unity 2023 retroactively changed TOS; Move types can't be silently mutated |
   | 3 | Access soulbound by Move type ability | `Access has key` (no `store`) | Soulbound by type system, not by enforcement code — bytecode-level guarantee |
   | 4 | Storage persistent across platform death | Walrus blob | Sketchfab→Fab and Mixamo 2025-06 both lost user assets; Walrus survives operator failure |
   | 5 | Provenance traceable from on-chain timestamp + Walrus content hash | Walrus lineage record + Sui object creation tx | AI training dataset disputes (Objaverse) need exactly this — chain-of-custody proof |

D-001's "Composable Creator Economy / Programmable IP Layer" framing remains the v2+ vision; v1 stays in the narrower, demonstrably-Sui-unique territory.

### Rationale

- L2 cut frees ~5–8 days in Phase 4 (Move upgrade + UI + tests + demo middle act) — reallocated to Kiosk integration (now must-have) and Phase 5 polish / demo prep
- Kiosk promotion makes "protocol-enforced royalty" verifiable on Sui Explorer (OpenSea/Blur royalty failure → Sui Kiosk fixes is a story Sui-savvy judges immediately recognize)
- Narrow framing eliminates the artificial Sarah persona; the 2-act narrative (Tom creator + Marcus buyer) has both actors choosing Sui for specific Sui-exclusive reasons, not for unverified "composable IP" reasons
- D-001 vision preserved for v2; not abandoned — just sequenced
- Each of the 5 framing elements is implementable in v1 and verifiable by judges with Sui Explorer + Walrus aggregator

### Alternatives Considered

- **Keep L2 in v1, fix Sarah persona** (B2B studio art lead variant): rejected — even with stronger persona, 3D-remix-culture absence makes the L2 actor speculative for a 38-day demo. The persona fix doesn't address the underlying market gap.
- **Cut L2 + reframe to "Asset Supply Chain"** (first cut of Level 3 in office-hours review): rejected by user — collapses positioning to "web3 asset marketplace," loses the Sui-ecosystem differentiation entirely.
- **Cut L2 + keep "Composable Creator Economy" framing as-is**: rejected — "composable" without a visible L2 demo is hand-wave; the 5-element framing is structurally stronger and concretely verifiable.
- **Keep Kiosk as Stretch A**: rejected — Kiosk is what concretely separates Sui NFT economy from Ethereum's failed royalty enforcement. Belongs in v1, not stretch. The freed L2 time pays for it.

### Consequences

- ✅ v1 narrative tightens to two real actors (Tom, Marcus), both with verifiable Sui-specific reasons
- ✅ Kiosk integration turns a previously-aspirational claim (protocol-level royalty) into on-chain reality before submission
- ✅ Phase 4 saves ~5–8 days of L2 work → goes to mainnet polish + demo video
- ✅ 5-framing-reason structure makes pitch deck and README easier to write — one section per element
- ⚠️ L2 Move code design in spec.md §2.8 is not removed; stays as v1.1 reference. Risk: future contributor implements without reading this ADR. **Mitigation**: section headers in §2.8 for Derivative-related structs annotated `(v1.1 deferred per D-013)`
- ⚠️ "Composable" word in spec.md §1.9 tagline and elsewhere must be carefully scoped — current tagline "Agentic by orchestration, manifold by construction, commercial by chain, composable by design" gets `composable by design` replaced with a Sui-primitives-concrete phrase. New tagline: **"Agentic by orchestration, manifold by construction, enforced by Sui Move, persistent by Walrus."**
- ⚠️ `LicenseTerms.policy` field (D-003: restricted / allow_list / permissionless) stays in Move type but **v1 UI does not expose it**. Default at publish: `POLICY_PERMISSIONLESS` (so v1-published models can be derived in v1.1 without needing a license migration). `derivative_mint_fee` and `derivative_royalty_bps` defaults left to Phase 2 design.
- 🔮 Post-hackathon: if Phase 5 traction shows real demand for derivative creation (e.g., Discord users asking "can I fork this base?"), v1.1 ships L2 with validated PMF. If not, L2 stays deferred indefinitely without harming v1 narrative.

### Related

- spec.md §1.7 (framing pivot for v1), §1.8 (Tripo comparison: "composable IP layer" rows soften), §1.9 (tagline update), §6 Phase 4 (Kiosk to must-have, Derivative work moved out of v1), §2.8 (Move code annotated `v1.1 deferred per D-013`)
- docs/product.md (rewrite: Sarah cut, 3-act → 2-act, 5-framing-reason section featured)
- D-001 (v1 narrows; v2 vision unchanged), D-002 (L2 deferred to v1.1), D-003 (policy field stays; not exposed in v1 UI), D-005 (still applies when L2 ships in v1.1)

---

## D-014: Tripo P1 接入 Phase 2 為 creator 自費上層,demo 主路徑改 browse-first marketplace

**Status**: Accepted
**Date**: 2026-05-14
**Phase**: Phase 2 (Sui Integration) — refines D-011 Tripo decision timing

### Context

D-011 把 Tripo 列為「Phase 3 才決定要不要接的 secondary generator」。Phase 1 完成後 2026-05-14 重新評估:

1. **使用者觀察**:Phase 1 出貨的 4 個 procedural 形狀(box / chest / cylinder / sphere)demo 視覺說服力不足,單看一個 box 不像可以拿來賣的 game asset
2. **Tripo API 研究**(`compound-engineering:ce-web-researcher`,2026-05-14):Tripo P1 model 原生 48-20,000 faces、native GLB、~2 秒生成、`face_limit` 參數可硬限 poly 數、`smart_low_poly` 旗標、`texture: false` 可關貼圖。三項之前的疑慮(無法控 poly / 不能拿純 GLB / 太慢)都被新 API 推翻
3. **產品 reframe(本決定的關鍵 insight)**:用戶不是「每個人來打 prompt 燒 token」,而是 **大多數 buyer 來 browse 既有 catalog → 找到合適 → 買 Access**;只有少數 **creator** 在 catalog 找不到時才會 generate 自己的(procedural 免費,或自費 Tripo)。Tripo 的真實位置不是 service 的吃 token 工具,而是個別 creator 自願付費的 art tool
4. **Free tier 受限**:300 credits / 月 ≈ 3-5 次 P1 呼叫。user 決定不訂閱 $12/mo。在 reframe 後這個限制變得無關緊要 — Tripo 只在 demo 前 seed 階段被 team-as-creators 用一次,不在 demo 時被觀眾呼叫
5. **L2 Derivative 已於 D-013 deferred 到 v1.1**:之前 D-011 提到的「衍生創作 fork chest」demo scene 在 v1 不存在。需要新的 demo flow 主軸 — browse-first marketplace 自然填補這個位置

### Decision

#### 14.1 Tripo P1 接入 Phase 2(從 D-011 的 Phase 3 提前)

實作 `TripoGenerator` 接 Phase 1 已穩定的 `Generator` interface(`shared/src/types.ts`),參數固定為:

```ts
{
  model: "Tripo-P1",
  face_limit: 5000,
  smart_low_poly: false,  // P1 native low-poly,不需要
  texture: false,         // 省 credit 也省 Walrus 儲存
  output_format: "glb"
}
```

`AnthropicRouter` Phase 2 決策邏輯改為:

```
prompt → LLM 抽 shape + params
  ├─ shape ∈ procedural catalog (box/chest/cylinder/sphere/sword/hammer/platform)
  │   → ProceduralGenerator(免費,~10ms)
  └─ shape ∉ catalog
      → TripoGenerator(async polling,~2s,creator 自費)
```

#### 14.2 Demo flow 主路徑改 browse-first

Frontend 多一個 **Browse 頁**(`/`,demo 預設首頁):

1. 連 Sui indexer(GraphQL 或自寫 events query)抓所有 testnet 上的 `Model3D` objects
2. 渲染成 grid,每張卡片含 GLB preview(從 Walrus aggregator 抓)+ creator 地址 + 價格
3. 點卡片 → preview 全頁 + Connect Wallet → Buy Access(testnet SUI)
4. 「Generate New」是右上角次要 CTA,進到現有 generate 流程

Demo 主路徑(80% 觀眾):browse → buy。Generate 是 secondary path(20%,「creator 角度」),demo 走 procedural 即時生成,**不在 demo 時呼叫 Tripo**。

#### 14.3 Tripo seed-only operating mode

Tripo 呼叫策略:

- **Seed phase**(demo 拍片前 1 週):team-as-creators 用 free 300 credits 生 5-8 個英雄物件(複雜形狀:dragon、castle、ornate sword、phoenix、ancient_chest...),mint 為 Model3D 上 testnet,seed 進 Browse catalog
- **Demo phase**:Browse 看得到這些 Tripo 生成物,但 demo 不會再呼叫 Tripo API
- **Generate 路徑 demo 時**:LLM 即使 route 到 Tripo,前端遮蓋此分支或顯示「This shape is creator-only, contact creator」訊息

#### 14.4 SearchExistingCatalog 機制 v1 不做

理論上 Browse 應該 + 「搜尋既有 catalog 看有沒有合適的」功能(LLM 拿 prompt → 找最像的既有 Model3D)。**v1 不做**:

- Move struct 上 `Model3D` 加 `tags: vector<String>` 欄位,creator publish 時帶 tag(由前端從 LLM 抽 prompt 自動填,或手填)
- v1 frontend 只做純 Browse(list all + filter by tag),不做語意相似搜尋
- v1.1+:加 LLM 語意搜尋(embed prompt vs embed model description),或 backend indexer 加 prompt search

#### 14.5 Phase 3 demo scene 形態(G1/G2/G3)延遲決定

Phase 3 sample game scene(spec.md §6 Phase 3)的具體形態 — Trophy Room(G1)、Dress-up Mannequin(G2)、Mini-Adventure(G3) — 取決於 Phase 2 結束時 catalog 實際長什麼樣:

- 若 catalog 以靜態道具(sword / hammer / chest)為主 → G2 dress-up 自然
- 若 catalog 有大型場景物(dragon / castle)→ G1 trophy room 自然
- 若 catalog 多元 → G3 mini-adventure 串得起來但工作量最高

**留下單獨的 ADR(D-014a)在 Phase 2 結束(預計 5/29)後決定**。對應 open-question 條目見 `docs/open-questions.md` OQ-011。

### Rationale

- **Browse-first 解掉「人人燒 token」假設**:大多數 demo 觀眾不需要打 prompt,自然壓低 LLM + Tripo 雙重 API 成本
- **Tripo seed-only 解掉 free tier 限制**:5-8 次 / 月足夠 seed,demo 期間 Tripo 呼叫量為 0
- **Generator interface seam 不變**:Phase 1 設計的 `Generator` interface 直接吃 Tripo 實作,無重構成本
- **強化 Composable Creator Economy / Programmable IP Layer framing(D-001 vision)**:browse + buy Access + royalty 回 creator,這是真正在運作的 creator economy,不是 demo 假設
- **強化 Walrus track「verifiable memory layer」框架**:catalog 本身就是 Walrus + Sui 共同維護的可驗證歷史,每個 Model3D 都有鏈上 timestamp + Walrus content hash
- **tag 欄位 vs Search**:tag 欄位設計零成本(Move struct 多一個 field),保留未來 search 選項;v1 全部做完 search 是 over-scope,deferred 是務實
- **Phase 3 game scene 延後決定**:model 類型 → 適合的 game 形態,順序合理。先衝 Phase 2 再決定

### Alternatives Considered

- **Tripo 維持 Phase 3 decision point(D-011 原規劃)**:rejected — Phase 2 已知 P1 是現成 async API,提前接入 marginal cost ~0.5-1 day,Phase 3 才接會擠掉 game scene 時間
- **訂閱 Tripo $12/mo,Tripo 當主力 generator**:rejected — user 不採訂閱;且 user 即時打 prompt 燒 token 的 model 跟 browse-first reframe 衝突
- **完全不接 Tripo,Phase 2 純 procedural**:rejected — 7 個 procedural 形狀 demo 視覺仍不足以證明「real-world game asset」;Tripo seed 物件補足 catalog 視覺豐富度
- **Phase 2 直接做 SearchExistingCatalog**:rejected — LLM 語意搜尋複雜度高,v1 範圍應該先把 Browse + mint + buy 打通
- **Phase 2 用 Meshy.ai 取代 Tripo**:暫不採。Meshy 強項是 Rigging API,但 dress-up scene 用 Mixamo 預 rig 角色 + Tripo 靜態道具就夠。Rigging 留 v1.1
- **Phase 3 game scene 現在決定 G1/G2/G3**:rejected — 應該由 model 類型驅動 game 形態,順序不能反

### Consequences

- ✅ Phase 2 demo flow 從「打字 → 生成 → mint」升級為「browse → buy」+「creator 才需要 generate」雙路徑,符合真實 marketplace 行為
- ✅ Tripo 接入但呼叫成本可控(seed-only,不在 user-facing 路徑)
- ✅ `Model3D.tags: vector<String>` 欄位讓未來 search 可走 0 → indexer → semantic 三段升級,不會 schema migration
- ✅ Generator interface 設計被 Tripo 實際接入驗證
- ✅ Phase 3 game scene 推遲決定避免「先決定 game 再決定 model」的本末倒置
- ⚠️ Frontend 變兩頁(Browse + Generate)— UI 工作量略增。Vite + React 已 scaffold,實作 ~1 天
- ⚠️ Sui indexer query 是 Phase 2 新增工作項。GraphQL endpoint 或自寫 events query 都行
- ⚠️ Tripo P1 async polling client(submit → poll task_id → download GLB)是新代碼,~0.5 天
- ⚠️ Seed 物件 5-8 個的選題 + 命名 + tag + LicenseTerms 設定需要 day-0 規劃,寫進 Phase 3 任務清單
- 🔮 v1.1:LLM 語意搜尋上線後,Tripo 從 seed-only 升級為 creator-on-demand,前端 unblock Tripo generate 分支
- 🔮 v1.1:tag → 用戶可以 filter / search by tag,或加 collections 概念

### Related

- **spec.md** 改動:§1.7 agent layer 第 3 個 bullet(Generator selection)+ §6 Phase 2 任務清單 + §6 Phase 3 sample game scene 段
- **open-questions.md**:OQ-011(Phase 3 game scene 形態,待 Phase 2 結束)+ OQ-012(catalog search 機制 v1.1+)
- **Move struct**:`Model3D` 加 `tags: vector<String>` 欄位 — Phase 2 寫合約時加入
- **Related decisions**:builds on D-001(creator economy framing 在 v1 真實落地)、D-011(Tripo 提前到 Phase 2)、D-013(v1 scope refocus — browse-first 跟 5 賣點 framing 完全一致)、D-006(GLB only — Tripo 也是 GLB native)
- **research artifact**:Tripo API research 2026-05-14 by `ce-web-researcher` — 顯示 face_limit / smart_low_poly / texture=false 都可用,P1 ~2s

---

## D-015: Model3D Move struct schema amendments — `tags` + `lineage_blob_id`

**Status**: Accepted
**Date**: 2026-05-14
**Phase**: Phase 2 (Sui Integration) — U2 precursor
**Amends**: `docs/spec.md` §2.8 `Model3D` struct and `publish()` function signature

### Context

D-014 already specified that `Model3D` gains a `tags: vector<String>` field for the Browse marketplace tag-filter. But the 6-persona doc review of `docs/plans/2026-05-14-002-feat-phase-2-sui-integration-plan.md` surfaced a second schema gap: **the lineage Walrus blob has no on-chain reference back to the Model3D it describes** (Feasibility reviewer, anchor 100).

The plan uploads `lineage.json` alongside the GLB in one Walrus write batch, but the publish PTB only passes the GLB Blob object to `publish_and_share`. The lineage blob ID is therefore orphan — judges (and the D-011 "verifiable memory layer" pitch claim) cannot prove which lineage record belongs to which Model3D from on-chain data alone.

### Decision

Amend `Model3D` struct to add two new fields beyond spec §2.8:

- `tags: vector<String>` (already captured in D-014)
- `lineage_blob_id: String` — Walrus blob ID (string form, not the Blob object) of the lineage.json companion blob

Amend spec §2.8 `publish()` signature to accept both as parameters:

```move
public fun publish(
    blob: Blob,
    shape_type: String,
    params_json: String,
    name: String,
    tags: vector<String>,            // new (D-014 + D-015)
    lineage_blob_id: String,         // new (D-015)
    direct_access_price: u64,
    is_encrypted: bool,
    license: LicenseTerms,
    clock: &Clock,
    ctx: &mut TxContext,
): Model3D
```

### Rationale

- **`lineage_blob_id: String` not `Blob`**: the lineage blob's storage commitment is short (Phase 2 hardcodes ~10 epochs; lineage is metadata not value content) and we do not need on-chain `Blob` lifecycle on it. Storing just the ID keeps gas low and avoids "lineage blob got burned but Model3D thinks it still exists" lifecycle confusion. Trade-off: if the lineage blob expires, the verifier sees a 404 from Walrus aggregator but the Model3D still works. Acceptable for v1.
- **`tags: vector<String>` not `String` CSV**: native Sui type, queryable from GraphQL `objects(filter: { type, hasField: ... })` if needed, no client-side CSV parsing.
- **Both as parameters to `publish()`, not derived**: creator supplies them; LLM router can pre-fill tags from prompt analysis (per D-014).

### Alternatives Considered

- **Lineage in `ModelPublished` event only** — rejected: events are not queryable on the object itself, only via event index. Browsers loading Model3D objects directly (Sui Explorer, custom indexers) wouldn't see lineage.
- **Skip lineage upload entirely in v1** — rejected: defeats D-011 "verifiable memory layer" framing which is the Walrus track's stated ask.
- **`lineage_blob: Blob` (full object wrapping)** — rejected: extra storage gas, extra burn/extend lifecycle complexity for metadata that's effectively read-only.

### Consequences

- ✅ Lineage blob is on-chain queryable: any holder of Model3D object ID can resolve `lineage_blob_id` and fetch from Walrus aggregator
- ✅ Spec §2.8 needs amendment (one-line addition to `publish()` signature + 1 field on Model3D struct)
- ⚠️ Lineage blob lifecycle is independent of Model3D — creator must keep its Walrus storage active if they want lineage to remain resolvable
- 🔮 v1.1+ may add `lineage_blob_id` setter (e.g., creator updates lineage to amend metadata) — out of scope for v2

### Related

- spec.md §2.8 (amend Model3D struct + publish() signature)
- D-014 (introduced tags field; this ADR adds lineage_blob_id alongside)
- D-011 (verifiable memory layer framing — this ADR delivers the on-chain link)
- Plan-002 U2 + U7 (implementation)

---

## D-016: `publish_and_share` entry pattern + `purchase_model_access` naming + `duration_ms` retention + Phase 4 Kiosk-coexistence caveat

**Status**: Accepted
**Date**: 2026-05-14
**Phase**: Phase 2 (Sui Integration) — U2 precursor

### Context

Three coupled Move design decisions surfaced by plan-002 + 6-persona doc review:

1. **Model3D ownership model for Phase 2**: Buyers (Wallet B) need to call a public entry function against creator's (Wallet A) Model3D. Sui ownership rules require either shared-object (anyone can pass `&Model3D` to entry function) OR Kiosk-mediated access (Kiosk takes ownership, Phase 4). Phase 4's Kiosk integration is D-013 must-have but out of scope for Phase 2.

2. **Entry function naming**: Earlier plan draft used `purchase_access`; spec §2.8 uses `purchase_model_access`. Discrepancy surfaced by Feasibility reviewer.

3. **Subscription readiness**: Spec §2.8 `purchase_model_access` includes `duration_ms: u64` parameter (Access can expire). Earlier plan draft dropped this. Re-adding it after testnet deploy requires Move package redeploy.

### Decision

**16.1 — Entry function**: Public entry `publish_and_share(...)` wraps internal `publish() + transfer::share_object(model)`. Phase 2 `Model3D` is always shared. Buyer calls `purchase_model_access(&Model3D, Coin<SUI>, duration_ms, &Clock, ctx)` against the shared object.

**16.2 — Naming**: Use `purchase_model_access` (spec §2.8) not `purchase_access`. Parallels future `purchase_derivative_access` in v1.1 (D-013 deferred).

**16.3 — Signature**: Keep `duration_ms: u64` in `purchase_model_access`. Phase 2 frontend always passes `0n` (permanent Access). Phase 4 / v1.1 subscription support can use the existing signature without Move package redeploy.

**16.4 — Phase 4 Kiosk coexistence caveat**: Sui Kiosk requires items to be owned (placed into a Kiosk that owns them). A shared-object Model3D cannot be retroactively placed in a Kiosk. Phase 4 will either:
- (a) Accept a bifurcated catalog: Phase 2 mints stay shared + Phase 4 mints go through Kiosk; Browse must query both shapes
- (b) Ship a migration helper that re-mints Phase 2 models inside Kiosks (loses original mint timestamp + creator tx hash)

Decision deferred to Phase 4 ADR (open question OQ-013).

### Rationale

- **Shared-object for Phase 2 buyer flow**: simplest path; works with `&Model3D` immutable reference; allows parallel purchases (P2 in plan-002).
- **`purchase_model_access` name parity**: prevents Phase 4 from having to rename or live with asymmetric L1/L2 entry-function naming when v1.1 Derivative ships.
- **`duration_ms` retention**: trivial cost now (1 u64 param, frontend passes 0n); forward-compatible with subscription pricing without Move upgrade.
- **Kiosk caveat documented now**: P1 decision is load-bearing for Phase 4; surfacing the trade-off prevents Phase 4 from rediscovering it under pressure.

### Alternatives Considered

- **`transfer::transfer(model, creator)` + creator-side Kiosk in Phase 2**: rejected — Phase 2 has no Kiosk infrastructure, would require Phase 4 work up front.
- **Drop `duration_ms` in Phase 2, add in Phase 4**: rejected — Move package redeploy on testnet is allowed but loses Phase 2 catalog testnet objects.
- **Rename `purchase_model_access` → shorter `purchase_access` for Phase 2 readability**: rejected — Feasibility reviewer correctly flagged that v1.1 L2 symmetry breaks.

### Consequences

- ✅ Phase 2 buyer flow trivially implementable (shared object + entry function)
- ✅ `duration_ms` reserved in signature; Phase 4 subscription work unblocked without redeploy
- ⚠️ Phase 4 Kiosk integration must explicitly address the shared-vs-kiosked bifurcation (OQ-013)
- ⚠️ Phase 4 redesign may invalidate Phase 2 testnet objects if migration approach is taken; demo videos referencing Phase 2 testnet object IDs may break
- 🔮 v1.1 Derivative entry functions inherit the `purchase_*_access` naming pattern

### Related

- spec.md §2.8 (`publish` + `purchase_model_access` signatures)
- D-002 (3-tier architecture — L1+Access shipped, L2 deferred)
- D-013 (Kiosk promoted to Phase 4 must-have; this ADR explicates the Phase 2/4 boundary)
- OQ-013 (Phase 4 Kiosk coexistence — defer decision)
- Plan-002 U2 + U7 + U9 (implementation)

---

## D-018: Move-level input bound assertions on `Model3D` publish fields

**Status**: Accepted
**Date**: 2026-05-14
**Phase**: Phase 2 (Sui Integration) — U2 precursor

> Decision number jumps from D-016 → D-018 deliberately: D-017 is reserved for the React Router 7 ADR which will be captured before U7 starts.

### Context

Security reviewer + Adversarial reviewer + Feasibility reviewer all flagged that the plan's Move entry function `publish_and_share` accepts unbounded `tags: vector<String>`, `params_json: String`, `name: String`, and `lineage_blob_id: String` (the last per D-015). Frontend zod caps `tags` at 10 and `params_json` indirectly via discriminated-union shape, but any wallet can call `publish_and_share` directly via `sui client call` and pass arbitrary-size vectors / strings.

Risks:
- DoS via 1000-element tags vector (gas + on-chain object bloat)
- Stored-XSS-ish via 10MB params_json (browser memory peak when ModelDetailPage renders it)
- Browse page performance degradation from oversized objects

### Decision

Add Move-level assertions to `publish()` (called from `publish_and_share`):

```move
assert!(vector::length(&tags) <= 16, ETooManyTags);
let i = 0;
let n = vector::length(&tags);
while (i < n) {
    assert!(string::length(vector::borrow(&tags, i)) <= 32, ETagTooLong);
    i = i + 1;
};
assert!(string::length(&params_json) <= 4096, EParamsJsonTooLong);
assert!(string::length(&name) <= 128, ENameTooLong);
assert!(string::length(&lineage_blob_id) <= 128, EBlobIdMalformed);
```

Add error constants:
- `ETooManyTags = 10`
- `ETagTooLong = 11`
- `EParamsJsonTooLong = 12`
- `ENameTooLong = 13`
- `EBlobIdMalformed = 14`

### Rationale

- **Move enforces, frontend zod *re-enforces***: defense in depth. Frontend zod gives faster failure UX; Move backstop catches direct-call bypass.
- **Numeric limits**:
  - 16 tags: D-014 expected use is 3-8 tags per model; 16 leaves 2× headroom
  - 32 chars/tag: typical short labels ("fantasy", "weapon", "low-poly"); arbitrary cap based on UX-reasonable length
  - 4096 chars params_json: largest realistic param object (sword with 4 sub-meshes worth of float fields) is ~1KB; 4× headroom
  - 128 chars name: enough for "Sir Galahad's Sword of the Eternal Phoenix" with room to spare
  - 128 chars lineage_blob_id: Walrus blob IDs are ~50 chars (base58); 128 leaves headroom for future Walrus encoding changes

### Alternatives Considered

- **No Move-level cap, rely on zod only**: rejected per Security reviewer — direct `sui client call` bypass is trivial to construct.
- **Tighter caps (e.g., 8 tags, 64-char name)**: rejected — Phase 2 UX caps may grow in Phase 3 polish; want headroom.
- **Move-level cap on raw byte count not codepoint count**: rejected — `string::length` returns byte count for UTF-8 strings, which is what we want; the BCS-serialized Move String is byte-counted natively.

### Consequences

- ✅ Phase 2 contract is grief-resistant for the most obvious abuse paths
- ✅ Test surface: 5 new error-path tests in `contracts/model3d/tests/model3d_tests.move`
- ⚠️ Adjusting the limits later (e.g., extending tag cap to 20) requires Move package redeploy
- 🔮 v1.1 may add a separate `update_metadata` entry that loosens caps if real usage warrants

### Related

- spec.md §2.8 (`publish` function — caller must respect these caps)
- D-015 (introduced `lineage_blob_id` field; this ADR caps its length)
- Plan-002 U2 (implementation)

---

## D-019: `@mysten/sui@2.16.2` SDK split — `SuiClient` → `SuiJsonRpcClient` + `SuiGrpcClient`

**Status**: Accepted
**Date**: 2026-05-14
**Phase**: Phase 2 (Sui Integration) — surfaced during U3 implementation
**Amends**: `docs/spec.md` §2.5 SDK example

### Context

Plan-002 U3 implementation (Walrus frontend wiring) hit a build error: spec.md §2.5 code sample imports `SuiClient` from `@mysten/sui/client`, but the D-008-pinned `@mysten/sui@2.16.2` no longer exports `SuiClient` from that subpath. The SDK has been split:

- `SuiJsonRpcClient` from `@mysten/sui/jsonRpc` — JSON-RPC client (Phase 2 default)
- `SuiGrpcClient` from `@mysten/sui/grpc` — gRPC client (faster; JSON-RPC client deprecated July 2026 per CLAUDE.md stack notes)

Additionally, the `walrus()` extension factory no longer accepts a `network: 'testnet'` option in its config — it reads from `client.network` directly. Network selection now flows through `new SuiJsonRpcClient({ network: 'testnet', url: getJsonRpcFullnodeUrl('testnet') })`.

### Decision

For Phase 2 (testnet): use **`SuiJsonRpcClient`** from `@mysten/sui/jsonRpc`. Construction pattern:

```ts
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { walrus } from '@mysten/walrus';
import walrusWasmUrl from '@mysten/walrus-wasm/web/walrus_wasm_bg.wasm?url';

const client = new SuiJsonRpcClient({
  network: 'testnet',
  url: getJsonRpcFullnodeUrl('testnet'),
}).$extend(walrus({
  wasmUrl: walrusWasmUrl,
  uploadRelay: {
    host: 'https://upload-relay.testnet.walrus.space',
    sendTip: { max: 1_000 },
  },
}));
```

Defer the `SuiGrpcClient` migration to a separate v1.1+ task (the deprecation deadline is July 2026 — after Phase 5 submission). Adopting gRPC pre-submission would invalidate every U3..U9 import path for marginal Phase 2 benefit.

### Rationale

- **Source-of-truth hierarchy** (CLAUDE.md): live primary sources (npm registry actual exports) outrank `docs/spec.md`. U3 was right to follow the SDK's actual API rather than the stale spec sample.
- **JSON-RPC for Phase 2**: testnet GraphQL endpoint (P7) is the primary indexer path for U8 Browse; JSON-RPC client is what every other Sui ecosystem app currently uses; gRPC client adoption is a v1.1+ migration concern.
- **Walrus extension network read**: the simpler API surface (network goes in one place — the SuiClient constructor — instead of being duplicated) is actually cleaner. spec.md §2.5's two-place network specification was the older 1.x SDK pattern.

### Alternatives Considered

- **Adopt `SuiGrpcClient` now**: rejected — touches every Sui SDK import path; no Phase 2 benefit; deprecation deadline (July 2026) is post-submission.
- **Pin to older `@mysten/sui@1.x` that still exports `SuiClient` from `/client`**: rejected — would cascade-break the @mysten/walrus + dapp-kit + enoki + slush lock that D-008 establishes.

### Consequences

- ✅ U3 implementation pattern propagates cleanly to U4 (dApp Kit), U7 (creator PTB), U8 (Browse GraphQL), U9 (buyer PTB)
- ✅ Spec.md §2.5 amended to match SDK reality
- ⚠️ U7/U8/U9 plan-002 PTB pseudo-code still says `import { SuiClient } from '@mysten/sui/client'` — those samples are directional pseudo-code per the plan's "this illustrates the intended approach, not implementation specification" framing. Implementers should follow this ADR, not the plan pseudo-code, for actual imports.
- 🔮 v1.1+: migrate to `SuiGrpcClient` ahead of the JSON-RPC deprecation deadline. Single ADR per migrated unit.

### Related

- spec.md §2.5 (amended to match)
- D-008 (SDK version lock — D-019 doesn't break the lock; it's a refinement within the locked version)
- Plan-002 U3 (initial surfacing); U4, U7, U8, U9 (downstream alignment)
- CLAUDE.md "Stack at a Glance" stack notes mention `@mysten/sui/grpc` `SuiGrpcClient` — accurate but Phase 2 stays on JSON-RPC

---

## D-017: Adopt `react-router-dom@7.5.x` for `/`, `/generate`, `/model/:id` routes

**Status**: Accepted
**Date**: 2026-05-15
**Phase**: Phase 2 (Sui Integration) — before U8 / U7 / U9

### Context

Per D-014 (Browse-first marketplace), Phase 2 frontend grows from a single Generate page to three top-level routes:
- `/` → Browse marketplace (U8)
- `/generate` → Creator flow (U7, was Phase 1's `/`)
- `/model/:objectId` → Model detail + buy access (U9)

Plan-002 calls out `react-router-dom@7` adoption + risk R8 (latest major API surprises) + scope-guardian SG-005 (new dependency needs ADR + version pin). The doc-review patches confirmed an exact-pinned `7.5.x` per D-008 discipline (no floating minor for demo-critical deps).

### Decision

Add `react-router-dom@7.5.x` (exact-pinned) to `frontend/package.json`. Use the imperative `BrowserRouter` + `Routes` + `Route` + `Link` + `useParams` pattern. No data loaders or actions (those are RR7 features that would add complexity without Phase 2 benefit).

Routing infrastructure ships in U8 (`frontend/src/App.tsx` becomes a `<BrowserRouter><Routes>...</Routes></BrowserRouter>` shell). U7 + U9 add their respective `<Route>` entries to the same `Routes` block.

### Rationale

- **vs. hash-router (manual)**: RR7 is mainstream, supports deep linking out of the box (judges can paste `/model/0x...` URLs), and reduces UI surface invented from scratch.
- **vs. conditional-rendering single-page**: D-014 wants Browse as the default page and Generate as a secondary CTA; URL-distinct routes are the natural way to express that, both for users and for analytics/sharing.
- **vs. older `react-router-dom@6`**: `react-router-dom@7` is the current stable release as of 2026-05-15; downgrading just to dodge "latest major" risk is a false economy — the 6 → 7 migration is well-documented and our usage stays within stable API surface (`BrowserRouter`, `Routes`, `Route`, `Link`, `useParams`).
- **Exact-pin `7.5.x`**: matches D-008 discipline for demo-critical deps. Plan R8 explicitly flagged the floating-minor risk.

### Alternatives Considered

- **Hash routing via custom hook**: rejected — three routes is enough that the saved bundle is small; URL aesthetics matter for demo screenshots.
- **TanStack Router**: rejected — adds complexity, learning curve, and 25KB bundle for marginal Phase 2 benefit.
- **`@mysten/dapp-kit` provides routing**: false — dapp-kit only provides wallet context, no routing primitives.

### Consequences

- ✅ Three clean routes; deep links work for share/screenshot
- ✅ U8 sets up the routing shell once; U7 + U9 are tiny additions
- ⚠️ Bundle adds ~10KB gzipped — acceptable; bundle code-split for `/generate` and `/model/:id` mitigates per plan R13
- ⚠️ Tests using `render()` from `@testing-library/react` now need wrapping in `<MemoryRouter>` for components that use `useParams` or `<Link>` — small test helper acceptable
- 🔮 Phase 4+ may adopt RR7 data loaders for `/model/:id` (currently uses hook-based fetch) — out of scope for v1

### Related

- spec.md §4 (frontend stack)
- D-008 (SDK lock discipline — applies to non-Mysten deps too for demo stability)
- D-014 (Browse-first marketplace, three routes)
- Plan-002 R8 (RR7 risk), R13 (bundle size code-split), SG-005 (ADR + pin)
- U8 ships routing infra; U7 + U9 add their routes

---

# Reserved Decision Numbers

D-020 onwards: captured in real-time per `CLAUDE.md` Decision Capture protocol.
