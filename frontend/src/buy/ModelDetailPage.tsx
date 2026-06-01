import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSuiClient } from '@mysten/dapp-kit';
import { useModelById, useDetailEntitlement } from './hooks';
import { PreviewCanvas } from '../babylon/PreviewCanvas';
import { glbUrlForSummary, previewStillUrlsForSummary } from '../walrus/aggregator';
import { TurntablePreview } from '../ux/TurntablePreview';
import { useSession } from '../auth/useSession';
import { useAppSigner } from '../wallet/useAppSigner';
import { SignInButton } from '../auth/SignInButton';
import { buildPurchaseAccessPtb } from '../sui/collectionTxBuilders';
import { decryptViaEntitlement } from '../seal/decryptAndView';

// plan-027 U8 — L1 published-content detail page (`/model/:objectId`). Three
// policies branch here:
//   - PERMISSIONLESS (policy 2): public content; render the GLB straight from
//     the aggregator (unchanged from plan-026).
//   - ALLOW_LIST (policy 1): encrypted base. A visitor BUYS one-time access
//     (mints a soulbound AccessEntitlement, D-078) and an entitlement holder
//     VIEWS the decrypted mesh in-app — NO file download (R7). The access fee is
//     the content gate; the per-launch derive fee is the fork convenience charge.
//   - RESTRICTED (policy 0): not purchasable (AE6); only the creator decrypts
//     (via the /launch creator path) — no buy-access action here.

// Policy constants mirror model3d.move (see CreateModelPage POLICY_* / the
// useModelIndex POLICY_RESTRICTED) — kept inline so the branch reads locally.
// PERMISSIONLESS (2) is the default/else branch (public render), so it needs no
// named constant here.
const POLICY_RESTRICTED = 0;
const POLICY_ALLOW_LIST = 1;

function truncateAddr(a: string): string {
  return a.length > 16 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a;
}

function mistToSui(mist: string): string {
  const n = Number(mist);
  if (!Number.isFinite(n) || n <= 0) return 'Free';
  return `${(n / 1e9).toString()} SUI`;
}

// Bare SUI amount (no "Free" fallback) for the buy-access CTA label, which
// always shows a number even when the fee parses oddly.
function mistToSuiAmount(mist: string): string {
  const n = Number(mist);
  if (!Number.isFinite(n) || n < 0) return '0';
  return (n / 1e9).toString();
}

// The consumer-view state machine for an ALLOW_LIST base (the U8 interaction
// table). RESTRICTED / PERMISSIONLESS never enter it.
type ViewState =
  | { kind: 'idle' } // no entitlement yet (Buy access) OR holds one, not viewing (View)
  | { kind: 'purchasing' } // purchase_access tx in flight
  | { kind: 'purchase-failed'; message: string }
  | { kind: 'decrypting' } // seal_approve + AES decrypt in flight
  | { kind: 'decrypt-failed'; message: string } // post-purchase/post-hold decrypt threw
  | { kind: 'viewing'; blobUrl: string };

export function ModelDetailPage() {
  const { objectId } = useParams<{ objectId: string }>();
  const { model, loading, error } = useModelById(objectId ?? '');

  const suiClient = useSuiClient();
  const { address } = useSession();
  const { signer } = useAppSigner();

  // "Already owns access" check + the entitlement id (seal_approve arg). Bumping
  // `entReloadKey` after a purchase re-reads owned objects so the just-minted
  // entitlement surfaces (it also flows in directly from objectChanges below).
  const [entReloadKey, setEntReloadKey] = useState(0);
  const { hasEntitlement, entitlementId, reload: reloadEntitlements } =
    useDetailEntitlement(address ?? undefined, model?.objectId, entReloadKey);

  const [viewState, setViewState] = useState<ViewState>({ kind: 'idle' });
  // The entitlement id to decrypt with — either the just-bought one (read off
  // objectChanges to dodge indexer lag) or the one useOwnedEntitlements found.
  const freshEntitlementRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);

  // Revoke the viewer object URL on unmount / when it changes (no leak; no
  // dangling download handle). decryptViaEntitlement minted it.
  useEffect(() => {
    if (viewState.kind !== 'viewing') return;
    const url = viewState.blobUrl;
    return () => {
      // jsdom (tests) doesn't implement revokeObjectURL; guard so unmount
      // cleanup doesn't throw there. Browsers always have it.
      if (typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
    };
  }, [viewState]);

  // Run the entitlement-gated decrypt and mount the plaintext in the viewer.
  // Shared by the post-purchase auto-decrypt, the "View model" action, and the
  // "Retry decrypt" button — it NEVER re-purchases (idempotent view).
  const runDecrypt = useCallback(
    async (entId: string) => {
      if (!model || !address || !signer) return;
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setViewState({ kind: 'decrypting' });
      try {
        const { blobUrl } = await decryptViaEntitlement({
          model,
          entitlementId: entId,
          suiClient: suiClient as never,
          signPersonalMessage: (bytes) => signer.signPersonalMessage(bytes),
          address,
        });
        setViewState({ kind: 'viewing', blobUrl });
      } catch (e) {
        setViewState({
          kind: 'decrypt-failed',
          message: e instanceof Error ? e.message : String(e),
        });
      } finally {
        inFlightRef.current = false;
      }
    },
    [model, address, signer, suiClient],
  );

  const onBuyAccess = useCallback(async () => {
    if (!model || !signer) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setViewState({ kind: 'purchasing' });
    try {
      const { tx } = buildPurchaseAccessPtb({
        modelId: model.objectId,
        accessFeeMist: BigInt(model.accessFee || '0'),
      });
      const res = await signer.signAndExecuteTransaction({
        transaction: tx,
        client: suiClient,
      });
      if (res.$kind === 'FailedTransaction') {
        throw new Error(
          `Purchase failed (${res.FailedTransaction.digest}): ${res.FailedTransaction.status?.error?.message ?? 'unknown'}`,
        );
      }
      const digest = res.Transaction.digest;
      // Read the new entitlement id off objectChanges (dodge indexer lag) —
      // mirrors LaunchCollectionPage's fetchObjectChanges pattern.
      await suiClient.waitForTransaction({ digest });
      const tb = await suiClient.getTransactionBlock({
        digest,
        options: { showObjectChanges: true },
      });
      const changes = (tb.objectChanges ?? []) as ReadonlyArray<{
        type?: string;
        objectType?: string;
        objectId?: string;
      }>;
      const created = changes.find(
        (c) =>
          c.type === 'created' &&
          typeof c.objectType === 'string' &&
          c.objectType.endsWith('::model3d::AccessEntitlement'),
      );
      inFlightRef.current = false;
      // Refresh the owned-entitlements read for subsequent renders / retries.
      reloadEntitlements();
      setEntReloadKey((n) => n + 1);
      if (created?.objectId) {
        freshEntitlementRef.current = created.objectId;
        // Purchase ok → flow straight into the decrypt + view.
        await runDecrypt(created.objectId);
      } else {
        // Tx succeeded but we couldn't resolve the id — let the owned read
        // catch up; surface a retry-able decrypt-failed state.
        setViewState({
          kind: 'decrypt-failed',
          message: 'Access confirmed — could not resolve the entitlement yet.',
        });
      }
    } catch (e) {
      inFlightRef.current = false;
      setViewState({
        kind: 'purchase-failed',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, [model, signer, suiClient, reloadEntitlements, runDecrypt]);

  // "View model" (holder already owns access) + "Retry decrypt" both resolve an
  // entitlement id (fresh-from-purchase ref first, then the owned read) and run
  // the decrypt ONLY. Never re-purchase.
  const onView = useCallback(() => {
    const entId = freshEntitlementRef.current ?? entitlementId;
    if (!entId) return;
    void runDecrypt(entId);
  }, [entitlementId, runDecrypt]);

  if (!objectId) {
    return (
      <div style={{ padding: 16 }} data-testid="detail-invalid">
        Invalid model ID.
      </div>
    );
  }
  if (loading) {
    return (
      <div style={{ padding: 16 }} data-testid="detail-loading">
        Loading…
      </div>
    );
  }
  if (error || !model) {
    return (
      <div style={{ padding: 16, color: 'crimson' }} data-testid="detail-error">
        Couldn't load this model.
      </div>
    );
  }

  const aggregatorUrl = glbUrlForSummary(model);
  // plan-026 — an encrypted base's `glbBlobId` is AES CIPHERTEXT, NOT a loadable
  // GLB. Render the public preview still (or a placeholder) instead of feeding
  // the ciphertext to Babylon (which hangs on "LOADING BASE MESH…"). The real
  // mesh is only obtainable by buying access + decrypting (the entitlement flow).
  const previewUrls = previewStillUrlsForSummary(model);

  const isAllowList = model.policy === POLICY_ALLOW_LIST;
  const isRestricted = model.policy === POLICY_RESTRICTED;
  const connected = Boolean(address && signer);
  const isViewing = viewState.kind === 'viewing';
  const isDecrypting = viewState.kind === 'decrypting';
  const isPurchasing = viewState.kind === 'purchasing';

  // The viewer pane: decrypted mesh (viewing) > public GLB (permissionless) >
  // decrypting spinner > preview still / placeholder (encrypted, locked).
  function renderViewerPane() {
    if (isViewing) {
      return <PreviewCanvas glbUrl={(viewState as { blobUrl: string }).blobUrl} />;
    }
    if (isDecrypting) {
      return (
        <div
          data-testid="detail-decrypting"
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            fontSize: 13,
            opacity: 0.85,
          }}
        >
          <div className="spinner" data-testid="detail-decrypt-spinner" aria-hidden />
          <span>Decrypting model…</span>
        </div>
      );
    }
    if (model!.isEncrypted) {
      return previewUrls.length > 0 ? (
        <TurntablePreview
          urls={previewUrls}
          testId="detail-preview-still"
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
        />
      ) : (
        <div
          data-testid="detail-encrypted-placeholder"
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: 16,
            fontSize: 13,
            opacity: 0.7,
          }}
        >
          Encrypted base — buy access to unlock the mesh.
        </div>
      );
    }
    return <PreviewCanvas glbUrl={aggregatorUrl} />;
  }

  // The ALLOW_LIST access action column (the U8 interaction table). RESTRICTED /
  // PERMISSIONLESS render nothing here.
  function renderAccessAction() {
    if (!isAllowList) return null;

    // Not connected → connect prompt, no purchase CTA.
    if (!connected) {
      return (
        <div data-testid="buy-access-connect" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, marginBottom: 8 }}>
            Connect wallet to buy access
          </div>
          <SignInButton />
        </div>
      );
    }

    if (isViewing) {
      // Already mounted in the viewer; no further action needed.
      return (
        <div
          data-testid="buy-access-viewing"
          style={{ fontSize: 12, color: '#7bd88f', marginBottom: 12 }}
        >
          Access unlocked — viewing the decrypted mesh.
        </div>
      );
    }

    if (viewState.kind === 'decrypt-failed') {
      // Distinct post-purchase decryption failure: the entitlement IS held, only
      // the decrypt failed. Retry re-runs decrypt ONLY — never re-purchases.
      return (
        <div data-testid="decrypt-failed" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: '#e0a96b', marginBottom: 8 }}>
            Access confirmed — decryption failed
          </div>
          <div style={{ fontSize: 11, color: '#aaa', marginBottom: 8 }}>
            {viewState.message}
          </div>
          <button
            type="button"
            data-testid="retry-decrypt-cta"
            onClick={onView}
            style={ctaStyle(false)}
          >
            Retry decrypt
          </button>
        </div>
      );
    }

    // Holds an entitlement → "View model".
    if (hasEntitlement || freshEntitlementRef.current) {
      return (
        <div style={{ marginBottom: 12 }}>
          <button
            type="button"
            data-testid="view-model-cta"
            onClick={onView}
            disabled={isDecrypting}
            style={ctaStyle(isDecrypting)}
          >
            {isDecrypting ? 'Decrypting…' : 'View model'}
          </button>
        </div>
      );
    }

    // No entitlement → Buy access CTA (with pending + failed states).
    return (
      <div style={{ marginBottom: 12 }}>
        <button
          type="button"
          data-testid="buy-access-cta"
          onClick={onBuyAccess}
          disabled={isPurchasing}
          style={ctaStyle(isPurchasing)}
        >
          {isPurchasing ? (
            <>
              <span className="spinner" data-testid="buy-access-spinner" aria-hidden /> Purchasing…
            </>
          ) : (
            `Buy access — ${mistToSuiAmount(model!.accessFee)} SUI`
          )}
        </button>
        {viewState.kind === 'purchase-failed' && (
          <div
            data-testid="buy-access-error"
            style={{ fontSize: 11, color: 'crimson', marginTop: 8 }}
          >
            {viewState.message}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        padding: 16,
        maxWidth: 960,
        margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: '2fr 1fr',
        gap: 24,
      }}
      data-testid="model-detail"
    >
      <div>
        <div
          style={{ aspectRatio: '1', background: '#15171b', borderRadius: 8, overflow: 'hidden' }}
          data-testid="preview-canvas-wrap"
        >
          {renderViewerPane()}
        </div>
        {model.isEncrypted ? (
          <div style={{ fontSize: 12, marginTop: 8, opacity: 0.7 }} data-testid="encrypted-blob-note">
            Encrypted base — the Walrus blob holds ciphertext; buy access to decrypt.
          </div>
        ) : (
          <a
            href={aggregatorUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 12, marginTop: 8, display: 'block' }}
            data-testid="walrus-link"
          >
            Walrus blob: {model.glbBlobId || model.blobId}
          </a>
        )}
      </div>
      <div>
        <h2 style={{ marginTop: 0 }} data-testid="model-name">
          {model.name}
        </h2>
        <div style={{ fontSize: 14, marginBottom: 8 }}>
          <strong>Creator:</strong>{' '}
          <code style={{ fontSize: 12 }}>{truncateAddr(model.creator)}</code>
        </div>
        <div style={{ fontSize: 14, marginBottom: 8 }}>
          <strong>Shape:</strong> {model.shapeType}
        </div>
        <div style={{ fontSize: 14, marginBottom: 12 }}>
          <strong>Tags:</strong>{' '}
          {model.tags.map((t) => (
            <span
              key={t}
              style={{
                display: 'inline-block',
                padding: '2px 6px',
                background: '#eee',
                borderRadius: 4,
                marginRight: 4,
                fontSize: 12,
              }}
            >
              {t}
            </span>
          ))}
        </div>

        {/* plan-027 D-078 — ALLOW_LIST bases now carry a buy-access fee (the
            content gate) AND a per-launch derive fee. PERMISSIONLESS shows only
            the fork fee. */}
        {isAllowList && (
          <div data-testid="access-terms" style={{ fontSize: 14, marginBottom: 12, lineHeight: 1.6 }}>
            <div>
              <strong>Access fee:</strong> {mistToSui(model.accessFee)}
            </div>
            <div>
              <strong>Derive fee:</strong> {mistToSui(model.derivativeMintFee)}
            </div>
            <div>
              <strong>Resale royalty:</strong> {(model.derivativeRoyaltyBps / 100).toFixed(2)}%
            </div>
          </div>
        )}

        {/* L1 license / fork terms (D-002 pay-to-derive) for non-ALLOW_LIST. */}
        {!isAllowList && (
          <div data-testid="fork-terms" style={{ fontSize: 14, marginBottom: 12, lineHeight: 1.6 }}>
            <div>
              <strong>Fork fee:</strong> {mistToSui(model.derivativeMintFee)}
            </div>
            <div>
              <strong>Resale royalty:</strong> {(model.derivativeRoyaltyBps / 100).toFixed(2)}%
            </div>
          </div>
        )}

        <details style={{ fontSize: 12, marginBottom: 12 }}>
          <summary>Params (json)</summary>
          <pre style={{ background: '#f5f5f5', padding: 8, borderRadius: 4, overflow: 'auto' }}>
            {model.paramsJson}
          </pre>
        </details>

        {/* ALLOW_LIST: buy-access / view consumer flow (U8 state table). */}
        {renderAccessAction()}

        {/* RESTRICTED: not purchasable (AE6) — no buy-access action. */}
        {isRestricted && (
          <div data-testid="restricted-note" style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>
            Restricted base — only the creator can decrypt this content.
          </div>
        )}

        {/* Fork CTA. ALLOW_LIST forks happen on /launch once access is held;
            PERMISSIONLESS forks freely. RESTRICTED non-creators can't fork. */}
        {!isRestricted && model.glbBlobId ? (
          <Link
            to="/launch"
            data-testid="fork-cta"
            style={{
              display: 'inline-block',
              padding: '8px 14px',
              background: '#ffb86b',
              color: '#15171b',
              borderRadius: 6,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Fork this into a collection →
          </Link>
        ) : !isRestricted ? (
          <div data-testid="not-forkable" style={{ fontSize: 12, color: '#888' }}>
            This model has no standalone GLB and can’t be forked.
          </div>
        ) : null}
      </div>
    </div>
  );
}

// Shared CTA button style; `disabled` dims + blocks the pointer.
function ctaStyle(disabled: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 14px',
    background: disabled ? '#555' : '#ffb86b',
    color: '#15171b',
    border: 'none',
    borderRadius: 6,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.7 : 1,
  };
}
