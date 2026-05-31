import { SealClient, type KeyServerConfig } from '@mysten/seal';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';

// plan-026 U1 — Seal client construction. Mirrors the construction style of
// frontend/src/walrus/walrusClient.ts: a network-keyed factory returning a
// pre-configured client. SealClient takes a `SealCompatibleClient` (any client
// exposing `.core: CoreClient`); SuiJsonRpcClient satisfies that (verified
// against @mysten/sui@2.16.2). We DON'T reuse the walrus-extended client here
// to keep Seal infra independent of the Walrus WASM bundle — Seal only needs
// the core RPC surface for the key-server dry-run.

export type SealNetwork = 'testnet';

// Mysten Labs independent ("Open" mode) testnet key servers. Sourced from the
// Seal verified-key-servers list / 2026-05 decentralized-key-server
// announcement: each is a standalone server contributing weight toward the
// decryption threshold.
//   mysten-testnet-1 → https://seal-key-server-testnet-1.mystenlabs.com
//   mysten-testnet-2 → https://seal-key-server-testnet-2.mystenlabs.com
// Threshold 2 (see SEAL_THRESHOLD) → 2-of-2 here. Add a third config entry
// (weight 1) to move to 2-of-3 (per plan: "structured so a 3rd can be added").
// NB: these are TESTNET object IDs; mainnet (by 8/27) needs a contracted
// provider and its own IDs (deferred — see plan Scope Boundaries).
const MYSTEN_TESTNET_KEY_SERVERS: KeyServerConfig[] = [
  {
    // mysten-testnet-1 (Open mode)
    objectId:
      '0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75',
    weight: 1,
  },
  {
    // mysten-testnet-2 (Open mode)
    objectId:
      '0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8',
    weight: 1,
  },
];

const KEY_SERVERS: Record<SealNetwork, KeyServerConfig[]> = {
  testnet: MYSTEN_TESTNET_KEY_SERVERS,
};

// Decryption threshold: how much aggregate key-server weight must respond for
// a successful decrypt. 2 against the two weight-1 Mysten servers = 2-of-2,
// and becomes 2-of-3 (robust to one outage) once a third weight-1 server is
// added. Must match the threshold passed at encrypt time (see envelope.ts).
export const SEAL_THRESHOLD = 2;

// SessionKey time-to-live for the forge/decrypt flow. The fork decrypt is a
// short interactive burst (cap mint → session sign → decrypt → bake → mint),
// so a 3-minute window covers it while keeping the signed authorization
// short-lived. SessionKey.create takes this in MINUTES; sessionKey.ts also
// uses the ms form for cache-expiry math. Tune against real decrypt latency
// (plan: "Deferred to Implementation — final SessionKey TTL value").
export const SESSION_KEY_TTL_MIN = 3;
export const SESSION_KEY_TTL_MS = SESSION_KEY_TTL_MIN * 60 * 1000;

// Build a SealClient for the given network. `suiClient` is the SealCompatible
// client used for the on-chain key-server lookups + seal_approve dry-run.
// Defaulted here so callers (and tests) can omit it; pass your app's shared
// client in production to reuse its config/transport.
export function getSealClient(
  network: SealNetwork = 'testnet',
  suiClient = new SuiJsonRpcClient({
    network,
    url: getJsonRpcFullnodeUrl(network),
  }),
): SealClient {
  return new SealClient({
    suiClient,
    serverConfigs: KEY_SERVERS[network],
    // Skip on-startup key-server authenticity verification: these are the
    // known Mysten Open-mode object IDs hardcoded above, and verification adds
    // a network round-trip at construction. Flip to true if the server set
    // ever becomes caller-supplied.
    verifyKeyServers: false,
  });
}

export function getSealKeyServerConfigs(
  network: SealNetwork = 'testnet',
): KeyServerConfig[] {
  // Return a copy so callers can't mutate the shared config array.
  return KEY_SERVERS[network].map((c) => ({ ...c }));
}

export type SealEnhancedClient = SealClient;
