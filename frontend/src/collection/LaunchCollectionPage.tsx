// plan-008 U12b — nft creator launch page (`/launch`). The L1→L2 fork flow,
// one wallet popup for the on-chain step (D-038 batch fn):
//   1. Pick a base Model3D (useModelIndex) → fetch its base GLB from the Walrus
//      aggregator by its standalone glb_blob_id (D-037).
//   2. Author N colored/textured variants (VariantEditor / VariantPreview).
//   3. POST /api/collection/build → N material-swapped variant GLBs.
//   4. useWalrusUpload.uploadFiles(N variants) → 1 Sui Blob + N quilt patch ids
//      (2 popups).
//   5. buildLaunchCollectionWithTokensPtb → signAndExecute (1 popup): forks the
//      model, sets the register fee, mints N owned NftTokens, shares the
//      collection, transfers the soulbound cap.
// Total: 3 wallet popups regardless of N.
//
// The derive fee paid to the base creator is the base model's
// license.derivative_mint_fee (D-002 pay-to-derive) — read from the picked
// Model3DSummary, NOT a user input, so the nft creator can't underpay and abort.

import type { CSSProperties } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSignTransaction,
} from '@mysten/dapp-kit';
import type {
  CollectionBuildRequest,
  CollectionBuildResponse,
  Model3DSummary,
} from '@overflow2026/shared';
import { useSession } from '../auth/useSession';
import { SignInButton } from '../auth/SignInButton';
import { useModelIndex } from '../browse/useModelIndex';
import { useWalrusUpload } from '../walrus/useWalrusUpload';
import {
  VariantEditor,
  newVariantEditorState,
  deriveUniqueLabels,
  hexToBaseColorRgb,
  type VariantEditorState,
} from '../forge/VariantEditor';
import { VariantPreview } from '../forge/VariantPreview';
import { buildLaunchCollectionWithTokensPtb } from '../sui/collectionTxBuilders';
import { PreviewCanvas } from '../babylon/PreviewCanvas';
import { glbUrlForSummary } from '../walrus/aggregator';
import {
  buttonOutline,
  buttonPrimary,
  card,
  displayHeadline,
  eyebrow,
  input as inputStyle,
  monoLabel,
  pagePaper,
  tokens,
  viewerWell,
} from '../ux/tokens';

const WALRUS_AGGREGATOR = 'https://aggregator.walrus-testnet.walrus.space';

type Phase =
  | 'picking'
  | 'editing-variants'
  | 'building-variants'
  | 'uploading'
  | 'signing'
  | 'success'
  | 'error';

// dapp-kit → @mysten/walrus Signer bridge (same shape as CreateModelPage).
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

function suiToMist(sui: string): bigint {
  const n = Number(sui);
  if (!Number.isFinite(n) || n < 0) return 0n;
  return BigInt(Math.round(n * 1e9));
}

function mistToSui(mist: string): string {
  const n = Number(mist);
  if (!Number.isFinite(n)) return '0';
  return (n / 1e9).toString();
}

// Page-local styles.

const mainStyle: CSSProperties = {
  maxWidth: 1040,
  margin: '0 auto',
  padding: '32px 24px 64px',
};

const headerStack: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 32 };
const sectionLabel: CSSProperties = { ...monoLabel, display: 'block', marginBottom: 12 };
const sectionH2: CSSProperties = {
  fontFamily: tokens.font.display,
  fontStyle: 'italic',
  fontSize: tokens.size.lg,
  fontWeight: tokens.weight.medium,
  marginBottom: 16,
};

const basePickerGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
  gap: 12,
};

function baseOptionStyle(active: boolean): CSSProperties {
  return {
    ...card,
    border: active ? `2px solid ${tokens.color.accent}` : tokens.border.primary,
    padding: 0,
    cursor: 'pointer',
    textAlign: 'left',
    display: 'flex',
    flexDirection: 'column',
    background: tokens.color.paperPure,
    overflow: 'hidden',
  };
}

const baseOptionPreview: CSSProperties = {
  ...viewerWell,
  aspectRatio: '4 / 3',
  width: '100%',
};

const baseOptionBody: CSSProperties = {
  padding: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const baseOptionName: CSSProperties = {
  fontFamily: tokens.font.display,
  fontStyle: 'italic',
  fontSize: tokens.size.md,
  fontWeight: tokens.weight.medium,
  color: tokens.color.ink,
};

const baseOptionMeta: CSSProperties = {
  ...monoLabel,
  color: tokens.color.hint,
  letterSpacing: '0.5px',
  textTransform: 'none',
  fontSize: 11,
};

const formGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: 16,
  marginBottom: 24,
};

const launchHelper: CSSProperties = {
  ...monoLabel,
  color: tokens.color.hint,
  marginTop: 8,
  letterSpacing: '1px',
};

const errorBanner: CSSProperties = {
  ...monoLabel,
  color: tokens.color.err,
  marginTop: 16,
  padding: '10px 12px',
  border: `1.5px solid ${tokens.color.err}`,
};

const successBanner: CSSProperties = {
  ...monoLabel,
  color: tokens.color.accent,
  marginTop: 16,
  padding: '10px 12px',
  border: `1.5px solid ${tokens.color.accent}`,
};

const explorerLink: CSSProperties = {
  ...monoLabel,
  color: tokens.color.ink,
  textDecoration: 'underline',
  marginLeft: 8,
};

export function LaunchCollectionPage() {
  const { session, clearSession } = useSession();
  const account = useCurrentAccount();
  const signer = useDappKitSigner(account?.address ?? null);
  const { uploadFiles, stage: uploadStage } = useWalrusUpload();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const { models, loading: modelsLoading } = useModelIndex();

  const [phase, setPhase] = useState<Phase>('picking');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [base, setBase] = useState<Model3DSummary | null>(null);
  const [baseGlb, setBaseGlb] = useState<Uint8Array | null>(null);
  const [collectionName, setCollectionName] = useState('');
  const [registerFeeSui, setRegisterFeeSui] = useState('0');
  const [editorState, setEditorState] = useState<VariantEditorState>(newVariantEditorState);
  const [selectedPreview, setSelectedPreview] = useState(0);
  const [variantGlbs, setVariantGlbs] = useState<Uint8Array[] | null>(null);
  const [txDigest, setTxDigest] = useState<string | null>(null);

  // Only models published with a standalone GLB (D-037) are forkable — older
  // mints with an empty glb_blob_id can't be resolved to a base mesh.
  const forkable = useMemo(() => models.filter((m) => m.glbBlobId !== ''), [models]);

  const onPickBase = useCallback(async (model: Model3DSummary) => {
    setErrorMsg(null);
    setBase(model);
    setVariantGlbs(null);
    // plan-013 U7 — reset the editor state with the base's unique labels so
    // the palette starts with one entry per semantic label (or `['primary']`
    // for legacy bases). Switching between bases of different label shapes
    // is rare during a launch session but supported via this reset.
    setEditorState(newVariantEditorState(deriveUniqueLabels(model.partLabels)));
    setPhase('building-variants'); // reuse spinner state while the GLB downloads
    try {
      const res = await fetch(`${WALRUS_AGGREGATOR}/v1/blobs/${model.glbBlobId}`);
      if (!res.ok) throw new Error(`Walrus aggregator ${res.status} for the base GLB`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      setBaseGlb(bytes);
      if (!collectionName) setCollectionName(`${model.name} variants`);
      setPhase('editing-variants');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }, [collectionName]);

  const runBuildVariants = useCallback(async (): Promise<Uint8Array[]> => {
    if (!session || !baseGlb || !base) throw new Error('build: session + base GLB required');
    // plan-013 U7 — resolve each variant's label→hex palette into the
    // backend's positional `partColors[]` by mapping `base.partLabels[i]` to
    // `row.palette[label]`. Missing palette entries (e.g., a base whose
    // labels diverged from the picker's uniqueLabels) fall back to a neutral
    // gray so the build endpoint always sees a complete array. Legacy bases
    // (`partLabels = []`) skip this loop entirely — the single-row editor
    // emits `palette = { primary: ... }` and the resolved array is length-1.
    const partLabels = base.partLabels;
    const resolvePartColors = (palette: Record<string, string>) => {
      if (partLabels.length === 0) {
        const hex = palette.primary ?? Object.values(palette)[0] ?? '#cccccc';
        return [{ baseColorRgb: hexToBaseColorRgb(hex), textureId: undefined }];
      }
      return partLabels.map((label) => ({
        baseColorRgb: hexToBaseColorRgb(palette[label] ?? '#cccccc'),
        textureId: undefined as unknown as undefined,
      }));
    };
    const buildReq: CollectionBuildRequest = {
      baseGlbBase64: bytesToBase64(baseGlb),
      variants: editorState.variants.map((row) => {
        const partColors = resolvePartColors(row.palette).map((pc) => ({
          baseColorRgb: pc.baseColorRgb,
          textureId: row.textureId,
        }));
        return {
          partColors,
          paramsJson: JSON.stringify({ palette: row.palette, texture: row.textureId }),
        };
      }),
    };
    const res = await fetch('/api/collection/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.jwt}` },
      body: JSON.stringify(buildReq),
    });
    if (res.status === 401) {
      // Expired/invalid JWT (24h TTL). Clear the stale session so the page
      // falls back to the sign-in gate; the wallet stays connected, so the
      // user just signs a fresh challenge and retries.
      clearSession();
      throw new Error('Your session expired. Please sign in again, then retry.');
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`build: HTTP ${res.status} ${txt}`);
    }
    const body = (await res.json()) as CollectionBuildResponse;
    const swapped = body.variants.map((v) => base64ToBytes(v.glbBase64));
    setVariantGlbs(swapped);
    return swapped;
  }, [session, baseGlb, editorState, clearSession]);

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

  const onLaunch = useCallback(async () => {
    if (!session || !signer || !base || !baseGlb) return;
    setErrorMsg(null);
    setPhase('building-variants');
    try {
      const swapped = await runBuildVariants();

      setPhase('uploading');
      const upload = await uploadFiles(swapped, signer);
      if (!upload.blobIds[0]) throw new Error('Walrus upload returned no quilt blob');

      setPhase('signing');
      const name = collectionName.trim() || `${base.name} variants`;
      const tokenNames = swapped.map((_, i) => `${name} #${i + 1}`);
      const tokenPatchIds = swapped.map((_, i) => upload.patchIds[i] ?? '');
      const { tx } = buildLaunchCollectionWithTokensPtb({
        modelId: base.objectId,
        feeMist: BigInt(base.derivativeMintFee || '0'),
        quiltBlobId: upload.blobIds[0],
        registerFeeMist: suiToMist(registerFeeSui),
        tokenNames,
        tokenPatchIds,
      });
      const res = await signAndExecute({ transaction: tx });
      setTxDigest(res.digest);
      setPhase('success');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }, [session, signer, base, baseGlb, runBuildVariants, uploadFiles, collectionName, registerFeeSui, signAndExecute]);

  if (!session) {
    return (
      <div data-testid="launch-page" style={pagePaper}>
        <main style={mainStyle}>
          <div style={headerStack}>
            <span style={eyebrow}>— L2 / MINT</span>
            <h1 style={displayHeadline}>Launch a collection.</h1>
            <p style={{ ...monoLabel, color: tokens.color.muted, letterSpacing: '0.5px', textTransform: 'none' }}>
              Sign in to fork a base model into a collection.
            </p>
          </div>
          <SignInButton />
        </main>
      </div>
    );
  }

  const busy =
    phase === 'building-variants' || phase === 'uploading' || phase === 'signing';

  const launchLabel = (() => {
    if (phase === 'building-variants') return `— BUILDING ${editorState.variants.length} VARIANTS`;
    if (phase === 'uploading') {
      if (uploadStage === 'awaiting-register') return 'Step 1 of 3 — approve Walrus register…';
      if (uploadStage === 'awaiting-certify') return 'Step 2 of 3 — approve Walrus certify…';
      return 'Uploading variants to Walrus…';
    }
    if (phase === 'signing') return `Step 3 of 3 — approve launch (collection + ${editorState.variants.length} tokens)…`;
    if (phase === 'success') return 'LAUNCHED';
    return `LAUNCH COLLECTION (${editorState.variants.length} TOKENS) →`;
  })();

  return (
    <div data-testid="launch-page" style={pagePaper}>
      <main style={mainStyle}>
        <div style={headerStack}>
          <span style={eyebrow}>— L2 / MINT</span>
          <h1 style={displayHeadline}>Launch a collection.</h1>
        </div>

        {/* Step 1 — pick the base Model3D to fork */}
        <section data-testid="base-picker" style={{ marginBottom: 32 }}>
          <h2 style={sectionH2}>1. Pick a base model to fork.</h2>
          {modelsLoading && (
            <p style={{ ...monoLabel, color: tokens.color.hint }}>— LOADING MODELS</p>
          )}
          {!modelsLoading && forkable.length === 0 && (
            <p style={{ ...monoLabel, color: tokens.color.hint, textTransform: 'none', letterSpacing: '0.5px' }} data-testid="no-base-models">
              No forkable models yet — publish one on{' '}
              <Link to="/create" style={{ color: tokens.color.ink, textDecoration: 'underline' }}>/create</Link> first.
            </p>
          )}
          <div style={basePickerGrid}>
            {forkable.map((m) => {
              const picked = base?.objectId === m.objectId;
              return (
                <button
                  key={m.objectId}
                  type="button"
                  onClick={() => void onPickBase(m)}
                  disabled={busy}
                  data-testid={`base-option-${m.objectId}`}
                  aria-pressed={picked}
                  style={baseOptionStyle(picked)}
                >
                  <div style={baseOptionPreview} data-testid={`base-option-preview-${m.objectId}`}>
                    <PreviewCanvas glbUrl={glbUrlForSummary(m)} />
                  </div>
                  <div style={baseOptionBody}>
                    <span style={baseOptionName}>{m.name || '(unnamed)'}</span>
                    <span style={baseOptionMeta}>
                      fork fee: {mistToSui(m.derivativeMintFee)} SUI · royalty: {(m.derivativeRoyaltyBps / 100).toFixed(2)}%
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {base && (
          <section data-testid="authoring" style={{ marginBottom: 32 }}>
            <h2 style={sectionH2}>2. Author variants.</h2>
            <p style={{ ...monoLabel, color: tokens.color.muted, textTransform: 'none', letterSpacing: '0.5px', marginBottom: 16 }}>
              Forking <strong>{base.name}</strong> — you pay{' '}
              <strong>{mistToSui(base.derivativeMintFee)} SUI</strong> to its creator, and inherit a{' '}
              <strong>{(base.derivativeRoyaltyBps / 100).toFixed(2)}%</strong> resale royalty back to them.
            </p>

            <div style={formGrid}>
              <label>
                <span style={sectionLabel}>COLLECTION NAME</span>
                <input
                  data-testid="collection-name-input"
                  value={collectionName}
                  onChange={(e) => setCollectionName(e.target.value)}
                  disabled={busy}
                  style={{ ...inputStyle, width: '100%' }}
                />
              </label>
              <label>
                <span style={sectionLabel}>REGISTER FEE FOR GAME DEVS (SUI)</span>
                <input
                  data-testid="register-fee-input"
                  value={registerFeeSui}
                  onChange={(e) => setRegisterFeeSui(e.target.value)}
                  disabled={busy}
                  style={{ ...inputStyle, width: '100%' }}
                />
              </label>
            </div>

            <VariantEditor
              state={editorState}
              onChange={setEditorState}
              partLabels={base?.partLabels ?? []}
              disabled={busy}
            />
            <div style={{ marginTop: 24 }}>
              <VariantPreview
                variants={editorState.variants}
                variantGlbs={variantGlbs ?? undefined}
                selectedIndex={selectedPreview}
                onSelect={setSelectedPreview}
              />
            </div>

            <div style={{ marginTop: 24, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => void onPreview()}
                disabled={busy}
                data-testid="preview-button"
                style={buttonOutline}
              >
                PREVIEW VARIANTS
              </button>
              <button
                type="button"
                onClick={() => void onLaunch()}
                disabled={busy}
                data-testid="launch-button"
                style={buttonPrimary}
              >
                {launchLabel}
              </button>
            </div>
            <p style={launchHelper}>SIGNS 3× · PAYS GAS · MINTS L2</p>
          </section>
        )}

        {errorMsg && (
          <div data-testid="launch-error" style={errorBanner}>
            × FAILED · {errorMsg}
          </div>
        )}
        {phase === 'success' && txDigest && (
          <div data-testid="launch-success" style={successBanner}>
            ✓ LAUNCHED ·
            <a
              href={`https://suiscan.xyz/testnet/tx/${txDigest}`}
              target="_blank"
              rel="noreferrer"
              style={explorerLink}
            >
              VIEW TX →
            </a>
          </div>
        )}
      </main>
    </div>
  );
}
