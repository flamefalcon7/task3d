# Tusk3D — Demo Recording Script

Submission cut for **Sui Overflow 2026 (Walrus track)** — up to **5 min** (the rule). A ~90s "hook" cut is derived from this (see bottom).

**Story spine (this is the whole point — NOT a feature tour):** one protagonist (an indie game dev), one asset's *life*, framed by the **intermediary-chokepoint** problem. The 6 capabilities show up as plot beats because the story needs them, not as a checklist. See the office-hours design doc (`~/.gstack/projects/overflow2026/…-design-…md`) and `docs/brainstorms/2026-06-05-problem-evidence-centralized-3d-platforms.md`.

---

## Locked config (2026-06-05)

- **Tripo prompt-mode ON** — Act 1 shows a live prompt → base asset. Pre-bake the base; cut the 60–180s wait.
- **4 variants** — fits one Walrus quilt.
- **Seal ON** — base published as an encrypted `allow_list` model (locked → buy → entitlement-decrypt → render beat).
- **Personal + global MemWal recall** — both shown. **Pre-recorded** (relayer is beta).
- **gameDev integration beat (Act 3) INCLUDED** — reframed as "collection = content + audience," not dry B2B licensing.
- All on-chain proof shots against **v12 package `0xbf0affb8…02d1`** (NOT the retired `8gKrqemFV…`).

## Actors / wallets

- **A — the protagonist indie dev.** Creator + buyer + forker + token holder + driver. Carries the whole story.
- **C — a second studio** (Act 3 "scaled" case only — rides a hyped collection). Optional; cut to keep it tight.

3 wallets if showing the scaled Act 3; 1–2 if main-case only.

---

## Shot list (story, ~3:30–4:15)

### Cold open — the problem (0:00–0:20)
- On screen: a "PLATFORM CLOSED / 404" frame over fading 3D-asset thumbnails. Captions: *"2021 — Google Poly shut down. Thousands of creators' 3D work: gone."* → *"2026 — FlippedNormals closes. Storefronts and income: gone."*
- Line: *"Every 3D asset you make lives or dies inside someone else's company. So we built one where the asset outlives the platform — and pays everyone who builds on it."*

### Act 1 — generate + own (the wedge) (0:20–1:30)  · caps #1 #2 #3 #4
- A is an indie dev who needs an asset and **can't find it**. Opens `/create`.
- **MemWal beat (pre-recorded):** types a vague prompt → *"Recalling from Walrus memory…"* → personal recall chips (A's past creations) + Community Recall (others'). Caption: *"Your creative memory + the community's, on Walrus — not our server."* [#4]
- **Generate (Tripo):** prompt → base asset. (Pre-baked; cut the wait.) [#1]
- **Monetize + publish:** A sets `LicenseTerms` (access_fee + derivative_mint_fee + royalty), policy = **allow_list (encrypted)**. [#2] Seal-encrypts → Walrus → `publish` a shared `Model3D`. [#3]
- **The Walrus-necessity beat:** *"Now it's hers. On Walrus, enforced by Sui. No platform can delete it, un-publish it, or change the terms on her."*
- Proof shot: the v12 publish tx on Sui Scan.

### Act 2 — the asset comes alive (the economy) (1:30–2:30)  · cap #5
- A second creator **buys access** to A's base (`/model/:id`): it's **locked** (ciphertext — flash the Network tab returning encrypted bytes), pays `access_fee` → soulbound `AccessEntitlement` → **Seal unlock** → mesh decrypts & renders. [Seal payoff]
- That holder **forks** it (`/launch`): picks **4 paint-variants** → 1 Walrus quilt → `NftCollection` + 4 tradeable `NftToken`s. [#5]
- A **earns on every fork** (derive fee, enforced on-chain). Caption: *"A remix economy — with rails. The original creator earns each time someone builds on her work."*
- Proof shot: v12 launch tx — 1 quilt blob + 4 tokens.

### Act 3 — content + audience (AI-era indie devs) (2:30–3:30)  · caps #6b #6a
- Setup: *"AI just crashed the cost of building games. A wave of indie devs — each short on two things: content, and players."*
- **Main (same protagonist):** A wires the collection into **her own game** (`/integrate` → `/track`). Holders find their NFT usable in-game; she adds real utility to a community she's part of, and **those holders become her first players.**
- **Scaled (one line / optional C):** another studio rides a *hyped* collection — pays to integrate it (`register_fee`) and **converts existing holders into players.** [#6b] On-chain holdings are verifiable, so the game can gate/reward by ownership — a web2 game can't.
- **Drive (`/track`):** a player drives the car they **own**, loaded from the same Walrus quilt patch. Havok physics, wall bounce. [#6a]
- Framing guard: mutual value (game gets audience, holders get utility) — NOT clout-chasing.

### Close — back to the problem (3:30–4:00)
- Recap the money flow (access → fork → integrate) and the "4 Walrus capabilities" (blobs · quilt · Seal · MemWal).
- Line: *"Poly proved free means no income. FlippedNormals proved sell-once-and-pray. Tusk3D puts the asset on Walrus and the rules on Sui — so when the platform's gone, your work and your income keep running themselves."*
- Brand mark + tagline (Carve · Mint · Riff). v12 proof montage.

> Exact screens + timing need one live walkthrough of `/create → /model → /launch → /integrate → /track` to lock frame-by-frame. This skeleton is story + capability + pre-record flags.

---

## 90-second hook cut (derived, for social / top-of-funnel)

= **Cold open** + compressed **Act 1** (generate → own) + the **drive** from Act 3. Lead with the visceral payoff; skip the economy detail. Same footage, tighter.

---

## What NOT to show

- ❌ Devtools console (except the 1-sec encrypted-bytes proof in Act 2)
- ❌ Wallet popups with sensitive detail — pan past private info
- ❌ Backend logs / terminal
- ❌ The 60–180s Tripo wait — cut it (pre-baked base)
- ❌ Loading spinners > 2s
- ❌ Stale `8gKrqemFV…` / `0x18a480b3…` proof — use **v12 `0xbf0affb8…02d1`**

## Pre-record / pre-bake checklist

- Wallets A (+ C if scaled Act 3) funded with testnet SUI; `TRIPO_ENABLED=true` + key + Tripo credits in budget
- Base asset **pre-generated** before recording; cut the wait
- **MemWal recall pre-recorded** (beta relayer — don't gamble live); Seal can run live
- (Optional) clean demo MemWalAccount + pre-seeded personal/global recall — deferred; decide before recording
- Browser zoom reset (Cmd+0), single tab, no devtools (except the proof beat)
- Consider **Screen Studio** for auto-zoom polish

## Editing & export

- Submission cut ≤ 5 min; derive the 90s hook from it
- **Descript** for transcript-edit + auto-captions; light lo-fi music bed at −20 dB
- 1080p H.264 MP4; raw → `pitch/demo-recording-raw.mov`, edited → `pitch/demo-recording.mp4`
- Upload YouTube (unlisted OK) → URL into `README.md` Submission details

## On-chain proof to capture (v12)

1. Act 1 publish tx (shared `Model3D` created)
2. Act 2 buy-access tx (soulbound `AccessEntitlement`) + launch tx (1 quilt blob + 4 `NftToken`)
3. Act 3 `register_integration` tx (`IntegrationRecord`)
- All on `https://suiscan.xyz/testnet/...` against package `0xbf0affb8…02d1`. Save to `pitch/screenshots/`.
