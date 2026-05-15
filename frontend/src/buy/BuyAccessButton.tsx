import { useState } from 'react';
import { useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { buildPurchaseAccessPtb } from '../sui/purchaseAccessPtb';

export type BuyStatus = 'idle' | 'signing' | 'success' | 'rejected' | 'failed';

interface Props {
  modelObjectId: string;
  priceMist: bigint;
  disabled?: boolean;
  alreadyOwned?: boolean;
  onSuccess?: (txDigest: string) => void;
}

// Separate rejected vs failed states per DL-007.
export function BuyAccessButton({
  modelObjectId,
  priceMist,
  disabled,
  alreadyOwned,
  onSuccess,
}: Props) {
  const [status, setStatus] = useState<BuyStatus>('idle');
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [digest, setDigest] = useState<string | null>(null);
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  if (alreadyOwned) {
    return (
      <button disabled style={{ opacity: 0.6 }} data-testid="buy-already-owned">
        You already own access
      </button>
    );
  }

  const onClick = async () => {
    setStatus('signing');
    setErrMsg(null);
    try {
      const tx = buildPurchaseAccessPtb({ modelObjectId, priceMist });
      const result = await signAndExecute({ transaction: tx as never });
      setDigest(result.digest);
      setStatus('success');
      onSuccess?.(result.digest);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // dapp-kit / wallet rejection error texts vary: "User rejected",
      // "rejected by user", etc.
      const isRejection = /reject/i.test(msg);
      setStatus(isRejection ? 'rejected' : 'failed');
      setErrMsg(msg);
    }
  };

  const label =
    priceMist === 0n
      ? 'Claim Access (free)'
      : `Buy Access (${formatSui(priceMist)} SUI)`;
  const buttonLabel =
    status === 'signing'
      ? 'Signing…'
      : status === 'success'
        ? 'Purchased ✓'
        : label;

  return (
    <div data-testid="buy-access">
      <button
        onClick={onClick}
        disabled={disabled || status === 'signing' || status === 'success'}
        data-testid="buy-button"
      >
        {buttonLabel}
      </button>
      {status === 'rejected' && (
        <div
          style={{ fontSize: 12, marginTop: 4 }}
          data-testid="buy-rejected"
        >
          Wallet rejected — click Buy to retry
        </div>
      )}
      {status === 'failed' && (
        <div
          style={{ color: 'crimson', fontSize: 12, marginTop: 4 }}
          data-testid="buy-failed"
        >
          Failed: {errMsg}
        </div>
      )}
      {status === 'success' && digest && (
        <a
          href={`https://suiscan.xyz/testnet/tx/${digest}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'block', marginTop: 4, fontSize: 12 }}
          data-testid="buy-explorer-link"
        >
          View tx on Sui Explorer
        </a>
      )}
    </div>
  );
}

function formatSui(mist: bigint): string {
  return (Number(mist) / 1e9).toFixed(2);
}
