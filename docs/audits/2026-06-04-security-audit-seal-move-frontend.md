# Tusk3D 安全审计报告 — Seal / Move / 前端签名

**日期**: 2026-06-04
**范围**: Step 1–3(Seal 加密与访问控制 · Move capability + 红队 + Kiosk · 前端钱包/签名/zkLogin)
**推迟**: 后端 TS/Hono · Walrus 存储层(fallback 模式,demo 后补)
**模式**: 只读 · 未 build mcp-server · 零链上交易
**方法**: 插件基线扫 + 6-agent 并行深审(sui-security-guard / sui-developer / sui-red-team / sui-kiosk / sui-frontend / sui-zklogin,434k tokens / 507s)+ 主线逐条回源复核
**审计目标 commit**: main @ 7676dd5

> ⚠️ 标 **需人工核实** 的项请在 Step 3 triage 时实测确认后再下结论。Severity 为审计员回源复核后的**最终评级**(部分与单个 agent 原评不同,差异处已注明)。

---

## 修复追踪清单(按优先级)

- [x] **C-1** seal_id 前缀截断绕过(Critical)— ✅ 已修(D-085:定长 32 字节 + 门内长度断言;90/90 Move 测试通过含红队回归)。⏳ 需 testnet republish 生效
- [ ] **H-1** mint_tokens 可覆写 quilt + 无供应上限(High)— 一次性写锁 + max_supply
- [ ] **M-1** ensure_collection_policy 非幂等(Medium)— singleton 守卫 + 主网冷存 Publisher
- [ ] **M-2** royaltyOwedMist 客户端楼层(Medium,需核实)— 确认链上 royalty_rule::pay 自校
- [x] **M-3** seal_id 无最小长度(Medium)— ✅ 随 C-1 一并修(D-085:== 32)
- [ ] **M-4** Seal 会话缓存断连不清(Medium)— disconnect 接入 clearAllSessions
- [ ] **M-5** JWT 存 localStorage + window 广播(Medium)— sessionStorage / event 校验
- [ ] **L-1** unknown policy=3 缺白名单(Low)— assert policy∈{0,1,2}
- [ ] **L-2** register_integration 自注册伪造(Low)— assert sender != nft_creator
- [ ] **L-3** creator 自购 access(Low)— assert sender != creator
- [ ] **L-4** Walrus dep rev="main"(Low)— pin SHA
- [ ] **L-5** loadKeypair 依赖 tree-shake(Low,需核实)— CI grep dist/
- [ ] **L-6** MarketPage 用 deprecated @mysten/dapp-kit(Low)— 迁移
- [ ] **L-7** fresh-kiosk 路径非 PersonalKiosk(Low)
- [ ] **L-8** priceMist 无客户端校验(Low)
- [ ] **N-1** Enoki API key 进 bundle(Info,需核实)— 确认 public key + origin 锁定
- [ ] **N-2** package UpgradeCap 处置未知(Info,需核实)— 主网前 burn/multisig
- [ ] **N-3** verifyKeyServers:false(Info)— 主网翻 true
- [ ] **N-4** glb_blob_id 未与 Blob.id 交叉校验 / 无 Blob 认证检查(Info)

---

## 🔴 CRITICAL

### C-1 · seal_id 前缀截断绕过 —— 任意加密模型内容可被第三方解密 ⚠️需人工核实
- **位置**: `contracts/model3d/sources/model3d.move:818, 1319-1359`;`frontend/src/seal/envelope.ts`(buildSealId)
- **命中来源**: sui-red-team(Critical)+ sui-security-guard(Medium),两 agent 独立命中;审计员回源取 **Critical**

**攻击场景**:`publish_encrypted` 的唯一性守卫用**精确字节** `table::contains(registry.used, seal_id)`(818),而解密门用 `is_prefix(model.seal_id, id)`(1346/1356)。两种"唯一性"不等价;且 `seal_id` 是调用者任意提供的 `vector<u8>`,仅校验长度上限 ≤64。

1. 受害者发布加密模型,`seal_id = V`(32B,经 `seal_id()` 公开可读),内容封装在 Seal 身份 `id = [V][nonce]`;
2. 攻击者读取 V,发布**自己的** RESTRICTED 抛弃模型,`seal_id = P = V[0:k]`(严格更短前缀)。注册表里有 V 没有 P → `ESealIdReused` 不触发,P 入表;
3. 攻击者从受害者**链上公开的 `sealed_key`** 解析出完整 `id=[V][nonce]`(`recoverFullSealId`,forkerDecrypt.ts:48-51 的同款逻辑),调用 `seal_approve_creator(id, 攻击者模型)`:`is_prefix(P,[V][nonce])`=真、`sender==攻击者模型.creator`=真、`version`=真 → **门通过**;
4. Key server 释放该身份的密钥分片 → 攻击者解出 AES key → 解密受害者 Walrus 上的 GLB 密文。**整个 Seal 付费访问/付费 fork 的机密性被绕过,攻击成本≈0(RESTRICTED 无 access_fee)。**

合约头注释(1304-1316)断言"注册表精确唯一性使前缀绑定不可伪造" —— **此推理错误**:精确唯一 ≠ 前缀无关。

**修复**: `new_model` 内从 `object::id(model)` 派生 32B `seal_id`(构造即全局唯一、不可伪造);**或**强制 `assert!(vector::length(seal_id)==32)` 且把门改成对前 32 字节**相等**判断(`id[0:32]==model.seal_id`)而非 `is_prefix`。修复后补红队测试:发布前缀模型并断言 `seal_approve` abort。

**需人工核实**: 唯一无法静态确认的一环是 Seal key server 运行时语义(是否仅凭 `seal_approve(id,…)` 不 abort 即释放该 `id` 的密钥、不额外绑定传入的 `model`)。这是 Seal 标准行为,合约头注释也这么描述。testnet 实测:发布受害者 ALLOW_LIST 模型 → 发布 `seal_id=V[0:16]` 的攻击者模型 → 跑解密流验证 key server 是否放分片。

---

## 🟠 HIGH

### H-1 · mint_tokens 可反复覆写 quilt_blob_id + 无供应上限 —— 内部 rug-pull
- **位置**: `contracts/model3d/sources/model3d.move:1159-1187`(已回源确认)
- **命中来源**: sui-developer(High)

**攻击场景**: `mint_tokens`(cap 门)第 1173 行无条件 `collection.quilt_blob_id = quilt_blob_id`,无一次性锁、无供应上限、可重复调用。NftToken 只存 `patch_id`,前端按 `collection.quilt_blob_id + patch_id` 解析美术。卖完第一批后,cap 持有者(= collection creator)再调 `mint_tokens` 换 `quilt_blob_id` → **所有已售出 token 的视觉内容被换掉**;同时可无限增发稀释供应。属持 cap 方对买家的内部 rug。

**修复**: `quilt_blob_id` 加一次性写锁(首次非空后置 `quilt_locked=true`,再写 abort);`NftCollection` 增 `max_supply` + `minted_count`,mint 核心断言上限。

---

## 🟡 MEDIUM

### M-1 · ensure_collection_policy 非幂等 → 竞争 TransferPolicy 可绕版税 ⚠️需人工核实(主网 ceremony 状态)
- **位置**: `contracts/model3d/sources/model3d.move:490-498`
- **命中来源**: sui-kiosk(High)+ sui-developer(Low);审计员取 **Medium**(testnet 受 deployer-only Publisher 限制;主网升 High)

**场景**: 无幂等守卫(合约注释 484 已自承)。Publisher 归 deployer 所有(init 第 445 行 public_transfer 给 sender),故仅 deployer 或被盗密钥可二次调用,产生第二个**空规则** TransferPolicy。买家可对空 policy 走 `confirm_request` 跳过版税。
**修复**: singleton 守卫(policy id 存共享单例,已设则 abort)+ 主网 bootstrap 后立即把 Publisher / TransferPolicyCap 移冷钱包或 multisig。

### M-2 · royaltyOwedMist() 版税楼层仅在客户端 ⚠️需人工核实
- **位置**: `frontend/src/sui/kioskTxBuilders.ts:50-53,166`
- **命中来源**: sui-kiosk(High,条件性)

**场景**: PTB 不强制用正确 priceMist 调用 `royalty_rule::pay`;链上是否拦截取决于已部署 `royalty_rule::pay` 是否自校金额。
**需人工核实**: 读 `kioskAppsPackageId 0xe308…` 链上字节码。标准 Mysten royalty_rule **会**自校 → 降为 Info;非标准则升 Critical。注:该 package id 与 @mysten/kiosk SDK 默认值不同(networkConfig.ts:59 注释已标),更需确认。

### M-3 · seal_id 无最小长度下限(放大 C-1)
- **位置**: `contracts/model3d/sources/model3d.move:639-640,700`
- **命中来源**: sui-developer + sui-red-team

**场景**: 仅拒空,可 1 字节。1 字节前缀匹配面极大。**修复**: `assert!(vector::length(seal_id)==32)`,与 C-1 一并修。

### M-4 · Seal 会话缓存断连不清 ✅已确认
- **位置**: `frontend/src/seal/sessionKey.ts:122` / `frontend/src/auth/useSession.ts:175-178`
- **命中来源**: sui-zklogin(Medium);审计员 grep 已确认

**场景**: `disconnect()` 只调 `clearSession()`(清 JWT/localStorage)+ `disconnectWallet()`,**未** import/调用 `clearAllSessions()`。共享设备 demo:换钱包后上一个用户的 Seal SessionKey 仍在模块级缓存。
**修复**: `disconnect` 链路接入 `clearAllSessions()`。

### M-5 · JWT 存 localStorage + window 广播
- **位置**: `frontend/src/auth/useSession.ts:6,64-86`
- **命中来源**: sui-frontend(Low)+ sui-zklogin(High);审计员取 **Medium**(XSS 前置;JWT 不门控链上签名,仅门控后端付费 Tripo)

**场景**: XSS 可读 `localStorage['overflow2026.session']` 或监听 `overflow2026:session-changed` 事件窃取 JWT。
**修复**: 改 `sessionStorage`/`BroadcastChannel` 或 HttpOnly cookie;`session-changed` handler 校验 detail.address 与当前钱包一致。

---

## 🟢 LOW

### L-1 · 未知 policy 值(=3)缺白名单 ⬇️已降级
- **位置**: `contracts/model3d/sources/model3d.move:815,966`
- **命中来源**: sui-developer(原评 High)→ 审计员回源降 **Low**

**回源结论**: `is_encrypted = policy != PERMISSIONLESS`(693),`publish_encrypted` 仅拒 PERMISSIONLESS,无 {0,1,2} 白名单。policy=3 虽可被任意人 fork(内部门 966 仅 `policy != RESTRICTED || creator`,外门 1039 仅 `policy != ALLOW_LIST || creator`,policy=3 两门皆过)—— **但解密仍需 entitlement(ALLOW_LIST 限定 mint)或 creator,非创建者 fork 后无法解密内容**。故为状态完整性/输入校验问题,非机密性破口。
**修复**: `assert!(policy==RESTRICTED||policy==ALLOW_LIST||policy==PERMISSIONLESS, EInvalidPolicy)`。

### L-2 · register_integration 可自注册伪造 "Used by"
- **位置**: `contracts/model3d/sources/model3d.move:1256-1302`
- nft_creator 自注册,register_fee 回流自己(默认 0),刷高集成数误导买家。**修复**: `assert!(sender != collection.nft_creator)`。

### L-3 · creator 自购 access(指标污染)
- **位置**: `contracts/model3d/sources/model3d.move:885-925`(亦见 MEMORY obs #378)
- 自付自收净零,污染 buyers 表 / AccessPurchased 事件。**修复**: `assert!(sender != model.creator)`(creator 本就可经 seal_approve_creator 解密)。

### L-4 · Walrus 依赖 rev="main"(可变引用)
- **位置**: `contracts/model3d/Move.toml:14`
- Kiosk 已 pin SHA,Walrus 未 pin(published-at 子树有部分缓解)。主网前 pin 具体 SHA。

### L-5 · loadKeypair 生产排除依赖 tree-shake ⚠️需人工核实(CI)
- **位置**: `frontend/src/wallet/useAppAccount.ts:20`, `useAppSigner.ts:22`
- 静态 import + `TEST_WALLET_ENABLED` 死代码消除;`loadKeypair.ts` 有 PROD throw 兜底(已确认)。**需核实** CI 是否对 `frontend/dist/` grep `loadKeypair|VITE_TEST_WALLET_KEY`(plan-016 U6 AE4)。建议改 dynamic `import()`。

### L-6 · MarketPage 用 deprecated @mysten/dapp-kit
- **位置**: `frontend/src/market/MarketPage.tsx:15,240` — 迁移到 `@mysten/dapp-kit-react`。

### L-7 · fresh-kiosk 路径非 PersonalKiosk
- **位置**: `frontend/src/sui/kioskTxBuilders.ts:116-128` — 与 `ensure_creator_kiosk` 意图不一致;若将来重加 personal_kiosk_rule 会购买失败。

### L-8 · priceMist 无客户端校验
- **位置**: `frontend/src/sui/kioskTxBuilders.ts:69-78` — 链上价格不符会 abort,无资损,仅 UX;建议买前重取价。

---

## ⚪ INFO / 需人工核实

### N-1 · Enoki API key 进 bundle ⚠️需人工核实
- **位置**: `frontend/src/main.tsx:10`(`VITE_ENOKI_API_KEY`)→ `WalletProvider.tsx:51`(`registerEnokiWallets({ apiKey })`)
- **命中来源**: sui-zklogin(原评 High)→ 审计员下调为 **需核实**
- `registerEnokiWallets` 是前端 SDK,用的应是 Enoki **公钥**(设计上就该在浏览器、由 portal 的 allowed-origins 锁定)。**请确认**该 key 在 Enoki portal 是 public 且已锁 origin → 正常;若误用 private/secret key → 才是真 High 泄漏。

### N-2 · package UpgradeCap 处置未知 ⚠️需人工核实
- **位置**: `contracts/model3d/sources/model3d.move:443-449`
- 恶意升级 `seal_approve_*` 可回溯解密所有历史密文(key server 总按最新版本 dry-run)。version tripwire 只防**意外**重门,不防**恶意**升级。主网前 burn(make_immutable)或转 multisig;`UPGRADE.md` 记录。

### N-3 · verifyKeyServers:false
- **位置**: `frontend/src/seal/sealClient.ts:76`
- **命中来源**: Seal track(Info)+ sui-zklogin(Medium,误判)→ 审计员取 **Info**
- ID 硬编码、非调用者可控,BLS 门限仍需真服务器,**机密性安全**。残余风险仅为 ID 写错 → 可用性(非泄漏)。主网翻 `true` + 重 pin 签约方 ID。

### N-4 · glb_blob_id 未与 Blob.id 交叉校验 / 无 Blob 认证检查
- **位置**: `contracts/model3d/sources/model3d.move:670-742`
- `glb_blob_id`(String)从不与 `blob.blob_id()`(u256)交叉校验;`publish` 不调 `assert_certified_not_expired`。可发布指向不可用/不一致内容的模型。买家付费后可能拿到空内容。

---

## ✅ 经审计确认稳健(节选)

- `seal_approve_entitlement` 三腿 + version tripwire 完整(model_id/holder/prefix/version);`seal_approve_creator` creator 限定 —— **除 C-1 前缀洞外**结构正确
- **fail-CLOSED** version tripwire 真实生效(mismatch → abort = deny)
- `AccessEntitlement` / `NftCollectionCreatorCap` 均 `key`-only **真 soulbound**,类型系统拒绝 Kiosk place
- 所有费用路径(purchase_access / derive / register)`>=` 校验 + 精确 split + 余额退回/destroy_zero,**无 pay-less / 取整漏损 / 资金锁定**
- 版税 ≤30%(3000 bps)各路径强制 + belt-and-suspenders 复查
- `package::from_package<NftToken>` 拒外来 Publisher;cap 跨集合 `EWrongCollectionCap` 拦截
- `new_model` 为 package-private,外部 PTB 无法构造 Model3D 私吞;批量 mint 长度匹配检查
- `SignConfirmation`(D-053)签名前展示金额+收款地址 —— **无盲签**;PTB 收款方来自 `useCurrentAccount` 非攻击者输入
- **无 Enoki sponsored-tx 攻击面**(仅作 wallet adapter);ephemeral key 全托管给 Enoki SDK
- **无明文私钥入库**;nonce 256-bit、单次消费、address 绑定、5 分钟 TTL;JWT HS256 + zod 校验,fail-closed 过期判定

---

## 📋 严重度汇总

| 级别 | 数量 | 编号 |
|---|---|---|
| 🔴 Critical | 1 | C-1 |
| 🟠 High | 1 | H-1 |
| 🟡 Medium | 5 | M-1 … M-5 |
| 🟢 Low | 8 | L-1 … L-8 |
| ⚪ Info/需核实 | 4 | N-1 … N-4 |

**Step 3 人工 triage 必做(需人工核实)**: C-1(Seal KS 运行时语义,testnet 实测)· M-1(主网 ceremony 状态)· M-2(royalty_rule::pay 链上自校)· N-1(Enoki key 类型/origin)· N-2(UpgradeCap 处置)· L-5(CI dist grep)。

---

## 推迟项(fallback,demo 后补)

后端 TS/Hono 与 Walrus 层未审。zkLogin/frontend agent 顺带浮出的后端线索供后续跟进:
- `/api/auth/challenge` 无限速 → 内存 nonce Map 可被打爆(DoS),`backend/src/routes/auth.ts:95-107`
- CORS 仅 `localhost`,上生产会断或被迫开 `*`,`backend/src/app.ts:34`
- auth nonce 未绑定 origin/session(跨源预计算挑战),`backend/src/routes/auth.ts:95-106`
- nonce schema `z.string().min(1)` 过松,`backend/src/lib/schema.ts:39`

---

## 附:Workflow 运行元数据

- 6 agents · 434,039 subagent tokens · 201 tool uses · 507s
- agentType: sui-security-guard-subagent / sui-developer-subagent / sui-red-team-subagent / sui-kiosk-subagent / sui-frontend-subagent / sui-zklogin-subagent
- 原始结构化输出: `tasks/wzy5rdwi0.output`(Run ID `wf_5de7c7d8-3e9`)
