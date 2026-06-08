import { describe, it, expect } from 'vitest';
import { modelDescription, modelDescriptionLabel } from './modelDescription.js';
import type { Model3DSummary } from './types.js';

// Minimal Model3DSummary stub — only paramsJson matters to the resolver.
function makeModel(paramsJson: string, shapeType = 'tripo'): Model3DSummary {
  return {
    objectId: '0xmodel',
    blobId: 'blob',
    collectionId: '0xcol',
    patchId: '',
    creator: '0xcreator',
    shapeType,
    paramsJson,
    name: 'a model',
    directAccessPrice: '0',
    tags: [],
    partLabels: [],
    createdAtMs: '0',
    lineageBlobId: '',
    glbBlobId: '',
    derivativeMintFee: '0',
    accessFee: '0',
    derivativeRoyaltyBps: 0,
    policy: 2,
  } as Model3DSummary;
}

describe('modelDescription', () => {
  it('AE1: Tripo prompt → { text, kind:"prompt" }', () => {
    const m = makeModel(JSON.stringify({ prompt: 'a low-poly red sports car' }));
    expect(modelDescription(m)).toEqual({ text: 'a low-poly red sports car', kind: 'prompt' });
  });

  it('AE2: captioned upload → { text, kind:"caption" }', () => {
    const m = makeModel(JSON.stringify({ source: 'upload', caption: 'a chunky walrus' }), 'box');
    expect(modelDescription(m)).toEqual({ text: 'a chunky walrus', kind: 'caption' });
  });

  it('AE3/R6: uncaptioned upload → null', () => {
    const m = makeModel(JSON.stringify({ source: 'upload' }), 'box');
    expect(modelDescription(m)).toBeNull();
  });

  it('empty/whitespace prompt → null (no blank block)', () => {
    expect(modelDescription(makeModel(JSON.stringify({ prompt: '' })))).toBeNull();
    expect(modelDescription(makeModel(JSON.stringify({ prompt: '   ' })))).toBeNull();
  });

  it('empty/whitespace caption → null', () => {
    expect(modelDescription(makeModel(JSON.stringify({ source: 'upload', caption: '  ' }), 'box'))).toBeNull();
  });

  it('trims surrounding whitespace from the description text', () => {
    const m = makeModel(JSON.stringify({ prompt: '  spaced prompt  ' }));
    expect(modelDescription(m)).toEqual({ text: 'spaced prompt', kind: 'prompt' });
  });

  it('malformed JSON → null, no throw', () => {
    expect(modelDescription(makeModel('{not json'))).toBeNull();
  });

  it('empty params_json object → null', () => {
    expect(modelDescription(makeModel('{}'))).toBeNull();
  });

  it('empty paramsJson string → null', () => {
    expect(modelDescription(makeModel(''))).toBeNull();
  });

  it('non-object params_json (array / scalar) → null', () => {
    expect(modelDescription(makeModel('[1,2,3]'))).toBeNull();
    expect(modelDescription(makeModel('42'))).toBeNull();
    expect(modelDescription(makeModel('null'))).toBeNull();
  });

  it('prompt wins when both prompt and caption are present', () => {
    const m = makeModel(JSON.stringify({ prompt: 'the prompt', caption: 'the caption' }));
    expect(modelDescription(m)).toEqual({ text: 'the prompt', kind: 'prompt' });
  });

  it('non-string prompt is ignored, falls through to caption', () => {
    const m = makeModel(JSON.stringify({ prompt: 123, caption: 'fallback caption' }), 'box');
    expect(modelDescription(m)).toEqual({ text: 'fallback caption', kind: 'caption' });
  });
});

describe('modelDescriptionLabel', () => {
  it('labels a Tripo prompt "Prompt"', () => {
    expect(modelDescriptionLabel('prompt')).toBe('Prompt');
  });

  it('labels an upload caption neutrally as "Description" (NOT "AI description" — it may be hand-typed)', () => {
    expect(modelDescriptionLabel('caption')).toBe('Description');
    expect(modelDescriptionLabel('caption')).not.toMatch(/AI/);
  });
});
