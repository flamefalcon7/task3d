---
title: "React StrictMode silently breaks `useRef` + cleanup-only `useEffect` patterns; vitest doesn't catch it"
date: 2026-05-23
status: pattern-documented
category: integration-issues
module: frontend-market
problem_type: integration_issue
component: frontend
tags:
  - react
  - strict-mode
  - useref
  - useeffect
  - vitest
  - testing-gap
---

## Problem

Plan-011's buyer-side fullnode read-back was implemented behind an `aliveRef`
guard to avoid setState-after-unmount. The pattern looked obviously correct,
type-checked, passed all 22 unit tests, and was reviewed end-to-end. In the
browser it silently broke: every buy got stuck at `⏳ Reading your new token
from fullnode…` and never advanced to `✅` or `⚠️`. The same root cause was
also silently disabling `pollRefresh` (10×1.5 s reloadKey bumps after every
list/buy), which had been making the "buy → My item not refreshing" symptom
the user originally complained about.

## The pattern that looks correct but isn't

```ts
const aliveRef = useRef(true);
useEffect(() => () => { aliveRef.current = false; }, []);
```

Outer arrow returns the cleanup. There's no setup body. Empty deps → mounts
once. Looks fine.

In `main.tsx` we wrap the root in `<StrictMode>`. In React 18 dev, StrictMode
runs every effect with an artificial **mount → cleanup → mount** cycle to
verify components are resilient to re-mount. The ref instance is preserved
across this cycle (refs are tied to the component instance, not the effect
lifecycle), but the cleanup-only effect leaves it in the wrong state:

| Step | Effect action | `aliveRef.current` |
|------|---------------|--------------------|
| Mount-1 setup | empty body — no-op | `true` (from `useRef(true)`) |
| StrictMode cleanup-1 | sets `false` | **`false`** |
| Mount-2 setup | empty body — no-op | **stays `false`** |

After the double-mount cycle stabilises, `aliveRef.current === false`
permanently. Every async work guarded by `if (!aliveRef.current) return;` early-
returns. Every state update behind the guard never fires. The component
*looks* fine in the rendered DOM (initial render works), but any post-mount
async path silently no-ops.

## The fix

The setup body MUST re-assert `true` on every mount:

```ts
const aliveRef = useRef(true);
useEffect(() => {
  aliveRef.current = true;
  return () => { aliveRef.current = false; };
}, []);
```

Now the cycle is `true → false → true` and stable at `true` post-mount. Same
guarantee, StrictMode-correct.

## Why tests didn't catch it

`@testing-library/react`'s `render()` does NOT wrap in StrictMode by default —
it only renders what you pass. StrictMode is opt-in per app entry, not part of
the testing runtime. So all 22 unit tests for MarketPage were running the
single-mount path, which leaves `aliveRef.current = true` after mount-1 setup
(no cleanup ever ran).

Result: the pattern *did* work in tests but *did not* work in dev/prod under
StrictMode. This is the worst kind of false confidence — green CI, broken app.

## Fix in the test layer too

Wrap test renders in `<StrictMode>` to mirror `main.tsx`:

```tsx
import { StrictMode } from 'react';

function renderPage() {
  return render(
    <StrictMode>
      <MemoryRouter><MarketPage /></MemoryRouter>
    </StrictMode>,
  );
}
```

Verified empirically: with StrictMode wrap added AND the buggy aliveRef pattern
reverted, the three buy-confirm tests fail loudly (DOM dump shows
`confirm-syncing` stuck, `confirm-ok` never appearing). With the fix restored,
all tests pass.

**Scope tradeoff:** wrapping every test file in StrictMode would catch this
class of bug everywhere but force every effect to be idempotent — some
existing tests may not survive the audit. For now StrictMode-wrap is applied
only in `MarketPage.test.tsx` where the aliveRef pattern lives. Expanding to
all tests is a Phase-5 follow-up.

## Generalised rule

For any `useRef` + `useEffect` pair where the ref tracks a mounted-ness flag,
auth state, or any other lifecycle invariant:

- Use **both** setup and cleanup: `useEffect(() => { ref.current = X; return () => { ref.current = Y; }; }, [])`
- Never write `useEffect(() => () => { ref.current = Y; }, [])` (cleanup-only)
- If the test file renders the component without StrictMode, you have a silent
  reproducibility gap — wrap with `<StrictMode>` to close it

## Related

- Implementation: `frontend/src/market/MarketPage.tsx` (`aliveRef`).
- Test wrap: `frontend/src/market/MarketPage.test.tsx` (`renderPage` helper).
- React 18 StrictMode docs: https://react.dev/reference/react/StrictMode
- Found while implementing fullnode read-back for D-043 buyer confirmation;
  silently disabling `pollRefresh` was also responsible for an earlier symptom
  ("buy → My item not auto-refreshing").
