---
title: "Subagent dispatch: tight reads + inline code skeletons survive; broad-read prompts die at 40-50K tokens"
date: 2026-05-15
category: conventions
module: compound-engineering-workflow
problem_type: convention
component: development_workflow
severity: high
tags:
  - subagents
  - compound-engineering
  - prompt-engineering
  - context-budget
  - dispatch-pattern
  - ce-work
applies_when:
  - "Dispatching a coding subagent (Agent tool, team-implementer, general-purpose) to build a multi-file unit of work"
  - "The unit has a defined scope (a plan unit U-X, a specific feature branch) and clear file boundaries"
  - "The orchestrator already has enough context to write a working skeleton — and is choosing how to hand off implementation"
related_components:
  - tooling
  - development_workflow
---

# Subagent dispatch: tight reads + inline code skeletons survive; broad-read prompts die at 40-50K tokens

## Context

Phase 2 executed 10 implementation units (U1-U10) across Move contracts, backend, and frontend — most dispatched as subagents in parallel or sequence to keep the orchestrator's main context lean. The first attempt at U5 (AnthropicRouter), U6 (lineage), and U7 (publishPtb) all **died mid-investigation**, with the subagent stopping at roughly 40-50K tokens consumed. The failure pattern was identical each time: a long opening read sweep ("Let me look at the auth/session hook... let me check schema.ts... let me see what router.ts does...") that exhausted the subagent's read budget before any code was written. The conversation typically ended on an incomplete thought like "Let me look at the..." with no final tool call.

The retry pattern that consistently succeeded: drop the open exploration, hand the subagent a **tight read list** (3-6 specific file paths) and a **detailed inline code skeleton** (10-30 lines of pseudo-implementation in the right language, with comments calling out the gaps and contract points). U5 retry, U6 retry, U7 retry — all three retries succeeded with this shape, producing working units that passed tests on first commit.

The principle: subagents have a fixed read/think budget, and broad "go figure out what to build" prompts blow it on context-gathering before any output happens. Tight, opinionated prompts shift the budget from discovery to construction.

## Guidance

**When dispatching a subagent for a defined unit of work:**

1. **State the goal in one sentence.** Not three; not a paragraph. "Build the AnthropicRouter class that routes prompts to Tripo or procedural generation based on Haiku tool-use."

2. **List 3-6 file paths to read.** Repo-relative. No glob, no "explore the codebase". If the subagent needs more, it'll ask. The orchestrator already knows which files are load-bearing — share that knowledge directly.

3. **Inline a skeleton of the target file(s).** Real code, real types, real imports — with `// TODO:` markers at the work points and short notes on why each piece exists. The subagent's job becomes "fill in the TODOs and write tests" instead of "design from scratch then code."

4. **State the test scenarios.** Bullet list, 4-8 items. The subagent doesn't need to invent coverage; planning already enumerated it.

5. **State the verification.** "Run `pnpm test backend` from repo root. All tests must pass. Commit with conventional message `feat(backend): add AnthropicRouter (U5)`."

6. **Bound the file scope.** "Touch only `backend/src/agent/router.ts`, `backend/src/agent/router.test.ts`, and add a top-level export in `backend/src/agent/index.ts`. Do not modify shared/, frontend/, or any other backend module."

**Anti-patterns to avoid:**

- ❌ "Read the codebase and figure out the right pattern."
- ❌ "Find similar code elsewhere and follow it."
- ❌ "Investigate the auth flow before implementing." (Investigation budget = orchestrator's job; subagent runs on findings, not on rediscovering them.)
- ❌ Quoting > 200 LOC of existing code in the prompt. If the subagent must read it, point to the path and trust the read; don't double the token cost by inlining.
- ❌ Hand-waving the type contract. ("Take a session object and return a JWT.") Spell out the type signature; the subagent will invent its own incorrect one otherwise.

## Why This Matters

1. **Subagent read budgets are finite and front-loaded.** A subagent that spends its first 30K tokens on `Read`/`Grep` walks into the implementation step with no headroom for thinking, writing tests, or recovering from mistakes. Tight prompts preserve that headroom for the work that actually matters.

2. **Read-truncation kills mid-thought.** Several Phase 2 subagent deaths happened mid-tool-use, with the conversation cutting off as the model attempted to read a 500+ line file. The model never recovers; the orchestrator gets a partial result and has to redispatch. Avoiding the trigger (broad reads of huge files) eliminates the failure mode.

3. **The orchestrator already paid for discovery.** Plan phase explored the codebase, identified files, and made decisions. Re-running that discovery in each subagent is double-billing the same context against the global token budget. Pass the result of discovery as input, not as a goal.

4. **Skeletons communicate intent better than prose.** A 20-line code skeleton with `// TODO:` markers is more precise than three paragraphs of "the function should...". The subagent reads the skeleton and immediately sees the type contract, error handling shape, dependencies, and integration points. Prose leaves room for divergent interpretations.

5. **The retry cost is asymmetric.** A dead subagent costs ~40K tokens for nothing. A tightly-scoped subagent costs ~20K tokens including a successful output. Even when the tight version takes the orchestrator longer to prepare (extra 5-10 min of skeleton-writing), the system-wide cost is lower.

6. **It scales with parallel dispatch.** When firing N subagents in parallel (parallel-feature-development pattern), one death blocks the whole batch's review. The marginal cost of writing tighter prompts shrinks per subagent; the cost of one bad output blocking the merge ramp grows.

## When to Apply

- Spawning any subagent for "implementation" rather than "exploration"
- Dispatching parallel units of work where any individual failure blocks the next phase
- Working within tight overall token budgets (long sessions, fast-paced sprints like hackathons)
- Onboarding a new contributor to compound-engineering patterns — the dispatch shape is the lesson
- Writing a plan that will be fed to `/ce-work` — pre-baking inline skeletons in the plan units accelerates execution dispatch

**When NOT to apply (still use broad prompts):**

- Genuine discovery / investigation subagents (the `Explore` or `ce-repo-research-analyst` agents) — their job IS to read broadly and return findings. Their prompt should be broad.
- Open-ended "review this PR" passes — code-review personas need full diff context to do their job.
- Bug debugging where the root cause is unknown — investigation is the whole task.

The pattern targets **implementation** subagents, not investigation ones.

## Examples

### Anti-pattern (Phase 2 U5 first attempt — died)

```
Dispatch the team-implementer subagent with this prompt:

"Build the AnthropicRouter class. It should route generation requests
between Tripo (for complex shapes) and procedural generators (for catalog
shapes) using Claude Haiku tool-use. Look at the existing backend
structure under backend/src/agent/ and follow established patterns. Add
appropriate tests. Make sure it integrates with the rest of the backend."
```

Subagent reads `backend/src/agent/`, then `backend/src/lib/`, then `backend/src/routes/`, then `shared/src/types.ts`, then the test files for similar... and dies at ~45K tokens having produced no output.

### Pattern (Phase 2 U5 retry — succeeded)

```
Dispatch the team-implementer subagent with this prompt:

"Implement U5: backend/src/agent/router.ts (new file) + router.test.ts.

Read these files:
- shared/src/types.ts (lines 1-280, RouterDecisionSchema + GenerateParams + TripoParams)
- backend/src/agent/index.ts (existing exports)
- backend/src/routes/generate.ts (caller of the router)
- backend/CLAUDE.md (project conventions)

Goal: AnthropicRouter calls Anthropic Haiku with the RouterDecisionSchema
as a tool-use input_schema, returns RouterDecision. HardcodedRouter is a
fallback when ANTHROPIC_API_KEY is unset.

Skeleton:

  // backend/src/agent/router.ts
  import Anthropic from '@anthropic-ai/sdk';
  import { z } from 'zod';
  import { RouterDecisionSchema, type RouterDecision } from '@overflow2026/shared';
  import { zodToJsonSchema } from 'zod-to-json-schema';

  const ROUTER_MODEL = 'claude-haiku-4-5-20251001';

  export interface Router {
    route(prompt: string): Promise<RouterDecision>;
  }

  export class AnthropicRouter implements Router {
    private client: Anthropic;
    constructor(apiKey: string) { this.client = new Anthropic({ apiKey }); }
    async route(prompt: string): Promise<RouterDecision> {
      // TODO: build messages array; system prompt explains routing rules
      // TODO: call messages.create with tools=[{name:'choose', input_schema: zodToJsonSchema(RouterDecisionSchema)}]
      // TODO: extract tool_use block, parse with RouterDecisionSchema.parse
      // TODO: handle no-tool-use response (fallback to procedural)
    }
  }

  export class HardcodedRouter implements Router {
    async route(prompt: string): Promise<RouterDecision> {
      // TODO: simple keyword match on prompt → return RouterDecision
      // Used when ANTHROPIC_API_KEY missing (CI, local dev w/o key)
    }
  }

Test scenarios:
- AnthropicRouter returns RouterDecisionSchema-valid output on a procedural prompt
- AnthropicRouter handles 'tripo' route (complex prompt)
- HardcodedRouter never throws and always returns a valid RouterDecision
- Both routers handle empty prompt gracefully
- Mock Anthropic SDK via vi.mock; do not call real API in tests

Files: ONLY backend/src/agent/router.ts and router.test.ts. Add export
in backend/src/agent/index.ts. Do not touch other modules.

Verification: run 'pnpm test backend' from repo root. Commit
'feat(backend): add AnthropicRouter (U5)'."
```

Result: subagent reads the 4 listed files, fills in the 4 TODOs, writes 9 tests, runs the suite green, commits. ~22K tokens total.

### The shape generalizes

The pattern of: **1 sentence goal → 3-6 file reads → inline skeleton with TODOs → 4-8 test scenarios → file scope bound → verification command** works for Move, TypeScript, React, and Rust subagent dispatches alike. The skeleton language changes; the structure doesn't.

## Related Issues

- `docs/plans/2026-05-14-002-feat-phase-2-sui-integration-plan.md` — the source plan whose U-IDs each became a subagent dispatch; the plan's Approach + Files + Test scenarios sections were the first draft of every dispatch prompt
- Phase 2 phase-progress.md "Notes for Next Session" — first observed the 40-50K failure threshold during U5/U6/U7 retries
- `compound-engineering:team-implementer` agent definition — the target agent that the dispatch pattern shapes its prompt for
- `compound-engineering:parallel-feature-development` skill — uses this same dispatch shape across N parallel units; the convention is named here for centralized reference
- Claude Code Agent tool docs (system prompt) — "Brief the agent like a smart colleague who just walked into the room"; this doc operationalizes that line for implementation work specifically
