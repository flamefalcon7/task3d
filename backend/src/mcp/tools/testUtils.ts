// Test-only harness for the U4 read-tool tests (no vitest imports — assertions
// stay in the *.test.ts files). Drives tools the way a real MCP client does:
// transport-level JSON-RPC `tools/call` POSTs through `buildMcpRoute(deps)`
// (the route.test.ts idiom), so the bearer→authInfo threading, the SDK's
// input/output-schema validation, and the thrown-McpToolError→isError
// conversion are all under test — not just the bare handler function.
import { buildMcpRoute } from '../route.js';
import type { BuildMcpServerDeps } from '../server.js';
import type { JwtSigner, SessionClaims } from '../../lib/jwt.js';

/** Canonical agent address the stub JWT resolves to. */
export const AGENT_SUB = `0x${'a'.repeat(64)}`;
/** The one bearer token the stub signer accepts. */
export const AGENT_TOKEN = 'agent-token';

// token → claims stub (auth.test.ts / memory.test.ts idiom).
export const stubJwt: JwtSigner = {
  async signSession(): Promise<string> {
    return AGENT_TOKEN;
  },
  async verifySession(token: string): Promise<SessionClaims> {
    if (token === AGENT_TOKEN) return { sub: AGENT_SUB } as SessionClaims;
    throw new Error('invalid token');
  },
};

export interface ToolCallResult {
  content: Array<{ type: string; text?: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

// Responses may be SSE-framed or plain JSON (route.test.ts readJsonRpc).
async function readJsonRpc(res: Response): Promise<{
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}> {
  const contentType = res.headers.get('content-type') ?? '';
  const text = await res.text();
  if (contentType.includes('text/event-stream')) {
    const firstData = text
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice('data:'.length).trim())[0];
    if (!firstData) throw new Error(`no SSE data line in response body: ${text}`);
    return JSON.parse(firstData) as { result?: Record<string, unknown> };
  }
  return JSON.parse(text) as { result?: Record<string, unknown> };
}

/**
 * One stateless tools/call round-trip. `token: null` omits the Authorization
 * header entirely (the auth_required path). Throws on JSON-RPC protocol
 * errors; tool-level failures come back as `isError: true` results.
 */
export async function callTool(
  deps: BuildMcpServerDeps,
  name: string,
  args: Record<string, unknown>,
  token: string | null = AGENT_TOKEN,
): Promise<ToolCallResult> {
  const route = buildMcpRoute(deps);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  const res = await route.request('/', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  });
  if (res.status !== 200) {
    throw new Error(`tools/call ${name} → HTTP ${res.status}: ${await res.text()}`);
  }
  const msg = await readJsonRpc(res);
  if (msg.error) {
    throw new Error(`tools/call ${name} → JSON-RPC error ${msg.error.code}: ${msg.error.message}`);
  }
  return msg.result as unknown as ToolCallResult;
}

/** The isError text the SDK emits for a thrown McpToolError is `<code>: <detail>`. */
export function errorText(result: ToolCallResult): string {
  return result.content.find((c) => c.type === 'text')?.text ?? '';
}
