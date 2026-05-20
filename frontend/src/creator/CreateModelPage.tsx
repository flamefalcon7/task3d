import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSignTransaction,
} from '@mysten/dapp-kit';
import { PreviewCanvas } from '../babylon/PreviewCanvas';
import { generate } from '../lib/api';
import { useWalrusUpload } from '../walrus/useWalrusUpload';
import { useSession } from '../auth/useSession';
import { SignInButton } from '../auth/SignInButton';
import { MintButton, type MintStatus } from './MintButton';
import {
  buildPayForApiCallPtb,
  buildPublishPtb,
  TRIPO_FEE_MIST,
} from '../sui/modelTxBuilders';

// D-032/D-033/D-034: the canonical creator mint page. Two GLB sources —
// Tripo prompt (SUI-fee-gated, D-034) or a user-uploaded .glb — both converge
// on Walrus upload → model3d::publish (shared object). Procedural generation
// is gone (U9 removes the leftovers).

type SourceMode = 'tripo' | 'upload';
type GenStatus = 'idle' | 'paying' | 'generating' | 'error';

const GLB_MAGIC = [0x67, 0x6c, 0x54, 0x46]; // 'glTF'
const MAX_GLB_BYTES = 12 * 1024 * 1024;

const POLICIES = [
  { value: 2, label: 'Anyone (permissionless)' },
  { value: 1, label: 'Me + paid-access holders (allow-list)' },
  { value: 0, label: 'Only me (restricted)' },
] as const;

function isValidGlb(bytes: Uint8Array): boolean {
  if (bytes.length < 12 || bytes.length > MAX_GLB_BYTES) return false;
  return GLB_MAGIC.every((b, i) => bytes[i] === b);
}

function suiToMist(sui: string): bigint {
  const n = Number(sui);
  if (!Number.isFinite(n) || n < 0) return 0n;
  return BigInt(Math.round(n * 1e9));
}

// Bridges dapp-kit's useSignTransaction into the Signer surface @mysten/walrus
// expects (signer.signAndExecuteTransaction). Mirrors the CreatorFlow bridge.
function useDappKitSigner(address: string | null) {
  const { mutateAsync: signTx } = useSignTransaction();
  return useMemo(() => {
    if (!address) return null;
    return {
      toSuiAddress: () => address,
      signTransaction: async (tx: unknown) => signTx({ transaction: tx as never }),
      signAndExecuteTransaction: async ({
        transaction,
        client,
      }: {
        transaction: unknown;
        client: { core: { executeTransaction: (input: unknown) => Promise<unknown> } };
      }) => {
        const { bytes, signature } = await signTx({ transaction: transaction as never });
        return client.core.executeTransaction({
          transaction: bytes,
          signatures: [signature],
          include: { transaction: true, effects: true },
        });
      },
    } as never;
  }, [address, signTx]);
}

export function CreateModelPage() {
  const [sourceMode, setSourceMode] = useState<SourceMode>('tripo');
  const [prompt, setPrompt] = useState('');
  const [genStatus, setGenStatus] = useState<GenStatus>('idle');
  const [genError, setGenError] = useState<string | null>(null);

  const [glb, setGlb] = useState<Uint8Array | null>(null);
  const [glbUrl, setGlbUrl] = useState<string | null>(null);
  const [lineageJson, setLineageJson] = useState<Uint8Array | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const [name, setName] = useState('');
  const [tagsStr, setTagsStr] = useState('');
  const [policy, setPolicy] = useState<number>(2);
  const [feeSui, setFeeSui] = useState('0');
  const [royaltyBps, setRoyaltyBps] = useState(500);

  const [mintStatus, setMintStatus] = useState<MintStatus>('idle');
  const [mintError, setMintError] = useState<string | null>(null);
  const [txDigest, setTxDigest] = useState<string | null>(null);

  const { session } = useSession();
  const account = useCurrentAccount();
  const { uploadFiles, stage: uploadStage } = useWalrusUpload();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const signer = useDappKitSigner(account?.address ?? null);

  useEffect(() => {
    if (!glbUrl) return;
    return () => URL.revokeObjectURL(glbUrl);
  }, [glbUrl]);

  const setGlbBytes = useCallback((bytes: Uint8Array, lineage: Uint8Array | null) => {
    setGlb(bytes);
    setLineageJson(lineage);
    setConfirmed(false);
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'model/gltf-binary' }));
    setGlbUrl(url);
  }, []);

  // Tripo: pay the SUI service fee, then call the gated /api/generate.
  const onGenerate = useCallback(async () => {
    if (!session || !prompt.trim()) return;
    setGenError(null);
    try {
      setGenStatus('paying');
      const { tx } = buildPayForApiCallPtb();
      const payResult = await signAndExecute({ transaction: tx });
      setGenStatus('generating');
      const result = await generate(
        { shape: 'tripo', prompt },
        session.jwt,
        payResult.digest,
      );
      setGlbBytes(result.glbBytes, result.lineageJson);
      setGenStatus('idle');
    } catch (e) {
      setGenError(e instanceof Error ? e.message : String(e));
      setGenStatus('error');
    }
  }, [session, prompt, signAndExecute, setGlbBytes]);

  const onUpload = useCallback(
    async (file: File) => {
      setGenError(null);
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!isValidGlb(bytes)) {
        setGenError('Not a valid .glb file (max 12MB, must start with the glTF magic).');
        return;
      }
      setGlbBytes(bytes, null);
      if (!name) setName(file.name.replace(/\.glb$/i, ''));
    },
    [setGlbBytes, name],
  );

  const onMint = useCallback(async () => {
    if (!session || !signer || !glb || !name.trim()) return;
    setMintError(null);
    setMintStatus('uploading');
    try {
      const files = lineageJson ? [glb, lineageJson] : [glb];
      const upload = await uploadFiles(files, signer);
      setMintStatus('signing');
      const firstBlob = upload.blobObjects[0];
      if (!firstBlob) throw new Error('Walrus upload returned no blob');
      // Tripo path uploads [glb, lineage] → lineage is the 2nd blob; upload
      // path has only the glb, so the lineage pointer is the glb's own blob id.
      const lineageBlobId = upload.blobIds[1] ?? upload.blobIds[0]!;
      const tags = tagsStr.split(',').map((t) => t.trim()).filter(Boolean);
      const { tx } = buildPublishPtb({
        blobObjectId: firstBlob.blobObjectId,
        shapeType: sourceMode,
        paramsJson: JSON.stringify(sourceMode === 'tripo' ? { prompt } : { source: 'upload' }),
        name: name.trim(),
        tags,
        lineageBlobId,
        isEncrypted: false,
        license: {
          policy,
          derivativeMintFee: suiToMist(feeSui),
          derivativeRoyaltyBps: royaltyBps,
          commercialUse: true,
          requireAttribution: policy !== 2,
        },
      });
      const result = await signAndExecute({ transaction: tx });
      setTxDigest(result.digest);
      setMintStatus('success');
    } catch (e) {
      setMintError(e instanceof Error ? e.message : String(e));
      setMintStatus('error');
    }
  }, [session, signer, glb, name, lineageJson, uploadFiles, tagsStr, sourceMode, prompt, policy, feeSui, royaltyBps, signAndExecute]);

  if (!session) {
    return (
      <div data-testid="create-page">
        <h1>Create a Model</h1>
        <p>Sign in to publish a model.</p>
        <SignInButton />
      </div>
    );
  }

  const haveModel = glb !== null;
  const genBusy = genStatus === 'paying' || genStatus === 'generating';

  return (
    <div data-testid="create-page">
      <h1>Create a Model</h1>

      <div role="radiogroup" aria-label="source">
        <label>
          <input
            type="radio"
            name="source"
            checked={sourceMode === 'tripo'}
            onChange={() => setSourceMode('tripo')}
          />
          Generate with Tripo (prompt)
        </label>
        <label>
          <input
            type="radio"
            name="source"
            checked={sourceMode === 'upload'}
            onChange={() => setSourceMode('upload')}
          />
          Upload my own .glb
        </label>
      </div>

      {sourceMode === 'tripo' ? (
        <div>
          <textarea
            data-testid="prompt-input"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the model…"
            rows={3}
          />
          <button
            data-testid="generate-button"
            onClick={onGenerate}
            disabled={genBusy || !prompt.trim()}
          >
            {genStatus === 'paying'
              ? `Approve ${Number(TRIPO_FEE_MIST) / 1e9} SUI fee…`
              : genStatus === 'generating'
                ? 'Generating…'
                : haveModel
                  ? `Generate again (${Number(TRIPO_FEE_MIST) / 1e9} SUI)`
                  : `Pay ${Number(TRIPO_FEE_MIST) / 1e9} SUI & generate`}
          </button>
        </div>
      ) : (
        <div>
          <input
            data-testid="glb-file-input"
            type="file"
            accept=".glb"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onUpload(f);
            }}
          />
        </div>
      )}

      {genError && (
        <div data-testid="gen-error" style={{ color: 'crimson' }}>
          {genError}
        </div>
      )}

      {haveModel && (
        <>
          <PreviewCanvas glbUrl={glbUrl} />
          {sourceMode === 'tripo' && !confirmed && (
            <button data-testid="confirm-model" onClick={() => setConfirmed(true)}>
              Use this model
            </button>
          )}

          {(sourceMode === 'upload' || confirmed) && (
            <div data-testid="metadata-form">
              <label>
                Name
                <input data-testid="name-input" value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label>
                Tags (comma-separated)
                <input value={tagsStr} onChange={(e) => setTagsStr(e.target.value)} />
              </label>
              <fieldset>
                <legend>Access policy</legend>
                {POLICIES.map((p) => (
                  <label key={p.value}>
                    <input
                      type="radio"
                      name="policy"
                      checked={policy === p.value}
                      onChange={() => setPolicy(p.value)}
                    />
                    {p.label}
                  </label>
                ))}
              </fieldset>
              <label>
                Derivative mint fee (SUI)
                <input value={feeSui} onChange={(e) => setFeeSui(e.target.value)} />
              </label>
              <label>
                Derivative royalty (bps, ≤3000)
                <input
                  type="number"
                  value={royaltyBps}
                  onChange={(e) => setRoyaltyBps(Math.min(3000, Math.max(0, Number(e.target.value))))}
                />
              </label>
              <MintButton
                status={mintStatus}
                uploadStage={uploadStage}
                disabled={!name.trim()}
                onClick={onMint}
                errorMessage={mintError ?? undefined}
                explorerUrl={txDigest ? `https://suiscan.xyz/testnet/tx/${txDigest}` : undefined}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
