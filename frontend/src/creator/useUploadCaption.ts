// Upload Captioning hook (plan 2026-06-03-001 U4, D-082).
//
// Drives the single-shot vision captioning call over the JWT-authed /api/caption
// proxy. Fail-soft by design: a missing session or an `available: false` response
// flips `available` to false so the page hides the "Describe with AI" button and
// the upload→mint flow proceeds with no caption (R11). A transient failure keeps
// the feature available and offers a retry. The hook NEVER mints or spends — it
// only returns a drafted description for the page to place in the editable field.
// Mirrors the token-guard / seq-guard / mounted-guard / clear-on-token patterns in
// useRiffCopilot + useCreatorMemory.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession, isJwtExpired } from '../auth/useSession';

// idle: not started · thinking: request in flight · done: a caption came back ·
// error: a transient failure (retryable — the feature stays available) ·
// quota: the operator's Gemini quota is exhausted (R6) — the feature stays VISIBLE
// with a reset hint and auto-recovers when the cooldown passes (R7). Distinct from
// `available:false`, which is the ONLY hide path (no key — AE7).
export type CaptionStatus = 'idle' | 'thinking' | 'done' | 'error' | 'quota';

interface CaptionResponse {
  available: boolean;
  caption?: string;
  retryable?: boolean;
  error?: string;
  retryAfterMs?: number;
}

export interface UseUploadCaption {
  status: CaptionStatus;
  /** false → captioning is unavailable (no key / no session); page hides the button. */
  available: boolean;
  /** When status==='quota', approximate ms until the quota resets (for the hint). */
  retryAfterMs: number;
  /** Caption the given clean WebP frames. Resolves the description, or null on any failure. */
  describe: (frames: Uint8Array[]) => Promise<string | null>;
  /** Retry the last describe() after a transient error. */
  retry: () => Promise<string | null>;
  /** Reset status back to idle (e.g., when leaving upload mode). */
  reset: () => void;
}

/** Encode bytes to base64 in chunks (avoids String.fromCharCode arg-count limits). */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function useUploadCaption(): UseUploadCaption {
  const { session } = useSession();
  const authToken = session && !isJwtExpired(session.jwt) ? session.jwt : null;
  const tokenRef = useRef<string | null>(authToken);
  tokenRef.current = authToken;

  const [status, setStatus] = useState<CaptionStatus>('idle');
  const [available, setAvailable] = useState(true);
  const [retryAfterMs, setRetryAfterMs] = useState(0);

  const seq = useRef(0);
  const inFlight = useRef(false);
  const lastFrames = useRef<{ base64: string; mediaType: 'image/webp' }[] | null>(null);
  const mounted = useRef(true);

  // Re-assert in the setup body, not just cleanup — a cleanup-only ref latches
  // false under StrictMode's mount/unmount/remount and never recovers.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Reset availability/status when the session changes (sign-out / account switch).
  useEffect(() => {
    seq.current++;
    inFlight.current = false;
    setStatus('idle');
    setAvailable(true);
    setRetryAfterMs(0);
  }, [authToken]);

  // Auto-recovery (R7): once a quota cooldown elapses, flip back to idle with no
  // manual step. The mounted.current read lives INSIDE the timeout callback (not
  // captured at effect-setup) to avoid the stale-closure trap (checklist §5).
  useEffect(() => {
    if (status !== 'quota' || retryAfterMs <= 0) return;
    const t = setTimeout(() => {
      if (mounted.current) setStatus('idle');
    }, retryAfterMs);
    return () => clearTimeout(t);
  }, [status, retryAfterMs]);

  const send = useCallback(async (frames: { base64: string; mediaType: 'image/webp' }[]): Promise<string | null> => {
    const token = tokenRef.current;
    if (!token) {
      setAvailable(false);
      return null;
    }
    if (frames.length === 0) {
      setStatus('error');
      return null;
    }
    lastFrames.current = frames;
    inFlight.current = true;
    setStatus('thinking');
    const mySeq = ++seq.current;
    try {
      const res = await fetch('/api/caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ frames }),
      });
      const data = res.ok ? ((await res.json()) as CaptionResponse) : null;
      // Stale response (a newer describe started, unmount, or token changed) → drop.
      if (mySeq !== seq.current || !mounted.current || tokenRef.current !== token) return null;
      // Explicit "off" (no key / INERT) → hide the feature (the ONLY hide path, AE7).
      if (data && data.available === false) {
        setAvailable(false);
        setStatus('idle');
        return null;
      }
      // Quota exhausted (R6) → stay VISIBLE with a reset hint; auto-recovers (R7).
      if (data && data.error === 'quota_exhausted') {
        setRetryAfterMs(typeof data.retryAfterMs === 'number' ? data.retryAfterMs : 0);
        setStatus('quota');
        return null;
      }
      if (data && typeof data.caption === 'string' && data.caption) {
        setStatus('done');
        return data.caption;
      }
      // Network !ok, or available:true with no caption → TRANSIENT (retryable).
      setStatus('error');
      return null;
    } catch {
      if (mySeq === seq.current && mounted.current) setStatus('error');
      return null;
    } finally {
      if (mySeq === seq.current) inFlight.current = false;
    }
  }, []);

  const describe = useCallback(
    (frames: Uint8Array[]): Promise<string | null> =>
      send(frames.map((f) => ({ base64: bytesToBase64(f), mediaType: 'image/webp' as const }))),
    [send],
  );

  const retry = useCallback((): Promise<string | null> => {
    if (inFlight.current || !lastFrames.current) return Promise.resolve(null);
    return send(lastFrames.current);
  }, [send]);

  const reset = useCallback(() => {
    seq.current++;
    inFlight.current = false;
    setStatus('idle');
    setRetryAfterMs(0);
  }, []);

  return { status, available, retryAfterMs, describe, retry, reset };
}
