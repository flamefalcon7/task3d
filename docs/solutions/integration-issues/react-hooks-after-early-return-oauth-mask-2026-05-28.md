---
title: "React hooks-after-early-return bug masked by OAuth-redirect signin; in-page signin exposes it"
date: 2026-05-28
category: integration-issues
module: frontend
problem_type: integration_issue
component: frontend
severity: high
tags:
  - react
  - rules-of-hooks
  - dapp-kit
  - oauth-redirect
  - test-wallet
  - localStorage-session
applies_when:
  - "Refactoring a page that previously used OAuth-redirect auth (Slush, Enoki Google, etc.) to support in-page signin"
  - "Adding a test wallet / mock signer that mints a session without leaving the page"
  - "Auditing a component that has multiple useState / useMemo / useEffect calls AFTER an `if (!session) return ...` early return"
  - "Investigating a 'rendered fewer hooks than expected' error that only fires after first signin"
related_components:
  - frontend/src/auth
  - frontend/src/collection/LaunchCollectionPage.tsx
  - frontend/src/test-wallet
---

# Hooks-after-early-return masked by OAuth-redirect signin

## The bug

`frontend/src/collection/LaunchCollectionPage.tsx` had this structure (~700 lines, simplified):

```tsx
export function LaunchCollectionPage() {
  // ~20 hooks (lines 337-555):  useSession, useAppAccount, useAppSigner,
  //                              useState × many, useMemo, useCallback...

  if (!session) {
    return <SignInScaffold />;   // early return
  }

  // ~11 MORE hooks (lines 630-810): partListItems useMemo, hover refs +
  //                                  useEffect, partColors useMemo,
  //                                  baseGlbUrl useState + useEffect,
  //                                  random-gen useCallback × 3, etc.

  return <AuthoringFlow />;
}
```

When `session` transitions from `null` to a JWT inside the page lifecycle, the next render calls **11 more hooks** than the previous render did. React's rules-of-hooks engine fires:

> Rendered fewer hooks than expected. This may be caused by an accidental early return statement.

The component is replaced by an error boundary. The page goes blank (or back to scaffold, depending on the boundary's fallback).

## Why it was invisible for 5 weeks before surfacing

The dapp's only signin path was Slush (browser extension) or Enoki Google (zkLogin) — **both use OAuth-style redirects**. The flow is:

1. User clicks Sign In on the scaffold
2. Browser navigates away to the OAuth provider (or Slush popup window)
3. User authorizes
4. Browser navigates BACK to the dapp with credentials
5. `useSession` reads `localStorage` on mount → JWT is already present → first render is post-signin

There is **never a render where `session` transitions `null → set` while the component is mounted**. The early return only fires on the very first render (no session yet), and after the OAuth redirect the component is mounted fresh with a non-null session. Hook count is consistent within each mount lifecycle. React is happy.

Test mocking compounded the invisibility. `frontend/src/test/setup.ts` mocks `SignInButton` to render `null` for non-canonical test files, so the click path never executes in vitest. The 564-test suite was 100% green; the bug shipped without anyone seeing it.

## What surfaced it

Plan-016 added a test wallet adapter that signs the JWT challenge in-page using a local `Ed25519Keypair` (no redirect, no popup). The flow:

1. User on `/launch`, no session, page renders scaffold
2. Click Sign In → `useSession.signIn()` posts the challenge, gets a nonce, signs it locally, posts the verify response, gets the JWT, calls `setSession(next)`
3. React re-renders the SAME component instance with `session` now truthy
4. The early return no longer fires → 11 extra hooks execute → hook-count mismatch → crash

The agent-browser smoke run at `2026-05-27 23:30 UTC` caught it on the first click. The error boundary fired with the position-208 hook ordering warning.

## The fix (plan-016 commit b0a5b23)

Move the early return to AFTER all hooks. All hooks unconditionally run on both pre- and post-signin renders; only the JSX branch differs.

```tsx
export function LaunchCollectionPage() {
  // ALL ~31 hooks run unconditionally
  // (useSession, useAppAccount, useAppSigner, useState × N, useMemo × N,
  //  useCallback × N, useEffect × N, useRef × N)
  ...

  if (!session) {
    return <SignInScaffold />;   // moved here — AFTER all hooks
  }

  return <AuthoringFlow />;
}
```

The cost: a few useMemo and useEffect calls now run when `session` is null. Most short-circuit on `if (!base) return null`-style guards inside their bodies; the rest produce harmless empty-state values. No observable behavior change.

## How to spot this elsewhere

Grep your tree for the pattern. Any component that:

1. Calls **3 or more hooks**
2. Then has `if (!X) return <Scaffold />`
3. Then calls **more hooks**

…has the latent bug. It survives only as long as `X` is true on first render and never transitions to false-then-true in the same component instance. The moment you add:

- An in-page signin
- A "switch account" feature that wipes session without reload
- A "log out" button that doesn't full-page-reload
- A test-only signin shortcut

…the bug fires immediately.

Lint rules to enable (when ESLint is wired in this project — see D-061):

```js
{
  "react-hooks/rules-of-hooks": "error",  // catches the static pattern
}
```

The runtime warning is the catch-all; the lint rule would have flagged this at write time five weeks ago.

## Where it lives in the repo

- Hotfix commit: `b0a5b23` ("fix(launch): plan-016 hotfix — hook order + Sui SDK TransactionResult shape")
- Before: `frontend/src/collection/LaunchCollectionPage.tsx:582` had `if (!session) return ...` with 11 hooks after it
- After: same file, early return moved to after the final hook (right before the main JSX return)
- Discovery: agent-browser smoke 2026-05-27, click on `data-testid="signin-button"` with test wallet active → React error boundary → console log of hook-position mismatch
- Test suite gap: existing tests mocked `SignInButton` to `() => null`, so the click path was never exercised. Adding a test-wallet-driven E2E (not landed in plan-016) would have caught it.
