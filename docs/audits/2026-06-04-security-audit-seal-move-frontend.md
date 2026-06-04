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
- [x] **H-1** mint_tokens 可覆写 quilt(High)— ✅ 已修(D-086:quilt 一次性写锁 `EQuiltAlreadySet`)。供应上限(Info)按 (a) 推迟。
- [ ] **M-1** ensure_collection_policy 非幂等(Medium)— singleton 守卫 + 主网冷存 Publisher
- [x] **M-2** royaltyOwedMist 客户端楼层(Medium,需核实)— ✅ 已核实为**非漏洞,降级 Info**:链上 `royalty_rule::pay`(rev 7a07937)用 `policy::paid(request)`(链上真实价)算费 + `coin::value == amount` **精确相等**断言 → 无法少付;客户端值仅 UX,算错只会 abort。前端公式与链上一致。
- [x] **M-3** seal_id 无最小长度(Medium)— ✅ 随 C-1 一并修(D-085:== 32)
- [x] **M-4** Seal 会话缓存断连不清(Medium)— ✅ 已修(`clearSession` 接入 `clearAllSessions`,disconnect 链路覆盖;useSession 测试断言)
- [ ] **M-5** JWT 存 localStorage + window 广播(Medium)— sessionStorage / event 校验
- [x] **L-1** unknown policy=3 缺白名单(Low)— ✅ 已修(D-087:`EInvalidPolicy`)
- [x] **L-2** register_integration 自注册伪造(Low)— ✅ 已修(D-087:`ESelfRegistrationNotAllowed`)
- [x] **L-3** creator 自购 access(Low)— ✅ 已修(D-087:`ECreatorCannotSelfPurchase`)
- [ ] **L-4** Walrus dep rev="main"(Low)— pin SHA
- [ ] **L-5** loadKeypair 依赖 tree-shake(Low,需核实)— CI grep dist/
- [ ] **L-6** MarketPage 用 deprecated @mysten/dapp-kit(Low)— 迁移
- [ ] **L-7** fresh-kiosk 路径非 PersonalKiosk(Low)
- [ ] **L-8** priceMist 无客户端校验(Low)
- [x] **N-1** Enoki API key 进 bundle(Info,需核实)— ✅ 当前**无暴露**:key 未提交、不在本地 `.env.local`、项目**尚未部署**。转为**部署时清单项**:部署时 `VITE_ENOKI_API_KEY` 必须填 Enoki **public**(`enoki_public_…`)key 且在 Enoki Portal 锁 Allowed Origins。
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

### M-2 · royaltyOwedMist() 版税楼层仅在客户端 — ✅ 已核实为非漏洞(降级 Info)
- **位置**: `frontend/src/sui/kioskTxBuilders.ts:50-53,166`
- **命中来源**: sui-kiosk(High,条件性)
- **核实日期**: 2026-06-04(读源:`~/.move/.../apps@7a07937/kiosk/sources/rules/royalty_rule.move`)

**核实结论(非漏洞)**: 已部署的 Mysten `royalty_rule::pay` 自校金额:
```move
let paid = policy::paid(request);              // 链上记录的真实成交价(kiosk::purchase 写入)
let amount = fee_amount(policy, paid);          // 费用在链上从真实价算出
assert!(coin::value(&payment) == amount, EInsufficientAmount);  // 精确相等
```
版税由**链上** `policy::paid(request)`(攻击者无法伪造的真实价)算出,且断言**精确相等**(连多付都不行)→ **无法少付版税**。客户端 `royaltyOwedMist()` 仅为 UX 拆币;算错只会让 tx abort,无资损、无绕过。已核对前端公式 `max(price·bp/10000, min)` 与链上 `fee_amount` 在边界处完全等价。

**残留(非安全,robustness)**: `==` 是零容差 —— 若链上 policy Config 的 `amount_bp`/`min_amount` 与前端常量漂移,则**每笔** Kiosk 购买都会 abort。靠 `networkConfig.test.ts` parity 测试守住即可(与 kiosk 轨道 L-7 的 package-id 漂移提示同源)。

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

### N-1 · Enoki API key 进 bundle — ✅ 当前无暴露(转部署时清单)
- **核实(2026-06-04)**: `VITE_ENOKI_API_KEY` 未提交(仅 `.env.example` 模板)、不在本地 `frontend/.env.local`(本地走 test-wallet,Enoki 未启用)、项目尚未部署到生产 → **没有可被读取的 bundle**。
- **部署时清单项**(README/deploy 时执行):`VITE_ENOKI_API_KEY` 必须是 Enoki **public** key(`enoki_public_…`,设计上可进浏览器);Enoki Portal 锁定 Allowed Origins 到真实域名;切勿填 `enoki_private_…`(后端密钥)。

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

## Track 4–5(后端 TS/Hono + Walrus 存储层)—— 2026-06-04 补审

> 原 fallback 推迟项,已于 2026-06-04 用 4-dimension 只读 Workflow 补齐(每个 High/Critical 经对抗复核)。全程只读 · 未 build mcp-server · 未发链上交易。
> 编号前缀:`B-` = 后端,`W-` = Walrus。下列严重度为**对抗复核后的最终值**(标注降级/驳回)。

### 🟠 High(1)

#### B-1 · PaymentVerifier 不绑定生成请求 + 内存态防重放 → SUI 付费门可被 digest 重放绕过
`backend/src/sui/paymentVerifier.ts:36-92`(消费方 `backend/src/routes/generate.ts:61-73`)
- **复核结论**:维持 High;`needs_human_verification = true`(建议 testnet 实测一遍重放)。
- **攻击**:`verify(digest, payer)` 只校验①tx 成功 ②`sender==payer` ③有一笔到 treasury 的 SUI balanceChange `>= feeMist`。**从不校验这笔交易是"为哪次生成"付的**——无 nonce、无 per-request 标记、无 PTB 形状校验。于是 payer 历史上任意一笔 `>= 费用`、打给 treasury 的旧交易(打赏/退款/上一次生成的 digest)都能复用为新生成的付款凭证。唯一拦阻是 `const spent = new Set<string>()`(:36)——**进程内、非持久**:后端重启/重部署(hackathon/demo 频繁)即清空,所有用过的 digest 重新可用;多实例负载均衡下每实例各放行一次。净效果:用一张有效付款 digest 反复白嫖 Tripo credits(~60–120 credits/次)。
- **修复**:把付款绑定到请求——客户端在转账 PTB 内带一个服务端下发的一次性 nonce,verify 时断言 tx 含该 nonce;或让 digest 指向合约标记"已消费"的付款对象。`spent` 集落到现成的 SQLite quota-store(唯一约束 on digest),让防重放跨重启/跨实例生效。再加一个"交易须新近"(时间窗)校验拒绝陈旧历史转账。

### 🟡 Medium(6)

#### B-2 · provisioning 脚本把 delegate 私钥明文打印到 stdout
`backend/scripts/memwal-spike.ts:136`(`OWNER_KEY` 于 :32-36,错误处理 :143)
- **复核结论**:坐实但 High→**Medium**(私钥每次运行新生成、非提交进文件;blast radius 仅 testnet、默认 inert 的 Riff Copilot 记忆层,无资金/链上权限)。
- **攻击**:`console.log('delegate.privateKey ...', delegate.privateKey)` 把跨全 namespace 的 MemWal delegate 私钥打到 stdout(终端 scrollback / CI 日志 / shell history)。`.env.example` 把该脚本写成官方 provisioning 路径,所以这是预期操作流而非死脚手架。`console.error('SPIKE ERROR:', e)` 还会 dump 完整 error 对象。
- **修复**:不要打印私钥;若必须输出,只写到 `0600` 的 gitignore 文件或从 secrets manager 读;脚本按自己 header 所述"用完即删";`console.error` 改 `e instanceof Error ? e.message : String(e)`。

#### B-3 · `/api/auth/challenge` 无限速 + nonce Map 无界 → DoS/内存耗尽
`backend/src/routes/auth.ts:95-107`(store :34-67;`app.ts:34` / `server.ts:42` 无 limiter)
- **攻击**:每个 well-formed 地址都无条件插一条 5min TTL 的 NonceEntry,sweep 每 60s 才跑且只清已过期项;稳态内存 = 请求速率 × 5min 存活 nonce,脚本刷可达百万级,OOM 杀死单 Node 进程(整后端宕)。无需鉴权(本就是发 challenge 的公开端点)。
- **修复**:给 `/challenge` 加 per-IP 固定窗限速(复用 `collections.ts` 现成 pattern)+ Map 容量上限(超限拒新/逐旧);生产按 `auth.ts:18` 注释迁 Redis(原生 TTL)。

#### B-4 · PaymentVerifier `sender==treasury` 直接放行、**不校验金额**
`backend/src/sui/paymentVerifier.ts:68-71`
- **攻击**:`sender==treasury` 时立即 `ok:true`,跳过金额校验。注释称 treasury 默认=deployer(D-034),"自己骗自己"无意义——但代码判的是 `sender==treasury` 而非 `sender==deployer`。一旦运营把 `TRIPO_FEE_TREASURY` 设成共享/multisig/sponsor 地址、且它**同时是某用户钱包**,该用户无限免费生成(任意自转 digest 都过、金额不校验)。且此路径只靠 `spent` 集,继承 B-1 的重启重放弱点。
- **修复**:把 bypass 绑到显式 `OPERATOR_ADDRESS` 而非 `sender===treasury` 巧合;并仍要求 digest 是 `>= feeMist` 的自转账。明文规定生产 treasury 必须与任何用户钱包不同。

#### W-1 · CDN Worker 把 `url.search` 原样转发给 aggregator → 边缘缓存投毒
`cdn-worker/src/worker.js:66`
- **攻击**:`originUrl = base + url.pathname + url.search`,调用方可对 `/v1/blobs/<id>` 任意追加 query。若 aggregator 将来识别某参数改变响应字节(`?format=raw|gzip`、签名参数等),外部调用方即可控制某 blobId 在 **1 年不可变 TTL** 下缓存的内容,污染该 blob 对所有后续读者。
- **修复**:构造 originUrl 前整段去掉 `url.search`(Walrus v1 blob 读路径不需要 query):`const originUrl = base + url.pathname;`。

#### W-2 · `memory.ts` 限速器 `hits` Map 无界 → 慢速内存耗尽 DoS
`backend/src/routes/memory.ts:154-157, 181-184`
- **攻击**:限速按地址 600/min(宽松),但底层 `hits` Map 无容量上限——攻击者用大量(可轻易生成的)Sui 地址各发一次请求,每个地址塞一条存活 60s 的项,把 Map 撑爆。无全局/IP 级限速兜底。
- **修复**:`hits` Map 加容量上限(如 5 万)+ 溢出逐旧 / LR;并在 Hono 中间件加一层全局(IP 级)限速。

#### W-3 · `WALRUS_AGGREGATOR` 硬编码 testnet → 上主网静默读错网络
`frontend/src/walrus/aggregator.ts:8`
- **攻击**:module 级常量指向 testnet aggregator,无 env override。8/27 前上主网(CLAUDE.md 要求)后,所有 blob 读 URL 仍解析到 testnet:主网 blob 在 testnet aggregator 返回 404,**所有模型预览/GLB 下载在切主网瞬间全断**且需改码重部署;更糟,主网 blobId 与 testnet 同 ID 不同内容会串读错字节。
- **修复**:换成 build-time env(`VITE_WALRUS_AGGREGATOR` / `VITE_NETWORK`)驱动,参照现有 `networkConfig.ts` 的 package-id 选网 pattern 收口。

#### W-4 · blobId 来自链上数据未做格式校验 → 路径穿越/缓存键风险
`frontend/src/walrus/aggregator.ts:17-19`(+ `cdn-worker/src/worker.js:66`)
- **攻击**:`glbUrlForSummary` 直接拼 `patchId/glbBlobId/blobId`。攻击者在链上发一个 `blobId` 为 `../../../etc/passwd` 或 `%2F` 编码 dot-segment 的恶意 Model3D,前端/Worker 即拼出非预期 aggregator 路径并按 `/v1/blobs/` 缓存键缓存。
- **修复**:拼 URL 前校验 blobId 匹配 `^[A-Za-z0-9_-]{20,60}$`(Walrus base64url 格式),不符则抛错/占位;Worker 侧同样校验后再构造 originUrl。

### 🟢 Low(7)

| 编号 | 标题 | 位置 |
|---|---|---|
| B-5 | CORS 仅 `localhost`、未 env 驱动(上生产会断,或被迫开 `*`/反射 Origin 泄漏 Bearer API);**因用 Bearer 非 cookie,CORS 非主鉴权边界故降 Low** | `backend/src/app.ts:34` |
| B-6 | 登录 nonce 未绑 origin/audience(签名串 `overflow2026 sign-in: ${nonce}` 无 domain/chain);现单后端下仅硬化项,建议 SIWS 风格 | `backend/src/routes/auth.ts:71-73,126-133` |
| B-7 | `capVerifier` type gate 在 RPC 缺 `type` 字段时**跳过**(fail-open),退化为只看 owner+collection_id;改 `typeof !== 'string' \|\| !==expected` fail-closed | `backend/src/sui/capVerifier.ts:61-64` |
| B-8 | per-IP 限速取 `X-Forwarded-For` 首跳(客户端可伪造,每请求换 IP 绕限速 + 撑大 hits Map);应取受信代理跳 | `backend/src/api/collections.ts:37` |
| B-9 | 单用户一次 429 触发**全局跨用户** Gemini 冷却(整 capability 对所有人 quota_exhausted);已被窄化分类器+冷却钳制收敛,运营付费模型下可接受 | `backend/src/lib/gemini-quota.ts:126-131` |
| B-10 | Tripo 字段漂移时把签名 CDN 输出 URL 整条 log(短时签名链接,可被读日志者临时下载运营付费资产;非凭证) | `backend/src/lib/tripo-client.ts:210-214` |
| W-5 | `@mysten-incubation/memwal@0.0.6` 为 incubation 预发布包(lockfile 已精确锁版本,但成熟度低、delegate key 直传该 SDK);主网前请求 Mysten 安审 | `backend/package.json:19` |

### ⚪ Info / 已驳回 / 跨轨已解

- **W-6(驳回)**:`MEMWAL_SERVER_URL` "SSRF" → 复核**驳回**降 Low。值仅来自 server 端 env、无任何攻击者可达输入路径,不构成 SSRF;能改该 env 的人本就能直接读 `MEMWAL_DELEGATE_KEY`,前置条件 ≥ 收益。剩一条 Low 硬化:启动校验 `https://` 防误配 http 明文外发。`backend/src/lib/memwal-client.ts:119`
- **W-7(驳回)**:`MemwalClient.remember()` namespace 未校验 → 复核**驳回**降 Info。穷举所有 caller,namespace 一律服务端从 JWT sub 派生 + 正则校验 + normalize,客户端无字段可传;攻击依赖"假想的未来 caller",属纵深硬化非现存漏洞。`backend/src/routes/memory.ts`
- **W-8(跨轨已解)**:`collection.ts:98` encryptedBase cap 校验的"冷启动 RPC 失败 fail-open?"疑问 → auth 轨已读 `capVerifier.ts:85` 证实 **RPC error fail-closed**(返 false),非问题。建议仍在 `server.ts` 预注入 capVerifier 以纳入测试覆盖。
- **B-11(Info,配置 footgun)**:`paymentDigest` 为 `.optional()`,付费门仅当 `deps.paymentVerifier` 接线时才强制;`buildServerApp` 路径未接 verifier → 经该路径部署会**整门跳过**白嫖。建议 fail-closed(prompt-mode 该收费却无 verifier 时 503)+ 付费/鉴权路由 schema 加 `.strict()`。`backend/src/lib/schema.ts` / `backend/src/routes/generate.ts:61`
- **W-9(确认 clean,正向)**:后端**从不接触明文 AES key**。forker 解密后的 GLB 明文仅进 `/api/collection/build` 做材质替换、内存即弃(`collection.ts:97` 注释 NO plaintext persistence);Seal-wrap 的 32B key + sealId 只走链上 PTB(`modelTxBuilders.ts:197-198`),不入任何后端 API。信封加密架构对"后端不见 key"实现正确。
- **供应链澄清**:audit brief 提的"`@mysten/walrus` unpin 到 main 分支"**未坐实**——`frontend` 锁 `1.1.7`、`backend` 锁 memwal `0.0.6`,pnpm-lock 均精确解析,无 floating VCS ref。
- **确认 clean(后端)**:无提交私钥(`git grep` suiprivkey1/AIza/sk- 皆空,`.env*` 均 gitignore);3rd-party key 仅作 `Authorization: Bearer` header、从不 stringify/log/返回;JWT 无 alg-confusion(`jwt.ts` 显式钉 HS256 + zod 二次校验 + sub 正则)、secret 启动 `assertJwtSecret` 硬校验;受保护路由命名空间一律从 JWT sub 派生**无 IDOR**;`nonce z.string().min(1)` 经复核**非漏洞**(server 自生成 256-bit nonce,客户端弱串仅会 miss Map 返 401)。

### 严重度汇总(Track 4–5,复核后)

| 级别 | 数量 | 编号 |
|---|---|---|
| 🟠 High | 1 | B-1 |
| 🟡 Medium | 6 | B-2 · B-3 · B-4 · W-1 · W-2 · W-3 · W-4(注:W-4 与 W-3 同属 aggregator,共 6 项 Medium) |
| 🟢 Low | 7 | B-5…B-10 · W-5 |
| ⚪ Info/驳回/已解 | 6 | W-6 · W-7 · W-8 · W-9 · B-11 · 供应链澄清 |

**Step 3 人工 triage 必做(需人工核实)**:B-1(testnet 实测 digest 重放,`needs_human_verification`)· W-3(切主网前必修,否则读路径全断)。

### ✅ 修复状态(2026-06-04,全部 Medium 一起修)

经 plan(`docs/plans/agile-orbiting-pearl.md`)+ 6-reviewer pass(ce-correctness / ce-adversarial / ce-security / ce-testing / ce-api-contract / ce-julik-frontend-races)落地。Backend 306 测试 + worker smoke 6 + 前端 aggregator 13 全绿;`/browse` 浏览器实测 4/4 缩略图真链 ID 正常解析(W-4 不误杀)。

| 编号 | 状态 | 落地 |
|---|---|---|
| 🟠 B-1 | ✅ 修复(D-088) | spent_payments SQLite 表 + 原子 INSERT OR IGNORE 防重放(跨重启/实例)+ 1h recency 窗。完整 per-request 绑定(Option B)推迟 v1.1 → **OQ-033** |
| 🟡 B-2 | ✅ 修复 | delegate 私钥改写入 0600 gitignore 文件(`backend/.env.memwal-delegate`)仅打印路径;错误处理仅打 message |
| 🟡 B-3 | ✅ 修复 | `/challenge` per-IP 限速(默认 30/min,429)+ nonce Map 100k 上限(sweep 后逐最旧)|
| 🟡 B-4 | ✅ 修复(D-089) | 自付旁路改 gate 在显式 `TRIPO_FEE_OPERATOR`(默认 deployer),非 `sender==treasury` |
| 🟡 W-1 | ✅ 修复 | worker 不再转发 `url.search`;缓存键 pathname-only |
| 🟡 W-2 | ✅ 修复 | collections/memory/auth 限速 Map 加 50k 上限 + 逐最旧 |
| 🟡 W-3 | ✅ 修复 | `WALRUS_AGGREGATOR` 改 `VITE_WALRUS_AGGREGATOR` env 驱动(testnet 默认)|
| 🟡 W-4 | ✅ 修复 | aggregator.ts `BLOB_ID_RE` charset 守卫(畸形 ID→''/null)+ worker id 段 charset 校验(400)|

**Review pass 结论**:对抗 + 安全 reviewer 均未发现可利用绕过(防重放原子性 ✓、worker 穿越/投毒已闭合 ✓、operator 旁路外部不可达 ✓)。发现并已修 **1 个真实缺陷**:`TrackPage.tsx:252` 是唯一直接 `fetch(glbUrlForToken())` 的调用方(其余走 PreviewCanvas 的 `!glbUrl` 守卫),W-4 的 ''-返回会让 `fetch('')` 命中 app HTML(`res.ok` 仍 true)→ 已加 `if (!url)` 守卫 + 测试。

**已记录残留(非阻断,见 OQ-034)**:
- operator 旁路仍跳过金额/收款校验 —— 但仅 deployer-key 签发的 JWT 可达(非外部升级),且自付 NET≈-gas 本就过不了金额校验,属 D-034/D-089 既定取舍。
- recency 窗在 RPC 缺 `timestampMs` 时 fail-open(已加测试锁定该契约)—— 窄:已 checkpoint 的旧 tx 必带 timestamp;spent-set 仍绑定每 digest 一次。
- 限速 Map 逐最旧在 50k 满时可被"刷满→重置某 key 窗口",自限(成本 = MAX_KEYS 次请求);W-2 主目标(限内存)已达成。
- `encryptedFork.ts:231` / `LaunchCollectionPage.tsx:526` 直接拼 `WALRUS_AGGREGATOR`+链上 ID,绕过 `blobUrl()` —— 生产指向 CDN worker 时由 worker 兜底校验;raw aggregator(本地 dev)无 W-4 防护。→ **OQ-034**
- W-2 Map-cap 分支无直接单测(逻辑与已测的 nonce-store 逐出一致)→ **OQ-034**

---

## 附:Workflow 运行元数据

**Track 1–3**(Seal/Move/frontend,2026-06-04 早):
- 6 agents · 434,039 subagent tokens · 201 tool uses · 507s
- agentType: sui-security-guard-subagent / sui-developer-subagent / sui-red-team-subagent / sui-kiosk-subagent / sui-frontend-subagent / sui-zklogin-subagent
- 原始结构化输出: `tasks/wzy5rdwi0.output`(Run ID `wf_5de7c7d8-3e9`)

**Track 4–5**(后端/Walrus,2026-06-04 补审):
- 8 agents · 370,039 subagent tokens · 157 tool uses · 376s
- 4 dimension 并行 + High/Critical 对抗复核:ce-security-reviewer / sui-security-guard-subagent / ce-api-contract-reviewer / sui-walrus-subagent / ce-adversarial-reviewer
- 原始结构化输出: `tasks/wnc6emf8k.output`(Run ID `wf_cc39a5c8-615`)
