import { describe, expect, it } from 'vitest';
import type { LineageRecord } from '@overflow2026/shared';
import { buildLineageJson, buildLineageStub } from './lineage.js';

describe('buildLineageStub', () => {
  it('returns a stub matching the input fields', () => {
    const stub = buildLineageStub({
      id: 'abc-123',
      shape: 'box',
      params: { shape: 'box', width: 1, height: 1, depth: 1 },
      generatorSource: 'procedural',
      createdAt: '2026-05-14T00:00:00.000Z',
    });
    expect(stub).toEqual({
      id: 'abc-123',
      shape: 'box',
      params: { shape: 'box', width: 1, height: 1, depth: 1 },
      generatorSource: 'procedural',
      createdAt: '2026-05-14T00:00:00.000Z',
    });
  });

  it('omits undefined optional fields', () => {
    const stub = buildLineageStub({
      id: 'abc',
      shape: 'sphere',
      params: { shape: 'sphere', radius: 1, latSegments: 8, lonSegments: 12 },
      generatorSource: 'procedural',
      createdAt: '2026-05-14T00:00:00.000Z',
    });
    expect('prompt' in stub).toBe(false);
    expect('llmDecision' in stub).toBe(false);
  });

  it('includes prompt + llmDecision when provided', () => {
    const stub = buildLineageStub({
      id: 'abc',
      shape: 'box',
      params: { shape: 'box', width: 1, height: 1, depth: 1 },
      generatorSource: 'procedural',
      createdAt: '2026-05-14T00:00:00.000Z',
      prompt: 'a cube',
      llmDecision: { model: 'claude' },
    });
    expect(stub.prompt).toBe('a cube');
    expect(stub.llmDecision).toEqual({ model: 'claude' });
  });
});

describe('buildLineageJson', () => {
  it('returns valid JSON that parses to a LineageRecord', () => {
    const json = buildLineageJson({
      id: 'abc-123',
      shape: 'box',
      params: { shape: 'box', width: 1, height: 1, depth: 1 },
      generatorSource: 'procedural',
      createdAt: '2026-05-14T00:00:00.000Z',
    });
    const parsed = JSON.parse(json) as LineageRecord;
    expect(parsed.id).toBe('abc-123');
    expect(parsed.shape).toBe('box');
    expect(parsed.generatorSource).toBe('procedural');
    expect(parsed.createdAt).toBe('2026-05-14T00:00:00.000Z');
    expect(parsed.params).toEqual({ shape: 'box', width: 1, height: 1, depth: 1 });
  });

  it('roundtrips prompt + llmDecision through JSON', () => {
    const json = buildLineageJson({
      id: 'abc',
      shape: 'chest',
      params: { shape: 'chest', width: 1, height: 1, depth: 1, lidOpenRadians: 0.5 },
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
