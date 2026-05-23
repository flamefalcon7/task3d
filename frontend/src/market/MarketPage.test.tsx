import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TESTNET } from '../sui/networkConfig';

const useCurrentAccountMock = vi.fn();
const signAndExecuteMock = vi.fn();
const getObjectMock = vi.fn();
vi.mock('@mysten/dapp-kit', () => ({
  useCurrentAccount: () => useCurrentAccountMock(),
  useSignAndExecuteTransaction: () => ({ mutateAsync: signAndExecuteMock }),
  useSuiClient: () => ({ getObject: getObjectMock }),
}));

vi.mock('../auth/SignInButton', () => ({
  SignInButton: () => <button data-testid="sign-in-button">Sign in</button>,
}));

const useListingsMock = vi.fn();
const fetchOwnedKioskMock = vi.fn();
vi.mock('./useListings', () => ({
  useListings: (...args: unknown[]) => useListingsMock(...args),
  fetchOwnedKiosk: (...args: unknown[]) => fetchOwnedKioskMock(...args),
}));

const useOwnedTokensMock = vi.fn();
vi.mock('../track/useOwnedTokens', () => ({
  useOwnedTokens: (...args: unknown[]) => useOwnedTokensMock(...args),
}));

const buildListMock = vi.fn();
const buildPurchaseMock = vi.fn();
vi.mock('../sui/kioskTxBuilders', () => ({
  buildListNftTokenForSalePtb: (...args: unknown[]) => buildListMock(...args),
  buildPurchaseNftTokenPtb: (...args: unknown[]) => buildPurchaseMock(...args),
  royaltyOwedMist: () => 50_000_000n,
}));

import { MarketPage } from './MarketPage';

const ADDR = '0x' + '3'.repeat(64);
const KIOSK = '0x' + 'a'.repeat(64);
const KIOSK_CAP = '0x' + 'b'.repeat(64);
const TOKEN = '0x' + '1'.repeat(64);
const OWNED = '0x' + '2'.repeat(64);

function listing(overrides: Record<string, unknown> = {}) {
  return {
    tokenId: TOKEN,
    priceMist: 1_000_000_000n,
    name: 'Racer A',
    patchId: 'pA',
    collectionId: '0xc1',
    kioskId: KIOSK,
    ...overrides,
  };
}

// Wrap in StrictMode to mirror main.tsx — catches the class of bug where a
// useRef + cleanup-only useEffect leaves a "alive" flag stuck false after
// React's dev-mode double-mount cycle (mount → cleanup → mount), silently
// no-opping aliveRef-guarded async work.
function renderPage() {
  return render(
    <StrictMode>
      <MemoryRouter>
        <MarketPage />
      </MemoryRouter>
    </StrictMode>,
  );
}

beforeEach(() => {
  useCurrentAccountMock.mockReset();
  signAndExecuteMock.mockReset();
  useListingsMock.mockReset();
  fetchOwnedKioskMock.mockReset();
  useOwnedTokensMock.mockReset();
  buildListMock.mockReset();
  buildPurchaseMock.mockReset();

  useCurrentAccountMock.mockReturnValue({ address: ADDR });
  useListingsMock.mockReturnValue({ listings: [], loading: false, error: null });
  useOwnedTokensMock.mockReturnValue({ tokens: [], loading: false, error: null });
  fetchOwnedKioskMock.mockResolvedValue({ kioskId: KIOSK, kioskCapId: KIOSK_CAP });
  buildListMock.mockReturnValue({ tx: {} });
  buildPurchaseMock.mockReturnValue({ tx: {} });
  signAndExecuteMock.mockResolvedValue({ digest: '0xdig' });
  getObjectMock.mockReset();
  // Default fullnode read-back: a well-shaped NftToken — the post-buy
  // confirmation succeeds, the new card lands in "Your cars" instantly.
  getObjectMock.mockResolvedValue({
    data: {
      objectId: TOKEN,
      type: `${TESTNET.model3dPackageId}::model3d::NftToken`,
      content: {
        dataType: 'moveObject',
        fields: { name: 'Bought Car', patch_id: 'pX', collection_id: '0xcX', base_model_id: '0xbX' },
      },
    },
  });
  globalThis.localStorage?.clear();
});

afterEach(() => cleanup());

describe('MarketPage', () => {
  it('asks the user to connect a wallet when signed out', () => {
    useCurrentAccountMock.mockReturnValue(null);
    renderPage();
    expect(screen.getByTestId('sign-in-button')).toBeTruthy();
  });

  it('shows the empty state when nothing is listed', () => {
    renderPage();
    expect(screen.getByTestId('no-listings')).toBeTruthy();
  });

  it('renders a listing and buys it via the purchase builder', async () => {
    useListingsMock.mockReturnValue({ listings: [listing()], loading: false, error: null });
    renderPage();

    fireEvent.click(screen.getByTestId(`buy-${TOKEN}`));

    await waitFor(() => expect(buildPurchaseMock).toHaveBeenCalledTimes(1));
    expect(buildPurchaseMock).toHaveBeenCalledWith({
      kioskId: KIOSK,
      tokenId: TOKEN,
      priceMist: 1_000_000_000n,
      buyerAddress: ADDR,
    });
    expect(signAndExecuteMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId('buy-success')).toBeTruthy());
  });

  it('lists an owned token via the list builder, reusing the existing kiosk', async () => {
    useOwnedTokensMock.mockReturnValue({
      tokens: [{ tokenId: OWNED, name: 'My Car', patchId: 'p', collectionId: '0xc', baseModelId: '0xb', blobId: '' }],
      loading: false,
      error: null,
    });
    renderPage();

    fireEvent.change(screen.getByTestId(`price-${OWNED}`), { target: { value: '2' } });
    fireEvent.click(screen.getByTestId(`list-${OWNED}`));

    await waitFor(() => expect(buildListMock).toHaveBeenCalledTimes(1));
    expect(buildListMock).toHaveBeenCalledWith({
      tokenId: OWNED,
      priceMist: 2_000_000_000n,
      ownerAddress: ADDR,
      kioskId: KIOSK,
      kioskCapId: KIOSK_CAP,
    });
    expect(signAndExecuteMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a list with no/invalid price before touching the wallet', async () => {
    useOwnedTokensMock.mockReturnValue({
      tokens: [{ tokenId: OWNED, name: 'My Car', patchId: 'p', collectionId: '0xc', baseModelId: '0xb', blobId: '' }],
      loading: false,
      error: null,
    });
    renderPage();

    fireEvent.click(screen.getByTestId(`list-${OWNED}`)); // price empty
    await waitFor(() => expect(screen.getByTestId('market-error')).toBeTruthy());
    expect(buildListMock).not.toHaveBeenCalled();
    expect(signAndExecuteMock).not.toHaveBeenCalled();
  });

  it('reads the bought token back from fullnode and injects it into Your cars instantly', async () => {
    useListingsMock.mockReturnValue({ listings: [listing()], loading: false, error: null });
    // useOwnedTokens still returns empty (indexer hasn't caught up) — the
    // confirmed token alone must drive the Your cars card.
    useOwnedTokensMock.mockReturnValue({ tokens: [], loading: false, error: null });
    renderPage();

    fireEvent.click(screen.getByTestId(`buy-${TOKEN}`));
    await waitFor(() => expect(screen.getByTestId('confirm-ok')).toBeTruthy());
    expect(getObjectMock).toHaveBeenCalledWith({
      id: TOKEN,
      options: { showContent: true, showOwner: true, showType: true },
    });
    // The just-bought item is hidden from "For sale"...
    expect(screen.queryByTestId(`listing-${TOKEN}`)).toBeNull();
    // ...and appears in "Your cars" purely from the fullnode read-back.
    expect(screen.getByTestId(`owned-${TOKEN}`)).toBeTruthy();
  });

  it('shows a ⚠️ banner with a Refresh button when fullnode read-back fails', async () => {
    useListingsMock.mockReturnValue({ listings: [listing()], loading: false, error: null });
    getObjectMock.mockRejectedValue(new Error('fullnode 503'));
    renderPage();

    fireEvent.click(screen.getByTestId(`buy-${TOKEN}`));
    await waitFor(() => expect(screen.getByTestId('confirm-failed')).toBeTruthy());
    expect(screen.getByTestId('confirm-failed').textContent).toMatch(/fullnode 503/);
    // Purchase succeeded (chain tx confirmed), so the "Purchased" link still shows.
    expect(screen.getByTestId('buy-success')).toBeTruthy();
  });

  it('flags a fullnode response with a mismatched type as failed (no silent inject)', async () => {
    useListingsMock.mockReturnValue({ listings: [listing()], loading: false, error: null });
    getObjectMock.mockResolvedValue({
      data: {
        objectId: TOKEN,
        type: '0xabc::other::Thing',
        content: { dataType: 'moveObject', fields: {} },
      },
    });
    renderPage();

    fireEvent.click(screen.getByTestId(`buy-${TOKEN}`));
    await waitFor(() => expect(screen.getByTestId('confirm-failed')).toBeTruthy());
    // Nothing injected into Your cars.
    expect(screen.queryByTestId(`owned-${TOKEN}`)).toBeNull();
  });

  it('surfaces a wallet rejection on buy', async () => {
    useListingsMock.mockReturnValue({ listings: [listing()], loading: false, error: null });
    signAndExecuteMock.mockRejectedValue(new Error('User rejected the request'));
    renderPage();

    fireEvent.click(screen.getByTestId(`buy-${TOKEN}`));
    await waitFor(() => expect(screen.getByTestId('market-error')).toBeTruthy());
    expect(screen.getByTestId('market-error').textContent).toMatch(/rejected/i);
  });

  it('does not read or write localStorage (D-043 removed the kiosk tracking)', () => {
    const getSpy = vi.spyOn(Storage.prototype, 'getItem');
    const setSpy = vi.spyOn(Storage.prototype, 'setItem');
    useOwnedTokensMock.mockReturnValue({
      tokens: [{ tokenId: OWNED, name: 'My Car', patchId: 'p', collectionId: '0xc', baseModelId: '0xb', blobId: '' }],
      loading: false,
      error: null,
    });
    renderPage();
    const ours = (k: unknown) => typeof k === 'string' && k.startsWith('overflow2026:market:');
    expect(getSpy.mock.calls.some((c) => ours(c[0]))).toBe(false);
    expect(setSpy.mock.calls.some((c) => ours(c[0]))).toBe(false);
    getSpy.mockRestore();
    setSpy.mockRestore();
  });

  it('hides already-listed tokens from the sell section', () => {
    useListingsMock.mockReturnValue({ listings: [listing({ tokenId: OWNED })], loading: false, error: null });
    useOwnedTokensMock.mockReturnValue({
      tokens: [{ tokenId: OWNED, name: 'My Car', patchId: 'p', collectionId: '0xc', baseModelId: '0xb', blobId: '' }],
      loading: false,
      error: null,
    });
    renderPage();
    // OWNED is listed → it must not appear as a sellable card
    expect(screen.queryByTestId(`owned-${OWNED}`)).toBeNull();
    expect(screen.getByTestId('no-owned')).toBeTruthy();
  });
});
