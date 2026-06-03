// Throwaway acceptance check for the D-083 degradation layer (plan-002).
// Drives the real app in-process (real Tripo + Gemini clients from env, minted JWT,
// no wallet/browser) and forces the three manual-acceptance states by toggling the
// per-request env knobs. Run:
//   pnpm --dir backend exec tsx --env-file=.env scripts/verify-degradation.ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Fresh quota DB so prior runs don't taint counters (set BEFORE any getQuotaStore()).
process.env.TUSK_DB_PATH = join(mkdtempSync(join(tmpdir(), 'tusk-verify-')), 'quota.db');

const { buildApp } = await import('../src/app.js');
const { createJwtSigner } = await import('../src/lib/jwt.js');
const { TripoClient } = await import('../src/lib/tripo-client.js');
const { resetCaptionClientForTest } = await import('../src/lib/caption-client.js');

const secret = process.env.JWT_SECRET;
if (!secret) throw new Error('JWT_SECRET not set (run with --env-file=.env)');

const ADDR = '0x' + '7'.repeat(64);
const pass = (cond: boolean) => (cond ? '✅ PASS' : '❌ FAIL');

async function main() {
  const jwt = createJwtSigner(secret);
  const token = await jwt.signSession(ADDR);
  const tripoKey = process.env.TRIPO_API_KEY;
  const balanceProvider = tripoKey ? new TripoClient(tripoKey) : undefined;
  const app = buildApp({ jwt, balanceProvider });

  const authdGet = (path: string) =>
    app.request(path, { method: 'GET', headers: { Authorization: `Bearer ${token}` } });
  const authdPost = (path: string, body: unknown) =>
    app.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });

  // ── ① R1: pre-flight blocks before pay when credit < threshold ───────────────
  console.log('\n=== ① Pre-flight block (R1) — threshold forced to 999999 ===');
  process.env.TRIPO_PREFLIGHT_MIN_CREDITS = '999999';
  const pf = await authdGet('/api/generate/preflight');
  const pfJson = (await pf.json()) as { available?: boolean; reason?: string };
  console.log('   GET /api/generate/preflight →', pf.status, JSON.stringify(pfJson));
  console.log('  ', pass(pf.status === 200 && pfJson.available === false), '— available:false (payment would be blocked, no charge); no balance number leaked:', !JSON.stringify(pfJson).match(/\d{3,}/));
  delete process.env.TRIPO_PREFLIGHT_MIN_CREDITS;

  // ── ② R6/R10: Gemini quota visible (not hidden) ──────────────────────────────
  console.log('\n=== ② Gemini quota visible (R6/R10) — per-address cap forced to 1 (copilot) ===');
  process.env.GEMINI_PER_ADDRESS_DAILY = '1';
  const turn1 = await authdPost('/api/copilot/turn', { messages: [{ role: 'user', content: 'a treasure chest' }] });
  const j1 = (await turn1.json()) as Record<string, unknown>;
  console.log('   call#1 →', turn1.status, j1.available ? `available (kind=${(j1.result as { kind?: string })?.kind ?? '?'})` : JSON.stringify(j1));
  const turn2 = await authdPost('/api/copilot/turn', { messages: [{ role: 'user', content: 'a treasure chest' }] });
  const j2 = (await turn2.json()) as { available?: boolean; error?: string; retryAfterMs?: number };
  console.log('   call#2 →', turn2.status, JSON.stringify(j2));
  console.log('  ', pass(j2.available === true && j2.error === 'quota_exhausted' && (j2.retryAfterMs ?? 0) > 0), '— 2nd call: available:true + quota_exhausted + retryAfterMs (visible, NOT hidden)');
  delete process.env.GEMINI_PER_ADDRESS_DAILY;

  // ── ③ AE7: keyless → the ONLY hide path ──────────────────────────────────────
  console.log('\n=== ③ Keyless hide (AE7) — GOOGLE key removed for caption ===');
  delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  resetCaptionClientForTest(); // rebuild the singleton INERT
  const cap = await authdPost('/api/caption', { frames: [{ base64: 'AAAA', mediaType: 'image/webp' }] });
  const jc = (await cap.json()) as { available?: boolean };
  console.log('   POST /api/caption (no key) →', cap.status, JSON.stringify(jc), 'x-caption-degraded:', cap.headers.get('x-caption-degraded'));
  console.log('  ', pass(cap.status === 200 && jc.available === false), '— available:false (frontend hides the button) — the only sanctioned hide');

  console.log('\nDone. (① makes a real Tripo balance call; ② makes one real Gemini call.)');
}

void main();
