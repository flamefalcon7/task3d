// /mcp — stateless MCP Streamable HTTP endpoint (plan-2026-06-10-001 U2, KTD-1, D-104).
//
// Shape follows the SDK's shipped Hono example
// (`@modelcontextprotocol/sdk` examples/server/honoWebStandardStreamableHttp):
// a FRESH `McpServer` + `WebStandardStreamableHTTPServerTransport` per request
// (stateless mode — `sessionIdGenerator: undefined`), handing the raw Fetch
// `Request` straight to the transport and returning its Fetch `Response`.
// Stateless because the tools are plain request/response RPCs (no server
// push), which avoids session-map bookkeeping and stays horizontally scalable.
//
// CORS here is scoped to /mcp only and exists solely for BROWSER-hosted MCP
// clients (the MCP spec's session/protocol headers must be allowed + exposed).
// Non-browser agents ignore CORS entirely — actual protection on cost-bearing
// tools is the U3 bearer-JWT gate, never CORS (see
// docs/solutions/best-practices/cors-is-browser-only-…-2026-05-15.md).
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { buildMcpServer, type BuildMcpServerDeps } from './server.js';

export type McpRouteDeps = BuildMcpServerDeps;

export function buildMcpRoute(deps: McpRouteDeps = {}) {
  const route = new Hono();

  route.use(
    '*',
    cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'mcp-session-id', 'mcp-protocol-version', 'Last-Event-ID'],
      exposeHeaders: ['mcp-session-id', 'mcp-protocol-version'],
    }),
  );

  // `.all` so POST (JSON-RPC), GET (SSE stream), and DELETE (session end) all
  // reach the transport — the Streamable HTTP spec is a single endpoint. Do
  // NOT touch `c.req.json()` here: the transport must consume the raw body.
  route.all('/', async (c) => {
    const server = buildMcpServer(deps);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    return transport.handleRequest(c.req.raw);
  });

  return route;
}
