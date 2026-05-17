// U4 — Collection Forge page. Three-popup mint flow (KTD-1):
//   1. POST /api/generate → base car GLB (Tripo, ~60s typical)
//   2. POST /api/collection/build → N material-swapped variant GLBs
//   3. useWalrusUpload(files=N variants) → 1 Sui Blob + N patch ids (2 popups)
//   4. buildCollectionPtb → signAndExecuteTransaction (1 popup)
// Total: 3 wallet popups regardless of N (Walrus quilt batches register+certify).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
// @mysten/walrus@1.1.7 calls signer.signAndExecuteTransaction internally —
// see CreatorFlow.tsx for the full rationale.
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

// editorState contains `bigint` fields (priceMist) that JSON.stringify rejects
// by default. Stringify with a replacer that converts bigints to their decimal
// string form so the hash is stable + non-throwing. Only used for staleness
// comparison, never for transport over the wire.
function hashEditorState(state: VariantEditorState): string {
  return JSON.stringify(state, (_, v) =>
    typeof v === 'bigint' ? `${v.toString()}n` : v,
  );
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'untitled';
}

// Wall-clock elapsed time in ms since `active` last flipped false→true.
// Resets to 0 when active goes false. Used to drive Tripo progress bar
// + mint-stage elapsed counter without backend SSE.
function useElapsed(active: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);
  useEffect(() => {
    if (!active) {
      startRef.current = null;
      setElapsed(0);
      return;
    }
    startRef.current = Date.now();
    setElapsed(0);
    const id = setInterval(() => {
      if (startRef.current !== null) setElapsed(Date.now() - startRef.current);
    }, 200);
    return () => clearInterval(id);
  }, [active]);
  return elapsed;
}

// Rotate a sequence of "what's happening" messages every `windowMs` —
// even when the underlying process exposes no progress signal, rotating
// text gives the user a sense the system is alive + tells them what to
// expect at each stage of the latency budget.
function rotatingSubtext(elapsedMs: number, messages: readonly string[], windowMs = 5000): string {
  if (messages.length === 0) return '';
  const idx = Math.floor(elapsedMs / windowMs) % messages.length;
  return messages[idx]!;
}

const TRIPO_MESSAGES = [
  'Tripo is generating the base mesh…',
  'Computing UV mapping for texture coordinates…',
  'Optimising topology toward the low-poly target…',
  'Baking final geometry…',
  'Encoding GLB for download…',
  'Just about there — finalising export…',
] as const;

const TRIPO_EXPECTED_MS = 90_000;
const TRIPO_BAR_CAP = 0.9; // bar fills 0→90% then sits until done

export function ForgePage() {
  const [phase, setPhase] = useState<Phase>('prompt');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [collectionName, setCollectionName] = useState('');
  const [baseGlb, setBaseGlb] = useState<Uint8Array | null>(null);
  const [variantGlbs, setVariantGlbs] = useState<Uint8Array[] | null>(null);
  // Snapshot of the editor state the current variantGlbs were built from.
  // Mint reuses variantGlbs (skipping the rebuild) only when this matches the
  // live editorState — keeps the preview-then-mint path fast without risking
  // stale previews if the user changes a color and immediately mints.
  const [builtForStateJson, setBuiltForStateJson] = useState<string | null>(null);
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

  // UX: live elapsed timers + rotating subtext during long-wait stages.
  // Walrus byte-level upload progress isn't exposed by the SDK (fetch
  // upload progress requires XHR), so we surface stage transitions +
  // estimated payload size instead.
  const tripoElapsed = useElapsed(phase === 'generating-base');
  const mintElapsed = useElapsed(
    phase === 'building-variants' ||
      phase === 'uploading' ||
      phase === 'signing',
  );
  const totalUploadMb = useMemo(() => {
    if (!variantGlbs) return null;
    const totalBytes = variantGlbs.reduce((acc, g) => acc + g.byteLength, 0);
    return totalBytes / (1024 * 1024);
  }, [variantGlbs]);

  // Keep selectedPreview in bounds if the user removes rows.
  useEffect(() => {
    if (selectedPreview >= editorState.variants.length) {
      setSelectedPreview(Math.max(0, editorState.variants.length - 1));
    }
  }, [editorState.variants.length, selectedPreview]);

  const onGenerateBase = useCallback(async () => {
    if (!session) {
      setErrorMsg('Sign in first — Tripo generation is JWT-gated to protect the API budget.');
      setPhase('error');
      return;
    }
    setErrorMsg(null);
    setPhase('generating-base');
    try {
      const result = await generate(
        { shape: 'tripo', prompt: prompt.trim() },
        session.jwt,
      );
      setBaseGlb(result.glbBytes);
      setPhase('editing-variants');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }, [prompt, session]);

  // Dev-only: load a pre-generated GLB from frontend/public/dev-glbs/ instead
  // of burning Tripo credits. Lets us exercise the material-swap → Walrus
  // quilt → Sui PTB path repeatedly while iterating. Hidden in prod builds
  // (import.meta.env.DEV is false at build time → block tree-shakes away).
  const onLoadDevGlb = useCallback(async (filename: string) => {
    setErrorMsg(null);
    setPhase('generating-base');
    try {
      const res = await fetch(`/dev-glbs/${filename}`);
      if (!res.ok) throw new Error(`dev fixture HTTP ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      setBaseGlb(bytes);
      setPhase('editing-variants');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }, []);

  // Calls /api/collection/build for the current editorState. Used by both
  // onPreview (standalone) and onMint (as the first step). Returns the swapped
  // GLBs so the caller can chain into upload without re-reading state.
  const runBuildVariants = useCallback(async (): Promise<Uint8Array[]> => {
    if (!session || !baseGlb) throw new Error('build: session + baseGlb required');
    const stateJson = hashEditorState(editorState);
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
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.jwt}`,
      },
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
    setBuiltForStateJson(stateJson);
    return swapped;
  }, [baseGlb, editorState, session]);

  const onPreview = useCallback(async () => {
    if (!session || !baseGlb) return;
    setErrorMsg(null);
    setPhase('building-variants');
    try {
      await runBuildVariants();
      setPhase('editing-variants');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }, [session, baseGlb, runBuildVariants]);

  const onMint = useCallback(async () => {
    if (!session || !signer || !baseGlb) return;
    setErrorMsg(null);
    setPhase('building-variants');
    try {
      // 1. Backend material-swap → N swapped GLBs (skip if a fresh preview
      //    already produced GLBs matching the current editorState).
      const stateJson = hashEditorState(editorState);
      const swapped: Uint8Array[] =
        variantGlbs && builtForStateJson === stateJson
          ? variantGlbs
          : await runBuildVariants();

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
    variantGlbs,
    builtForStateJson,
    runBuildVariants,
  ]);

  // Mint-button copy: per plan-003 U4 Patterns note, collection mode says
  // "Sign 3 transactions to publish your collection (N variants)" — popup
  // count is always 3 regardless of N.
  const variantCount = editorState.variants.length;
  const mintLabel = (() => {
    if (phase === 'building-variants')
      return `Material-swapping ${variantCount} variants…`;
    if (phase === 'uploading') {
      if (uploadStage === 'encoding')
        return `Encoding ${variantCount} variants into Walrus quilt…`;
      if (uploadStage === 'awaiting-register')
        return 'Step 1 of 3 — approve Walrus register in your wallet…';
      if (uploadStage === 'relay-upload') {
        const sizeHint = totalUploadMb !== null
          ? ` (~${totalUploadMb.toFixed(1)} MB)`
          : '';
        return `Uploading to Walrus testnet${sizeHint}…`;
      }
      if (uploadStage === 'awaiting-certify')
        return 'Step 2 of 3 — approve Walrus certify in your wallet…';
      return 'Preparing upload…';
    }
    if (phase === 'signing')
      return `Step 3 of 3 — approve Sui mint (Collection + ${variantCount} Model3Ds)…`;
    if (phase === 'success') return 'Minted ✓';
    if (phase === 'error') return 'Failed — retry';
    return `Sign 3 transactions to publish your collection (${variantCount} variants)`;
  })();

  // Subtext shown beneath the mint button while busy — tells the user what
  // to expect at each stage so the Walrus + Sui popups feel scripted
  // rather than surprise.
  const mintSubtext = (() => {
    if (phase === 'building-variants')
      return 'Backend is swapping base-color + texture on each variant GLB. Usually 1-2 seconds.';
    if (phase === 'uploading') {
      if (uploadStage === 'encoding')
        return 'Encoding all variants into one Walrus quilt blob. Usually 1-3 seconds.';
      if (uploadStage === 'awaiting-register')
        return 'Your wallet should be open. This signs the on-chain register so storage nodes know to expect the upload.';
      if (uploadStage === 'relay-upload')
        return 'Streaming the quilt to a Walrus upload relay. Network-dependent — usually 5-30 seconds.';
      if (uploadStage === 'awaiting-certify')
        return 'Your wallet should be open. This signs the storage certificate to make the blob retrievable.';
      return '';
    }
    if (phase === 'signing')
      return `Your wallet should be open. One Sui PTB creates the Collection + ${variantCount} Model3D shared objects.`;
    return '';
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
  const previewIsStale =
    !!variantGlbs && builtForStateJson !== hashEditorState(editorState);
  const canPreview = !!session && !!baseGlb && !mintBusy && phase !== 'success';
  const previewLabel = (() => {
    if (phase === 'building-variants' && !signer)
      return `Building ${editorState.variants.length} variants…`;
    if (phase === 'building-variants')
      return `Building ${editorState.variants.length} variants…`;
    if (!variantGlbs) return `Preview ${editorState.variants.length} variants`;
    if (previewIsStale) return 'Re-preview (variants changed)';
    return 'Preview up to date ✓';
  })();

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
            {!session && (
              <div
                data-testid="forge-prompt-signin-hint"
                style={{
                  marginBottom: 12,
                  padding: 10,
                  border: '1px solid #fbcc7a',
                  background: '#fff7e6',
                  borderRadius: 6,
                }}
              >
                <div style={{ fontSize: 13, color: '#7a4a00', marginBottom: 6 }}>
                  Sign in first — Tripo generation costs API credits, so prompt mode is JWT-gated.
                </div>
                <SignInButton />
              </div>
            )}
            <PromptInput
              value={prompt}
              onChange={setPrompt}
              disabled={phase === 'generating-base'}
            />
            <button
              type="button"
              onClick={onGenerateBase}
              disabled={
                phase === 'generating-base' ||
                prompt.trim() === '' ||
                !session
              }
              style={{ marginTop: 12 }}
              data-testid="forge-generate-base"
            >
              {phase === 'generating-base'
                ? `Generating via Tripo… ${Math.floor(tripoElapsed / 1000)}s elapsed`
                : !session
                ? 'Sign in to generate'
                : 'Generate base model'}
            </button>

            {phase === 'generating-base' && (
              <div data-testid="forge-tripo-progress" style={{ marginTop: 12 }}>
                {/* Estimated progress bar — fills 0→90% over ~90s, sits
                    until done. The Walrus SDK + Tripo API don't expose
                    per-byte progress to the browser, so this is a
                    visual proxy that gives users a sense of motion. */}
                <progress
                  data-testid="forge-tripo-bar"
                  max={1}
                  value={Math.min(
                    (tripoElapsed / TRIPO_EXPECTED_MS) * TRIPO_BAR_CAP,
                    TRIPO_BAR_CAP,
                  )}
                  style={{ width: '100%', height: 8 }}
                />
                <div
                  style={{
                    fontSize: 12,
                    color: '#666',
                    marginTop: 6,
                    minHeight: '1.5em',
                  }}
                  data-testid="forge-tripo-subtext"
                >
                  {tripoElapsed >= TRIPO_EXPECTED_MS
                    ? 'Taking longer than usual (Tripo typically 60-120 s). Should be ready any moment.'
                    : rotatingSubtext(tripoElapsed, TRIPO_MESSAGES)}
                </div>
                <div
                  style={{ fontSize: 11, color: '#999', marginTop: 4 }}
                  data-testid="forge-tripo-hint"
                >
                  Expected: 60-120 s. This is a real text-to-3D call —
                  Tripo's queue + render time, not our backend.
                </div>
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

            {import.meta.env.DEV && phase !== 'generating-base' && (
              <div
                data-testid="forge-dev-fixtures"
                style={{
                  marginTop: 16,
                  padding: 10,
                  border: '1px dashed #888',
                  borderRadius: 6,
                  background: '#fafafa',
                  fontSize: 12,
                }}
              >
                <div style={{ marginBottom: 6, color: '#555' }}>
                  <strong>Dev only</strong> — skip Tripo, load a pre-generated GLB
                  from <code>frontend/public/dev-glbs/</code>. Use this to
                  exercise the Walrus + Sui path without burning API credits.
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[
                    { file: 'p1.glb', label: 'p1 (762 KB)' },
                    { file: 'turbo-v1.glb', label: 'turbo-v1 (638 KB)' },
                    { file: 'v1.4.glb', label: 'v1.4 (1.7 MB)' },
                    { file: 'turbo-seg.glb', label: 'turbo-seg (5 MB)' },
                  ].map((f) => (
                    <button
                      key={f.file}
                      type="button"
                      onClick={() => onLoadDevGlb(f.file)}
                      data-testid={`forge-dev-fixture-${f.file}`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
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

          <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              type="button"
              onClick={onPreview}
              disabled={!canPreview}
              data-testid="forge-preview-button"
              title={
                previewIsStale
                  ? 'Variants changed since the last preview — click to rebuild'
                  : !variantGlbs
                  ? 'Render each variant in the preview without minting'
                  : 'Preview matches the current editor state'
              }
            >
              {previewLabel}
            </button>
            <button
              type="button"
              onClick={onMint}
              disabled={!canMint}
              data-testid="forge-mint-button"
            >
              {mintLabel}
            </button>

            {mintBusy && (
              <div
                data-testid="forge-mint-status"
                style={{ marginTop: 10, padding: 10, border: '1px solid #e0e0e0', borderRadius: 6, background: '#fafafa' }}
              >
                {mintSubtext && (
                  <div style={{ fontSize: 12, color: '#444', marginBottom: 6 }}>
                    {mintSubtext}
                  </div>
                )}
                <div style={{ fontSize: 11, color: '#888', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Elapsed: {Math.floor(mintElapsed / 1000)} s</span>
                  <span data-testid="forge-mint-stage-label">
                    Stage: {phase === 'uploading' ? `uploading / ${uploadStage}` : phase}
                  </span>
                </div>
              </div>
            )}

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
