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

**Status**: Partially superseded by D-029/D-030 — the `Access` struct was deleted in v3 (2026-05-20); its soulbound-receipt role is re-anchored to `NftCollectionCreatorCap`. The Model3D base + composable-derivative intent stand.
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

**Status**: Superseded by D-029 (2026-05-20 — L2 collection layer un-deferred; nftCreator becomes a real v1 actor). The Kiosk-promotion and narrowed-framing parts of this decision still hold; only the "L2 deferred to v1.1" clause is reversed.
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

**Status**: Superseded by D-032 (2026-05-20) — Phase 4 had already replaced `publish_and_share`/`purchase_model_access` with the Kiosk-on-`Model3D` path; D-032 in turn removes that path, returning `Model3D` to a shared object (`publish`) with Kiosk/ownership-sale living only on L2 `NftToken`.
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

## D-020: Phase 3 demo pivot — Collection Forge + Tiny Racetrack (replaces "sample game scene")

**Status**: Accepted
**Date**: 2026-05-15
**Phase**: Phase 3 (Real-World Application) — before plan-003 runs

### Context

`docs/spec.md` §6 Phase 3 lists the deliverable as "sample game scene that loads 3D models from Walrus." This framing is correct as a Walrus-track demo but thin as a creator-economy showcase — it demonstrates "Walrus serves 3D assets" but not "creators ship products buyers want." User ideation 2026-05-15 surfaced a stronger frame: a 3D-NFT-collection minting tool (Collection Forge) paired with an Access-gated game asset consumer (Tiny Racetrack), demoing the full L1→Walrus→L3 economic loop in 90 seconds.

D-013 cut L2 Derivative for v1, so the "collection" concept must use **sibling L1 Model3Ds with shared collection-identifier tags**, not L2 Derivative.

**OQ-D2 resolved 2026-05-15 by `@mysten/walrus@1.1.7` source read** (not testnet spike): `writeFilesFlow.listFiles()` returns N elements all sharing one `blobId` + `blobObject` — a quilt is **one** Sui Blob object with N internal byte-range patches. Path A (N independent Sui Blob objects per upload) does not exist. Collection Forge therefore requires a Move contract change. Two architecture variants (B.ii Collection wrapper + N Model3Ds vs B.iii single Model3D + variant-indexed Access) — see brainstorm OQ-D6.

**Testnet deploy block resolved 2026-05-15** (Sui Overflow mod response): upstream `MystenLabs/walrus@testnet:contracts/walrus/` is the source tree, not the deployed artifact. Deployed-package metadata lives at `MystenLabs/walrus@main:testnet-contracts/walrus/Published.toml` (Sui CLI 1.72.1 reads it natively). One-line Move.toml fix unblocks `sui client publish`. Captured as D-021. So Phase 3's required redeploy (per OQ-D6) is no longer a hard blocker.

### Decision

Replace the spec.md §6 Phase 3 "sample game scene" deliverable with a two-app pair:

1. **Collection Forge** (`/forge`) — creator-side tool that mints N (≤ 16) sibling Model3D NFTs from one base mesh + per-variant material specs, in a single Walrus quilt + a single Sui PTB.
2. **Tiny Racetrack** (`/track`) — buyer-side arcade racing demo. Detects owned Access receipts, lets player pick a car variant, loads its GLB from Walrus, and drops it on a bounded oval track with Havok rigid-body physics + WASD controls + chase camera. v1 scope locked: no opponents, no lap timer, no leaderboard, no sound (per brainstorm OQ-D5).

Full spec lives in `docs/brainstorms/2026-05-15-collection-forge-requirements.md`. Plan to be produced from that doc.

### Rationale

- **Demo punch**: the original "sample game scene" demos ~30 sec of read-side capability. Forge + Arena demos a 90-sec full economic loop (mint → browse → buy → use) with two wallets. This is the centerpiece pitch-video segment.
- **Walrus track alignment**: showcases **writeFilesFlow quilt batching** (OQ-014 / docs/solutions) — N variants in one Walrus upload with 2 wallet popups regardless of N. This is a Walrus-specific feature; the original framing didn't surface it.
- **Sui Move alignment**: showcases **PTB composability** — one PTB with N `publish_and_share` calls minting an entire collection atomically. This is a Sui-specific feature.
- **D-013 compliance**: variants are L1 siblings via shared tags, not L2 Derivatives. Zero scope reopening.
- **Move change is required, not assumed-away**: OQ-D2 resolution killed Path A. Phase 3 needs a Move contract change (B.ii or B.iii — see brainstorm OQ-D6). Mitigated by D-021 (deploy block resolved): the redeploy step is now mechanical rather than a fork-and-clone investigation.
- **Real-world recognizability**: "16-variant NFT collection" is a pattern judges and audience already understand (BAYC, Azuki, Pudgy Penguins). "Sample game scene" is a hackathon-ism.

### Alternatives Considered

- **Keep the original "sample game scene"**: rejected — read-side-only demo doesn't justify the Phase 3 budget (~10 days) given Phase 2 already covers reads via `/browse`.
- **Single-app pivot (Collection Forge only, no Tiny Racetrack)**: rejected — Forge alone doesn't demo L3 Access gating. The pair makes the L3 receipt visible in a tangible way (only owned variants appear in arena).
- **Two unrelated demos (NFT shelf + racing game per user's original concept)**: rejected — splits the demo narrative; doesn't naturally show creator-economy loop in one continuous arc.
- **Push to L2 Derivative composability via Collection Forge** (variants as derivatives, royalty to base): rejected — would reopen D-013 mid-hackathon. The "sibling tags" framing preserves all v1 scope and still produces a strong demo.

### Consequences

- ✅ Phase 3 deliverable now ships a complete creator-economy demo, not just a Walrus read-side capability sample.
- ✅ Showcases two Sui/Walrus-specific features (PTB composability + quilt batching) that JSON-RPC NFT marketplaces can't replicate.
- ✅ Tiny Racetrack retains the read-side Walrus demo angle the original framing wanted.
- ⚠️ OQ-D6 resolved → **B.ii** (Collection wrapper + N Model3D objects). Plan-003 builds on this Move shape. Frontend churn is minor (existing Phase 2 Browse + ModelDetail + Buy components still apply).
- ⚠️ OQ-D1 resolved → **Car** (Tripo). One Tripo call per collection (~60-120 credits); N paint variants are material-swaps with no additional Tripo cost. Tripo free-tier budget has large headroom.
- ⚠️ Tiny Racetrack scope locked → **L2 driveable, minimum-viable**: WASD + Havok rigid body + bounded oval track + chase camera + hard-wall stop. Excluded: opponents, lap timer, leaderboard, multiplayer, drift, jump, damage, SFX, wheel-spin animation. ~3 day target; if it grows beyond 4 days, descope rather than slip Phase 3.
- 🔮 Post-hackathon: Forge becomes the production "collection minter" creator tool. Arena becomes the reference "game integration" example for third parties.

### Related

- `docs/brainstorms/2026-05-15-collection-forge-requirements.md` — full spec, AE1-AE5, OQ-D1..D5
- `docs/spec.md` §6 Phase 3 — to be amended once plan-003 exists
- D-001, D-002, D-013 — composable creator economy framing; L2 Derivative deferred to v1.1+
- D-006 — GLB-only constraint applies to Forge output
- D-014 — LLM-extracted tags; Forge prepends collection-identifier tags before passing to `publish_and_share`
- D-016 — `publish_and_share` is the Phase 3 mint entry; reused N times per PTB in F1
- OQ-013 — Phase 4 Kiosk coexistence; Forge does NOT integrate with Kiosk in v1 (accepted tradeoff per D-016)
- OQ-014 (resolved) — writeFilesFlow quilt batching; the underlying capability Forge depends on
- D-021 (pending capture) — testnet Walrus dep subtree fix; unblocks Phase 3 redeploy

---

## D-021: Walrus testnet dep — switch to `testnet-contracts/walrus@main` subtree

**Status**: Accepted
**Date**: 2026-05-15
**Phase**: cross-phase — resolves the parked Phase 2 testnet deploy block + unblocks Phase 3 redeploy required by D-020 / OQ-D6
**Verified**: `sui client publish --dry-run` succeeded 2026-05-15 PM (was rejecting with "unpublished dependencies: WAL, Walrus" prior to this fix)

### Context

Phase 2 hit a testnet deploy block: `sui move build` + `sui move test` worked locally, but `sui client publish` aborted with `Error: unpublished dependencies: WAL, Walrus`. Initial diagnosis traced this to Walrus's upstream `Move.toml` at `MystenLabs/walrus@testnet:contracts/walrus/` declaring `walrus = "0x0"` with no `[package] published-at` field. Three resolution paths were captured in `docs/solutions/integration-issues/walrus-wal-published-at-deploy-block-2026-05-15.md` — all of them involved a fork or local-clone with a patched Move.toml.

The diagnosis was wrong about the cause. Per Sui Overflow mod response 2026-05-15 AM, the upstream subtree `contracts/walrus@testnet` is the **source tree** (it intentionally has `walrus = "0x0"` because it gets re-published on upgrades). The **deployed-artifact metadata** lives at a different subtree: `MystenLabs/walrus@main:testnet-contracts/walrus/`. Each subdirectory there carries a `Published.toml` sibling next to `Move.toml` — the modern Sui Move split between "what is this package" (Move.toml) and "where is it published per chain" (Published.toml). Sui CLI 1.72.1 reads `Published.toml` natively. The fix is a one-line `subdir` + `rev` change in our `Move.toml`, no fork or local-clone needed.

Verified externally before applying:
- `https://raw.githubusercontent.com/MystenLabs/walrus/main/testnet-contracts/walrus/Published.toml` returns `chain-id = "4c78adac"`, `original-id = "0xd84704c1..."`, `published-at = "0x849e95d2..."`, `version = 3`
- `https://raw.githubusercontent.com/MystenLabs/walrus/main/testnet-contracts/wal/Published.toml` returns the WAL package at `0x8270feb7...`, `version = 1`

The mainnet equivalent subtree is `mainnet-contracts/walrus/` on the same `main` branch — relevant for D-009 (mainnet by 8/27 for 100% prize).

### Decision

In `contracts/model3d/Move.toml`, replace the Walrus dep stanza:

```toml
# Before — pointed at the source subtree on the testnet branch
[dependencies]
Walrus = { git = "https://github.com/MystenLabs/walrus.git", subdir = "contracts/walrus", rev = "testnet", override = true, override-addresses = { walrus = "0xd84704...", wal = "0x8270feb7..." } }
```

```toml
# After — points at the deployed-artifact subtree on main
[dependencies]
Walrus = { git = "https://github.com/MystenLabs/walrus.git", subdir = "testnet-contracts/walrus", rev = "main" }
```

WAL flows transitively from the new subtree's Move.toml (`WAL = { local = "../wal" }`); no separate WAL entry needed in our `[dependencies]`. The `override = true` and `override-addresses` workarounds are removed — they were patching the symptom of pointing at the wrong subtree.

When Phase 3 produces the actual deployed `MODEL3D_PACKAGE_ID`, run real publish (drop `--dry-run`):

```bash
cd contracts/model3d
sui client publish --gas-budget 200000000
```

For mainnet (Phase 5, D-009), switch the subdir to `mainnet-contracts/walrus` and rev stays `main`.

### Rationale

- **Source-of-truth hierarchy** (CLAUDE.md): the mod is a primary source for Mysten's own deployment conventions, outranking our own reverse-engineering. The signal we missed: when an upstream package's `Move.toml` looks "broken" relative to expectations, it's worth asking whether we're reading the wrong subtree before assuming the upstream is missing metadata.
- **Native CLI support**: Sui CLI 1.72.1 already understands `Published.toml`. No CLI upgrade, no MVR registry adoption, no fork, no local-clone. The fix is in our manifest, not in the toolchain.
- **Portability**: `Move.lock` resolves cleanly to a public git tree. No local paths leak into the lockfile (which was a downside of the alternative `local = "..."` resolutions).
- **Forward-compatible with mainnet**: same mechanism for both networks; only the subdir name changes (`testnet-contracts` ↔ `mainnet-contracts`). D-009's mainnet flip is a one-line swap.
- **Verified end-to-end before commit**: `sui move build` clean, all 21 Move tests pass, `sui client publish --dry-run` reports `execution status: success` with an estimated gas cost of ~0.0285 SUI.

### Alternatives Considered

The three previously-investigated paths in `docs/solutions/integration-issues/walrus-wal-published-at-deploy-block-2026-05-15.md` — all rejected in favor of this fix:

- **(a) Fork Walrus + WAL, patch Move.toml with `published-at` in the fork**: rejected — requires fork maintenance, drift risk on upgrades, no Mysten support for the fork.
- **(b) Local-clone + patch + `local = "../walrus-fork/..."` deps**: rejected — `local` paths leak into `Move.lock`, breaking portability across machines/CI.
- **(c) Wait for newer Sui CLI / MVR registry**: previously concluded as blocked because 1.72.1 was the latest and MVR alias syntax was rejected — this conclusion was correct but moot: the problem wasn't CLI version, it was wrong subtree.

### Consequences

- ✅ Testnet deploy block officially resolved. Dry-run publish succeeds with no warnings about unpublished dependencies.
- ✅ Phase 3's required Move contract change (D-020 / OQ-D6 — Collection wrapper or Variant-indexed Access) can redeploy without re-investigation.
- ✅ Mainnet deploy path (D-009) becomes a one-line change at flip time.
- ✅ The dev-channel outreach drafted in `phase-progress.md` is unnecessary; can be deleted from that doc.
- ⚠️ The previous `docs/solutions/integration-issues/walrus-wal-published-at-deploy-block-2026-05-15.md` is now a historical investigation record, not active guidance. Update with a "RESOLUTION 2026-05-15 PM" header so `ce-learnings-researcher` surfaces the fix, not the false starts.
- ⚠️ The `contracts/model3d/README.md` deploy instructions need a small refresh (drop `override-addresses` from any sample, point at this ADR).
- 🔮 Watch for upstream changes — if Walrus is upgraded again on testnet, `published-at` in the upstream Published.toml will update to the new version. Re-pull (`Move.lock` regen) will pick it up automatically; no Move.toml edit needed.

### Related

- `contracts/model3d/Move.toml` — the actual one-line change
- `docs/solutions/integration-issues/walrus-wal-published-at-deploy-block-2026-05-15.md` — to be updated with resolution
- `docs/phase-progress.md` — "Pending Sui dev-channel outreach" section to be removed
- D-008 — SDK version lock (D-021 is consistent: same Walrus version, just correct subtree)
- D-009 — testnet for 6/21, mainnet by 8/27. D-021's mechanism handles both networks symmetrically.
- D-020 / OQ-D6 — Phase 3 Collection Forge requires a Move contract change + redeploy. D-021 makes that redeploy mechanical.
- D-014 / `Model3D` indexer expectations — no impact; Walrus testnet package address `0x849e95d2...` (current version 3) is what the indexer should reference, not the `0xd84704c1...` (original-id, version 1) we'd been documenting. Update indexer config if any path references the old address.

---

## D-022: Adopt `@babylonjs/havok` for Tiny Racetrack rigid-body physics

**Status**: Accepted
**Date**: 2026-05-16
**Phase**: 3 (Real-World Application — Tiny Racetrack scene per D-020)

### Context

Plan-003 U6 introduces a buyer-side `/track` route — a Babylon scene loading the buyer's owned car GLB, with WASD-driven rigid-body motion, hard-wall collisions, and a chase camera. Phase 2 Babylon scenes are static previews (no physics). To get arcade-grade driving (acceleration, steering, wall stops) we need a physics engine that ships a Babylon plugin and supports browser WASM execution.

The candidate physics backends supported by Babylon 6.x are:
- **`@babylonjs/havok`** — Mysten-uses-Havok-only, ~500KB Havok WASM lazy-loadable, Babylon-team first-party plugin (`HavokPlugin`).
- **Ammo.js** — Bullet port, larger bundle, less reliable Babylon v2 physics integration as of 2026.
- **Cannon-es** — pure JS, no WASM, smaller bundle but materially slower at >100 rigid bodies; quality of vehicle dynamics is also weaker.

### Decision

Adopt `@babylonjs/havok` as the physics binding for the Tiny Racetrack scene. Load the WASM binary via Vite's `?url` import, mirroring the existing `@mysten/walrus-wasm` pattern in `frontend/src/walrus/walrusClient.ts:6`. Restrict the dependency to `/track` route only (lazy-load — do not eagerly import in `App.tsx`).

### Rationale

- Babylon-team-supported plugin → least integration friction
- WASM execution is fast enough at 60fps for a small bounded oval with 1 active rigid body + 4 walls
- Bundle impact (~500KB gzipped Havok WASM) is acceptable when lazy-loaded behind `/track` route
- Cannon-es vehicle dynamics are visibly less believable for the demo recording
- Hackathon timeline (6-8 days for Phase 3) — picking the path with the best documentation + Babylon Playground examples reduces R1 (Havok integration day-slip)

### Alternatives Considered

- **Cannon-es**: rejected — vehicle behavior less convincing; we don't need the bundle savings on a lazy route.
- **Ammo.js**: rejected — larger bundle than Havok, weaker integration story in Babylon 6.x.
- **No physics, scripted animation**: rejected — kills the "feel" of driving the variant you bought. The demo's emotional punch is wired into rigid-body behavior.

### Consequences

- ✅ U6 can implement WASD-driven car + wall collisions with first-party Babylon support.
- ✅ Lazy-loading keeps Browse / Forge / Collection routes free of Havok WASM (per Spike-C, those routes also avoid Walrus WASM).
- ⚠️ Adds a runtime dependency that must be present at deploy time — Phase 5 production build needs to verify the WASM URL resolves under the static hosting setup.
- ⚠️ Havok license is permissive but proprietary (free for use, source unavailable). Compliance with Sui Overflow's "open-source" requirement: same posture as `@mysten/walrus-wasm` (also Mysten-distributed binary).
- 🔮 If we ever need server-side physics for replay validation, Havok WASM also runs in Node — same binding works.

### Related

- D-020 — Phase 3 demo pivot to Tiny Racetrack (this dependency is U6's enabler)
- D-007 — drop `react-babylonjs`; use imperative Babylon (Havok integrates at the imperative layer)
- `docs/plans/2026-05-15-003-feat-phase-3-collection-forge-plan.md` § KTD-4 + R1 + U6
- `frontend/src/walrus/walrusClient.ts:6` — WASM `?url` precedent
- Babylon Havok docs: https://doc.babylonjs.com/features/featuresDeepDive/physics/usingPhysicsEngine

---

## D-023: Drop LLM router — prompt mode dispatches directly to Tripo

**Status**: Accepted
**Date**: 2026-05-16
**Phase**: 3 (Real-World Application)
**Supersedes**: narrows D-011 (LLM router as the agentic seam) and D-014 (LLM extracts tags). Both decisions remain partially intact: the `Router` interface stays in `shared/src/types.ts` as the seam for future expansion, but the only concrete implementation is now `HardcodedRouter`. `AnthropicRouter` is removed.

### Context

Phase 3's Forge UI (U4, plan-003) is the only surface that submits free-form prompts. The Forge frame is explicitly "generate a base car via Tripo" — N variants are produced by backend material swap, not by LLM routing. The router's only real-world decision in this flow is "should this prompt go procedural or Tripo?" — and the UI has already committed to Tripo before the prompt is submitted. The LLM call adds ~1 s latency, $0.001 per call, and a new failure mode (Anthropic outage / rate limit / quota) to every demo run, in exchange for zero behavioral value at this stage.

The cost of keeping the abstraction "for future use" is non-zero: two router implementations to maintain, parallel test paths, an `ANTHROPIC_API_KEY` env var every dev/CI environment must set, and one more piece of pitch surface ("we route with Claude") that has to be defended in Q&A. None of that earns its keep in v1.

### Decision

Remove `AnthropicRouter` from `backend/src/agent/router.ts`. Remove `@anthropic-ai/sdk` from `backend/package.json`. Remove `RouterDecisionSchema` + `RouterDecision` from `shared/src/types.ts` (the schema existed only to validate LLM tool-use output). `HardcodedRouter` learns prompt mode: when `{ prompt }` is supplied AND a Tripo generator is registered, dispatch directly to Tripo with a deterministic tag derivation (split-on-non-word, lowercase, ≤ 5 tokens). When Tripo is not registered, throw `TripoDisabledError`.

The `/api/generate` JWT gate stays — Tripo itself is a paid API, so the cost-protection rationale (review #2 P0) carries over from the Anthropic case. The `Router` + `Generator` interfaces in `shared/src/types.ts` stay as the seam for future LLM/agent reintroduction.

### Rationale

- **Zero behavioral value at v1**: the Forge UI is the only prompt surface, and it always wants Tripo.
- **Removes a paid API dependency**: simpler env setup, no quota anxiety during the demo recording window.
- **~1 s latency saved** per Forge mint by skipping the Claude tool-use round-trip.
- **Failure-mode reduction**: Anthropic outage / rate limit no longer crashes Forge mints.
- **Pitch is still honest**: the architectural seam exists; the "LLM router" framing was always forward-looking, not load-bearing for the v1 demo. Phase 5 narrative can describe the seam without claiming Claude is in the live path.
- **Tags are still useful** but not load-bearing: tags written to Move are owned by the Forge UI (`collection:<slug>` + textureId), not by the router. Lineage-record tags are descriptive metadata; a deterministic split-on-whitespace derivation is good enough.

### Alternatives Considered

- **Keep `AnthropicRouter` optional, dual-path** — `HardcodedRouter` AND `AnthropicRouter` both registered, server selects based on `ANTHROPIC_API_KEY` presence. Rejected: two code paths to maintain, two test surfaces, drifting behavior over time. The "optional" framing tends to rot into "only one path is tested in practice."
- **Defer the decision** — set `ANTHROPIC_API_KEY` for now, revisit Phase 5. Rejected: hackathon timeline doesn't reward un-acted decisions; removal is a 30-minute change and the longer the dependency stays, the more pitch surface accumulates around it.
- **Stronger NLU on the prompt** — pre-LLM heuristics ("if prompt contains 'box' → procedural") to pick a generator. Rejected: not necessary while the only prompt UI is Forge (always Tripo). Reintroduce a smarter router if Phase 5 adds a free-form prompt → any-shape surface.

### Consequences

- ✅ `ANTHROPIC_API_KEY` no longer required at startup; backend `.env` shrinks to `JWT_SECRET` + optional Tripo vars.
- ✅ `@anthropic-ai/sdk` drops from the dependency tree (~smaller install, fewer security advisories to track).
- ✅ One fewer failure mode in the demo recording session.
- ⚠️ Pitch deck cannot claim LLM-routed generation as a live feature. The architectural seam can still be mentioned as forward-looking.
- ⚠️ If we later want LLM-routed prompts (Phase 5 or post-hackathon), reintroducing `AnthropicRouter` is a clean reverse — the `Router` interface is preserved.
- 🔮 If we add a "search by natural language" surface in v1.1+, that's a separate seam (a search router, not a generator router) — D-023 doesn't constrain it.

### Related

- D-011 — agentic LLM framing (this ADR narrows but does not supersede)
- D-014 — LLM extracts tags (this ADR drops the LLM tag extraction; deterministic derivation replaces it)
- `backend/src/agent/router.ts` — implementation site
- `shared/src/types.ts` — `RouterDecisionSchema` removed; `Router` + `Generator` interfaces remain
- `docs/process.md` — refresh after this ADR lands

---

## D-024: Tripo `model_version = Turbo-v1.0-20250506` for prompt-mode generation

**Status**: Accepted
**Date**: 2026-05-17
**Phase**: Phase 3 (Collection Forge + Tiny Racetrack)

### Context

Initial Tripo wiring used `model_version: 'Tripo-P1'` (invalid string — Tripo
API rejected with 400 `code 2017 "The version value is invalid"`, surfaced as
500 Internal Server Error). During testnet dev we live-tested four valid
versions (single prompt, `face_limit=5000`, `texture=false`) and measured both
wall-clock latency and `consumed_credit` reported by `/v2/openapi/task/<id>`.

| Version | Time | Credit | Mesh count | File size | Quality framing |
|---------|------|--------|-----------|-----------|-----------------|
| `Turbo-v1.0-20250506` | ~15s | ~15 | 1 | 638 KB | Speed-first, raw mesh |
| `v1.4-20240625` | ~25s | ~15 | 1 | 1.78 MB | Legacy basic |
| `v3.0-20250812` | ~100s | 20 | n/a (no credit at test time) | – | Sculpture-level |
| `P1-20260311` | ~40s | ~50 | 1 | 762 KB | Game-ready, native 3D diffusion |

### Decision

Use `Turbo-v1.0-20250506` for all prompt-mode text-to-3D generation. Wired
in `backend/src/lib/tripo-client.ts` `submitTask()`.

### Rationale

- **Speed-cost Pareto winner.** 15s end-to-end keeps Forge generate-base under
  the 20s threshold beyond which users start questioning whether the request
  is hung (we added rotating subtext + progress bar specifically to survive
  30s; Turbo eliminates the need).
- **Per-call cost is decisive.** Turbo affords ~30+ full Forge runs per 500
  credit vs P1's ~10 — enough for dev iteration plus demo recording.
- **Quality ceiling doesn't bind us.** Forge dispatches `text_to_model` exactly
  once per collection; the 16 demo variants come from server-side material-swap
  (D-023), so per-call mesh fidelity matters less than perceived response time.
- **Game-ready posture is preserved by face_limit.** `face_limit=5000` caps
  output regardless of model_version, so Turbo sits in the same poly budget
  as P1's marketed "48-20K range".

### Alternatives Considered

- **`P1-20260311`** — marketed "game-ready" with native 3D diffusion. Rejected:
  ~40s and ~50 credit per call (3-4x Turbo) for marginal quality improvement
  we can't differentiate at racing-demo zoom levels.
- **`v3.0-20250812`** — sculpture-level detail and sharp edges. Rejected:
  ~100s wall-clock is fatal for Forge UX; 5x slower than Turbo for detail
  the material-swap step would mask anyway.
- **`v2.5-20250123`** — interim choice after the Tripo-P1 bugfix. Rejected
  after Turbo measured 2x faster at comparable credit cost.
- **`Tripo-P1`** (the original buggy string) — Tripo rejects this; we kept
  the audit trail (TripoFailedError now surfaces response body) to prevent
  silent regressions of the same shape.

### Consequences

- ✅ Forge generate-base feels snappy — users wait ~15s not ~30s
- ✅ ~30+ Forge runs per top-up vs ~10 — enough headroom for demo polish
- ✅ Backend errors include Tripo response body (added in this change) so
  future model_version mistakes surface immediately
- ⚠️ Turbo's mesh fidelity is the lowest of the production lineup. Acceptable
  for racing-car silhouette; would need re-evaluation if Forge is ever used
  for character / hero models
- ⚠️ Single-mesh output (1 mesh per car) means no wheel rotation possible
  without an additional `mesh_segmentation` step (40 credit, ~30s). Not
  pursuing wheel rotation for v1 demo
- 🔮 v1.1 may add a `model_version` UI selector for creators wanting higher
  fidelity per generation; today the choice is operator-locked

### Related

- spec.md section: §2.6 (Generation Router), §2.11 (Tripo integration)
- Related decisions: D-023 (drop LLM router, prompt mode → Tripo directly)
- Mesh-segmentation explored but **not adopted** for v1: Tripo's segmentation
  splits 1 mesh into N (tested: 1→8 with name `tripo_part1..8`, no semantics).
  Racing demo observers don't track wheel rotation closely enough to justify
  the +40 cr per car + +30s Forge UX latency. Punted to v1.1 roadmap; pitch
  deck frames as planned enhancement.

---

## D-025: Drop the seed catalog — rely on live mints for demo content

**Status**: Accepted
**Date**: 2026-05-17
**Phase**: Phase 3 (Collection Forge + Tiny Racetrack)

### Context

D-014 §14.3 specified a Tripo seed catalog: team-as-creators would burn ~5–8 Tripo P1 credits before demo recording to pre-mint hero objects (dragon / castle / phoenix / ornate sword) so Browse looked populated. With D-023 (LLM router dropped) and D-024 (Turbo-v1.0 at ~15s + ~15 credits per call), the underlying constraints have shifted.

### Decision

Skip the seed catalog. The demo recording uses live mints performed at recording time. Tripo budget reserved for the recording itself + final polish iterations.

### Rationale

- Turbo-v1.0 makes prompt-mode generation fast enough (~15s) that live mints during the demo recording are viable — the seed-catalog mitigation for slow Tripo P1 (~40s) doesn't apply anymore.
- Live mints during recording produce demonstrably real on-chain artifacts at known timestamps, stronger for the pitch than pre-staged content of unclear provenance.
- ~5–8 saved Tripo calls = headroom for retries during recording (R5 mitigation in plan-003 is more important now).
- Browse looking sparse on demo day is a presentation problem solved by recording 1–2 collections live before pressing record, not by seed catalog inventory.

### Alternatives Considered

- **Keep seed catalog as specced.** Rejected: ties demo content to past decisions, no longer needed for latency reasons.
- **Mint 1 hero seed only.** Rejected: arbitrary number; either the live-mint flow is robust enough to demo or it isn't.

### Consequences

- ✅ Tripo credit headroom preserved for recording day
- ✅ Cuts one Phase 3 task item with no demo-quality loss
- ⚠️ Browse will be empty for any visitor who lands on the site before the user has minted anything live — non-issue for hackathon scope but worth knowing if site goes public
- 🔮 Phase 5 polish may add a "seed via script" affordance if marketplace traction matters post-submission

### Related

- spec.md section: §6 Phase 3 "Seed catalog 建立" — strike that bullet
- Related decisions: narrows [[D-014]] §14.3 Tripo seed-only operating mode; complements [[D-023]] (LLM router drop) and [[D-024]] (Turbo-v1.0 model choice)

---

## D-026: Defer production deploy + demo capture until all features complete

**Status**: Accepted
**Date**: 2026-05-17
**Phase**: Phase 3 → Phase 5 (capture happens at the end)

### Context

Spec §6 Phase 3 lists "deploy frontend to Vercel, backend to cloud VM" + traction signals (Discord, Twitter, blog) as Phase 3 deliverables. Plan-003 U7 specifies capturing tx hashes, Suiscan screenshots, and a 90-second demo recording. Doing these in Phase 3 means re-doing them after Phase 4 (Kiosk + mainnet) ships, since:
- Mainnet redeploy invalidates testnet tx hashes captured for Phase 3
- Kiosk integration changes the publish flow → demo script needs re-recording
- Production URLs depend on Phase 4 network choice (testnet vs mainnet at submission time)

### Decision

All production-deploy and demo-capture work is deferred to Phase 5. Until then, the project stays localhost-only and the demo flow is exercised against testnet from the developer's machine. Phase 3 closes once code is feature-complete + manually verified on testnet; no recording, no screenshots, no production hostnames captured.

### Rationale

- Recording the demo once at end > recording twice with stale takes
- Localhost is sufficient for two-wallet exercise of the U7 flow — the user has both wallets locally and runs `pnpm dev`
- Phase 5 already budgets time for these deliverables (spec §6 Phase 5: README polish, demo video ≤5 min, DeepSurge submission)
- Frees Phase 3 / Phase 4 calendar for the higher-value-at-risk work: Kiosk integration (D-013 v1 must-have, zero LOC today)

### Alternatives Considered

- **Spec as-written**: deploy in Phase 3, deploy again in Phase 4 for mainnet. Rejected: double work, double bug surface, double recording.
- **Single deploy in Phase 4 + record in Phase 4**: still strands Phase 5 polish budget. Phase 5 grouping is cleaner since polish + submission are already there.

### Consequences

- ✅ One recording session at the end, against the final mainnet contract + Kiosk flow
- ✅ Phase 3 closes faster — only "U7 dev verification on localhost-testnet" remaining, not full capture artifacts
- ⚠️ No public URL to share if anyone asks before Phase 5 — acceptable trade-off for hackathon scope
- ⚠️ Traction signals (Discord / Twitter / blog) slip into Phase 5 — narrower window for organic traction, but recording polish takes priority

### Related

- spec.md section: §6 Phase 3 "部署 frontend / cloud VM" + "Traction signal" bullets — strike from Phase 3 list, fold into Phase 5
- plan-003 U7: status reframes from "Phase 3 closing artifact" to "Phase 3 dev verification only; full capture in Phase 5"
- Related decisions: complements [[D-009]] testnet-for-6/21 + mainnet-by-8/27 strategy

---

## D-027: Adopt `@babylonjs/materials` for SkyMaterial procedural sky

**Status**: Accepted
**Date**: 2026-05-18
**Phase**: 3 (Tiny Racetrack scene polish — plan-006)

### Context

Plan-006 U3 (R1) replaces the racetrack scene's flat `clearColor` sky with an atmospheric sky that fills the frame intentionally. The racetrack is one of two screen-recorded surfaces in the Sui Overflow 2026 pitch (the other is the NFT mint flow), and a uniform sky color reads as placeholder against the post-processed (U2 bloom/FXAA/tonemap) scene. Babylon's first-party `@babylonjs/materials` package ships `SkyMaterial`, a Preetham atmospheric-scattering shader configurable via turbidity, luminance, inclination, azimuth, and rayleigh — i.e., physical sun-position control rather than a baked texture.

### Decision

Add `@babylonjs/materials` (pinned `^9.6.0` to match `@babylonjs/core`) as a `frontend` runtime dependency. Import `SkyMaterial` via the tree-shakable subpath `@babylonjs/materials/sky/skyMaterial` to avoid pulling unused materials (water, fire, fur, etc.) into the bundle. Use it on a 1000u skybox cube with `infiniteDistance: true`.

### Rationale

- Procedural sky is the canonical Babylon pattern for racing-style demos (Art of Rally / Forza-likes use the same Preetham approach). Babylon-team-supported shader = least integration friction.
- Dynamic sun-position control (`inclination`, `azimuth`) means a future `DirectionalLight` can be aligned to the sun without re-baking a texture — supports the deferred "shadows" follow-up in plan-006 cleanly.
- Bundle cost ~50KB after tree-shaking; well under the budget for one visual upgrade on a lazy `/track` route (Havok WASM already dominates the route at ~500KB per D-022).
- Building the Preetham shader from scratch is days of GLSL work for identical output — no informational value over using the package.

### Alternatives Considered

- **Static cube-map skybox** — load 6 textures into a `CubeTexture`. Rejected: texture sourcing burden, no dynamic sun, fixed art direction; also fights the low-poly aesthetic by introducing photographic detail.
- **Custom Preetham GLSL shader** — write the scattering shader by hand. Rejected: multi-day effort to reach parity with a battle-tested first-party implementation.
- **Flat gradient mesh** (vertex-color quad above horizon) — Rejected: looks visibly cheap, no sun, no atmospheric depth, defeats the entire point of the upgrade.
- **Keep flat `clearColor`** — Rejected by ideation pass (origin doc): a uniform sky reads as placeholder in a screen-recorded demo.

### Consequences

- ✅ U3 can ship procedural sky in one mesh + one material attach; no shader authoring.
- ✅ Tree-shaken import path keeps bundle delta small (~50KB).
- ✅ Sun direction is parameterizable for a future `DirectionalLight` alignment (deferred to follow-up work per plan-006).
- ⚠️ Adds one runtime dependency that must stay in sync with `@babylonjs/core` major versions; pin both to the same major.
- ⚠️ Skybox mesh adds one draw call per frame — trivial on modern hardware, but the dispose path must be exercised in `racetrackScene.ts`'s existing teardown to avoid GPU memory leaks on carousel switches.
- 🔮 The same `@babylonjs/materials` package gates future visual upgrades (e.g., `WaterMaterial` if we ever add a wet-track demo) without a new dependency decision.

### Related

- spec.md section: §6 Phase 3 (sample game scene)
- plan-006: `docs/plans/2026-05-18-006-feat-racetrack-scene-polish-plan.md` — U1 (this ADR) gates U3 (SkyMaterial import)
- Related decisions: [[D-022]] (Havok adoption — same lazy-load-on-`/track` posture), [[D-007]] (imperative Babylon — SkyMaterial wiring stays in `racetrackScene.ts`, not a React wrapper)
- Babylon docs: https://doc.babylonjs.com/toolsAndResources/assetLibraries/materialsLibrary/skyMat

---

## D-028: Mainnet deploy is milestone-gated, not date-gated (supersedes D-009's implicit calendar gating)

**Status**: Proposed
**Date**: 2026-05-19
**Phase**: Phase 4 (Kiosk + race-on-mint demo) — strategic reread surfaced during ce-brainstorm + ce-doc-review
**Relates to**: D-009 (testnet 6/21, mainnet 8/27 for 100% prize — this ADR refines the post-7/22 gate), D-013 (Kiosk + TransferPolicy must-have v1 — the testnet ship that this gate protects)

### Context

D-009 reads "testnet OK for 6/21, mainnet by 8/27 for 100% prize" — which implicitly suggests calendar-based mainnet shipping (i.e., "deploy on or before 8/27 to qualify for the 100% prize tier"). Dialogue during ce-brainstorm + adversarial pressure during ce-doc-review surfaced that pure calendar gating creates a perverse incentive: a buggy mainnet deploy on 8/26 ships to qualify for the prize tier but loses the trust + judging optics that the testnet-soak window was supposed to protect.

The original requirements doc captured this implicitly in AE5 ("Given the milestone trigger has NOT been met and the date is 8/26, the mainnet deploy is still NOT executed; the team accepts a missed 8/27 mainnet eligibility rather than ship buggy"). But this was an acceptance example for an undefined trigger, with no ADR documenting the strategic reversal of D-009's implicit calendar default. Reviewers (coherence + adversarial, anchor 100) flagged: the team is committing to forfeit 50% of the prize pool without an explicit decision record explaining why.

### Decision

Mainnet deploy execution between 7/22 and 8/26 is **milestone-gated on demo stability per the bug severity matrix in `docs/runbooks/mainnet-deploy.md`**. Calendar pressure does NOT override the gate. If the milestone is not met by 8/26, the deploy is deferred; the team accepts missing 8/27 winners-tier eligibility rather than ship a buggy mainnet contract.

Milestone trigger (full definition in the runbook):
- ≥ 20 distinct testnet session recordings of the complete purchase→drive arc
- ≥ 10 unique buyer addresses across those 20 sessions
- Zero P0 bugs (funds lost / wallet stuck / royalty wrong recipient — see runbook severity matrix)
- Zero overlay render timeouts > 2s per AE3
- Zero racetrack scene mount failures

P1 bugs (1-in-N reliability flakes, wrong-but-recoverable behavior) ship with documented known-issues in README. P2 bugs (cosmetic) ship without comment.

WAL acquisition must complete by 8/19 at latest (8 days before 8/27) to remove "missed deadline because the swap took longer than expected" as a separate failure mode (see runbook §WAL acquisition timing).

### Rationale

- **Deploying buggy mainnet code is worse than missing the prize tier.** A P0 bug on mainnet (royalty paid to wrong recipient, funds stuck) damages trust + judging perception + post-hackathon ecosystem standing more than forfeiting the 100% upfront prize. The 50% retained at the milestone-met case is itself only paid if the project wins.
- **Calendar pressure is a known failure mode** — hackathon teams routinely ship buggy code on deadline day because the deadline is the loudest signal. Naming a milestone trigger that's loudly more important than the date removes that pressure.
- **Bug severity matrix makes the decision mechanical, not psychological.** Without it, the user argues with themselves at 11pm on 8/26; with it, the matrix dictates the answer.
- **WAL acquisition cliff is a separate concern.** Lumping "did we get WAL?" with "is the contract stable?" into one 8/26 decision conflates two independent failure modes. Separating them (WAL by 8/19, milestone gate at execution time) removes false coupling.

### Alternatives Considered

- **Pure calendar gating (D-009's implicit default)** — rejected because it creates the perverse incentive described above.
- **Calendar gating with a "skip-if-known-blocker" override** — rejected because "known blocker" is vague; the user-at-11pm-on-8/26 has no objective criterion to apply.
- **Earlier earliest-execution date (e.g., 7/15)** — considered; rejected because 7/15 gives no soak time after Phase 4 closes (6/20). 7/22 = ~1 month of testnet exposure.
- **Hard requirement of external auditor sign-off before deploy** — rejected as overkill for hackathon scope + cost; the milestone gate + bug severity matrix is the proportional alternative.

### Consequences

- ✅ Decision rule at 11pm on 8/26 is mechanical (matrix lookup), not psychological
- ✅ Mainnet deploy quality is gated on the same evidence the trigger evaluates (no "we'll fix it after" pressure)
- ✅ WAL acquisition timing isolated from milestone decision (one less coupled failure mode)
- ✅ Strategic reversal of D-009's calendar default is recorded, not implicit
- ⚠️ Team must accept that ~50% of the prize pool is at risk if the milestone fails — explicit trade-off the runbook documents
- ⚠️ External tester recruitment becomes a Phase 5 dependency (5+ unique buyer addresses), with 1-week recruitment window starting 7/15
- 🔮 Post-hackathon: the milestone-gate pattern + bug severity matrix become a reusable artifact for any future mainnet redeploy (e.g., v1.1 L2 Derivative ship)

### Related

- spec.md section: §6 Phase 4 — Kiosk integration + mainnet switch (the original calendar-default framing this ADR refines)
- `docs/brainstorms/2026-05-19-phase-4-kiosk-race-on-mint-requirements.md` — R13 + R14 (Phase 4 pre-bake the runbook executes); Key Decisions (this ADR cited inline)
- `docs/runbooks/mainnet-deploy.md` — the operational runbook this ADR governs (milestone trigger, bug severity matrix, WAL timing, execution playbook)
- Related decisions: [[D-009]] (this ADR refines), [[D-013]] (Kiosk must-have v1 — the testnet ship the gate protects)

---

## D-029: Four-role realignment — reverse D-013, ship NFT collection layer + integration registry in v1

**Status**: Accepted — *`mint_nft_token` place-and-list behavior + the lock/personal_kiosk rules in `ensure_collection_policy` superseded in part by [[D-036]] (2026-05-20)*
**Date**: 2026-05-20
**Phase**: 4
**Supersedes**: D-013 (un-defers L2; nftCreator becomes a real v1 actor)
**Relates to**: D-001 (v2 composable-economy vision pulled into v1), D-002 (L2 layer revived ahead of v1.1), D-003 (license.policy now exposed in UI), D-014 (pay-per-generate supersedes creator-self-pays-Tripo, but is itself descoped — see below)

### Context

A `/ce-brainstorm` triggered mid-`/ce-work` (plan-007 U6 dispatch) to realign the product around four named roles: **mesh creator** (makes a Model3D), **nft creator** (launches an NFT collection from a specific Model3D), **gameDev** (integrates collections into games), **user** (collects/uses). The brainstorm initially resolved to keep D-013 (L2 deferred) and treat nftCreator/gameDev as pitch-narrative only. A 7-persona `/ce-doc-review` then ran; during the finding walk-through the user clarified that register fees and the integration registry are an **NFT-collection-level** concern, not a base-Model3D concern — which only makes sense if the NFT collection layer is real in v1.

The user was presented an explicit hackathon-ROI assessment arguing **against** building the full L2 collection layer for 6/21 (Real-World Application 50% + Product/UX 20% — the 70% majority — reward concrete traction + polish, which more unvalidated surface does not provide; the layer reverses D-013 on first-principles with no new evidence; +5–10 dev-days against a ~23–24 working-day window). The recommendation was path B (creator-held cap, no second tier, no D-013 reversal) for 6/21 with the full layer as a 7/22–8/27 mainnet-window build. **The user chose path A with eyes open** — full collection layer into 6/21.

### Decision

Ship the NFT collection layer as real v1 product surface for the 6/21 submission:

1. **mesh creator** publishes a `Model3D` (base mesh, unchanged from D-002 / Phase 4 v2 contract).
2. **nft creator** calls `launch_collection(model_id, ...)` to launch an `NftCollection` based on a specific `Model3D`, receiving an **`NftCollectionCreatorCap`**. The cap holds the collection's **fee setup** (the `register_fee`) and **integration registry**. The collection creator may differ from the mesh creator (second-party fork — the L2 economics D-013 cut).
3. **gameDev** calls `register_integration(collection, payment, app_metadata, ...)`, paying `register_fee` (routed to the cap holder) to record an integration in the collection's registry. `app_metadata` is length-bounded + schema-constrained (name + url), rendered text-node-only (no innerHTML) — per the security-lens review finding.
4. **`license.policy`** is exposed in v1 UI (mint radio + Browse filter), gating whether a collection accepts integrations.

Coupled decisions folded into this ADR:

- **Pay-per-generate is descoped to v1.1 / mainnet window.** 6/21 demo uses service-funded Tripo (team absorbs cost, 0 dev-days, demo arc identical). This supersedes D-014's creator-self-pays model but defers the on-chain pay-per-generate backend (replay protection, session binding, refund semantics all move with it). Recovered ~4–5 dev-days are reallocated to the collection layer.
- **Procedural generation is removed** (TypeScript generators in `backend/src/generators/` + router); Tripo is the only generation path. `/generate` route + `CreatorFlow.tsx` delete.

### Rationale

- User's strategic call: a concrete, demonstrable composable creator economy (vs the aspirational framing D-013 flagged as risk-prone) plus the technical depth of a Model3D → NftCollection → Cap → registry object graph with on-chain fee routing — strong on the Vision (10%) and Technical (20%) judging axes.
- The cap-based pattern is idiomatic Sui Move (owner-held capability gates privileged ops); fee + registry on the cap (not the base Model3D) cleanly matches "fee is collection-level, set by whoever launched the collection."
- register_fee is simultaneously anti-spam (paid registration), monetization (creators earn from game integrations), and self-loop mitigation (paid integration is more credible than a free flag).

### Alternatives Considered

- **Path B — creator-held cap, single creator tier, no D-013 reversal.** mesh creator launches their own collection + holds the cap; no second-party fork. ~2–4 dev-days, captures ~80% of the value, keeps D-013. Recommended by the agent for 6/21. Rejected by user in favor of the full two-tier model.
- **Path C — status quo (register_integration on Model3D, no fee, nftCreator pitch-only).** Cheapest; rejected — does not satisfy the "fee is NFT-collection-level" intent.
- **Build path A but in the 7/22–8/27 mainnet window** (the timing-arbitrage from the ideation seed S1: 6/21 = pitch artifact, 8/27 = feature ship). Rejected by user, who wants it in the 6/21 submission.

### Consequences

- ✅ Concrete L2 actor makes the "composable creator economy" pitch demonstrable, not hand-wave (directly addresses the framing risk D-013 named)
- ✅ Idiomatic capability + fee-routing design showcases Sui-native depth
- ⚠️ +5–10 dev-days against a ~23–24 working-day window; pay-per-generate descope recovers ~4–5 but net scope still grows. **6/21 deadline risk is HIGH.**
- ⚠️ **Reverses D-013 on first-principles with no new user evidence** — the exact pattern D-013's reasoning warns against. Recorded ROI dissent: the agent assessed this as low hackathon-ROI (hurts the 70% of scoring weighted on Real-World Application + Product/UX); user proceeded knowingly.
- ⚠️ Demo requires real external mesh creator / nft creator / gameDev actors, or an explicit honesty disclosure that the four archetypes are team-controlled wallets for 6/21 (per adversarial + product-lens review findings).
- ⚠️ Mandatory contingency: an explicit descope order for worst-case (recommend: collection-layer UI polish → register_fee mechanics → narrative-only, cut in that order if buffer hits zero).
- 🔮 Re-opens the v1/v1.1 boundary; spec.md §1.7 + plan-007 (U6 onward) require restructuring before implementation resumes.

### Related

- Supersedes: [[D-013]]
- spec.md section: §1.7 (L2-deferred framing must be rewritten to L2-in-v1)
- `docs/brainstorms/2026-05-19-four-role-product-realignment.md` (the brainstorm; revised to reflect this decision)
- Related decisions: [[D-001]], [[D-002]], [[D-003]], [[D-014]], [[D-028]]

---

## D-030: Integration gate is collection-level (`NftCollection.integration_policy`), not a model-license snapshot

**Status**: Accepted
**Date**: 2026-05-20
**Phase**: 4
**Refines**: D-029 (corrects point 4 — the integration gate's level)

### Context

D-029 point 4 said "`license.policy` … gating whether a collection accepts integrations," and plan-008 U1/U4 implemented this by snapshotting `model.license.policy` into `NftCollection.base_policy` and gating `register_integration` on that snapshot. During the U1–U4 code review the user flagged a **level mismatch**: `register_integration` is an L2 (NFT-collection) action whose fee accrues to the **nft creator**, but the gate was driven by the **mesh creator's** L1 model license. Whether a collection accepts gameDev integrations is the nft creator's business decision, so it belongs at the collection level, set by the cap holder — not inherited from the base model.

### Decision

The integration gate lives on the collection and is owned by the nft creator:

1. `NftCollection` carries `integration_policy: u8` (reusing the `POLICY_*` constants); the `base_policy` snapshot field is **removed**.
2. `integration_policy` defaults to `POLICY_PERMISSIONLESS` (open) at `launch_collection`.
3. The nft creator (cap holder) sets it via a new cap-gated `set_integration_policy(cap, &mut collection, policy)` (mirrors `set_register_fee`).
4. `register_integration` gates on `collection.integration_policy == POLICY_PERMISSIONLESS`; the abort code is renamed `ELicenseRestricted` → **`EIntegrationsClosed`** (it now means "this collection is closed to integrations," and also fires for `ALLOW_LIST`, not just `RESTRICTED`).
5. The base model's `license.policy` is **not** consulted for derivation or integration: derivation (`launch_collection`) is gated purely by the pay-to-derive fee; the model policy is display/Browse metadata only (path **ii** of the review's Decision A — a `RESTRICTED` model can still be forked, by design).
6. The Browse "available for integration" filter (U8/U14) reads the **collection's** `integration_policy`, not the model's `license.policy`.

### Rationale

- Each layer's policy is owned by the actor who earns from it: mesh creator's L1 license governs base display; nft creator's L2 `integration_policy` governs integrations (their `register_fee` revenue).
- Removing the `base_policy` snapshot also removes dead/duplicated state and a cross-layer coupling.
- Free now: the v3 republish has not happened (U5 pending), so the struct change costs nothing on-chain.

### Alternatives Considered

- **Keep the model-license snapshot as the gate** (D-029 as written) — rejected: wrong actor controls the nft creator's integration policy.
- **Gate `launch_collection` on model policy too** (review Decision A path i) — rejected by user (path ii): derivation stays fee-gated; model policy is informational.

### Consequences

- ✅ Clean L1/L2 separation; the nft creator controls their own collection's openness.
- ✅ Removes dead `base_policy` state and a cross-layer dependency.
- ⚠️ U8/U14 (not yet built) must read collection `integration_policy`, not model policy — plan-008 updated accordingly.
- ⚠️ A `RESTRICTED` base model can be forked into a sellable collection (consent = the derive fee only). Accepted for v1; revisit if creators need fork-level restriction.

### Related

- Refines: [[D-029]]
- Related decisions: [[D-002]], [[D-003]] (license.policy now display-only at L1), [[D-004]]
- plan: `docs/plans/2026-05-20-008-feat-four-role-collection-layer-plan.md` (U1/U4/U8/U14 updated)

---

## D-031: L1 `Model3D` sells **access** (Seal-gated, v1.1); L2 `NftToken` sells **ownership** (Kiosk, v1)

**Status**: Accepted (vision/layering). Superseded in part by **D-032** — §3 (interim Kiosk-on-`Model3D` kept) and the open OQ-020 are resolved there: `Model3D` became a shared object and the L1 Kiosk path was removed; OQ-020 resolved as path (b).
**Date**: 2026-05-20
**Phase**: 4
**Refines**: D-002 (re-asserts the §2.8 Content+Access intent), D-013/D-016 (reframes the Kiosk-on-Model3D work as interim), D-029 (the L2 layer it added is the ownership tier)

### Context

Surfaced while resolving the U1–U4 review: the team re-confirmed the **two economic models are different layers**:
- **L1 `Model3D` = content; you sell ACCESS to it** (one creator, N buyers pay to access). Access control is `LicenseTerms.policy`: `RESTRICTED` = creator-only, `ALLOW_LIST` = creator + paid-access holders, `PERMISSIONLESS` = anyone. **Real enforcement requires Seal** (encrypt the Walrus blob; `seal_approve` checks a soulbound access receipt before decryption). Without Seal the blob is public and "access" is unenforceable.
- **L2 `NftToken` = you sell OWNERSHIP** (a tradeable token, Kiosk + `TransferPolicy` royalty on resale).

This is exactly the original spec **§2.8 "Design B (Content + Access)" + §1.7**. Phase 4 **drifted** from it: D-013/D-016/plan-007 made `Model3D` itself a Kiosk-traded, single-owner object (`purchase_with_kiosk` = ownership transfer, `TransferPolicy<Model3D>`), and D-029/R22 then **deleted the `Access` struct**. Net: today **both L1 and L2 sell ownership via Kiosk** — the L1 access model is not implemented and its receipt type was removed.

### Decision

1. **Canonical target layering:** L1 `Model3D` sells **access** (Seal-gated); L2 `NftToken` sells **ownership** (Kiosk). `LicenseTerms.policy` is the L1 **access-control** dimension (not an ownership or integration gate — integration is L2 `integration_policy` per D-030).
2. **L1 access-enforcement is v1.1.** Seal encryption + a soulbound **access-receipt** object + `seal_approve` move to the mainnet window (consistent with D-009's "Seal optional v1.1"). v1.1 will **re-introduce an access-receipt analog** of the `Access` struct deleted in D-029/R22 — that deletion is acknowledged here as premature for the long-term model, but is **not reversed now** (no v1 consumer; v1.1 re-adds cleanly under the v3+ package).
3. **The Phase-4 Kiosk-on-`Model3D` machinery (`mint_and_list` / `purchase_with_kiosk` / `TransferPolicy<Model3D>`) is reframed as INTERIM**, not the target. It is not removed in v1 (it works and is shipped); whether the 6/21 demo *uses* it for an L1 "buy the model" beat, or L1 stays publish-only with the sale story on L2, is **left open (OQ-020)**.
4. **The L2 ownership tier (`NftToken` + its own Kiosk/`TransferPolicy<NftToken>`, plan-008 U3) is correct as built** and stays.

### Alternatives Considered

- **Re-architect L1 for 6/21** (restore the access receipt, drop Kiosk-on-Model3D, wire Seal) — rejected: Seal is a large v1.1 effort, access is unenforceable without it, and it would blow the 6/21 buffer for no demo-visible gain.
- **Re-sync docs to the ownership-Model3D reality** (declare L1 = ownership permanently) — rejected: abandons the "content accessed by many" core that distinguishes the product from a 1-of-1 NFT marketplace.

### Consequences

- ✅ Clean conceptual split: access (L1, Seal, v1.1) vs ownership (L2, Kiosk, v1). Resolves the docs-vs-code drift the review surfaced.
- ✅ Protects the shipped L2 work; no code churn now.
- ⚠️ v1.1 must re-add an access-receipt object + Seal + `seal_approve` (re-introducing what R22 deleted).
- ⚠️ The 6/21 demo's L1 story is unresolved (OQ-020); the interim Kiosk-on-Model3D may or may not be shown.
- 🔮 spec §1.7/§2.8 need a full rewrite in Phase 5 to state access-vs-ownership cleanly; banners added now.

### Related

- Refines: [[D-002]], [[D-013]], [[D-016]], [[D-029]], [[D-030]]; gates [[D-009]] (Seal v1.1)
- spec.md: §1.7, §2.8 (banners added; full rewrite = Phase 5)
- Open question: OQ-020 (6/21 L1 demo story)

---

## D-032: `Model3D` is a shared object (`publish`); Kiosk/ownership-sale lives only on L2 `NftToken`

**Status**: Accepted
**Date**: 2026-05-20
**Phase**: 4
**Supersedes**: D-016 (the Kiosk-on-`Model3D` `publish_and_share`→`mint_and_list`/`purchase_with_kiosk` path)
**Refines**: D-031 (implements its target layering for v1); resolves OQ-020 (path b)

### Context

D-031 fixed the target layering (L1 sells access, L2 sells ownership) but left the interim Kiosk-on-`Model3D` machinery in place and left the 6/21 L1 demo story open (OQ-020). Reading the shipped contract surfaced a hard blocker: the only mint path was `mint_and_list`, which `place_and_list`s the `Model3D` into the creator's Kiosk. A Kiosk-locked object can only be borrowed by its `KioskOwnerCap` holder, but `launch_collection(model: &Model3D, …)` needs a `&Model3D` reference. **A different-wallet nft creator therefore cannot fork a published model** — which breaks the four-actor demo arc (modelCreator publishes → a *different* nftCreator forks). This was tracked as AC-003.

The user confirmed the framing: "model 不該被放到 Kiosk 因為他是賣 Access；只有 nft 會被放到 Kiosk." Kiosk is a protocol-level NFT trading + royalty-enforcement primitive — it belongs to the ownership tier (`NftToken`), not the access tier (`Model3D`).

### Decision

1. **`Model3D` is published as a SHARED object.** New `publish` entry fn = `new_model(...)` + `transfer::share_object(model)` (one wallet popup). A shared `Model3D` is referenceable cross-wallet, so `launch_collection` works for any nft creator — **AC-003 dissolves**.
2. **Remove the entire L1 Kiosk path:** `mint_and_list`, `purchase_with_kiosk`, `ensure_transfer_policy` (`TransferPolicy<Model3D>`), the `RoyaltyPaid` event + `emit_royalty_paid`, and abort code `EWrongRoyaltyRate` (21, retired, not reused). The U5 bootstrap now needs only `ensure_collection_policy<NftToken>`.
3. **All Kiosk + `TransferPolicy` + royalty machinery lives only on L2 `NftToken`** (`ensure_collection_policy`, `mint_nft_token`). `ensure_creator_kiosk` is retained — it is the nft creator's PersonalKiosk for minting `NftToken`s.
4. **L1 monetization (v1)** = the pay-to-derive `derivative_mint_fee` (`launch_collection`) + perpetual `base_royalty_bps` on downstream `NftToken` sales. Seal-gated direct access-sale on L1 stays the v1.1 flagship (D-031 §2). This resolves **OQ-020 as path (b)**: L1 is publish-only in the demo; the sale story lives on L2 ownership.

### Alternatives Considered

- **Keep `mint_and_list` on L1, demo "buy the model" as interim** (OQ-020 path a) — rejected: contradicts D-031 AND structurally breaks cross-wallet `launch_collection` (AC-003).
- **Leave the L1 Kiosk fns as dead/interim code** — rejected: two mint paths confuse the indexer and the pitch; one shared-object `publish` is simpler. Removed cleanly since there is no v1 consumer.

### Consequences

- ✅ AC-003 resolved; four-actor demo is buildable; matches D-031's access-vs-ownership split.
- ✅ Simpler surface: one L1 mint path (`publish`), one `TransferPolicy` (`NftToken`), one bootstrap call.
- ✅ Move package + 43 tests green after the change (L1 Kiosk tests removed, `publish` test added).
- ⚠️ Must land **before** the U5 republish (it changes the public Move surface) — done in the same unit.
- ⚠️ Frontend (U6/U10) must build on `publish` + `take_shared<Model3D>`, not `mint_and_list`/`purchase_with_kiosk`. Browse reads shared `Model3D` objects.
- 🔮 v1.1 Seal access-receipt re-introduction (D-031 §2) layers onto the shared `Model3D` cleanly.

### Related

- Supersedes: [[D-016]]; refines [[D-031]]; implements [[D-002]] §2.8 layering
- Resolves: OQ-020 (path b), AC-003 (api-contract review finding)
- spec.md: §1.7, §2.8 (banners updated)

---

## D-033: `Model3D` creation = Tripo prompt-mode + user GLB upload; procedural generation removed

**Status**: Accepted
**Date**: 2026-05-20
**Phase**: 4
**Supersedes**: D-011's procedural half (the hybrid procedural+LLM generator architecture) and the original "input restricted to predefined shape categories" core constraint (CLAUDE.md §Core Constraints)
**Refines**: D-023 (Tripo prompt-mode dispatch stays); implements R3 / R21 / OQ-019

### Context

The four-role realignment (D-029) dropped procedural generation. Resolving the U9/U10 ordering, the user confirmed the go-forward `Model3D` content sources and a new requirement: in addition to Tripo prompt generation, **users may upload their own GLB** directly. The original constraint that content come only from predefined procedural shapes is fully retired (already eroded by D-023's free-form Tripo prompt).

### Decision

1. A `Model3D`'s GLB originates from exactly two paths, both converging on Walrus upload → `publish` (D-032 shared object):
   - **(a) Tripo prompt-mode** — `creatorPrompt → Tripo → GLB` (the surviving `/api/generate` prompt path; D-023).
   - **(b) User GLB upload** — the creator supplies their own `.glb` file.
2. **Procedural generation is removed** (U9): the `backend/src/generators/` package, `ShapePicker`, `CreatorFlow`, slider/params mode, `/api/shapes`, `ShapeId`/`GenerateParams`/`paramRanges`/`proceduralParamsSchemas`. `backend/src/routes/generate.ts` is **rewritten to prompt-only** (not deleted — Tripo path survives).
3. **Build order flipped:** U10 (canonical `publish` mint page carrying both sources + `license.policy` radio) ships **before** U9 (procedural teardown), so a working mint path always exists.

### Consequences

- ✅ Two clear creation sources; demo modelCreator flow (prompt) + power-user GLB upload both supported.
- ✅ U9 becomes a clean teardown once U10's replacement exists.
- ⚠️ Uploaded GLBs bypass the procedural "low-poly / manifold / rigid-body-friendly" guarantees — the mint path must enforce **format (.glb only, D-006) + size caps** and treat uploaded content as untrusted. GLB structural validation is best-effort (gltf-transform parse) for v1.
- ⚠️ `generate.ts` rewrite must preserve the Tripo auth gate (paid API) while dropping slider mode.
- 🔮 Watermark / provenance for uploaded (non-generated) content is a v1.1 concern.

### Related

- Supersedes part of [[D-011]]; refines [[D-023]]; implements R3/R21/OQ-019
- Sequencing: U10 before U9 (this plan's order flipped, user-confirmed 2026-05-20)

---

## D-034: Tripo generation is SUI-fee-gated (pay-per-call, off-chain verified); publish is user-funded

**Status**: Accepted
**Date**: 2026-05-20
**Phase**: 4
**Refines**: D-033 (creation sources), D-023 (Tripo dispatch)

### Context

The modelCreator flow (user-confirmed 2026-05-20): prompt → **pay SUI** → Tripo → preview → (pay again to regenerate | confirm) → set `license` policies → **publish to Walrus** (user pays SUI gas + WAL). The user-upload-GLB path skips the Tripo steps and their fee. We need a way to (a) charge SUI per Tripo call without the user fat-fingering amount/destination, and (b) let the backend attribute "which payment funded which API call".

### Decision

1. **Tripo prompt-mode is gated by a fixed SUI service-fee** (demo: **0.1 SUI** to the **deployer address** `0x3116…` as treasury; both env-overridable). The operator's Tripo key funds the API itself ("service-funded"); the user pays the SUI fee.
2. **Approach A — off-chain verification, no new Move function.** The frontend builds the exact transfer PTB (`splitCoins(gas,[fee])` → `transfer(treasury)`; amount + destination hardcoded, so the user only signs — no fat-finger surface). The wallet returns the **transaction digest** (= tx hash). The frontend sends `{ prompt, paymentDigest }` to `POST /api/generate`; the backend verifies via RPC that the tx's payer == the JWT session address, transferred ≥ fee to the treasury, and the digest is **unused** (in-memory replay set; persist for prod), then calls Tripo.
3. **Each regeneration is a fresh paid call** (a new payment + digest).
4. **Publish is user-funded** for BOTH paths: the user's wallet pays SUI gas + WAL storage (no sponsored tx for v1).

### Alternatives Considered

- **B — Move `pay_for_api_call` entry fn emitting `ApiCallPaid`** (typed event, on-chain amount enforcement, clean indexer attribution consistent with the rest of the event-driven design). Rejected for the 6/21 demo: it forces a contract upgrade right after the v3 republish, and Approach A already eliminates the user-error surface (frontend-built PTB) and solves attribution (frontend passes the exact digest). **Revisit in v1.1** for clean on-chain payment attribution + an Explorer-visible payment event.
- Sponsored (gasless) publish via Enoki — deferred; user-funded is simpler and the creator paying is acceptable.

### Consequences

- ✅ No contract churn post-v3; ships fast; user can't mis-send the fee.
- ✅ `paymentDigest` gives unambiguous payment↔generation attribution + replay protection.
- ⚠️ Backend must parse the payment tx's balance changes to verify amount/destination (fiddlier than a typed event would be; acceptable for demo).
- ⚠️ Replay guard is in-memory — a backend restart forgets spent digests (re-use window). Persist for production.
- ⚠️ `backend/src/routes/generate.ts` gains the payment gate AND is rewritten prompt-only (overlaps U9's procedural teardown).
- 🔮 v1.1: Approach B (`pay_for_api_call` + `ApiCallPaid`) for on-chain attribution; persisted replay store; possibly sponsored publish.

### Related

- Refines [[D-033]], [[D-023]]; sequenced in U10 (before U9 per D-033)

---

## D-035: L2 `NftToken` reconnects to Phase-3 quilt variants — each token binds an on-chain patch

**Status**: Accepted
**Date**: 2026-05-20
**Phase**: 4
**Refines**: D-029 (L2 token layer); reuses plan-003 quilt + material-swap infra

### Context

D-029 redesigned L2 from "Forge colored variants" into "lean ownership tokens", leaving `NftToken { id, collection_id, base_model_id, name }` with **no per-token appearance** — all tokens of a collection share the base `Model3D`'s single GLB. Phase-3's quilt + material-swap pipeline (1 blob / N colored patches, `Model3DSummary.patchId`, `by-quilt-patch-id` aggregator, `VariantEditor`) was orphaned. Separately, reading the v3 contract surfaced a resolution gap: neither `Model3D` nor `NftToken` stores a resolvable GLB blob id (the GLB `Blob` is a separate creator-owned object; `Model3D` keeps only `lineage_blob_id`). The user chose **real on-chain variants** (over a cosmetic client-side tint) so the "fleet of colored cars" is verifiable provenance.

Correction to the original mental model: real variants are **NOT** 100 separate blobs — the efficient design is **1 Walrus quilt blob with N patches** (100 separate blobs = 100 storage registrations). Phase-3 already packs quilts this way.

### Decision

1. **`NftCollection` gains `quilt_blob_id: String`** — the collection's variants are packed into one Walrus quilt; the blob id is supplied by the nft creator at `launch_collection`.
2. **`NftToken` gains `patch_id: String`** — points at this token's patch (one colored car) within the quilt. Multiple tokens MAY share a patch (e.g. a "red edition ×10").
3. **`launch_collection` signature gains `quilt_blob_id`**; **`mint_nft_token` signature gains `patch_id`** (length-bounded by `MAX_BLOB_ID_LEN`).
4. **Resolution chain:** token → `getObject` → `patch_id` → aggregator `by-quilt-patch-id` → real variant GLB. This **closes the L2 GLB-resolution gap**. (L1 `Model3D` GLB resolution still uses the `?blob=` URL hatch for the demo; on-chain pointer deferred to v1.1.)
5. **Requires a v4 republish** — adding fields to existing Move structs is not an in-place upgrade; this is a fresh republish following the U5 process.

### Alternatives Considered

- **Cosmetic client-side tint** (color = f(tokenId), shared base mesh, zero contract change) — rejected by the user: the variant should be real on-chain provenance, not a render-time effect.
- **100 separate blobs** — rejected: 100× storage registrations; quilt (1 blob / N patches) is the correct shape and already built in Phase-3.

### Consequences

- ✅ Reuses Phase-3 `/api/collection/build` (material-swap) + quilt upload + `by-quilt-patch-id` aggregator + `VariantEditor`/`patchId`.
- ✅ Colored fleet is verifiable on-chain; L2 token→GLB resolution is clean.
- ⚠️ Another republish (v4): rerun the U5 flow (new package id, `testnet.json`, `networkConfig.ts`, `Published.toml`, bootstrap policy).
- ⚠️ Touches U6 builders, U12 mint page, U11 /track — **plan-008 must be revised** (and resequenced; U11 can no longer ship as a standalone frontend unit — it now needs v4 + a real minted token).
- ⚠️ Partial tension with D-034 ("no contract churn for the demo") — D-034 was scoped to the Tripo pay-gate (stays off-chain); this is a deeper product feature that justifies the republish.
- 🔮 Per-patch metadata (material name / rarity) is a future extension.

### Related

- Refines [[D-029]]; reuses plan-003 quilt; bundled with [[D-036]] into v4; affects U6/U11/U12

---

## D-036: `mint_nft_token` mints a plain owned token (no auto-Kiosk); `TransferPolicy<NftToken>` keeps royalty only

**Status**: Accepted
**Date**: 2026-05-20
**Phase**: 4
**Supersedes**: the v3 `mint_nft_token` place-and-list behavior + the lock/personal-kiosk rules added in `ensure_collection_policy` (D-029/U3)

### Context

v3 `mint_nft_token` takes `kiosk_obj` + `personal_cap` and `place_and_list`s the freshly minted `NftToken` into the nft creator's Kiosk; `TransferPolicy<NftToken>` carries three rules (royalty + lock + personal_kiosk). A Kiosk-locked token can only be read via Kiosk borrow / dynamic-field walking, which is hostile to the two consumers that matter for the demo: `/track` (drive the token) and gameDev integrations (load the token in an app). The user directed: **mint must not auto-place into Kiosk**, and (confirmed) the **`kiosk_lock_rule` should be removed** so a token bought through a Kiosk can be taken out and used freely.

### Decision

1. **`mint_nft_token` drops `kiosk_obj`/`personal_cap` + `place_and_list`** — it mints the `NftToken` and `transfer::public_transfer`s it to the caller (a plain owned object).
2. **Listing for sale is a separate opt-in PTB** (standard Kiosk `place_and_list`); royalty is enforced by `TransferPolicy<NftToken>` when sold through a Kiosk.
3. **`ensure_collection_policy` keeps only `royalty_rule`** — `kiosk_lock_rule` and `personal_kiosk_rule` are removed, so a token sold through a Kiosk can be taken out afterward and used as a plain owned object.

### Alternatives Considered

- **Keep auto-Kiosk + lock rule, make consumers Kiosk-aware** — rejected: pushes Kiosk borrow complexity into `/track` and every gameDev app; contradicts the "any app can use a bought NFT" value prop.

### Consequences

- ✅ `/track` ownership discovery simplifies to "query owned objects of type `NftToken`" (no Kiosk walk — the earlier U11 wrinkle dissolves).
- ✅ gameDev apps `getObject` the owned token directly.
- ✅ Royalty story intact for Kiosk-routed sales (the classic royalty surface).
- ⚠️ **Royalty enforcement is now OPT-IN for the seller, not protocol-enforced.** Dropping `kiosk_lock_rule` means a bought `NftToken` is a freely-owned `key+store` object: any holder can `public_transfer` it (or sell it off-Kiosk for off-chain payment) and pay **zero** royalty. Royalty fires *only* when the seller chooses to sell through a Kiosk (`purchase` → `confirm_request`). This is the explicit, accepted D-036 tradeoff — you cannot have both a freely-usable owned token (the gameDev value prop) and protocol-enforced perpetual royalty. If forced royalty ever becomes a hard requirement, re-add `kiosk_lock_rule` (and accept the Kiosk-walk complexity). Regression vs v3, which locked tokens in-Kiosk.
- ⚠️ Primary mint/transfer is NOT royalty-enforced (only Kiosk sales are) — accepted.
- ⚠️ Removing rules changes the `confirm_request` hot-potato flow — the resale/buy PTB builder must satisfy exactly `royalty_rule` (see `docs/solutions/kiosk-ptb-patterns/confirm-request-hot-potato.md`).
- ⚠️ Same v4 republish as [[D-035]]; changes `mint_nft_token` signature + U6 builder + U12.

### Related

- Supersedes part of [[D-029]]; bundled with [[D-035]] into v4; affects U6/U11/U12

---

# Reserved Decision Numbers

D-037 onwards: captured in real-time per `CLAUDE.md` Decision Capture protocol.
