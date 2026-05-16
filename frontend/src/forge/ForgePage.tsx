// U4 — Collection Forge page. Three-popup mint flow (KTD-1):
//   1. POST /api/generate → base car GLB (Tripo, ~60s typical)
//   2. POST /api/collection/build → N material-swapped variant GLBs
//   3. useWalrusUpload(files=N variants) → 1 Sui Blob + N patch ids (2 popups)
//   4. buildCollectionPtb → signAndExecuteTransaction (1 popup)
// Total: 3 wallet popups regardless of N (Walrus quilt batches register+certify).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSignTransaction,
} from '@mysten/dapp-kit';
import {
  TEXTURE_LIBRARY,
  type CollectionBuildRequest,
  type CollectionBuildResponse,
} from '@overflow2026/shared';
import { useSession } from '../auth/useSession';
import { SignInButton } from '../auth/SignInButton';
import { useWalrusUpload } from '../walrus/useWalrusUpload';
import { generate } from '../lib/api';
import { PromptInput } from '../creator/PromptInput';
import { NameInput } from '../creator/NameInput';
import {
  VariantEditor,
  newVariantEditorState,
  hexToBaseColorRgb,
  type VariantEditorState,
} from './VariantEditor';
import { VariantPreview } from './VariantPreview';
import {
  buildCollectionPtb,
  DEFAULT_COLLECTION_LICENSE,
} from './buildCollectionPtb';

type Phase =
  | 'prompt'              // entering prompt for base car
  | 'generating-base'     // POST /api/generate in-flight
  | 'editing-variants'    // base GLB resolved; variant editor visible
  | 'building-variants'   // POST /api/collection/build in-flight
  | 'uploading'           // useWalrusUpload in-flight (popups 1+2)
  | 'signing'             // signAndExecute in-flight (popup 3)
  | 'success'
  | 'error';

// Reuse the dapp-kit → Signer bridge from CreatorFlow (kept inline rather than
// extracted to avoid touching files outside frontend/src/forge/).
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

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'untitled';
}

export function ForgePage() {
  const [phase, setPhase] = useState<Phase>('prompt');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [collectionName, setCollectionName] = useState('Neon Drift Series');
  const [baseGlb, setBaseGlb] = useState<Uint8Array | null>(null);
  const [variantGlbs, setVariantGlbs] = useState<Uint8Array[] | null>(null);
  const [editorState, setEditorState] = useState<VariantEditorState>(
    newVariantEditorState,
  );
  const [selectedPreview, setSelectedPreview] = useState(0);
  const [mintedSlug, setMintedSlug] = useState<string | null>(null);
  const [txDigest, setTxDigest] = useState<string | null>(null);

  const { session } = useSession();
  const account = useCurrentAccount();
  const signer = useDappKitSigner(account?.address ?? null);
  const { uploadFiles, stage: uploadStage } = useWalrusUpload();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  // Keep selectedPreview in bounds if the user removes rows.
  useEffect(() => {
    if (selectedPreview >= editorState.variants.length) {
      setSelectedPreview(Math.max(0, editorState.variants.length - 1));
    }
  }, [editorState.variants.length, selectedPreview]);

  const onGenerateBase = useCallback(async () => {
    setErrorMsg(null);
    setPhase('generating-base');
    try {
      const result = await generate({
        shape: 'tripo',
        prompt: prompt.trim(),
      });
      setBaseGlb(result.glbBytes);
      setPhase('editing-variants');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }, [prompt]);

  const onMint = useCallback(async () => {
    if (!session || !signer || !baseGlb) return;
    setErrorMsg(null);
    setPhase('building-variants');
    try {
      // 1. Backend material-swap → N swapped GLBs.
      const buildReq: CollectionBuildRequest = {
        baseGlbBase64: bytesToBase64(baseGlb),
        variants: editorState.variants.map((row) => ({
          baseColorRgb: hexToBaseColorRgb(row.colorHex),
          textureId: row.textureId,
          paramsJson: JSON.stringify({
            color: row.colorHex,
            texture: row.textureId,
          }),
        })),
      };
      const buildRes = await fetch('/api/collection/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildReq),
      });
      if (!buildRes.ok) {
        const txt = await buildRes.text().catch(() => '');
        throw new Error(`build: HTTP ${buildRes.status} ${txt}`);
      }
      const buildBody = (await buildRes.json()) as CollectionBuildResponse;
      const swapped: Uint8Array[] = buildBody.variants.map((v) =>
        base64ToBytes(v.glbBase64),
      );
      setVariantGlbs(swapped);

      // 2. Walrus quilt upload (popups 1 + 2).
      setPhase('uploading');
      const upload = await uploadFiles(swapped, signer);

      // 3. Sui PTB (popup 3).
      setPhase('signing');
      const firstBlob = upload.blobObjects[0];
      if (!firstBlob) throw new Error('Walrus upload returned no blob');
      const slug = slugify(collectionName);
      const lineageBlobId = upload.blobIds[0] ?? '';
      const tx = buildCollectionPtb({
        quiltBlobObjectId: firstBlob.blobObjectId,
        collectionName,
        collectionSlug: slug,
        license: DEFAULT_COLLECTION_LICENSE,
        variants: editorState.variants.map((row, i) => ({
          patchId: upload.patchIds[i] ?? '',
          paramsJson: JSON.stringify({
            color: row.colorHex,
            texture: row.textureId,
          }),
          name: `${collectionName} #${i + 1}`,
          tags: [`collection:${slug}`, row.textureId],
          priceMist: editorState.perVariantPricing
            ? row.priceMist
            : editorState.globalPriceMist,
          lineageBlobId,
          shapeType: 'tripo',
          isEncrypted: false,
        })),
      });
      const res = await signAndExecute({ transaction: tx });
      setTxDigest(res.digest);
      setMintedSlug(slug);
      setPhase('success');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }, [
    session,
    signer,
    baseGlb,
    editorState,
    collectionName,
    uploadFiles,
    signAndExecute,
  ]);

  // Mint-button copy: per plan-003 U4 Patterns note, collection mode says
  // "Sign 3 transactions to publish your collection (N variants)" — popup
  // count is always 3 regardless of N.
  const mintLabel = (() => {
    if (phase === 'building-variants') return 'Building variants…';
    if (phase === 'uploading') {
      if (uploadStage === 'awaiting-register')
        return 'Step 1 of 3 — approve Walrus register…';
      if (uploadStage === 'awaiting-certify')
        return 'Step 2 of 3 — approve Walrus certify…';
      if (uploadStage === 'relay-upload') return 'Uploading to Walrus…';
      return 'Preparing upload…';
    }
    if (phase === 'signing') return 'Step 3 of 3 — approve Sui publish…';
    if (phase === 'success') return 'Minted ✓';
    if (phase === 'error') return 'Failed — retry';
    return `Sign 3 transactions to publish your collection (${editorState.variants.length} variants)`;
  })();

  const mintBusy =
    phase === 'building-variants' ||
    phase === 'uploading' ||
    phase === 'signing';
  const canMint =
    !!session &&
    !!signer &&
    !!baseGlb &&
    collectionName.trim().length > 0 &&
    !mintBusy &&
    phase !== 'success';

  return (
    <div
      style={{ padding: 16, maxWidth: 960, margin: '0 auto' }}
      data-testid="forge-page"
    >
      <h2>Collection Forge</h2>
      <p style={{ fontSize: 12, color: '#888' }}>
        Curated textures: {TEXTURE_LIBRARY.length}. Variant cap per collection:
        16.
      </p>

      {/* Phase 1: prompt → base car */}
      {(phase === 'prompt' ||
        phase === 'generating-base' ||
        phase === 'error') &&
        !baseGlb && (
          <div data-testid="forge-prompt-stage">
            <PromptInput
              value={prompt}
              onChange={setPrompt}
              disabled={phase === 'generating-base'}
            />
            <button
              type="button"
              onClick={onGenerateBase}
              disabled={phase === 'generating-base' || prompt.trim() === ''}
              style={{ marginTop: 12 }}
              data-testid="forge-generate-base"
            >
              {phase === 'generating-base'
                ? 'Generating base car via Tripo… ~60 sec'
                : 'Generate base car'}
            </button>
            {phase === 'error' && errorMsg && (
              <div
                role="alert"
                style={{ color: 'crimson', marginTop: 8 }}
                data-testid="forge-error"
              >
                {errorMsg}
              </div>
            )}
          </div>
        )}

      {/* Phase 2: variant editor + mint */}
      {baseGlb && phase !== 'success' && (
        <div data-testid="forge-editor-stage">
          <div style={{ marginBottom: 12 }}>
            <NameInput
              value={collectionName}
              onChange={setCollectionName}
              disabled={mintBusy}
            />
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 16,
            }}
          >
            <VariantEditor
              state={editorState}
              onChange={setEditorState}
              disabled={mintBusy}
            />
            <VariantPreview
              variants={editorState.variants}
              variantGlbs={variantGlbs ?? undefined}
              selectedIndex={selectedPreview}
              onSelect={setSelectedPreview}
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <button
              type="button"
              onClick={onMint}
              disabled={!canMint}
              data-testid="forge-mint-button"
            >
              {mintLabel}
            </button>
            {!session && (
              <div
                data-testid="forge-signin-hint"
                style={{ marginTop: 8 }}
              >
                <div
                  style={{ fontSize: 12, color: '#888', marginBottom: 4 }}
                >
                  Sign in to mint:
                </div>
                <SignInButton />
              </div>
            )}
            {phase === 'error' && errorMsg && (
              <div
                role="alert"
                style={{ color: 'crimson', marginTop: 8 }}
                data-testid="forge-error"
              >
                {errorMsg}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Phase 3: success */}
      {phase === 'success' && mintedSlug && (
        <div data-testid="forge-success">
          <h3>Minted ✓</h3>
          <p>
            View collection at{' '}
            <Link
              to={`/collection/${mintedSlug}`}
              data-testid="forge-collection-link"
            >
              /collection/{mintedSlug}
            </Link>
          </p>
          {txDigest && (
            <a
              href={`https://suiscan.xyz/testnet/tx/${txDigest}`}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="forge-explorer-link"
            >
              View on Sui Explorer
            </a>
          )}
        </div>
      )}
    </div>
  );
}
