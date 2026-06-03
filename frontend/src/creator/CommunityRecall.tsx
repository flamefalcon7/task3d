// Riff Copilot community recall (plan-001 U10, D-080; UX status pass).
//
// Sibling to PromptMemoryChips (NOT a mode flag on it). A SECOND, clearly-
// labeled section under the prompt field: similar models from the whole
// community (the shared global namespace, exclude-self). Action is DISCOVERY,
// not prompt-copy — each item opens the model page in a NEW TAB so a stray click
// can never destroy the user's typed draft.
//
// `status` makes the agent legible: while searching it shows a personified
// "searching the community on Walrus…" caption + skeletons instead of a
// blank-then-pop. Renders nothing when idle/empty. Deliberately does NOT claim
// global "drives forks" — it is discovery only.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CSSProperties } from 'react';
import { tokens } from '../ux/tokens';
import type { MemoryChip, RecallStatus } from './useCreatorMemory';
import styles from './memoryRecall.module.css';

const MAX_ITEMS = 3;
const MAX_PROMPT_CHARS = 44;
const SKELETON_COUNT = 3;
const NARROW_QUERY = '(max-width: 480px)';

export interface CommunityRecallProps {
  items: MemoryChip[];
  status?: RecallStatus;
}

function truncatePrompt(s: string): string {
  return s.length > MAX_PROMPT_CHARS ? s.slice(0, MAX_PROMPT_CHARS - 1) + '…' : s;
}
function truncateAddress(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

// Collapse the community section by default on narrow viewports so the textarea
// + generate button stay above the fold. Defaults to false (expanded) when
// matchMedia is unavailable (e.g. jsdom).
function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(NARROW_QUERY);
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);
  return narrow;
}

const wrap: CSSProperties = {
  marginTop: tokens.space[3],
  display: 'flex',
  flexDirection: 'column',
  gap: tokens.space[2],
};
const heading: CSSProperties = {
  fontFamily: tokens.font.mono,
  fontSize: tokens.size.xs,
  letterSpacing: '1.5px',
  textTransform: 'uppercase',
  color: tokens.color.hint,
};
const provenance: CSSProperties = { fontFamily: tokens.font.mono, fontSize: 9, letterSpacing: '0.5px', color: tokens.color.hint };
const list: CSSProperties = { display: 'flex', flexDirection: 'column', gap: tokens.space[1] };
const item: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: tokens.space[3],
  border: tokens.border.hairline,
  padding: '6px 10px',
  textDecoration: 'none',
  color: tokens.color.ink,
  fontFamily: tokens.font.body,
  fontSize: tokens.size.sm,
};
const byline: CSSProperties = { fontFamily: tokens.font.mono, fontSize: 10, color: tokens.color.hint, whiteSpace: 'nowrap' };
const disclosure: CSSProperties = {
  background: 'transparent',
  border: tokens.border.hairline,
  padding: '6px 10px',
  fontFamily: tokens.font.mono,
  fontSize: 10,
  letterSpacing: '1px',
  textTransform: 'uppercase',
  cursor: 'pointer',
  alignSelf: 'flex-start',
  color: tokens.color.hint,
};

export function CommunityRecall({ items, status }: CommunityRecallProps) {
  const narrow = useIsNarrow();
  const [open, setOpen] = useState(false);

  const effective: RecallStatus = status ?? (items.length ? 'ready' : 'idle');
  if (effective === 'idle' || (effective === 'empty' && items.length === 0)) return null;

  const loading = effective === 'loading';
  const loadingFresh = loading && items.length === 0;
  const showList = !narrow || open;

  return (
    <div style={wrap}>
      <span style={heading}>From the community — tap to view</span>

      {loadingFresh ? (
        // Searching, nothing yet: skeletons reserve the space (the CopilotBar
        // carries the "recalling…" voice). Collapsed on mobile → nothing here.
        showList ? (
          <div style={list} data-testid="community-loading">
            {Array.from({ length: SKELETON_COUNT }, (_, i) => (
              <div key={i} className={styles.skeleton} style={{ width: '100%' }} />
            ))}
          </div>
        ) : null
      ) : narrow && !open ? (
        <button type="button" style={disclosure} onClick={() => setOpen(true)} data-testid="community-disclosure">
          Show community ({Math.min(items.length, MAX_ITEMS)})
        </button>
      ) : (
        <>
          <div style={list} role="group" aria-label="Similar models from the community" className={styles.reveal}>
            {items.slice(0, MAX_ITEMS).map((it, i) => {
              const label = `View "${truncatePrompt(it.prompt)}"${it.creator ? ` by ${truncateAddress(it.creator)}` : ''} (opens model page)`;
              const content = (
                <>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {truncatePrompt(it.prompt)}
                  </span>
                  {it.creator && <span style={byline}>{truncateAddress(it.creator)}</span>}
                </>
              );
              return it.modelId ? (
                <Link
                  key={`${it.modelId}-${i}`}
                  to={`/model/${it.modelId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="community-item"
                  aria-label={label}
                  style={item}
                >
                  {content}
                </Link>
              ) : (
                <div key={`x-${i}`} data-testid="community-item" style={{ ...item, cursor: 'default' }}>
                  {content}
                </div>
              );
            })}
          </div>
          {items.length > 0 && (
            <span style={provenance}>{items.length} · from the community on Walrus</span>
          )}
        </>
      )}
    </div>
  );
}
