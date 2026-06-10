// MCP get_preview — public preview-still URLs for one Model3D (U4, R3, D-104).
//
// Returns aggregator/CDN URLs (never bytes — the agent fetches what it wants):
// `previewBlobIds` are QUILT PATCH ids (ciphertext + watermarked stills are
// co-located in one Walrus quilt at publish, D-075/D-101), so they resolve via
// `/v1/blobs/by-quilt-patch-id/<id>` — the same composition as the frontend's
// `walrus/aggregator.ts`.
//
// Audit W-4: blob ids originate from on-chain data an attacker can publish.
// Each id is validated against the base64url charset BEFORE splicing into a
// URL; a malformed id (`../`, `%2F`, dot-segments) is SKIPPED — never
// path-composed, never an error that blocks the valid siblings.
//
// NEVER expose `glbBlobId` here: for an encrypted base it is AES ciphertext
// whose delivery is download_content's entitlement-gated job (U6).
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { requireAgentSub } from '../auth.js';
import type { BuildMcpServerDeps } from '../server.js';
import { MODEL_ID_SHAPE, readModelSummary } from './getModel.js';

// Mirrors frontend/src/walrus/aggregator.ts (the canonical constant + W-4 regex).
// Backend env analog of VITE_WALRUS_AGGREGATOR; read at call time per the
// server.ts DI contract.
const DEFAULT_WALRUS_AGGREGATOR = 'https://aggregator.walrus-testnet.walrus.space';
const BLOB_ID_RE = /^[A-Za-z0-9_-]+$/;

export function resolveAggregatorBase(deps: BuildMcpServerDeps): string {
  const base = deps.walrusAggregator ?? process.env.WALRUS_AGGREGATOR ?? DEFAULT_WALRUS_AGGREGATOR;
  return base.replace(/\/+$/, '');
}

const outputSchema = {
  modelId: z.string(),
  previewUrls: z
    .array(z.string())
    .describe('Fetchable image URLs of the watermarked preview stills, in turntable order'),
};

export function registerGetPreview(server: McpServer, deps: BuildMcpServerDeps): void {
  server.registerTool(
    'get_preview',
    {
      title: 'Get preview',
      description:
        'Public preview-image URLs for one Model3D (watermarked stills served from Walrus). ' +
        'Empty for models published without previews. Requires Authorization: Bearer <jwt>.',
      inputSchema: { modelId: MODEL_ID_SHAPE },
      outputSchema,
    },
    async ({ modelId }, extra) => {
      await requireAgentSub(extra, { jwt: deps.jwt });
      const summary = await readModelSummary(deps, modelId);
      const base = resolveAggregatorBase(deps);
      const previewUrls = (summary.previewBlobIds ?? [])
        // Audit W-4: drop malformed ids rather than compose a crafted path.
        .filter((id) => id && BLOB_ID_RE.test(id))
        .map((id) => `${base}/v1/blobs/by-quilt-patch-id/${id}`);
      const structured = { modelId: summary.objectId, previewUrls };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(structured) }],
        structuredContent: structured,
      };
    },
  );
}
