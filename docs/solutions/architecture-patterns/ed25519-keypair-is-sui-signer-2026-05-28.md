---
title: "Ed25519Keypair already implements the Sui Signer interface — no wrapper class needed for a dev-only wallet bypass"
date: 2026-05-28
category: architecture-patterns
module: wallet
problem_type: architecture_pattern
component: frontend
severity: medium
tags:
  - sui-sdk
  - signer
  - dapp-kit
  - test-wallet
  - dev-only
  - ed25519
applies_when:
  - "Building a dev-only wallet bypass to drive a Sui dApp without a browser extension (demo recording, agent-browser automation, CI)"
  - "Considering whether to wrap @mysten/sui's Keypair in a custom Signer adapter class"
  - "Designing an interface that abstracts over 'a thing that signs Sui transactions' across test and production code paths"
related_components:
  - frontend/src/wallet
  - frontend/src/test-wallet
---

# Ed25519Keypair IS the Sui Signer — no wrapper class needed

## Context

Plan-016 needed a dev-only path to bypass the Slush browser extension on `/launch` (Walrus encode crash forced the bypass; see brainstorm `docs/brainstorms/2026-05-27-test-wallet-adapter-requirements.md`). The first instinct is to build a `TestWalletAdapter` class that conforms to whatever `Signer` interface the dapp consumes — but in `@mysten/sui@2.16.2`, **`Ed25519Keypair` already extends the SDK's abstract `Signer` class** with all four methods the dapp ever calls:

| Method | Used by |
|---|---|
| `toSuiAddress(): string` | Walrus `writeFilesFlow.executeRegister`, PTB builders, UI wallet pill |
| `signTransaction(bytes: Uint8Array)` | Internal — wrapped by `signAndExecuteTransaction` |
| `signAndExecuteTransaction({transaction, client})` | Walrus `writeFilesFlow`, launch PTB sign |
| `signPersonalMessage(bytes)` | `useSession.signIn()` JWT challenge |

Confirmed at `node_modules/.pnpm/@mysten+sui@2.16.2.../src/cryptography/keypair.ts` and `.../src/keypairs/ed25519/keypair.ts`.

## The pattern

Just load the keypair from a bech32 string and hand the instance to whatever consumes a Signer:

```ts
// frontend/src/test-wallet/loadKeypair.ts
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

export function loadKeypair(): Ed25519Keypair {
  const bech32 = import.meta.env.VITE_TEST_WALLET_KEY;
  if (!bech32) throw new MissingTestWalletKeyError();
  return Ed25519Keypair.fromSecretKey(bech32);  // accepts bech32 directly
}
```

No `class TestWalletAdapter implements Signer { ... }`. No method delegation. No abstract-method surface to maintain. The keypair instance IS the signer — at every call site that walrus or useSession used to take from dapp-kit, hand it the keypair instead.

## Why this beats wrapping

- **Smallest surface**. A wrapper class has to maintain method delegation for the four (or more) Signer methods. The keypair has zero maintenance — it's an SDK class.
- **Behavioral parity by construction**. The keypair's `signAndExecuteTransaction({transaction, client})` does exactly what walrus's internal `#executeTransaction` expects: `transaction.setSenderIfNotSet`, `transaction.build({client})`, `signTransaction(bytes)`, `client.core.executeTransaction(...)`. A wrapper risks drift from SDK behavior on upgrade.
- **Backend is signature-scheme-agnostic**. `verifyPersonalMessageSignature` reads the scheme flag byte from the signature payload and validates against the embedded public key. A keypair-signed challenge produces an indistinguishable signature from a Slush-signed one (both Ed25519 from the same address). The backend can't tell — and doesn't need to.

## The gotcha: signature shape mismatch when you DO add a wrapper interface

If you decide to wrap the keypair in a custom `AppSigner` interface (e.g., to abstract test-mode and prod-mode behind one type), the Sui SDK's `signTransaction(bytes: Uint8Array)` is **incompatible** with the dapp-kit shape `signTransaction({transaction})`. Picking the dapp-kit shape forces a `keypair as unknown as AppSigner` cast that hides a real runtime crash waiting for the first caller. See D-058 + `frontend/src/wallet/useAppSigner.ts` for the chosen solution: drop `signTransaction` from the wrapper interface entirely (no consumer calls it directly).

## Where it lives in the repo

- ADR: `docs/decisions.md` D-058
- Brainstorm: `docs/brainstorms/2026-05-27-test-wallet-adapter-requirements.md`
- Implementation: `frontend/src/test-wallet/loadKeypair.ts`
- Wrapper hooks consuming it: `frontend/src/wallet/{useAppAccount,useAppSigner}.ts`
- On-chain proof: `https://suiscan.xyz/testnet/tx/CndwZBuDApr3W3a4pPZ6fFt2bXJaJLbZsSNiowPD9ac7` (end-to-end /launch mint via the test wallet, 2026-05-27)
