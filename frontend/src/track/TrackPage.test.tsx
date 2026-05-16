import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Phase 3 U6 — TrackPage shell tests. Mock everything Babylon-shaped so the
// tests stay in jsdom: useOwnedVariants returns plain JS arrays;
// createRacetrackScene is a vi.fn returning fake handles. Real-engine
// behaviour is exercised in racetrackScene.test.ts via module-boundary
// Babylon mocks.

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
  // Default: a connected wallet so the variants branches are reachable.
  useCurrentAccountMock.mockReturnValue({ address: '0xWALLET' });
  // Default scene mock — never resolves so the loading overlay sticks. Each
  // test that cares about the post-load state overrides this.
  createSceneMock.mockReturnValue(new Promise(() => undefined));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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
});
