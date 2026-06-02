// Riff Copilot recall chips (plan-001 U6, D-080; UX status pass).
//
// Presentational: renders the creator's similar past *published* prompts below
// the /create textarea. The recall hook + state live in the parent
// (CreateModelPage) so U5 (remember-on-publish) and U10 (community section)
// share one hook instance.
//
// `status` makes the agent's work legible: while recalling (and there are no
// prior chips) it shows a personified "recalling…" line + skeletons instead of
// a blank-then-pop; while re-recalling with prior chips it keeps them (SWR) with
// a small spinner. Cold-start / empty / error all degrade to "no row".
import { Link } from 'react-router-dom';
import type { CSSProperties } from 'react';
import { tokens, buttonOutline } from '../ux/tokens';
import type { MemoryChip, RecallStatus } from './useCreatorMemory';
import styles from './memoryRecall.module.css';

// Distance below which a recall is "you've made something very similar".
// Empirically: same-concept ≈ 0.39, merely-related ≈ 0.58–0.69 (U1 spike).
// Tuning deferred (plan "Deferred to Follow-Up Work").
export const STRONG_MATCH_THRESHOLD = 0.45;

const MAX_CHIPS = 5;
const MAX_LABEL_CHARS = 40;
const SKELETON_COUNT = 3;

export interface PromptMemoryChipsProps {
  chips: MemoryChip[];
  /** The live textarea value — drives replace-confirm. */
  currentPrompt: string;
  /** Fill the textarea with the chosen prompt. */
  onPick: (prompt: string) => void;
  /** Recall status from the hook; drives the loading affordance. */
  status?: RecallStatus;
  /** Override the strong-match threshold (testing/tuning). */
  strongMatchThreshold?: number;
}

function truncate(s: string): string {
  return s.length > MAX_LABEL_CHARS ? s.slice(0, MAX_LABEL_CHARS - 1) + '…' : s;
}

const wrap: CSSProperties = {
  marginTop: tokens.space[3],
  display: 'flex',
  flexDirection: 'column',
  gap: tokens.space[2],
};
const headingRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: tokens.space[2] };
const heading: CSSProperties = {
  fontFamily: tokens.font.mono,
  fontSize: tokens.size.xs,
  letterSpacing: '1.5px',
  textTransform: 'uppercase',
  color: tokens.color.hint,
};
const spinner: CSSProperties = {
  fontFamily: tokens.font.mono,
  fontSize: tokens.size.xs,
  color: tokens.color.accent,
};
const provenance: CSSProperties = {
  fontFamily: tokens.font.mono,
  fontSize: 9,
  letterSpacing: '0.5px',
  color: tokens.color.hint,
};
const caption: CSSProperties = { fontFamily: tokens.font.mono, fontSize: 10, color: tokens.color.hint };
const row: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: tokens.space[2] };
const chipGroup: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'stretch',
  border: tokens.border.primary,
};
const pickBtnBase: CSSProperties = {
  ...buttonOutline,
  border: 'none',
  textTransform: 'none',
  letterSpacing: '0.2px',
  maxWidth: 260,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};
const openLink: CSSProperties = {
  ...buttonOutline,
  border: 'none',
  borderLeft: tokens.border.hairline,
  fontSize: 9,
  display: 'inline-flex',
  alignItems: 'center',
  textDecoration: 'none',
  color: tokens.color.hint,
};
const strongTag: CSSProperties = {
  fontFamily: tokens.font.mono,
  fontSize: 9,
  letterSpacing: '1px',
  textTransform: 'uppercase',
  color: tokens.color.accent,
  alignSelf: 'center',
};

function Spinner() {
  return (
    <span style={spinner} aria-hidden>
      <span className={styles.spin} style={{ display: 'inline-block' }}>
        ↻
      </span>
    </span>
  );
}

export function PromptMemoryChips({
  chips,
  currentPrompt,
  onPick,
  status,
  strongMatchThreshold = STRONG_MATCH_THRESHOLD,
}: PromptMemoryChipsProps) {
  // Back-compat: if no status is supplied, derive it from the chips.
  const effective: RecallStatus = status ?? (chips.length ? 'ready' : 'idle');

  // Nothing to show: idle (no query) or empty (cold start / no past creations).
  if (effective === 'idle' || (effective === 'empty' && chips.length === 0)) return null;

  const loading = effective === 'loading';
  const loadingFresh = loading && chips.length === 0;

  const handlePick = (prompt: string) => {
    if (!currentPrompt.trim()) {
      onPick(prompt);
      return;
    }
    // Don't silently destroy typed input (review P1).
    if (window.confirm('Replace your current prompt with this past one?')) {
      onPick(prompt);
    }
  };

  return (
    <div style={wrap} aria-live="polite">
      <div style={headingRow}>
        <span style={heading}>Riff on your past creations</span>
        {loading && <Spinner />}
      </div>

      {loadingFresh ? (
        <div data-testid="memory-loading" aria-label="Recalling your past creations">
          <span style={caption}>Recalling your past creations…</span>
          <div style={{ ...row, marginTop: tokens.space[1] }}>
            {Array.from({ length: SKELETON_COUNT }, (_, i) => (
              <div key={i} className={styles.skeleton} />
            ))}
          </div>
        </div>
      ) : (
        <>
          <div style={row} role="group" aria-label="Your past prompts" className={styles.reveal}>
            {chips.slice(0, MAX_CHIPS).map((chip, i) => {
              const strong = chip.distance < strongMatchThreshold;
              return (
                <div
                  key={`${chip.modelId ?? 'x'}-${i}`}
                  style={{ ...chipGroup, borderColor: strong ? tokens.color.accent : tokens.color.ink }}
                >
                  <button
                    type="button"
                    data-testid={strong ? 'memory-chip-strong' : 'memory-chip'}
                    onClick={() => handlePick(chip.prompt)}
                    title={chip.prompt}
                    style={pickBtnBase}
                  >
                    {strong && <span style={strongTag}>★ </span>}
                    {truncate(chip.prompt)}
                  </button>
                  {chip.modelId && (
                    <Link
                      to={`/model/${chip.modelId}`}
                      data-testid="memory-chip-open"
                      style={openLink}
                      aria-label={`Open the model for "${truncate(chip.prompt)}"`}
                    >
                      open
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
          {chips.length > 0 && (
            <span style={provenance}>
              {chips.length} · recalled from your Walrus memory
            </span>
          )}
        </>
      )}
    </div>
  );
}
