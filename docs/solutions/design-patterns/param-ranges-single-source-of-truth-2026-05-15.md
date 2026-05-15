---
title: "Shape `paramRanges` as single source of truth across shared / backend / frontend"
date: 2026-05-15
category: design-patterns
module: shape-catalog
problem_type: design_pattern
component: tooling
severity: medium
tags:
  - typescript
  - monorepo
  - zod
  - schema-drift
  - constraint-sharing
applies_when:
  - "A numeric constraint (min/max/step) is consumed by ≥2 of: request validation, UI input controls, LLM/agent prompt schema"
  - "The same constraint would otherwise be duplicated in zod, slider props, and a prompt's tool-use input_schema"
  - "Workspaces are arranged in a typed monorepo (shared/, backend/, frontend/) where a `shared` package is already the type-sharing seam"
related_components:
  - backend
  - frontend
  - shared
---

# Shape `paramRanges` as single source of truth across shared / backend / frontend

## Context

The 3D model generator has 7 shape types (`box`, `chest`, `cylinder`, `sphere`, `sword`, `hammer`, `platform`), each with 3-5 numeric parameters. Each parameter has a min, max, and step that need to land in **three** places:

1. **Backend zod schema** (`backend/src/lib/schema.ts`) — validates inbound `/api/generate` requests
2. **Frontend shape catalog** (`backend/src/lib/catalog.ts`, served to the UI) — drives slider min/max/step
3. **LLM tool-use input_schema** (`shared/src/types.ts` → `RouterDecisionSchema`) — constrains what the Anthropic Haiku router can propose for prompt-mode generation

If those three drift, the failure mode is silent but bad: the UI lets a user pick `width=10`, the backend rejects with 422, OR the LLM proposes `bladeLength=5` (out of catalog) and the procedural generator crashes mid-frame. Phase 2 R14 (post-implementation review) flagged the schema duplication explicitly — three near-identical literal blocks would drift before the demo if left.

The pattern that fixes this: **define every `(shape, param) → {min, max}` pair once in `shared/src/types.ts` as a plain object literal called `paramRanges`, then have every consumer read from it.** No code generation, no runtime synchronization, no build step beyond the existing TypeScript pipeline.

## Guidance

**One declaration:**

```ts
// shared/src/types.ts
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
  // ... cylinder, sphere, sword, hammer, platform
} as const;
```

The `as const` is important — it preserves literal types so consumers can spread into typed structs without `as` casts.

**Three consumers, each reads from `paramRanges`:**

```ts
// backend/src/lib/schema.ts — zod request validation
import { paramRanges } from '@overflow2026/shared';
const boxSchema = z.object({
  shape: z.literal('box'),
  width:  z.number().min(paramRanges.box.width.min).max(paramRanges.box.width.max),
  height: z.number().min(paramRanges.box.height.min).max(paramRanges.box.height.max),
  depth:  z.number().min(paramRanges.box.depth.min).max(paramRanges.box.depth.max),
});
```

```ts
// backend/src/lib/catalog.ts — slider catalog (presentation layer adds step/default)
import { paramRanges } from '@overflow2026/shared';
export const SHAPE_CATALOG = [
  {
    id: 'box',
    fields: [
      { name: 'width',  ...paramRanges.box.width,  step: 0.1, default: 1 },
      { name: 'height', ...paramRanges.box.height, step: 0.1, default: 1 },
      { name: 'depth',  ...paramRanges.box.depth,  step: 0.1, default: 1 },
    ],
  },
  // ...
];
```

```ts
// shared/src/types.ts — RouterDecisionSchema for LLM tool-use input_schema
const boxParamsSchema = z.object({
  shape: z.literal('box'),
  width:  z.number().min(paramRanges.box.width.min).max(paramRanges.box.width.max),
  height: z.number().min(paramRanges.box.height.min).max(paramRanges.box.height.max),
  depth:  z.number().min(paramRanges.box.depth.min).max(paramRanges.box.depth.max),
});
```

**To add a shape:** edit `paramRanges` once. The TS type system fans out — zod schemas, catalog, and router schema all reference the new entry by key. The compiler will surface any missed consumer.

**To tighten a bound** (e.g., the demo run shows `width=5` is too unwieldy, drop to `4`): change `paramRanges.box.width.max` in shared. All three call sites pick it up on the next compile.

## Why This Matters

1. **Silent drift is the failure mode.** Drifted zod / catalog / LLM bounds don't surface in any single test — each piece passes its own tests in isolation. The bug only manifests when a user (or the LLM) picks a value in the gap. Centralizing the constants makes drift a compile/type error, not a runtime mystery.

2. **The LLM schema is the most fragile.** Anthropic tool-use uses JSON Schema; zod-to-json-schema converts the zod object to that format and pushes the result into the API call. If the LLM's allowed range differs from backend zod, the LLM may propose validate-failing values *every call*, costing money on retries. Pinning both to `paramRanges` eliminates the entire class.

3. **The pattern survives schema-shape evolution.** When `chest` gained `lidOpenRadians` after Phase 1, adding the field to `paramRanges.chest` plus one zod field on `chestSchema` and one catalog entry on `chest.fields` was the whole change. No cross-cutting hunt; no risk of forgetting one consumer.

4. **It scales beyond shapes.** The pattern generalizes to any `(category, attribute) → numeric-range` mapping: license royalty caps (already at 30% in Move), file size limits, image dimensions, retry budgets. When the same number lands in zod + UI + agent schema, hoist it to shared as a constant.

5. **No runtime cost.** Spreading literal types (`...paramRanges.box.width`) compiles to identical JS as inline values. The savings is entirely in maintenance correctness, not bytes.

## When to Apply

- Adding a constraint that will be checked at the API boundary AND surfaced in a UI control
- Designing an LLM tool's input_schema where the agent must stay within enforceable bounds
- Reviewing a PR that introduces a magic number — ask "where else might this need to live?" before merging
- Refactoring two-place duplication into one — even if the third consumer doesn't exist yet
- Onboarding a new shape, scope, or category — the existing `paramRanges` entries become the template for adding the next

## Examples

### Before (Phase 1, duplicated)

```ts
// backend/src/lib/schema.ts
const boxSchema = z.object({
  width:  z.number().min(0.1).max(5),     // ← literal in backend
  height: z.number().min(0.1).max(5),
});

// backend/src/lib/catalog.ts
const SHAPE_CATALOG = [{
  id: 'box',
  fields: [
    { name: 'width',  min: 0.1, max: 5, step: 0.1 },  // ← literal in catalog
    { name: 'height', min: 0.1, max: 5, step: 0.1 },
  ],
}];

// shared/src/router-schema.ts (older draft, not in current code)
const routerBoxSchema = z.object({
  width:  z.number().min(0.1).max(5),     // ← literal again
  height: z.number().min(0.1).max(5),
});
```

Three places. Adding a shape required three coordinated edits. Tightening `max=5` to `max=4` likewise.

### After (Phase 2 R14)

One `paramRanges` literal in `shared/src/types.ts:20-90`. Three consumers (zod schema, catalog, router schema), each reads via `paramRanges.box.width.min` or spreads `...paramRanges.box.width`. Adding the `sword` shape was a single 6-line addition to `paramRanges` + a zod object + a catalog entry + a router-schema object — all using the same constants.

### What NOT to do

```ts
// ❌ Don't compute ranges at runtime in each consumer
const boxSchema = z.object({
  width: z.number().min(getMinFor('box', 'width')).max(getMaxFor('box', 'width')),
});
```

This adds indirection without benefit. The constants are literal — accessing them as `paramRanges.box.width.min` is already direct, type-safe, and zero-runtime-cost.

```ts
// ❌ Don't move paramRanges into JSON or a config file
// shape-config.json — fetched at boot, no compile-time check
```

You lose `as const` literal typing, the TS compiler can't catch missing keys, and the LLM prompt schema needs the values inline at build time anyway.

```ts
// ❌ Don't add a Zod helper that wraps the access
function bounded(shape: string, param: string) {
  return z.number().min(paramRanges[shape][param].min).max(paramRanges[shape][param].max);
}
```

Looks DRY but loses type safety (string-keyed lookup) and saves ~4 chars per call site. The direct form (`z.number().min(paramRanges.box.width.min).max(paramRanges.box.width.max)`) is verbose-but-checked; the helper trades correctness for compactness.

## Related Issues

- `docs/decisions.md` D-014 (shape catalog schema) — the original Phase 1 decision that introduced ShapeCatalog; this pattern is the Phase 2 evolution
- `shared/src/types.ts` lines 20-90 — the live `paramRanges` declaration
- `backend/src/lib/schema.ts` lines 1-10 — the comment block at the top documents the pattern in-code; this doc is the discoverable index
- `backend/src/lib/catalog.ts` lines 1-9 — same
- R14 review (`docs/plans/2026-05-14-002-feat-phase-2-sui-integration-plan.md` U6 + post-code-review batch) — the review that surfaced the duplication and made this an explicit refactor target
