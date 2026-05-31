# Open Questions

Unresolved questions captured during the project. Bootstrap pulled from `docs/spec.md` §7.5.

Add new entries below as **OQ-XXX** in order. Move resolved questions to the bottom section with date + resolution summary.

---

## OQ-001: What is MemWal (Walrus Memory) exactly?

**Why this matters**: Sui Overflow 2026 Walrus track framing is "verifiable data **and memory layer**". The "memory layer" part likely refers to MemWal. We may be missing a pitch hook by not integrating it.

**To resolve**: Read MemWal playground + GitHub repo. Compare against current Model3D design — does MemWal fit our use case (data layer for asset metadata?), or is it for agent memory (different scope)?

**Blocker level**: 🟡 Worth investigating before Phase 4 / pitch writing. Not blocking Phase 1.

---

## OQ-002: Real Walrus mainnet cost for ~100KB GLB, 10 epochs

**Why this matters**: Need real cost numbers before pricing model design (`Model3D.direct_access_price` / `Derivative.derivative_price`) and for pitch slide on "Walrus cheaper than S3+CloudFront".

**To resolve**: Run `walrus info` against mainnet system object after first deploy. Or check current-state cost calculator if accessible.

**Blocker level**: 🟢 Not blocking. Estimate as fractions of a cent for now.

---

## OQ-003: Enoki sponsored-tx on testnet — truly free?

**Why this matters**: Demo Day killer feature ("user signs in with Google, no gas, mints model"). If testnet sponsored tx counts against the free-tier quota, may need to pay $120/mo Pro plan earlier than planned.

**To resolve**: Register Enoki sandbox account, run one sponsored testnet tx, check dashboard quota.

**Blocker level**: 🟢 Not blocking. Worst case: pay during demo polish — $120 is acceptable.

---

## OQ-004: @mysten/dapp-kit 1.0 actual import paths — RESOLVED

See Resolved Questions section below.

---

## OQ-005: Walrus package ID on testnet AND mainnet (current)

**Why this matters**: Hardcoding wrong package ID → build fails. MVR alias `@walrus/core` is the supposed-to-work path.

**To resolve**: Either resolve dynamically via system object lookup (`sui client object <SYSTEM_OBJECT_ID>`) or commit to MVR alias in `Move.toml` and never hardcode. Sanity-check works on both networks.

**Blocker level**: 🟡 Resolve during Phase 2 Move integration.

---

## OQ-006: DeepSurge submission portal — fields and flow

**Why this matters**: Submission deadline 6/21. If portal has surprise requirements (custom video format, special demo URL pattern, team registration prereqs, ID verification), we want to know now, not 6/20.

**To resolve**: Register on DeepSurge with placeholder team, examine submission form fields and required uploads.

**Blocker level**: 🟢 Not blocking, but worth doing before 6/15 buffer.

---

## OQ-007: Where to acquire mainnet WAL for demo

**Why this matters**: Mainnet has no WAL faucet. Need to plan: exchange (Binance / Coinbase / OKX)? DEX? OTC? Bridging via Wormhole?

**To resolve**: Check `walrus.xyz` for current mainnet WAL acquisition options; budget $5–20 for demo storage + ~$50 buffer.

**Blocker level**: 🟡 Resolve before Phase 4 mainnet deploy.

---

## OQ-008: Forensic watermark approach for 3D meshes

**Why this matters**: Phase 4 stretch C. If we attempt this, need a workable algorithm (mesh micro-perturbation encoding user ID, or texture metadata steganography).

**To resolve**: Research existing 3D watermarking academic literature; pick simplest approach for Phase 4.

**Blocker level**: 🟢 Not blocking; only relevant if attempting stretch C.

---

## OQ-009: Sample game scene tech choice (Three.js vs Unity WebGL vs Babylon)

**Why this matters**: Phase 3 deliverable. Three.js / Babylon (we already have Babylon in `frontend/`) is web-native, lighter, easier to embed in demo. Unity WebGL is more "game dev legitimate" but larger setup overhead (bundle size, build pipeline).

**To resolve**: User preference + time budget. **Babylon makes most sense** given we already use it in frontend — same Engine instance can be reused, no second 3D library to learn. Three.js is the alternative if Babylon proves heavy for the chosen scene form (depends on OQ-011 G1/G2/G3 outcome).

**Blocker level**: 🟡 Resolve together with OQ-011 before Phase 3 start (5/30).

---

## OQ-010: Pitch deck format and length

**Why this matters**: Sui Overflow handbook didn't specify a pitch deck format for shortlisted teams' Demo Day pitch. Typical hackathon: 5–10 slides, 5 minutes total. Without explicit guidance, default to industry-standard.

**To resolve**: Check handbook + ask devrel@sui.io if shortlisted teams get specific deck requirements.

**Blocker level**: 🟢 Not blocking; relevant if shortlisted (announced 7/8).

---

## OQ-011: Phase 3 sample game scene form factor (G1 / G2 / G3)

**Why this matters**: D-014 deferred this decision until Phase 2 catalog is complete. The scene form (Trophy Room / Dress-up Mannequin / Mini-Adventure) should be driven by what kinds of Model3D we actually have, not chosen blind.

**Three candidate forms**:
- **G1 Trophy Room** — first-person walk-through showcase, no character, NFTs on pedestals. ~2-3 days. Fits well if catalog is large-prop heavy (castles, dragons).
- **G2 Dress-up Mannequin** — single Mixamo-rigged character, equip slots for NFT weapons/armor/props from your Access inventory, 360° preview. ~3-4 days. Fits if catalog is weapon/equipment heavy. **Currently recommended fallback**.
- **G3 Mini-Adventure** — top-down or 3rd-person character + walkable terrain + pickup items + equip. ~5-7 days. Highest production value but highest scope risk (character controller, animation blend, collision).

**To resolve**: At end of Phase 2 (~5/29), review catalog composition + remaining Phase 3 budget → write **D-014a** ADR locking the choice. Pick the form that lets the chosen catalog shine while leaving Phase 5 buffer.

**Constraint from D-014**: all meshes in the scene must come from our service (procedural + Tripo seed), not external free game assets. Mixamo character is the only external dependency allowed.

**Blocker level**: 🟡 Decide by 5/29 (Phase 2 end).

---

## OQ-012: Catalog search / discovery beyond pure browse (v1.1+)

**Why this matters**: D-014 chose pure browse + tag filter for v1, deferred semantic search to v1.1+. Need to decide approach when traction proves search is wanted.

**Three approaches**:
- **S1. LLM semantic search** — embed user prompt + each Model3D's description/tags → cosine top-K. Cost: embedding API per query. Best UX.
- **S2. Tag-based filter only** — frontend filter chips by tag. Cost: 0. Lowest UX but functional.
- **S3. Backend indexer with prompt search** — Phase 2 already builds a Sui indexer query for Browse. Extend with text search across `tags` and (future) `description` field. Mid-cost, mid-UX.

**To resolve**: Don't resolve in v1. Watch v1 user behavior (do users complain "can't find what I want"?) → pick S1 or S3 in v1.1 based on signal. **S2 is v1 default and likely enough for ~20-30 catalog items.**

**Blocker level**: 🟢 Not blocking v1. Revisit post-submission.

---

## OQ-013: Phase 4 Sui Kiosk + Phase 2 share_object Model3D coexistence

**Why this matters**: Plan-002 D-016 captures that Phase 2 uses `transfer::share_object(Model3D)` so `purchase_model_access` works without Kiosk. Sui Kiosk takes ownership of items, so a shared-object Model3D cannot be retroactively placed in a Kiosk. Phase 4's Kiosk integration must decide: (a) accept a bifurcated catalog where Phase 2 mints stay shared and Phase 4 mints go through Kiosk (Browse must query both), or (b) ship a migration helper that re-mints Phase 2 models into Kiosks (loses original mint timestamp + tx hash).

**To resolve**: Phase 4 ADR (D-???) at start of Phase 4 (~6/11). For Phase 2 work, no action needed — `publish_and_share` ships as designed.

**Blocker level**: 🟢 Not blocking Phase 2. Decide at Phase 4 start.

---

## OQ-014: `writeFilesFlow` with 2 files — 2 popups or 4?

**Why this matters**: Plan-002 U7 assumes 2 files (GLB + lineage) in `writeFilesFlow({ files: [glb, lineage] })` produces a single 2-popup sequence (one register, one certify). If the SDK actually fires 2 register + 2 certify (4 popups), the creator UX gets significantly worse and `MintButton` copy needs to say "Step X of 5" instead of "Step X of 3".

**To resolve**: U3 day-1 smoke test with a real Slush wallet against testnet relay. Document the actual popup count in U3 PR. Adjust U7's MintButton copy accordingly.

**Blocker level**: 🟡 Resolve at U3 implementation; affects U7 UX spec.

---

# Resolved Questions

(Move resolved items here with date + one-line resolution.)

## OQ-004: @mysten/dapp-kit 1.0 actual import paths

**Resolved**: 2026-05-15 (U4 implementation).

**Outcome**: No -core/-react split — `@mysten/dapp-kit@1.0.6` ships everything from a single package entry. Imports used by U4:

```ts
// dApp Kit (single package, no @mysten/dapp-kit-core / @mysten/dapp-kit-react)
import {
  SuiClientProvider,
  WalletProvider,
  createNetworkConfig,
  useSuiClientContext,
  useConnectWallet,
  useCurrentAccount,
  useDisconnectWallet,
  useSignPersonalMessage,
  useWallets,
} from '@mysten/dapp-kit';
import '@mysten/dapp-kit/dist/index.css';

// SuiClient construction (per D-019 — JSON-RPC client lives in /jsonRpc)
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';

// Enoki (registerEnokiWallets is the 1.0 surface; EnokiFlowProvider et al. are deprecated)
import { registerEnokiWallets, isEnokiNetwork, isEnokiWallet, isGoogleWallet } from '@mysten/enoki';

// Slush (registerSlushWallet exists, but dapp-kit's WalletProvider now exposes a
// built-in `slushWallet={...}` prop that auto-registers — preferred path)
import { SLUSH_WALLET_NAME } from '@mysten/slush-wallet';
```

**Companion deps required**: `@tanstack/react-query` (peer of dapp-kit 1.0; `QueryClientProvider` must wrap `SuiClientProvider`).

**Network config gotcha**: `createNetworkConfig` entries in 1.0 must include both `network` (typed `'testnet' | 'mainnet' | 'devnet' | 'localnet'`) AND `url`. Older sample code used `{ url }` only — that fails the `NetworkConfig` type, which now extends `SuiJsonRpcClientOptions` per the D-019 split.

**Signature verification (backend)**: `verifyPersonalMessageSignature` lives at `@mysten/sui/verify` (not `@mysten/sui/cryptography/verify` as the plan stated). Returns a `PublicKey` and asserts address equality via `options.address` — throws on mismatch.

---

## OQ-017: Phase 3 stale frontend callers — delete before U4 republishes

**Why this matters**: plan-007 U2 stripped the Phase 3 Move surface (`Collection`, `VariantSpec`, `publish_collection`, `mint_variant`, `share_collection`, `publish_and_share`, `purchase_model_access`, `mint_model_access`). Frontend code that still imports / calls those entry fns:

- `frontend/src/sui/publishPtb.ts` + `publishPtb.test.ts` — calls `model3d::publish_and_share` / `publish_collection`
- `frontend/src/sui/purchaseAccessPtb.ts` + `purchaseAccessPtb.test.ts` — calls `model3d::purchase_model_access`
- `frontend/src/sui/spike-b-ptb-shape.test.ts` — Phase 3 PTB spike test for `publish_collection` / `mint_variant` / `share_collection`
- `frontend/src/forge/buildCollectionPtb.ts` + `buildCollectionPtb.test.ts` — Collection-mint PTB builder
- `frontend/src/collection/CollectionDetailPage.tsx` + `useCollectionBySlug.ts` + test — Collection browse page
- `frontend/src/creator/CreatorFlow.tsx` — imports `buildPublishPtb` from `publishPtb.ts`
- `frontend/src/buy/BuyAccessButton.tsx` — imports `buildPurchaseAccessPtb` from `purchaseAccessPtb.ts`
- `frontend/src/App.tsx` — registers `/collection/:slug` route

`pnpm typecheck` still passes — TypeScript only validates the JS surface, not the on-chain Move entry-fn names. `pnpm test` likely passes too (PTB tests assert string-template targets against a placeholder `MODEL3D_PACKAGE_ID`). After U4 republishes under the new `original-id`, any of these surviving callers will runtime-fail with `FunctionNotFound`. CI false-greens this.

**To resolve**: before U4's testnet republish, delete (or quarantine behind a build-time error) every file in the list above. U6 (ForgePage refactor) + U7 (BrowsePage rewrite) + U10 (TrackPage Kiosk-protocol KTD) collectively replace the functionality these callers held; the deletions are scoped to those units' Files lists.

**Blocker level**: 🟡 Blocks U4 testnet republish from being demo-safe. Plan-007 U4's deploy verification step does not currently include a "frontend cascade is bounded" check — add one. Recommend: U6 first dispatch carries the deletion of `CreatorFlow.tsx` import + `publishPtb.ts` (+ tests); U7 carries `CollectionDetailPage.tsx` + `useCollectionBySlug.ts` + `buildCollectionPtb.ts` (+ tests) + the `/collection/:slug` route in `App.tsx` + `spike-b-ptb-shape.test.ts`; U6 or U9 carries `BuyAccessButton.tsx` + `purchaseAccessPtb.ts` (+ tests).

**Sources**: plan-007 U2 adversarial-reviewer finding (`ce-adversarial-reviewer` 2026-05-19); spawned during U2 commit prep.

---

## OQ-016: Phase 5 submission asset checklist — items spawned by plan-007 U1 handbook capture

**Why this matters**: 2026-05-19 handbook verbatim capture surfaced submission requirements not previously tracked. Both are Phase 5 work; recording here so they aren't forgotten when Phase 5 starts.

**Items**:

1. **Live virtual demo prep for 7/20–21 Demo Day** (only fires if shortlisted on 7/8). Distinct from the 6/21 recorded video — this is a live present-back to judges over Zoom (or equivalent). Needs: short slide deck (3-5 slides max — track framing + problem + Kiosk royalty enforcement demo + closing CTA), runnable demo end-to-end on testnet (or mainnet if deployed by then), Q&A prep covering judging criteria axes (Product/UX 20%, Real-World Application 50%, Technical 20%, Vision 10%). Estimated 1-2 dev-days during the 7/8–7/20 window.

2. **Project Logo (1:1 ratio JPG/PNG)** — submission package required field. Can be simple wordmark or generated via the project's own model3d Forge as a meta-touch. Estimated 30 minutes.

**Blocker level**: 🟢 Not blocking Phase 4. Re-fires when Phase 5 starts (planned 6/20 if Phase 4 ships on schedule).

**To resolve**: at Phase 5 kickoff, add both as Phase 5 plan units. If shortlisting on 7/8 is positive, item 1 becomes urgent immediately. If not shortlisted, item 1 doesn't fire.

---

## OQ-015: Babylon `pluginExtension` + blob: URL gotcha — write up as solutions doc

**Status**: ✅ RESOLVED (workaround in place); follow-up: write `docs/solutions/integration-issues/` entry.
**Raised**: 2026-05-17 (plan-004 ce-code-review)
**Originator**: Earlier session debugging pass surfaced this during live-testnet bug 3 (PreviewCanvas blob-URL didn't load); fix landed in `cf98acf`.

### Context

`LoadAssetContainerAsync(url, scene)` infers the loader from URL extension. `blob:` URLs have no extension, so the GLB loader isn't auto-selected and the load silently fails (or falls through to a JSON loader and throws). Workaround: always pass `pluginExtension: '.glb'` explicitly when loading from a blob URL.

The current code (`PreviewCanvas.tsx` and `racetrackScene.ts`) does this correctly — relies on D-006 (GLB-only locked) so the unconditional extension is safe.

### Why this is still an OQ

The pattern is undocumented in `docs/solutions/`. A future contributor adding a second non-GLB asset format (or reading the code thinking "why is this unconditional?") will lack the context. The plan-004 doc captured this in its "Deferred to Follow-Up Work" section but per CLAUDE.md the right home is here + a `docs/solutions/integration-issues/` entry during Phase 5 polish.

### Resolution path

Phase 5 polish window — write `docs/solutions/integration-issues/babylon-pluginextension-blob-url-2026-05-17.md` documenting:
1. The symptom (empty canvas / silent load failure)
2. The root cause (extension-based loader inference on blob: URLs)
3. The workaround (`pluginExtension: '.glb'`)
4. The dependency on D-006 (GLB-only) — when v1.1 introduces FBX/USDZ, the unconditional pattern silently breaks for new formats

Not blocking; informational follow-up.

---

## OQ-018: Move 2024 rejects `#[expected_failure]` on un-droppable hot-potato leak (compile-time)

**Why this matters**: Plan-007 U4 R2 wanted a runtime test proving "leaving a `TransferRequest<Model3D>` hot potato unconsumed aborts the tx". The test was intended to complement test 4 (`confirm_request_aborts_when_receipts_missing_rules`) which catches the runtime `EPolicyNotSatisfied` after a `confirm_request` call with empty receipts.

**Status**: Cannot write the runtime test as designed. Move 2024 statically rejects any function that binds a non-`drop` value without consuming it. The compiler emits `E06001: unused value without 'drop'` and the bytecode never reaches the VM — there is no Move-VM-level abort code to assert against, because the program never compiles.

This is actually a **stronger** guarantee than runtime would be: the rejection happens at every callsite at every compile, not just at tx time. But it means the plan's wording ("the test asserts the tx aborts") is impossible to satisfy.

**Resolution**: Documented in test file comment block (replacing the would-be test 9 body). Test 4 retains the runtime confirm_request behavior; the compile-fail attempt itself is the framework guarantee. No action needed.

**Blocker level**: 🟢 Resolved — N/A by design.

---

## OQ-019: Phase 3 legacy PTB routes still wired to superseded v1 package

**Status**: Deferred to U6
**Surfaced**: 2026-05-19 (U5 review, ADV-002)
**Blocking**: U6 (per plan-007)

`frontend/src/sui/publishPtb.ts` + `purchaseAccessPtb.ts` are still imported by `CreatorFlow.tsx`, `BuyAccessButton.tsx`, and `buildCollectionPtb.ts`. The `VITE_MODEL3D_PACKAGE_ID` in `frontend/.env.local` pins the SUPERSEDED Phase 3 package (`0x18a480b3…`), explicitly marked `supersedes_phase3_package_id` in `contracts/networks/testnet.json`. Phase 4 v2 package is `0x563ab54b…`.

**Demo-day risk**: A user navigating to `/generate` (CreatorFlow) or `/buy/*` (BuyAccessButton) between now and U6's landing would mint to the dead v1 package or attempt a v1 purchase that the v2 indexer can't process.

**U6 must**: refactor `CreatorFlow.tsx` + `BuyAccessButton.tsx` + `buildCollectionPtb.ts` to use `kioskTxBuilders.ts`, then delete the 4 Phase 3 PTB files + update `.env.local` to reference v2 IDs (or remove the env var entirely, sourcing from `networkConfig.ts`).

**Acceptance**: U6 cannot ship until `grep -rn "publishPtb\|purchaseAccessPtb" frontend/src/` returns zero hits and the 4 files are deleted.

**Blocker level**: 🟡 Held — U6 must clear before that unit ships.

---

## OQ-020: 6/21 demo's L1 (`Model3D`) story — access-sale vs ownership-interim vs publish-only

**Status**: ✅ RESOLVED 2026-05-20 — **path (b)** via **D-032**. `Model3D` is a shared object (`publish`); the L1 Kiosk ownership-sale path was removed. 6/21 demo shows L1 as publish-only (creator earns the derive fee + downstream `NftToken` royalty); the ownership-sale story lives entirely on L2 `NftToken`. Seal-gated L1 access-sale is v1.1. Note the original "not blocking U5" premise was **wrong** — the resolution changed the Move surface and had to land *before* the U5 republish.
**Surfaced**: 2026-05-20 (D-031 vision clarification)
**Resolved by**: D-032 (also resolved the entangled AC-003 cross-wallet `launch_collection` blocker)

D-031 settled the target layering — **L1 `Model3D` sells access (Seal-gated, v1.1); L2 `NftToken` sells ownership (Kiosk, v1)** — but left open what the **6/21 demo** actually shows for L1, since real access-enforcement (Seal) is v1.1 and unencrypted Walrus blobs can't be access-gated.

Options:
- **(a) Interim ownership-sale on L1.** Keep the shipped Kiosk-on-`Model3D` path (`mint_and_list` / `purchase_with_kiosk`) and demo "buy the model" as ownership, framed honestly as interim; Seal-gated access is the v1.1 roadmap. Lowest code churn (uses what's built).
- **(b) L1 publish-only + free permissionless access; sale story lives entirely on L2 `NftToken` ownership.** Cleanest conceptually (no "buy a model object" beat that contradicts "L1 = access"); Seal-access is the v1.1 flagship. May leave the shipped L1 Kiosk machinery unused in the demo.

Agent lean: **(b)** — keeps the demo coherent with D-031 and avoids touching Seal. Decision affects U10's mint-page framing and U15's four-actor demo arc.

**Blocker level**: 🟢 Open — resolve before demo wiring (U10/U15), not before U5.

---

## OQ-021: Plan-016 test-wallet — dapp-kit `WalletProvider` co-existence when test mode is active

**Status**: 🟢 Open — deferred to manual `pnpm dev` smoke after plan-016 lands. Brainstorm OQ-5.
**Surfaced**: 2026-05-27 (plan-016 brainstorm + code-review pass)
**Blocking**: nothing in plan-016 scope (smoke verified the LAUNCH flow works end-to-end via test wallet); follow-up only if WalletProvider auto-connect surfaces noise.

Plan-016 routes the 3 dapp-kit hook call sites in `LaunchCollectionPage` and the personal-message sign in `useSession` through wrapper hooks `useAppAccount` / `useAppSigner`. When `VITE_TEST_WALLET=1`, the wrapper hooks short-circuit reads. However, `WalletProvider` is still mounted at the app shell (`frontend/src/main.tsx`), so dapp-kit's internal Slush/Enoki auto-connect logic continues subscribing to wallet-state changes in the background.

**Verify by**: with Slush installed + LOCKED + `VITE_TEST_WALLET=1` + valid key, refresh `/launch` and watch the console for dapp-kit auto-connect attempts / disconnect events / `useWallets()` ticks.

**If noisy but harmless**: document in the brainstorm + leave alone.
**If broken** (e.g., dapp-kit overwrites session state, races the test signer, or fights for the wallet pill): branch the app shell on `TEST_WALLET_ENABLED` to skip the `WalletProvider` mount in test mode. Roughly 10 lines in `main.tsx`.

**Blocker level**: 🟢 Open — manual smoke only.

---

## OQ-022: Plan-016 test-wallet — does an existing Slush-signed JWT survive a mid-session toggle to test mode?

**Status**: 🟢 Open — deferred to manual smoke. Brainstorm OQ-6.
**Surfaced**: 2026-05-27 (plan-016 brainstorm + code-review pass)
**Blocking**: nothing — the JWT is address-bound and signature-scheme-agnostic on the backend (`verifyPersonalMessageSignature`), so test wallet and Slush produce indistinguishable signatures from the same address.

Expected behavior: a Slush-signed JWT in `localStorage` should continue to validate against the backend even after the dev toggles `VITE_TEST_WALLET=1` and reloads, because:
- Both signers use the same Ed25519 private key (same address)
- Backend `jwt.verifySession` is stateless and address-bound
- The challenge-response signature scheme is the same (Ed25519 personal message)

**Verify by**: sign in via Slush first → JWT in `localStorage` → stop Vite → add `VITE_TEST_WALLET=1` + key to `.env.local` → restart Vite → reload `/launch` → check whether `useSession.session` survives (truthy → JWT still valid) or gets dropped (the address-mismatch wipe in `useSession.ts` would fire if the addresses differed).

**If JWT survives**: no special handling needed; document and close.
**If JWT is dropped**: investigate which check fires (address mismatch should be the only path that wipes; if not, the backend or session schema has unexpected coupling). May indicate a real bug rather than a UX gap.

**Blocker level**: 🟢 Open — manual smoke only.

---

## OQ-023: Plan-016 — Vite build-time gate against `VITE_TEST_WALLET=1` + production build

**Status**: 🟢 Open — deferred to v1.1 / pre-mainnet hardening. Surfaced by plan-016 code-review pass (security sec-002 + adversarial adv-006).
**Surfaced**: 2026-05-28 (ce-code-review run `20260528-000110-fef1786a`)
**Blocking**: nothing for 6/21 testnet submission (demo path is `pnpm dev`, no production build runs). Relevant before 8/27 mainnet deploy.

Vite inlines all `VITE_*` env vars as string literals into the built JS bundle at build time. If a future CI / deploy runner accidentally has both `VITE_TEST_WALLET=1` AND `VITE_TEST_WALLET_KEY=suiprivkey1...` set when `pnpm build` runs, the **private key string ships in the public bundle**.

Three layers protect against this today:
- The module-level `if (import.meta.env.PROD) throw` in `frontend/src/test-wallet/loadKeypair.ts` — fires at first key load in the user's browser, AFTER the bundle is already distributed.
- AE4 grep on `frontend/dist/` — manual one-shot check that requires someone to remember.
- The tree-shake pathway — only effective when `VITE_TEST_WALLET` is unset.

The plan-016 code-review found the dual-set misconfiguration (both flags + production build) is NOT caught at build time — only at runtime in someone's browser by then. A `vite.config.ts` plugin that throws during `vite build` would catch the misconfig before the bundle is emitted.

**Proposed implementation**: in `frontend/vite.config.ts`, add a `defineConfig` plugin hook:

```ts
plugins: [
  // ...existing plugins
  {
    name: 'plan-016-prod-test-wallet-guard',
    enforce: 'pre',
    config(_, { command, mode }) {
      const inProdBuild = command === 'build' && mode === 'production';
      const testWalletOn = process.env.VITE_TEST_WALLET === '1';
      if (inProdBuild && testWalletOn) {
        throw new Error(
          'Refusing to build for production with VITE_TEST_WALLET=1. ' +
          'This would inline VITE_TEST_WALLET_KEY into the bundle. ' +
          'Unset VITE_TEST_WALLET before running pnpm build.',
        );
      }
    },
  },
],
```

**When to land**: before 8/27 mainnet deploy or when CI starts running `pnpm build`. Not blocking 6/21 testnet submission.

**Blocker level**: 🟢 Open — defense-in-depth, no current attack path.

---

## OQ-024: Plan-016 — Runtime testnet/mainnet check on `VITE_TEST_WALLET_KEY`

**Status**: 🟢 Open — conceptually open, mechanically unresolvable offline. Surfaced by plan-016 code-review pass (adversarial adv-002).
**Surfaced**: 2026-05-28 (ce-code-review run `20260528-000110-fef1786a`)
**Blocking**: nothing — the dapp is hardcoded to testnet endpoints (`walrusClient.ts`, `~/.sui/sui_config/client.yaml`, `dapp-kit` provider config), so even a mainnet key produces only testnet TXs.

Sui's Ed25519 bech32 private key format is **network-agnostic**. The same key bytes produce the same `0x...` address on testnet AND mainnet. Nothing in `loadKeypair.ts` verifies that the loaded key is "for testnet" because no such metadata exists in the key string itself.

`.env.example` warns the user via comment ("must be a TESTNET key"), and the dapp is structurally bound to testnet, so a misconfigured mainnet key would today produce:
- All Sui TXs sent to testnet RPC → mainnet objects don't exist there → `ObjectNotFound` or similar errors
- All Walrus uploads sent to testnet upload-relay → succeed but tied to a key that controls real mainnet funds

The actual harm path requires BOTH:
1. Test wallet active (`VITE_TEST_WALLET=1`)
2. Dapp wired to mainnet (would require flipping endpoint constants OR a future mainnet build that somehow loads the test-wallet — blocked by `import.meta.env.PROD` throw)

**Why no clean fix exists offline**:
- Can't tell network from the bech32 string itself.
- Could call mainnet RPC to check if the address has any mainnet balance / object history — but: requires network access at module load, adds latency, leaks the address to a third party, and a "clean" testnet key the user reused on mainnet would still trigger a false positive.
- Could require an additional `VITE_TEST_WALLET_NETWORK=testnet` env var as a self-declaration — adds friction without real safety (the user could still set it wrong).

**Recommendation**: keep the documentation warning in `.env.example` + module-eval PROD throw + tree-shake. Don't add a runtime check; the cost / benefit is wrong.

**When to revisit**: if mainnet deploy (8/27) ever ships a path that loads the test-wallet adapter (today blocked by `import.meta.env.PROD` throw — that boundary is the real defense).

**Blocker level**: 🟢 Open — accept the risk; documented.


---

## OQ-025: Backend hosting for 6/21 submission — VM (costs money) vs serverless (likely free)

**Status**: 🟡 Open — needs a decision before the deploy push, not blocking today.
**Surfaced**: 2026-05-30 (session: Walrus CDN wrap-up; user flagged "deploying backend means opening a VM, which costs money").

### The question
The backend (`backend/` — Node 22 + Hono + `@mysten/sui` read path + Tripo dispatch, per D-012) is not deployed anywhere yet. The user does not want to pay for an always-on VM just for the hackathon.

### Why a VM may be unnecessary
The backend is a stateless HTTP service (Hono). Hono runs on multiple **serverless / edge** runtimes with a free tier — no VM, no always-on cost:
- **Cloudflare Workers** — Hono is first-class here; we're already setting up a Cloudflare zone (`tusk3d.space`) for the CDN, so it's the same account/tooling. Free tier 100k req/day.
- **Vercel Functions** — same place the frontend is going (D-070), single deploy surface.
- Caveats to check before committing: (1) Tripo dispatch latency / long-running requests vs Workers CPU-time limits; (2) any Node-only API the backend uses that isn't in the Workers runtime (e.g. `@gltf-transform/core`, fs, native deps); (3) secrets handling (Tripo key, Sui key) as env bindings.

### Recommendation (to confirm next session)
Before provisioning any paid VM, spike whether the backend runs on Cloudflare Workers or Vercel Functions as-is. If a Node-only dependency blocks it, fall back to the cheapest option that fits (e.g. a free-tier container/Render/Fly small instance) rather than a paid VM. Decide, then capture as an ADR.

### Blocker level
🟡 Open — off today's critical path; resolve at the start of the deploy push (the real 6/21 critical path, ahead of the CDN polish).

---

## OQ-026: v1.1 Seal `seal_approve` must be redesigned onto the current object graph (spec §3.7 is stale)

**Status**: ✅ Resolved 2026-05-31 — implemented in v9 (plan-026, D-074/D-075/D-076); spec §3.7 rewritten.
**Surfaced**: 2026-05-30 (content-protection ideation; see `docs/ideation/2026-05-30-content-protection-seal-ideation.md`).
**Blocking**: nothing for 6/21 (Seal is v1.1). Blocks any v1.1 Seal implementation.

### Resolution (2026-05-31)
Seal was pulled into the v1 / 6/21 scope (D-074) and **shipped in the v9 republish** (package `0xba1e84ba…`). The converged direction below was realized with two refinements found at implementation: (1) the gate is `seal_approve_cap` (cap holder, named triple-check invariant) + `seal_approve_creator` (RESTRICTED) — NOT a single `seal_approve`; (2) the Seal `id` binds to a client-random `seal_id` made globally unique by a shared `SealIdRegistry` (Resolution G) rather than the object id, because encryption precedes publish (chicken-and-egg). spec §3.7 has been rewritten onto this model; ADRs D-074/D-075/D-076 capture it; the implementation is plan-026 U1–U5. The originally-converged direction (recorded below) held up; only the gate function shape + the id-binding mechanism changed.

### The drift
`spec.md §3.7` designs `seal_approve(id, access, target_id, clock, ctx)` against the **deleted `Access` struct** (removed D-029/D-030; `Model3D` made shared by D-032). A `⚠️` annotation was added at §3.7 (2026-05-30) flagging it as stale. Anyone implementing v1.1 Seal from spec §3.7 verbatim would gate on a struct that no longer exists.

### Converged direction (from ideation — confirm at v1.1 brainstorm)
- **Gate on the existing `NftCollectionCreatorCap`, not a new struct.** The cap is already `key`-only / soulbound (`model3d.move:242`) and is only obtained by paying the `derivative_mint_fee` in `launch_collection` (`model3d.move:625–675`) — i.e. it already *is* a soulbound paid-access receipt. `seal_approve` checks the caller holds a cap forked from this `model_id`. Re-introducing a separate L3 `Access` struct is unnecessary unless a **transferable or time-limited / subscription** access concept is wanted later.
- **Encryption is derived from `LicenseTerms.policy`, not an independent toggle** — closes the "decorative `is_encrypted`" gap:
  - `PERMISSIONLESS` → `is_encrypted=false`, base public, no Seal, no preview needed.
  - `ALLOW_LIST` → `is_encrypted=true`, `seal_approve` = holds fork cap (paid derive fee); preview required.
  - `RESTRICTED` → `is_encrypted=true`, `seal_approve` = `caller == creator`; no preview.
- **Ciphertext can stay on the existing public aggregator + `cdn.tusk3d.space`** (D-073 untouched) — Seal gates the key, not the bytes.
- **Revenue framing**: royalty (`base_royalty_bps`, Kiosk-enforced on-chain) is the *hard* rail; the fork fee is *soft* (bypassable by laundering a public L2 variant's topology — accepted as mitigate-not-prevent). Fee values stay the creator's call; the platform just offers the optional Seal lever (via policy) + sane defaults (low fork fee, royalty-primary).
- **Preview** (for `ALLOW_LIST` forkers evaluating an encrypted base): client-side `BABYLON.Tools.CreateScreenshot` stills at publish, quilted into the same Walrus blob as the Seal-encrypted master. No MP4, no backend render, no external CDN, no extra wallet popup.

### To resolve
Run a v1.1 Seal `ce-brainstorm` → `ce-plan` that locks: the `seal_approve` signature(s) per policy, the publish-flow encryption step, the preview pipeline, and whether a transferable/expiring access concept is ever needed (the only thing that would justify a separate struct over the cap). Then update spec §3.7 with the real design and capture an ADR.

### Blocker level
🟡 Open — v1.1 only; must precede any Seal code.
