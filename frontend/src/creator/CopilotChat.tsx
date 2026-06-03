// L2 Riff Copilot conversation panel (plan-002 U6 + Q1 UX, D-081).
//
// Presentational: renders the conversation + an answer box, reports input up via
// onSend / onGenerateNow. All state lives in useRiffCopilot (owned by the parent).
// On synthesis the panel does NOT snap back to Write — it delivers the drafted
// prompt IN PLACE: an editable field (bound to the parent's prompt state) plus the
// real Generate gate (passed in as `generateSlot`) and a Start-over, so the user
// edits + generates without leaving the conversation (Q1 UX option A).
//
// Styling uses the shared brutalist design tokens (../ux/tokens) — sharp corners,
// mono labels, accent #FF4500 — so the panel matches the rest of /create.
import { useState, type ReactNode } from 'react';
import { tokens, card, input as inputStyle, buttonPrimary, buttonOutline } from '../ux/tokens';
import { formatRetryAfter } from '../lib/formatRetryAfter';
import type { CopilotMessage, CopilotStatus } from './useRiffCopilot';

export interface CopilotChatProps {
  messages: CopilotMessage[];
  status: CopilotStatus;
  /** When status==='quota', approximate ms until the quota resets (for the hint). */
  retryAfterMs?: number;
  onSend: (text: string) => void;
  onGenerateNow: () => void;
  /** The live prompt state — shown editable in the done state (synthesis target). */
  draftPrompt: string;
  /** Edits to the drafted prompt flow back to the parent's prompt state. */
  onDraftChange: (value: string) => void;
  /** Discard this conversation and start a fresh one. */
  onStartOver: () => void;
  /** Retry the last turn after a transient error. */
  onRetry: () => void;
  /** The real (fee-gated) Generate control, rendered as the done-state primary action. */
  generateSlot?: ReactNode;
}

const panel: React.CSSProperties = {
  ...card,
  padding: tokens.space[3],
  display: 'flex',
  flexDirection: 'column',
  gap: tokens.space[2],
};
const microLabel: React.CSSProperties = {
  fontFamily: tokens.font.mono,
  fontSize: tokens.size.xs,
  letterSpacing: '1px',
  textTransform: 'uppercase',
  color: tokens.color.subtle,
};
const bubble = (role: CopilotMessage['role']): React.CSSProperties => ({
  alignSelf: role === 'user' ? 'flex-end' : 'flex-start',
  maxWidth: '85%',
  padding: `${tokens.space[1]}px ${tokens.space[2]}px`,
  border: tokens.border.hairline,
  background: role === 'user' ? tokens.color.ink : tokens.color.paper,
  color: role === 'user' ? tokens.color.paperPure : tokens.color.ink,
  fontFamily: tokens.font.body,
  fontSize: tokens.size.sm,
  whiteSpace: 'pre-wrap',
});

export function CopilotChat({
  messages,
  status,
  retryAfterMs = 0,
  onSend,
  onGenerateNow,
  draftPrompt,
  onDraftChange,
  onStartOver,
  onRetry,
  generateSlot,
}: CopilotChatProps) {
  const [draft, setDraft] = useState('');
  const busy = status === 'thinking';
  const done = status === 'done';
  const errored = status === 'error';
  // Quota exhausted (R6): the panel stays present but shows a reset hint instead of
  // the input — the feature is visibly degraded, never hidden (R10), and recovers
  // automatically (R7), so there is NO retry button.
  const quota = status === 'quota';

  const submit = () => {
    const t = draft.trim();
    if (!t || busy || done) return;
    onSend(t);
    setDraft('');
  };

  return (
    <div data-testid="copilot-chat" style={panel}>
      {messages.length === 0 && (
        <p style={{ margin: 0, color: tokens.color.hint, fontSize: tokens.size.sm, fontFamily: tokens.font.body }}>
          Describe your idea to start — the AI remembers what you've made and will ask a question or two, then draft a
          prompt.
        </p>
      )}
      {messages.map((m, i) => (
        <div key={i} data-testid={`copilot-msg-${m.role}`} style={bubble(m.role)}>
          {m.content}
        </div>
      ))}
      {busy && (
        <div data-testid="copilot-thinking" style={{ ...bubble('assistant'), color: tokens.color.hint }}>
          Thinking…
        </div>
      )}

      {errored && (
        <div
          data-testid="copilot-error"
          style={{ display: 'flex', alignItems: 'center', gap: tokens.space[2], marginTop: tokens.space[1] }}
        >
          <span style={{ ...microLabel, color: tokens.color.err }}>⚠ That didn't go through</span>
          <button data-testid="copilot-retry" type="button" onClick={onRetry} style={buttonPrimary}>
            Try again
          </button>
        </div>
      )}

      {quota && (
        <div
          data-testid="copilot-quota"
          style={{ display: 'flex', alignItems: 'center', gap: tokens.space[2], marginTop: tokens.space[1] }}
        >
          <span style={{ ...microLabel, color: tokens.color.subtle }}>
            ⏳ AI quota reached — try again {formatRetryAfter(retryAfterMs)}
          </span>
        </div>
      )}

      {!done && !errored && !quota && (
        <div style={{ display: 'flex', gap: tokens.space[2], marginTop: tokens.space[1] }}>
          <input
            data-testid="copilot-answer-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={messages.length === 0 ? 'Describe the model…' : 'Your answer…'}
            disabled={busy}
            style={{ ...inputStyle, flex: 1 }}
          />
          <button data-testid="copilot-send" type="button" onClick={submit} disabled={busy || !draft.trim()} style={buttonPrimary}>
            Send
          </button>
          <button
            data-testid="copilot-generate-now"
            type="button"
            onClick={onGenerateNow}
            disabled={busy || messages.length === 0}
            title="Synthesize a prompt now from what we've discussed"
            style={buttonOutline}
          >
            Generate now
          </button>
        </div>
      )}

      {done && (
        <div data-testid="copilot-done" style={{ display: 'flex', flexDirection: 'column', gap: tokens.space[2], marginTop: tokens.space[1] }}>
          <span style={microLabel}>✦ Prompt ready — edit, then generate</span>
          <textarea
            data-testid="copilot-result"
            value={draftPrompt}
            onChange={(e) => onDraftChange(e.target.value)}
            rows={3}
            style={{ ...inputStyle, width: '100%', resize: 'vertical' }}
          />
          {generateSlot}
          <button data-testid="copilot-start-over" type="button" onClick={onStartOver} style={{ ...buttonOutline, alignSelf: 'flex-start' }}>
            ↺ Start over
          </button>
        </div>
      )}
    </div>
  );
}
