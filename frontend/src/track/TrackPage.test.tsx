import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Phase 3 U6 + Plan-004 U4 — TrackPage shell tests. Mock everything
// Babylon-shaped so the tests stay in jsdom: useOwnedVariants returns plain
// JS arrays; createRacetrackScene is a vi.fn returning fake handles.
// Real-engine behaviour is exercised in racetrackScene.test.ts via
// module-boundary Babylon mocks.
//
// U4 helpers: `installLiveScene()` lets tests grab the captured
// onLapStateChange callback and drive lap-state transitions manually.

import type { LapState } from './lapState';

const useCurrentAccountMock = vi.fn();
vi.mock('@mysten/dapp-kit', () => ({
  useCurrentAccount: () => useCurrentAccountMock(),
}));

const useOwnedVariantsMock = vi.fn();
vi.mock('./useOwnedVariants', () => ({
  useOwnedVariants: (addr: string | undefined) => useOwnedVariantsMock(addr),
}));

const createSceneMock = vi.fn();
vi.mock('./racetrackScene', () => ({
  createRacetrackScene: (opts: unknown) => createSceneMock(opts),
}));

import { TrackPage } from './TrackPage';

function variant(overrides: Partial<{ objectId: string; patchId: string; blobId: string; name: string; shapeType: string }> = {}) {
  return {
    objectId: overrides.objectId ?? '0xv1',
    blobId: overrides.blobId ?? 'blob-1',
    collectionId: '0xcoll',
    patchId: overrides.patchId ?? 'patch-1',
    creator: '0xcreator',
    shapeType: overrides.shapeType ?? 'car',
    paramsJson: '{}',
    name: overrides.name ?? 'My Car',
    directAccessPrice: '100000000',
    tags: [],
    createdAtMs: '0',
    lineageBlobId: '',
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/track']}>
      <TrackPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useCurrentAccountMock.mockReset();
  useOwnedVariantsMock.mockReset();
  createSceneMock.mockReset();
  localStorage.clear();
  // Default: a connected wallet so the variants branches are reachable.
  useCurrentAccountMock.mockReturnValue({ address: '0xWALLET' });
  // Default scene mock — never resolves so the loading overlay sticks. Each
  // test that cares about the post-load state overrides this.
  createSceneMock.mockReturnValue(new Promise(() => undefined));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

/**
 * U4 — set up a scene mock that resolves immediately with fake handles and
 * captures the `onLapStateChange` callback so tests can simulate the lap
 * machine transitioning. Also returns a reset spy for retry-flow assertions.
 */
function installLiveScene() {
  const captured: { onLapStateChange?: (s: LapState) => void } = {};
  const resetSpy = vi.fn();
  const disposeSpy = vi.fn();
  createSceneMock.mockImplementation(async (opts: { onLapStateChange?: (s: LapState) => void }) => {
    captured.onLapStateChange = opts.onLapStateChange;
    return { engine: {}, scene: {}, reset: resetSpy, dispose: disposeSpy };
  });
  // Also wire fetch — the page tries to download the GLB before constructing
  // the scene. Return an empty ArrayBuffer so it just succeeds.
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
      }),
    ),
  );
  return { captured, resetSpy, disposeSpy };
}

describe('TrackPage', () => {
  it('shows sign-in prompt when no wallet is connected', () => {
    useCurrentAccountMock.mockReturnValue(null);
    useOwnedVariantsMock.mockReturnValue({
      variants: [],
      loading: false,
      error: null,
    });
    renderPage();
    expect(screen.getByTestId('track-needs-signin')).toBeTruthy();
  });

  it('shows the "buy first" empty state with zero owned variants', () => {
    useOwnedVariantsMock.mockReturnValue({
      variants: [],
      loading: false,
      error: null,
    });
    renderPage();
    expect(screen.getByTestId('track-empty')).toBeTruthy();
    const link = screen.getByTestId('track-empty-browse') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/');
  });

  it('renders the carousel + canvas when variants exist', () => {
    useOwnedVariantsMock.mockReturnValue({
      variants: [variant({ objectId: '0xa', name: 'Red Car' })],
      loading: false,
      error: null,
    });
    // fetch returns a never-resolving promise so we stay in the in-flight
    // state — that's all this test cares about (shell wiring).
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
    renderPage();
    expect(screen.getByTestId('track-canvas')).toBeTruthy();
    expect(screen.getByTestId('car-carousel')).toBeTruthy();
    expect(screen.getByTestId('carousel-tile-0')).toBeTruthy();
  });

  it('shows the "Loading variant…" overlay during the Walrus fetch (D-004)', async () => {
    useOwnedVariantsMock.mockReturnValue({
      variants: [variant()],
      loading: false,
      error: null,
    });
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
    renderPage();
    // Overlay should be visible while fetch is pending.
    expect(await screen.findByTestId('track-scene-loading')).toBeTruthy();
  });

  it('shows the variants-loading state', () => {
    useOwnedVariantsMock.mockReturnValue({
      variants: [],
      loading: true,
      error: null,
    });
    renderPage();
    expect(screen.getByTestId('track-loading-variants')).toBeTruthy();
  });

  it('shows the variants-error state', () => {
    useOwnedVariantsMock.mockReturnValue({
      variants: [],
      loading: false,
      error: new Error('boom'),
    });
    renderPage();
    expect(screen.getByTestId('track-variants-error').textContent).toMatch(
      /boom/,
    );
  });

  it('clicking a carousel tile updates the selected index', () => {
    useOwnedVariantsMock.mockReturnValue({
      variants: [
        variant({ objectId: '0xa', name: 'Red' }),
        variant({ objectId: '0xb', name: 'Blue' }),
      ],
      loading: false,
      error: null,
    });
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
    renderPage();
    const tile1 = screen.getByTestId('carousel-tile-1');
    expect(tile1.getAttribute('data-selected')).toBe('false');
    fireEvent.click(tile1);
    expect(
      (screen.getByTestId('carousel-tile-1') as HTMLElement).getAttribute(
        'data-selected',
      ),
    ).toBe('true');
  });

  // ─── U4: HUD overlay + PB persistence + result modal + retry ───

  it('U4 — HUD shows lap timer and best PB (— when no PB stored)', async () => {
    useOwnedVariantsMock.mockReturnValue({
      variants: [variant({ objectId: '0xa' })],
      loading: false,
      error: null,
    });
    installLiveScene();
    renderPage();
    const hudLap = await screen.findByTestId('track-hud-lap');
    const hudBest = await screen.findByTestId('track-hud-best');
    expect(hudLap.textContent).toMatch(/Lap: 0\.00s/);
    expect(hudBest.textContent).toMatch(/Best: —/);
  });

  it('U4 — HUD pulls existing PB from localStorage on car-load', async () => {
    useOwnedVariantsMock.mockReturnValue({
      variants: [variant({ objectId: '0xa' })],
      loading: false,
      error: null,
    });
    // Pre-seed a stored PB for this car.
    localStorage.setItem('track-pb:0xa', '24310');
    installLiveScene();
    renderPage();
    const hudBest = await screen.findByTestId('track-hud-best');
    expect(hudBest.textContent).toMatch(/24\.31s/);
  });

  it('U4 — finishing a lap renders the ResultOverlay with the lap time', async () => {
    useOwnedVariantsMock.mockReturnValue({
      variants: [variant({ objectId: '0xa' })],
      loading: false,
      error: null,
    });
    const { captured } = installLiveScene();
    renderPage();
    // Wait for the scene to mount + capture the callback.
    await waitFor(() => expect(captured.onLapStateChange).toBeDefined());
    act(() => {
      captured.onLapStateChange!({
        status: 'finished',
        startedAtMs: 1000,
        currentLapMs: 24310,
        finishedLapMs: 24310,
        checkpointHit: true,
      });
    });
    const overlay = await screen.findByTestId('track-result-overlay');
    expect(overlay).toBeTruthy();
    expect(screen.getByTestId('track-result-time').textContent).toMatch(/24\.31s/);
    // New PB on the first lap.
    expect(screen.getByTestId('track-result-delta').textContent).toMatch(/NEW PB/);
    // PB written to storage.
    expect(localStorage.getItem('track-pb:0xa')).toBe('24310');
  });

  it('U4/AE5 — Retry button calls scene.reset() and clears the overlay', async () => {
    useOwnedVariantsMock.mockReturnValue({
      variants: [variant({ objectId: '0xa' })],
      loading: false,
      error: null,
    });
    const { captured, resetSpy } = installLiveScene();
    renderPage();
    await waitFor(() => expect(captured.onLapStateChange).toBeDefined());
    act(() => {
      captured.onLapStateChange!({
        status: 'finished',
        startedAtMs: 0,
        currentLapMs: 20000,
        finishedLapMs: 20000,
        checkpointHit: true,
      });
    });
    await screen.findByTestId('track-result-overlay');

    fireEvent.click(screen.getByTestId('track-retry-button'));
    expect(resetSpy).toHaveBeenCalledTimes(1);

    // After scene.reset() the real scene would emit waiting state — simulate
    // that emission to confirm the overlay clears.
    act(() => {
      captured.onLapStateChange!({
        status: 'waiting',
        startedAtMs: null,
        currentLapMs: 0,
        finishedLapMs: null,
        checkpointHit: false,
      });
    });
    expect(screen.queryByTestId('track-result-overlay')).toBeNull();
  });

  it('U4/R13 — pressing R while finished triggers retry equivalently', async () => {
    useOwnedVariantsMock.mockReturnValue({
      variants: [variant({ objectId: '0xa' })],
      loading: false,
      error: null,
    });
    const { captured, resetSpy } = installLiveScene();
    renderPage();
    await waitFor(() => expect(captured.onLapStateChange).toBeDefined());
    act(() => {
      captured.onLapStateChange!({
        status: 'finished',
        startedAtMs: 0,
        currentLapMs: 20000,
        finishedLapMs: 20000,
        checkpointHit: true,
      });
    });

    fireEvent.keyDown(window, { key: 'r' });
    expect(resetSpy).toHaveBeenCalledTimes(1);
  });

  it('U4 — improving on a stored PB writes the new value to localStorage', async () => {
    useOwnedVariantsMock.mockReturnValue({
      variants: [variant({ objectId: '0xa' })],
      loading: false,
      error: null,
    });
    localStorage.setItem('track-pb:0xa', '25100');
    const { captured } = installLiveScene();
    renderPage();
    await waitFor(() => expect(captured.onLapStateChange).toBeDefined());
    act(() => {
      captured.onLapStateChange!({
        status: 'finished',
        startedAtMs: 0,
        currentLapMs: 23420,
        finishedLapMs: 23420,
        checkpointHit: true,
      });
    });
    await screen.findByTestId('track-result-overlay');
    // Improved from 25100 → 23420, so storage updates.
    expect(localStorage.getItem('track-pb:0xa')).toBe('23420');
    expect(screen.getByTestId('track-result-delta').textContent).toMatch(/NEW PB/);
  });

  // ─── U5: carousel switching teardown (per-car PB isolation, R14/AE6) ───

  it('U5/AE6 — switching to another car clears the overlay and reloads its PB', async () => {
    useOwnedVariantsMock.mockReturnValue({
      variants: [
        variant({ objectId: '0xA', name: 'Red' }),
        variant({ objectId: '0xB', name: 'Blue' }),
      ],
      loading: false,
      error: null,
    });
    // Car A starts with no PB; car B has a stored PB.
    localStorage.setItem('track-pb:0xB', '22500');
    const { captured } = installLiveScene();
    renderPage();
    await waitFor(() => expect(captured.onLapStateChange).toBeDefined());

    // Drive a lap on car A so the result modal is on screen with car A's
    // freshly-written PB.
    act(() => {
      captured.onLapStateChange!({
        status: 'finished',
        startedAtMs: 0,
        currentLapMs: 24000,
        finishedLapMs: 24000,
        checkpointHit: true,
      });
    });
    expect(screen.queryByTestId('track-result-overlay')).toBeTruthy();
    expect(screen.getByTestId('track-hud-best').textContent).toMatch(/24\.00s/);
    expect(localStorage.getItem('track-pb:0xA')).toBe('24000');

    // Switch to car B via the carousel. The selected-effect must reset lap
    // state, clear lastResult, and re-read PB for the new car.
    fireEvent.click(screen.getByTestId('carousel-tile-1'));

    expect(screen.queryByTestId('track-result-overlay')).toBeNull();
    expect(screen.getByTestId('track-hud-best').textContent).toMatch(/22\.50s/);
    expect(screen.getByTestId('track-hud-lap').textContent).toMatch(/Lap: 0\.00s/);
  });

  it('U5/AE6 — after switching cars, the next lap-finish writes under the new car\'s storage key', async () => {
    useOwnedVariantsMock.mockReturnValue({
      variants: [
        variant({ objectId: '0xA' }),
        variant({ objectId: '0xB' }),
      ],
      loading: false,
      error: null,
    });
    const { captured } = installLiveScene();
    renderPage();
    await waitFor(() => expect(captured.onLapStateChange).toBeDefined());

    // Switch to car B before any lap is driven on car A.
    fireEvent.click(screen.getByTestId('carousel-tile-1'));
    // Scene rebuilds for the new car — wait for the new callback capture.
    await waitFor(() =>
      expect(createSceneMock.mock.calls.length).toBeGreaterThanOrEqual(2),
    );

    // Drive a lap on car B (simulated via the most recently captured callback).
    act(() => {
      captured.onLapStateChange!({
        status: 'finished',
        startedAtMs: 0,
        currentLapMs: 21000,
        finishedLapMs: 21000,
        checkpointHit: true,
      });
    });
    // PB written under car B's key only; car A's slot stays empty.
    expect(localStorage.getItem('track-pb:0xB')).toBe('21000');
    expect(localStorage.getItem('track-pb:0xA')).toBeNull();
  });

  it('U4 — slower than stored PB shows positive delta and keeps the old PB in storage', async () => {
    useOwnedVariantsMock.mockReturnValue({
      variants: [variant({ objectId: '0xa' })],
      loading: false,
      error: null,
    });
    localStorage.setItem('track-pb:0xa', '25100');
    const { captured } = installLiveScene();
    renderPage();
    await waitFor(() => expect(captured.onLapStateChange).toBeDefined());
    act(() => {
      captured.onLapStateChange!({
        status: 'finished',
        startedAtMs: 0,
        currentLapMs: 26500,
        finishedLapMs: 26500,
        checkpointHit: true,
      });
    });
    await screen.findByTestId('track-result-overlay');
    // Regression: storage stays at the old (better) PB.
    expect(localStorage.getItem('track-pb:0xa')).toBe('25100');
    expect(screen.getByTestId('track-result-delta').textContent).toMatch(/\+1\.40s/);
  });
});
