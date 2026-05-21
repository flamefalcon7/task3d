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

const useCollectionsMock = vi.fn();
const fetchCollectionByIdMock = vi.fn();
vi.mock('./useCollections', () => ({
  useCollections: () => useCollectionsMock(),
  fetchCollectionById: (id: string) => fetchCollectionByIdMock(id),
  POLICY_PERMISSIONLESS: 2,
}));

const useModelIndexMock = vi.fn();
vi.mock('../browse/useModelIndex', () => ({ useModelIndex: () => useModelIndexMock() }));

const buildRegisterMock = vi.fn();
vi.mock('../sui/collectionTxBuilders', () => ({
  buildRegisterIntegrationPtb: (...args: unknown[]) => buildRegisterMock(...args),
}));

import { RegisterIntegrationPage } from './RegisterIntegrationPage';

const ADDR = '0x' + '3'.repeat(64);
const COLL = '0x' + 'a'.repeat(64);
const RESTRICTED = '0x' + 'b'.repeat(64);

function collection(overrides: Record<string, unknown> = {}) {
  return {
    collectionId: COLL,
    baseModelId: '0xbase',
    baseCreator: '0xbasecreator',
    nftCreator: '0xnftcreator',
    baseRoyaltyBps: 500,
    integrationPolicy: 2,
    registerFee: '100000000', // 0.1 SUI
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <RegisterIntegrationPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useCurrentAccountMock.mockReset();
  signAndExecuteMock.mockReset();
  useCollectionsMock.mockReset();
  fetchCollectionByIdMock.mockReset();
  useModelIndexMock.mockReset();
  buildRegisterMock.mockReset();

  useCurrentAccountMock.mockReturnValue({ address: ADDR });
  useCollectionsMock.mockReturnValue({ collections: [collection()], loading: false, error: null });
  useModelIndexMock.mockReturnValue({ models: [{ objectId: '0xbase', name: 'Roadster' }], loading: false });
  fetchCollectionByIdMock.mockResolvedValue(collection());
  buildRegisterMock.mockReturnValue({ tx: { __tx: true } });
  signAndExecuteMock.mockResolvedValue({ digest: '0xdigest' });
});

afterEach(() => {
  cleanup();
});

describe('RegisterIntegrationPage', () => {
  it('shows the sign-in prompt when no wallet is connected', () => {
    useCurrentAccountMock.mockReturnValue(null);
    renderPage();
    expect(screen.getByTestId('integrate-page')).toBeTruthy();
    expect(screen.getByTestId('sign-in-button')).toBeTruthy();
    expect(screen.queryByTestId('collection-picker')).toBeNull();
  });

  it('lists only permissionless collections in the picker (R17/D-030)', () => {
    useCollectionsMock.mockReturnValue({
      collections: [collection(), collection({ collectionId: RESTRICTED, integrationPolicy: 0 })],
      loading: false,
      error: null,
    });
    renderPage();
    expect(screen.getByTestId(`collection-option-${COLL}`)).toBeTruthy();
    expect(screen.queryByTestId(`collection-option-${RESTRICTED}`)).toBeNull();
  });

  it('joins base_model_id → Model3D.name for the collection label', () => {
    renderPage();
    expect(screen.getByTestId(`collection-option-${COLL}`).textContent).toMatch(/Roadster collection/);
  });

  it('rejects a non-https URL client-side and disables Register', () => {
    renderPage();
    fireEvent.click(screen.getByTestId(`collection-option-${COLL}`));
    fireEvent.change(screen.getByTestId('integration-name-input'), { target: { value: 'Cool Game' } });
    fireEvent.change(screen.getByTestId('integration-url-input'), {
      target: { value: 'http://insecure.example' },
    });
    expect(screen.getByTestId('url-error').textContent).toMatch(/https/i);
    expect((screen.getByTestId('register-button') as HTMLButtonElement).disabled).toBe(true);
    expect(buildRegisterMock).not.toHaveBeenCalled();
  });

  it('happy path: re-fetches live fee, builds PTB with it, signs, shows success', async () => {
    // Live fee differs from the cached picker value (TOCTOU guard).
    fetchCollectionByIdMock.mockResolvedValue(collection({ registerFee: '150000000' }));
    renderPage();
    fireEvent.click(screen.getByTestId(`collection-option-${COLL}`));
    fireEvent.change(screen.getByTestId('integration-name-input'), { target: { value: 'Cool Game' } });
    fireEvent.change(screen.getByTestId('integration-url-input'), {
      target: { value: 'https://cool.example' },
    });
    fireEvent.click(screen.getByTestId('register-button'));

    await waitFor(() => expect(screen.getByTestId('register-success')).toBeTruthy());
    expect(fetchCollectionByIdMock).toHaveBeenCalledWith(COLL);
    // PTB built with the LIVE fee, not the stale picker value.
    expect(buildRegisterMock).toHaveBeenCalledWith(
      expect.objectContaining({ collectionId: COLL, feeMist: 150000000n }),
    );
    expect(signAndExecuteMock).toHaveBeenCalledTimes(1);
  });

  it('AE3: closed-integration abort shows friendly copy + Browse link, no raw code', async () => {
    signAndExecuteMock.mockRejectedValue(
      new Error('MoveAbort(MoveLocation { function_name: Some("register_integration") }, 30) in command 0'),
    );
    renderPage();
    fireEvent.click(screen.getByTestId(`collection-option-${COLL}`));
    fireEvent.change(screen.getByTestId('integration-name-input'), { target: { value: 'Cool Game' } });
    fireEvent.change(screen.getByTestId('integration-url-input'), {
      target: { value: 'https://cool.example' },
    });
    fireEvent.click(screen.getByTestId('register-button'));

    await waitFor(() => expect(screen.getByTestId('register-error')).toBeTruthy());
    const err = screen.getByTestId('register-error');
    expect(err.textContent).toMatch(/not accepting integrations/i);
    expect(err.textContent).not.toMatch(/MoveAbort/);
    expect(screen.getByTestId('register-error-browse').getAttribute('href')).toBe('/?filter=integration');
  });

  it('fee-too-low abort shows refresh guidance without the browse link', async () => {
    signAndExecuteMock.mockRejectedValue(
      new Error('MoveAbort(MoveLocation { function_name: Some("register_integration") }, 31) in command 0'),
    );
    renderPage();
    fireEvent.click(screen.getByTestId(`collection-option-${COLL}`));
    fireEvent.change(screen.getByTestId('integration-name-input'), { target: { value: 'Cool Game' } });
    fireEvent.change(screen.getByTestId('integration-url-input'), {
      target: { value: 'https://cool.example' },
    });
    fireEvent.click(screen.getByTestId('register-button'));

    await waitFor(() => expect(screen.getByTestId('register-error')).toBeTruthy());
    expect(screen.getByTestId('register-error').textContent).toMatch(/too low/i);
    expect(screen.queryByTestId('register-error-browse')).toBeNull();
  });
});
