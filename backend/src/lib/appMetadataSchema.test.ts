import { describe, it, expect } from 'vitest';
import { parseAppMetadata } from './appMetadataSchema.js';

const enc = (o: unknown) => new TextEncoder().encode(JSON.stringify(o));

describe('parseAppMetadata', () => {
  it('accepts a well-formed {name,url} with https', () => {
    const r = parseAppMetadata(enc({ name: 'CoolGame', url: 'https://coolgame.example/play' }));
    expect(r).toEqual({ ok: true, value: { name: 'CoolGame', url: 'https://coolgame.example/play' } });
  });

  it('accepts a string input (already-decoded JSON)', () => {
    const r = parseAppMetadata(JSON.stringify({ name: 'X', url: 'https://x.io' }));
    expect(r.ok).toBe(true);
  });

  it('NFC-normalizes the name', () => {
    // "é" as e + combining acute (NFD) → normalized to single code point.
    const r = parseAppMetadata(enc({ name: 'café', url: 'https://x.io' }));
    expect(r.ok && r.value.name).toBe('café');
  });

  it('rejects an extra key', () => {
    const r = parseAppMetadata(enc({ name: 'X', url: 'https://x.io', evil: 1 }));
    expect(r).toEqual({ ok: false, reason: 'unexpected_keys' });
  });

  it('rejects a missing key', () => {
    expect(parseAppMetadata(enc({ name: 'X' }))).toEqual({ ok: false, reason: 'unexpected_keys' });
  });

  it('rejects a non-object / array', () => {
    expect(parseAppMetadata(enc(['a', 'b'])).ok).toBe(false);
    expect(parseAppMetadata(enc('hi')).ok).toBe(false);
  });

  it('rejects an empty name', () => {
    expect(parseAppMetadata(enc({ name: '', url: 'https://x.io' }))).toEqual({
      ok: false,
      reason: 'name_empty',
    });
  });

  it('rejects a name over 64 code points', () => {
    expect(parseAppMetadata(enc({ name: 'a'.repeat(65), url: 'https://x.io' }))).toEqual({
      ok: false,
      reason: 'name_too_long',
    });
  });

  it('rejects control / zero-width / bidi-override chars in name (homoglyph guard)', () => {
    // C0 control, zero-width space, RTL override, BOM.
    for (const cp of [0x01, 0x200b, 0x202e, 0xfeff]) {
      const bad = 'A' + String.fromCodePoint(cp) + 'B';
      expect(parseAppMetadata(enc({ name: bad, url: 'https://x.io' }))).toEqual({
        ok: false,
        reason: 'name_forbidden_chars',
      });
    }
  });

  it('accepts a plain ASCII space in the name', () => {
    expect(parseAppMetadata(enc({ name: 'Cool Game', url: 'https://x.io' })).ok).toBe(true);
  });

  it('rejects non-https url schemes', () => {
    for (const url of ['http://x.io', 'javascript:alert(1)', 'data:text/html,x', 'ftp://x.io']) {
      const r = parseAppMetadata(enc({ name: 'X', url }));
      expect(r.ok).toBe(false);
    }
  });

  it('rejects a schemeless url', () => {
    expect(parseAppMetadata(enc({ name: 'X', url: 'x.io/play' })).ok).toBe(false);
  });

  it('rejects a url over 256 chars', () => {
    const url = 'https://x.io/' + 'a'.repeat(260);
    expect(parseAppMetadata(enc({ name: 'X', url }))).toEqual({ ok: false, reason: 'url_too_long' });
  });

  it('rejects invalid JSON', () => {
    expect(parseAppMetadata(new TextEncoder().encode('{not json')).ok).toBe(false);
  });

  it('rejects invalid UTF-8 bytes', () => {
    expect(parseAppMetadata(Uint8Array.from([0xff, 0xfe, 0x00]))).toEqual({
      ok: false,
      reason: 'invalid_utf8',
    });
  });
});
