---
date: 2026-06-01
topic: paid-access-entitlement-split
---

# Paid Access Entitlement — split fork into "buy access (once)" + "launch (per-time)"

## Summary

Split today's single fork fee into two paid actions: a **one-time access purchase** on an L1 `Model3D` (mints a soulbound, permanent access entitlement that grants Seal decryption), and a **per-launch derive fee** when an NFT creator launches a collection from a base they have access to. The same entitlement serves both a consumer who pays to view/use the premium model and a creator who needs decrypt access to fork. Decrypt gating moves from the per-collection cap to the entitlement (a fresh contract republish), reviving the "buyers pay to access premium 3D content" Walrus/Seal story.

---

## Problem Frame

The shipped economic model bundles "access to decrypt a base" into the per-collection fork cap: the only way to decrypt an encrypted base is to call `launch_collection`, which charges the derive fee and mints a cap. That coupling produces two concrete pains. (1) A creator who already paid to fork a base is charged **again** every time they want to launch another collection from it — and is charged just to *preview* the base, because preview needs the plaintext and the plaintext needs a paid launch. (2) There is **no consumer path** to pay-to-view a premium base at all — the documented "N buyers pay access" model (CLAUDE.md L1/L2/L3, spec §3.7) was dropped when the Seal work (D-074/075/076) folded access into the cap; the architecture docs still describe a paid-access layer that the code does not implement. The cost lands on the exact moment a creator returns to a base they've already paid for, and on the absent audience of buyers who would pay to access content but have nowhere to do so.

---

## Actors

- A1. **Mesh creator (L1)**: publishes a `Model3D`, sets its policy and (for encrypted policies) the access fee + the per-launch derive fee.
- A2. **Access buyer / consumer**: pays the access fee on a specific base, receives a soulbound entitlement, and can thereafter view/use that base in-app (no download).
- A3. **NFT creator (forker)**: holds an entitlement for a base (or uses a public base) and launches collections from it, paying the derive fee per launch and minting NftTokens.
- A4. **NFT collector**: buys/owns/resells NftTokens on the secondary market (unchanged).

A2 and A3 may be the same wallet — one entitlement satisfies both viewing and the fork precondition.

---

## Key Flows

- F1. **Purchase access**
  - **Trigger:** A2/A3 chooses to unlock a specific encrypted base (from its detail page).
  - **Actors:** A2/A3, A1 (fee recipient)
  - **Steps:** pay the access fee → a soulbound entitlement for that base is minted to the buyer → access fee routes to the mesh creator.
  - **Outcome:** the buyer permanently holds decrypt access to that base; they never pay the access fee again for it.
  - **Covered by:** R1, R2, R3, R8

- F2. **Consumer view after purchase**
  - **Trigger:** an entitlement holder opens the base's detail page.
  - **Actors:** A2
  - **Steps:** the app decrypts the base client-side using the entitlement → renders it in the in-app viewer. No raw-file download is offered.
  - **Outcome:** the buyer can inspect/use the real mesh in-app; the protected file is never handed over.
  - **Covered by:** R6, R7

- F3. **Launch a collection from an accessible base**
  - **Trigger:** an entitlement holder (or anyone, for a public base) starts a launch.
  - **Actors:** A3
  - **Steps:** decrypt the base for free using the entitlement → author variants live on the real mesh → pay the derive fee → mint the collection's NftTokens.
  - **Outcome:** a new collection + tokens exist; the derive fee is charged once for this launch; no access re-charge.
  - **Covered by:** R4, R5, R9

- F4. **Accessible-models catalog on /launch**
  - **Trigger:** A3 opens /launch.
  - **Actors:** A3
  - **Steps:** the page lists the bases the wallet can launch from — bases it holds an entitlement for, plus public bases — and excludes bases it has no access to.
  - **Outcome:** the creator only sees launchable bases; encrypted bases without an entitlement are not offered for launch.
  - **Covered by:** R10

---

## Requirements

**Access entitlement**
- R1. A buyer can purchase access to a specific encrypted base; on payment they receive a **soulbound, non-transferable** entitlement bound to that base.
- R2. The entitlement is **permanent and one-time**: holding it grants unlimited future decryption/preview of that base, and the access fee is never charged again for the same (wallet, base).
- R3. Decryption authorization (Seal `seal_approve`) is gated on **holding the entitlement** for the base, not on holding the per-collection cap. The cap remains the collection's authority object (register fee / integrations) but no longer gates decryption.

**Two-fee model**
- R4. The mesh creator sets two independent prices on an encrypted base: a one-time **access fee** and a **per-launch derive fee**.
- R5. Launching a collection charges the **derive fee each time**; it does **not** re-charge for access. A creator with an entitlement can launch unlimited collections from that base, paying only the derive fee per launch.
- R8. For encrypted (ALLOW_LIST) bases the **access fee must be > 0** (it is the pay-to-access gate). The per-launch derive fee is the creator's choice and **may be 0**.

**Consumer view**
- R6. An entitlement holder can view/use the decrypted base in the in-app viewer from the base's detail page.
- R7. The consumer view never exposes a raw-file download or copyable plaintext link; decryption is in-app render only (preserves the encryption value).

**Launch flow + catalog**
- R9. Launching from an encrypted base requires holding its entitlement; the live "author variants on the real mesh" flow decrypts for free via the entitlement (no paid launch needed to preview).
- R10. /launch presents a catalog limited to bases the wallet can launch from: bases it holds an entitlement for, plus public (PERMISSIONLESS) bases. Encrypted bases without an entitlement are excluded from the launch catalog (but remain purchasable from their detail page).

**Policy scoping**
- R11. Access purchase applies only to **ALLOW_LIST** (encrypted, pay-to-access) bases. **PERMISSIONLESS** bases are public — free to launch, no entitlement needed, no consumer access purchase. **RESTRICTED** bases stay creator-only — not purchasable, only the creator can decrypt/launch.

**Migration**
- R12. The change ships as a fresh contract republish (next version). Existing prior-version models are left behind on testnet; no on-chain migration of old models is required.

---

## Acceptance Examples

- AE1. **Covers R2, R5.** Given a wallet that bought access to base X and already launched one collection from it, when it returns to launch a second collection, then it pays only the derive fee — the access fee is not charged again.
- AE2. **Covers R8.** Given a creator publishing an ALLOW_LIST base, when they set the access fee to 0, then publish is rejected (access fee must be > 0); when they set the per-launch derive fee to 0, then publish is accepted.
- AE3. **Covers R3, R9.** Given a wallet that holds base X's entitlement, when it opens the launch authoring flow, then the base decrypts and renders live without any payment at that step.
- AE4. **Covers R10, R11.** Given a wallet with an entitlement for encrypted base X but none for encrypted base Y, when it opens /launch, then X appears in the catalog and Y does not; public base Z appears regardless.
- AE5. **Covers R7.** Given a consumer who bought access to base X, when they view it on the detail page, then the mesh renders in-app and no download/export of the file is offered.
- AE6. **Covers R11.** Given a RESTRICTED base, when a non-creator wallet visits its detail page, then no "buy access" action is offered.

---

## Success Criteria

- A creator who has paid for a base is never charged to preview it again, and pays only the per-launch derive fee for additional collections — confirmed by a real wallet running F1→F3 twice.
- A consumer can pay once and thereafter view a premium base in-app, with no way to extract the file — reviving a demonstrable "pay-to-access premium 3D content" story for the Walrus-track pitch.
- ce-plan can sequence the contract change (entitlement struct, purchase entry, seal_approve migration, two-fee license terms) and the three UI surfaces (buy-access on detail, consumer view, /launch catalog) without having to invent product behavior, fee semantics, or policy scoping.

---

## Scope Boundaries

### Deferred for later

- Transferable, time-limited, or subscription access. The entitlement is soulbound and permanent for v1; resellable or expiring access is a later concept.
- The frontend-only "cap-reuse" stopgap (previously floated) — superseded by the real entitlement model; not built.

### Outside this product's identity

- Changing the royalty rail (`base_royalty_bps` on NftToken resale) — unchanged.
- Changing the register fee / integration economics — unchanged; the cap keeps owning those.
- Multi-layer derivation (forking a derivative) — still capped at 1 layer.
- A separate "access marketplace" / discovery surface beyond the existing browse + model detail pages.

---

## Key Decisions

- **Access is an entitlement on L1, not a third tier.** Re-label the architecture "L1 Model3D + access entitlement + L2 Collection/NftToken"; drop the "L3 Access" framing. Rationale: access is a direct relationship with the base (and a precondition to forking), not something stacked on derivatives — the old L3 numbering misrepresents it.
- **One entitlement serves consumers and creators.** Same soulbound receipt gates both in-app viewing and fork eligibility. Rationale: stronger pitch (revives "N buyers pay access") at near-zero extra cost; avoids two parallel access concepts.
- **Access fee is the pay-to-access gate (>0 for ALLOW_LIST); derive fee is per-launch and may be 0.** Migrates D-076's "ALLOW_LIST ⇒ fee > 0" from the derive fee to the access fee. Rationale: the access purchase is now the thing that must cost something for an encrypted base; per-launch pricing becomes the creator's lever.
- **Decrypt gate moves from the cap to the entitlement; cap stays for collection authority.** Partially reverses D-074/075/076. Rationale: decoupling access from launching is the whole point; the cap still legitimately owns register-fee/integration.
- **Ship full scope for 6/21 including the consumer view flow**, accepting the contract republish + three UI surfaces against the ~20-day window.

---

## Dependencies / Assumptions

- Requires a fresh Sui Move republish of `model3d::model3d` (new version) — the decrypt-gate and license-terms changes are not a compatible upgrade.
- Reuses the just-built "unlock-first" live variant authoring; only the decrypt gate (cap → entitlement) and the payment split change.
- Entitlement ownership is queryable on-chain by (wallet, base) for the /launch catalog and the buy/view gating (owned-objects-by-type pattern already used elsewhere in the app — verified against existing owned-object queries).
- PERMISSIONLESS bases are unencrypted (verified) — they need no entitlement and no decrypt.

---

## Outstanding Questions

### Resolve Before Planning

- (none — the scope-shaping product decisions were resolved in this brainstorm.)

### Deferred to Planning

- [Affects R1, R3][Technical] Exact shape of the entitlement object and how `seal_approve` verifies (wallet, base) ownership — likely mirrors the prior `seal_approve` design that referenced the removed Access struct (spec §3.7), now revived.
- [Affects R8][Technical] Where the two fees live on the license terms and how publish-time validation enforces "access fee > 0 for ALLOW_LIST".
- [Affects R10][Technical] Whether the /launch catalog reads entitlements via owned-objects-by-type + a base-id join or via events; both are available — pick during planning.
- [Affects R2][Needs research] Confirm that holding the entitlement is sufficient for the Seal key-server dry-run with no per-collection object, so a consumer who never launched can still decrypt.
