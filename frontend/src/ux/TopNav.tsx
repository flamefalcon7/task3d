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
  const { address } = useSession();

  return (
    <nav style={navBar} data-testid="top-nav">
      <Link to="/" style={brandStyle} data-testid="brand-mark">
        Model3D
      </Link>

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
          // the flag is actually active. The pre-hotfix code emitted
          // data-test-wallet="false" unconditionally because Vite constant-
          // folds TEST_WALLET_ENABLED at build time. That leaked the
          // attribute *name* into prod DOM, a minor info-disclosure of
          // feature existence. Gating with a JS condition keeps the prod
          // bundle attribute-free when the flag is unset.
          {...(TEST_WALLET_ENABLED ? { 'data-test-wallet': 'true' } : {})}
        >
          {address
            ? `${TEST_WALLET_ENABLED ? 'TEST ' : ''}${truncateAddress(address)}`
            : 'NO WALLET'}
        </span>
        <span style={networkBadge} data-testid="network-badge">
          TESTNET
        </span>
      </div>
    </nav>
  );
}
