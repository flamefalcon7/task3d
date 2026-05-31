import { SessionKey } from '@mysten/seal';
import type { SealCompatibleClient } from '@mysten/seal';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { SESSION_KEY_TTL_MIN, SESSION_KEY_TTL_MS } from './sealClient';

// plan-026 U1 — SessionKey lifecycle helper.
//
// A Seal SessionKey authorizes the key servers to answer decrypt requests for
// a given (address, packageId) for a bounded TTL, off the back of ONE personal
// -message signature. The actual signing happens in the wallet (outside this
// module) — mirroring how useSession.signIn calls signer.signPersonalMessage:
// this helper creates the SessionKey, hands the caller the bytes to sign via
// getPersonalMessage(), and the caller feeds the signature back through
// activateSession(). We cache the activated session per package behind the TTL
// constant so the short fork/decrypt flow doesn't re-prompt for a signature on
// every step; once it expires, a fresh SessionKey + signature is required.

export interface PendingSession {
  /** The not-yet-activated SessionKey. */
  sessionKey: SessionKey;
  /** Bytes the wallet must sign (BCS PersonalMessage source). */
  personalMessage: Uint8Array;
}

interface CacheEntry {
  sessionKey: SessionKey;
  address: string;
  /** Wall-clock ms after which we proactively treat the entry as stale. */
  expiresAt: number;
}

// Keyed by `${address}:${packageId}` — a session is bound to both, so a wallet
// switch or a different package gets its own entry (never a cross-address reuse).
const sessionCache = new Map<string, CacheEntry>();

function cacheKey(address: string, packageId: string): string {
  return `${address}:${packageId}`;
}

// Default Sui client for SessionKey.create's on-chain lookups. Callers may pass
// their app's shared client; tests pass a stub.
function defaultSuiClient(): SealCompatibleClient {
  return new SuiJsonRpcClient({
    network: 'testnet',
    url: getJsonRpcFullnodeUrl('testnet'),
  }) as unknown as SealCompatibleClient;
}

/**
 * Return a still-valid cached SessionKey for (address, packageId), or null.
 * "Valid" = present, not past our TTL clock, and not Seal-expired. An expired
 * entry is evicted so the caller knows to mint a fresh one + re-sign.
 */
export function getCachedSession(
  address: string,
  packageId: string,
): SessionKey | null {
  const key = cacheKey(address, packageId);
  const entry = sessionCache.get(key);
  if (!entry) return null;
  // Fail closed on either our wall-clock TTL or the SDK's own expiry check.
  if (Date.now() >= entry.expiresAt || entry.sessionKey.isExpired()) {
    sessionCache.delete(key);
    return null;
  }
  return entry.sessionKey;
}

/**
 * Create a fresh (un-activated) SessionKey for (address, packageId) and expose
 * the personal-message bytes the wallet must sign. Does NOT touch the cache —
 * the session is only cached once activated (see activateSession), because an
 * unsigned SessionKey can't answer decrypts.
 *
 * @param suiClient Optional SealCompatible client; defaults to a testnet RPC
 *   client. Pass the app's shared client in production / a stub in tests.
 */
export async function createSession(
  address: string,
  packageId: string,
  suiClient: SealCompatibleClient = defaultSuiClient(),
): Promise<PendingSession> {
  const sessionKey = await SessionKey.create({
    address,
    packageId,
    ttlMin: SESSION_KEY_TTL_MIN,
    suiClient,
  });
  return { sessionKey, personalMessage: sessionKey.getPersonalMessage() };
}

/**
 * Attach the wallet's signature to a pending SessionKey and cache it under the
 * TTL. After this resolves, getCachedSession returns it until it expires.
 *
 * @param signature The wallet's signature over `pending.personalMessage`
 *   (base64 / the SDK's signature string form, as returned by
 *   signPersonalMessage().signature).
 */
export async function activateSession(
  pending: PendingSession,
  packageId: string,
  signature: string,
): Promise<SessionKey> {
  const { sessionKey } = pending;
  await sessionKey.setPersonalMessageSignature(signature);
  const address = sessionKey.getAddress();
  sessionCache.set(cacheKey(address, packageId), {
    sessionKey,
    address,
    expiresAt: Date.now() + SESSION_KEY_TTL_MS,
  });
  return sessionKey;
}

/** Drop any cached session for (address, packageId). */
export function clearSession(address: string, packageId: string): void {
  sessionCache.delete(cacheKey(address, packageId));
}

/** Clear the entire session cache (test isolation / wallet disconnect). */
export function clearAllSessions(): void {
  sessionCache.clear();
}
