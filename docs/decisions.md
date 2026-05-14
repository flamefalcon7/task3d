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

# Reserved Decision Numbers

D-012 onwards: captured in real-time per `CLAUDE.md` Decision Capture protocol.
