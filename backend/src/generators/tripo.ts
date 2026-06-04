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
    // plan-013 — two-step Tripo chain. Step 1 (~15cr, ~35s) generates the base
    // mesh from prompt-mode. Step 2 (~40cr, ~85s) segments it into per-part
    // materials/nodes via `mesh_segmentation`. The L1 creator pays one D-034
    // SUI fee that authorizes the whole chain (TRIPO_FEE_MIST adjustment lands
    // in U6). Distinct poll timeouts, widened 2026-06-04 after a post-payment
    // TripoTimeoutError in the field: step 1 measured ~59s but the prior 90s
    // budget (1.5× margin) timed out under Tripo queue load, charging ~20cr
    // then aborting before segmentation. Step 1 → 180s (3× the ~59s observed),
    // step 2 → 240s (2× the ~118s observed) for tail-latency headroom.
    const taskId = await this.client.submitTask(params.prompt);
    await this.client.pollTask(taskId, { maxWaitMs: 180_000 });
    const segTaskId = await this.client.submitMeshSegmentation(taskId);
    const { url } = await this.client.pollTask(segTaskId, { maxWaitMs: 240_000 });
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
