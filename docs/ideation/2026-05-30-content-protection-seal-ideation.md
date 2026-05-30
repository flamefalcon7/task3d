---
date: 2026-05-30
topic: content-protection-seal
focus: NFT GLB + model GLB are public on Walrus; can Seal gate them; encrypt only model & keep NFT public; preview before purchase; how other GLB marketplaces solve it
mode: repo-grounded
---

# Ideation: Content Protection / Seal / Preview-before-purchase

> Status: ideation **converged to a concrete v1.1 direction** through discussion (2026-05-30).
> Not yet an ADR — recommended next step is `ce-brainstorm` to define the v1.1 Seal feature precisely.

## Grounding Context (Codebase)

- **Shipped v1 reality:** L1 `Model3D` = mesh-creator base content, a **shared** Sui object, `glb_blob_id` + lineage **public** on Walrus. L2 `NftToken` = forked collection variant; buyer **OWNS it outright** (tradeable, NOT soulbound), variants live in a Walrus **quilt** (one blob, N patches). `Model3D.is_encrypted: bool` exists in the Move struct but is **decorative** — only ever asserted `false` in tests; no `seal_approve` wired.
- **Read path:** public Walrus aggregator → Cloudflare Worker CDN `cdn.tusk3d.space` (D-073), no auth.
- **Seal status:** planned for **v1.1** (D-031, spec.md §3) but **not shipped**. The `Access` struct was **deleted** (D-029/R22, D-032). L1 v1 monetization = fork/derive fee (`launch_collection`) + downstream `NftToken` royalty (`base_royalty_bps`).
- **Hard constraints (past learnings):** Walrus WASM encoder OOMs between **35 MB (ok) and 46 MB (fail)** of *total* bytes per launch; chunking doesn't help. Quilting co-locates files under one blob. CORS ≠ access control; a server fronting content needs a verifiable ownership credential.
- **Industry reality (web research):** every major 3D marketplace (Sketchfab, CGTrader, TurboSquid, Fab) concedes **downloadable = copyable**; standard posture is *mitigate* (watermarked preview renders, legal terms, leak-tracing), not prevent. Seal is **mainnet-live since 2025-09**; it stops *unauthorized* access but **not** an authorized buyer ripping the decrypted mesh from browser memory.

## Topic Axes

- Encryption mechanism (Seal / alternatives: what to encrypt, `seal_approve`, key servers)
- Preview affordance (what a buyer/forker sees before paying)
- Public/private split (what stays public for NFT "social currency" vs what is gated)
- Access enforcement & ownership (authorizing decryption given a tradeable, OWNED `NftToken`)
- Hackathon scope & demo framing (6/21 vs v1.1; honest pitch around the fundamental limit)

## ⚠️ Critical Finding — Seal-plan drift (record before any v1.1 work)

`spec.md §3.7` designs `seal_approve(id, access, target_id, clock, ctx)` to check a soulbound **`Access`** receipt. That receipt **no longer exists** (deleted in D-029/R22, D-032). Today the buyer owns a **tradeable `NftToken`**, and the L1 monetized event is the **fork fee** (`launch_collection` → `NftCollectionCreatorCap`). **v1.1 must NOT copy spec §3.7 verbatim** — `seal_approve` must be redefined onto the current object graph (gate on the fork **CreatorCap** for L1, or current **NftToken** ownership for L2-if-ever-gated). Suggest also logging this in `docs/open-questions.md`.

## Converged Direction (from discussion)

**The asymmetry: encrypt L1 (conditionally), keep L2 public — but for sharper reasons than "model is secret, NFT is for show".**

| Layer | Encrypt? | Real reason |
|---|---|---|
| **L1 `Model3D` base** | ✅ Seal-encrypt **only when `policy ≠ PERMISSIONLESS`** (RESTRICTED / ALLOW_LIST) | Makes the **fork/derive fee cryptographically enforced** instead of a soft convention. Today the base GLB is public, so the on-chain fork fee is trivially bypassable (scrape base off Walrus, fork off-platform, never pay). Encryption raises the floor. **Mitigate, not prevent** — the first paying forker still gets plaintext and can re-upload. |
| **L2 `NftToken` variant** | ❌ public | Buyer pays for **ownership + on-chain provenance + gameDev integration rights** — none copyable by grabbing the GLB. User's stance: **openness invites the community to build on collections; don't block creativity.** Display wants public anyway (social currency). |

**Seal mechanism (the Sui-native shape):**
- Wire the dead `is_encrypted` flag to a real `seal_approve` that checks **live on-chain state** (fork CreatorCap for L1). Because Seal dry-runs current state, access **follows the token/cap automatically** — no re-encryption on transfer.
- **Ciphertext can stay on the existing public aggregator + `cdn.tusk3d.space`** — Seal gates the *key*, not the *bytes*. No private storage, **D-073 read path untouched**.

**Preview-before-purchase (audience = a prospective forker evaluating an encrypted L1 base):**
- **No MP4, no backend render, no external CDN.** Generate preview **client-side at publish** via Babylon `Tools.CreateScreenshot` (the creator's browser already has the GLB loaded) → a few small stills (JPEG/WebP, tens of KB). User confirmed **no interactivity needed**, so faux-turntable = cycle the stills.
- Three treatments (all client-side capturable):
  - **B — full textured stills (default):** shows the real look; pixels don't leak the usable file. *(Sketchfab "Lit" mode.)*
  - **E — clay / untextured (optional):** material swap to flat gray before capture; reveals form, withholds textures. **Only worth it if the model has textures AND you want the painted look as a purchase incentive** (a business choice, not a technical need). *(Sketchfab "MatCap" mode.)*
  - **F — part reveal (demo flourish):** hide all but one segment (uses D-047 part labels); shows one part in full as a quality proof. *(Like a stock-photo watermarked comp.)*
- **Storage:** quilt the preview stills **into the same Walrus blob as the Seal-encrypted master** at publish → one upload, **no extra wallet popup**, negligible cost (KB), shared lifecycle. Works because Seal encrypts the master's bytes *before* quilting: preview patch = plaintext/public, master patch = ciphertext/gated. Serve via existing Worker. Bonus: "everything on Walrus" decentralization story. *(Trade-off: quilt is immutable → preview can't be updated independently; acceptable.)*

**Demo & pitch (6/21):**
- **Pitch = "provenance, not prevention".** Name the fundamental limit openly (downloadable = copyable; Seal stops strangers, not authorized leaks) → reads as a sophisticated threat model, not a gap.
- **Smallest Seal slice = a live `deny → allow` beat on ONE asset**, slotted into the existing `launch_collection` fork step: a wallet without the fork cap is refused the key shares (deny); after paying the derive fee → cap → `seal_approve` passes → base decrypts and forks (allow). Tells the "fork fee is cryptographically enforced" story in one beat. For the demo, a single static hero still is enough preview — full pipeline is v1.1.

## Resolved in discussion (2026-05-30) — carried to OQ-026

**OQ-1 — gate on cap vs new L3 Access struct → RESOLVED: gate on the existing `NftCollectionCreatorCap`.**
Contract check confirmed the cap is `key`-only / **soulbound** (`model3d.move:242`) and is obtained only by paying `derivative_mint_fee` in `launch_collection` (`model3d.move:625–675`, assert `EInsufficientDeriveFee`). So the cap **already is** a soulbound paid-access receipt — `seal_approve` gates on it, **zero new struct**. A separate L3 `Access` is only justified later if a **transferable or time-limited/subscription** access concept is wanted (the cap can't express that).

**OQ-2 — fork fee vs royalty: should the platform care? → RESOLVED: we don't set the values, but we own three things the values don't decide.**
(a) which rail is structurally *hard* — **royalty** (Kiosk-enforced on-chain, uncloseable) vs *soft* — **fork fee** (bypassable while the base is public); (b) whether to **build** Seal-on-L1 at all (it's the only thing that hardens the soft lever); (c) defaults/guidance. Outcome: **provide Seal as an optional, policy-derived lever; fee values stay the creator's call; default to low fork fee + royalty-primary.** The L2-topology-leak seam is accepted as *mitigate, not prevent*.

**Policy ↔ encryption mapping (the creator picks ONE knob: the policy = the business mindset; encryption + gate + preview all auto-derive).** Encryption is **not** an independent toggle — deriving it from `policy` kills both the pointless combo (PERMISSIONLESS+encrypted) and the leaky combo (RESTRICTED+unencrypted = the original decorative-flag bug).

| `LicenseTerms.policy` | Mindset | `is_encrypted` | `seal_approve` gate | Preview |
|---|---|---|---|---|
| PERMISSIONLESS | public / max remix | false | none (plaintext base) | not needed |
| ALLOW_LIST | pay derive fee to fork+decrypt | true | holds a fork `CreatorCap` from this model | required (client-side stills) |
| RESTRICTED | creator-only / private | true | `caller == creator` | not needed |

Note: in the current fork-based arch the L1 base's only consumer is the **forker**; "pay for accessibility" = "pay the derive fee to fork", not a separate view/download sale.

## Open Seams still to carry into brainstorm

1. **L1-encrypt + L2-public leaks base topology through public variants** — a later forker can bootstrap off a public L2 variant to dodge the fork fee. Accepted as mitigate-not-prevent; severity bounded by royalty being the hard rail + provenance moat. Revisit only if a creator strategy leans hard on a high one-off fork fee.
2. **The exact `seal_approve` signature(s) per policy, the publish-flow encryption step, and the preview pipeline** are design tasks for the v1.1 Seal brainstorm (OQ-026).

## Ranked Ideas (survivors)

### 1. "Comp & Master" split — public NFT, Seal-gated high-fidelity/source master
**Description:** Keep the displayed/owned artifact public (social currency); Seal-encrypt a separate high-fidelity / source "riff-kit" master. Public artifact is a marketing funnel; paying buys the right to *use and carve further*.
**Axis:** Public/private split
**Basis:** `external:` stock-photo comp→master & fine-art print→negative economics. `direct:` "NFT is social currency, meant to display" + quilting needs separate-blob (or separate-patch) for the gated bytes.
**Rationale:** Load-bearing fork; everything else hangs off it. Refined in discussion → gate the **L1 base (riff source)**, keep L2 public.
**Downsides:** Extra preview asset; for low-poly the public "comp" must be a render, not a decimated mesh.
**Confidence:** 80% · **Complexity:** Medium · **Status:** Explored

### 2. `seal_approve` on live ownership / fork-cap (wires the dead `is_encrypted` flag)
**Description:** Real `seal_approve` checking current on-chain state (fork CreatorCap for L1). Access follows the cap/token automatically on transfer. Ciphertext stays public; CDN untouched.
**Axis:** Access enforcement & ownership
**Basis:** `direct:` `is_encrypted` decorative in `model3d.move`. `external:` Seal mainnet `seal_approve` dry-run flow; Darkblock "token-bound".
**Rationale:** Resolves the tradeable-token tension; the genuinely Sui-native answer; makes the fork fee enforceable.
**Downsides:** New scope on a 23-day clock. Alt: thin soulbound L3 Access receipt (reopens D-013-era decision).
**Confidence:** 72% · **Complexity:** High · **Status:** Explored

### 3. CDN-Worker ownership gateway — lightweight non-Seal alternative
**Description:** Extend `cdn.tusk3d.space` from cache to auth gateway: wallet-signed ownership check → short-lived signed URL. Token-gated (Ready Player Me model), weaker than Seal but ships in days.
**Axis:** Encryption mechanism
**Basis:** `direct:` existing Worker read path; `cors-is-browser-only` learning. `external:` Ready Player Me signed URLs.
**Rationale:** Frames the real fork — crypto-gate (Seal, trustless, token-bound) vs server-gate (Worker, days of work). Fallback if Seal slips.
**Downsides:** Server trust point + SPOF; dulls the decentralization story.
**Confidence:** 70% · **Complexity:** Medium · **Status:** Unexplored

### 4. Preview = client-side stills, quilted into the encrypted master's Walrus blob
**Description:** `CreateScreenshot` a few angles at publish (browser already has the GLB) → small stills → same quilt as the Seal-encrypted master. No MP4, no backend render, no external CDN, no extra popup. B (full) default; E (clay) optional; F (part reveal) flourish.
**Axis:** Preview affordance
**Basis:** `direct:` Babylon client render; OOM cliff is about the quilt total, not tiny stills; quilt = one upload = 2 popups. `external:` Sketchfab Lit/MatCap; stock-photo comp.
**Rationale:** Kills the GLB→MP4 / backend-load / storage-cost concerns the user raised; keeps everything on Walrus.
**Downsides:** Quilt immutable → preview not independently updatable; client-generated preview could misrepresent (low stakes; v1.1 server spot-check if needed).
**Confidence:** 82% · **Complexity:** Low · **Status:** Explored

### 5. "Provenance, not prevention" pitch + one-asset deny→allow Seal demo
**Description:** Lead the deck with the honest limit; scope Seal to a single live deny→allow beat inside the `launch_collection` step.
**Axis:** Hackathon scope & demo framing
**Basis:** `direct:` 23 days to 6/21, Seal mainnet-live. `external:` Sketchfab "disabling download does not really protect your content"; judges reward an owned threat model.
**Rationale:** Bounds Seal scope; converts the limit into credibility; fits the existing demo arc.
**Downsides:** Needs confident framing or reads as a gap.
**Confidence:** 82% · **Complexity:** Low · **Status:** Explored

### 6. Decrypt-time per-buyer forensic watermark (leak tracing)
**Description:** Stamp a per-`NftToken` vertex perturbation at decrypt/delivery so leaked meshes trace to the buyer; one master blob, identity injected at decrypt-time.
**Axis:** Access enforcement & ownership
**Basis:** `external:` Nagravision/OTT forensic marks; CLAUDE.md lists forensic watermark as optional v1.1. `direct:` Seal can't stop authorized redistribution.
**Rationale:** Turns prevention (unwinnable) into attribution (winnable); Sui identity makes it natively enforceable.
**Downsides:** Client-side trust boundary (modified client skips it); robust mesh watermarking is research-grade. Realistically v1.1+.
**Confidence:** 55% · **Complexity:** High · **Status:** Unexplored

## Rejection Summary

| Idea | Reason rejected |
|---|---|
| Encrypt the L1 base unconditionally | Breaks PERMISSIONLESS forking + the composable-IP thesis; must be policy-conditional |
| Encrypt the L2 NftToken | Kills social-currency display + blocks community building-on; value isn't byte-secrecy |
| Zero-file / viewer-only streaming (no GLB ever) | Only *real* prevention but kills the owned-usable-asset thesis (D-036) + heavy infra → v1.1+ |
| GLB→MP4 server-side turntable | Heavy backend render load + extra storage; replaced by client-side stills (idea #4) |
| Preview on external CDN bucket | Unnecessary 2nd hosting system; quilt-with-master on Walrus is cheaper + no extra popup |
| Decimated preview GLB (簡化 model) | No-interactivity makes a GLB pointless; for Tripo low-poly there's little to decimate; pixels suffice |
| Revocation set in `seal_approve` (festival wristband) | Marginal for hackathon → v1.1 note |
| Re-introduce full L3 Access struct | Heavier than gating on CreatorCap; folded into idea #2 as the alternative |
| "Infinite-Walrus" north-star thought experiment | Framing exercise, not actionable |
| Per-variant independent gating inside the L2 quilt | Quilt co-locates patches under one blob; can't gate within it |
