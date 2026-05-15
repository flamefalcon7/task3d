// Type contracts shared between browser (frontend) and server (backend).
// Per D-011: Generator interface so Phase 2 LLM router and Phase 3 Tripo
// generator can slot in behind the same contract without caller refactor.

import { z } from 'zod';

export type ShapeId = 'box' | 'chest' | 'cylinder' | 'sphere' | 'sword' | 'hammer' | 'platform';

// `tripo` is a generator id but not a "shape" — shapes are procedural categories
// the catalog publishes via GET /api/shapes; `tripo` is an LLM-routed fallback.
export type GeneratorId = ShapeId | 'tripo';

export type PlatformStyle = 'round' | 'square';

// Single source of truth for param numeric ranges. backend/src/lib/catalog.ts
// (catalog → frontend sliders) and backend/src/lib/schema.ts (zod request
// validation) and shared/src/types.ts (RouterDecisionSchema validating LLM
// output) all read from here. Adding/widening a shape range requires editing
// only this object — R14 mitigation.
export const paramRanges = {
  box: {
    width:  { min: 0.1, max: 5 },
    height: { min: 0.1, max: 5 },
    depth:  { min: 0.1, max: 5 },
  },
  chest: {
    width:          { min: 0.2, max: 4 },
    height:         { min: 0.2, max: 4 },
    depth:          { min: 0.2, max: 4 },
    lidOpenRadians: { min: 0,   max: Math.PI },
  },
  cylinder: {
    radius:   { min: 0.1, max: 3 },
    height:   { min: 0.1, max: 5 },
    segments: { min: 3,   max: 64 },
  },
  sphere: {
    radius:      { min: 0.1, max: 3 },
    latSegments: { min: 2,   max: 32 },
    lonSegments: { min: 3,   max: 48 },
  },
  sword: {
    bladeLength: { min: 0.2,  max: 2.0 },
    bladeWidth:  { min: 0.02, max: 0.3 },
    gripLength:  { min: 0.05, max: 0.5 },
    pommelSize:  { min: 0.02, max: 0.2 },
  },
  hammer: {
    headWidth:    { min: 0.05, max: 1.0 },
    headDepth:    { min: 0.05, max: 0.5 },
    headHeight:   { min: 0.05, max: 0.5 },
    handleLength: { min: 0.1,  max: 2.0 },
    handleRadius: { min: 0.01, max: 0.15 },
  },
  platform: {
    size:      { min: 0.2,  max: 5 },
    thickness: { min: 0.02, max: 1 },
  },
} as const;

export interface BoxParams {
  shape: 'box';
  width: number;
  height: number;
  depth: number;
}

export interface ChestParams {
  shape: 'chest';
  width: number;
  height: number;
  depth: number;
  lidOpenRadians: number;
}

export interface CylinderParams {
  shape: 'cylinder';
  radius: number;
  height: number;
  segments: number;
}

export interface SphereParams {
  shape: 'sphere';
  radius: number;
  latSegments: number;
  lonSegments: number;
}

export interface SwordParams {
  shape: 'sword';
  bladeLength: number;
  bladeWidth: number;
  gripLength: number;
  pommelSize: number;
}

export interface HammerParams {
  shape: 'hammer';
  headWidth: number;
  headDepth: number;
  headHeight: number;
  handleLength: number;
  handleRadius: number;
}

export interface PlatformParams {
  shape: 'platform';
  style: PlatformStyle;
  size: number;
  thickness: number;
}

export interface TripoParams {
  shape: 'tripo';
  prompt: string;
}

export type GenerateParams =
  | BoxParams
  | ChestParams
  | CylinderParams
  | SphereParams
  | SwordParams
  | HammerParams
  | PlatformParams
  | TripoParams;

export type GeneratorSource = 'procedural' | 'tripo';

export interface LineageRecord {
  id: string;
  shape: ShapeId | 'tripo';
  params: GenerateParams;
  prompt?: string;
  llmDecision?: unknown;
  generatorSource: GeneratorSource;
  createdAt: string;
}

export interface GenerateResult {
  glbBytes: Uint8Array;
  lineageStub: Partial<LineageRecord>;
}

export interface Generator {
  generate(params: GenerateParams): Promise<GenerateResult>;
}

export interface RouteInput {
  shape?: ShapeId;
  params?: GenerateParams;
  prompt?: string;
}

export interface RouteResult {
  generator: Generator;
  lineageStub: Partial<LineageRecord>;
}

export interface Router {
  route(input: RouteInput): Promise<RouteResult>;
}

// Catalog returned by GET /api/shapes — drives frontend slider configuration.
// Backend is the single source of truth for param ranges.
export interface ParamFieldSpec {
  name: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

export interface ShapeSpec {
  id: ShapeId;
  label: string;
  fields: ParamFieldSpec[];
}

export type ShapeCatalog = ShapeSpec[];

// API response shapes.
// `glbBytes` is base64-encoded GLB (~33% size overhead vs binary, accepted
// for Phase 2 prototype simplicity over multipart).
// `lineageJson` is the full LineageRecord stringified — frontend turns it into
// bytes for Walrus upload alongside the GLB.
export interface GenerateResponse {
  glbBytes: string;
  lineageJson: string;
  lineageStub: Partial<LineageRecord>;
}

// --- Zod schemas (LLM structured-output contract) -------------------------
// These mirror the param interfaces above, bound to paramRanges so the LLM
// can't emit out-of-catalog values. Used by backend AnthropicRouter via
// zod-to-json-schema for Anthropic tool-use input_schema.

export const boxParamsSchema = z.object({
  shape: z.literal('box'),
  width:  z.number().min(paramRanges.box.width.min).max(paramRanges.box.width.max),
  height: z.number().min(paramRanges.box.height.min).max(paramRanges.box.height.max),
  depth:  z.number().min(paramRanges.box.depth.min).max(paramRanges.box.depth.max),
});

export const chestParamsSchema = z.object({
  shape: z.literal('chest'),
  width:  z.number().min(paramRanges.chest.width.min).max(paramRanges.chest.width.max),
  height: z.number().min(paramRanges.chest.height.min).max(paramRanges.chest.height.max),
  depth:  z.number().min(paramRanges.chest.depth.min).max(paramRanges.chest.depth.max),
  lidOpenRadians: z.number().min(paramRanges.chest.lidOpenRadians.min).max(paramRanges.chest.lidOpenRadians.max),
});

export const cylinderParamsSchema = z.object({
  shape: z.literal('cylinder'),
  radius:   z.number().min(paramRanges.cylinder.radius.min).max(paramRanges.cylinder.radius.max),
  height:   z.number().min(paramRanges.cylinder.height.min).max(paramRanges.cylinder.height.max),
  segments: z.number().int().min(paramRanges.cylinder.segments.min).max(paramRanges.cylinder.segments.max),
});

export const sphereParamsSchema = z.object({
  shape: z.literal('sphere'),
  radius:      z.number().min(paramRanges.sphere.radius.min).max(paramRanges.sphere.radius.max),
  latSegments: z.number().int().min(paramRanges.sphere.latSegments.min).max(paramRanges.sphere.latSegments.max),
  lonSegments: z.number().int().min(paramRanges.sphere.lonSegments.min).max(paramRanges.sphere.lonSegments.max),
});

export const swordParamsSchema = z.object({
  shape: z.literal('sword'),
  bladeLength: z.number().min(paramRanges.sword.bladeLength.min).max(paramRanges.sword.bladeLength.max),
  bladeWidth:  z.number().min(paramRanges.sword.bladeWidth.min).max(paramRanges.sword.bladeWidth.max),
  gripLength:  z.number().min(paramRanges.sword.gripLength.min).max(paramRanges.sword.gripLength.max),
  pommelSize:  z.number().min(paramRanges.sword.pommelSize.min).max(paramRanges.sword.pommelSize.max),
});

export const hammerParamsSchema = z.object({
  shape: z.literal('hammer'),
  headWidth:    z.number().min(paramRanges.hammer.headWidth.min).max(paramRanges.hammer.headWidth.max),
  headDepth:    z.number().min(paramRanges.hammer.headDepth.min).max(paramRanges.hammer.headDepth.max),
  headHeight:   z.number().min(paramRanges.hammer.headHeight.min).max(paramRanges.hammer.headHeight.max),
  handleLength: z.number().min(paramRanges.hammer.handleLength.min).max(paramRanges.hammer.handleLength.max),
  handleRadius: z.number().min(paramRanges.hammer.handleRadius.min).max(paramRanges.hammer.handleRadius.max),
});

export const platformParamsSchema = z.object({
  shape: z.literal('platform'),
  style: z.enum(['round', 'square']),
  size:      z.number().min(paramRanges.platform.size.min).max(paramRanges.platform.size.max),
  thickness: z.number().min(paramRanges.platform.thickness.min).max(paramRanges.platform.thickness.max),
});

export const tripoParamsSchema = z.object({
  shape: z.literal('tripo'),
  prompt: z.string().min(1).max(1000),
});

// All 7 procedural shape schemas, in catalog order. Backends and other
// consumers that want to gate against "no tripo here" should compose a
// discriminated union from this array (see backend/src/lib/schema.ts).
export const proceduralParamsSchemas = [
  boxParamsSchema,
  chestParamsSchema,
  cylinderParamsSchema,
  sphereParamsSchema,
  swordParamsSchema,
  hammerParamsSchema,
  platformParamsSchema,
] as const;

export const GenerateParamsSchema = z.discriminatedUnion('shape', [
  ...proceduralParamsSchemas,
  tripoParamsSchema,
]);

export const RouterDecisionSchema = z.object({
  generator: z.enum(['box', 'chest', 'cylinder', 'sphere', 'sword', 'hammer', 'platform', 'tripo']),
  params: GenerateParamsSchema,
  tags: z.array(z.string()).max(10),
});

export type RouterDecision = z.infer<typeof RouterDecisionSchema>;

// Summary view of a published Model3D Sui object, surfaced to the Browse UI.
// u64 fields are kept as strings to avoid bigint-across-JSON pain (D-015).
export interface Model3DSummary {
  objectId: string;            // Sui object ID
  blobId: string;              // Walrus blob ID (string form per D-015)
  creator: string;             // Sui address
  shapeType: string;           // 'box' | 'chest' | ... | 'tripo'
  paramsJson: string;
  name: string;
  directAccessPrice: string;   // u64 as string
  tags: string[];
  createdAtMs: string;         // u64 timestamp as string
  lineageBlobId: string;       // D-015
}
