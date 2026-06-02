// Riff Copilot presence bar (plan-001 UX pass, D-080).
//
// A PERSISTENT one-line status under the /create prompt (Tripo mode). The recall
// chips/community sections are pop-in by nature — when there's nothing to show
// they vanish, so the agent feels absent. This bar is always present (once
// signed in) and is the single "voice" of the copilot, reflecting the combined
// state of personal + community recall:
//   idle    → invite ("describe a model…")
//   loading → "Recalling from Walrus memory…" + spinner
//   found   → identity only (the sections show the actual results)
//   empty   → neutral "No similar models found"
import type { CSSProperties } from 'react';
import { tokens } from '../ux/tokens';
import type { RecallStatus } from './useCreatorMemory';
import styles from './memoryRecall.module.css';

export interface CopilotBarProps {
  personalStatus: RecallStatus;
  communityStatus: RecallStatus;
  personalCount: number;
  communityCount: number;
}

const bar: CSSProperties = {
  marginTop: tokens.space[3],
  display: 'flex',
  alignItems: 'center',
  gap: tokens.space[2],
  fontFamily: tokens.font.mono,
  fontSize: tokens.size.xs,
  letterSpacing: '0.5px',
  color: tokens.color.hint,
};
const name: CSSProperties = { color: tokens.color.ink, letterSpacing: '1px' };
const spinner: CSSProperties = { color: tokens.color.accent };

export function CopilotBar({ personalStatus, communityStatus, personalCount, communityCount }: CopilotBarProps) {
  const loading = personalStatus === 'loading' || communityStatus === 'loading';
  const hasResults = personalCount > 0 || communityCount > 0;
  const searchedEmpty = !loading && !hasResults && (personalStatus === 'empty' || communityStatus === 'empty');

  let status: string | null;
  if (loading) status = 'Recalling from Walrus memory…';
  else if (hasResults) status = null; // the sections below carry the detail
  else if (searchedEmpty) status = 'No similar models found';
  else status = 'Describe a model to recall similar ones from Walrus memory';

  return (
    <div style={bar} data-testid="copilot-bar">
      <span style={name}>🧠 Riff Copilot</span>
      {status && (
        <span aria-live="polite">
          · {status}
          {loading && (
            <span style={spinner} aria-hidden>
              {' '}
              <span className={styles.spin} style={{ display: 'inline-block' }}>↻</span>
            </span>
          )}
        </span>
      )}
    </div>
  );
}
