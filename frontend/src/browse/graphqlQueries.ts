// Sui GraphQL queries used by the Browse marketplace.
// Plan P7: single endpoint, no events-query fallback (SG-003).
// U9 reuses the type-filter query infrastructure here.

// Canonical Sui testnet GraphQL endpoint (2026). The earlier
// sui-testnet.mystenlabs.com host (GraphQL Alpha) has been deprecated AND
// its DNS record removed — that's why the browser showed "Failed to fetch".
// https://docs.sui.io/references/sui-graphql lists graphql.<network>.sui.io
// as the current Beta endpoint family.
export const SUI_GRAPHQL_ENDPOINT = 'https://graphql.testnet.sui.io/graphql';

// why: the package id is appended onto the canonical Sui type tag
// `<pkg>::model3d::Model3D`. We keep the query string parametric on the
// fully-qualified type rather than the bare package id because that's what
// Sui's GraphQL `objects(filter: { type: ... })` expects.
export function buildModel3DTypeTag(packageId: string): string {
  return `${packageId}::model3d::Model3D`;
}

// GraphQL query to list every shared Model3D object on the chain.
// The `contents.json` field returns the Move struct as JSON which we then
// destructure into Model3DSummary. Final field shape per the Sui GraphQL
// schema — adjust here if the schema rejects this query (U9 picks up the
// same shape; both pages stay in sync).
//
// Phase 3 (U5): we rely on `contents.json` to surface `collection_id` and
// `patch_id` from the Move struct so Browse can group variants by collection
// and CollectionDetail can request per-variant quilt patches. The Sui GraphQL
// `json` projection emits every field of the Move struct verbatim, so no
// explicit field selection is required — the schema is keyed off the struct
// definition in `contracts/sources/model3d.move` (D-020).
export const MODEL3D_INDEX_QUERY = /* GraphQL */ `
  query Model3Ds($type: String!) {
    objects(filter: { type: $type }) {
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

export interface GraphQLRequestBody {
  query: string;
  variables: Record<string, unknown>;
}

export function buildModel3DIndexRequest(packageId: string): GraphQLRequestBody {
  return {
    query: MODEL3D_INDEX_QUERY,
    variables: { type: buildModel3DTypeTag(packageId) },
  };
}
