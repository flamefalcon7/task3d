# Test Wallet Adapter — Requirements

**Status**: requirements complete · ready for ce-plan
**Date**: 2026-05-27
**Origin**: debug session 2026-05-27 (branch `debug/walrus-upload-crash`,
11 commits of in-Chrome workaround attempts, none cleared the crash)
**Phase**: Phase 4 follow-up (Plan-016 candidate)

## Context

User's Chrome (Slush unlocked + active session + many sibling tabs)
consistently crashes the renderer at
`flow.encode() → systemState()` on `/launch` 8-variant upload.
Diagnostic trail caught it at fetch initiation to Sui RPC, before
headers return. The same SDK + endpoint succeeds from an isolated
Chromium even with Slush extension installed (locked). Six commits of
in-code workarounds (GPU pressure reduction, prewarm, endpoint swap,
…) didn't shift the signature. The bug is environmental to a specific
unlocked-Slush + multi-tab Chrome state we can't reproduce without the
user's key. We've exhausted in-code workarounds; the next step is to
bypass Slush entirely.

A `TestWalletAdapter` sidesteps Slush by implementing the same Sui
SDK `Signer` interface that dapp-kit's hook produces, but signing with
a local keypair instead of round-tripping to the browser extension.
The rest of the dapp is unchanged. Plan-014's "Frontend UAT
Requirements" already documented this as deferred work; the launch
crash bumps it from nice-to-have to demo-blocker.

**Critical operating assumption — same address**: the test wallet's
key is the user's _existing_ funded testnet key (the one Slush also
holds), put in `.env.local`. Test-wallet address == Slush address ==
creator-of-existing-Model3Ds. The user owns the bases they want to
fork; LicenseTerms checks pass. If the test wallet were a different
key, the user would have to first /create a Model3D on that address
before they could /launch — that's not the goal here.

Secondary win once it ships: agent-browser can drive end-to-end
wallet-gated flows, unblocking regression coverage that's been
deferred since plan-014.

## Goal

Unblock the user's `/launch` L2 upload + mint flow so the hackathon
demo can record on testnet, without manual real-Chrome dependency. The
same adapter feeds agent-browser automation in follow-up work.

## Non-goals

- Solving the underlying Chrome/Slush renderer crash (the bug is
  environmental; no production users will use this dev build state)
- Mainnet path (explicit guard rejects)
- L1 publish path (`/create` Tripo fee + mint) — keep on Slush for now,
  follow-up if we want full automation
- L2 buy / royalty hot-potato — different signing site, not blocking
- Production tree-shaking proven via build-pipeline test — manual grep
  verification is acceptable for v1

## Requirements

- **R1** — Test wallet replaces BOTH the dapp-kit signer AND the
  account info (`useCurrentAccount` return value) in
  `LaunchCollectionPage` when activation flag is set. Rest of the page
  (variant editor, base picker, preview canvas, build/upload pipeline)
  is unchanged. Implemented as thin wrapper hooks `useAppAccount()` /
  `useAppSigner()` that internally check test mode and either return
  test-wallet data or fall through to dapp-kit's `useCurrentAccount()` /
  `useDappKitSigner()`. Call sites refactor from direct dapp-kit hooks
  to wrappers; ~4-6 lines changed in LaunchCollectionPage.
- **R2** — Signing key sourced from `VITE_TEST_WALLET_KEY` in
  `frontend/.env.local`. Format = bech32 `suiprivkey1...` (Sui's
  canonical encoding, what `sui keytool export` produces).
  `.env.local` is already gitignored.
- **R3** — Activation gate = build-time env var `VITE_TEST_WALLET=1`.
  When unset (production default), the test-wallet module is not
  imported anywhere — bundler dead-code-eliminates the whole subtree.
- **R4** — Production safety: any code path that loads the adapter
  module throws at module-eval time if `import.meta.env.PROD === true`.
  Belt-and-suspenders against accidental ship.
- **R5** — Missing/invalid key when activation flag is on: `/launch`
  mounts with an error banner naming the missing env var; mint button
  disabled. No silent fallback to Slush (that would mask the misconfig).
- **R6** — Sender address derived from the test key. UI surfaces it in
  the existing wallet-pill slot ("TEST WALLET 0xabcd…1234" instead of
  Slush's "0xabcd…1234"). The creator field on minted Model3D objects
  is visibly the test address.
- **R7** — Adapter satisfies the `Signer` interface dapp-kit's
  `useDappKitSigner` returns: `toSuiAddress()`, `signTransaction()`,
  `signAndExecuteTransaction()`. Signing happens via Sui SDK directly,
  no popup, no user gesture required, so agent-browser can drive.
- **R8** — All 3 popups on `/launch` (writeFilesFlow `executeRegister`
  + `executeCertify` + `buildLaunchCollectionWithTokensPtb`) go
  through the same adapter. SUI tip + register fee paid from the test
  wallet's balance.
- **R9** — `SignInButton` / session-establishment flow ALSO uses the
  test adapter when active. The challenge-response sign (which mints
  the JWT) signs via test-wallet's private key, posts to backend,
  receives JWT, stores in session. Backend `jwt.verifySession` accepts
  the test-wallet-signed challenge identically to a Slush-signed
  challenge — both produce standard Ed25519 signatures from the same
  address, indistinguishable to the verifier. Without R9 the
  `/launch` page never advances past the sign-in gate.
- **R10** — `useAppAccount()` and `useAppSigner()` are wrapper hooks
  the L2 flow uses INSTEAD OF direct `useCurrentAccount` /
  `useDappKitSigner`. In production (no test mode), they're trivial
  pass-throughs to the dapp-kit hooks — zero behavior change. In test
  mode, they short-circuit and return test-wallet objects. Call sites
  to refactor: LaunchCollectionPage (2 hooks × 1 site), SignInButton
  (1 hook for challenge signing). `/create`, `/track`, `/market` keep
  direct dapp-kit calls — outside R1 scope.

## Actors

- **A1 (Local dev)**: Engineer running `VITE_TEST_WALLET=1 pnpm dev`
  with a funded testnet key in `.env.local`. Wants to test `/launch`
  end-to-end without Slush.
- **A2 (Agent-browser test driver)**: Future automation that drives
  `/launch` in CI without a wallet extension. Reads the same env vars
  the dev does. (out of scope for v1 implementation, but the API
  shape must support it.)

## Flows

- **F1 — Adapter-active launch happy path (A1)**:
  1. Set `VITE_TEST_WALLET=1` + key in `.env.local`
  2. `pnpm dev`
  3. Visit `/launch` → wallet pill reads "TEST WALLET 0x…"
  4. **Click sign-in → test adapter signs challenge → JWT issued →
     authoring UI renders.** (R9)
  5. Pick base, configure variants, click LAUNCH
  6. `runBuildVariants` runs (backend), `uploadFiles` runs with
     adapter signing register + certify (no popups)
  7. `buildLaunchCollectionWithTokensPtb` signs (no popup)
  8. Collection minted on-chain, owned by test wallet address
- **F2 — Adapter inactive, dapp unchanged (production parity)**:
  1. `VITE_TEST_WALLET` unset (or `=0`)
  2. `pnpm dev` or `pnpm build`
  3. Bundle has zero test-wallet code (verified by grep / source-map)
  4. `/launch` uses Slush as before; no behavior change

## Acceptance examples

- **AE1**: With `VITE_TEST_WALLET=1` + valid key, `/launch` shows
  "TEST WALLET 0x…1234" in nav, full launch flow completes without
  popups, collection minted to test address.
- **AE2**: With flag enabled but no `VITE_TEST_WALLET_KEY` set,
  `/launch` shows error banner: `TEST_WALLET enabled but
  VITE_TEST_WALLET_KEY is missing — set it in .env.local`. Mint button
  disabled.
- **AE3**: With flag unset, dapp behaves identically to pre-adapter.
  Slush flow + wallet pill + popups all unchanged. (Snapshot:
  agent-browser snapshot at `/launch` pre-sign-in matches the
  pre-plan-016 reference.)
- **AE4**: `pnpm build` (no env vars) produces a bundle with zero
  matches for `TestWalletAdapter`, `suiprivkey`, or
  `VITE_TEST_WALLET_KEY` references in `frontend/dist/`. (Belt for the
  R3+R4 tree-shake claim.)
- **AE5**: `VITE_TEST_WALLET=1 pnpm dev` runs cleanly and `/launch`
  end-to-end (sign-in + variant edit + LAUNCH button) completes
  without Slush popups; mints a Collection visible on-chain. (Dev
  flow only — `pnpm build` is blocked by 17 pre-existing tsc errors
  unrelated to this plan.)

## Key decisions

- **D-058 candidate**: Test-wallet bypass uses Sui SDK
  `Ed25519Keypair.fromSecretKey(bech32)` + direct
  `signAndExecuteTransaction`, NOT a mocked dapp-kit hook nor a
  shadowed WalletProvider context. Rationale: implementing a `Signer`
  interface directly is the smallest surface; shadowing dapp-kit's
  context would require reverse-engineering internals that aren't
  publicly exported.
- **D-059 candidate**: Activation = build-time env var
  (`VITE_TEST_WALLET=1`), not runtime flag. No localStorage, no URL
  param — avoids accidental prod activation. Integration uses thin
  wrapper hooks (`useAppAccount` / `useAppSigner`) at call sites
  rather than shadowing dapp-kit's React context.
- **D-060 candidate**: TestWallet adapter scope is /launch only for
  v1 (sign-in + 3 mint popups). `/create`'s own `useDappKitSigner`
  stays on Slush. Future expansion (full /create automation, /market
  buy) re-uses the same adapter but adds wrapper-hook adoption to
  those call sites; out of v1 scope.
- **D-061 candidate**: All test-only code lives in
  `frontend/src/test-wallet/` subdirectory. Production module-level
  guards (`if (import.meta.env.PROD) throw`) plus an ESLint rule
  banning `production-code → import('test-wallet/*')` keep the
  subtree dead-code-eliminable.

## Open / deferred questions

- **OQ-1**: Exact UI for "TEST WALLET" indicator — does it
  replace the wallet pill entirely, or sit beside it as a warning?
  (Cosmetic; default to replacing.)
- **OQ-2**: `Ed25519Keypair.fromSecretKey()` accepts bech32 directly
  in `@mysten/sui@2.16.2`, or do we need a decode helper
  (`decodeSuiPrivateKey`)? (5-min verify during U1.)
- **OQ-3**: vitest unit tests for the adapter — worth writing now, or
  defer until automation work picks it up? (Lean defer; demo is the
  current bottleneck.)
- **OQ-4**: Does the adapter need to handle `writeFilesFlow`'s
  particular signer-call shape (it calls
  `signer.signAndExecuteTransaction({transaction, client})` with a
  specific options object)? Verify by reading the SDK paths in U1.
- **OQ-5**: When test mode is ACTIVE but Slush is also connected in
  the browser, does dapp-kit's `WalletProvider` still try to auto-
  connect / show wallet UI? Test wallet wrapper hooks short-circuit
  the relevant reads, but dapp-kit's internal state may still tick.
  Verify during U1 — if it's noisy, document; if it's broken,
  consider unmounting WalletProvider in test mode.
- **OQ-6**: Existing session JWT from a prior Slush session — if
  user toggles test mode mid-session, the JWT was signed by Slush's
  signer (matching the wallet address), test-wallet uses same key, so
  the JWT might still validate. Need to confirm what the backend's
  `jwt.verifySession` actually checks (signature? address? expiry?).
  If it's stateless and address-bound, no special handling needed.

## Scope estimate

- `frontend/src/test-wallet/TestWalletAdapter.ts` — signer impl +
  Ed25519 keypair loader from `VITE_TEST_WALLET_KEY` + module-level
  `import.meta.env.PROD` guard
- `frontend/src/test-wallet/index.ts` — public exports; gated by
  `VITE_TEST_WALLET` env at module-eval
- `frontend/src/wallet/useAppAccount.ts` + `useAppSigner.ts` —
  wrapper hooks (R10)
- `frontend/src/auth/SignInButton.tsx` — refactor to use
  `useAppSigner()` for challenge signing (R9)
- `frontend/src/collection/LaunchCollectionPage.tsx` — refactor to
  use `useAppAccount` + `useAppSigner` instead of direct dapp-kit
  hooks
- `frontend/src/ux/TopNav.tsx` — wallet-pill indicator branches on
  test-wallet flag (R6)
- `frontend/.env.example` — document `VITE_TEST_WALLET` +
  `VITE_TEST_WALLET_KEY`, with warning about key handling
- `frontend/eslint.config.js` (or new test-wallet restrict rule) —
  prevent production code from importing `test-wallet/*` (D-061)
- ADRs in `docs/decisions.md`: D-058, D-059, D-060, D-061
- ~6-10 hour implementation. Two sessions feasible — split: (S1) U1-U3
  adapter + wrapper hooks + R9 sign-in. (S2) U4-U6 LaunchCollectionPage
  integration + UI + production safety verification.
