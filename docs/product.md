# Product Overview — Sui-Native 3D NFT Economy

> v0.2 · 2026-05-14 · 給 PM / 評審 / 不寫 code 的人理解這個產品在幹嘛
> 工程細節 → [`spec.md`](spec.md);決策紀錄 → [`decisions.md`](decisions.md)(13 個 ADR)
> v0.1 → v0.2 主要變更:[D-013](decisions.md#d-013) L2 Derivative 移 v1.1、Kiosk 升 v1 必做、framing 收斂為「5 個 Sui+Walrus 獨家賣點」

---

## 🎯 一句話

讓任何人用**打字**做出**乾淨可用的 3D 模型**,用 Sui+Walrus 才能做到的 **5 個獨家賣點** 構建可信、永久、有強制 royalty 的 3D NFT 經濟。

## 📜 兩段話

3D 資產目前是**藝術家手做 / AI 黑盒** 兩種極端。藝術家慢,AI 出來的東西不能放物理引擎。創作者上的平台(Sketchfab、Mixamo、Unity Asset Store)說倒就倒、條款追溯改、Royalty 強制不了 — 這些痛 2024-2025 真實發生過,evidence 在 §「為什麼現在」。

我們做的是**只有 Sui+Walrus 才能組合出的東西**:LLM agent 幫你拆解需求 → procedural generator 出 manifold mesh → 寫上 Walrus(永久去中心化儲存)→ 鏈上(Sui Move)拿到一個有 Kiosk 強制 royalty、有不可竄改 license、有 soulbound access 的 NFT。**Ethereum NFT 想做做不到(OpenSea/Blur royalty 戰早結束了),web2 asset store 也想做做不到(Sketchfab/Mixamo 已倒)。這 5 件事一起,目前只有 Sui+Walrus 能交付。**

---

## 🔥 為什麼現在做這個

不是發明問題,是把已經在發生的痛變成有解。

| 痛點 | 真實案例(2024–2025) |
|---|---|
| **平台說倒就倒** | Sketchfab → Fab 2024-10:藝術家失 60+ model;Mixamo 認證 2025-06-16 掛,所有 character + rig 拿不回來 |
| **授權條款追溯改** | Unity 2023 runtime fee:Unity 悄悄刪 GitHub TOS 歷史,追溯收 $0.20 / install |
| **Royalty 強制不了** | OpenSea 2023 被 Blur 打掉 royalty,80% NFT 量跑去零分潤平台 |
| **AI 偷訓練資料** | Objaverse:80 萬 Sketchfab 模型沒授權被抓走訓練 dataset |
| **盜版重上架** | CGTrader / TurboSquid 有組織化盜版群,DMCA 處理慢 |

---

## 🎯 為什麼非 Sui+Walrus 不可 — 5 個獨家賣點

**這一段是整個 pitch 的核心**(D-013)。每一條都是**其他鏈或 web2 想做做不到**的事。

| # | 賣點 | 我們用什麼機制 | 為什麼其他選項做不到 |
|---|---|---|---|
| **1** | **Royalty 強制在 protocol 層,marketplace 繞不過** | Sui Kiosk + TransferPolicy | Ethereum NFT 失敗過 — OpenSea 2023 被 Blur 打掉 royalty 強制,80% 量跑到零分潤。Sui Kiosk 從 type 層強制,marketplace 想交易就得遵守 |
| **2** | **License 寫進 Move struct,不可追溯改** | `Model3D.license: LicenseTerms` | Unity 2023 偷偷改 TOS 追溯收費,GitHub history 還被刪。Move type 一旦 publish 就是公開、不可竄改、永遠可查 |
| **3** | **Access 是 soulbound — 不能轉售 / 借出 / 抵押** | `Access has key`(沒 `store` ability) | Solana / Ethereum 用 contract 邏輯擋,但 token 在型別層還是可轉。**Sui Move 的 ability system 讓 soulbound 是 bytecode 級保證**,不是「合約寫的」 |
| **4** | **Storage 公司倒了 bytes 還在** | Walrus blob(去中心化 erasure-coded 儲存) | Sketchfab 倒 → user 失 model;Mixamo 認證掛 → user 失 character。S3 / IPFS 都有運營者單點 — Walrus 沒有 |
| **5** | **Provenance 鏈上可追溯,first-publish 證據不可竄改** | Walrus lineage record + Sui object timestamp + 鏈上 content hash | Objaverse 沒授權抓走 80 萬模型;沒辦法反向證明「我先發布」。Sui timestamp + Walrus content hash = 不可竄改的 chain-of-custody 證明 |

**這 5 條不是各自獨立,是必須**一起**才有用。一個 3D NFT 同時擁有這 5 件事 = web3 history 第一次。**

---

## 👥 兩個 Persona

(D-013 砍掉 v1 的衍生創作者 persona。L2 layer 設計仍在 [`spec.md`](spec.md) §2.8,移到 v1.1。)

### 🟦 Tom — 創作者(L1)

> 35 歲,前 Unity dev。獨立做 indie game prop,賣 Gumroad / Sketchfab。一年收入 $40K。**在 Sketchfab → Fab 遷移災難中失去 30 個 model,從此對平台沒信心。**

**他要什麼**
- Asset 上鏈,平台倒了也不會消失
- License 鏈上寫死,以後不會被改
- Royalty 強制執行 — 不是平台善意,是 protocol 強制
- 不用學 wallet / seed phrase / SUI / WAL(zkLogin 接 Google)

**他現在怎麼活**:重複上架 Gumroad,擔心 Stripe / Gumroad 哪天封他,沒有任何 royalty enforcement 保障。

---

### 🟥 Marcus — 遊戲開發者 / 買家(L3)

> 24 歲,solo Unity dev,做小型 web3 game。**沒時間做 asset、信不過免費資源、付不起 Unity Asset Store 大筆 license fee。**

**他要什麼**
- 單個 asset 的使用權,license 鏈上可驗證
- 來源透明 — 看得到創作者拿到應得的錢
- Asset 公司倒了不影響玩家(永久 Walrus blob)
- 自己的 access **不會被偷、不能轉賣**(soulbound 設計保護他)

**他現在怎麼活**:抓 Free3D / TurboSquid 邊用邊擔心 license 來源,有些 asset 哪天會消失沒人賠。

---

## 🎬 Happy Path — 2 幕劇,2 天,2 個 user

### 第 1 幕 · Tom 發布(Day 1, ~90 秒)

```
Tom 打開 web app
   ↓
Google 登入(zkLogin)— 沒看到 wallet,沒看到 seed phrase
   ↓
打字框:「wooden treasure chest, medium size」
   ↓ (agent 路由 ~500ms)
LLM router 判斷 → 走 procedural chest generator
   ↓ (~50ms)
3D 預覽出現,Tom 拉 slider 微調(寬 / 高 / 蓋子角度)
   ↓
Tom 設定:
  • 價格:5 SUI
  • 商用 ✅
  • Kiosk royalty: 10%(secondary market 也強制)
   ↓
按 Publish
   ↓
背景:
  • Walrus upload(GLB + lineage record)
  • Sui Move mint Model3D
  • 自動 list 到 Sui Kiosk(royalty policy attached)
   ↓
完成:Tom 錢包看到 "Model3D #042: Treasure Chest by Tom"
     Sui Explorer 可查 tx hash + Kiosk policy
```

**Tom 心裡感覺**:跟 Gumroad 上架差不多麻煩,但這東西**永遠不會消失,royalty 是 protocol 強制,license 鏈上寫死**。

---

### 第 2 幕 · Marcus 取得 + 入遊戲(Day 2, ~30 秒)

```
Marcus 在 marketplace 找寶箱,看到 Tom 的 chest
   ↓
按 Buy — 5 SUI
   ↓
zkLogin → 簽 tx
   ↓
Sui Move 同 tx 自動處理:
  • Kiosk 強制 royalty(secondary 時 10% 給 Tom)
  • 鑄一個 Access 物件給 Marcus
  • Access has key(沒 store)→ 賣不掉、轉不出去
   ↓
Marcus 拿到 Access(soulbound 證明 "他付過錢")
   ↓
他的 Unity 專案 import 一行:fetch GLB by blob_id from Walrus aggregator
   ↓
3D treasure chest 出現在他遊戲場景
   ↓
之後 Tom 的 chest 如果在 OpenSea 風格的 secondary market 被轉,
Kiosk 強制 10% 給 Tom — Tom Explorer 上看得到入賬
```

**Marcus 心裡感覺**:
- 跟 Unity Asset Store 差不多錢
- 但 license 在區塊鏈寫死,不會被改
- Tom 拿到的分潤我看得到,marketplace 想偷也偷不掉
- Access 是我的、但偷不走 → 不用怕 wallet 被駭某天被人拿走

---

## 🧱 產品邏輯(一頁版本)

```
                ┌─────────────────────────────────────┐
                │  L0  Agent Orchestration            │
                │                                      │
                │  LLM 解析 prompt → 路由 generator    │
                │  → 拆解多步驟 → 寫 lineage          │
                └────────────────┬────────────────────┘
                                 │
        ┌────────────────────────┴────────────────────────┐
        │                                                  │
        ▼                                                  ▼
┌─────────────────┐                        ┌─────────────────────┐
│ Procedural Gen  │                        │ Tripo (Phase 3 才接) │
│ (主力,manifold │                        │ (備援,catalog 外    │
│  保證,< 2s)    │                        │  的視覺需求)        │
└────────┬────────┘                        └──────────┬──────────┘
         │                                             │
         └──────────────────┬──────────────────────────┘
                            ▼
                    ┌───────────────┐
                    │ Walrus blob   │  ← GLB bytes (asset)
                    │  + lineage    │  ← agent decision trace (memory)
                    └───────┬───────┘
                            ▼
        ┌───────────────────────────────────────────┐
        │ Sui Move + Sui Kiosk(v1 一起)            │
        │                                            │
        │   L1 Model3D  + Kiosk + TransferPolicy    │
        │                ↑                           │
        │                └── 強制 royalty           │
        │                                            │
        │   L3 Access   ← soulbound 收據            │
        │                                            │
        │   (L2 Derivative → v1.1 deferred D-013)   │
        └───────────────────────────────────────────┘
```

**5 個 Sui+Walrus 獨家賣點如何分布在這個架構**:
- 賣點 1(Kiosk royalty)→ L1 Kiosk + TransferPolicy 層
- 賣點 2(License 寫進 Move)→ `Model3D.license: LicenseTerms`
- 賣點 3(Soulbound Access)→ L3 `Access has key`(沒 store)
- 賣點 4(永久 storage)→ Walrus blob 層
- 賣點 5(Provenance)→ Walrus lineage + Sui timestamp 一起

---

## 📦 v1 Scope vs Not-Yet

### v1(2026-06-21 submission)

- ✅ Procedural generation:box / cylinder / sphere / chest / stairs / column(~6 種)
- ✅ LLM agent router(NL → catalog → params)
- ✅ Walrus upload + lineage record
- ✅ Sui Move:`Model3D`(L1)+ `Access`(L3)
- ✅ **Sui Kiosk + TransferPolicy**(D-013 升 v1)
- ✅ zkLogin Google sign-in
- ✅ 1 個 sample game scene 演 Marcus 角色用 asset
- ✅ Demo video ≤ 5 分鐘 跑完 2 幕劇

### v1.1(Phase 4 stretch / post-submission)

- 🟡 **L2 Derivative full flow**(D-013 deferred — Move code 已在 §2.8 design 好)
  - `Derivative` / `DerivativeApproval` 結構
  - 3 種 license policy(restricted / allow_list / permissionless)UI
  - Derivative cascade royalty + snapshot immutability
- 🟡 Mainnet deploy(8/27 前 = 100% 獎金)

### v2+(post-hackathon)

- 🔵 Tripo / Meshy 接 generator interface
- 🔵 Seal encryption + paywall
- 🔵 Unity / Unreal plugin
- 🔵 forensic watermark
- 🔵 governance / curation marketplace
- 🔵 **Composable Creator Economy / Programmable IP Layer** full vision(D-001 vision 的完整版,等 L2 真實 PMF signal 後再衝)

---

## 🚫 不做什麼(明確 anti-features)

- ❌ **AI 黑盒生成** — procedural primary,LLM 只做路由
- ❌ **Free-form NL → 任何 3D 模型** — 受限於 catalog
- ❌ **每個 user 一個 NFT collection** — content + access 分離
- ❌ **跨遊戲資產互通** — StepN / Axie 失敗模式
- ❌ **L2 衍生品 v1 不做** — D-013,等 PMF signal
- ❌ **沒 Sui+Walrus 也能做的事** — 我們的賣點是 5 個獨家性,不是 again-on-chain

---

## 📊 v1 成功指標(North Stars)

| 指標 | 目標 | 為什麼 |
|---|---|---|
| Demo video YouTube 看完率 | > 60% | 評審 5 分鐘片要看到底 |
| Sui Explorer 上 tx 數量(submission 前) | > 50 | 證明「不是 fake demo」 |
| Distinct buyer address(不算自己) | > 5 | 真實 traction signal |
| **Kiosk royalty 實際撥款次數** | > 3 | 賣點 1 的 on-chain 鐵證 |
| Indie game dev LOI / quote | > 3 | Real-World Application 50% 鐵證 |
| Discord beta tester | > 30 | 社群存在感 |

---

## 🪜 跟 spec.md / decisions.md 的關係

| 文件 | 受眾 | 內容 |
|---|---|---|
| **本檔(product.md)** | PM / judge / non-eng | 故事 / persona / happy path / scope / 5 個賣點 |
| `spec.md` | engineer / 未來的自己 | Move struct / SDK 版本 / 部署細節 / Phase plan |
| `decisions.md` | engineer / future maintainer | 13 個 ADR(D-001…D-013) |
| `phase-progress.md` | 下次 session 的我 | 當前進度 + next concrete step |

只有 10 分鐘 → 讀本檔 ✅
要動 code → `spec.md` §2、§4、§6 + `decisions.md`
想知道「他為什麼選 X」→ `decisions.md`

---

## 📞 Demo 1 句 pitch(3 個受眾客製)

**Sui 圈外 / 一般 PM / 評審**:

> **"What if a 3D asset could have protocol-enforced royalty, an unchangeable license, soulbound access, persistent decentralized storage, and chain-of-custody provenance — all in one NFT? That's what Sui + Walrus can do, and we built the agentic factory that makes them."**

**Sui 圈內 / Walrus track 評審**:

> **"Sui Kiosk + Move ability system + Walrus + lineage records, glued together by an LLM router agent. Five Sui+Walrus exclusive primitives in one product. Anything less is a worse version of Sketchfab on Ethereum."**

**Indie game dev / 工程實用受眾**:

> **"Imagine if every Unity Asset Store asset came with: royalty you can't strip out, license you can't retroactively change, soulbound access you can't have stolen, and storage that survives platform shutdowns. We did it. Pay 5 SUI, get an asset that's still yours in 10 years."**
