// /mcp scaffold handshake tests (plan-2026-06-10-001 U2, KTD-1, D-104).
//
// Drives the route through `buildApp` (the real mount path, incl. the
// before-global-CORS ordering) with raw JSON-RPC POSTs, the same wire shape
// any MCP client emits. The stateless transport answers POSTs as SSE-framed
// single events by default, so assertions parse the `data:` line.
import { describe, it, expect } from 'vitest';
import { buildApp } from '../app.js';

const MCP_PROTOCOL_VERSION = '2025-11-25';

const HEADERS = {
  'Content-Type': 'application/json',
  // The Streamable HTTP transport 406s without both accept types.
  Accept: 'application/json, text/event-stream',
};

function initializeBody(id: number | string = 1) {
  return JSON.stringify({
    jsonrpc: '2.0',
    id,
    method: 'initialize',
    params: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'route-test-client', version: '0.0.0' },
    },
  });
}

interface JsonRpcEnvelope {
  jsonrpc: string;
  id?: number | string;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

// Responses may be SSE-framed (`text/event-stream`) or plain JSON; handle both.
async function readJsonRpc(res: Response): Promise<JsonRpcEnvelope> {
  const contentType = res.headers.get('content-type') ?? '';
  const text = await res.text();
  if (contentType.includes('text/event-stream')) {
    const firstData = text
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice('data:'.length).trim())[0];
    if (!firstData) throw new Error(`no SSE data line in response body: ${text}`);
    return JSON.parse(firstData) as JsonRpcEnvelope;
  }
  return JSON.parse(text) as JsonRpcEnvelope;
}

function postMcp(app: ReturnType<typeof buildApp>, body: string) {
  return app.request('/mcp', { method: 'POST', headers: HEADERS, body });
}

describe('POST /mcp initialize', () => {
  it('returns a valid InitializeResult with the negotiated protocol version', async () => {
    const app = buildApp();
    const res = await postMcp(app, initializeBody());
    expect(res.status).toBe(200);

    const msg = await readJsonRpc(res);
    expect(msg.error).toBeUndefined();
    expect(msg.id).toBe(1);

    const result = msg.result as {
      protocolVersion: string;
      serverInfo: { name: string; version: string };
      capabilities: Record<string, unknown>;
    };
    expect(result.protocolVersion).toBe(MCP_PROTOCOL_VERSION);
    expect(result.serverInfo.name).toBe('tusk3d');
    expect(result.serverInfo.version).toBeTruthy();
    // The scaffold advertises the tools capability even with zero tools, so
    // clients don't skip tools/list before U4 lands.
    expect(result.capabilities).toHaveProperty('tools');
  });

  it('two concurrent initialize POSTs both succeed (fresh server+transport per request)', async () => {
    const app = buildApp();
    const [resA, resB] = await Promise.all([
      postMcp(app, initializeBody(1)),
      postMcp(app, initializeBody(1)), // same message id on purpose — no collision in stateless mode
    ]);
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);

    const [msgA, msgB] = await Promise.all([readJsonRpc(resA), readJsonRpc(resB)]);
    for (const msg of [msgA, msgB]) {
      expect(msg.error).toBeUndefined();
      expect((msg.result as { serverInfo: { name: string } }).serverInfo.name).toBe('tusk3d');
    }
  });
});

describe('POST /mcp tools/list', () => {
  it('lists the four v0 read tools, each with input AND output schemas (U4)', async () => {
    const app = buildApp();
    // Stateless mode: no session id; each POST gets a fresh server. An
    // initialize round-trip first mirrors real client behavior.
    const init = await postMcp(app, initializeBody());
    expect(init.status).toBe(200);

    const res = await postMcp(
      app,
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
    );
    expect(res.status).toBe(200);

    const msg = await readJsonRpc(res);
    expect(msg.error).toBeUndefined();
    expect(msg.id).toBe(2);
    const tools = (msg.result as { tools: Array<{ name: string; inputSchema?: unknown; outputSchema?: unknown }> })
      .tools;
    expect(tools.map((t) => t.name).sort()).toEqual([
      'build_purchase_tx',
      'download_content',
      'get_license_terms',
      'get_model',
      'get_preview',
      'list_fork_collections',
      'search_models',
    ]);
    // Agents need machine-readable output: every tool advertises an outputSchema.
    for (const tool of tools) {
      expect(tool.inputSchema, `${tool.name} inputSchema`).toBeTruthy();
      expect(tool.outputSchema, `${tool.name} outputSchema`).toBeTruthy();
    }
  });
});

// fix(review) R-002 — GET must not open a stateless SSE stream.
describe('/mcp GET', () => {
  it('returns 405 with an Allow header (no SSE on the stateless endpoint)', async () => {
    const app = buildApp({});
    const res = await app.request('/mcp', { method: 'GET' });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toContain('POST');
  });
});

// fix(review) RATE-1 — coarse per-IP window caps aggregate abuse from freely
// minted addresses/JWTs; answered at the HTTP layer, pre-auth.
describe('/mcp per-IP rate limit', () => {
  it('429 after the per-IP budget; a different IP is unaffected', async () => {
    const { buildMcpRoute } = await import('./route.js');
    const { resetMcpRateLimitForTest } = await import('./auth.js');
    resetMcpRateLimitForTest();
    let ip = '10.0.0.1';
    const route = buildMcpRoute({
      getClientIp: () => ip,
      ipRateLimit: { maxPerWindow: 2, windowMs: 60_000 },
    });
    const post = () =>
      route.request('/', { method: 'POST', headers: HEADERS, body: initializeBody() });
    expect((await post()).status).toBe(200);
    expect((await post()).status).toBe(200);
    // 3rd call: count 3 > maxPerWindow 2 → limited.
    expect((await post()).status).toBe(429);
    ip = '10.0.0.2';
    expect((await post()).status).toBe(200);
    resetMcpRateLimitForTest();
  });
});
