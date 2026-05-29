/// <reference types="vite/client" />

// Build-time constant injected by vite `define` in vite.config.ts (S7 masthead,
// plan-022 / D-072). Commit count on `main` resolved at build; sentinel 0 when
// unresolvable (the Masthead drops the `№` token in that case — KD-4 / AC-4).
declare const __ISSUE_NUMBER__: number;
