# Problem Evidence — Centralized 3D Asset Platforms Fail Creators

Competitive / problem-framing note for pitch deck (Slide 2) + product.
Compiled 2026-06-05. Feeds the "intermediary chokepoint" problem framing
(office-hours design doc, 2026-06-05).

## Thesis

Centralized 3D asset platforms are intermediary chokepoints: one company owns the
assets, the payment rails, and the licensing rules. That single chokepoint fails
both sides of the market. The platform itself can disappear (taking the work AND
the income with it), and even while alive its revenue model gives creators no
durable, enforceable stake in downstream reuse. Tusk3D removes the chokepoint by
putting the asset on Walrus and the royalty rules in a Sui Move contract —
platform-independent and strip-proof.

> Why this is a Walrus problem specifically: a web2 platform structurally CANNOT
> promise an asset survives the company's own death — it can always die or change
> terms. Only decentralized storage (Walrus) + on-chain rules (Sui) can.

## Case 1 — Google Poly (2017–2021): no revenue at all

Google's 3D model sharing platform. Native format glTF/GLB — the exact format
Tusk3D mints — so the analogy is direct.

**Shutdown timeline**
- 2020-12-02 — shutdown announced
- 2021-04-30 — read-only (uploads disabled)
- 2021-06-30 — entire site AND APIs permanently offline
- Aftermath — creators' work described as "irreplaceable / cultural-museum level";
  only partially saved by volunteer Archive Team efforts

**Revenue / royalty flaws**
- Zero creator income. Purely free-to-share; uploading = pure donation.
- CC-BY only buys attribution, not money. Anyone could reuse commercially with
  credit; the reuser could earn, the original creator got nothing downstream.
- Even the attribution was weak: CC-BY credit has no technical enforcement; once
  re-exported / re-uploaded, the credit is trivially stripped.

One line: no upstream income, no downstream cut — only a credit line that is easy
to remove.

## Case 2 — FlippedNormals (closing 2026): generous split, broken structure

A 3D marketplace hosting assets from ~3,500 creators (models, brushes, training).
RECENT — strong "still happening today" evidence.

**Shutdown timeline**
- 2026-03-31 — marketplace closes
- 2026-04-30 — last day buyers can download what they already paid for
- Reason — rising cost of running the store + falling earnings (a DEMAND problem:
  not enough buyers)

**Revenue / royalty flaws (the split % is good — the STRUCTURE is the problem)**
- Split is generous: 75% to creator on platform-driven sales, 95% on their own
  direct-sale links. Not the issue.
- One-time sale, no resale / derivative royalty. Sold once = done. Buyer resells
  or builds a derivative and sells THAT → original creator earns nothing further.
- Income is 100% bound to the platform's survival. Platform closes → storefront,
  direct-sale links, payment rails all vanish → future income to zero.
- Payout fees on top; terms set unilaterally, possible retroactive change.

One line: the percentage looks great, but income is one-time + bound to platform
lifespan + no derivative royalty — platform dies, cashflow dies.

## How Tusk3D answers each flaw

| Flaw | Poly | FlippedNormals | Tusk3D |
|---|---|---|---|
| Upstream income | none | yes (75/95%) | `access_fee` — pay once, soulbound `AccessEntitlement` |
| Derivative / secondary royalty | attribution only (strippable) | sold once, no further cut | `derivative_mint_fee` enforced on-chain at fork; `base_royalty_bps` snapshot ≤ 30%, can't be stripped |
| Survives platform shutdown? | no — site + API gone | no — cashflow to zero | yes — Sui contract + Walrus storage keep running regardless of front-end |
| Can rules be changed on the creator? | n/a | yes — platform-controlled | no — `LicenseTerms` locked on-chain |

**Enforcement precision (do NOT overclaim):** the derive fee is collected by the
contract at `launch_collection` (shipped). Secondary `NftToken` resale royalty
depends on Kiosk + `TransferPolicy` (roadmap), and even then only compliant
markets enforce it. State both honestly.

## Pitch line

Poly proved "free means no income." FlippedNormals proved "sell once, bound to the
platform." Tusk3D writes the royalty into a Sui contract and puts the asset on
Walrus — so when the platform is gone, your income rules are still running
themselves.

## Sources

- Google Poly — Archive Team wiki: https://wiki.archiveteam.org/index.php/Google_Poly
- Google shutting down Poly — TechCrunch: https://techcrunch.com/2020/12/02/google-shutting-down-poly-3d-content-platform/
- Remixing and Creative Commons — Poly Help: https://support.google.com/poly/answer/7418679?hl=en
- FlippedNormals closing 31 March — CG Channel: https://www.cgchannel.com/2026/03/flippednormals-is-closing-its-online-marketplace-on-31-march/
- How much do I earn per sale — FlippedNormals Help: https://help.flippednormals.com/article/13-how-much-do-i-earn-per-sale
- Earn 95% when you sell — FlippedNormals Blog: https://blog.flippednormals.com/earn-95-when-you-sell-on-flippednormals/
- Terms of Service — FlippedNormals: https://flippednormals.com/terms-of-service
