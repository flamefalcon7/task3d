import { useCallback, useEffect, useRef, useState } from 'react';
import { SUI_GRAPHQL_ENDPOINT } from '../browse/graphqlQueries';
import { TESTNET } from '../sui/networkConfig';

// U9 (plan-027) — discover the connected wallet's AccessEntitlement objects.
//
// The contract exposes a soulbound `model3d::model3d::AccessEntitlement
// { id: UID, model_id: ID, holder: address }` minted on paid access. On a wallet
// these are PLAIN owned objects, so discovery is a single owned-objects query —
// mirror of `useOwnedTokens.ts` (the canonical owned-objects-by-type pattern).
//
// Two consumers:
//  - U8 model-detail "already owns access" check — is this base in the set?
//  - U10 /launch catalog — which forkable bases are already unlocked.
// Both also need the raw entitlement object id as the `seal_approve` object arg,
// so we expose a modelId → entitlementId lookup alongside the membership Set.

const OWNED_ENTITLEMENTS_QUERY = /* GraphQL */ `
  query OwnedEntitlements($owner: SuiAddress!, $type: String!) {
    objects(filter: { owner: $owner, type: $type }) {
      nodes {
        address
        asMoveObject {
          contents {
            json
          }
        }
      }
    }
  }
`;

interface GraphQLObjectNode {
  address?: string;
  asMoveObject?: {
    contents?: {
      json?: Record<string, unknown> | null;
    } | null;
  } | null;
}

interface OwnedEntitlementsResponse {
  data?: { objects?: { nodes?: GraphQLObjectNode[] } };
  errors?: Array<{ message: string }>;
}

function entitlementTypeTag(): string {
  return `${TESTNET.model3dPackageId}::model3d::AccessEntitlement`;
}

interface ParsedEntitlement {
  entitlementId: string; // Sui object id — the seal_approve object arg
  modelId: string; // AccessEntitlement.model_id (snake_case in contents.json)
}

function nodeToEntitlement(node: GraphQLObjectNode): ParsedEntitlement | null {
  const entitlementId = node.address;
  const json = node.asMoveObject?.contents?.json as
    | Record<string, unknown>
    | null
    | undefined;
  if (!entitlementId || !json) return null;
  const modelId = json.model_id == null ? '' : String(json.model_id);
  if (!modelId) return null;
  return { entitlementId, modelId };
}

export interface UseOwnedEntitlementsResult {
  // Base model ids the wallet holds an AccessEntitlement for.
  modelIds: Set<string>;
  // modelId → entitlement object id (the seal_approve object arg). If a wallet
  // somehow holds two entitlements for one base, the first seen wins.
  entitlementByModel: Map<string, string>;
  loading: boolean;
  error: Error | null;
  // Force a refetch without changing the wallet (e.g. after a purchase mints a
  // new entitlement). Complements the `reloadKey` param.
  reload: () => void;
}

export function useOwnedEntitlements(
  walletAddress: string | undefined,
  // Bump to force a refetch (e.g. after a purchase mints an entitlement) — owned
  // objects change without the address changing, so this is the refresh hook.
  reloadKey?: unknown,
): UseOwnedEntitlementsResult {
  const [modelIds, setModelIds] = useState<Set<string>>(() => new Set());
  const [entitlementByModel, setEntitlementByModel] = useState<
    Map<string, string>
  >(() => new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  // Internal reload counter — `reload()` bumps it to retrigger the effect, the
  // same way an external `reloadKey` change does.
  const [reloadTick, setReloadTick] = useState(0);
  const reload = useCallback(() => setReloadTick((n) => n + 1), []);
  // Only show the first-fetch loading placeholder once; subsequent refetches
  // (reloadKey / reload) keep prior data on screen and swap silently.
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (!walletAddress) {
      setModelIds(new Set());
      setEntitlementByModel(new Map());
      setLoading(false);
      return;
    }
    let cancelled = false;
    if (!hasLoadedRef.current) setLoading(true);
    setError(null);
    (async () => {
      try {
        const resp = await fetch(SUI_GRAPHQL_ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            query: OWNED_ENTITLEMENTS_QUERY,
            variables: { owner: walletAddress, type: entitlementTypeTag() },
          }),
        });
        if (!resp.ok) throw new Error(`Sui GraphQL ${resp.status}`);
        const json = (await resp.json()) as OwnedEntitlementsResponse;
        if (json.errors?.length) {
          throw new Error(json.errors.map((e) => e.message).join('; '));
        }
        if (cancelled) return;
        // TODO: pagination not implemented; fine at hackathon scale (no
        // evaluator wallet exceeds one page; useOwnedTokens makes the same
        // single-page assumption).
        const parsed = (json.data?.objects?.nodes ?? [])
          .map(nodeToEntitlement)
          .filter((e): e is ParsedEntitlement => e !== null);
        const nextIds = new Set<string>();
        const nextByModel = new Map<string, string>();
        for (const e of parsed) {
          nextIds.add(e.modelId);
          if (!nextByModel.has(e.modelId)) {
            nextByModel.set(e.modelId, e.entitlementId);
          }
        }
        setModelIds(nextIds);
        setEntitlementByModel(nextByModel);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (!cancelled) {
          setLoading(false);
          hasLoadedRef.current = true;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [walletAddress, reloadKey, reloadTick]);

  return { modelIds, entitlementByModel, loading, error, reload };
}
