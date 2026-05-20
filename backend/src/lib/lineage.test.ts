import { describe, expect, it } from 'vitest';
import type { LineageRecord } from '@overflow2026/shared';
import { buildLineageJson, buildLineageStub } from './lineage.js';

describe('buildLineageStub', () => {
  it('returns a stub matching the input fields', () => {
    const stub = buildLineageStub({
      id: 'abc-123',
      shape: 'tripo',
      params: { shape: 'tripo', prompt: 'a cube' },
      generatorSource: 'tripo',
      createdAt: '2026-05-14T00:00:00.000Z',
    });
    expect(stub).toEqual({
      id: 'abc-123',
      shape: 'tripo',
      params: { shape: 'tripo', prompt: 'a cube' },
      generatorSource: 'tripo',
      createdAt: '2026-05-14T00:00:00.000Z',
    });
  });

  it('omits undefined optional fields', () => {
    const stub = buildLineageStub({
      id: 'abc',
      shape: 'tripo',
      params: { shape: 'tripo', prompt: 'a sphere' },
      generatorSource: 'tripo',
      createdAt: '2026-05-14T00:00:00.000Z',
    });
    expect('prompt' in stub).toBe(false);
    expect('llmDecision' in stub).toBe(false);
  });

  it('includes prompt + llmDecision when provided', () => {
    const stub = buildLineageStub({
      id: 'abc',
      shape: 'tripo',
      params: { shape: 'tripo', prompt: 'a cube' },
      generatorSource: 'tripo',
      createdAt: '2026-05-14T00:00:00.000Z',
      prompt: 'a cube',
      llmDecision: { tags: ['cube'] },
    });
    expect(stub.prompt).toBe('a cube');
    expect(stub.llmDecision).toEqual({ tags: ['cube'] });
  });
});

describe('buildLineageJson', () => {
  it('returns valid JSON that parses to a LineageRecord', () => {
    const json = buildLineageJson({
      id: 'abc-123',
      shape: 'tripo',
      params: { shape: 'tripo', prompt: 'a cube' },
      generatorSource: 'tripo',
      createdAt: '2026-05-14T00:00:00.000Z',
    });
    const parsed = JSON.parse(json) as LineageRecord;
    expect(parsed.id).toBe('abc-123');
    expect(parsed.shape).toBe('tripo');
    expect(parsed.generatorSource).toBe('tripo');
    expect(parsed.createdAt).toBe('2026-05-14T00:00:00.000Z');
    expect(parsed.params).toEqual({ shape: 'tripo', prompt: 'a cube' });
  });

  it('roundtrips prompt + llmDecision through JSON', () => {
    const json = buildLineageJson({
      id: 'abc',
      shape: 'tripo',
      params: { shape: 'tripo', prompt: 'a treasure chest' },
      generatorSource: 'tripo',
      createdAt: '2026-05-14T00:00:00.000Z',
      prompt: 'a treasure chest',
      llmDecision: { generator: 'tripo', reason: 'organic' },
    });
    const parsed = JSON.parse(json) as LineageRecord;
    expect(parsed.prompt).toBe('a treasure chest');
    expect(parsed.llmDecision).toEqual({ generator: 'tripo', reason: 'organic' });
  });
});
