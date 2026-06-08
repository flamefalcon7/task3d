import type { CSSProperties } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Model3DSummary } from '@overflow2026/shared';
import { useModelIndex } from './useModelIndex';
import { CollectionCard } from './CollectionCard';
import { rankCollectionMatches } from './browseSearchRanking';
import { useCollections, POLICY_PERMISSIONLESS } from '../integration/useCollections';
import { useSession } from '../auth/useSession';
import { SignInButton } from '../auth/SignInButton';
import { useMemoryRecall } from '../memory/useMemoryRecall';
import {
  buttonOutline,
  displayHeadline,
  eyebrow,
  input as inputStyle,
  monoLabel,
  pagePaper,
  tokens,
} from '../ux/tokens';

// Phase 3 (U5): Browse renders one card per Collection rather than per
// Model3D variant. Phase 2 "degenerate-of-1" mints whose collectionId points
// at their own bespoke Collection still render — they collapse to a
// single-card group with a "1 variant" badge, which is the desired UX.
//
// Models whose collectionId is unknown (pre-U1 fixtures or partial decodes)
// are bucketed under the synthetic '_orphans' key so they remain visible.
// Each orphan still gets its own card via objectId fallback so we don't
// confusingly merge unrelated assets.
//
// Brutalist editorial styling per D-044: the landing page is the only place
// that explains the product before the user clicks. Hero sells the three-tier
// thesis; editorial card grid sells the catalog; three-CTA row at the foot
// dispatches the demo arc.

export function groupByCollection(
  models: Model3DSummary[],
): Map<string, Model3DSummary[]> {
  const groups = new Map<string, Model3DSummary[]>();
  for (const m of models) {
    const key = m.collectionId || `_orphan:${m.objectId}`;
    const existing = groups.get(key);
    if (existing) {
      existing.push(m);
    } else {
      groups.set(key, [m]);
    }
  }
  return groups;
}

const mainStyle: CSSProperties = {
  maxWidth: 1280,
  margin: '0 auto',
  padding: '32px 24px 64px',
};

const heroStack: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  marginBottom: 40,
  maxWidth: 720,
};

const heroParagraph: CSSProperties = {
  fontFamily: tokens.font.body,
  fontSize: tokens.size.md,
  lineHeight: 1.5,
  color: tokens.color.muted,
  margin: 0,
};

const layerPill: CSSProperties = {
  fontFamily: tokens.font.mono,
  fontSize: 11,
  letterSpacing: '1px',
  textTransform: 'uppercase',
  color: tokens.color.accent,
  fontWeight: 500,
};

const filterRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  alignItems: 'center',
  marginBottom: 24,
  paddingBottom: 16,
  borderBottom: tokens.border.primary,
};

// plan 2026-06-08-002 U3 — semantic "Ask" search row. Full-width row directly
// ABOVE filterRow, separated by the same hairline, so "describe what you want"
// reads as the primary affordance above "narrow by tag".
const searchRow: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  marginBottom: 20,
  paddingBottom: 16,
  borderBottom: tokens.border.primary,
};

const searchHint: CSSProperties = {
  ...monoLabel,
  color: tokens.color.hint,
  textTransform: 'none',
  letterSpacing: '0.5px',
  fontSize: 11,
};

// Signed-out teaser — a non-interactive prompt block (NOT a disabled <input>):
// there is no input/onChange path, so recall can never fire from this surface
// (autofill / stray form-submit can't reach it); the token guard in
// useMemoryRecall is the backstop, not the only defense.
const signinTeaser: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 12,
  padding: '12px 14px',
  background: tokens.color.paperPure,
  border: tokens.border.primary,
};

const signinTeaserCopy: CSSProperties = {
  ...monoLabel,
  color: tokens.color.muted,
  textTransform: 'none',
  letterSpacing: '0.3px',
  fontSize: 12,
};

function chip(active: boolean): CSSProperties {
  return {
    ...monoLabel,
    background: active ? tokens.color.accent : tokens.color.paperPure,
    color: active ? tokens.color.accentInk : tokens.color.ink,
    border: tokens.border.primary,
    padding: '6px 12px',
    cursor: 'pointer',
    fontSize: 11,
  };
}

const chipsLabel: CSSProperties = {
  ...monoLabel,
  color: tokens.color.muted,
  marginRight: 8,
};

const grid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
  gap: 0,
  border: tokens.border.primary,
};

const gridCell: CSSProperties = {
  borderRight: tokens.border.primary,
  borderBottom: tokens.border.primary,
  background: tokens.color.paperPure,
};

const emptyState: CSSProperties = {
  ...monoLabel,
  color: tokens.color.muted,
  textTransform: 'none',
  letterSpacing: '0.5px',
  padding: 32,
  border: `1.5px dashed ${tokens.color.ink}`,
  textAlign: 'center',
};

const errorState: CSSProperties = {
  ...monoLabel,
  color: tokens.color.err,
  textTransform: 'none',
  letterSpacing: '0.5px',
  padding: 16,
  border: `1.5px solid ${tokens.color.err}`,
};

const integrationGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
  gap: 0,
  border: tokens.border.primary,
};

const integrationCell: CSSProperties = {
  ...gridCell,
  padding: 16,
  textDecoration: 'none',
  color: tokens.color.ink,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const integrationName: CSSProperties = {
  fontFamily: tokens.font.display,
  fontStyle: 'italic',
  fontSize: tokens.size.md,
  fontWeight: tokens.weight.medium,
};

const integrationMeta: CSSProperties = {
  ...monoLabel,
  color: tokens.color.hint,
  letterSpacing: '0.5px',
  fontSize: 11,
};

export function BrowsePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const integrationFilter = searchParams.get('filter') === 'integration';
  const [tagFilter, setTagFilter] = useState<string>('');
  const { models, loading, error, refetch } = useModelIndex({
    tagFilter: tagFilter || undefined,
  });
  // Only fetch L2 collections when the integration view is active (R17).
  const {
    collections,
    loading: collectionsLoading,
    error: collectionsError,
  } = useCollections(integrationFilter);
  const openCollections = useMemo(
    () => collections.filter((c) => c.integrationPolicy === POLICY_PERMISSIONLESS),
    [collections],
  );

  // Distinct tags across the loaded set — Phase 2 catalog is small enough
  // that client-side derivation is fine (plan §U8 "Tag filter").
  const allTags = useMemo(() => {
    const s = new Set<string>();
    for (const m of models) for (const t of m.tags) s.add(t);
    // When a tag filter is active we still want to expose the full set so
    // users can clear/switch — recompute by ignoring the filter would
    // require a second pass; for the demo catalog size this is acceptable.
    return Array.from(s).sort();
  }, [models]);

  // Phase 3 (U5): group by collectionId so the Browse grid shows collection
  // cards, not individual variants.
  const collectionGroups = useMemo(() => groupByCollection(models), [models]);

  // plan 2026-06-08-002 U3 — natural-language semantic search. ALL hooks below
  // run unconditionally (no early return precedes them) so an in-page sign-in
  // transition never changes the hook count (react-hooks-after-early-return).
  // useMemoryRecall internally no-ops without a JWT, so calling it while signed
  // out is safe and returns empty lanes.
  const { session } = useSession();
  const { personal, global } = useMemoryRecall();
  const [searchQuery, setSearchQuery] = useState('');
  // session?.address is in the deps so an in-page auth transition (sign in /
  // account switch) RE-ISSUES the active query: the hook clears its lanes on
  // auth change, and without this the grid would sit on a stale "showing all"
  // until the next keystroke. recall identities are stable useCallbacks, so the
  // effect only re-fires on query or auth change, never per render.
  useEffect(() => {
    personal.recall(searchQuery);
    global.recall(searchQuery);
  }, [searchQuery, personal.recall, global.recall, session?.address]);

  const { orderedKeys, cardMatches } = useMemo(
    () => rankCollectionMatches(personal.chips, global.chips, collectionGroups),
    [personal.chips, global.chips, collectionGroups],
  );

  const searchActive = searchQuery.trim().length >= 3;
  const searchLoading = personal.status === 'loading' || global.status === 'loading';
  // Degraded ≠ empty: a scope's relayer being down is surfaced honestly, never
  // collapsed to "zero matches".
  const searchDegraded =
    searchActive && !searchLoading && (personal.degraded || global.degraded);
  // "showing all" only fires when there ARE cards but none matched semantically;
  // when the grid is empty (no models / tag yields nothing) the empty-state owns
  // the message and this stays silent to avoid a contradictory double signal.
  const searchShowingAll =
    searchActive &&
    !searchLoading &&
    !searchDegraded &&
    cardMatches.size === 0 &&
    collectionGroups.size > 0;

  // searchActive is the single source of truth for the grid: a sub-3-char or
  // cleared query renders the default catalog order with no rings, even if a
  // debounced recall response for a prior query is momentarily still in state.
  // This keeps the grid order/highlight and the text micro-statuses (which are
  // all gated on searchActive) from ever disagreeing for a frame.
  const gridKeys = searchActive ? orderedKeys : Array.from(collectionGroups.keys());

  return (
    <div style={pagePaper} data-testid="browse-page">
      <main style={mainStyle}>
        <section style={heroStack}>
          <span style={eyebrow}>— SUI OVERFLOW 2026 / WALRUS TRACK</span>
          <h1 style={displayHeadline}>A model marketplace. On Sui. With composable IP.</h1>
          <p style={heroParagraph}>
            <span style={layerPill}>L1 PUBLISH</span> creator commits a 3D model to Walrus and sets license terms.{' '}
            <span style={layerPill}>L2 MINT</span> someone forks it into a token collection, paying the derive fee.{' '}
            <span style={layerPill}>L3 DRIVE</span> a buyer takes a token from the kiosk and drives it in-game,
            with royalty enforced at the protocol layer.
          </p>
        </section>

        {/* plan 2026-06-08-002 U3 — semantic "Ask" search. Default model-grid
            view only (hidden in the integration view, mirroring the disabled
            tag chips there). Signed in → active field; signed out → login
            teaser (no input, so recall can't fire from this surface). */}
        {!integrationFilter && (
          <div style={searchRow} data-testid="browse-search">
            {session ? (
              <>
                <input
                  type="text"
                  data-testid="browse-search-input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    // Escape clears (browser-native search convention). The field
                    // is intentionally NOT inside a <form>, so Enter is a no-op
                    // (no default-submit reload).
                    if (e.key === 'Escape') {
                      setSearchQuery('');
                      e.currentTarget.blur();
                    }
                  }}
                  placeholder="Describe what you're looking for — e.g. “a fast race car”"
                  aria-label="Search models by description"
                  style={{ ...inputStyle, width: '100%' }}
                />
                <div data-testid="browse-search-hint" style={searchHint} aria-live="polite" aria-atomic="true">
                  Searches models published with a description
                  {searchLoading && <span data-testid="browse-search-loading"> · searching…</span>}
                  {searchShowingAll && (
                    <span data-testid="browse-search-showing-all">
                      {tagFilter ? ' · no semantic matches' : ' · showing all — no semantic matches'}
                    </span>
                  )}
                  {searchDegraded && (
                    <span data-testid="browse-search-degraded"> · some matches unavailable — showing all</span>
                  )}
                </div>
              </>
            ) : (
              <div data-testid="browse-search-signin" style={signinTeaser}>
                <span style={signinTeaserCopy}>Sign in to search models by description</span>
                <SignInButton />
              </div>
            )}
          </div>
        )}

        <div style={filterRow}>
          <span style={chipsLabel}>TAGS ·</span>
          <button
            type="button"
            data-testid="tag-filter-all"
            onClick={() => setTagFilter('')}
            disabled={integrationFilter}
            style={chip(!tagFilter)}
          >
            ALL
          </button>
          {allTags.map((t) => (
            <button
              key={t}
              type="button"
              data-testid={`tag-filter-${t}`}
              onClick={() => setTagFilter(t)}
              disabled={integrationFilter}
              style={chip(tagFilter === t)}
            >
              {t.toUpperCase()}
            </button>
          ))}
          {/* Hidden select kept for backwards-compatible test-id; semantically
              equivalent to the chips above. */}
          <select
            data-testid="tag-filter"
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            disabled={integrationFilter}
            style={{ display: 'none' }}
          >
            <option value="">All</option>
            {allTags.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          <span style={{ flex: 1 }} />

          <button
            onClick={refetch}
            data-testid="refresh-button"
            style={buttonOutline}
          >
            REFRESH
          </button>
          {integrationFilter ? (
            <button
              data-testid="clear-integration-filter"
              onClick={() => setSearchParams({})}
              style={buttonOutline}
            >
              ← SHOW ALL MODELS
            </button>
          ) : (
            <button
              data-testid="integration-filter"
              onClick={() => setSearchParams({ filter: 'integration' })}
              style={buttonOutline}
            >
              OPEN FOR INTEGRATION
            </button>
          )}
        </div>

        {/* R17 — collections accepting game integrations (permissionless). */}
        {integrationFilter && (
          <div data-testid="integration-view">
            {collectionsLoading && (
              <div data-testid="integration-loading" style={{ ...monoLabel, color: tokens.color.hint, padding: 32, textAlign: 'center' }}>
                — LOADING COLLECTIONS
              </div>
            )}
            {collectionsError && !collectionsLoading && (
              <div role="alert" data-testid="integration-error" style={errorState}>
                × FAILED · Couldn't load collections: {collectionsError.message}
              </div>
            )}
            {!collectionsLoading && !collectionsError && openCollections.length === 0 && (
              <div data-testid="integration-empty" style={emptyState}>
                NO COLLECTIONS ARE OPEN FOR INTEGRATION YET
              </div>
            )}
            {!collectionsLoading && !collectionsError && openCollections.length > 0 && (
              <div data-testid="integration-grid" style={integrationGrid}>
                {openCollections.map((c) => {
                  const baseModel = models.find((m) => m.objectId === c.baseModelId);
                  const label = baseModel?.name ? `${baseModel.name} collection` : 'Collection';
                  const feeSui = Number(c.registerFee) / 1e9;
                  return (
                    <Link
                      key={c.collectionId}
                      to={`/collection/${c.collectionId}`}
                      data-testid={`integration-card-${c.collectionId}`}
                      style={integrationCell}
                    >
                      <span style={integrationName}>{label}</span>
                      <span style={integrationMeta}>
                        REGISTER FEE: {feeSui > 0 ? `${feeSui} SUI` : 'FREE'}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {!integrationFilter && loading && (
          <div data-testid="loading-state" style={{ ...monoLabel, color: tokens.color.hint, padding: 32, textAlign: 'center' }}>
            — SYNCING CATALOG
          </div>
        )}

        {!integrationFilter && error && !loading && (
          <div role="alert" data-testid="error-state" style={errorState}>
            × FAILED · Couldn't load index: {error.message}{' '}
            <button onClick={refetch} style={{ ...buttonOutline, marginLeft: 8 }}>Retry</button>
          </div>
        )}

        {!integrationFilter && !loading && !error && models.length === 0 && (
          <div data-testid="empty-state" style={emptyState}>
            NO MODELS PUBLISHED YET — BE THE FIRST TO{' '}
            <Link to="/create" style={{ color: tokens.color.ink, textDecoration: 'underline' }}>MINT ONE</Link>
          </div>
        )}

        {!integrationFilter && !loading && !error && models.length > 0 && (
          <div data-testid="model-grid" style={grid}>
            {/* Single render path: always iterate orderedKeys. When no query is
                active it equals the original insertion order; an active query
                promotes matched collections to the front. Every group key —
                including `_orphan:` keys — is present, so no card vanishes (R9).
                Reorder is instantaneous (no layout transition); the ring +
                reason line is the only promotion signal. */}
            {gridKeys.map((cid) => {
              // Defensive: gridKeys ⊆ collectionGroups.keys() by construction
              // (rankCollectionMatches only ever returns input keys), but guard
              // the lookup so a future memo-dep skew degrades to a skipped card
              // rather than crashing the whole grid on a null variants[0].
              const variants = collectionGroups.get(cid);
              if (!variants) return null;
              return (
                <div key={cid} style={gridCell}>
                  <CollectionCard
                    collectionId={cid}
                    variants={variants}
                    match={searchActive ? cardMatches.get(cid) : undefined}
                  />
                </div>
              );
            })}
          </div>
        )}

      </main>
    </div>
  );
}
