---
name: feat-test-wallet-adapter
description: Bypass Slush for /launch by implementing the Sui Signer interface directly with Ed25519Keypair, gated by VITE_TEST_WALLET build env, so the demo can record without the user's crashing Chrome state.
status: completed
created: 2026-05-27
origin: docs/brainstorms/2026-05-27-test-wallet-adapter-requirements.md
phase: Phase 4 follow-up (Plan-016)
depth: Standard
---

# feat: Test Wallet Adapter (plan-016)

Bypass Slush wallet for `/launch` L2 collection mint by signing locally with an Ed25519 keypair loaded from `.env.local`. Gated by build-time env, dead-stripped from prod bundles. Unblocks the demo recording the same user who keeps crashing in Slush + multi-tab Chrome.

---

## Summary

The user's crashing Chrome state (Slush unlocked + active session + ~10 sibling tabs) consistently kills the renderer at `flow.encode() → systemState()` during `/launch` upload. Eleven commits of in-code workarounds (GPU pressure reduction, prewarm, endpoint swap, …) didn't shift the crash signature. The bug is environmental and not reproducible from a clean Chromium. We've exhausted in-code workarounds; the next step is to bypass Slush entirely.

**Test wallet, not mock wallet.** The adapter signs with the user's _existing_ funded testnet key (the same key Slush holds) loaded from `frontend/.env.local`. Test-wallet address == Slush address == creator-of-existing-Model3Ds, so LicenseTerms checks pass and the user can fork their own bases without first re-publishing on a different key. Backend `verifyPersonalMessageSignature` is address-bound via the public key embedded in the signature — a test-wallet-signed challenge is indistinguishable from a Slush-signed one to the verifier.

**Secondary win**: agent-browser automation can drive `/launch` end-to-end in CI, unblocking regression coverage deferred since plan-014.

(see origin: `docs/brainstorms/2026-05-27-test-wallet-adapter-requirements.md`)

---

## Scope Boundaries

**In scope (v1):**
- Build-time `VITE_TEST_WALLET=1` activation
- `/launch` end-to-end: sign-in JWT challenge + writeFilesFlow register/certify + launch PTB
- Wrapper hooks `useAppAccount` / `useAppSigner` as the integration surface
- Wallet pill indicator + missing-key error banner
- ESLint allow-list keeping `test-wallet/*` imports out of production code paths
- Production safety: module-level `import.meta.env.PROD` throw + tree-shake verification

**Deferred to Follow-Up Work:**
- Wrapper-hook adoption in `/create` (Tripo fee + L1 mint) — file refactor only, same adapter
- Wrapper-hook adoption in `/market` (buy) and `/track`
- vitest unit tests for adapter internals beyond the production-safety smoke tests in U1
- agent-browser CI integration using the adapter (plan-014 follow-up)

**Out of scope:**
- Solving the underlying Chrome/Slush renderer crash (environmental; no production users will hit it)
- Mainnet path — explicit module-eval guard rejects
- L2 buy / royalty hot-potato (different signing site, not blocking the demo)
- Production tree-shaking proven via build-pipeline test — manual grep verification per AE4 is acceptable for v1

---

## Key Technical Decisions

### D-058 candidate — Sui SDK direct, not a mocked dapp-kit hook

`@mysten/sui@2.16.2` `Ed25519Keypair` extends the `Signer` abstract class and **already implements** the exact methods the rest of the dapp needs:

| Method | Signature | Used by |
|---|---|---|
| `toSuiAddress()` | `() => string` | Walrus, PTB builders, wallet pill |
| `signTransaction(bytes)` | `(Uint8Array) => Promise<{signature}>` | _(internal — wrapped by signAndExecute)_ |
| `signAndExecuteTransaction({transaction, client})` | `(SignAndExecuteOptions) => Promise<TxResult>` | Walrus `writeFilesFlow`, launch PTB |
| `signPersonalMessage(bytes)` | `(Uint8Array) => Promise<{bytes, signature}>` | `useSession.signIn()` JWT challenge |

No wrapper class needed — the keypair instance IS the signer. The wrapper hooks just expose it in a shape compatible with the existing dapp-kit hook API (so call sites change minimally).

Rejected: shadow `WalletProvider` context — dapp-kit's context internals aren't publicly exported, reverse-engineering them is brittle, and the keypair-as-signer path is simpler.

(see origin: §Key decisions / D-058 candidate)

### D-059 candidate — Build-time env activation + wrapper hooks at call sites

Activation = `VITE_TEST_WALLET=1` in `frontend/.env.local`. Vite replaces `import.meta.env.VITE_TEST_WALLET` with the literal string at build time, so the test-mode branch is dead-code-eliminable when unset.

Integration shape = thin wrapper hooks (`useAppAccount` / `useAppSigner`) at the relevant call sites — NOT a shadow context. Wrapper hook bodies branch on the same `import.meta.env.VITE_TEST_WALLET === '1'` literal, returning either test-wallet data or the prod-path dapp-kit data.

Rejected: localStorage flag, URL param — too easy to accidentally activate in prod. Rejected: runtime flag — defeats tree-shake.

(see origin: §Key decisions / D-059 candidate)

### D-060 candidate — /launch only for v1

Wrapper-hook adoption is scoped to `useSession.ts` (sign-in JWT) + `LaunchCollectionPage.tsx` (3 mint popups). `/create`, `/market`, `/track` keep direct dapp-kit hooks — that's deferred follow-up work, not v1 scope.

`CreateModelPage.tsx` has its own in-file `useDappKitSigner` helper (parallel to launch's); it stays on Slush in v1. The adapter is feature-complete the moment the demo can record `/launch`.

(see origin: §Key decisions / D-060 candidate)

### D-061 candidate — test-wallet subtree + ESLint allow-list

All test-only code lives in `frontend/src/test-wallet/`. Two production-safety belts:

1. **Module-level guard.** `test-wallet/index.ts` throws at import time if `import.meta.env.PROD === true`. Belt against accidental ship.
2. **ESLint allow-list.** `no-restricted-imports` rule: `test-wallet/*` imports forbidden from ALL files except those under `frontend/src/wallet/*` (the wrapper hooks). Prevents future drift where someone reaches for the adapter from a feature module and silently disables tree-shake.

(see origin: §Key decisions / D-061 candidate)

---

## High-Level Technical Design

*Directional shape, not implementation specification.*

```
┌─────────────────────────────────────────────────────────────────┐
│ Production build: VITE_TEST_WALLET unset                        │
│                                                                  │
│  useSession.signIn()                                             │
│       │                                                          │
│       └─► useAppSigner() ─► [prod branch] ─► dapp-kit hooks      │
│                                              (useSignPersonalMsg,│
│                                               useSignTransaction,│
│                                               useSignAndExecuteTx│
│                                               )                  │
│                                                                  │
│  Bundler sees `import.meta.env.VITE_TEST_WALLET === '1'`         │
│  → constant false → test-wallet branch dead-eliminated           │
│  → import('../test-wallet') never reached → subtree stripped     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Dev build: VITE_TEST_WALLET=1 + VITE_TEST_WALLET_KEY=suiprivkey1…│
│                                                                  │
│  module load: test-wallet/index.ts                               │
│    │                                                             │
│    ├─ if (import.meta.env.PROD) throw  ◄── R4 belt              │
│    ├─ decode bech32 → Ed25519Keypair.fromSecretKey(...)         │
│    └─ export getTestKeypair() / getTestAddress()                 │
│                                                                  │
│  useAppSigner() ─► [test branch] ─► return Ed25519Keypair instance │
│                                                                  │
│  Walrus writeFilesFlow.executeRegister(signer)                   │
│       └─► keypair.signAndExecuteTransaction({transaction, client})│
│                                                                  │
│  buildLaunchCollectionWithTokensPtb → signer.signAndExecute…     │
│                                                                  │
│  useSession.signIn() → signer.signPersonalMessage(bytes)         │
│       └─► POST /api/auth/verify { address, nonce, signature }   │
│           └─► backend verifyPersonalMessageSignature → JWT       │
│           (verifier sees same Ed25519 sig from same address —    │
│            indistinguishable from Slush)                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## System-Wide Impact

| Surface | Change | Risk |
|---|---|---|
| `frontend/src/auth/useSession.ts` | Replace `useCurrentAccount` + `useSignPersonalMessage` with wrapper hooks | Low — same JWT shape, same backend route |
| `frontend/src/collection/LaunchCollectionPage.tsx` | Replace 3 dapp-kit call sites; refactor line 558 PTB sign to pass `client` | Medium — touches the upload + mint critical path |
| `frontend/src/ux/TopNav.tsx` | Branch wallet-pill rendering on test-mode flag | Low — display only |
| `frontend/.env.example` | Document new env vars + warning | None |
| `frontend/eslint.config.js` | Add `no-restricted-imports` rule | Low — lint-only |
| Backend | Untouched — `verifyPersonalMessageSignature` is signature-scheme-agnostic; test-wallet-signed challenge verifies identically | None |
| Move package | Untouched | None |
| `/create`, `/market`, `/track` | Untouched in v1 | None |

---

## Implementation Units

### U1. test-wallet module: keypair loader + production guard

**Goal**: Create `frontend/src/test-wallet/` with module-level production safety and a singleton `Ed25519Keypair` loaded from `VITE_TEST_WALLET_KEY`.

**Requirements**: R2, R3, R4, R5, D-058, D-061

**Dependencies**: none

**Files**:
- `frontend/src/test-wallet/index.ts` — public exports + production guard at module eval
- `frontend/src/test-wallet/loadKeypair.ts` — bech32 decode → `Ed25519Keypair.fromSecretKey(...)`
- `frontend/src/test-wallet/loadKeypair.test.ts`

**Approach**:
- Module-load assertion: throw at top of `index.ts` if `import.meta.env.PROD === true`. (Belt — the wrapper hooks also gate, but this catches direct imports too.)
- `loadKeypair()` reads `import.meta.env.VITE_TEST_WALLET_KEY`, decodes via `Ed25519Keypair.fromSecretKey(bech32)` (no helper needed — `@mysten/sui@2.16.2` accepts bech32 directly; the SDK calls `decodeSuiPrivateKey` internally — OQ-2 resolved).
- Two error states from the loader:
  - Missing env var → throw `MissingTestWalletKeyError` with `name: 'MissingTestWalletKey'` so wrapper hooks can pattern-match
  - Invalid bech32 / wrong scheme → throw `InvalidTestWalletKeyError` (the SDK's own throw, possibly re-wrapped for a clean message)
- Singleton: cache the loaded keypair at module scope so repeated wrapper-hook calls don't re-decode.

**Patterns to follow**:
- Existing Ed25519 sign in `backend/src/routes/auth.test.ts:66` shows the address-bound signature flow this adapter mirrors.

**Test scenarios** (vitest, run only when `VITE_TEST_WALLET=1`):
- Valid bech32 key → `loadKeypair()` returns Ed25519Keypair whose `toSuiAddress()` matches a known-derived address.
- Missing `VITE_TEST_WALLET_KEY` → throws `MissingTestWalletKeyError` with the configured `name`.
- Invalid bech32 (`"not-a-key"`) → throws an `InvalidTestWalletKeyError`.
- Secp256k1-scheme bech32 → throws (Ed25519 only).
- `import.meta.env.PROD === true` simulated (via test factory variant) → module-eval throws.

**Verification**: Test scenarios pass in vitest under `VITE_TEST_WALLET=1`; running with `VITE_TEST_WALLET` unset → tests in this file are skipped (no module import).

---

### U2. Wrapper hooks: useAppAccount + useAppSigner

**Goal**: Two thin hooks in `frontend/src/wallet/` that branch on `VITE_TEST_WALLET` and return either test-wallet data or pass-through dapp-kit data. Bundler tree-shake removes the test branch in production.

**Requirements**: R1, R7, R10, D-059

**Dependencies**: U1

**Files**:
- `frontend/src/wallet/useAppAccount.ts` — returns `{ address: string } | null`
- `frontend/src/wallet/useAppSigner.ts` — returns the unified Signer interface (see shape below) or null
- `frontend/src/wallet/testWalletEnabled.ts` — exports the `TEST_WALLET_ENABLED` const so the gate is referenced from one place
- `frontend/src/wallet/useAppAccount.test.tsx`
- `frontend/src/wallet/useAppSigner.test.tsx`

**Approach**:
- `TEST_WALLET_ENABLED = import.meta.env.VITE_TEST_WALLET === '1'` — module-scope constant. Vite replaces `import.meta.env.VITE_TEST_WALLET` with a string literal at build time, so this becomes a compile-time constant and downstream `if (TEST_WALLET_ENABLED)` branches are dead-code-eliminable.
- `useAppAccount()` returns `{ address: testKeypair.toSuiAddress() }` in test mode, else falls through to `useCurrentAccount()`.
- `useAppSigner()` returns the unified Signer:
  ```
  {
    toSuiAddress(): string
    signTransaction(bytes: Uint8Array): Promise<{ signature: string }>
    signAndExecuteTransaction({ transaction, client }): Promise<TxResult>
    signPersonalMessage(bytes: Uint8Array): Promise<{ bytes: string, signature: string }>
  }
  ```
  - **Test branch**: return the keypair instance directly (it already satisfies the interface).
  - **Prod branch**: build the same shape from dapp-kit's `useSignTransaction` + `useSignPersonalMessage` + `useSignAndExecuteTransaction` + `useSuiClient`. This is the same wrapper shape `LaunchCollectionPage.useDappKitSigner` already builds (line 87-109), just hoisted out and extended with `signPersonalMessage` + `signAndExecuteTransaction`.
- Tree-shake mechanism: static `import` of `'../test-wallet'` from `useAppSigner.ts` is fine IF the import is gated behind `if (TEST_WALLET_ENABLED)` — Vite's tree-shake catches it. If we want stronger guarantees we can use dynamic `import('../test-wallet')` lazily; defer this choice to implementation, verify via AE4 grep.
- ESLint allow-list (set up in U6) permits `frontend/src/wallet/*` to import `'../test-wallet'`.

**Patterns to follow**:
- `frontend/src/collection/LaunchCollectionPage.tsx:87-109` — existing dapp-kit→Signer bridge. Lift this pattern into `useAppSigner`'s prod branch.
- `frontend/src/auth/useSession.ts:104-184` — example of cross-component hook design.

**Test scenarios**:
- (test mode) `useAppAccount` returns `{address: <derived from VITE_TEST_WALLET_KEY>}`; `useCurrentAccount` mock is NOT consulted.
- (prod mode, simulated by stubbing `TEST_WALLET_ENABLED = false` in test) `useAppAccount` returns dapp-kit's `useCurrentAccount` result unchanged.
- (test mode) `useAppSigner().toSuiAddress()` matches the derived address.
- (test mode) `useAppSigner().signPersonalMessage(bytes)` returns `{bytes, signature}` shape matching dapp-kit's `useSignPersonalMessage` return shape.
- (test mode) `useAppSigner().signAndExecuteTransaction({transaction, client})` calls the keypair's method (verify via mocked Transaction.build).
- (prod mode) `useAppSigner` returns null when `useCurrentAccount` returns null (parity).
- (prod mode) calling `signTransaction` on the wrapper invokes dapp-kit's `useSignTransaction` mutateAsync once with the right shape.

**Verification**: Existing `useSession.test.tsx` mocks (which mock `useSignPersonalMessage`) work unchanged when `TEST_WALLET_ENABLED = false`. Test-mode tests confirm the test-wallet branch.

---

### U3. useSession refactor: sign-in via wrapper signer (R9)

**Goal**: `useSession.signIn()` signs the JWT challenge via `useAppSigner().signPersonalMessage(...)` instead of dapp-kit's `useSignPersonalMessage` directly. Backend untouched.

**Requirements**: R9, R10

**Dependencies**: U2

**Files**:
- `frontend/src/auth/useSession.ts` — replace `useCurrentAccount` with `useAppAccount`; replace `useSignPersonalMessage`'s mutateAsync with `useAppSigner().signPersonalMessage(message)`
- `frontend/src/auth/useSession.test.tsx` — update mocks to mock the wrapper hooks instead of dapp-kit directly

**Approach**:
- `useSession.ts` change set is ~6 lines: swap import, swap hook call, change one `signPersonalMessage({message})` → `signer.signPersonalMessage(message)`. Return shape matches (both produce `{bytes, signature}`).
- The address-mismatch wipe effect (`useSession.ts:127-133`) keeps working because `useAppAccount` returns the same `{address}` shape.
- SignInButton.tsx **is not modified** — it imports `useSession` and calls `signIn()`. (Note: brainstorm scope listed `SignInButton.tsx` as a target; the actual signing site is one layer down in `useSession`. SignInButton's existing wallet-picker buttons — `useWallets`/`useConnectWallet` — stay; in test mode they're not reachable because we bypass the "connect a wallet" gate via `useAppAccount` already returning the test address.)
- SignInButton's render logic checks `if (session)` / `if (address)` — both code paths still work because `useSession.address` derives from `useAppAccount()` in test mode.

**Patterns to follow**:
- Existing `useSession.signIn()` flow (lines 135-164). The refactor only changes WHO produces the signature; the challenge fetch + verify POST stay identical.

**Test scenarios**:
- (prod mode mock) Sign-in flow: `useAppAccount` mock returns address, `useAppSigner().signPersonalMessage` mock returns signature, `/api/auth/verify` mock returns JWT, session is stored. Identical to pre-refactor behavior.
- (test mode mock) Sign-in flow uses the test-wallet's address — verify the challenge POST body contains the test address.
- Address-mismatch wipe effect still fires when `useAppAccount` returns a new address.
- Expired JWT path still triggers re-signin (unchanged).

**Verification**: All existing `useSession.test.tsx` cases pass with new mocks. New test-mode case verifies the test-wallet sign-in completes E2E with a mocked backend.

---

### U4. LaunchCollectionPage refactor: 3 hook call sites → wrapper hooks

**Goal**: Replace `useCurrentAccount` + in-file `useDappKitSigner` + `useSignAndExecuteTransaction` (lines 334-337) with `useAppAccount` + `useAppSigner`. Refactor the launch PTB sign at line 558 to use the unified Signer shape.

**Requirements**: R1, R7, R8, R10

**Dependencies**: U2

**Files**:
- `frontend/src/collection/LaunchCollectionPage.tsx`
  - Remove the in-file `useDappKitSigner` helper (lines 87-110); its logic is now in `useAppSigner`'s prod branch
  - Replace `useCurrentAccount` import with `useAppAccount`
  - Replace `useSignTransaction` + `useSignAndExecuteTransaction` imports with `useAppSigner`
  - Refactor line 558: `await signAndExecute({transaction: tx})` → `await signer.signAndExecuteTransaction({transaction: tx, client: suiClient})`
  - Pull in `useSuiClient()` from dapp-kit for the `client` argument (or have `useAppSigner` expose a `signAndExecute` convenience that captures client internally — implementer's choice)
- `frontend/src/collection/LaunchCollectionPage.test.tsx` — update mocks: instead of mocking the 3 dapp-kit hooks, mock `useAppAccount` + `useAppSigner` (which return the same shape, just hoisted). Test surface area shrinks slightly.

**Approach**:
- Net change in LaunchCollectionPage.tsx body: ~6 lines (3 hooks → 2 hooks + minor PTB call-site refactor).
- The walrus call site (`useWalrusUpload.uploadFiles(swapped, signer)`) is unchanged — `signer` is still passed in, same shape, just sourced from the wrapper hook.
- Verify the `useCallback` dep array for `runLaunch` still tracks the right values after the signature change (signer reference is now stable across the wrapper since it's memoized by the keypair singleton in test mode; in prod mode dapp-kit hook outputs change normally).

**Patterns to follow**:
- The existing `useDappKitSigner` (LaunchCollectionPage.tsx:87-109) — its body is what `useAppSigner`'s prod branch uses verbatim.
- `frontend/src/walrus/useWalrusUpload.ts` — consumer of the Signer; verifies the shape passes through.

**Test scenarios**:
- (existing) Base picker → variant editor → LAUNCH happy path. Update mocks to wrapper hooks; assertion targets (testids, phase transitions) unchanged.
- (existing) Insufficient balance / register fee validation paths. Unchanged behavior.
- (existing) Upload-stage transitions render correctly. Unchanged.
- (new — test mode) Walrus `executeRegister` is called with a signer whose `toSuiAddress()` returns the test address.
- (new — test mode) Launch PTB sign-and-execute invokes `signer.signAndExecuteTransaction` with the built Transaction and the SuiClient.
- (new) `useAppSigner` returns null when there's no account → LAUNCH button disabled (parity with current `signer` null check).

**Verification**: Full LaunchCollectionPage test suite passes (all existing cases + 3 new ones). `pnpm --dir frontend test` green.

---

### U5. Wallet pill (R6) + missing-key banner (R5)

**Goal**: TopNav shows "TEST WALLET 0xabcd…1234" when test mode is on. LaunchCollectionPage shows an error banner if `VITE_TEST_WALLET=1` but the key is missing/invalid; LAUNCH button stays disabled.

**Requirements**: R5, R6, OQ-1 (resolved here: pill replaces existing wallet-pill, no separate badge)

**Dependencies**: U2

**Files**:
- `frontend/src/ux/TopNav.tsx` — branch the existing `walletPill` `<span>` (line 106-108) on test-mode: prepend "TEST" prefix
- `frontend/src/ux/TopNav.test.tsx` — add 1 test for test-mode rendering
- `frontend/src/collection/LaunchCollectionPage.tsx` — at component top (before main render), check if test mode is on AND `useAppSigner()` returned null with a caught load error; if so, render the error banner above the existing UI
- `frontend/src/collection/LaunchCollectionPage.test.tsx` — add 2 tests: banner shows; LAUNCH disabled

**Approach**:
- Wallet pill: reuse the `walletPill` style; just prepend `'TEST '` to the truncated address when test mode flag is on. Optional: change `color` to `tokens.color.accent` so the test mode is visually loud (small change, optional cosmetic).
- Missing-key banner: `useAppSigner` returns null + an error sentinel when test mode is enabled but the key fails to load. Exact mechanism: `useAppSigner` either (a) wraps the keypair load in a try/catch and returns `{signer: null, error: Error}`, or (b) throws and the LaunchCollectionPage catches at render via an error boundary. (a) is simpler — implement it.
- Banner copy: `TEST_WALLET enabled but VITE_TEST_WALLET_KEY is missing — set it in .env.local`. Match AE2 verbatim.
- LAUNCH button: existing null-check on `signer` already disables it; the banner is purely informational.

**Patterns to follow**:
- `frontend/src/ux/TopNav.tsx:63-66` — `truncateAddress` helper; reuse.
- Existing error banner patterns in LaunchCollectionPage (e.g., the `errorMsg` state + render — line 341).

**Test scenarios** (TopNav):
- (prod mode) Wallet pill renders `truncateAddress(address)` (existing behavior).
- (test mode, key loads) Wallet pill renders `TEST 0xabcd…1234`.
- (no wallet) Pill renders `NO WALLET` (existing).

**Test scenarios** (LaunchCollectionPage):
- (test mode + missing key) Banner with verbatim AE2 message renders; LAUNCH button disabled. Covers AE2.
- (test mode + invalid key) Banner with the SDK error wrapped; LAUNCH disabled.
- (test mode + valid key) No banner; LAUNCH enabled per existing validation.

**Verification**: TopNav + LaunchCollectionPage test suites green; manual `pnpm dev` with bad key shows the banner per AE2.

---

### U6. .env.example, ESLint allow-list, production safety verification (AE4)

**Goal**: Document the env vars, lock down the import surface, and verify (via grep) that production builds contain zero test-wallet code.

**Requirements**: R3, R4, AE4, D-061

**Dependencies**: U1, U2, U3, U4, U5

**Files**:
- `frontend/.env.example` — append `VITE_TEST_WALLET` + `VITE_TEST_WALLET_KEY` documentation with a warning that the key is funded testnet, not mainnet
- `frontend/eslint.config.js` — add `no-restricted-imports` (or equivalent path-based rule) blocking `^.*/test-wallet/.*` patterns from all files except those matching `frontend/src/wallet/*`
- No new file for the verification — run `pnpm --dir frontend build && grep -r "TestWalletAdapter\|suiprivkey\|VITE_TEST_WALLET_KEY\|loadKeypair" frontend/dist/` and confirm zero matches. (Defer to implementation; record as part of verification.)

**Approach**:
- `.env.example` block (verbatim suggestion):
  ```
  # OPTIONAL DEV ONLY — Test wallet adapter (plan-016).
  # Bypasses Slush by signing locally with an Ed25519 keypair. Used for
  # demo recording and agent-browser automation. NEVER set in production
  # builds.
  # The key must be a TESTNET key (the build refuses to run on mainnet).
  # Bech32-encoded `suiprivkey1...` (what `sui keytool export` produces).
  # VITE_TEST_WALLET=1
  # VITE_TEST_WALLET_KEY=
  ```
- ESLint rule: prefer `no-restricted-imports` with a `paths` or `patterns` block. The TypeScript-ESLint variant supports glob patterns. Use file-level overrides so the `frontend/src/wallet/*` files are exempt.
- AE4 verification: documented in this plan as a Verification Checklist step (see below). Manual grep is acceptable per the brainstorm's explicit non-goal ("Production tree-shaking proven via build-pipeline test — manual grep verification is acceptable for v1").

**Test scenarios**:
- ESLint rule: from `frontend/src/collection/LaunchCollectionPage.tsx`, attempting `import { ... } from '../test-wallet'` fails lint with a clear message. From `frontend/src/wallet/useAppSigner.ts`, the same import passes. (One ESLint test config snapshot, or just a manual verify — implementer's choice given the scope estimate budget.)
- AE4 grep: documented below in Verification Checklist; not a unit test.

**Verification**:
1. `pnpm --dir frontend lint` green.
2. AE4 (manual): with all env vars unset, `pnpm --dir frontend build` succeeds; `grep -rE "TestWalletAdapter|suiprivkey|VITE_TEST_WALLET_KEY|loadKeypair" frontend/dist/` returns zero matches. **Known caveat**: AE5 notes `pnpm build` is currently blocked by 17 pre-existing tsc errors unrelated to this plan; do the grep on whichever build artifact can be produced (e.g., `vite build --emptyOutDir` ignoring type errors, or once those errors are fixed in a separate plan). If pre-existing tsc errors block the build, document the grep against `vite build` output and re-run after the tsc errors are fixed.
3. Manual sanity: with `VITE_TEST_WALLET=1` + valid key in `.env.local`, run `pnpm --dir frontend dev`, visit `/launch`, complete the full flow per AE1.

---

## Acceptance Verification

Map of origin Acceptance Examples to plan verification:

| AE | Verified by |
|---|---|
| AE1 (full flow completes, collection minted to test address) | U4 + U5 test scenarios + manual `pnpm dev` smoke per F1 |
| AE2 (banner on missing key, LAUNCH disabled) | U5 test scenarios |
| AE3 (flag unset, parity with pre-adapter) | All test files use prod-mode mocks by default; existing test cases unchanged in behavior |
| AE4 (zero test-wallet refs in `frontend/dist/`) | U6 manual grep verification |
| AE5 (`pnpm dev` E2E mints a Collection) | Manual smoke after U1-U6 land |

---

## Open Implementation-Time Questions

These are intentionally deferred from planning to implementation — they're cheap to resolve in code:

- **OQ-3** (vitest unit tests for adapter internals beyond U1's loader): deferred. Demo is the bottleneck.
- **OQ-5** (Slush co-existence): verify during U1/U2 dev. If dapp-kit's `WalletProvider` auto-connects to a real Slush extension while test mode is active, decide whether to unmount `WalletProvider` in test mode (preferred: minimal app shell branch on `TEST_WALLET_ENABLED`) or document the noise as harmless. Will not block the demo flow because the wrapper hooks short-circuit reads.
- **OQ-6** (existing Slush-signed JWT survival when toggling test mode mid-session): expected to "just work" because both Slush and test wallet sign with the same private key — same Ed25519 signature scheme, same address. Backend's `verifyPersonalMessageSignature` is stateless and address-bound. Verify by toggling `VITE_TEST_WALLET=1`, restarting `pnpm dev`, refreshing `/launch` with a prior session in localStorage: if the prior JWT still validates against `/api/auth/me` (or whatever the protected route check is), no special handling. If it 401s, add a session clear on test-mode mount.

These are resolved in code, not by re-asking the user.

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Tree-shake fails and the test-wallet module ships in prod | AE4 grep before declaring done; module-level `import.meta.env.PROD` throw as belt-and-suspenders; ESLint allow-list prevents accidental imports from production code paths |
| Walrus SDK's writeFilesFlow calls the signer with a shape the keypair doesn't handle | OQ-4 resolved by code inspection: walrus calls `signer.signAndExecuteTransaction({transaction, client})`, which is exactly what `Ed25519Keypair` provides natively. Verified at `node_modules/@mysten/sui/.../keypair.ts:81-96` |
| Address mismatch between test wallet and Slush key wipes the user's existing data state | Brainstorm's "critical operating assumption" — user MUST put the SAME funded testnet key Slush holds into `.env.local`. The `.env.example` warning calls this out explicitly. If the test wallet were a different key the user would have to /create a Model3D on that address before /launch — that's out of scope |
| dapp-kit `WalletProvider` ticks unwanted state while test mode is active | OQ-5 — verify in U1/U2. If it's noisy but harmless, document. If it actively breaks something, branch the app shell on `TEST_WALLET_ENABLED` to skip `WalletProvider` mount in test mode |
| Wrapper hooks introduce subtle prod-path bug (e.g., dep array drift, memo invalidation) | Existing test suite (564 cases on main as of session start) re-runs and must stay green; new tests cover prod-mode-mocked paths explicitly |
| Pre-existing 17 tsc errors block AE4's `pnpm build` verification | Use `vite build` (which doesn't type-check) for grep verification; document explicitly. Type-error cleanup is out of scope for plan-016 |

---

## Sequencing

```
U1 (adapter core)
 └─► U2 (wrapper hooks)
       ├─► U3 (useSession sign-in)
       ├─► U4 (LaunchCollectionPage refactor)
       └─► U5 (TopNav pill + banner)
             └─► U6 (.env.example + ESLint + AE4 grep)
```

U1 → U2 is strict (wrapper hooks consume the adapter).
U3, U4, U5 can land in any order after U2.
U6 is last because the grep verification needs all surfaces present.

**Two-session split** (matches brainstorm scope estimate):
- **Session 1 (S1)**: U1 + U2 + U3 — adapter + wrapper hooks + sign-in path. Verifies the JWT flow works end-to-end with the test wallet.
- **Session 2 (S2)**: U4 + U5 + U6 — LaunchCollectionPage refactor + UI + production safety. Verifies AE1 + AE2 + AE4 + AE5.

---

## Deferred to Follow-Up Work

- Wrapper-hook adoption in `/create`, `/market`, `/track` — files exist (`CreateModelPage.tsx`, `MarketPage.tsx`, `TrackPage.tsx`) and use direct dapp-kit hooks. Same adapter, just additional call-site refactors. Out of v1.
- Full agent-browser CI integration using the adapter for `/launch` regression testing — plan-014 follow-up.
- vitest unit tests for adapter beyond U1's loader smoke tests — defer; the manual demo smoke covers the bottleneck path.
- Tree-shake verification via build-pipeline assertion (not just manual grep) — defer to a CI hardening pass.
- ADRs in `docs/decisions.md`: write D-058, D-059, D-060, D-061 entries (each is a candidate in the brainstorm). Per CLAUDE.md's decision-discipline table, these are "new dependency / public contract change / new pattern" — full ADR. Land these alongside the implementation commits.
