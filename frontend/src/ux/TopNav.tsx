import type { CSSProperties } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSession } from '../auth/useSession';
import { TEST_WALLET_ENABLED } from '../wallet/testWalletEnabled';
import { navBar, tokens } from './tokens';

const NAV_ITEMS: ReadonlyArray<{ label: string; path: string }> = [
  { label: 'Create', path: '/create' },
  { label: 'Launch', path: '/launch' },
  { label: 'Market', path: '/market' },
  { label: 'Track', path: '/track' },
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

function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

// NavGuard hides the chrome on /dev/compare (developer tool, not editorial).
// Co-located with TopNav so the conditional-hide test stays self-contained.
const HIDDEN_ROUTES: ReadonlyArray<string> = ['/dev/compare'];

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
        {address ? (
          // Clicking the wallet pill disconnects (dapp-side) so the user can
          // switch accounts/wallets — the masthead had no disconnect affordance
          // before (the only Disconnect button lived in SignInButton, off-nav).
          <button
            type="button"
            onClick={() => disconnect()}
            title="Click to disconnect / switch wallet"
            style={{
              ...(TEST_WALLET_ENABLED
                ? { ...walletPill, color: tokens.color.accent }
                : walletPill),
              cursor: 'pointer',
              background: 'transparent',
            }}
            data-testid="wallet-pill"
            // plan-016 code-review hotfix — only emit data-test-wallet when
            // the flag is actually active (Vite constant-folds the flag, so an
            // unconditional attribute would leak the feature's existence).
            {...(TEST_WALLET_ENABLED ? { 'data-test-wallet': 'true' } : {})}
          >
            {`${TEST_WALLET_ENABLED ? 'TEST ' : ''}${truncateAddress(address)} ⏏`}
          </button>
        ) : (
          <span style={walletPill} data-testid="wallet-pill">
            NO WALLET
          </span>
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
