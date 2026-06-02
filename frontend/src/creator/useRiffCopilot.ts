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
// question, awaiting the user · done: a prompt was synthesized (conversation over).
export type CopilotStatus = 'idle' | 'thinking' | 'asking' | 'done';

interface TurnResponse {
  available: boolean;
  result?: { kind: 'question' | 'prompt'; text: string };
  turnIndex?: number;
}

export interface UseRiffCopilot {
  messages: CopilotMessage[];
  status: CopilotStatus;
  /** false → the LLM/relayer is unavailable; the page should hide the toggle. */
  available: boolean;
  /** Set when the copilot synthesizes; the page reads this to fill the input box. */
  synthesizedPrompt: string | null;
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
  const [synthesizedPrompt, setSynthesizedPrompt] = useState<string | null>(null);

  const messagesRef = useRef<CopilotMessage[]>([]);
  const seq = useRef(0);
  const inFlight = useRef(false);
  const finished = useRef(false);
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
  }, [authToken]);

  const drive = useCallback(
    (next: CopilotMessage[], force: boolean) => {
      const token = tokenRef.current;
      if (!token) {
        setAvailable(false);
        return;
      }
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
          if (!data || !data.available || !data.result) {
            setAvailable(false);
            setStatus('idle');
            return;
          }
          if (data.result.kind === 'prompt') {
            finished.current = true;
            setSynthesizedPrompt(data.result.text);
            commit([...next, { role: 'assistant', content: data.result.text }]);
            setStatus('done');
          } else {
            commit([...next, { role: 'assistant', content: data.result.text }]);
            setStatus('asking');
          }
        } catch {
          if (mySeq === seq.current && mounted.current) {
            setAvailable(false);
            setStatus('idle');
          }
        } finally {
          if (mySeq === seq.current) inFlight.current = false;
        }
      })();
    },
    [commit],
  );

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
    commit([]);
    setStatus('idle');
    setSynthesizedPrompt(null);
  }, [commit]);

  return { messages, status, available, synthesizedPrompt, sendAnswer, generateNow, reset };
}
