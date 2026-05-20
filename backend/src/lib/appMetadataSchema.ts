// plan-008 U7 — `app_metadata` schema validation.
//
// On-chain `register_integration` only length-bounds the `app_metadata` blob
// (APP_METADATA_MAX = 512 bytes). The backend validates the FULL schema before
// surfacing a record in the public "Used by" list, because that list is a
// buyer trust signal and the `url` becomes a clickable `<a href>` in U14.
//
// Spec (security review — apply, don't defer):
//   - UTF-8 JSON object, EXACTLY the keys `name` + `url`; reject extra/missing.
//   - name: <= 64 code points; Unicode NFC-normalized; reject control / format
//     / bidi / zero-width / surrogate / private-use chars (the homoglyph- and
//     RTL-override-injection vectors). Returned NFC-normalized.
//   - url: <= 256 chars; `https:` scheme ONLY — reject http:, javascript:,
//     data:, and schemeless. The danger lives in the href, not the text.
//
// Residual (documented, not shipped): full Unicode *confusables* detection
// (e.g. Cyrillic а vs Latin a) needs a confusables table; out of scope for v1.
// We reject the invisible/control/bidi class that enables the high-impact
// attacks; visually-confusable-but-printable homoglyphs are not caught here.

export interface AppMetadata {
  name: string;
  url: string;
}

export type AppMetadataResult =
  | { ok: true; value: AppMetadata }
  | { ok: false; reason: string };

const NAME_MAX_CODEPOINTS = 64;
const URL_MAX_CHARS = 256;

// Control (Cc), format (Cf — includes bidi overrides, ZWJ/ZWNJ, BOM),
// surrogate (Cs), and private-use (Co) code points. These are the injection
// vectors for the "Used by" trust signal; printable text is allowed.
const FORBIDDEN_CHARS = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}]/u;

function decodeUtf8(input: Uint8Array | string): string | null {
  if (typeof input === 'string') return input;
  try {
    // fatal:true rejects invalid UTF-8 byte sequences.
    return new TextDecoder('utf-8', { fatal: true }).decode(input);
  } catch {
    return null;
  }
}

export function parseAppMetadata(input: Uint8Array | string): AppMetadataResult {
  const text = decodeUtf8(input);
  if (text === null) return { ok: false, reason: 'invalid_utf8' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'invalid_json' };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: 'not_an_object' };
  }

  const keys = Object.keys(parsed as Record<string, unknown>);
  if (keys.length !== 2 || !keys.includes('name') || !keys.includes('url')) {
    return { ok: false, reason: 'unexpected_keys' };
  }

  const rec = parsed as Record<string, unknown>;
  if (typeof rec.name !== 'string') return { ok: false, reason: 'name_not_string' };
  if (typeof rec.url !== 'string') return { ok: false, reason: 'url_not_string' };

  const name = rec.name.normalize('NFC');
  if (name.length === 0) return { ok: false, reason: 'name_empty' };
  if ([...name].length > NAME_MAX_CODEPOINTS) return { ok: false, reason: 'name_too_long' };
  if (FORBIDDEN_CHARS.test(name)) return { ok: false, reason: 'name_forbidden_chars' };

  const url = rec.url;
  if (url.length > URL_MAX_CHARS) return { ok: false, reason: 'url_too_long' };
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { ok: false, reason: 'url_unparseable' };
  }
  if (parsedUrl.protocol !== 'https:') return { ok: false, reason: 'url_not_https' };

  return { ok: true, value: { name, url } };
}
