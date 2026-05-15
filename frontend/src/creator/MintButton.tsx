import type { UploadStage } from '../walrus/useWalrusUpload';

export type MintStatus = 'idle' | 'uploading' | 'signing' | 'success' | 'error';

interface Props {
  status: MintStatus;
  /** Fine-grained Walrus upload sub-stage. Only consulted when status === 'uploading'. */
  uploadStage?: UploadStage;
  disabled?: boolean;
  onClick: () => void;
  errorMessage?: string;
  explorerUrl?: string;
}

export function MintButton({
  status,
  uploadStage,
  disabled,
  onClick,
  errorMessage,
  explorerUrl,
}: Props) {
  // Three-popup creator flow (DL-001): Walrus register, Walrus certify, Sui
  // publish. Walrus stage comes from useWalrusUpload reactively so each popup
  // step is labeled accurately. The 'relay-upload' stage is non-popup work
  // between register and certify.
  let label = 'Mint';
  if (status === 'uploading') {
    if (uploadStage === 'awaiting-register') {
      label = 'Step 1 of 3 — approve Walrus register…';
    } else if (uploadStage === 'relay-upload') {
      label = 'Uploading to Walrus…';
    } else if (uploadStage === 'awaiting-certify') {
      label = 'Step 2 of 3 — approve Walrus certify…';
    } else {
      // encoding / fallback while waiting for the first stage
      label = 'Preparing upload…';
    }
  } else if (status === 'signing') {
    label = 'Step 3 of 3 — approve Sui publish…';
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
