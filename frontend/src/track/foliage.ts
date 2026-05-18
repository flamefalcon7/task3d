import {
  LoadAssetContainerAsync,
  Mesh,
  Vector3,
  type Scene,
} from '@babylonjs/core';

// Kenney Nature Kit subset (CC0). Source files in /models/nature/.
const TREE_DEFAULT_URL = '/models/nature/tree_default.glb';
const TREE_CONE_URL = '/models/nature/tree_cone.glb';
const BUSH_URL = '/models/nature/plant_bushDetailed.glb';
const GRASS_URL = '/models/nature/grass.glb';
const FLOWER_URL = '/models/nature/flower_yellowA.glb';

// Kenney models are unit-scaled (~1u) in their local space. These multipliers
// map them to our world units: cars are ~3u long, road is 14u wide, walls 4u.
const TREE_SCALE = 5.5;
const BUSH_SCALE = 1.6;
const GRASS_SCALE = 1.2;
const FLOWER_SCALE = 1.5;

// Tree counts decoupled from BARRIER_COUNT so we can densify each ring
// independently. Outer ring is a randomized forest BAND (144 trees scattered
// between an inner and outer radius), so the perimeter reads as a real
// forest, not a fence. Inner ring stays deterministic + evenly spaced as a
// clean rim around the infield.
const OUTER_TREE_COUNT = 144;
const INNER_TREE_COUNT = 48;

// Outer trees fan out across a band beyond the barrier (offset 8). The band
// runs [12, 26]u so the closest trees are clearly off the racing line and
// the furthest reach into the safety ground for visual depth.
const OUTER_TREE_BAND_MIN = 12;
const OUTER_TREE_BAND_MAX = 26;

// Inner trees scatter across a tighter inward band. Max bound capped to
// avoid overshoot at corners (corner-radius 10 means samples sit ~17u from
// the corner pivot; inward 16 lands ~1u past the pivot, still in infield).
const INNER_TREE_BAND_MIN = 9;
const INNER_TREE_BAND_MAX = 16;

// Scatter counts — total ~150 instances. createInstance shares geometry and
// material per source mesh so the per-instance cost is roughly a transform
// matrix; this is cheap even at chase-cam framerates.
const INFIELD_GRASS_COUNT = 60;
const INFIELD_FLOWER_COUNT = 40;
const INFIELD_BUSH_COUNT = 18;
const OUTFIELD_BUSH_COUNT = 30;

// Reject any scatter sample within MIN_DIST_FROM_ROAD of any track sample so
// foliage never spawns on the kerbs or in the racing surface.
const MIN_DIST_FROM_ROAD = 10;

// Deterministic seed — placements look hand-arranged but reproduce frame-to-
// frame and across reloads, so screenshots and demos stay stable.
const SCATTER_RNG_SEED = 0xdec07a7e;

interface Sample { x: number; y: number; z: number; }

export interface FoliageOptions {
  scene: Scene;
  samples: Sample[];
  trackSamples: number;
  trackWidth: number;
  trackLength: number;
}

export async function createFoliage(opts: FoliageOptions): Promise<void> {
  const { scene, samples, trackSamples } = opts;

  const [treeDefault, treeCone, bush, grass, flower] = await Promise.all([
    loadSource(scene, TREE_DEFAULT_URL, 'src-tree-default'),
    loadSource(scene, TREE_CONE_URL, 'src-tree-cone'),
    loadSource(scene, BUSH_URL, 'src-bush'),
    loadSource(scene, GRASS_URL, 'src-grass'),
    loadSource(scene, FLOWER_URL, 'src-flower'),
  ]);

  const rng = mulberry32(SCATTER_RNG_SEED);

  // Shared sampler — picks a track-centerline point and outward direction.
  const samplePoint = (
    sampleIdx: number,
  ): { center: Sample; outX: number; outZ: number } => {
    const center = samples[sampleIdx]!;
    const next = samples[(sampleIdx + 1) % samples.length]!;
    const prev = samples[(sampleIdx - 1 + samples.length) % samples.length]!;
    const tx = next.x - prev.x;
    const tz = next.z - prev.z;
    const len = Math.hypot(tx, tz) || 1;
    return { center, outX: tz / len, outZ: -tx / len };
  };

  // Outer ring — randomized forest band. Random sample index, random radial
  // distance within [BAND_MIN, BAND_MAX], random yaw and scale. Looks like
  // a real forest patch rather than a fence line of evenly-spaced trees.
  for (let i = 0; i < OUTER_TREE_COUNT; i++) {
    const sampleIdx = Math.floor(rng() * trackSamples);
    const { center, outX, outZ } = samplePoint(sampleIdx);
    const dist =
      OUTER_TREE_BAND_MIN + rng() * (OUTER_TREE_BAND_MAX - OUTER_TREE_BAND_MIN);
    const source = rng() < 0.5 ? treeDefault : treeCone;
    const inst = source.createInstance(`tree-outer-${i}`);
    inst.position = new Vector3(
      center.x + outX * dist,
      0,
      center.z + outZ * dist,
    );
    inst.rotation = new Vector3(0, rng() * Math.PI * 2, 0);
    const sc = TREE_SCALE * (0.7 + rng() * 0.5);
    inst.scaling = new Vector3(sc, sc, sc);
  }

  // Inner ring — randomized inward band, same RNG stream as outer (still
  // deterministic per reload thanks to SCATTER_RNG_SEED). Tighter band than
  // outer because the infield is small, especially around corners.
  for (let i = 0; i < INNER_TREE_COUNT; i++) {
    const sampleIdx = Math.floor(rng() * trackSamples);
    const { center, outX, outZ } = samplePoint(sampleIdx);
    const dist =
      INNER_TREE_BAND_MIN + rng() * (INNER_TREE_BAND_MAX - INNER_TREE_BAND_MIN);
    const source = rng() < 0.5 ? treeDefault : treeCone;
    const inst = source.createInstance(`tree-inner-${i}`);
    inst.position = new Vector3(
      center.x - outX * dist,
      0,
      center.z - outZ * dist,
    );
    inst.rotation = new Vector3(0, rng() * Math.PI * 2, 0);
    const sc = TREE_SCALE * (0.7 + rng() * 0.5);
    inst.scaling = new Vector3(sc, sc, sc);
  }

  const halfWidth = opts.trackWidth / 2 + 4;
  const halfLength = opts.trackLength / 2 + 4;

  const scatter = (
    source: Mesh,
    count: number,
    scale: number,
    kind: string,
  ): void => {
    let placed = 0;
    let attempts = 0;
    while (placed < count && attempts < count * 50) {
      attempts++;
      const x = (rng() * 2 - 1) * halfWidth;
      const z = (rng() * 2 - 1) * halfLength;
      if (minDistFromRoad(x, z, samples) < MIN_DIST_FROM_ROAD) continue;
      const inst = source.createInstance(`${kind}-${placed}`);
      inst.position = new Vector3(x, 0, z);
      inst.rotation = new Vector3(0, rng() * Math.PI * 2, 0);
      const s = scale * (0.85 + rng() * 0.3);
      inst.scaling = new Vector3(s, s, s);
      placed++;
    }
  };

  // Infield scatter — grass tufts, flowers, bushes inside the track ring.
  scatter(grass, INFIELD_GRASS_COUNT, GRASS_SCALE, 'grass-infield');
  scatter(flower, INFIELD_FLOWER_COUNT, FLOWER_SCALE, 'flower-infield');
  scatter(bush, INFIELD_BUSH_COUNT, BUSH_SCALE, 'bush-infield');

  // Outfield bushes — beyond the outer forest band, sparse rim of greenery
  // so the safety ground doesn't read as a flat green disc at chase-cam
  // distance. Pushed past OUTER_TREE_BAND_MAX so bushes don't compete with
  // trees for the same XZ slots.
  const outerRange =
    Math.max(opts.trackWidth, opts.trackLength) / 2 + OUTER_TREE_BAND_MAX + 8;
  const minDistFromTrack = OUTER_TREE_BAND_MAX + 4;
  let outPlaced = 0;
  let outAttempts = 0;
  while (
    outPlaced < OUTFIELD_BUSH_COUNT &&
    outAttempts < OUTFIELD_BUSH_COUNT * 50
  ) {
    outAttempts++;
    const x = (rng() * 2 - 1) * outerRange;
    const z = (rng() * 2 - 1) * outerRange;
    if (minDistFromRoad(x, z, samples) < minDistFromTrack) continue;
    const inst = bush.createInstance(`bush-outfield-${outPlaced}`);
    inst.position = new Vector3(x, 0, z);
    inst.rotation = new Vector3(0, rng() * Math.PI * 2, 0);
    const s = BUSH_SCALE * (0.9 + rng() * 0.5);
    inst.scaling = new Vector3(s, s, s);
    outPlaced++;
  }
}

function minDistFromRoad(x: number, z: number, samples: Sample[]): number {
  let minSq = Infinity;
  for (const s of samples) {
    const dx = s.x - x;
    const dz = s.z - z;
    const d2 = dx * dx + dz * dz;
    if (d2 < minSq) minSq = d2;
  }
  return Math.sqrt(minSq);
}

async function loadSource(
  scene: Scene,
  url: string,
  name: string,
): Promise<Mesh> {
  const container = await LoadAssetContainerAsync(url, scene, {
    pluginExtension: '.glb',
  });
  container.addAllToScene();
  // Same pattern as the car GLB load (KTD-2): the first mesh is usually
  // Babylon's __root__ TransformNode with zero vertices; the real geometry
  // is the first vertex-bearing entry.
  const geom = container.meshes.find(
    (m) => typeof m.getTotalVertices === 'function' && m.getTotalVertices() > 0,
  );
  if (!geom || !(geom instanceof Mesh)) {
    throw new Error(`createFoliage: no vertex-bearing Mesh in ${url}`);
  }
  geom.name = name;
  // Hide the source mesh; only its createInstance() copies should render.
  geom.isVisible = false;
  return geom;
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
