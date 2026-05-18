---
date: 2026-05-18
topic: throttle-brake-handbrake-drift
---

# Throttle / brake / handbrake-drift for /track

## Summary

Upgrade `/track` driving from four direction keys to a three-pedal feel: W = throttle, S = brake-then-reverse, Space = Mario Kart-style handbrake (drops lateral grip + 1.5× steering boost). Car leaves visible skid marks while sliding so demo viewers read drifts as *technique*, not "the car is slipping."

---

## Problem Frame

The current `/track` arcade-control model treats S as a reverse impulse and has no dedicated brake or drift surface. Two problems follow.

First, the input vocabulary is impoverished — a player coming from any racing game expects S to slow them down before reversing, not lurch straight into reverse. There is no way to cancel forward momentum without releasing throttle and waiting for damping. Cornering hot means overshooting.

Second, tight corners look the same as straights from a viewer's perspective. The car simply tracks the road. There's no "moment of skill" the camera can capture, no shape distinct from "drive forward + steer." A racing demo without drift reads as a tech demo, not a game.

Both pains compound for the demo recording: a viewer watching the 30-second `/track` segment can't tell whether the player is doing anything skillful, because the only thing on screen is the car following the rail. The buyer-side payoff of plan-004 ("an owned NFT is consumable as game content") leans heavily on this segment being legible as *gameplay*.

---

## Requirements

**Throttle and brake**

- R1. W (or ArrowUp) applies throttle along the car's facing direction. Behavior unchanged from current arcade-control model (taper to `MAX_FORWARD_SPEED`).
- R2. S (or ArrowDown) applies brake — deceleration force opposing the car's current forward velocity. Distinct from reverse impulse.
- R3. When the car is stopped (forward speed near zero) and S has been held continuously for ~200ms, switch into reverse mode and apply reverse impulse with its own taper to `MAX_REVERSE_SPEED`. Release of S exits reverse mode immediately.
- R4. The transition from brake to reverse must not fire on momentary forward-direction taps of S at high speed (the player flicking S to scrub a little speed should not start reversing).

**Handbrake / drift**

- R5. Space (held) engages handbrake mode while pressed: lateral grip drops sharply (target: ~0.02 from baseline 0.15, ~85% reduction) and the steering angular-velocity coefficient is multiplied by ~1.5×. Releases on key-up; grip and steering return to baseline immediately on release (no recovery curve).
- R6. Handbrake mode is gated by forward speed — only takes effect when |forward speed| exceeds a small threshold (avoids triggering spin-in-place when stationary and avoids interaction with reverse).
- R7. Throttle and steering keys remain active during handbrake mode (player can still drive into and out of the slide).

**Visual feedback — skid marks**

- R8. When the car's lateral speed exceeds a configurable threshold, dark "skid mark" trail segments are emitted under the car's rear region, hugging the road surface.
- R9. Skid marks persist after emission for the duration of the current lap attempt; oldest segments may be culled when the trail reaches a budget cap (preserving newest marks).
- R10. Retry (via button or R-key) clears all currently-rendered skid marks alongside the existing car-teleport behavior.
- R11. Skid marks emit during natural drifts (lateral grip loss from hard turns) too, not only during handbrake-triggered slides. Threshold is the trigger, not handbrake state.

**Integration constraints**

- R12. None of the new behavior changes the lap state machine, trigger volumes, chase camera tuning, HUD, PB persistence, or any other plan-004 surface. Pure addition to the per-frame input/physics observer + a separate visual trail.
- R13. Behavior survives car-switching via the carousel — new car loads with no skid marks active, brake/handbrake keys behave identically across cars.

---

## Acceptance Examples

- AE1. **Covers R2, R3.** Given the car is moving forward at 12 u/s, when the player holds S, the car decelerates smoothly. The car does not reverse. When forward speed crosses ~0 and S is still held continuously for 200ms more, the car begins reversing.
- AE2. **Covers R4.** Given the car is moving forward at 15 u/s, when the player taps S for 100ms (brake scrub) and releases, the car decelerates briefly then resumes coasting. No reverse mode is entered.
- AE3. **Covers R5, R6, R7.** Given the car is moving forward at 12 u/s and the player holds D + Space, the car slides outward through the turn (visible drift), steers more sharply than D alone would produce, and continues to respond to W if the player adds throttle mid-slide.
- AE4. **Covers R6.** Given the car is stopped and the player holds Space + A, the car does NOT spin in place — handbrake mode is gated off until forward speed exceeds the activation threshold.
- AE5. **Covers R8, R11.** Given the car enters a hard turn at high speed WITHOUT pressing Space, lateral velocity briefly exceeds the threshold, and a skid trail segment is emitted under the car. The visual is identical to a handbrake-induced trail.
- AE6. **Covers R10.** Given the car has a skid trail from a previous lap attempt, when the player presses Retry (button or R), the trail disappears alongside the car teleporting back to start.

---

## Success Criteria

- A first-time visitor pressing Space in a corner immediately understands "this is the handbrake" — the visual + steering response is unambiguous within one attempt.
- Demo recording shows visibly different cornering technique on consecutive laps (e.g., one cautious lap, one drift-heavy lap with skid marks) — the difference reads on screen without commentary.
- The new behavior does not regress the existing 217-test frontend suite. Lap times remain in a reasonable range (~20-30s for the existing track) — drifts don't make the lap impossible, but also don't make it dramatically faster (the lateral velocity loss is its own cost).
- Tuning knobs (handbrake grip multiplier, steering boost, skid threshold, brake-to-reverse hold time) live as named constants at the top of the scene module so feel adjustments stay a single-line change.

---

## Scope Boundaries

- **Boost-on-release**: holding Space accumulating "drift charge" (blue → orange sparks) that releases as a speed boost. Out — that's the Mario Kart full experience, ~1 extra day for charge visual + timer + temporary speed cap raise.
- **HUD additions**: speedometer, RPM gauge, gear indicator. No gears or engine model exists; nothing meaningful to display.
- **Burnout / stationary handbrake tricks** (donuts, in-place spin). The R6 forward-speed gate explicitly disables this — choosing simpler input semantics over expressive trick range.
- **Drift-aware lap timing** (faster lap credit for drift-heavy runs). Changes lap detection rules; out of plan-004's contract.
- **Chase camera response to drift** (camera lag offset, FOV pulse during drift). Camera was tuned to a 0.04 lerp in the recent fix batch — leave alone.
- **Damage / collision feedback** (visible damage decals, recovery time, sound). Cars stay invulnerable; bouncing off barriers retains current behavior.
- **Sound effects** for handbrake activation, tire screech, brake. No audio system in `/track` today; adding one is out of plan-005 scope.
- **Reverse + handbrake interaction** is intentionally undefined (R6 gates handbrake on forward motion only). If the player reverses into a turn and holds Space, nothing happens — acceptable.

---

## Key Decisions

- **S = brake-then-reverse with 200ms hold gate**: matches racing-game convention; the gate prevents accidental gear changes on hot-corner brake taps.
- **Mario Kart-style handbrake (grip drop + steering boost)** over pure grip-killer or full-handbrake-with-speed-bleed: chose the middle option because it makes drifts *feel like a maneuver* (player actively steering into the slide) rather than "the car lost traction" — better demo readability, only slightly more LOC than pure grip-killer.
- **Skid marks** over chassis tilt or both: skid marks are the iconic drift visual every viewer recognizes; chassis tilt is subtle and might read as "the car is broken." Picked the visual that needs the least explanation.
- **No new ADR**: this is a control-feel refinement on top of the arcade-control model that landed in `ab66427`. Per CLAUDE.md's Hackathon Reality Check, it's "routine choice already covered" — log in phase-progress + the inline tunable comments, skip the ADR ceremony. (If this grows into boost-on-release or HUD-style additions later, that promotes to ADR-worthy and we'd write D-027 then.)

---

## Dependencies / Assumptions

- Builds directly on the arcade-control model in `frontend/src/track/racetrackScene.ts` (commit `ab66427`). Assumes `getLinearVelocity` / `applyImpulse` continue to work as currently wired.
- Skid mark visual: assumes Babylon's `LinesMesh` (or equivalent dynamic-extension primitive) is acceptable performance-wise at ~200-500 segments. If performance becomes an issue, fallback options (decal projection, particle trail) exist but are more LOC.
- 200ms brake-to-reverse hold threshold is a guess at the natural racing-game feel — likely needs one round of tuning in browser.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R8, R9][Technical] Best primitive for skid marks at 60fps — `LinesMesh` extension, decal projection, particle trail, or texture-baked road overlay. Plan-005 should spike whichever has the lowest per-frame cost.
- [Affects R3][Needs in-browser tuning] Exact brake-to-reverse hold threshold (200ms is a starting guess) and brake deceleration strength relative to throttle impulse. Tune during implementation.
- [Affects R8][Needs in-browser tuning] Lateral-speed threshold at which skid marks start emitting. Should match "the car is visibly sliding" perception, not "any non-zero lateral velocity."
