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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSuiClient } from '@mysten/dapp-kit';
import { useAppSigner } from '../wallet/useAppSigner';
import type {
  CollectionBuildRequest,
  CollectionBuildResponse,
  Model3DSummary,
} from '@overflow2026/shared';
import { modelDescription } from '@overflow2026/shared';
import { useSession } from '../auth/useSession';
import { SignInButton } from '../auth/SignInButton';
import { useModelIndex } from '../browse/useModelIndex';
import { QUILT_SIZE, useWalrusUpload } from '../walrus/useWalrusUpload';
import { BatchProgressPanel } from './BatchProgressPanel';
import { MemoryPressureBanner } from './MemoryPressureBanner';
import {
  VariantEditor,
  LEGACY_LABEL,
  MAX_VARIANTS,
  newVariantRow,
  newVariantEditorState,
  deriveUniqueLabels,
  hexToBaseColorRgb,
  type VariantEditorState,
  type VariantRow,
} from '../forge/VariantEditor';
import { VariantPreview } from '../forge/VariantPreview';
import { RandomGenControls } from '../forge/RandomGenControls';
import { VariantStrip } from '../forge/VariantStrip';
import {
  generateVariantColors,
  type HarmonicScheme,
  hexToHsl,
} from '../forge/harmonics';
import { buildLaunchCollectionWithTokensPtb } from '../sui/collectionTxBuilders';
import { useOwnedEntitlements } from './useOwnedEntitlements';
import { decryptViaEntitlement, decryptViaCreator } from '../seal/decryptAndView';
import { MeshInfoPanel } from '../babylon/MeshInfoPanel';
import { type CanvasMode, partsColorHex, useModeCycle } from '../babylon/modePalette';
import { PartListPanel, type PartListItem } from '../babylon/PartListPanel';
import { PreviewCanvas, type PreviewCanvasHandle } from '../babylon/PreviewCanvas';
import { extractMaterialNames } from '../babylon/extractMaterialNames';
import { allNamesUniqueNonEmpty } from '../babylon/partMaterials';
import { thumbSourceForSummary, previewStillUrlsForSummary } from '../walrus/aggregator';
// plan-027 U10 — entitlement-gated encrypted ALLOW_LIST fork. Unlock is now a
// FREE entitlement-gated decrypt (decryptViaEntitlement); the derive fee + cap
// are deferred to mint (launchEncryptedCollection now routes through the
// entitlement-gated launch entry). The SessionKey/Seal plumbing lives inside
// decryptViaEntitlement (D-078).
import {
  launchEncryptedCollection,
  mintEncryptedTokens,
} from './encryptedFork';
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
import { IndeterminateBar } from '../ux/IndeterminateBar';
import { useElapsedSeconds } from '../ux/useElapsedSeconds';

const WALRUS_AGGREGATOR = 'https://aggregator.walrus-testnet.walrus.space';

type Phase =
  | 'picking'
  | 'downloading-base'
  | 'editing-variants'
  | 'building-variants'
  | 'uploading'
  | 'signing'
  // plan-027 U10 — encrypted ALLOW_LIST entitlement-gated fork interstitials:
  //   'decrypting'    — UNLOCK: SessionKey sign + key-server decrypt (FREE).
  //   'launching-cap' — MINT: entitlement-gated launch (pay derive fee → cap).
  | 'launching-cap'
  | 'decrypting'
  | 'success'
  | 'error';

// plan-016 U4 — dapp-kit → walrus Signer bridge moved to
// frontend/src/wallet/useAppSigner.ts. That hook returns the same shape
// this page used to build locally, plus signPersonalMessage (for
// useSession) and a test-mode branch that returns the keypair directly
// when VITE_TEST_WALLET=1.

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

// plan-015 U7 / R9 — resolve a variant's label→hex palette into a positional
// hex[] aligned with `partLabels`. Same algorithm as runBuildVariants's
// inline resolver but returns hex strings (for the live-recolor canvas
// overlay) rather than [r,g,b,1] tuples (for the backend build endpoint).
// Legacy bases (`partLabels=[]`) collapse to a length-1 array via the
// LEGACY_LABEL → first-value fallback chain.
function resolvePartColorsHex(
  palette: Record<string, string>,
  partLabels: readonly string[],
): readonly string[] {
  if (partLabels.length === 0) {
    const hex = palette[LEGACY_LABEL] ?? Object.values(palette)[0] ?? '#cccccc';
    return [hex];
  }
  return partLabels.map((label) => palette[label] ?? '#cccccc');
}

// Page-local styles.

const mainStyle: CSSProperties = {
  maxWidth: 1040,
  margin: '0 auto',
  padding: '32px 24px 64px',
};

const headerStack: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 32 };
const sectionLabel: CSSProperties = { ...monoLabel, display: 'block', marginBottom: 12 };
// Body-text hint below an input — small body type, hint color to recede.
// Used for fields whose label alone doesn't convey intent (e.g. integration
// fee, where "REGISTER FEE FOR GAME DEVS" was opaque per polish-backlog §2).
const fieldHint: CSSProperties = {
  display: 'block',
  marginTop: 6,
  fontFamily: tokens.font.body,
  fontSize: tokens.size.xs,
  lineHeight: 1.5,
  color: tokens.color.hint,
};
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

// plan 2026-06-08-001 U3 (R4) — single-line description snippet on a base-option
// card. Neutral tokens; ellipsis truncation so a long prompt/caption stays one
// line and card-height reflow is bounded.
const baseOptionDescription: CSSProperties = {
  ...baseOptionMeta,
  color: tokens.color.muted,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const formGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: 16,
  marginBottom: 24,
};

// plan-015 U6 — customization-axes strip (R6, AE3). Mono uppercase list of
// the picked base's part_labels — the visible affordance "these are the
// axes A1 named for you to customize". Lead element of the authoring
// section so the forker reads the authored intent before touching colors.
const axesStrip: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 8,
  padding: '10px 14px',
  marginBottom: 16,
  background: tokens.color.paperPure,
  border: tokens.border.primary,
};

const axesStripLeader: CSSProperties = {
  ...monoLabel,
  color: tokens.color.muted,
  fontSize: 11,
  letterSpacing: '1.5px',
};

const axesStripLabel: CSSProperties = {
  ...monoLabel,
  color: tokens.color.ink,
  fontSize: 11,
  letterSpacing: '1.5px',
};

const axesStripDot: CSSProperties = {
  color: tokens.color.hint,
  margin: '0 4px',
};

// plan-015 U6 — 2-col preview layout. Left: VariantPreview (canvas + tiles).
// Right: MeshInfoPanel + PartListPanel side rail. Width tuned so the rail
// matches the canvas well's height visually on common viewports.
const previewLayout: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 280px',
  gap: 24,
  marginTop: 24,
};

const previewSideRail: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

const launchHelper: CSSProperties = {
  ...monoLabel,
  color: tokens.color.hint,
  marginTop: 8,
  letterSpacing: '1px',
};

// Status pill shown beneath the launch button while the Walrus quilt
// upload is in flight. Mono uppercase, matches D-044 statusPill aesthetic.
const uploadStatusPill: CSSProperties = {
  ...monoLabel,
  display: 'inline-block',
  marginTop: 12,
  padding: '6px 10px',
  border: tokens.border.primary,
  backgroundColor: tokens.color.paperPure,
  color: tokens.color.ink,
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

// plan-016 U5 / R5 / AE2 — banner copy is the MissingTestWalletKeyError
// message verbatim ("TEST_WALLET enabled but VITE_TEST_WALLET_KEY is
// missing — set it in .env.local"); invalid-key case shows the wrapped
// SDK rejection. LAUNCH stays disabled via the existing signer-null
// check, so the banner is purely informational.
function TestWalletBanner({ error }: { error: Error | null }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      data-testid="test-wallet-banner"
      style={{
        margin: '12px 0',
        padding: '10px 12px',
        border: `1.5px solid ${tokens.color.accent}`,
        color: tokens.color.accent,
        fontFamily: tokens.font.mono,
        fontSize: 12,
        letterSpacing: '0.5px',
      }}
    >
      {error.message}
    </div>
  );
}

export function LaunchCollectionPage() {
  const { session, clearSession } = useSession();
  // plan-016 U4/U5 — `signer` exposes the unified Signer interface;
  // `signerLoadError` is non-null only when VITE_TEST_WALLET=1 but the
  // key fails to load (missing or invalid). U5 banner uses its message.
  // useSession internally calls useAppAccount, so we don't need a
  // separate account read here; session.address is the source of truth
  // post-sign-in.
  const { signer, loadError: signerLoadError } = useAppSigner();
  const {
    uploadFiles,
    stage: uploadStage,
    batchIndex: uploadBatchIndex,
    batchTotal: uploadBatchTotal,
    txDigests: uploadTxDigests,
    error: uploadError,
  } = useWalrusUpload();
  const suiClient = useSuiClient();
  const { models, loading: modelsLoading } = useModelIndex();

  const [phase, setPhase] = useState<Phase>('picking');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [base, setBase] = useState<Model3DSummary | null>(null);
  const [baseGlb, setBaseGlb] = useState<Uint8Array | null>(null);
  // plan-027 U10 / D-078 — encrypted "unlock = free decrypt" flow. The forker
  // already HOLDS an AccessEntitlement for this base (that is why the catalog
  // surfaced it as launchable), so unlock no longer pays or mints a cap: it is a
  // FREE entitlement-gated decrypt. On success `baseGlb` holds the decrypted
  // plaintext and `unlockedEntitlementId` records WHICH entitlement gated it (so
  // the mint-time entitlement-gated launch reuses the same id). null = locked
  // (encrypted base not yet decrypted); irrelevant for public bases. The
  // derive-fee payment + cap mint now happen at MINT (onMintEncrypted), not here.
  const [unlockedEntitlementId, setUnlockedEntitlementId] = useState<string | null>(null);
  // Contract v11 — set true when the BASE CREATOR unlocked their OWN encrypted base
  // via the creator gate (no entitlement). Distinguishes the creator unlock from
  // both "not yet unlocked" (false + null entitlement) and the forker entitlement
  // unlock (non-null entitlement). Mint reads it to route through the LEGACY launch
  // instead of the entitlement-gated launch.
  const [unlockedAsCreator, setUnlockedAsCreator] = useState(false);
  const [collectionName, setCollectionName] = useState('');
  const [registerFeeSui, setRegisterFeeSui] = useState('0');
  const [editorState, setEditorState] = useState<VariantEditorState>(newVariantEditorState);
  const [selectedPreview, setSelectedPreview] = useState(0);
  const [variantGlbs, setVariantGlbs] = useState<Uint8Array[] | null>(null);
  const [txDigest, setTxDigest] = useState<string | null>(null);
  // GPU-memory mitigation: each base-picker thumbnail mounts a full Babylon
  // engine + scene + per-mesh textures (~300 MB GPU on a textured Tripo
  // model). With N candidates + 1 main VariantPreview + 1 editor preview,
  // /launch can reach 900+ MB GPU on a single tab, which Chrome's GPU
  // process kills under multi-tab pressure (mid-fetch renderer crash —
  // see useWalrusUpload.ts diagnostic trail). Once a base is picked, the
  // grid is no longer needed; collapse to a one-line summary + CHANGE
  // button. The thumbnails unmount → PreviewCanvas cleanup effect calls
  // engine.dispose() → GPU textures freed.
  const [basePickerExpanded, setBasePickerExpanded] = useState(true);

  // plan-015 U6 — preview canvas mode (controlled at page level so U7 can
  // flip mode externally on VariantEditor column hover). Default PBR
  // because /launch renders the swapped variants — the buyer's eye should
  // land on the colors A2 chose, not on the rainbow segment palette.
  const { mode: previewMode, cycle: cyclePreviewMode } = useModeCycle('pbr');
  // Selected part — driven from canvas POINTERPICK or PartListPanel row
  // click; surfaces as the SOLO highlight when previewMode === 'solo'.
  const [selectedPartIndex, setSelectedPartIndex] = useState<number | null>(null);
  // plan-015 U7 — VariantEditor column hover label. Non-null means the user
  // is hovering a column; the effective mode flips to SOLO with all part
  // indices matching that label highlighted (R8, AE4 win). On mouseout the
  // state returns to null and the effective mode falls back to previewMode.
  const [hoveredColumnLabel, setHoveredColumnLabel] = useState<string | null>(null);
  // plan-015 U8 — Random Gen state (R11). Seed + scheme + N + locked set.
  // Locks survive re-rolls so user-tuned variants persist across multiple
  // RANDOM GEN clicks. Default seed = saturated red, default scheme =
  // analogous (the tightest, friendliest coherence pattern).
  const [randomSeedHex, setRandomSeedHex] = useState('#cc3333');
  const [randomScheme, setRandomScheme] = useState<HarmonicScheme>('analogous');
  const [lockedIndices, setLockedIndices] = useState<ReadonlySet<number>>(
    () => new Set(),
  );

  // Only models published with a standalone GLB (D-037) are forkable — older
  // mints with an empty glb_blob_id can't be resolved to a base mesh.
  const forkable = useMemo(() => models.filter((m) => m.glbBlobId !== ''), [models]);

  // plan-027 U10 / D-078 — which forkable bases the wallet already holds an
  // AccessEntitlement for. RESTRICTED bases are filtered upstream (useModelIndex),
  // so in `forkable` an encrypted base ⇔ ALLOW_LIST. The catalog splits into:
  //   launchable = PERMISSIONLESS ∪ (ALLOW_LIST ∩ ownedEntitlements) — full card.
  //   locked     = ALLOW_LIST the wallet has no entitlement for — grayed card
  //                with a "buy access on model page" link (AE4: locked ≠ forkable).
  // entitlementByModel supplies the `seal_approve_entitlement` object arg the
  // free unlock decrypt needs; the same id is threaded into the mint-time
  // entitlement-gated launch.
  const {
    modelIds: ownedEntitlementModelIds,
    entitlementByModel,
  } = useOwnedEntitlements(session?.address);
  // Contract v11 — the BASE CREATOR can fork their OWN ALLOW_LIST base for free:
  // they view/decrypt via the creator gate (seal_approve_creator, no entitlement)
  // and launch via the LEGACY `launch_collection` (the republished contract lets
  // the creator call it without an entitlement; non-creators still rejected). So a
  // creator's own encrypted base is launchable even with no entitlement held.
  const isOwnBase = useCallback(
    (m: Model3DSummary): boolean =>
      !!session?.address && m.creator === session.address,
    [session?.address],
  );
  const isLaunchable = useCallback(
    (m: Model3DSummary): boolean =>
      !m.isEncrypted || ownedEntitlementModelIds.has(m.objectId) || isOwnBase(m),
    [ownedEntitlementModelIds, isOwnBase],
  );

  // Plan-013 UAT polish: writeFilesFlow has two non-popup phases (encoding
  // + relay-upload) that can run 5-15s with no visible feedback. Shared
  // hook so the counter survives status transitions within the active
  // window and so the same logic doesn't drift across pages.
  const uploadElapsed = useElapsedSeconds(phase === 'uploading');

  const onPickBase = useCallback(async (model: Model3DSummary) => {
    setErrorMsg(null);
    setBase(model);
    setVariantGlbs(null);
    // Collapse the base-picker grid so its PreviewCanvas thumbnails
    // unmount (each ≈ 300 MB GPU on a textured Tripo model — see
    // diagnostic in useWalrusUpload.ts). User can click CHANGE to
    // re-expand if they want a different base.
    setBasePickerExpanded(false);
    // plan-015 U6 — reset preview-side selection state when switching
    // bases. Otherwise a stale selectedPartIndex would point at a part
    // that may not exist in the new base.
    setSelectedPartIndex(null);
    // plan-015 F5 — reset selected preview index. After switching bases the
    // new editor seeds with 1 row, so any stale selectedPreview > 0 would
    // point at a non-existent tile until VariantStrip is regenerated.
    setSelectedPreview(0);
    // plan-015 F6 — clear any active column-hover label so the new base
    // doesn't open in SOLO mode with a stale label from the previous base.
    setHoveredColumnLabel(null);
    // plan-015 U8 — clear locks when switching bases; preserving them
    // would carry forward lock indices into a different variant array.
    setLockedIndices(new Set());
    // plan-027 U10 — re-lock: a freshly picked base is never unlocked yet, and
    // the previous base's decrypted plaintext must not leak into the new
    // authoring session. Both reset here (encrypted branch keeps baseGlb null;
    // the public branch overwrites baseGlb with the fetched mesh below).
    setUnlockedEntitlementId(null);
    setUnlockedAsCreator(false);
    // plan-013 U7 — reset the editor state with the base's unique labels so
    // the palette starts with one entry per semantic label (or `['primary']`
    // for legacy bases). Switching between bases of different label shapes
    // is rare during a launch session but supported via this reset.
    setEditorState(newVariantEditorState(deriveUniqueLabels(model.partLabels)));
    // plan-026 U5 — encrypted ALLOW_LIST base: the `glb_blob_id` holds AES
    // CIPHERTEXT, not a public GLB. We CANNOT fetch a usable base mesh here —
    // decryption requires the forker to first pay (step 1 mints the cap) and
    // sign a SessionKey (step 2). So we skip the base download entirely; the
    // forker authors variants against the public preview still until they
    // commit. The decrypt + bake happens inside onLaunch's 3-step path.
    if (model.isEncrypted) {
      setBaseGlb(null);
      if (!collectionName) setCollectionName(`${model.name} variants`);
      setPhase('editing-variants');
      return;
    }
    // UX-G1 fix — distinct phase so the launch button label reads
    // "DOWNLOADING BASE MESH…" instead of the misleading "BUILDING 1 VARIANTS"
    // (we haven't built anything yet; we're just fetching the base GLB from
    // the Walrus aggregator before the editor opens).
    setPhase('downloading-base');
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

  const runBuildVariants = useCallback(async (
    // plan-027 U10 — the encrypted path holds the decrypted plaintext base
    // (free entitlement-gated unlock) and passes it here; the public path omits
    // it and we fall back to the state `baseGlb` fetched at pick time. The
    // mint-time cap doesn't exist yet at bake (the entitlement-gated launch runs
    // AFTER the bake), so no `encryptedBase` cap-ownership hardening param is
    // passed — the on-chain entitlement gate is the real authority now (D-078).
    baseGlbOverride?: Uint8Array,
  ): Promise<Uint8Array[]> => {
    const effectiveBaseGlb = baseGlbOverride ?? baseGlb;
    if (!session || !effectiveBaseGlb || !base) throw new Error('build: session + base GLB required');
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
        const hex = palette[LEGACY_LABEL] ?? Object.values(palette)[0] ?? '#cccccc';
        return [{ baseColorRgb: hexToBaseColorRgb(hex), textureId: undefined }];
      }
      return partLabels.map((label) => ({
        baseColorRgb: hexToBaseColorRgb(palette[label] ?? '#cccccc'),
        textureId: undefined as unknown as undefined,
      }));
    };
    // plan A2 — derive each part's material name from the base GLB using the SAME
    // Babylon loader + filter as the tagging step, so index i lines up with
    // partLabels[i]. Attach `materialName` so the backend swaps by name (order-
    // independent) instead of by gltf-transform's positional material order,
    // which can diverge from the browser's part order for arbitrary uploads.
    // Only when the base is bijective + uniquely named (taggable upload / Tripo);
    // otherwise fall back to the legacy positional path (no materialName).
    let materialNames: (string | null)[] = [];
    try {
      materialNames = await extractMaterialNames(effectiveBaseGlb);
    } catch (e) {
      // Don't swallow silently: a NullEngine parse failure on a multi-part base
      // drops us to the positional swap, which is only safe for Tripo-aligned
      // bases. Surface it so the degradation is at least diagnosable.
      // eslint-disable-next-line no-console
      console.warn('runBuildVariants: extractMaterialNames failed; falling back to positional swap', e);
      materialNames = [];
    }
    const nameKeyingApplies =
      partLabels.length > 0 &&
      materialNames.length === partLabels.length &&
      allNamesUniqueNonEmpty(materialNames);
    const buildReq: CollectionBuildRequest = {
      baseGlbBase64: bytesToBase64(effectiveBaseGlb),
      variants: editorState.variants.map((row) => {
        const partColors = resolvePartColors(row.palette).map((pc, i) => ({
          baseColorRgb: pc.baseColorRgb,
          textureId: row.textureId,
          ...(nameKeyingApplies ? { materialName: materialNames[i] as string } : {}),
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
      // plan-013 fix-pass F7 — surface a human-readable message when the
      // backend reports per-variant length drift, instead of dumping the raw
      // envelope text. Other 422/5xx classes fall through to the generic
      // message so unknown errors stay visible verbatim for debugging.
      const txt = await res.text().catch(() => '');
      try {
        const body = JSON.parse(txt) as {
          error?: string;
          materialCount?: number;
          partColorsCount?: number;
          materialName?: string;
        };
        if (body.error === 'part_count_mismatch') {
          throw new Error(
            `Base mesh has ${body.materialCount} parts but the editor sent ${body.partColorsCount} colors. ` +
              `Try picking a different base, or regenerate this one — Tripo's segmentation can drift across runs.`,
          );
        }
        // plan A2 — name-keyed swap envelopes. A part's material name didn't
        // resolve, or matched more than one material in the base.
        if (body.error === 'material_name_not_found') {
          throw new Error(
            `Couldn't match a part to the base mesh` +
              `${body.materialName ? ` (part "${body.materialName}")` : ''}. ` +
              `Try picking a different base, or regenerate this one.`,
          );
        }
        if (body.error === 'ambiguous_material_name') {
          throw new Error(
            `This base has parts that share the same material name` +
              `${body.materialName ? ` ("${body.materialName}")` : ''}, so they can't be ` +
              `recolored separately. Try a different base.`,
          );
        }
      } catch (parseOrTyped) {
        if (
          parseOrTyped instanceof Error &&
          (parseOrTyped.message.startsWith('Base mesh has') ||
            parseOrTyped.message.startsWith("Couldn't match a part") ||
            parseOrTyped.message.startsWith('This base has parts'))
        ) {
          throw parseOrTyped;
        }
        // JSON.parse failure (raw text body): fall through.
      }
      throw new Error(`build: HTTP ${res.status} ${txt}`);
    }
    const body = (await res.json()) as CollectionBuildResponse;
    const swapped = body.variants.map((v) => base64ToBytes(v.glbBase64));
    setVariantGlbs(swapped);
    return swapped;
    // `base` is read for `base.partLabels` (line above) and is updated
    // atomically with `baseGlb` in `onPickBase`, so this dep is currently a
    // co-change of `baseGlb`. Listed explicitly so a future refactor that
    // decouples them (e.g. lazy GLB fetch, swap-base-keep-blob) can't
    // silently capture a stale base in this closure.
  }, [session, baseGlb, base, editorState, clearSession]);

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

  // plan-016 code-review hotfix — synchronous guard against double-click.
  // `busy` is React state and the DOM disabled attr only updates after
  // the next render; two clicks within ~16ms both pass the disabled check
  // and dispatch concurrent onLaunch calls, submitting the launch PTB
  // twice (the test-wallet path makes this easier because there's no
  // wallet-popup interstitial to serialize clicks). useRef flips
  // synchronously, so the second invocation early-returns immediately.
  const launchingRef = useRef(false);
  // plan-027 U10 / D-078 — unlock is now a FREE entitlement-gated decrypt (no
  // on-chain payment), so the old pay-once `pendingCapRef` double-charge guard is
  // gone: re-running the free decrypt on a transient key-server failure costs
  // nothing. The single on-chain charge now lives at MINT (one tx, naturally
  // idempotent via launchingRef).
  // plan-017 U5 — bumped on every LAUNCH click so MemoryPressureBanner
  // re-checks heap pressure and re-surfaces if still over threshold even
  // when the user dismissed it earlier in the session.
  const [memoryRecheckSignal, setMemoryRecheckSignal] = useState(0);
  // plan-017 U3 — imperative handle on the main VariantPreview canvas so
  // onLaunch can free its Babylon scene during the Walrus upload window.
  // ~200–400 MB of Babylon heap (meshes, materials, textures, observers)
  // drops out of the OOM danger zone while the SDK's encodeQuilt Promise.all
  // runs over each 4-variant chunk. Restored in the finally block whether
  // upload succeeded, failed, or was cancelled.
  const previewRef = useRef<PreviewCanvasHandle | null>(null);
  const onLaunch = useCallback(async () => {
    if (launchingRef.current) return;
    if (!session || !signer || !base || !baseGlb) return;
    // plan-017 U5 — fresh memory check on LAUNCH click. If the heap is
    // still over threshold the banner re-surfaces even after a prior
    // dismiss. Bump synchronously (cheap; just a setState).
    setMemoryRecheckSignal((n) => n + 1);
    launchingRef.current = true;
    setErrorMsg(null);
    setPhase('building-variants');
    // Free the Babylon scene BEFORE runBuildVariants starts allocating the
    // material-swap GLBs and BEFORE uploadFiles encodes them into quilts.
    // Engine stays alive (avoids WebGL context loss); only scene/HL/observers
    // are disposed. remount() in finally restores the scene for the
    // post-launch success or error UI.
    previewRef.current?.dispose();
    try {
      const swapped = await runBuildVariants();

      setPhase('uploading');
      // plan-016 — walrus's uploadFiles expects a full Sui SDK Signer, but
      // AppSigner intentionally exposes only the methods consumers need
      // (toSuiAddress + signAndExecuteTransaction + signPersonalMessage).
      // At runtime walrus's writeFilesFlow only calls those two of the
      // four it advertises, so structural compatibility is real even
      // though TS can't see it. The cast scopes the type-erasure to this
      // single call site rather than polluting the AppSigner interface
      // with abstract Signer methods it can't honestly implement.
      const upload = await uploadFiles(swapped, signer as never);
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
      // plan-016 U4 — use the unified Signer.signAndExecuteTransaction
      // shape ({transaction, client}). AppSigner declares the return as
      // the SDK's TransactionResult discriminated union, so no cast is
      // needed at the call site — TS narrows via $kind. The U7
      // code-review pass dropped an earlier inline cast that lied about
      // the return shape.
      const res = await signer.signAndExecuteTransaction({
        transaction: tx,
        client: suiClient,
      });
      if (res.$kind === 'FailedTransaction') {
        throw new Error(
          `Launch tx failed (${res.FailedTransaction.digest}): ${res.FailedTransaction.status?.error?.message ?? 'unknown'}`,
        );
      }
      setTxDigest(res.Transaction.digest);
      setPhase('success');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setPhase('error');
    } finally {
      launchingRef.current = false;
      // Always remount the Babylon scene — success path lands on the
      // share/copy UI which doesn't need it, but the error path returns
      // the user to the authoring flow with the preview restored.
      previewRef.current?.remount();
    }
  }, [session, signer, base, baseGlb, runBuildVariants, uploadFiles, collectionName, registerFeeSui, suiClient]);

  // plan A — encrypted ALLOW_LIST fork, "unlock-first" two-action flow (replaces
  // the old monolithic onLaunchEncrypted). PERMISSIONLESS stays on the atomic
  // onLaunch above. onUnlock (pay + decrypt) and onMintEncrypted (bake + mint)
  // each take wallet signatures and cannot be driven in agent-browser — see
  // CLAUDE.md Frontend Verification Protocol; unit tests mock the seam.
  //
  // Wallet-signing wrapper shared by the encrypted unlock (step 1 launch) + mint
  // (mint_tokens): signs+executes a PTB and returns the digest, surfacing a
  // FailedTransaction as a thrown error.
  const signAndExecutePtb = useCallback(
    async (tx: Parameters<NonNullable<typeof signer>['signAndExecuteTransaction']>[0]['transaction']): Promise<string> => {
      if (!signer) throw new Error('No signer');
      const res = await signer.signAndExecuteTransaction({ transaction: tx, client: suiClient });
      if (res.$kind === 'FailedTransaction') {
        throw new Error(
          `Tx failed (${res.FailedTransaction.digest}): ${res.FailedTransaction.status?.error?.message ?? 'unknown'}`,
        );
      }
      return res.Transaction.digest;
    },
    [signer, suiClient],
  );

  // plan-027 U10 / D-078 — UNLOCK = FREE entitlement-gated decrypt (≤1 wallet
  // signature, only when no live SessionKey is cached — no payment, no cap mint).
  // The forker already HOLDS an AccessEntitlement for this base (that is why the
  // catalog surfaced it as launchable), bought earlier via purchase_access on
  // /model/:id. We look that entitlement up and run the shared
  // decryptViaEntitlement helper (SessionKey → seal_approve_entitlement key-server
  // dry-run → AES-GCM). On success the plaintext lands in `baseGlb` and the
  // entitlement id in `unlockedEntitlementId`, so the rest of the authoring UI
  // renders LIVE and the mint-time entitlement-gated launch reuses the same id.
  // The derive fee is charged later, at MINT (onMintEncrypted) — NOT here.
  const onUnlock = useCallback(async () => {
    if (launchingRef.current) return;
    if (!session || !signer || !base) return;
    // Contract v11 — the BASE CREATOR unlocking their OWN encrypted base decrypts
    // via the creator gate (seal_approve_creator: sender == model.creator), with NO
    // entitlement. A forker who bought access decrypts via their held entitlement.
    const ownBase = isOwnBase(base);
    const entitlementId = ownBase ? undefined : entitlementByModel.get(base.objectId);
    if (!ownBase && !entitlementId) {
      // Defensive: the catalog only surfaces an encrypted base as launchable when
      // the wallet holds its entitlement OR is the creator, so this is a
      // should-not-happen guard (e.g. the entitlement set went stale mid-session).
      // Point the forker at the buy-access page instead of firing a decrypt that
      // deterministically aborts.
      setErrorMsg('You don’t hold access to this base yet — buy access on its model page first.');
      setPhase('error');
      return;
    }
    setMemoryRecheckSignal((n) => n + 1);
    launchingRef.current = true;
    setErrorMsg(null);
    setPhase('decrypting');

    try {
      // FREE decrypt — no on-chain payment. The creator gate (decryptViaCreator)
      // and the entitlement gate (decryptViaEntitlement) each encapsulate the
      // SessionKey sign (≤1 popup) + the key-server dry-run + the AES-GCM decrypt,
      // and return the plaintext GLB bytes. ONLY the seal_approve gate differs.
      // NB: bind via arrow — `signer.signPersonalMessage` is a Signer CLASS
      // method that calls `this.signWithIntent`; passing it unbound drops `this`
      // and throws "this.signWithIntent is not a function" at the key-server step.
      const signPersonalMessage = (msg: Uint8Array) => signer.signPersonalMessage(msg);
      const { plaintext } = ownBase
        ? await decryptViaCreator({
            model: base,
            suiClient: suiClient as never,
            signPersonalMessage,
            address: session.address,
          })
        : await decryptViaEntitlement({
            model: base,
            entitlementId: entitlementId!,
            suiClient: suiClient as never,
            signPersonalMessage,
            address: session.address,
          });

      // Unlocked: hold the plaintext + record WHICH gate was used (creator vs
      // entitlement) so mint routes through the matching launch entry. No
      // raw-download affordance is ever rendered for these bytes (R7).
      setBaseGlb(plaintext);
      if (ownBase) {
        setUnlockedAsCreator(true);
      } else {
        setUnlockedEntitlementId(entitlementId!);
      }
      setPhase('editing-variants');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setPhase('error');
    } finally {
      launchingRef.current = false;
    }
  }, [session, signer, base, suiClient, entitlementByModel, isOwnBase]);

  // plan-027 U10 / D-078 — MINT (encrypted bases). Runs AFTER the free unlock, and
  // is where the DERIVE FEE is charged (no charge happened at unlock). Sequence
  // (signs ~3×: Walrus register/certify + entitlement-gated launch + mint_tokens):
  //   1. bake the authored palettes onto the held decrypted plaintext + upload the
  //      quilt to Walrus (the cap doesn't exist yet, so no cap-ownership hardening),
  //   2. launch_collection_with_entitlement(model, entitlement, payment=deriveFee,
  //      quilt="") → creates the empty collection + soulbound cap (the cap is
  //      created HERE, at mint, not at unlock),
  //   3. mint_tokens(cap, collection, quilt, names, patches) → pins the post-bake
  //      quilt + batch-mints the colored fleet.
  // The derive fee is read from the base summary (may be 0 → a zero-coin split the
  // contract destroys). The held `unlockedEntitlementId` gates the launch.
  const onMintEncrypted = useCallback(async () => {
    if (launchingRef.current) return;
    if (!session || !signer || !base) return;
    // Unlocked iff EITHER the creator gate fired (own base) OR an entitlement gate
    // fired (forker). Both produce `baseGlb` plaintext; the launch entry differs.
    if ((!unlockedEntitlementId && !unlockedAsCreator) || !baseGlb) {
      setErrorMsg('Unlock the base before minting.');
      return;
    }
    setMemoryRecheckSignal((n) => n + 1);
    launchingRef.current = true;
    setErrorMsg(null);
    previewRef.current?.dispose();

    try {
      // 1 — bake the authored palettes onto the held plaintext + upload the quilt.
      setPhase('building-variants');
      const swapped = await runBuildVariants(baseGlb);

      setPhase('uploading');
      const upload = await uploadFiles(swapped, signer as never);
      if (!upload.blobIds[0]) throw new Error('Walrus upload returned no quilt blob');

      // 2 — launch: pay the derive fee + mint the cap + empty collection. The
      // launch ENTRY depends on who is forking: the BASE CREATOR forking their OWN
      // base uses the LEGACY `launch_collection` (contract v11 lets the creator call
      // it without an entitlement); a forker uses `launch_collection_with_entitlement`
      // (the bare entry rejects ALLOW_LIST for non-creators, D-078 U3b).
      setPhase('launching-cap');
      const launch = await launchEncryptedCollection({
        modelId: base.objectId,
        launchAuth: unlockedAsCreator
          ? { kind: 'creator' }
          : { kind: 'entitlement', entitlementId: unlockedEntitlementId! },
        feeMist: BigInt(base.derivativeMintFee || '0'),
        signAndExecute: signAndExecutePtb,
        fetchObjectChanges: async (digest) => {
          // Wait for finality so getTransactionBlock's objectChanges resolve.
          await suiClient.waitForTransaction({ digest });
          const tb = await suiClient.getTransactionBlock({
            digest,
            options: { showObjectChanges: true },
          });
          return (tb.objectChanges ?? []) as ReadonlyArray<{
            type?: string;
            objectType?: string;
            objectId?: string;
          }>;
        },
      });

      // 3 — mint_tokens (set quilt + batch-mint into the just-created collection).
      setPhase('signing');
      const name = collectionName.trim() || `${base.name} variants`;
      const tokenNames = swapped.map((_, i) => `${name} #${i + 1}`);
      const tokenPatchIds = swapped.map((_, i) => upload.patchIds[i] ?? '');
      const digest = await mintEncryptedTokens({
        capId: launch.capId,
        collectionId: launch.collectionId,
        quiltBlobId: upload.blobIds[0],
        tokenNames,
        tokenPatchIds,
        signAndExecute: signAndExecutePtb,
      });
      setTxDigest(digest);
      setPhase('success');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setPhase('error');
    } finally {
      launchingRef.current = false;
      previewRef.current?.remount();
    }
  }, [session, signer, base, unlockedEntitlementId, unlockedAsCreator, baseGlb, runBuildVariants, uploadFiles, collectionName, signAndExecutePtb, suiClient]);

  // plan-026 U5 — the picked base's encryption decides the launch handler +
  // labels. Encrypted ALLOW_LIST bases run the entitlement-gated decrypt fork;
  // everything else stays on the atomic path.
  const isEncryptedBase = base?.isEncrypted ?? false;
  // plan-027 U10 — encrypted bases are "locked" until the forker decrypts (a
  // FREE unlock). The authoring editor + live preview are gated behind the unlock;
  // the public path is never locked. Contract v11 — an encrypted base is "unlocked"
  // once EITHER gate fired: a held entitlement (forker) OR the creator gate (own base).
  const isEncryptedUnlocked = !!unlockedEntitlementId || unlockedAsCreator;
  const needsUnlock = isEncryptedBase && !isEncryptedUnlocked;

  const busy =
    phase === 'downloading-base' ||
    phase === 'building-variants' ||
    phase === 'uploading' ||
    phase === 'signing' ||
    phase === 'launching-cap' ||
    phase === 'decrypting';

  // plan-027 U10 — UNLOCK button label (encrypted, pre-unlock). The unlock is now
  // a FREE entitlement-gated decrypt — no payment — so the copy advertises "free,
  // you own access". Owns only the 'decrypting' phase (the derive fee is charged
  // at MINT, which owns 'launching-cap').
  const unlockLabel = (() => {
    if (phase === 'decrypting') return '— SIGN + DECRYPT BASE…';
    return 'UNLOCK TO DESIGN — DECRYPT (FREE, YOU OWN ACCESS) →';
  })();

  const launchLabel = (() => {
    if (phase === 'downloading-base') return '— DOWNLOADING BASE MESH…';
    if (phase === 'building-variants') return `— BUILDING ${editorState.variants.length} VARIANTS`;
    if (phase === 'uploading') {
      if (uploadStage === 'awaiting-register') return 'Approve Walrus register…';
      if (uploadStage === 'awaiting-certify') return 'Approve Walrus certify…';
      return 'Uploading variants to Walrus…';
    }
    if (phase === 'signing') {
      return isEncryptedBase
        ? `— APPROVE MINT (${editorState.variants.length} tokens)…`
        : `Step 3 of 3 — approve launch (collection + ${editorState.variants.length} tokens)…`;
    }
    if (phase === 'success') return 'LAUNCHED';
    if (isEncryptedBase) {
      return `MINT COLLECTION (${editorState.variants.length} TOKENS) →`;
    }
    return `LAUNCH COLLECTION (${editorState.variants.length} TOKENS) →`;
  })();

  // UX-G3 fix — PREVIEW button reflects its own action while a build is in
  // flight (otherwise it just goes disabled with stale text). Other phases
  // keep the static label so the button reads as the intended action.
  const previewLabel =
    phase === 'building-variants'
      ? `— BUILDING ${editorState.variants.length} VARIANTS…`
      : 'PREVIEW VARIANTS';

  // plan-015 U6 — PartListPanel items derived from base.partLabels. The
  // PARTS-rainbow swatch is stable per index so the row identity matches
  // the canvas's PARTS-mode coloring whenever the user toggles modes.
  const partListItems: PartListItem[] = useMemo(
    () =>
      (base?.partLabels ?? []).map((label, i) => ({
        index: i,
        label,
        colorHex: partsColorHex(i),
      })),
    [base?.partLabels],
  );

  // SOLO highlight set — only meaningful when the user is in SOLO mode AND
  // has a selected part. In other modes the canvas treats this as empty.
  // plan-015 F8 — memoized so the array identity is stable across renders
  // when (previewMode, selectedPartIndex) don't change. The canvas mode
  // effect depends on this array; an unstable identity would re-fire it on
  // every parent render.
  const highlightedParts = useMemo<readonly number[]>(
    () =>
      previewMode === 'solo' && selectedPartIndex !== null
        ? [selectedPartIndex]
        : [],
    [previewMode, selectedPartIndex],
  );

  // plan-015 F10 — 50ms debounce on the hover-null transition. When the
  // user drags between adjacent column headers, the brief mouseleave →
  // mouseenter gap would flicker the canvas back to PBR for one frame.
  // Debouncing the null branch (only) absorbs the gap; entering a column
  // is still immediate so the SOLO highlight feels responsive.
  const hoverNullTimeoutRef = useRef<number | null>(null);
  const handleColumnHover = useCallback((label: string | null) => {
    if (hoverNullTimeoutRef.current !== null) {
      clearTimeout(hoverNullTimeoutRef.current);
      hoverNullTimeoutRef.current = null;
    }
    if (label === null) {
      hoverNullTimeoutRef.current = window.setTimeout(() => {
        setHoveredColumnLabel(null);
        hoverNullTimeoutRef.current = null;
      }, 50);
    } else {
      setHoveredColumnLabel(label);
    }
  }, []);
  // Cleanup any pending null-debounce when this page unmounts so we don't
  // call setState on an unmounted component (React 19 warns otherwise).
  useEffect(() => {
    return () => {
      if (hoverNullTimeoutRef.current !== null) {
        clearTimeout(hoverNullTimeoutRef.current);
        hoverNullTimeoutRef.current = null;
      }
    };
  }, []);

  // plan-015 U7 — VariantEditor column-hover SOLO wiring. When a column is
  // hovered, force SOLO mode and highlight EVERY part index whose label
  // matches the hovered column. base.partLabels is positional (length =
  // mesh count), so the reduce produces the canonical indices the canvas
  // expects.
  const hoverHighlightedParts = useMemo(() => {
    if (!hoveredColumnLabel || !base) return [];
    return base.partLabels
      .map((l, i) => (l === hoveredColumnLabel ? i : -1))
      .filter((i): i is number => i >= 0);
  }, [hoveredColumnLabel, base]);

  // Effective mode + highlight set — hover overlay wins while active, else
  // fall back to the user-picked mode. This is the "stash + restore"
  // pattern flattened into a derivation: no useEffect, no stashed state.
  // plan-015 F4 — only flip to SOLO when hover yields at least one matching
  // index. Otherwise a legacy base (`partLabels=[]`) or a stale
  // hoveredColumnLabel that no longer matches any part would blank the
  // canvas (SOLO with empty highlights dims every mesh).
  const hoverActive =
    hoveredColumnLabel !== null && hoverHighlightedParts.length > 0;
  const effectiveMode: CanvasMode = hoverActive ? 'solo' : previewMode;
  const effectiveHighlightedParts: readonly number[] = hoverActive
    ? hoverHighlightedParts
    : highlightedParts;

  // plan-015 U7 / R9 — live-recolor channel. Resolve the active variant's
  // label→hex palette into the positional partColors[] the canvas paints
  // on top of the snapshot baseline. Same resolution as runBuildVariants
  // (legacy bases collapse to a length-1 array via the LEGACY_LABEL
  // fallback). Memoized on the inputs so the canvas effect only re-fires
  // when colors actually change.
  const partColors = useMemo(() => {
    if (!base) return undefined;
    const active = editorState.variants[selectedPreview];
    if (!active) return undefined;
    return resolvePartColorsHex(active.palette, base.partLabels);
  }, [base, editorState.variants, selectedPreview]);

  // plan-015 U7 / R9 — base-mesh blob URL surfaced to VariantPreview as a
  // fallback render target. Without this, the canvas shows a placeholder
  // until the user clicks PREVIEW; with this, partColors paint live on the
  // base mesh from the moment the authoring section opens.
  // plan-015 F1 — URL creation co-located with revocation inside one
  // effect. The pre-fix useMemo/useEffect split could leak a URL under
  // React 19 StrictMode's mount→unmount→mount double-invoke (the useMemo
  // ran twice but the cleanup only chased the second value).
  const [baseGlbUrl, setBaseGlbUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!baseGlb) {
      setBaseGlbUrl(null);
      return;
    }
    const url = URL.createObjectURL(
      new Blob([baseGlb as BlobPart], { type: 'model/gltf-binary' }),
    );
    setBaseGlbUrl(url);
    return () => {
      URL.revokeObjectURL(url);
      setBaseGlbUrl(null);
    };
  }, [baseGlb]);

  // plan-015 U8 — variant count for RandomGen mirrors VariantEditor's
  // current row count. Changing it via the RandomGen stepper updates the
  // editor state in-place (adds default-palette rows or truncates).
  const variantCount = editorState.variants.length;
  // plan-015 F16 — dynamic minN so the stepper N− button disables before
  // it would drop a locked variant. Pre-fix, hitting N− while variant N-1
  // was locked truncated past the lock — the lock state was preserved but
  // the variant row it referenced was gone, leaving a phantom locked
  // index. Now N− is gated at `maxLockedIndex + 1` (and at 1 for the
  // empty-lock case via Math.max).
  const minRandomN = useMemo(() => {
    if (lockedIndices.size === 0) return 1;
    let maxLocked = -1;
    for (const i of lockedIndices) {
      if (i > maxLocked) maxLocked = i;
    }
    return Math.max(1, maxLocked + 1);
  }, [lockedIndices]);
  const onChangeVariantCount = useCallback(
    (next: number) => {
      const target = Math.max(1, Math.min(MAX_VARIANTS, next));
      if (target === editorState.variants.length) return;
      const uniqueLabels = deriveUniqueLabels(base?.partLabels ?? []);
      if (target < editorState.variants.length) {
        setEditorState({
          ...editorState,
          variants: editorState.variants.slice(0, target),
        });
        // Drop locks that fell past the new length so they don't ghost.
        if ([...lockedIndices].some((i) => i >= target)) {
          setLockedIndices(new Set([...lockedIndices].filter((i) => i < target)));
        }
      } else {
        const extras: VariantRow[] = [];
        for (let i = editorState.variants.length; i < target; i++) {
          extras.push(
            newVariantRow({
              uniqueLabels,
              seed: { priceMist: editorState.globalPriceMist },
            }),
          );
        }
        setEditorState({
          ...editorState,
          variants: [...editorState.variants, ...extras],
        });
      }
    },
    [editorState, base?.partLabels, lockedIndices],
  );

  // plan-015 U8 — RANDOM GEN distributor. Generates N variants × K colors
  // via harmonic math, then distributes each variant's K colors across the
  // base's unique labels. Locked variants keep their existing palette
  // (R11: "User can re-roll repeatedly without losing manual edits to
  // locked variants").
  const onRandomGenerate = useCallback(() => {
    if (!base) return;
    const uniqueLabels = deriveUniqueLabels(base.partLabels);
    const K = uniqueLabels.length;
    const N = editorState.variants.length;
    const generated = generateVariantColors(
      hexToHsl(randomSeedHex),
      randomScheme,
      K,
      N,
    );
    const nextVariants = editorState.variants.map((row, i) => {
      if (lockedIndices.has(i)) return row;
      const colors = generated[i];
      if (!colors) return row;
      const palette: Record<string, string> = {};
      uniqueLabels.forEach((label, k) => {
        palette[label] = colors[k] ?? '#cccccc';
      });
      return { ...row, palette };
    });
    setEditorState({ ...editorState, variants: nextVariants });
  }, [base, editorState, randomSeedHex, randomScheme, lockedIndices]);

  const onToggleLock = useCallback((index: number) => {
    setLockedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  // plan-016 hotfix — the previous early-return for `!session` sat AFTER 11
  // hooks (useState/useMemo/useCallback/useEffect at lines 630-810 above)
  // and BEFORE the main return below. That violated React's rules-of-hooks
  // because the post-signin render path called 11 more hooks than the
  // pre-signin path. Slush masked it via OAuth-redirect-then-reload (first
  // render is always post-signin); plan-016's in-page test wallet signin
  // exposes the transition. Fix: keep all hooks at the top of the function
  // and pick the render branch here, after every hook has run.
  if (!session) {
    return (
      <div data-testid="launch-page" style={pagePaper}>
        <main style={mainStyle}>
          <TestWalletBanner error={signerLoadError} />
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

  return (
    <div data-testid="launch-page" style={pagePaper}>
      <main style={mainStyle}>
        <TestWalletBanner error={signerLoadError} />
        <MemoryPressureBanner recheckSignal={memoryRecheckSignal} />
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
          {/* Collapsed summary once a base is picked — keeps the grid's
              N PreviewCanvas mounts (each ≈ 300 MB GPU) from competing
              with the main VariantPreview through the rest of the L2
              flow. CHANGE re-expands. */}
          {base && !basePickerExpanded ? (
            <div
              data-testid="base-picker-collapsed"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: '12px 16px',
                border: tokens.border.primary,
                background: tokens.color.paperPure,
              }}
            >
              <span style={baseOptionName}>{base.name || '(unnamed)'}</span>
              <span style={{ ...baseOptionMeta, flex: 1 }}>
                fork fee: {mistToSui(base.derivativeMintFee)} SUI · royalty: {(base.derivativeRoyaltyBps / 100).toFixed(2)}%
              </span>
              <button
                type="button"
                onClick={() => setBasePickerExpanded(true)}
                disabled={busy}
                data-testid="base-picker-change"
                style={{
                  ...monoLabel,
                  background: 'transparent',
                  border: tokens.border.primary,
                  padding: '4px 10px',
                  cursor: busy ? 'not-allowed' : 'pointer',
                  opacity: busy ? 0.5 : 1,
                }}
              >
                CHANGE
              </button>
            </div>
          ) : (
            <div style={basePickerGrid}>
              {forkable.map((m) => {
                const picked = base?.objectId === m.objectId;
                // plan-027 U10 / D-078 — preview thumbnail (GLB canvas for public
                // bases; the watermarked public still for encrypted ALLOW_LIST
                // bases; NEVER the ciphertext as a GLB).
                const previewNode = (() => {
                  const thumb = thumbSourceForSummary(m);
                  if (thumb.kind === 'glb') {
                    return <PreviewCanvas glbUrl={thumb.url} bgToggle={false} />;
                  }
                  return thumb.url ? (
                    <img
                      src={thumb.url}
                      alt={`${m.name || 'model'} preview`}
                      data-testid={`base-option-still-${m.objectId}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span
                      data-testid={`base-option-locked-${m.objectId}`}
                      style={{ ...monoLabel, color: 'rgba(255,255,255,0.5)' }}
                    >
                      ENCRYPTED
                    </span>
                  );
                })();
                const metaLine = (
                  <span style={baseOptionMeta}>
                    fork fee: {mistToSui(m.derivativeMintFee)} SUI · royalty: {(m.derivativeRoyaltyBps / 100).toFixed(2)}%
                  </span>
                );
                // plan 2026-06-08-001 U3 (R4) — static description snippet; null
                // for uncaptioned uploads → nothing (R6). MERGE SEAM: when the
                // base-finder (plan-002) lands here, suppress this snippet for a
                // card whose search match-reason is showing (match-reason already
                // renders the prompt — never both). No match state exists on this
                // branch, so it renders unconditionally for now.
                const description = modelDescription(m);
                const descriptionNode = description && (
                  <span style={baseOptionDescription} data-testid={`base-option-description-${m.objectId}`}>
                    {description.text}
                  </span>
                );
                // plan-027 U10 / D-078 — LOCKED card: an encrypted ALLOW_LIST base
                // the wallet holds no AccessEntitlement for. Rendered grayed +
                // NON-clickable (a <div>, not a fork <button> — AE4: locked ≠
                // forkable) with a "buy access on model page" link so a new wallet
                // sees a path to acquire access rather than an empty catalog.
                if (!isLaunchable(m)) {
                  return (
                    <div
                      key={m.objectId}
                      data-testid={`base-option-locked-card-${m.objectId}`}
                      style={{ ...baseOptionStyle(false), cursor: 'default', opacity: 0.55 }}
                    >
                      <div style={baseOptionPreview} data-testid={`base-option-preview-${m.objectId}`}>
                        {previewNode}
                      </div>
                      <div style={baseOptionBody}>
                        <span style={baseOptionName}>{m.name || '(unnamed)'}</span>
                        {descriptionNode}
                        {metaLine}
                        <span style={{ ...baseOptionMeta, color: tokens.color.muted }}>
                          — LOCKED · ACCESS REQUIRED
                        </span>
                        <Link
                          to={`/model/${m.objectId}`}
                          data-testid={`base-option-buy-access-${m.objectId}`}
                          style={{ ...baseOptionMeta, color: tokens.color.ink, textDecoration: 'underline' }}
                        >
                          Buy access on model page →
                        </Link>
                      </div>
                    </div>
                  );
                }
                // LAUNCHABLE card: PERMISSIONLESS ∪ (ALLOW_LIST the wallet holds an
                // entitlement for). Full clickable fork button.
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
                    {/* bgToggle={false}: a base-option <button> wraps this
                        PreviewCanvas; PreviewCanvas's default BgTogglePill is
                        itself a <button>, producing a hydration-error nested
                        <button>-in-<button> (caught in dev console). The pill
                        also reads as visual noise on a ~150 px thumbnail. */}
                    <div style={baseOptionPreview} data-testid={`base-option-preview-${m.objectId}`}>
                      {previewNode}
                    </div>
                    <div style={baseOptionBody}>
                      <span style={baseOptionName}>{m.name || '(unnamed)'}</span>
                      {descriptionNode}
                      {metaLine}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {base && (
          <section data-testid="authoring" style={{ marginBottom: 32 }}>
            <h2 style={sectionH2}>2. Author variants.</h2>
            {/* plan-015 U6 / R6 / AE3 — customization-axes strip. Names the
                axes A1 published so A2 can see them BEFORE touching colors.
                Hidden for legacy bases (partLabels = []) — the strip would
                read as an empty list. */}
            {base.partLabels.length > 0 && (
              <div data-testid="customization-axes-strip" style={axesStrip}>
                <span style={axesStripLeader}>— CUSTOMIZATION AXES:</span>
                {base.partLabels.map((label, i) => (
                  <span key={i} style={axesStripLabel}>
                    {label.toUpperCase()}
                    {i < base.partLabels.length - 1 && (
                      <span style={axesStripDot}>·</span>
                    )}
                  </span>
                ))}
              </div>
            )}
            <p style={{ ...monoLabel, color: tokens.color.muted, textTransform: 'none', letterSpacing: '0.5px', marginBottom: 16 }}>
              Forking <strong>{base.name}</strong> — you pay{' '}
              <strong>{mistToSui(base.derivativeMintFee)} SUI</strong> to its creator, and inherit a{' '}
              <strong>{(base.derivativeRoyaltyBps / 100).toFixed(2)}%</strong> resale royalty back to them.
            </p>

            {/* plan-027 U10 — encrypted base UNLOCK gate. Until the forker decrypts
                (a FREE entitlement-gated unlock) there is no plaintext mesh to color
                against, so we DON'T render the blind color editor; we show the public
                still + an unlock CTA. After onUnlock, `unlockedEntitlementId` is set
                and the full live editor renders below. */}
            {needsUnlock && (
              <div
                data-testid="unlock-gate"
                style={{
                  display: 'flex',
                  gap: 20,
                  alignItems: 'flex-start',
                  padding: 16,
                  border: tokens.border.primary,
                  background: tokens.color.paperPure,
                  marginBottom: 16,
                }}
              >
                {(() => {
                  const stills = base ? previewStillUrlsForSummary(base) : [];
                  return stills[0] ? (
                    <img
                      src={stills[0]}
                      alt={`${base.name || 'model'} preview`}
                      data-testid="unlock-gate-still"
                      style={{ width: 180, height: 180, objectFit: 'cover', border: tokens.border.primary }}
                    />
                  ) : (
                    <div style={{ ...monoLabel, color: tokens.color.hint }}>ENCRYPTED</div>
                  );
                })()}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                  <span style={{ ...monoLabel, color: tokens.color.ink }}>— ENCRYPTED BASE · LOCKED</span>
                  <p style={{ ...monoLabel, color: tokens.color.muted, textTransform: 'none', letterSpacing: '0.5px', lineHeight: 1.5 }}>
                    Unlock this base to design your collection on the real mesh. Unlocking is{' '}
                    <strong>free</strong> — you already own access — and decrypts the base in your browser
                    (1 signature). Then you recolor each variant live — what you see is what mints. The{' '}
                    <strong>{mistToSui(base.derivativeMintFee)} SUI</strong> derive fee is charged at mint, not now.
                  </p>
                  <button
                    type="button"
                    onClick={() => void onUnlock()}
                    disabled={busy || !signer}
                    data-testid="unlock-button"
                    style={buttonPrimary}
                  >
                    {unlockLabel}
                  </button>
                  {phase === 'decrypting' && (
                    <IndeterminateBar testId="unlock-decrypt-progress" ariaLabel="Decrypting base" />
                  )}
                </div>
              </div>
            )}

            {!needsUnlock && (
            <>
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
                <span style={sectionLabel}>INTEGRATION FEE (SUI)</span>
                <input
                  data-testid="register-fee-input"
                  value={registerFeeSui}
                  onChange={(e) => setRegisterFeeSui(e.target.value)}
                  disabled={busy}
                  style={{ ...inputStyle, width: '100%' }}
                />
                <span style={fieldHint} data-testid="register-fee-hint">
                  Game devs pay this when they call register_integration() to
                  enable this collection in their app. Set 0 to allow any
                  integrator for free.
                </span>
              </label>
            </div>

            <VariantEditor
              state={editorState}
              onChange={setEditorState}
              partLabels={base?.partLabels ?? []}
              onColumnHover={handleColumnHover}
              disabled={busy}
            />
            {/* plan-015 U6/U7 — preview area: VariantPreview (left, mode +
                BG pills + auto-rotate + live recolor via partColors) plus
                side rail with MeshInfoPanel + PartListPanel.
                effectiveMode/effectiveHighlightedParts overlay U7 hover
                state on top of the user-picked mode. */}
            <div style={previewLayout}>
              <VariantPreview
                variants={editorState.variants}
                variantGlbs={variantGlbs ?? undefined}
                selectedIndex={selectedPreview}
                onSelect={setSelectedPreview}
                mode={effectiveMode}
                onModeCycle={cyclePreviewMode}
                modeToggle
                highlightedParts={effectiveHighlightedParts}
                onPartClick={setSelectedPartIndex}
                autoRotate
                partColors={partColors}
                baseGlbUrl={baseGlbUrl}
                encryptedPreviewUrls={isEncryptedBase && !isEncryptedUnlocked && base ? previewStillUrlsForSummary(base) : []}
                previewRef={previewRef}
              />
              <div style={previewSideRail}>
                <MeshInfoPanel
                  // Post-publish state: base.partLabels.length is the segment
                  // count (one material per segment per D-052 substrate);
                  // base.glbBlobId surfaces as the BLOB pill. Byte size is
                  // unknown post-publish (the on-chain Model3DSummary doesn't
                  // carry it); pass 0 to hide the SIZE row.
                  segmentCount={base.partLabels.length}
                  fileSizeBytes={baseGlb?.byteLength ?? 0}
                  materialCount={base.partLabels.length}
                  walrusBlobId={base.glbBlobId || undefined}
                  testIdSuffix="launch"
                />
                <PartListPanel
                  parts={partListItems}
                  selectedIndex={selectedPartIndex}
                  onSelect={setSelectedPartIndex}
                  testIdSuffix="launch"
                  maxHeight={240}
                />
              </div>
            </div>
            {/* plan 2026-06-08-001 U3 (R5) — picked-base description caption under
                the preview area (VariantPreview has no caption slot). Null for an
                uncaptioned-upload base → nothing (R6). */}
            {(() => {
              const baseDescription = modelDescription(base);
              return baseDescription ? (
                <div
                  data-testid="picked-base-description"
                  style={{ ...baseOptionMeta, color: tokens.color.muted, marginTop: 8, whiteSpace: 'normal' }}
                >
                  <span style={{ color: tokens.color.hint }}>
                    {baseDescription.kind === 'caption' ? 'AI description' : 'Prompt'}:
                  </span>{' '}
                  {baseDescription.text}
                </div>
              ) : null;
            })()}
            {/* plan-015 U8 / R13 — VariantStrip below the main preview area.
                Active variant gets accent border; locked variants survive
                re-rolls. Lock badge click toggles state without firing
                selection (stopPropagation in VariantStrip). */}
            <VariantStrip
              variants={editorState.variants}
              selectedIndex={selectedPreview}
              onSelect={setSelectedPreview}
              lockedIndices={lockedIndices}
              onToggleLock={onToggleLock}
              disabled={busy}
            />
            {/* plan-015 U8 / R11 / D-056 / AE5 — Random Gen. Harmonic-from-
                seed palette generator. Per-variant locks let the user keep
                manual edits while re-rolling sibling variants. */}
            <RandomGenControls
              N={variantCount}
              minN={minRandomN}
              onChangeN={onChangeVariantCount}
              seedHex={randomSeedHex}
              onChangeSeed={setRandomSeedHex}
              scheme={randomScheme}
              onChangeScheme={setRandomScheme}
              lockedCount={lockedIndices.size}
              onGenerate={onRandomGenerate}
              disabled={busy}
            />

            {/* plan-017 U4 — pre-flight breakdown. Only shown when multi-
                quilt is in play (N > QUILT_SIZE) AND we haven't started
                launching yet. The pre-flight reads as a structure preview,
                not status — once phase moves into the launch flow, the
                stepped progress panel below replaces it.

                plan-017 P1-E (review fix): `busy` covers only the in-flight
                phases (uploading/signing/etc) — NOT 'error' or 'success'.
                Without the explicit phase guard, an error state would render
                BOTH the pre-flight panel and the progress panel
                simultaneously, with contradictory copy. */}
            {editorState.variants.length > QUILT_SIZE &&
              !busy &&
              phase !== 'success' &&
              phase !== 'error' && (
                <BatchProgressPanel
                  variantCount={editorState.variants.length}
                  stage="idle"
                  batchIndex={0}
                  batchTotal={Math.ceil(editorState.variants.length / QUILT_SIZE)}
                  txDigests={[]}
                />
              )}
            <div style={{ marginTop: 24, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              {/* plan A — PREVIEW VARIANTS needs the plaintext base mesh. For a
                  public base it's always present; for an encrypted base it exists
                  only AFTER unlock (decrypt). So show it whenever the base isn't
                  locked. */}
              {(!isEncryptedBase || isEncryptedUnlocked) && (
                <button
                  type="button"
                  onClick={() => void onPreview()}
                  disabled={busy}
                  data-testid="preview-button"
                  style={buttonOutline}
                >
                  {previewLabel}
                </button>
              )}
              <button
                type="button"
                // plan A — encrypted bases mint from the already-unlocked plaintext
                // (onMintEncrypted); public bases stay on the atomic onLaunch path.
                onClick={() => void (isEncryptedBase ? onMintEncrypted() : onLaunch())}
                // plan-016 code-review hotfix — gate on !signer too so the
                // button is HTML-disabled (not just silently no-op via the
                // click handler) when test mode has a missing/invalid key.
                // Matches R5/AE2 plan intent ("mint button disabled").
                disabled={busy || !signer}
                data-testid="launch-button"
                style={buttonPrimary}
              >
                {launchLabel}
              </button>
            </div>
            <p style={launchHelper}>
              {isEncryptedBase
                ? 'ENCRYPTED BASE · UNLOCKED · SIGNS 3× (WALRUS · LAUNCH · MINT) · PAYS DERIVE FEE + GAS'
                : 'SIGNS 3× · PAYS GAS · MINTS L2'}
            </p>
            {isEncryptedBase && (
              <p
                style={{ ...launchHelper, textTransform: 'none', letterSpacing: '0.5px', color: tokens.color.muted }}
                data-testid="encrypted-base-notice"
              >
                Unlocked — you're designing on the decrypted mesh in your browser. What
                you see is what mints; there is no download.
              </p>
            )}
            {/* plan-017 U4 — Multi-quilt scope. When N > QUILT_SIZE, the
                user signs 2K+1 transactions instead of the single-quilt 3.
                BatchProgressPanel surfaces the quilt structure honestly so
                the extra popups read as known protocol shape, not surprise
                UX regression. Single-quilt path retains the existing pill. */}
            {editorState.variants.length > QUILT_SIZE &&
              (phase === 'uploading' || phase === 'signing' || phase === 'success' || phase === 'error') && (
                <BatchProgressPanel
                  variantCount={editorState.variants.length}
                  stage={uploadStage}
                  batchIndex={uploadBatchIndex}
                  batchTotal={uploadBatchTotal}
                  txDigests={uploadTxDigests}
                  launchTxDigest={txDigest ?? undefined}
                  launchInProgress={phase === 'signing'}
                  errorBatchIndex={uploadError?.batchIndex}
                  errorStage={uploadError?.stage}
                />
              )}
            {/* Single-quilt path: existing pill (preserved minimal UX for the
                N ≤ QUILT_SIZE case so the typical "3 quick variants" flow
                doesn't get a multi-row progress block). */}
            {editorState.variants.length <= QUILT_SIZE &&
              phase === 'uploading' &&
              (uploadStage === 'encoding' || uploadStage === 'relay-upload') && (
                <div>
                  <span style={uploadStatusPill} data-testid="upload-status-pill">
                    — UPLOADING {editorState.variants.length} VARIANTS TO WALRUS · QUILTED ({uploadElapsed}s)
                  </span>
                </div>
              )}
            </>
            )}
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
