import type { CSSProperties } from 'react';
import { useState } from 'react';
import { monoLabel, tokens } from './tokens';

// Copyable on-chain id chip — truncated id + COPY affordance that flips to
// "✓ COPIED" for ~1.2s. Shared by the collection + NFT detail pages (and any
// future surface that shows a copyable id). Falls back to the plain truncated
// id with no button when the clipboard API is unavailable (insecure context).

function truncate(id: string, head = 6, tail = 4): string {
  if (!id || id.length <= head + tail + 1) return id;
  return `${id.slice(0, head)}…${id.slice(-tail)}`;
}

const dash: CSSProperties = {
  fontFamily: tokens.font.mono,
  fontSize: 14,
  color: tokens.color.ink,
};

const chip: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
  alignSelf: 'flex-start',
  background: tokens.color.paper,
  border: tokens.border.divider,
  borderRadius: 0,
  padding: '4px 8px',
  cursor: 'pointer',
  fontFamily: tokens.font.mono,
  fontSize: 12,
  color: tokens.color.ink,
};

const tag: CSSProperties = {
  ...monoLabel,
  fontSize: 9,
  color: tokens.color.accent,
};

export function CopyId({ value, testId }: { value: string; testId: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span style={dash}>—</span>;
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard blocked (insecure context / permissions) — no-op; the id is
      // still visible to select manually.
    }
  };
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onCopy}
      style={chip}
      title={`Copy ${value}`}
    >
      <code>{truncate(value)}</code>
      <span style={tag}>{copied ? '✓ COPIED' : 'COPY'}</span>
    </button>
  );
}
