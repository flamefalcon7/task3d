// L2 Riff Copilot conversation panel (plan-002 U6, D-081).
//
// Presentational: it renders the conversation and an answer box, and reports the
// user's input up via onSend / onGenerateNow. All state (messages, status,
// availability, the synthesized prompt) lives in useRiffCopilot, owned by the
// parent (CreateModelPage) so the parent can gate the Write/Chat toggle on
// availability and route the synthesized prompt into the existing input box.
import { useState } from 'react';
import type { CopilotMessage, CopilotStatus } from './useRiffCopilot';

export interface CopilotChatProps {
  messages: CopilotMessage[];
  status: CopilotStatus;
  onSend: (text: string) => void;
  onGenerateNow: () => void;
}

const panel: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 8,
  padding: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};
const bubble = (role: CopilotMessage['role']): React.CSSProperties => ({
  alignSelf: role === 'user' ? 'flex-end' : 'flex-start',
  maxWidth: '85%',
  padding: '6px 10px',
  borderRadius: 10,
  background: role === 'user' ? 'rgba(120,120,200,0.25)' : 'rgba(255,255,255,0.08)',
  fontSize: 14,
  whiteSpace: 'pre-wrap',
});

export function CopilotChat({ messages, status, onSend, onGenerateNow }: CopilotChatProps) {
  const [draft, setDraft] = useState('');
  const busy = status === 'thinking';
  const done = status === 'done';

  const submit = () => {
    const t = draft.trim();
    if (!t || busy || done) return;
    onSend(t);
    setDraft('');
  };

  return (
    <div data-testid="copilot-chat" style={panel}>
      {messages.length === 0 && (
        <p style={{ margin: 0, opacity: 0.7, fontSize: 14 }}>
          Describe your idea to start — the copilot remembers what you've made and will ask a question or two, then draft a
          prompt.
        </p>
      )}
      {messages.map((m, i) => (
        <div key={i} data-testid={`copilot-msg-${m.role}`} style={bubble(m.role)}>
          {m.content}
        </div>
      ))}
      {busy && (
        <div data-testid="copilot-thinking" style={{ ...bubble('assistant'), opacity: 0.7 }}>
          Thinking…
        </div>
      )}

      {!done && (
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
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
            style={{ flex: 1, padding: '6px 10px', borderRadius: 6 }}
          />
          <button data-testid="copilot-send" type="button" onClick={submit} disabled={busy || !draft.trim()}>
            Send
          </button>
          <button
            data-testid="copilot-generate-now"
            type="button"
            onClick={onGenerateNow}
            disabled={busy || messages.length === 0}
            title="Synthesize a prompt now from what we've discussed"
          >
            Generate now
          </button>
        </div>
      )}
      {done && (
        <p data-testid="copilot-done" style={{ margin: 0, fontSize: 14, opacity: 0.8 }}>
          ✔ Prompt drafted — it's in the box above; edit it or generate.
        </p>
      )}
    </div>
  );
}
