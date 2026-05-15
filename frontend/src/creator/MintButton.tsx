export type MintStatus = 'idle' | 'uploading' | 'signing' | 'success' | 'error';

interface Props {
  status: MintStatus;
  popupCount?: number;
  disabled?: boolean;
  onClick: () => void;
  errorMessage?: string;
  explorerUrl?: string;
}

export function MintButton({
  status,
  popupCount = 0,
  disabled,
  onClick,
  errorMessage,
  explorerUrl,
}: Props) {
  // Three-popup creator flow (DL-001): Walrus register, Walrus certify, Sui
  // publish. popupCount comes from useWalrusUpload (constant 2 for Walrus).
  let label = 'Mint';
  if (status === 'uploading' && popupCount === 0) {
    label = 'Step 1 of 3 — Walrus register…';
  } else if (status === 'uploading' && popupCount === 1) {
    label = 'Step 2 of 3 — Walrus certify…';
  } else if (status === 'uploading') {
    label = `Uploading… (popup ${popupCount + 1} of 3)`;
  } else if (status === 'signing') {
    label = 'Step 3 of 3 — Sui publish…';
  } else if (status === 'success') {
    label = 'Minted ✓';
  } else if (status === 'error') {
    label = 'Failed — retry';
  }

  const busy = status === 'uploading' || status === 'signing';

  return (
    <div>
      <button
        onClick={onClick}
        disabled={disabled || busy}
        data-testid="mint-button"
      >
        {label}
      </button>
      {status === 'error' && errorMessage && (
        <div
          style={{ color: 'crimson', fontSize: 12 }}
          data-testid="mint-error"
        >
          {errorMessage}
        </div>
      )}
      {status === 'success' && explorerUrl && (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'block', marginTop: 8 }}
          data-testid="explorer-link"
        >
          View on Sui Explorer
        </a>
      )}
    </div>
  );
}
