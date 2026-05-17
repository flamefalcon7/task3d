// Walrus upload + download round-trip integration test.
//
// Mirrors frontend/src/walrus/useWalrusUpload.ts line-by-line so a green run
// here proves the same code path works end-to-end against real Walrus testnet
// (encode → executeRegister → upload({digest}) → executeCertify → listFiles),
// then verifies the aggregator round-trip pattern used by /collection + /track
// (https://aggregator.walrus-testnet.walrus.space/v1/blobs/by-quilt-patch-id/).
//
// Usage:
//   cd frontend
//   WALRUS_TEST_PRIVATE_KEY="$(sui keytool export --key-identity capy --json | jq -r .exportedPrivateKey)" \
//     node scripts/walrus-roundtrip.mjs
//
// Or pass any bech32 sui private key for a testnet wallet that has at least
// ~0.1 SUI + ~0.1 WAL. Run takes 30-90s end to end (Walrus testnet writes).

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';

import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { walrus, WalrusFile } from '@mysten/walrus';

const AGGREGATOR = 'https://aggregator.walrus-testnet.walrus.space';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function fmt(label, value) {
  console.log(`  ${label.padEnd(18)} ${value}`);
}

async function main() {
  const bech32 = process.env.WALRUS_TEST_PRIVATE_KEY;
  if (!bech32) {
    console.error('error: set WALRUS_TEST_PRIVATE_KEY=suiprivkey1...');
    console.error('hint:  WALRUS_TEST_PRIVATE_KEY="$(sui keytool export --key-identity capy --json | jq -r .exportedPrivateKey)"');
    process.exit(1);
  }
  const { secretKey } = decodeSuiPrivateKey(bech32);
  const keypair = Ed25519Keypair.fromSecretKey(secretKey);
  const owner = keypair.toSuiAddress();
  console.log(`signer:  ${owner}\n`);

  const client = new SuiJsonRpcClient({
    network: 'testnet',
    url: getJsonRpcFullnodeUrl('testnet'),
  }).$extend(
    walrus({
      uploadRelay: {
        host: 'https://upload-relay.testnet.walrus.space',
        sendTip: { max: 1_000 },
      },
    }),
  );

  // Two-file quilt — exercises both byte-identical text + an actual GLB binary
  // from the dev fixtures. Same shape useWalrusUpload feeds writeFilesFlow.
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const glb = new Uint8Array(
    await readFile(join(__dirname, '..', 'public', 'dev-glbs', 'p1.glb')),
  );
  const random = randomBytes(4096);

  const payloads = [
    { name: 'p1.glb', bytes: glb },
    { name: 'random4k.bin', bytes: random },
  ];

  console.log('==> input payloads');
  const inputHashes = payloads.map((p) => {
    const sha = sha256(p.bytes);
    console.log(`  ${p.name.padEnd(15)} ${p.bytes.length} bytes  sha256=${sha}`);
    return sha;
  });

  // Mirror useWalrusUpload identifier padding so quilt patch order matches
  // input order (zero-pad fix in commit 16c023c).
  const padWidth = Math.max(2, String(payloads.length - 1).length);
  const walrusFiles = payloads.map((p, i) =>
    WalrusFile.from({
      contents: p.bytes,
      identifier: `file-${String(i).padStart(padWidth, '0')}`,
    }),
  );

  const flow = client.walrus.writeFilesFlow({ files: walrusFiles });

  console.log('\n==> upload pipeline');
  const t0 = Date.now();

  console.log('  encode...');
  await flow.encode();

  console.log('  executeRegister...');
  const reg = await flow.executeRegister({
    signer: keypair,
    epochs: 10,
    deletable: false,
    owner,
  });
  fmt('register digest', reg.txDigest);

  console.log('  upload (relay)...');
  await flow.upload({ digest: reg.txDigest });

  console.log('  executeCertify...');
  await flow.executeCertify({ signer: keypair });

  const fileRefs = await flow.listFiles();
  console.log(`  done in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);

  console.log('==> listFiles');
  fileRefs.forEach((f, i) => {
    fmt(`patch[${i}].id`, f.id);
    fmt(`patch[${i}].blobId`, f.blobId);
    fmt(`patch[${i}].objId`, f.blobObject.id);
  });

  console.log('\n==> download via aggregator + compare');
  let allMatch = true;
  for (let i = 0; i < fileRefs.length; i++) {
    const ref = fileRefs[i];
    const url = `${AGGREGATOR}/v1/blobs/by-quilt-patch-id/${ref.id}`;
    process.stdout.write(`  [${i}] ${payloads[i].name} ... `);
    let res;
    try {
      res = await fetch(url);
    } catch (e) {
      console.log(`FETCH ERROR: ${e?.message ?? e}`);
      allMatch = false;
      continue;
    }
    if (!res.ok) {
      console.log(`HTTP ${res.status}`);
      console.log(`     URL: ${url}`);
      allMatch = false;
      continue;
    }
    const downloaded = new Uint8Array(await res.arrayBuffer());
    const gotSha = sha256(downloaded);
    const ok =
      gotSha === inputHashes[i] && downloaded.length === payloads[i].bytes.length;
    console.log(
      ok
        ? `OK (${downloaded.length} bytes, sha256 matches)`
        : `MISMATCH (got ${downloaded.length} bytes sha256=${gotSha}, expected ${payloads[i].bytes.length} bytes sha256=${inputHashes[i]})`,
    );
    if (!ok) allMatch = false;
  }

  console.log();
  if (allMatch) {
    console.log('==> RESULT: ✓ all files round-tripped byte-identical');
    process.exit(0);
  } else {
    console.log('==> RESULT: ✗ at least one file failed round-trip');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('\n!! fatal:', e?.stack ?? e);
  process.exit(1);
});
