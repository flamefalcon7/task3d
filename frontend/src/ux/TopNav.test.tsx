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

// eslint-disable-next-line import/first
import { NavGuard, TopNav } from './TopNav';

beforeEach(() => {
  mockAddress = null;
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
  it('renders the brand mark, all four nav links, and the TESTNET badge', () => {
    renderAt('/');
    expect(screen.getByTestId('brand-mark').textContent).toBe('Model3D');
    expect(screen.getByTestId('nav-create')).toBeTruthy();
    expect(screen.getByTestId('nav-launch')).toBeTruthy();
    expect(screen.getByTestId('nav-market')).toBeTruthy();
    expect(screen.getByTestId('nav-track')).toBeTruthy();
    expect(screen.getByTestId('network-badge').textContent).toBe('TESTNET');
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
    const pill = screen.getByTestId('wallet-pill').textContent ?? '';
    // Truncation: 0xXXXX…YYYY (6 chars + ellipsis + 4 chars)
    expect(pill).toMatch(/^0x[0-9a-fA-F]{4}…[0-9a-fA-F]{4}$/);
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
