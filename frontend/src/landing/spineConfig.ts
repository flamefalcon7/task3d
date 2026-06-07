import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// Landing cinematic scroll spine — shared config + plugin registration (D-098).
//
// SPINE_FLAG_ENABLED is a build-time kill-switch mirroring VITE_LANDING_LIVE_WELLS
// (see frontend/src/babylon/LiveWell.tsx): the spine is ON unless
// VITE_LANDING_SCROLL_SPINE is exactly '0'. When '0', every spine surface
// (smooth scroll, reveals, stage indicator, hero farewell move) becomes a no-op
// and the landing renders as a plain native-scroll page with the wells untouched.
//
// gsap + lenis are imported statically (both ship `sideEffects: false`) and gated
// at runtime rather than tree-shaken out: they ride the landing chunk, which
// already loads Babylon, so the marginal weight is negligible and the lifecycle
// stays synchronous and StrictMode-safe (no dynamic-import race in the effects).
export const SPINE_FLAG_ENABLED =
  (import.meta.env.VITE_LANDING_SCROLL_SPINE as string | undefined) !== '0';

let registered = false;

// Idempotent ScrollTrigger registration — safe to call from every spine surface's
// effect; gsap.registerPlugin is itself idempotent, the guard just avoids repeat
// calls. Imports follow the repo's deep-path convention (cf. @babylonjs/materials/*).
export function registerScrollTrigger(): void {
  if (registered) return;
  gsap.registerPlugin(ScrollTrigger);
  registered = true;
}

// Test-only: reset the idempotency latch between test cases.
export function __resetScrollTriggerRegistrationForTest(): void {
  registered = false;
}

// Read-once reduced-motion check, shared by every spine surface. Mirrors the
// helper shape in TypewriterPrompt.tsx (read at render, not reactive to a
// mid-session toggle — consistent with the rest of the landing).
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
