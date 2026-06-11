/**
 * agent-decrypt — client-side Seal decrypt for the MCP demo (U7, KTD-2/KTD-3,
 * D-104). The last mile of the agent purchase arc: takes the `download_content`
 * MCP tool's JSON output + the agent's keypair, finishes Seal decryption
 * LOCALLY, and writes the plaintext GLB into samples/<modelId>.glb.
 *
 * Run (one-liner for the Claude Code demo):
 *
 *   AGENT_SECRET_KEY=suiprivkey1... pnpm --dir frontend exec tsx scripts/agent-decrypt.ts /tmp/download-content.json
 *
 * or pipe the tool response (bare structured output OR the full MCP result
 * envelope — `structuredContent` is unwrapped automatically) on stdin:
 *
 *   cat /tmp/download-content.json | AGENT_SECRET_KEY=suiprivkey1... pnpm --dir frontend exec tsx scripts/agent-decrypt.ts -
 *
 * SECURITY:
 *   - The secret key comes from the AGENT_SECRET_KEY env var ONLY. It is NEVER
 *     accepted as a CLI argument (argv leaks into process lists) and is NEVER
 *     sent to any server — the Seal key servers and the fullnode only ever see
 *     the SessionKey personal-message SIGNATURE.
 *   - The Tusk3D backend stays out of the decrypt data path entirely (audit
 *     W-9): ciphertext flows aggregator → here; the AES key is unwrapped here.
 *   - The write is atomic (temp + rename): a failed decrypt never leaves a
 *     partial GLB in samples/.
 *
 * Testable core: ../src/seal/agentDecrypt.ts (covered by
 * frontend/src/seal/agentDecrypt.test.ts); this file is a thin CLI shell.
 */
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';
import process from 'node:process';
import {
  parseDownloadContentMaterial,
  runAgentDecrypt,
} from './agentDecrypt';

const USAGE =
  'usage: AGENT_SECRET_KEY=suiprivkey1... pnpm --dir frontend exec tsx ' +
  'scripts/agent-decrypt.ts <download-content.json | ->';

async function readInput(arg: string | undefined): Promise<string> {
  if (arg && arg !== '-') return readFile(resolve(arg), 'utf8');
  if (process.stdin.isTTY) {
    throw new Error(`no input — pass the download_content JSON path or pipe it on stdin\n${USAGE}`);
  }
  process.stdin.setEncoding('utf8');
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  if (!data.trim()) throw new Error(`empty stdin\n${USAGE}`);
  return data;
}

async function main(): Promise<void> {
  const secret = process.env.AGENT_SECRET_KEY;
  if (!secret || !secret.startsWith('suiprivkey')) {
    throw new Error(
      "AGENT_SECRET_KEY must hold the agent's bech32 secret key (suiprivkey1...). " +
        'Env var only — never pass the key as an argument, and it is never sent to any server.\n' +
        USAGE,
    );
  }

  const rawJson = await readInput(process.argv[2]);
  const material = parseDownloadContentMaterial(JSON.parse(rawJson));

  // D-058 — the Ed25519Keypair IS the Signer; it signs the SessionKey personal
  // message in-process and nothing else.
  const keypair = Ed25519Keypair.fromSecretKey(secret);

  // frontend/scripts/ → repo root → samples/. The modelId is charset-validated
  // by parseDownloadContentMaterial (0x-hex), so it is path-safe.
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const outFile = join(repoRoot, 'samples', `${material.sealApprove.modelId}.glb`);

  const result = await runAgentDecrypt({ material, signer: keypair, outFile });

  console.log(
    `agent-decrypt OK — ${result.modelId} → ${relative(process.cwd(), result.outFile)} ` +
      `(${result.byteLength} bytes), decrypted locally as ${result.address}`,
  );
}

main().catch((e: unknown) => {
  console.error(`agent-decrypt failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});
