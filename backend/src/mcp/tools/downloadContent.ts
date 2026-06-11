// MCP download_content — entitlement-gated decrypt material (U6, R5/R6,
// KTD-2/KTD-6, D-104).
//
// Pattern (a), client-side decrypt: after verifying the caller holds the
// on-chain AccessEntitlement, return EXACTLY the material the agent needs to
// finish Seal decryption locally — `{ ciphertextUrl, sealedKey, sealApprove }`.
// The server does NOT call Seal key servers, does NOT fetch ciphertext, and
// does NOT AES-decrypt: the plaintext AES key never exists server-side (audit
// W-9 — "even our own server can't read your content"). Signing-side details
// live in scripts/agent-decrypt.ts (U7).
//
// Entitlement gate (KTD-6) — `capVerifier.ts` posture, FAIL-CLOSED:
// fullnode `getObject` BY-ID (D-043 — GraphQL indexer lag would false-negative
// right after the agent's purchase commits), assert
//   (1) exact type `${packageId}::model3d::AccessEntitlement`,
//   (2) `owner.AddressOwner == jwt sub`,
//   (3) entitlement `model_id == requested modelId`.
// Any read error or mismatch → ONE uniform `forbidden` (no which-check oracle;
// the entitlement is public chain data, but a uniform deny keeps the gate's
// fail-closed shape audit-simple).
//
// D-085 mirror (defense in depth): the model's `seal_id` must be exactly 32
// bytes before any material is emitted — the Move gate asserts the same
// (ESealIdWrongLength), so a mismatch here means foreign/corrupt content.
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { normalizeSuiAddress, toBase64 } from '@mysten/sui/utils';
import { McpToolError, requireAgentSub } from '../auth.js';
import type { BuildMcpServerDeps } from '../server.js';
import { MODEL_ID_SHAPE, resolveSuiDeps } from './getModel.js';
import { resolveAggregatorBase } from './getPreview.js';
import {
  AUTH_HINT,
  BLOB_ID_RE,
  ENTITLEMENT_TYPE_SUFFIX,
  MODEL_TYPE_SUFFIX,
  type ObjectResp,
  guarded,
  toolResult,
  withTimeout,
} from './common.js';

// D-085: fixed seal_id length the Move gate enforces (SEAL_ID_LEN).
const SEAL_ID_LEN = 32;

const ENTITLEMENT_ID_SHAPE = z
  .string()
  .regex(/^0x[0-9a-fA-F]{1,64}$/)
  .describe('Sui object id of YOUR soulbound AccessEntitlement for this model');

const OUTPUT_SHAPE = {
  ciphertextUrl: z
    .string()
    .describe('Walrus aggregator URL of the AES-256-GCM ciphertext GLB — fetch it yourself'),
  sealedKey: z
    .string()
    .describe(
      'base64 BCS EncryptedObject (the Seal-wrapped AES key). Decrypt locally via ' +
        'SealClient with your own keypair — the server never unwraps it.',
    ),
  sealApprove: z.object({
    modelId: z.string().describe('2nd object arg of the seal_approve_entitlement dry-run PTB'),
    entitlementId: z.string().describe('1st object arg of the seal_approve_entitlement dry-run PTB'),
  }),
  packageId: z
    .string()
    .describe('model3d package id — use for SessionKey.create and the seal_approve_entitlement PTB'),
};

// Factory, not a shared singleton (review R-008): Error instances are
// mutable; a shared one thrown across concurrent requests could alias state
// if anything downstream ever stamps metadata onto a caught error.
function deny(): McpToolError {
  return new McpToolError(
    'forbidden',
    'caller does not hold a matching AccessEntitlement for this model ' +
      '(entitlement type, owner, or model binding failed verification, or the read failed)',
  );
}

export function registerDownloadContent(server: McpServer, deps: BuildMcpServerDeps): void {
  server.registerTool(
    'download_content',
    {
      title: 'Download content',
      description:
        'Entitlement-gated decrypt material for an encrypted Tusk3D model you bought access ' +
        'to: the ciphertext URL, the Seal-wrapped AES key, and the seal_approve identifiers. ' +
        'Decryption happens on YOUR side with YOUR keypair (the server never touches the ' +
        'plaintext or the AES key). Next step: pipe this tool\'s JSON output to the repo helper ' +
        '`AGENT_SECRET_KEY=<bech32> pnpm --dir frontend exec tsx scripts/agent-decrypt.ts -` ' +
        '(SessionKey + seal_approve_entitlement dry-run + SealClient.decrypt + AES-256-GCM → samples/). ' +
        `${AUTH_HINT}`,
      inputSchema: { modelId: MODEL_ID_SHAPE, entitlementId: ENTITLEMENT_ID_SHAPE },
      outputSchema: OUTPUT_SHAPE,
    },
    guarded(async ({ modelId, entitlementId }, extra) => {
      const sub = await requireAgentSub(extra, { jwt: deps.jwt });
      const { client, packageId } = await resolveSuiDeps(deps);

      // --- (1) Entitlement gate, fail-closed (KTD-6) -----------------------
      let ent: ObjectResp;
      try {
        ent = (await withTimeout(
          client.getObject({
            id: entitlementId,
            options: { showContent: true, showOwner: true, showType: true },
          }),
          'entitlement read',
        )) as ObjectResp;
      } catch {
        throw deny();
      }
      const entData = ent.data;
      const entType = entData?.type ?? entData?.content?.type;
      if (!entData || entType !== `${packageId}${ENTITLEMENT_TYPE_SUFFIX}`) throw deny();
      const owner = entData.owner;
      const ownerAddr =
        owner && typeof owner === 'object' && 'AddressOwner' in owner ? owner.AddressOwner : null;
      if (!ownerAddr || normalizeSuiAddress(ownerAddr) !== sub) throw deny();
      const entFields = (entData.content?.fields ?? {}) as Record<string, unknown>;
      const boundModelId = String(entFields.model_id ?? '');
      if (!boundModelId || normalizeSuiAddress(boundModelId) !== normalizeSuiAddress(modelId)) {
        throw deny();
      }

      // --- (2) Read the model's decrypt material ---------------------------
      let model: ObjectResp;
      try {
        model = (await withTimeout(
          client.getObject({
            id: modelId,
            options: { showContent: true },
          }),
          'model read',
        )) as ObjectResp;
      } catch {
        throw new McpToolError('upstream_error', 'Sui fullnode read failed; retry shortly');
      }
      const content = model.data?.content;
      if (
        !content ||
        content.dataType !== 'moveObject' ||
        content.type !== `${packageId}${MODEL_TYPE_SUFFIX}`
      ) {
        throw new McpToolError('not_found', `Object ${modelId} is not a model3d::Model3D`);
      }
      const fields = (content.fields ?? {}) as Record<string, unknown>;
      if (fields.is_encrypted !== true) {
        throw new McpToolError(
          'not_encrypted',
          'model is not encrypted — nothing to decrypt; the public GLB blob id is on get_model',
        );
      }

      // D-085 mirror: seal_id is FIXED 32 bytes or the material is not emitted.
      const sealId = fields.seal_id;
      if (!Array.isArray(sealId) || sealId.length !== SEAL_ID_LEN) {
        throw new McpToolError(
          'content_invalid',
          `model seal_id length is ${Array.isArray(sealId) ? sealId.length : 'missing'}, ` +
            `expected ${SEAL_ID_LEN} (D-085 ESealIdWrongLength mirror)`,
        );
      }
      // `vector<u8>` arrives as an array of numbers (encryptedFork.ts shape).
      const sealedKeyRaw = fields.sealed_key;
      if (!Array.isArray(sealedKeyRaw) || sealedKeyRaw.length === 0) {
        throw new McpToolError('content_invalid', 'encrypted model carries no sealed_key');
      }
      const glbBlobId = String(fields.glb_blob_id ?? '');
      // Audit W-4: on-chain id an attacker can publish — never path-compose a
      // malformed one.
      if (!glbBlobId || !BLOB_ID_RE.test(glbBlobId)) {
        throw new McpToolError('content_invalid', 'model glb_blob_id fails the blob-id charset');
      }

      const result = {
        ciphertextUrl: `${resolveAggregatorBase(deps)}/v1/blobs/by-quilt-patch-id/${glbBlobId}`,
        sealedKey: toBase64(Uint8Array.from(sealedKeyRaw.map((n) => Number(n)))),
        sealApprove: { modelId, entitlementId },
        packageId,
      };
      return toolResult(result);
    }),
  );
}
