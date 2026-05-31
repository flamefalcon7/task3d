# Seal 內容保護 — Live 驗證 Checklist(demo 錄影前必跑)

**目的**:plan-026 的解密流程需要真 Slush 簽名,agent-browser 驅動不了,所以這段是**人工**驗證。跑通一次就 demo-ready。

**對象合約**:v9 testnet `0xba1e84ba2889b540defc11245955d3c6650a99f5251e5ee4faf69dc98a876c5c`
**branch**:`feat/seal-content-protection`(尚未併 main)

---

## Part A — 自動 pre-flight(可重跑,~10 秒)

已於 2026-05-31 全數通過。重新部署或每次 demo 前可再跑一次:

```bash
PKG=0xba1e84ba2889b540defc11245955d3c6650a99f5251e5ee4faf69dc98a876c5c
REG=0xdb6e97f7d319bd06cac18420270a88e754209c47eb3e145ffc01a4bbeeb372e3
# 1) v9 暴露 Seal entry fns(arg 數應為 14 / 5 / 4 / 2)
for f in publish_encrypted mint_tokens seal_approve_cap seal_approve_creator; do
  echo -n "$f: "; sui client call --package $PKG --module model3d --function $f 2>&1 | grep -oiE "Expected [0-9]+ args|not found"
done
# 2) SealIdRegistry 是 shared、型別正確
sui client object $REG | grep -iE "objType|Shared"
# 3) key server 活著(400 = reachable;connection refused / timeout = 掛了)
for u in 1 2; do curl -s -o /dev/null -w "ks$u: %{http_code}\n" "https://seal-key-server-testnet-$u.mystenlabs.com/v1/service"; done
```

**通過標準**:`publish_encrypted`=14、`mint_tokens`=5、`seal_approve_cap`=4、`seal_approve_creator`=2;registry objType 結尾 `::model3d::SealIdRegistry` 且 owner=Shared;兩台 key server 回 HTTP(非連線錯誤)。任何一項不符 → 先別錄,排查 `networkConfig.ts` / 重新 deploy。

---

## Part B — 人工 round-trip(真 Chrome + Slush)

> 需要**兩個** testnet 錢包:**A = 創作者**、**B = forker**(證明非創作者付費才能解)。兩個都先用 faucet 領 testnet SUI。
> dev server:`pnpm --dir frontend dev`(`http://localhost:5173`)。先 `pnpm --dir shared build` 一次(否則型別會抱怨,dist 是 gitignore 的)。

### B1 — 創作者(錢包 A)發布加密 ALLOW_LIST base
1. `/create` → 用 Tripo prompt 或上傳一個小 GLB → 走到 metadata 步驟。
2. License policy 選 **Allow-list**(`policy-1`)→ 確認出現 **"FORK FEE (SUI) — REQUIRED"** + hint「pay-to-fork…」。
3. Fork fee 填 **> 0**(例如 `0.5`)。試填 `0` 按 mint → 應**被擋**並顯示「Allow-list requires a fork fee greater than 0 SUI.」(不該送出)。
4. 填回 > 0,按 mint → Slush 跳一次簽名 → 成功。
   - ✅ **斷言**:交易成功;記下新 model 的 object id(可在 explorer / `/track` 看)。
5. 在 explorer 打開該 model object → ✅ **斷言**:
   - `is_encrypted == true`
   - `sealed_key` 非空、`seal_id` 非空、`seal_version == 1`
   - `glb_blob_id` 指向的 Walrus blob 是**密文**(直接抓 `https://cdn.tusk3d.space/v1/blobs/<glb_blob_id>` 不該是合法 GLB)
   - `preview_blob_ids` 有值(ALLOW_LIST 才有)

### B2 — catalog 顯示(任一錢包 / 未登入)
6. `/market`(或 browse)→ 找到剛發布的 base。
   - ✅ **斷言**:卡片顯示的是 **preview 靜圖**(浮水印 "tusk3d"),**不是**去抓密文當 GLB(不該看到壞掉的 3D)。
7. (可選)發一個 **Restricted** base(`policy-0`,B1 同流程但選 Restricted)→ 回 catalog → ✅ **斷言**:Restricted base **不出現**在 catalog(私人)。

### B3 — forker(錢包 B)付費解鎖 + 衍生 ← **這是 demo 高潮、也是唯一沒對 live key server 驗過的**
8. 切到**錢包 B**(非創作者),進 fork / launch 流程選那個 ALLOW_LIST base。
9. 走 3-step(會簽 **4 次**,這是正常的、UI 有標示):
   - **(1) 付 fork fee** → Slush 簽 → 拿到 soulbound cap。
   - **(2) SessionKey** → Slush 跳一個 **personal-message** 簽名(這是 Seal 要的,不是交易)。
   - 接著前端自動:組 `seal_approve_cap` PTB → key server dry-run → **解出 AES 金鑰 → 解密 base**。
     - ⚠️ 剛付完款 key server 可能還看不到 cap(fresh-object race)→ 前端會**自動重試 ~4 次(0.6/1.2/2.4s backoff)**。若 4 次後還失敗,等幾秒重按即可。
   - 前端把明文丟後端 bake variants → 上傳 quilt。**(3) mint_tokens** → Slush 簽 → 鑄出 token。
   - ✅ **斷言**:整段成功;**沒有**任何「下載原始 GLB」的按鈕(R9);鑄出的 token 在錢包 B。
10. **負向檢查(關鍵誠實性)**:用**第三個沒付過款的錢包 C**(或錢包 B 在付款前)嘗試打開那個 base → ✅ **斷言**:看得到 preview,但**解不開**(`seal_approve_cap` abort → key server 拒發 key);拿不到明文 bytes。

---

## 通過 = demo-ready

B1–B3 全綠 → 「**存 Walrus + Seal 加密強制 pay-to-fork**」這條 live 故事成立,可以錄影。

**錄影保險(testnet key server 無 SLA)**:
- 錄影前幾分鐘先**暖機跑一次** B3,確認當下 key server 正常。
- 若現場解密失敗,大概率是 key server 抽風(非你的 bug)—— 重錄那一段即可;UI 上的錯誤訊息也已標示是 testnet 基礎設施。
- 門檻是 **2-of-3**,容許一台掛掉。

## 已知尚未驗證(若 B3 出問題,優先看這兩點 — U5 報告 §7)
- `seal_approve_cap` 的 **txBytes 形狀**是否被 key server 接受(`EncryptedObject.parse(sealedKey).id` → `fromHex` → PTB 第一個 arg)。
- step-1 之後從 `objectChanges` 取 cap / collection id 在 dapp-kit `SuiJsonRpcClient` 上的實際行為。
兩者都已用 mock 單元測過,但只有 B3 能對 live key server 驗到。
