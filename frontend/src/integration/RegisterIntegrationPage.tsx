// plan-008 U13 — gameDev register-integration page (`/integrate`, F3). A game
// developer attests an on-chain integration against a permissionless L2
// collection: pick a collection → enter {name, url} → pay the register_fee →
// `register_integration`. The fee routes to the nft creator (cap holder).
//
// Two security guards (apply, don't defer):
//   1. Client-validate name + url (https-only) BEFORE the wallet popup, mirroring
//      the backend schema, so a bad URL fails fast instead of succeeding on chain
//      and being silently dropped by the indexer.
//   2. Re-fetch the collection's live register_fee right before signing (TOCTOU:
//      the cap holder may have raised it since page load) so we never abort
//      EFeeTooLow with a stale UI value.
// Abort codes are mapped to human guidance (AE3) — never shown raw.

import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { SignInButton } from '../auth/SignInButton';
import { useModelIndex } from '../browse/useModelIndex';
import {
  useCollections,
  fetchCollectionById,
  POLICY_PERMISSIONLESS,
  type NftCollectionSummary,
} from './useCollections';
import { validateName, validateUrl, encodeAppMetadata } from './appMetadataValidation';
import { buildRegisterIntegrationPtb } from '../sui/collectionTxBuilders';
import { parseRegisterAbort, ABORT_INTEGRATIONS_CLOSED } from '../sui/abortMessages';

function mistToSui(mist: string): string {
  const n = Number(mist);
  if (!Number.isFinite(n)) return '0';
  return (n / 1e9).toString();
}

function truncate(addr: string, head = 6, tail = 4): string {
  if (!addr || addr.length <= head + tail + 1) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

type Phase = 'idle' | 'signing' | 'success' | 'error';

export function RegisterIntegrationPage() {
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const { collections, loading: collLoading, error: collError } = useCollections();
  const { models } = useModelIndex();

  const [selected, setSelected] = useState<NftCollectionSummary | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorIsRestricted, setErrorIsRestricted] = useState(false);
  const [txDigest, setTxDigest] = useState<string | null>(null);

  // Only permissionless collections accept integrations (D-030). Restricted /
  // allow-list ones are filtered out of the picker so the gameDev never picks
  // an abort.
  const registerable = useMemo(
    () => collections.filter((c) => c.integrationPolicy === POLICY_PERMISSIONLESS),
    [collections],
  );

  // NftCollection has no on-chain name — join base_model_id → Model3D.name.
  const nameForCollection = useCallback(
    (c: NftCollectionSummary): string => {
      const model = models.find((m) => m.objectId === c.baseModelId);
      return model?.name ? `${model.name} collection` : `Collection ${truncate(c.collectionId)}`;
    },
    [models],
  );

  const nameCheck = validateName(name);
  const urlCheck = validateUrl(url);
  const formValid = nameCheck.ok && urlCheck.ok;

  const onRegister = useCallback(async () => {
    if (!selected || !account) return;
    if (!nameCheck.ok || !urlCheck.ok) return;
    setErrorMsg(null);
    setErrorIsRestricted(false);
    setPhase('signing');
    try {
      // TOCTOU: re-read the live register_fee right before signing.
      const live = await fetchCollectionById(selected.collectionId);
      const appMetadata = encodeAppMetadata(name, url);
      const { tx } = buildRegisterIntegrationPtb({
        collectionId: selected.collectionId,
        feeMist: BigInt(live.registerFee || '0'),
        appMetadata,
      });
      const res = await signAndExecute({ transaction: tx });
      setTxDigest(res.digest);
      setPhase('success');
    } catch (e) {
      const info = parseRegisterAbort(e);
      setErrorMsg(info.message);
      setErrorIsRestricted(info.code === ABORT_INTEGRATIONS_CLOSED);
      setPhase('error');
    }
  }, [selected, account, nameCheck.ok, urlCheck.ok, name, url, signAndExecute]);

  if (!account) {
    return (
      <div data-testid="integrate-page" style={pageStyle}>
        <h1>Register a Game Integration</h1>
        <p>Connect a wallet to register your game against a collection.</p>
        <SignInButton />
      </div>
    );
  }

  const busy = phase === 'signing';

  return (
    <div data-testid="integrate-page" style={pageStyle}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Register a Game Integration</h1>
        <Link to="/" style={{ color: '#7aa2ff' }}>← Browse</Link>
      </header>

      {/* Step 1 — pick a permissionless collection */}
      <section data-testid="collection-picker" style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 15 }}>1. Pick a collection to integrate</h2>
        {collLoading && <p style={{ color: '#888' }}>Loading collections…</p>}
        {collError && (
          <p data-testid="collections-error" style={{ color: 'crimson' }}>
            Couldn’t load collections: {collError.message}
          </p>
        )}
        {!collLoading && !collError && registerable.length === 0 && (
          <p data-testid="no-collections" style={{ color: '#888' }}>
            No collections are accepting integrations yet. Launch one on{' '}
            <Link to="/launch" style={{ color: '#7aa2ff' }}>/launch</Link>.
          </p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {registerable.map((c) => {
            const picked = selected?.collectionId === c.collectionId;
            return (
              <button
                key={c.collectionId}
                type="button"
                onClick={() => setSelected(c)}
                disabled={busy}
                data-testid={`collection-option-${c.collectionId}`}
                aria-pressed={picked}
                style={{
                  textAlign: 'left',
                  padding: 10,
                  minWidth: 200,
                  background: picked ? '#1f2630' : '#1a1c20',
                  border: picked ? '2px solid #7aa2ff' : '2px solid #333',
                  color: '#ddd',
                  cursor: 'pointer',
                  borderRadius: 6,
                }}
              >
                <div style={{ fontWeight: 600 }}>{nameForCollection(c)}</div>
                <div style={{ fontSize: 12, color: '#9aa' }}>
                  register fee: {mistToSui(c.registerFee)} SUI
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Step 2 — integration details */}
      {selected && (
        <section data-testid="integration-form" style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15 }}>2. Your game</h2>
          <p style={{ fontSize: 12, color: '#9aa' }}>
            You pay <strong>{mistToSui(selected.registerFee)} SUI</strong> to the collection’s creator.
            Your name + link will appear in its public “Used by” list.
          </p>

          <label style={{ display: 'block', marginBottom: 4 }}>
            Game name{' '}
            <input
              data-testid="integration-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
          </label>
          {name.length > 0 && !nameCheck.ok && (
            <div data-testid="name-error" style={{ color: 'crimson', fontSize: 12, marginBottom: 8 }}>
              {nameCheck.reason}
            </div>
          )}

          <label style={{ display: 'block', marginBottom: 4 }}>
            Game URL{' '}
            <input
              data-testid="integration-url-input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://yourgame.example"
              disabled={busy}
            />
          </label>
          {url.length > 0 && !urlCheck.ok && (
            <div data-testid="url-error" style={{ color: 'crimson', fontSize: 12, marginBottom: 8 }}>
              {urlCheck.reason}
            </div>
          )}

          <button
            type="button"
            onClick={() => void onRegister()}
            disabled={busy || !formValid}
            data-testid="register-button"
            style={{ marginTop: 8 }}
          >
            {busy
              ? 'Approve in your wallet…'
              : `Register integration — ${mistToSui(selected.registerFee)} SUI`}
          </button>
        </section>
      )}

      {phase === 'error' && errorMsg && (
        <div data-testid="register-error" style={{ color: 'crimson', marginTop: 12 }}>
          {errorMsg}
          {errorIsRestricted && (
            <>
              {' '}
              <Link to="/?filter=integration" data-testid="register-error-browse" style={{ color: '#7aa2ff' }}>
                Browse open collections
              </Link>
              .
            </>
          )}
        </div>
      )}
      {phase === 'success' && txDigest && (
        <div data-testid="register-success" style={{ color: '#7CFC00', marginTop: 12 }}>
          Integration registered —{' '}
          <a
            href={`https://suiscan.xyz/testnet/tx/${txDigest}`}
            target="_blank"
            rel="noreferrer"
            style={{ color: '#7aa2ff' }}
          >
            view tx
          </a>
        </div>
      )}
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  padding: 24,
  color: '#ddd',
  background: '#15171b',
  minHeight: '100vh',
  fontFamily: 'system-ui',
};
