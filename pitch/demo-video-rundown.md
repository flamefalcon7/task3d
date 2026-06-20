# Tusk3D — Demo Video Rundown(Sui Overflow 2026,Walrus track)

> **狀態**:草稿 v1，2026-06-17。供拍片用。
> **取代** `docs/spec.md §8` 的舊腳本(那份用了已退役的 L1/L2/L3 三層、zkLogin/Google 登入、mainnet 發佈框架 — **不要照舊腳本拍**)。
> **本片硬規格**:≤ 5 分鐘、YouTube preferred、testnet、Slush 錢包登入。
> **Sui Overflow team email 建議結構**:30–60s Problem ／ ~3 min Demo ／ 30–60s Conclusion + future vision。本腳本目標總長 **~4:30**。

---

## 0. 拍片前必對齊的「現況事實」(舊腳本最常錯的地方)

| 項目 | 舊 §8 腳本(錯) | 現況(對) |
|---|---|---|
| 登入 | Sign in with Google → zkLogin | **Slush 錢包**(`tusk3d.store` 已用 Slush 驗過付費生成) |
| 網路 | "Publishing on mainnet" | **testnet**(D-009;6/21 提交用 testnet) |
| 架構 | L1/L2/L3 三層、"L3 買 derivative access" | base `Model3D` + soulbound `AccessEntitlement`(付一次 `access_fee`)→ 衍生 `NftCollection` + `NftToken`(remixer 付 `derive_fee`) |
| 生成 | 只有 slider 程序生成 | **Tripo prompt-mode(SUI 付費)** + **GLB 上傳** 兩條路 |
| Seal | 標 "(stretch)" | **已 ship** — 付費內容 IBE 加密，`AccessEntitlement` 解鎖解密 |
| 額外 surface | 無 | **MCP agent interface**（`claude mcp add tusk3d https://api.tusk3d.store/mcp`）、racing sample scene（`/track`） |

**口頭不准講**:mainnet、Google 登入、"L3"、"0 平台抽成" 之類未驗證的絕對宣稱。**只講螢幕上當下看得到的事實。**

**命名(對觀眾用白話,不要念層級)**:旁白與字幕一律用 **「base model / 原創者」**、**「remix 衍生系列 / 二創者」**;**不要口頭講 "L1 / L2"**。只在切 Sui Explorer 時讓畫面出現 `Model3D` / `NftCollection` 的 object 名稱,給技術評審做架構對應,但旁白不念。

**敘事主軸(這版的核心)**:重點是 **「一個資產串起整條用戶行為」** —— 創作 → 別人 remix → 玩家在遊戲裡真的用 → AI agent 也能取用,全部跑在同一條鏈 + Walrus 上。**fee / 權利金分潤不是中心,一句帶過即可**(「權利金鏈上強制,連二手都改不掉」),不做 Explorer 拆帳的長鏡頭。

---

## 1. 工具推薦(已幫你選好)

solo hackathon + 需要多個錢包 session + 要切 Sui Explorer，推薦這組:

- **錄製 — Screen Studio（Mac，付費）** ⭐ 首選
  自動 zoom + 平滑游標，web app demo 不用會剪輯也很精緻。對「點按鈕 → 看鏈上結果」這種流程特別加分。
  *免費替代*:OBS Studio（多 source 場景合成）或 QuickTime（最陽春）。
- **剪輯 + 旁白 — Descript**
  用「改逐字稿」的方式剪片，一鍵刪贅詞、重錄旁白。hackathon 反覆改稿最省事。
  *免費替代*:DaVinci Resolve（強但學習曲線）或 iMovie（簡單）。
- **旁白方式**:**先寫稿、單獨錄 voiceover**，再對畫面剪 — 比邊點邊講乾淨，也好控時間。
- **多錢包**:開 **3 個 Chrome profile**（Creator A / Forker B / Buyer C），各裝 Slush、各灌 testnet SUI。錄的時候切 profile 視窗即可；剪輯時再串起來。

預算為零就走 **OBS + DaVinci + 自己錄旁白**;能花一點錢就 **Screen Studio + Descript**，省下大量剪輯時間。

---

## 2. Pre-production checklist(開錄前一天做完)

- [ ] 3 個 Chrome profile，各一個 Slush testnet 帳號，**各灌足 testnet SUI**(生成、access_fee、derive_fee、gas 都要)。
- [ ] **Tripo credits 充足** — 約 55–60 credits/次生成;demo 當天先確認餘額(phase-progress 註記:`api.tripo3d.ai` 充值)。錄製時若怕當場失敗，**先離線錄好一次成功生成**當備援(D-014 mitigation:pre-record)。
- [ ] **Seed 資料**:Creator A 的 base model 先發好一個在 testnet（避免片中等 Walrus upload 太久），或接受片中真的等(更可信)。
- [ ] `tusk3d.store` 全站綠燈:`/`、`/create`、`/launch`、`/market`、`/track`、`/model/:id`、`/collection/:id` 都先手動走一遍。
- [ ] Sui Explorer(testnet)分頁開好，確認 object/tx 頁面能即時刷新看到轉帳。
- [ ] 螢幕解析度固定 1920×1080、瀏覽器縮放 100%、關通知、乾淨書籤列。
- [ ] **確認片中所有金額數字**(下面腳本用的是範例值,錄製時以實際 UI 顯示為準)。

---

## 3. 結構與時間軸(對齊 Sui email)

| 段落 | 時間 | 內容 |
|---|---|---|
| A. Problem | 0:00–0:50 | Poly（2021 關站）+ FlippedNormals（2026 關站)二連 — "你的作品、你的收入,握在平台手裡"(有 repo 出處) |
| B. Solution(一句) | 0:50–1:10 | 可組合的 3D 創作經濟，Walrus native storage，鏈上強制規則 |
| C. Live Demo(用戶行為串接) | 1:10–4:05 | 創作 → remix 配色變體 → **開發者用 MCP 找素材、做遊戲 → 註冊到整合頁** → **用戶發現遊戲、開自己的 NFT**(一條線) |
| D. Stack(為何 Sui/Walrus) | 4:05–4:40 | 兩根支柱的 why + 圖上元件全帶到(Walrus 存+記憶 / Sui 不可變規則 / Seal / Kiosk / 整合) |
| E. Conclusion + future | 4:40–5:05 | 「在鏈上跑」(不點名 testnet/mainnet)、roadmap 兩大方向(AI 創作 / 開發者生態)、ask |

**Demo 段內部配速(~2:55)**:場景 1 ~50s · 場景 2 remix 配色變體 ~35s · 場景 3 開發者用 MCP 找素材(`list_fork_collections` 列系列)+ vibe coding 做遊戲 ~40s · 場景 3.1 註冊到整合頁 ~12s · 場景 4 用戶發現遊戲 + 開自己的 NFT ~33s（payoff）。全片 ~4:50,仍在 5 分鐘內。

---

## 4. 完整 Shot List + 逐字 VO 稿

> 格式:**[畫面 / 動作]** = 螢幕上要拍到什麼、點哪裡;**VO:** = 旁白逐字。
> 旁白語速約 150 字/分;每段 VO 已抓在該段時間內。

### A — Problem(0:00–0:45)

**[畫面]** 開場不放 logo。放兩段有出處的關站截圖快切(**Google Poly 關站公告 / Archive Team 搶救頁** → **FlippedNormals 2026-03-31 關閉公告**),Ken Burns 緩推。最後落到黑底白字:「你的作品、你的收入,命運從來握在平台手裡。」

> 來源見 `docs/brainstorms/2026-06-05-problem-evidence-centralized-3d-platforms.md`(Poly + FlippedNormals 皆有 source 連結)。**不要用** Sketchfab/Fab/「六十幾個模型」/Mixamo/Unity 那組 —— 舊腳本遺留、無 repo 出處。

**VO:**
> 「2021 年,Google 關掉 Poly —— 它的 3D 分享平台。整站連 API 永久下線,創作者上傳的作品,只靠志工搶救回一部分;而它本來就是免費分享,沒有收入。
> 2026 年三月,FlippedNormals —— 三千多個創作者的市集 —— 也收掉了。它分潤其實很好,七成五到九成五,但賣斷一次就結束:買家拿去做衍生、再賣,原創者一毛都收不到。而且收入綁著平台活著,平台一關,現金流歸零。
> 你的作品、你的收入 —— 命運從來握在平台手裡。」

---

### B — Solution(0:45–1:05)

**[畫面]** 切到 `tusk3d.store` 首頁(`/`)。讓 landing 的 live 3D well 動一下。打上白話字幕:**Walrus 存 + 記憶 → 創作 → remix → 遊戲 / AI 都能用**(不要寫 L1/L2)。

**VO:**
> 「Tusk3D 把 3D 資產做成一個可組合的創作經濟。創作者把模型存上 **Walrus** —— 而 Walrus 不只是儲存,還是記憶:一個 AI copilot 記得你做過什麼,陪你把想法聊成一個精準的 prompt。發佈之後,別人可以 remix 成新作品,玩家能在遊戲裡用,連 AI agent 都能直接取用。每一條規則,都由 **Sui 在鏈上強制執行** —— 不在某一家公司的伺服器裡。」

---

### C — Live Demo(1:05–3:50)— 一條用戶行為線串四場景

> 主軸不是「付款拆帳」,是 **同一個資產怎麼在不同人、不同情境之間流動**:創作 → remix → 進遊戲用 → AI 取用。每換一個場景就換一個 Chrome profile,但旁白要讓觀眾感覺是「同一個世界裡接力發生的事」。

#### 場景 1 — 創作並發佈(1:05–1:55,~50s)

**[畫面 / 動作]**(profile = 原創者 A)
1. `/create` → **Connect Wallet** → Slush → 顯示 A 的 testnet address。
2. **先展示 AI prompt copilot(Gemini,已 ship D-081 / `backend/src/routes/copilot.ts`)**:不直接打 prompt,而是跟 copilot 對話 —— 輸入「我想要一台低多邊形的賽車」→ copilot 一邊問一邊收斂成精準 prompt,**而且它會把你過去存在 Walrus(MemWal)的舊 prompt 拉進 context**,順著你的風格 riff。memory + copilot 是同一個故事。
3. 用 **copilot 生成的那句 prompt** 走 Tripo 生成 → **這裡接預錄好的成功生成片段**(避免當場等 / 失敗)→ 一台車的 preview 出現。順帶一句「也能直接上傳自己的 GLB」當 B-roll。
4. `/launch`:設授權 —— 白話講「**開放別人 remix,自己留一點權利金**」(對應 UI 上的 access fee / derive fee / royalty,但旁白不念數字)。
5. **Publish** → 「Uploading to Walrus…」→「Publishing on testnet…」→ 出現鏈上物件連結。**快速切 Sui Explorer 帶一下** `Model3D` object（給技術評審看,旁白只說「存進 Walrus、上 Sui」）。

> 動線提醒:錄前先在 `/create` 手動走一遍 copilot 對話,確認它真的會回一句可用的 prompt;copilot 在錢包登入後才出現(`VITE_COPILOT_ENABLED=true`)。

**VO:**
> 「先從一個創作者開始。她用 Slush 登入 —— 但她不用自己憋 prompt。她跟 AI copilot 聊『我想要一台低多邊形的賽車』,copilot 一邊問一邊收斂,而且它記得她以前做過的東西(都存在 **Walrus** 上),順著她的風格 riff。幾輪之後生出一個精準的 prompt,做出一台車 —— 當然,也可以直接上傳自己的模型。然後她做一個選擇:**開放別人來 remix,自己留一點權利金**。按下發佈 —— 模型本體存進 **Walrus**，規則寫上 **Sui**。」

#### 場景 2 — 別人把它 remix 成一個系列(1:50–2:25,~35s)

**[畫面 / 動作]**(切 profile = 二創者 B)
5. `/market` → 找到那台車 → `/model/:id` → **Buy Access** → Slush 簽 → 拿到 soulbound **`AccessEntitlement`**(白話:「一張綁定帳號、永久的取用票」)。
6. `/launch`(以二創者身分):**Remix into a Collection** → 簽一筆 → 設系列(例:`Neon Drift Series` 霓虹甩尾)→ **做出好幾個變體,各自調不同配色**(demo 影片裡實際就這樣做)→ 鑄出來。
7. 帶一句權利金:Explorer **一閃**帶過原創者自動收到她那份(**不要停留做長鏡頭**)。

**VO:**
> 「另一個創作者看到這台車,buy 一張取用票,然後把它 **remix 成一整個「霓虹甩尾」車系列** —— 同一個基底,做出好幾個變體,各自調了不同的配色。原創者那份權利金,鏈上自動結算,沒有平台居中,連二手轉售也改不掉。」

#### 場景 3 — 遊戲開發者用 MCP 找素材,在上面做遊戲(2:35–3:20,~45s)⭐

**[畫面 / 動作]**(敘事:遊戲開發者 D;錄製面 = terminal / Claude Code + IDE B-roll)
8. 開 terminal:`claude mcp add tusk3d https://api.tusk3d.store/mcp` → agent 用自己的錢包簽 nonce 登入。
9. 工具鏈(**7 個工具**,`backend/src/mcp/`):`search_models("low poly race car")` 搜到一台車 → `get_license_terms` 讀條款(看 `access_fee`:0=免費 / >0=付費,挑要的)→ **`list_fork_collections`** 列出衍生的 NFT 系列(「霓虹甩尾」浮出、照整合數排序)→ `build_purchase_tx` 買 access(自己的 SUI)→ `download_content` 拉模型。**把 NFT 整合進遊戲 = 把系列 holders 變玩家**(scene 4 兌現)。
10. 切 IDE / 對話式 coding B-roll(一兩秒):開發者 **vibe coding 出一款賽車遊戲**(畫面上 `/track` 就是這款遊戲)。
11. 可信度鏡頭:切 Sui Explorer 看 `AccessEntitlement` mint 到 agent 自己的地址。

> ⚠️ 動線確認:`scripts/agent-decrypt.ts`(本地解密那步)**可能還沒進 repo** —— 若沒有,demo 收在 `download_content` 回傳解密素材,VO 別宣稱螢幕上解密。agent 錢包要先有 testnet SUI;線上 package 要含 D-085。`/track` 是我們的 sample scene,敘事上代表「開發者在這系列上做的遊戲」,別宣稱真實第三方 studio。

**VO:**
> 「接著,一個遊戲開發者想要一些車來做賽車遊戲 —— 於是他不自己點,而是把一個 AI agent 指向 Tusk3D 的 MCP 端點。agent 用自然語言搜尋,挑出他要的模型 —— 免費或付費都行;它甚至能找出衍生的 NFT 系列(像「霓虹甩尾」,照整合數排序),把這些 NFT 直接整合進遊戲 —— 把系列的持有者變成現成的玩家。它讀鏈上的授權、用自己的錢包買下 access、把模型拉下來 —— 全程後端碰不到金鑰。拿到素材,開發者就在它之上 vibe coding 出一款賽車遊戲 —— 不用問任何人,因為全是開放、在鏈上的。」

#### 場景 3.1 — 開發者把遊戲註冊上整合頁(3:20–3:32,~12s)

**[畫面 / 動作]**(profile = 遊戲開發者 D)
12. 進 `/integrate`(`frontend/src/integration/RegisterIntegrationPage.tsx`)→ 填入他的遊戲、**綁定到「霓虹甩尾」collection** → 送出 → 鏈上發 `IntegrationRegistered` 事件。
13. 這一步讓遊戲出現在這個 collection 的整合清單裡 —— 正是 scene 4 用戶會看到的東西(把 scene 3 的「找素材做遊戲」和 scene 4 的「用戶發現遊戲」接起來)。

**VO:**
> 「接著,他到整合頁把自己的遊戲註冊上去 —— 連回「霓虹甩尾」系列,讓系列的持有者能找到它。」

#### 場景 4 — 用戶買車 → 整合頁發現遊戲 → 開自己的 NFT(3:32–4:05,~33s)⭐ payoff

**[畫面 / 動作]**(切 profile = 玩家 / NFT holder)
14. `/market` / `/collection/:id` → 買「霓虹甩尾」系列裡一個 **`NftToken`**(一台車)→ Slush 簽。
15. 在 collection 詳情 / 整合頁(`/integrate`)→ **發現剛剛那款遊戲整合了這個系列** → 點進去。
16. **進 `/track`** → 把**自己的 NFT 車**載入 → 開上賽道。全片 payoff:**你開的是自己錢包裡那台 NFT。**

> ⚠️ 動線確認:整合條目要真的能連到可玩的 `/track`(錄前手動走一遍);`/integrate` 的 leaderboard 升級是 2026-06-17 的 plan,確認線上是哪個版本。

**VO:**
> 「最後,一個玩家買下「霓虹甩尾」系列裡的一台車。在這個系列的頁面上,他發現一件事:有一款遊戲整合了這個系列。他點進去 —— 就在賽道上,開著自己那台 NFT。從一句 prompt、到 remix、到 agent 發現它、到別人做出一款遊戲、再到你開著自己擁有的車 —— 全是同一個鏈上資產、同一份 **Walrus** 儲存。這就是『可組合』真正的意思。」

---

### D — Stack：為什麼 Sui + Walrus(4:05–4:40)

**[畫面]** 全程疊 `architecture-diagram.svg`;VO 對著圖講 why,兩根支柱的元件都帶到。

**VO:**
> 「那為什麼要建在 **Sui** 和 **Walrus** 上?因為這裡最難的兩件事 —— 永久性和信任 —— 正好是它們解決的。**Walrus** 不只是檔案儲存:模型、加密內容、還有 **MemWal** —— 那層讓我們的 **AI copilot** 記得、並順著你過去作品 riff 的記憶層 —— 全都放在上面,去中心化、活得比任何公司久。而 **Sui** 讓規則不可竄改、而且對 agent 友善:授權和權利金在鑄造當下鎖進合約、access 是 soulbound `AccessEntitlement`、二手權利金走 **Kiosk**、整合登記在鏈上 —— 正因為全在鏈上,一個 **AI agent** 才能透過 **MCP** 直接發現、授權、買下素材;**Seal** 則讓付費內容只有那張 entitlement 解得開。儲存、記憶、規則、AI —— 全建在開放的基礎設施上,不是某一家公司的伺服器。」

---

### E — Conclusion + Future Vision(4:40–5:05)

**[畫面]** 回首頁 / logo,疊 roadmap **兩大方向(AI 輔助創作 / 開發者生態)** + 一句 ask。

**VO:**
> 「今天展示的全部都是真的、在鏈上跑。接下來我們專注兩件事 —— **AI 輔助創作**:creator 上傳整包素材、開發者更容易找到風格相近的素材、甚至用 AI 生成同風格的新模型;以及 **開發者生態**:launch collection 更多調整功能、讓 AI agent 透過 MCP 更容易接上、打通主流遊戲開發流程,Unity 以及像 Godot 這樣更開放的引擎。創作者經濟不該由平台決定誰擁有什麼。**Tusk3D —— 讓 3D 創作，真正屬於創作者。**」

---

## 5. 錄製 / 剪輯 checklist

- [ ] 三個 profile 的視窗 / 游標都乾淨,沒有測試垃圾資料、沒有私人分頁。
- [ ] 每個「點按鈕 → 鏈上結果」都留 1–2 秒停頓給觀眾看清楚(Screen Studio 可後製 zoom 進去)。
- [ ] Sui Explorer 的 balance changes / object 頁面要拍清楚、字夠大(必要時瀏覽器放大到 125–150%)。
- [ ] 全片 ≤ 5:00;目標 4:30 留 buffer。
- [ ] 旁白與畫面對齊,刪掉所有「呃 / 那個」贅詞(Descript 一鍵)。
- [ ] 片尾放:GitHub repo URL、demo URL(`tusk3d.store`)、testnet 合約地址。
- [ ] 匯出 1080p,上 YouTube(unlisted 或 public),把連結填進提交表單。
- [ ] **最終驗證**:從頭到尾看一遍,核對「口頭宣稱 = 螢幕事實」、無 mainnet/zkLogin/L3 等錯話。

---

## 6. 待你拍板 / open items

- ✅ **已定**:場景 3(進遊戲)+ 場景 4(MCP)**兩個都留**,當主要 feature。
- ✅ **已定**:Tripo 生成用 **預錄成功片段** 接,不現場跑。
- ✅ **已定**:不講 "L1/L2",白話「base / remix」;fee 一句帶過,不做拆帳長鏡頭。
- ✅ **已定**:示範物件用 **車**(不是劍)—— 跟場景 3 的賽車遊戲天然搭。系列名 `Neon Drift`(霓虹甩尾)。
- ✅ **已定**:場景 1 先用 **AI prompt copilot 對話 → 拿生成的 prompt** 再生成,展示 Gemini prompt-authoring 層。
- ✅ **已定**:開場 hook 換成有出處的 **Poly + FlippedNormals**(舊的 Sketchfab/Mixamo/Unity 未證實,棄用)。
- ⏳ 待定:授權頁的展示數字(access fee / derive fee / royalty %)要設多少?旁白不念,但 UI 會被拍到,先想好一組好看的值。
- ⏳ 待定:traction 數字(beta testers / Discord / LOI)要不要進 E 段 ask?有就加,強化 Real-World Application 50% 評分。
- ⏳ 待定:場景 4「整合頁 → 點進去 → `/track` 載入自己的 NFT 車」整條動線,錄前手動走一遍確認(整合條目要真的連到可玩的 `/track`)。
- ✅ **已定**:場景 3↔4 對調 —— 先 MCP(遊戲開發者找素材、`list_fork_collections` 列出系列)、再用戶整合頁發現遊戲開自己的 NFT 收尾。
- ✅ **已確認**:MCP 已支援 `list_fork_collections`(7 工具),scene 3 可講「列出 fork collection」。
