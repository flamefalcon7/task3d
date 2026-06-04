// Dependency-free smoke test for the Walrus read-path Worker (audit W-1 / W-4).
// No test framework: the worker only needs Workers globals (caches, fetch),
// which we stub here, plus URL/Request/Response (native in Node 18+).
//   run: node cdn-worker/test/worker.smoke.mjs
import assert from 'node:assert/strict';
import worker from '../src/worker.js';

const VALID_ID = 'abcdEFGH1234_-blobIdLooksLikeThis';
let capturedOriginUrl = null;

function installStubs() {
  capturedOriginUrl = null;
  // Cache always misses so every request reaches the origin path.
  globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };
  globalThis.fetch = async (urlStr) => {
    capturedOriginUrl = urlStr;
    return new Response('GLB-BYTES', { status: 200, headers: { 'content-type': 'model/gltf-binary' } });
  };
}

const ctx = { waitUntil() {} };
const get = (path) => worker.fetch(new Request(`https://cdn.tusk3d.space${path}`), {}, ctx);

let failures = 0;
async function check(name, fn) {
  installStubs();
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures++;
    console.error(`  ✗ ${name}\n    ${e.message}`);
  }
}

console.log('worker smoke (W-1 / W-4):');

await check('W-1: query string is NOT forwarded to the aggregator', async () => {
  const res = await get(`/v1/blobs/${VALID_ID}?evil=1&format=raw`);
  assert.equal(res.status, 200);
  assert.ok(capturedOriginUrl, 'origin fetch should have happened');
  assert.ok(!capturedOriginUrl.includes('?'), `originUrl leaked a query: ${capturedOriginUrl}`);
  assert.ok(capturedOriginUrl.endsWith(`/v1/blobs/${VALID_ID}`));
});

await check('valid bare blob id passes through (200)', async () => {
  const res = await get(`/v1/blobs/${VALID_ID}`);
  assert.equal(res.status, 200);
});

await check('valid by-quilt-patch-id slice passes through (200)', async () => {
  const res = await get(`/v1/blobs/by-quilt-patch-id/${VALID_ID}`);
  assert.equal(res.status, 200);
  assert.ok(capturedOriginUrl.endsWith(`/v1/blobs/by-quilt-patch-id/${VALID_ID}`));
});

await check('W-4: encoded path-traversal id is rejected (400), origin NOT hit', async () => {
  const res = await get('/v1/blobs/%2e%2e%2f%2e%2e%2fsecret');
  assert.equal(res.status, 400);
  assert.equal(capturedOriginUrl, null, 'must not fetch origin for an invalid id');
});

await check('W-4: extra path segment / slash injection rejected (400)', async () => {
  const res = await get('/v1/blobs/good/../../evil');
  // new URL resolves ../ so this normalizes away from /v1/blobs/ → 404, or fails
  // the charset guard → 400. Either way the origin must not be hit.
  assert.ok(res.status === 400 || res.status === 404);
  assert.equal(capturedOriginUrl, null);
});

await check('non-blob path still 404s', async () => {
  const res = await get('/v1/something-else');
  assert.equal(res.status, 404);
});

if (failures) {
  console.error(`\n${failures} smoke check(s) failed`);
  process.exit(1);
}
console.log('\nall worker smoke checks passed');
