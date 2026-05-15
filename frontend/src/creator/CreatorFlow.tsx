import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSignTransaction,
} from '@mysten/dapp-kit';
import type { GenerateParams, LineageRecord } from '@overflow2026/shared';
import { ShapePicker } from '../components/ShapePicker';
import { PreviewCanvas } from '../babylon/PreviewCanvas';
import { generate } from '../lib/api';
import { useWalrusUpload } from '../walrus/useWalrusUpload';
import { useSession } from '../auth/useSession';
import { SignInButton } from '../auth/SignInButton';
import { PromptInput } from './PromptInput';
import { NameInput, suggestNameFromTags } from './NameInput';
import { MintButton, type MintStatus } from './MintButton';
import { buildPublishPtb, DEFAULT_LICENSE } from '../sui/publishPtb';

type Mode = 'prompt' | 'slider';

interface LineageStub extends Partial<LineageRecord> {
  llmDecision?: { tags?: string[] } & Record<string, unknown>;
}

// Minimal Signer wrapper bridging dapp-kit's useSignTransaction mutation into
// the @mysten/sui/cryptography Signer surface that @mysten/walrus expects.
// Walrus only calls signer.toSuiAddress() + signer.signTransaction(tx) under
// the hood; everything else stays in dapp-kit's normal wallet flow.
function useDappKitSigner(address: string | null) {
  const { mutateAsync: signTx } = useSignTransaction();
  return useMemo(() => {
    if (!address) return null;
    return {
      toSuiAddress: () => address,
      signTransaction: async (tx: unknown) => signTx({ transaction: tx as never }),
    } as never;
  }, [address, signTx]);
}

export function CreatorFlow() {
  const [mode, setMode] = useState<Mode>('prompt');
  const [prompt, setPrompt] = useState('');
  const [params, setParams] = useState<GenerateParams | null>(null);
  const [name, setName] = useState('');
  const [glb, setGlb] = useState<Uint8Array | null>(null);
  const [glbUrl, setGlbUrl] = useState<string | null>(null);
  const [lineageJson, setLineageJson] = useState<Uint8Array | null>(null);
  const [lineageStub, setLineageStub] = useState<LineageStub | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [mintStatus, setMintStatus] = useState<MintStatus>('idle');
  const [mintError, setMintError] = useState<string | null>(null);
  const [txDigest, setTxDigest] = useState<string | null>(null);

  const { session } = useSession();
  const account = useCurrentAccount();
  const { uploadFiles, stage: uploadStage } = useWalrusUpload();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const signer = useDappKitSigner(account?.address ?? null);

  // Revoke blob URL on unmount / replace.
  useEffect(() => {
    if (!glbUrl) return;
    return () => URL.revokeObjectURL(glbUrl);
  }, [glbUrl]);

  const onGenerate = useCallback(async () => {
    setGenError(null);
    setGenerating(true);
    try {
      // Phase 2: prompt mode shares the procedural endpoint with slider mode;
      // a free-form prompt is captured but the backend currently only routes
      // when a shape param is also present. Prompt-only inputs surface a
      // tripo_disabled error from the backend per DL-010.
      const input: GenerateParams = (
        mode === 'prompt' && !params
          ? ({ shape: 'box', prompt } as unknown as GenerateParams)
          : (params as GenerateParams)
      );
      const result = await generate(input);
      setGlb(result.glbBytes);
      const blob = new Blob([result.glbBytes as BlobPart], {
        type: 'model/gltf-binary',
      });
      setGlbUrl(URL.createObjectURL(blob));
      setLineageJson(result.lineageJson);
      const stub = result.lineageStub as LineageStub;
      setLineageStub(stub);
      const tags: string[] = stub?.llmDecision?.tags ?? [];
      if (!name && tags.length) setName(suggestNameFromTags(tags));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // DL-010: tripo_disabled is the backend's signal that the prompt
      // requested a non-procedural shape. Surface a friendlier hint inline.
      setGenError(
        msg.includes('tripo_disabled')
          ? 'That shape needs the creator-only generator. Try a procedural shape: box, chest, cylinder, sphere, sword, hammer, platform.'
          : msg,
      );
    } finally {
      setGenerating(false);
    }
  }, [mode, prompt, params, name]);

  const onMint = useCallback(async () => {
    if (!session || !signer || !glb || !lineageJson) return;
    setMintError(null);
    setMintStatus('uploading');
    try {
      const upload = await uploadFiles([glb, lineageJson], signer);
      setMintStatus('signing');
      const tags: string[] = lineageStub?.llmDecision?.tags ?? [];
      const stubAny = lineageStub as unknown as Record<string, unknown>;
      const shapeType =
        (stubAny?.shape as string | undefined) ??
        (params?.shape as string | undefined) ??
        'box';
      const firstBlobObj = upload.blobObjects[0];
      const lineageBlobId = upload.blobIds[1] ?? upload.blobIds[0];
      if (!firstBlobObj || !lineageBlobId) {
        throw new Error('Walrus upload returned no blob refs');
      }
      const tx = buildPublishPtb({
        blobObjectId: firstBlobObj.blobObjectId,
        shapeType,
        paramsJson: JSON.stringify(stubAny?.params ?? params ?? {}),
        name,
        tags,
        lineageBlobId,
        directAccessPrice: 100_000_000n,
        isEncrypted: false,
        license: DEFAULT_LICENSE,
      });
      const result = await signAndExecute({ transaction: tx });
      setTxDigest(result.digest);
      setMintStatus('success');
    } catch (e) {
      setMintError(e instanceof Error ? e.message : String(e));
      setMintStatus('error');
    }
  }, [
    session,
    signer,
    glb,
    lineageJson,
    lineageStub,
    name,
    params,
    uploadFiles,
    signAndExecute,
  ]);

  const canGenerate = mode === 'prompt' ? prompt.trim().length > 0 : !!params;
  const canMint =
    !!session &&
    !!signer &&
    !!glb &&
    !!lineageJson &&
    name.trim().length > 0 &&
    mintStatus === 'idle';

  return (
    <div
      style={{ padding: 16, maxWidth: 720, margin: '0 auto' }}
      data-testid="creator-flow"
    >
      <h2>Generate + Mint</h2>
      <div style={{ marginBottom: 12 }}>
        <button
          onClick={() => setMode('prompt')}
          disabled={mode === 'prompt'}
          data-testid="mode-prompt"
        >
          Prompt mode
        </button>{' '}
        <button
          onClick={() => setMode('slider')}
          disabled={mode === 'slider'}
          data-testid="mode-slider"
        >
          Slider mode
        </button>
      </div>
      {mode === 'prompt' ? (
        <PromptInput value={prompt} onChange={setPrompt} disabled={generating} />
      ) : (
        <ShapePicker onParamsChange={setParams} />
      )}
      <button
        onClick={onGenerate}
        disabled={!canGenerate || generating}
        style={{ marginTop: 12 }}
        data-testid="generate-button"
      >
        {generating ? 'Generating…' : 'Generate'}
      </button>
      {genError && (
        <div
          role="alert"
          style={{ color: 'crimson', marginTop: 8 }}
          data-testid="generate-error"
        >
          {genError}
        </div>
      )}
      {glbUrl && (
        <>
          <div
            style={{ marginTop: 16, height: 320, background: '#15171b' }}
            data-testid="preview-wrapper"
          >
            <PreviewCanvas glbUrl={glbUrl} />
          </div>
          <div style={{ marginTop: 12 }}>
            <NameInput
              value={name}
              onChange={setName}
              disabled={mintStatus !== 'idle'}
            />
          </div>
          <div style={{ marginTop: 12 }}>
            <MintButton
              status={mintStatus}
              uploadStage={uploadStage}
              disabled={!canMint}
              onClick={onMint}
              errorMessage={mintError ?? undefined}
              explorerUrl={
                txDigest
                  ? `https://suiscan.xyz/testnet/tx/${txDigest}`
                  : undefined
              }
            />
            {!session && (
              <div data-testid="signin-hint" style={{ marginTop: 8 }}>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>
                  Sign in to mint:
                </div>
                <SignInButton />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
