import { z } from 'zod';

// Mirrors GenerateParams discriminated union in @overflow2026/shared.
// Ranges aligned with backend/src/lib/catalog.ts (the UI source of truth).
// Keep these in sync when adding a new shape or widening a slider.
const boxSchema = z.object({
  shape: z.literal('box'),
  width:  z.number().min(0.1).max(5),
  height: z.number().min(0.1).max(5),
  depth:  z.number().min(0.1).max(5),
});

const chestSchema = z.object({
  shape: z.literal('chest'),
  width:  z.number().min(0.2).max(4),
  height: z.number().min(0.2).max(4),
  depth:  z.number().min(0.2).max(4),
  lidOpenRadians: z.number().min(0).max(Math.PI),
});

const cylinderSchema = z.object({
  shape: z.literal('cylinder'),
  radius:   z.number().min(0.1).max(3),
  height:   z.number().min(0.1).max(5),
  segments: z.number().int().min(3).max(64),
});

const sphereSchema = z.object({
  shape: z.literal('sphere'),
  radius:      z.number().min(0.1).max(3),
  latSegments: z.number().int().min(2).max(32),
  lonSegments: z.number().int().min(3).max(48),
});

export const generateParamsSchema = z.discriminatedUnion('shape', [
  boxSchema,
  chestSchema,
  cylinderSchema,
  sphereSchema,
]);

export type ValidatedGenerateParams = z.infer<typeof generateParamsSchema>;
