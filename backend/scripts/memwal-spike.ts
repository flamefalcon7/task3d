/**
 * THROWAWAY U1 spike (plan-001 / D-080) — verify MemWal is viable on testnet
 * before we build the wrapper. NOT part of the shipped feature; delete after.
 *
 * Proves, against the live testnet relayer:
 *   1. SDK ESM import + construct in plain Node (NodeNext backend) — no wasm.
 *   2. Relayer version-compat gate passes for SDK 0.0.6.
 *   3. Account provisioning path (generateDelegateKey → createAccount → addDelegateKey)
 *      works server-side with a bech32 suiPrivateKey (the delegate key the wrapper bakes).
 *   4. remember → recall round-trips; recall reads a SERVER-SIDE index (SDK holds no local store).
 *   5. A shared `global` namespace supports independent multi-record ranked recall (gates U8).
 *
 * Run:
 *   OWNER_KEY="$(grep '^VITE_TEST_WALLET_KEY=' ../frontend/.env.local | cut -d= -f2-)" \
 *     pnpm --dir backend exec tsx scripts/memwal-spike.ts
 */
import { MemWal } from '@mysten-incubation/memwal';
import { MEMWAL_TYPESCRIPT_COMPATIBILITY_VERSION, SUPPORTED_RELAYER_API_MAJOR } from '@mysten-incubation/memwal';
import { createAccount, addDelegateKey, generateDelegateKey } from '@mysten-incubation/memwal/account';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// @mysten/sui v2.6.0+ removed the auto-created SuiClient in account.js → must
// pass one explicitly. Backend already standardizes on SuiJsonRpcClient.
const suiClient = new SuiJsonRpcClient({ url: 'https://fullnode.testnet.sui.io:443', network: 'testnet' });

// Testnet contracts (MystenLabs/MemWal apps/app/.env.example, dev branch).
const PACKAGE_ID = '0xcf6ad755a1cdff7217865c796778fabe5aa399cb0cf2eba986f4b582047229c6';
const REGISTRY_ID = '0xe80f2feec1c139616a86c9f71210152e2a7ca552b20841f2e192f99f75864437';
// Example app pairs testnet contracts with the dev relayer; staging also live.
const SERVER_URL = process.env.MEMWAL_SERVER_URL ?? 'https://relayer.dev.memwal.ai';

const OWNER_KEY = process.env.OWNER_KEY;
if (!OWNER_KEY?.startsWith('suiprivkey1')) {
  console.error('FATAL: OWNER_KEY must be a bech32 suiprivkey1... testnet key');
  process.exit(1);
}

const log = (...a: unknown[]) => console.log(...a);
const REMEMBER_OPTS = { pollIntervalMs: 1500, timeoutMs: 90_000 };

async function main() {
  log('=== MemWal U1 spike ===');
  log('SDK compat const:', MEMWAL_TYPESCRIPT_COMPATIBILITY_VERSION, '| supported relayer API major:', SUPPORTED_RELAYER_API_MAJOR);
  log('relayer:', SERVER_URL, '| package:', PACKAGE_ID.slice(0, 10) + '…');

  // 1. Delegate key (no gas; just an ed25519 keypair the SDK signs with).
  const delegate = await generateDelegateKey();
  log('\n[1] generateDelegateKey OK — delegate suiAddress:', delegate.suiAddress);

  // 2. createAccount (owner tx, costs gas). One account per address — may already exist.
  let accountId: string;
  try {
    const acct = await createAccount({
      packageId: PACKAGE_ID,
      registryId: REGISTRY_ID,
      suiPrivateKey: OWNER_KEY,
      suiNetwork: 'testnet',
      suiClient,
    });
    accountId = acct.accountId;
    log('[2] createAccount OK — accountId:', accountId, '| owner:', acct.owner, '| digest:', acct.digest);
  } catch (e) {
    log('[2] createAccount FAILED:', (e as Error).message);
    log('    (likely one-account-per-address — set ACCOUNT_ID env to reuse and re-run)');
    if (process.env.ACCOUNT_ID) {
      accountId = process.env.ACCOUNT_ID;
      log('    using ACCOUNT_ID from env:', accountId);
    } else {
      throw e;
    }
  }

  // 3. addDelegateKey (owner tx, costs gas).
  const add = await addDelegateKey({
    packageId: PACKAGE_ID,
    accountId,
    publicKey: delegate.publicKey,
    label: 'tusk3d-spike',
    suiPrivateKey: OWNER_KEY,
    suiNetwork: 'testnet',
    suiClient,
  });
  log('[3] addDelegateKey OK — digest:', add.digest);

  // 4. Construct the client exactly as the backend wrapper would.
  const memwal = MemWal.create({ key: delegate.privateKey, accountId, serverUrl: SERVER_URL });
  log('\n[4] MemWal.create OK (config = {key, accountId, serverUrl} — note: NO suiNetwork field)');

  const personalNs = delegate.suiAddress; // mirrors feature: namespace = wallet address
  const globalNs = 'global';

  const personalRecords = [
    'a low-poly red sports car, sharp angular body',
    'a chunky off-road pickup truck with big tires',
    'a sleek sci-fi hover bike, neon accents',
  ];
  const globalRecords = [
    'a medieval wooden treasure chest with iron bands',
    'a fast aerodynamic race car, low to the ground',
    'a cute cartoon mushroom house',
  ];

  // 5. Write to personal ns (rememberAndWait so the index is ready before recall).
  log(`\n[5] writing ${personalRecords.length} records to personal ns (${personalNs.slice(0, 10)}…)`);
  for (const t of personalRecords) {
    const r = await memwal.rememberAndWait(t, personalNs, REMEMBER_OPTS);
    log('    stored:', t.slice(0, 32) + '…', '→ blob', r.blob_id?.slice(0, 12) + '…');
  }

  // 6. Recall from personal ns — proves server-side index (SDK has no local store).
  const q1 = 'fast car';
  const rec1 = await memwal.recall({ query: q1, namespace: personalNs, limit: 5 });
  log(`\n[6] recall("${q1}", personal) → ${rec1.total} results (server-side index):`);
  rec1.results.forEach((m, i) => log(`    #${i} dist=${m.distance.toFixed(4)}  ${m.text.slice(0, 40)}`));
  const ascending = rec1.results.every((m, i, a) => i === 0 || a[i - 1]!.distance <= m.distance);
  log('    distances ascending (lower=closer):', ascending);

  // 7. U8 GATE — shared `global` namespace, independent multi-record ranked recall.
  log(`\n[7] U8 gate — writing ${globalRecords.length} records to SHARED '${globalNs}' ns`);
  for (const t of globalRecords) {
    const r = await memwal.rememberAndWait(t, globalNs, REMEMBER_OPTS);
    log('    stored(global):', t.slice(0, 32) + '…', '→ blob', r.blob_id?.slice(0, 12) + '…');
  }
  const q2 = 'racing vehicle';
  const rec2 = await memwal.recall({ query: q2, namespace: globalNs, limit: 5 });
  log(`\n    recall("${q2}", global) → ${rec2.total} results:`);
  rec2.results.forEach((m, i) => log(`    #${i} dist=${m.distance.toFixed(4)}  ${m.text.slice(0, 40)}`));

  // 8. Namespace isolation — personal query must NOT see global-only records.
  const rec3 = await memwal.recall({ query: 'treasure chest', namespace: personalNs, limit: 5 });
  const leak = rec3.results.some((m) => m.text.includes('treasure chest'));
  log(`\n[8] namespace isolation — 'treasure chest' in personal ns? ${leak ? 'LEAK (bad)' : 'not present (good)'}`);

  // audit B-2: NEVER print the delegate private key to stdout (terminal
  // scrollback / CI logs / shell history). Write it to a gitignored file with
  // owner-only perms and print only the path. The operator copies the values
  // from there into the backend env (MEMWAL_ACCOUNT_ID / MEMWAL_DELEGATE_KEY).
  const here = dirname(fileURLToPath(import.meta.url));
  const secretPath = resolve(here, '../.env.memwal-delegate'); // matches .gitignore `.env*`
  writeFileSync(
    secretPath,
    `# Generated by memwal-spike.ts — SERVER-SIDE SECRETS, do NOT commit.\n` +
      `# Copy these into the backend env; the delegate key acts across ALL namespaces.\n` +
      `MEMWAL_ACCOUNT_ID=${accountId}\n` +
      `MEMWAL_DELEGATE_KEY=${delegate.privateKey}\n`,
    { mode: 0o600 },
  );

  log('\n=== SPIKE RESULT ===');
  log('delegate.suiAddress:', delegate.suiAddress); // public — safe to print
  log('accountId + delegate private key written (0600) to:', secretPath);
  log('  → copy MEMWAL_ACCOUNT_ID / MEMWAL_DELEGATE_KEY from that file into the backend env, then delete it.');
  log('VERDICT: personal recall', rec1.total >= 1 ? 'OK' : 'EMPTY', '| global multi-record recall', rec2.total >= 2 ? 'OK (U8 viable)' : 'INSUFFICIENT');
  memwal.destroy();
}

main().catch((e) => {
  // Message only — never dump the full error object, which for signing errors
  // could embed key/seed material (audit B-2).
  console.error('\nSPIKE ERROR:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
