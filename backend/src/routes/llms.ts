// /llms.txt — agent/crawler discovery manifest (plan-2026-06-10-001 U8, R8, D-104).
//
// Static markdown per the llmstxt.org shape (H1 + blockquote summary + H2 link
// sections) advertising the /mcp endpoint so LLM crawlers and agents can find
// the connection without bespoke docs. Public, unauthenticated GET — discovery
// metadata only; the cost-bearing surface stays behind the MCP bearer-JWT gate
// (U3). `llms-full.txt` is explicitly deferred.
//
// The MCP URL is derived from the request origin (no precedent for a deploy
// hostname in the backend — grep found none), so the manifest is correct on
// localhost, a tunnel, or the deployed host alike without configuration.
import { Hono } from 'hono';

const REPO_URL = 'https://github.com/flamefalcon7/task3d';

/** Exported for tests; `origin` is e.g. `http://localhost:8787`. */
export function renderLlmsTxt(origin: string): string {
  return `# Tusk3D

> Tusk3D is a Sui-native rights layer for low-poly 3D game assets: creators generate (text prompt) or upload a GLB, publish it to Walrus decentralized storage under on-chain Move license terms, buyers pay once for a soulbound access entitlement that unlocks viewing, Seal decryption, and forking the base into tradeable NFT collections.

## MCP

- [MCP endpoint](${origin}/mcp): Streamable HTTP, protocol \`2025-11-25\`
- Auth: cost-bearing tools require \`Authorization: Bearer <jwt>\` minted by the Sui-keypair challenge flow at \`${origin}/api/auth\` (challenge → sign personal message → verify → JWT)
- Tools: search_models, get_model, get_license_terms, get_preview, build_purchase_tx, download_content

## Docs

- [README](${REPO_URL}#readme): product overview, architecture, demo arc
- [Project spec](${REPO_URL}/blob/main/docs/spec.md): full specification (data model, contract interface)
`;
}

export function buildLlmsRoute() {
  const route = new Hono();
  route.get('/', (c) => {
    const origin = new URL(c.req.url).origin;
    return c.text(renderLlmsTxt(origin), 200, { 'Content-Type': 'text/markdown; charset=utf-8' });
  });
  return route;
}
