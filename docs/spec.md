# PROJECT_CONTEXT.md — 3D Model Generator on Sui + Walrus

> 寫給未來的自己 / agent 看的技術摘要。
> 內容整合自四份平行調研:Walrus 深度、Seal 深度、Sui Overflow 2026 hackathon 官方資料、SDK/前後端技術棧現況(全部以 2026-05-14 為基準)。
> 原始 prototype spec(`spec.md` 或你貼在對話裡的版本)是這份文件的補充,但**衝突時以本檔為準** — spec 寫的時候有些 SDK API、套件維護狀況、hackathon 截止日還沒落地確認。

---

## 0. TL;DR(三十秒版)

> **2026-05-14 修正版** — 之前的時程是把 2025 hackathon 跟 2026 搞混了。以官方 Notion handbook ([mystenlabs.notion.site/overflow-2026-handbook](https://mystenlabs.notion.site/overflow-2026-handbook)) 為準。

1. **時程**:Submission **2026-06-21**(距今 **~38 天**)、Shortlist 7/8、**Demo Day 7/20–21**、Winners **8/27**(Sui Basecamp 受邀 pitch)。**全部 Pacific Time。**
2. **獎金結構**:**50% 在 8/27 公布時拿、50% 在 mainnet deploy 成功後拿**。若 8/27 已 mainnet → 100% upfront。**目標:8/27 前要上 mainnet**,別只停在 testnet。
3. **主攻 track**:**Walrus**(1st $35K / 2nd $15K / 3rd $7.5K / 4th $5K + $7.5K honorable mentions = ~$70K pool)
4. **Walrus track framing(D-011 升級)**:Handbook 寫的是「Build **AI agents and agentic workflows** powered by Walrus **as a verifiable data and memory layer**」。我們的 pitch:**「LLM agent 路由 procedural + (optional) AI generator,Walrus 同時存 GLB bytes 加 agent 的 lineage(prompt / 決策 trace / params / generator 來源)」**。Agent 真做事(decomposition、routing、batching、provenance),不是 thin wrapper。~~**MemWal 待調研**~~ **⚠️ 已定案(D-080,所有權拆分 D-090):MemWal 已採用為 Riff Copilot 的 memory 層**;但 lineage 模式仍是 memory layer 的具體實作。詳見 [D-011](decisions.md#d-011-agentic-framing--hybrid-generator-architecture-llm-router--procedural--tripo)。
4.5. **Generator architecture(D-011 新增)**:`Generator` interface,**primary = `ProceduralGenerator`**(Go,< 2s,manifold 保證,$0/gen)。**Secondary = `TripoGenerator`**(pluggable,**Phase 3 才決定**要不要接,接的話用 Pro tier $11.94/mo 商用 OK)。LLM router(Claude Haiku/Sonnet,~$0.001/call)做 NL → catalog → params + 多步驟拆解。**LLM 不畫東西**,只做分類 + 填空。
5. **2026 track 縮編** — 只有 4 個 track:Core 2 個(Agentic Web、DeFi & Payments)+ Specialized 2 個(Walrus、DeepBook)。**沒有 Entertainment & Culture / ONE Championship / EVE / Infra & DevX** — 那些是 2025 的,不存在了。MVP 沒有 Walrus 之外的 fallback。
6. **評分權重**:**Real-World Application 50%** ← 最重!Product & UX 20% / Technical 20% / Presentation 10%。**「solve meaningful problems」「market relevance」「long-term value」比技術 demo 重要。**
7. ~~**MVP 不要做 Seal**~~ **⚠️ 已反轉(D-074,2026-05-31):Seal 內容保護提前納入 v1 / 6/21 submission,並已於 v9 出貨**(D-075/076、加固 D-085~087)。原架構先見之明仍成立——Walrus URI 藏在 Sui Move 物件欄位,加 Seal 不用重做架構。**stretch 階段可加付費解鎖 demo** 已實現為 access-entitlement(D-078)。
8. **要改 spec 的幾件事**(詳見 §5):drop `react-babylonjs`、所有 `@mysten/*` 鎖到 2026-05-08 release train、Walrus WASM 在 Vite/Next.js 要特別 setup、Walrus package ID 用 MVR 不要硬寫。
9. **Demo 殺手 60 秒**:Google 登入(zkLogin)→ 選 shape + slider → 即時預覽 → 確認 → mainnet mint(sponsored tx 讓用戶看不到 gas)→ Slush 錢包看到 Model3D NFT。

---

## 1. Sui Overflow 2026:Hackathon 戰略

> 來源:[mystenlabs.notion.site/overflow-2026-handbook](https://mystenlabs.notion.site/overflow-2026-handbook)(2026-05-14 用 headless browser 直抓 Notion 內容,**這是 single source of truth**)

### 1.1 時程(Pacific Time)

| 日期 | 階段 |
|---|---|
| **May 7, 2026** | Official Launch(Sui Live Miami,track + prize pool 公佈) |
| **May 7 – June 21** | Building Period |
| **June 21** | **Submission Deadline**(提交後仍可改,但 shortlist 不一定反映) |
| **July 8** | Shortlisted Teams 公告 |
| **July 20–21** | **Demo Day**(shortlist 線上對評審 panel pitch) |
| **August 27** | **Winners Announcement** — 受邀到 Sui Basecamp 2026 pitch |

**今天 2026-05-14 → 距 submission 38 天、距 demo day 67 天、距 winners 105 天。**

### 1.1.1 獎金分配模型(重要 — 影響 mainnet 決定)

> handbook 原文:"Prizes for Sui Overflow 2026 will follow a **split distribution model designed to encourage continued development beyond the hackathon**:
> - 50% of the prize will be awarded **upon announcement of winners**
> - 50% of the prize will be awarded **after successful mainnet deployment**
> - If a winning team has already deployed their project to mainnet by the time winners are announced in August, they will receive **100% of the prize upfront**."

**結論**:**目標 8/27 前 mainnet**。Testnet 提交可以,但拿一半獎金一定要 mainnet。Mainnet deployment 必須符合 Sui team 或 track sponsor 定義的最小功能需求。

### 1.2 Tracks(2026 只有 4 個)

#### Core Tracks(各 $30K / $15K / $10K / $7.5K)

| Track | 主題 | 我們契合 |
|---|---|---|
| **Agentic Web** | AI-native agents + autonomous workflows on Sui | ☆☆ 不主攻(我們不是 autonomous agent) |
| **DeFi & Payments** | Programmable payments, on-chain finance | 不適用 |

⚠️ **沒有 Infra & DevX track**(那是 2025 的)。

#### Specialized Tracks(各 $35K / $15K / $7.5K / $5K + $7.5K honorable mentions ≈ $70K pool)

| Track | 描述(handbook 原文) | 契合度 |
|---|---|---|
| **Walrus** | "Build AI agents and agentic workflows **powered by Walrus as a verifiable data and memory layer**" | ★★★★★ **主攻** |
| **DeepBook** | DeepBook Predict — vaults / bots / analytics / prediction markets | 不適用 |

⚠️ **沒有 Entertainment & Culture / ONE Championship / EVE Frontier / Payments & Wallets** — 那些都是 **2025** 的,2026 已縮編。

#### Special Rewards
- **University Award**:10 winners × $2,500 USD(隊伍至少 50% 學生)
- **Post-Hackathon $250,000+ value**:audit credits、ecosystem support、mentorship 等

**注意**:**2026 沒有獨立 Seal track 也沒有 zkLogin track**。Seal 在 handbook 被列為 Walrus 配套("privacy layer for Walrus and MemWal"),Walrus track 加 Seal 是加分項。

### 1.3 評分標準(handbook 列具體 %)

| 項目 | 權重 | 重點 |
|---|---|---|
| **Real-World Application** | **50%** ← 最重 | Meaningful problem-solving, market relevance, **long-term value** |
| Product & UX | 20% | Quality, usability, polish, overall user experience |
| Technical Implementation | 20% | Technical quality, reliability, **meaningful integration with Sui** |
| Presentation & Vision | 10% | Clarity, storytelling, long-term vision |

> handbook 直接點出:"Strong projects typically solve **meaningful problems**, have polished UX, leverage Sui meaningfully, demonstrate strong product thinking, show **long-term potential beyond the hackathon**. Overflow is focused on **meaningful products and ecosystem impact, not just technical demos**."

**對我們的暗示**:不能只 demo「能 mint」,要講清楚**「為什麼有人要用」**。Pitch 必須有具體 real-world use case(遊戲資產供應、UGC marketplace、metaverse asset、agentic NFT…),不能是純技術秀。

### 1.4 Submission Checklist(handbook 原文)

| 欄位 | 要求 |
|---|---|
| Project Name | Clear + simple |
| Description | What it does, why it matters |
| **Project Logo** | **1:1 ratio (JPG/PNG)** |
| **Public GitHub Repo** | **judging 期間必須 public** |
| **Demo Video** | **YouTube preferred, ≤ 5 min** |
| Website | Optional, **highly recommended** |
| **Deployment** | **Testnet 或 Mainnet**(8/27 前 mainnet 才能拿 100% 獎金) |
| **Package ID** | 若 deploy on-chain 必填 |

### 1.5 Eligibility(handbook 原文)

> "Projects submitted to Sui Overflow 2026 must be built during the official hackathon build period starting **May 7th to June 21st, 2026**. The project must be deployed to the Sui mainnet or testnet **at the time of shortlisting and demo day**. **Existing projects are permitted only if substantial new functionality, features, or integrations are developed specifically during the hackathon period.**"

對我們:從零開始,沒問題。

### 1.6 確認的 2026 Sponsors + Resource Hub

| Tier | Sponsor |
|---|---|
| **Headline Partner + Track Sponsor** | **Walrus** — "The Verifiable Data Platform in AI and onchain finance" |
| Track Sponsor | DeepBook |
| Prize Sponsor | OpenZeppelin、OtterSec |
| Award Sponsor | Scallop |

⚠️ 2025 列過的 Hippo、Navi、Wormhole、Alibaba Cloud、Dubhe 在 2026 handbook **沒列**。

**Handbook 列的官方資源**:

- **Getting Started**:[Sui Founder Starter Pack](https://sui.io/) / [Sui Docs](https://docs.sui.io/) / [Mysten TS SDK](https://sdk.mystenlabs.com/) / [awesome-sui](https://github.com/sui-foundation/awesome-sui) / [sui-move-bootcamp](https://github.com/sui-foundation/sui-move-bootcamp)
- **Walrus 主攻 stack**:[Walrus docs](https://docs.wal.app/) / CLI / HTTP API / TS SDK / Public aggregators and publishers
- **[MemWal (Walrus Memory)](https://docs.wal.app/)** ← **新關鍵字,待調研** — playground + GitHub repo + sample apps + skills。「verifiable data and memory layer」很可能就是這層
- [Walrus Sites docs](https://docs.wal.app/) — site-builder CLI(考慮把 demo 部署成 Walrus Site)
- **[Seal docs](https://seal-docs.wal.app/)** — privacy layer for Walrus and MemWal
- **Sui Stack Messaging** — Walrus storage + Seal privacy
- 社群:Telegram(找隊友 / mentor)、X(announcements)、Office Hours(handbook 寫 "posted soon")、[Slush wallet](https://my.slush.app/)(demo 用)

### 1.7 戰略總結(Walrus track 新 framing 必須吸收)

> **⚠️ D-029 修訂(2026-05-20):D-013 的「L2 deferred 到 v1.1」已被反轉。** L2 / NFT collection 層(nft creator 從 Model3D launch `NftCollection`,持 `NftCollectionCreatorCap` 含 register_fee + integration registry;gameDev 付費 register_integration)現在是 **v1 真實 product surface**。本節下方所有「L2 deferred」「composable 是 v2 vision」「2-actor 敘事」的描述以 D-029 + `docs/brainstorms/2026-05-19-four-role-product-realignment.md` 為準。D-013 的 Kiosk-promotion 與 narrowed-framing 部分仍有效,只有 L2-deferral 子句被反轉。pay-per-generate 同步 descope 到 v1.1(demo 用 service-funded Tripo)。
>
> **⚠️ D-031 補充(2026-05-20)**:層級語意釐清——**L1 `Model3D` 賣 access(Seal-gated,v1.1)、L2 `NftToken` 賣 ownership(Kiosk,v1)**。下方表格 row 3「Access soulbound」描述的是 L1 access-receipt 機制,屬 **v1.1**(Seal)。
>
> **⚠️ D-032 定案(2026-05-20)**:`Model3D` 改回 **shared object**(`publish` entry fn,非 Kiosk)。**所有 Kiosk / `TransferPolicy` / royalty 機制只存在於 L2 `NftToken`**;L1 的 `mint_and_list` / `purchase_with_kiosk` / `TransferPolicy<Model3D>` 已移除。shared `Model3D` 可被跨錢包引用,讓不同錢包的 nft creator 能 `launch_collection` fork(解決 AC-003)。L1 v1 變現 = `derivative_mint_fee` + 下游 `NftToken` 銷售的 `base_royalty_bps`;Seal 直接 access-sale 仍是 v1.1。**OQ-020 定為 path (b)**:6/21 demo L1 只發佈,銷售故事在 L2。

**handbook 寫的 Walrus track 主題**:
> "Build AI agents and agentic workflows powered by Walrus **as a verifiable data and memory layer**"

舊 pitch「3D model generator + Walrus storage」要 reframe。最強的角度:

**v1 framing(D-013 收斂,2026-05-14)Sui-Native 3D NFT Economy — 5 個 Sui+Walrus 獨家賣點**:

| # | 賣點 | 機制 | 對手做不到的原因 |
|---|---|---|---|
| 1 | Royalty 強制在 protocol 層 | Sui Kiosk + TransferPolicy | OpenSea / Blur 2023 royalty 戰 — Ethereum NFT 已死過一次 |
| 2 | License 寫進 Move struct 不可改 | `Model3D.license: LicenseTerms` | Unity 2023 偷改 TOS;Move type 一旦 publish 公開且不可竄改 |
| 3 | Access 是 soulbound | `Access has key` 沒 `store` | Sui ability system 是 bytecode 級保證,不是合約邏輯 |
| 4 | Storage 公司倒了 bytes 還在 | Walrus blob | Sketchfab → Fab 2024-10、Mixamo 2025-06 都有 user 失資料案例 |
| 5 | Provenance 鏈上可追 | Walrus lineage + Sui timestamp + content hash | Objaverse 80 萬 model 沒授權被抓 — 需要這種 chain-of-custody 證據 |

**這 5 條只有 Sui+Walrus 一起能交付**,任何一個元件換成 Ethereum / Solana / S3 / IPFS 就會缺一條。

**v2+ vision(post-hackathon,L2 真實 PMF signal 後)**:升級到完整 **Composable Creator Economy for 3D — Programmable IP Layer**,對標 Story Protocol($140M a16z,2D / 音樂 / 漫畫)— 我們做 3D / game asset vertical + Walrus native storage(Story 還在外接 IPFS)。**v1 沒這個 framing 是 D-013 的刻意決定** — L2 衍生需求未驗證前不主推。

**v1 三層架構(D-013:L2 deferred 到 v1.1)**:
```
L0  Agent Orchestration — LLM 解析 NL → catalog 路由 → 多步驟拆解 → lineage commit
     ↓
L1  Base Model3D + Kiosk — Creator A 上傳,Walrus 存 GLB + lineage,
                            LicenseTerms 寫死,Kiosk + TransferPolicy 強制 royalty
     ↓
(L2 Derivative)         — v1.1 deferred per D-013(Move 設計仍在 §2.8)
     ↓
L3  Game Integration    — Game dev C 買 access(soulbound),在遊戲裡用
```

**Agent layer(D-011 新增,D-014 更新 Generator selection)的具體行為**:
- **NL parse + catalog 路由**:用戶打「I want a small wooden chest, lid half open」→ LLM 輸出 `{generator: "chest", w: 0.6, h: 0.4, d: 0.4, lid_angle: 45, material: "wood"}`
- **多步驟拆解**:用戶打「5 dungeon props: barrel, crate, torch, sign, chest」→ LLM 拆 5 個 subtask → 5 個 generator call → 自動命名 series → 一次 batch mint(L2 Derivative 在 v1.1,v1 batch 為 L1 多 Model3D mint)
- **Generator selection(D-014 改)**:catalog 內 shape → `ProceduralGenerator`(TS + `@gltf-transform/core`,< 2s,manifold,$0/gen);catalog 外 shape → `TripoGenerator`(P1 model,`face_limit=5000`,`texture=false`,~2s,**creator 自費**)。Tripo demo 期間為 seed-only(team-as-creators 用 free tier 預生英雄物件,demo 觀眾只 browse 不 generate)
- **Lineage on Walrus**:每個輸出附 `lineage.json` blob(prompt + 決策 trace + params + generator source + base 關係)— **這就是 handbook 講的 verifiable memory layer 的實作**

**Browse-first marketplace flow(D-014 新增)**:

| User type | 路徑 | 付費 |
|---|---|---|
| 🛍 Buyer(大多數人) | Browse catalog → 找到合適 Model3D → Connect wallet → Buy Access | 付 SUI(royalty 回 creator) |
| 🎨 Creator(少數人) | Catalog 找不到 → Generate(procedural 免費 / Tripo 自費) → Mint Model3D | 付 Walrus 儲存 + 選擇性 Tripo |

Demo 主路徑是 Browse(20% 時間)+ Generate(20% 時間)+ Buy Access 顯示 protocol-level royalty enforcement(60% 時間,連結 §1.7 賣點 1)。`Model3D.tags: vector<String>` 欄位 v1 用於 filter / list,v1.1+ 可升級到 LLM 語意搜尋(見 `docs/open-questions.md` OQ-012)。

**Pitch story 一句**:**"Agentic 3D asset factory with on-chain IP composition, backed by Walrus as both asset storage AND agent memory."**

**對應金流**(全部 Move 強制,marketplace 改不掉):
- L3 用戶買 derivative → 自動拆給 C(主要)+ B(derivative_price 扣 royalty)+ A(base_royalty_bps × total)
- L2 衍生 mint → 一次性 `derivative_mint_fee` 給 A
- L1 直接 access → 全給 A

**License Policy(creator 自選)**:
- `restricted` — 禁止衍生(高價值 IP / 原稿保護)
- `allow_list` — base creator 核發 `DerivativeApproval` 給特定創作者(商業合作)
- `permissionless` — 任何人付 mint_fee 即可衍生(commodity asset)

**Royalty cap:30%**(protocol-level invariant,避免 base creator 嚇阻性收費)

**主推 framing(舊):Verifiable Game Asset Supply Layer**(這個 framing 仍適用,但 Composable Creator Economy 比它高一個維度)

**真實痛點(2024-2025 鐵證,評審查不倒)**:
1. **平台風險 — Sketchfab → Fab 遷移災難(2024-10)**:Epic 關掉 Sketchfab Store,**CC-BY-SA license 在 Fab 沒支援**,一個藝術家報失 60+ models。Change.org 連署稱「the virtual equivalent of burning the Library of Alexandria」。三週後 **Mixamo 認證掛點(2025-06-16)**,所有上傳的 character + rig 直接拿不回來。
2. **Royalty 強制執行壞掉**:Roblox 抽 **70%**($105 帽子創作者拿 $32),CGTrader 2025 把藝術家從 77% 砍到 70% — 引爆 forum 暴動。OpenSea 2023 **被 Blur 打到關掉 royalty enforcement**,80% NFT 量跑到零 royalty 平台。
3. **License 單方面改條款 — Unity 2023 runtime fee**:Unity **悄悄刪掉 GitHub 上的 TOS 歷史 repo**,然後追溯對已上架遊戲收 $0.20/install。Innersloth(Among Us)威脅整個換引擎。
4. **AI 訓練偷資料 — Objaverse 事件**:**Sketchfab 800,000+ 模型被 Allen Institute 沒授權抓走**做 Objaverse dataset。後續 Objaverse-XL 擴到 1000 萬+。藝術家標記 NoAI tag 也沒用(dataset 早於 tag)。
5. **盜版重上架**:CGTrader / TurboSquid 上有組織化盜版群,從別站抓 → 重 render → 重上架。DMCA 處理要幾週,小偷在中間賺飽。

**我們解什麼**:
- **平台風險** → **Walrus blob immutable + Sui object 鏈上 ownership**。Mysten 公司倒、Epic 改策略,bytes 跟所有權都不會消失。
- **Royalty enforcement** → **Sui Kiosk + TransferPolicy 在 protocol level enforce** — 是物件型別本身的規則,marketplace 改不掉。**這就是 Sui 比 Ethereum NFT 強的地方**(OpenSea/Blur 案例正好是反面教材)。
- **License 透明** → license 寫進 Move struct,鏈上永遠可讀。不能追溯改條款。
- **AI 訓練可驗證** → 每個 model 有鏈上 license metadata + Walrus content hash。AI 公司如果有用,可被反向證明。
- **Provenance** → 鏈上 timestamp + content hash = 不可竄改的「first publish」證據。盜版上來一查就知道誰先。

**對 pitch 的優先序**(handbook Real-World 50% 怎麼打):
- **開場 hook 用 Sketchfab→Fab 故事** — 具體、可查證、不需懂 web3 也聽得懂
- **技術差異化用 Sui Kiosk royalty enforcement** — 對懂 NFT 失敗史的評審大加分
- **不要主推「跨遊戲資產可攜」** — StepN/Axie 已死,評審會打臉
- **不要主推「composability / remix」** — 沒實際痛點證據

**我們命中**:**Real-World Application 50% + Walrus 的「verifiable data layer」框架 + Sui Kiosk protocol-level enforcement**

**Pitch deck 必須含**(50% Real-World Application 怎麼打):
1. 具體 customer profile(Unity solo dev / Roblox creator / web3 game studio)
2. 具體 use case story(30 秒 narrative)
3. Post-hackathon roadmap(Seal-paywalled premium models、game engine SDK、marketplace、collections)
4. **Traction signal**(就算只是「10 個 Discord beta testers」「3 個 game dev LOI」也好)
5. **附一個 Unity / Three.js sample scene 真的用了這個 NFT** ← real-world application 鐵證

**會勝出的版本**(2026-05-14 升級成 3 場景串接):
- **場景 1(L1):** Creator A 用 Google(zkLogin)登入,設定 sword 參數 → < 2 秒預覽 → 確認 → **gas 免費** mainnet publish。**直接設 `permissionless` license + 10% royalty**。
- **場景 2(L2):** Creator B 用同一 UI fork 那把劍,做「赤龍劍系列 5 把變體」→ mint 為 5 個 `Derivative` → Sui Explorer 顯示 A 收到 `derivative_mint_fee × 5`
- **場景 3(L3):** Game dev C 買 1 把赤龍劍的 access → 切 Three.js sample game 揮砍 → **同一 tx 鏈上自動拆給 C(85%)+ B(5%)+ A(10%)**(殺手 — protocol-level enforcement)
- 全程串起來 < 90 秒

**會被刷掉的版本**:
- 預先生成好的 model
- 沒 fund 的 testnet wallet
- Walrus 只是「上傳一次」沒 lifecycle
- 沒講「為什麼有人要用」(會死在 Real-World Application 50%)

**獨特賣點要講**:「constrained input → mint-worthy 一致性」。市面上 generative 都是「打字得到 AI slop」,我們是 **domain-locked 一致性 asset + on-chain ownership** — 這是真的產品 wedge,不只是 demo。

### 1.8 Tripo / Meshy 競品差異化清單(寫進 pitch slide)

> **2026-05-14 D-011 update**:本表寫於「我們 vs Tripo」的純對立框架。**D-011 之後 Tripo 也成為我們的 pluggable generator candidate**(Phase 3 才決定要不要接)。但 **`ProceduralGenerator` 永遠是 primary**,下表所有對打優勢仍適用 — 包括「Tripo 是黑盒、creator 拿不到 IP」這條:**只在 Phase 3 wire Tripo 的話走 Pro tier ($11.94/mo) 商用授權**,§1.8 IP 論述完整成立。Hybrid 的角度看:「**我們是 AI generator 的 IP-clean orchestration layer**」— 這個 framing 比純對立更強。

**Tripo 是 AI 3D generator 市場現在的代表**,但實際輸出有一堆雷,我們的 procedural 方案剛好一一打到痛點。

| 維度 | Tripo(實際表現) | 我們 |
|---|---|---|
| **Topology** | AI 三角網,**manifold 不保證**(評論:「chaotic web of triangles, fused vertices, overlapping faces」) | **Procedural,保證 manifold**(物理引擎可用) |
| **Quad mesh** | 要 `quad=true` 強制 FBX,額外 $0.05/gen | 想做就做,自由 |
| **Scale** | **沒有統一標準** — 生成的車跟硬幣同大小,要手動 rescale | **Canonical: 1 unit = 1 meter** |
| **Pivot** | 幾何中心(地面對齊很煩) | **腳底 / 握把**(直接放地上 / 角色手上) |
| **UV** | Tripo 自己文件承認「AI-generated UVs can be messy」 | **乾淨 planar / box mapping** |
| **商用 license** | Free 版 CC BY 4.0 **不能商用**;Pro $11.94/mo 才能 | **on-chain ownership 永久商用憑證** |
| **持久性** | Tripo 倒了,你的 model URL 失效 | **Walrus + Sui 永久** |
| **Royalty** | 無 | **Sui Kiosk protocol-level enforcement** |
| **Per-gen 成本** | 20–40 credits / gen,$0.05+ surcharge | **Zero per-gen cost**(procedural 跑自家 Node server,~50ms CPU) |
| **失敗率** | 用戶報「~1/10 不用清理就能直接用」 | 100%(constrained input → 保證合法 mesh) |
| **Creator 抽成** | Tripo 拿 100% 訂閱費,creator 拿 0(訓練資料黑箱吃掉) | **Creator 自定價收 ~100%**(Sui gas + 可選 marketplace 抽成) |
| **衍生 / IP layering** | 無概念 — 你做的衍生作 Tripo 跟你拆 0 | **L1 base → L2 derivative,protocol 自動分潤,有 cap、有 policy(restricted / allow_list / permissionless)** |
| **Recurring revenue 給 creator** | 無 | **base creator 衍生品永久收 royalty(≤ 30% cap)** |

**對 web/mobile/desktop 遊戲開發者來說最通用的格式**:**GLB(glTF 2.0 binary)** — 已是 ISO/IEC 12113:2022 國際標準。Three.js / Babylon / PlayCanvas / Unity(`com.unity.cloud.gltfast` first-party)/ Unreal(內建 + glTFRuntime)/ Godot(native)全部支援。PlayCanvas 實測 GLB 比 JSON glTF 解析快 17×。
- **唯一例外**:Apple iOS / Vision Pro AR Quick Look 只吃 **USDZ** — stretch 可加 GLB→USDZ 轉換,同 Walrus blob ID 存兩變體。
- Walrus 單 blob 上限 13.3 GiB,我們的 200KB–2MB GLB 完全沒壓力。

**v1 只出 GLB,不要做 FBX**(只有 Maya/Max 再編輯場景才需要,我們的場景是 game-engine consumption)。

### 1.9 一句總結

**「Agentic by orchestration, manifold by construction, enforced by Sui Move, persistent by Walrus.」**
(D-013 update:`commercial by chain` + `composable by design` → 收斂為 `enforced by Sui Move` + `persistent by Walrus`,直接對到 5 賣點機制)

- **Agentic by orchestration**(D-011):LLM router 解析 NL → 路由 generator → 拆解多步驟 → lineage 上 Walrus — 對打 Tripo 的「點 button 等」黑盒 UX
- **Manifold by construction**:procedural primary,保證可放物理引擎 — 對打 Tripo 的 AI mesh 雷
- **Enforced by Sui Move**(D-013 升級):Sui Kiosk + TransferPolicy 強制 royalty(賣點 1)、LicenseTerms 寫死(賣點 2)、Access soulbound(賣點 3)— 對打 Ethereum NFT royalty enforcement 失敗、Unity 條款追溯改、Solana/ETH soulbound 只是合約邏輯
- **Persistent by Walrus**(D-013 升級):去中心化 blob storage(賣點 4)+ lineage record(賣點 5)— 對打 Sketchfab/Mixamo 倒站、S3/IPFS 單點

**Tripo 是 SaaS,Story 是 2D IP layer,Ethereum 做 royalty 失敗。我們是 3D 的 agentic factory + Sui 獨家 5 賣點 NFT economy + Walrus native storage。v2+ 升級到完整 Composable Creator Economy(L2 真實 PMF 後)。**

---

## 2. Walrus 技術深度

### 2.1 心智模型

- **Blob bytes** 完全存在 **off-chain**(Walrus storage nodes,用 RedStuff 2D 抹除編碼分散到 ~1000 個 shards,replication factor ~4.5x)
- **`Blob` Sui object** 是**鏈上憑證 + 儲存承諾** — 不含 bytes,只有 `blob_id (u256)`、`size`、`encoding_type`、`registered_epoch`、`certified_epoch`、嵌入的 `Storage` resource、`deletable: bool`
- 鏈下讀 bytes:給 aggregator `blob_id` → `GET https://aggregator.walrus-testnet.walrus.space/v1/blobs/<blob_id>`

### 2.2 Lifecycle

| 概念 | 細節 |
|---|---|
| Epoch 長度 | **testnet = 1 天 / epoch**,**mainnet = 2 週 / epoch** |
| `epochs` 參數 | writeBlob 時付幾個 epoch 的儲存費。**app 預設 = `53`(network max,D-108)** — testnet ≈ 53 天(涵蓋 6/21 提交 + 7/20–21 demo day),mainnet ≈ ~2 年。**舊預設 10 epochs ≈ testnet 10 天會讓 demo 內容被 GC**(aggregator 回 503 `BLOB_UNAVAILABLE`,無 grace period) |
| 最長期限 | 兩個 network 都是 `max_epochs_ahead = 53`(testnet ≈ 53 天,mainnet ≈ ~2 年)。**單次上傳超過 53 epochs 會被協定拒絕** — 想存更久只能在過期前 `extend_blob` 續存,或上 mainnet |
| `deletable: true` | 持有者可以呼叫 `system::delete_blob` 提前釋放並**回收 Storage resource** 拿去存別的 blob |
| `deletable: false` | `delete_blob` 會 abort(`EBlobNotDeletable`)— bytes 保證活到付的 epoch 結束 |
| 過期 | **沒有 grace period** — `end_epoch` 一到 storage nodes 就可以 GC slivers |
| Extension | 任何人都可以付錢延長(`system::extend_blob`)— 這就是 `SharedBlob` 模式的「viewer 集資養 NFT」基礎 |

### 2.3 成本(重要校準)

兩種貨幣同時付:
1. **WAL** — 儲存費(per encoded unit × epochs)+ system write fee
2. **SUI** — gas,**最多 3 個 tx**:`register_blob` / `certify_blob` / 視情況 `delete_blob` 或 `extend_blob`

**關鍵**:encoded size ≈ 5x raw + 一個 metadata floor(~64 MB 等價)。**< 10 MB 的 blob 都會撞到 floor** — 你存 100 KB 跟存 5 MB 價錢差不多。所以對小 GLB 來說「壓縮 mesh」沒有省到錢,別花時間最佳化。

具體數字:storage committee 每 epoch 會 re-price,**不要把任何數字硬寫進 spec**。要拿即時價格用 `walrus info` 或 SDK 的 `systemState`。

### 2.4 瀏覽器上傳的現實

**直接從瀏覽器寫 Walrus 是錯的**:
- ~2,200 個 HTTP 請求(一個 sliver 一個)分散到 storage nodes
- 大部分 storage nodes 不對任意瀏覽器 origin 開 CORS
- 加密/編碼是 WASM,要先 load `@mysten/walrus-wasm`

**正確做法**:用 **upload relay**(testnet 用 Mysten 官方 `https://upload-relay.testnet.walrus.space`)
- Relay 接收已編碼的 blob,**伺服器端**幫你分散寫到所有 storage nodes
- 你還是要在瀏覽器簽 `register_blob` 和 `certify_blob`(relay 看不到你的 key)
- Relay 收一個 **tip**(MIST = 10⁻⁹ SUI),`sendTip: { max: 1_000 }` 設上限,client 會自動從 `GET {host}/v1/tip-config` 拿到要付多少
- Testnet relay 通常 tip 接近 0;mainnet relay 會真的收錢

### 2.5 TypeScript SDK 實際 API(`@mysten/walrus@1.1.7`)

確認版本:**2026-05-08 train**,搭配 `@mysten/walrus-wasm@0.2.2`。

**Setup**(Vite) — per D-019, `@mysten/sui@2.16.2` 已把 `SuiClient` 拆成 `SuiJsonRpcClient` + `SuiGrpcClient`,且 `walrus()` extension 不再吃 `network` option:

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

JSON-RPC client deprecation 期限 July 2026(在 Phase 5 submission 之後),`SuiGrpcClient` 遷移留給 v1.1+。Phase 2 全程用 `SuiJsonRpcClient`。

**一次性寫(後端用 keypair)**:

```ts
const { blobId, blobObject } = await client.walrus.writeBlob({
  blob: file,              // Uint8Array(GLB bytes)
  deletable: false,        // Model3D 包住它,生命週期由合約管
  epochs: 53,              // D-108 — network max; app 預設見 useWalrusUpload.ts
  signer: keypair,
});
```

**瀏覽器分段寫(用戶錢包簽,推薦給 mint flow)**:

```ts
const flow = client.walrus.writeFilesFlow({ files: [glb] });
await flow.encode();                                            // 本地 WASM
const registerTx = await flow.executeRegister({                 // wallet popup 1
  signer, epochs: 53, deletable: false, owner: address,   // D-108 — network max
});
await flow.upload({ digest: registerTx.txDigest });             // relay HTTP
await flow.executeCertify({ signer });                          // wallet popup 2
// 接著用 PTB 把 Blob 餵給 model3d::mint(...)— popup 3
```

**讀**:
- SDK:`client.walrus.readBlob({ blobId })`
- 或直接 aggregator HTTP:`GET https://aggregator.walrus-testnet.walrus.space/v1/blobs/<blobId>`

### 2.6 Move `Blob` 型別與包裝

**型別路徑**:`walrus::blob::Blob`
- 來源:[`contracts/walrus/sources/system/blob.move`](https://raw.githubusercontent.com/MystenLabs/walrus/main/contracts/walrus/sources/system/blob.move)
- Abilities:**`has key, store`** — 可以當另一個 struct 的欄位 ✅
- **沒有 `drop` 也沒有 `copy`** — 不能默默丟掉,也不能複製

**System object IDs**(穩定,可硬寫):
- Testnet:`0x6c2547cbbc38025cf3adac45f63cb0a8d12ecf777cdc75a4971612bf97fdf6af`
- Mainnet:`0x2134d52768ea07e8c43570ef975eb3e4c27a39fa6396bef985b5abc58d03ddd2`

**Package address**(會隨升級變)**不要硬寫** — `Move.toml` 用 **MVR alias `@walrus/core`**;TS 端用 SDK 的 `network: 'testnet'|'mainnet'` 內建預設。

### 2.7 包裝 Blob 的官方參考實作

**A. `SharedBlob`(Walrus repo 內建,最乾淨的 wrap 範例)** ← **照這個寫**

```move
public struct SharedBlob has key, store {
    id: UID,
    blob: Blob,
    funds: Balance<WAL>,
}
public fun new(blob: Blob, ctx: &mut TxContext) {
    transfer::share_object(SharedBlob {
        id: object::new(ctx), blob, funds: balance::zero()
    })
}
```

含 `extend(...)` 讓任何人投 WAL 進去延長 blob — 適合 NFT 永續邏輯。

**B. OnlyFins**([repo](https://github.com/MystenLabs/onlyfins-example-app))
- 用 `image_blob_id: String` 存 blob ID 字串,**沒有把 `Blob` 物件包進去** — 比較省 gas、destructor 不用想,但**鏈上不保證 blob 還活著**
- 適合社交貼文,**不適合 NFT** — 因為 transfer 不會把儲存承諾一起搬

### 2.8 我們的 Move 設計 — Design B(Content + Access)+ Derivative Layer

> **⚠️ D-029 / D-030 / D-031 更新(2026-05-20)**:本節描述的 `Access` struct 已在 v3 合約**刪除**;整合 gate 改為 collection-level 的 `NftCollection.integration_policy`(nft creator 經 cap 設定),不再是 model-level `license.policy` 的 snapshot。
>
> **D-031 釐清層級**:**L1 `Model3D` 賣 access(存取權,Seal-gated,v1.1)、L2 `NftToken` 賣 ownership(擁有權,Kiosk + royalty,v1)**。`LicenseTerms.policy` 是 L1 的**存取控制**維度(RESTRICTED = 僅 creator、ALLOW_LIST = creator + 付費存取者、PERMISSIONLESS = 任何人),其**真正執行需要 Seal**(加密 Walrus blob + `seal_approve` 驗 access 收據)→ **排 v1.1**;v1.1 會重新引入一個 access-receipt(即 R22 刪掉的 `Access` 的 analog)。
>
> **⚠️ D-032 定案(2026-05-20)**:`Model3D` 改回 **shared object**(`publish`,非 Kiosk)。L1 的 Kiosk 路徑(`mint_and_list` / `purchase_with_kiosk` / `TransferPolicy<Model3D>` / `RoyaltyPaid`)**已從 v3 合約移除**;**Kiosk / TransferPolicy / royalty 只在 L2 `NftToken`**。shared `Model3D` 跨錢包可引用 → 不同 nft creator 能 `launch_collection` fork(解決 AC-003)。L1 v1 變現 = `derivative_mint_fee` + 下游 `NftToken` 的 `base_royalty_bps`。**OQ-020 定為 path (b)**:6/21 demo L1 只發佈,銷售在 L2。下方 `Access` / `AccessPurchased` 為歷史設計;實作以 `contracts/model3d/sources/model3d.move` 為準;§2.8 全面改寫排程於 Phase 5。
>
> **⚠️ D-035 / D-036 定案(2026-05-20,v4 republish)**:**L2 `NftToken` 現為 plain owned object**——`mint_nft_token` 直接 `public_transfer` 給 caller(**不再 auto-place 進 Kiosk**);上架販售改為獨立的 opt-in `place_and_list<NftToken>` PTB。`TransferPolicy<NftToken>` **只留 `royalty_rule`**(移除 `kiosk_lock_rule` + `personal_kiosk_rule`),所以買家買到後可自由使用 token——代價是 **royalty 變成賣家 opt-in、非協議強制**(可繞過 Kiosk 直接轉移即 0 royalty,見 [[D-036]] Consequences)。**D-035**:`NftCollection` += `quilt_blob_id`、`NftToken` += `patch_id`(每個 token 綁一個 quilt 變體 patch,經 by-quilt-patch-id aggregator 解析 GLB);`launch_collection` / `mint_nft_token` 簽名隨之改變。v4 package `0x3b6b7258…`(supersedes v3 `0x35ba17b3…`)。
>
> **⚠️ D-037 定案(2026-05-20,v5 republish)**:`Model3D` += `glb_blob_id: String`(完全比照 `lineage_blob_id`:同 `MAX_BLOB_ID_LEN` 上限 + `EBlobIdMalformed` code + accessor),`new_model` / `publish` 簽名各加一個 `glb_blob_id` 參數。GLB 以**獨立 Walrus blob**(非 quilt)上傳,經 `/v1/blobs/<glb_blob_id>` 解析。補上 L1 GLB 解析缺口——Browse 能預覽 L1 base mesh、nft creator 能 fork base(U12 前置)。`ModelPublished` event layout **不變**(GLB 從物件欄位解析,indexer 不需新欄位)。v5 fresh republish(struct 加欄位非 in-place upgradeable),package id 見 [[D-037]] / `docs/reports/phase-4-v5-republish.md`(U19)。
>
> **⚠️ D-038 定案(2026-05-21,v6 republish)**:新增 batch entry fn `launch_collection_with_tokens(model, payment, quilt_blob_id, register_fee, token_names, token_patch_ids, ctx)` —— 模組內一次做完 launch → set fee → mint N 個 owned token → share collection → transfer cap+tokens,讓 nft-creator **一個簽名發行整個變體系列**(把 launch + mint 兩個 tx 併成一個)。純 additive:抽出 package-private cores(`launch_collection_internal` / `mint_nft_token_internal`),既有 `launch_collection` / `set_register_fee` / `mint_nft_token` 簽名不變、仍可單獨使用。新 abort code `EBatchLenMismatch = 37`。雖屬 additive(可 compatible upgrade),為與 v3–v5 一致仍走 fresh republish。package id 見 [[D-038]] / `docs/reports/phase-4-v6-republish.md`(U21)。

> **⚠️ D-040 定案(2026-05-21,v7 republish)**:**L1 license policy 現在會被強制執行**。新增 `EPolicyRestricted = 38` + `launch_collection_internal` 頂部一個 assert:`policy == PERMISSIONLESS || ctx.sender() == model.creator`(同時罩住 `launch_collection` 與 `launch_collection_with_tokens`)。語意收斂為兩種:**PERMISSIONLESS** = 任何付 fork fee 者可衍生;**RESTRICTED** = 僅 base creator 可衍生。**ALLOW_LIST(1)在 v1 退化為 creator-only**(fail-safe)—— 本節下方描述的 `DerivativeApproval` capability-token 流程(§約 514 / 652 / 688–703)**尚未在合約實作**,`/create` 也已移除 allow-list 選項。走 **fresh republish 而非 compatible upgrade**:強制執行類變更若用 compatible upgrade,舊的「未強制」版本仍可被呼叫繞過(見 [[D-040]] / `contracts/UPGRADE.md`)。本節 §2.8 完整重寫排入 Phase 5;此處先標註避免失真。v7 package id 見 [[D-040]] / `contracts/networks/testnet.json`。

> **重要設計轉折**:原始 spec 把 `Model3D` 當 NFT(一人 mint 一個)。**這個版本不是。**
>
> `Model3D` = **content**(creator 上傳一次,1000 人可以同時付費存取)
> `Access` = **soulbound 收據**(誰付過錢的證明,不可轉售)
> `Derivative` = **2nd-tier 衍生作品**(creator B 拿 base 改造 / 系列化,自動分潤給 base)
>
> **架構=composable creator economy**,不是 NFT collection。

#### 設計約束(來自產品決策)

1. **衍生層級 1 層**(base → derivative,**不允許** derivative → derivative)
2. **License policy 三選一**:`restricted` / `allow_list` / `permissionless`
3. **Royalty cap 強制 30%**(protocol-level invariant,避免套娃失控 + 抑制嚇阻性高收費)
4. `allow_list` 模式用 **capability token pattern**(`DerivativeApproval`)— 不存 `vector<address>`,避免熱迴圈 gas

#### 完整 Move struct

```move
module model3d::model3d;

use std::string::String;
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::event;
use sui::sui::SUI;
use sui::transfer;
use walrus::blob::{Self, Blob};
use walrus::system::{Self, System};
use walrus::wal::WAL;

// === Constants ===
const POLICY_RESTRICTED:     u8 = 0;   // 禁止任何衍生
const POLICY_ALLOW_LIST:     u8 = 1;   // 必須 base creator 核發 DerivativeApproval
const POLICY_PERMISSIONLESS: u8 = 2;   // 任何人付 mint_fee 即可衍生

const MAX_DERIVATIVE_ROYALTY_BPS: u16 = 3000;  // 30% 上限(protocol-level)

// === Errors ===
const ERoyaltyTooHigh:        u64 = 0;
const EWrongPolicy:           u64 = 1;
const EWrongApproval:         u64 = 2;
const EApprovalNotYours:      u64 = 3;
const ENotCreator:            u64 = 4;
const EInsufficientPayment:   u64 = 5;
const EWrongModel:            u64 = 6;
const ENotAccessHolder:       u64 = 7;
const EExpired:               u64 = 8;
const EDerivativeMustRestrict: u64 = 9;
// D-018 — input bound assertions
const ETooManyTags:           u64 = 10;
const ETagTooLong:            u64 = 11;
const EParamsJsonTooLong:     u64 = 12;
const ENameTooLong:           u64 = 13;
const EBlobIdMalformed:       u64 = 14;

// === Types ===

/// License terms — snapshot 到 derivative 裡,base 改了不影響歷史衍生
public struct LicenseTerms has store, copy, drop {
    policy: u8,                      // RESTRICTED / ALLOW_LIST / PERMISSIONLESS
    derivative_mint_fee: u64,        // 衍生者初次 mint 一次性費用(MIST,給 base creator)
    derivative_royalty_bps: u16,     // 衍生品被 access 時 base 抽幾 bps(≤ MAX)
    commercial_use: bool,
    require_attribution: bool,
}

/// L1 — Base content。每個 model 一份。多人可同時 access,不是 NFT
public struct Model3D has key, store {
    id: UID,
    blob: Blob,                       // Walrus blob(public 或 Seal-encrypted)
    creator: address,
    shape_type: String,
    params_json: String,
    name: String,
    tags: vector<String>,             // D-014 + D-015 — Browse marketplace tag filter
    lineage_blob_id: String,          // D-015 — Walrus blob ID of lineage.json companion blob (on-chain link for D-011 verifiable memory layer)
    direct_access_price: u64,         // 0 = 免費;>0 = 付這筆才能 access
    is_encrypted: bool,               // 若 true,用 Seal 加密 → 需 Access 才能解
    license: LicenseTerms,            // 衍生規則
    created_at_ms: u64,
}

/// Capability token — base creator 核發給特定衍生者(allow_list 模式)
/// Soulbound(沒寫 transfer entry)
// === Below: L2 Derivative-related types — v1.1 deferred per D-013 ===
// (Design preserved; not shipped, not on testnet, not in v1 UI.)

public struct DerivativeApproval has key {
    id: UID,
    for_model_id: ID,
    derivative_creator: address,
    granted_at_ms: u64,
}

/// L2 — Derivative。一定指向 Model3D,**不能再衍生**
public struct Derivative has key, store {
    id: UID,
    blob: Blob,                       // 新的 Walrus blob(改造後 / 系列變體)
    base_model_id: ID,                // 指回 base
    base_creator: address,            // 快照 — 即使 base 轉移也不影響金流路由
    base_royalty_bps: u16,            // 快照 base.license.derivative_royalty_bps
    derivative_creator: address,
    derivative_price: u64,
    series_name: String,              // 例 "Red Dragon Series"
    variant_index: u64,               // 系列中第幾個(0..n)
    created_at_ms: u64,
}

/// Soulbound 收據 — 證明某人付過錢取得 access
/// 沒寫 transfer entry → 拿不出去賣
public struct Access has key {
    id: UID,
    target_id: ID,                    // 指向 Model3D 或 Derivative
    holder: address,
    expires_at_ms: u64,               // 0 = 永久;>0 = 訂閱式
}

// === Events ===

public struct ModelPublished has copy, drop {
    model_id: ID,
    creator: address,
    direct_access_price: u64,
    policy: u8,
}

public struct DerivativeMinted has copy, drop {
    derivative_id: ID,
    base_model_id: ID,
    base_creator: address,
    derivative_creator: address,
    series_name: String,
}

public struct AccessPurchased has copy, drop {
    access_id: ID,
    target_id: ID,
    buyer: address,
    paid: u64,
    base_royalty_paid: u64,           // 0 if buying Model3D directly
}

// === L1: Publish base ===

public fun publish(
    blob: Blob,
    shape_type: String,
    params_json: String,
    name: String,
    tags: vector<String>,            // D-014 + D-015
    lineage_blob_id: String,         // D-015
    direct_access_price: u64,
    is_encrypted: bool,
    license: LicenseTerms,
    clock: &Clock,
    ctx: &mut TxContext,
): Model3D {
    assert!(license.derivative_royalty_bps <= MAX_DERIVATIVE_ROYALTY_BPS, ERoyaltyTooHigh);
    // D-018: input bound assertions
    assert!(vector::length(&tags) <= 16, ETooManyTags);
    let i = 0;
    while (i < vector::length(&tags)) {
        assert!(string::length(vector::borrow(&tags, i)) <= 32, ETagTooLong);
        i = i + 1;
    };
    assert!(string::length(&params_json) <= 4096, EParamsJsonTooLong);
    assert!(string::length(&name) <= 128, ENameTooLong);
    assert!(string::length(&lineage_blob_id) <= 128, EBlobIdMalformed);

    let model = Model3D {
        id: object::new(ctx),
        blob,
        creator: ctx.sender(),
        shape_type, params_json, name, tags, lineage_blob_id,
        direct_access_price,
        is_encrypted,
        license,
        created_at_ms: clock.timestamp_ms(),
    };
    event::emit(ModelPublished {
        model_id: object::id(&model),
        creator: ctx.sender(),
        direct_access_price,
        policy: license.policy,
    });
    model
}

/// D-016 — Phase 2 entry function. Wraps publish() + share_object.
public entry fun publish_and_share(
    blob: Blob,
    shape_type: String,
    params_json: String,
    name: String,
    tags: vector<String>,
    lineage_blob_id: String,
    direct_access_price: u64,
    is_encrypted: bool,
    license: LicenseTerms,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let model = publish(
        blob, shape_type, params_json, name, tags, lineage_blob_id,
        direct_access_price, is_encrypted, license, clock, ctx,
    );
    transfer::share_object(model);
}

// === Allow-list 核發 / 撤銷 ===

// === Below: L2 Derivative entry functions — v1.1 deferred per D-013 ===

public fun grant_derivative_approval(
    model: &Model3D,
    derivative_creator: address,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(ctx.sender() == model.creator, ENotCreator);
    assert!(model.license.policy == POLICY_ALLOW_LIST, EWrongPolicy);
    transfer::transfer(
        DerivativeApproval {
            id: object::new(ctx),
            for_model_id: object::id(model),
            derivative_creator,
            granted_at_ms: clock.timestamp_ms(),
        },
        derivative_creator,
    )
}

/// Approval holder 自己可以放棄;base creator 沒有單方面撤銷的途徑
/// (簡單起見;若要 revoke 機制,改成 share_object + creator-only delete)
public fun discard_approval(approval: DerivativeApproval) {
    let DerivativeApproval { id, .. } = approval;
    object::delete(id);
}

// === L2: Mint derivative ===

/// PERMISSIONLESS 模式:任何人付 mint_fee 即可
public fun mint_derivative_permissionless(
    base: &Model3D,
    mut payment: Coin<SUI>,
    new_blob: Blob,
    series_name: String,
    variant_index: u64,
    derivative_price: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): Derivative {
    assert!(base.license.policy == POLICY_PERMISSIONLESS, EWrongPolicy);
    pay_mint_fee_and_construct(base, &mut payment, new_blob, series_name, variant_index, derivative_price, clock, ctx)
}

/// ALLOW_LIST 模式:吃掉一張 approval
public fun mint_derivative_with_approval(
    base: &Model3D,
    approval: DerivativeApproval,
    mut payment: Coin<SUI>,
    new_blob: Blob,
    series_name: String,
    variant_index: u64,
    derivative_price: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): Derivative {
    assert!(base.license.policy == POLICY_ALLOW_LIST, EWrongPolicy);
    assert!(approval.for_model_id == object::id(base), EWrongApproval);
    assert!(approval.derivative_creator == ctx.sender(), EApprovalNotYours);
    let DerivativeApproval { id, .. } = approval;
    object::delete(id);  // 一次性,用完即燒
    pay_mint_fee_and_construct(base, &mut payment, new_blob, series_name, variant_index, derivative_price, clock, ctx)
}

/// 內部 helper — 拆 mint_fee + 建 struct
fun pay_mint_fee_and_construct(
    base: &Model3D,
    payment: &mut Coin<SUI>,
    new_blob: Blob,
    series_name: String,
    variant_index: u64,
    derivative_price: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): Derivative {
    let fee = base.license.derivative_mint_fee;
    assert!(coin::value(payment) >= fee, EInsufficientPayment);
    if (fee > 0) {
        let fee_coin = coin::split(payment, fee, ctx);
        transfer::public_transfer(fee_coin, base.creator);
    };
    // 找零退回給呼叫者(由 caller 處理 payment 剩餘)
    let derivative = Derivative {
        id: object::new(ctx),
        blob: new_blob,
        base_model_id: object::id(base),
        base_creator: base.creator,
        base_royalty_bps: base.license.derivative_royalty_bps,  // 關鍵:快照 immutable
        derivative_creator: ctx.sender(),
        derivative_price,
        series_name,
        variant_index,
        created_at_ms: clock.timestamp_ms(),
    };
    event::emit(DerivativeMinted {
        derivative_id: object::id(&derivative),
        base_model_id: object::id(base),
        base_creator: base.creator,
        derivative_creator: ctx.sender(),
        series_name: derivative.series_name,
    });
    derivative
}

// === L3: Purchase access ===

/// 直接買 base 的 access
public fun purchase_model_access(
    model: &Model3D,
    mut payment: Coin<SUI>,
    duration_ms: u64,                  // 0 = 永久
    clock: &Clock,
    ctx: &mut TxContext,
): Access {
    assert!(coin::value(&payment) >= model.direct_access_price, EInsufficientPayment);
    transfer::public_transfer(payment, model.creator);
    let expires_at_ms = if (duration_ms == 0) { 0 } else { clock.timestamp_ms() + duration_ms };
    let access = Access {
        id: object::new(ctx),
        target_id: object::id(model),
        holder: ctx.sender(),
        expires_at_ms,
    };
    event::emit(AccessPurchased {
        access_id: object::id(&access),
        target_id: object::id(model),
        buyer: ctx.sender(),
        paid: model.direct_access_price,
        base_royalty_paid: 0,
    });
    access
}

/// 買 derivative 的 access — protocol-level 自動拆給 base creator 跟 derivative creator
public fun purchase_derivative_access(
    derivative: &Derivative,
    mut payment: Coin<SUI>,
    duration_ms: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): Access {
    let total = coin::value(&payment);
    assert!(total >= derivative.derivative_price, EInsufficientPayment);

    let to_base = (total * (derivative.base_royalty_bps as u64)) / 10000;
    if (to_base > 0) {
        let base_share = coin::split(&mut payment, to_base, ctx);
        transfer::public_transfer(base_share, derivative.base_creator);
    };
    transfer::public_transfer(payment, derivative.derivative_creator);

    let expires_at_ms = if (duration_ms == 0) { 0 } else { clock.timestamp_ms() + duration_ms };
    let access = Access {
        id: object::new(ctx),
        target_id: object::id(derivative),
        holder: ctx.sender(),
        expires_at_ms,
    };
    event::emit(AccessPurchased {
        access_id: object::id(&access),
        target_id: object::id(derivative),
        buyer: ctx.sender(),
        paid: total,
        base_royalty_paid: to_base,
    });
    access
}

// === Seal integration (optional v1.1) ===

/// Seal 解密前的 policy check — caller 持有 Access 且未過期 + 指向正確 target
entry fun seal_approve(
    id: vector<u8>,                   // Seal 的 IBE identity
    access: &Access,
    target_id: ID,                    // 由 PTB 傳入,要跟 access.target_id 對得上
    clock: &Clock,
    ctx: &TxContext,
) {
    assert!(access.target_id == target_id, EWrongModel);
    assert!(access.holder == ctx.sender(), ENotAccessHolder);
    if (access.expires_at_ms != 0) {
        assert!(clock.timestamp_ms() < access.expires_at_ms, EExpired);
    };
    // id 可以 namespace 為 hash(target_id, ...) — 留給實作時定
}

// === Walrus blob 永續 ===

/// 任何人可付 WAL 延長 base 的 blob — viewer 集資養 IP 的入口
public fun extend_model(
    model: &mut Model3D,
    system: &mut System,
    extended_epochs: u32,
    payment: &mut Coin<WAL>,
) {
    system::extend_blob(system, &mut model.blob, extended_epochs, payment)
}

public fun extend_derivative(
    derivative: &mut Derivative,
    system: &mut System,
    extended_epochs: u32,
    payment: &mut Coin<WAL>,
) {
    system::extend_blob(system, &mut derivative.blob, extended_epochs, payment)
}
```

#### 設計重點筆記

1. **`Model3D` 跟 `Derivative` 都 `has key, store`** — 可以放進 Sui Kiosk 走 TransferPolicy(post-MVP 加 royalty rule 強化第三方 marketplace 場景)
2. **`Access` 只 `has key`,沒 `store`** — 不能放進別的 struct,不能放進 Kiosk 賣,只能持有 → **soulbound by Move type system**
3. **`DerivativeApproval` 同理 soulbound** — 沒寫 transfer entry,grantee 只能用掉或丟掉
4. **`base_royalty_bps` 在 `Derivative` 是 snapshot** — base creator 之後改 `license_terms` 不影響歷史衍生 → 修補「事後改條款坑衍生者」的攻擊面
5. **找零策略**:`pay_mint_fee_and_construct` 沒幫 caller 退錢,**caller 必須在 PTB 後續處理剩餘 payment**(用 `coin::destroy_zero` 或轉回自己)。production code 應該幫 caller 退回
6. **No further derivation**:沒有 `mint_derivative_from_derivative` function — Move type system 保證 1 層
7. **Burn 函式**(`burn_model` / `burn_derivative`)沒寫進來但同理 — 內部 `blob::burn(blob)` 或 `system::delete_blob(...)`,參考 §2.6 寫法
8. **`is_encrypted: bool`** — `direct_access_price=0 && is_encrypted=false` 是純公開;`direct_access_price>0 && is_encrypted=true` 是付費內容。Phase 4 才用 Seal,Phase 1–3 全 `is_encrypted=false`

#### 跟 §2.7 SharedBlob pattern 的關係

- `Model3D` 還是抄 SharedBlob 把 `Blob` 包進去的模式 — 鏈上儲存承諾跟內容綁定,base creator 之外的人(觀眾 / 粉絲)可以付 WAL 延長 → 跟「養 IP」的 narrative 完全契合
- `Derivative` 也有自己的 `Blob`,**跟 base 的 Blob 是兩個獨立的 Walrus blob**(不是 reference 同一個 blob)— base 過期不會連帶把衍生品內容弄沒

### 2.9 公開 vs 私密

**Walrus 預設所有 bytes 公開可讀**。任何人拿到 `blob_id` 就能從 storage nodes 抓。`deletable` 跟 `owner` 只控鏈上物件,**不控鏈下 bytes**。

要私密 → **必須在上傳前加密** → Seal(見 §3)。

### 2.10 Network 狀態(2026-05)

- **Mainnet**:2025-03 上線,production-ready
- **Testnet**:穩定,但**可能 wipe**(雖然現在不常,別在 testnet 放長期資料)
- **SDK 最新**:`@mysten/walrus` 在 npm 上的線是 1.1.7(2026-05-08);另一份來源報 0.7.0 — 取較新且 publish 較近的 1.1.x 為準。**一定鎖版本**。
- **Whitepaper**:[arXiv 2505.05370](https://arxiv.org/abs/2505.05370)(2026-02 更新)

### 2.11 寫 code 時要記住的小陷阱

1. **WASM 載入**:Vite 用 `?url` import、Next.js 把 `@mysten/walrus` + `@mysten/walrus-wasm` 加進 `serverExternalPackages`。第一次 build 必踩雷。
2. **Epoch 切換**:遇到 `RetryableWalrusClientError` 表示 client cache 過期(testnet 每 24h),重建 client 重試。
3. **WAL faucet**:testnet WAL 和 testnet SUI 是**兩個獨立 faucet** — 兩個都要拿。
4. **不要硬寫 package ID** — `Move.toml` 用 MVR alias。
5. **`burn` vs `delete_blob`**:`delete_blob` 只在 `deletable=true` 才能用,但會**回收 Storage resource**(可重用);`burn` 任何 blob 都能用,但 Storage 浪費掉。Model3D destructor 偏好 `delete_blob`。

### 2.12 Walrus 文件 / source 索引

| 用途 | URL |
|---|---|
| Blob Move struct | https://raw.githubusercontent.com/MystenLabs/walrus/main/contracts/walrus/sources/system/blob.move |
| System(register/certify/extend/delete) | https://raw.githubusercontent.com/MystenLabs/walrus/main/contracts/walrus/sources/system.move |
| SharedBlob wrap 範例(**抄這個**) | https://raw.githubusercontent.com/MystenLabs/walrus/main/contracts/walrus/sources/system/shared_blob.move |
| TS SDK upload-relay 範例 | https://github.com/MystenLabs/ts-sdks/blob/main/packages/walrus/examples/upload-relay/write-blob.ts |
| Testnet config | https://raw.githubusercontent.com/MystenLabs/walrus/main/setup/client_config_testnet.yaml |
| Mainnet config | https://raw.githubusercontent.com/MystenLabs/walrus/main/setup/client_config_mainnet.yaml |
| OnlyFins 範例(對照,不要直接套) | https://github.com/MystenLabs/onlyfins-example-app |
| Storage Costs | https://docs.wal.app/docs/system-overview/storage-costs |
| Upload Relay operator guide | https://docs.wal.app/operator-guide/upload-relay.html |
| @mysten/walrus npm | https://www.npmjs.com/package/@mysten/walrus |
| SDK docs | https://sdk.mystenlabs.com/walrus |

---

## 3. Seal:MVP 不做,但要架構讓之後好加

### 3.1 一句話定位

Seal = **Sui 生態的去中心化機密管理層**。Walrus 解決「bytes 在不在」,Seal 解決「**誰能讀**」。

### 3.2 怎麼運作(架構心智模型)

```
Client 用 IBE 加密(key = (packageId, id))── 純本地,key servers 看不到 plaintext
    ↓
Ciphertext 上傳 Walrus / 任何儲存層
    ↓
要解密時:Client 組 PTB 呼叫你的 Move function seal_approve(id, ...)
    ↓
向 t-of-n key servers 要 IBE 解密金鑰 share
    ↓
每個 key server 對 Sui fullnode dry-run 那個 PTB
    └─ 不 abort = policy 通過 → 回傳 share
    └─ abort = 拒絕
    ↓
Client 組合 ≥ t 個 share → 解密
```

關鍵:
- **沒人持有完整 key** — 每個 key server 只持自己的 IBE master share,組合是在 client 記憶體裡瞬時做
- **Policy = Move code** — 你寫一個 `seal_approve(id, ...)` entry function,只要 abort 就拒絕、不 abort 就通過。任何 Move 能表達的條件都能當 policy(NFT 持有、subscription 付費、白名單、時間鎖、投票等)
- **Mainnet 已上線**(2025-09-03),7 個 operator(Ruby Nodes、NodeInfra、Studio Mirai、Overclock、H2O Nodes、Triton One、Enoki/Mysten)

### 3.3 SDK(`@mysten/seal@1.1.x`)

```ts
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { seal, SessionKey } from '@mysten/seal';

const client = new SuiGrpcClient({ network: 'testnet', baseUrl: '...' })
  .$extend(seal({
    serverConfigs: [
      { objectId: '0x...keyserver1', weight: 1 },
      { objectId: '0x...keyserver2', weight: 1 },
    ],
  }));

const { encryptedObject } = await client.seal.encrypt({
  threshold: 2, packageId: '0x...', id: '0x...policy-id', data,
});

const sessionKey = await SessionKey.create({
  address, packageId: '0x...', ttlMin: 10, signer, suiClient: client,
});

const plaintext = await client.seal.decrypt({
  data: encryptedObject, sessionKey, txBytes /* PTB calling seal_approve */,
});
```

### 3.4 範例 Move policy(white-list)

Seal repo `move/patterns/sources/whitelist.move`(原文):

```move
entry fun seal_approve(id: vector<u8>, wl: &Whitelist, ctx: &TxContext) {
    assert!(check_policy(ctx.sender(), id, wl), ENoAccess);
}
```

其他 ship-ready patterns:`subscription.move`、`tle.move`(time-lock encryption)、`private_data.move`、`voting.move`、`account_based.move`。

### 3.5 為什麼 MVP **不**做 Seal

- 我們的 model 是**公開** UGC,**沒有 policy 要 enforce** → Seal 純加成本
- 多了 operator 依賴(下方 §3.6 風險)
- Decrypt 要往 key servers + Sui fullnode 跑一輪,~ 百 ms 到 秒級延遲
- 38 天到 submission,先把 MVP + sample game 跑完整最重要;Seal 留在 Phase 4 stretch

### 3.6 但要**現在**留下這個架構決定

**Walrus blob URI 必須藏在 Sui Move 物件欄位裡** — 我們的 spec 已經這樣設(`Model3D { blob: Blob }`)。

之後要加 Seal,只是「把 `blob` 改成存 ciphertext 的 Blob,新增 `seal_approve` entry function」 — 不用大改架構。

**唯一要避免**:不要在前端或靜態 index 假設 blob 永遠是 plaintext。把 Walrus URI 當 opaque pointer。

### 3.7 怎麼接到我們的 Design B + Derivative 架構

> ✅ **已實作於 v9(2026-05-31)— plan-026 / D-074·D-075·D-076。本節已重寫對齊出貨版本(取代原 `Access`-based 設計)。**
> Seal 內容保護從原訂 v1.1 提前納入 6/21 submission(D-074)。加密由 policy 推導、發布當下固定;gate 綁在付費 fork 取得的 soulbound `NftCollectionCreatorCap`(ALLOW_LIST)或 base creator(RESTRICTED)。已刪除的 `Access` 收據(D-029/D-030)**不再使用**。

#### Seal 在這個架構裡的角色(v9 出貨版)

**加密由 policy 推導,發布當下固定**(`new_model` 內 `is_encrypted = (policy != PERMISSIONLESS)`,關掉原本裝飾性的 flag):
- **PERMISSIONLESS** → 不加密,Walrus blob 公開(L2 social-currency 展示照常)。
- **ALLOW_LIST** → 加密;任何人可 fork,但要付 fork fee 才拿得到能解密的 cap(pay-to-fork)。鏈上強制 `derivative_mint_fee > 0`(`EAllowListNeedsFee`)。
- **RESTRICTED** → 加密;只有 base creator 能 fork/解密。私人,不進 public catalog。

**信封加密(envelope)**:用 AES-256-GCM 加密 GLB,只用 Seal 包住那把 32-byte AES 金鑰(避開 Walrus 35/46 MB encoder OOM 懸崖;mesh decimation 已被否決)。密文走現有公開 CDN(D-073 不動)—— Seal 把關的是金鑰,不是 bytes。

**`seal_approve` gate**(non-public entry,key server dry-run、無 gas、abort = 拒絕):

> **D-078 更新(plan-027)**:解密 gate 從 per-collection cap 搬到 L1 **`AccessEntitlement`**(soulbound、一次購買、永久)。`seal_approve_cap` 已刪;消費者不必 launch collection 也能解密觀看。

| policy | 函式 | 檢查 |
|---|---|---|
| ALLOW_LIST | `seal_approve_entitlement(id, entitlement, model, ctx)` | `entitlement.model_id == id(model)` ∧ `entitlement.holder == sender` ∧ `is_prefix(model.seal_id, id)` ∧ `seal_version == VERSION` tripwire(單物件 gate,模仿 `seal_approve_creator`,不需 collection) |
| RESTRICTED | `seal_approve_creator(id, model, ctx)` | `is_prefix(model.seal_id, id)` ∧ `sender == model.creator` ∧ version |

**Seal id 綁定(Resolution G)**:object id 在 publish 才生成、但加密在 publish 前(雞生蛋),所以不能直接綁 object id;client 隨機選的 `seal_id` 又可被複製。改用 client 隨機 `seal_id`、`id = [seal_id][nonce]` 加密,並在發布時用一個 shared `SealIdRegistry`(`init` bootstrap)assert `seal_id` 全域唯一才記錄 → 提供等效且不可偽造的綁定,擋住「複製受害者 `seal_id` 來解其密文」的攻擊。

**買存取(D-078,fork 的前置 + 消費者觀看)**:`purchase_access`(付 **access_fee**,ALLOW_LIST 強制 > 0)→ soulbound `AccessEntitlement`(一次、永久;`Model3D.buyers` 表擋重複購買)。同一張 entitlement 同時服務「消費者 in-app 觀看」與「creator fork 的解密前置」。

**ALLOW_LIST fork(D-078:unlock 解密免費、derive fee 改在 mint 收)**:
1. SessionKey 簽一次 → `seal_approve_entitlement` PTB dry-run(憑 entitlement,**免費**)→ 解出 AES 金鑰 → 解密 base → 後端 bake variants → 上傳 quilt
2. `launch_collection_with_entitlement`(付 **per-launch derive fee**,may be 0)→ collection + soulbound cap(cap 在 mint 才生成)
3. `mint_tokens`(設 quilt + 批次鑄造)

> derive fee 可為 0;legacy `launch_collection`/`launch_collection_with_tokens` 對 ALLOW_LIST 一律 abort(`EEntitlementRequired`)→ 杜絕「沒買存取就免費 fork」的繞過洞。

PERMISSIONLESS 維持單筆原子 `launch_collection_with_tokens`。L2 `NftToken` 維持公開(價值在 ownership/provenance,不在 byte 機密)。**定位:緩解,非根絕**(R14)—— 不宣稱阻止已授權 forker 解密後外流;royalty 是鏈上硬軌(D-004)。

**ALLOW_LIST preview**:發布時 client 端從明文場景截浮水印 turntable stills,以公開 blob 上傳、id 記在 `Model3D.preview_blob_ids`,讓 forker 付款前評估。RESTRICTED 私人、無 preview。

#### Sui Kiosk + TransferPolicy 在這個架構裡的角色

> 註(2026-05-31):本小節原文基於已刪除的 `Access` / `Derivative` / `purchase_*_access`(D-029/D-032)。**出貨模型**:`Model3D` 是 **shared object,賣 Seal-gated access,不進 Kiosk**(D-032,所有權不轉移);可 Kiosk-traded 的是 **L2 `NftToken`(`key + store`)**,帶唯一的 `TransferPolicy<NftToken>` + royalty rule(D-036)。下面「第三方 marketplace 強制 royalty」的論點現在套在 `NftToken` 上。

Kiosk 解決**第三方 marketplace 強制 royalty** 場景(打到「OpenSea 2023 被 Blur 繞過 royalty」痛點):任何 marketplace 賣 `NftToken` 都得過 `TransferPolicy<NftToken>` 的 `confirm_request`,royalty 鏈上強制、繞不過。詳見 §2.8 + D-032 / D-036 / D-041。

#### Phase 4 優先級(更新 2026-05-31)

Seal 內容保護**已在 v9 出貨**(plan-026 / D-074·D-075·D-076,從原 Stretch 提前為已做);Forensic watermark 仍為未來 stretch(OQ-008)。原 §2.8 的 `Access` / `Derivative` / 8-entry 設計已被 D-029 → D-040 的 `NftCollection` / `NftToken` / `launch_collection` 模型取代 —— 出貨棧為 **Walrus + Seal + Move + Kiosk 四件套**。

參考:[Sui Kiosk docs](https://docs.sui.io/standards/kiosk)、[Empowering Creators with Sui Kiosk(Mysten 部落格)](https://www.mystenlabs.com/blog/empowering-creators-with-sui-kiosk)

### 3.8 Seal 風險清單

- **Liveness**:如果你選的 key servers 掛超過 `n-t` 個,**所有人都解不開**直到他們恢復
- **Policy bug = 永久性問題**:`seal_approve` 寫錯,要嘛永遠鎖死、要嘛永遠開放;有 versioning pattern(看 `whitelist.move` L27-29)但要主動做
- **No revoke**:一旦使用者解密完拿到 plaintext,後續從 whitelist 拿掉**不會收回已下載的 bytes**
- **Encrypt 快(envelope encryption,AES 對 bulk + IBE 對 DEK),decrypt 慢**(t 次 round trip + dry-run)

### 3.9 Seal source 索引

| 用途 | URL |
|---|---|
| Seal repo | https://github.com/MystenLabs/seal |
| Move patterns(直接抄) | https://github.com/MystenLabs/seal/tree/main/move/patterns/sources |
| Mainnet 上線文 | https://www.mystenlabs.com/blog/seal-mainnet-launch-privacy-access-control |
| TS SDK docs | https://sdk.mystenlabs.com/seal |
| @mysten/seal npm | https://www.npmjs.com/package/@mysten/seal |

---

## 4. SDK / 技術棧版本鎖(2026-05-08 release train)

**所有 `@mysten/*` 必須鎖同一個 release train,版本不齊會出現 `SuiClient` type incompatibility。**

| Package | Lock 版本 | 維護狀態 |
|---|---|---|
| `@mysten/sui` | **2.16.2** | 5/5 |
| `@mysten/dapp-kit` | **1.0.6** | 5/5 |
| `@mysten/dapp-kit-react`(1.0 拆出來) | 與 dapp-kit 同 | 5/5 |
| `@mysten/enoki` | **1.0.7** | 5/5 |
| `@mysten/walrus` | **1.1.7** | 5/5 |
| `@mysten/walrus-wasm` | **0.2.2** | 5/5 |
| `@mysten/seal`(frontend，**已出貨 v1**，D-074) | **1.1.3** | 5/5(post-mainnet, beta tag 仍在) |
| `@mysten/slush-wallet` | **1.0.5** | 5/5 |

| Frontend | 版本 | 維護 |
|---|---|---|
| `@babylonjs/core` | 9.6.2(2026-05-08) | 5/5 |
| `react-babylonjs` | 3.2.5-beta.2(**2025-05** 一年前) | **2/5 不要用** |
| `@react-three/fiber`(alt) | 9.6.1 | 5/5 |
| `three`(alt) | 0.184.0 | 5/5 |
| `gsap`(landing scroll spine,D-098) | **3.15.0** | 5/5 — ScrollTrigger 驅動 `/` 揭示/相機過渡;限 landing route |
| `lenis`(landing scroll spine,D-098) | **1.3.23** | 5/5 — 慣性平滑滾動;限 landing route,`prefers-reduced-motion` / 移動端降級不啟用 |

| Backend(D-012:TS unified) | 版本 | 維護 / 用途 |
|---|---|---|
| Node.js | 22.x LTS(or Bun 1.2.x) | 5/5 — runtime;`node:sqlite`(內建)做持久化 store(quota / replay guard,D-083 / D-088) |
| `hono` | 4.6.x | 5/5 — HTTP framework,Vercel / Cloudflare / Node 都跑 |
| `@gltf-transform/core` + `/extensions` | 4.x | 5/5 — GLB 構造 / 變換 |
| `meshoptimizer` | 1.1.x | 5/5 — mesh 處理 |
| `ai` + `@ai-sdk/google` | 6.x / 3.x | 5/5 — **Gemini**,prompt-authoring 接縫(Riff Copilot D-081 + Upload Captioning D-082)。⚠️ `@anthropic-ai/sdk` 已於 **D-023 移除** — generation-dispatch 路徑無 LLM;此 LLM 在另一個接縫(D-081 明言不推翻 D-023) |
| `@mysten-incubation/memwal` | 0.0.6 | 5/5 — Walrus agent-memory 層(D-080,所有權拆分 D-090) |
| `@mysten/sui` | 同 frontend 鎖 | 5/5 — server 端 lineage 簽章用 |
| `zod` | 3.x | 5/5 — structured-output / validation schema |

### 4.1 dApp Kit 1.0 拆分

- `@mysten/dapp-kit-core` — headless
- `@mysten/dapp-kit-react` — React components
- 舊的「monolith import」要更新

### 4.2 Enoki 訂閱與 sponsored tx

| 方案 | 月費 | 重點 |
|---|---|---|
| **Sandbox / Free** | $0 | 3 seats,**testnet 免費用**,**沒有 mainnet sponsored-tx 預算** |
| Starter | $69 | 7.5K MAU,3 mainnet apps,500M RPC |
| Professional | $120 | **$100/mo sponsored-tx 預算**,5 mainnet apps |

**Hackathon 結論**:demo 全程 testnet 用 free tier 即可。若要 mainnet sponsored tx,要付 $120/mo。

Sponsored tx 文件:https://docs.enoki.mystenlabs.com/ts-sdk/sponsored-transactions

### 4.3 BabylonJS:**drop `react-babylonjs`**

```
react-babylonjs:
- 最後 npm publish:2025-05-11(一年前)
- master 最後 commit:2025-09-03
- 單一維護者,Snyk 標 "Inactive"
- pin 到舊的 Babylon 6.x types,跟 9.x 會踩 TS 雷
```

**建議**:寫一個 40 行的 imperative React wrapper:`useEffect` 裡建 `Engine` + `Scene` + `LoadAssetContainerAsync`,refs 抓 canvas。Babylon 自家文件就是這樣教的。

[Babylon + React 官方 doc](https://doc.babylonjs.com/communityExtensions/Babylon.js+ExternalLibraries/BabylonJS_and_ReactJS)

**Bundle size 預期**:tree-shaken 後 `@babylonjs/core` + loaders + materials ≈ **400–700 KB gzipped**(含 GUI ~900 KB)。不小但 hackathon demo 可接受。

### 4.4 SuiGrpcClient

- **`SuiGrpcClient` from `@mysten/sui/grpc` 是正確選擇** — spec 寫的對
- JSON-RPC(舊的 `SuiClient` from `@mysten/sui/client`)在 **2026-07 左右除役**
- 所有 downstream SDK(Walrus、Enoki、dApp Kit)在 2026-05-08 train 都接受 Sui 2.x client — 看到 type mismatch 通常是某個 pkg 沒鎖到同版本

### 4.5 Sui CLI 與 Move

- **Sui CLI**:`mainnet-v1.71.1`(protocol v123)、`testnet-v1.72.1`(2026-05-12 release)
- **裝法**:`suiup`([github.com/MystenLabs/suiup](https://github.com/MystenLabs/suiup))統一管 `sui` / `walrus` / `mvr` — **2026 推薦方式**,別用 cargo install
- **Move 2024 syntax**(`module foo::bar;` 加分號)**正確且現行** — spec 寫對了
- `Move.toml` 設 `edition = "2024.beta"`
- 舊 module 用 `sui move migrate` 自動升級

### 4.6 後端 runtime + framework(D-012 改:TS unified)

- **Runtime**:Node.js 22.x LTS(default)或 Bun 1.2.x(若你喜歡 cold start 更快、internal benchmark 約 2–3x)。Hono 兩個 runtime 都支援,Phase 1 scaffold 選一個就鎖
- **HTTP framework**:**Hono**(~5KB,跑 Node / Bun / Vercel Functions / Cloudflare Workers 都可)
  - Express 4 是 OK 但 ecosystem 老,middleware 雜
  - Fastify 也 OK 但對 Bun 支援不如 Hono 完整
  - **Hono 是 D-012 預設**
- **Type sharing**:monorepo `shared/` workspace,`GenerateParams` / `LineageRecord` / `Generator` interface 一份,browser 跟 backend 都 `import` 它

### 4.7 `@gltf-transform/core` 注意(取代 spec 舊版的 `qmuntal/gltf`)

- **mesh 構造函式庫**:`Document` / `Buffer` / `Accessor` / `Primitive` / `Mesh` / `Node` / `Scene` 一一對應 glTF 2.0 規格
- **manifold mesh(vertex dedup、winding、normals)還是你的工作** — lib 只負責序列化跟 graph 操作
- 內建 PBR material、`NodeIO` 寫 GLB binary、`prune()` / `weld()` / `dedup()` transform 可用
- **建構 procedural 範例(20 LoC,等同 `/tmp/box-demo/box.go`)寫在 §6 Phase 1**

---

## 5. Spec 必改清單

整合所有調研,以下是 spec.md 跟現實對不上的地方:

| # | spec 寫的 | 改成 | 理由 |
|---|---|---|---|
| 1 | `react-babylonjs` for declarative | Babylon 直接用,自己包 40 行 imperative wrapper | wrapper 維護停滯 ~1 年 |
| 2 | 沒鎖版本 | **所有 `@mysten/*` 鎖到 2026-05-08 train** | type 不相容 |
| 3 | `@mysten/walrus` API 假設 | 確認用 `client.walrus.writeBlob`(`.$extend(walrus({...}))` 後)或 `writeFilesFlow`(瀏覽器多步驟) | 兩種 pattern 都對,選 flow 給瀏覽器 |
| 4 | 沒提 WASM 設定 | **加 Vite `?url` import / Next.js `serverExternalPackages`** 步驟 | 首次 build 必踩雷 |
| 5 | 沒提 upload relay 設定 | 加 `uploadRelay: { host, sendTip: { max: 1_000 } }` | 不加會嘗試直連 ~2200 storage nodes |
| 6 | Walrus package ID 沒處理 | **用 MVR alias `@walrus/core`**,不要 hardcode | Walrus 升級會換 package ID |
| 7 | `SuiGrpcClient` | 保留(正確) | JSON-RPC 7 月除役 |
| 8 | 沒提 Sui CLI 裝法 | 改推薦 `suiup` | 2026 官方推薦 |
| 9 | Move syntax `module foo::bar;` | 保留(正確);`Move.toml` 加 `edition = "2024.beta"` | Move 2024 |
| 10 | Burn function 把 `Blob` 回傳給 caller | **內部 `blob::burn` 或 `system::delete_blob`** | caller 拿到 `Blob` 沒 destructor 會 stuck;deletable=true 時 `delete_blob` 還能回收 Storage |
| 11 | Mint 範例用 `deletable: false` | 沒問題,但**注意 Storage 不可回收**;考慮 `deletable: true` + 在 Model3D 內控制誰能呼 delete | 取捨 |
| 12 | 沒提 Enoki sponsored tx 預算 | **demo 全程 testnet,mainnet sponsored tx 要付 $120/mo;或 mainnet 但 user 自己付 gas** | budget 規劃 |
| 13 | Phase 規劃 10 phases | **38 天到 deadline → 重排成 5 個階段(scaffold / Sui integration / polish / mainnet / pitch)**;Seal stretch 可保留,marketplace 還是砍掉 | 時間,見 §6 |
| 14 | spec 沒涵蓋 "Real-World Application" 50% | **必須準備 pitch deck + sample game scene + traction signal** — 純技術 demo 會死在這項 | 評分權重 |
| 15 | spec 沒處理 mainnet deploy | **8/27 winners 公布前要 mainnet,才能拿 100% 獎金**;testnet 提交可以但只能拿 50% | 獎金結構 |
| **16** | **spec 把 `Model3D` 當 NFT(每人 mint 一個自己的)** | **架構翻新成 Design B + Derivative 三層**:`Model3D`(content,creator 上架一個 1000 人付費 access)+ `Access`(soulbound 收據,沒 store,Move 強制不可轉售)+ `Derivative`(1-tier 衍生,protocol 自動拆 royalty,30% cap)+ `LicenseTerms`(policy: restricted / allow_list / permissionless)+ `DerivativeApproval`(capability token) | **產品方向轉折** — 從「NFT collection」變「Composable Creator Economy / Programmable IP Layer for 3D」,對標 Story Protocol。詳見 §1.7 / §2.8 |
| 17 | spec 把 Model3D = NFT 跟「永久 NFT 物件」綁定 | `Model3D` 與 `Derivative` 各自 `has key, store` 可放進 Kiosk;`Access` 只 `has key` 不可放 Kiosk(intentional soulbound) | Move type system 層級保證 access 不可轉售 |
| 18 | spec 沒涵蓋衍生限制 | **強制 1 層衍生**(Move 沒寫 `mint_derivative_from_derivative` function)+ **30% royalty hard cap**(`MAX_DERIVATIVE_ROYALTY_BPS = 3000`,publish 時 abort) | 避免套娃導致最終創作者收益爆炸 |
| 19 | spec 沒處理 base creator 事後改 license | `Derivative.base_royalty_bps` **mint 時 snapshot,immutable** | 修補「base 事後加 royalty 坑歷史衍生」攻擊面 |

---

## 6. 38 天執行 plan(5 個階段 + mainnet 路徑)

> 從 2026-05-14 到 6/21 submission,再到 7/20–21 demo day,再到 8/27 winners。三個 milestone,三個目標品質。

### Phase 1:Scaffold(5/14 – 5/19,~6 天)
**目標**:本地端跑通整個 loop,先用 mock,**不上鏈**

- **Monorepo init(D-012)**:`pnpm init` + workspace,目錄 `frontend/` / `backend/` / `shared/` / `contracts/` / `samples/`
- **`shared/`** — `GenerateParams`、`LineageRecord`、`Generator` interface 一份(browser + backend 共用)
- **`backend/` (Node 22 + Hono + TypeScript,D-012)**:
  - `backend/generators/generator.ts`(D-011)— `Generator` interface 實作
  - `backend/generators/box.ts` — 用 `@gltf-transform/core` 寫 procedural,等同 `/tmp/box-demo/box.go` 約 20 LoC
  - `backend/generators/chest.ts`(box + lid 旋轉)— 等同 `/tmp/box-demo/chest.go` 約 60 LoC
  - 再加 `cylinder.ts` / `sphere.ts`
  - `backend/agent/router.ts`(D-011 stub)— Phase 1 用 hardcoded mapping(shape name → generator),**Phase 2 才真接 Anthropic SDK**。Interface 留好
  - Endpoints:`POST /api/generate`、`GET /api/preview/:id`、`GET /api/shapes`
- **`frontend/` (Vite + React + Babylon,D-007 wrapper,D-012)**:
  - 40 行 imperative React wrapper(`Engine` + `Scene` + `LoadAssetContainerAsync`)
  - Shape picker UI + slider + 即時預覽
  - Mock `fetch('/api/generate')` 拿 GLB → Babylon load
- Backend 把 GLB 寫本地 disk(Phase 1 不需要 S3 / CDN / Walrus)
- Output:前端 → backend → preview GLB 渲染出來,end-to-end 但**不上鏈**
- `/tmp/box-demo/` 的 Go proof 確認 procedural 概念後**不搬**(D-012),TS 版本從零寫

### Phase 2:Sui Integration(5/20 – 5/29,~10 天)— D-014 新增 Tripo + Browse + tags
**目標**:Walrus + Move + Auth + LLM agent + Tripo + Browse marketplace 全接上,testnet 跑通 mint + buy Access

- **Move 合約**:寫 `model3d::model3d` 參考 `SharedBlob` 模式,本地 `sui move test` 過 mint/extend/burn,部署 testnet,記 `MODEL3D_PACKAGE_ID`
  - **D-014 新增**:`Model3D` 加 `tags: vector<String>` 欄位(creator publish 時帶,LLM 從 prompt 自動填或手填)
- **Walrus**:`@mysten/walrus@1.1.7` + `walrus-wasm@0.2.2` + Vite WASM 設定 + upload relay,從瀏覽器跑 `writeFilesFlow` 上傳 GLB
- **Auth**:dApp Kit 1.0 + Enoki Google zkLogin + Slush wallet,後端用 signed challenge 驗 Sui address,JWT session
- **LLM agent router(D-011 / D-014)**:後端 `backend/agent/router.ts` 接 `@anthropic-ai/sdk`(Claude Haiku 預設,`claude-haiku-4-5-20251001`),用 [structured output](https://docs.anthropic.com/en/docs/build-with-claude/structured-outputs) + `zod` schema 把 NL → `{generator: "chest" | "tripo", params: {...}, tags: [...]}`。Schema 來自 `shared/types.ts`,browser 也 import。Cost ~$0.001/call
- **`TripoGenerator`(D-014 新增,從 D-011 Phase 3 提前)**:`backend/generators/tripo.ts` 實作 `Generator` interface。Async polling client(submit → poll task_id → download GLB)。固定參數 `{model: "Tripo-P1", face_limit: 5000, texture: false, output_format: "glb"}`。Demo 期間 seed-only(team 用 free 300 credits/月生 5-8 個英雄物件預先 mint),不開放 demo 觀眾即時呼叫
- **Lineage on Walrus(D-011)**:每個 generation 附 `lineage.json` blob(prompt、LLM 決策、params、generator source、base 關係)。同一 Walrus write batch,加 1 個小 blob 不收額外 floor
- **Browse marketplace(D-014 新增)**:
  - Sui indexer query(GraphQL 或自寫 events query)抓 testnet 上所有 `Model3D`
  - Frontend `/`(Browse page)grid 列出,卡片含 GLB preview(Walrus aggregator 抓)+ creator 地址 + Access 價格 + tags
  - 點卡片 → preview 全頁 + Connect Wallet → Buy Access(testnet SUI)
  - Frontend `/generate`(原 Phase 1 generate 流程)變成 secondary route
- **End-to-end(creator)**:打字 → LLM 路由 → procedural / Tripo generate → Preview → Confirm → Walrus upload(GLB + lineage)→ PTB call `model3d::mint(tags: [...])`,在 testnet wallet 看到 Model3D NFT
- **End-to-end(buyer,D-014 新增)**:Browse → 點卡片 → Connect Wallet → Buy Access → wallet 顯示 `Access` 物件(soulbound)
- Sword / hammer / platform procedural generators 加進來(共 7 個 procedural shape)
- 一週緩衝給 SDK 踩雷(WASM 載入、epoch retry、CORS、Move type 不合、Tripo polling timeout)

### Phase 3:Real-World Application 證據(5/30 – 6/10,~12 天)— **這是 50% 評分**
**目標**:把專案從「技術 demo」變成「產品」。**這 phase 跳掉 = 死在 Real-World Application 50%**

- **🚦 D-011 Tripo decision point — D-014 已決定 Tripo 提前到 Phase 2**(下移到 Phase 2 任務清單;此 phase 不再處理)
- **Seed catalog 建立(D-014 新增,Phase 3 day-1 任務)**:
  - team-as-creators 用 free 300 credits/月 × 2 個月(May + June)= 6-10 次 Tripo P1 呼叫
  - 預生 5-8 個複雜「英雄物件」(候選:ancient_dragon、stone_castle、phoenix、ornate_sword、wizard_staff、ancient_chest、demon_horns、crystal_orb)
  - 配合 procedural 7 種基本物件(box / chest / cylinder / sphere / sword / hammer / platform),catalog 共 ~12-15 個 Model3D
  - 每個 seed mint 帶完整 tags(`["fantasy", "weapon", "low-poly", "sword", ...]`)+ LicenseTerms + Kiosk listing
- **多步驟 agent demo(D-011)**:除了單一 NL → 1 個 mesh,加一個「5 dungeon props batch」demo path — 用戶打一句話,agent 拆 5 步,Walrus 上 5 個 GLB + 5 個 lineage + 1 個 series manifest,Move 上 1 次 batch mint。**這是 agentic workflow 的具體實證**,直接打 Walrus track framing
- **🚦 Phase 3 sample scene form factor(D-014 — D-014a ADR 將在 Phase 2 結束時新增)**:
  - **待 Phase 2 catalog 實際內容決定**:G1 Trophy Room(walk-through showcase)/ G2 Dress-up Mannequin(equip 既有 NFT 道具)/ G3 Mini-Adventure(walkable + pickup)
  - 對應 open-questions OQ-011
  - 預設方向:G2 dress-up mannequin(成本 3-4 天,Mixamo 預 rig 角色 + 用 catalog 道具 equip)— 但**不寫死**,看 Phase 2 出貨後再 ADR 確認
  - **目標**:這個 scene 必須**全部 mesh 都從我們 service 出貨**(procedural primitives 當場景 prop + Tripo seed 物件當英雄道具),不外掛免費商城 model — 這才是 real-world 鐵證
  - User 用 wallet 連線,Browse 自己擁有的 Access → 把對應 NFT 道具 equip / 放進場景
- **Pitch deck v1**:problem / solution / customer / use case / why now / why us / roadmap
- **Traction signal**:
  - 開 Discord / Twitter,放 demo gif
  - 找 5–10 個 Unity / Roblox / web3 game dev 朋友 beta test
  - 寫 1 篇 blog 或 thread 講「why decentralized game assets matter」,蒐集 wait-list
- Backend rate limit by Sui address(Redis)+ 基本錯誤處理
- 部署 frontend 到 Vercel、backend 到 cloud VM($5/mo Fly.io 或類似)
- **可考慮**:把整個 frontend 改部署成 Walrus Site → Walrus track 雙重加分

### Phase 4:Kiosk 整合 + Mainnet 切換(6/11 – 6/20,~10 天)— D-013 改:L2 砍、Kiosk 升必做
**目標**:**Sui Kiosk + TransferPolicy 強制 royalty** 接通 + mainnet deploy + 全 e2e

**必做(整合 §2.8 Design + D-013)**:
- **Sui Kiosk + TransferPolicy 整合(D-013 從 Stretch 升 v1 必做)**:
  - `Model3D` publish 時自動 list 到 Kiosk
  - 設定 royalty TransferPolicy(creator 收 N% 的 secondary sale)
  - 寫測試覆蓋:direct purchase / secondary trade / royalty 強制
  - **這是賣點 1 的 on-chain 鐵證** — 沒這個 framing 站不住
  - 參考 [Sui Kiosk docs](https://docs.sui.io/standards/kiosk)
- **L2 Derivative 整段移到 v1.1**(D-013):
  - `Derivative` / `DerivativeApproval` Move struct 仍留在 spec.md §2.8 但**不上 testnet**
  - `mint_derivative_*` 函式不寫
  - 衍生 UI 不做
  - 4 種衍生情境測試(permissionless / allow_list / restricted / royalty cap)等 v1.1
- **重新部署 Move 合約到 mainnet**,記新 `MODEL3D_PACKAGE_ID_MAINNET`
- 前端加 network switcher,預設 mainnet
- 買 real WAL(mainnet 沒 faucet)準備 demo 用
- Mainnet 跑一次完整 2 場景 e2e(Tom publish + Marcus buy + 模擬 secondary trade 看 Kiosk royalty 撥款),記錄 tx hash + Sui Explorer 截圖
- 決定 sponsored tx:
  - **選 A**:付 Enoki Pro $120/mo,demo 看不到 gas(**強烈推薦**,Demo Day 殺手)
  - **選 B**:user 自己付 gas,要解釋為什麼第一次 mint 要先 faucet

**節省的時間(D-013)**:L2 工作砍掉 ~5–8 天 → 分配給 Kiosk 整合 + Phase 5 提早開工

**Stretch A**(從原 Stretch B 改名)**:Seal 整合** — `is_encrypted=true` 的 model 用 Seal 加密上 Walrus,`seal_approve` 函式已寫在 §2.8(`access: &Access` + clock 檢查)。完成後就是 **Walrus + Seal + Move + Kiosk 四件套滿貫**

**Stretch B**(從原 Stretch C 改名)**:Forensic watermark** — 解密時 inject user ID 進 mesh micro-perturbation,流出來反查得到。對 Real-World Application 加分

### Phase 5:Submission + Demo Polish(6/21 – 7/8 shortlist)
**目標**:提交 → 進 shortlist → 排練 Demo Day

- **6/21 submission**:
  - Public GitHub repo(MIT/Apache license)
  - README:install / run / contract addresses(testnet + mainnet)/ demo URL / video link
  - **Demo Video ≤ 5 分鐘**(YouTube preferred):講 problem / solution / live demo / roadmap
  - Logo 1:1 PNG
  - 提交到 [overflow.sui.io](https://overflow.sui.io/) → DeepSurge portal
- **6/22 – 7/8**:Shortlist 等待期。**不要停手**:
  - 持續 polish UX(評分 20%)
  - Sample game scene 加 features
  - 把 traction 數字推高(beta testers、Discord 成員、X engagement)
  - 找 mentor / Office Hours 過 pitch deck
- **7/8 shortlist 公告** → 若進:
  - Pitch deck v2(對著評審 panel 線上 pitch 的版本)
  - 排練 30 秒 hook + 90 秒 demo + 60 秒 stack + roadmap(見 §8)
  - 確認 mainnet 還活著、Walrus blob 還沒過 epoch

### Demo Day(7/20 – 7/21)+ Winners(8/27)

- Demo Day:對 panel pitch,Q&A 預演(常見問題:tokenomics、為什麼不是 SaaS、Seal 何時加、market size、competitor)
- 7/22 → 8/27:Mainnet 持續跑、bug fix、更多 traction、blog post
- 8/27 winners → 若得獎、Sui Basecamp 2026 受邀 pitch → 後續 audit credits / ecosystem support 等

---

## 7. 怎麼把這份文件當 project context 用

### 7.1 給未來的我 / 新 agent

當你回到這個專案(下個 session、或新 agent join 進來),**先讀這份**:
- §0 TL;DR — 30 秒抓到全貌
- §1.7 戰略 + §6 38 天 5-phase plan — 知道現在該做什麼
- §5 Spec 必改清單 — 知道 spec.md 哪幾條不能照抄

### 7.2 寫 code 時的查表流程

| 在做… | 翻去 |
|---|---|
| 設定 Walrus client | §2.5(注意 WASM、relay) |
| 寫 Move `Model3D` | §2.6 + §2.8(抄 SharedBlob,**不要**抄 OnlyFins) |
| 卡在 SDK 版本不合 | §4.1 + §5 #2(全鎖 2026-05-08) |
| 要不要加 Seal | §3.5(MVP 不加)+ §3.6(架構保留) |
| Hackathon 提交檢查 | §1.4(必交清單)+ §6 Phase 5 |
| 怎麼打 Real-World Application 50% | §1.7 + §6 Phase 3 |
| 何時 / 怎麼上 mainnet | §1.1.1 + §6 Phase 4 |

### 7.3 衝突排序

- **本檔 > spec.md**(spec 有些東西寫的時候沒驗證)
- **本檔 > LLM 訓練資料**(尤其 Walrus / Seal / Enoki API 變化很快)
- **官方 source 連結 > 本檔**(本檔可能也會老,做關鍵決定時打開連結看現在的版本)

### 7.4 失效訊號

如果遇到以下訊號,**回頭驗本檔內容**:
- `npm install` 報 peer dep conflict → 檢查 §4 表格的版本是否仍是當前
- Walrus SDK call 簽名跟 §2.5 不同 → 開 [@mysten/walrus 的 typedoc](https://sdk.mystenlabs.com/walrus) 重看
- Move build 報 `walrus::blob::Blob not found` → MVR alias 是否設對(§4.5)
- Demo Day 時被問 Seal 整合計畫 → §3.7 roadmap

### 7.5 還沒驗證的東西(到時要當場確認)

- **MemWal (Walrus Memory) 是什麼**:handbook 列為核心資源,Walrus track 框架「verifiable data and memory layer」很可能指這個。要先看 playground + GitHub repo 再決定怎麼整合(可能比裸上 Walrus 更切 track 描述)
- **Walrus 小 blob 實際單次成本**(testnet 跟 mainnet)— `walrus info` / `costcalculator.wal.app` 跑一次
- **Enoki sponsored tx 在 testnet 是不是真的免費** — 註冊 sandbox 跑一次小 tx
- **dApp Kit 1.0 拆分後實際 import 路徑** — 看 [sdk.mystenlabs.com/dapp-kit](https://sdk.mystenlabs.com/dapp-kit) starter 範例
- **Walrus 各 network 當前 package ID** — `sui client object <SYSTEM_OBJECT_ID>` 解析
- **DeepSurge submission portal 流程**:[deepsurge.xyz](https://www.deepsurge.xyz/) 是 2026 用的 portal(JS-rendered 進不去),要實際註冊一次看欄位
- **Mainnet WAL 哪裡買** — testnet 有 faucet,mainnet 要交易所或 DEX 上換

---

## 8. 一頁 Demo 腳本(Phase 5 寫 ≤ 5 分鐘 video 時用)

> Handbook 規定 video ≤ 5 分鐘,YouTube preferred。
> 結構:30 秒 problem + 30 秒 solution + 2 分鐘 demo + 1 分鐘 stack + 1 分鐘 roadmap & ask
> **不能只是技術秀** — Real-World Application 50%,問題跟使用情境要佔一半時間

**0:00–0:30 Problem(killer hook,具體可查證)**
> 「2024 年 10 月,Epic Games 關掉 Sketchfab Store。強制遷移到 Fab,**CC-BY-SA 授權不在 Fab 支援列表內** — 一個藝術家報失 60 多個模型。Change.org 連署稱這是『焚毀亞歷山卓圖書館的數位版』。
>
> 三週後,**Mixamo 認證系統壞掉**,使用者拿不回任何上傳過的角色跟 rig。
>
> 同年,Unity 悄悄刪掉 TOS 歷史 repo,然後追溯對已上架遊戲收 install fee。Roblox 從 UGC 創作者抽 70%。
>
> 你買的、做的、上傳的資產,**從來不是你的**。」

**0:30–1:00 Solution(我們是什麼)**
> 「我們做 **Composable Creator Economy for 3D**:三層架構。
>
> **L1** — Creator 上傳 base model 到 Walrus,自選 license:`restricted` / `allow_list` / `permissionless`。
> **L2** — 其他 creator 拿 base 做衍生系列,protocol-level 自動分潤 base creator。
> **L3** — Game dev 買 derivative access,在遊戲裡用 — **同一筆 tx,Sui Move 鏈上強制拆給三方**。
>
> Story Protocol 在 2D / 漫畫 / 音樂做這個拿了 a16z $140M。**我們做 3D vertical,而且 Walrus 給我們 native storage。**」

**1:00–3:30 Live Demo — 3 場景串接**

**場景 1(L1 publish)— 30 秒**
1. Creator A「Sign in with Google」→ zkLogin OAuth → 0.3 秒回來,Slush address 出現
2. 選 Sword → 拉 slider 設參數 → 即時預覽
3. 設 license: **permissionless + 10% royalty + mint_fee 1 SUI**
4. 點 Publish → 「Uploading to Walrus…」 → 「Publishing on mainnet…」 → Sui Explorer 連結

**場景 2(L2 derivative series)— 60 秒**
5. **切到 Creator B**(另一個瀏覽器 session,另一個 Google 帳號)
6. Creator B 看到剛剛 A 的長劍,點「Fork into Series」
7. 用同樣 UI 做 **5 個變體**(改顏色、blade 弧度等)→ 「Red Dragon Series #1-5」
8. 確認 → **5 個 derivative 一次 publish**,每個都 5 SUI 售價
9. 切到 Sui Explorer:**5 筆 mint tx,各付 1 SUI mint_fee 給 A** — A 共收 5 SUI(立即可見鏈上轉帳)

**場景 3(L3 game integration)— 60 秒**
10. **切到 Game dev C**(第三個 wallet)→ 進 marketplace → 買 「Red Dragon #3」access(5 SUI)
11. **殺手鏡頭**:切到 Sui Explorer 看這筆 tx,**3 個 transfer**:
    - 4.5 SUI → Creator B(derivative creator)
    - 0.5 SUI → Creator A(10% base royalty)
    - 0 平台抽成(我們不抽)
12. 切到 Three.js sample game → wallet connect → 把赤龍 #3 裝備到角色 → 揮砍動畫
13. **回到第三人視角總結**:「**一筆 tx,protocol-level 強制拆 royalty,marketplace 改不掉。OpenSea 2023 解不掉的問題,Sui 從架構解掉。**」

**3:30–4:30 Stack & 為什麼選 Sui**
- **Walrus** = base + 每個 derivative 都有獨立 blob,creator A 倒了也不影響 B 的衍生作 — verifiable data and memory layer
- **Sui Move** = `LicenseTerms` snapshot 進 `Derivative`,base 改條款不影響歷史衍生 → 修補 Unity 2023 retroactive 風險
- **Sui Kiosk + TransferPolicy** = secondary market royalty 也走 protocol 強制
- **Seal**(stretch) = 付費內容用 IBE 加密,`seal_approve` 檢查 Access 物件
- **Enoki zkLogin + Sponsored tx** = users 不用懂 wallet 不用懂 gas
- **BabylonJS + TS Node (`@gltf-transform/core`)** = procedural generation,zero per-gen 成本(D-012)

**4:30–5:00 Roadmap & Traction & Ask**
- 已有: 3 個 indie game studio LOI / 30 個 Discord beta creator(或實際 traction 數字)
- Roadmap:Unity / Unreal plugin、AI-assisted base generation、cross-collection composition、Seal-encrypted premium tier
- 跟 Story Protocol 差異:3D vertical + native storage + Sui Kiosk 強制 royalty
- **Ask**:Sui Overflow 把 Sui 推向 **programmable IP foundation for 3D / gaming** 的領頭羊。Walrus track 評委,這就是「Walrus as verifiable data and memory layer」的具體 use case

---

*本檔最後更新:2026-05-14 — 距 Sui Overflow 2026 submission 38 天 / demo day 67 天 / winners 105 天*
*資料來源已修正:[mystenlabs.notion.site/overflow-2026-handbook](https://mystenlabs.notion.site/overflow-2026-handbook)*
*v2 架構升級:**Composable Creator Economy** — L1 Model3D(content)→ L2 Derivative(系列)→ L3 Game Access,protocol-level cascading royalty,1 層衍生,30% royalty cap,license policy = restricted/allow_list/permissionless*
