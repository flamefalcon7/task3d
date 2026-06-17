// plan-008 U13 + plan-2026-06-17-002 U4 — the Integration Ecosystem hub
// (`/integrate`, F3). Two surfaces on one page:
//   1. LEADERBOARD (primary, public): permissionless collections ranked by
//      integration count — discovery signal for buyers/forkers.
//   2. REGISTER (secondary, wallet-gated): a creator of a work (game, video,
//      webpage, app) attests an on-chain integration against a collection —
//      pick a collection → enter {name, url} → pay register_fee →
//      `register_integration`. Fee routes to the nft creator (cap holder).
//
// Deep-link: `/integrate?collection=<id>` (set by a leaderboard row's
// "Register your work" action OR pasted directly) pre-targets the form. One code
// path: the param resolves to the loaded permissionless collection in an effect,
// re-resolving once useCollections finishes (load race), no-op if not found.
//
// Two security guards (apply, don't defer):
//   1. Client-validate name + url (https-only) BEFORE the wallet popup, mirroring
//      the backend schema, so a bad URL fails fast instead of being silently
//      dropped by the indexer.
//   2. Re-fetch the collection's live register_fee right before signing (TOCTOU)
//      so we never abort EFeeTooLow with a stale UI value.
// Abort codes are mapped to human guidance (AE3) — never shown raw.
//
// Styling is the D-044 token system (no hardcoded colors): `name` always renders
// as a React text child (no dangerouslySetInnerHTML); leaderboard drill-ins are
// internal <Link>s with no user-controlled href.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { SignInButton } from '../auth/SignInButton';
import {
  useCollections,
  fetchCollectionById,
  POLICY_PERMISSIONLESS,
  type NftCollectionSummary,
} from './useCollections';
import { useIntegrationLeaderboard } from './useIntegrationLeaderboard';
import { validateName, validateUrl, encodeAppMetadata } from './appMetadataValidation';
import { buildRegisterIntegrationPtb } from '../sui/collectionTxBuilders';
import { parseRegisterAbort, ABORT_INTEGRATIONS_CLOSED } from '../sui/abortMessages';
import {
  tokens,
  pagePaper,
  card,
  input as inputStyle,
  buttonPrimary,
  buttonOutline,
  eyebrow,
  displayHeadline,
  monoLabel,
} from '../ux/tokens';

function mistToSui(mist: string): string {
  const n = Number(mist);
  if (!Number.isFinite(n)) return '0';
  return (n / 1e9).toString();
}

// Short collection id — disambiguates collections that share a display name
// (two forks of the same base model derive the same "<base> collection" name).
function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}

type Phase = 'idle' | 'signing' | 'success' | 'error';

export function RegisterIntegrationPage() {
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const { collections, loading: collLoading, error: collError } = useCollections();
  const { rows, loading: boardLoading, error: boardError } = useIntegrationLeaderboard();
  const [searchParams, setSearchParams] = useSearchParams();
  const formRef = useRef<HTMLDivElement>(null);

  const [selected, setSelected] = useState<NftCollectionSummary | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorIsRestricted, setErrorIsRestricted] = useState(false);
  const [txDigest, setTxDigest] = useState<string | null>(null);

  // Only permissionless collections accept integrations (D-030).
  const registerable = useMemo(
    () => collections.filter((c) => c.integrationPolicy === POLICY_PERMISSIONLESS),
    [collections],
  );

  // Index leaderboard rows by collectionId so the picker name lookup is O(1),
  // not an O(n²) rows.find() inside the registerable map.
  const rowByCollection = useMemo(
    () => new Map(rows.map((r) => [r.collectionId, r])),
    [rows],
  );

  // Deep-link pre-seed (R5): resolve ?collection=<id> → the loaded permissionless
  // collection, then CONSUME the param (clear it from the URL). Consume-once means
  // a later manual pick in the form isn't overridden by the still-present param,
  // and re-clicking a row re-applies cleanly. Retries as `registerable` populates
  // (load race); no-op when the id isn't in the permissionless set.
  const paramCollection = searchParams.get('collection');
  useEffect(() => {
    if (!paramCollection) return;
    const match = registerable.find((c) => c.collectionId === paramCollection);
    if (!match) return; // not loaded yet (retry on registerable change) or unknown id
    setSelected(match);
    setSearchParams({}, { replace: true });
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [paramCollection, registerable, setSearchParams]);

  const nameCheck = validateName(name);
  const urlCheck = validateUrl(url);
  const formValid = nameCheck.ok && urlCheck.ok;
  const busy = phase === 'signing';

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

  return (
    <div data-testid="integrate-page" style={pagePaper}>
      <main style={mainStyle}>
        <section style={{ marginBottom: tokens.space[8] }}>
          <span style={eyebrow}>— INTEGRATE / ECOSYSTEM</span>
          <h1 style={{ ...displayHeadline, marginTop: tokens.space[2] }}>Integration ecosystem</h1>
          <p style={subtitleStyle}>
            Collections ranked by how many works — games, videos, apps — have integrated them.
            A richer ecosystem is a stronger signal of value.
          </p>
        </section>

        {/* Leaderboard — primary, public */}
        <section style={{ marginBottom: tokens.space[12] }}>
          <span style={{ ...monoLabel, color: tokens.color.hint }}>— Most integrated</span>
          {boardLoading && (
            <div data-testid="leaderboard-loading" style={statusStrip}>LOADING…</div>
          )}
          {!boardLoading && boardError && (
            <div role="alert" data-testid="leaderboard-error" style={errorBox}>
              × Couldn’t load collections · {boardError.message}
            </div>
          )}
          {!boardLoading && !boardError && rows.length === 0 && (
            <div data-testid="leaderboard-empty" style={emptyBox}>
              No collections on-chain yet — check back after the first launch.
            </div>
          )}
          {!boardLoading && !boardError && rows.length > 0 && (
            <div data-testid="leaderboard" style={{ ...card, marginTop: tokens.space[3] }}>
              {rows.map((row, i) => (
                <div
                  key={row.collectionId}
                  data-testid={`leaderboard-row-${row.collectionId}`}
                  style={{ ...rowStyle, borderTop: i === 0 ? 'none' : tokens.border.divider }}
                >
                  <span style={rankStyle}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Link to={`/collection/${row.collectionId}`} style={rowNameLink}>
                      {row.name}
                    </Link>
                    <div style={countStyle}>
                      {(row.count === 0 ? 'No integrations yet' : `Used by ${row.count}`) +
                        ` · ${shortId(row.collectionId)}`}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSearchParams({ collection: row.collectionId })}
                    style={{ ...buttonOutline, whiteSpace: 'nowrap' }}
                    data-testid={`leaderboard-register-${row.collectionId}`}
                  >
                    Register your work →
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Register — secondary, wallet-gated */}
        <section ref={formRef}>
          <span style={{ ...monoLabel, color: tokens.color.hint }}>— Register an integration</span>
          <h2 style={sectionHeading}>Register your work</h2>

          {!account ? (
            <div style={{ ...card, padding: tokens.space[6] }}>
              <p style={subtitleStyle}>
                Connect a wallet to register your work against a collection.
              </p>
              <SignInButton />
            </div>
          ) : (
            <>
              {/* Step 1 — pick a permissionless collection */}
              <div data-testid="collection-picker" style={{ marginBottom: tokens.space[6] }}>
                <p style={stepLabel}>1 · Pick a collection to integrate</p>
                {collLoading && <p style={hintText}>Loading collections…</p>}
                {collError && (
                  <p data-testid="collections-error" style={errText}>
                    Couldn’t load collections: {collError.message}
                  </p>
                )}
                {!collLoading && !collError && registerable.length === 0 && (
                  <p data-testid="no-collections" style={hintText}>
                    No collections are accepting integrations yet. Launch one on{' '}
                    <Link to="/launch" style={inlineLink}>/launch</Link>.
                  </p>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: tokens.space[2] }}>
                  {registerable.map((c) => {
                    const picked = selected?.collectionId === c.collectionId;
                    const board = rowByCollection.get(c.collectionId);
                    return (
                      <button
                        key={c.collectionId}
                        type="button"
                        onClick={() => setSelected(c)}
                        disabled={busy}
                        data-testid={`collection-option-${c.collectionId}`}
                        aria-pressed={picked}
                        style={{
                          ...card,
                          textAlign: 'left',
                          padding: tokens.space[3],
                          minWidth: 220,
                          borderColor: picked ? tokens.color.accent : tokens.color.ink,
                          cursor: busy ? 'default' : 'pointer',
                        }}
                      >
                        <div style={{ fontFamily: tokens.font.body, fontWeight: tokens.weight.medium }}>
                          {board?.name ?? `Collection ${shortId(c.collectionId)}`}
                        </div>
                        <div style={{ ...monoLabel, color: tokens.color.hint, marginTop: tokens.space[1] }}>
                          {shortId(c.collectionId)} · fee {mistToSui(c.registerFee)} SUI
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 2 — integration details */}
              {selected && (
                <div data-testid="integration-form" style={{ ...card, padding: tokens.space[6] }}>
                  <p style={stepLabel}>2 · Your work</p>
                  <p style={subtitleStyle}>
                    You pay <strong>{mistToSui(selected.registerFee)} SUI</strong> to the collection’s
                    creator. Your name + link appear in its public “Used by” list.
                  </p>

                  <label style={fieldLabel}>
                    Work name
                    <input
                      data-testid="integration-name-input"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={busy}
                      style={{ ...inputStyle, display: 'block', marginTop: tokens.space[1], width: '100%', maxWidth: 360 }}
                    />
                  </label>
                  {name.length > 0 && !nameCheck.ok && (
                    <div data-testid="name-error" style={fieldError}>{nameCheck.reason}</div>
                  )}

                  <label style={{ ...fieldLabel, marginTop: tokens.space[4] }}>
                    Work URL
                    <input
                      data-testid="integration-url-input"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://yourwork.example"
                      disabled={busy}
                      style={{ ...inputStyle, display: 'block', marginTop: tokens.space[1], width: '100%', maxWidth: 360 }}
                    />
                  </label>
                  {url.length > 0 && !urlCheck.ok && (
                    <div data-testid="url-error" style={fieldError}>{urlCheck.reason}</div>
                  )}

                  <button
                    type="button"
                    onClick={() => void onRegister()}
                    disabled={busy || !formValid}
                    data-testid="register-button"
                    style={{
                      ...buttonPrimary,
                      marginTop: tokens.space[4],
                      opacity: busy || !formValid ? 0.4 : 1,
                      cursor: busy || !formValid ? 'default' : 'pointer',
                    }}
                  >
                    {busy
                      ? 'Approve in your wallet…'
                      : `Register integration — ${mistToSui(selected.registerFee)} SUI`}
                  </button>
                </div>
              )}

              {phase === 'error' && errorMsg && (
                <div data-testid="register-error" style={{ ...errText, marginTop: tokens.space[3] }}>
                  {errorMsg}
                  {errorIsRestricted && (
                    <>
                      {' '}
                      <Link to="/?filter=integration" data-testid="register-error-browse" style={inlineLink}>
                        Browse open collections
                      </Link>
                      .
                    </>
                  )}
                </div>
              )}
              {phase === 'success' && txDigest && (
                <div data-testid="register-success" style={{ ...successText, marginTop: tokens.space[3] }}>
                  Integration registered —{' '}
                  <a
                    href={`https://suiscan.xyz/testnet/tx/${txDigest}`}
                    target="_blank"
                    rel="noreferrer"
                    style={inlineLink}
                  >
                    view tx
                  </a>
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}

const mainStyle: React.CSSProperties = {
  maxWidth: 960,
  margin: '0 auto',
  padding: '32px 24px 64px',
};

const subtitleStyle: React.CSSProperties = {
  fontFamily: tokens.font.body,
  fontSize: tokens.size.md,
  color: tokens.color.hint,
  maxWidth: 560,
  marginTop: tokens.space[3],
};

const statusStrip: React.CSSProperties = {
  ...monoLabel,
  color: tokens.color.hint,
  padding: tokens.space[8],
  textAlign: 'center',
};

const errorBox: React.CSSProperties = {
  ...monoLabel,
  color: tokens.color.err,
  border: tokens.border.err,
  padding: tokens.space[4],
  marginTop: tokens.space[3],
};

const emptyBox: React.CSSProperties = {
  ...monoLabel,
  color: tokens.color.hint,
  border: `1px dashed ${tokens.color.ink}`,
  padding: tokens.space[8],
  textAlign: 'center',
  marginTop: tokens.space[3],
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: tokens.space[4],
  padding: `${tokens.space[3]}px ${tokens.space[4]}px`,
};

const rankStyle: React.CSSProperties = {
  fontFamily: tokens.font.display,
  fontStyle: 'italic',
  fontSize: tokens.size.lg,
  fontWeight: tokens.weight.medium,
  color: tokens.color.ink,
  width: 32,
  flexShrink: 0,
};

const rowNameLink: React.CSSProperties = {
  fontFamily: tokens.font.body,
  fontSize: tokens.size.md,
  fontWeight: tokens.weight.medium,
  color: tokens.color.ink,
  textDecoration: 'none',
};

const countStyle: React.CSSProperties = {
  fontFamily: tokens.font.mono,
  fontSize: tokens.size.sm,
  color: tokens.color.hint,
  marginTop: 2,
};

const sectionHeading: React.CSSProperties = {
  fontFamily: tokens.font.display,
  fontStyle: 'italic',
  fontSize: tokens.size.lg,
  fontWeight: tokens.weight.medium,
  margin: `${tokens.space[2]}px 0 ${tokens.space[4]}px`,
};

const stepLabel: React.CSSProperties = {
  ...monoLabel,
  color: tokens.color.muted,
  marginBottom: tokens.space[3],
};

const fieldLabel: React.CSSProperties = {
  display: 'block',
  fontFamily: tokens.font.mono,
  fontSize: tokens.size.sm,
  color: tokens.color.muted,
};

const fieldError: React.CSSProperties = {
  color: tokens.color.err,
  fontFamily: tokens.font.body,
  fontSize: tokens.size.sm,
  marginTop: tokens.space[1],
};

const hintText: React.CSSProperties = {
  fontFamily: tokens.font.body,
  fontSize: tokens.size.base,
  color: tokens.color.hint,
};

const errText: React.CSSProperties = {
  fontFamily: tokens.font.body,
  fontSize: tokens.size.base,
  color: tokens.color.err,
};

const successText: React.CSSProperties = {
  fontFamily: tokens.font.body,
  fontSize: tokens.size.base,
  color: tokens.color.ok,
};

const inlineLink: React.CSSProperties = {
  color: tokens.color.accent,
  textDecoration: 'underline',
};
