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
import { isUploadTaggable } from '../babylon/partMaterials';
import { generate, preflightGenerate, GenerateError } from '../lib/api';
import { formatRetryAfter } from '../lib/formatRetryAfter';
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
import { useCreatorMemory } from './useCreatorMemory';
import { CopilotBar } from './CopilotBar';
import { PromptMemoryChips } from './PromptMemoryChips';
import { CommunityRecall } from './CommunityRecall';
import { CopilotChat } from './CopilotChat';
import { useRiffCopilot } from './useRiffCopilot';
import { useUploadCaption } from './useUploadCaption';
import { IndeterminateBar } from '../ux/IndeterminateBar';
import { extractCreatedModelId } from './extractModelId';
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
type GenStatus = 'idle' | 'preflight' | 'paying' | 'generating' | 'error';

// U6 (R2/R3/R10) — honest, classified generation messages. CONTACT_PATH is a
// PLACEHOLDER pending the user's final support destination (open question); the
// fee-refundable copy (R3) cannot be fully finalized until it's set.
const CONTACT_PATH = 'the Tusk3D team';
const GEN_MSG = {
  // (1) pre-flight says the operator's generation credits are dry → not charged.
  // Honest (no "try again shortly" — retrying won't help until the operator tops
  // up) and points to the no-Tripo path: a user .glb upload still mints.
  creditsExhausted:
    'Generation credits are exhausted for now. You can still upload your own model manually (.glb).',
  // (1b) pre-flight couldn't verify availability (server-side) → not charged.
  unavailable: 'Generation is temporarily unavailable — please try again shortly.',
  // (2) the pre-flight request itself failed (distinct from a balance-dry answer).
  preflightNetwork: "Couldn't check generation availability — please try again.",
  // (3) post-payment failure the pre-flight couldn't catch (R3, refundable).
  refundable: `Generation failed after payment. Your service fee may be refundable — contact ${CONTACT_PATH}.`,
  // operator-side outage (Tripo key/credit misconfig) — no fee framing.
  operatorOutage: 'Generation is temporarily unavailable — please try again shortly.',
  sessionExpiredNotCharged:
    'Your session expired. Please sign in again, then retry — you have not been charged.',
  sessionExpired: 'Your session expired. Please sign in again, then retry.',
  generic: 'Generation failed. Please try again.',
} as const;

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

// plan 2026-06-08-001 U4 — no-caption nudge panel (publish-time). Token-aligned,
// modeled on SignConfirmation's two-step trigger/confirm; accent is spent only on
// the heading (exception state, ≤5/page budget — D-044/D-099).
const noCaptionPanel: CSSProperties = {
  border: `2px solid ${tokens.color.accent}`,
  background: tokens.color.paperPure,
  padding: tokens.space[4],
  display: 'flex',
  flexDirection: 'column',
  gap: tokens.space[3],
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
  autoSkipIfNotTaggable = false,
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
  /**
   * plan A2 — set ONLY for uploaded GLBs. When the loaded base isn't taggable
   * (single part, duplicate/empty part material names, or > MAX_PARTS), skip
   * the naming step automatically and emit the legacy empty partLabels — there's
   * nothing to segment, or name-keying would be ambiguous. The Tripo path leaves
   * this false so its "name every part" gate is preserved unchanged.
   */
  autoSkipIfNotTaggable?: boolean;
}) {
  const [partCount, setPartCount] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [labels, setLabels] = useState<Map<number, string>>(new Map());
  // Parts flagged as unnamed on a Continue attempt — highlighted until named.
  const [flaggedParts, setFlaggedParts] = useState<ReadonlySet<number>>(new Set());
  const [materialNames, setMaterialNames] = useState<(string | null)[]>([]);
  const [loaded, setLoaded] = useState(false);
  const skippedRef = useRef(false);
  const { mode, cycle: cycleMode } = useModeCycle('parts');

  const handleLoaded = useCallback(
    (info: { partCount: number; materialNames: (string | null)[] }) => {
      setPartCount(info.partCount);
      setMaterialNames(info.materialNames);
      setLoaded(true);
    },
    [],
  );

  // plan A2 — upload auto-skip. Fires once after the base loads if it isn't
  // taggable; onContinue([]) marks the model tagged with the legacy sentinel and
  // the parent unmounts this step (→ metadata form). skippedRef guards against a
  // double-fire if `onContinue`'s identity changes before unmount.
  useEffect(() => {
    if (
      autoSkipIfNotTaggable &&
      loaded &&
      !skippedRef.current &&
      !isUploadTaggable(materialNames)
    ) {
      skippedRef.current = true;
      onContinue([]);
    }
  }, [autoSkipIfNotTaggable, loaded, materialNames, onContinue]);

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
    // Naming a part clears its "unnamed" flag immediately.
    if (label.trim().length > 0) {
      setFlaggedParts((prev) => {
        if (!prev.has(i)) return prev;
        const next = new Set(prev);
        next.delete(i);
        return next;
      });
    }
  }, []);

  const allLabeled = partCount > 0 && labels.size === partCount;

  const emit = useCallback(() => {
    if (!allLabeled) {
      // Flag every unnamed part (red row) and jump to the first one, instead of
      // a silently-disabled Continue with no indication of WHAT's missing.
      const missing = new Set<number>();
      for (let i = 0; i < partCount; i++) if (!labels.has(i)) missing.add(i);
      setFlaggedParts(missing);
      const first = missing.values().next().value;
      if (first !== undefined) setSelectedIndex(first);
      return;
    }
    setFlaggedParts(new Set());
    const out: string[] = [];
    for (let i = 0; i < partCount; i++) {
      // Safe-! after the allLabeled gate: every index 0..partCount-1 is in
      // the map (labels.size === partCount and we set keys by index).
      out.push(labels.get(i)!);
    }
    onContinue(out);
  }, [labels, partCount, onContinue, allLabeled]);

  // Quality-of-life — fill every part with an incrementing `part1, part2, …`
  // so an uploader who doesn't care about semantic names can skip the
  // click-each-part-and-type loop. Overwrites the whole map (predictable
  // 1..N numbering) — it's an explicit opt-in button, not auto-applied.
  const autoName = useCallback(() => {
    if (partCount === 0) return;
    const next = new Map<number, string>();
    for (let i = 0; i < partCount; i++) {
      next.set(i, `part${i + 1}`.slice(0, MAX_LABEL_LEN));
    }
    setLabels(next);
  }, [partCount]);

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
            onLoaded={handleLoaded}
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
            flaggedIndices={flaggedParts}
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
        <span
          data-testid="tag-progress"
          style={{
            ...monoLabel,
            color: flaggedParts.size > 0 ? tokens.color.err : tokens.color.muted,
            alignSelf: 'center',
            marginRight: 'auto',
          }}
        >
          {partCount === 0
            ? 'LOADING PARTS…'
            : flaggedParts.size > 0
              ? `↑ NAME THE ${flaggedParts.size} HIGHLIGHTED PART${flaggedParts.size > 1 ? 'S' : ''}`
              : `${labels.size} OF ${partCount} NAMED`}
        </span>
        <button
          type="button"
          data-testid="auto-name-parts"
          onClick={autoName}
          disabled={disabled || partCount === 0}
          style={buttonOutline}
          title="Fill every part with part1, part2, part3…"
        >
          AUTO-NAME {partCount > 0 ? `(part1…${partCount})` : ''}
        </button>
        <button
          type="button"
          data-testid="continue-tagging"
          onClick={emit}
          disabled={disabled || partCount === 0}
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
  // plan-027 U7 (D-078) — the ALLOW_LIST one-time buy-access fee (SUI). Shown
  // only for ALLOW_LIST; required > 0 (on-chain EAllowListNeedsFee — the gate
  // moved from derive-fee to access-fee in plan-027). Reset to '' when policy
  // flips away from ALLOW_LIST so a stale value can't ride into publish.
  const [accessFeeSui, setAccessFeeSui] = useState('');
  const [royaltyBps, setRoyaltyBps] = useState(500);

  const [mintStatus, setMintStatus] = useState<MintStatus>('idle');
  const [mintError, setMintError] = useState<string | null>(null);
  const [txDigest, setTxDigest] = useState<string | null>(null);
  // plan 2026-06-08-001 U4 — when true, the no-caption nudge replaces the Mint
  // button (an uncaptioned upload is about to publish). Continue → proceedMint;
  // Cancel → back to editing.
  const [noCaptionConfirm, setNoCaptionConfirm] = useState(false);
  // Required-field validation: on a Mint attempt with missing required fields we
  // highlight them (red border + inline message) instead of silently no-op'ing;
  // each field clears its own highlight as soon as it's filled.
  const [invalidFields, setInvalidFields] = useState<ReadonlySet<string>>(new Set());
  const clearInvalid = useCallback((key: string) => {
    setInvalidFields((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);
  const fieldStyle = (key: string): CSSProperties =>
    invalidFields.has(key)
      ? { ...inputStyle, width: '100%', border: tokens.border.err }
      : { ...inputStyle, width: '100%' };

  const { session, clearSession } = useSession();
  const account = useCurrentAccount();
  const { uploadBlob, uploadFiles, stage: uploadStage } = useWalrusUpload();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const suiClient = useSuiClient();
  // Riff Copilot memory (D-080) — recall chips + remember-on-publish. Fail-soft.
  const {
    chips: memoryChips,
    community: communityChips,
    personalStatus,
    communityStatus,
    recallSimilar,
    recallCommunity,
    rememberCreation,
  } = useCreatorMemory();
  // L2 Riff Copilot (D-081) — conversational prompt authoring. Fail-soft: when
  // unavailable (no key / LLM error) the toggle is hidden and /create degrades to
  // the Write experience above. `chatMode` is a sub-mode of the Tripo path only.
  const copilot = useRiffCopilot();
  const [chatMode, setChatMode] = useState(false);
  // Build-time opt-in (default OFF): the copilot toggle only appears when L2 is
  // explicitly enabled AND the backend reports the LLM available at runtime. This
  // keeps a key-less 6/21 deploy clean — no broken-on-click toggle for judges.
  // D-084: gate ONLY on the build flag — a built feature is never hidden at runtime.
  // Keyless / quota / error all render as VISIBLE degraded states (driven by status),
  // so an evaluator never mistakes a configured-but-degraded feature for "not built".
  const copilotOn = import.meta.env.VITE_COPILOT_ENABLED === 'true';
  // Upload Captioning (D-082) — vision describe-on-upload. The editable DESCRIPTION
  // field shows for any upload (so a creator can hand-type one even with no key),
  // but the "Describe with AI" button only appears when captioning is available.
  // The caption is written personal-only on mint (R9). Fail-soft throughout (R11).
  const captioner = useUploadCaption();
  const [caption, setCaption] = useState('');
  const captionOn = import.meta.env.VITE_COPILOT_ENABLED === 'true'; // D-084 — flag only; never hide on keyless
  // plan 2026-06-08-001 U4 — can the user actually add a caption right now? Drives
  // the no-caption nudge's copy variant (R8): the build flag must be on AND the
  // backend keyed. False → the informational "captioning unavailable" wording.
  const captioningAvailable = captionOn && captioner.available;
  // A caption describes ONE specific uploaded model. Clear it (and reset the hook)
  // when the loaded model changes or we leave upload mode, so a stale caption can't
  // ride onto the next mint's params_json / personal-memory write (review:
  // correctness + julik — stale-caption-onto-wrong-model).
  const captionerReset = captioner.reset;
  useEffect(() => {
    // Keyed on the GLB bytes (the model identity) + sourceMode: a new upload or a
    // mode switch produces a fresh `glb` reference, clearing any prior caption.
    setCaption('');
    captionerReset();
    // plan 2026-06-08-001 U4 (review: correctness/adversarial/julik) — dismiss the
    // open no-caption nudge on a model swap or mode switch, so "Publish anyway"
    // can never publish a DIFFERENT model than the warning described; the user is
    // forced back through onMint's fresh validate+nudge gate.
    setNoCaptionConfirm(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glb, sourceMode]);
  // Re-entrancy guard: onDescribe awaits captureFrames BEFORE the hook flips to
  // 'thinking', so the button's disabled state can't prevent a rapid second click
  // from launching a second capture + paid call. This ref closes that window
  // across the whole capture→describe span (review: julik + adversarial).
  const describeInFlight = useRef(false);
  // plan 2026-06-08-001 U4 (review: julik) — publish re-entrancy guard. While the
  // no-caption panel is open the busy MintButton (the usual guard) is unmounted,
  // so a double-click on "Publish anyway" could enqueue two paid publishes before
  // setMintStatus('uploading') re-renders. This ref closes that window, mirroring
  // describeInFlight above.
  const mintInFlight = useRef(false);
  const onDescribe = useCallback(async () => {
    if (describeInFlight.current) return;
    describeInFlight.current = true;
    try {
      // Capture clean turntable frames from the live preview; soft no-op if it isn't
      // ready (the hook/route never sees an empty payload).
      const frames = (await previewRef.current?.captureFrames()) ?? [];
      if (frames.length === 0) return;
      const text = await captioner.describe(frames);
      if (text) setCaption(text);
    } finally {
      describeInFlight.current = false;
    }
  }, [captioner]);
  const onRetryDescribe = useCallback(async () => {
    if (describeInFlight.current) return;
    describeInFlight.current = true;
    try {
      const text = await captioner.retry();
      if (text) setCaption(text);
    } finally {
      describeInFlight.current = false;
    }
  }, [captioner]);
  const signer = useDappKitSigner(account?.address ?? null);

  // When the copilot synthesizes a prompt, write it into the shared prompt state
  // (which Generate reads). We do NOT snap back to Write — the panel delivers the
  // drafted prompt in place so the conversation stays visible (Q1 UX option A).
  // Keyed on synthSeq (one-shot per synthesis) so a later re-render never re-applies
  // a stale value over the user's manual edit (review: julik P1/P2).
  useEffect(() => {
    if (copilot.synthSeq > 0 && copilot.synthesizedPrompt) {
      setPrompt(copilot.synthesizedPrompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copilot.synthSeq]);

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

  // plan-027 U7 — policy change resets the access-fee when leaving ALLOW_LIST.
  // The access fee can only be charged on ALLOW_LIST (purchase_access asserts
  // POLICY_ALLOW_LIST), so a value entered under ALLOW_LIST must not silently
  // ride into a PERMISSIONLESS/RESTRICTED publish if the creator switches back.
  const onPolicyChange = useCallback(
    (next: PolicyValue) => {
      setPolicy(next);
      // Leaving ALLOW_LIST clears the access fee AND its validation highlight
      // (the field unmounts and is no longer required).
      if (next !== POLICY_ALLOW_LIST) {
        setAccessFeeSui('');
        clearInvalid('accessFee');
      }
    },
    [clearInvalid],
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
      setGenError(GEN_MSG.sessionExpiredNotCharged);
      setGenStatus('error');
      return;
    }
    setGenError(null);

    // Pre-flight BEFORE charging (R1): if we already know generation will fail
    // (credit dry), block here and NEVER call signAndExecute — the creator is not
    // charged. The button/section stays visible with the message (R10).
    setGenStatus('preflight');
    let pre;
    try {
      pre = await preflightGenerate(session.jwt);
    } catch (e) {
      if (e instanceof GenerateError && e.status === 401) {
        clearSession();
        setGenError(GEN_MSG.sessionExpired);
        setGenStatus('error');
        return;
      }
      pre = { available: false, reason: 'network' as const };
    }
    if (!pre.available) {
      setGenError(
        pre.reason === 'network'
          ? GEN_MSG.preflightNetwork
          : pre.reason === 'insufficient'
            ? GEN_MSG.creditsExhausted
            : GEN_MSG.unavailable,
      );
      setGenStatus('error');
      return; // R1 — no signAndExecute, no charge
    }

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
      // Map the backend's classified error (U5) to honest copy. The fee was already
      // charged here, so a refundable failure shows the "contact us" message (R3).
      if (e instanceof GenerateError) {
        if (e.status === 401 || e.code === 'auth_invalid' || e.code === 'auth_required') {
          clearSession();
          setGenError(GEN_MSG.sessionExpired);
        } else if (e.refundable) {
          setGenError(GEN_MSG.refundable);
        } else if (e.code === 'tripo_unavailable') {
          setGenError(GEN_MSG.operatorOutage);
        } else {
          setGenError(GEN_MSG.generic);
        }
      } else {
        // Non-API failure (e.g. wallet rejection) — keep the raw message.
        setGenError(e instanceof Error ? e.message : String(e));
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

  // plan 2026-06-08-001 U4 — the actual publish body, split out from the
  // validation gate (onMint, below) so the no-caption nudge's "Publish anyway"
  // can run it directly. Re-checks the non-user-fixable preconditions defensively
  // since it is also callable from the confirm panel.
  const proceedMint = useCallback(async () => {
    if (!session || !signer || !glb) return;
    // Re-validate required fields (review: correctness). The no-caption panel
    // leaves the metadata form editable, so name / ALLOW_LIST access-fee could
    // have been cleared between onMint's gate and "Publish anyway" — without this
    // re-check the publish would spend gas + Walrus upload then mint an empty
    // name (or an ALLOW_LIST base with fee=0, which the chain rejects).
    const missing = new Set<string>();
    if (!name.trim()) missing.add('name');
    if (policy === POLICY_ALLOW_LIST && suiToMist(accessFeeSui) <= 0n) missing.add('accessFee');
    if (missing.size > 0) {
      setInvalidFields(missing);
      setMintError(null);
      return;
    }
    // Re-entrancy guard (review: julik) — a double "Publish anyway" must not
    // launch two paid publishes before setMintStatus('uploading') re-renders.
    if (mintInFlight.current) return;
    mintInFlight.current = true;
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
        // publish stays at ~3 wallet popups regardless of the turntable angle
        // count — overrides the global QUILT_SIZE for this call only.
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
        paramsJson: JSON.stringify(
          sourceMode === 'tripo'
            ? { prompt }
            : caption.trim()
              ? { source: 'upload', caption: caption.trim() } // D-082 — captioned upload
              : { source: 'upload' }, // R10 — no placeholder when uncaptioned
        ),
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
          // plan-027 U7 (D-078) — the one-time buy-access fee. Only meaningful
          // for ALLOW_LIST (purchase_access asserts the policy + access_fee>0);
          // accessFeeSui is held at '' for non-ALLOW_LIST so suiToMist → 0n.
          accessFee: suiToMist(accessFeeSui),
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
      // U5 (D-080) — fire-and-forget: capture the published prompt + new model
      // id into MemWal. Tripo-only (R4: uploads have no prompt). Reads only (no
      // wallet popup); never blocks the success UI; never throws.
      if (sourceMode === 'tripo' && prompt.trim()) {
        const digest = result.digest;
        const promptAtPublish = prompt;
        void (async () => {
          try {
            await suiClient.waitForTransaction({ digest });
            const tb = await suiClient.getTransactionBlock({
              digest,
              options: { showObjectChanges: true },
            });
            const modelId = extractCreatedModelId(tb.objectChanges ?? []);
            if (modelId) {
              void rememberCreation({ prompt: promptAtPublish, modelId, policy });
            }
          } catch {
            /* fail-soft — memory must never disturb publish */
          }
        })();
      } else if (sourceMode === 'upload' && caption.trim()) {
        // D-082 — bring captioned uploads into memory. PERSONAL-ONLY: no `policy`
        // arg means memoryWrites skips the global mirror (R9 — an AI caption is a
        // guess, the shared pool stays human-authored). Same fail-soft path.
        const digest = result.digest;
        const captionAtPublish = caption.trim();
        void (async () => {
          try {
            await suiClient.waitForTransaction({ digest });
            const tb = await suiClient.getTransactionBlock({
              digest,
              options: { showObjectChanges: true },
            });
            const modelId = extractCreatedModelId(tb.objectChanges ?? []);
            if (modelId) {
              void rememberCreation({ prompt: captionAtPublish, modelId });
            }
          } catch {
            /* fail-soft — memory must never disturb publish */
          }
        })();
      }
    } catch (e) {
      setMintError(e instanceof Error ? e.message : String(e));
      setMintStatus('error');
    } finally {
      mintInFlight.current = false;
    }
  }, [session, signer, glb, name, uploadBlob, tagsStr, sourceMode, prompt, caption, policy, feeSui, accessFeeSui, royaltyBps, partLabels, signAndExecute, suiClient, rememberCreation]);

  // plan 2026-06-08-001 U4 — the publish gate: validate required fields, then
  // nudge before an UNcaptioned upload ships (R7/R8 — it'd be undiscoverable in
  // search). Tripo models + captioned uploads skip straight to proceedMint.
  const onMint = useCallback(() => {
    // Non-user-fixable preconditions (the model must exist / be signed in).
    if (!session || !signer || !glb) return;
    // Validate required fields and HIGHLIGHT the missing ones instead of silently
    // doing nothing. name is always required; ALLOW_LIST also requires access_fee
    // > 0 (mirrors the on-chain EAllowListNeedsFee — surfaces here pre-sign so the
    // user fixes it before the Walrus upload + encrypt window).
    const missing = new Set<string>();
    if (!name.trim()) missing.add('name');
    if (policy === POLICY_ALLOW_LIST && suiToMist(accessFeeSui) <= 0n) missing.add('accessFee');
    if (missing.size > 0) {
      setInvalidFields(missing);
      setMintError(null);
      const firstId = missing.has('name') ? 'name-input' : 'access-fee-input';
      document.querySelector<HTMLInputElement>(`[data-testid="${firstId}"]`)?.focus();
      return;
    }
    setInvalidFields(new Set());
    // R7/R8 — an uncaptioned upload is hard to find in search. Warn first; Continue
    // runs proceedMint, Cancel returns to editing. Fires for ANY uncaptioned upload
    // (incl. captioning unavailable). Tripo + captioned uploads never trigger it.
    if (sourceMode === 'upload' && !caption.trim()) {
      setNoCaptionConfirm(true);
      return;
    }
    void proceedMint();
  }, [session, signer, glb, name, policy, accessFeeSui, sourceMode, caption, proceedMint]);

  if (!session) {
    return (
      <div data-testid="create-page" style={pagePaper}>
        <main style={mainStyle}>
          <div style={headerStack}>
            <h1 style={displayHeadline}>Carve a model.</h1>
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
  const genBusy = genStatus === 'preflight' || genStatus === 'paying' || genStatus === 'generating';

  // plan-013 / polish-backlog §1 — Tripo is a two-step API. Measured
  // 2026-06-04: text_to_model ≈ 60s, then mesh_segmentation ≈ 120s, so a
  // full generation is ~3 min. The backend hides the split, but on a single
  // static "GENERATING" pill users believe it's stuck. Split the label so it
  // flips to step 2 around the real ~60s step-1 boundary (was 30s, which
  // mislabeled the back half of step 1 as step 2), and past the typical
  // ~3-min mark add a "still working" reassurance so the long segmentation
  // tail doesn't read as frozen. Backend poll budgets: 180s / 240s.
  const TRIPO_STEP1_TYPICAL_SECONDS = 60;
  const TRIPO_TOTAL_TYPICAL_SECONDS = 180;
  const generateLabel =
    genStatus === 'preflight'
      ? '— CHECKING…'
      : genStatus === 'paying'
      ? `— APPROVING FEE (${genElapsed}s)`
      : genStatus === 'generating'
        ? genElapsed < TRIPO_STEP1_TYPICAL_SECONDS
          ? `— STEP 1/2: GENERATING MESH (${genElapsed}s)`
          : genElapsed < TRIPO_TOTAL_TYPICAL_SECONDS
            ? `— STEP 2/2: SEGMENTING PARTS (${genElapsed}s)`
            : `— STEP 2/2: ALMOST THERE, HANG ON (${genElapsed}s)`
        : haveModel
          ? `GENERATE AGAIN (${Number(TRIPO_FEE_MIST) / 1e9} SUI)`
          : `PAY ${Number(TRIPO_FEE_MIST) / 1e9} SUI & GENERATE`;

  // D-053 — pre-sign fee confirmation. Single instance, placed either inside the
  // copilot panel's done-state (chat mode) or below the textarea (write mode).
  const generateConfirm = (
    <SignConfirmation
      testIdPrefix="generate-button"
      buttonLabel={generateLabel}
      disabled={genBusy || !prompt.trim()}
      summary={[
        { label: 'Tripo generation fee', amount: `${Number(TRIPO_FEE_MIST) / 1e9} SUI` },
        { label: 'Estimated gas', amount: '~ 0.001 SUI', muted: true },
      ]}
      recipient={{ address: TRIPO_FEE_TREASURY, note: 'TRIPO_FEE_TREASURY (deployer)' }}
      onConfirm={onGenerate}
    />
  );

  return (
    <div data-testid="create-page" style={pagePaper}>
      <main style={mainStyle}>
        <div style={headerStack}>
          <h1 style={displayHeadline}>Carve a model.</h1>
          <p
            style={{
              fontFamily: tokens.font.body,
              fontSize: tokens.size.md,
              lineHeight: 1.5,
              color: tokens.color.muted,
              margin: '4px 0 0',
              maxWidth: 640,
            }}
          >
            Generate one from a prompt or upload your own GLB, then publish it on-chain with the
            license terms you set.
          </p>
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
            {/* L2 (D-081): opt-in Write/Chat sub-mode. Hidden unless enabled + the
                copilot is available, so /create degrades to Write otherwise (R10/R13). */}
            {copilotOn && (
              <div role="radiogroup" aria-label="prompt mode" style={toggleRow} data-testid="copilot-toggle">
                <button
                  type="button"
                  role="radio"
                  aria-checked={!chatMode}
                  onClick={() => {
                    // Flipping to Write abandons the chat turn (drops any in-flight
                    // response so it can't stomp the textarea — review: julik #4).
                    copilot.reset();
                    setChatMode(false);
                  }}
                  style={toggleCell(!chatMode)}
                >
                  ✎ Write
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={chatMode}
                  data-testid="copilot-toggle-chat"
                  onClick={() => {
                    // Start a fresh conversation when re-entering chat after one
                    // already finished (review: correctness P1 — second-session dead-end).
                    if (copilot.status === 'done') copilot.reset();
                    setChatMode(true);
                  }}
                  style={toggleCell(chatMode)}
                >
                  🧠 Brainstorm with AI
                </button>
              </div>
            )}
            {chatMode && copilotOn ? (
              <CopilotChat
                messages={copilot.messages}
                status={copilot.status}
                retryAfterMs={copilot.retryAfterMs}
                onSend={copilot.sendAnswer}
                onGenerateNow={copilot.generateNow}
                draftPrompt={prompt}
                onDraftChange={setPrompt}
                onStartOver={copilot.reset}
                onRetry={copilot.retry}
                generateSlot={generateConfirm}
              />
            ) : (
              <>
                <textarea
                  data-testid="prompt-input"
                  value={prompt}
                  onChange={(e) => {
                    setPrompt(e.target.value);
                    recallSimilar(e.target.value);
                    recallCommunity(e.target.value);
                  }}
                  onFocus={() => {
                    recallSimilar(prompt);
                    recallCommunity(prompt);
                  }}
                  placeholder="Describe the model — e.g., 'ornate wooden chest with brass fittings'"
                  rows={3}
                  style={promptArea}
                />
                <CopilotBar
                  personalStatus={personalStatus}
                  communityStatus={communityStatus}
                  personalCount={memoryChips.length}
                  communityCount={communityChips.length}
                />
                <PromptMemoryChips chips={memoryChips} currentPrompt={prompt} onPick={setPrompt} status={personalStatus} />
                <CommunityRecall items={communityChips} status={communityStatus} />
              </>
            )}
            <div style={{ marginTop: 12 }}>
              {/* D-053 fee confirm: in chat mode it lives inside the copilot panel
                  (generateSlot); here it renders for the Write path only. */}
              {!(chatMode && copilotOn) && generateConfirm}
              {genBusy && (
                <div style={{ marginTop: 8 }}>
                  <IndeterminateBar testId="generate-progress" ariaLabel={generateLabel} />
                  <span style={{ ...statusPill, display: 'inline-block', marginTop: 6 }}>
                    — SUI FEE-GATED · TWO-STEP, ~120S TYPICAL
                  </span>
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

        {sourceMode === 'upload' && haveModel && (
          <div data-testid="caption-section" style={{ marginTop: 16 }}>
            <span style={sectionLabel}>DESCRIPTION</span>
            <textarea
              data-testid="caption-input"
              value={caption}
              onChange={(e) => setCaption(e.target.value.slice(0, 1000))}
              // Locked while a describe is in flight so a slow response can't clobber
              // an edit the user made mid-request (review: julik edit-during-flight).
              disabled={captioner.status === 'thinking'}
              placeholder="Describe your model — this makes it findable in your memory. Or let AI draft it from the preview."
              rows={2}
              style={{ ...inputStyle, width: '100%', resize: 'vertical' }}
            />
            {captionOn && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                  <button
                    type="button"
                    data-testid="caption-describe"
                    onClick={() => void onDescribe()}
                    // Disabled while in flight, while quota is exhausted (R6), or while
                    // keyless/unconfigured (D-084) — the button always stays VISIBLE
                    // (never hidden at runtime), only its label + enabled state change.
                    disabled={
                      captioner.status === 'thinking' ||
                      captioner.status === 'quota' ||
                      captioner.status === 'unavailable'
                    }
                    style={buttonOutline}
                  >
                    {captioner.status === 'thinking'
                      ? 'DESCRIBING…'
                      : captioner.status === 'quota'
                        ? 'AI QUOTA REACHED'
                        : captioner.status === 'unavailable'
                          ? 'AI UNAVAILABLE'
                          : '🧠 DESCRIBE WITH AI'}
                  </button>
                  {captioner.status === 'error' && (
                    <button
                      type="button"
                      data-testid="caption-retry"
                      onClick={() => void onRetryDescribe()}
                      style={buttonOutline}
                    >
                      ⚠ RETRY
                    </button>
                  )}
                </div>
                {/* Quota: visible reset hint, NO retry button — recovery is automatic (R7). */}
                {captioner.status === 'quota' && (
                  <p data-testid="caption-quota" style={{ ...monoLabel, color: tokens.color.muted, marginTop: 8 }}>
                    AI quota reached — try again {formatRetryAfter(captioner.retryAfterMs)}.
                  </p>
                )}
                {/* Keyless / not configured (D-084): visible, never hidden; hand-typing stays available. */}
                {captioner.status === 'unavailable' && (
                  <p data-testid="caption-unavailable" style={{ ...monoLabel, color: tokens.color.muted, marginTop: 8 }}>
                    AI captioning is unavailable right now — you can still type a description above.
                  </p>
                )}
                {captioner.status === 'thinking' && (
                  <IndeterminateBar testId="caption-progress" ariaLabel="Describing model…" />
                )}
              </>
            )}
          </div>
        )}

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
            // key={glbUrl} forces a fresh mount per GLB so per-GLB state (labels,
            // materialNames, loaded, skippedRef) can't leak across a regenerate/
            // re-upload that swaps glbUrl without toggling `tagged`.
            key={glbUrl}
            glbUrl={glbUrl}
            glbSizeBytes={glb?.byteLength ?? 0}
            disabled={genBusy}
            onContinue={(labels) => {
              setPartLabels(labels);
              setTagged(true);
            }}
          />
        )}

        {/* plan A2 — uploaded GLBs route through the SAME tagging step (no
            "USE THIS MODEL" confirm; the file pick is the confirm). It
            auto-skips to the metadata form when the base isn't taggable
            (single part / dup names / over-cap), preserving the legacy
            partLabels=[] behavior for those uploads. */}
        {haveModel && sourceMode === 'upload' && !tagged && (
          <TaggingStep
            // Fresh mount per uploaded GLB (see Tripo mount above) — a second
            // file pick mid-tagging must reset labels/loaded/skippedRef so the
            // auto-skip + naming evaluate against the NEW base only.
            key={glbUrl}
            glbUrl={glbUrl}
            glbSizeBytes={glb?.byteLength ?? 0}
            autoSkipIfNotTaggable
            onContinue={(labels) => {
              setPartLabels(labels);
              setTagged(true);
            }}
          />
        )}

        {haveModel && tagged && (
          <div data-testid="metadata-form" style={metadataGrid}>
            <label style={fullRow}>
              <span style={sectionLabel}>
                MODEL NAME <span style={{ color: tokens.color.accent }}>*</span>
              </span>
              <input
                data-testid="name-input"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  clearInvalid('name');
                }}
                aria-required="true"
                aria-invalid={invalidFields.has('name')}
                style={fieldStyle('name')}
              />
              {invalidFields.has('name') && (
                <span data-testid="name-required-error" style={{ ...monoLabel, color: tokens.color.err, marginTop: 4 }}>
                  Model name is required
                </span>
              )}
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
                      onChange={() => onPolicyChange(p.value)}
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
            {/* plan-027 U7 (D-078) — ALLOW_LIST now charges a one-time buy-access
                fee (the content gate, required > 0) plus an OPTIONAL per-launch
                derive fee. The unlock-price role moved off the derive-fee input
                onto this access-fee input; the derive-fee input below is now
                plain-optional for ALLOW_LIST. */}
            {policy === POLICY_ALLOW_LIST && (
              <label>
                <span style={sectionLabel}>UNLOCK PRICE (SUI) — REQUIRED</span>
                <input
                  data-testid="access-fee-input"
                  value={accessFeeSui}
                  onChange={(e) => {
                    setAccessFeeSui(e.target.value);
                    if (suiToMist(e.target.value) > 0n) clearInvalid('accessFee');
                  }}
                  placeholder="e.g. 1"
                  aria-invalid={invalidFields.has('accessFee')}
                  style={fieldStyle('accessFee')}
                />
                {invalidFields.has('accessFee') ? (
                  <span data-testid="access-fee-required-error" style={{ ...monoLabel, color: tokens.color.err, marginTop: 4 }}>
                    Unlock price must be greater than 0 SUI
                  </span>
                ) : (
                  <span data-testid="access-fee-hint" style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                    One-time price to unlock this model (buy access). Buyers pay this once to view and fork it. Must be more than 0 SUI.
                  </span>
                )}
              </label>
            )}
            <label>
              <span style={sectionLabel}>
                {policy === POLICY_ALLOW_LIST
                  ? 'DERIVATIVE MINT FEE (SUI) — OPTIONAL'
                  : 'DERIVATIVE MINT FEE (SUI)'}
              </span>
              <input
                data-testid="fee-input"
                value={feeSui}
                onChange={(e) => setFeeSui(e.target.value)}
                style={{ ...inputStyle, width: '100%' }}
              />
              {policy === POLICY_ALLOW_LIST && (
                <span data-testid="allow-list-fee-hint" style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                  Optional per-launch fee a forker pays when minting a collection from your model. May be 0.
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
              {/* plan 2026-06-08-001 U4 — no-caption nudge REPLACES the Mint
                  button while open (the trigger), so a second publish can't fire
                  mid-confirm. Continue → proceedMint; Cancel → back to editing.
                  Exception state: accent permitted (≤5/page, D-044/D-099). */}
              {noCaptionConfirm ? (
                <div data-testid="no-caption-panel" style={noCaptionPanel}>
                  <span style={{ ...monoLabel, color: tokens.color.accent }}>
                    — PUBLISH WITHOUT A DESCRIPTION?
                  </span>
                  <p style={{ margin: 0, fontSize: tokens.size.sm, color: tokens.color.ink, lineHeight: 1.5 }}>
                    {captioningAvailable
                      ? "No caption means this model won't show up in search. Add one with “Describe with AI” first?"
                      : "No caption means this model won't show up in search (captioning is unavailable right now)."}
                  </p>
                  <div style={{ display: 'flex', gap: tokens.space[3] }}>
                    <button
                      type="button"
                      data-testid="no-caption-cancel"
                      style={buttonOutline}
                      onClick={() => setNoCaptionConfirm(false)}
                    >
                      Go back
                    </button>
                    <button
                      type="button"
                      data-testid="no-caption-confirm"
                      style={buttonPrimary}
                      onClick={() => {
                        setNoCaptionConfirm(false);
                        void proceedMint();
                      }}
                    >
                      Publish anyway
                    </button>
                  </div>
                </div>
              ) : (
                <MintButton
                  status={mintStatus}
                  uploadStage={uploadStage}
                  onClick={onMint}
                  errorMessage={mintError ?? undefined}
                  explorerUrl={txDigest ? `https://suiscan.xyz/testnet/tx/${txDigest}` : undefined}
                />
              )}
              {/* Clicking Mint with missing required fields highlights them (below)
                  rather than disabling the button with no explanation. */}
              {invalidFields.size > 0 && mintStatus === 'idle' && (
                <p data-testid="mint-missing-fields" style={{ ...monoLabel, color: tokens.color.err, marginTop: 8 }}>
                  ↑ FILL THE HIGHLIGHTED REQUIRED FIELD{invalidFields.size > 1 ? 'S' : ''}
                </p>
              )}
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
