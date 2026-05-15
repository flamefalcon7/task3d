import type { Generator, GenerateResult, TripoParams } from '@overflow2026/shared';
import type { TripoClient } from '../lib/tripo-client.js';

export class TripoGenerator implements Generator {
  constructor(private client: TripoClient) {}

  async generate(params: TripoParams): Promise<GenerateResult> {
    if (params.shape !== 'tripo') {
      throw new Error('TripoGenerator requires shape=tripo');
    }
    if (!params.prompt || params.prompt.trim() === '') {
      throw new Error('TripoGenerator requires non-empty prompt');
    }
    const taskId = await this.client.submitTask(params.prompt);
    const { url } = await this.client.pollTask(taskId);
    const glbBytes = await this.client.downloadGlb(url);
    return {
      glbBytes,
      lineageStub: {
        shape: 'tripo',
        params,
        prompt: params.prompt,
        generatorSource: 'tripo',
      },
    };
  }
}
