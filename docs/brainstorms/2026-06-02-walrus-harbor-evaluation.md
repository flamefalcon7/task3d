# Walrus Harbor 评估报告

**日期**: 2026-06-02
**作者**: research session (read-only)
**对象**: [MystenLabs/walrus-harbor-quickstart](https://github.com/MystenLabs/walrus-harbor-quickstart)
**结论**: 不集成 Harbor 作为存储主路径;但其 Seal 参考实现暴露了 3 个值得跟进的项(尤其 mainnet 升级暗雷)。

---

## 1. Harbor 是什么

Walrus Harbor 是 Mysten Labs 官方的**托管式存储服务**——Walrus 之上的「S3 / 控制台 + REST API」层。

| 维度 | Harbor 的做法 |
|---|---|
| 接口 | REST API(11 个端点)+ Web 控制台,用 **bucket(桶)** 组织文件 |
| 认证 | Bearer token(`hbr_…` API key),底层 zkLogin / Sui 钱包 |
| 加密 | 客户端用 **Seal** 加密后上传;Harbor **只持有密文**,拿不到明文或解密密钥 |
| Gas | 通过 **Enoki 赞助**(仅托管服务侧,quickstart 代码里没有) |
| 技术栈 | TypeScript + Hono 后端(与本项目 backend 同栈) |
| 状态 | ⚠️ **Alpha,仅 testnet**(`https://api.testnet.harbor.walrus.xyz`) |

quickstart repo 本身只是脚手架:OpenAPI spec、Postman collection、TS 参考实现(`app/src/lib/seal.ts`、`harbor.ts`)、给 AI assistant 的指引。

---

## 2. 是否值得集成:否(作为存储主路径)

四点理由,均与本项目现状直接冲突:

1. **Alpha + 仅 testnet** —— 与 8/27 mainnet 截止日硬冲突(100% 奖金要求 mainnet 部署)。把核心存储压在不可控的 alpha 外部服务上,风险过高。
2. **这一层已自建** —— 现状是 `@mysten/walrus` + upload relay + 自有 codec + Seal + CDN Worker(D-073、plan-018)。切 Harbor = 重写,投入产出比差。
3. **踩中评审「S3 替代品」陷阱** —— 见 memory obs 880/881/882:Walrus track 奖励**深度原生**,扣分**把 Walrus 当 S3**。Harbor 的「bucket + REST」正是 S3-replacement 叙事。
4. **抽走的恰是展示点** —— Gas 赞助、Seal 加密、Walrus 编码被 Harbor 藏起来,而这些正是 demo 要讲的技术深度。

---

## 3. Seal 实现对比(逐点)

只对比了 Seal(Enoki/sponsor 在 quickstart 代码里不存在)。

### 3.1 头部结论:本项目设计 **比 quickstart 更高级**

| | Harbor quickstart | Tusk3D |
|---|---|---|
| 加密策略 | 直接 `seal.encrypt(整个文件)` | **信封加密**:AES-256-GCM 整个 GLB,Seal 只包 32B AES key |
| 运行位置 | 后端 Node,持有 delegate 私钥 | **前端 + 钱包签名**(WebCrypto + SessionKey) |
| 动机 | 简单 demo | 绕开 Walrus 35/46MB 编码 OOM 悬崖 |

Harbor 把整个 payload 塞进 Seal,放多 MB 网格会撞 OOM。本项目的信封方案是 Seal 文档的**大文件标准做法**,做得比官方样例更到位。

### 3.2 一致项(验证写法符合官方)

- `verifyKeyServers: false` —— 两边一致
- `EncryptedObject.parse(...).id` 取回完整 identity —— 两边一致
- SessionKey 的 create → sign → activate 生命周期 —— 一致(Harbor 服务端持私钥故 `signer: keypair` 直签;Tusk3D 拆成钱包签名,是浏览器场景的正确做法)

### 3.3 三个分歧(待跟进,本次未改任何代码)

**① 🔴 最高价值:`ORIGINAL` vs `LATEST` package ID 拆分 —— mainnet 升级暗雷**

Harbor `config.ts` 刻意分两个常量:
- `ORIGINAL_PACKAGE_ID` → encrypt + SessionKey identity(升级时**绝不能变**)
- `LATEST_PACKAGE_ID` → `seal_approve` 的 moveCall target

Tusk3D 现状:encrypt、SessionKey、seal_approve **全用同一个** `TESTNET.model3dPackageId`。

- 在 testnet 一直靠**全新 republish + 抛弃旧数据**(v8/v11 均 fresh republish),单 ID 没问题——每个 fresh 包就是自己的 original。
- **上 mainnet 后**:一旦做**兼容升级**(`sui client upgrade`)来保住用户付费买过的加密内容,包 ID 会变,而 Seal identity namespace 绑死在 original 包上。此时仍用单 ID → **所有先前加密内容无法解密**。

→ **行动**:上 mainnet 前,把 original/latest 拆分补进 `frontend/src/sui/networkConfig.ts`。

**② 🟡 Sui client:gRPC vs JSON-RPC**

- Harbor(官方、当前)用 `SuiGrpcClient`(`@mysten/sui/grpc`)
- Tusk3D `sealClient.ts` / `sessionKey.ts` 用 `SuiJsonRpcClient`(`@mysten/sui/jsonRpc`)
- 本项目 CLAUDE.md 技术栈明确:**JSON-RPC 客户端 2026-07 弃用,统一 `SuiGrpcClient`**

→ Seal 路径踩在将弃用的客户端上,与官方样例 + 自身规范都不符。**行动**:7 月前迁移。

**③ 🟢 阈值鲁棒性:2-of-2 vs 2-of-3**

- Harbor 配 **3 台** testnet key server(2-of-3,挂一台仍可解密)
- Tusk3D 配 **2 台**(2-of-2,任一台宕机解密全挂);代码注释已知「加第三台变 2-of-3」

→ Harbor `config.ts` 列了 3 个 testnet key server object ID 可参考(注意其 ID 组与本项目用的 mysten verified 组**不同**,勿直接照抄串)。

---

## 4. 净建议

| 项 | 建议 |
|---|---|
| 存储主路径 | **维持现状,不切 Harbor** |
| Harbor 用途 | 仅作 Seal 参考;已验证大方向正确 |
| 跟进 #1(mainnet 升级 ID 拆分) | **mainnet 部署前必做**——否则静默炸毁付费内容 |
| 跟进 #2(gRPC 迁移) | 7 月前处理,不紧急 |
| 跟进 #3(2-of-3) | 提升解密可用性,低优先 |

---

## 来源

- [walrus-harbor-quickstart (GitHub)](https://github.com/MystenLabs/walrus-harbor-quickstart)
- 本地只读对比:`/tmp/harbor-qs/app/src/lib/seal.ts`、`config.ts` ↔ `frontend/src/seal/{sealClient,sessionKey,envelope,forkerDecrypt}.ts`、`frontend/src/sui/networkConfig.ts`
- [Announcing Walrus (Mysten Labs)](https://www.mystenlabs.com/blog/announcing-walrus-a-decentralized-storage-and-data-availability-protocol)
