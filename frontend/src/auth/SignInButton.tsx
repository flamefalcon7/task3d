import { useState } from 'react';
import { useConnectWallet, useWallets } from '@mysten/dapp-kit';
import { isEnokiWallet, isGoogleWallet, type EnokiWallet } from '@mysten/enoki';
import { SLUSH_WALLET_NAME } from '@mysten/slush-wallet';
import { useSession } from './useSession';

const buttonStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 16px',
  fontSize: 14,
  marginTop: 8,
  cursor: 'pointer',
};

export function SignInButton() {
  const wallets = useWallets();
  const { mutate: connect } = useConnectWallet();
  const { session, signIn, disconnect, address } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const googleEnoki = wallets.find(
    (w): w is EnokiWallet => isEnokiWallet(w) && isGoogleWallet(w),
  );
  const slush = wallets.find((w) => w.name === SLUSH_WALLET_NAME);

  async function handleSignIn() {
    setError(null);
    setBusy(true);
    try {
      await signIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (session) {
    return (
      <div data-testid="session-active">
        <p style={{ fontSize: 12, color: '#aaa' }}>
          Signed in: <code>{session.address.slice(0, 10)}…</code>
        </p>
        <button type="button" onClick={disconnect} style={buttonStyle}>
          Disconnect
        </button>
      </div>
    );
  }

  // Connected but not yet signed in: show "Sign in to continue" prompt.
  if (address) {
    return (
      <div data-testid="signin-pending">
        <p style={{ fontSize: 12, color: '#aaa' }}>
          Wallet connected: <code>{address.slice(0, 10)}…</code>
        </p>
        <button
          type="button"
          onClick={handleSignIn}
          disabled={busy}
          style={buttonStyle}
          data-testid="signin-button"
        >
          {busy ? 'Signing…' : 'Sign in'}
        </button>
        {error && <p role="alert" style={{ color: 'salmon', fontSize: 12 }}>{error}</p>}
      </div>
    );
  }

  return (
    <div data-testid="signin-buttons">
      <button
        type="button"
        disabled={!googleEnoki}
        onClick={() => googleEnoki && connect({ wallet: googleEnoki })}
        style={buttonStyle}
        data-testid="signin-google"
      >
        Sign in with Google
      </button>
      <button
        type="button"
        disabled={!slush}
        onClick={() => slush && connect({ wallet: slush })}
        style={buttonStyle}
        data-testid="signin-slush"
      >
        Connect Slush Wallet
      </button>
      {!googleEnoki && !slush && (
        <p style={{ fontSize: 11, color: '#888', marginTop: 6 }}>
          No wallets registered (set VITE_ENOKI_API_KEY + VITE_GOOGLE_CLIENT_ID, or install Slush).
        </p>
      )}
    </div>
  );
}
