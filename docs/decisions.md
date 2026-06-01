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

## D-037: `Model3D` gains a first-class `glb_blob_id` — L1 GLB becomes on-chain-resolvable (v5 republish)

**Status**: Accepted
**Date**: 2026-05-20
**Phase**: 4

### Context

v4 `Model3D` stores only `lineage_blob_id` (the lineage JSON) — there is **no on-chain pointer to the model's GLB bytes**. Consequence: nothing can resolve a published L1 model's 3D file from the object alone. This breaks two flows: (1) Browse/detail can't preview L1 models (`useModelIndex` reads a non-existent `blob_id` → `''`), and (2) the nft-creator launch flow (U12) can't fork a base model — it needs the base GLB bytes to material-swap variants. The interim `?blob=` URL hatch (paste a blob id) is unacceptable UX. Smuggling the id into the free-form `params_json` string works but is a stringly-typed side-channel, not a legit content-addressing model. Testnet republish is cheap (v4 just shipped), so doing it correctly now — before U11/U12/demo build on top — is the right call.

### Decision

`Model3D` gains a typed `glb_blob_id: String` field — a first-class on-chain pointer to the model's GLB, mirroring the existing `lineage_blob_id` exactly (same `MAX_BLOB_ID_LEN` bound + `EBlobIdMalformed` code). `new_model`/`publish` take a `glb_blob_id` param; the frontend passes the GLB's Walrus blob-id string (computed off-chain by the Walrus SDK, same as `lineage_blob_id`). The GLB is uploaded as its **own standalone blob** (resolution sub-decision **(i)**), resolved via the standard aggregator `/v1/blobs/<glb_blob_id>` — no quilt/patch indirection for a single L1 GLB. Ships as a fresh **v5 republish** (struct field add is not in-place upgradeable).

### Rationale

- Content addressing belongs in a typed field on the content object, not in a metadata string.
- Symmetric with the L2 design (NftToken resolves its GLB via `patch_id`); L1 now resolves via `glb_blob_id`.
- Fixes the existing "Browse can't preview L1 models" bug as a side effect.
- Unblocks U12's base-model fork with zero-friction UX (click a model → auto-resolve its GLB).

### Alternatives Considered

- **(a) `?blob=` paste hatch** — rejected: terrible UX.
- **(d) Embed GLB id in `params_json`** — rejected: stringly-typed side-channel; works but not a legit data model.
- **(ii) Keep GLB quilted with lineage, store `glb_patch_id`** — viable + symmetric with L2, but adds quilt/patch indirection for a single-file L1 GLB; (i) standalone blob is simpler.

### Consequences

- ✅ L1 GLB resolvable from the object alone; Browse L1 preview works; U12 fork is friction-free.
- ⚠️ Fresh **v5 republish** (new PackageID; supersedes v4 `0x3b6b7258…`). Same process as U17.
- ⚠️ Touches the already-shipped U10 `/create`: GLB now uploaded standalone (not quilted with lineage) + `buildPublishPtb` passes `glb_blob_id`.
- ⚠️ Only models minted under v5 carry `glb_blob_id` — irrelevant on testnet (we mint all demo data).
- 🔮 At mainnet, `glb_blob_id` is part of the canonical `Model3D` ABI from the start.

### Related

- Unblocks U12 (base-model fork); fixes the L1 GLB-resolution gap noted in [[D-035]]/[[D-036]] work. New units U18 (Move v5 source) + U19 (v5 republish). Touches U10.

---

## D-038: `launch_collection_with_tokens` batch entry fn — whole L2 launch in one signature (v6)

**Status**: Accepted
**Date**: 2026-05-21
**Phase**: 4

### Context

The U12 nft-creator flow needs: launch a collection from a base `Model3D` → set a register fee → mint N owned tokens (one per quilt patch). With the current v5 surface these are separate entry fns, and they **cannot** be composed into one PTB by the frontend: `launch_collection` creates the `NftCollection` + soulbound `NftCollectionCreatorCap` *inside* the call (no chainable return), and both types are `key`-only (no `store`), so a client PTB cannot `public_share_object`/`public_transfer` them — sharing/transfer is restricted to the defining module. Result: tx3 (`launch_collection`) and tx4 (`set_register_fee` + N×`mint_nft_token`) are forced into two separate signatures, on top of the 2 Walrus-upload signatures (register + certify, owned by `@mysten/walrus`). The nft-creator therefore signs ~4 times, and the demo beat is "launch, then mint" rather than one clean action.

### Decision

Add a single batch entry fn that performs the entire L2 launch atomically in-module:

```
public entry fun launch_collection_with_tokens(
    model: &Model3D,
    payment: Coin<SUI>,
    quilt_blob_id: String,
    register_fee: u64,
    token_names: vector<String>,
    token_patch_ids: vector<String>,
    ctx: &mut TxContext,
)
```

It launches the collection (routes the derive fee exactly like `launch_collection`), sets `register_fee`, mints one `NftToken` per `(name, patch_id)` pair (`public_transfer` to sender — plain owned, D-036), then `share_object`s the collection and `transfer`s the soulbound cap to sender. `assert!(token_names.length == token_patch_ids.length, EBatchLenMismatch)` (new code `37`); existing per-field length bounds reused. To avoid duplication, extract package-private cores `launch_collection_internal(...) : (NftCollection, NftCollectionCreatorCap)` and `mint_nft_token_internal(collection, name, patch_id, ctx) : NftToken`; the existing `launch_collection` / `mint_nft_token` entry fns become thin wrappers over those cores (their public signatures are **unchanged**). The change is **purely additive** at the ABI level (one new public entry fn + package-private helpers).

**Deploy mechanism**: ship as a fresh **v6 republish** (consistent with the project's established abandon-in-place testnet pattern — v3/v4/v5 were all fresh republishes; v5 has zero on-chain state worth preserving and the `ensure_collection_policy` re-bootstrap is ~free). A compatible in-place `sui client upgrade` (via the v5 UpgradeCap) is technically available *because* this change is additive-only, and is noted as the mainnet-era approach — but is not adopted now to avoid introducing a new deploy path (and the published-at/original-id config split) mid-sprint.

### Rationale

- Collapses the launch economy from 2 signatures to 1 → ~4 wallet popups down to 3; the nft-creator demo beat becomes a single "launch my collection" action.
- Keeps `share_object`/`transfer` of the `key`-only collection + soulbound cap inside the defining module (the only legal place); the client cannot do this, so a module-side batch fn is the *only* way to get one-signature launch.
- Additive: existing `launch_collection` / `set_register_fee` / `mint_nft_token` entries stay (still used standalone — fee edits, minting more tokens later, and the U6 builders/tests that target them).

### Alternatives Considered

- **Keep the 4-popup pure-frontend flow (option B)** — rejected by user choice (A); more popups, weaker demo, but zero contract change.
- **External PTB composition (chain `launch` result into `mint` in one client PTB)** — impossible: `launch_collection` returns nothing and `NftCollection`/cap are `key`-only, so the client cannot share/transfer them.
- **Compatible `sui client upgrade` instead of fresh republish** — viable (additive-only change preserves `original-id`, so the v5 `TransferPolicy`/`Publisher` stay valid and need no re-bootstrap), and is the right mainnet approach; deferred now for consistency + lower risk.
- **Fold `register_fee` default and skip the param** — kept the param so the creator sets the fee in the same call (still defaults are possible by passing 0).

### Consequences

- ✅ One-signature collection launch + fleet mint; cleaner U12 UX and demo.
- ⚠️ Fresh **v6 republish** (new PackageID; supersedes v5 `0xe0d65c4a…`); re-run `ensure_collection_policy`; update both config mirrors + reports (same process as U19).
- ⚠️ New abort code `EBatchLenMismatch = 37`. New U6 builder `buildLaunchCollectionWithTokensPtb` + tests; the standalone `buildLaunchCollectionPtb`/`buildMintNftTokenPtb` remain for the descope path.
- ⚠️ Move refactor extracts two package-private cores — existing entry fns must keep identical public signatures + behavior (covered by the existing Move tests).
- 🔮 At mainnet this batch fn is part of the canonical ABI; the compatible-upgrade path becomes the norm once real state exists.

### Related

- Enables U12 (`LaunchCollectionPage`) one-signature launch. Builds on [[D-035]] (quilt `patch_id`) + [[D-036]] (owned-token mint). New units: U20 (Move v6 batch fn, test-first) + U21 (v6 republish), mirroring U18/U19. Walrus's 2 upload signatures are out of scope (SDK-owned; would need Enoki sponsored tx, a demo-day concern).

---

## D-039: Material-swap stays backend for v1; move to client-side gltf-transform post-submission

**Status**: Accepted
**Date**: 2026-05-21
**Phase**: 4 (revisit Phase 5 / post-submission)

### Context
The L2 fork flow's variant generation (swap `baseColorFactor` + optional texture into N GLBs) runs server-side at `/api/collection/build` via `@gltf-transform`. The base GLB round-trips through the backend as base64 JSON and the N variants return in one response — in-memory, N-multiplied. This forces the size caps (zod 16.8M chars + 18 MiB bodyLimit, aligned to the 12 MiB `/create` upload ceiling in commit `45a32dc`) and wastes bandwidth: bytes go browser→backend→browser *before* heading to Walrus, their actual destination. The 12 MiB cap is an app-level guard, **not** a Walrus limit (Walrus single-blob ceiling is ~GB).

### Decision
Keep the backend material-swap for the 6/21 submission. Post-submission, move the swap into the browser using **`@gltf-transform` in-browser** (NOT Babylon GLB export) and retire `/api/collection/build` + its auth/size guards.

### Rationale
- The data is already client-side and Walrus-bound; the backend hop is pure overhead and the source of the cap pain.
- gltf-transform in-browser preserves the surgical/deterministic edit the backend does today (Babylon export serializes the whole scene — lossy/non-surgical).
- Client compute scales free (no server CPU/OOM), drops a hard backend dependency from a core creator flow (backend's real job is Tripo dispatch + Sui/Walrus read path, D-012), and removes the cap (Walrus ~GB becomes the only ceiling).
- Deferred because the backend path works today, 12 MiB is plenty for low-poly content (D-006), and a rebuild carries demo risk mid-sprint.

### Alternatives Considered
- **Move now (pre-6/21)** — rejected: real work + demo risk for no demo-visible benefit at low-poly sizes.
- **Babylon GLB export client-side** — rejected: re-encodes the whole scene; risks byte/size/extension drift on the canonical on-chain artifact.
- **Raise backend caps further** — rejected: the in-memory N× multiplication is the real constraint; bigger numbers only move the OOM threshold.

### Consequences
- ✅ v1 ships on the working backend path; no churn during the sprint.
- ⚠️ The 12 MiB fork ceiling persists until the move (fine for low-poly; only matters for large assets).
- ⚠️ Post-move loses the server-side validation/whitelist/agent-API entry point for forking (not used today).
- 🔮 Post-move: `/api/collection/build` + its bodyLimit/zod caps retire; frontend bundle gains gltf-transform (+ possible codec WASM); base GLB never leaves the browser except to Walrus.

### Related
- Builds on the size-cap alignment fix (commit `45a32dc`). Extends the "base GLB round-trip stays client-side" choice (phase-progress) from *fetching* the GLB to *swapping* it. Tracked as a post-submission unit.

---

## D-040: Enforce L1 license policy — RESTRICTED vs PERMISSIONLESS (fresh v7 republish)

**Status**: Accepted (Amended by D-076 — ALLOW_LIST re-enabled + split fork gate, 2026-05-31)
**Date**: 2026-05-21
**Phase**: 4

### Context
`Model3D.license.policy` (RESTRICTED=0 / ALLOW_LIST=1 / PERMISSIONLESS=2) has been stored but never enforced. `launch_collection_internal` (`contracts/model3d/sources/model3d.move:600`) explicitly comments (lines 587–589) that `license.policy` is NOT consulted — derivation is gated only by the pay-to-derive fee. A creator who picks "restricted" in `/create` gets no protection: anyone who pays the fork fee can still fork. This contradicts the core pitch ("creators set license terms for composable IP") and is an honesty gap a judge will catch. `LicenseTerms` carries no allow-list field, so ALLOW_LIST cannot be enforced without an on-chain address list + UI (out of scope for v1).

### Decision
Collapse L1 policy to two enforced meanings for v1:
- **PERMISSIONLESS (2)** — anyone who pays the fork fee may derive (current behavior).
- **RESTRICTED (0)** — only the base model's creator may derive.
- **ALLOW_LIST (1)** — dropped from the `/create` UI. On-chain it is treated as non-permissionless → creator-only (same as RESTRICTED), so any legacy/odd value fails safe. The Move constant stays (no struct change) to avoid churn.

Enforcement is a single additive assert at the top of `launch_collection_internal`:
`assert!(policy == POLICY_PERMISSIONLESS || ctx.sender() == model.creator, EPolicyRestricted)` with a new abort const `EPolicyRestricted = 38` (next free after 30–37). This covers both `launch_collection` and `launch_collection_with_tokens`, since both route through the internal.

### Deployment
Ship as a **fresh v7 republish** (`sui client publish` + re-bootstrap `ensure_collection_policy`), following the v3–v6 republish precedent (D-038) — NOT a compatible `sui client upgrade`.

A compatible upgrade was attempted first and reverted. The reason a fresh republish is **required, not merely conventional**, for an *enforcement* change: a Sui compatible upgrade does not retire the prior package version. The pre-enforcement bytecode at the old package id stays permanently callable, so a hand-crafted PTB targeting it bypasses the new assert entirely — the gate would be honor-system only. A fresh republish has no prior version of *itself*, so the policy is genuinely enforced for all content published under the new package id. (Surfaced by the Plan 009 code review: security + adversarial + api-contract all independently flagged the stale-package bypass.)

The fresh republish also keeps a **single package id** (no published-at/original-id split — Move call targets and type/event identity are the same id again), which removes a class of subtle wiring errors. Cost — re-bootstrapping `TransferPolicy<NftToken>` + royalty rule and updating the config files — is low (the project has done it four times; UPGRADE.md notes re-bootstrap is "~free"). Plan 010 has not started, so the new `transferPolicyId`/`transferPolicyCapId` carry no migration cost; Plan 010 simply targets the v7 ids.

### Alternatives Considered
- **Compatible `sui client upgrade`** — attempted, then rejected: it leaves the prior unenforced version callable (bypass) and forces a permanent published-at/original-id split in the frontend. The only thing it bought (stable TransferPolicy ids for Plan 010) has no value before Plan 010 starts.
- **Add an on-chain allow-list for ALLOW_LIST** — rejected for v1: needs a per-model address set + UI; ALLOW_LIST collapses to creator-only instead (fail-safe).
- **Leave policy unenforced** — rejected: honesty gap against the core pitch.

### Consequences
- ✅ L1 policy is genuinely enforced for all v7 content; a RESTRICTED model can only be forked by its creator, with no stale-version bypass.
- ✅ Single package id — no published-at/original-id split; frontend builders use one `model3dPackageId` for both call targets and type/event identity.
- ⚠️ Fresh TransferPolicy/Publisher/UpgradeCap ids; v6 (`0x57e20a13…`) + its abandoned upgrade published-at (`0x134807cd…`) are abandoned on testnet.
- ⚠️ ALLOW_LIST has no address-list semantics in v1 (treated as creator-only).
- 🔮 Plan 010 (Kiosk marketplace) targets the v7 package + its fresh TransferPolicy ids.

### Related
- Implemented per `docs/plans/2026-05-21-009-feat-l1-license-policy-enforcement-plan.md`.
- Sequenced before D-041 / Plan 010 (Kiosk marketplace) so the package id is final first.
- Related decisions: D-030 (integration gate is collection-level, separate from L1 policy), D-038 (republish precedent this **follows**).

---

## D-041: Simple marketplace via Sui Kiosk — primary list + purchase of NftTokens

**Status**: Accepted (discovery sub-decision superseded by D-043)
**Date**: 2026-05-21
**Phase**: 4

### Context
`mint_nft_token` `public_transfer`s the freshly minted token to the caller (the nft creator), so after a launch the creator holds every token and there is **no in-app way for a separate user to acquire one**. The /track demo only works today because nftCreator == user (same wallet). This is the last broken leg of the four-actor journey (modelCreator → nftCreator → gameDev → **user buys** → drives).

### Decision
Build a *simple* marketplace on **Sui Kiosk** (the standard primitive) — not a hand-rolled Move store (user explicitly rejected reinventing it). Pure frontend: a list-for-sale PTB and a purchase PTB, plus minimal discovery + UI. **0 Move changes** — the royalty-only `TransferPolicy<NftToken>` (D-036) and `@mysten/kiosk@1.2.6` are already in place; Plan 009's v7 republish already re-bootstrapped a fresh policy (`transferPolicyId 0x3ffa22b3…`, `transferPolicyCapId 0x76cc6960…`, royalty-only verified).

- **List**: owner places + lists an owned `NftToken` in their Kiosk at a price (create the Kiosk in the same PTB if absent).
- **Purchase**: standard hot-potato chain — `kiosk::purchase` → `royalty_rule::pay` → `transfer_policy::confirm_request`. Because the policy carries **only** the royalty rule (no `kiosk_lock_rule`, per D-036), `confirm_request` succeeds without locking, the item is returned by value, and we `public_transfer` it to the buyer as a plain owned object. The buyer therefore needs no Kiosk, and the token is immediately discoverable by /track's owned-token query (U11).
- **Discovery**: approach (a) — track the seller Kiosk id (returned by the list PTB) and query that Kiosk's listings. Demo-grade; we control the seller wallet for the demo.

### Alternatives Considered
- **Hand-rolled `Store` / `buy_token` Move entry** — rejected by user; reinvents Kiosk and adds Move surface + a republish.
- **Discovery via `kiosk::ItemListed` event indexer** (mirrors U7) — deferred post-submission; correct scalable path but more work than the demo needs.
- **Query all Kiosks holding the NftToken type** — broadest, most work; rejected for v1.

### Consequences
- ✅ Completes the four-actor flow: a second wallet can buy a listed token and drive it on /track.
- ✅ Royalty is enforced on every Kiosk-routed sale via `confirm_request` (consistent with D-036; not protocol-enforced for off-Kiosk transfers — the accepted D-036 tradeoff).
- ⚠️ Listing discovery is single-seller-scoped for the demo (approach (a)); no global marketplace search.
- ⚠️ Resale UX is just the same purchase path; no auctions/offers/bulk management.
- 🔮 (b) `ItemListed` event indexer is the post-submission scale path for multi-seller discovery.

### Related
- Implemented per `docs/plans/2026-05-21-010-feat-kiosk-simple-marketplace-plan.md`.
- Builds on the v7 ids from [[D-040]]; royalty-only policy from [[D-036]]; owned-token discovery from U11; `confirm_request` choreography in `docs/solutions/kiosk-ptb-patterns/confirm-request-hot-potato.md`.

---

## D-042: NftToken resale royalty = global 5% with a 0.001 SUI floor

**Status**: Accepted
**Date**: 2026-05-22
**Phase**: 4 (retroactive capture — the constants shipped in plan-007 U3 without a dedicated ADR; this records the rationale we are committing to)

### Context
The shared `TransferPolicy<NftToken>` carries a single Mysten built-in `royalty_rule`, configured in `ensure_collection_policy` via `royalty_rule::add(policy, cap, AMOUNT_BP_DEFAULT, MIN_ROYALTY_AMOUNT_MIST)`. Two parameters are ours to choose; the rule's charge formula is the framework's:
`royalty_owed = max(price * amount_bp / 10_000, MIN_ROYALTY_AMOUNT_MIST)`.

The **rate** (5% / 500 bps) had a recorded rationale (brainstorm `docs/brainstorms/2026-05-19-phase-4-kiosk-race-on-mint-requirements.md`); the **floor** (`MIN_ROYALTY_AMOUNT_MIST = 1_000_000` = 0.001 SUI) shipped without one. This ADR closes that gap.

### Decision
Keep both parameters as set in `contracts/model3d/sources/model3d.move`:
- `AMOUNT_BP_DEFAULT = 500` (5%) — a single **global** rate applied to every NftToken Kiosk resale (not per-collection).
- `MIN_ROYALTY_AMOUNT_MIST = 1_000_000` (0.001 SUI) — a minimum royalty floor.

### Rationale
- **Rate (5%)**: industry-standard creator royalty (within OpenSea's 2.5–10% range); large enough to render visibly in the demo's on-screen royalty receipt; not punitive.
- **Floor (0.001 SUI)**: prevents a zero- or dust-priced listing from paying ~0 royalty. Without a floor a free/1-mist sale routes no value to the policy, which both undermines the "creators are paid on resale" pitch claim and is an obvious wash-trade / royalty-bypass vector. `royalty_rule`'s `min_amount` parameter exists precisely for this; 0.001 SUI is a negligible buyer cost while guaranteeing a non-trivial creator floor.

### Consequences
- ✅ Every resale (even free/dust listings) routes a non-zero royalty to the policy.
- ⚠️ For prices **below ~0.02 SUI** the floor dominates, so the *effective* rate exceeds 5% (e.g. a 0.01 SUI sale pays 0.001 = 10%). The `amount * 10_000 / price == 500` invariant only holds at price ≥ 0.02 SUI — an indexer must handle both branches (already noted in the model3d.move constant doc-block).
- ⚠️ Global, not per-collection: a creator's per-license `derivative_royalty_bps` (cap 30%, `MAX_DERIVATIVE_ROYALTY_BPS`, [[D-004]]) is **stored but not charged on resale** in v1 — that needs a custom `split_royalty_rule` deferred to v1.1.
- 🔮 Changing either value requires `remove_rule` + re-add (TransferPolicyCap authority) or a fresh republish, since RoyaltyRule's Config has no setter.

### Related
- Set in `contracts/model3d/sources/model3d.move` (`AMOUNT_BP_DEFAULT`, `MIN_ROYALTY_AMOUNT_MIST`, `ensure_collection_policy`); royalty-only policy from [[D-036]]; rate rationale in the Phase-4 brainstorm; distinct from the deferred L2 derivative royalty ([[D-004]]).

---

## D-043: Marketplace discovery via `kiosk::ItemListed` event query (frontend), replacing localStorage tracking

**Status**: Accepted
**Date**: 2026-05-23
**Phase**: 4

### Context
D-041 shipped marketplace discovery as **approach (a)**: track seller kiosk ids in browser `localStorage` and query only those. This cannot surface a listing made from any wallet/browser the local client never recorded — so a buyer can't find a seller's listing unless the demo pre-seeds the kiosk id. D-041 explicitly deferred **approach (b)** (a `kiosk::ItemListed` event indexer) as the scalable path.

A read-only testnet probe (2026-05-23) confirmed (b) is cheap to do **frontend-only**: the Sui GraphQL `events` query, filtered by the full type-indexed `0x2::kiosk::ItemListed<…::model3d::NftToken>`, returns every listing of our token network-wide (6 events, no pagination, correct prices, cross-wallet) — no backend, no recurring cost. See `docs/solutions/integration-issues/sui-graphql-events-type-indexed-discovery-2026-05-23.md`.

### Decision
Adopt approach (b) **client-side** (no backend indexer): `useListings` discovers candidate kiosks by querying `ItemListed<NftToken>` events via GraphQL, then reads each kiosk's current `Listing` dynamic fields (existing `fetchListedRefs`) for the authoritative active set + price. Remove the `localStorage` kiosk tracking from `MarketPage` / `useListings`. This is the deferred (b) path from D-041, pulled forward because the probe showed it is small and free; it does **not** reverse the D-041 marketplace decision itself (Kiosk primitive, list + purchase PTBs, royalty-only policy all unchanged).

### Rationale
- Discovers cross-wallet listings (the actual bug with (a)); zero hosting cost; reinforces the decentralization narrative (no central server in the discovery path).
- Type-indexed event filter returns only our `NftToken`, so foreign NFTs sharing a kiosk are excluded at discovery.
- Reuses already-verified read code (`fetchListedRefs` + `joinTokenDetails`); ~half-day, single frontend PR.

### Alternatives Considered
- **Backend `ItemListed` indexer (Tier C)** — mirrors U7, gives shared cache + server-side sort/search/push, but needs an always-on host ($0–7/mo) + ~1.5–2 days + a single point of failure. Deferred to whenever the backend is deployed for U15; at current volume (6 listings) it gives no visible UX gain. See [[D-041]] consequences.
- **Keep localStorage (a)** — rejected: can't discover cross-wallet listings.

### Consequences
- ✅ Marketplace shows all on-chain listings of our token regardless of which wallet/browser made them.
- ✅ No infra, no recurring cost; immune to the broken `@mysten/kiosk` `getKiosk` price decode (reads dynamic fields directly).
- ⚠️ Each marketplace load does 1 events query + N kiosk dynamic-field reads + N token detail reads (parallelized). Fine at demo scale; grows linearly — Tier C is the answer if volume balloons.
- ⚠️ `ItemListed` is append-only history (same item can recur across relists/kiosks); discovery must reconcile against current `Listing` dynamic fields, not render events directly (handled by the discover→truth split).
- 🔮 Backend indexer (Tier C) remains the post-volume / product-feature path; this ADR is the bridge that makes it unnecessary for submission.

### Related
- Supersedes the discovery sub-decision in [[D-041]] (approach (a) → (b) frontend); marketplace core unchanged.
- Verified query + schema-drift gotcha: `docs/solutions/integration-issues/sui-graphql-events-type-indexed-discovery-2026-05-23.md`.
- Implementation: `frontend/src/market/useListings.ts`, `frontend/src/market/MarketPage.tsx`.

---

## D-044: Frontend visual identity = Brutalist editorial

**Status**: Accepted
**Date**: 2026-05-23
**Phase**: 5 (U15 UX polish window — submission prep)

### Context
Frontend is prototype-grade — inline `React.CSSProperties`, `system-ui` font, ad-hoc dark page bg in `MarketPage` but no shared design system across `/create`, `/launch`, `/market`, `/track`, `/`. Submission deadline 6/21 (29 days out). Judges scoring with Product/UX = 20% (4× the weight of Presentation) will see the live site directly via screencap recording.

The four-actor demo arc is the polish target — every screen on the arc needs a coherent visual language by 6/21. Inconsistent ad-hoc styling across screens makes the product read as a prototype regardless of feature completeness.

Visual identity also needs to satisfy a specific product constraint: a 3D model viewer is the page hero on `/create` and inside card grids on `/market` and `/`. Light page backgrounds wash out 3D content unless mitigated.

### Decision
Lock a single visual identity for the entire frontend: **Brutalist editorial.** Defined as: off-white page (`#F5F5F0`), pure white surfaces (`#FFFFFF`), heavy black borders (1.5px), zero rounded corners, italic-serif display type (Newsreader), sans body (Inter), monospace for chain data (JetBrains Mono), and a single accent (`#FF4500` red-orange) rationed to primary CTAs and exception states. The 3D viewer is rendered into a pure-black inset well so the white frame becomes a feature rather than a 3D-washout problem.

Full token reference: `docs/ux/design-tokens.md`. Per-screen polish backlog: `docs/ux/polish-backlog.md`.

### Rationale
- **Differentiation in the Overflow submission pile.** Sui ecosystem visual default is light + clean + blue (Sui Foundation, Mysten, Suiet, Walrus). Brutalist editorial stands out at a glance for a judge scanning many decks.
- **Black wells solve 3D washout.** Apple-product-page move — white frame around dark stage. Contrast makes the wireframes pop *more* than they did in any dark theme.
- **Editorial reads as taste.** The italic-serif + heavy-border + sparse-accent language signals craft and confidence. Aligns with "Strong projects… polished UX… long-term potential beyond hackathon" judge framing in handbook scoring guidance.
- **Production discipline suits a backend engineer.** No gradients, no shadows, no dark-mode parity, no fine-tuned glow halos. The system rewards rule-following over taste calls — appropriate for the user's stated experience profile.
- **Inline-style implementation matches existing pattern.** No Tailwind / CSS-modules refactor required; new `tokens.ts` module slots into the existing `React.CSSProperties` convention in `MarketPage.tsx` et al.

### Alternatives Considered
- **Dark techno** (cool dark + cyan accent). Best 3D-content contrast of the dark options; widely understood in crypto. Rejected as visually generic in an Overflow pile (OpenSea, Aave, Suiet all converge here).
- **Industrial studio** (warm dark + amber accent). Felt closest to Sketchfab/Unreal — strong signal for a 3D-asset product. Rejected after seeing the Brutalist render — Brutalist gives more visual identity per unit of effort.
- **Dark + amber hybrid.** Cool-dark surfaces + warm amber accent. Aesthetic compromise; rejected for same reason as Industrial.
- **Toy soft pastel** (cream + rounded + warm pastel accent). Approachable creator-economy feel; rejected because it actively fights the D-031 narrative (L1 = serious access economy, L2 = composable IP). Also same 3D-washout problem as Brutalist *without* the black-well mitigation move.

### Consequences
- ✅ Single visual system across all routes; new screens have a non-trivial style reference instead of ad-hoc CSS.
- ✅ 3D content reads stronger than in any other tested vibe (black wells maximize contrast).
- ✅ Implementation is light — `tokens.ts` + `index.css` + per-screen inline-style refactor; no library swap.
- ✅ Defensible aesthetic story for the demo video / pitch (judges score Product/UX 20%).
- ⚠️ Demands typography confidence. Without the recommended display serif (Newsreader / Source Serif), the system collapses to "unstyled black-on-white." 30 min budget for font selection is a hard prerequisite.
- ⚠️ Lack of motion / glow / depth cues makes a 30-second screencap feel slightly *still* compared to a dark-themed video. Mitigate with subtle 3D-viewer rotation (Babylon scene supports natively) + accent-color flicker on state transitions.
- ⚠️ Bright `#FF4500` accent must be rationed (≤5 instances per page) or the system collapses to "loud" instead of "editorial." Anti-patterns codified in `design-tokens.md` §8.
- 🔮 Post-submission tweaks are easy (token-level swaps); reversing to another vibe is medium effort (~1 dev-day of inline-style edits). Lock for 6/21 submission, reassess if scope changes.

### Related
- spec.md section: §1.7 (composable creator economy framing — narrative guides the "tool for makers" feel)
- ADR template source: `CLAUDE.md` lightweight variant
- Token spec: `docs/ux/design-tokens.md`
- Polish backlog (per-screen): `docs/ux/polish-backlog.md`
- Style exploration session (4 vibes + hybrid rendered live as mockups): chat 2026-05-23

---

## D-045: Two-step Tripo flow — `text_to_model` → `mesh_segmentation` chained server-side

**Status**: Accepted
**Date**: 2026-05-23
**Phase**: 4 (plan-013 — mesh segmentation + per-part coloring)

### Context
Tripo's `text_to_model` returns a single-material GLB — usable for v1 mint but not for per-part coloring. Tripo also exposes a separate `mesh_segmentation` task that takes a `text_to_model` task id (`original_model_task_id`) and produces a segmented GLB with N materials (one per part), naming nodes `tripo_part_0..N`. The two tasks are independent API calls, each with its own polling/cost. We need every L1 publish to surface a segmented base so the L2 variant editor can do per-part coloring.

Spike (`backend/scripts/spike-tripo-segmentation.ts`, deleted post-validation) confirmed: the chain works, takes ~2 min total (~35s text_to_model + ~90s mesh_segmentation), and consumes ~60 Tripo credits (~4× single-step cost).

### Decision
Backend `tripo` generator chains both calls server-side: `submitTask(prompt)` → `pollTask(taskId)` → `submitMeshSegmentation(taskId)` → `pollTask(segTaskId)` → `downloadGlb(url)`. Frontend sees no behavior change beyond longer latency.

### Rationale
- Single API surface for the frontend; no extra round-trips or progress states to invent.
- Mesh segmentation is non-optional for v1 — every L1 base must be forkable as a segmented variant collection. Making the chain conditional would create a runtime path where some bases can't be forked.
- Server-side chaining keeps both task ids private (no client-side state to lose if the user closes the tab between steps).

### Alternatives Considered
- **Make segmentation opt-in (single-step fast path for "I'm not planning to fork this")**: rejected — composable IP is the product narrative (D-031); the L1 / L2 economic loop only works if every base is segment-ready.
- **Run segmentation lazily at fork time**: rejected — adds 90s latency to the L2 creator's first interaction, when they're least committed; better to absorb the cost at L1 mint where the publisher is already in a long-running flow.

### Consequences
- ✅ Every published Model3D carries per-part materials — variants can color each part.
- ⚠️ L1 generate latency ~2 min (vs ~35s pre-D-045). UX must convey the longer wait honestly (`— GENERATING (Ns)` ticker).
- ⚠️ Tripo cost per L1 mint ~4×. D-051 raises the SUI fee in lockstep.
- 🔮 If Tripo's segmentation reliability turns out to be prompt-class-sensitive (cars OK, fantasy assets flaky), the chain may need a fallback to single-step + downstream warning. Not addressed in v1.

### Related
- spec.md section: §1 (composable creator economy)
- Related decisions: D-023 (Tripo prompt-mode), D-051 (fee bump in lockstep), D-052 (republish ceremony)
- Plan: `docs/plans/2026-05-23-013-feat-mesh-segmentation-per-part-coloring-plan.md` U3
- Spike: spike-tripo-segmentation.ts (deleted post-validation, see commit `0ba975c`)

---

## D-046: TINT mode over FLAT for per-part variant coloring

**Status**: Accepted
**Date**: 2026-05-23
**Phase**: 4 (plan-013)

### Context
For each part of a segmented base GLB, the variant editor needs to apply a creator-chosen color. Two viable rendering models: **FLAT** (replace baseColorTexture with a solid color, ignore the baked PBR detail) or **TINT** (preserve baseColorTexture, multiply by a chosen `baseColorFactor`). Tripo's segmentation output bakes PBR detail (subtle shading, surface variation) into each part's baseColorTexture — discarding it produces a "plasticine toy" look; preserving it under tint produces a usable but tint-luminance-bound look.

Spike (`backend/scripts/spike-seg-color-modes.ts`, deleted) generated visual references for both modes on `spike-seg-turbo.glb`. TINT preserved enough PBR character to read as a designed material; FLAT looked uniformly cheap.

### Decision
Backend material-swap uses **TINT mode**: `target.setBaseColorFactor(partSpec.baseColorRgb)` runs unconditionally; the existing baked `baseColorTexture` is preserved unless the variant spec explicitly provides a new `textureId` (the curated overlay library).

### Rationale
- Preserves Tripo's baked PBR detail at zero implementation cost (one fewer `setBaseColorTexture` call).
- TINT × baked texture gives non-uniform shading per part — readable as a designed material.
- Curated textures (D-049 lineage shape carries `textureId`) can still replace the baked texture when the creator wants a specific surface treatment; TINT is the *default*, not the only mode.

### Alternatives Considered
- **FLAT only**: rejected — discarding the baked PBR texture loses the only visual quality differentiator the segmentation output has over a procedurally-generated mesh.
- **Per-variant choice (TINT vs FLAT toggle)**: rejected as scope creep — adds a UI control with no clear win when TINT covers the design space, and complicates the lineage shape (`{ palette, mode, texture }`).

### Consequences
- ✅ Variants look like designed materials, not painted toys.
- ✅ Material-swap is a single code path; no branching by mode.
- ⚠️ Very dark baked textures + dark tint = muddy result. Mitigated in editor UX: the color picker exists at a layer above the baked texture, so creators get visual feedback.
- 🔮 If a future asset class (cartoon-style models) wants the FLAT look, the swap pipeline can grow a mode flag with the existing positional `partColors` contract.

### Related
- spec.md section: §1 (composable creator economy)
- Related decisions: D-045 (segmentation produces the baked PBR), D-049 (positional color array carries `textureId` overlay)
- Plan: plan-013 U4
- Spike artifacts: `frontend/public/dev-glbs/spike-seg-tint-*.glb` (visible at `/dev/compare`)

---

## D-047: Manual tagging at L1 publish over geometric / AI auto-labeling

**Status**: Accepted
**Date**: 2026-05-23
**Phase**: 4 (plan-013)

### Context
Per-part coloring at L2 needs a *semantic* mapping from "this part" to "primary/secondary/accent/detail" (or a custom label). Tripo's `tripo_part_N` naming is *positional* (stable across runs) but not *semantic* (part 0 is "first node in GLB order", not "the body"). Three ways to derive semantic labels: (a) **manual** — L1 creator clicks each part in a Babylon canvas and labels it; (b) **geometric heuristics** — analyze part volume / position / bounding box to guess role (largest = primary, etc.); (c) **AI auto-labeling** — second LLM call after segmentation to suggest labels from the prompt + node names.

### Decision
Manual tagging at L1 publish. The L1 creator clicks parts in a new `TaggingCanvas` Babylon picker; the chosen labels are stored in `Model3D.part_labels: vector<String>` and emitted in `ModelPublished`.

### Rationale
- Manual is implementable in one unit (U5 TaggingCanvas + U6 TaggingStep); auto-labeling needs another LLM round-trip + prompt engineering + a fallback when the LLM is wrong.
- The L1 creator is the only actor with ground truth — they wrote the prompt and know what each part is. Auto-labeling would have to guess.
- Manual aligns with the brutalist editorial UX: explicit, opinionated, no magic.
- "Skip remaining" (defaults unlabeled parts to `'detail'`) gives the impatient creator an escape hatch.

### Alternatives Considered
- **Geometric heuristics**: rejected — fragile across prompt classes (a sword's "primary" is the blade by volume; a chest's "primary" is the box, not the lid). No win over manual for the effort.
- **AI auto-labeling (LLM router call)**: rejected — pulls back the LLM router seam D-023 removed. Adds latency + cost + a wrong-answer recovery flow.
- **No labeling — just numeric indices in the L2 editor**: rejected — L2 creators don't know what "part 3" is without re-loading the base. The whole point of labels is human-readable variant authoring.

### Consequences
- ✅ Labels carry creator intent; L2 editor renders "PRIMARY / SECONDARY / ACCENT" columns instead of "PART 1 / PART 2 / PART 3".
- ✅ No LLM dependency, no auto-labeling failure modes.
- ⚠️ L1 publish flow gains a step (~15-30s of clicking for a 12-part car). "Skip remaining" defaults to `'detail'` to bound the floor.
- 🔮 If a fully-automated L1 flow becomes a pitch requirement, an optional auto-label pass could populate the labels map as a *default* the creator edits.

### Related
- spec.md section: §1, §2 (Model3D struct)
- Related decisions: D-023 (LLM router dropped), D-048 (label vocabulary)
- Plan: plan-013 U5 (TaggingCanvas), U6 (TaggingStep wiring)

---

## D-048: Free-text labels with 4 dropdown presets (`primary`, `secondary`, `accent`, `detail`)

**Status**: Accepted
**Date**: 2026-05-23
**Phase**: 4 (plan-013)

### Context
Once L1 manual tagging is the chosen path (D-047), the label *vocabulary* needs definition. Two ends of the spectrum: (a) strict enum of 4-5 fixed labels (compact, no free-text UI); (b) fully free-text (expressive, but every creator invents their own taxonomy and L2 collections become un-joinable across bases).

### Decision
Hybrid: 4 dropdown presets — `primary`, `secondary`, `accent`, `detail` — render as one-click buttons in TaggingStep, **plus** a free-text input (clamped to MAX_LABEL_LEN=32 to mirror Move's `MAX_TAG_LEN`). Presets cover the common case; free-text covers domain-specific bases (`fur`, `metal`, `glass`).

### Rationale
- 4 presets match the brutalist editorial design: short canonical vocabulary, one-click selection.
- Free-text preserves creator agency for unusual asset classes without forcing them through a "request a new preset" flow.
- 32-char bound = same per-element ceiling as `tags` (existing precedent in `MAX_TAG_LEN`). Avoids inventing a new constant.
- Unlabeled parts default to `'detail'` (per AE1/R6) — the "remainder" semantic preset doubles as the safe fallback.

### Alternatives Considered
- **Strict 4-preset enum, no free-text**: rejected — closes the door on creators who want semantic labels their asset class needs (e.g., a creature's "fur" or "scales").
- **Pure free-text, no presets**: rejected — every creator invents their own labels; L2 editor becomes unpredictable; cross-base sharing of palettes is impossible.
- **Larger preset set (~10-15 labels covering common asset classes)**: rejected — premature taxonomy; we don't have enough creator data to know which 15. The free-text escape hatch covers the long tail.

### Consequences
- ✅ Compact UI: 4 buttons + 1 input + (text) "→ &lt;current label&gt;" preview.
- ✅ L2 editor's column count is bounded (uniqueLabels typically 3-5 for preset users, up to ~MAX_PARTS for free-text users).
- ⚠️ Long-tail free-text labels reduce the cross-base palette-sharing potential. Acceptable for v1.
- 🔮 If creator data shows ~80% of bases use only the 4 presets, the free-text input could become an "advanced" disclosure.

### Related
- spec.md section: §2 (Model3D struct: `part_labels: vector<String>`)
- Related decisions: D-047 (manual tagging), D-049 (positional array carries the resolved labels)
- Plan: plan-013 U6
- Move bound: `contracts/model3d/sources/model3d.move:114` MAX_TAG_LEN (shared with `tags`)

---

## D-049: Lineage canonical shape = positional per-part color array (`partColors[i]` ↔ `materials[i]`)

**Status**: Accepted
**Date**: 2026-05-23
**Phase**: 4 (plan-013)

### Context
The L2 variant editor authors variants in *label space* (`palette: { primary: '#f00', accent: '#0f0' }`), but the backend material-swap pipeline operates in *index space* (loop `materials[i]`, apply `partColors[i]`). Bridging these requires choosing a canonical wire shape for `/api/collection/build` requests. Two options: (a) **label-keyed map** — backend resolves `palette[label]` per part using `Model3D.part_labels`; (b) **positional array** — frontend resolves labels to positions before posting, backend stays label-agnostic.

### Decision
Frontend resolves; canonical wire shape is **positional**: `partColors[i]` is the color for `materials[i]` in GLB order. Frontend uses `base.partLabels.map((label, i) => ({ baseColorRgb: hexToBaseColorRgb(row.palette[label]) }))` to bridge.

### Rationale
- Backend stays simple: no label registry, no label→index lookup, no schema for the palette map. Just `if (spec.partColors.length !== materials.length) throw PartCountMismatchError` and a positional for-loop.
- Failure mode is loud: a length mismatch fires a typed 422 envelope (`{ error: 'part_count_mismatch', materialCount, partColorsCount }`). Hard to silently misroute a color to the wrong part.
- Same shape works for legacy single-material bases: `partColors = [{...}]` (length 1).
- `paramsJson` per variant stores the *human-readable* `{ palette, texture }` shape for round-trip on collection re-open — separates the wire shape from the lineage shape.

### Alternatives Considered
- **Label-keyed map** (`{ partColors: { primary: '#f00', accent: '#0f0' } }`): rejected — pushes the resolution into the backend, requires the backend to read `Model3D.part_labels` from Sui, and creates an undefined-label silent-skip failure mode.
- **Hybrid (label + positional)**: rejected — two sources of truth invite drift.

### Consequences
- ✅ Backend swap pipeline is a clean N-material loop; tests cover length-mismatch directly.
- ✅ Frontend's label→position resolution is a single 5-line function; readable in `runBuildVariants`.
- ⚠️ Missing-palette-label fallback ('#cccccc' silent gray) is implemented in the resolver — accepted as the design (palette synced to labels at pick time; fallback only fires in pathological cases like a base republished mid-edit).
- 🔮 If a label-keyed wire shape becomes desirable (e.g., for cross-collection palette sharing), it can be added as a sibling field; the positional contract stays as the swap pipeline's input.

### Related
- spec.md section: §2.8 (Move struct), §3 (backend swap)
- Related decisions: D-047 (manual tagging produces labels), D-048 (label vocabulary)
- Plan: plan-013 U2 (shared types), U4 (backend swap), U7 (frontend resolution)
- Backend contract: `backend/src/lib/gltf-material-swap.ts` `PartCountMismatchError`

---

## D-050: Full-GLB-per-variant for v1 (defer override-form storage)

**Status**: Accepted
**Date**: 2026-05-23
**Phase**: 4 (plan-013)

### Context
Each L2 variant is a fully-baked GLB stored in a Walrus quilt patch (D-035). For a 6 MB base × 16 variants = 96 MB per collection. An alternative — **override form** — would store one base GLB + 16 small JSON "override docs" (`{ partColors, textureId }`); the L2 viewer would download base + override and reconstruct the variant client-side via gltf-transform.

### Decision
v1 stores **full GLB per variant** in the quilt. No override form, no client-side material-swap.

### Rationale
- Override form requires shipping gltf-transform + meshopt extensions to the browser, plus client-side compute on every L2 view. The browser bundle grows + first-paint slows.
- Full-GLB is what the existing D-035 quilt patching + D-038 launch flow already handle. No new storage path, no new viewer path.
- Walrus storage cost at testnet is effectively free; at mainnet, 96 MB per collection is acceptable for the demo arc's 1-2 reference collections.
- Mesh-segmentation makes per-variant GLBs *smaller* than they'd be without segmentation (TINT mode preserves baseColorTexture but per-part baseColorFactor adds ~80 bytes per material — negligible).

### Alternatives Considered
- **Override form (base GLB + per-variant JSON overrides, client-side swap)**: rejected for v1 — adds frontend complexity (gltf-transform in browser, async reconstruct per view) for a Walrus cost that doesn't bite until mainnet at scale. Flagged as the next plan if storage cost becomes a real constraint.
- **Hybrid (full GLB for tier-1 collections, override form for tier-2)**: rejected — premature; no creator data on which collections are tier-1.

### Consequences
- ✅ Storage path is unchanged from D-035; the L2 viewer is unchanged from D-037.
- ✅ Variant GLBs are self-contained — no runtime dependency on the base.
- ⚠️ Walrus cost grows linearly with `variant_count × base_size`. 16 × 6 MB = 96 MB per collection.
- 🔮 If storage cost becomes a constraint on mainnet, the override-form plan is the immediate next step. The shared types (D-049 positional array) are designed to carry the same per-part data in either shape.

### Related
- spec.md section: §3 (Walrus storage), §4 (Phase 4 deliverables)
- Related decisions: D-035 (quilt patches), D-037 (standalone base GLB), D-038 (launch with tokens)
- Plan: plan-013 U4 (backend swap), Risks & Dependencies section

---

## D-051: `TRIPO_FEE_MIST` raised from 0.1 SUI to 0.4 SUI (lockstep with D-045)

**Status**: Accepted
**Date**: 2026-05-24
**Phase**: 4 (plan-013)

### Context
D-034 set `TRIPO_FEE_MIST = 100_000_000n` (0.1 SUI) calibrated for the ~15-credit single-step `text_to_model` call. D-045 introduced the two-step segmentation chain (`text_to_model` + `mesh_segmentation`) at ~60 credits total (~4× the original cost). The SUI fee that gates the API call must reflect the new operational cost or the per-generation margin collapses to zero or negative.

### Decision
Raise both frontend `TRIPO_FEE_MIST` (`frontend/src/sui/modelTxBuilders.ts`) and backend `TRIPO_FEE_MIST` default (`backend/src/sui/client.ts`) from `100_000_000n` (0.1 SUI) to `400_000_000n` (0.4 SUI). Drift between the two values is a real footgun — if backend expects 0.4 but a stale frontend tab pays 0.1, the user is charged on chain with no refund path (the verifier rejects as `payment_insufficient_or_wrong_destination`).

### Rationale
- 4× lockstep with the 4× credit cost is the simplest justifiable scaling.
- Reversible via a single constant per side if demo-day feedback warrants tuning.
- Mirroring the constants in both processes (rather than a single shared source) keeps the frontend independent of backend env config — the verifier remains the source of truth at runtime, but the fee shown to the user matches the verifier's expectation by default.

### Alternatives Considered
- **Sliding scale by prompt complexity**: rejected — premature, no pricing data, adds a UI display contract for "your prompt will cost approximately X SUI".
- **Subsidize segmentation for v1 (keep 0.1 SUI)**: rejected — per-generation loss compounds with usage; not aligned with the "real product, not free demo" framing.
- **Drop segmentation for prompts the creator doesn't intend to fork** (avoid the cost increase): rejected by D-045.

### Consequences
- ✅ Per-generation margin restored to the D-034 economics.
- ⚠️ User-visible price 4× higher — `0.4 SUI` is the visible cost in the generate-button label. Mitigated by the UX framing ("Mesh segmentation enables L2 variant authoring — every base is fork-ready").
- ⚠️ Stale-FE-tab vs new-BE deploy footgun. CLAUDE.md operational note: keep the FE bundle and BE env var in sync at deploy time. Hard-coded BE default to 0.4 SUI gives a safe fallback when ops forgets to set the env var.
- 🔮 If demo-day feedback shows 0.4 SUI suppresses generation volume below useful levels, the constant flip is single-line on each side.

### Related
- spec.md section: §3.4 (SUI service fee)
- Related decisions: D-034 (Approach A fee-gating), D-045 (two-step chain forcing the increase)
- Plan: plan-013 U6
- Review-pass finding: ADV-001 — covered by the F1 fix (BE default raised to 0.4)

---

## D-052: Move package republish ceremony for `part_labels` struct field (v8)

**Status**: Accepted
**Date**: 2026-05-24
**Phase**: 4 (plan-013)

### Context
Plan-013 U1 adds `part_labels: vector<String>` to the existing `key`-able `Model3D` struct. Per Sui upgrade rules (`contracts/UPGRADE.md`), adding a field to a published struct mutates on-chain layout and is **not** a compatible upgrade — it requires a fresh package publish under a new `original-id`. The `publish` and `new_model` entry-fn signatures also gain a `part_labels` parameter (each independently breaking).

This is the same pattern as v3→v4 (D-035 + D-036), v4→v5 (D-037), v5→v6 (D-038), v6→v7 (D-040). Each republish abandons the prior package's on-chain objects on testnet.

### Decision
Republish the `model3d` package as **v8** under a fresh `original-id`. Pin the new package id in `contracts/model3d/Published.toml`, `contracts/networks/testnet.json`, and `frontend/src/sui/networkConfig.ts`. Re-bootstrap a fresh `TransferPolicy<NftToken>` via `ensure_collection_policy` (royalty rule only, D-036 carry-forward). Prior v7 testnet objects are abandoned.

### Rationale
- Mechanically required: struct-field-add and entry-fn-signature change are both layout-breaking.
- Consistent with the v3–v7 republish precedent — fresh `original-id` keeps a single package id (no published-at / original-id split that would force every PTB target to track both).
- Testnet objects from prior demos carry no demo-recording value (Phase 5 demo bake happens against the latest package). Hackathon scope tolerates the abandonment.
- Re-bootstrap of the TransferPolicy is one PTB (`ensure_collection_policy`) and ~0.05 SUI — cost is negligible.

### Alternatives Considered
- **`sui client upgrade` (compatible upgrade path)**: rejected — incompatible by Sui's rules; the upgrade would fail at validation.
- **Defer struct extension until mainnet (use a sidecar object for v1 part_labels)**: rejected — adds a second on-chain entity to track per Model3D, doubles the indexer load, and complicates the `ModelPublished` event shape with no win on testnet.
- **Versioning via a `Model3DV2` sibling struct + migration window**: rejected for hackathon scope — appropriate for mainnet but unnecessary when there's no on-chain state worth preserving.

### Consequences
- ✅ v8 published 2026-05-24 (testnet): package `0x9e673aa7…`, publisher `0xd966…`, TransferPolicy `0x308f…`. Move 64/64 tests green against the new struct shape.
- ✅ `Model3DSummary.partLabels` is now a first-class field, parsed by the indexer from `ModelPublished.part_labels`.
- ⚠️ All v7 testnet `Model3D` shared objects are abandoned. Any stale localStorage cache pointing at them would call v8 entry fns with v7 objectIds and surface raw Move aborts. Mitigated by F2 (cache key embeds the package id slice).
- ⚠️ Documentation (`contracts/UPGRADE.md`, `contracts/networks/testnet.json` `_meta`, `docs/phase-progress.md`) must be updated each republish to keep the chronology readable. Test guards (`networkConfig.test.ts` parity) catch the runtime artifact set; docs are manual.
- 🔮 Mainnet ceremony (D-009: 8/27 deadline) will use the latest v(N) shape at that time. Per-republish bootstrap cost is amortized across testnet rehearsals.

### Related
- spec.md section: §2.8 (Move struct shape)
- Related decisions: D-009 (testnet for 6/21, mainnet by 8/27), D-035 / D-037 / D-038 / D-040 (prior breaking republishes)
- Plan: plan-013 U1 + Operational Notes (UPGRADE.md ceremony)
- Republish ceremony: `contracts/UPGRADE.md` (Phase 4 v3–v7 precedent)
- Network artifacts: `contracts/networks/testnet.json` (v8 published 2026-05-24, digests `CsGKbndg…` publish + `4s2aAmRW…` bootstrap)

---

## D-053: Pre-sign confirmation in-app before any wallet popup

**Status**: Accepted
**Date**: 2026-05-25
**Phase**: 4 (plan-013 follow-up, surfaced during UAT)

### Context
Plan-013 U6 raised the Tripo SUI fee from 0.1 → 0.4 SUI (D-051) and routed it through the canonical PTB pattern (`splitCoins(gas, [amount])` → `transferObjects([coin], treasury)`). When the user ran UAT and hit the Slush wallet popup, the 0.4 SUI amount was rendered only inside a collapsed "Transaction details" section as a raw BCS hex value (`0x4000…` form), not as a clear "Send 0.4 SUI to 0xd9663…" headline. The user could not visually confirm what they were about to sign.

Research (web-researcher pass 2026-05-25) confirmed three things across Sui official docs, MystenLabs ts-sdk docs, Ethos wallet engineering writeup, @mysten/slush-wallet 1.0.5 changelog, and open-source dApp counterexamples (Cetus / Suilend etc.):

1. Our PTB shape is **canonical** — every Sui doc and open-source dApp uses the identical `splitCoins(gas) + transferObjects` pattern; no alternative builder call produces a different display.
2. Slush popup's headline summary is generated from **dry-run effects**, not PTB command structure. `splitCoins(gas, …)` immediately followed by `transferObjects` is inconsistently classified — Slush sometimes treats the split coin as gas-adjacent rather than user-initiated transfer, so the "Send X SUI to Y" headline doesn't fire and the buried hex inputs become the only on-popup signal.
3. Slush 1.0.5 changelog ships zero fixes addressing this; no SDK-level workaround exists. The Ethos wallet team's published engineering principle assigns this UX responsibility to the dApp layer ("contextually relevant details" live in app UI; wallet popup is raw signing).

### Decision
Every UI surface that triggers a wallet sign popup (PTB execution OR personal-message signature) **must** first render an in-app pre-sign confirmation panel that lists:

- A summary line per amount (label + value, e.g., `Tripo generation: 0.4 SUI`)
- The destination address with a human-readable note when one applies (e.g., `0xd966… (TRIPO_FEE_TREASURY / deployer)`)
- An optional `walletCaveat` note explaining that the wallet popup may render the amount as raw hex (Slush limitation)
- Explicit `Confirm` / `Cancel` actions; the wallet popup is opened only on `Confirm`

The wallet popup becomes a **secondary** confirmation layer, not the primary one. Our app owns the legibility contract.

Implemented as a reusable `frontend/src/ux/SignConfirmation.tsx` component. Initial integration: `/create` Tripo fee button (the call site that surfaced the gap). Pattern extends to the other PTB triggers (`/create` publish, `/launch` build + launch, `/market` list + buy) one by one as those flows are exercised in UAT or polish work.

### Rationale
- Removes single-point-of-failure dependence on Slush's classification heuristic — even if Slush's headline never fires, the user has already seen amount + recipient before the popup opens.
- Aligns with the published Sui-ecosystem wallet UX principle (Ethos engineering writeup) — wallets render raw signing surfaces, dApps render contextual confirmation.
- Cheap on engineering cost (~45 min for component + ADR + tests + one integration) vs. potential UAT-time surprises that erode user trust in the demo.
- Symmetric across PTB shapes — a single reusable component covers any future signing flow without per-call-site custom UI.

### Alternatives Considered
- **Wait for Mysten to ship a Slush fix**: rejected — Slush 1.0.5 has zero changelog entries on this; no roadmap signal; submission is 27 days out.
- **Change our PTB shape to coax Slush into a clean display**: rejected — research found no alternative builder call across Sui SDK / docs / open-source dApps that produces a different display. The pattern is canonical, the limitation is downstream.
- **Modal dialog instead of inline confirmation panel**: rejected — breaks the brutalist editorial inline flow on `/create`. Inline panel reads as a natural next step, modal feels like a system interrupt.
- **Toast-style "you signed X SUI" post-hoc notification**: rejected — confirms after the fact; doesn't give the user a cancel option once the popup is open.

### Consequences
- ✅ User can confirm operation amount + recipient before any wallet popup. Eliminates the "is this 0.4 SUI or 17 SUI?" mental-arithmetic problem on Slush hex display.
- ✅ Plan-014 frontend checklist gains an implicit 6th category (wallet pre-sign confirmation) — future PTB triggers default to using `SignConfirmation`.
- ⚠️ One extra click between intent and signing. Surfaces friction the user can see; acceptable trade for legibility.
- ⚠️ Each PTB call site has to be wired manually (no auto-wrap). Initial integration is `/create` Tripo fee; the rest are intentionally deferred to incremental rollout as they're touched, not a sweep.
- 🔮 The pattern extends naturally to mainnet (D-009 8/27 deadline) — mainnet amounts are real money, so the in-app confirmation matters even more there.

### Related
- spec.md section: TBD (will land when L1 publish flow is documented end-to-end in Phase 5 doc cleanup)
- Related decisions: D-034 (Tripo SUI fee gate — the PTB this first integrates with), D-051 (4× fee bump to 0.4 SUI — the magnitude that surfaced the UX gap), plan-014 §Scope Boundaries (agent-browser can't validate wallet popups → user becomes first tester → this gap got discovered)
- Plan: plan-013 follow-up commit (not a separate plan-015 — scoped as the UX fix plan-013 should have included for the 4× fee bump)
- Research source: web-researcher pass 2026-05-25 — Ethos wallet engineering principle, Sui docs (building-ptb, wallet-standard), MystenLabs ts-sdk docs, @mysten/slush-wallet 1.0.5 changelog
- Code surface: `frontend/src/ux/SignConfirmation.tsx` (new), `frontend/src/creator/CreateModelPage.tsx` (integration site)

---

## D-054: Remove preset labels from L1 tagging step (framing B)

**Status**: Accepted
**Date**: 2026-05-26
**Phase**: 4 (plan-013 UAT follow-up; refactor scoped for plan-015)

### Context
Plan-013 shipped the L1 tagging step with a 3-option preset dropdown (`primary` / `secondary` / `detail`) plus optional free-text. UAT on testnet v8 (2026-05-26) exposed that creators take the path of least resistance and use the presets — the step looks like "pick a standard category" rather than "design what gets customized." Downstream consequence: L2 VariantEditor columns inherit the abstract preset strings, and the entire derivative-IP narrative collapses to "pick three colors."

Requirements doc `docs/brainstorms/2026-05-26-l1l2-tagging-ux-requirements.md` reframes the step as **"Name what buyers can customize"** (framing B). The preset dropdown is the single biggest force pulling creators away from that framing — keeping it would defeat the rewrite.

### Decision
L1 tagging step's preset dropdown is **removed**. Label input becomes freeform text only, with model-aware placeholder hints (e.g. `"e.g. chassis, wheels, spoiler"`). Validation: min 1 character, max 32 characters, no blocked-label list. Continue gate requires every part to have at least 1 character.

### Rationale
- Three independent reviewers + the UAT user's verbatim feedback converged on "preset → abstract L2 columns" as the coherence-gap root cause.
- The proposed visual tools (4-mode preview canvas, part list panel, L2 column-hover mapping) only pay off if labels are authored, not picked from a defaults list.
- "Force the user to think" is a legitimate tradeoff when the thinking is the product (this is an authorship tool, not a form).
- Min-1-char + max-32 + no blocklist is the lightest-touch validation that still gates empty-state from publishing.

### Alternatives Considered
- **Keep preset but reframe as "fallback for boring models"**: rejected — 99% of users would still take the fallback, framing B has too weak a pull against a single-click escape hatch.
- **Replace presets with AI-generated label suggestions per mesh**: rejected for v1 — costs another external dep (LLM or curated heuristic), quality risk, latency cost. Reasonable for v1.1+ but not 6/21 submission.
- **Block known-useless labels (`part1`, `xyz`) via deny-list**: rejected — impossible to enumerate meaningfully; trust the user (they have to look at it on `/launch` too).

### Consequences
- ✅ L2 VariantEditor columns now reflect creator-authored intent (e.g. `CHASSIS / WHEELS / SPOILER` instead of `PRIMARY / SECONDARY / DETAIL`). AE3 in the requirements doc becomes achievable.
- ✅ Demo recording legibility lifts: the L1 tagging step becomes a 30-second moment of authorial work that the camera can show, not a generic taxonomy click.
- ⚠️ Tagging time per part increases (typing 5-10 chars vs clicking a preset). Mitigated by placeholder hints; ~30-90s added per publish.
- ⚠️ "What should I call this part?" is now a real creator question. The `?` hint icon at the step heading carries some of the load; the rest is design trust.
- 🔮 Pairs with D-055 (PARTS preview mode shows the parts visually, making naming easier).

### Related
- Origin doc: `docs/brainstorms/2026-05-26-l1l2-tagging-ux-requirements.md` (R1, R2, AE1, AE2)
- Related decisions: D-052 (plan-013 contract substrate, unchanged), D-055 (4-mode canvas pairs with this), D-044 (brutalist style this UI must use)
- Polish-backlog supersedes: `docs/ux/polish-backlog.md` §1 "tagging step UX" → captured here in requirements form
- Plan: plan-015 (this refactor)

---

## D-055: Preview canvas 4-mode standard (PBR / PARTS / SOLO / WIREFRAME)

**Status**: Accepted
**Date**: 2026-05-26
**Phase**: 4 (plan-013 UAT follow-up; infrastructure for plan-015)

### Context
Plan-013 UAT also surfaced that the L2 VariantEditor's columns have no visible link to the mesh they drive — forkers see `WHEELS` as a column header but can't tell which geometry that controls. Polish-backlog §2 proposed hover-highlight + scroll-into-view as a fix. Separately, framing B (D-054) needs a way to *show* creators that their mesh has parts before they name them.

Both gaps are versions of the same shape: the canvas needs render modes beyond textured PBR. Today `PreviewCanvas` and `TaggingCanvas` only render PBR; `TaggingCanvas` adds a HighlightLayer for the currently-selected part but that's a per-component capability, not a standard.

### Decision
`PreviewCanvas` and `TaggingCanvas` accept a `mode` prop that cycles through 4 modes — `PBR | PARTS | SOLO | WIREFRAME` — exposed via a small mono-pill toggle in the canvas well's top-left corner (sibling of the BG-toggle at top-right, added in commit `8ff1d4a`).

- **PBR**: existing textured render (default for most mounts)
- **PARTS**: deterministic palette (12 hues, cycled if N>12) assigns each segment a unique color
- **SOLO**: driven by external `highlightedParts: number[]` prop — listed parts vibrant, others dimmed to ~20% opacity
- **WIREFRAME**: Babylon's native `material.wireframe = true`

Default mode is context-aware per `R4` in the requirements doc:
- L1 tagging step → `PARTS` (visual proof of segments before naming)
- All other mounts → `PBR`

Toggle pill label format: `MODE: <VALUE>` (matches existing BG pill's `BG: <VALUE>`).

### Rationale
- One standard across both canvases — same mental model for L1 tagging, L2 variant editing, `/market` listings, detail pages.
- PARTS mode is the visual realization of framing B — it's the first thing a creator sees on the tagging step, and it answers "what are you about to name?" before the question is asked.
- SOLO mode driven by external prop (not internal selection state) lets L2 use the same component to highlight column-hover targets without re-implementing the highlight logic.
- WIREFRAME is cheap (~30min on top of the mode infrastructure) and visually striking on a black well, contributing to the brutalist editorial aesthetic for demo recording.

### Alternatives Considered
- **Ship only 3 modes (skip WIREFRAME)**: rejected — once mode-switching infrastructure exists, wireframe is a free 30-minute add with positive demo value.
- **Keep TaggingCanvas's internal selection-driven highlight, expose a different component for column-hover SOLO**: rejected — duplicates the HighlightLayer pattern across two components. External-prop-driven SOLO unifies both call patterns.
- **Modes as separate page sections (mini-canvases) instead of a single switching canvas**: rejected — 4 canvases would compete for vertical space and increase GPU cost; switching is conceptually cleaner.

### Consequences
- ✅ L2 column-to-mesh-part mapping (AE4 in requirements doc) becomes implementable without per-component custom highlight code.
- ✅ Mode pill is a single small UI element; visual cost is low. Mirror placement (top-left vs top-right BG) reads as one coordinated control system.
- ✅ Editorial recording gain — PARTS-mode rainbow + WIREFRAME both give the camera something visually distinctive beyond the textured render.
- ⚠️ Mode state lives in component-local `useState` (per-instance), so multi-instance pages (e.g. variant strip thumbnails) each have independent state. Acceptable — global mode state would surprise users.
- 🔮 Future modes can land additively (`NORMALS`, `UV`, `AO` for debugging) without breaking the API.

### Related
- Origin doc: `docs/brainstorms/2026-05-26-l1l2-tagging-ux-requirements.md` (R4, R5, R7, R8)
- Related decisions: D-044 (brutalist style — mode pill must use design tokens), D-054 (framing B pairs with PARTS mode), commit `8ff1d4a` (the BG-toggle pattern this mirrors)
- Code surface: `frontend/src/babylon/PreviewCanvas.tsx`, `frontend/src/babylon/TaggingCanvas.tsx`, new `frontend/src/babylon/modePalette.ts` + `ModeTogglePill.tsx` (analogues of existing `bgPalette.ts` + `BgTogglePill.tsx`)
- Plan: plan-015 (this refactor)

---

## D-056: Random Gen uses harmonic-from-seed palette derivation

**Status**: Accepted
**Date**: 2026-05-26
**Phase**: 4 (plan-013 UAT follow-up; new feature for plan-015)

### Context
Plan-013 shipped per-label palette-based variant authoring; UAT user feedback was that authoring N variants 1-by-1 is tedious — "build a random btn to gen color and texture, user just need to decide how much variant to gen." A naive Random Gen ("pick N random RGBs per label per variant") produces visually incoherent noise: a variant might have a magenta chassis and a teal spoiler. Each variant individually fails to read as "a designed thing"; the collection as a whole fails to read as "a series."

Two coherence-preserving alternatives:
1. **Creator-defined palette** — creator picks 4-6 colors first, then random gen samples from that set
2. **Harmonic-from-seed** — creator picks one seed color + a harmonic scheme (analogous / complementary / triadic / tetradic); random gen derives a palette from the scheme

### Decision
Random Gen uses **harmonic-from-seed**. Inputs: variant count N (1–20), single seed color (HSL picker), harmonic scheme (4 options exposed as 4 preview swatches the user picks from). Random Gen produces N variants where each variant's K labels receive K colors drawn from harmonic rotations around the scheme, guaranteeing within-variant coherence and between-variant distinctness.

Variant locking: each variant strip thumbnail has a small `[L]` toggle (top-right corner). Locked variants survive re-rolls; unlocked variants are regenerated when Random Gen is re-invoked. Button label reflects state: `RANDOM GEN (N VARIANTS)` when none locked, `RANDOM GEN (M OF N, K LOCKED)` when K locked.

### Rationale
- Harmonic-from-seed gives "designed-looking" output without forcing the creator to pre-curate a palette (one extra UI step they'd skip).
- 4 preview swatches as scheme picker is a visual decision (creator sees what each scheme produces under their seed) — beats a dropdown of abstract scheme names.
- Per-variant lock makes Random Gen iterative: creator can lock a variant they like, re-roll the rest, accumulate keepers. Lower friction than a one-shot generate.
- Color theory is small (~50 lines for the 4 schemes); no external dep needed.

### Alternatives Considered
- **Pure random RGB**: rejected — visually incoherent ("rainbow vomit"); variants don't read as a series.
- **Creator-defined palette**: rejected — extra setup step before Random Gen; creators in a hurry skip both.
- **AI-generated palette suggestions** (e.g. "match this model's mood"): rejected for v1 — same dep + cost reasons as D-054 alternative.
- **No lock — just re-roll all**: rejected — destroys the keeper a creator just liked; iteration becomes adversarial.

### Consequences
- ✅ AE5 in the requirements doc (creator generates 10 variants via random gen, locks variant 3, re-rolls rest, launches) becomes achievable in v1.
- ✅ Random Gen is a clear "tedium remover" beat in the demo recording — one click → 10 visually different variants. Strong "compositional creator economy" visual.
- ⚠️ Color theory math is correct only for sRGB perceptual color (not perfect across all displays); acceptable since variants are author-defined intent, not reference matches.
- ⚠️ N=20 cap exists in the Move contract (`MAX_VARIANTS_PER_COLLECTION = 20`); UI honors that. Future cap raises would automatically apply.
- 🔮 Texture customization (D-057-deferred) would naturally extend Random Gen — "random texture from a curated set" — but not in v1.

### Related
- Origin doc: `docs/brainstorms/2026-05-26-l1l2-tagging-ux-requirements.md` (R11, AE5)
- Related decisions: D-026 (per-label palette resolution — the substrate this random gen feeds into), D-052 (plan-013 contract, MAX_VARIANTS = 20)
- Code surface: new `frontend/src/forge/randomGen.ts` (harmonic math + variant generation), `frontend/src/forge/VariantEditor.tsx` (UI integration)
- Plan: plan-015 (this refactor)

---

## D-057: Texture customization deferred to v1.1 (color-only for v1)

**Status**: Accepted
**Date**: 2026-05-26
**Phase**: 4 (plan-013 UAT follow-up; scope boundary for plan-015)

### Context
The L1/L2 tagging UX refactor requirements scoping discussion (2026-05-26 PM session) considered whether L2 variant authoring should support per-part **texture** customization in addition to per-part color. UAT user explicitly asked for both: "a palette system which allow user the customize color or texture for each segment part."

Texture customization is a substantive new feature surface:
- Source: where do textures come from? (user upload? internal library? AI generation?)
- Pipeline: `@gltf-transform/core` supports `baseColorTexture` swap, but binary patching is heavier than `baseColorFactor`.
- Preview: rendering swapped textures live requires re-baking the GLB → flicker risk.
- Storage: textures themselves need Walrus blob storage if user-uploaded.

Effort estimate for v1 texture: ~3-5 days (library + UI + backend material swap + preview re-bake).

### Decision
Texture customization is **deferred to v1.1**. The L1/L2 refactor in plan-015 ships **color-only** customization (status quo from plan-013, unchanged). Texture is recorded in `docs/ux/polish-backlog.md` as a v1.1 candidate.

### Rationale
- 36 days to 6/21 submission as of decision; 3-5 days for texture is 8-14% of remaining time, displacing demo recording / polish / mainnet spike.
- Demo recording quality with color-only is already strong (10 rainbow car variants reads cleanly on video). Texture would add fidelity but not demo storytelling.
- Texture quality risk: poorly-mapped textures on segmented Tripo meshes can look worse than no texture (UV seams, scale mismatch). Color is safer for v1 demo.
- AI / user-upload texture surface dramatically increases the moderation + storage surface. Not the hackathon submission's strongest framing.

### Alternatives Considered
- **Ship texture v1 with 4-6 internal presets (carbon fiber, brushed metal, matte plastic, glossy paint)**: rejected — still 2-3 days for backend material-swap + preview + UI, and the curated-set framing doesn't match the "freeform creator" pitch.
- **Ship texture v1 with user-upload**: rejected — storage + moderation surface too big for 6/21 timeline.
- **Random Gen texture as separate v1 feature** (D-056 extension): rejected — same dep cost as full texture.

### Consequences
- ✅ Plan-015 stays scoped to ship within 1-2 weeks of `/ce-plan`; submission timeline preserved.
- ✅ Demo recording uses color-only customization; the variant strip in `/launch` reads cleanly without texture-fidelity concerns.
- ⚠️ The UAT user's stated desire ("color or texture") is partially deferred — UI copy should not promise texture (avoid creating expectation gap).
- ⚠️ Future texture feature needs to fit into the existing 4-mode preview canvas (D-055) + per-label palette resolution (D-026). Architecture is texture-ready, just not feature-shipped.
- 🔮 v1.1 texture roadmap: internal preset library first (4-6 textures), user-upload later, AI-texture last. Polish-backlog updated with this ordering.

### Related
- Origin doc: `docs/brainstorms/2026-05-26-l1l2-tagging-ux-requirements.md` Scope Boundaries section
- Related decisions: D-026 (per-label palette resolution — texture would extend), D-050 (full-GLB-per-variant — texture variants would still fit), D-006 (GLB-only — texture lives inside GLB material)
- Polish-backlog entry: `docs/ux/polish-backlog.md` — add a v1.1 texture line under §2 /launch palette
- Plan: plan-015 ships without it; polish-backlog tracks for v1.1

---

## D-058: TestWallet adapter uses `Ed25519Keypair` directly, not a mocked dapp-kit hook or shadow context

**Status**: Accepted
**Date**: 2026-05-27
**Phase**: Phase 4 follow-up (plan-016)

### Context
The user's Chrome (Slush unlocked + active session + many sibling tabs) consistently crashes the renderer at `flow.encode() → systemState()` on `/launch` 8-variant upload. After 11 in-Chrome workaround commits failed to clear it (branch `debug/walrus-upload-crash`), the demo path needs to bypass Slush entirely. We need a Signer the rest of the dapp can consume the same way it consumes dapp-kit's hook outputs.

### Decision
Implement the test-wallet bypass as `Ed25519Keypair.fromSecretKey(bech32)` loaded from `VITE_TEST_WALLET_KEY` in `frontend/.env.local`. No wrapper class. The keypair instance IS the Signer — `@mysten/sui@2.16.2`'s `Ed25519Keypair` already extends the SDK's `Signer` abstract class with all four methods the dapp consumes (`toSuiAddress` / `signTransaction` / `signAndExecuteTransaction` / `signPersonalMessage`).

### Rationale
- Smallest surface — no fake `SuiWallet` registration, no `WalletProvider` shadow, no custom `Signer` class.
- The keypair's `signAndExecuteTransaction({transaction, client})` matches the exact shape Walrus `writeFilesFlow` calls on the signer.
- Backend `verifyPersonalMessageSignature` is signature-scheme-agnostic, so a test-wallet-signed challenge verifies identically to a Slush-signed one (both Ed25519, same address — see D-059 operating assumption).

### Alternatives Considered
- **Mock a dapp-kit hook** — would require monkey-patching `useSignTransaction` / `useSignPersonalMessage` per call site. Brittle and visible at multiple boundaries.
- **Shadow `WalletProvider` context** — dapp-kit's context internals aren't publicly exported. Reverse-engineering them is brittle and risks breaking on SDK upgrades.
- **Register a synthetic `Wallet` via `@wallet-standard`** — full Wallet Standard implementation is overkill for a test-only bypass.

### Consequences
- ✅ One concept (the keypair) carries the whole adapter; no separate Signer class to maintain.
- ✅ Test-mode flow is identical to prod-mode flow at every call site — same Signer shape, same return shapes.
- ⚠️ The `signAndExecuteTransaction` call site needs a `client` arg (which the keypair uses to execute the transaction). Plan-016 U4 added `useSuiClient()` to LaunchCollectionPage for this.
- 🔮 If future expansion (e.g., `/create` automation) needs the adapter, the same keypair singleton is reused — no class hierarchy to extend.

### Related
- Brainstorm: `docs/brainstorms/2026-05-27-test-wallet-adapter-requirements.md` §Key decisions / D-058 candidate
- Plan: `docs/plans/2026-05-27-016-feat-test-wallet-adapter-plan.md` §U1 / §U2
- Code: `frontend/src/test-wallet/loadKeypair.ts`

---

## D-059: Activation = build-time `VITE_TEST_WALLET=1` + thin wrapper hooks at call sites

**Status**: Accepted
**Date**: 2026-05-27
**Phase**: Phase 4 follow-up (plan-016)

### Context
The test wallet must be invisible in production builds (no behavioral change, no code in the bundle, no ambient possibility of activation). It must integrate at the dapp-kit hook boundary without forking every call site or shadowing dapp-kit's React context. Critical operating assumption: the test-wallet key is the user's *existing* funded testnet key (the one Slush also holds). Test-wallet address == Slush address == creator-of-existing-Model3Ds. If the test wallet were a different key, the user would have to /create a Model3D on that address before /launch — out of scope.

### Decision
Activation is a build-time env var: `VITE_TEST_WALLET=1` in `frontend/.env.local`. Vite replaces `import.meta.env.VITE_TEST_WALLET` with a string literal at build time, so the wrapper hooks' `TEST_WALLET_ENABLED` constant becomes a compile-time `true` or `false`. Integration uses two thin wrapper hooks (`useAppAccount`, `useAppSigner`) at the relevant call sites instead of shadowing `WalletProvider` context.

### Rationale
- **Build-time over runtime**: localStorage / URL-param activation could be triggered accidentally in production. Build-time activation requires deliberate `.env.local` setup; no production user can flip the flag.
- **Wrapper hooks over shadow context**: dapp-kit's React context internals aren't publicly exported; mirroring them is brittle. Wrapper hooks at 3 call sites (useSession, LaunchCollectionPage, future adopters) is ~6 lines per site and gives precise control.
- **Tree-shake**: when `TEST_WALLET_ENABLED` is the compile-time `false`, Rollup eliminates the test-mode branch + the static `test-wallet/*` imports → zero bytes of adapter logic in the production bundle (AE4 grep verifies).

### Alternatives Considered
- **Runtime flag via localStorage** — rejected. Too easy to accidentally activate; defeats tree-shake.
- **URL param (e.g., `?testWallet=1`)** — rejected. Same activation-risk concerns.
- **Shadow dapp-kit context** — rejected per D-058 rationale.

### Consequences
- ✅ Production builds: zero behavior change, verified by AE4 grep (only inert UI string literals remain).
- ✅ Test builds: 3 call sites refactored, every other surface untouched.
- ⚠️ Anyone activating must use the SAME key as Slush — different keys would break the user's existing model state. `.env.example` warns about this.
- 🔮 Future call sites (CreateModelPage, MarketPage, TrackPage) can adopt the same wrapper hooks with no adapter changes.

### Related
- Brainstorm: `docs/brainstorms/2026-05-27-test-wallet-adapter-requirements.md` §Context "Critical operating assumption — same address"
- Plan: `docs/plans/2026-05-27-016-feat-test-wallet-adapter-plan.md` §U2
- Code: `frontend/src/wallet/testWalletEnabled.ts`, `useAppAccount.ts`, `useAppSigner.ts`

---

## D-060: TestWallet adapter scope = `/launch` only for v1

**Status**: Accepted
**Date**: 2026-05-27
**Phase**: Phase 4 follow-up (plan-016)

### Context
The demo-blocking crash is on `/launch` (writeFilesFlow encode during the 8-variant upload). `/create`, `/market`, and `/track` use their own dapp-kit hook call sites and have their own crash characteristics (or none). Adopting wrapper hooks across all four routes triples the file refactor scope. Hackathon submission is 25 days away.

### Decision
Wrapper-hook adoption is scoped to `useSession.ts` (sign-in JWT challenge) + `LaunchCollectionPage.tsx` (3 mint popups) for plan-016 v1. `/create`, `/market`, and `/track` keep direct dapp-kit hooks. `CreateModelPage.tsx`'s own in-file `useDappKitSigner` helper stays on Slush.

### Rationale
- **Demo unblock is the bottleneck.** The submission demo is /create → /launch → /market. `/launch` is the broken link. `/create` already works on Slush (single popup, no 8-variant encode). `/market` works on Slush. `/track` is a read-only view.
- **Refactor cost.** Each adopter is ~6 lines but multiplies the test-mock surface and the verification effort. Deferring keeps v1 focused.
- **No architectural lock-in.** Future expansion (full automation for /create or /market) re-uses the same adapter — only adds wrapper-hook adoption to those call sites.

### Alternatives Considered
- **Full adoption across all 4 routes in v1** — rejected. Triples scope; doesn't help demo.
- **Adopt only on the JWT-sign site** — rejected. The /launch crash is on the upload path, not the sign-in; partial adoption wouldn't unblock the demo.

### Consequences
- ✅ Demo unblocked with minimal code change.
- ⚠️ /create still requires Slush. If the user's /create flow also starts crashing, this decision needs revisiting.
- 🔮 Plan-014 follow-up (agent-browser automation for /launch CI) is enabled. Extending to /create automation requires adding wrapper-hook adoption to CreateModelPage — out of plan-016 scope.

### Related
- Brainstorm: `docs/brainstorms/2026-05-27-test-wallet-adapter-requirements.md` §Key decisions / D-060 candidate
- Plan: `docs/plans/2026-05-27-016-feat-test-wallet-adapter-plan.md` §Scope Boundaries

---

## D-061: All test-wallet code lives in `frontend/src/test-wallet/` + ESLint allow-list

**Status**: Accepted
**Date**: 2026-05-27
**Phase**: Phase 4 follow-up (plan-016)

### Context
The test-wallet adapter must not ship to production. Three independent belts protect against accidental leak; this decision is about the file-system + import-graph belt.

### Decision
All test-only code lives under `frontend/src/test-wallet/`. Two production-safety belts at the import-graph level:
1. **Module-eval guard**: `test-wallet/index.ts` throws at module load if `import.meta.env.PROD === true`. Belt against accidental ship even if tree-shake fails.
2. **ESLint allow-list (documented intent)**: `no-restricted-imports` blocks `*/test-wallet/*` imports from all files except those under `src/wallet/*` and `src/test-wallet/*`. NOTE: ESLint is not currently installed in this project (no `lint` script, no `eslint` dep); the config file documents the intended ruleset for when ESLint gets wired up. Actual enforcement comes from belts 1 + 3 (AE4 grep, see below).

### Rationale
- **Single quarantine directory** makes the test-only surface easy to audit and rip out if needed.
- **Module-eval throw** catches the case where a future refactor accidentally imports from test-wallet at a production code path even when the env flag is unset.
- **ESLint rule** (when active) catches the issue at write time rather than at production runtime.
- **AE4 grep** is the final belt — actual verification on the built bundle, independent of code-level guarantees.

### Alternatives Considered
- **`__dev/test-wallet/` directory naming** — considered. `test-wallet/` is conventional in Vite/React projects and clearer in PR diffs.
- **Conditional dynamic `import('./test-wallet')`** — rejected for hook ergonomics (dynamic imports return Promises; hooks can't easily await). Static import + tree-shake produces the same end-state with simpler call sites.
- **Install ESLint and wire `lint` script in plan-016** — rejected as scope creep. Brainstorm explicitly accepted "manual grep verification acceptable for v1" as a non-goal.

### Consequences
- ✅ Three independent belts against production leak: module guard + tree-shake + grep verification.
- ✅ Quarantine directory makes future audit / removal trivial.
- ⚠️ ESLint rule is documented intent only until ESLint gets installed; relies on grep verification meanwhile.
- 🔮 If ESLint is added later, the existing config in `eslint.config.js` is ready to enforce without further changes.

### Related
- Brainstorm: `docs/brainstorms/2026-05-27-test-wallet-adapter-requirements.md` §Key decisions / D-061 candidate
- Plan: `docs/plans/2026-05-27-016-feat-test-wallet-adapter-plan.md` §U6 verification
- Code: `frontend/src/test-wallet/index.ts` (module guard), `frontend/eslint.config.js` (allow-list)
- AE4 grep result: 7 plan-016-specific identifiers → 0 matches; 2 inert UI string matches (banner testid, constant-folded `data-test-wallet="false"`)

---

## D-062: Multi-quilt batching with `QUILT_SIZE = 4`, exposed in UX

**Status**: Accepted; **partial failure** captured by D-067 post-mortem
**Date**: 2026-05-28
**Phase**: Phase 4 follow-up (plan-017)

### Context
On user's Brave with sibling tabs, an 8-variant `/launch` upload crashed the renderer mid-encode. The Brave minidump at `2026-05-28 09:53:41` showed V8 GC at the 4 GB ceiling with mu = 0.003 (last resort). User dose-response: 5 variants OK, 8 variants crash. Root cause is V8 heap OOM: the SDK's `encodeQuilt` runs `Promise.all` over all variants, peaking at 20–40 MB × N on top of Brave baseline + Babylon scene + cached state.

### Decision
`useWalrusUpload.uploadFiles` chunks N variants into K = ⌈N / 4⌉ quilts of up to 4 variants each. Each quilt is one `writeFilesFlow({files: [chunk]})` call → 2 wallet signatures per quilt (register + certify). Total user signatures = 2K + 1 (+1 for the launch PTB). UX (`BatchProgressPanel`, R6) surfaces this structure explicitly: pre-flight breakdown ("8 variants → 2 quilts → 5 transactions") plus stepped per-quilt progress.

### Rationale
- Inside-one-quilt `Promise.all` peak with `QUILT_SIZE=4` is ~120 MB — fits inside V8's 4 GB ceiling even with sibling-tab pressure (when paired with Babylon dispose during upload, D-063).
- Verified `createWriteFilesFlow` independence: each call returns a fresh closure (`let quiltBytes / quiltIndex`); no module-level shared state. Sequential multi-quilt is safe.
- 2 → 4 popups looks like UX regression in isolation. Pre-flight breakdown + stepped progress reframes as honest Walrus-protocol surfacing, not regression. Doubles as Walrus-track positioning win.

### Alternatives Considered
- **Per-variant `writeBlobFlow` loop** — rejected: produces 2N popups (16 for 8 variants), unusable for Slush users. Catalogued anti-pattern in `docs/solutions/architecture-patterns/walrus-writefilesflow-popup-batching-2026-05-15.md`.
- **SDK patch to make `encodeQuilt` sequential** — rejected: half-day cost for ~20 MB peak savings; pnpm-patch fragility through SDK upgrades. Multi-quilt achieves the same heap envelope with no SDK dependency.
- **Lower variant cap to 4** — rejected: regresses the demo story; AE2's 8-variant flow is core to the pitch.

### Consequences
- ✅ Heap envelope fits under V8 cap for N ≤ 8 (the current MAX_VARIANTS) on user's Brave.
- ✅ No SDK fork or upstream patch — survives @mysten/walrus upgrades transparently.
- ⚠️ User signs 2K+1 transactions instead of 3. Mitigated by R6 UX.
- ⚠️ Mid-batch failure leaves orphan Walrus blobs (paid storage that can't be deleted). `UploadError.batchIndex` surfaces the cost in U4's panel; on testnet this is free, on mainnet it's small.
- 🔮 If AE2 still OOMs on user's Brave despite Babylon dispose, drop `QUILT_SIZE` to 2 (constant-only change; doubles popups but halves peak).

### Related
- Plan: `docs/plans/2026-05-28-017-fix-walrus-oom-plan.md` §U1, §U4
- Brainstorm: `docs/brainstorms/2026-05-28-walrus-oom-fix-requirements.md`
- Code: `frontend/src/walrus/useWalrusUpload.ts` (refactor); `frontend/src/collection/BatchProgressPanel.tsx` (UX surface)
- Source check: `frontend/node_modules/@mysten/walrus/dist/flows/write-files.mjs` confirms closure-scoped flow state.

---

## D-063: PreviewCanvas dispose via imperative `useImperativeHandle` ref; engine stays alive

**Status**: Accepted
**Date**: 2026-05-28
**Phase**: Phase 4 follow-up (plan-017)

### Context
The Babylon scene on `/launch` holds ~200–400 MB of meshes, materials, textures, observers, and HighlightLayer. While the user is authoring variants this is necessary, but during the Walrus upload window it sits idle and contributes to the heap envelope that triggers OOM (see D-062). It needs to drop during upload and restore after.

### Decision
`PreviewCanvas` is wrapped in `forwardRef<PreviewCanvasHandle>` exposing `dispose()` and `remount()` via `useImperativeHandle`. Engine creation moves to a `useEffect(() => {...}, [])` that persists for the component lifetime; scene + camera + light + HighlightLayer + pointer observable cycle in a `useEffect(() => {...}, [mounted])` whose cleanup disposes them and calls `engine.wipeCaches(true)`. LaunchCollectionPage holds the ref, calls `previewRef.current?.dispose()` before `runBuildVariants`, and `remount()` in the `finally` block. `VariantPreview` accepts a `previewRef` prop and threads it through.

### Rationale
- **Imperative ref vs conditional render**: a `phase === 'uploading'` gate would dispose the scene but expose the `react-strictmode-cleanup-only-effect-with-useref` trap (documented in `docs/solutions/integration-issues/...`) under React 19 StrictMode. The imperative ref is deterministic — caller decides exactly when dispose fires.
- **Engine stays alive**: destroying the Engine triggers WebGL context loss which can ripple into other GL features and adds 100+ms to recreation. Disposing only scene/HL is the surgical scope.
- **`engine.wipeCaches(true)`** flushes Babylon's effect/material caches. Verified necessary on macOS Metal where `scene.dispose()` alone doesn't return VBO/texture allocations to the driver.
- **`isDisposedRef` guard** in the async GLB-load path catches the case where dispose() fires between `LoadAssetContainerAsync` resolution and the cancellation-check branch (belt to the per-effect `cancelled` flag, which only handles same-cycle re-runs).

### Alternatives Considered
- **Conditional render gated on phase** — rejected per StrictMode trap above.
- **Engine-level destroy + recreate** — rejected: WebGL context loss is heavier than we need; the scene/HL scope is sufficient to free the memory in question.
- **CSS `display: none`** — rejected: hides the canvas but doesn't free the Babylon GPU/CPU resources; the heap problem persists.

### Consequences
- ✅ ~200–400 MB heap drops during the upload window; restored afterward.
- ✅ Engine stays alive; no WebGL context-loss thrash.
- ⚠️ All dependent effects (`bg`, `glbUrl`, `autoRotate`) gained `mounted` in their deps so they re-fire after remount against the new scene.
- 🔮 If GPU memory still doesn't reclaim on some platforms, follow-up could add explicit `engine.releaseEffects()` per OQ-B.

### Related
- Plan: `docs/plans/2026-05-28-017-fix-walrus-oom-plan.md` §U2, §U3
- Code: `frontend/src/babylon/PreviewCanvas.tsx`, `frontend/src/forge/VariantPreview.tsx`, `frontend/src/collection/LaunchCollectionPage.tsx`
- Solution doc reference: `docs/solutions/integration-issues/react-strictmode-cleanup-only-effect-with-useref-2026-05-23.md`

---

## D-064: `performance.memory` warning threshold = 2.5 GB with 2.2 GB hysteresis; Chromium-only is acceptable scope

**Status**: Accepted
**Date**: 2026-05-28
**Phase**: Phase 4 follow-up (plan-017)

### Context
Walrus encoding peaks at ~120 MB per quilt (D-062). On Brave with 10+ sibling tabs, baseline heap can sit at 3 GB+ before LAUNCH — leaving < 1 GB headroom before V8's 4 GB ceiling. A pre-flight signal helps users see the risk and close other tabs before they hit the crash that motivated this entire plan.

### Decision
`MemoryPressureBanner` reads `performance.memory.usedJSHeapSize` via the shared `readHeapMb()` helper. Banner appears when usage ≥ 2.5 GB (`HEAP_WARN_ON_BYTES`) and stays visible until usage drops below 2.2 GB (`HEAP_WARN_OFF_BYTES`) — hysteresis prevents flicker when the value sits near the boundary across Brave's fingerprint-protection quantization. The banner is dismissable; a `recheckSignal` prop bumped on LAUNCH click re-surfaces a dismissed banner if heap is still over threshold. On browsers without `performance.memory` (Firefox, Safari) the component returns `null` — graceful no-op.

### Rationale
- **Threshold**: 2.5 GB leaves ~1.5 GB headroom for encode + dapp state, matching the OOM math from the Brave minidump.
- **Hysteresis**: Brave rounds heap reads in ~100 MB buckets (fingerprint-protection); a sharp threshold flickers under bucket transitions.
- **Chromium-only scope is OK**: Slush wallet is Chromium-only; the test wallet path (D-058) doesn't need this signal; production users on non-Chromium would already fail at Slush connection. R4 is best-effort signal, not a correctness gate.
- **Best-effort, not blocking**: the user can dismiss and proceed at their own risk. The banner exists to inform, not to gate.

### Alternatives Considered
- **Hard gate on heap > threshold** — rejected: false positives would block legitimate uploads; signal not authoritative enough.
- **Single threshold without hysteresis** — rejected: Brave quantization causes visual flicker.
- **Different threshold per browser** — over-engineered for v1; one threshold is good enough.

### Consequences
- ✅ User gets a pre-flight signal that high heap = crash risk; can close tabs proactively.
- ⚠️ Firefox / Safari users see no banner ever (acceptable scope per Chromium-only rationale).
- ⚠️ Threshold may need tuning if real users report false positives or false negatives in production.

### Related
- Plan: `docs/plans/2026-05-28-017-fix-walrus-oom-plan.md` §U5
- Code: `frontend/src/collection/MemoryPressureBanner.tsx`, `frontend/src/walrus/uploadTrail.ts` (`readHeapMb`)

---

## D-065: `sessionStorage` (not localStorage) for Walrus upload crash breadcrumb

**Status**: Accepted
**Date**: 2026-05-28
**Phase**: Phase 4 follow-up (plan-017)

### Context
Renderer-process OOM kills the tab. The user needs to know what happened — and ideally what stage the upload was in — so a post-crash reload can surface the diagnostic. The trail must survive the crash + tab-recovery reload.

### Decision
`uploadTrail.writeDiag` appends timestamped breadcrumbs to **`sessionStorage['walrus_upload_diagnostic']`** as a JSON array, capped at MAX_ENTRIES = 16. On `useWalrusUpload` mount, `surfaceStaleTrail()` reads any stale trail and emits `[WALRUS CRASH DIAGNOSTIC]` to console once per page load. Cleared on `done` / `error`. `setItem` is wrapped in `queueMicrotask` so the synchronous storage I/O runs after the React state-setter that triggered the write. An in-memory cache prevents back-to-back-write races between deferred persistence.

### Rationale
- **sessionStorage scope**: scoped to the tab session. Brave's "Aw Snap" tab recovery preserves sessionStorage across the recovered-tab reload, so the trail survives the very crash it's diagnosing.
- **Not localStorage**: would persist across all tabs and sessions, polluting the diagnostic signal and surfacing stale trails after unrelated reloads.
- **Single JSON-array key**: cheaper to read, simpler to clear, doesn't pollute namespace. Cap protects sessionStorage from runaway growth.
- **Microtask defer**: `sessionStorage.setItem` is synchronous and can stall 5–50 ms under memory pressure (precisely when the trail is most valuable). The microtask boundary keeps the React render path unblocked.
- **In-memory cache**: two writeDiag calls in the same React tick must produce a consistent trail. Without a synchronous cache, both reads would return the same pre-write state and the second write would clobber the first.

### Rationale (correction note)
Brainstorm doc said `localStorage`; the debug branch (`debug/walrus-upload-crash`) actually used `sessionStorage`. The latter is correct for tab-scoped diagnostic value. This decision captures the corrected choice.

### Alternatives Considered
- **localStorage** — rejected per scope rationale above.
- **Per-stage keys** — rejected: more reads to assemble the trail, harder to clear, namespace pollution. Single array key is canonical.
- **Sync `setItem` without microtask** — rejected per heap-pressure stall reason.

### Consequences
- ✅ Trail survives "Aw Snap" recovery; user sees `[WALRUS CRASH DIAGNOSTIC]` with the last 16 stages.
- ✅ No cross-session pollution.
- ⚠️ Trail clears on `done` / `error`; a non-crashing error leaves no diagnostic for the next session (acceptable — the error is surfaced to the user inline).

### Related
- Plan: `docs/plans/2026-05-28-017-fix-walrus-oom-plan.md` §U6
- Code: `frontend/src/walrus/uploadTrail.ts`
- Ported (trimmed) from: `debug/walrus-upload-crash` branch's `useWalrusUpload.ts`

---

## D-066: Restore QUILT_SIZE = 4 after multi-quilt batching proved inert against the encoder OOM it was designed for

**Status**: Accepted
**Date**: 2026-05-28
**Phase**: Phase 4 follow-up (plan-017 post-mortem)

### Context
D-062 chose `QUILT_SIZE = 4` based on the heap-budget calculation in plan-017's brainstorm. After AE2 testing on 2026-05-28 evening, we tested three QS values empirically on pickup truck × 8 variants:
- QS=4 → V8 OOM at 4 GB ceiling
- QS=2 → V8 OOM at 4 GB ceiling
- QS=16 (effectively single-quilt) → V8 OOM at 4 GB ceiling

All three QS values produce identical OOM signatures. Multi-quilt batching does **not** reduce the Walrus WASM encoder's peak working memory.

### Decision
Restore `QUILT_SIZE = 4` (the original D-062 value) and ship as-is. Do **not** rip out the chunking code path even though it doesn't solve the headline problem.

### Rationale
- Chunking is functionally inert for OOM, but ALSO doesn't make anything worse. The code is correct and tested (24/24 tests passing across the multi-quilt suite).
- QS=4 gives the cleanest demo UX: 8 variants → 2 quilts → 5 popups, BatchProgressPanel surfaces the Walrus quilt structure to users — a hackathon positioning beat for the Walrus track.
- QS=2 doubles popups to 9 with zero functional benefit.
- QS=16 loses BatchProgressPanel (gated on `N > QUILT_SIZE`) and the demo storytelling.
- Future Walrus SDK improvements that make the encoder streaming-friendly would make chunking actually load-bearing — keeping the code is future-proofing.

### Alternatives Considered
- **Rip out R1 entirely** — rejected: pure cleanup work with no value gain; would also rip out the demo-relevant BatchProgressPanel UX.
- **QS=2** — rejected: adds popups for no benefit.
- **Dynamic QS based on per-variant size** — over-engineered for v1; complexity not justified by the marginal UX improvement.

### Consequences
- ✅ Code shipped is correct and tested; supports any future SDK improvement that benefits from chunking.
- ✅ BatchProgressPanel keeps its UX role as a Walrus-track positioning beat.
- ⚠️ Multi-quilt batching is functionally inert. Complex bases × 8 variants still crash. Tracked in D-067.

### Related
- D-062: original multi-quilt batching decision (now partially failed)
- D-067: encoder-memory-cliff finding that supersedes D-062's premise
- Plan: `docs/plans/2026-05-28-017-fix-walrus-oom-plan.md`
- Investigation: `docs/solutions/integration-issues/walrus-encoder-oom-investigation-2026-05-28.md`

---

## D-067: Encoder-memory-cliff finding — total input bytes is the OOM gate, not chunk count

**Status**: Accepted (empirical finding; supersedes D-062's premise)
**Date**: 2026-05-28
**Phase**: Phase 4 follow-up (plan-017 post-mortem)

### Context
Plan-017's R1 multi-quilt batching (D-062) assumed that splitting N variants into K smaller chunks would reduce each per-chunk encoder peak proportionally. AE2 testing on 2026-05-28 evening invalidated this assumption.

### Decision
Capture as a finding (not a behavior change): the Walrus WASM encoder's peak working memory is governed by **total input bytes** with an empirical multiplier of ~85–100×, **not** by chunk count. The OOM gate for browser-side encoding is roughly:

```
total_input_bytes × ~85-100 < V8_old_space_limit (4 GB on Brave / Chrome)
```

Concretely:
- 35 MB input → succeeds (peak < 4 GB)
- 46 MB input → fails at 4 GB

### Empirical Data
| Base | paintable_count | variant size | N | total | result |
|---|---|---|---|---|---|
| shuriken | 3 | 4.40 MB | 8 | 35 MB | ✅ pass |
| pickup truck | 14 | 5.80 MB | 5 | 29 MB | ✅ pass |
| pickup truck | 14 | 5.80 MB | 8 | 46 MB | ❌ V8 OOM |

The boundary lives between 35 MB and 46 MB of total input bytes.

### Rationale
- Hypothesis testing established that chunk size does not affect outcome.
- Hard data: shuriken × 8 at QS=16 (single quilt, no chunking) passes; pickup truck × 8 at QS=2 (4 quilts) fails. Chunk count is independent of the OOM signature.
- Working theory: Walrus's Reed-Solomon encoder materializes a full sliver matrix sized roughly `input × shard_count × redundancy`. For Walrus testnet's hundreds of shards, a naive implementation could need 10–100× the input size. Source dive into `@mysten/walrus-wasm` not performed; behavior is consistent with this theory.

### Alternatives Considered
- **Backend mesh decimation** to reduce per-variant size — user explicitly declined: doesn't want to sacrifice visual quality without confirming there's no better path. Filed as a mentor-consult question.
- **`writeBlobFlow` per file** instead of quilted upload — sacrifices quilt-patch indexing (one Walrus blob → N logical files), but encodes one ~6 MB file at a time. Could fit. Pending mentor input on whether this is the recommended pattern for our use case.
- **Tune Walrus shard count** — not exposed as a client-side configurable; would require SDK or protocol-level intervention.

### Consequences
- ✅ Findings recorded; future sessions don't repeat the multi-quilt fix attempt.
- ⚠️ Complex segmented bases (paintable_count ≥ ~10) × 8 variants remain unsupported.
- 🔮 Resolution path:
  - Short-term: demo with simpler bases (shuriken-class); document the constraint as v1.1 work in README.
  - Medium-term: hackathon mentor / Walrus team consult — see `docs/solutions/integration-issues/walrus-encoder-oom-investigation-2026-05-28.md` for the 6 specific questions filed.
  - Long-term: SDK fix for streaming encode, OR project-side mesh decimation (if mentor confirms it's the only path AND we accept the visual trade-off).

### Related
- D-062: original multi-quilt batching (premise invalidated by this finding)
- D-063: PreviewCanvas dispose (kept — provides marginal heap headroom)
- D-066: QUILT_SIZE = 4 restoration
- Investigation doc: `docs/solutions/integration-issues/walrus-encoder-oom-investigation-2026-05-28.md`

---

## D-068: Product name = Tusk3D; tagline = "Carve. Mint. Riff."

**Status**: Accepted
**Date**: 2026-05-28
**Phase**: Phase 4 — pre-submission branding

### Context
Project has shipped the bulk of plan-017 and is ~23 days from the 2026-06-21 Sui Overflow 2026 submission deadline (Walrus track), but never settled on a public product name. The submission form, demo video, pitch deck, README, GitHub org, social handles, and shortlisting page all need a single canonical name. Brainstorm covered four angles: composable/derivative ("Riff", "Stem"), 3D/mesh ("Facet", "Loom", "Topo"), Walrus/marine ("Tusk", "Floe", "Pod"), and game-dev native ("Spawn", "Prop", "Rig"). Initial pick was the bare word "Tusk" with a walrus-ivory-carving narrative; due-diligence surfaced two blockers that disqualified the bare form.

### Decision
**Product name = "Tusk3D".** Tagline = **"Carve. Mint. Riff."**

### Rationale
- **Two issues with the bare word "Tusk" forced the "3D" qualifier**:
  1. **Brand collision in dev-tools space**: *Tusk (YC W24)* is a known AI coding-agent (unit / integration test generation) — owns `tusk.io`, `usetusk.ai`. Hackathon evaluators read HN / YC content; the bare "Tusk" would be conflated.
  2. **Animal-welfare framing risk**: The literal etymology routes through walrus ivory and 19th-century scrimshaw / whaling. Pacific walrus is IUCN-Threatened; the Sui sponsor track is named *Walrus*. A submission named "Tusk" on the *Walrus* track carries an unintended "killed-the-mascot-for-its-tusk" reading — exactly the wrong optics for Gen-Z evaluators.
- **"Tusk3D" resolves both**: the "3D" suffix unambiguously positions in 3D-content space (away from Tusk YC) and shifts the brand semantics from "an extracted animal part" to "3D Tusk = sharp distinctive 3D-content mark." Once the historical-carving narrative is no longer load-bearing for the name to be intelligible, the ethical baggage no longer attaches to the brand.
- **Tagline "Carve. Mint. Riff." still maps 1:1 to architecture without the ivory framing**: in 3D content authoring, *Carve* is industry-standard terminology for digital sculpting (Blender, ZBrush, MeshMixer). *Carve* = author the GLB (Tripo prompt or upload), *Mint* = publish Model3D on Sui, *Riff* = L2 Derivative authored by another creator.
- **Brandable as a compound**: short, pronounceable, follows the established web3 / dev-tools convention of *Word + digit/qualifier* (Web3, Three3D-pattern, etc.). Initial scan found no direct collision (TUKA3D is unrelated fashion software).

### Alternatives Considered
- **Bare "Tusk"** — rejected per the two blockers above.
- **Spawn** — game-dev native vocabulary, strong "spawns derivatives" narrative; rejected because Tusk3D is more distinctive in a brand sense after the disambiguation.
- **Scrim / Scrimshaw** — proposed mid-brainstorm to lean into the 19th-century carving narrative; rejected because scrimshaw is directly tied to whaling and walrus-ivory extraction — same ethical-framing risk as bare Tusk, only sharper.
- **Cast** — lost-wax casting analogy (5,000-year reproducible-3D-content metaphor); strong ethical clean slate but the verb "Cast" overlaps with "Mint" in the tagline, requiring tagline rewrite; user preference settled on Tusk3D.
- **Floe / Pod** — Walrus-adjacent, no ethical baggage; user preference settled on Tusk3D.

### Consequences
- ✅ Submission-ready brand identity with built-in pitch opening that does not require defending an ethically-fraught historical claim.
- ✅ Move package `model3d::model3d` stays unchanged (already on testnet); product name and on-chain module name are intentionally decoupled — renaming Move would burn gas and break references for no user-visible gain.
- ⚠️ Domain availability and trademark check are follow-up items. Initial WebFetch scan of `tusk3d.com / .xyz / .io / .app / .gg` all returned ECONNREFUSED (no live server), suggesting probable availability — but a registrar lookup is required to confirm. If a hard collision surfaces, follow-up ADR supersedes.
- ⚠️ Public-facing narrative should use the safer "Built on Walrus, named for it" framing; the "3,000-year ivory carving" narrative is no longer the recommended pitch opener.
- 🔮 Rename surface (post-availability check): `README.md` title, `package.json` `name` fields (root + backend + frontend + shared), pitch deck title slide, demo video script, Sui Overflow submission form Project Name field, GitHub org / repo name, Twitter/X handle.

### Related
- Memory: `project_product_name_tusk3d.md`
- Submission deadline: 2026-06-21 (Sui Overflow 2026, Walrus track)
- Spec: `docs/spec.md` §1.7 (three-tier composable creator economy)

---

## D-069: Walrus read-path acceleration = Cloudflare DNS proxy (Method A); Worker (Method B) deferred

> **Superseded by [D-073]** (2026-05-30): Method A proved infeasible — the aggregator is itself on Cloudflare (Error 1014 cross-user CNAME ban) and rejects unknown Host headers (HTTP 403). Read path now uses a Cloudflare Worker (Method B). Body below preserved as the original decision record.

**Status**: Superseded by D-073
**Date**: 2026-05-28
**Phase**: Phase 4 — read-path performance

### Context
Reading 3D model GLBs from a single public Walrus mainnet aggregator gives variable latency to global users (single-region RTT, no edge caching). For the 2026-06-21 submission and the 2026-07-20/21 demo day, perceived model-load speed materially affects evaluator UX. Walrus blob content is **immutable** (content-addressed by blob ID), making it a textbook candidate for long-TTL edge caching. Two implementation strategies considered: (A) Cloudflare DNS proxy + Cache Rule fronting the aggregator (zero application code, hostname swap in frontend), or (B) Cloudflare Worker fronting Walrus with clean URLs and aggregator-failover logic.

### Decision
**Method A — Cloudflare DNS proxy (orange-cloud) + Cache Rule with `Edge TTL = 1 year`, fronting one public Walrus mainnet aggregator at `cdn.<domain>/v1/blobs/<blob_id>`.** Frontend reads from `VITE_WALRUS_READ_BASE` (config-driven, never hardcoded). Method B (Worker) is **deferred, not rejected** — migration triggered by either (1) need for clean / branded URLs (e.g. blob URLs embedded in NFT metadata or shared links), or (2) need for aggregator failover when public aggregators go down.

### Rationale
- **Fastest measurable win**: zero application code, dashboard-only setup, reversible in 5 min if numbers are flat.
- **`immutable` blobs make long TTL always safe**: content-addressing means the blob ID itself is the cache key; no invalidation logic ever needed.
- **Cloudflare free plan sufficient**: no per-request cost dimension; budget-predictable for hackathon scope.
- **Config var preserves migration path**: Method B drop-in is a single env-var swap, not a code rewrite — locks in the optionality without paying for it now.
- **Single-aggregator dependency accepted at MVP**: Method B's failover capability is itself the trigger to revisit, not a code concern today.

### Alternatives Considered
- **Method B — Cloudflare Worker** — better long-term (clean URLs, multi-aggregator failover, header rewrites) but adds maintained code; deferred until a trigger condition fires.
- **Self-hosted aggregator** — out of scope per Plan-018 scope boundary; storage-layer ownership is a separate concern from read-path caching.
- **No CDN, public-aggregator-only** — leaves global-RTT latency on the table; acceptable for testing but unacceptable for demo day.

### Consequences
- ✅ Warm-cache read latency drops materially; demo / submission load faster from any region.
- ✅ Read path costs $0 (no Sui gas, no WAL) and ~0 lines of application code beyond the URL base swap.
- ⚠️ **Single-aggregator SPOF**: if the chosen public aggregator goes down, all reads fail until DNS is repointed. Mitigation: identify a fallback aggregator host before 2026-06-21 submission; monitor health.
- ⚠️ **The cached subdomain (`cdn.<domain>`) must live on an ICANN TLD** — `.sui` names are not in DNS and cannot be proxied by Cloudflare. This makes purchasing `tusk3d.space` (or equivalent) mandatory, not optional. SuiNS `.sui` names remain usable for the marketing/landing surface but cannot serve the CDN path.
- 🔮 Method B migration when triggered: Worker bound to the same `cdn.<domain>`, frontend untouched (config var). Plan-018 explicitly enumerates the triggers.

### Related
- Plan: `docs/plans/2026-05-28-018-feat-walrus-cdn-read-cache-plan.md`
- Memory: `project_walrus_read_cdn_method_a.md`
- Depends on: D-068 (Tusk3D / `tusk3d.space` provides the ICANN domain this CDN path needs)

---

## D-070: Frontend hosting = Vercel / Cloudflare Pages; Walrus Sites deployment is out of scope for hackathon submission

**Status**: Accepted
**Date**: 2026-05-28
**Phase**: Phase 4 — pre-submission scope

### Context
Mid-discussion on 2026-05-28, a proposal surfaced to deploy the Tusk3D frontend to **Walrus Sites** (with optional SuiNS `.sui` name resolution via wal.app portal or self-hosted portal) as a "Sui-native flex" for the Walrus track. The instinct behind this — that the Walrus track rewards visible Walrus usage — is correct, but the proposal pushes the native-story bet onto the wrong layer.

The setup cost is non-trivial during a 23-day hackathon sprint:
1. Walrus Sites give you a **b36 URL** (~50-character base36 string) that is unreadable / unspeakable in a live demo. SuiNS resolution makes it nicer but adds another moving part to register, fund, and verify.
2. Walrus blobs have **epoch expiry** (2-week mainnet epochs); insufficiently-funded storage means the site can vanish overnight. This is a demo-day risk that traditional hosting doesn't have.
3. Either depends on **wal.app portal availability** (third-party SPOF) or requires running a **self-hosted portal** on a VPS (additional infra to maintain during the sprint).
4. None of the above is perceptible to evaluators looking at the demo. A site is a site.

Meanwhile the *real* Walrus-native technical depth lives in the data layer:
- 3D model GLBs stored as Walrus blobs (the asset surface, with the L1/L2/L3 economy on top)
- Move contract `model3d::model3d` managing ownership / licensing / derivative composition
- Sui object as the on-chain index for each Model3D
- Walrus aggregator reads accelerated via Cloudflare CDN (see [D-069])

Those three pieces collectively make the "Sui-native" case at evaluation time. Frontend hosting contributes ~0% of the technical depth and ~100% of the setup friction.

### Decision
**Frontend ships on Vercel (or Cloudflare Pages) for the 2026-06-21 submission and 2026-07-20/21 demo day. Walrus Sites deployment is explicitly out of scope for v1.** The "Sui-native" narrative is owned by the data layer (Walrus blob storage of models, Move contract, Sui object index, Cloudflare-CDN-accelerated Walrus reads), not by the hosting layer. Pitch / demo language acknowledges this gap verbally rather than paying setup cost for it (see Consequences for the demo-talking-track verbatim).

### Rationale
- **b36 URL is a demo killer**: evaluators can't read, type, or remember it; SuiNS fixes the symptom but adds another component to register, fund, and maintain.
- **Epoch expiry is a real demo-day risk**: Vercel doesn't disappear overnight; under-funded Walrus blobs can. Hackathon-stage projects should not absorb that variance.
- **Native depth lives where there's actual technical content**: storing 3D model bytes on a decentralized, erasure-coded blob protocol with on-chain Move ownership is genuinely native. Static-site hosting on Walrus Sites is one bullet point with negligible technical depth — and the bullet point can be earned with a verbal claim.
- **"Tell, don't host"**: a 12-second demo line ("our frontend currently hosts on Vercel for iteration speed, but because it's purely static, it's one site-builder command away from Walrus Sites for full on-chain hosting") buys ~90% of the perceived native-ness at 0% of the setup cost. Evaluators do not inspect HTTP headers during judging.
- **Time saved goes into core demo polish**: the 2-4 hours that would have gone to site-builder CLI, portal setup, SuiNS registration, and epoch-management testing redeploys into pitch-deck polish, demo-video editing, and model-loading performance verification.

### Alternatives Considered
- **Walrus Sites + SuiNS (`tusk3d.sui` via wal.app portal)** — pure Sui-native flex but high setup cost, b36-URL-via-portal ergonomics still flaky, wal.app SPOF, epoch-expiry risk; rejected per rationale.
- **Walrus Sites + self-hosted portal on `tusk3d.space`** — eliminates wal.app SPOF and gives a clean URL, but VPS + Caddy + portal binary is 2+ hours of sprint-stage infra work; rejected because evaluator-perceived value is still ~zero.
- **Walrus Sites with bare b36 URL** — cheapest Walrus-Sites option; rejected because the URL is unusable in any demo / pitch context.
- **Vercel deployment + verbal native claim** — selected: 5-minute setup, clean URL (`tusk3d.vercel.app` or `tusk3d.space` fronting Vercel via Cloudflare), zero demo-day risk, and the native-story line is rhetorically as strong as actually doing it because no evaluator audits the host.

### Consequences
- ✅ Frontend setup is a `git push` away; iteration speed is preserved through demo day.
- ✅ Demo URL is clean and memorable (`tusk3d.space` → Cloudflare → Vercel, or `tusk3d.vercel.app`).
- ✅ Zero epoch / portal / SuiNS dependency on the host critical path; one less failure mode during the 2026-06-21 → 2026-07-21 evaluator window.
- ✅ **Verbal native-story template (for pitch / demo)**: *"Our frontend currently hosts on Vercel for iteration speed, but because it's purely static, it's one site-builder command away from Walrus Sites for full on-chain hosting. Where Walrus actually carries our weight is the 3D-model layer — that's where the bytes live, and that's where Cloudflare accelerates them globally."*
- ⚠️ A judge with extreme dogmatic preference for end-to-end Sui-native deployment could perceive Vercel as web2-dependent. Mitigation: the verbal claim above acknowledges and contextualizes the choice on the spot; the post-submission v1.1 roadmap can include "migrate static frontend to Walrus Sites" as a 1-day item.
- 🔮 Post-hackathon (if traction warrants), a Walrus Sites migration is a 1-day task: `site-builder publish ./dist`, point SuiNS, swap DNS. The decision can be revisited without architectural impact.

### Related
- D-068 (product = Tusk3D; the same `tusk3d.space` ICANN domain that fronts Vercel also fronts the CDN per D-069)
- D-069 (Walrus read-path CDN; the Walrus-native technical depth this ADR points at)
- Plan: `docs/plans/2026-05-28-018-feat-walrus-cdn-read-cache-plan.md` (scope-cross-reference section added)
- Memory: `project_frontend_host_not_walrus_sites.md`

---

## D-071: Display-only on-chain telemetry uses build-time baked snapshot + 2s race against a live sweep

**Status**: Accepted
**Date**: 2026-05-29
**Phase**: Phase 4 — landing page surface

### Context
The S2 telemetry strip on the Tusk3D landing page (`/`) displays four live on-chain counters and a CID drawn from a `queryEvents` sweep against the deployed `model3d::model3d` package. This is the first display-only on-chain data surface in the project — every prior consumer of chain reads is action-bearing (mint, list, buy, transfer, etc.). Naive `useState(null)` + `useEffect` fetch + spinner produces a flicker of blank or skeleton UI on first paint, which on a brutalist editorial landing page reads as "not deployed yet" — the exact opposite of the credibility signal the strip is supposed to send. A naive blocking fetch is worse — the page can't render until the chain responds.

Additionally, when the live sweep returns degenerate results (rotated package, stale `model3dPackageId`, empty event log on a fresh chain, or a 200-with-empty-array response that still satisfies the SDK's success contract), declaring `status: 'live'` with all-zero counters and a placeholder CID is **strictly worse** than declaring `status: 'cache'` with the baked floor — it's a confident lie.

### Decision
**Display-only on-chain data surfaces use a three-part pattern:**

1. **Build-time baked snapshot** (e.g. `frontend/src/landing/telemetryFallback.ts`) — hand-seeded constants bumped on each meaningful deploy. Rendered immediately on mount so first paint is **never empty**.
2. **Live `queryEvents` sweep raced against a wall-clock timeout** (currently 2s). The sweep runs in the background after the initial fallback render.
3. **Zero-event guard** — if the live sweep wins the race but returns a degenerate result (empty arrays, missing `firstEvent`, schema mismatch on critical fields), it must `throw` to land in the silent `.catch` and keep the cached fallback rendered. The fallback's `●cache` indicator is the honest signal; `●live` is only set when the live sweep returns **non-empty** results.

The `●live` / `●cache` indicator dot is the contract between the data layer and the visual layer. **It must never lie about provenance.**

### Rationale
- **First paint is never empty**: the baked snapshot eliminates the loading-skeleton anti-pattern on a brand-critical surface. Judges scanning the page in 30 seconds see numbers, not a spinner.
- **Race semantics tolerate any chain failure mode**: RPC timeout, RPC 5xx, parse error, abort-on-unmount, package rotation, fresh-chain emptiness — all resolve to "stay on cache." There is one error UI: there is no error UI.
- **Zero-event guard preserves the dot's contract**: the `●live` dot is positioned as the most-visible truth signal on the strip (single `#FF4500` accent per D-044). Letting it pair with all-zero data because the sweep "technically succeeded" trades the signal's entire value for protocol purity.
- **Catches the silent `model3dPackageId` drift case for free**: if the package gets republished and the env-pinned ID lags, the sweep returns empty arrays, the guard fires, and the strip falls back to cache. No special-case code path needed.
- **Pattern reuses cleanly**: future "live-ness" indicators (Walrus blob count, byte volume, mint velocity, etc.) follow the same shape — bake floor, race live, guard degenerate.

### Alternatives Considered
- **Naive `useState(null)` + loading skeleton** — flickers blank on first paint; reads as "not deployed." Rejected.
- **Blocking fetch (SSR-style)** — blocks page render on chain RPC latency. SPA architecture (per D-070, Vercel hosting) makes this impossible anyway. Rejected.
- **Backend snapshot endpoint cached server-side** — adds deploy concern, cache layer, and a separate failure mode (backend down). Acceptable for v1.1 but does not pay for itself in the hackathon window where the frontend already has `useSuiClient` wired. Deferred.
- **No baked floor, accept blank-then-populate** — fails the credibility-per-pixel goal that motivated S2 in the first place. Rejected.
- **`●live` on empty results ("technically the sweep succeeded")** — sacrifices the dot's contract for protocol purity. Rejected: a lying indicator is worse than a missing one.

### Consequences
- ✅ Display-only surfaces render fresh numbers within ~2s on healthy networks, fall back to honest cache on any failure mode, and never paint a blank state.
- ✅ The pattern composes: each new live counter is a `useState<TelemetryResult>` + `useEffect` race; no shared infrastructure or backend changes required.
- ✅ Operationally simple: a single hand-edit to the fallback constants file on each meaningful deploy keeps the cache floor fresh enough that even an extended outage (RPC down for hours) shows recent numbers.
- ⚠️ **Operator responsibility for fallback bumps is not enforced by CI.** If the fallback drifts far behind reality and the live sweep simultaneously fails (testnet down on demo day), the strip shows clearly-stale numbers labeled as cache. Mitigation: the SHIP-TIME PROCEDURE comment in `telemetryFallback.ts` documents the bump procedure; treat each meaningful deploy as the trigger.
- ⚠️ **The 2s timeout is a fixed budget for the cold-start race.** On networks with > 2s RTT to the testnet RPC, judges always see `●cache`. Acceptable in the hackathon window (testnet RPC is < 500ms in practice); revisit if demo-day judge networks reliably exceed it.
- ⚠️ **External-service URL constants for any data surface (live or otherwise) must come from a canonical single-source-of-truth file**, not be re-baked inline. This rule was created in this commit chain after `TelemetryStrip.tsx` initially baked a wrong aggregator URL that the canonical `frontend/src/walrus/aggregator.ts` already exported correctly. Single-source-of-truth files: `frontend/src/walrus/aggregator.ts` (Walrus reads), `frontend/src/sui/networkConfig.ts` (Sui package IDs + RPC endpoints). **Any new component reading from Walrus or Sui MUST import from these — never paste a URL into a local constant.**
- 🔮 If a Phase 5+ initiative produces multiple display-only surfaces (e.g. footer telemetry, hero stat cards, dashboard widgets), extract `useTelemetryData`'s baked-race pattern into a reusable `useBakedLiveData(fallback, fetcher, options)` hook.

### Related
- KD-1 / KD-3 / KD-4 in `docs/brainstorms/2026-05-29-s2-telemetry-strip-requirements.md` — the operational decisions promoted to this ADR
- D-019 (JSON-RPC vs gRPC SuiClient split) — affects the `useSuiClient` cast in `useTelemetryData.ts`
- D-044 (brutalist editorial tokens) — constrains the `●live` accent to a single instance, which is why the dot's truth contract matters
- D-069 (Walrus CDN read path) — when `cdn.tusk3d.space` ships, `WALRUS_AGGREGATOR` swaps in `aggregator.ts` and the strip picks it up automatically
- Memory: `feedback_check_repo_constants_before_baking.md`
- Commits: `e42d002` (initial implementation), `73f76ad` (ce-code-review fix pass)

---

## D-072: Build-time issue-number injection via vite `define` for the S7 versioned masthead

**Status**: Accepted
**Date**: 2026-05-29
**Phase**: Phase 4 — landing page surface

### Context
The S7 versioned masthead (plan-022) sets the Tusk3D wordmark with an issue number `№NNN`, where `NNN` is the commit count on `main` (`git rev-list --count main`). The number is a deploy-stamp that frames Tusk3D as a continuously-published editorial product — it climbs across the 6/21 → 7/8 → 8/27 judging windows, so each judge revisit shows visible progress. It is **not** live data: it changes only when a new build is cut. This is the first build-time-injected git-derived constant in the frontend; `vite.config.ts` previously had no `define` block.

### Decision
**Resolve the commit count once during vite config evaluation (Node context) and inject it as a compile-time global constant `__ISSUE_NUMBER__` via vite `define`.** The resolution is wrapped in try/catch; on any failure (no `main` ref, shallow CI clone, non-repo checkout, non-numeric output) it returns the sentinel `0`. The consuming component (`Masthead.tsx`) renders `№{n}` only when `n > 0`, and drops the `№` token entirely on the sentinel — never `№0` / `№NaN` / `№undefined`. The global is typed in `frontend/src/vite-env.d.ts` as `declare const __ISSUE_NUMBER__: number;`.

### Rationale
- **Build-time over runtime**: the count is a deploy-stamp, not live data, so resolving it at build keeps `Masthead` a pure render with zero runtime git/network dependency. No `useEffect`, no fetch, no loading state.
- **Node-only `child_process`**: `execSync` runs during config evaluation in the Node build process; it is never bundled into the browser output — only the resolved integer literal ships.
- **Sentinel-drops-token over fake number**: a missing or broken count must never surface as a broken glyph on a brand-critical masthead. Degrading to wordmark + edition is coherent; `№0` is not.
- **Sibling to D-071**: same "static deploy-stamp resolved ahead of render" philosophy as the S2 baked telemetry snapshot, but build-time-baked rather than source-baked — appropriate because the value is derivable from git rather than hand-seeded.

### Alternatives Considered
- **Runtime fetch of commit count** — no API exposes it client-side without a backend; adds a network dependency for a value that only changes per-deploy. Rejected.
- **Hand-edited constant bumped per deploy** (like `telemetryFallback.ts`) — works, but the count is mechanically derivable from git, so automating it removes an operator step and can never drift. Chosen the automated path.
- **`import.meta.env` via a `VITE_`-prefixed env var set in CI** — viable, but couples the number to CI env wiring and is invisible in local builds. The `define` approach works identically in local `pnpm build` and CI. Rejected for v1.

### Consequences
- ✅ Masthead is a zero-dependency pure render; `№NNN` is a literal integer in the built bundle.
- ✅ Local and CI builds both produce a correct number with no extra configuration.
- ✅ Git-less / shallow-clone builds degrade gracefully to a wordmark-only masthead instead of failing.
- ⚠️ The count reflects `main` at **build time**, not the currently checked-out branch — a build cut from a feature branch still stamps `main`'s count. This is intended (the deployed landing builds from `main`), but worth knowing when verifying locally on a branch.
- ⚠️ `__ISSUE_NUMBER__` is a global identifier; any future build-time constant should follow the same `__SCREAMING_SNAKE__` + `vite-env.d.ts` declaration convention to stay discoverable.
- 🔮 If later surfaces need the issue number outside the landing (README header, OG image, pitch deck), promote `resolveIssueNumber()` into a shared build util rather than duplicating the `execSync`.

### Related
- plan-022 (`docs/plans/2026-05-29-022-feat-s7-versioned-masthead-plan.md`) KTD-1 / KTD-2
- `docs/brainstorms/2026-05-29-s7-versioned-masthead-requirements.md` KD-3 / KD-4
- D-071 (build-time baked snapshot for S2 telemetry) — sibling deploy-stamp pattern
- D-044 (brutalist editorial tokens) — the masthead's typographic constraints; zero accent

---

## D-073: Walrus read-path CDN = Cloudflare Worker (Method B) now, not DNS proxy (Method A); domain = `tusk3d.space`

**Status**: Accepted — Supersedes D-069
**Date**: 2026-05-30
**Phase**: Phase 4 — read-path performance

### Context
While preparing to implement D-069 / plan-018 (Method A: a proxied orange-cloud CNAME from our zone to a public Walrus aggregator, plus a Cache Rule), empirical testing on 2026-05-30 showed **Method A is infeasible against the Walrus aggregator** for two independent reasons:

1. **The aggregator is itself served through Cloudflare.** `curl -sI https://aggregator.walrus-testnet.walrus.space/` returns `server: cloudflare` + a `cf-ray` header. A proxied CNAME from our zone to a hostname living in **another Cloudflare account** triggers Cloudflare **Error 1014 "CNAME Cross-User Banned"** — Cloudflare refuses to proxy a domain it sees in a different account.
2. **The aggregator rejects unknown Host headers.** Cloudflare's reverse proxy forwards the visitor Host (`cdn.tusk3d.space`) to origin; the aggregator replies **HTTP 403** to a Host it doesn't recognize. Verified: `curl -I -H "Host: cdn.tusk3d.space" https://aggregator.walrus-testnet.walrus.space/` → `403` (vs `404` with the correct Host).

Either issue alone kills Method A; both are present. Method A's premise — that the aggregator is an ordinary, proxyable third-party origin — was false.

Separately, the domain actually purchased is **`tusk3d.space`** (Namecheap, 2026-05-30); earlier docs used a placeholder `.xyz` domain that was never registered. Registrar ≠ DNS: the nameservers point to a Cloudflare free-plan zone, where the Worker runs.

### Decision
**Implement Method B (Cloudflare Worker) now**, at `cdn.tusk3d.space`. The Worker does a server-side `fetch()` to the aggregator — an *outbound subrequest* that uses the aggregator's own Host/SNI, so it sidesteps both the 403 (correct Host) and the 1014 (no proxied DNS record to the foreign zone). It caches immutable blob responses in the edge **Cache API** with `cache-control: public, max-age=31536000, immutable`, and supports an ordered **aggregator failover list** via the `WALRUS_AGGREGATORS` env var. Only `/v1/blobs/*` `GET`|`HEAD` paths are proxied; everything else 404s. The frontend read contract is unchanged from D-069: `VITE_WALRUS_READ_BASE` (config-driven, never hardcoded).

### Rationale
- Method A is **technically impossible** here (1014 + 403), not merely suboptimal — empirically verified, not assumed.
- A Worker `fetch()` is the **only** way to front a Cloudflare-hosted origin from our own separate zone.
- The Worker hands us D-069's deferred Method B triggers **for free**: multi-aggregator failover + clean/branded-URL capability — both things we'd have needed eventually.
- The Cache API gives us **our own edge cache**, independent of the aggregator's (uncontrolled) cache headers and — for HITs — independent of aggregator uptime.
- Cloudflare free plan includes Workers (100k req/day) — ample for submission + demo day.

### Alternatives Considered
- **Method A (DNS proxy + Cache Rule)** — infeasible (1014 + 403 above). This ADR is the reversal of D-069.
- **Cloudflare for SaaS / custom hostnames** — would let us proxy a foreign origin, but it's a paid feature; overkill.
- **Self-hosted aggregator** — out of scope per plan-018 boundary (storage-layer ownership ≠ read-path caching).
- **No CDN, aggregator-direct** — leaves us with zero failover and no control over caching; rejected for demo robustness.

### Consequences
- ✅ Reads front a branded, cacheable `cdn.tusk3d.space`; cache HITs survive aggregator slowness/outages.
- ✅ Failover + clean-URL capability available in the same ~40-line single-file Worker.
- ⚠️ **The raw geographic-latency win is smaller than D-069 assumed**: the aggregator is *already* on Cloudflare's edge, so it already terminates near users. The durable wins are our own immutable cache, failover, URL control — **not** raw RTT. Latency improvement must still be **measured** (plan-018 Step 5), never claimed unmeasured.
- ⚠️ Worker is maintained code (Method A was zero code) — but it's one small file.
- ⚠️ Origin is currently the **testnet** aggregator (we're testnet until 6/21). `WALRUS_AGGREGATORS` env makes the mainnet swap a config change, not a logic redeploy.
- 🔮 Clean-URL rewrites (e.g. `/model/<name>`) are now possible in the same Worker whenever wanted.

### Related
- Supersedes: D-069 (Method A)
- Plan: `docs/plans/2026-05-28-018-feat-walrus-cdn-read-cache-plan.md` (status updated to Method B)
- Memory: `project_walrus_read_cdn_method_a.md` (updated → Method B Worker)
- Worker source: `cdn-worker/`
- D-070 (same `tusk3d.space` domain fronts the Vercel-hosted frontend)
- D-068 (product = Tusk3D)

---

## D-074: Seal content protection moved into v1 (6/21 submission scope)

**Status**: Accepted
**Date**: 2026-05-31
**Phase**: 4

### Context
Content protection via Mysten Seal was scoped post-6/21 (v1.1) in the original ideation/brainstorm/plan-026 chain (see `docs/ideation/2026-05-30-content-protection-seal-ideation.md`). Re-evaluated against the hackathon track: this is the **Walrus track**, and Seal is Mysten's own Walrus-native threshold-encryption layer. Demonstrating Seal + Walrus together is depth on exactly the axis the track rewards, and it closes the standing honesty gap where `is_encrypted` is decorative (only ever `false`, never checked). The demo is a **recorded video** (made after the feature lands), which neutralizes the main risk against shipping Seal for the demo — a live key-server outage reading as a product bug — because a recording can be re-taken until decrypt succeeds.

### Decision
Pull the full plan-026 feature forward into the **v1 / 6/21 submission** scope. Build all seven plan-026 units (not the thinner "deny→allow demo slice"): fresh package republish with `seal_approve`, envelope encryption, policy-derived encryption, the ALLOW_LIST 3-step fork, preview stills, backend hardening, and the doc updates. User decision 2026-05-31 ("it's a plus for integrating seal … move this part to v1"), full scope ("A").

### Rationale
- Strongest on-track differentiator: "store on Walrus **and** enforce paid access cryptographically with Seal."
- Recorded demo removes the live-failure risk that made v1.1 deferral prudent.
- 21 days of runway remain at decision time; user judged it affordable alongside deck/demo polish.

### Alternatives Considered
- **Keep post-6/21 (v1.1)** — rejected: forgoes a track-aligned differentiator while time remains.
- **Demo-grade slice only (plan-026 scope B)** — rejected by user in favor of the full feature done-done (no second pass later).

### Consequences
- ✅ Seal integration is demonstrable in the 6/21 submission, deepening the Walrus-stack story.
- ⚠️ Multi-unit build (new dependency + fresh republish + frontend/backend/contract) competing with deck/demo time; the fresh republish destabilizes the demo arc and requires full re-verification on the new package id.
- ⚠️ Testnet Seal key servers have no SLA; mitigated by the recorded demo + explicit "testnet infrastructure" UI framing (plan-026 Risk Analysis).
- 🔮 Mainnet key-server provider relationship required before any 8/27 mainnet move (tracked separately).

### Related
- Plan: `docs/plans/2026-05-30-026-feat-v1.1-seal-content-protection-plan.md` (re-framed to v1).
- Origin: `docs/brainstorms/2026-05-30-v1.1-seal-content-protection-requirements.md`.
- Decisions: D-075 (architecture), D-076 (amends D-040), D-073 (read-path CDN — untouched: Seal gates the key, not the bytes).

---

<!-- D-078 (2026-06-01) partially reverses the decrypt-gate clause below: seal_approve gates on the soulbound AccessEntitlement, not the NftCollectionCreatorCap. Envelope encryption, SealIdRegistry Resolution-G binding, and fresh-republish discipline are RETAINED. -->
## D-075: Seal integration architecture — envelope encryption, fresh republish, policy-derived encryption

**Status**: Accepted
**Date**: 2026-05-31
**Phase**: 4

### Context
Encrypting an L1 base for ALLOW_LIST/RESTRICTED policies must (a) not bloat the Walrus blob past the 35/46 MB encoder OOM cliff (mesh decimation was declined — see `project_walrus_encoder_constraints`), (b) gate decryption on-chain without a stale-package bypass, and (c) survive a future package upgrade without silently relaxing the gate.

### Decision
- **Envelope encryption**: AES-256-GCM the GLB with a random 256-bit key; Seal-encrypt only the 32-byte key. Ciphertext ≈ plaintext size (stays clear of the OOM cliff); Seal's documented large-payload pattern. Seal `id = [seal_id][nonce]` (inner bytes only — Seal namespaces the packageId itself).
- **Seal-id binding = Resolution G** (refined at implementation, 2026-05-31). The original sketch bound the Seal `id` to the `Model3D` object id — but that id does not exist until `publish`, while encryption (of the ciphertext we upload) must happen *before* publish: a chicken-and-egg. And no other encrypt-time-known value is safe to bind to (a client-chosen id can be **copied** off-chain by an attacker, who then forks their own cheap model carrying the victim's id and decrypts the victim's blob; creator-address binding leaks all of one creator's models to any single forker). Resolution: the client generates a random `seal_id`, encrypts under `id = [seal_id][nonce]`, and at publish a shared **`SealIdRegistry`** (bootstrapped once in `init`) asserts the `seal_id` is globally unique before recording it on the model. This (a) keeps encrypted publish **one transaction / one signature** — the existing upload→`publish(blob)` shape is preserved, since encryption no longer depends on the object id — and (b) defeats the copy attack: the registry rejects a duplicate `seal_id`, so `is_prefix(model.seal_id, id)` in `seal_approve` binds the ciphertext to exactly one model. Rejected alternative **Resolution A** (create a model shell / capsule first to mint an unforgeable object id, then a second tx finalizes the ciphertext): equally secure but costs a second signature and surgery on the tested publish/blob-attach flow, for no security gain over the registry.
- **Fresh package republish (v9)**, not a compatible upgrade — same reasoning as D-040: a compatible upgrade leaves the old ungated bytecode permanently callable at the old id, so an enforcement/encryption change must republish. Republishing also lets new fields be added directly to the `Model3D` struct (no dynamic-field workaround). Existing v8 public models stay on v8, untouched (no migration; all existing content is public).
- **New `Model3D` struct fields**: `sealed_key` (Seal-wrapped AES key), `preview_blob_ids` (public preview stills), `seal_version` (package version at publish). The encrypted GLB reuses `glb_blob_id` (now AES-ciphertext when encrypted); `is_encrypted` tells the client which read path to take.
- **Policy-derived encryption**: in `new_model`, `is_encrypted = (license.policy != POLICY_PERMISSIONLESS)`, fixed at publish — closes the decorative-flag gap. No post-publish policy transition.
- **`seal_approve` gating** (non-`public entry`, side-effect-side-free, dry-run by key servers, abort = deny):
  - `seal_approve_cap` — ALLOW_LIST: a **named triple-check invariant** — `cap.collection_id == id(collection)` ∧ `collection.base_model_id == id(model)` ∧ `id starts_with model.seal_id` (the registry-unique prefix) — plus `seal_version == VERSION`. Each check isolation-tested. Prevents a valid cap unlocking another model's ciphertext (the canonical Seal binding pitfall).
  - `seal_approve_creator` — RESTRICTED: `id starts_with model.seal_id` + `ctx.sender() == model.creator` + `seal_version == VERSION`.
- **`seal_version` binding**: package version stored at publish and asserted in `seal_approve`, so a future v9+ upgrade cannot silently relax the gate over already-encrypted models. Rides the gas-free key-server dry-run.
- **Ciphertext on the existing public CDN** (D-073 read path untouched) — Seal gates the key, not the bytes.
- **Backend bake retained, with hardening**: the decrypted base transits the JWT-authed backend over TLS for material-swap exactly as public bases do today; the forker gets no download button. For encrypted-base requests the backend must not log the request body, must not persist plaintext, and must verify the submitting JWT's wallet holds the in-flight cap. (Refines origin R9: "no raw download" = no forker-facing download, not "plaintext never leaves the browser.")
- **Testnet key servers**: 2-of-3 Mysten independent (Open mode), threshold 2 — tolerates one outage, no API key. Mainnet provider deferred.

### Alternatives Considered
- **Seal-encrypt the whole GLB** — rejected: bloats bytes against the OOM cliff; Seal docs recommend envelope for large payloads.
- **Compatible upgrade with dynamic fields** — rejected: stale-package bypass (D-040 reasoning) + more storage complexity than a republish.
- **Move material-swap fully in-browser** (no backend bake) — deferred (plan-026 "Deferred to Follow-Up"); revisit only if the backend trust boundary becomes a concern.

### Consequences
- ✅ Paid-fork enforcement is cryptographic, not honor-system; the base is unscrapeable without paying.
- ✅ Walrus blob stays ~plaintext-sized; D-073 read path and the public-NFT social-currency story are unchanged.
- ⚠️ Fresh v9 republish — new package id wired into `testnet.json` + `networkConfig.ts`; demo arc re-verified end-to-end.
- ⚠️ ALLOW_LIST fork becomes a 3-step (non-atomic) flow (see D-076); larger Move + frontend surface.
- 🔮 Accepted limits (mitigate, not prevent): an authorized forker re-uploading the decrypted base; a public L2 variant revealing base topology. Royalty is the hard on-chain rail.

### Related
- Plan: `docs/plans/2026-05-30-026-feat-v1.1-seal-content-protection-plan.md` (High-Level Technical Design, Key Technical Decisions).
- spec.md §3.7 (rewritten in plan-026 U7, replacing the stale `Access`-based design — OQ-026).
- Decisions: D-074 (scope), D-076 (fork-gate split), D-040 (republish precedent), D-032 (`Model3D` shared), D-029/D-030 (`Access` deleted), D-004 (royalty cap), D-073 (read CDN).

---

## D-076: Amend D-040 — split fork gate + re-enable ALLOW_LIST in the UI

**Status**: Accepted (Amends D-040; **Amended by D-078** — the `ALLOW_LIST ⇒ fee > 0` invariant moved from derive fee to `access_fee`, and the cap-as-decrypt-gate it introduced is superseded by the entitlement gate)
**Date**: 2026-05-31
**Phase**: 4

### Context
D-040 dropped ALLOW_LIST from the `/create` UI and collapsed it to creator-only on-chain (fail-safe), because v1 had no address-allowlist semantics. Seal (D-075) gives ALLOW_LIST a real, enforceable meaning — "pay the derive fee to get the cap that decrypts the base" — so it must return as a first-class policy. Additionally, the encrypted ALLOW_LIST fork cannot stay atomic: the cap (minted by `launch_collection`) is needed to decrypt the base, but decryption must precede the variant bake that the token mint consumes.

### Decision
- **Re-enable ALLOW_LIST** in the `/create` policy selector (reverses the D-040 UI drop). On-chain it now means non-creator-forkable, fee-gated, encrypted.
- **`ALLOW_LIST ⇒ derivative_mint_fee > 0`** — new on-chain assert at publish (`EAllowListNeedsFee`). With no on-chain address allowlist in v1, ALLOW_LIST's only meaning is "pay to fork"; `fee = 0` would let anyone get a cap free and decrypt, making it logically identical to PERMISSIONLESS-with-pointless-encryption. The "free fork, earn via royalty" strategy belongs in PERMISSIONLESS (royalty applies there regardless of policy). *(Revisit if a future curated-address allowlist makes free-but-gated forking meaningful.)*
- **Split the fork surface**: keep an atomic `launch_collection_with_tokens` for PERMISSIONLESS (one popup, unchanged); add a cap-issuing `launch_collection` (no tokens) + a separate `mint_tokens(collection, quilt_blob_id, token_patch_ids)` for the encrypted ALLOW_LIST 3-step flow (cap → decrypt/bake → mint).
- **Amend the D-040 gate** so ALLOW_LIST permits fee-paying non-creator forks; RESTRICTED stays creator-only. **RESTRICTED is excluded from the public catalog entirely** (private; no external evaluator → no preview).

### Alternatives Considered
- **Keep ALLOW_LIST collapsed to creator-only** — rejected: Seal makes the pay-to-fork semantics real and enforceable; leaving it dropped wastes the capability.
- **Allow `fee = 0` ALLOW_LIST** — rejected: logically identical to PERMISSIONLESS + pointless encryption (see Decision).
- **Keep the atomic one-tx launch** — rejected: decryption must precede the bake the mint consumes, so the atomic path cannot stand for encrypted forks. PERMISSIONLESS retains it.

### Consequences
- ✅ ALLOW_LIST is a real, enforceable, fee-gated policy again, end to end.
- ⚠️ Behavior change: ALLOW_LIST becomes non-creator-forkable and reappears in the UI; tested for both the allow and still-deny (RESTRICTED) cases.
- ⚠️ Larger Move surface (two fork entry points) + a 3-step frontend flow with an added SessionKey personal-message signature.
- 🔮 A future curated on-chain allowlist would reopen the `fee > 0` assert.

### Related
- **Amends D-040** (status updated to `Accepted (Amended by D-076)`); follows the Decision Reversal Protocol.
- Decisions: D-074 (scope), D-075 (architecture).
- Plan: `docs/plans/2026-05-30-026-feat-v1.1-seal-content-protection-plan.md` U2/U3/U5.

---

## D-077: Upload-path part segmentation via name-keyed material swap (Option A2)

**Status**: Accepted
**Date**: 2026-05-31
**Phase**: 4

### Context
Per-part tagging + per-part recoloring was Tripo-only; uploaded GLBs (D-033) skipped tagging and published with `part_labels = []`. Extending tagging to uploads exposed a latent correctness trap: the browser derives parts by **Babylon mesh order** (`TaggingCanvas` filter `getTotalVertices()>0`) while the backend recolors by **gltf-transform `listMaterials()` order** (`backend/src/lib/gltf-material-swap.ts`, `materials[i] ← partColors[i]`). These coincide only under the invariant Tripo's segmenter authors (1 node = 1 mesh = 1 unique material, materials[] in node order). For an arbitrary upload they can diverge — equal-count-but-reordered yields **silent wrong-part coloring** (worse than a hard error).

### Decision
Recolor by **material name** instead of array position. Add an optional `materialName` to each `partColors` entry (transport-only, not on-chain); when every entry carries one, the backend maps each entry to the material with that glTF `materials[].name` (order-independent), else it keeps the legacy positional path. The forge derives names from the base GLB via a headless Babylon parse (`extractMaterialNames`, same loader + filter as tagging, so order matches `part_labels`) and attaches them only when the base is **taggable**: > 1 part, ≤ `MAX_PARTS` (64), and part material names are unique + non-empty (so name-keying is unambiguous). Uploaded GLBs route through the existing `TaggingStep`, which **auto-skips** to the metadata form (legacy `part_labels = []`) when the base isn't taggable.

### Rationale
- Closes the silent-miscolor hole completely for any name-keyable base — recolor no longer depends on cross-library ordering parity.
- **Byte-identical to the positional path for Tripo** (names already align); also hardens the existing forge path against Tripo segmentation drift.
- No Move/contract change, no republish — `part_labels` stays positional; the name anchor lives only in the off-chain build transport.
- Material `name` is a key both libraries read from the same glTF field — Babylon `material.name` == gltf-transform `getName()` for our GLBs (verified on `pickup-truck.glb`, 14 parts).

### Alternatives Considered
- **A1 — browser-only Tripo-signature gate** (no backend change): rejected — leaves a residual silent-miscolor hole when a Tripo GLB is round-tripped through Blender (names preserved, materials[] reordered).
- **B — canonical cross-library part ordering refactor**: rejected — larger blast radius on the shipped Tripo flow with submission-window regression risk; name-keying achieves the same safety with a contained change.
- **Backend node-order traversal** (match Babylon by walking renderable nodes): rejected — still diverges from Babylon for nested-hierarchy GLBs; name-keying is hierarchy-independent.

### Consequences
- ✅ Uploaded multi-material GLBs with unique part names are taggable + correctly recolorable per part.
- ✅ Tripo path unchanged (positional path retained for legacy/un-named bases; name path is a faithful superset).
- ⚠️ Forge build does one extra headless Babylon (NullEngine) parse of the base GLB to derive names; if that parse fails, it falls back to positional (the pre-existing behavior).
- ⚠️ Uploads with duplicate/empty material names or > 64 parts are (deliberately) not taggable — they keep the single-color legacy treatment; a future enhancement could disambiguate by mesh identity.
- 🔮 If a future flow needs to recolor non-bijective bases, the name map would need a per-mesh (not per-material) anchor.

### Related
- Plan: `docs/plans/2026-05-30-...` (upload segmentation, Option A2) — built on branch `feat/upload-segmentation`.
- Constraints: D-033 (GLB upload source), `MAX_PARTS` lockstep (`model3d.move` ↔ `shared/src/types.ts MAX_PARTS_FE`).
- spec.md: forge material-swap contract.

---

## D-078: Paid-access entitlement — split fork fee into buy-access (once) + derive fee (per-launch); move decrypt gate cap → entitlement

**Status**: Accepted (Amends D-076; partially reverses the decrypt-gate clause of D-074/D-075)
**Date**: 2026-06-01
**Phase**: 4 (v1.1 Seal, plan-027)

### Context
D-074/075/076 folded "access to decrypt an encrypted base" into the per-collection fork cap: the only way to decrypt an ALLOW_LIST base was to call `launch_collection` (pay the derive fee, mint the cap), and `seal_approve_cap` gated decryption on that cap. Two pains: (1) a creator who already forked a base is charged the derive fee **again** every time they launch another collection — and just to *preview*, since preview needs the paid plaintext; (2) there was **no consumer path** to pay-to-view a premium base, so the documented "N buyers pay access" Walrus/Seal story (spec §3.7) was unimplementable. Origin: `docs/brainstorms/2026-06-01-paid-access-entitlement-split-requirements.md`.

### Decision
- **Access is a one-time, soulbound `AccessEntitlement` on L1** (`key`-only, no `store`; fields `model_id`, `holder`), minted by a new `purchase_access(model, payment)` entry that routes a new **`access_fee`** to the base creator. Permanent; a duplicate purchase by the same wallet aborts (`EAlreadyHasEntitlement`, dedup table on `Model3D`). It is **L1 entitlement framing, not "L3 Access"** — a direct relationship with the base and a precondition to forking, not a tier stacked on derivatives.
- **The decrypt gate moves from the cap to the entitlement.** `seal_approve_cap` is **deleted**; new `seal_approve_entitlement(id, &AccessEntitlement, &Model3D, ctx)` gates on `entitlement.model_id == id(model)` ∧ `entitlement.holder == sender` ∧ `is_prefix(seal_id, id)` ∧ `seal_version == VERSION` (modeled on the single-object `seal_approve_creator`, not the cap triple-check). The cap retains collection authority (register fee / `mint_tokens`) but no longer decrypts.
- **Two independent fees on `LicenseTerms`:** `access_fee` (the pay-to-access gate) + `derivative_mint_fee` (per-launch). The D-076 invariant **moves from derive to access**: `ALLOW_LIST ⇒ access_fee > 0`; the derive fee **may now be 0**.
- **One entitlement serves both** a consumer (view-in-app) and a creator (free decrypt to fork). Unlock becomes a **free** entitlement-gated decrypt; the derive fee is charged at mint. ALLOW_LIST launch is entitlement-gated on-chain: legacy `launch_collection`/`launch_collection_with_tokens` now **reject** ALLOW_LIST (`EEntitlementRequired`); the new `launch_collection_with_entitlement` is the only ALLOW_LIST launch path (closes the free-fork bypass now that derive may be 0).
- **`VERSION` bumped 1 → 2** (fail-closed tripwire for abandoned v9 objects). Ships as a **fresh republish (v10)**, not an upgrade (gate relocation must not leave old bytecode callable — D-040 rule). Existing v9 testnet objects are abandoned (no migration).
- **Policy scoping:** access purchase is ALLOW_LIST-only; PERMISSIONLESS is public (no entitlement); RESTRICTED stays creator-only (not purchasable).

### Honesty boundaries (recorded so the pitch does not overclaim)
- The consumer in-app "no download" is **UX friction, not DRM** — plaintext GLB bytes reach the browser heap after decryption; a technical user can extract them. True DRM is out of scope for v1.
- `LicenseTerms` (incl. `access_fee`) is **immutable post-publish** in v1 (no setter), so there is no creator-side fee-change race against a buyer.
- The **economics consequence is intended**: once a buyer holds the entitlement they have the plaintext for the access fee alone, so the **access fee is the content gate** and the **derive fee is a per-launch provenance/convenience charge** (may be 0). Creators price the access fee as the primary value capture.

### Alternatives Considered
- **Keep the cap as the decrypt gate (status quo)** — rejected: it is exactly the double-charge + no-consumer-path problem this decision exists to fix.
- **Frontend-only "cap-reuse" stopgap** (detect an existing cap, skip re-pay) — rejected: doesn't add a consumer path and leaves the economics conflated; superseded by the real entitlement.
- **Thread `Option<&AccessEntitlement>` through `launch_collection_internal`** — rejected: not a valid Move type (references can't live in `Option`/structs). Resolved by rejecting ALLOW_LIST in the legacy entries + a dedicated entitlement entry.
- **Transferable / time-limited / subscription access** — deferred; entitlement is soulbound + permanent for v1.

### Consequences
- ✅ Revives a demonstrable "pay-to-access premium 3D content" story (consumer view) — the Walrus-track pitch payload — and stops charging a returning creator to preview/re-launch.
- ✅ Decrypt access decoupled from launching; the cap keeps its legitimate register-fee/integration role.
- ⚠️ Fresh v10 republish (abandons v9 objects); new `seal_approve` first-arg source (entitlement) is a never-live-verified Seal seam — must pass a post-deploy Part-A pre-flight (sender from SessionKey + wrong-sender denied).
- ⚠️ One `buyers` table per `Model3D` (incl. PERMISSIONLESS, which never uses it) — cheap.
- 🔮 A future transferable/expiring entitlement would reopen the soulbound + immutability choices.
- 📝 **v11 follow-up (2026-06-01):** the U3b ALLOW_LIST launch rejection was relaxed so the base **creator** may launch their own ALLOW_LIST base via the legacy `launch_collection`/`_with_tokens` entries **without** an entitlement (`policy != ALLOW_LIST || sender == creator`); non-creators are still rejected, so the free-fork bypass stays closed. Reason: making a creator buy access to their own content is a pointless self-pay round-trip (they pay the access_fee to themselves). Mirrors the on-chain `seal_approve_creator` "creator may always decrypt own content" rule on the launch side. Frontend: `/model/:id` + `/launch` treat the creator as already-entitled and decrypt via the creator gate. Fresh republish v11 (package `0x1cf8aa4d…`, supersedes v10 `0x01baf4fc…`); VERSION unchanged (seal gate untouched).

### Related
- **Amends D-076** (the `ALLOW_LIST ⇒ fee > 0` invariant moves derive → access; derive may now be 0).
- **Partially reverses D-074/D-075** (the cap-as-decrypt-gate clause only; envelope encryption, `SealIdRegistry` Resolution-G binding, fresh-republish discipline all retained).
- Plan: `docs/plans/2026-06-01-027-feat-access-entitlement-split-plan.md`. Origin: `docs/brainstorms/2026-06-01-paid-access-entitlement-split-requirements.md`.
- Revives the soulbound-receipt shape of the deleted `Access` struct (D-002/D-029/D-032, spec §3.7).

---

# Reserved Decision Numbers

D-079 onwards: captured in real-time per `CLAUDE.md` Decision Capture protocol.
