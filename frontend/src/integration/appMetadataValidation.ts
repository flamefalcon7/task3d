// plan-008 U13 — client-side mirror of the backend `parseAppMetadata` schema
// (backend/src/lib/appMetadataSchema.ts). The on-chain `register_integration`
// only length-bounds the blob; the backend is authoritative for the full schema
// (it gates the public "Used by" list). We re-validate here purely for UX — to
// reject a bad `url`/`name` BEFORE the wallet popup, not after a confusing
// on-chain success that the indexer then silently drops.
//
// Security intent (matches backend): `url` must be https: ONLY — reject http:,
// javascript:, data:, and schemeless. The danger lives in the href that U14
// renders as a clickable <a>. `name` rejects the invisible/control/bidi class
// (homoglyph / RTL-override injection vectors).

const NAME_MAX_CODEPOINTS = 64;
const URL_MAX_CHARS = 256;
const FORBIDDEN_CHARS = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}]/u;

export type FieldValidation = { ok: true } | { ok: false; reason: string };

export function validateName(raw: string): FieldValidation {
  const name = raw.normalize('NFC');
  if (name.trim().length === 0) return { ok: false, reason: 'Name is required.' };
  if ([...name].length > NAME_MAX_CODEPOINTS) {
    return { ok: false, reason: `Name must be ≤ ${NAME_MAX_CODEPOINTS} characters.` };
  }
  if (FORBIDDEN_CHARS.test(name)) {
    return { ok: false, reason: 'Name contains disallowed invisible/control characters.' };
  }
  return { ok: true };
}

export function validateUrl(raw: string): FieldValidation {
  if (raw.trim().length === 0) return { ok: false, reason: 'URL is required.' };
  if (raw.length > URL_MAX_CHARS) {
    return { ok: false, reason: `URL must be ≤ ${URL_MAX_CHARS} characters.` };
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, reason: 'Enter a full URL, e.g. https://yourgame.example.' };
  }
  if (parsed.protocol !== 'https:') {
    return { ok: false, reason: 'URL must use https://.' };
  }
  return { ok: true };
}

// Encode the validated {name,url} as the UTF-8 JSON blob the Move call expects.
// Keys are name-then-url (the backend checks the key SET, not order). Caller
// must have passed validateName/validateUrl first.
export function encodeAppMetadata(name: string, url: string): Uint8Array {
  const json = JSON.stringify({ name: name.normalize('NFC'), url });
  return new TextEncoder().encode(json);
}
