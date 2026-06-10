// MCP search_models — MemWal semantic recall over published prompts (U4, R2, D-104).
//
// Wraps the same relayer recall the /api/memory route proxies: records are
// `<prompt> <RS> {m: modelId, c?: creator}` (shared memory codec), namespaced
// by creator address, with non-RESTRICTED publishes mirrored into the shared
// GLOBAL_NAMESPACE (D-080 dual-write). `scope: 'global'` (the default —
// discovery) recalls that community namespace; `scope: 'personal'` recalls the
// CALLER's own namespace (= verified JWT sub; a client-supplied namespace is
// never accepted, mirroring memory.ts R7).
//
// Failure posture mirrors the memory route exactly: AUTH is hard-fail
// (requireAgentSub throws → isError result), but the RELAYER is fail-soft —
// a degraded/failed/timed-out recall returns `{ results: [], degraded: true }`
// (the x-memwal-degraded contract, in-band since MCP tools have no response
// headers), never a throw. Results keep the recall ranking (ascending
// distance) and apply the route's RECALL_MAX_DISTANCE relevance gate.
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { parseMemory } from '@overflow2026/shared';
import { GLOBAL_NAMESPACE, RECALL_MAX_DISTANCE } from '../../routes/memory.js';
import { requireAgentSub } from '../auth.js';
import type { BuildMcpServerDeps } from '../server.js';

// Bounds mirror memory.ts recallSchema.
const inputSchema = {
  query: z.string().min(1).max(2000).describe('Natural-language description of the wanted model'),
  limit: z.number().int().min(1).max(20).optional().describe('Max results (default 10)'),
  scope: z
    .enum(['global', 'personal'])
    .optional()
    .describe("'global' (default): community-published models. 'personal': the caller's own publishes."),
};

const outputSchema = {
  results: z.array(
    z.object({
      modelId: z.string().describe('Model3D object id — feed to get_model / get_license_terms'),
      prompt: z.string().describe('The creator prompt the match scored against'),
      distance: z.number().describe('Cosine distance; lower = closer'),
      creator: z.string().optional().describe('Creator address (global-scope results only)'),
    }),
  ),
  degraded: z.boolean().optional().describe('true when the memory relayer failed; results are empty, retry later'),
};

const DEFAULT_LIMIT = 10;

interface SearchResult {
  modelId: string;
  prompt: string;
  distance: number;
  creator?: string;
}

export function registerSearchModels(server: McpServer, deps: BuildMcpServerDeps): void {
  server.registerTool(
    'search_models',
    {
      title: 'Search models',
      description:
        'Semantic search over published Tusk3D models (Walrus-backed memory recall). ' +
        'Returns ranked candidates with the model id to pass to get_model / get_license_terms. ' +
        'Requires Authorization: Bearer <jwt>.',
      inputSchema,
      outputSchema,
    },
    async ({ query, limit, scope }, extra) => {
      const sub = await requireAgentSub(extra, { jwt: deps.jwt });
      const effectiveScope = scope ?? 'global';
      const namespace = effectiveScope === 'personal' ? sub : GLOBAL_NAMESPACE;
      const n = limit ?? DEFAULT_LIMIT;

      // Live default resolved at call time per the server.ts DI contract.
      const client = deps.memwal ?? (await import('../../lib/memwal-client.js')).getMemwalClient();

      let structured: { results: SearchResult[]; degraded?: boolean };
      try {
        const outcome = await client.recall(namespace, query, {
          limit: n,
          maxDistance: RECALL_MAX_DISTANCE,
        });
        if (outcome.errored) {
          structured = { results: [], degraded: true };
        } else {
          structured = {
            results: outcome.results
              .map((m) => ({ ...parseMemory(m.text), distance: m.distance }))
              // A record with no model reference is unactionable for an agent;
              // global-scope additionally drops unverifiable authorship
              // (no `c` trailer), mirroring the memory route.
              .filter((r) => r.ref?.m && (effectiveScope === 'personal' || r.ref.c))
              .slice(0, n)
              .map((r) => ({
                modelId: r.ref!.m,
                prompt: r.prompt,
                distance: r.distance,
                ...(r.ref!.c ? { creator: r.ref!.c } : {}),
              })),
          };
        }
      } catch {
        // The real MemwalClient never rejects (fail-soft façade), but an
        // injected/foreign client might — same degraded contract, never throw.
        structured = { results: [], degraded: true };
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(structured) }],
        structuredContent: structured as unknown as Record<string, unknown>,
      };
    },
  );
}
