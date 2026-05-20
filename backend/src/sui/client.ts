// plan-008 U7 — backend's on-chain read client.
//
// D-019: JSON-RPC client (`SuiJsonRpcClient`) is used here; `@mysten/sui/grpc`
// is the long-term target (JSON-RPC deprecated July 2026) but `queryEvents` +
// `getDynamicFieldObject` are the JSON-RPC surface this indexer needs. gRPC
// migration is post-submission.
//
// Single source of truth: the deployed package ID is read from
// `contracts/networks/testnet.json` at load (Node backend → no second mirror
// to drift, unlike the browser's networkConfig.ts which can't import outside
// src). Resolves the same in `src/` (tsx dev) and `dist/` (built) — both are
// three levels under the repo root.

import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const TESTNET_JSON_PATH = resolve(HERE, '../../../contracts/networks/testnet.json');

export interface NetworkConfig {
  network: 'testnet';
  packageId: string;
}

function loadNetworkConfig(): NetworkConfig {
  const raw = readFileSync(TESTNET_JSON_PATH, 'utf-8');
  const json = JSON.parse(raw) as { model3d_package_id?: string };
  const packageId = json.model3d_package_id;
  if (!packageId || !/^0x[0-9a-fA-F]{64}$/.test(packageId)) {
    throw new Error(`Invalid model3d_package_id in ${TESTNET_JSON_PATH}`);
  }
  return { network: 'testnet', packageId };
}

export const NETWORK = loadNetworkConfig();

// Override with SUI_RPC_URL (comma-separated) in env; otherwise public testnet
// fullnode + one fallback (mirrors frontend TESTNET_RPC_ENDPOINTS).
export const RPC_ENDPOINTS: readonly string[] =
  process.env.SUI_RPC_URL?.split(',').map((s) => s.trim()).filter(Boolean) ?? [
    'https://fullnode.testnet.sui.io:443',
    'https://sui-testnet.public.blastapi.io',
  ];

/** Fully-qualified event type the indexer subscribes to. */
export function integrationRegisteredEventType(packageId = NETWORK.packageId): string {
  return `${packageId}::model3d::IntegrationRegistered`;
}

let cached: SuiJsonRpcClient | null = null;

/** Lazily-constructed shared client against the primary RPC endpoint. */
export function getSuiClient(): SuiJsonRpcClient {
  if (!cached) {
    cached = new SuiJsonRpcClient({ url: RPC_ENDPOINTS[0]!, network: 'testnet' });
  }
  return cached;
}
