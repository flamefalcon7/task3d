/**
 * ⚠️ STALE AS OF plan-027 (D-078) — DO NOT RUN UNCHANGED.
 *
 * This headless diagnostic exercises the OLD cap-based decrypt gate
 * (`seal_approve_cap` + `buildSealApproveCapPtb`), which plan-027 DELETED in
 * favor of the entitlement gate (`seal_approve_entitlement` /
 * `buildSealApproveEntitlementPtb`). It also pre-dates `access_fee` on
 * `LicenseTerms`. The rewire (insert a `purchase_access` step, swap the dry-run
 * builder to the entitlement one, add `accessFee` to the publish license) is
 * the live Seal-seam re-verification owned by U5 Part A / U10 — NOT U6. Left
 * in place (outside the `tsc -b` graph; not in CI) so the prior arc is
 * recoverable; `npx tsx` will fail at the deleted `buildSealApproveCapPtb`
 * import until that rewire lands. — plan-027 U6
 *
 * plan-026 — headless end-to-end verification of the Seal encrypted-publish +
 * forker-decrypt round-trip against LIVE testnet + LIVE Seal key servers.
 *
 * Why headless: the decrypt path needs wallet signatures (publish, fork fee,
 * SessionKey personal-message, mint) that agent-browser can't drive. This script
 * signs everything DIRECTLY with the deployer keypair — no Slush popups — and
 * proves the one thing unit tests (which mock the key servers) cannot: that the
 * live key servers release the AES key for a real `seal_approve_cap` dry-run, and
 * the decrypted bytes equal the original GLB.
 *
 * Hybrid: the `walrus` CLI does the quilt upload (handles WASM/WAL/storage); the
 * @mysten/sui + @mysten/seal SDKs do encrypt / contract / SessionKey / decrypt.
 * Single keypair = creator forks their OWN ALLOW_LIST base (allowed: the gate is
 * `policy != RESTRICTED`; seal_approve_cap doesn't require sender != creator) —
 * this exercises the full crypto + key-server path. Cross-wallet ("a DIFFERENT
 * wallet pays") is contract-enforced (D-076) and unit-tested separately.
 *
 * Run:  cd frontend && npx tsx scripts/seal-roundtrip.ts [glb-path]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { fromHex, toHex } from '@mysten/sui/utils';
import { EncryptedObject } from '@mysten/seal';
import { getSealClient } from '../src/seal/sealClient';
import { encryptBase, decryptBase, decryptKey } from '../src/seal/envelope';
import { createSession, activateSession } from '../src/seal/sessionKey';
import { buildPublishEncryptedPtb } from '../src/sui/modelTxBuilders';
import { buildLaunchCollectionPtb, buildSealApproveCapPtb } from '../src/sui/collectionTxBuilders';
import { TESTNET } from '../src/sui/networkConfig';
import { WALRUS_AGGREGATOR } from '../src/walrus/aggregator';

const PKG = TESTNET.model3dPackageId;
const FEE_MIST = 1_000_000n; // 0.001 SUI fork fee (ALLOW_LIST requires > 0)
const step = (n: number, s: string) => console.log(`\n── [${n}] ${s}`);
const ok = (s: string) => console.log(`   ✅ ${s}`);
const die = (s: string): never => {
  console.error(`\n❌ FAILED: ${s}`);
  process.exit(1);
};

type Created = { objectType?: string; objectId?: string };
function findCreated(changes: unknown, typeSuffix: string): string {
  const arr = (changes ?? []) as Array<{ type?: string } & Created>;
  const hit = arr.find((c) => c.type === 'created' && (c.objectType ?? '').endsWith(typeSuffix));
  if (!hit?.objectId) die(`could not find a created object of type …${typeSuffix}`);
  return hit!.objectId!;
}

async function main() {
  const glbPath = process.argv[2] ?? 'public/dev-glbs/pickup-truck.glb';
  const glb = new Uint8Array(readFileSync(glbPath));
  console.log(`Seal round-trip — v9 ${PKG.slice(0, 10)}…  GLB ${glbPath} (${glb.length} B)`);

  step(0, 'Load deployer keypair (the active sui/walrus address)');
  const exp = JSON.parse(
    execFileSync('sui', ['keytool', 'export', '--key-identity', TESTNET.deployerAddress, '--json']).toString(),
  );
  const pkStr: string = exp.exportedPrivateKey ?? exp.key?.exportedPrivateKey;
  const kp = Ed25519Keypair.fromSecretKey(decodeSuiPrivateKey(pkStr).secretKey);
  const addr = kp.toSuiAddress();
  if (addr !== TESTNET.deployerAddress) die(`keypair addr ${addr} != deployer`);
  ok(`signer ${addr}`);

  const sui = new SuiJsonRpcClient({ network: 'testnet', url: getJsonRpcFullnodeUrl('testnet') });
  const seal = getSealClient('testnet', sui);

  step(1, 'Encrypt GLB (envelope: AES-256-GCM + Seal-wrapped key; Resolution G seal_id)');
  const sealId = crypto.getRandomValues(new Uint8Array(32));
  const { ciphertext, sealedKey } = await encryptBase(seal, PKG, glb, sealId);
  const fullId = fromHex(EncryptedObject.parse(sealedKey).id);
  if (toHex(fullId.slice(0, 32)) !== toHex(sealId)) die('recovered id is not prefixed by seal_id');
  ok(`ciphertext ${ciphertext.length} B, sealedKey ${sealedKey.length} B, fullId ${fullId.length} B (prefix matches seal_id)`);

  step(2, 'Upload ciphertext as a ONE-file Walrus quilt (walrus CLI)');
  writeFileSync('/tmp/seal-cipher.bin', Buffer.from(ciphertext));
  const storeOut = execFileSync(
    'walrus',
    ['store-quilt', '--epochs', '3', '--paths', '/tmp/seal-cipher.bin', '--json'],
    { maxBuffer: 128 * 1024 * 1024 },
  ).toString();
  const store = JSON.parse(storeOut);
  const nc = store.blobStoreResult?.newlyCreated ?? store.blobStoreResult?.alreadyCertified;
  const blobObjectId: string = nc?.blobObject?.id ?? die('no blob object id in store-quilt output');
  const patch = (store.storedQuiltBlobs ?? []).find((b: { identifier: string }) => b.identifier === 'seal-cipher.bin');
  const cipherPatchId: string = patch?.quiltPatchId ?? die('no quilt patch id for the ciphertext');
  ok(`quilt Blob ${blobObjectId.slice(0, 12)}…  ciphertext patch ${cipherPatchId.slice(0, 16)}…`);

  step(3, 'publish_encrypted (ALLOW_LIST, fee>0) — register the encrypted base on-chain');
  const { tx: pubTx } = buildPublishEncryptedPtb({
    blobObjectId,
    shapeType: 'upload',
    paramsJson: JSON.stringify({ source: 'seal-roundtrip' }),
    name: 'roundtrip-base',
    tags: [],
    lineageBlobId: cipherPatchId,
    glbBlobId: cipherPatchId,
    partLabels: [],
    sealedKey,
    sealId,
    previewBlobIds: [],
    license: {
      policy: 1,
      derivativeMintFee: FEE_MIST,
      derivativeRoyaltyBps: 500,
      commercialUse: true,
      requireAttribution: true,
    },
  });
  const pub = await sui.signAndExecuteTransaction({
    signer: kp,
    transaction: pubTx,
    options: { showObjectChanges: true, showEffects: true },
  });
  if (pub.effects?.status?.status !== 'success') die(`publish_encrypted failed: ${JSON.stringify(pub.effects?.status)}`);
  const modelId = findCreated(pub.objectChanges, '::model3d::Model3D');
  await sui.waitForTransaction({ digest: pub.digest }); // read-after-write: make the shared Model3D RPC-visible
  ok(`Model3D ${modelId}  (tx ${pub.digest})`);

  step(4, 'launch_collection (pay the fork fee → soulbound cap + collection)');
  const { tx: launchTx } = buildLaunchCollectionPtb({ modelId, feeMist: FEE_MIST, quiltBlobId: '' });
  const launch = await sui.signAndExecuteTransaction({
    signer: kp,
    transaction: launchTx,
    options: { showObjectChanges: true, showEffects: true },
  });
  if (launch.effects?.status?.status !== 'success') die(`launch_collection failed: ${JSON.stringify(launch.effects?.status)}`);
  const capId = findCreated(launch.objectChanges, '::model3d::NftCollectionCreatorCap');
  const collectionId = findCreated(launch.objectChanges, '::model3d::NftCollection');
  await sui.waitForTransaction({ digest: launch.digest }); // cap + collection RPC-visible before seal_approve_cap
  ok(`cap ${capId.slice(0, 12)}…  collection ${collectionId.slice(0, 12)}…`);

  step(5, 'SessionKey — one personal-message signature (signed directly, no wallet popup)');
  const pending = await createSession(addr, PKG, sui);
  const { signature } = await kp.signPersonalMessage(pending.personalMessage);
  const sessionKey = await activateSession(pending, PKG, signature);
  ok('SessionKey activated');

  step(6, 'Build seal_approve_cap PTB → txBytes (key-server dry-run target)');
  const { tx: approveTx } = buildSealApproveCapPtb({ id: fullId, capId, collectionId, baseModelId: modelId });
  const txBytes = await approveTx.build({ client: sui, onlyTransactionKind: true });
  ok(`txBytes ${txBytes.length} B`);

  step(7, '⭐ decryptKey via LIVE Seal key servers (THE thing only this can verify)');
  const aesKey = await decryptKey(seal, sealedKey, sessionKey, txBytes);
  ok(`key servers released the AES key (${aesKey.length} B) — seal_approve_cap PASSED on-chain dry-run`);

  step(8, 'Fetch ciphertext from Walrus by-quilt-patch-id + AES-GCM decrypt');
  const url = `${WALRUS_AGGREGATOR}/v1/blobs/by-quilt-patch-id/${cipherPatchId}`;
  const resp = await fetch(url);
  if (!resp.ok) die(`ciphertext fetch ${resp.status} from ${url}`);
  const fetched = new Uint8Array(await resp.arrayBuffer());
  const plaintext = await decryptBase(fetched, aesKey);
  ok(`fetched ${fetched.length} B, decrypted ${plaintext.length} B`);

  step(9, 'Verify decrypted GLB === original');
  if (plaintext.length !== glb.length || Buffer.compare(Buffer.from(plaintext), Buffer.from(glb)) !== 0) {
    die(`decrypted bytes != original (${plaintext.length} vs ${glb.length})`);
  }
  console.log('\n🎉 ROUND-TRIP OK — encrypt → publish → fork → live-key-server decrypt → byte-exact GLB.');
  console.log(`   Model3D: ${modelId}`);
}

main().catch((e) => die(e?.stack ?? String(e)));
