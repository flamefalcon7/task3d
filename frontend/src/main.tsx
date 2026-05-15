import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { WalletProvider } from './auth/WalletProvider'

// Enoki + Google OAuth are env-driven so the provider boots gracefully when
// keys aren't configured (e.g. local dev, CI). The SignIn UI surfaces a
// "no wallets registered" hint in that mode.
const enokiApiKey = import.meta.env.VITE_ENOKI_API_KEY as string | undefined;
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WalletProvider enokiApiKey={enokiApiKey} googleClientId={googleClientId}>
      <App />
    </WalletProvider>
  </StrictMode>,
)
