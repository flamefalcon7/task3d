import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock useSession before importing TopNav (vitest hoists vi.mock above imports).
// `mockAddress` is a mutable closure so individual tests can toggle the wallet
// connected / disconnected state without redefining the mock.
let mockAddress: string | null = null;
vi.mock('../auth/useSession', () => ({
  useSession: () => ({
    session: null,
    signIn: vi.fn(),
    disconnect: vi.fn(),
    clearSession: vi.fn(),
    address: mockAddress,
  }),
}));

// plan-016 U5 — TEST_WALLET_ENABLED is captured at module-load from
// import.meta.env.VITE_TEST_WALLET; mocking the constant lets us flip
// the indicator on/off per test without env stubbing + module reset.
let testWalletEnabled = false;
vi.mock('../wallet/testWalletEnabled', () => ({
  get TEST_WALLET_ENABLED() {
    return testWalletEnabled;
  },
}));

// eslint-disable-next-line import/first
import { NavGuard, TopNav } from './TopNav';

beforeEach(() => {
  mockAddress = null;
  testWalletEnabled = false;
});

afterEach(() => cleanup());

function renderAt(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <TopNav />
    </MemoryRouter>,
  );
}

describe('TopNav', () => {
  it('renders the brand mark, all four nav links, and the TESTNET badge (non-landing route)', () => {
    renderAt('/market');
    expect(screen.getByTestId('brand-mark').textContent).toBe('Tusk3D');
    expect(screen.getByTestId('nav-create')).toBeTruthy();
    expect(screen.getByTestId('nav-launch')).toBeTruthy();
    expect(screen.getByTestId('nav-market')).toBeTruthy();
    expect(screen.getByTestId('nav-track')).toBeTruthy();
    expect(screen.getByTestId('network-badge').textContent).toBe('TESTNET');
  });

  it('suppresses the brand mark + TESTNET badge on the landing route (S7 — Masthead owns identity)', () => {
    renderAt('/');
    // The editorial <Masthead /> owns the wordmark + TESTNET EDITION on `/`.
    expect(screen.queryByTestId('brand-mark')).toBeNull();
    expect(screen.queryByTestId('network-badge')).toBeNull();
    // nav links + wallet pill still render (the testnet signal survives via the pill).
    expect(screen.getByTestId('nav-create')).toBeTruthy();
    expect(screen.getByTestId('wallet-pill')).toBeTruthy();
  });

  it('highlights the active route with the accent underline (at /market)', () => {
    renderAt('/market');
    expect(screen.getByTestId('nav-market').getAttribute('data-active')).toBe('true');
    expect(screen.getByTestId('nav-track').getAttribute('data-active')).toBe('false');
  });

  it('highlights the active route with the accent underline (at /track)', () => {
    renderAt('/track');
    expect(screen.getByTestId('nav-track').getAttribute('data-active')).toBe('true');
    expect(screen.getByTestId('nav-market').getAttribute('data-active')).toBe('false');
  });

  it('shows NO WALLET when no wallet is connected', () => {
    mockAddress = null;
    renderAt('/');
    expect(screen.getByTestId('wallet-pill').textContent).toBe('NO WALLET');
  });

  it('shows a truncated address pill when a wallet is connected', () => {
    mockAddress = `0xc731848b${'a'.repeat(50)}48BA`;
    renderAt('/');
    const pill = screen.getByTestId('wallet-pill');
    // Truncation: 0xXXXX…YYYY (6 chars + ellipsis + 4 chars)
    expect(pill.textContent ?? '').toMatch(/^0x[0-9a-fA-F]{4}…[0-9a-fA-F]{4}$/);
    // plan-016 code-review hotfix — data-test-wallet must NOT appear on
    // the prod-path DOM (prevents the attribute name from leaking into
    // production bundles as a feature-existence hint).
    expect(pill.hasAttribute('data-test-wallet')).toBe(false);
  });

  it('prepends "TEST " to the wallet pill when test mode is active (plan-016 R6)', () => {
    mockAddress = `0xc731848b${'a'.repeat(50)}48BA`;
    testWalletEnabled = true;
    renderAt('/');
    const pill = screen.getByTestId('wallet-pill');
    expect(pill.getAttribute('data-test-wallet')).toBe('true');
    // Shape: "TEST 0xXXXX…YYYY"
    expect(pill.textContent ?? '').toMatch(/^TEST 0x[0-9a-fA-F]{4}…[0-9a-fA-F]{4}$/);
  });

  it('still shows NO WALLET (no TEST prefix) when test mode is on but address is null', () => {
    mockAddress = null;
    testWalletEnabled = true;
    renderAt('/');
    expect(screen.getByTestId('wallet-pill').textContent).toBe('NO WALLET');
  });
});

describe('NavGuard', () => {
  function renderGuardAt(pathname: string) {
    return render(
      <MemoryRouter initialEntries={[pathname]}>
        <NavGuard />
      </MemoryRouter>,
    );
  }

  it('renders the TopNav on a normal route (/)', () => {
    renderGuardAt('/');
    expect(screen.getByTestId('top-nav')).toBeTruthy();
  });

  it('renders the TopNav on /market', () => {
    renderGuardAt('/market');
    expect(screen.getByTestId('top-nav')).toBeTruthy();
  });

  it('hides the TopNav on /dev/compare', () => {
    renderGuardAt('/dev/compare');
    expect(screen.queryByTestId('top-nav')).toBeNull();
  });
});
