import type {
  GeneratorSource,
  LineageRecord,
  TripoParams,
} from '@overflow2026/shared';

export interface BuildLineageInput {
  id: string;
  shape: 'tripo';
  params: TripoParams;
  generatorSource: GeneratorSource;
  createdAt: string;
  prompt?: string;
  llmDecision?: unknown;
}

export function buildLineageStub(input: BuildLineageInput): Partial<LineageRecord> {
  const stub: Partial<LineageRecord> = {
    id: input.id,
    shape: input.shape,
    params: input.params,
    generatorSource: input.generatorSource,
    createdAt: input.createdAt,
  };
  if (input.prompt !== undefined) stub.prompt = input.prompt;
  if (input.llmDecision !== undefined) stub.llmDecision = input.llmDecision;
  return stub;
}

export function buildLineageJson(input: BuildLineageInput): string {
  const record: LineageRecord = {
    id: input.id,
    shape: input.shape,
    params: input.params,
    generatorSource: input.generatorSource,
    createdAt: input.createdAt,
    ...(input.prompt !== undefined ? { prompt: input.prompt } : {}),
    ...(input.llmDecision !== undefined ? { llmDecision: input.llmDecision } : {}),
  };
  return JSON.stringify(record);
}
