# Sui Overflow 2026 — DeepSurge Competitive Scan (all tracks)

**Date:** 2026-06-02
**Source:** DeepSurge public API (`https://www.deepsurge.xyz/api/projects?hackathon=b587dc0c-4cb8-4e63-ada5-519df38103bf`), paginated via `after` cursor, filtered to `hackathonId == b587…`.
**Coverage:** 100 / 100 submitted projects (the count endpoint `/api/hackathons/{id}/projects` reports 100). Each project investigated from its on-DeepSurge description plus GitHub README / live demo where present.
**Purpose:** Map every competing idea across all tracks; identify direct threats to **Tusk3D** (Walrus track — 3D model generation → Sui-native NFTs with a composable creator economy + royalties, backed by Walrus storage).

> ⚠️ Method notes / caveats
> - **Track structure (verified 2026):** the overflow.sui.io marketing site lists ~11 tracks (Core: Agentic Web, DeFi & Payments, Infra & DevX; Specialized: Walrus, DeepBook, EVE, ONE Championship, Degen, Payments & Wallets, Entertainment & Culture, Explorations). BUT the **live DeepSurge submission system has only 4 active tracks** — `The Agentic Web`, `DeFi & Payments`, `Special - Walrus`, `Special - DeepBook` (+ a "Core Track" bounty). The other specialized/sponsor categories (incl. "Entertainment & Culture — gaming/NFTs/media") are **not separate judged submission buckets** on DeepSurge. **Implication for Tusk3D:** it is judged in the **Walrus** bucket ("large, off-chain, or verifiable data"), NOT a gaming/consumer bucket. "Real-world gaming demand" is a *narrative wedge*, not the rubric axis — it must be translated into Walrus's "large + verifiable data" language. Official 2026 framing (DeepSurge metadata): "ship **real, production-ready applications**." Dates 2026-05-07 → 06-20.
> - The DeepSurge `track` field returns a **single** label per project even when a team submitted to multiple tracks. Counts below reflect that single label. Some projects (e.g. `Suix`, `Sui-Nexus`) appear under two tracks.
> - "likes" is 0 across the entire dataset (the metric appears unused), so it carries no signal.
> - `pkg` = an on-chain package ID is present on the submission. `net` = self-reported deploy network. Neither is independently verified on-chain here.
> - Several entries are junk/placeholder (`test`, `placeholder`, `test project`, `MedeSciNet`, `0530`, `隨便吧`, `Enzo Esteban`, `Clynzo`). Flagged inline.

---

## Track breakdown (by DeepSurge label)

| Track | Count |
|---|---|
| DeFi & Payments | 34 |
| The Agentic Web | 28 |
| Special - Walrus | 19 |
| Special - DeepBook | 9 |
| "Release on May 7" (misc label) | 9 |
| "Prize Sponsor: OpenZeppelin" | 1 |

---

## 🎯 Executive summary — what this means for Tusk3D

**Headline: no direct competitor.** Across all 100 projects, **zero** are doing 3D-model generation + a composable NFT creator economy + royalties on Walrus. Tusk3D's exact wedge is uncontested. The closest *structural* archetypes (AI-content → Walrus blob → Sui object) exist, but in different content verticals.

**The Walrus track's dominant pattern is "proof / provenance / agent-memory," not creative content.** Of the 19 Walrus entries, the recurring shapes are:
- **Notarization / proof-of-X** — Walrus Proof Agent, TrustClip (video), ToldProof (predictions), suishield (audit reports), Sui Caseflow (forensics).
- **Agent memory on Walrus** — MemWal Agent Memory, RIOT, Sui-Nexus, Coral, Suix, plus SuiLens (Agentic Web) as an inspector.
- **Versioning / storage infra** — Arbor ("Git for agents"), SwGit, Walrus Vault, VRAM (TEE training data).
- **AI media production** — MemTube (video) is the only creative-content peer, and it's video, not 3D.

This means Tusk3D is differentiated on **content type (interactive 3D), consumer-creator audience, and the economic model (access entitlement + 1-layer derivation + royalty cap)** — none of which the field is contesting.

### Threat ranking to Tusk3D

| Threat | Project | Track | Why |
|---|---|---|---|
| **HIGH** | **SuiLens — AI Agent Memory Inspector** | Agentic Web | Tooling that inspects/renders AI-agent memory blobs on Walrus — same infra layer as Tusk3D's MemWal-backed Riff Copilot. Complementary, but judges in the agent-memory-on-Walrus space will see both. |
| **MEDIUM** | **MemTube** | Walrus | The only other "AI-generated media → Walrus blob → Sui lifecycle object" creator platform. Video, not 3D, but the *pitch archetype* judges hear is the same. |
| **MEDIUM** | **SuiBlobs** | Agentic Web | Generative (2D image) NFT minting with model weights on Walrus + ZK-verified inference. Same "generative content → Sui NFT" spine; no creator economy / derivation. |
| **MEDIUM** | **Endless Story** | Walrus | "AI characters with on-chain IP on Walrus" — adjacent creator/IP framing, but narrative not 3D, and the repo/README looked thin. |
| **MEDIUM** | **SwarmFi / SkillWal / Sui-Nexus** | Agentic/Walrus | Share the "Walrus as agent memory/marketplace" pattern; SkillWal's skill-marketplace echoes Tusk3D's composable-economy framing (applied to agent skills, not 3D). |
| **DEPENDENCY (not a competitor)** | **MemWal Agent Memory** | Walrus | The upstream SDK Tusk3D's Riff Copilot is built on. Adds a memory marketplace + MCP server. Risk is *reliability of a dependency*, not competition — repo is private and self-described as "still building." Pin a stable release; ensure graceful fallback if MemWal sync fails. Positive framing: Tusk3D is a real production consumer, which validates both. |

### Strategic takeaways for the pitch
1. **Lean into "3D / interactive / game-ready content" hard** — it is the single most differentiated attribute in the field. Everyone else stores documents, video, reasoning traces, or weights.
2. **Make the creator economy (access entitlement → 1-layer derivation → royalty cap) the centerpiece.** No other project has a *composable* economic model; most NFT/launchpad entries are token bonding curves or single-mint collections.
3. **The "genuinely Walrus-native vs S3-replacement" judging axis (from the rubric, obs 879) is the kill-shot dimension.** Many entries store a blob and call it Walrus. Tusk3D should foreground *why the content must live on Walrus* (large binary 3D assets, verifiable provenance for derivation lineage, decryption-gated access via Seal).
4. **Riff Copilot + MemWal is a credible "agentic" angle** but it is now a *crowded* sub-theme (SuiLens, RIOT, Sui-Nexus, Coral, Suix all touch agent memory on Walrus). Position it as a *feature* of the creator flow, not the headline, to avoid being graded against pure agent-memory infra plays.
5. **Bar is high but execution is uneven.** Most submissions show `pkg`/testnet deploys but ~8–10 are junk and many DeFi/payments entries are thin frontend-over-existing-protocols. A polished, deployed, demo-verified Tusk3D clears the field's median comfortably.

---

## 🌊 Special - Walrus (19) — direct competitive set

### Walrus Proof Agent
- **Idea:** Turns autonomous AI-agent decisions into verifiable audit trails — uploads the full proof payload (evidence, reasoning, policy) to Walrus and mints a compact Sui `ProofReceipt` binding blob ID + digest + signer + tx.
- **Walrus/Sui:** Walrus stores structured proof bundles; Sui `ProofReceipt` Move object anchors the blob as source of truth. Walrus-native in intent. Deployed testnet package + live object IDs cited.
- **Depth:** Testnet, pkg✓, GitHub + Vercel demo + YouTube. Strong — live artifacts cited.
- **Threat:** LOW — agent audit trails; no 3D/NFT/creator economy.

### MedeSciNet
- **Idea:** Placeholder. Description is `https://example.com`; links point to example.com.
- **Depth:** net None, pkg✗, no GitHub. **Junk entry.**
- **Threat:** LOW.

### VRAM
- **Idea:** Decentralized AI-model training protocol — GPU owners train data shards, gradient scoring verified in AWS Nitro Enclaves (hardware-attested), rewards settled on-chain. Walrus stores gradients/checkpoints read *inside* the TEE so the host can't swap data; Seal IBE encrypts miner credentials.
- **Walrus/Sui:** Enclave-side Walrus reads make verifiability depend on Walrus (genuinely native). Sui hosts 11 Move modules + score ledger + reward distributor. *Caveat:* validator README still references Cloudflare R2 for gradient storage — Walrus migration may be in progress.
- **Depth:** Testnet, pkg✓, serious infra (Nitro EC2, staking, systemd), DOI paper. High.
- **Threat:** LOW — training compute; no creative content.

### Coral
- **Idea (claimed):** Walrus + MemWal persistent memory layer for AI agents. **But the linked GitHub (`jimliudev/SynapsePair`) is a different project** (an AI prompt-skill marketplace, no Walrus/Sui code).
- **Depth:** net None, pkg✗, README shows no blockchain code; description copy-pastes Walrus whitepaper language. Shallow/mislinked.
- **Threat:** LOW.

### Arbor
- **Idea:** "Git for AI agents" — version control + provenance for AI-generated artifacts; each artifact is a content-addressed Walrus blob, branching/merging/access-control enforced by Sui Move as an on-chain Merkle DAG.
- **Walrus/Sui:** Genuinely Walrus-native (artifacts *are* blobs, auto-dedup, blob ID frozen in immutable `ArtifactNode`). Four Move modules (artifact/policy/repository/merge) + TS SDK wrapping `@mysten/walrus`/`@mysten/sui`.
- **Depth:** GitHub (`ARZER-TW/Arbor`), full stack + React 19 + live multi-agent demo. Substantial (pkg flag false but README claims testnet).
- **Threat:** LOW — agent artifact provenance; no 3D/NFT.

### Endless Story
- **Idea:** "A living troupe on Walrus" — AI characters whose memories, performances, and IP live on Walrus + Sui.
- **Walrus/Sui:** Walrus for character memory/performance, Sui for IP ownership. README essentially empty (tagline only) — depth unconfirmable.
- **Depth:** Testnet, pkg✗, GitHub present but placeholder README, demo links back to GitHub. Weak.
- **Threat:** **MEDIUM** — "generative content + Walrus + Sui IP ownership" is the closest structural overlap, but narrative/character vertical, not 3D. Different content type; thin execution.

### 0530
- **Idea:** Description is a single `.`. Name is a date.
- **Depth:** Testnet, pkg✗, README 404. YouTube link exists. Indeterminate/placeholder.
- **Threat:** LOW.

### Sui Caseflow — visual fund-flow investigation workspace
- **Idea:** Blockchain-forensics workspace — input a wallet, trace fund flows in a transaction graph, annotate, then package the whole case (snapshot, report, AI notes, MemWal memory card) as a Walrus blob for durable storage + cross-case recall.
- **Walrus/Sui:** Walrus stores semantically meaningful "case workspace" blobs; Sui queried via RPC; MemWal for case recall. pkg✗ (Move contract mentioned, not confirmed).
- **Depth:** Testnet, GitHub (`Live-Rocks/SuiCaseflow-2026`), Node/Vite + Supabase, demo video + slides. Early-stage MVP.
- **Threat:** LOW — forensics; no creative content.

### suishield
- **Idea:** AI Move-contract security scanner — paste a contract, get an AI vuln report, store the report as a Walrus blob with blob ID registered on-chain to form a public audit registry.
- **Walrus/Sui:** Walrus as public audit registry (blob = authoritative artifact, on-chain registration = verifiable). README says v0.1 PoC with *simulated* analysis; full Claude API + Walrus SDK "planned."
- **Depth:** net None, pkg✗, GitHub (`chiab612/suishield`), YouTube demo. Explicitly "demonstrative, not production-ready." Low–moderate.
- **Threat:** LOW.

### test
- **Idea:** Name/description both "test"; links point to github.com homepage. **Junk entry.**
- **Threat:** LOW.

### Walrus Vault
- **Idea:** Decentralized file storage with NFT-based access tokens on Sui; tiered plans (1 GB free → 1 TB enterprise).
- **Walrus/Sui:** Walrus stores the blob; Sui Move mints an NFT embedding the blob ID so only the holder retrieves the file. Tatum API for cross-chain payment.
- **Depth:** Testnet, pkg✓ (`0x5462…`), README checklist mostly unchecked (setup phase). Early MVP; no confirmed live demo.
- **Threat:** LOW — NFT-as-access-key is surface-similar to Tusk3D's entitlement, but generic file vault, no creator economy/3D.

### TrustClip
- **Idea:** Turns any video into a tamper-evident artifact — client-side SHA-256 hash, upload to Walrus, mint a Sui Witness object binding blob_id + hash + timestamp; anyone verifies without an account.
- **Walrus/Sui:** Genuinely Walrus-native (video bytes → Walrus publisher in-browser; Sui PTB mints Witness = the notary). Clean dual-layer.
- **Depth:** Testnet, pkg✗ but full Next.js 15 + dApp Kit, live deploy, Playwright E2E tests. Substantially complete.
- **Threat:** LOW — video notarization; no creator economy.

### SwGit
- **Idea:** Decentralized Git — Git objects stored as Walrus blobs, repo refs managed via signed Sui transactions; wallet-native, agent-friendly source history.
- **Walrus/Sui:** Walrus holds content-addressed Git objects; Sui Move manages refs/identity/permissions. README honest: "MVP scaffold, not a drop-in git-remote yet."
- **Depth:** Testnet, pkg✗, TS CLI + Node server + Move contracts. Demo-flow only.
- **Threat:** LOW — dev tooling.

### ToldProof
- **Idea:** Tamper-proof prediction leaderboard — humans + AI agents (via MCP + x402 micropayments) lock predictions before outcomes; predictions time-locked via Seal on Walrus, AI resolution agent verifies and records verdicts on Sui.
- **Walrus/Sui:** Walrus stores encrypted prediction ciphertexts (Seal time-lock), reasoning traces, versioned reputation chains. Sui Move handles vault, identity, fees, verdicts. Three blob types, clear anchoring — Walrus-native.
- **Depth:** Testnet, pkg✓, **173 tests (62 Move + 111 TS), v3 security audit clean, live at toldproof.xyz, MCP + X bot shipped.** One of the most technically complete entries in the entire dataset.
- **Threat:** LOW — prediction markets; no 3D/media.

### Suix (Walrus-track entry — same product as the Agentic Web `Suix`)
- **Idea:** Desktop AI coding agent for Sui Move dev — LLM chat + 29 tools + 16 Move skill modules. Optional "MemWal Memory" for encrypted cross-session agent memory on Walrus.
- **Walrus/Sui:** Sui Move is the target platform; Walrus is a shallow optional memory backend.
- **Depth:** net None, pkg✗, README 404, but live demo (`sui-x.vercel.app`) functional.
- **Threat:** LOW — dev tooling; Walrus integration is incidental.

### MemTube
- **Idea:** On-chain AI **video** content production — creators register a Channel (with a persistent Walrus memory manifest), trigger AI agents to generate scripts/storyboards/video through a DRAFT→PUBLISHED lifecycle, publish immutable ContentPackages on-chain.
- **Walrus/Sui:** Walrus stores channel manifests + content blobs (SHA-256 tamper-evident); Sui objects record the full lifecycle (channel/run/published) with role-based access. Walrus-native.
- **Depth:** Testnet, pkg✓, GitHub (`yueliao11/memtube`), live demo, YouTube. 5-module contract suite with a real state machine. Reasonably substantial.
- **Threat:** **MEDIUM** — the closest creative-content peer: "AI-generated media → Walrus blob → Sui lifecycle object." Video not 3D, different audience, but judges hear the same archetype. Tusk3D must out-differentiate on 3D interactivity + composable economy.

### Sui-Nexus (also in Agentic Web)
- **Idea:** Settlement infra for autonomous AI agents — HMAC-auth intents through a policy gateway (budget caps, allowlists) before PTB execution; agent analyses + logs stored as MemoryObjects on Walrus for cross-agent coordination + compliance replay.
- **Walrus/Sui:** Walrus stores AI context blobs; Go gateway mints on-chain MemoryObjects referencing blob IDs; Sui Move enforces AgentWallet policies + zkLogin. Infrastructure-layer Walrus use.
- **Depth:** Testnet, pkg✓, Go (Gin) + Kafka + Redis, dual-track (Walrus + Agentic). Solid.
- **Threat:** MEDIUM (pattern only) — shares Walrus-as-agent-memory; different layer (settlement), no product overlap.

### MemWal Agent Memory  ⭐ (Tusk3D dependency, NOT a competitor)
- **Idea:** Advanced hybrid memory layer for AI agents on top of the base MemWal SDK + Walrus — local SQLite fast recall + durable Walrus promotion, a **Memory Marketplace** (buy/sell/fork memory packs as NFTs with WAL escrow on Sui), and an MCP server any client (Cursor, Claude Desktop/Code) can connect to.
- **Walrus/Sui:** Genuinely Walrus-native — memories promoted SQLite→Walrus with verifiable `walrus_blob_id` proofs; Sui Move marketplace (NFT packs + WAL escrow). Quality scoring / PII redaction / versioning before promotion. Mainnet claimed.
- **Depth:** Mainnet, pkg✓, **repo private** (`Olympusxvn/memwal-agent-memory`), live dashboard. Self-described "Building (Updating…)" with open todos.
- **Relationship:** This is the **upstream SDK Tusk3D's Riff Copilot uses** (cross-session recall of riff preferences / creative context). Capability-consumer, not competitor. **Risk = dependency reliability** (private repo, still building) → pin a stable release, graceful fallback if sync fails. Framing win: Tusk3D is a real production user → validates both.

### RIOT on Sui
- **Idea:** Wallet-gated multi-agent "punk collective" of 25 AI characters with persistent cross-session memory on Walrus; connect Sui wallet to unlock all agents, "Immortalize" any conversation as a Sui Move object on mainnet.
- **Walrus/Sui:** Walrus stores chat/memory blobs (auto-saved every 5 messages); Sui Move mints immutable Memory objects; MemWal vector search for recall; optional Seal (AES-256-CTR). Walrus-native memory layer; product value is the chat UX.
- **Depth:** Mainnet, pkg✓, GitHub (`cryptoriot666/riot-chat-wallet`), live (theriot.vercel.app), YouTube. 25 agents + wallet + memory working.
- **Threat:** LOW — AI chat companions; wallet-gated framing superficially similar but no 3D/creator economy. Also a MemWal consumer.

---

## 💸 DeFi & Payments (34) — overlap with Tusk3D: ~all LOW

Captured for breadth. None touch 3D/NFT creator economy except where noted.

### Remora Finance
- Lending protocol specializing in **payroll-backed** loans (income-stream collateral). Testnet, pkg✓, but GitHub 404 + thin landing → integration depth unclear. Overlap LOW.

### Talise
- Gasless stablecoin transfers for real-world commerce. net None, pkg✗, "coming soon" demo. Pre-MVP. LOW.

### MoonCreditFi
- Reputation-based lending for underserved (Africa-focused) markets — risk-tiered pools, Mudarabah profit-sharing, AI credit scoring, DePIN funding. Testnet, pkg✓, very verbose description. LOW.

### PandaBox
- Move-native **token launchpad** — Project object owns a SUI treasury + locked TreasuryCap; supporters get a transferable `ContributionReceipt` NFT, burn to claim tokens. **Mainnet**, pkg✓, live (pandabox.money). Clean Sui object model. Receipt NFT is an entitlement voucher, not creator content. LOW.

### SuiWatt
- Grid Demand-Response payments — EV drivers shifting charging off-peak get auto-paid by a utility vault on oracle-confirmed sessions. Testnet, pkg✓. Novel DePIN/payments. LOW.

### 隨便吧
- Description "愛叫啥名" (call it whatever). **Placeholder/joke.** LOW.

### L/C
- Decentralized **Letter of Credit** trade-finance protocol; locked funds auto-deployed to DeFi yield while escrowed ("earn while you escrow"). Devnet only, pkg✗. Early. LOW.

### UTXOpia
- Privacy-preserving native **BTC** finance on Sui — deposit BTC, receive shielded commitment notes; Poseidon commitments + nullifiers + Groth16 JoinSplit ZK; MPC/TSS custody; zkLogin. Testnet, pkg✓, live app. One of the deeper DeFi entries. LOW.

### Enzo Esteban
- Description "For Devcon"; repo is a Move Code Camp Level-1 exercise; demo is a Rick-roll. **Not a genuine project.** LOW.

### Flow Protocol
- Composable non-custodial payments — Stream (per-second), Pact (milestone escrow), Instant (atomic split); DeepBook v3 cross-currency swaps in PTB; **Pact agreements stored on Walrus**; Scallop yield planned. Testnet, pkg✓, TS SDK. Well-rounded. LOW.

### Helm
- AI trading terminal (derivatives, prediction markets, perps) with an autopilot copilot. Testnet, pkg✗ (no deployed contract — notable gap), polished marketing + pitch deck. LOW.

### Sentra
- Smart-savings protocol — goal vaults, auto-locking, yield, stablecoin support. **Mainnet**, pkg✓, live (sentrafi.xyz). LOW.

### Streaming Payment
- Token streaming with unstreamed balance deposited to Scallop for yield. **Mainnet**, pkg✓, live demo. LOW.

### PasaPay
- Remittance/savings for Overseas Filipino Workers & seafarers — stablecoin receipt, instant remit to Coins.ph/PH banks, yield via Scallop/Navi. Mainnet, pkg✗ (frontend-only). LOW.

### Aria, the Airbnb Killer
- Vacation-rental platform (3% vs Airbnb 15%) — bookings, escrow deposits, zkLogin, Grok AI assistant, **Walrus for tamper-proof booking receipts**, DeepBook for payouts. Testnet, pkg✗ ("built in 4 days by a non-technical founder"). LOW.

### SunMint
- Tokenizes rooftop **solar panels** into yield-bearing Sui objects (Panel/Token/DividendPool); oracle kW output; USDC dividends. Testnet, pkg✗ but well-described. LOW.

### SplitRail
- Payroll/split-bill fan-out — one coin → up to 50 recipients in one PTB, optional Receipt NFT per payee. Testnet, pkg✗ (native PTB). LOW.

### HONK
- Meme-coin launcher with an AI "vibe filter" (scores name+image 0–10); coins >5 launch via PTB with an immutable bonding curve. Testnet, pkg✗. LOW.

### ScanPay
- QR merchant payments — address encoded in QR, one PTB settles <2s at 0.1% fee, non-custodial. Testnet, pkg✗. LOW.

### PunchPredict
- Prediction market for **ONE Championship** martial-arts props with 60-second in-fight windows. Testnet, pkg✗. LOW. *(Note: ONE Championship is its own specialized bounty — this team chose the DeFi label.)*

### InstantRent
- Lease → per-second rent stream; a lender can buy 11 months forward rent in one PTB, holding a transferable forward-rent receipt. Testnet, pkg✗. LOW.

### SuiAgentPay
- Agent wallet — vault + time-limited session key for an AI agent (SUI transfers, DeepBook swaps, whitelisted calls under spending limits); above-threshold tx routes to Telegram human review. Testnet, pkg✗. LOW.

### Surge Protocol
- No-loss prize savings — stake SUI, principal always withdrawable, yield funds VRF prize draws (`sui::random`). **Mainnet**, pkg✓. Solid. LOW.

### quay
- Web2→crypto payments bridge — pay any SG QR standard in any token, merchants receive USDsui; zkLogin onboarding, **Walrus for merchant profiles/receipts/encrypted KYB (Seal)**, Scallop yield, gas sponsorship. **Mainnet**, pkg✓, live (quay.cash). Broad Sui-native stack. LOW.

### SoSui
- Encrypted chat rooms + programmable payment channels — atomic transfers, bountied task escrow, admin-arbitrated disputes, all in one PTB; AES key zeroed on room close. **Mainnet**, pkg✓, live (sosui.xyz). LOW.

### Capsule
- Capability-based agent spending control — a `SpendingCap<T>` Move object enforces budget/allowlist/ceiling/expiry/category in the type system (no trusted backend); merchant receipt NFTs, atomic sub-delegation, MCP server, mock x402 network. Testnet, pkg✓. Deep. LOW.

### Sui Trending
- Trend-aggregation dashboard replacing paid social APIs with free public data; explainable trending signals. Testnet, pkg✗ (read-only). LOW.

### SuiSub
- Decentralized **subscription** engine (Stripe-like recurring rails) with a keeper auto-executing due payments. Testnet, pkg✓, live + YouTube. LOW.

### Blink Market
- Fast prediction market — zkLogin onboarding, LI.FI cross-chain funding. Testnet, pkg✗ (prototype). LOW.

### Epoch
- Trustless immutable **token vesting** — non-cancellable vaults (cliff/linear/hybrid), no admin keys, AI agent layer for NL queries. **Mainnet**, pkg✓, stress-tested 300+ vaults, live (epochsui.com). Deep. LOW.

### LeafSheep
- AI-managed DLMM liquidity vault for **Cetus** — agents rebalance across bins, idle assets to Scallop; agents can rebalance but never withdraw (enforced on-chain). **Mainnet**, pkg✓, audit file in repo. Deep. LOW.

### SuiX
- Passive **index** vault — 2 live mainnet vaults tracking top-5 Sui tokens, autonomous 12h rebalance via 7K Protocol. **Mainnet**, pkg✓, live (sui-x.com). LOW. *(Distinct from the `Suix` coding agent.)*

### Privacy Cloak
- Universal privacy layer — ZK proofs, stealth addresses, private relayers to hide balances/activity. Mainnet label, pkg✗ (concept-stage). LOW.

### Sui Pump
- Permissionless **bonding-curve token launchpad** — launch a token in 2 signatures, constant-product AMM, graduate to Cetus; transferable `CreatorCap` with multi-recipient payouts. Testnet, pkg✓ (26/26 tests). `CreatorCap` is a creator-fee primitive but no media/3D/Walrus. LOW.

---

## 🤖 The Agentic Web (28) — overlap mostly LOW; agent-memory cluster noted

### SwarmFi on Sui
- Autonomous AI prediction market — a swarm (researcher/analyst/contrarian/aggregator) reaches adversarial consensus and trades atomically via PTBs; **reasoning transcripts stored on Walrus**; DeepBook liquidity. Devnet, pkg✓. **MEDIUM** — Walrus-for-agent-reasoning + adversarial multi-agent pattern is architecturally adjacent to Riff Copilot (different domain).

### SuiLens — AI Agent Memory Inspector  ⚠️ HIGHEST overlap
- Dev tooling to **inspect AI-agent memory on Walrus** — a Blob Inspector renders blob IDs to readable content; an Agent Memory Browser lists all memory blobs owned by a Sui wallet. Testnet, pkg✗, live (github.io/suilens) + YouTube. **HIGH** — targets the exact infra Tusk3D's MemWal/Riff Copilot sits on. Complementary, but same use-case space; judges may compare.

### Sup Wallet
- Permission-based agentic wallet — grant LLMs typed/capped/revocable spending without exposing the seed; NFC tap-to-pay, QR, PerpOS/ForexOS. Testnet, pkg✗ (placeholder demo link). LOW.

### Sui Agent Payment Guard
- Non-custodial layer reviewing agent payment intents pre-execution, scoring vs policy, recording auditable on-chain receipts (recipient/amount/limit/model hash/intent hash/risk/result/timestamp). Testnet, pkg✓. LOW.

### Anam Pouch
- Privacy-first portable AI **medical** assistant (Traditional Chinese) — on-device ASR + local LLM clinical summaries fully offline, hash+timestamp anchored on-chain, patient-controlled single-use decryption QR. Testnet, pkg✓. LOW.

### SuiSoul
- On-chain identity/reputation for AI agents — zkLogin human-vs-agent distinction, soulbound agent passports, DNA fingerprints, reputation; cross-chain via TAP. net None, pkg✗ (thin). LOW.

### RareFormU (The Observer Protocol)
- "Digital sovereignty" platform + Observer Protocol for economically autonomous agents — multi-agent crypto verification, trust-graph indexing, cross-chain liquidity analysis. Mainnet, pkg✗ (marketing-heavy, low technical signal). LOW.

### Polius └|∵|┐
- "First agentic civilization engine on Sui" — autonomous R&D economy where agents publish on-chain systems consumed by others via user stakes; Hermes + Nautilus TEE for verifiable agent identity. Testnet, pkg✓, live (polius.life). LOW.

### Aegis
- Verifiable reputation layer for agents — tracks on-chain DeFi performance (success rate/volume/slippage/uptime), issues non-transferable Bronze/Silver/Gold badges with <60s auto-revoke. Testnet, pkg✓, 94k+ executions / 847+ badges, live. High execution quality. LOW.

### TxTrace
- Decodes any Sui tx digest into readable PTB commands/gas/events, then an LLM pinpoints the failing step in plain language. Testnet, pkg✗ (read-path). LOW. *(One of the prolific `veithly` multi-project submissions.)*

### SmolAgent
- On-chain hireable agents (each a Sui shared object minted for 1 SUI) — Airdrop Hunter, Tax Bookkeeper, Wallet Guardian. Testnet, pkg✗. LOW. *(veithly batch.)*

### SkillWal
- Decentralized AI **skill marketplace** on Sui + Walrus + Nautilus TEE — devs publish reusable skills, requesters post bounties, executors run in enclaves with Merkle-root output commitments for optimistic settlement/disputes. Testnet, pkg✗ (GitHub only, no live demo). **MEDIUM** — Walrus + on-chain marketplace + "composable skills" framing echoes Tusk3D's composable economy (applied to agent skills, not 3D).

### FractalMind Agent OS on Sui
- Trust layer for agents — a Sui Move `AgentPolicy` object bounds action kind/scope/use-count/expiry/gas; typed `ActionExecuted` events; revocation provable (abort 8204). Testnet, pkg✓, honest prior-work disclosure. LOW.

### Suix (Agentic Web entry — same as Walrus `Suix`)
- Desktop AI coding agent for Sui Move (29 tools + 16 skill modules). net None, pkg✗, live (sui-x.vercel.app). Same author cluster as `lispking/sui-auditor`, `lispking/sui-trending`. LOW.

### Sella
- Agentic marketplace where agents discover/buy/consume resources (paywalled APIs, datasets, GPU) across Solana/ETH/Stellar/Sui via an MCP skill file. Testnet, pkg✗ (Sui is 1 of 4 chains — shallow). LOW.

### Autopilot
- Autonomous AI agent (Groq) managing a Sui DeFi portfolio — trades + rebalances without manual input. Testnet, pkg✓ (straightforward automation). LOW.

### Suiduckz
- **NFT collection/startup** on Sui (framed as a collection, not a tool). Testnet, pkg✓, live testnet site + demo. LOW — straightforward NFT collection, no creator-economy platform/3D/Walrus/agent layer.

### SuiSense
- Autonomous monitoring agent — scans Cetus/Scallop checkpoints, detects whale moves, 0–100 health score with anomaly detection, anchors reports via a `SuiRegistry` Move module. Testnet, pkg✗ (thin). LOW.

### Sui Auditor
- Local-first Rust CLI auditing Move repos via OpenAI-compatible LLM. net None, pkg✗. LOW.

### Guardian Agent Wallet
- Single-page demo of constrained agent execution — spending limits, auditable activity, one-click freeze; Google zkLogin + Sui testnet. pkg✗ (frontend demo, no on-chain enforcement contract). LOW.

### SuiBlobs  ⚠️ generative-NFT overlap
- Full-stack **wallet-bound AI NFT minting** — a quantized image generator runs inference (local/TEE/ZK), **model weights stored on Walrus**, a Groth16 ZK proof verifies generation before minting a Blob NFT on Sui. Testnet, pkg✓, GitHub (`nickwest-zkp/sui-fuzz`), no live URL (Drive folder). **MEDIUM** — Walrus + generative-NFT-on-Sui is the closest structural overlap; but 2D image, ZK-verified (not creator economy / derivation).

### Lyra
- Autonomous on-chain trading agent — reads Sui DEX data, runs a signal model, trades without human input ("AI as primary market participant"). Testnet, pkg✗ (SDK-level). LOW.

### Sui-Nexus *(see Walrus section — dual-track; MEDIUM on Walrus-as-agent-memory pattern)*

### ZION Civilization
- Simulation of 10,000 autonomous agents forming an on-chain civilization (trade/wars/elect prophets/clans) with a DeepBook prediction market (ZionBet); Walrus + Seal mentioned. Testnet, pkg✓, live (zionciv.com). ⚠️ demo link is a Rick-roll (demo-readiness red flag). LOW — Walrus incidental.

### Say Ur Intent
- Description is just the project name repeated. Mainnet, pkg✗. **Placeholder.** LOW.

### Quikt
- Atomic multi-source agent payment rail — binds N data-source payments into one PTB via a hot-potato `ResearchReceipt`; every paid response recorded with its **Walrus BLAKE2b blob hash** in a phantom-typed receipt registry. Testnet, pkg✓, live (quikt.surge.sh), cross-operator testnet settlement. Deep Move type-system + Walrus-integral. LOW (domain differs).

### Clynzo
- Web2 doctor-appointment booking (React/Node/Stripe). **No Sui/Walrus/AI** — likely submitted in error. net None, pkg✗. LOW.

### Audric
- Conversational agentic finance on Sui mainnet — zkLogin/Enoki sign-in, NL payment intents ("swap 10%, save 50%, send $100 to Mom") compiled into one atomic PTB via NAVI + Cetus, <1s. Mainnet, pkg✗ (composition-level), live (audric.ai). LOW.

---

## 📈 Special - DeepBook (9) — overlap with Tusk3D: none

### PredictBot
- SaaS bot platform for DeepBook Predict — deploy capital into automated prediction strategies on self-hosted full-node infra. Testnet, pkg✗ (thin). None.

### Sovereign Agentic Prediction Market
- Prediction-market aggregator claiming kernel-bypass networking, formal verification, BFT for agent predictive routing. Testnet, pkg✓, but inflated marketing copy ("quantum-resistant") with no concrete DeepBook detail — likely shallow. None.

### Phasis  ⭐ (highest DeepBook depth)
- On-chain **options** protocol — Deribit-style CLOB; each option series gets its own DeepBook v3 pool; cross-margin + portfolio-margin stress grid; Pyth EMA cash settlement. Vendored DeepBook v3 in Move + Rust keeper layer (iv-publisher/stress-publisher/cranker/liquidator) + TS SDK. From **Typus Lab** (established team). Testnet, pkg✓. Highest technical depth among DeepBook entrants. None.

### Blubuu
- "Blubuu Upwell" copy-trading platform via DeepBook. Testnet, pkg✗ (one-sentence description, org page only). Thin. None.

### SuiFlap
- Sui-native launchpad prototype — memecoin launches, creator vaults, PvP token duels; bonding-curve trading with DeepBook graduation + "Walrus-friendly asset storage." Testnet, pkg✗ (triplicated repo link, no demo). Mentions "creator vaults" + Walrus but no evidence of integration. Overlap LOW (token-launch core, not 3D-NFT).

### DripDeep
- No-code conditional DCA — three-dropdown rules (asset/schedule/price) become Sui objects firing DeepBook orders on condition. Testnet, pkg✗ but live demo + YouTube. None.

### test project
- Description "dasdasdasdsa"; linked repo is an unrelated Claude Code plugin. **Junk entry.** None.

### HexaMove
- On-chain forensics / fund-tracing for Sui (visualize flows, trace stolen funds). Mainnet, pkg✗ (org page + Twitter only, no DeepBook evident — opportunistic track placement). None.

### HypersFun
- Tokenized **fund** protocol — anyone launches an on-chain fund, investors buy NAV-anchored tokens with bonding-curve liquidity reflecting real-time PnL; Sui version adds DeepBook Margin. Claims existing HyperEVM mainnet product. Mainnet, pkg✓, live (hypers.fun). Sui port in progress. None.

---

## 🏷 "Release on May 7" + "Prize Sponsor: OpenZeppelin" (10) — misc labels

### Move Auditor
- Claude Code skill turning Claude into a Sui/Aptos Move security auditor from real exploit patterns. Mainnet label, pkg✗ (dev tool, not a dApp). None.

### sui-hotstore
- Local KV serving layer — ingests Sui txs/objects/events/owners/checkpoints into ToplingDB (RocksDB-compatible), low-latency APIs, benchmarked. Mainnet, pkg✗ (indexer infra). None.

### Campfire
- Decentralized identity — immutable Proof-of-Work ledger replacing resumes; real achievements → soulbound NFTs (SBTs) + zkLogin. Testnet, pkg✓, live (campfire-user.vercel.app). From a Sui Builder Program win (Palawan). None — SBT credentials, not 3D/creator economy.

### SuiIntent
- NL DeFi intent layer — type a sentence ("Swap 0.1 SUI for USDC then deposit into Navi"), parse + build multi-protocol txs (Cetus/Navi), execute in one flow. Mainnet, pkg✗. None.

### TIDE
- Sui-native **BTC treasury** ops layer — policy-driven rules (liquidity/drawdown/debt/repayment), each decision a reviewable workflow producing an on-chain receipt after stress-testing BTC paths. Testnet, pkg✓, live (testnet.tidesui.pro). None.

### NoaSight
- Polymarket-style **prediction market** leveraging Sui parallel execution + PTBs for near-instant settlement. net None (unusual — pkg✓ but no testnet deploy), live (noasight.xyz). None.

### AGENT ON SUI
- AI trading ecosystem — Telegram bot + dual-pool liquidity + on-chain "Arena" where trading agents compete; `$AGENT` token for fees/access. Mainnet, pkg✓, live (suiagent.xyz). None.

### placeholder
- Description "placeholder"; bare GitHub profile + YouTube homepage. **Junk entry.** None.

### suibets
- Full-stack on-chain **sports/prediction betting** — every wager on-chain; **market data + bet history persisted via Walrus**; SuiNS identities; zkLogin. Mainnet, pkg✓, live (suibets.com). Strongest deploy signal in this group. None — Walrus for data persistence, not content.

### Sunflower (OpenZeppelin sponsor track)
- Live **security analytics** platform for Sui ("SuiShield" branding in the description — name/description mismatch is a red flag) — turns fragmented security data into an on-chain intelligence layer. Testnet, pkg✗ (repo only, no demo). Thin. None.

---

## Appendix — raw dataset

Full cleaned JSON of all 100 projects (name, track, net, likes, pkg, stripped description, links) was pulled to `/tmp/ds_overflow2026.json` during this scan. Re-fetch any time via:

```
GET https://www.deepsurge.xyz/api/projects?hackathon=b587dc0c-4cb8-4e63-ada5-519df38103bf
# paginate with &after=<pagination.nextCursor>; filter items to hackathonId == b587dc0c-…
```

---

## 🔬 Deep-dive: the 4 Walrus-$70K-pool ranking rivals (code + on-chain audit, 2026-06-02)

Cloned repos, inspected Move contracts, grepped Walrus SDK usage, queried testnet RPC.

| Rival | Tech | Walrus-native | Exec/Demo | Creativity | Verdict |
|---|---|---|---|---|---|
| **ToldProof** | 9 | 8 | 9 | 9 | **Real top-tier rival.** Deployed immutable pkg, 61 Move + 112 TS tests, CI, 3 audits, live, 4 sovereign AI agents (MCP/x402). Walrus = sole content store + chained reputation "agent memory". |
| **Arbor** | 8 | 9 | 6.5 | 8 | **Real rival.** DeepSurge `pkg=false` is WRONG — deployed, on-chain merge events, live dApp. blob_id == Walrus blob id (content-addressing is the whole point). Gaps: **no demo video**, zero SDK tests, deprecated JSON-RPC. |
| **VRAM** | 7 | **2** | 4 | 8 | **Collapses on Walrus axis.** 0 `@mysten/walrus`; on-chain struct fields literally `*_r2_path` (Cloudflare R2). Core repo 404. Live network empty (0 validators/scores/distributions). Threat = narrative/$ optics only. |
| **TrustClip** | 3 | **1** | 3 | 5 | **Hollow.** Walrus integration fabricated (fake `0x`-hex blob_ids, no upload code, dead devnet URL as text). `.env` header says `SuiOverflow / SmolAgent` — copied from author's mass-submission factory (~9 near-identical shells). |

**Takeaway:** Only ToldProof + Arbor are genuine ranking threats in the Walrus pool. Neither overlaps Tusk3D's idea (prediction-reputation / agent-artifact-versioning vs 3D creator economy). Tusk3D's structural edge = **3D binary assets are the strongest Walrus-native argument in the field** (large binary, erasure-coding actually matters) + the only composable creator economy. Biggest risk = **execution-completeness bar set by ToldProof** (61+112 tests, CI, live, demo video). Action items: full contract tests, testnet deploy with clickable object IDs in the demo, **record a demo video** (Arbor lost 2.5 pts for lacking one), confirm gRPC (not the deprecated JSON-RPC Arbor still ships). Keep Riff Copilot/MemWal as a *feature* — ToldProof out-executes the agent-memory-on-Walrus narrative.

---

## 🥊 The actual battleground: Walrus bucket (19) — "large + verifiable data" vs "just a blob"

This is the rubric Tusk3D is scored on ("Leverage Walrus to handle **large, off-chain, or verifiable data**"). Classified on two axes that matter to a Walrus judge: **(1) is the data genuinely LARGE binary** (where erasure coding actually matters) and **(2) is it VERIFIABLE / source-of-truth** (content-addressed, tamper-evident, anchored on-chain) vs a decorative "store a blob" add-on. Code-verified where deep-dived.

| Project | What's on Walrus | Large binary? | Verifiable / source-of-truth? | Verdict |
|---|---|---|---|---|
| **Arbor** | AI-agent artifacts (code/reports/datasets) | ~ (variable) | ✅✅ blob_id == Walrus id, content-addressed DAG | **Genuinely native** (source of truth) |
| **ToldProof** | encrypted predictions + reasoning traces + chained reputation | ✗ (small text) | ✅✅ Seal time-lock, chained blobs, on-chain anchor | **Genuinely native** (verifiable) |
| **SwGit** | Git objects (content-addressed) | ✗ | ✅ refs on Sui, content-addressed | Native (dev data) |
| **MemTube** | channel manifests + AI **video/media** content | ✅ media | ✅ SHA-256 + Sui lifecycle | Native — **one of the few touching LARGE** |
| **MemWal Agent Memory** | agent memories (SQLite→Walrus) | ✗ | ✅ verifiable blob_id proofs + marketplace | Native (the SDK Tusk3D uses) |
| **Walrus Proof Agent** | structured proof bundles (JSON) | ✗ | ✅ ProofReceipt anchor | Native (verifiable, small) |
| **Sui-Nexus** | agent context/logs as MemoryObjects | ✗ | ✅ on-chain refs | Native (infra, small) |
| **RIOT on Sui** | chat/memory blobs | ✗ | ✅ "immortalize" as Sui object | Native (small text) |
| **Sui Caseflow** | forensics case packages (graph+report+notes) | ✗ | ~ (MVP) | Native intent, early |
| **suishield** | AI audit reports → on-chain registry | ✗ | ~ (v0.1 simulated) | Native intent, thin |
| **Walrus Vault** | generic user files + NFT access key | ✅ files | ✗ (just "store a file") | **The S3-replacement archetype** w/ NFT key |
| **Endless Story** | AI character memory/IP (claimed) | ✗ | ✗ (README empty, unverifiable) | Claimed, thin |
| **Suix** | optional MemWal agent memory | ✗ | ~ | Decorative (dev tool) |
| **VRAM** | gradients/checkpoints (CLAIMED) | ✅ (if real) | ✗ | **Code uses Cloudflare R2; struct fields `*_r2_path`. Walrus NOT built.** |
| **TrustClip** | video (CLAIMED) | ✅ (if real) | ✗ | **Fabricated — no `@mysten/walrus`, fake blob_ids. Stores nothing.** |
| **Coral** | memory layer (claimed) | ✗ | ✗ | Mislinked repo, no Walrus code |
| **MedeSciNet / 0530 / test** | — | — | — | Junk/placeholder |

### The opening for Tusk3D
- **Almost the entire Walrus bucket stores small text/JSON** (proofs, memories, reasoning traces, audit reports). The **"LARGE binary data"** half of the Walrus mandate is **nearly uncontested** — only MemTube (video), Walrus Vault (generic files), and VRAM (gradients, but it's actually R2) touch it, and only MemTube does it with verifiability.
- **Tusk3D is positioned to be the only entry that hits BOTH axes hard: genuinely large binary (3D GLB meshes) AND verifiable provenance** (derivation lineage) + Seal-gated entitlement. That is the cleanest possible answer to "why does this data belong on Walrus."
- **Pitch translation:** don't say "we serve real gaming demand" (Entertainment bucket language — not where you're judged). Say **"game-ready 3D assets are exactly the large, verifiable data Walrus exists for — and the composable royalty/derivation economy on top can only exist on Sui."** That wins the Walrus rubric while carrying the real-world-demand credibility for free.
- Beware the two genuinely strong native rivals in this bucket — **ToldProof** (verifiable axis, elite execution) and **Arbor** (content-addressing done right) — but neither competes on the **large-binary** axis, which is yours to own.
