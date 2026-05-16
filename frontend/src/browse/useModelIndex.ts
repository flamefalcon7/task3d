import { useCallback, useEffect, useRef, useState } from 'react';
import type { Model3DSummary } from '@overflow2026/shared';
import { SUI_GRAPHQL_ENDPOINT, buildModel3DIndexRequest } from './graphqlQueries';

export interface UseModelIndexOptions {
  tagFilter?: string;
}

export interface UseModelIndexResult {
  models: Model3DSummary[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

const CACHE_KEY = 'overflow2026:model-index:v1';

// MODEL3D_PACKAGE_ID is read at hook-call time (not module-load) so tests can
// stub `import.meta.env` before each render. Falls back to '0x0' when the
// contract hasn't been deployed yet — the hook then gracefully returns an
// empty list with no error so the Browse UI is still iterable pre-deploy.
function getPackageId(): string {
  const id = import.meta.env.VITE_MODEL3D_PACKAGE_ID as string | undefined;
  return id ?? '0x0';
}

interface GraphQLNode {
  address?: string;
  asMoveObject?: {
    contents?: {
      json?: Record<string, unknown> | null;
    } | null;
  } | null;
}

interface GraphQLResponse {
  data?: {
    objects?: {
      nodes?: GraphQLNode[];
    };
  };
  errors?: Array<{ message: string }>;
}

// Map Move-struct JSON returned by Sui GraphQL into the Model3DSummary shape.
// Defensive: every u64 is normalised to a string, missing fields default to
// safe empty values so a partially-decoded object still renders.
function nodeToSummary(node: GraphQLNode): Model3DSummary | null {
  const objectId = node.address;
  const json = node.asMoveObject?.contents?.json as Record<string, unknown> | null | undefined;
  if (!objectId || !json) return null;

  const blob = (json.blob ?? {}) as Record<string, unknown>;
  const blobId = String(blob.blob_id ?? json.blob_id ?? '');
  const lineageBlobId = String(json.lineage_blob_id ?? '');
  const creator = String(json.creator ?? '');
  const shapeType = String(json.shape_type ?? '');
  const paramsJson = String(json.params_json ?? '');
  const name = String(json.name ?? '');
  const directAccessPrice = String(json.direct_access_price ?? '0');
  const createdAtMs = String(json.created_at_ms ?? '0');
  const rawTags = Array.isArray(json.tags) ? (json.tags as unknown[]) : [];
  const tags = rawTags.map((t) => String(t));
  // Phase 3 (U1): Model3D now carries collection_id + patch_id instead of
  // blob. Read them from the GraphQL response if present; fall back to '' for
  // pre-U2 Phase 2 fixtures and degenerate-of-1 mints (patch_id == '').
  // U5 will refine the GraphQL mapping when Browse groups by collectionId.
  const collectionId = String(json.collection_id ?? '');
  const patchId = String(json.patch_id ?? '');

  return {
    objectId,
    blobId,
    collectionId,
    patchId,
    creator,
    shapeType,
    paramsJson,
    name,
    directAccessPrice,
    tags,
    createdAtMs,
    lineageBlobId,
  };
}

function readCache(): Model3DSummary[] | null {
  try {
    const raw = globalThis.localStorage?.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { models?: Model3DSummary[] };
    return Array.isArray(parsed.models) ? parsed.models : null;
  } catch {
    return null;
  }
}

function writeCache(models: Model3DSummary[]): void {
  try {
    globalThis.localStorage?.setItem(CACHE_KEY, JSON.stringify({ models }));
  } catch {
    // ignore storage failures (quota, private mode, etc.)
  }
}

export function useModelIndex(options: UseModelIndexOptions = {}): UseModelIndexResult {
  const { tagFilter } = options;
  const [allModels, setAllModels] = useState<Model3DSummary[]>(() => readCache() ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const reqCounter = useRef(0);

  const fetchIndex = useCallback(async () => {
    const packageId = getPackageId();
    // Graceful degradation: no contract deployed yet → empty list, no error.
    if (!packageId || packageId === '0x0') {
      setAllModels([]);
      setLoading(false);
      setError(null);
      return;
    }

    const ticket = ++reqCounter.current;
    setLoading(true);
    setError(null);
    try {
      const body = buildModel3DIndexRequest(packageId);
      const res = await fetch(SUI_GRAPHQL_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(`Sui GraphQL ${res.status}`);
      }
      const json = (await res.json()) as GraphQLResponse;
      if (json.errors && json.errors.length) {
        throw new Error(json.errors.map((e) => e.message).join('; '));
      }
      const nodes = json.data?.objects?.nodes ?? [];
      const mapped = nodes
        .map(nodeToSummary)
        .filter((m): m is Model3DSummary => m !== null);
      if (ticket !== reqCounter.current) return;
      setAllModels(mapped);
      writeCache(mapped);
    } catch (e) {
      if (ticket !== reqCounter.current) return;
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      if (ticket === reqCounter.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchIndex();
  }, [fetchIndex]);

  const models = tagFilter
    ? allModels.filter((m) => m.tags.includes(tagFilter))
    : allModels;

  return { models, loading, error, refetch: () => void fetchIndex() };
}
