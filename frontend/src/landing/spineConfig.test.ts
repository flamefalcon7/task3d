import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock gsap + ScrollTrigger so registration touches no real plugin system.
const { registerPlugin } = vi.hoisted(() => ({ registerPlugin: vi.fn() }));
vi.mock('gsap', () => ({ default: { registerPlugin } }));
vi.mock('gsap/ScrollTrigger', () => ({ ScrollTrigger: { name: 'ScrollTrigger' } }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  registerPlugin.mockClear();
});

describe('SPINE_FLAG_ENABLED', () => {
  it('is true when VITE_LANDING_SCROLL_SPINE is unset', async () => {
    vi.resetModules();
    const mod = await import('./spineConfig');
    expect(mod.SPINE_FLAG_ENABLED).toBe(true);
  });

  it('is true for any value other than "0"', async () => {
    vi.stubEnv('VITE_LANDING_SCROLL_SPINE', '1');
    vi.resetModules();
    const mod = await import('./spineConfig');
    expect(mod.SPINE_FLAG_ENABLED).toBe(true);
  });

  it('is false when VITE_LANDING_SCROLL_SPINE is exactly "0"', async () => {
    vi.stubEnv('VITE_LANDING_SCROLL_SPINE', '0');
    vi.resetModules();
    const mod = await import('./spineConfig');
    expect(mod.SPINE_FLAG_ENABLED).toBe(false);
  });
});

describe('registerScrollTrigger', () => {
  it('registers ScrollTrigger exactly once across repeated calls', async () => {
    vi.resetModules();
    const mod = await import('./spineConfig');
    mod.registerScrollTrigger();
    mod.registerScrollTrigger();
    mod.registerScrollTrigger();
    expect(registerPlugin).toHaveBeenCalledTimes(1);
  });
});
