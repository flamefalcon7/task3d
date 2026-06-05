# 90-Second Demo Recording Script

> ⚠️ **STALE — needs a full rewrite before recording (2026-06-05).** This shot-list was written for the retired Phase-3 architecture and DOES NOT match the shipped app. Do not record against it as-is. Specifically:
> - **No `/forge` route.** The flow is now `/create` (carve + mint L1 `Model3D`) → `/model/:id` (buy soulbound `AccessEntitlement`) → `/launch` (fork into an L2 `NftCollection` + `NftToken`s) → `/track` (drive). "Collection Forge" no longer exists as one screen.
> - **No `Collection`/`Access` types.** Architecture is L1 `Model3D` + `AccessEntitlement` → L2 `NftCollection` + `NftToken` (D-078). "L3 Access" is retired.
> - **Stale package + tx.** The B-roll cites tx `8gKrqemFV…` / package `0x18a480b3…` (Phase-3). Live package is **v12 `0xbf0affb8…02d1`** — re-capture all on-chain proof shots.
> - **Seal is now shipped** — the demo can show encrypted-base → entitlement → decrypt, which it currently doesn't.
>
> **Locked demo config (2026-06-05):** Tripo prompt-mode **ON** (Beat 1 = live prompt → base car; pre-bake to cut the 60–180s wait) · **4 variants** (fits one Walrus quilt) · **Seal ON** — publish the base as an encrypted `allow_list` model so the demo can show the locked-ciphertext → buy → entitlement-decrypt → render beat. Honest wallet-interaction counts: `/create` ~5 · buy access 1 · Seal unlock 1 · `/launch` 4 (encrypted fork is a 2-step on-chain flow). Do NOT claim "3 signatures." Re-capture all on-chain proof shots against v12 `0xbf0affb8…02d1`.
>
> Everything below is kept for its still-valid *production* guidance (what to cut, what not to show, editing/export notes), not its flow.

---

Phase 3 e2e demo for Sui Overflow 2026 submission. The full mint → browse → buy → drive arc through the Collection Forge + Tiny Racetrack apps.

**Total target: 90 seconds.** Tight, no dead air.

---

## Pre-recording setup checklist

- [ ] Backend + frontend running (`pnpm dev` from repo root)
- [ ] Wallet A connected with ~5 testnet SUI (`0x3116881ca3ebeb80f4ec82f1f11572d6341875d6c3f2cbeaf6990fb5723591ed`)
- [ ] Wallet B is a fresh keypair with ~5 testnet SUI from the faucet (write its address down somewhere visible)
- [ ] `backend/.env` has `TRIPO_ENABLED=true` + valid `TRIPO_API_KEY` (otherwise Forge prompt step 404s)
- [ ] Browser zoom level reset (Cmd+0); single tab; no devtools open in recording
- [ ] macOS screen recorder: Cmd+Shift+5 → "Record Selected Portion" → drag tight around browser viewport
- [ ] Audio: optional voiceover or post-edit narration
- [ ] Sui Explorer ready in a separate tab for post-mint verification — open https://suiscan.xyz/testnet

---

## Shot list (90 sec)

### Beat 1 — Hook & Forge mint (0:00 – 0:30, ~30 s)

| Time | What's on screen | Voiceover / caption |
|---|---|---|
| 0:00 | Browser at `/forge` with Wallet A connected | "A creator publishes a 16-variant car collection in three wallet signatures." |
| 0:03 | Type prompt: *"futuristic racing car, low-poly, neon accents"* | (cut to next moment; don't show full Tripo wait) |
| 0:05 | Base car renders in preview | "Tripo generates the base mesh on Walrus." |
| 0:08 | Add 4-5 variant rows. Quickly pick a colour + texture for each. | "The creator picks colours and textures — no Blender, no Photoshop." |
| 0:15 | Click **Mint** | "All 5 variants are material-swapped server-side, batched into a single Walrus quilt, and minted in one Sui PTB." |
| 0:18 | Wallet popup 1 (Walrus register) → Approve | "Sign 1 of 3: register the quilt blob." |
| 0:22 | Wallet popup 2 (Walrus certify) → Approve | "Sign 2 of 3: certify storage." |
| 0:26 | Wallet popup 3 (Sui PTB) → Approve | "Sign 3 of 3: one transaction mints the Collection + 5 Model3D objects on Sui." |
| 0:29 | Success screen with link to `/collection/<slug>` | "Done. 5 variants, one mint." |

**Cut:** if Tripo takes 60+ sec, recording cuts to a pre-generated base GLB swap; we'll splice the wait out in post.

### Beat 2 — Browse & buy as Wallet B (0:30 – 0:55, ~25 s)

| Time | What's on screen | Voiceover / caption |
|---|---|---|
| 0:30 | Switch wallet → Wallet B (fresh keypair) | "A different buyer arrives." |
| 0:33 | Browse page `/` — see the new "Neon Drift" collection card with "5 variants" badge | "The marketplace groups variants by collection. One card per series." |
| 0:38 | Click card → `/collection/<slug>` — 5 variant tiles | "All 5 paint jobs from one Walrus quilt." |
| 0:43 | Click variant #3 (red-metallic, say) → `/model/<id>` | "Pick the one you like." |
| 0:47 | Click **Buy Access** → single wallet popup → Approve | "One signature buys a soulbound Access NFT." |
| 0:52 | Success — Access NFT visible in wallet panel | "Owned." |

### Beat 3 — Drive at /track (0:55 – 1:25, ~30 s)

| Time | What's on screen | Voiceover / caption |
|---|---|---|
| 0:55 | Navigate to `/track` | "What can the buyer do with what they own?" |
| 0:58 | Car carousel shows variant #3 — click to load | "Load any owned variant…" |
| 1:02 | Babylon scene boots, red-metallic car appears on the oval track | "…into a Havok rigid-body racing scene." |
| 1:06 | Press **W** — car accelerates forward, chase camera follows | "WASD drives." |
| 1:12 | Steer with **A** / **D**, hit a wall, car bounces and stops | "Wall collisions are physical." |
| 1:18 | Free-form drive for ~5 sec | "This is the same Walrus blob that minted on-chain — loaded directly into the game." |
| 1:25 | Closing frame: brand mark + tagline | "Collections become games. The whole loop in 90 seconds." |

---

## Optional B-roll (for editor pass)

If we need to fill / pad / cut tighter:

- **Sui Explorer split-screen** at 0:28: the actual `8gKrqemFVcAeBr3rifQurRDGuSF7pm2Yp44wXo15Kv5A` digest's "Created Objects" panel showing 1 Collection + 5 Model3Ds + 1 Access in the buyer flow
- **Walrus aggregator URL** highlight at 1:02: browser devtools Network tab showing `/v1/blobs/by-quilt-patch-id/...` returning 200 + GLB bytes (proves Walrus is the source of truth)
- **`useWalrusUpload` console log** at 0:18: showing `patchIds[]` with 5 entries sharing one `blobObjectId` (proves quilt batching is real)

---

## Captions (for accessibility + silent autoplay on Twitter / LinkedIn)

Burned-in captions matching the voiceover above. Default to bottom-third white text on black bar, 24px sans-serif.

If we record with no voiceover, captions become primary — make them more present (full sentences, not phrases).

---

## What NOT to show

- ❌ Devtools console (looks unprofessional)
- ❌ Wallet sign popups with sensitive info visible (just enough for the user to recognize the flow — pan past private detail)
- ❌ Backend logs or terminal — keep the pitch consumer-facing
- ❌ The 60-120 sec Tripo wait — cut it
- ❌ Loading spinners > 2 sec — cut them
- ❌ The "Failed to fetch" + sign-in error states we hit during dev (those got fixed; not part of the story)

---

## Post-recording editing notes

- Trim to **90 sec** total — anything longer loses people
- Background music: light electronic / lo-fi at -20 dB so voiceover sits on top cleanly
- Export: 1080p H.264 MP4, file under 50 MB for Discord/Twitter
- Save raw recording as `pitch/demo-recording-raw.mov`; edited cut as `pitch/demo-recording.mp4`
- Upload to YouTube (unlisted is fine for submission) and put the URL in `README.md` "Submission details"

---

## After the recording, capture for the submission

1. **Sui Explorer screenshots** — open at https://suiscan.xyz/testnet for:
   - The Forge mint tx (1 Collection + N Model3Ds created)
   - The Buy Access tx (1 Access NFT)
   - Save to `pitch/screenshots/forge-mint.png` + `buy-access.png`
2. **Tx hashes** — paste into `docs/phase-progress.md` under a new "Phase 3 e2e capture" section
3. **PackageID confirmation** — confirm `VITE_MODEL3D_PACKAGE_ID` from `frontend/.env.local` matches the on-chain `0x18a480b3...`
4. Open a PR (or push to main) with the demo video URL filled into `README.md` Submission details
