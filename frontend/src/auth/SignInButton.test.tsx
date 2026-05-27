import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// setup.ts mocks SignInButton globally so consumer tests (BrowsePage, CreatorFlow,
// ModelDetailPage) don't need the dapp-kit provider chain. This file IS the
// canonical place that exercises the real component, so undo that mock for the
// modules vitest may have aliased it under.
vi.unmock('./SignInButton');
vi.unmock('../auth/SignInButton');

// eslint-disable-next-line import/first
import { SignInButton } from './SignInButton';

const ADDRESS = `0x${'a'.repeat(64)}`;

// useSession now drops expired tokens on read, so an active-session fixture
// needs a real future exp claim (header.payload.sig with exp = now + 1h).
function makeJwt(expSecondsFromNow: number): string {
  const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '');
  const exp = Math.floor(Date.now() / 1000) + expSecondsFromNow;
  return `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc({ sub: ADDRESS, exp })}.sig`;
}

const mockConnect = vi.fn();
const mockDisconnect = vi.fn();
const mockSignPersonalMessage = vi.fn();
let mockAccount: { address: string } | null = null;
let mockWallets: Array<{ name: string }> = [];

vi.mock('@mysten/dapp-kit', () => ({
  useConnectWallet: () => ({ mutate: mockConnect }),
  useWallets: () => mockWallets,
  useCurrentAccount: () => mockAccount,
  useSignPersonalMessage: () => ({ mutateAsync: mockSignPersonalMessage }),
  // plan-016 U3: useSession now imports useAppSigner, which transitively
  // calls useSignTransaction on the prod path. Mock as a no-op so SignInButton
  // render doesn't crash; this file doesn't exercise the transaction-signing
  // path (covered in LaunchCollectionPage.test.tsx).
  useSignTransaction: () => ({ mutateAsync: vi.fn() }),
  useDisconnectWallet: () => ({ mutate: mockDisconnect }),
}));

vi.mock('@mysten/enoki', () => ({
  isEnokiWallet: (w: { name?: string }) => Boolean(w?.name?.startsWith('Enoki:')),
  isGoogleWallet: (w: { name?: string }) => w?.name === 'Enoki:google',
}));

vi.mock('@mysten/slush-wallet', () => ({
  SLUSH_WALLET_NAME: 'Slush',
}));

beforeEach(() => {
  localStorage.clear();
  mockConnect.mockReset();
  mockDisconnect.mockReset();
  mockSignPersonalMessage.mockReset();
  mockAccount = null;
  mockWallets = [];
});

describe('SignInButton', () => {
  it('renders both Google + Slush buttons when wallets are registered and no session exists', () => {
    mockWallets = [{ name: 'Enoki:google' }, { name: 'Slush' }];
    render(<SignInButton />);
    expect((screen.getByTestId('signin-google') as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTestId('signin-slush') as HTMLButtonElement).disabled).toBe(false);
  });

  it('disables Google when no Enoki wallet is registered', () => {
    mockWallets = [{ name: 'Slush' }];
    render(<SignInButton />);
    expect((screen.getByTestId('signin-google') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('signin-slush') as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows the "no wallets registered" hint when nothing is available', () => {
    mockWallets = [];
    render(<SignInButton />);
    expect(screen.getByText(/no wallets registered/i)).toBeTruthy();
  });

  it('shows Sign in prompt when wallet is connected but no session yet', () => {
    mockAccount = { address: ADDRESS };
    render(<SignInButton />);
    expect(screen.getByTestId('signin-pending')).toBeTruthy();
    expect(screen.getByTestId('signin-button')).toBeTruthy();
  });

  it('shows Disconnect when a session is active', () => {
    mockAccount = { address: ADDRESS };
    localStorage.setItem(
      'overflow2026.session',
      JSON.stringify({ address: ADDRESS, jwt: makeJwt(3600) }),
    );
    render(<SignInButton />);
    expect(screen.getByTestId('session-active')).toBeTruthy();
    expect(screen.getByRole('button', { name: /disconnect/i })).toBeTruthy();
  });
});
