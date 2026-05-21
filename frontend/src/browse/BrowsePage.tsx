import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Model3DSummary } from '@overflow2026/shared';
import { useModelIndex } from './useModelIndex';
import { CollectionCard } from './CollectionCard';
import { SignInButton } from '../auth/SignInButton';
import { useCollections, POLICY_PERMISSIONLESS } from '../integration/useCollections';

// Phase 3 (U5): Browse renders one card per Collection rather than per
// Model3D variant. Phase 2 "degenerate-of-1" mints whose collectionId points
// at their own bespoke Collection still render — they collapse to a
// single-card group with a "1 variant" badge, which is the desired UX.
//
// Models whose collectionId is unknown (pre-U1 fixtures or partial decodes)
// are bucketed under the synthetic '_orphans' key so they remain visible.
// Each orphan still gets its own card via objectId fallback so we don't
// confusingly merge unrelated assets.
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

  return (
    <div style={{ minHeight: '100vh', background: '#15171b', color: '#ddd', fontFamily: 'system-ui' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 24px',
          borderBottom: '1px solid #222',
        }}
      >
        <h1 style={{ fontSize: 18, margin: 0 }}>overflow2026 — Browse</h1>
        <nav style={{ display: 'flex', gap: 16, fontSize: 14, alignItems: 'center' }}>
          <Link to="/launch" style={{ color: '#ffb86b', textDecoration: 'none', fontWeight: 600 }}>
            🚀 Launch Collection
          </Link>
          <Link to="/integrate" style={{ color: '#7aa2ff', textDecoration: 'none' }}>
            Integrate →
          </Link>
          <Link to="/track" style={{ color: '#7aa2ff', textDecoration: 'none' }}>
            Racetrack →
          </Link>
          <Link to="/create" style={{ color: '#7aa2ff', textDecoration: 'none' }}>
            Single mint →
          </Link>
          <div style={{ minWidth: 200 }}>
            <SignInButton />
          </div>
        </nav>
      </header>

      <section style={{ padding: 24 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20 }}>
          <label style={{ fontSize: 12, color: '#888' }}>
            Tag:{' '}
            <select
              data-testid="tag-filter"
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              disabled={integrationFilter}
              style={{ marginLeft: 4 }}
            >
              <option value="">All</option>
              {allTags.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <button
            onClick={refetch}
            data-testid="refresh-button"
            style={{ fontSize: 12, padding: '4px 10px', cursor: 'pointer' }}
          >
            Refresh
          </button>
          {integrationFilter ? (
            <button
              data-testid="clear-integration-filter"
              onClick={() => setSearchParams({})}
              style={{ fontSize: 12, padding: '4px 10px', cursor: 'pointer' }}
            >
              ← Show all models
            </button>
          ) : (
            <button
              data-testid="integration-filter"
              onClick={() => setSearchParams({ filter: 'integration' })}
              style={{ fontSize: 12, padding: '4px 10px', cursor: 'pointer' }}
            >
              Open for game integration
            </button>
          )}
        </div>

        {/* R17 — collections accepting game integrations (permissionless). */}
        {integrationFilter && (
          <div data-testid="integration-view">
            {collectionsLoading && (
              <div data-testid="integration-loading" style={{ color: '#888', padding: 40, textAlign: 'center' }}>
                Loading collections…
              </div>
            )}
            {collectionsError && !collectionsLoading && (
              <div role="alert" data-testid="integration-error" style={{ color: 'salmon', padding: 20 }}>
                Couldn't load collections: {collectionsError.message}
              </div>
            )}
            {!collectionsLoading && !collectionsError && openCollections.length === 0 && (
              <div data-testid="integration-empty" style={{ color: '#888', padding: 40, textAlign: 'center' }}>
                No collections are open for integration yet.
              </div>
            )}
            {!collectionsLoading && !collectionsError && openCollections.length > 0 && (
              <div
                data-testid="integration-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                  gap: 16,
                }}
              >
                {openCollections.map((c) => {
                  const baseModel = models.find((m) => m.objectId === c.baseModelId);
                  const label = baseModel?.name ? `${baseModel.name} collection` : 'Collection';
                  const feeSui = Number(c.registerFee) / 1e9;
                  return (
                    <Link
                      key={c.collectionId}
                      to={`/collection/${c.collectionId}`}
                      data-testid={`integration-card-${c.collectionId}`}
                      style={{
                        display: 'block',
                        textDecoration: 'none',
                        color: 'inherit',
                        border: '1px solid #2a2d33',
                        borderRadius: 8,
                        background: '#1a1c20',
                        padding: 14,
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: 6 }}>{label}</div>
                      <div style={{ fontSize: 12, color: '#9aa' }}>
                        register fee: {feeSui > 0 ? `${feeSui} SUI` : 'Free'}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {!integrationFilter && loading && (
          <div data-testid="loading-state" style={{ color: '#888', padding: 40, textAlign: 'center' }}>
            Loading…
          </div>
        )}

        {!integrationFilter && error && !loading && (
          <div role="alert" data-testid="error-state" style={{ color: 'salmon', padding: 20 }}>
            Couldn't load index: {error.message}{' '}
            <button onClick={refetch} style={{ marginLeft: 8 }}>Retry</button>
          </div>
        )}

        {!integrationFilter && !loading && !error && models.length === 0 && (
          <div data-testid="empty-state" style={{ color: '#888', padding: 40, textAlign: 'center' }}>
            No models published yet — be the first to{' '}
            <Link to="/create" style={{ color: '#7aa2ff' }}>mint one</Link>.
          </div>
        )}

        {!integrationFilter && !loading && !error && models.length > 0 && (
          <div
            data-testid="model-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 16,
            }}
          >
            {Array.from(collectionGroups.entries()).map(([cid, variants]) => (
              <CollectionCard key={cid} collectionId={cid} variants={variants} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
