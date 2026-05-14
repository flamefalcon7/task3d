import type { ShapeCatalog } from '@overflow2026/shared';

// Single source of truth for shape param ranges. Frontend consumes via
// GET /api/shapes to build slider UI; backend zod schemas mirror these bounds.
export const SHAPE_CATALOG: ShapeCatalog = [
  {
    id: 'box',
    label: 'Box',
    fields: [
      { name: 'width',  label: 'Width',  min: 0.1, max: 5, step: 0.1, default: 1 },
      { name: 'height', label: 'Height', min: 0.1, max: 5, step: 0.1, default: 1 },
      { name: 'depth',  label: 'Depth',  min: 0.1, max: 5, step: 0.1, default: 1 },
    ],
  },
  {
    id: 'chest',
    label: 'Treasure Chest',
    fields: [
      { name: 'width',  label: 'Width',  min: 0.2, max: 4, step: 0.1, default: 1.4 },
      { name: 'height', label: 'Height', min: 0.2, max: 4, step: 0.1, default: 1.0 },
      { name: 'depth',  label: 'Depth',  min: 0.2, max: 4, step: 0.1, default: 0.9 },
      { name: 'lidOpenRadians', label: 'Lid open', min: 0, max: Math.PI, step: 0.05, default: 0.6 },
    ],
  },
  {
    id: 'cylinder',
    label: 'Cylinder',
    fields: [
      { name: 'radius',   label: 'Radius',   min: 0.1, max: 3, step: 0.1, default: 0.5 },
      { name: 'height',   label: 'Height',   min: 0.1, max: 5, step: 0.1, default: 1 },
      { name: 'segments', label: 'Segments', min: 3,   max: 64, step: 1, default: 24 },
    ],
  },
  {
    id: 'sphere',
    label: 'Sphere',
    fields: [
      { name: 'radius',      label: 'Radius',     min: 0.1, max: 3, step: 0.1, default: 0.5 },
      { name: 'latSegments', label: 'Latitude',   min: 2,   max: 32, step: 1, default: 12 },
      { name: 'lonSegments', label: 'Longitude',  min: 3,   max: 48, step: 1, default: 20 },
    ],
  },
];
