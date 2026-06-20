// Shared invariants + helpers for the MCP tools (fix(review) after U4–U6).
//
// These constants are security-gate material (a drifted charset or type
// string IS a gate regression), so they live in exactly one place — review
// findings M-001/M-005 flagged the copy-pasted per-file versions this file
// replaces.
import { McpToolError } from '../auth.js';

// Audit W-4: Walrus blob/quilt-patch ids are base64url; an id failing this is
// NEVER spliced into a URL (mirrors frontend/src/walrus/aggregator.ts).
export const BLOB_ID_RE = /^[A-Za-z0-9_-]+$/;
// Exact-package type gates ("::"-suffix matching would admit a foreign
// package's lookalike type).
export const MODEL_TYPE_SUFFIX = '::model3d::Model3D';
export const ENTITLEMENT_TYPE_SUFFIX = '::model3d::AccessEntitlement';

// Agent-native review: every tool description must be self-sufficient — an
// agent that never saw /llms.txt still needs the JWT acquisition path in-band.
export const AUTH_HINT =
  'Requires Authorization: Bearer <jwt> — mint one via the Sui-keypair flow: ' +
  'POST /api/auth/challenge {address}, sign the nonce as a personal message, ' +
  'POST /api/auth/verify {address, signature} → {token}.';

/** Fullnode response envelope the tools assert against (one audit point). */
export type ObjectResp = {
  data?: {
    type?: string;
    owner?: { AddressOwner?: string } | string | null;
    content?: {
      dataType?: string;
      type?: string;
      fields?: Record<string, unknown> | null;
    } | null;
  } | null;
};

/** The dual-content CallToolResult shape every tool returns (M-002). */
export function toolResult<T>(data: T): {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent: Record<string, unknown>;
} {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data) }],
    structuredContent: data as unknown as Record<string, unknown>,
  };
}

// R-001 (review): the fullnode client applies no default timeout anywhere in
// the stack, so an unresponsive fullnode would hold MCP requests open
// indefinitely. Promise.race bounds the RESPONSE (the underlying socket is
// not aborted — acceptable: the bound is what protects the request pool).
export const FULLNODE_TIMEOUT_MS = Number(process.env.MCP_FULLNODE_TIMEOUT_MS ?? '15000');

export async function withTimeout<T>(p: Promise<T>, what: string, ms = FULLNODE_TIMEOUT_MS): Promise<T> {
  let handle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    handle = setTimeout(
      () => reject(new McpToolError('upstream_error', `${what} timed out after ${ms}ms; retry shortly`)),
      ms,
    );
    if (typeof handle === 'object' && 'unref' in handle) handle.unref();
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(handle);
  }
}

/**
 * R-007 (review): the SDK converts ANY thrown error's message into the
 * isError text, so an unexpected TypeError would leak internals and break the
 * `code: detail` contract agents branch on. Wrap every tool handler: known
 * McpToolErrors pass through; anything else is logged server-side and
 * surfaced as a generic, structured upstream_error.
 */
export function guarded<A extends unknown[], R>(fn: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return async (...args: A): Promise<R> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof McpToolError) throw e;
      console.error('[mcp] unexpected tool error:', e);
      throw new McpToolError('upstream_error', 'internal error; retry shortly');
    }
  };
}

// Web deep-link helpers (D-110): tools return a `detailUrl` so a human reading
// an agent's output can click through to the tusk3d web detail page (3D
// preview, name, collection, buy flow). The origin is the FRONTEND host
// (tusk3d.store, D-105), NOT the request-derived backend origin — a backend
// link would 404 (no SPA there). Resolved at call time per the server.ts DI
// contract, never at module load; trailing slashes trimmed so `…store/` can't
// yield `//model/…`.
export const DEFAULT_WEB_ORIGIN = 'https://tusk3d.store';

export function resolveWebOrigin(deps: { webOrigin?: string }): string {
  return (deps.webOrigin ?? process.env.PUBLIC_WEB_ORIGIN ?? DEFAULT_WEB_ORIGIN).replace(/\/+$/, '');
}

export function modelDetailUrl(origin: string, modelId: string): string {
  return `${origin}/model/${modelId}`;
}

export function collectionDetailUrl(origin: string, collectionId: string): string {
  return `${origin}/collection/${collectionId}`;
}
