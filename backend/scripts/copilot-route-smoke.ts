// Throwaway live smoke for the FULL /api/copilot/turn HTTP path (D-081).
// Mints a JWT (HS256, JWT_SECRET), builds the real app (real copilot + memwal
// clients from env), and drives the route end-to-end — the actual deployment
// chain (HTTP → JWT bind → server recall → Gemini), no wallet/browser needed.
// Run: pnpm --dir backend exec tsx --env-file=.env scripts/copilot-route-smoke.ts
import { buildApp } from '../src/app.js';
import { createJwtSigner } from '../src/lib/jwt.js';

const secret = process.env.JWT_SECRET;
if (!secret) throw new Error('JWT_SECRET not set (run with --env-file=.env)');

const ADDR = '0x' + '7'.repeat(64);

async function main() {
  const jwt = createJwtSigner(secret);
  const app = buildApp({ jwt });
  const token = await jwt.signSession(ADDR);

  const call = async (body: unknown) => {
    const res = await app.request('/api/copilot/turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    return { status: res.status, degraded: res.headers.get('x-copilot-degraded'), json: await res.json() };
  };

  console.log('1) question turn:', JSON.stringify(await call({ messages: [{ role: 'user', content: 'a treasure chest' }] }), null, 2));
  console.log(
    '\n2) forced synthesis:',
    JSON.stringify(await call({ messages: [{ role: 'user', content: 'a treasure chest' }], forceSynthesize: true }), null, 2),
  );
  console.log('\n3) bad auth (no token expected 401):');
  const noAuth = await app.request('/api/copilot/turn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'x' }] }),
  });
  console.log('   status:', noAuth.status);
}

void main();
