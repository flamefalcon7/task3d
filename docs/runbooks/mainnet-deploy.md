# Mainnet Deploy Runbook

**Status:** Live operating procedure (post-7/22 execution window)
**Owner:** A4 (1-dev team, the user)
**Window:** 7/22 ≤ execution ≤ 8/26
**Hard deadline:** 8/27 (Sui Overflow 2026 winners date — see D-009, D-028)
**Origin:** Extracted from `docs/brainstorms/2026-05-19-phase-4-kiosk-race-on-mint-requirements.md` during ce-doc-review round 1 (R15 / F3 / AE5 are post-Phase-4 content that belonged in a runbook, not a requirements doc).

---

## Purpose

Phase 4 ships the pre-baked mainnet deploy script + placeholder config (R13 + R14 of the requirements doc). This runbook governs **when and how to execute the script**, including the milestone gate, the bug severity matrix, the WAL acquisition timing, and the decision rule when the milestone isn't met by 8/26.

The execution work is NOT Phase 4 scope. Treat this runbook as the source of truth for the 7/22–8/27 window.

---

## Execution gate (milestone, not date)

Mainnet deploy execution requires the Phase 4 Kiosk demo to pass a stability threshold on testnet before any real-WAL spend on mainnet. Calendar-based shipping (e.g., "deploy on 8/26 no matter what") is rejected per D-028 (supersedes D-009's implicit calendar gating).

### Trigger condition

Mainnet deploy fires when ALL of the following hold:

- **≥ 20 distinct testnet session recordings** of the complete purchase→drive arc (initial wallet connection → mint+place+list by Tom → purchase by Marcus → model spawn in `/track`)
- **≥ 10 unique buyer addresses** across those 20 sessions (prevents the user from gaming the count by re-using the same wallet 20 times)
- **Zero P0 bugs** observed across the 20 sessions (see bug severity matrix below)
- **Zero overlay render timeouts > 2s per AE3** of the requirements doc
- **Zero racetrack scene mount failures** after auto-navigation from the purchase flow
- Sessions logged to a Phase 5 test report (`docs/reports/phase-5-testnet-soak.md`) with timestamps and tx hashes

### Test address sourcing

- 5 self-operated (user's own wallets — sufficient to prove the happy path under controlled conditions)
- ≥ 5 external testers recruited via Sui Discord / Twitter / community channels
- 1-week recruitment window starts **7/15** (one week before earliest execution date)

### Earliest / latest execution dates

- **Earliest:** 7/22 — gives 1 week of soak time after the 7/15 tester recruitment opens
- **Latest:** 8/26 — one-day buffer before 8/27 winners date

---

## Bug severity matrix

When testnet soak surfaces bugs between 7/22 and 8/26, classify each before deciding to deploy:

| Tier | Definition | Mainnet decision |
|---|---|---|
| **P0** | Funds lost, wallet stuck, royalty paid to wrong recipient, KioskOwnerCap bypass exposes royalty leak, mainnet contract state corruption | **MUST defer mainnet.** Accept missing 8/27 eligibility per D-028. |
| **P1** | 1-in-N reliability failure (e.g., subscribeEvent drops 1 in 50), wrong-but-recoverable behavior, overlay misfires on unrelated events, demo flow recoverable via Retry | **Ship with documented known-issue** in README + a `KNOWN-ISSUES.md` entry. Mainnet deploy fires. |
| **P2** | Cosmetic drift, non-load-bearing overlay timing, browse sort fragility under empty state | **Ship without comment.** Mainnet deploy fires. |

The matrix is the on-the-day decision support — without it, the user argues with themselves at 11pm on 8/26. With it, the answer is mechanical.

---

## WAL acquisition timing

Mainnet Walrus operations require real WAL tokens (no faucet). The CEX → bridge → DEX swap pipeline has multiple counterparty risks; failing this on 8/26 leaves the deploy stranded with no recovery window.

**Hard milestone:** WAL acquired and verified in the deploy wallet by **8/19** (8 days before 8/27).

### WAL acquisition path (researched 7/15–7/22)

The exact path is to be documented here during the 7/15 research week. Skeleton:

1. **CEX selection** (e.g., Binance, Bybit, OKX — verify WAL listing + withdrawal-to-Sui support at 7/15)
2. **KYC + funding** — fund SUI on the chosen CEX with enough margin for slippage; allow buffer for withdrawal holds (24–72h depending on CEX policy)
3. **Withdraw SUI to deploy wallet** — verify the deploy wallet's Sui address before withdrawal (sanity check: send 0.1 SUI test first)
4. **Swap SUI → WAL** on Suilend, Bluefin, or Cetus (research the deepest-liquidity venue at 7/15; check slippage budget)
5. **Verify WAL balance** in the deploy wallet (target ≥ 10 WAL for hackathon demo + buffer)
6. **Test write** — spend a small amount of WAL on a throwaway mainnet Walrus blob to verify the relay + Walrus contract paths work with the deploy wallet's signer

**Failure modes to plan for** (each fills a contingency slot in the runbook):
- CEX withdrawal hold (KYC trigger, large-amount trigger) → 24–72h delay
- DEX low liquidity → slippage > 5%, may need to split into N smaller swaps
- Bridge failure (if using a bridge) → retry on alternate bridge
- Wrong address withdrawal → unrecoverable; the 0.1 SUI test prevents this

---

## Pre-bake (Phase 4) — what's already ready

Per R13 + R14 of the requirements doc, by 6/20 the repo contains:

- `scripts/deploy-mainnet.{ts|sh}` — idempotent deploy automation
- `networks/mainnet.json` — placeholder static network config (committed with empty PackageID/UpgradeCap/TransferPolicy fields)
- Test rehearsal — one mainnet deploy of a *throwaway* package (different module name, no Walrus dep) executed at Phase 4 to surface mainnet-specific surprises (gas calibration, RPC behavior, finality timing) under Phase 4 cognitive context

The script's signing key is passed via env var, never written to disk, never committed.

---

## Execution playbook (the day of)

When the trigger condition holds + WAL is acquired + the user is ready to execute (target: 7/22 ≤ T ≤ 8/26):

1. **Pre-execution checklist** (15 minutes)
   - [ ] Trigger condition holds (≥ 20 / ≥ 10 / zero P0 / zero AE3 timeouts / zero racetrack mounts failures)
   - [ ] WAL balance ≥ 10 WAL in deploy wallet (verified via `sui client gas` or block explorer)
   - [ ] Signing key loaded into env (`SUI_MAINNET_DEPLOY_KEY` or equivalent — never committed)
   - [ ] Mainnet UpgradeCap custody decided (hardware wallet OR Sui Multisig per R2 of the requirements doc)
   - [ ] Frontend mainnet build pre-built and tested against an arbitrary mainnet read-only RPC (no writes)

2. **Run** `pnpm deploy:mainnet` (or whatever the script's command is)

3. **Capture script output**
   - PackageID
   - UpgradeCap object ID (transfer to mainnet custody per R2 immediately)
   - Publisher object ID
   - TransferPolicy object ID (with the three rules: RoyaltyRule, LockRule, PersonalKioskRule)
   - All written to `networks/mainnet.json`

4. **Smoke test on mainnet** (~5 minutes)
   - Tom address mints + places + lists one Model3D (using a small SUI / WAL spend)
   - Marcus address purchases it
   - Verify the royalty event fires + the overlay renders + Sui Explorer shows the royalty payment
   - Record the two tx hashes as the mainnet evidence beat for the submission

5. **Cut the mainnet frontend build over**
   - Deploy `overflow.app/` (mainnet) build to Vercel (or equivalent)
   - Keep `overflow.app/testnet` running as the 6/21-submission-era artifact

6. **Update README**
   - Add mainnet contract address(es)
   - Add the two mainnet tx hashes as Explorer links
   - Update the "mainnet by 8/27" Success Criterion line to reflect "shipped"

7. **Submit evidence to Mysten** (per whatever 8/27 evidence mechanism the handbook describes — TBD at 7/15 handbook recheck)

---

## Decision rule when trigger is NOT met by 8/26

Per D-028 and AE5 of the requirements doc: if the trigger condition has not been met by 8/26 (one-day buffer before 8/27), **do not deploy**. Accept the missed 8/27 mainnet eligibility.

Required actions when this fires:
- [ ] Document the specific blocker in `docs/reports/phase-5-testnet-soak.md` (which milestone criterion failed, which session log evidences it)
- [ ] Update README to reflect the deferred mainnet timing with a Phase 5+ recovery plan
- [ ] Surface the decision to any external testers / community as a transparent post (not a silent retreat)

The trade-off (forfeit 50% prize tier) is documented as a Key Decision in the requirements doc + D-028 ADR.

---

## Cross-references

- D-009 (Accepted): testnet OK for 6/21, mainnet by 8/27 for 100% prize — this runbook implements the post-7/22 path
- D-028 (Proposed): milestone-gated mainnet deploy supersedes D-009's implicit calendar gating
- `docs/brainstorms/2026-05-19-phase-4-kiosk-race-on-mint-requirements.md`: source of R13 + R14 + the pre-bake; this runbook owns execution
- `docs/decisions.md`: D-009, D-013, D-016, D-019, D-028
