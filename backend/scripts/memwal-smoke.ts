/**
 * THROWAWAY live smoke for the MemWal /api/memory routes (D-080).
 * Mints JWTs directly (HS256, JWT_SECRET) for two distinct addresses and drives
 * the real backend → real testnet relayer. Proves end-to-end, no wallet:
 *   - dual-write (personal + global), policy gate (RESTRICTED → personal only)
 *   - codec round-trip (prompt + modelId back out)
 *   - global exclude-self + RESTRICTED never surfaces in global
 *
 * Run:  pnpm --dir backend exec tsx --env-file=.env scripts/memwal-smoke.ts
 */
import { createJwtSigner } from '../src/lib/jwt.js';

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:3001';
const secret = process.env.JWT_SECRET;
if (!secret) throw new Error('JWT_SECRET not set (run with --env-file=.env)');
const signer = createJwtSigner(secret);

const A = '0x' + 'a'.repeat(64); // creator A
const B = '0x' + 'b'.repeat(64); // creator B (a different author)
const mid = (h: string) => '0x' + h.repeat(64).slice(0, 64);

async function post(path: string, token: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  const tokenA = await signer.signSession(A);
  const tokenB = await signer.signSession(B);
  console.log('minted JWTs for A and B\n');

  console.log('--- remember (A: 2 public + 1 RESTRICTED; B: 1 public) ---');
  console.log('A pub  ', await post('/api/memory/remember', tokenA, { prompt: 'a low-poly red sports car', modelId: mid('1'), policy: 2 }));
  console.log('A pub2 ', await post('/api/memory/remember', tokenA, { prompt: 'a chunky off-road truck', modelId: mid('2'), policy: 1 }));
  console.log('A restr', await post('/api/memory/remember', tokenA, { prompt: 'a secret prototype weapon', modelId: mid('3'), policy: 0 }));
  console.log('B pub  ', await post('/api/memory/remember', tokenB, { prompt: 'a fast aerodynamic race car', modelId: mid('4'), policy: 2 }));

  const waitS = Number(process.env.SMOKE_WAIT_S ?? '20');
  console.log(`\nwaiting ${waitS}s for the relayer to embed + index…`);
  await new Promise((r) => setTimeout(r, waitS * 1000));

  console.log('\n--- recall A personal "fast car" (should include A\'s own, incl RESTRICTED) ---');
  const personal = await post('/api/memory/recall', tokenA, { query: 'fast car', limit: 10 });
  console.log('status', personal.status);
  for (const r of (personal.json as { results: { prompt: string; modelId: string | null; distance: number }[] }).results ?? [])
    console.log(`  ${r.distance.toFixed(3)}  ${r.prompt}  → ${r.modelId?.slice(0, 8)}`);

  console.log('\n--- recall A global "fast car" (should show B\'s race car; NOT A\'s own; NOT RESTRICTED) ---');
  const global = await post('/api/memory/recall', tokenA, { query: 'fast car', scope: 'global', limit: 10 });
  console.log('status', global.status);
  for (const r of (global.json as { results: { prompt: string; modelId: string | null; distance: number; creator?: string }[] }).results ?? [])
    console.log(`  ${r.distance.toFixed(3)}  ${r.prompt}  → ${r.modelId?.slice(0, 8)}  by ${r.creator?.slice(0, 8)}`);

  console.log('\n--- unauth recall (no token) → expect 401 ---');
  const noauth = await fetch(`${BASE}/api/memory/recall`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'x' }),
  });
  console.log('status', noauth.status);
}

main().catch((e) => { console.error(e); process.exit(1); });
