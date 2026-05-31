// plan-026 U5 — encrypted-base backend hardening: verify the submitting JWT's
// wallet actually OWNS the in-flight NftCollectionCreatorCap before the backend
// bakes the decrypted plaintext base. A wallet that merely scraped the
// ciphertext (without paying the step-1 fork fee) holds no cap and is rejected,
// so the JWT-authed bake can't be used to launder un-paid decrypts.
//
// The check: getObject(capId) and assert
//   (1) it is the model3d NftCollectionCreatorCap type,
//   (2) its address-owner == the JWT wallet address,
//   (3) its `collection_id` field == the request's collectionId.
// All three must hold (a valid cap for a DIFFERENT collection, or owned by a
// different wallet, fails). Read-only; injectable so tests stub the client.

import { getSuiClient, NETWORK } from './client.js';

export interface CapOwnership {
  capId: string;
  /** Expected owner (the JWT wallet, 0x-prefixed). */
  ownerAddress: string;
  /** Expected collection this cap must authorize. */
  collectionId: string;
}

export interface CapVerifier {
  /** Resolves true iff the cap is owned by ownerAddress AND binds collectionId. */
  verifyCapOwnership(args: CapOwnership): Promise<boolean>;
}

function normalizeAddress(a: string): string {
  return a.trim().toLowerCase();
}

const CAP_TYPE_SUFFIX = '::model3d::NftCollectionCreatorCap';

/**
 * Default verifier backed by the backend's shared JSON-RPC client. Fails CLOSED:
 * any read error, type mismatch, owner mismatch, or collection mismatch returns
 * false (deny), never throws into the request path.
 */
export function createCapVerifier(
  client = getSuiClient(),
  packageId = NETWORK.packageId,
): CapVerifier {
  const expectedType = `${packageId}${CAP_TYPE_SUFFIX}`;
  return {
    async verifyCapOwnership({ capId, ownerAddress, collectionId }): Promise<boolean> {
      try {
        const resp = await client.getObject({
          id: capId,
          options: { showContent: true, showOwner: true, showType: true },
        });
        const data = (resp as {
          data?: {
            type?: string;
            owner?: { AddressOwner?: string } | string | null;
            content?: { dataType?: string; fields?: Record<string, unknown> | null } | null;
          };
        }).data;
        if (!data) return false;

        // (1) type — the cap must be THIS package's NftCollectionCreatorCap.
        if (typeof data.type === 'string' && data.type !== expectedType) {
          return false;
        }

        // (2) owner — soulbound cap is address-owned; must match the JWT wallet.
        const owner = data.owner;
        const ownerAddr =
          owner && typeof owner === 'object' && 'AddressOwner' in owner
            ? owner.AddressOwner
            : null;
        if (!ownerAddr || normalizeAddress(ownerAddr) !== normalizeAddress(ownerAddress)) {
          return false;
        }

        // (3) collection binding — the cap's collection_id must equal the
        // collection being baked. NftCollectionCreatorCap holds `collection_id: ID`.
        const fields = (data.content?.fields ?? {}) as Record<string, unknown>;
        const capCollectionId = String(fields.collection_id ?? '');
        if (!capCollectionId || normalizeAddress(capCollectionId) !== normalizeAddress(collectionId)) {
          return false;
        }

        return true;
      } catch {
        return false;
      }
    },
  };
}
