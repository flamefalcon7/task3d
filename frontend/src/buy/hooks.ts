import { useEffect, useMemo, useState } from 'react';
// plan 2026-06-10-001 U1 (KTD-5) — `jsonToSummary` lifted into
// `@overflow2026/shared` (shared/src/model/jsonToSummary.ts) so the backend
// MCP read tools share the same raw-Move-JSON → Model3DSummary mapping.
import { jsonToSummary, type Model3DSummary } from '@overflow2026/shared';
import { SUI_GRAPHQL_ENDPOINT } from '../browse/graphqlQueries';
import { useOwnedEntitlements } from '../collection/useOwnedEntitlements';

// Single-object Model3D query — sibling of useModelIndex (U8) but scoped to
// one object id. Defensive about partial decodes, same as useModelIndex.
const SINGLE_MODEL_QUERY = /* GraphQL */ `
  query Model3DById($id: SuiAddress!) {
    object(address: $id) {
      address
      asMoveObject {
        contents {
          json
        }
      }
    }
  }
`;

interface SingleObjectResponse {
  data?: {
    object?: {
      address?: string;
      asMoveObject?: {
        contents?: {
          json?: Record<string, unknown> | null;
        } | null;
      } | null;
    } | null;
  };
  errors?: Array<{ message: string }>;
}

export function useModelById(objectId: string): {
  model: Model3DSummary | null;
  loading: boolean;
  error: Error | null;
} {
  const [model, setModel] = useState<Model3DSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!objectId || objectId === '0x0') {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const resp = await fetch(SUI_GRAPHQL_ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            query: SINGLE_MODEL_QUERY,
            variables: { id: objectId },
          }),
        });
        if (!resp.ok) throw new Error(`Sui GraphQL ${resp.status}`);
        const data = (await resp.json()) as SingleObjectResponse;
        if (data.errors && data.errors.length) {
          throw new Error(data.errors.map((e) => e.message).join('; '));
        }
        const obj = data.data?.object;
        if (!obj || cancelled) {
          if (!cancelled) setModel(null);
          return;
        }
        const json = obj.asMoveObject?.contents?.json;
        if (!json) throw new Error('Model3D object missing contents.json');
        if (!cancelled) {
          setModel(jsonToSummary(obj.address ?? objectId, json));
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [objectId]);

  return { model, loading, error };
}

// plan-027 U8 — "does this wallet already hold access to THIS base?" selector
// over useOwnedEntitlements. The detail page branches the ALLOW_LIST CTA on
// `hasEntitlement` (Buy access vs. View) and needs `entitlementId` as the
// seal_approve object arg for the decrypt. `reload()` is bumped after a
// purchase so the freshly-minted entitlement surfaces without a page reload.
export interface UseDetailEntitlement {
  /** This wallet holds an AccessEntitlement bound to `modelObjectId`. */
  hasEntitlement: boolean;
  /** The entitlement object id (the seal_approve arg), or undefined if none. */
  entitlementId: string | undefined;
  loading: boolean;
  error: Error | null;
  /** Force a refetch (call after a purchase mints a new entitlement). */
  reload: () => void;
}

export function useDetailEntitlement(
  walletAddress: string | undefined,
  modelObjectId: string | undefined,
  reloadKey?: unknown,
): UseDetailEntitlement {
  const { modelIds, entitlementByModel, loading, error, reload } =
    useOwnedEntitlements(walletAddress, reloadKey);
  return useMemo(
    () => ({
      hasEntitlement: modelObjectId ? modelIds.has(modelObjectId) : false,
      entitlementId: modelObjectId
        ? entitlementByModel.get(modelObjectId)
        : undefined,
      loading,
      error,
      reload,
    }),
    [modelObjectId, modelIds, entitlementByModel, loading, error, reload],
  );
}
