// L2 Riff Copilot hook (plan-002 U5, D-081).
//
// Drives the conversational prompt-authoring flow over the JWT-authed
// /api/copilot/turn proxy. Fail-soft by design: any error, a missing session, or
// an `available: false` response flips `available` to false so the page hides the
// "Chat with Copilot" toggle and degrades to the shipped L0/L1 + raw textarea
// (R10). The hook NEVER auto-generates — it only surfaces the synthesized prompt
// for the page to place in the existing input box (R3). The ≤3-turn cap is
// enforced server-side (U4); the client mirrors it only to disable input once
// done. Mirrors the token-guard / seq-guard / mounted-guard / clear-on-token
// patterns in useCreatorMemory.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession, isJwtExpired } from '../auth/useSession';

export type CopilotMessage = { role: 'user' | 'assistant'; content: string };

// idle: not started · thinking: request in flight · asking: copilot returned a
// question, awaiting the user · done: a prompt was synthesized (conversation over)
// · error: a transient failure (retryable — the feature stays available) · quota:
// the operator's Gemini quota is exhausted (R6) — the toggle stays VISIBLE with a
// reset hint and auto-recovers (R7). Distinct from `available:false` (no key → hide,
// the ONLY hide path, AE7).
export type CopilotStatus = 'idle' | 'thinking' | 'asking' | 'done' | 'error' | 'quota';

interface TurnResponse {
  available: boolean;
  result?: { kind: 'question' | 'prompt'; text: string };
  turnIndex?: number;
  retryable?: boolean;
  error?: string;
  retryAfterMs?: number;
}

export interface UseRiffCopilot {
  messages: CopilotMessage[];
  status: CopilotStatus;
  /** false → the LLM/relayer is unavailable; the page should hide the toggle. */
  available: boolean;
  /** When status==='quota', approximate ms until the quota resets (for the hint). */
  retryAfterMs: number;
  /** Set when the copilot synthesizes; the page reads this to fill the input box. */
  synthesizedPrompt: string | null;
  /** Monotonic counter — bumps once per synthesis (even to identical text). The
   *  page keys its fill-the-box effect on this so each synthesis applies exactly
   *  once and a later re-render never re-stomps a manual edit (review: julik P1/P2). */
  synthSeq: number;
  /** Retry the last turn after a transient error (status 'error'). */
  retry: () => void;
  /** Append a user turn and advance the conversation. */
  sendAnswer: (text: string) => void;
  /** Force synthesis now from whatever has been gathered (the "Generate now" button). */
  generateNow: () => void;
  /** Clear the conversation (e.g., on flipping back to Write mode). */
  reset: () => void;
}

export function useRiffCopilot(): UseRiffCopilot {
  const { session } = useSession();
  const authToken = session && !isJwtExpired(session.jwt) ? session.jwt : null;
  const tokenRef = useRef<string | null>(authToken);
  tokenRef.current = authToken;

  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [status, setStatus] = useState<CopilotStatus>('idle');
  const [available, setAvailable] = useState(true);
  const [retryAfterMs, setRetryAfterMs] = useState(0);
  const [synthesizedPrompt, setSynthesizedPrompt] = useState<string | null>(null);
  const [synthSeq, setSynthSeq] = useState(0);

  const messagesRef = useRef<CopilotMessage[]>([]);
  const seq = useRef(0);
  const inFlight = useRef(false);
  const finished = useRef(false);
  const lastArgs = useRef<{ next: CopilotMessage[]; force: boolean } | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const commit = useCallback((next: CopilotMessage[]) => {
    messagesRef.current = next;
    setMessages(next);
  }, []);

  // Clear when the session changes (sign-out / account switch) so one user's
  // conversation never leaks into the next account.
  useEffect(() => {
    seq.current++;
    inFlight.current = false;
    finished.current = false;
    messagesRef.current = [];
    setMessages([]);
    setStatus('idle');
    setSynthesizedPrompt(null);
    setAvailable(true);
    setRetryAfterMs(0);
  }, [authToken]);

  // Auto-recovery (R7): once a quota cooldown elapses, flip back to idle with no
  // manual step. mounted.current is read INSIDE the timeout (not at setup) to avoid
  // the stale-closure trap (checklist §5).
  useEffect(() => {
    if (status !== 'quota' || retryAfterMs <= 0) return;
    const t = setTimeout(() => {
      if (mounted.current) setStatus('idle');
    }, retryAfterMs);
    return () => clearTimeout(t);
  }, [status, retryAfterMs]);

  const drive = useCallback(
    (next: CopilotMessage[], force: boolean) => {
      const token = tokenRef.current;
      if (!token) {
        setAvailable(false);
        return;
      }
      lastArgs.current = { next, force }; // remember for retry()
      inFlight.current = true;
      commit(next);
      setStatus('thinking');
      const mySeq = ++seq.current;
      void (async () => {
        try {
          const res = await fetch('/api/copilot/turn', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ messages: next, forceSynthesize: force }),
          });
          const data = res.ok ? ((await res.json()) as TurnResponse) : null;
          if (mySeq !== seq.current || !mounted.current || tokenRef.current !== token) return;
          // Explicit "off" (no key / INERT) → hide the feature (the ONLY hide path, AE7).
          if (data && data.available === false) {
            setAvailable(false);
            setStatus('idle');
            return;
          }
          // Quota exhausted (R6) → keep the toggle VISIBLE with a reset hint; the
          // panel shows the message instead of the input. Auto-recovers (R7).
          if (data && data.error === 'quota_exhausted') {
            setRetryAfterMs(typeof data.retryAfterMs === 'number' ? data.retryAfterMs : 0);
            setStatus('quota');
            return;
          }
          // Success — a question or the synthesized prompt.
          if (data && data.result) {
            if (data.result.kind === 'prompt') {
              finished.current = true;
              setSynthesizedPrompt(data.result.text);
              setSynthSeq((n) => n + 1);
              commit([...next, { role: 'assistant', content: data.result.text }]);
              setStatus('done');
            } else {
              commit([...next, { role: 'assistant', content: data.result.text }]);
              setStatus('asking');
            }
            return;
          }
          // Everything else (network !ok, 429, or available:true with no result) is
          // TRANSIENT — keep the feature available and let the user retry. Do NOT
          // flip available=false (that would hide the toggle for the whole session).
          setStatus('error');
        } catch {
          if (mySeq === seq.current && mounted.current) {
            setStatus('error');
          }
        } finally {
          if (mySeq === seq.current) inFlight.current = false;
        }
      })();
    },
    [commit],
  );

  const retry = useCallback(() => {
    if (inFlight.current || !lastArgs.current) return;
    drive(lastArgs.current.next, lastArgs.current.force);
  }, [drive]);

  const sendAnswer = useCallback(
    (text: string) => {
      const t = text.trim();
      // Ignore empty input, in-flight requests, and sends after synthesis is done.
      if (!t || inFlight.current || finished.current) return;
      drive([...messagesRef.current, { role: 'user', content: t }], false);
    },
    [drive],
  );

  const generateNow = useCallback(() => {
    if (inFlight.current || finished.current || messagesRef.current.length === 0) return;
    drive(messagesRef.current, true);
  }, [drive]);

  const reset = useCallback(() => {
    seq.current++;
    inFlight.current = false;
    finished.current = false;
    lastArgs.current = null;
    commit([]);
    setStatus('idle');
    setSynthesizedPrompt(null);
    setRetryAfterMs(0);
  }, [commit]);

  return { messages, status, available, retryAfterMs, synthesizedPrompt, synthSeq, retry, sendAnswer, generateNow, reset };
}
