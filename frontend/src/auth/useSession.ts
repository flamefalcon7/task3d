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

function readStoredSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!parsed.address || !parsed.jwt) return null;
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

export interface UseSession {
  session: Session | null;
  /** Sign a fresh challenge, exchange for JWT, store. Returns the session. */
  signIn: () => Promise<Session>;
  /** Clear local session + disconnect wallet. */
  disconnect: () => void;
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

  // If the connected wallet address changes (user switches account), wipe
  // the cached session — its JWT is bound to a different address.
  useEffect(() => {
    if (session && account && session.address !== account.address) {
      setSession(null);
      writeStoredSession(null);
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
    return next;
  }, [account, signPersonalMessage]);

  const disconnect = useCallback(() => {
    setSession(null);
    writeStoredSession(null);
    disconnectWallet();
  }, [disconnectWallet]);

  return {
    session,
    signIn,
    disconnect,
    address: account?.address ?? null,
  };
}
