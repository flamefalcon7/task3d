import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, StrictMode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  BOUND_COLLECTION_ID,
  DEFAULT_CAR_TOKEN_ID,
} from './rageRacing/brand';

// Phase 3 U6 + Plan-004 U4 + U11 — TrackPage shell tests. Mock everything
// Babylon-shaped so the tests stay in jsdom: useOwnedTokens/useTokenById return
// plain JS; createRacetrackScene is a vi.fn returning fake handles.
// Real-engine behaviour is exercised in racetrackScene.test.ts via
// module-boundary Babylon mocks.
//
// U4 helpers: `installLiveScene()` lets tests grab the captured
// onLapStateChange callback and drive lap-state transitions manually.

import type { LapState } from './lapState';
import { WALRUS_AGGREGATOR } from '../walrus/aggregator';

const useCurrentAccountMock = vi.fn();
vi.mock('@mysten/dapp-kit', () => ({
  useCurrentAccount: () => useCurrentAccountMock(),
}));

const useOwnedTokensMock = vi.fn();
const useTokenByIdMock = vi.fn();
vi.mock('./useOwnedTokens', () => ({
  useOwnedTokens: (addr: string | undefined) => useOwnedTokensMock(addr),
  useTokenById: (id: string | undefined) => useTokenByIdMock(id),
}));

const createSceneMock = vi.fn();
vi.mock('./racetrackScene', () => ({
  createRacetrackScene: (opts: unknown) => createSceneMock(opts),
}));

// SignInButton pulls dapp-kit wallet hooks this suite's '@mysten/dapp-kit'
// mock doesn't provide; stub it — the connect affordance itself is covered by
// SignInButton's own tests, here we only assert it's present on the gate.
vi.mock('../auth/SignInButton', () => ({
  SignInButton: () => <div data-testid="signin-button-mock" />,
}));

import { TrackPage } from './TrackPage';

function token(
  overrides: Partial<{
    objectId: string;
    tokenId: string;
    patchId: string;
    blobId: string;
    name: string;
    collectionId: string;
  }> = {},
) {
  return {
    tokenId: overrides.tokenId ?? overrides.objectId ?? '0xv1',
    name: overrides.name ?? 'My Car',
    patchId: overrides.patchId ?? 'patch-1',
    // Plan-2026-06-18-002 U3 — owned tokens are now filtered to the bound
    // collection, so the factory default must match it or the car would be
    // filtered out of the carousel.
    collectionId: overrides.collectionId ?? BOUND_COLLECTION_ID,
    baseModelId: '0xbase',
    blobId: overrides.blobId ?? '',
  };
}

function renderPage(path = '/track') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TrackPage />
    </MemoryRouter>,
  );
}

// Plan-2026-06-18-002 — selecting the NFT car: with the default car always at
// index 0, the first owned NFT is tile-1. Helper centralizes that offset so the
// tests read intent ("drive the NFT") not arithmetic.
function selectFirstNft() {
  fireEvent.click(screen.getByTestId('carousel-tile-1'));
}

beforeEach(() => {
  useCurrentAccountMock.mockReset();
  useOwnedTokensMock.mockReset();
  useTokenByIdMock.mockReset();
  createSceneMock.mockReset();
  localStorage.clear();
  // Default: a connected wallet so the carousel branches are reachable.
  useCurrentAccountMock.mockReturnValue({ address: '0xWALLET' });
  // Default override hook: no ?model= token resolved (carousel mode).
  useTokenByIdMock.mockReturnValue({ token: null, loading: false, error: null });
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
  const captured: {
    onLapStateChange?: (s: LapState) => void;
    onOrbitComplete?: () => void;
    onIntroSkipRequested?: () => void;
  } = {};
  const resetSpy = vi.fn();
  const disposeSpy = vi.fn();
  const dispatchIntroCompleteSpy = vi.fn();
  const dispatchIntroSkipSpy = vi.fn();
  createSceneMock.mockImplementation(
    async (opts: {
      onLapStateChange?: (s: LapState) => void;
      onOrbitComplete?: () => void;
      onIntroSkipRequested?: () => void;
    }) => {
      captured.onLapStateChange = opts.onLapStateChange;
      captured.onOrbitComplete = opts.onOrbitComplete;
      captured.onIntroSkipRequested = opts.onIntroSkipRequested;
      return {
        engine: {},
        scene: {},
        reset: resetSpy,
        dispose: disposeSpy,
        dispatchIntroComplete: dispatchIntroCompleteSpy,
        dispatchIntroSkip: dispatchIntroSkipSpy,
      };
    },
  );
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
  return {
    captured,
    resetSpy,
    disposeSpy,
    dispatchIntroCompleteSpy,
    dispatchIntroSkipSpy,
  };
}

describe('TrackPage', () => {
  // Plan-2026-06-18-002 U4 — free-to-play flip: no wallet no longer dead-ends.
  it('no wallet: drives the default car + shows connect & buy-collection CTAs (no sign-in gate)', () => {
    useCurrentAccountMock.mockReturnValue(null);
    useOwnedTokensMock.mockReturnValue({
      tokens: [],
      loading: false,
      error: null,
    });
    renderPage();
    // The game renders (default car), NOT the old own-or-die sign-in dead-end.
    expect(screen.queryByTestId('track-needs-signin')).toBeNull();
    expect(screen.getByTestId('track-page')).toBeTruthy();
    expect(screen.getByTestId('track-canvas')).toBeTruthy();
    // Connect affordance + buy-collection CTA both present for the no-wallet visitor.
    expect(screen.getByTestId('track-connect')).toBeTruthy();
    expect(screen.getByTestId('track-buy-cta')).toBeTruthy();
  });

  // Plan-2026-06-18-002 U4/R5 — connected but owns no bound-collection NFT.
  it('connected non-owner: default car playable + buy-collection CTA to the collection page', () => {
    useOwnedTokensMock.mockReturnValue({
      tokens: [],
      loading: false,
      error: null,
    });
    const { container } = renderPage();
    expect(screen.queryByTestId('track-empty')).toBeNull();
    expect(screen.getByTestId('track-page')).toBeTruthy();
    const cta = screen.getByTestId('track-buy-cta');
    expect(cta.getAttribute('href')).toBe(`/collection/${BOUND_COLLECTION_ID}`);
    // No /browse or /launch nav-dump; the only inward route is the collection CTA.
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    );
    expect(hrefs).not.toContain('/browse');
    expect(hrefs).not.toContain('/launch');
  });

  // Plan-2026-06-18-002 U3 — owning a bound-collection NFT adds it to the picker.
  it('owner: NFT car appears as a tile and the buy CTA is gone', () => {
    useOwnedTokensMock.mockReturnValue({
      tokens: [token({ objectId: '0xnft', name: 'My NFT Car' })],
      loading: false,
      error: null,
    });
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
    renderPage();
    // [default, NFT] → default at 0, NFT at 1.
    expect(screen.getByTestId('carousel-tile-0')).toBeTruthy();
    expect(screen.getByTestId('carousel-tile-1')).toBeTruthy();
    expect(screen.queryByTestId('track-buy-cta')).toBeNull();
  });

  // Plan-2026-06-18-002 U3/R3 — tokens from other collections are filtered out.
  it('filters out NFTs that are not from the bound collection', () => {
    useOwnedTokensMock.mockReturnValue({
      tokens: [token({ objectId: '0xother', collectionId: '0xsomeothercoll' })],
      loading: false,
      error: null,
    });
    renderPage();
    // Only the default car remains → no NFT tile, and the buy CTA shows.
    expect(screen.getByTestId('carousel-tile-0')).toBeTruthy();
    expect(screen.queryByTestId('carousel-tile-1')).toBeNull();
    expect(screen.getByTestId('track-buy-cta')).toBeTruthy();
  });

  it('AE1 — renders the Rage Racing wordmark, not the Tusk3D track header', () => {
    useOwnedTokensMock.mockReturnValue({
      tokens: [],
      loading: false,
      error: null,
    });
    renderPage();
    expect(screen.getByText('RAGE RACING')).toBeTruthy();
    expect(screen.queryByText('Tiny Racetrack.')).toBeNull();
    expect(screen.queryByText(/L3 \/ DRIVE/)).toBeNull();
  });

  it('AE2 — shows a Sui + Walrus provenance caption for a selected NFT car', () => {
    useOwnedTokensMock.mockReturnValue({
      tokens: [token({ objectId: '0xa', blobId: 'blob-abcdef123456' })],
      loading: false,
      error: null,
    });
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
    renderPage();
    // Default car is selected first; switch to the NFT to see its proof line.
    selectFirstNft();
    const prov = screen.getByTestId('track-provenance');
    expect(prov.textContent).toMatch(/Sui \+ Walrus/);
    // Assert the REAL truncated ids render (not just the static label) — this
    // fails if truncateId regresses or the template stops interpolating.
    expect(prov.textContent).toMatch(/blob blob-a…3456/); // truncateId('blob-abcdef123456')
    expect(prov.textContent).toMatch(/collection 0xa194…1242/); // truncateId(BOUND_COLLECTION_ID)
  });

  // Plan-2026-06-18-002 U4/R6 — the default car shows an identity-only caption.
  it('default car: provenance caption is identity-only, no fabricated ids', () => {
    useOwnedTokensMock.mockReturnValue({ tokens: [], loading: false, error: null });
    renderPage();
    const prov = screen.getByTestId('track-provenance');
    expect(prov.textContent).toMatch(/Default car · not an NFT/);
    expect(prov.textContent).not.toMatch(/Sui \+ Walrus/);
  });

  it('renders the carousel + canvas when variants exist', () => {
    useOwnedTokensMock.mockReturnValue({
      tokens: [token({ objectId: '0xa', name: 'Red Car' })],
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
    // Demo-critical path also wears the Rage Racing identity (AE1).
    expect(screen.getByText('RAGE RACING')).toBeTruthy();
  });

  it('shows the "Loading variant…" overlay during the Walrus fetch (D-004)', async () => {
    useOwnedTokensMock.mockReturnValue({
      tokens: [token()],
      loading: false,
      error: null,
    });
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
    renderPage();
    // Overlay should be visible while fetch is pending.
    expect(await screen.findByTestId('track-scene-loading')).toBeTruthy();
  });

  // Plan-2026-06-18-002 U4/R4 — owned-tokens loading must NOT block the default car.
  it('owned-tokens loading: default car still playable, no full-page loading gate', () => {
    useOwnedTokensMock.mockReturnValue({
      tokens: [],
      loading: true,
      error: null,
    });
    renderPage();
    expect(screen.queryByTestId('track-loading-variants')).toBeNull();
    expect(screen.getByTestId('track-page')).toBeTruthy();
    expect(screen.getByTestId('track-canvas')).toBeTruthy();
    // CTA is suppressed while the connected wallet's query is in flight (no flicker).
    expect(screen.queryByTestId('track-buy-cta')).toBeNull();
  });

  // Plan-2026-06-18-002 U4/R4 — a failed owned-tokens read degrades, never blocks.
  it('owned-tokens error: default car still playable, no full-page error gate', () => {
    useOwnedTokensMock.mockReturnValue({
      tokens: [],
      loading: false,
      error: new Error('boom'),
    });
    renderPage();
    expect(screen.queryByTestId('track-variants-error')).toBeNull();
    expect(screen.getByTestId('track-page')).toBeTruthy();
    expect(screen.getByTestId('track-canvas')).toBeTruthy();
  });

  // Plan-2026-06-18-002 U3 — the default car never triggers a Walrus fetch.
  it('default car build skips the Walrus fetch entirely', async () => {
    useOwnedTokensMock.mockReturnValue({ tokens: [], loading: false, error: null });
    const fetchMock = vi.fn(() => new Promise(() => undefined));
    vi.stubGlobal('fetch', fetchMock);
    const { captured } = installLiveScene();
    // installLiveScene re-stubs fetch; re-assert after it to capture our spy.
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    await waitFor(() => expect(captured.onLapStateChange).toBeDefined());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clicking a carousel tile updates the selected index', () => {
    useOwnedTokensMock.mockReturnValue({
      tokens: [
        token({ objectId: '0xa', name: 'Red' }),
        token({ objectId: '0xb', name: 'Blue' }),
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
    useOwnedTokensMock.mockReturnValue({
      tokens: [token({ objectId: '0xa' })],
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
    useOwnedTokensMock.mockReturnValue({
      tokens: [],
      loading: false,
      error: null,
    });
    // Pre-seed a stored PB for the (default) car that loads first.
    localStorage.setItem(`track-pb:${DEFAULT_CAR_TOKEN_ID}`, '24310');
    installLiveScene();
    renderPage();
    const hudBest = await screen.findByTestId('track-hud-best');
    expect(hudBest.textContent).toMatch(/24\.31s/);
  });

  it('U4 — finishing a lap renders the ResultOverlay with the lap time', async () => {
    useOwnedTokensMock.mockReturnValue({
      tokens: [],
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
        introStartedAtMs: null,
      });
    });
    const overlay = await screen.findByTestId('track-result-overlay');
    expect(overlay).toBeTruthy();
    expect(screen.getByTestId('track-result-time').textContent).toMatch(/24\.31s/);
    // New PB on the first lap.
    expect(screen.getByTestId('track-result-delta').textContent).toMatch(/NEW PB/);
    // PB written to storage under the default car's key.
    expect(localStorage.getItem(`track-pb:${DEFAULT_CAR_TOKEN_ID}`)).toBe('24310');
  });

  it('U4/AE5 — Retry button calls scene.reset() and clears the overlay', async () => {
    useOwnedTokensMock.mockReturnValue({
      tokens: [token({ objectId: '0xa' })],
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
        introStartedAtMs: null,
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
        introStartedAtMs: null,
      });
    });
    expect(screen.queryByTestId('track-result-overlay')).toBeNull();
  });

  it('U4/R13 — pressing R while running (mid-lap) also triggers retry', async () => {
    // R13 says R is accessible mid-run too — player can abort a bad lap.
    // Only the finished-state path was previously asserted; this covers the
    // running-state branch so a regression that flipped the guard to
    // `!== 'finished'` (incorrect) would be caught.
    useOwnedTokensMock.mockReturnValue({
      tokens: [token({ objectId: '0xa' })],
      loading: false,
      error: null,
    });
    const { captured, resetSpy } = installLiveScene();
    renderPage();
    await waitFor(() => expect(captured.onLapStateChange).toBeDefined());
    // Transition to running (post-throttle) but not yet finished.
    act(() => {
      captured.onLapStateChange!({
        status: 'running',
        startedAtMs: 0,
        currentLapMs: 5000,
        finishedLapMs: null,
        checkpointHit: false,
        introStartedAtMs: null,
      });
    });
    fireEvent.keyDown(window, { key: 'r' });
    expect(resetSpy).toHaveBeenCalledTimes(1);
  });

  it('U4 — R-key is ignored while typing in an input or with a modifier (Cmd-R)', async () => {
    // Code-review #9 — R-key listener at window level must skip when focus
    // is in a text input (future-proofing against on-page search/comment
    // fields) and when Cmd/Ctrl is held (Cmd-R hard-reload).
    useOwnedTokensMock.mockReturnValue({
      tokens: [token({ objectId: '0xa' })],
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
        introStartedAtMs: null,
      });
    });

    // Cmd-R must not trigger retry (browser hard-reload would race).
    fireEvent.keyDown(window, { key: 'r', metaKey: true });
    expect(resetSpy).not.toHaveBeenCalled();

    // R inside a hypothetical <input> on /track must also not retry.
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: 'r' });
    expect(resetSpy).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('U4/R13 — pressing R while finished triggers retry equivalently', async () => {
    useOwnedTokensMock.mockReturnValue({
      tokens: [token({ objectId: '0xa' })],
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
        introStartedAtMs: null,
      });
    });

    fireEvent.keyDown(window, { key: 'r' });
    expect(resetSpy).toHaveBeenCalledTimes(1);
  });

  it('U4 — improving on a stored PB writes the new value to localStorage', async () => {
    useOwnedTokensMock.mockReturnValue({
      tokens: [],
      loading: false,
      error: null,
    });
    localStorage.setItem(`track-pb:${DEFAULT_CAR_TOKEN_ID}`, '25100');
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
        introStartedAtMs: null,
      });
    });
    await screen.findByTestId('track-result-overlay');
    // Improved from 25100 → 23420, so storage updates.
    expect(localStorage.getItem(`track-pb:${DEFAULT_CAR_TOKEN_ID}`)).toBe('23420');
    expect(screen.getByTestId('track-result-delta').textContent).toMatch(/NEW PB/);
  });

  // ─── U5: carousel switching teardown (per-car PB isolation, R14/AE6) ───

  it('U5/AE6 — switching from default car to the NFT clears the overlay and reloads its PB', async () => {
    useOwnedTokensMock.mockReturnValue({
      tokens: [token({ objectId: '0xA', name: 'Red' })],
      loading: false,
      error: null,
    });
    // The NFT car has a stored PB; the default car starts fresh.
    localStorage.setItem('track-pb:0xA', '22500');
    const { captured } = installLiveScene();
    renderPage();
    await waitFor(() => expect(captured.onLapStateChange).toBeDefined());

    // Drive a lap on the DEFAULT car (selected first) → result modal + PB.
    act(() => {
      captured.onLapStateChange!({
        status: 'finished',
        startedAtMs: 0,
        currentLapMs: 24000,
        finishedLapMs: 24000,
        checkpointHit: true,
        introStartedAtMs: null,
      });
    });
    expect(screen.queryByTestId('track-result-overlay')).toBeTruthy();
    expect(screen.getByTestId('track-hud-best').textContent).toMatch(/24\.00s/);
    expect(localStorage.getItem(`track-pb:${DEFAULT_CAR_TOKEN_ID}`)).toBe('24000');

    // Switch to the NFT car (tile-1). The selected-effect must reset lap
    // state, clear lastResult, and re-read PB for the new car.
    selectFirstNft();

    expect(screen.queryByTestId('track-result-overlay')).toBeNull();
    expect(screen.getByTestId('track-hud-best').textContent).toMatch(/22\.50s/);
    expect(screen.getByTestId('track-hud-lap').textContent).toMatch(/Lap: 0\.00s/);
  });

  it('U5/AE6 — after switching to the NFT, the next lap-finish writes under its storage key', async () => {
    useOwnedTokensMock.mockReturnValue({
      tokens: [token({ objectId: '0xA' })],
      loading: false,
      error: null,
    });
    const { captured } = installLiveScene();
    renderPage();
    await waitFor(() => expect(captured.onLapStateChange).toBeDefined());

    // Switch from the default car to the NFT before any lap is driven.
    selectFirstNft();
    // Scene rebuilds for the new car — wait for the new callback capture.
    await waitFor(() =>
      expect(createSceneMock.mock.calls.length).toBeGreaterThanOrEqual(2),
    );

    // Drive a lap on the NFT (simulated via the most recently captured callback).
    act(() => {
      captured.onLapStateChange!({
        status: 'finished',
        startedAtMs: 0,
        currentLapMs: 21000,
        finishedLapMs: 21000,
        checkpointHit: true,
        introStartedAtMs: null,
      });
    });
    // PB written under the NFT's key only; the default car's slot stays empty.
    expect(localStorage.getItem('track-pb:0xA')).toBe('21000');
    expect(localStorage.getItem(`track-pb:${DEFAULT_CAR_TOKEN_ID}`)).toBeNull();
  });

  // Plan-2026-06-18-002 U3 — selection survives the async owned-tokens fill-in
  // (StrictMode double-mount also exercised here per the cleanup-only-effect
  // learning: the default car must still build, not silently no-op).
  it('default car builds under StrictMode (no cleanup-only no-op)', async () => {
    useOwnedTokensMock.mockReturnValue({ tokens: [], loading: false, error: null });
    const { captured } = installLiveScene();
    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/track']}>
          <TrackPage />
        </MemoryRouter>
      </StrictMode>,
    );
    await waitFor(() => expect(captured.onLapStateChange).toBeDefined());
    expect(screen.getByTestId('track-canvas')).toBeTruthy();
  });

  it('U4 — slower than stored PB shows positive delta and keeps the old PB in storage', async () => {
    useOwnedTokensMock.mockReturnValue({
      tokens: [],
      loading: false,
      error: null,
    });
    localStorage.setItem(`track-pb:${DEFAULT_CAR_TOKEN_ID}`, '25100');
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
        introStartedAtMs: null,
      });
    });
    await screen.findByTestId('track-result-overlay');
    // Regression: storage stays at the old (better) PB.
    expect(localStorage.getItem(`track-pb:${DEFAULT_CAR_TOKEN_ID}`)).toBe('25100');
    expect(screen.getByTestId('track-result-delta').textContent).toMatch(/\+1\.40s/);
  });

  // ─── Plan-006 U8: intro orbit + countdown flow ───

  it('U8 — countdown overlay does NOT mount before the camera orbit completes', async () => {
    useOwnedTokensMock.mockReturnValue({
      tokens: [token({ objectId: '0xa' })],
      loading: false,
      error: null,
    });
    const { captured } = installLiveScene();
    renderPage();
    // Initial state is intro (from initialLapState()), but orbitDone is
    // false until the scene fires onOrbitComplete. Overlay must stay hidden.
    await waitFor(() => expect(captured.onOrbitComplete).toBeDefined());
    expect(screen.queryByTestId('countdown-overlay')).toBeNull();
  });

  it('U8 — scene firing onOrbitComplete mounts the countdown overlay', async () => {
    useOwnedTokensMock.mockReturnValue({
      tokens: [token({ objectId: '0xa' })],
      loading: false,
      error: null,
    });
    const { captured } = installLiveScene();
    renderPage();
    await waitFor(() => expect(captured.onOrbitComplete).toBeDefined());
    act(() => {
      captured.onOrbitComplete!();
    });
    expect(screen.getByTestId('countdown-overlay')).toBeTruthy();
  });

  it('U8 — onIntroSkipRequested routes through scene.dispatchIntroSkip', async () => {
    useOwnedTokensMock.mockReturnValue({
      tokens: [token({ objectId: '0xa' })],
      loading: false,
      error: null,
    });
    const { captured, dispatchIntroSkipSpy } = installLiveScene();
    renderPage();
    await waitFor(() => expect(captured.onIntroSkipRequested).toBeDefined());
    act(() => {
      captured.onIntroSkipRequested!();
    });
    expect(dispatchIntroSkipSpy).toHaveBeenCalledTimes(1);
  });

  it('U8 — countdown overlay unmounts once lapState transitions to waiting', async () => {
    useOwnedTokensMock.mockReturnValue({
      tokens: [token({ objectId: '0xa' })],
      loading: false,
      error: null,
    });
    const { captured } = installLiveScene();
    renderPage();
    await waitFor(() => expect(captured.onOrbitComplete).toBeDefined());
    act(() => captured.onOrbitComplete!());
    expect(screen.getByTestId('countdown-overlay')).toBeTruthy();
    // Scene dispatches introComplete (e.g., countdown's GO → onComplete),
    // which transitions lapState to waiting. The overlay's gate
    // (`lapState.status === 'intro'`) flips false and it unmounts.
    act(() => {
      captured.onLapStateChange!({
        status: 'waiting',
        startedAtMs: null,
        currentLapMs: 0,
        finishedLapMs: null,
        checkpointHit: false,
        introStartedAtMs: null,
      });
    });
    expect(screen.queryByTestId('countdown-overlay')).toBeNull();
  });

  // ─── U11: override modes (?model= single-drive, ?blob= dev hatch) ───

  it('U11 — ?model=<tokenId> drives that token via the by-quilt-patch-id GLB', async () => {
    // The single-drive path resolves through useTokenById, NOT the owned-tokens
    // carousel query — so a connected wallet is irrelevant here.
    useTokenByIdMock.mockReturnValue({
      token: token({ tokenId: '0xtok', patchId: 'patch-red' }),
      loading: false,
      error: null,
    });
    useOwnedTokensMock.mockReturnValue({ tokens: [], loading: false, error: null });
    const { captured } = installLiveScene();
    renderPage('/track?model=0xtok');
    await waitFor(() => expect(captured.onLapStateChange).toBeDefined());
    // useTokenById was asked for the token id; owned-tokens query was skipped.
    expect(useTokenByIdMock).toHaveBeenCalledWith('0xtok');
    expect(useOwnedTokensMock).toHaveBeenCalledWith(undefined);
    // The scene fetched the variant GLB at the by-quilt-patch-id URL.
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledWith(
      `${WALRUS_AGGREGATOR}/v1/blobs/by-quilt-patch-id/patch-red`,
      expect.anything(),
    );
  });

  it('U11 — ?blob=<id> drives that blob directly (dev hatch), no chain lookup', async () => {
    useOwnedTokensMock.mockReturnValue({ tokens: [], loading: false, error: null });
    const { captured } = installLiveScene();
    renderPage('/track?blob=raw-blob-99');
    await waitFor(() => expect(captured.onLapStateChange).toBeDefined());
    // ?blob= bypasses both the token-by-id and owned-tokens queries.
    expect(useTokenByIdMock).toHaveBeenCalledWith(undefined);
    expect(useOwnedTokensMock).toHaveBeenCalledWith(undefined);
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledWith(
      `${WALRUS_AGGREGATOR}/v1/blobs/raw-blob-99`,
      expect.anything(),
    );
  });

  it('U11 — ?model= mode shows loading then error without needing a wallet', async () => {
    useCurrentAccountMock.mockReturnValue(null);
    useTokenByIdMock.mockReturnValue({
      token: null,
      loading: false,
      error: new Error('Token 0xmissing not found'),
    });
    useOwnedTokensMock.mockReturnValue({ tokens: [], loading: false, error: null });
    renderPage('/track?model=0xmissing');
    // No sign-in gate in override mode; the token-resolution error surfaces.
    expect(screen.queryByTestId('track-needs-signin')).toBeNull();
    expect(screen.getByTestId('track-variants-error').textContent).toMatch(
      /not found/,
    );
  });
});
