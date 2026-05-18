---
title: Babylon's onKeyboardObservable passes raw event.key — spacebar is ' ' not 'space'
date: 2026-05-18
category: integration-issues
module: babylon-input
problem_type: integration_issue
component: tooling
symptoms:
  - "Feature gated on `keys.has('space')` (or 'enter', 'escape', 'arrowup', etc.) silently never fires"
  - "Test passes when keyboard event mocked with `{ event: { key: 'space' } }`, but production silently fails"
  - "Other letter keys (W, A, S, D) work fine because `.toLowerCase()` produces a 1-char string matching the expected name"
tags:
  - babylon
  - keyboard
  - onkeyboardobservable
  - keyboard-event
  - spacebar
  - browser-api
  - input
versions:
  - "@babylonjs/core@9.7.0 (verified)"
---

## TL;DR

Babylon's `scene.onKeyboardObservable` surfaces `kbInfo.event.key` verbatim
from the browser's `KeyboardEvent.key`. For the **space bar**, browsers
return the single-character string `' '` (literal space), NOT the string
`'space'`. Any per-frame observer checking `keys.has('space')` (where
`keys` is populated from the lowercased `event.key`) will silently never
match.

Fix: after lowercasing, normalize the space character to `'space'` (or any
other named string you want to use as the key identifier).

## The shim

```ts
scene.onKeyboardObservable.add((kbInfo) => {
  let k = kbInfo.event.key.toLowerCase();
  // Browsers return ' ' (literal space) for the space bar; the rest of the
  // codebase expects 'space' as a friendly identifier. Normalize here so
  // `keys.has('space')` checks downstream actually match.
  if (k === ' ') k = 'space';
  if (kbInfo.type === KeyboardEventTypes.KEYDOWN) keys.add(k);
  else if (kbInfo.type === KeyboardEventTypes.KEYUP) keys.delete(k);
});
```

## Symptom (real-world)

Plan-005 (`/track` handbrake) used `keys.has('space')` to gate the handbrake
mode. The feature shipped through implementation, unit tests, and integration
review before doc-review (`ce-doc-review` F-FEAS-002) caught that browser
`KeyboardEvent.key` for the spacebar is the literal `' '` character. Without
the shim, the handbrake silently never fires — the car visually still
responds to W/A/S/D (which work fine because their lowercased `.key` matches
the gate exactly), so the missing handbrake just looks like "we forgot to
implement it" rather than a wiring bug.

## Test discipline

The shim adds a normalization layer that test mocks MUST exercise. Tests
that pass `{ event: { key: 'space' } }` directly to the mocked observer
bypass the shim and won't catch its removal as a regression. Mock with
`{ event: { key: ' ' } }` (literal space) so the test exercises the same
code path as the browser.

## Other non-letter keys to watch for

The same pattern applies to any key whose name differs from its character:
- Arrow keys: `'ArrowUp'`, `'ArrowDown'`, etc. — Babylon delivers as-is;
  `.toLowerCase()` produces `'arrowup'` etc. Match against the lowercased
  form, NOT `'up'` or `'arrow-up'`.
- Enter: `'Enter'` → `'enter'` (works fine)
- Escape: `'Escape'` → `'escape'` (works fine)
- Function keys: `'F1'` → `'f1'` (works fine)
- Modifier keys: `'Shift'`, `'Control'`, `'Alt'`, `'Meta'` — handle via
  `event.shiftKey` / `event.ctrlKey` / etc. on the event, not via
  `keys.has(...)`.

Spacebar is the only common key where the `.key` value is a character
that doesn't match its conventional name. Tab is the second (`'Tab'` →
`'tab'` works, but `'\t'` would not — verified to be `'Tab'` in modern
browsers).

## Why this matters

Any future feature in `racetrackScene.ts` (or another Babylon scene module)
that introduces a Space-bar binding will silently fail without the shim.
The plan-005 keyboard observer in `frontend/src/track/racetrackScene.ts`
is the canonical example.

## See also

- UI Events spec — KeyboardEvent.key values:
  https://www.w3.org/TR/uievents-key/
- Plan-005's F-FEAS-002 doc-review finding (the discovery path)
- `frontend/src/track/racetrackScene.ts` keyboard observer (the shim
  in production)
