import { describe, it, expect } from 'vitest';
import { encodeMemory, parseMemory } from './memory.js';

describe('encodeMemory / parseMemory', () => {
  it('round-trips prompt + model id', () => {
    const enc = encodeMemory('a low-poly red sports car', { m: '0xabc123' });
    expect(parseMemory(enc)).toEqual({ prompt: 'a low-poly red sports car', ref: { m: '0xabc123' } });
  });

  it('round-trips prompt + model id + creator addr (global record)', () => {
    const enc = encodeMemory('chunky off-road truck', { m: '0xmodel', c: '0xcreator' });
    expect(parseMemory(enc)).toEqual({
      prompt: 'chunky off-road truck',
      ref: { m: '0xmodel', c: '0xcreator' },
    });
  });

  it('omits c from the trailer when not provided', () => {
    const enc = encodeMemory('hi', { m: '0xm' });
    expect(enc).not.toContain('"c"');
    expect(parseMemory(enc).ref).toEqual({ m: '0xm' });
  });

  it('plain text with no trailer parses to ref: null', () => {
    expect(parseMemory('just a prompt, no trailer')).toEqual({
      prompt: 'just a prompt, no trailer',
      ref: null,
    });
  });

  it('round-trips a prompt that contains the raw delimiter byte (\\x1e)', () => {
    const nasty = 'before\x1eafter';
    const enc = encodeMemory(nasty, { m: '0xm', c: '0xc' });
    const parsed = parseMemory(enc);
    expect(parsed.prompt).toBe(nasty);
    expect(parsed.ref).toEqual({ m: '0xm', c: '0xc' });
  });

  it('round-trips a prompt containing the escape byte (\\x1b) and digits', () => {
    const nasty = 'esc\x1b0and\x1b1and plain 0 1 text';
    const enc = encodeMemory(nasty, { m: '0xm' });
    expect(enc).not.toContain('\x1e' + 'NOPE'); // sanity
    expect(parseMemory(enc).prompt).toBe(nasty);
  });

  it('keeps the trailer a small fraction of a ~1000-char prompt', () => {
    const prompt = 'x'.repeat(1000);
    const enc = encodeMemory(prompt, { m: '0x' + 'a'.repeat(64) });
    const trailerLen = enc.length - prompt.length;
    expect(parseMemory(enc).prompt).toBe(prompt);
    expect(trailerLen).toBeLessThan(prompt.length * 0.1);
  });

  it('tolerates a malformed trailer (best-effort prompt, ref null)', () => {
    const enc = 'some prompt\x1e{not valid json';
    expect(parseMemory(enc)).toEqual({ prompt: 'some prompt', ref: null });
  });

  it('treats a trailer without an m field as no ref', () => {
    const enc = 'p\x1e{"x":1}';
    expect(parseMemory(enc)).toEqual({ prompt: 'p', ref: null });
  });
});
