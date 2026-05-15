import type { ShapeCatalog } from '@overflow2026/shared';
import { paramRanges } from '@overflow2026/shared';

// Single source of truth for shape param ranges is paramRanges in shared/.
// This catalog adds presentation metadata (label / step / default) on top of
// those numeric bounds; zod schemas (backend) + RouterDecisionSchema (shared)
// also read from paramRanges so LLM output, request validation, and slider
// UI can never drift.
export const SHAPE_CATALOG: ShapeCatalog = [
  {
    id: 'box',
    label: 'Box',
    fields: [
      { name: 'width',  label: 'Width',  ...paramRanges.box.width,  step: 0.1, default: 1 },
      { name: 'height', label: 'Height', ...paramRanges.box.height, step: 0.1, default: 1 },
      { name: 'depth',  label: 'Depth',  ...paramRanges.box.depth,  step: 0.1, default: 1 },
    ],
  },
  {
    id: 'chest',
    label: 'Treasure Chest',
    fields: [
      { name: 'width',  label: 'Width',  ...paramRanges.chest.width,  step: 0.1, default: 1.4 },
      { name: 'height', label: 'Height', ...paramRanges.chest.height, step: 0.1, default: 1.0 },
      { name: 'depth',  label: 'Depth',  ...paramRanges.chest.depth,  step: 0.1, default: 0.9 },
      { name: 'lidOpenRadians', label: 'Lid open', ...paramRanges.chest.lidOpenRadians, step: 0.05, default: 0.6 },
    ],
  },
  {
    id: 'cylinder',
    label: 'Cylinder',
    fields: [
      { name: 'radius',   label: 'Radius',   ...paramRanges.cylinder.radius,   step: 0.1, default: 0.5 },
      { name: 'height',   label: 'Height',   ...paramRanges.cylinder.height,   step: 0.1, default: 1 },
      { name: 'segments', label: 'Segments', ...paramRanges.cylinder.segments, step: 1,   default: 24 },
    ],
  },
  {
    id: 'sphere',
    label: 'Sphere',
    fields: [
      { name: 'radius',      label: 'Radius',    ...paramRanges.sphere.radius,      step: 0.1, default: 0.5 },
      { name: 'latSegments', label: 'Latitude',  ...paramRanges.sphere.latSegments, step: 1,   default: 12 },
      { name: 'lonSegments', label: 'Longitude', ...paramRanges.sphere.lonSegments, step: 1,   default: 20 },
    ],
  },
  {
    id: 'sword',
    label: 'Sword',
    fields: [
      { name: 'bladeLength', label: 'Blade length', ...paramRanges.sword.bladeLength, step: 0.05, default: 1.0 },
      { name: 'bladeWidth',  label: 'Blade width',  ...paramRanges.sword.bladeWidth,  step: 0.01, default: 0.1 },
      { name: 'gripLength',  label: 'Grip length',  ...paramRanges.sword.gripLength,  step: 0.01, default: 0.2 },
      { name: 'pommelSize',  label: 'Pommel size',  ...paramRanges.sword.pommelSize,  step: 0.01, default: 0.08 },
    ],
  },
  {
    id: 'hammer',
    label: 'Hammer',
    fields: [
      { name: 'headWidth',    label: 'Head width',    ...paramRanges.hammer.headWidth,    step: 0.05, default: 0.3 },
      { name: 'headDepth',    label: 'Head depth',    ...paramRanges.hammer.headDepth,    step: 0.05, default: 0.15 },
      { name: 'headHeight',   label: 'Head height',   ...paramRanges.hammer.headHeight,   step: 0.05, default: 0.2 },
      { name: 'handleLength', label: 'Handle length', ...paramRanges.hammer.handleLength, step: 0.05, default: 0.8 },
      { name: 'handleRadius', label: 'Handle radius', ...paramRanges.hammer.handleRadius, step: 0.01, default: 0.04 },
    ],
  },
  {
    id: 'platform',
    label: 'Platform',
    fields: [
      // `style` is a discriminator, not a slider — frontend renders it as a
      // toggle. Catalog field still emitted so the UI knows the option exists.
      { name: 'size',      label: 'Size',      ...paramRanges.platform.size,      step: 0.1,  default: 1.0 },
      { name: 'thickness', label: 'Thickness', ...paramRanges.platform.thickness, step: 0.01, default: 0.1 },
    ],
  },
];
