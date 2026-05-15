import { useEffect, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  SuiClientProvider,
  WalletProvider as DappKitWalletProvider,
  createNetworkConfig,
  useSuiClientContext,
} from '@mysten/dapp-kit';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { registerEnokiWallets, isEnokiNetwork } from '@mysten/enoki';
import '@mysten/dapp-kit/dist/index.css';

const NETWORK = 'testnet' as const;

// dApp Kit 1.0 ships a single `@mysten/dapp-kit` package (no -core/-react
// split). createNetworkConfig types the SuiClientProvider against our
// declared networks for the rest of the app via useSuiClientContext.
// NetworkConfig in 1.0 extends SuiJsonRpcClientOptions so each entry must
// carry both `network` and `url` (the SDK split per D-019).
const { networkConfig } = createNetworkConfig({
  testnet: { network: 'testnet', url: getJsonRpcFullnodeUrl('testnet') },
});

type NetworkName = keyof typeof networkConfig;

// D-019: SuiClient is now SuiJsonRpcClient; the constructor takes the
// network in one place. SuiClientProvider builds a fresh client per network
// switch — we still own the construction so the walrus extension wiring
// stays consistent with frontend/src/walrus/walrusClient.ts.
function buildSuiClient(network: NetworkName) {
  return new SuiJsonRpcClient({
    network,
    url: getJsonRpcFullnodeUrl(network),
  });
}

interface EnokiRegistrationProps {
  enokiApiKey: string;
  googleClientId: string;
}

// registerEnokiWallets must run inside the SuiClientProvider tree because it
// reads the active network from useSuiClientContext to scope OAuth nonces.
// It returns an unregister callback for clean component unmount.
function EnokiRegistration({ enokiApiKey, googleClientId }: EnokiRegistrationProps) {
  const { client, network } = useSuiClientContext();

  useEffect(() => {
    if (!isEnokiNetwork(network)) return;
    const { unregister } = registerEnokiWallets({
      apiKey: enokiApiKey,
      providers: {
        google: { clientId: googleClientId },
      },
      client,
      network,
    });
    return unregister;
  }, [client, network, enokiApiKey, googleClientId]);

  return null;
}

const queryClient = new QueryClient();

export interface WalletProviderProps {
  children: ReactNode;
  // Enoki + Google config are env-driven; passing them in keeps the provider
  // testable. Real values are wired from import.meta.env.VITE_* in main.tsx.
  enokiApiKey?: string;
  googleClientId?: string;
}

export function WalletProvider({ children, enokiApiKey, googleClientId }: WalletProviderProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider
        networks={networkConfig}
        defaultNetwork={NETWORK}
        createClient={(name) => buildSuiClient(name as NetworkName)}
      >
        {/* slushWallet={...} enables the in-built Slush web-app wallet adapter
            without requiring the user to install the extension first. */}
        <DappKitWalletProvider
          autoConnect
          slushWallet={{ name: 'overflow2026' }}
        >
          {enokiApiKey && googleClientId ? (
            <EnokiRegistration enokiApiKey={enokiApiKey} googleClientId={googleClientId} />
          ) : null}
          {children}
        </DappKitWalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
