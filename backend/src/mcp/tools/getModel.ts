// MCP get_model — full Model3DSummary for one on-chain Model3D (U4, R3, D-104).
//
// Read path: `getObject({ id, options: { showContent: true } })` on the
// fullnode JSON-RPC client (D-019/D-043 — by-id fullnode read, no indexer
// lag), assert the object IS this package's `model3d::Model3D`, then map the
// Move JSON through the shared `jsonToSummary` (KTD-5 — the exact mapper the
// frontend uses, so the two surfaces can't drift).
//
// JSON-RPC vs GraphQL shape: `jsonToSummary` was written against the GraphQL
// `contents.json` rendering (nested structs flattened to plain objects), but
// JSON-RPC renders every nested Move struct as `{ type, fields }` (see
// integrationIndexer.ts: `fields.integrations.fields.id`). `unwrapMoveFields`
// normalizes the JSON-RPC shape to the flat one before the shared mapper runs
// — without it every `license.*` fee would silently default to '0'.
//
// This module also exports `readModelSummary` — the shared "resolve a modelId
// to a summary or throw a clean McpToolError" step that get_license_terms and
// get_preview reuse.
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { jsonToSummary, type Model3DSummary } from '@overflow2026/shared';
import { McpToolError, optionalAgentSub } from '../auth.js';
import type { BuildMcpServerDeps, McpSuiClient } from '../server.js';
import { AUTH_HINT, MODEL_TYPE_SUFFIX, guarded, modelDetailUrl, resolveWebOrigin, toolResult, withTimeout } from './common.js';

// Same accepted shape as the auth layer: short-form ids are valid Sui
// addresses. The SDK validates this BEFORE the handler runs (raw Zod shape →
// JSON-RPC InvalidParams → isError tool result), so handlers see a sane id.
export const MODEL_ID_SHAPE = z
  .string()
  .regex(/^0x[0-9a-fA-F]{1,64}$/)
  .describe('Sui object id of the Model3D');

/** Full `Model3DSummary` as a Zod raw shape (mirrors shared/src/types.ts). */
export const MODEL_SUMMARY_SHAPE = {
  objectId: z.string(),
  blobId: z.string(),
  collectionId: z.string(),
  patchId: z.string(),
  creator: z.string(),
  shapeType: z.string(),
  paramsJson: z.string(),
  name: z.string(),
  directAccessPrice: z.string().describe('u64 MIST as string'),
  tags: z.array(z.string()),
  partLabels: z.array(z.string()),
  createdAtMs: z.string(),
  lineageBlobId: z.string(),
  glbBlobId: z.string(),
  derivativeMintFee: z.string().describe('u64 MIST as string'),
  accessFee: z.string().describe('u64 MIST as string'),
  derivativeRoyaltyBps: z.number(),
  policy: z.number().describe('0 RESTRICTED · 1 ALLOW_LIST · 2 PERMISSIONLESS'),
  isEncrypted: z.boolean(),
  previewBlobIds: z.array(z.string()),
  detailUrl: z.string().describe('Click-through to the tusk3d web detail page for this model (3D preview, license, buy flow)'),
};

/**
 * Live-default resolution for the on-chain read deps. Dynamic import on
 * purpose: `sui/client.ts` reads `contracts/networks/testnet.json` at module
 * load, and the server.ts DI contract forbids that happening just because an
 * MCP module was imported — it may only happen at call time.
 */
export async function resolveSuiDeps(
  deps: BuildMcpServerDeps,
): Promise<{ client: McpSuiClient; packageId: string }> {
  if (deps.suiClient && deps.packageId) {
    return { client: deps.suiClient, packageId: deps.packageId };
  }
  const live = await import('../../sui/client.js');
  return {
    client: deps.suiClient ?? live.getSuiClient(),
    packageId: deps.packageId ?? live.NETWORK.packageId,
  };
}

/**
 * Normalize a JSON-RPC moveObject `fields` tree to the flat GraphQL-style JSON
 * `jsonToSummary` expects: every nested `{ type, fields }` struct wrapper is
 * replaced by its (recursively unwrapped) `fields`.
 */
export function unwrapMoveFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(unwrapMoveFields);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (
      typeof obj.type === 'string' &&
      obj.fields &&
      typeof obj.fields === 'object' &&
      keys.every((k) => k === 'type' || k === 'fields')
    ) {
      return unwrapMoveFields(obj.fields);
    }
    return Object.fromEntries(keys.map((k) => [k, unwrapMoveFields(obj[k])]));
  }
  return value;
}

/**
 * Resolve `modelId` to a full `Model3DSummary`, or throw a clean tool error:
 *  - not_found       — id doesn't resolve, or resolves to a non-Model3D object
 *  - upstream_error  — the fullnode read itself failed (network/RPC)
 */
export async function readModelSummary(
  deps: BuildMcpServerDeps,
  modelId: string,
  // Pass when the caller already resolved the sui deps (review M-009 — avoids
  // a second resolveSuiDeps round-trip in build_purchase_tx).
  resolved?: { client: McpSuiClient; packageId: string },
): Promise<Model3DSummary> {
  const { client, packageId } = resolved ?? (await resolveSuiDeps(deps));
  let resp: unknown;
  try {
    resp = await withTimeout(
      client.getObject({ id: modelId, options: { showContent: true } }),
      'model read',
    );
  } catch (e) {
    if (e instanceof McpToolError) throw e;
    throw new McpToolError('upstream_error', 'Sui fullnode read failed; retry shortly');
  }
  const data = (
    resp as {
      data?: {
        content?: { dataType?: string; type?: string; fields?: Record<string, unknown> | null } | null;
      } | null;
    }
  ).data;
  if (!data) {
    throw new McpToolError('not_found', `No on-chain object found for ${modelId}`);
  }
  const content = data.content;
  // Exact package match (not a suffix check): a foreign package's lookalike
  // `model3d::Model3D` must not project as ours.
  if (
    !content ||
    content.dataType !== 'moveObject' ||
    content.type !== `${packageId}${MODEL_TYPE_SUFFIX}`
  ) {
    throw new McpToolError('not_found', `Object ${modelId} is not a ${MODEL_TYPE_SUFFIX.slice(2)}`);
  }
  const json = unwrapMoveFields(content.fields ?? {}) as Record<string, unknown>;
  return jsonToSummary(modelId, json);
}

export function registerGetModel(server: McpServer, deps: BuildMcpServerDeps): void {
  server.registerTool(
    'get_model',
    {
      title: 'Get model',
      description:
        'Fetch the full on-chain summary of one Tusk3D Model3D (creator, name, license fees, ' +
        'policy, encryption flag, Walrus blob ids). For a NON-encrypted model, glbBlobId is the ' +
        'public GLB quilt-patch id — fetch it at <aggregator>/v1/blobs/by-quilt-patch-id/<id>. ' +
        `${AUTH_HINT}`,
      inputSchema: { modelId: MODEL_ID_SHAPE },
      outputSchema: MODEL_SUMMARY_SHAPE,
    },
    guarded(async ({ modelId }, extra) => {
      await optionalAgentSub(extra, { jwt: deps.jwt }); // public read (D-111); a present bearer is still validated
      const summary = await readModelSummary(deps, modelId);
      return toolResult({ ...summary, detailUrl: modelDetailUrl(resolveWebOrigin(deps), summary.objectId) });
    }),
  );
}
