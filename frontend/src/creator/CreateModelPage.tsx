import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSignTransaction,
} from '@mysten/dapp-kit';
import { PreviewCanvas } from '../babylon/PreviewCanvas';
import { generate } from '../lib/api';
import { useWalrusUpload } from '../walrus/useWalrusUpload';
import { useSession, isJwtExpired } from '../auth/useSession';
import { SignInButton } from '../auth/SignInButton';
import { MintButton, type MintStatus } from './MintButton';
import {
  buildPayForApiCallPtb,
  buildPublishPtb,
  TRIPO_FEE_MIST,
} from '../sui/modelTxBuilders';
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

// D-032/D-033/D-034: the canonical creator mint page. Two GLB sources —
// Tripo prompt (SUI-fee-gated, D-034) or a user-uploaded .glb — both converge
// on Walrus upload → model3d::publish (shared object). Procedural generation
// is gone (U9 removes the leftovers).

type SourceMode = 'tripo' | 'upload';
type GenStatus = 'idle' | 'paying' | 'generating' | 'error';

const GLB_MAGIC = [0x67, 0x6c, 0x54, 0x46]; // 'glTF'
const MAX_GLB_BYTES = 12 * 1024 * 1024;

// D-040 — L1 license policy collapses to two enforced meanings: Open
// (permissionless, 2) lets anyone who pays the fork fee derive; Restricted (0)
// is creator-only. ALLOW_LIST (1) is dropped — it has no on-chain address list
// in v1 and the contract treats any non-permissionless value as creator-only.
const POLICIES = [
  { value: 2, label: 'Open', sub: 'Anyone can fork (permissionless)' },
  { value: 0, label: 'Restricted', sub: 'Only I can fork' },
] as const;

type PolicyValue = (typeof POLICIES)[number]['value'];

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

// Inline styles for this page. Page-level helpers live in tokens.ts; the rest
// are page-local primitives (toggle cells, policy cards, viewer aspect-ratio).

const mainStyle: CSSProperties = {
  maxWidth: 920,
  margin: '0 auto',
  padding: '32px 24px 64px',
};

const headerStack: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 32 };

const sectionLabel: CSSProperties = { ...monoLabel, marginBottom: 8, display: 'block' };

const toggleRow: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  border: tokens.border.primary,
  marginBottom: 24,
};

function toggleCell(active: boolean): CSSProperties {
  return {
    background: active ? tokens.color.accent : tokens.color.paperPure,
    color: active ? tokens.color.accentInk : tokens.color.ink,
    fontFamily: tokens.font.mono,
    fontSize: 12,
    letterSpacing: '1px',
    textTransform: 'uppercase',
    padding: '12px 16px',
    cursor: 'pointer',
    border: 'none',
    borderRight: active ? 'none' : tokens.border.primary,
    textAlign: 'center',
  };
}

const promptArea: CSSProperties = {
  ...inputStyle,
  width: '100%',
  resize: 'vertical',
  minHeight: 80,
};

const viewerWellSized: CSSProperties = {
  ...viewerWell,
  aspectRatio: '16 / 10',
  marginTop: 24,
  border: tokens.border.primary,
};

const metadataGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: 24,
  marginTop: 24,
};

const fullRow: CSSProperties = { gridColumn: '1 / -1' };

const policyCardRow: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 12,
};

function policyCard(active: boolean): CSSProperties {
  return {
    ...card,
    border: active ? `2px solid ${tokens.color.accent}` : tokens.border.primary,
    padding: 16,
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  };
}

const errorBanner: CSSProperties = {
  ...monoLabel,
  color: tokens.color.err,
  marginTop: 16,
  padding: '10px 12px',
  border: `1.5px solid ${tokens.color.err}`,
};

const statusPill: CSSProperties = {
  ...monoLabel,
  color: tokens.color.muted,
  marginLeft: 12,
  display: 'inline-block',
};

const wireframeOverlay: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: tokens.color.wellInk,
  pointerEvents: 'none',
};

// SVG wireframe-cube placeholder used in the empty viewer well. Stroke + opacity
// per docs/ux/design-tokens.md §6 viewer-well guidance.
function WireframePlaceholder() {
  return (
    <svg width="120" height="120" viewBox="0 0 100 100" style={wireframeOverlay} aria-hidden>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeOpacity="0.3"
      >
        <polygon points="30,30 70,30 80,40 80,80 40,80 30,70" />
        <polyline points="30,30 30,70 40,80" />
        <polyline points="30,70 70,70 80,80" />
        <polyline points="70,30 70,70" />
        <polyline points="40,40 80,40 80,80" />
        <polyline points="40,40 40,80" />
      </g>
    </svg>
  );
}

export function CreateModelPage() {
  const [sourceMode, setSourceMode] = useState<SourceMode>('tripo');
  const [prompt, setPrompt] = useState('');
  const [genStatus, setGenStatus] = useState<GenStatus>('idle');
  const [genError, setGenError] = useState<string | null>(null);
  const [genElapsed, setGenElapsed] = useState(0);

  const [glb, setGlb] = useState<Uint8Array | null>(null);
  const [glbUrl, setGlbUrl] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const [name, setName] = useState('');
  const [tagsStr, setTagsStr] = useState('');
  const [policy, setPolicy] = useState<PolicyValue>(2);
  const [feeSui, setFeeSui] = useState('0');
  const [royaltyBps, setRoyaltyBps] = useState(500);

  const [mintStatus, setMintStatus] = useState<MintStatus>('idle');
  const [mintError, setMintError] = useState<string | null>(null);
  const [txDigest, setTxDigest] = useState<string | null>(null);

  const { session, clearSession } = useSession();
  const account = useCurrentAccount();
  const { uploadBlob, stage: uploadStage } = useWalrusUpload();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const signer = useDappKitSigner(account?.address ?? null);

  useEffect(() => {
    if (!glbUrl) return;
    return () => URL.revokeObjectURL(glbUrl);
  }, [glbUrl]);

  // Tick the elapsed-seconds counter while generating (— GENERATING (Ns)).
  useEffect(() => {
    if (genStatus !== 'paying' && genStatus !== 'generating') {
      setGenElapsed(0);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => setGenElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [genStatus]);

  const setGlbBytes = useCallback((bytes: Uint8Array) => {
    setGlb(bytes);
    setConfirmed(false);
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'model/gltf-binary' }));
    setGlbUrl(url);
  }, []);

  // Tripo: pay the SUI service fee, then call the gated /api/generate.
  const onGenerate = useCallback(async () => {
    if (!session || !prompt.trim()) return;
    // Guard the payment: if the JWT is already expired, bail BEFORE charging
    // SUI — otherwise the user pays and the gated /api/generate then 401s.
    if (isJwtExpired(session.jwt)) {
      clearSession();
      setGenError('Your session expired. Please sign in again, then retry — you have not been charged.');
      setGenStatus('error');
      return;
    }
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
      setGlbBytes(result.glbBytes);
      setGenStatus('idle');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Token expired mid-flight (after the pre-check, before/at the call).
      // Clear the session so the page re-gates to sign-in.
      if (/HTTP 401/.test(msg)) {
        clearSession();
        setGenError('Your session expired. Please sign in again, then retry.');
      } else {
        setGenError(msg);
      }
      setGenStatus('error');
    }
  }, [session, prompt, signAndExecute, setGlbBytes, clearSession]);

  const onUpload = useCallback(
    async (file: File) => {
      setGenError(null);
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!isValidGlb(bytes)) {
        setGenError('Not a valid .glb file (max 12MB, must start with the glTF magic).');
        return;
      }
      setGlbBytes(bytes);
      if (!name) setName(file.name.replace(/\.glb$/i, ''));
    },
    [setGlbBytes, name],
  );

  const onMint = useCallback(async () => {
    if (!session || !signer || !glb || !name.trim()) return;
    setMintError(null);
    setMintStatus('uploading');
    try {
      // D-037 (option A): the GLB is uploaded as a STANDALONE blob (not quilted)
      // so its blob id resolves directly at /v1/blobs/<id> — both the on-chain
      // Blob object and glb_blob_id come from this one upload. lineage.json is
      // no longer separately persisted (it was never resolved anywhere); the
      // lineage pointer collapses onto the GLB's own blob id.
      const glbBlob = await uploadBlob(glb, signer);
      setMintStatus('signing');
      const tags = tagsStr.split(',').map((t) => t.trim()).filter(Boolean);
      const { tx } = buildPublishPtb({
        blobObjectId: glbBlob.blobObjectId,
        shapeType: sourceMode,
        paramsJson: JSON.stringify(sourceMode === 'tripo' ? { prompt } : { source: 'upload' }),
        name: name.trim(),
        tags,
        lineageBlobId: glbBlob.blobId,
        glbBlobId: glbBlob.blobId,
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
  }, [session, signer, glb, name, uploadBlob, tagsStr, sourceMode, prompt, policy, feeSui, royaltyBps, signAndExecute]);

  if (!session) {
    return (
      <div data-testid="create-page" style={pagePaper}>
        <main style={mainStyle}>
          <div style={headerStack}>
            <span style={eyebrow}>— L1 / PUBLISH</span>
            <h1 style={displayHeadline}>Make a model.</h1>
            <p style={{ ...monoLabel, color: tokens.color.muted, marginTop: 8 }}>
              Sign in to publish a model
            </p>
          </div>
          <SignInButton />
        </main>
      </div>
    );
  }

  const haveModel = glb !== null;
  const genBusy = genStatus === 'paying' || genStatus === 'generating';

  const generateLabel =
    genStatus === 'paying'
      ? `— APPROVING FEE (${genElapsed}s)`
      : genStatus === 'generating'
        ? `— GENERATING (${genElapsed}s)`
        : haveModel
          ? `GENERATE AGAIN (${Number(TRIPO_FEE_MIST) / 1e9} SUI)`
          : `PAY ${Number(TRIPO_FEE_MIST) / 1e9} SUI & GENERATE`;

  return (
    <div data-testid="create-page" style={pagePaper}>
      <main style={mainStyle}>
        <div style={headerStack}>
          <span style={eyebrow}>— L1 / PUBLISH</span>
          <h1 style={displayHeadline}>Make a model.</h1>
        </div>

        <span style={sectionLabel}>SOURCE</span>
        <div role="radiogroup" aria-label="source" style={toggleRow}>
          <button
            type="button"
            role="radio"
            aria-checked={sourceMode === 'tripo'}
            onClick={() => setSourceMode('tripo')}
            style={toggleCell(sourceMode === 'tripo')}
          >
            Generate with Tripo
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={sourceMode === 'upload'}
            aria-label="Upload my own .glb"
            onClick={() => setSourceMode('upload')}
            style={toggleCell(sourceMode === 'upload')}
          >
            Upload my own .glb
          </button>
        </div>

        {sourceMode === 'tripo' ? (
          <div>
            <span style={sectionLabel}>PROMPT</span>
            <textarea
              data-testid="prompt-input"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the model — e.g., 'ornate wooden chest with brass fittings'"
              rows={3}
              style={promptArea}
            />
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                data-testid="generate-button"
                onClick={onGenerate}
                disabled={genBusy || !prompt.trim()}
                style={buttonPrimary}
              >
                {generateLabel}
              </button>
              {genBusy && <span style={statusPill}>— SUI FEE-GATED · ~30S TYPICAL</span>}
            </div>
          </div>
        ) : (
          <div>
            <span style={sectionLabel}>GLB FILE</span>
            <input
              data-testid="glb-file-input"
              type="file"
              accept=".glb"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onUpload(f);
              }}
              style={{ ...inputStyle, padding: 8 }}
            />
            <p style={{ ...monoLabel, color: tokens.color.hint, marginTop: 8 }}>
              MAX 12 MB · MUST START WITH GLTF MAGIC
            </p>
          </div>
        )}

        {genError && (
          <div data-testid="gen-error" style={errorBanner}>
            FAILED · {genError}
          </div>
        )}

        <div style={viewerWellSized}>
          {haveModel ? <PreviewCanvas glbUrl={glbUrl} /> : <WireframePlaceholder />}
        </div>

        {haveModel && sourceMode === 'tripo' && !confirmed && (
          <div style={{ marginTop: 16 }}>
            <button
              data-testid="confirm-model"
              onClick={() => setConfirmed(true)}
              style={buttonOutline}
            >
              USE THIS MODEL →
            </button>
          </div>
        )}

        {haveModel && (sourceMode === 'upload' || confirmed) && (
          <div data-testid="metadata-form" style={metadataGrid}>
            <label style={fullRow}>
              <span style={sectionLabel}>MODEL NAME</span>
              <input
                data-testid="name-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ ...inputStyle, width: '100%' }}
              />
            </label>
            <label style={fullRow}>
              <span style={sectionLabel}>TAGS (COMMA-SEPARATED)</span>
              <input
                value={tagsStr}
                onChange={(e) => setTagsStr(e.target.value)}
                style={{ ...inputStyle, width: '100%' }}
              />
            </label>
            <fieldset style={{ ...fullRow, border: 'none', padding: 0, margin: 0 }}>
              <legend style={sectionLabel}>LICENSE POLICY</legend>
              <div style={policyCardRow}>
                {POLICIES.map((p) => (
                  <label key={p.value} style={policyCard(policy === p.value)}>
                    <input
                      type="radio"
                      name="policy"
                      data-testid={`policy-${p.value}`}
                      checked={policy === p.value}
                      onChange={() => setPolicy(p.value)}
                      style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
                    />
                    <span style={{ ...monoLabel, color: tokens.color.ink }}>{p.label}</span>
                    <span style={{ ...monoLabel, color: tokens.color.hint, letterSpacing: '0.5px', textTransform: 'none' }}>
                      {p.sub}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label>
              <span style={sectionLabel}>DERIVATIVE MINT FEE (SUI)</span>
              <input
                value={feeSui}
                onChange={(e) => setFeeSui(e.target.value)}
                style={{ ...inputStyle, width: '100%' }}
              />
            </label>
            <label>
              <span style={sectionLabel}>DERIVATIVE ROYALTY (BPS, ≤3000)</span>
              <input
                type="number"
                value={royaltyBps}
                onChange={(e) => setRoyaltyBps(Math.min(3000, Math.max(0, Number(e.target.value))))}
                style={{ ...inputStyle, width: '100%' }}
              />
            </label>
            <div style={fullRow}>
              <MintButton
                status={mintStatus}
                uploadStage={uploadStage}
                disabled={!name.trim()}
                onClick={onMint}
                errorMessage={mintError ?? undefined}
                explorerUrl={txDigest ? `https://suiscan.xyz/testnet/tx/${txDigest}` : undefined}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
