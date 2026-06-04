---
module: contracts/model3d (Seal content protection)
tags: [seal, ibe, access-control, prefix-binding, security, audit-c1, d-085, d-075]
problem_type: security-vulnerability
related_decisions: [D-075, D-085]
related_audit: docs/audits/2026-06-04-security-audit-seal-move-frontend.md
date: 2026-06-04
---

# Seal `is_prefix` identity binding needs a FIXED-length seal_id, not just a unique one

## Problem (audit C-1, Critical)

Tusk3D gates Seal decryption with `is_prefix(model.seal_id, id)`, where the encrypted
identity is `id = [seal_id][nonce]`. `seal_id` was a **caller-supplied, variable-length**
`vector<u8>` (bounded only `<= 64`), made globally unique at publish by `SealIdRegistry`
(D-075). The code comments asserted this uniqueness made the binding "unforgeable."

It did not. **Exact-match uniqueness ≠ prefix-freeness.**

### The attack, concretely

- Victim Alice publishes a RESTRICTED model with `seal_id = V` (32 bytes). The registry
  records `V`. Her GLB is sealed under `id_alice = [V][nonce]`. Both `V` and the wrapped
  key (`sealed_key`) are **public** on-chain fields.
- Attacker Mallory reads `V`, then publishes **her own** throwaway model with
  `seal_id = P = V[0:k]` — a strict **shorter** prefix (e.g. the first 4–16 bytes of `V`).
  `P != V`, so `table::contains(registry.used, P)` is false → the registry **accepts** it.
- Mallory asks the key servers to decrypt `id_alice`. They dry-run
  `seal_approve_creator(id_alice, mallory_model)`:
  - `is_prefix(P, id_alice)` → `id_alice` starts with `V`, and `P` is a prefix of `V`, so **true**.
  - `sender == mallory_model.creator` → Mallory **is** her own model's creator → **true**.
  - version → true. **No abort → key released.**
- Mallory unwraps Alice's AES key, downloads the ciphertext from Walrus, decrypts. Free
  content theft. The whole pay-to-access / pay-to-fork confidentiality story is bypassed,
  cost ≈ 0 (RESTRICTED has no access fee).

This is the canonical Seal "prefix binding" pitfall. Two independent reviewer agents
(red-team + security-guard) found it.

## Why it was written this way (root cause — speculation grounded in the code)

1. **`is_prefix` is legitimately needed** — the stored 32-byte `seal_id` is genuinely a
   *prefix* of the 48-byte identity (the extra 16 bytes are a per-encrypt nonce that keeps
   each ciphertext's identity unique). So the gate must strip the nonce → prefix semantics,
   not equality. The pattern was copied from Mysten's official Seal allowlist/subscription
   examples, which is the right place to copy from.
2. **The original design bound `seal_id` to the model's `object::id`** (fossils in
   `frontend/src/seal/envelope.ts`: `modelId` param, `modelIdToBytes`, `buildSealId`, and the
   comment "id starts_with model"). Under *that* design `is_prefix` is safe — object ids are
   unique and **not attacker-choosable**, so nobody can craft a prefix of someone else's.
3. **Encrypt-before-publish forced a switch to a random client seal_id.** A Sui object id
   isn't known until the object exists, but the GLB is encrypted *before* `publish_encrypted`
   in a single tx. To keep the single-tx "one wallet popup" UX (a strong theme in this
   codebase — `publish`: "atomic mint + share … one wallet popup"), they switched `seal_id`
   to a random 32 bytes generated client-side (`CreateModelPage.tsx:952`).
4. **They anticipated the COPY attack, not the PREFIX attack.** After the switch, `seal_id`
   became attacker-choosable, so they added `SealIdRegistry` global uniqueness — explicitly
   described as the "copy-attack defense" (D-075 Resolution G). That blocks an *exact*
   duplicate. But `is_prefix`'s acceptance of *shorter* prefixes — harmless under the old
   object-id design — became the live hole, and nobody re-audited that seam.
5. **The 32-byte invariant lived only in the client.** The honest client always emits 32
   bytes, so "seal_id is fixed length" held in practice and was never asserted on-chain.
   Classic "the honest client always does X, so we forgot to enforce X." The attacker
   doesn't use your client.

**Three individually-reasonable decisions** (copy the official prefix pattern; trade
object-id binding for a random seal_id to keep one popup; add a registry for the copy
attack) **composed into one hole** because the prefix-acceptance and the exact-match
registry were designed at different times for different threat models and the seam was
never re-examined.

## Fix (D-085) — fixed-length, not object-id

Enforce `seal_id` length **== 32** for encrypted models (in `new_model`, after the
consistency guard) + re-assert it in both `seal_approve_*` gates (defense in depth). New
abort code `ESealIdWrongLength = 59`.

Once the length is fixed at 32, the **only** 32-byte prefix of `[V][nonce]` is `V` itself —
and `V` is registry-locked — so `is_prefix` collapses to an exact equality against a
unique, locked value. The short-prefix model can never be published, so the gate is never
reachable with it. Honest users are unaffected (already 32 bytes). ~6 lines of contract +
a red-team regression test (`publish_encrypted_rejects_short_prefix_of_victim_seal_id`).

## Why fixed-length over object-id binding (the B-vs-A tradeoff)

`object::id`-derived seal_id (Alt A) is *structurally* unforgeable and was the reviewers'
preferred end-state. We chose fixed-length (Alt B) for v1 anyway. The comparison:

| Axis | B: fixed 32-byte (chosen) | A: object::id binding |
|---|---|---|
| **Security vs C-1** | Fully closed. For any executable attack, equivalent to A (256-bit random; brute-forcing a specific `V` is 2^256). | Fully closed, structurally. |
| **Future-proofing** | Relies on the length+registry invariants holding (gates re-assert length as a belt). | Stronger: even a future bypassed construction path can't collide ids. |
| **New attack surface** | None. | **Adds** a two-phase flow: partial-init model state, who-can-stamp authorization, abandoned-placeholder cleanup — all must be re-audited. |
| **UX** | 1 wallet popup (single-tx encrypt-then-publish). | ≥2 signs — encryption sits *between* the two txs (needs phase-1's object id), so it **cannot** be batched into one PTB; + an "encrypting…" wait and an abandon-after-phase-1 failure mode. |
| **Gas** | 1 tx, 1 object. | ~2× gas + an extra object, **every publish, forever** (matters on mainnet by 8/27). |
| **Diff / audit cost** | ~6 lines + tests; re-run red-team on the gate. | New entry fns, state machine, frontend orchestration; full re-audit. High risk 17 days before submission. |

**Conclusion:** keeping the single wallet popup is *not* what made us less secure — B fully
closes the hole. A's only real edge is structural future-proofing, which B approximates via
the gate-level length asserts, bought at the price of worse UX, ~2× gas, and a new
un-audited multi-step flow. Revisit A as a **v1.1 hardening** only if encrypted content
becomes high-value before mainnet.

## Lesson / pattern

When an on-chain access gate uses `is_prefix(namespace, identity)`:
- The `namespace` (here `seal_id`) MUST be either **non-attacker-choosable** (e.g. an object
  id) **or** of **fixed, enforced length**. A variable-length, caller-chosen namespace +
  `is_prefix` is forgeable even with a global uniqueness registry, because uniqueness blocks
  exact copies but not shorter prefixes.
- Invariants the honest client "always" satisfies (like a fixed length) must be **asserted
  on-chain**, not assumed.
