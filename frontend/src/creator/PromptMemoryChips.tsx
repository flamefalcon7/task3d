// Riff Copilot recall chips (plan-001 U6, D-080).
//
// Presentational: renders the creator's similar past *published* prompts below
// the /create textarea. The recall hook + state live in the parent
// (CreateModelPage) so U5 (remember-on-publish) and U10 (community section)
// share one hook instance. Renders nothing when there are no chips, so cold
// start / empty / error all degrade to "no row" and /create is unchanged.
import { Link } from 'react-router-dom';
import type { CSSProperties } from 'react';
import { tokens, buttonOutline } from '../ux/tokens';
import type { MemoryChip } from './useCreatorMemory';

// Distance below which a recall is "you've made something very similar".
// Empirically: same-concept ≈ 0.39, merely-related ≈ 0.58–0.69 (U1 spike).
// Tuning deferred (plan "Deferred to Follow-Up Work").
export const STRONG_MATCH_THRESHOLD = 0.45;

const MAX_CHIPS = 5;
const MAX_LABEL_CHARS = 40;

export interface PromptMemoryChipsProps {
  chips: MemoryChip[];
  /** The live textarea value — drives replace-confirm. */
  currentPrompt: string;
  /** Fill the textarea with the chosen prompt. */
  onPick: (prompt: string) => void;
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
const heading: CSSProperties = {
  fontFamily: tokens.font.mono,
  fontSize: tokens.size.xs,
  letterSpacing: '1.5px',
  textTransform: 'uppercase',
  color: tokens.color.hint,
};
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

export function PromptMemoryChips({
  chips,
  currentPrompt,
  onPick,
  strongMatchThreshold = STRONG_MATCH_THRESHOLD,
}: PromptMemoryChipsProps) {
  if (chips.length === 0) return null;

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
      <span style={heading}>Riff on your past creations</span>
      <div style={row} role="group" aria-label="Your past prompts">
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
    </div>
  );
}
