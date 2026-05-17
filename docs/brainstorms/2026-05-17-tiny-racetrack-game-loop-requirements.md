---
date: 2026-05-17
topic: tiny-racetrack-game-loop
---

# Tiny Racetrack — 1-Lap Time Trial Game Loop

## Summary

Turn `/track` from a tech-demo physics sandbox into a playable 1-lap time-trial: drive your owned car around a tight oval, see your lap time, beat your localStorage personal best, retry. Fixes the current car-spinning bug as a prerequisite. No AI, no audio, no multi-lap.

---

## Problem Frame

`/track` is the final segment of the demo arc — the buyer-side payoff that proves a minted Model3D is actually consumable as game content, not just a JPEG. Phase 3 U6 shipped the minimum-viable scaffolding per OQ-D5: Babylon scene boots, Havok physics enabled, WASD attached, chase camera tracks a car. The scope was deliberately locked to "no opponents, no timer, no SFX, no wheel spin" to keep the unit at ~3 days.

Two failures of that scope are now visible:

1. The current car physics has a bug — the loaded car spins in place rather than driving. Most likely the `meshes[0]` reference picks up a transform-node root with a degenerate bounding box, and steering directly rotates the mesh transform while Havok keeps its own angular momentum, so the body spins out of control.
2. Even if the spin were fixed, the user-facing scene has no goal, no feedback loop, and no replayable moment. A demo viewer watches the car drive in a square for 30 seconds and learns nothing about what makes the asset valuable.

Both problems land in the same neighborhood of code (`frontend/src/track/racetrackScene.ts`) and a single unit can fix the physics and add the game loop together — the alternative is shipping a bug fix that no one notices because the scene still feels empty.

---

## Requirements

**Car physics correctness (prerequisite)**
- R1. Steering inputs (A/D, ArrowLeft/ArrowRight) rotate the car body via the Havok physics API rather than mutating the mesh transform directly, so the body's angular velocity and the rendered orientation stay aligned.
- R2. The car's physics impostor is bound to the actual car geometry — not to a degenerate root transform — so the box collider matches the visible mesh footprint.
- R3. The car is intuitively driveable with WASD: pressing W moves the car forward along its current facing, A/D steer left/right, S brakes/reverses. Holding W+A produces a forward-left turn.

**Track**
- R4. The track is a procedurally generated tight oval (rounded-rectangle outer wall + inner wall) sized so a competent driver completes one lap in 20–30 seconds at the existing impulse tuning. Outer + inner walls are static physics bodies the car bounces off.
- R5. A start/finish line is visually distinct (e.g. checkered band on the ground) and positioned so the car spawns on it facing forward into the first straight.
- R6. The driveable surface is bounded — the car cannot drive off the world or fall through the ground at any reachable position.

**Lap detection + timing**
- R7. The game enters a `running` state automatically when the player first applies throttle (first W/ArrowUp keypress after scene load). The lap timer starts at that moment, not at scene load.
- R8. The game detects a completed lap when the car crosses the start/finish line in the forward direction after having travelled around the track (must touch the far end of the loop at least once to count — prevents reverse-crossing exploits).
- R9. Lap timer ticks at sub-second precision and displays as `MM:SS.cc` or `SS.cc` in a HUD overlay during the run.
- R10. The personal best lap time persists in `localStorage`, keyed by the car's Sui object ID — different cars track separate PBs. Best time is shown in the HUD alongside the live timer.

**End-of-lap UX**
- R11. When a lap completes, the car is brought to a stop (zero linear + angular velocity), the timer freezes, and a result overlay appears showing: lap time, previous best (or "—" if none), and a PB delta (`-2.3s` if improved, `+1.1s` if worse, `NEW PB!` if first run).
- R12. The result overlay has a Retry button that resets the car to the start line, zeroes the timer, and returns the game to the pre-throttle wait state (R7). Retry does not reload the page or re-fetch the GLB.
- R13. Pressing R (keyboard) is equivalent to clicking Retry — accessible mid-run as well as on the result overlay.

**Carousel / variant switching**
- R14. Switching to a different car via the existing car carousel disposes the current run state — timer cleared, no result overlay leaks across cars. The newly-loaded car shows its own PB (or "—") from localStorage.

---

## Acceptance Examples

- AE1. **Covers R7, R8, R9.** Given the scene has loaded and the car is stationary on the start line, when the player presses W for the first time, the lap timer starts counting up from 00.00. When the car later crosses the start/finish line in the forward direction after passing the far end of the oval, the timer freezes and shows the final lap time.
- AE2. **Covers R10, R11.** Given the player has no prior PB for this car, when they complete a lap in 24.31s, the result overlay shows "Lap: 24.31s · Best: 24.31s · NEW PB!" and localStorage records `24.31` keyed by the car's object ID.
- AE3. **Covers R11.** Given the player has a prior PB of 25.10s, when they complete a lap in 23.42s, the result overlay shows "Lap: 23.42s · Best: 23.42s · -1.68s" and localStorage updates to `23.42`. If instead they complete in 26.50s, the overlay shows "Lap: 26.50s · Best: 25.10s · +1.40s" and localStorage is unchanged.
- AE4. **Covers R8.** Given the player drives backward across the start/finish line without first traversing the loop, no lap is registered and the timer keeps running.
- AE5. **Covers R12, R13.** Given the result overlay is visible, when the player clicks Retry OR presses R, the car teleports to the start line, the timer resets to 00.00, the overlay disappears, and the game waits for the next throttle press to start timing again.
- AE6. **Covers R14.** Given the player completes a lap on car A (PB recorded), when they open the carousel and select car B, the new scene shows car B with car B's PB ("—" if none), and the previous result overlay from car A is gone.

---

## Success Criteria

- A first-time visitor with no instructions can load `/track`, drive the car around the oval, complete a lap, and improve their time on a second attempt — without reading documentation or asking what to do.
- The 30-second `/track` segment of the demo recording shows a complete game arc (drive → lap → result → improved retry) without any spinning, getting stuck, or visible bugs.
- The car-spinning bug from U6 is provably gone — driving forward goes forward, steering rotates predictably, and the body doesn't accumulate runaway angular velocity.
- A planner reading this brainstorm doc has enough to write a `/ce-plan` output without having to invent gameplay shape, win condition, HUD layout decisions, or the lap-detection rule.

---

## Scope Boundaries

- AI opponents, ghost cars, multi-car physics
- Audio / SFX / music — matches OQ-D5 lock from plan-003
- Wheel spin animation, brake lights, suspension visuals
- Multi-lap races (1 lap only)
- Particle effects (dust, skid marks, exhaust, sparks on wall contact)
- On-chain time persistence or leaderboards (could be v1.1 — currently SP-local only)
- Per-car or per-collection track variants / themes
- Mobile touch controls or gamepad support
- Photo mode, replay export, video capture
- Camera switcher (cockpit / top-down / cinematic) — chase cam stays
- Server-side time validation / anti-cheat — local SP, doesn't matter
- Difficulty selection, lap-time targets, tutorial overlay
- Penalties for hitting walls (collision is its own punishment via lost momentum)

---

## Key Decisions

- **Time trial over AI / ghost / multi-lap.** Smallest scope that delivers a real game moment. AI pathfinding + second physics body would burn ~1.5 days into the Phase 4 Kiosk budget for ambiguous demo gain. Ghost-car recording adds a serialization layer with marginal upside for a 30-sec demo segment.
- **Tight oval ~20–30s lap over figure-8 / hand-designed track.** Procedural rounded-rectangle is the cheapest shape that still reads as a real track. Figure-8 needs overpass geometry + two-segment lap detection (+1.5 days). Hand-designed needs authoring time + collision tuning (+2–3 days). Lap length fits the 30-sec demo segment with headroom for retry.
- **Result overlay + Retry button (vs auto-continue or freeze-and-countdown).** The demo recording needs the camera to hold on the result long enough to read. Auto-continue trades that beat for "arcade feel" we don't need. Countdown-restart matches kiosk demos but adds time pressure for no purpose.
- **PB keyed by car objectId, not collection or wallet.** Each minted car is its own piece of content; tying the time to it makes the affordance composable (mint a new variant → race for its first PB). Wallet-keyed would make swapping cars uninteresting.
- **localStorage over on-chain.** SP-local time tracking. On-chain persistence would need a Move entry + signed tx per lap, dwarfing the value proposition and clouding the Walrus track framing. v1.1 could explore on-chain leaderboards as a separate feature.
- **Bundle the physics-spin fix into this unit, not a standalone bug PR.** Both fixes touch `racetrackScene.ts` and the spinning bug blocks playtesting any game-loop changes. Splitting would create test-order dependency between a "fix" PR that has nothing to verify it works and a "feature" PR that depends on the fix landing first.

---

## Dependencies / Assumptions

- Babylon GUI (`@babylonjs/gui`) is the expected HUD layer. Not currently a dependency in `frontend/package.json` — planner should confirm whether to add it or build the HUD as a React overlay outside the Babylon canvas. (No verified-against-codebase: assumption.)
- Havok already provides trigger volumes (collision events without solid response) for lap detection. If it doesn't, fall back to a manual intersection check against the start/finish line plane on each frame.
- The existing chase camera (ArcRotateCamera tracking `car.position`) is acceptable — no camera shape change in scope.
- The current car carousel + variant switching wiring in `TrackPage.tsx` is reusable; this unit doesn't touch GLB loading or `useOwnedVariants`.
- Players have a keyboard (WASD + R). No touch / gamepad support means the experience is desktop-only — acceptable per the demo target audience (hackathon judges using laptops).

---

## Outstanding Questions

### Resolve Before Planning

- None.

### Deferred to Planning

- [Affects R7, R8][Technical] Best mechanism for lap detection — Havok trigger volume vs per-frame plane intersection vs raycast. Planner should pick based on `@babylonjs/havok@1.3.12` API availability.
- [Affects R9, R10, R11][Technical] HUD implementation — Babylon GUI (in-canvas) vs React overlay div (outside canvas). React overlay is cheaper if Babylon GUI isn't already a dep.
- [Affects R4, R5][Technical] Procedural track mesh generation — extruded curve along oval path vs CSG'd flat ground with cutouts vs separate inner/outer wall boxes. Planner picks based on collision quality + perf.
- [Affects R1, R2][Needs verification] Which mesh in the loaded GLB tree carries the actual geometry vs is the root transform node. Planner should inspect a sample GLB (e.g. `frontend/public/dev-glbs/p1.glb`) and use `meshes.find(m => m.getTotalVertices() > 0)` or similar before binding the PhysicsAggregate.
- [Affects R8][Technical] How to enforce "must traverse the loop" — checkpoint trigger at the far end vs distance-from-start threshold vs direction-of-travel check at the line. Planner picks based on Havok trigger ergonomics.
