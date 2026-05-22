import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const useCurrentAccountMock = vi.fn();
const signAndExecuteMock = vi.fn();
vi.mock('@mysten/dapp-kit', () => ({
  useCurrentAccount: () => useCurrentAccountMock(),
  useSignAndExecuteTransaction: () => ({ mutateAsync: signAndExecuteMock }),
}));

vi.mock('../auth/SignInButton', () => ({
  SignInButton: () => <button data-testid="sign-in-button">Sign in</button>,
}));

const useListingsMock = vi.fn();
const fetchOwnedKioskMock = vi.fn();
const fetchOwnedKioskIdsMock = vi.fn(async (_addr?: string) => [] as string[]);
vi.mock('./useListings', () => ({
  useListings: (...args: unknown[]) => useListingsMock(...args),
  fetchOwnedKiosk: (...args: unknown[]) => fetchOwnedKioskMock(...args),
  fetchOwnedKioskIds: (...args: unknown[]) => fetchOwnedKioskIdsMock(...(args as [string])),
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

function renderPage() {
  return render(
    <MemoryRouter>
      <MarketPage />
    </MemoryRouter>,
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

  it('surfaces a wallet rejection on buy', async () => {
    useListingsMock.mockReturnValue({ listings: [listing()], loading: false, error: null });
    signAndExecuteMock.mockRejectedValue(new Error('User rejected the request'));
    renderPage();

    fireEvent.click(screen.getByTestId(`buy-${TOKEN}`));
    await waitFor(() => expect(screen.getByTestId('market-error')).toBeTruthy());
    expect(screen.getByTestId('market-error').textContent).toMatch(/rejected/i);
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
