import { describe, it, expect, vi } from 'vitest';
import { parseMemory } from '@overflow2026/shared';
import { GLOBAL_NAMESPACE } from '../src/routes/memory.js';
import type { MemwalClient } from '../src/lib/memwal-client.js';
import { SEED_DATA, planSeedWrites, seedMemory, type SeedRecord } from './seed-memory.js';

describe('seed-memory', () => {
  it('writes every record to its personal namespace + non-RESTRICTED to global', () => {
    const writes = planSeedWrites(SEED_DATA);
    const globalWrites = writes.filter((w) => w.namespace === GLOBAL_NAMESPACE);
    const nonRestricted = SEED_DATA.filter((r) => r.policy !== 0);
    // personal write per record + one global per non-RESTRICTED record.
    expect(writes.length).toBe(SEED_DATA.length + nonRestricted.length);
    expect(globalWrites.length).toBe(nonRestricted.length);
  });

  it('global records carry the {m,c} trailer and round-trip via parseMemory', () => {
    const globalWrites = planSeedWrites(SEED_DATA).filter((w) => w.namespace === GLOBAL_NAMESPACE);
    for (const w of globalWrites) {
      const { prompt, ref } = parseMemory(w.text);
      expect(prompt.length).toBeGreaterThan(0);
      expect(ref?.m).toMatch(/^0x[0-9a-f]{64}$/);
      expect(ref?.c).toMatch(/^0x[0-9a-f]{64}$/);
    }
  });

  it('seeds ≥2 distinct non-presenter creators into the global pool (exclude-self trap)', () => {
    const globalWrites = planSeedWrites(SEED_DATA).filter((w) => w.namespace === GLOBAL_NAMESPACE);
    const creators = new Set(globalWrites.map((w) => parseMemory(w.text).ref?.c));
    expect(creators.size).toBeGreaterThanOrEqual(2);
  });

  it('a RESTRICTED record never appears in the global pool', () => {
    const restricted = SEED_DATA.find((r) => r.policy === 0)!;
    const globalWrites = planSeedWrites(SEED_DATA).filter((w) => w.namespace === GLOBAL_NAMESPACE);
    const globalModelIds = globalWrites.map((w) => parseMemory(w.text).ref?.m);
    expect(globalModelIds).not.toContain(restricted.modelId);
  });

  it('seedMemory issues one client.remember per planned write', async () => {
    const records: SeedRecord[] = [
      { creatorAddr: '0x' + 'a'.repeat(64), prompt: 'x', modelId: '0x' + '1'.repeat(64), policy: 2 },
      { creatorAddr: '0x' + 'b'.repeat(64), prompt: 'y', modelId: '0x' + '2'.repeat(64), policy: 0 },
    ];
    const remember = vi.fn(async () => {});
    const client = { configured: true, remember, recall: vi.fn() } as unknown as MemwalClient;
    const n = await seedMemory(client, records);
    // record1: personal+global (2), record2 RESTRICTED: personal only (1) → 3
    expect(n).toBe(3);
    expect(remember).toHaveBeenCalledTimes(3);
  });
});
