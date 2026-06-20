// get_license_terms tests (U4, R3, D-104) — transport-level via buildMcpRoute.
//
// Contract: EXACTLY the five projection fields (an agent budget-checks against
// this shape; an accidental extra field is a contract change), accessFee as a
// MIST string (D-015), and the same auth/not_found posture as get_model.
import { describe, it, expect, beforeEach } from 'vitest';
import type { McpSuiClient } from '../server.js';
import { resetMcpRateLimitForTest } from '../auth.js';
import { callTool, errorText, stubJwt } from './testUtils.js';

const PKG = `0x${'9'.repeat(64)}`;
const MODEL_ID = `0x${'7'.repeat(64)}`;

function modelClient(): McpSuiClient {
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
              license: {
                type: `${PKG}::model3d::LicenseTerms`,
                fields: {
                  derivative_mint_fee: '7000000',
                  access_fee: '2000000',
                  derivative_royalty_bps: 500,
                  policy: 1,
                },
              },
              is_encrypted: true,
              preview_blob_ids: ['previewBlob1'],
            },
          },
        },
      };
    },
  };
}

const deps = () => ({ jwt: stubJwt, suiClient: modelClient(), packageId: PKG });

beforeEach(() => {
  resetMcpRateLimitForTest();
});

describe('get_license_terms', () => {
  it('returns EXACTLY the five license projection fields, accessFee as MIST string', async () => {
    const result = await callTool(deps(), 'get_license_terms', { modelId: MODEL_ID });

    expect(result.isError).toBeFalsy();
    // toEqual on the full object → no extraneous fields can sneak in.
    expect(result.structuredContent).toEqual({
      accessFee: '2000000',
      derivativeMintFee: '7000000',
      derivativeRoyaltyBps: 500,
      policy: 1,
      isEncrypted: true,
    });
    expect(Object.keys(result.structuredContent!)).toHaveLength(5);
    expect(typeof (result.structuredContent as { accessFee: unknown }).accessFee).toBe('string');
    expect(JSON.parse(errorText(result))).toEqual(result.structuredContent);
  });

  it('unknown model → not_found tool error', async () => {
    const empty: McpSuiClient = { async getObject() { return {}; } };
    const result = await callTool(
      { jwt: stubJwt, suiClient: empty, packageId: PKG },
      'get_license_terms',
      { modelId: MODEL_ID },
    );
    expect(result.isError).toBe(true);
    expect(errorText(result).startsWith('not_found:')).toBe(true);
  });

  it('no bearer → anonymous read succeeds (public, D-111)', async () => {
    const result = await callTool(deps(), 'get_license_terms', { modelId: MODEL_ID }, null);
    expect(result.isError).toBeFalsy();
  });

  it('a PRESENT but invalid bearer → auth_invalid (not silently anonymous)', async () => {
    const result = await callTool(deps(), 'get_license_terms', { modelId: MODEL_ID }, 'garbage');
    expect(result.isError).toBe(true);
    expect(errorText(result).startsWith('auth_invalid:')).toBe(true);
  });
});
