import type { CSSProperties } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSession } from '../auth/useSession';
import { TEST_WALLET_ENABLED } from '../wallet/testWalletEnabled';
import { navBar, tokens } from './tokens';

const NAV_ITEMS: ReadonlyArray<{ label: string; path: string }> = [
  { label: 'Create', path: '/create' },
  { label: 'Launch', path: '/launch' },
  { label: 'Market', path: '/market' },
  // '/track' is intentionally NOT a nav item: it's reskinned as "Rage Racing"
  // (a third-party game) and must not present as a Tusk3D feature tab. It's
  // reachable via the race-on-mint deep link and direct URL. See HIDDEN_ROUTES
  // below and plan 2026-06-05-001.
];

const brandStyle: CSSProperties = {
  fontFamily: tokens.font.display,
  fontStyle: 'italic',
  fontSize: tokens.size.md,
  fontWeight: tokens.weight.medium,
  letterSpacing: '-0.5px',
  color: tokens.color.ink,
  textDecoration: 'none',
};

const navLinksContainer: CSSProperties = {
  display: 'flex',
  gap: 24,
  alignItems: 'center',
};

function navLinkStyle(active: boolean): CSSProperties {
  return {
    fontFamily: tokens.font.body,
    fontSize: tokens.size.sm,
    color: tokens.color.ink,
    textDecoration: 'none',
    paddingBottom: 2,
    borderBottom: active ? `2px solid ${tokens.color.accent}` : '2px solid transparent',
  };
}

const rightCluster: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
};

const walletPill: CSSProperties = {
  fontFamily: tokens.font.mono,
  fontSize: 11,
  color: tokens.color.ink,
  letterSpacing: '0.5px',
};

const networkBadge: CSSProperties = {
  fontFamily: tokens.font.mono,
  fontSize: 10,
  letterSpacing: '1.5px',
  textTransform: 'uppercase',
  color: tokens.color.accent,
  border: `1px solid ${tokens.color.accent}`,
  padding: '2px 6px',
};

const disconnectButton: CSSProperties = {
  fontFamily: tokens.font.mono,
  fontSize: 10,
  letterSpacing: '1px',
  textTransform: 'uppercase',
  color: tokens.color.muted,
  background: 'transparent',
  border: `1px solid ${tokens.color.muted}`,
  padding: '2px 6px',
  cursor: 'pointer',
};

function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

// NavGuard hides the chrome on /dev/compare (developer tool, not editorial)
// and on /track (reskinned as the third-party "Rage Racing" game — the Tusk3D
// masthead must not appear over it). Co-located with TopNav so the
// conditional-hide test stays self-contained.
const HIDDEN_ROUTES: ReadonlyArray<string> = ['/dev/compare', '/track'];

export function NavGuard() {
  const location = useLocation();
  if (HIDDEN_ROUTES.includes(location.pathname)) return null;
  return <TopNav />;
}

export function TopNav() {
  const location = useLocation();
  const { address, disconnect } = useSession();

  // S7 (plan-022): on the landing route the editorial <Masthead /> owns the
  // "Tusk3D" wordmark and the "TESTNET EDITION" tag. Suppress the TopNav
  // brand-mark + network badge on `/` so the page shows one intentional
  // identity instead of two stacked wordmarks. The brand link is a no-op on
  // `/` anyway (already home); the wallet pill keeps the testnet signal.
  const isLanding = location.pathname === '/';

  return (
    <nav style={navBar} data-testid="top-nav">
      {isLanding ? (
        // empty flex slot keeps the nav links centered (navBar is space-between)
        <span aria-hidden="true" />
      ) : (
        <Link to="/" style={brandStyle} data-testid="brand-mark">
          Tusk3D
        </Link>
      )}

      <div style={navLinksContainer}>
        {NAV_ITEMS.map((item) => {
          const active = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              style={navLinkStyle(active)}
              data-testid={`nav-${item.label.toLowerCase()}`}
              data-active={active ? 'true' : 'false'}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      <div style={rightCluster}>
        <span
          style={
            TEST_WALLET_ENABLED && address
              ? { ...walletPill, color: tokens.color.accent }
              : walletPill
          }
          data-testid="wallet-pill"
          // plan-016 code-review hotfix — only emit data-test-wallet when
          // the flag is actually active (Vite constant-folds the flag, so an
          // unconditional attribute would leak the feature's existence).
          {...(TEST_WALLET_ENABLED ? { 'data-test-wallet': 'true' } : {})}
        >
          {address
            ? `${TEST_WALLET_ENABLED ? 'TEST ' : ''}${truncateAddress(address)}`
            : 'NO WALLET'}
        </span>
        {/* Explicit, labelled Disconnect — the masthead had no disconnect
            affordance before (the only one lived in SignInButton, off-nav, and
            only when fully signed in). Covers signed-in AND connected-but-not-
            -signed-in states so the user can always switch wallets. */}
        {address && (
          <button
            type="button"
            onClick={() => disconnect()}
            title="Disconnect / switch wallet"
            data-testid="disconnect-wallet"
            style={disconnectButton}
          >
            DISCONNECT
          </button>
        )}
        {!isLanding && (
          <span style={networkBadge} data-testid="network-badge">
            TESTNET
          </span>
        )}
      </div>
    </nav>
  );
}
