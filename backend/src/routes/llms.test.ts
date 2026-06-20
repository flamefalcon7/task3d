// /llms.txt discovery manifest tests (plan-2026-06-10-001 U8, R8, D-104).
//
// Drives the route through `buildApp` (the real mount path) — public GET, no
// auth, markdown body in the llmstxt.org shape pointing at /mcp.
import { describe, it, expect } from 'vitest';
import { buildApp } from '../app.js';

describe('GET /llms.txt', () => {
  it('returns 200 markdown with the H1, blockquote summary, and /mcp reference — no auth required', async () => {
    const app = buildApp();
    const res = await app.request('http://example.test/llms.txt');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/markdown');

    const body = await res.text();
    // llmstxt.org shape: H1 title, then a one-line blockquote summary.
    expect(body).toMatch(/^# Tusk3D\n/);
    expect(body).toMatch(/^> .*Sui-native/m);
    // MCP discovery: endpoint derived from the REQUEST origin (no hardcoded
    // deploy hostname), protocol pin, and the full tool surface.
    expect(body).toContain('http://example.test/mcp');
    expect(body).toContain('2025-11-25');
    for (const tool of [
      'search_models',
      'get_model',
      'get_license_terms',
      'get_preview',
      'list_fork_collections',
      'build_purchase_tx',
      'download_content',
    ]) {
      expect(body).toContain(tool);
    }
    // Docs section present.
    expect(body).toContain('## Docs');
  });

  it('derives the MCP URL from whatever origin served the request', async () => {
    const app = buildApp();
    const res = await app.request('https://api.tusk3d.example/llms.txt');
    const body = await res.text();
    expect(body).toContain('https://api.tusk3d.example/mcp');
    expect(body).not.toContain('http://example.test');
  });
});

// fix(review) AC-003 + R-005 — auth wording covers ALL tools; origin honors
// forwarded headers behind a TLS-terminating proxy.
describe('/llms.txt review fixes', () => {
  it('states the public-read / authed-content auth split (D-111)', async () => {
    const app = buildApp({});
    const res = await app.request('http://localhost:8787/llms.txt');
    const body = await res.text();
    expect(body).toContain('are PUBLIC — no auth');
    expect(body).toContain('download_content');
    expect(body).toContain('require `Authorization: Bearer');
  });

  it('derives the origin from x-forwarded-proto/host when present', async () => {
    const app = buildApp({});
    const res = await app.request('http://127.0.0.1:3001/llms.txt', {
      headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'api.tusk3d.store' },
    });
    const body = await res.text();
    expect(body).toContain('https://api.tusk3d.store/mcp');
    expect(body).not.toContain('127.0.0.1');
  });
});
