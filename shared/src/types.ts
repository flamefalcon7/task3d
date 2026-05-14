// Type contracts shared between browser (frontend) and server (backend).
// Per D-011: Generator interface so Phase 2 LLM router and Phase 3 Tripo
// generator can slot in behind the same contract without caller refactor.

export type ShapeId = 'box' | 'chest' | 'cylinder' | 'sphere' | 'sword' | 'hammer' | 'platform';

export type PlatformStyle = 'round' | 'square';

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

export type GenerateParams =
  | BoxParams
  | ChestParams
  | CylinderParams
  | SphereParams
  | SwordParams
  | HammerParams
  | PlatformParams;

export type GeneratorSource = 'procedural' | 'tripo';

export interface LineageRecord {
  id: string;
  shape: ShapeId;
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
  shape: ShapeId;
  params: GenerateParams;
  // Phase 2 widens to also accept `prompt: string` for LLM routing.
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
