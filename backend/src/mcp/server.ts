// MCP server factory (plan-2026-06-10-001 U2, KTD-1, D-104).
//
// Builds the per-request `McpServer` for the stateless `/mcp` transport
// (route.ts constructs a fresh server + transport per request, per the SDK's
// documented no-reuse warning). Later units (U4–U6) register the six tools
// here; U2 ships zero tools but a working initialize/tools/list handshake.
//
// DI mirrors `buildApp`/`buildMemoryRoute`: every dep is optional, tests
// inject fakes, and live call sites fall back to the env-backed singletons
// (`getSuiClient()` / `getMemwalClient()`) **at request time** — resolved
// inside the tool handlers, never at module load, so importing this file
// never reads `contracts/networks/testnet.json` or env.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import type { JwtSigner } from '../lib/jwt.js';
import type { MemwalClient } from '../lib/memwal-client.js';

export const MCP_SERVER_NAME = 'tusk3d';
// Server implementation version surfaced in `InitializeResult.serverInfo`
// (independent of the MCP protocol version, which the transport negotiates).
export const MCP_SERVER_VERSION = '0.1.0';

export interface BuildMcpServerDeps {
  /** Verifies the bearer JWT on tool calls (U3). Tests inject a fake signer. */
  jwt?: JwtSigner;
  /** On-chain read client (U4–U6). Defaults to `getSuiClient()` at call time. */
  suiClient?: SuiJsonRpcClient;
  /** MemWal recall for search_models (U4). Defaults to `getMemwalClient()`. */
  memwal?: MemwalClient;
  /** Deployed model3d package id. Defaults to `NETWORK.packageId` at call time. */
  packageId?: string;
}

export function buildMcpServer(deps: BuildMcpServerDeps = {}): McpServer {
  // `deps` is threaded through now so U4–U6 only add `registerTool` calls here.
  void deps;
  const server = new McpServer({ name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION });

  // Install the tools/list + tools/call handlers (and advertise the `tools`
  // capability) even with zero tools registered. The SDK only wires these on
  // the first `registerTool`, so a scaffold server would otherwise answer
  // tools/list with -32601 Method-not-found. `setToolRequestHandlers` is
  // `private` in the d.ts but idempotent (`_toolHandlersInitialized` guard),
  // so later `registerTool` calls are unaffected; the cast is the narrowest
  // way to reach it without forking the SDK.
  (server as unknown as { setToolRequestHandlers(): void }).setToolRequestHandlers();

  return server;
}
