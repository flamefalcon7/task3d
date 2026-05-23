// Spike: full two-step Tripo segmentation flow.
//   Step 1: text_to_model on Turbo-v1.0-20250506  (~20 credits)
//   Step 2: mesh_segmentation with original_model_task_id from step 1  (~40 credits)
// Total budget: ~60 credits. Saves both GLBs side by side so we can compare
// the structure of an API-generated segmentation to the reference turbo-seg.glb.
//
// Schema discovered via spike-tripo-seg-probe.ts (history showed mesh_segmentation
// as the real task type; probe identified original_model_task_id as the field).
//
// Run: ./node_modules/.bin/tsx --env-file=.env scripts/spike-tripo-segmentation.ts

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TRIPO_BASE = 'https://api.tripo3d.ai/v2/openapi';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT_DIR = path.resolve(__dirname, '../../frontend/public/dev-glbs');

const apiKey = process.env.TRIPO_API_KEY;
if (!apiKey) {
  console.error('TRIPO_API_KEY missing');
  process.exit(1);
}

const DONE = new Set(['success', 'done', 'complete', 'completed']);
const FAIL = new Set(['failed', 'error', 'cancelled', 'canceled']);
const delays = [1000, 2000, 4000, 8000, 10_000];

async function submit(body: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${TRIPO_BASE}/task`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(`  submit status=${res.status} body=${text}`);
  if (!res.ok) throw new Error(`Submit failed: ${res.status}`);
  const json = JSON.parse(text) as { data?: { task_id?: string } };
  const id = json?.data?.task_id;
  if (!id) throw new Error('No task_id in submit response');
  return id;
}

async function pollUntilDone(
  taskId: string,
  label: string,
  maxWaitMs: number,
): Promise<{ output: Record<string, unknown> }> {
  let elapsed = 0;
  let attempt = 0;
  let lastStatus = '';
  while (elapsed < maxWaitMs) {
    const res = await fetch(`${TRIPO_BASE}/task/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`Poll ${label} failed: ${res.status}`);
    const body = (await res.json()) as {
      data?: { status?: string; output?: Record<string, unknown>; progress?: number };
    };
    const status = (body?.data?.status ?? '').toLowerCase();
    const progress = body?.data?.progress ?? 0;
    if (status !== lastStatus) {
      console.log(`  [${label} ${elapsed}ms] status=${status} progress=${progress}`);
      lastStatus = status;
    }
    if (DONE.has(status)) {
      return { output: body?.data?.output ?? {} };
    }
    if (FAIL.has(status)) {
      console.error(`  ${label} failed: ${JSON.stringify(body, null, 2)}`);
      throw new Error(`${label} task failed`);
    }
    const delay = delays[Math.min(attempt, delays.length - 1)] ?? 10_000;
    await new Promise((r) => setTimeout(r, delay));
    elapsed += delay;
    attempt += 1;
  }
  throw new Error(`${label} timed out after ${maxWaitMs}ms`);
}

function extractUrl(output: Record<string, unknown>): string {
  const url =
    (output.pbr_model as string | undefined) ||
    (output.glb_url as string | undefined) ||
    (output.model_url as string | undefined) ||
    (output.output_url as string | undefined) ||
    (output.model as string | undefined);
  if (!url) {
    console.error('Output object:', JSON.stringify(output, null, 2));
    throw new Error('No model URL in output');
  }
  return url;
}

async function download(url: string, outPath: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download ${url} failed: ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  fs.writeFileSync(outPath, bytes);
  console.log(`  ✓ saved ${bytes.length.toLocaleString()} bytes → ${outPath}`);
  return bytes;
}

function dumpStructure(bytes: Uint8Array, label: string): void {
  const view = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLen = view.readUInt32LE(12);
  const json = JSON.parse(view.subarray(20, 20 + jsonLen).toString('utf8'));
  console.log(`\n— STRUCTURE: ${label}`);
  console.log(`  generator: ${json.asset?.generator} ${json.asset?.version}`);
  console.log(`  nodes=${(json.nodes ?? []).length}`);
  console.log(`  meshes=${(json.meshes ?? []).length}`);
  console.log(`  materials=${(json.materials ?? []).length}`);
  console.log(`  textures=${(json.textures ?? []).length}`);
  console.log(`  images=${(json.images ?? []).length}`);
  console.log(`  extensionsRequired: ${JSON.stringify(json.extensionsRequired ?? [])}`);
  const nodeNames = (json.nodes ?? [])
    .slice(0, 12)
    .map((n: { name?: string }) => n.name ?? '?')
    .join(', ');
  console.log(`  node names (first 12): ${nodeNames}`);
  const mat0 = (json.materials ?? [])[0];
  if (mat0) {
    const pbr = mat0.pbrMetallicRoughness ?? {};
    console.log(
      `  material[0]: name='${mat0.name}' baseColorFactor=${JSON.stringify(pbr.baseColorFactor)} baseColorTexture=${pbr.baseColorTexture?.index ?? 'none'}`,
    );
  }
}

// ----- STEP 1: text_to_model Turbo -----
console.log('— STEP 1: text_to_model (Turbo-v1.0-20250506, ~20cr)');
const t1Body = {
  type: 'text_to_model',
  model_version: 'Turbo-v1.0-20250506',
  prompt: 'low-poly racing car',
  face_limit: 5000,
};
console.log(`  body=${JSON.stringify(t1Body)}`);
const t1Id = await submit(t1Body);
console.log(`  task_id=${t1Id}`);
const { output: t1Output } = await pollUntilDone(t1Id, 'gen', 90_000);
const t1Url = extractUrl(t1Output);
console.log(`  output url: ${t1Url}`);

fs.mkdirSync(OUT_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const t1Path = path.join(OUT_DIR, `spike-gen-${stamp}.glb`);
const t1Bytes = await download(t1Url, t1Path);

// ----- STEP 2: mesh_segmentation -----
console.log('\n— STEP 2: mesh_segmentation (~40cr)');
const t2Body = {
  type: 'mesh_segmentation',
  original_model_task_id: t1Id,
};
console.log(`  body=${JSON.stringify(t2Body)}`);
const t2Id = await submit(t2Body);
console.log(`  task_id=${t2Id}`);
const { output: t2Output } = await pollUntilDone(t2Id, 'seg', 180_000);
const t2Url = extractUrl(t2Output);
console.log(`  output url: ${t2Url}`);

const t2Path = path.join(OUT_DIR, `spike-seg-${stamp}.glb`);
const t2Bytes = await download(t2Url, t2Path);

// ----- COMPARE -----
dumpStructure(t1Bytes, 'gen (step 1)');
dumpStructure(t2Bytes, 'seg (step 2)');

// Reference comparison.
const refPath = path.join(OUT_DIR, 'turbo-seg.glb');
if (fs.existsSync(refPath)) {
  const ref = new Uint8Array(fs.readFileSync(refPath));
  dumpStructure(ref, 'REFERENCE turbo-seg.glb');
}

console.log('\n— DONE');
