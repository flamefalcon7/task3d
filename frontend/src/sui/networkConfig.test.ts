// plan-007 U5 — R4: parity gate between frontend's TESTNET wrapper and the
// canonical contracts/networks/testnet.json artifact.
//
// Why this exists: `networkConfig.ts` duplicates every value from the JSON
// because the frontend's tsconfig.app.json scopes `include: ["src"]`. If
// the JSON updates (re-deploy, kiosk_apps_package_id rotation, policy
// rebake) and the wrapper doesn't, every kiosk PTB silently targets stale
// objects. This test fails LOUDLY on drift.
//
// Vitest uses Vite's resolver, which bypasses tsconfig `include`, so the
// relative JSON import below resolves at test time. If the import ever
// stops resolving, fall back to a vitest.config.ts `resolve.alias` entry
// pointing to the contracts/networks/ directory.

import { describe, it, expect } from 'vitest';
import testnetJson from '../../../contracts/networks/testnet.json';
import { TESTNET } from './networkConfig';

describe('networkConfig.ts ↔ contracts/networks/testnet.json parity (R4 / C-005)', () => {
  it('every TESTNET field mirrors the canonical JSON', () => {
    expect(TESTNET.network).toBe(testnetJson.network);
    expect(TESTNET.chainId).toBe(testnetJson.chain_id);
    expect(TESTNET.model3dPackageId).toBe(testnetJson.model3d_package_id);
    expect(TESTNET.publisherId).toBe(testnetJson.publisher_id);
    expect(TESTNET.transferPolicyId).toBe(testnetJson.transfer_policy_id);
    expect(TESTNET.transferPolicyCapId).toBe(testnetJson.transfer_policy_cap_id);
    expect(TESTNET.sealIdRegistryId).toBe(testnetJson.seal_id_registry_id);
    expect(TESTNET.deployerAddress).toBe(testnetJson.deployer_address);
    expect(TESTNET.kioskAppsPackageId).toBe(testnetJson.kiosk_apps_package_id);
  });
});
