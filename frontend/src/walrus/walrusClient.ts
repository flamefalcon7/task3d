import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { walrus } from '@mysten/walrus';
// why: Vite-only `?url` import resolves the WASM file path at build time so the
// runtime can fetch it; spec.md §2.5 + §2.11 — first WASM bundle attempt fails
// without this exact import shape.
import walrusWasmUrl from '@mysten/walrus-wasm/web/walrus_wasm_bg.wasm?url';

export type WalrusNetwork = 'testnet';

const UPLOAD_RELAY_HOSTS: Record<WalrusNetwork, string> = {
  testnet: 'https://upload-relay.testnet.walrus.space',
};

// why: spec.md §2.5 shows `new SuiClient(...).$extend(walrus({ network, ... }))`,
// but @mysten/sui@2.16.2 (D-008) replaced the legacy `SuiClient` with
// `SuiJsonRpcClient`/`SuiGrpcClient` and the walrus extension now reads
// `client.network` from the Sui client config rather than its own options.
export function getWalrusClient(network: WalrusNetwork = 'testnet') {
  return new SuiJsonRpcClient({
    network,
    url: getJsonRpcFullnodeUrl(network),
  }).$extend(
    walrus({
      wasmUrl: walrusWasmUrl,
      // Raise the SDK's per-request timeout from its 30s default to 60s. A
      // single-quilt launch (D-101) does one larger relay write + storage-node
      // reads; 30s was occasionally too tight on slow testnet moments, surfacing
      // as a DOMException "signal timed out". Paired with a retry on the
      // idempotent relay-upload step (useWalrusUpload.ts / retryAsync.ts).
      storageNodeClientOptions: { timeout: 60_000 },
      uploadRelay: {
        host: UPLOAD_RELAY_HOSTS[network],
        sendTip: { max: 1_000 },
        timeout: 60_000,
      },
    }),
  );
}

export type WalrusEnhancedClient = ReturnType<typeof getWalrusClient>;
