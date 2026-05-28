---
title: "Build-time VITE_ env flag as a tree-shake gate for optional dev-only modules"
date: 2026-05-28
category: design-patterns
module: build
problem_type: design_pattern
component: frontend
severity: medium
tags:
  - vite
  - tree-shake
  - rollup
  - dev-only
  - feature-flags
  - production-safety
applies_when:
  - "Shipping a dev-only subsystem (debug page, test wallet, mock backend, instrumentation) that must NEVER appear in production bundles"
  - "Deciding between runtime feature flags (localStorage / URL param) and build-time flags for a sensitive subsystem"
  - "Verifying that production builds exclude an optional code path"
related_components:
  - frontend/vite.config.ts
  - frontend/src/wallet
  - frontend/src/test-wallet
---

# Build-time VITE_ flag as a tree-shake gate

## Context

Plan-016 needed a dev-only test wallet (loads a private key from `.env.local`) that the Slush-bypass `/launch` path uses, but the test-wallet code must **never** reach a production build. localStorage flags or URL params won't do — they can be flipped post-build, defeating the entire production-safety story. We needed something that vanishes at build time.

## The pattern

Three pieces working together:

1. **A module-scope compile-time constant** captured from a `VITE_*` env var:
   ```ts
   // frontend/src/wallet/testWalletEnabled.ts
   export const TEST_WALLET_ENABLED: boolean =
     import.meta.env.VITE_TEST_WALLET === '1';
   ```
   Vite replaces `import.meta.env.VITE_TEST_WALLET` with a string literal at build time — `'1' === '1'` (true) when the env is set, `'' === '1'` (false) otherwise. The constant becomes a hard-coded boolean in the emitted bundle.

2. **Branches that gate behavior on the constant**:
   ```ts
   // frontend/src/wallet/useAppSigner.ts
   import { loadKeypair } from '../test-wallet/loadKeypair';

   export function useAppSigner() {
     if (TEST_WALLET_ENABLED) {
       const keypair = loadKeypair();  // ← only reachable in dev builds
       return { signer: keypair, loadError: null };
     }
     // prod path...
   }
   ```
   Rollup constant-folds `if (false) { ... }` and eliminates the branch. The static `import { loadKeypair } from '../test-wallet/loadKeypair'` becomes unreferenced and is tree-shaken from the bundle.

3. **A module-eval throw inside the gated module** as belt #2:
   ```ts
   // frontend/src/test-wallet/loadKeypair.ts (first line)
   if (import.meta.env.PROD) {
     throw new Error('test-wallet loaded in production build — refusing.');
   }
   ```
   If tree-shake fails (or someone adds an import from a non-gated file), the module-eval throw fires the first time anything imports the test-wallet subtree against a prod build.

## Verification (the third belt)

After every production build, grep the dist for identifying strings:

```bash
pnpm vite build  # or `pnpm build` once tsc is happy
grep -rE 'TestWalletAdapter|loadKeypair|MissingTestWalletKey|VITE_TEST_WALLET_KEY' frontend/dist/
# expect: zero hits
```

In plan-016's verification: 7 plan-specific identifiers grep'd, zero hits. Two inert UI string matches remained (a `data-testid="test-wallet-banner"` literal in a conditionally-rendered JSX block, and a constant-folded `data-test-wallet="false"` attribute that was later gated behind the flag in the code-review fix pass).

## Important constraint: VITE_ env vars are INLINED, not loaded

Anything matching `VITE_*` in the Vite env is **embedded as a literal string in the bundle** at build time. If you accidentally build with `VITE_TEST_WALLET=1` AND `VITE_TEST_WALLET_KEY=suiprivkey1...`, **the private key ships in the public JS**. The tree-shake gate fires only when `VITE_TEST_WALLET` is unset; if it's `'1'`, the entire dev-only subtree (including the inlined key string) is preserved.

A `vite.config.ts` plugin that throws when `command === 'build' && mode === 'production' && env.VITE_TEST_WALLET === '1'` is the proper defense (see plan-016 OQ-023 in `docs/open-questions.md` for the proposed shape). Until that lands, manual hygiene + AE4 grep + module-eval PROD throw form the safety net.

## Why not localStorage / URL flags

- localStorage: can be set by any JS on the page, including bookmarklets and devtools snippets. Defeats the "production users can't activate this" guarantee.
- URL param: same problem; an attacker-controlled URL can flip the flag.
- Cookie / sessionStorage: same family.

Build-time flag is the only mechanism where flipping requires direct access to the deploy pipeline / env config.

## Where it lives in the repo

- ADR: `docs/decisions.md` D-059
- Implementation: `frontend/src/wallet/testWalletEnabled.ts`, `frontend/src/wallet/useAppSigner.ts`, `frontend/src/test-wallet/loadKeypair.ts`
- Verification (manual grep on dist): plan-016 §U6
- Open question for future hardening: OQ-023 (build-time gate plugin)
