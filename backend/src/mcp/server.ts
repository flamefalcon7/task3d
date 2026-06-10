// MCP server factory (plan-2026-06-10-001 U2/U4, KTD-1, D-104).
//
// Builds the per-request `McpServer` for the stateless `/mcp` transport
// (route.ts constructs a fresh server + transport per request, per the SDK's
// documented no-reuse warning). U4 registers the four read-only tools here;
// U5/U6 add the two transaction-path tools.
//
// DI mirrors `buildApp`/`buildMemoryRoute`: every dep is optional, tests
// inject fakes, and live call sites fall back to the env-backed singletons
// (`getSuiClient()` / `getMemwalClient()`) **at request time** — resolved
// inside the tool handlers, never at module load, so importing this file
// never reads `contracts/networks/testnet.json` or env.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JwtSigner } from '../lib/jwt.js';
import type { MemwalClient } from '../lib/memwal-client.js';
import { registerSearchModels } from './tools/searchModels.js';
import { registerGetModel } from './tools/getModel.js';
import { registerGetLicenseTerms } from './tools/getLicenseTerms.js';
import { registerGetPreview } from './tools/getPreview.js';

export const MCP_SERVER_NAME = 'tusk3d';
// Server implementation version surfaced in `InitializeResult.serverInfo`
// (independent of the MCP protocol version, which the transport negotiates).
export const MCP_SERVER_VERSION = '0.1.0';

/**
 * The on-chain read slice the MCP tools use. Structural (rather than the full
 * `SuiJsonRpcClient`) so tests inject a plain-object fake without casts; the
 * live `getSuiClient()` singleton satisfies it.
 */
export interface McpSuiClient {
  getObject(params: { id: string; options?: { showContent?: boolean } }): Promise<unknown>;
}

export interface BuildMcpServerDeps {
  /** Verifies the bearer JWT on tool calls (U3). Tests inject a fake signer. */
  jwt?: JwtSigner;
  /** On-chain read client (U4–U6). Defaults to `getSuiClient()` at call time. */
  suiClient?: McpSuiClient;
  /** MemWal recall for search_models (U4). Defaults to `getMemwalClient()`. */
  memwal?: MemwalClient;
  /** Deployed model3d package id. Defaults to `NETWORK.packageId` at call time. */
  packageId?: string;
  /**
   * Walrus read-path base for get_preview / download_content URLs. Defaults at
   * call time to `WALRUS_AGGREGATOR` env (e.g. the cdn.tusk3d.space worker,
   * D-073) or the public testnet aggregator — mirrors the frontend's
   * `walrus/aggregator.ts` canonical constant (audit W-3: env-driven, never a
   * baked guess).
   */
  walrusAggregator?: string;
}

export function buildMcpServer(deps: BuildMcpServerDeps = {}): McpServer {
  const server = new McpServer({ name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION });

  // v0 read tools (U4). `registerTool` installs the tools/list + tools/call
  // request handlers on first call, so the U2-era `setToolRequestHandlers()`
  // workaround is gone. Every tool verifies the bearer via `requireAgentSub`
  // FIRST (KTD-4) — there is no unauthenticated tool surface.
  registerSearchModels(server, deps);
  registerGetModel(server, deps);
  registerGetLicenseTerms(server, deps);
  registerGetPreview(server, deps);

  return server;
}
