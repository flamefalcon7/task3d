import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, StrictMode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  BOUND_COLLECTION_ID,
  DEFAULT_CAR_TOKEN_ID,
  DEFAULT_CAR_GLB_URL,
} from './rageRacing/brand';

// Phase 3 U6 + Plan-004 U4 + U11 + Plan-2026-06-18-002 — TrackPage shell tests.
// Everything Babylon-shaped is mocked so the tests stay in jsdom:
// useOwnedTokens/useTokenById return plain JS; createRacetrackScene is a vi.fn
// returning fake handles; the Garage select screen is stubbed (its own UI is
// covered in GarageScreen.test.tsx) so these tests focus on TrackPage's
// phase + scene-build + PB/HUD/retry logic.

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

// Stub the Garage select screen: expose the props TrackPage passes (so the
// filter/wallet/loading wiring is assertable) plus "Drive" buttons that fire
// onDrive — the lever tests use to enter the racing phase.
vi.mock('./GarageScreen', () => ({
  GarageScreen: (props: {
    defaultCarToken: { tokenId: string };
    nfts: Array<{ tokenId: string }>;
    hasWallet: boolean;
    loading: boolean;
    onDrive: (t: { tokenId: string }) => void;
  }) => (
    <div
      data-testid="garage-screen"
      data-haswallet={String(props.hasWallet)}
      data-loading={String(props.loading)}
      data-nftids={props.nfts.map((t) => t.tokenId).join(',')}
    >
      <button
        data-testid="drive-default"
        onClick={() => props.onDrive(props.defaultCarToken)}
      />
      {props.nfts.map((t, i) => (
        <button
          key={t.tokenId}
          data-testid={`drive-nft-${i}`}
          onClick={() => props.onDrive(t)}
        />
      ))}
    </div>
  ),
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

// Enter the racing phase by clicking a Garage "Drive" button.
function driveDefault() {
  fireEvent.click(screen.getByTestId('drive-default'));
}
function driveNft(idx = 0) {
  fireEvent.click(screen.getByTestId(`drive-nft-${idx}`));
}

beforeEach(() => {
  useCurrentAccountMock.mockReset();
  useOwnedTokensMock.mockReset();
  useTokenByIdMock.mockReset();
  createSceneMock.mockReset();
  localStorage.clear();
  useCurrentAccountMock.mockReturnValue({ address: '0xWALLET' });
  useTokenByIdMock.mockReturnValue({ token: null, loading: false, error: null });
  createSceneMock.mockReturnValue(new Promise(() => undefined));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

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

describe('TrackPage — Garage phase', () => {
  it('opens on the Garage screen (not the race) and passes wallet state', () => {
    useCurrentAccountMock.mockReturnValue(null);
    useOwnedTokensMock.mockReturnValue({ tokens: [], loading: false, error: null });
    renderPage();
    const garage = screen.getByTestId('garage-screen');
    expect(garage).toBeTruthy();
    expect(garage.getAttribute('data-haswallet')).toBe('false');
    // No race canvas until the player drives.
    expect(screen.queryByTestId('track-canvas')).toBeNull();
  });

  it('passes only bound-collection NFTs to the Garage (filters others out)', () => {
    useOwnedTokensMock.mockReturnValue({
      tokens: [
        token({ objectId: '0xbound' }),
        token({ objectId: '0xother', collectionId: '0xsomeothercoll' }),
      ],
      loading: false,
      error: null,
    });
    renderPage();
    expect(screen.getByTestId('garage-screen').getAttribute('data-nftids')).toBe(
      '0xbound',
    );
  });

  it('owned-tokens loading is forwarded to the Garage (no full-page gate)', () => {
    useOwnedTokensMock.mockReturnValue({ tokens: [], loading: true, error: null });
    renderPage();
    expect(screen.queryByTestId('track-loading-variants')).toBeNull();
    expect(screen.getByTestId('garage-screen').getAttribute('data-loading')).toBe(
      'true',
    );
  });

  it('owned-tokens error degrades to the Garage (no full-page error gate)', () => {
    useOwnedTokensMock.mockReturnValue({
      tokens: [],
      loading: false,
      error: new Error('boom'),
    });
    renderPage();
    expect(screen.queryByTestId('track-variants-error')).toBeNull();
    expect(screen.getByTestId('garage-screen')).toBeTruthy();
  });
});

describe('TrackPage — racing phase', () => {
  it('driving the default car enters the race and fetches the bundled local GLB', async () => {
    useOwnedTokensMock.mockReturnValue({ tokens: [], loading: false, error: null });
    const { captured } = installLiveScene();
    renderPage();
    driveDefault();
    await waitFor(() => expect(captured.onLapStateChange).toBeDefined());
    expect(screen.getByTestId('track-canvas')).toBeTruthy();
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledWith(DEFAULT_CAR_GLB_URL, expect.anything());
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.every((u) => !u.includes('/v1/blobs/'))).toBe(true);
  });

  it('default car shows an identity-only provenance caption', async () => {
    useOwnedTokensMock.mockReturnValue({ tokens: [], loading: false, error: null });
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
    renderPage();
    driveDefault();
    const prov = await screen.findByTestId('track-provenance');
    expect(prov.textContent).toMatch(/Default car · not an NFT/);
    expect(prov.textContent).not.toMatch(/Sui \+ Walrus/);
  });

  it('AE2 — driving an NFT shows a Sui + Walrus provenance caption with real ids', async () => {
    useOwnedTokensMock.mockReturnValue({
      tokens: [token({ objectId: '0xa', blobId: 'blob-abcdef123456' })],
      loading: false,
      error: null,
    });
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
    renderPage();
    driveNft(0);
    const prov = await screen.findByTestId('track-provenance');
    expect(prov.textContent).toMatch(/Sui \+ Walrus/);
    expect(prov.textContent).toMatch(/blob blob-a…3456/);
    expect(prov.textContent).toMatch(/collection 0xa194…1242/);
  });

  it('NFT car fetches its Walrus GLB url', async () => {
    useOwnedTokensMock.mockReturnValue({
      tokens: [token({ objectId: '0xa', patchId: 'patch-red' })],
      loading: false,
      error: null,
    });
    const { captured } = installLiveScene();
    renderPage();
    driveNft(0);
    await waitFor(() => expect(captured.onLapStateChange).toBeDefined());
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledWith(
      `${WALRUS_AGGREGATOR}/v1/blobs/by-quilt-patch-id/patch-red`,
      expect.anything(),
    );
  });

  it('shows the scene-loading overlay while the GLB fetch is pending', async () => {
    useOwnedTokensMock.mockReturnValue({ tokens: [], loading: false, error: null });
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
    renderPage();
    driveDefault();
    expect(await screen.findByTestId('track-scene-loading')).toBeTruthy();
  });

  it('"← Change car" disposes the scene and returns to the Garage', async () => {
    useOwnedTokensMock.mockReturnValue({ tokens: [], loading: false, error: null });
    const { captured, disposeSpy } = installLiveScene();
    renderPage();
    driveDefault();
    await waitFor(() => expect(captured.onLapStateChange).toBeDefined());
    expect(screen.getByTestId('track-canvas')).toBeTruthy();
    fireEvent.click(screen.getByTestId('track-change-car'));
    expect(disposeSpy).toHaveBeenCalled();
    expect(screen.getByTestId('garage-screen')).toBeTruthy();
    expect(screen.queryByTestId('track-canvas')).toBeNull();
  });

  it('U3 — refetching owned tokens (same id, new ref) does not rebuild the racing scene', async () => {
    useOwnedTokensMock.mockReturnValue({
      tokens: [token({ objectId: '0xA', name: 'Red' })],
      loading: false,
      error: null,
    });
    const { captured } = installLiveScene();
    const ui = () => (
      <MemoryRouter initialEntries={['/track']}>
        <TrackPage />
      </MemoryRouter>
    );
    const { rerender } = render(ui());
    driveNft(0);
    await waitFor(() => expect(captured.onLapStateChange).toBeDefined());
    const callsAfterDrive = createSceneMock.mock.calls.length;
    useOwnedTokensMock.mockReturnValue({
      tokens: [token({ objectId: '0xA', name: 'Red' })],
      loading: false,
      error: null,
    });
    rerender(ui());
    await act(async () => {
      await Promise.resolve();
    });
    expect(createSceneMock.mock.calls.length).toBe(callsAfterDrive);
  });

  // ─── HUD + PB + result + retry (default car drives the race) ───

  it('U4 — HUD shows lap timer and best PB (— when no PB stored)', async () => {
    useOwnedTokensMock.mockReturnValue({ tokens: [], loading: false, error: null });
    installLiveScene();
    renderPage();
    driveDefault();
    const hudLap = await screen.findByTestId('track-hud-lap');
    const hudBest = await screen.findByTestId('track-hud-best');
    expect(hudLap.textContent).toMatch(/Lap: 0\.00s/);
    expect(hudBest.textContent).toMatch(/Best: —/);
  });

  it('U4 — HUD pulls existing PB from localStorage on car-load', async () => {
    useOwnedTokensMock.mockReturnValue({ tokens: [], loading: false, error: null });
    localStorage.setItem(`track-pb:${DEFAULT_CAR_TOKEN_ID}`, '24310');
    installLiveScene();
    renderPage();
    driveDefault();
    const hudBest = await screen.findByTestId('track-hud-best');
    expect(hudBest.textContent).toMatch(/24\.31s/);
  });

  it('U4 — finishing a lap renders the ResultOverlay + writes PB under the default-car key', async () => {
    useOwnedTokensMock.mockReturnValue({ tokens: [], loading: false, error: null });
    const { captured } = installLiveScene();
    renderPage();
    driveDefault();
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
    expect(await screen.findByTestId('track-result-overlay')).toBeTruthy();
    expect(screen.getByTestId('track-result-time').textContent).toMatch(/24\.31s/);
    expect(screen.getByTestId('track-result-delta').textContent).toMatch(/NEW PB/);
    expect(localStorage.getItem(`track-pb:${DEFAULT_CAR_TOKEN_ID}`)).toBe('24310');
  });

  it('U4/AE5 — Retry button calls scene.reset() and clears the overlay', async () => {
    useOwnedTokensMock.mockReturnValue({ tokens: [], loading: false, error: null });
    const { captured, resetSpy } = installLiveScene();
    renderPage();
    driveDefault();
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

  it('U4/R13 — pressing R while running triggers retry', async () => {
    useOwnedTokensMock.mockReturnValue({ tokens: [], loading: false, error: null });
    const { captured, resetSpy } = installLiveScene();
    renderPage();
    driveDefault();
    await waitFor(() => expect(captured.onLapStateChange).toBeDefined());
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

  it('U4 — R-key ignored while typing or with a modifier (Cmd-R)', async () => {
    useOwnedTokensMock.mockReturnValue({ tokens: [], loading: false, error: null });
    const { captured, resetSpy } = installLiveScene();
    renderPage();
    driveDefault();
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
    fireEvent.keyDown(window, { key: 'r', metaKey: true });
    expect(resetSpy).not.toHaveBeenCalled();
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: 'r' });
    expect(resetSpy).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('U4 — slower than stored PB shows positive delta and keeps the old PB', async () => {
    useOwnedTokensMock.mockReturnValue({ tokens: [], loading: false, error: null });
    localStorage.setItem(`track-pb:${DEFAULT_CAR_TOKEN_ID}`, '25100');
    const { captured } = installLiveScene();
    renderPage();
    driveDefault();
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
    expect(localStorage.getItem(`track-pb:${DEFAULT_CAR_TOKEN_ID}`)).toBe('25100');
    expect(screen.getByTestId('track-result-delta').textContent).toMatch(/\+1\.40s/);
  });

  it('PB isolation: default car and NFT write under separate keys across a Change-car round trip', async () => {
    useOwnedTokensMock.mockReturnValue({
      tokens: [token({ objectId: '0xA' })],
      loading: false,
      error: null,
    });
    const { captured } = installLiveScene();
    renderPage();
    // Drive the default car, finish a lap → PB under default-car.
    driveDefault();
    await waitFor(() => expect(captured.onLapStateChange).toBeDefined());
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
    expect(localStorage.getItem(`track-pb:${DEFAULT_CAR_TOKEN_ID}`)).toBe('24000');
    // Back to Garage, drive the NFT, finish a lap → PB under the NFT key only.
    fireEvent.click(screen.getByTestId('track-change-car'));
    driveNft(0);
    await waitFor(() =>
      expect(createSceneMock.mock.calls.length).toBeGreaterThanOrEqual(2),
    );
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
    expect(localStorage.getItem('track-pb:0xA')).toBe('21000');
  });

  // ─── Plan-006 U8: intro orbit + countdown ───

  it('U8 — countdown overlay does NOT mount before the orbit completes', async () => {
    useOwnedTokensMock.mockReturnValue({ tokens: [], loading: false, error: null });
    const { captured } = installLiveScene();
    renderPage();
    driveDefault();
    await waitFor(() => expect(captured.onOrbitComplete).toBeDefined());
    expect(screen.queryByTestId('countdown-overlay')).toBeNull();
  });

  it('U8 — onOrbitComplete mounts the countdown overlay', async () => {
    useOwnedTokensMock.mockReturnValue({ tokens: [], loading: false, error: null });
    const { captured } = installLiveScene();
    renderPage();
    driveDefault();
    await waitFor(() => expect(captured.onOrbitComplete).toBeDefined());
    act(() => captured.onOrbitComplete!());
    expect(screen.getByTestId('countdown-overlay')).toBeTruthy();
  });

  it('U8 — onIntroSkipRequested routes through scene.dispatchIntroSkip', async () => {
    useOwnedTokensMock.mockReturnValue({ tokens: [], loading: false, error: null });
    const { captured, dispatchIntroSkipSpy } = installLiveScene();
    renderPage();
    driveDefault();
    await waitFor(() => expect(captured.onIntroSkipRequested).toBeDefined());
    act(() => captured.onIntroSkipRequested!());
    expect(dispatchIntroSkipSpy).toHaveBeenCalledTimes(1);
  });

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
    driveDefault();
    await waitFor(() => expect(captured.onLapStateChange).toBeDefined());
    expect(screen.getByTestId('track-canvas')).toBeTruthy();
  });
});

describe('TrackPage — override modes (skip the Garage)', () => {
  it('U11 — ?model=<tokenId> drives that token directly via by-quilt-patch-id, no Garage', async () => {
    useTokenByIdMock.mockReturnValue({
      token: token({ tokenId: '0xtok', patchId: 'patch-red' }),
      loading: false,
      error: null,
    });
    useOwnedTokensMock.mockReturnValue({ tokens: [], loading: false, error: null });
    const { captured } = installLiveScene();
    renderPage('/track?model=0xtok');
    await waitFor(() => expect(captured.onLapStateChange).toBeDefined());
    expect(screen.queryByTestId('garage-screen')).toBeNull();
    expect(useTokenByIdMock).toHaveBeenCalledWith('0xtok');
    expect(useOwnedTokensMock).toHaveBeenCalledWith(undefined);
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
    expect(screen.queryByTestId('garage-screen')).toBeNull();
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledWith(
      `${WALRUS_AGGREGATOR}/v1/blobs/raw-blob-99`,
      expect.anything(),
    );
  });

  it('U11 — ?model= mode shows loading then error without a wallet (no Garage)', () => {
    useCurrentAccountMock.mockReturnValue(null);
    useTokenByIdMock.mockReturnValue({
      token: null,
      loading: false,
      error: new Error('Token 0xmissing not found'),
    });
    useOwnedTokensMock.mockReturnValue({ tokens: [], loading: false, error: null });
    renderPage('/track?model=0xmissing');
    expect(screen.queryByTestId('garage-screen')).toBeNull();
    expect(screen.getByTestId('track-variants-error').textContent).toMatch(/not found/);
  });

  it('U11 — ?model= loading shows the scoped loading state', () => {
    useCurrentAccountMock.mockReturnValue(null);
    useTokenByIdMock.mockReturnValue({ token: null, loading: true, error: null });
    useOwnedTokensMock.mockReturnValue({ tokens: [], loading: false, error: null });
    renderPage('/track?model=0xpending');
    expect(screen.getByTestId('track-loading-variants')).toBeTruthy();
  });

  it('U11 — ?model= resolving to no token shows the not-found state', () => {
    useTokenByIdMock.mockReturnValue({ token: null, loading: false, error: null });
    useOwnedTokensMock.mockReturnValue({ tokens: [], loading: false, error: null });
    renderPage('/track?model=0xghost');
    expect(screen.getByTestId('track-empty')).toBeTruthy();
  });
});
