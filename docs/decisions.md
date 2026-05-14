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

# Reserved Decision Numbers

D-014 onwards: captured in real-time per `CLAUDE.md` Decision Capture protocol.
