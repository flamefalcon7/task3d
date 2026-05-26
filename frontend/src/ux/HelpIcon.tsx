import { useState, type CSSProperties } from 'react';
import { tokens } from './tokens';

// plan-015 U1 — concept-position `?` icon used on L1 tagging step heading,
// L2 column-area heading, and L2 palette heading (R12). Hover/focus surfaces
// a mono-uppercase popover with 2-3 lines + an example. Reusable across all
// three mount sites.

interface HelpIconProps {
  title: string;
  body: string;
  testId?: string;
}

export function HelpIcon({ title, body, testId }: HelpIconProps) {
  const [open, setOpen] = useState(false);
  const tid = testId ?? 'help-icon';
  return (
    <span style={wrap}>
      <button
        type="button"
        data-testid={tid}
        aria-label={title}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        style={button}
      >
        ?
      </button>
      {open && (
        <span role="tooltip" data-testid={`${tid}-popover`} style={popover}>
          {body}
        </span>
      )}
    </span>
  );
}

const wrap: CSSProperties = {
  position: 'relative',
  display: 'inline-block',
  marginLeft: 6,
  verticalAlign: 'middle',
};

const button: CSSProperties = {
  width: 16,
  height: 16,
  borderRadius: '50%',
  border: tokens.border.primary,
  background: tokens.color.paperPure,
  color: tokens.color.ink,
  fontFamily: tokens.font.mono,
  fontSize: 10,
  fontWeight: tokens.weight.medium,
  lineHeight: 1,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'help',
  padding: 0,
};

const popover: CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 'calc(100% + 4px)',
  zIndex: 10,
  background: tokens.color.ink,
  color: tokens.color.paper,
  fontFamily: tokens.font.mono,
  fontSize: 10,
  letterSpacing: '1px',
  textTransform: 'uppercase',
  padding: '8px 10px',
  border: tokens.border.primary,
  minWidth: 200,
  maxWidth: 320,
  lineHeight: 1.5,
  pointerEvents: 'none',
};
