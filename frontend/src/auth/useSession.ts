import { useCallback, useEffect, useState } from 'react';
import {
  useCurrentAccount,
  useDisconnectWallet,
  useSignPersonalMessage,
} from '@mysten/dapp-kit';

const STORAGE_KEY = 'overflow2026.session';

export interface Session {
  address: string;
  jwt: string;
}

interface ChallengeResponse {
  nonce: string;
}

interface VerifyResponse {
  jwt: string;
}

// Personal-message envelope mirrors the backend's challengeMessage() in
// backend/src/routes/auth.ts — the wallet wraps this in BCS PersonalMessage
// at sign time; we reconstruct the same plain UTF-8 source server-side.
function challengeMessage(nonce: string): string {
  return `overflow2026 sign-in: ${nonce}`;
}

// Decode a JWT's `exp` (seconds) and report whether it has passed. A token we
// can't parse, or one without a numeric exp, is treated as expired (fail
// closed). Used so a stale 24h token never presents as a live session — which
// previously let the UI show "signed in" and, worse, let /create take the SUI
// payment before the gated call 401'd.
export function isJwtExpired(jwt: string): boolean {
  try {
    const payload = jwt.split('.')[1];
    if (!payload) return true;
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as {
      exp?: unknown;
    };
    if (typeof claims.exp !== 'number') return true;
    return claims.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

function readStoredSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!parsed.address || !parsed.jwt) return null;
    // Drop an expired token so the app gates to sign-in instead of trusting it.
    if (isJwtExpired(parsed.jwt)) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredSession(session: Session | null) {
  if (session) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

// Cross-component sync. Previously each `useSession()` call kept its own
// `useState`, so a `setSession` inside SignInButton updated only that
// component's state — CreateModelPage / LaunchCollectionPage / TopNav each
// held a stale snapshot and only reflected the new session after a page
// reload re-read localStorage on mount. Fix: broadcast every write via a
// CustomEvent on `window`; every `useSession()` instance listens and
// mirrors the change into its local state. Same source of truth without
// hoisting module-level state (which broke test isolation by initializing
// once at import time).
const SESSION_EVENT = 'overflow2026:session-changed';

function broadcastSession(next: Session | null) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SESSION_EVENT, { detail: next }));
}

export interface UseSession {
  session: Session | null;
  /** Sign a fresh challenge, exchange for JWT, store. Returns the session. */
  signIn: () => Promise<Session>;
  /** Clear local session + disconnect wallet. */
  disconnect: () => void;
  /** Clear only the JWT session (keep the wallet connected) — used when the
   *  server rejects an expired/invalid token so the user can re-sign-in
   *  without reconnecting the wallet. */
  clearSession: () => void;
  /** Connected wallet address (no JWT yet) — useful for UX. */
  address: string | null;
}

export function useSession(): UseSession {
  const account = useCurrentAccount();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
  const { mutate: disconnectWallet } = useDisconnectWallet();

  const [session, setSession] = useState<Session | null>(() =>
    typeof localStorage === 'undefined' ? null : readStoredSession(),
  );

  // Mirror cross-component writes into this instance's state so every page
  // that calls useSession() updates immediately, not just on next refresh.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e: Event) => {
      const next = (e as CustomEvent<Session | null>).detail;
      setSession(next);
    };
    window.addEventListener(SESSION_EVENT, handler);
    return () => window.removeEventListener(SESSION_EVENT, handler);
  }, []);

  // If the connected wallet address changes (user switches account), wipe
  // the cached session — its JWT is bound to a different address.
  useEffect(() => {
    if (session && account && session.address !== account.address) {
      setSession(null);
      writeStoredSession(null);
      broadcastSession(null);
    }
  }, [account, session]);

  const signIn = useCallback(async (): Promise<Session> => {
    if (!account) {
      throw new Error('Connect a wallet before signing in');
    }
    const address = account.address;
    const challengeRes = await fetch('/api/auth/challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    });
    if (!challengeRes.ok) throw new Error(`challenge failed: ${challengeRes.status}`);
    const { nonce } = (await challengeRes.json()) as ChallengeResponse;

    const message = new TextEncoder().encode(challengeMessage(nonce));
    const { signature } = await signPersonalMessage({ message });

    const verifyRes = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, nonce, signature }),
    });
    if (!verifyRes.ok) throw new Error(`verify failed: ${verifyRes.status}`);
    const { jwt } = (await verifyRes.json()) as VerifyResponse;

    const next: Session = { address, jwt };
    setSession(next);
    writeStoredSession(next);
    broadcastSession(next);
    return next;
  }, [account, signPersonalMessage]);

  const clearSession = useCallback(() => {
    setSession(null);
    writeStoredSession(null);
    broadcastSession(null);
  }, []);

  const disconnect = useCallback(() => {
    clearSession();
    disconnectWallet();
  }, [clearSession, disconnectWallet]);

  return {
    session,
    signIn,
    disconnect,
    clearSession,
    address: account?.address ?? null,
  };
}
