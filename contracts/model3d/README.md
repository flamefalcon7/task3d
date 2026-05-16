# `model3d::model3d` Move package

Phase 2 (U2) Sui Move package implementing the **L1 + L3** subset of the composable creator economy:

- `Model3D` (L1) — creator-published 3D content, shared object, wraps a Walrus `Blob`
- `Access` (L3) — soulbound (`has key` only) receipt of paid access
- `LicenseTerms`, `ModelPublished`, `AccessPurchased` — value type + events

The L2 `Derivative` layer (grant / mint / `purchase_derivative_access`) is **deferred to v1.1** per D-013. The full design is preserved in `docs/spec.md` §2.8.

Relevant ADRs:

- **D-015** — adds `tags: vector<String>` and `lineage_blob_id: String` to `Model3D`
- **D-016** — `publish_and_share` entry pattern + `purchase_model_access` naming + `duration_ms` retention
- **D-018** — Move-level input bound assertions (16 tags / 32 byte tag / 4096 byte `params_json` / 128 byte `name` / 128 byte `lineage_blob_id`)

## Local development

```bash
cd contracts/model3d
sui move build      # compile
sui move test       # run 21 unit tests
```

The test suite covers:

- Validation happy paths (empty + 10-tag + edge-of-bound values for each field)
- Royalty cap acceptance (= 3000 bps) and rejection (3001 bps)
- All five D-018 input-bound assertions (over-bound rejects + at-bound accepts)
- End-to-end `publish` (Walrus `register_blob` in-test) — verifies creator address, fields, and `tags.length`
- `purchase_model_access` happy paths: permanent (`duration_ms = 0`), subscription (24h), free (price = 0), and exact-payment boundary
- `EInsufficientPayment` abort on under-payment
- Policy constants match spec

The Walrus dependency is currently consumed via the **Walrus repo on GitHub** (`rev = "main"`) rather than the MVR alias the plan specified (`mvr = "@walrus/core"`). The MVR registry on testnet does not yet expose `@walrus/core` for `sui 1.72.1`. The deploy step below documents the post-deploy MVR sanity check (per plan adv-005) the orchestrator must run.

## Testnet deploy (orchestrator runs this)

Phase 2 / U2 ships to **testnet only** (D-009). The Move package is built but **not yet deployed** at the end of this commit; the orchestrator runs the deploy:

```bash
cd contracts/model3d
sui client publish --gas-budget 100000000
```

Then capture the published values into `frontend/.env.local` (gitignored). Backend has no on-chain dependency.

```env
VITE_MODEL3D_PACKAGE_ID=<package_id_from_publish>
```

### Phase 3 deploy capture (2026-05-16, U2 of plan-003)

```env
VITE_MODEL3D_PACKAGE_ID=0x18a480b3ff2219ac6666177221bafb37aa79a81122890581025b4737aef05ac3
MODEL3D_UPGRADE_CAP=0x11b63b1f9a1677e20a6f7015416da8dde4e291b72ed7563cc5de2bf0268fd795
PUBLISH_DIGEST=8gKrqemFVcAeBr3rifQurRDGuSF7pm2Yp44wXo15Kv5A
```

Sui Explorer:
- Package: <https://suiscan.xyz/testnet/object/0x18a480b3ff2219ac6666177221bafb37aa79a81122890581025b4737aef05ac3>
- Publish tx: <https://suiscan.xyz/testnet/tx/8gKrqemFVcAeBr3rifQurRDGuSF7pm2Yp44wXo15Kv5A>

### MVR sanity check (plan adv-005)

After deploy, confirm the linked Walrus `Blob` type resolves to the Walrus testnet package documented in `docs/spec.md` §2.6 (`0x6c2547cbbc38025cf3adac45f63cb0a8d12ecf777cdc75a4971612bf97fdf6af`):

```bash
# Inspect the published package's linked dependencies:
sui client object <MODEL3D_PACKAGE_ID> --json | jq '.data.content.disassembled // .data'

# Or via Sui Explorer:
#   Dependencies tab should list a `walrus_pkg::blob` entry whose address
#   matches the Walrus testnet System object's owning package.
```

If the linked `Blob` type comes from a **different** Walrus package than expected, **abort and re-pin `Move.toml`** to the published `rev` of `MystenLabs/walrus` before redeploying.

Record the resolved Walrus package address in `.env.testnet`:

```env
MODEL3D_WALRUS_PACKAGE_ID=0x...
```

### UpgradeCap retention (RR-002)

The `sui client publish` command above transfers an `UpgradeCap` to the publisher wallet by default. Transfer it to a **stable team-controlled address** (NOT the publish wallet, which may rotate) immediately after deploy:

```bash
sui client transfer --to <TEAM_CONTROLLED_ADDR> --object-id <UPGRADE_CAP_ID> --gas-budget 10000000
```

Record the `UpgradeCap` object ID in `.env.testnet` (`MODEL3D_UPGRADE_CAP=...`).

### Smoke tests against the deployed package

```bash
# 1. Publish (with a real Walrus Blob from `walrus blob send`, then a PTB
#    that calls publish_and_share on it).
# 2. Purchase access against the shared Model3D.
# Both should produce visible Model3D and Access objects in Suiscan/Sui Explorer.
```

Manual smoke test scripts are wired in U7 (creator flow) and U9 (buyer flow).

## File layout

```
contracts/model3d/
├── Move.toml                       # Walrus + Sui deps; edition 2024.beta
├── README.md                       # this file
├── sources/
│   └── model3d.move                # L1 (Model3D + publish + publish_and_share)
│                                   # + L3 (Access + purchase_model_access)
│                                   # + LicenseTerms + events + validation
└── tests/
    └── model3d_tests.move          # 21 unit tests
```
