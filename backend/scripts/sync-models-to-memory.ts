// Sync published Model3D objects → MemWal memory (plan-002 follow-up).
//
// Unlike seed-memory.ts (synthetic demo records), this reads the REAL on-chain
// catalog from Sui GraphQL and writes one memory record per model through the
// SAME `memoryWrites` helper the live /remember route uses — so the records are
// byte-identical and the /launch base finder (+ /create recall) can rank against
// real, resolvable modelIds.
//
// Text per model: the Tripo creation prompt when present (params_json.prompt),
// else the model name (uploads carry no prompt). Policy gates the global
// dual-write exactly as on publish (RESTRICTED stays personal-only).
//
// Run (env MEMWAL_* must be set — see backend/.env):
//   pnpm --dir backend exec tsx scripts/sync-models-to-memory.ts
//   pnpm --dir backend exec tsx scripts/sync-models-to-memory.ts --dry   # print, don't write
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { getMemwalClient } from '../src/lib/memwal-client.js';
import { memoryWrites } from '../src/routes/memory.js';

const SUI_GRAPHQL_ENDPOINT = 'https://graphql.testnet.sui.io/graphql';
const POLICY_RESTRICTED = 0;

const here = dirname(fileURLToPath(import.meta.url));
const net = JSON.parse(readFileSync(resolve(here, '../../contracts/networks/testnet.json'), 'utf8'));
const PACKAGE_ID: string = net.model3d_package_id;

interface ModelRow {
  modelId: string;
  creator: string;
  name: string;
  shape: string;
  policy: number;
  prompt: string | null;
}

async function fetchModels(): Promise<ModelRow[]> {
  const res = await fetch(SUI_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `query($type:String!){objects(filter:{type:$type}){nodes{address asMoveObject{contents{json}}}}}`,
      variables: { type: `${PACKAGE_ID}::model3d::Model3D` },
    }),
  });
  const body = (await res.json()) as {
    data?: { objects?: { nodes?: Array<{ address?: string; asMoveObject?: { contents?: { json?: Record<string, unknown> } } }> } };
  };
  const nodes = body.data?.objects?.nodes ?? [];
  const rows: ModelRow[] = [];
  for (const n of nodes) {
    const j = (n.asMoveObject?.contents?.json ?? {}) as Record<string, unknown>;
    const modelId = n.address;
    const creator = j.creator as string | undefined;
    if (!modelId || !creator) continue;
    const license = (j.license ?? {}) as { policy?: number };
    let prompt: string | null = null;
    try {
      prompt = (JSON.parse(String(j.params_json ?? '{}')) as { prompt?: string }).prompt ?? null;
    } catch {
      prompt = null;
    }
    rows.push({
      modelId,
      creator,
      name: String(j.name ?? ''),
      shape: String(j.shape_type ?? ''),
      policy: typeof license.policy === 'number' ? license.policy : 2,
      prompt,
    });
  }
  return rows;
}

/** The text we semantically index for a model: prompt > name. */
function memoryText(m: ModelRow): string {
  const t = (m.prompt ?? m.name ?? '').trim();
  return t || m.name || '(unnamed model)';
}

async function main() {
  const dry = process.argv.includes('--dry');
  const client = getMemwalClient();
  if (!dry && !client.configured) {
    console.error('MEMWAL_* env not set — cannot sync. See backend/.env / CLAUDE.md "Secrets & .env files".');
    process.exit(1);
  }

  console.log(`[sync] package ${PACKAGE_ID.slice(0, 12)}… | relayer write ${dry ? '(DRY RUN)' : 'LIVE'}`);
  const models = await fetchModels();
  console.log(`[sync] ${models.length} published Model3D objects found\n`);

  let writeCount = 0;
  for (const m of models) {
    const text = memoryText(m);
    const ns = normalizeSuiAddress(m.creator);
    const writes = memoryWrites(ns, text, m.modelId, m.policy);
    const scopes = writes.map((w) => (w.namespace === 'global' ? 'global' : 'personal')).join('+');
    const gated = m.policy === POLICY_RESTRICTED ? ' (RESTRICTED → personal-only)' : '';
    console.log(`  ${m.name} [${m.shape}, policy ${m.policy}] ${m.modelId.slice(0, 12)}…`);
    console.log(`    text: "${text.slice(0, 70)}${text.length > 70 ? '…' : ''}"`);
    console.log(`    → ${writes.length} write(s): ${scopes}${gated}`);
    if (!dry) {
      for (const w of writes) await client.remember(w.namespace, w.text);
    }
    writeCount += writes.length;
  }

  console.log(`\n[sync] ${dry ? 'would issue' : 'issued'} ${writeCount} write(s) across ${models.length} models.`);
  if (!dry) console.log('[sync] note: relayer indexing takes a few seconds before recall surfaces them.');
}

main().catch((e) => {
  console.error('[sync] failed:', e);
  process.exit(1);
});
