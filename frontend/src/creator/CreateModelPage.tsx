import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSignTransaction,
  useSuiClient,
} from '@mysten/dapp-kit';
import { MeshInfoPanel } from '../babylon/MeshInfoPanel';
import { partsColorHex, useModeCycle } from '../babylon/modePalette';
import { PartListPanel, type PartListItem } from '../babylon/PartListPanel';
import { PreviewCanvas, type PreviewCanvasHandle } from '../babylon/PreviewCanvas';
import { TaggingCanvas } from '../babylon/TaggingCanvas';
import { generate } from '../lib/api';
import { useWalrusUpload } from '../walrus/useWalrusUpload';
import { useSession, isJwtExpired } from '../auth/useSession';
import { SignInButton } from '../auth/SignInButton';
import { MintButton, type MintStatus } from './MintButton';
import {
  buildPayForApiCallPtb,
  buildPublishPtb,
  buildPublishEncryptedPtb,
  TRIPO_FEE_MIST,
  TRIPO_FEE_TREASURY,
} from '../sui/modelTxBuilders';
import { TESTNET } from '../sui/networkConfig';
import { getSealClient } from '../seal/sealClient';
import { encryptBase } from '../seal/envelope';
import { HelpIcon } from '../ux/HelpIcon';
import { SignConfirmation } from '../ux/SignConfirmation';
import { useElapsedSeconds } from '../ux/useElapsedSeconds';
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

// D-040, amended by D-076 (plan-026) — three enforced policies, with encryption
// DERIVED from the choice:
//   - Open (permissionless, 2): public base, anyone who pays the fork fee derives.
//     Unencrypted.
//   - Allow-list (1): ENCRYPTED base; anyone may fork but must pay the fork fee to
//     get the cap that decrypts it (pay-to-fork). Requires fee > 0 (EAllowListNeedsFee).
//   - Restricted (0): ENCRYPTED base, only the creator can fork/decrypt. Private —
//     not shown in the public catalog.
const POLICIES = [
  { value: 2, label: 'Open', sub: 'Public — anyone can fork (permissionless)' },
  { value: 1, label: 'Allow-list', sub: 'Encrypted — pay the fork fee to unlock' },
  { value: 0, label: 'Restricted', sub: 'Encrypted — only I can fork' },
] as const;

// Policy constants (mirror model3d.move). PERMISSIONLESS is the only unencrypted one.
const POLICY_PERMISSIONLESS = 2;
const POLICY_ALLOW_LIST = 1;

type PolicyValue = (typeof POLICIES)[number]['value'];

// plan-015 U1 — preset labels removed (D-054). Framing B reframes this step
// as "name what buyers can customize", which only works if the creator is
// forced through naming each part by hand. Continue gates on every part
// having ≥1 character (no default-on-empty escape hatch).
// `partLabels` is a positional array (one entry per filtered mesh in GLB
// node order); the empty array is the legacy single-material sentinel
// (upload mode or pre-v8 base).
//
// MAX_LABEL_LEN mirrors Move's MAX_TAG_LEN bound on part_labels. A user-typed
// label longer than this would trigger EPartLabelTooLong on publish — AFTER
// the Walrus upload and SUI gas have been charged. Cap at the input layer
// via maxLength so the on-chain assertion can never fire on a label that
// survived the editor.
const MAX_LABEL_LEN = 32;

const taggingRightRail: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

const labelEditorBlock: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: 12,
  background: tokens.color.paperPure,
  border: tokens.border.primary,
};

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

// plan-015 U5 — tagging step layout. Canvas (left, ~16:10 well with mode +
// BG pills) and a right rail (MeshInfoPanel + PartListPanel + label input).
// Right column widened from plan-013's 280px to 320px so the info panel and
// part list breathe; on narrow viewports the page-level overflow handles it.
const taggingGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 320px',
  gap: 24,
  marginTop: 24,
};

const taggingCanvasWell: CSSProperties = {
  ...viewerWell,
  aspectRatio: '16 / 10',
  border: tokens.border.primary,
};

const taggingPanel: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

const taggingHeaderRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  marginBottom: 4,
};

const taggingSubhead: CSSProperties = {
  fontFamily: tokens.font.body,
  fontSize: tokens.size.sm,
  color: tokens.color.hint,
  marginTop: 4,
  marginBottom: 16,
  lineHeight: 1.4,
};

const charCounter: CSSProperties = {
  fontFamily: tokens.font.mono,
  fontSize: tokens.size.xs,
  letterSpacing: '1px',
  color: tokens.color.hint,
};

const taggingActionRow: CSSProperties = {
  display: 'flex',
  gap: 8,
  marginTop: 16,
  flexWrap: 'wrap',
};

// plan-015 U5 — Framing B + shared canvas/panel infrastructure. Bridges
// TaggingCanvas selection state and a freeform per-part label input. Owns
// the partial-labels map; on Continue, emits a positional `partLabels[]` of
// length = part count. Continue is gated on every part having ≥1 character
// — there is no SKIP escape hatch and no default-on-empty fallback, because
// the whole step exists to make the creator name each customization axis
// themselves (R1, R2).
//
// Layout (U5): TaggingCanvas left (PARTS mode default, mode + BG pills),
// right rail with MeshInfoPanel / PartListPanel / single label input. The
// PartListPanel rows carry partsColorHex(i) swatches so the row identity
// matches the canvas's PARTS-mode rainbow at any mode.
function TaggingStep({
  glbUrl,
  glbSizeBytes,
  onContinue,
  disabled,
}: {
  glbUrl: string | null;
  /** GLB bytelength surfaced in the MeshInfoPanel SIZE row. */
  glbSizeBytes: number;
  onContinue: (partLabels: string[]) => void;
  /**
   * plan-013 fix-pass — parent passes `genBusy` while regenerate is in
   * flight; clicking Continue against the stale GLB during regen would emit
   * partLabels that get reset by setGlbBytes anyway (visible UI jank +
   * silently-discarded user input). We also lock-out Continue when the
   * canvas hasn't loaded yet (partCount === 0 → emit would silently produce
   * the legacy `partLabels = []` sentinel).
   */
  disabled?: boolean;
}) {
  const [partCount, setPartCount] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [labels, setLabels] = useState<Map<number, string>>(new Map());
  const { mode, cycle: cycleMode } = useModeCycle('parts');

  // Refocus the label input whenever the user picks a different part in the
  // canvas or the PartListPanel (F1.5 — "row scrolls into view + focus
  // moves to the label input").
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectedIndex != null) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [selectedIndex]);

  const setLabel = useCallback((i: number, label: string) => {
    setLabels((prev) => {
      const next = new Map(prev);
      // U1 — slice to MAX_LABEL_LEN so a paste that exceeds the Move bound
      // is silently capped at the editor layer; the on-chain assertion is
      // never reached. No `.trim()` per plan-015 deferred-to-impl: origin
      // says "trust the user" and explicitly permits `a` / `1` as single
      // characters. Whitespace-only labels technically pass the gate; defer
      // a trim policy to v1.1 if abuse surfaces.
      const clamped = label.slice(0, MAX_LABEL_LEN);
      if (clamped.length > 0) next.set(i, clamped);
      else next.delete(i);
      return next;
    });
  }, []);

  const allLabeled = partCount > 0 && labels.size === partCount;

  const emit = useCallback(() => {
    if (!allLabeled) return;
    const out: string[] = [];
    for (let i = 0; i < partCount; i++) {
      // Safe-! after the allLabeled gate: every index 0..partCount-1 is in
      // the map (labels.size === partCount and we set keys by index).
      out.push(labels.get(i)!);
    }
    onContinue(out);
  }, [labels, partCount, onContinue, allLabeled]);

  // PartListPanel items — derived from labels Map + partsColorHex. The
  // swatch rainbow is stable per index regardless of current mode so the
  // row identity stays consistent if the user cycles modes mid-tagging.
  const partListItems: PartListItem[] = useMemo(
    () =>
      Array.from({ length: partCount }, (_, i) => ({
        index: i,
        label: labels.get(i),
        colorHex: partsColorHex(i),
      })),
    [partCount, labels],
  );

  const currentLabel = selectedIndex != null ? labels.get(selectedIndex) ?? '' : '';

  return (
    <div data-testid="tagging-step" style={{ marginTop: 24 }}>
      <div style={taggingHeaderRow}>
        <span style={eyebrow}>— STEP 2/3: NAME WHAT BUYERS CAN CUSTOMIZE</span>
        <HelpIcon
          testId="tagging-help"
          title="Why naming matters"
          body="Each name becomes a customization axis for forks of this model. e.g. CHASSIS, WHEELS, SPOILER."
        />
      </div>
      <p style={taggingSubhead}>
        Each part you name becomes a customization axis for forks of this model.
      </p>
      <div style={taggingGrid}>
        <div style={taggingCanvasWell}>
          <TaggingCanvas
            glbUrl={glbUrl}
            selectedIndex={selectedIndex}
            onPartSelect={setSelectedIndex}
            onLoaded={setPartCount}
            mode={mode}
            onModeCycle={cycleMode}
            modeToggle
          />
        </div>
        <div style={taggingRightRail}>
          <MeshInfoPanel
            // L1 segmented bases from Tripo carry one material per part
            // (D-052 substrate), so materialCount mirrors segmentCount in
            // this context. Walrus blob id is unknown pre-publish.
            segmentCount={partCount}
            fileSizeBytes={glbSizeBytes}
            materialCount={partCount}
            testIdSuffix="tagging"
          />
          <PartListPanel
            parts={partListItems}
            selectedIndex={selectedIndex}
            onSelect={setSelectedIndex}
            testIdSuffix="tagging"
            maxHeight={180}
          />
          <div data-testid="label-editor" style={labelEditorBlock}>
            {selectedIndex == null ? (
              <span style={{ ...monoLabel, color: tokens.color.hint }}>
                ← CLICK A PART TO NAME IT
              </span>
            ) : (
              <>
                <span style={{ ...monoLabel, color: tokens.color.ink }}>
                  EDITING PART {selectedIndex + 1} OF {partCount || '—'}
                </span>
                <input
                  ref={inputRef}
                  data-testid="part-label-input"
                  value={currentLabel}
                  onChange={(e) => setLabel(selectedIndex, e.target.value)}
                  maxLength={MAX_LABEL_LEN}
                  placeholder="e.g. chassis, wheels, spoiler"
                  style={{ ...inputStyle, width: '100%' }}
                />
                <span style={charCounter}>
                  {currentLabel.length}/{MAX_LABEL_LEN}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
      <div style={taggingActionRow}>
        <span data-testid="tag-progress" style={{ ...monoLabel, color: tokens.color.muted, alignSelf: 'center', marginRight: 'auto' }}>
          {partCount === 0 ? 'LOADING PARTS…' : `${labels.size} OF ${partCount} NAMED`}
        </span>
        <button
          type="button"
          data-testid="continue-tagging"
          onClick={emit}
          disabled={disabled || !allLabeled}
          style={buttonPrimary}
        >
          CONTINUE →
        </button>
      </div>
    </div>
  );
}

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

  const [glb, setGlb] = useState<Uint8Array | null>(null);
  const [glbUrl, setGlbUrl] = useState<string | null>(null);
  // plan-026 U4 — handle to the preview canvas so onMint can capture ALLOW_LIST
  // preview stills from the plaintext scene before the encrypt+upload window.
  const previewRef = useRef<PreviewCanvasHandle>(null);
  const [confirmed, setConfirmed] = useState(false);

  // plan-013 — per-part labels for segmented bases. `tagged` gates the metadata
  // form so the user can't skip the tagging step on the Tripo path; upload
  // mode bypasses it entirely (legacy single-material sentinel: partLabels = []).
  const [partLabels, setPartLabels] = useState<string[]>([]);
  const [tagged, setTagged] = useState(false);

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
  const { uploadBlob, uploadFiles, stage: uploadStage } = useWalrusUpload();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const suiClient = useSuiClient();
  const signer = useDappKitSigner(account?.address ?? null);

  // plan-015 F1 — URL lifecycle is split across this effect (revoke on
  // glbUrl change/unmount) and setGlbBytes below (createObjectURL when new
  // bytes arrive). The pair is correct because:
  //   - setGlbBytes is the only producer of new glbUrl values, and it
  //     replaces (not appends) the state — so the effect's cleanup runs on
  //     the previous URL before the new one is committed.
  //   - The effect itself doesn't create the URL, so it can't leak under
  //     React 19 StrictMode's double-invoke (the prior LaunchCollectionPage
  //     useMemo+useEffect split was vulnerable; this one is not).
  // No refactor — the split is intentional because setGlbBytes carries
  // additional state mutations (setConfirmed, setPartLabels, setTagged) that
  // shouldn't live in a URL-only effect.
  useEffect(() => {
    if (!glbUrl) return;
    return () => URL.revokeObjectURL(glbUrl);
  }, [glbUrl]);

  // Elapsed-seconds counters that survive status transitions WITHIN the
  // active window. Pre-fix code keyed on the status string, which snapped
  // the counter back to 0 at paying→generating and uploading→signing —
  // exactly when the user is staring at the wallet popup waiting for
  // reassurance that something's still happening. 3-reviewer consensus.
  const genElapsed = useElapsedSeconds(
    genStatus === 'paying' || genStatus === 'generating',
  );
  const mintElapsed = useElapsedSeconds(
    mintStatus === 'uploading' || mintStatus === 'signing',
  );

  const setGlbBytes = useCallback((bytes: Uint8Array) => {
    setGlb(bytes);
    setConfirmed(false);
    // plan-013 — regenerate/re-upload invalidates any tagging done against
    // the previous GLB, since part counts and node order can both change.
    setPartLabels([]);
    setTagged(false);
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
      // Wait for the testnet read-replica RPC to index the tx before posting
      // to backend. dapp-kit's signAndExecute returns once the fullnode has
      // executed the tx, but the read endpoint the backend's paymentVerifier
      // queries (getTransactionBlock) may still 404 for a few seconds. Skip
      // this step and backend returns `payment_not_found` even though the
      // SUI was correctly spent — the user gets charged and rejected.
      // Polls every 2s up to 60s; throws on timeout.
      await suiClient.waitForTransaction({ digest: payResult.digest });
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
  }, [session, prompt, signAndExecute, suiClient, setGlbBytes, clearSession]);

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
    // D-076 — ALLOW_LIST is "pay to fork"; a zero fork fee is rejected on-chain
    // (EAllowListNeedsFee). Guard here so the user gets a clear message pre-sign.
    if (policy === POLICY_ALLOW_LIST && suiToMist(feeSui) <= 0n) {
      setMintError('Allow-list requires a fork fee greater than 0 SUI.');
      return;
    }
    setMintError(null);
    setMintStatus('uploading');
    try {
      // D-037 (option A): the GLB is uploaded as a STANDALONE blob (not quilted)
      // so its blob id resolves directly at /v1/blobs/<id> — both the on-chain
      // Blob object and glb_blob_id come from this one upload. lineage.json is
      // no longer separately persisted (it was never resolved anywhere); the
      // lineage pointer collapses onto the GLB's own blob id.
      // D-075 — encryption is DERIVED from policy. For an encrypted policy
      // (ALLOW_LIST / RESTRICTED) we AES-encrypt the GLB under a fresh random
      // seal_id, upload the CIPHERTEXT (never the plaintext), and publish via
      // publish_encrypted (records the wrapped key + seal_id; asserts global
      // seal_id uniqueness). PERMISSIONLESS uploads the plaintext as today.
      const isEncrypted = policy !== POLICY_PERMISSIONLESS;
      let glbBlob: { blobId: string; blobObjectId: string };
      let sealFields: { sealedKey: Uint8Array; sealId: Uint8Array } | null = null;
      let previewBlobIds: string[] = [];
      if (isEncrypted) {
        // ALLOW_LIST captures watermarked preview stills from the PLAINTEXT scene
        // (before encryption) so a prospective forker can evaluate the base pre-
        // payment (R6/R12); RESTRICTED is private (off-catalog) and skips previews
        // entirely (R11).
        const stills =
          policy === POLICY_ALLOW_LIST ? ((await previewRef.current?.captureStills()) ?? []) : [];
        const sealId = crypto.getRandomValues(new Uint8Array(32));
        const { ciphertext, sealedKey } = await encryptBase(
          getSealClient(),
          TESTNET.model3dPackageId,
          glb,
          sealId,
        );
        // ONE Walrus quilt holding the ciphertext + all preview stills → a SINGLE
        // upload (register + certify), not N+1 standalone uploads. Keeps the
        // encrypted publish at the same ~3 wallet popups as a public publish.
        // patchIds preserve input order: [0] = ciphertext (→ glb_blob_id, fetched
        // by-quilt-patch-id), [1..] = preview stills. 1 ciphertext + ≤3 stills
        // stays within QUILT_SIZE (4) = one quilt.
        // Force ONE quilt for [ciphertext + all preview stills] so the encrypted
        // publish stays at ~3 wallet popups no matter how many turntable angles
        // (12) we capture — overrides the global QUILT_SIZE for this call only.
        const quiltFiles = [ciphertext, ...stills];
        const quilt = await uploadFiles(quiltFiles, signer, { quiltSize: quiltFiles.length });
        glbBlob = {
          blobId: quilt.patchIds[0]!,
          blobObjectId: quilt.blobObjects[0]!.blobObjectId,
        };
        previewBlobIds = quilt.patchIds.slice(1);
        sealFields = { sealedKey, sealId };
      } else {
        glbBlob = await uploadBlob(glb, signer);
      }
      setMintStatus('signing');
      const tags = tagsStr.split(',').map((t) => t.trim()).filter(Boolean);
      const commonArgs = {
        blobObjectId: glbBlob.blobObjectId,
        shapeType: sourceMode,
        paramsJson: JSON.stringify(sourceMode === 'tripo' ? { prompt } : { source: 'upload' }),
        name: name.trim(),
        tags,
        lineageBlobId: glbBlob.blobId,
        glbBlobId: glbBlob.blobId,
        partLabels,
        license: {
          policy,
          derivativeMintFee: suiToMist(feeSui),
          derivativeRoyaltyBps: royaltyBps,
          commercialUse: true,
          requireAttribution: policy !== POLICY_PERMISSIONLESS,
        },
      };
      const { tx } = isEncrypted
        ? buildPublishEncryptedPtb({
            ...commonArgs,
            sealedKey: sealFields!.sealedKey,
            sealId: sealFields!.sealId,
            // U4 — captured ALLOW_LIST preview stills (empty for RESTRICTED).
            previewBlobIds,
          })
        : buildPublishPtb(commonArgs);
      const result = await signAndExecute({ transaction: tx });
      setTxDigest(result.digest);
      setMintStatus('success');
    } catch (e) {
      setMintError(e instanceof Error ? e.message : String(e));
      setMintStatus('error');
    }
  }, [session, signer, glb, name, uploadBlob, tagsStr, sourceMode, prompt, policy, feeSui, royaltyBps, partLabels, signAndExecute]);

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

  // plan-013 / polish-backlog §1 — Tripo is a two-step API (text_to_model
  // ≈ 15-30s, then mesh_segmentation ≈ 60-90s). The backend hides the
  // split, but at 70+ seconds of a single "GENERATING" pill users start
  // to believe it's stuck. Split the label on a 30s threshold — imprecise
  // but enough to telegraph "two phases, you're still moving."
  const TRIPO_STEP1_TYPICAL_SECONDS = 30;
  const generateLabel =
    genStatus === 'paying'
      ? `— APPROVING FEE (${genElapsed}s)`
      : genStatus === 'generating'
        ? genElapsed < TRIPO_STEP1_TYPICAL_SECONDS
          ? `— STEP 1/2: GENERATING MESH (${genElapsed}s)`
          : `— STEP 2/2: SEGMENTING PARTS (${genElapsed}s)`
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
            <div style={{ marginTop: 12 }}>
              {/* D-053 — pre-sign confirmation panel before Slush popup. */}
              <SignConfirmation
                testIdPrefix="generate-button"
                buttonLabel={generateLabel}
                disabled={genBusy || !prompt.trim()}
                summary={[
                  {
                    label: 'Tripo generation fee',
                    amount: `${Number(TRIPO_FEE_MIST) / 1e9} SUI`,
                  },
                  {
                    label: 'Estimated gas',
                    amount: '~ 0.001 SUI',
                    muted: true,
                  },
                ]}
                recipient={{
                  address: TRIPO_FEE_TREASURY,
                  note: 'TRIPO_FEE_TREASURY (deployer)',
                }}
                onConfirm={onGenerate}
              />
              {genBusy && (
                <div style={{ marginTop: 8 }}>
                  <span style={statusPill}>— SUI FEE-GATED · TWO-STEP, ~120S TYPICAL</span>
                </div>
              )}
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
          {haveModel ? <PreviewCanvas ref={previewRef} glbUrl={glbUrl} /> : <WireframePlaceholder />}
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

        {haveModel && sourceMode === 'tripo' && confirmed && !tagged && (
          <TaggingStep
            glbUrl={glbUrl}
            glbSizeBytes={glb?.byteLength ?? 0}
            disabled={genBusy}
            onContinue={(labels) => {
              setPartLabels(labels);
              setTagged(true);
            }}
          />
        )}

        {haveModel && (sourceMode === 'upload' || (confirmed && tagged)) && (
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
              <span style={sectionLabel}>
                {policy === POLICY_ALLOW_LIST ? 'UNLOCK PRICE (SUI) — REQUIRED' : 'DERIVATIVE MINT FEE (SUI)'}
              </span>
              <input
                data-testid="fee-input"
                value={feeSui}
                onChange={(e) => setFeeSui(e.target.value)}
                style={{ ...inputStyle, width: '100%' }}
              />
              {policy === POLICY_ALLOW_LIST && (
                <span data-testid="allow-list-fee-hint" style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                  What people pay you to unlock your model and make their own version of it. Must be more than 0 SUI.
                </span>
              )}
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
              {/* Pill scopes to the SILENT Walrus phases only (encoding +
                  relay-upload). The wallet-popup stages (awaiting-register /
                  awaiting-certify) already get a dedicated MintButton
                  label — duplicating "UPLOADING TO WALRUS" both as button
                  text and pill was flagged by the correctness reviewer. */}
              {mintStatus === 'uploading' &&
                (uploadStage === 'encoding' || uploadStage === 'relay-upload') && (
                  <div style={{ marginTop: 8 }}>
                    <span style={statusPill} data-testid="mint-upload-status-pill">
                      — UPLOADING TO WALRUS ({mintElapsed}s)
                    </span>
                  </div>
                )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
