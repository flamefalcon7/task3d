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
  hexToBaseColorRgb,
  type VariantEditorState,
} from '../forge/VariantEditor';
import { VariantPreview } from '../forge/VariantPreview';
import { buildLaunchCollectionWithTokensPtb } from '../sui/collectionTxBuilders';

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

export function LaunchCollectionPage() {
  const { session } = useSession();
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
    if (!session || !baseGlb) throw new Error('build: session + base GLB required');
    const buildReq: CollectionBuildRequest = {
      baseGlbBase64: bytesToBase64(baseGlb),
      variants: editorState.variants.map((row) => ({
        baseColorRgb: hexToBaseColorRgb(row.colorHex),
        textureId: row.textureId,
        paramsJson: JSON.stringify({ color: row.colorHex, texture: row.textureId }),
      })),
    };
    const res = await fetch('/api/collection/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.jwt}` },
      body: JSON.stringify(buildReq),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`build: HTTP ${res.status} ${txt}`);
    }
    const body = (await res.json()) as CollectionBuildResponse;
    const swapped = body.variants.map((v) => base64ToBytes(v.glbBase64));
    setVariantGlbs(swapped);
    return swapped;
  }, [session, baseGlb, editorState]);

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
      <div data-testid="launch-page" style={{ padding: 24, color: '#ddd', background: '#15171b', minHeight: '100vh' }}>
        <h1>Launch an NFT Collection</h1>
        <p>Sign in to fork a base model into a collection.</p>
        <SignInButton />
      </div>
    );
  }

  const busy =
    phase === 'building-variants' || phase === 'uploading' || phase === 'signing';

  const launchLabel = (() => {
    if (phase === 'building-variants') return `Material-swapping ${editorState.variants.length} variants…`;
    if (phase === 'uploading') {
      if (uploadStage === 'awaiting-register') return 'Step 1 of 3 — approve Walrus register…';
      if (uploadStage === 'awaiting-certify') return 'Step 2 of 3 — approve Walrus certify…';
      return 'Uploading variants to Walrus…';
    }
    if (phase === 'signing') return `Step 3 of 3 — approve launch (collection + ${editorState.variants.length} tokens)…`;
    if (phase === 'success') return 'Launched ✓';
    return `Launch collection (${editorState.variants.length} tokens) — 3 signatures`;
  })();

  return (
    <div data-testid="launch-page" style={{ padding: 24, color: '#ddd', background: '#15171b', minHeight: '100vh', fontFamily: 'system-ui' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Launch an NFT Collection</h1>
        <Link to="/" style={{ color: '#7aa2ff' }}>← Browse</Link>
      </header>

      {/* Step 1 — pick the base Model3D to fork */}
      <section data-testid="base-picker" style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 15 }}>1. Pick a base model to fork</h2>
        {modelsLoading && <p style={{ color: '#888' }}>Loading models…</p>}
        {!modelsLoading && forkable.length === 0 && (
          <p style={{ color: '#888' }} data-testid="no-base-models">
            No forkable models yet — publish one on <Link to="/create" style={{ color: '#7aa2ff' }}>/create</Link> first.
          </p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
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
                style={{
                  textAlign: 'left',
                  padding: 10,
                  minWidth: 180,
                  background: picked ? '#1f2630' : '#1a1c20',
                  border: picked ? '2px solid #7aa2ff' : '2px solid #333',
                  color: '#ddd',
                  cursor: 'pointer',
                  borderRadius: 6,
                }}
              >
                <div style={{ fontWeight: 600 }}>{m.name || '(unnamed)'}</div>
                <div style={{ fontSize: 12, color: '#9aa' }}>
                  fork fee: {mistToSui(m.derivativeMintFee)} SUI · royalty: {(m.derivativeRoyaltyBps / 100).toFixed(2)}%
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {base && (
        <section data-testid="authoring" style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15 }}>2. Author variants</h2>
          <p style={{ fontSize: 12, color: '#9aa' }}>
            Forking <strong>{base.name}</strong> — you pay{' '}
            <strong>{mistToSui(base.derivativeMintFee)} SUI</strong> to its creator, and inherit a{' '}
            <strong>{(base.derivativeRoyaltyBps / 100).toFixed(2)}%</strong> resale royalty back to them.
          </p>

          <label style={{ display: 'block', marginBottom: 8 }}>
            Collection name{' '}
            <input
              data-testid="collection-name-input"
              value={collectionName}
              onChange={(e) => setCollectionName(e.target.value)}
              disabled={busy}
            />
          </label>
          <label style={{ display: 'block', marginBottom: 12 }}>
            Register fee for game devs (SUI){' '}
            <input
              data-testid="register-fee-input"
              value={registerFeeSui}
              onChange={(e) => setRegisterFeeSui(e.target.value)}
              disabled={busy}
            />
          </label>

          <VariantEditor state={editorState} onChange={setEditorState} disabled={busy} />
          <VariantPreview
            variants={editorState.variants}
            variantGlbs={variantGlbs ?? undefined}
            selectedIndex={selectedPreview}
            onSelect={setSelectedPreview}
          />

          <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" onClick={() => void onPreview()} disabled={busy} data-testid="preview-button">
              Preview variants
            </button>
            <button type="button" onClick={() => void onLaunch()} disabled={busy} data-testid="launch-button">
              {launchLabel}
            </button>
          </div>
        </section>
      )}

      {errorMsg && (
        <div data-testid="launch-error" style={{ color: 'crimson', marginTop: 12 }}>{errorMsg}</div>
      )}
      {phase === 'success' && txDigest && (
        <div data-testid="launch-success" style={{ color: '#7CFC00', marginTop: 12 }}>
          Collection launched —{' '}
          <a href={`https://suiscan.xyz/testnet/tx/${txDigest}`} target="_blank" rel="noreferrer" style={{ color: '#7aa2ff' }}>
            view tx
          </a>
        </div>
      )}
    </div>
  );
}
