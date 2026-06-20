// get_preview tests (U4, R3, audit W-4, D-104) — transport-level via buildMcpRoute.
//
// W-4 is the load-bearing assertion: previewBlobIds are attacker-publishable
// on-chain data, so a malformed id must be SKIPPED — never spliced into a URL
// (path traversal / cache-key poisoning) and never an error that hides the
// valid siblings. URL composition must use the injected canonical base.
import { describe, it, expect, beforeEach } from 'vitest';
import type { McpSuiClient } from '../server.js';
import { resetMcpRateLimitForTest } from '../auth.js';
import { resolveAggregatorBase } from './getPreview.js';
import { callTool, errorText, stubJwt } from './testUtils.js';

const PKG = `0x${'9'.repeat(64)}`;
const MODEL_ID = `0x${'7'.repeat(64)}`;
const BASE = 'https://cdn.example.test';

function modelClient(previewBlobIds: unknown[]): McpSuiClient {
  return {
    async getObject() {
      return {
        data: {
          content: {
            dataType: 'moveObject',
            type: `${PKG}::model3d::Model3D`,
            fields: {
              creator: `0x${'c'.repeat(64)}`,
              name: 'Fox',
              glb_blob_id: 'cipherBlobBBB',
              is_encrypted: true,
              preview_blob_ids: previewBlobIds,
            },
          },
        },
      };
    },
  };
}

const deps = (previewBlobIds: unknown[]) => ({
  jwt: stubJwt,
  suiClient: modelClient(previewBlobIds),
  packageId: PKG,
  walrusAggregator: BASE,
});

beforeEach(() => {
  resetMcpRateLimitForTest();
});

describe('get_preview', () => {
  it('returns by-quilt-patch-id URLs on the injected canonical base, in order', async () => {
    const result = await callTool(deps(['previewBlob1', 'previewBlob2']), 'get_preview', {
      modelId: MODEL_ID,
    });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      modelId: MODEL_ID,
      previewUrls: [
        `${BASE}/v1/blobs/by-quilt-patch-id/previewBlob1`,
        `${BASE}/v1/blobs/by-quilt-patch-id/previewBlob2`,
      ],
    });
    expect(JSON.parse(errorText(result))).toEqual(result.structuredContent);
  });

  it('SKIPS malformed blob ids — never path-composes them (audit W-4)', async () => {
    const crafted = ['../../../etc/passwd', 'good_id-1', 'has%2Fencoded', 'a.b', ''];
    const result = await callTool(deps(crafted), 'get_preview', { modelId: MODEL_ID });

    const { previewUrls } = result.structuredContent as { previewUrls: string[] };
    expect(previewUrls).toEqual([`${BASE}/v1/blobs/by-quilt-patch-id/good_id-1`]);
    // No URL may carry any crafted fragment.
    for (const url of previewUrls) {
      expect(url).not.toContain('..');
      expect(url).not.toContain('%2F');
    }
  });

  it('a model with no previews → empty list (not an error)', async () => {
    const result = await callTool(deps([]), 'get_preview', { modelId: MODEL_ID });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ modelId: MODEL_ID, previewUrls: [] });
  });

  it('no bearer → anonymous read succeeds (public, D-111)', async () => {
    const result = await callTool(deps(['previewBlob1']), 'get_preview', { modelId: MODEL_ID }, null);
    expect(result.isError).toBeFalsy();
  });

  it('a PRESENT but invalid bearer → auth_invalid (not silently anonymous)', async () => {
    const result = await callTool(deps(['previewBlob1']), 'get_preview', { modelId: MODEL_ID }, 'garbage');
    expect(result.isError).toBe(true);
    expect(errorText(result).startsWith('auth_invalid:')).toBe(true);
  });
});

describe('resolveAggregatorBase', () => {
  it('prefers the injected dep and strips trailing slashes', () => {
    expect(resolveAggregatorBase({ walrusAggregator: 'https://x.test///' })).toBe('https://x.test');
  });

  it('falls back to the canonical testnet aggregator (frontend aggregator.ts parity)', () => {
    const prev = process.env.WALRUS_AGGREGATOR;
    delete process.env.WALRUS_AGGREGATOR;
    try {
      expect(resolveAggregatorBase({})).toBe('https://aggregator.walrus-testnet.walrus.space');
    } finally {
      if (prev !== undefined) process.env.WALRUS_AGGREGATOR = prev;
    }
  });
});
