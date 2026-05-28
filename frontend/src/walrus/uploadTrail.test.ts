import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  STAGE_KEY,
  MAX_ENTRIES,
  __resetSurfaceGuardForTests,
  clearTrail,
  readHeapMb,
  readTrail,
  surfaceStaleTrail,
  writeDiag,
} from './uploadTrail';

// Drain the microtask queue so `queueMicrotask` callbacks in writeDiag run
// before the test inspects sessionStorage.
const flushMicrotasks = () => Promise.resolve();

describe('uploadTrail', () => {
  beforeEach(() => {
    sessionStorage.clear();
    __resetSurfaceGuardForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('readHeapMb', () => {
    it('returns null when performance.memory is undefined', () => {
      const perf = performance as unknown as { memory?: unknown };
      const orig = perf.memory;
      delete perf.memory;
      expect(readHeapMb()).toBeNull();
      perf.memory = orig;
    });

    it('returns rounded MB values when performance.memory is present', () => {
      const perf = performance as unknown as {
        memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
      };
      const orig = perf.memory;
      perf.memory = {
        usedJSHeapSize: 100 * 1024 * 1024 + 512 * 1024, // 100.5 MB
        jsHeapSizeLimit: 4096 * 1024 * 1024,
      };
      expect(readHeapMb()).toEqual({ used: 101, limit: 4096 }); // rounded
      perf.memory = orig;
    });
  });

  describe('writeDiag', () => {
    it('appends an entry readable via readTrail after microtask drain', async () => {
      writeDiag('pre-encode', performance.now());
      await flushMicrotasks();

      const trail = readTrail();
      expect(trail).toHaveLength(1);
      expect(trail[0]!.stage).toBe('pre-encode');
      expect(typeof trail[0]!.tMs).toBe('number');
      expect(trail[0]!.tMs).toBeGreaterThanOrEqual(0);
    });

    it('caps trail length at MAX_ENTRIES, dropping oldest', async () => {
      const start = performance.now();
      for (let i = 0; i < MAX_ENTRIES + 5; i++) {
        writeDiag(`stage-${i}`, start);
        await flushMicrotasks();
      }

      const trail = readTrail();
      expect(trail).toHaveLength(MAX_ENTRIES);
      // Oldest 5 entries dropped — first remaining is stage-5
      expect(trail[0]!.stage).toBe('stage-5');
      expect(trail[trail.length - 1]!.stage).toBe(`stage-${MAX_ENTRIES + 4}`);
    });

    it('merges extra fields into the entry', async () => {
      writeDiag('pre-encode', performance.now(), { fileCount: 8, batchIndex: 0 });
      await flushMicrotasks();

      const trail = readTrail();
      expect(trail[0]).toMatchObject({
        stage: 'pre-encode',
        fileCount: 8,
        batchIndex: 0,
      });
    });

    it('records heapUsedMb=null when performance.memory is undefined', async () => {
      const perf = performance as unknown as { memory?: unknown };
      const orig = perf.memory;
      delete perf.memory;

      writeDiag('pre-encode', performance.now());
      await flushMicrotasks();

      expect(readTrail()[0]!.heapUsedMb).toBeNull();
      expect(readTrail()[0]!.heapLimitMb).toBeNull();
      perf.memory = orig;
    });

    it('swallows sessionStorage.setItem quota errors', async () => {
      const setItemSpy = vi
        .spyOn(Storage.prototype, 'setItem')
        .mockImplementation(() => {
          throw new DOMException('QuotaExceededError');
        });

      // Should not throw despite the underlying setItem throwing.
      expect(() => writeDiag('pre-encode', performance.now())).not.toThrow();
      await flushMicrotasks();
      expect(setItemSpy).toHaveBeenCalled();
    });
  });

  describe('clearTrail', () => {
    it('removes the trail key', async () => {
      writeDiag('pre-encode', performance.now());
      await flushMicrotasks();
      expect(readTrail()).toHaveLength(1);

      clearTrail();
      expect(readTrail()).toHaveLength(0);
      expect(sessionStorage.getItem(STAGE_KEY)).toBeNull();
    });

    it('is a no-op when trail is empty', () => {
      expect(() => clearTrail()).not.toThrow();
    });
  });

  describe('surfaceStaleTrail', () => {
    it('is a no-op when no prior trail exists', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      surfaceStaleTrail();
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('surfaces and clears a stale trail', async () => {
      writeDiag('pre-encode', performance.now());
      writeDiag('post-encode-0', performance.now());
      await flushMicrotasks();
      expect(readTrail()).toHaveLength(2);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const tableSpy = vi.spyOn(console, 'table').mockImplementation(() => {});
      surfaceStaleTrail();

      expect(warnSpy).toHaveBeenCalledOnce();
      expect(warnSpy.mock.calls[0]![0]).toContain('[WALRUS CRASH DIAGNOSTIC]');
      expect(warnSpy.mock.calls[0]![0]).toContain('stage="post-encode-0"');
      expect(tableSpy).toHaveBeenCalledOnce();
      expect(readTrail()).toHaveLength(0);
    });

    it('surfaces only once per page load', async () => {
      writeDiag('pre-encode', performance.now());
      await flushMicrotasks();

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      surfaceStaleTrail();
      // Write a new trail and try again; second call should NOT surface
      // because the module-scope guard latched on the first call.
      writeDiag('pre-encode', performance.now());
      await flushMicrotasks();
      surfaceStaleTrail();

      expect(warnSpy).toHaveBeenCalledOnce();
    });

    it('does not throw on malformed stored JSON', () => {
      sessionStorage.setItem(STAGE_KEY, '{not valid json');
      expect(() => surfaceStaleTrail()).not.toThrow();
    });
  });
});
