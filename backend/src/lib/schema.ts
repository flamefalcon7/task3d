import { z } from 'zod';
import { paramRanges } from '@overflow2026/shared';

// Mirrors GenerateParams discriminated union in @overflow2026/shared.
// Ranges sourced from paramRanges (shared/src/types.ts) — the single source
// of truth shared with the catalog (frontend sliders) and the LLM router's
// RouterDecisionSchema. Add a shape by editing paramRanges in shared.
const boxSchema = z.object({
  shape: z.literal('box'),
  width:  z.number().min(paramRanges.box.width.min).max(paramRanges.box.width.max),
  height: z.number().min(paramRanges.box.height.min).max(paramRanges.box.height.max),
  depth:  z.number().min(paramRanges.box.depth.min).max(paramRanges.box.depth.max),
});

const chestSchema = z.object({
  shape: z.literal('chest'),
  width:  z.number().min(paramRanges.chest.width.min).max(paramRanges.chest.width.max),
  height: z.number().min(paramRanges.chest.height.min).max(paramRanges.chest.height.max),
  depth:  z.number().min(paramRanges.chest.depth.min).max(paramRanges.chest.depth.max),
  lidOpenRadians: z.number().min(paramRanges.chest.lidOpenRadians.min).max(paramRanges.chest.lidOpenRadians.max),
});

const cylinderSchema = z.object({
  shape: z.literal('cylinder'),
  radius:   z.number().min(paramRanges.cylinder.radius.min).max(paramRanges.cylinder.radius.max),
  height:   z.number().min(paramRanges.cylinder.height.min).max(paramRanges.cylinder.height.max),
  segments: z.number().int().min(paramRanges.cylinder.segments.min).max(paramRanges.cylinder.segments.max),
});

const sphereSchema = z.object({
  shape: z.literal('sphere'),
  radius:      z.number().min(paramRanges.sphere.radius.min).max(paramRanges.sphere.radius.max),
  latSegments: z.number().int().min(paramRanges.sphere.latSegments.min).max(paramRanges.sphere.latSegments.max),
  lonSegments: z.number().int().min(paramRanges.sphere.lonSegments.min).max(paramRanges.sphere.lonSegments.max),
});

const swordSchema = z.object({
  shape: z.literal('sword'),
  bladeLength: z.number().min(paramRanges.sword.bladeLength.min).max(paramRanges.sword.bladeLength.max),
  bladeWidth:  z.number().min(paramRanges.sword.bladeWidth.min).max(paramRanges.sword.bladeWidth.max),
  gripLength:  z.number().min(paramRanges.sword.gripLength.min).max(paramRanges.sword.gripLength.max),
  pommelSize:  z.number().min(paramRanges.sword.pommelSize.min).max(paramRanges.sword.pommelSize.max),
});

const hammerSchema = z.object({
  shape: z.literal('hammer'),
  headWidth:    z.number().min(paramRanges.hammer.headWidth.min).max(paramRanges.hammer.headWidth.max),
  headDepth:    z.number().min(paramRanges.hammer.headDepth.min).max(paramRanges.hammer.headDepth.max),
  headHeight:   z.number().min(paramRanges.hammer.headHeight.min).max(paramRanges.hammer.headHeight.max),
  handleLength: z.number().min(paramRanges.hammer.handleLength.min).max(paramRanges.hammer.handleLength.max),
  handleRadius: z.number().min(paramRanges.hammer.handleRadius.min).max(paramRanges.hammer.handleRadius.max),
});

const platformSchema = z.object({
  shape: z.literal('platform'),
  style: z.enum(['round', 'square']),
  size:      z.number().min(paramRanges.platform.size.min).max(paramRanges.platform.size.max),
  thickness: z.number().min(paramRanges.platform.thickness.min).max(paramRanges.platform.thickness.max),
});

export const generateParamsSchema = z.discriminatedUnion('shape', [
  boxSchema,
  chestSchema,
  cylinderSchema,
  sphereSchema,
  swordSchema,
  hammerSchema,
  platformSchema,
]);

export type ValidatedGenerateParams = z.infer<typeof generateParamsSchema>;

// Phase 2: /api/generate accepts either { prompt } (LLM mode) or the flat
// params shape (slider/backward-compat mode). The route handler branches on
// which variant validated.
export const promptRequestSchema = z.object({
  prompt: z.string().min(1).max(1000),
});

export type ValidatedPromptRequest = z.infer<typeof promptRequestSchema>;

export const generateResponseSchema = z.object({
  glbBytes: z.string(),
  lineageJson: z.string(),
  lineageStub: z.unknown(),
});

export type ValidatedGenerateResponse = z.infer<typeof generateResponseSchema>;
