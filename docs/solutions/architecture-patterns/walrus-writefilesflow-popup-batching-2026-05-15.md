---
title: "Walrus writeFilesFlow batches N files into 2 wallet popups, not 2N"
date: 2026-05-15
category: architecture-patterns
module: walrus-upload
problem_type: architecture_pattern
component: tooling
severity: medium
tags:
  - walrus
  - quilt
  - wallet-ux
  - dapp-kit
  - mint-flow
applies_when:
  - "Designing a creator-mint UX where one click uploads multiple files (GLB + lineage.json, image + metadata, etc.) to Walrus"
  - "Showing the user a popup-count indicator (e.g., `popup 1 of N`) so they don't think the dApp is stuck"
  - "Sizing wallet popup batching expectations into onboarding copy or QA test scripts"
related_components:
  - frontend
  - walrus
---

# Walrus writeFilesFlow batches N files into 2 wallet popups, not 2N

## Context

When `useWalrusUpload({ files: [glb, lineageJson] })` runs (Phase 2 U3), how many wallet popups should the user expect? Two? Four (one per file × register + certify)? Something in between? This was open question **OQ-014** on the spec.md plan.

The answer matters because:

- Phase 2 creator flow needs an honest UX label ("Approve 2 popups to publish your model")
- The MintButton component (frontend/src/creator/MintButton.tsx) exposes a `popupCount` prop so the user can see progress against the total
- Wallet UX rejection rate climbs sharply when popup count is unexpected — onboarding copy that says "2 popups" then fires 4 is a trust break
- Phase 5 demo video script depends on getting the count right; if it's wrong on first play, viewers won't read the on-screen guidance

Surprise answer: `writeFilesFlow([file1, file2, ..., fileN])` always produces **exactly 2 popups** — register + certify — regardless of N. The SDK encodes the N files into a single quilt blob internally, then runs `writeBlobFlow` (single blob, single register, single certify). Verified against `@mysten/walrus@1.1.7` source at `dist/flows/write-files.mjs`.

For the full Phase 2 mint flow, total popups = 2 (Walrus) + 1 (`model3d::publish_and_share` PTB) = **3 popups end-to-end**.

## Guidance

**State the popup count in plain language, derived from the SDK, not from a count of files.**

In code, hardcode the constant for the Walrus portion and add a one-line note pointing to the SDK source:

```ts
// frontend/src/walrus/useWalrusUpload.ts

// writeFilesFlow encodes N files into a single quilt blob then delegates
// to writeBlobFlow → 1 register + 1 certify regardless of file count. So
// popupCount = 2 for the Walrus portion of any creator flow; the mint
// adds a third popup for the model3d::publish_and_share PTB.
// Verified against @mysten/walrus@1.1.7 source (dist/flows/write-files.mjs).
const WALRUS_POPUP_COUNT = 2;
```

In the UI, derive total = walrus_popups + ptb_popups:

```tsx
// frontend/src/creator/MintButton.tsx
<MintButton
  popupCount={uploadPopupCount + 1 /* publish_and_share */}
  // ...
/>
```

In copy, address the user with the total, not the breakdown:

> **"Sign 3 transactions to publish your model."**
> 1. Approve Walrus storage (register)
> 2. Approve Walrus storage (certify)
> 3. Approve publish to Sui

## Why This Matters

1. **The intuitive expectation is wrong.** Most devs reading "upload 2 files to decentralized storage" assume 2 (or 4) operations. The SDK's quilt batching is invisible from the call site. Reading the SDK source once and naming the constant in code prevents the next person from re-discovering it.

2. **Test mocks must match the real popup count.** A test that mocks `executeRegister` and `executeCertify` once each will pass — but if anyone refactors `useWalrusUpload` to loop per-file (a plausible "improvement" without context), tests still pass and production breaks. Pin the mock to the real flow shape.

3. **Wallet UX rejection compounds across popups.** Even at 95% per-popup approve rate, 3 popups means ~14% drop-off end-to-end. Saving 2 popups (vs naive 2N approach for N=2) cuts drop-off in half. Knowing this is structural to Walrus, not an optimization we did, is worth a 4-line comment.

4. **Resume-from-failure semantics are file-count-independent.** Because the SDK consolidates into one blob, a retry after `executeRegister` failure retries the whole batch, not per-file. Error-recovery UX should never display "retry file 2 of 4" — it's always "retry the upload."

## When to Apply

- Anytime the creator/mint flow uploads K files to Walrus in one user-initiated operation
- When sizing wallet popup expectations for onboarding screens, tooltips, or progress bars
- Writing tests for upload hooks — assert `executeRegister` called 1x, `executeCertify` called 1x, regardless of file count
- Reviewing PRs that change the upload hook — confirm popup count remains 2 + (N transactions chained after)
- Updating the demo video script — total popups must match the real flow

## Examples

### Current Phase 2 flow

```
User clicks "Mint"
  │
  ├── Walrus register (1 popup)        ← writeFilesFlow.executeRegister
  ├── Walrus relay upload (0 popups)   ← writeFilesFlow.upload
  ├── Walrus certify  (1 popup)        ← writeFilesFlow.executeCertify
  └── Sui publish_and_share (1 popup)  ← signAndExecute(buildPublishPtb(...))

Total popups: 3
Files uploaded: 2 (model.glb + lineage.json)
```

### What would break popup count

```ts
// ❌ Anti-pattern — loops one file at a time
for (const file of files) {
  const flow = client.walrus.writeBlobFlow({ blob: file });  // each call = 2 popups
  await flow.executeRegister(...);
  await flow.upload(...);
  await flow.executeCertify(...);
}
// Total Walrus popups: 2 * N (for our N=2 case, that's 4)
```

This anti-pattern is what intuition suggests and what someone "simplifying" might write — call out the quilt batching in the function-level comment to prevent it.

### Caveat: rejection-retry inflates the count

If the user rejects the register popup, then clicks "retry" via the MintButton error state, the count grows by 1 per retry cycle (the certify popup hasn't fired yet, so resume from register). The displayed `popupCount` is the **happy-path total**, not the worst-case. Don't try to track retries in the same counter — that's overengineering for a flow where the user already sees the error and decides to retry.

## Related Issues

- `docs/open-questions.md` OQ-014 — resolved by this learning (popup count for N-file Walrus upload)
- `docs/spec.md` §2.5 — references the upload-relay requirement that gives us `relay-upload` as a non-popup stage
- `frontend/src/walrus/useWalrusUpload.ts:41-46` — inline source comment with the same insight; this doc is the discoverable index
- `frontend/src/creator/MintButton.tsx` — consumer of `popupCount` in the UI
- `@mysten/walrus@1.1.7` source: `dist/flows/write-files.mjs` — authoritative for the quilt-then-writeBlob delegation pattern; re-verify if upgrading the Walrus SDK
- `docs/decisions.md` D-015 (lineage_blob_id field) — explains why we upload 2 files in the first place (GLB + lineage.json provenance record)
