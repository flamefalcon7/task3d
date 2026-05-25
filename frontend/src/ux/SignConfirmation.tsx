import type { CSSProperties, ReactNode } from 'react';
import { useState } from 'react';
import { tokens, buttonPrimary, buttonOutline, monoLabel } from './tokens';

// D-053 — Pre-sign confirmation panel. Wraps any wallet-popup-triggering
// action so the user sees amount + recipient + caveat IN OUR APP first.
//
// Slush wallet's popup renders `splitCoins` u64 inputs as raw BCS hex in a
// collapsed "Transaction details" section instead of as a "Send 0.4 SUI to
// 0xd9663…" headline (research 2026-05-25 — confirmed canonical PTB shape,
// Slush-internal classification gap). The app owns the legibility contract;
// the wallet popup becomes a secondary "raw signing" surface.

export interface SignSummaryRow {
  /** Short uppercase label, e.g. "Tripo generation" or "Estimated gas". */
  label: string;
  /** Display amount, e.g. "0.4 SUI" or "~ 0.001 SUI". */
  amount: string;
  /** Show in lower-emphasis color (used for estimates like gas fees). */
  muted?: boolean;
}

export interface SignRecipient {
  /** Full Sui address. The panel truncates to head/tail at display time. */
  address: string;
  /** Optional human-readable note, e.g. "TRIPO_FEE_TREASURY (deployer)". */
  note?: string;
}

export interface SignConfirmationProps {
  /** Idle-state primary CTA label, e.g. "PAY 0.4 SUI & GENERATE". */
  buttonLabel: string;
  /** Amount rows shown inside the confirmation panel. */
  summary: SignSummaryRow[];
  /** Address + optional note. Omit when the action has no recipient (e.g. personal-message sign). */
  recipient?: SignRecipient;
  /**
   * Show the standard "Slush popup may render hex" caveat note. Default true
   * for any flow that opens a wallet popup; set false for personal-message
   * signatures where the popup just shows the message text.
   */
  walletCaveat?: boolean;
  /** Disable the trigger button (e.g. while a prior tx is in-flight). */
  disabled?: boolean;
  /** Called when the user clicks Confirm; this is the actual signAndExecute trigger. */
  onConfirm: () => void;
  /** Optional extra content rendered above Confirm/Cancel (e.g. operation-specific note). */
  children?: ReactNode;
  /** Optional testid prefix; defaults to "sign-confirmation". */
  testIdPrefix?: string;
}

function truncateAddress(addr: string): string {
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

export function SignConfirmation({
  buttonLabel,
  summary,
  recipient,
  walletCaveat = true,
  disabled,
  onConfirm,
  children,
  testIdPrefix = 'sign-confirmation',
}: SignConfirmationProps) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        data-testid={`${testIdPrefix}-trigger`}
        style={{ ...buttonPrimary, ...(disabled ? disabledStyle : {}) }}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {buttonLabel}
      </button>
    );
  }

  return (
    <div data-testid={`${testIdPrefix}-panel`} style={panel}>
      <div style={panelHeader}>
        <span style={monoLabel}>— ABOUT TO SIGN</span>
      </div>

      <div style={summaryBlock}>
        {summary.map((row, i) => (
          <div key={i} style={row.muted ? summaryRowMuted : summaryRow}>
            <span style={summaryLabel}>{row.label}</span>
            <span style={summaryAmount}>{row.amount}</span>
          </div>
        ))}
      </div>

      {recipient && (
        <div style={recipientBlock}>
          <div style={monoLabel}>To address</div>
          <div style={recipientAddr}>{truncateAddress(recipient.address)}</div>
          {recipient.note && <div style={recipientNote}>{recipient.note}</div>}
        </div>
      )}

      {walletCaveat && (
        <div style={caveat}>
          Slush popup may render the amount as raw hex in "Transaction
          details" — that's a known Slush display limitation, not a bug. The
          values above are authoritative.
        </div>
      )}

      {children && <div style={extraBlock}>{children}</div>}

      <div style={actions}>
        <button
          type="button"
          data-testid={`${testIdPrefix}-cancel`}
          style={buttonOutline}
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
        <button
          type="button"
          data-testid={`${testIdPrefix}-confirm`}
          style={buttonPrimary}
          onClick={() => {
            setOpen(false);
            onConfirm();
          }}
        >
          Sign in wallet →
        </button>
      </div>
    </div>
  );
}

const panel: CSSProperties = {
  border: tokens.border.primary,
  background: tokens.color.paperPure,
  padding: tokens.space[4],
  display: 'flex',
  flexDirection: 'column',
  gap: tokens.space[4],
};

const panelHeader: CSSProperties = {
  borderBottom: tokens.border.hairline,
  paddingBottom: tokens.space[2],
};

const summaryBlock: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: tokens.space[2],
};

const summaryRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  fontFamily: tokens.font.mono,
  fontSize: tokens.size.sm,
};

const summaryRowMuted: CSSProperties = {
  ...summaryRow,
  color: tokens.color.hint,
};

const summaryLabel: CSSProperties = {
  letterSpacing: '0.5px',
};

const summaryAmount: CSSProperties = {
  fontWeight: tokens.weight.medium,
};

const recipientBlock: CSSProperties = {
  borderTop: tokens.border.hairline,
  paddingTop: tokens.space[3],
  display: 'flex',
  flexDirection: 'column',
  gap: tokens.space[1],
};

const recipientAddr: CSSProperties = {
  fontFamily: tokens.font.mono,
  fontSize: tokens.size.base,
  letterSpacing: '0.5px',
};

const recipientNote: CSSProperties = {
  fontFamily: tokens.font.mono,
  fontSize: tokens.size.xs,
  color: tokens.color.hint,
  letterSpacing: '0.5px',
};

const caveat: CSSProperties = {
  borderTop: tokens.border.hairline,
  paddingTop: tokens.space[3],
  fontFamily: tokens.font.body,
  fontSize: tokens.size.sm,
  lineHeight: 1.45,
  color: tokens.color.hint,
};

const extraBlock: CSSProperties = {
  borderTop: tokens.border.hairline,
  paddingTop: tokens.space[3],
};

const actions: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: tokens.space[3],
  borderTop: tokens.border.hairline,
  paddingTop: tokens.space[3],
};

const disabledStyle: CSSProperties = {
  opacity: 0.4,
  cursor: 'not-allowed',
};
