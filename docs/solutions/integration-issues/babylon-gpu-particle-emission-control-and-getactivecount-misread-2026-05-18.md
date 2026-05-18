---
title: Babylon GPUParticleSystem — stop emission with system.stop(), not emitRate=0, and ignore getActiveCount for "alive count"
date: 2026-05-18
category: integration-issues
module: babylon-particles
problem_type: integration_issue
component: tooling
symptoms:
  - "Tire smoke particles continue rendering visually after the player releases the handbrake gate"
  - "system.getActiveCount() returns a number that stays constant across many seconds, even when emitRate has been set to 0"
  - "Setting system.updateSpeed = 1.0 causes particles to die in a single frame; the cloud appears glued to the emitter position"
root_cause: wrong_api
resolution_type: code_fix
severity: medium
tags: [babylon, gpu-particles, vfx, emit-rate, get-active-count, update-speed, debugging]
---

# Babylon GPUParticleSystem — stop emission with `system.stop()`, not `emitRate=0`, and ignore `getActiveCount()` for "alive count"

## Problem

Plan-006 added GPU tire-smoke that should fire while the player handbrake-drifts and stop the moment they release Space. The implementation worked behaviorally (the input gate fired correctly), but the visible smoke would persist at the car's wheels for many seconds after the player stopped drifting. Multiple "fixes" applied in sequence either failed to address it or made it worse — each one based on a wrong assumption about Babylon's `GPUParticleSystem` API.

## Symptoms

- Smoke continues rendering at the car body for ~5-8 seconds after `Space` is released and the `intentionalDrift` gate has been observed to go `false`
- A diagnostic `console.log` of `system.getActiveCount()` shows the count locking at a value (e.g., 78) and staying there indefinitely, suggesting particles "never die"
- A subsequent fix attempt that set `system.updateSpeed = 1.0` made particles die in a single frame, producing a constant blob "stuck" at the emitter position instead of a trailing wake

## What Didn't Work

1. **Adding only an `intentionalDrift` boolean gate on top of `emitRate`.** The gate correctly stopped NEW emissions, but in-flight particles were already on a multi-second visual fade arc — the cloud lingered.
2. **Setting `system.updateSpeed = 1.0`, believing it meant "real-time simulation".** Babylon source (`BaseParticleSystem.updateSpeed`) defaults to `0.01` per JSDoc ("0.01 is default update speed, faster updates = faster animation"). `1.0` is **100× faster than default**, not "real time" — particles aged through their entire `lifetime` (0.7-1.2s) in a single frame, so the visible cloud was always the freshest 1-frame batch at the current emitter position, glued to the car.
3. **Trusting `system.getActiveCount()` as evidence that particles were/weren't alive.** Babylon source for `GPUParticleSystem.getActiveCount()` returns `this._currentActiveCount`, which is a **buffer-slot high-water mark**, not actively-rendering particle count. The value plateaus at the peak burst size and stays there even after every particle has visually expired — using it as a diagnostic signal causes wrong conclusions about whether the fix worked.
4. **Setting `emitRate = 0` alone (without `system.stop()`).** In the current Babylon build (`@babylonjs/core@^9.6.0`), `emitRate=0` does prevent new emissions in most cases — but the GPU shader path still continues to compute particle aging against the internal `_accumulatedCount`. Combined with overly-long `lifetime` settings, this read visually as "the car keeps smoking."

## Solution

Four changes, applied together:

1. **Use `system.start()` / `system.stop()` for emission control, not `emitRate` toggling.** Track an `emitting` boolean closure variable and only call `start()` / `stop()` on transitions (avoid per-frame thrashing of Babylon's internal accumulator).
2. **Do NOT set `updateSpeed` explicitly — keep Babylon's default of `0.01`.** Documented in `BaseParticleSystem.ts`.
3. **Shorten particle `lifetime` so the post-stop visual tail is ~0.5s, not multi-second.** The "lifetime" value is in Babylon's particle-sim time base; at default `updateSpeed=0.01`, a `lifetime` of `0.15-0.3` maps to roughly `0.3-0.6` real seconds of visible particle life.
4. **Raise particle velocity (especially backward, away from the emitter) so the short-lifetime particles travel far enough during their life to read as a dispersing wake**, not a static puff at the wheel.

Code (final shape inside `tireSmoke.ts`):

```ts
// Constants at top of file
const SMOKE_MIN_LIFETIME_S = 0.15;
const SMOKE_MAX_LIFETIME_S = 0.3;
const SMOKE_UP_MIN = 2.0;
const SMOKE_UP_MAX = 3.5;
const SMOKE_BACK_MIN = 3.0;
const SMOKE_BACK_MAX = 6.0;
const SMOKE_RATE_MAX = 200;
// (do NOT set system.updateSpeed — keep Babylon default 0.01)

// In factory: track emission state to call start/stop only on transitions
let emitting = false;

function tick(carPosition, carForward, lateralSpeed, drifting: boolean) {
  // ...compute anchor + rate...
  const shouldEmit = drifting && rate > 0;

  if (shouldEmit) {
    emitters[0].system.emitRate = rate;
    emitters[1].system.emitRate = rate;
    if (!emitting) {
      emitters[0].system.start();
      emitters[1].system.start();
      emitting = true;
    }
  } else if (emitting) {
    emitters[0].system.stop();   // <-- the load-bearing line
    emitters[1].system.stop();
    emitting = false;
  }
}
```

Systems start out **stopped**, not running. They only `start()` the first frame the player actually drifts.

## Why This Works

- `system.stop()` flips Babylon's internal `_stopped` flag, which the GPU shader honors unambiguously — no residual emission from accumulator drift.
- Babylon's default `updateSpeed = 0.01` is the correct "real-time" value at 60fps when `lifetime` values are interpreted as the documented unit. Deviating from default needs empirical testing per use case; do not assume `1.0 = real time`.
- Short `lifetime` (0.15-0.3) capped at ~0.6 real seconds means even worst-case post-`stop()` particles are gone within ~0.6s of release. Players read this as an immediate cut, not a fade.
- High backward + upward velocity over the short lifetime produces visible per-particle movement away from the wheel anchor, so the smoke reads as a directional wake instead of a stationary blob.
- `getActiveCount()` was misleading the diagnosis because it reports allocated buffer slots, not visually-alive particles. Once that was understood, the visual symptom (lingering cloud) was traced to lifetime, not "particles never dying".

## Prevention

1. **When Babylon API behavior contradicts intuition, read the source on GitHub before iterating on fixes.** `https://github.com/BabylonJS/Babylon.js/blob/master/packages/dev/core/src/Particles/gpuParticleSystem.ts` and `baseParticleSystem.ts` are the canonical contracts. Property defaults and what each value means are documented in JSDoc only — not in the rendered website docs.
2. **Don't use `getActiveCount()` as a debug signal for "how many particles are visible".** It is a buffer-slot count. For visual debugging, trust the screen and use a particle texture / color you can clearly see.
3. **Use `system.start()` and `system.stop()` for emission control, not `emitRate = 0` toggling.** The Babylon-canonical pattern.
4. **For wheel/vehicle trail particles specifically:** keep lifetime short (≤ 0.5s real time), velocity high relative to the car (so particles visibly leave the emitter within their lifetime), and the emitter as a `Vector3` mutated in place (no per-frame allocs).
5. **`updateSpeed` default is `0.01`, NOT `1.0`.** From `BaseParticleSystem.ts` JSDoc: "The overall motion speed (0.01 is default update speed, faster updates = faster animation)". `1.0` makes particles age 100× faster than default — useful only for stylistic burst effects.

## Related Issues

- [`babylon-extrudeshape-updatable-instance-truncates-on-path-growth-2026-05-18.md`](./babylon-extrudeshape-updatable-instance-truncates-on-path-growth-2026-05-18.md) — another Babylon API gotcha caught during plan-005 (silent truncation on `MeshBuilder.ExtrudeShape({updatable, instance})` path growth). Same pattern: API behaves contrary to intuition, only the source code reveals the actual contract.
- [`babylon-onkeyboardobservable-space-key-is-literal-space-2026-05-18.md`](./babylon-onkeyboardobservable-space-key-is-literal-space-2026-05-18.md) — Babylon keyboard observer reports `KeyboardEvent.key` for space bar as the literal `' '` character, not `'space'`. Another "feels-obvious-but-wrong" API contract.
- Plan-006 (`docs/plans/2026-05-18-006-feat-racetrack-scene-polish-plan.md`) — U7 GPU tire-smoke unit; the bug surfaced during manual smoke testing after the unit was code-reviewed and merged.

## Meta — Debugging Process Lessons

This was a costly debugging session (~6 iteration cycles, repeated user test/feedback cycles). The user explicitly called it out: "你去看看babylonJS VFX的文件確認怎麼做 不要自己瞎猜 我還要一直幫你測試" ("Go read the Babylon.js VFX docs to confirm what to do, stop guessing — I have to keep helping you test").

What went wrong (process-side, not code-side):

- **Iterated on hypotheses without verifying API semantics first.** Each "fix" was based on what I *thought* a Babylon property did, not what the source proved it does. Cost the user 3+ test cycles before I finally fetched the source.
- **Trusted my own debug logging as ground truth.** `getActiveCount()` looked like it was reporting alive count and I built two failed fixes on that assumption. Should have either (a) trusted the visual symptom over the metric, or (b) verified what the metric actually returns by reading the source.
- **Reverse-engineered from symptoms instead of from the API contract.** When user reported "particles never die", I should have first asked "what makes a particle die in this API" and read the answer, not theorized.

Forward rule for myself when working with third-party 3D / VFX / shader APIs: **on the first behavior surprise, read the relevant source file before iterating on fixes**. Source-first is cheaper than guess-test cycles, even when the source dive feels like overkill.
