// MemWal memory-record codec (plan-001 U2, D-080).
//
// A MemWal record is a single text string (the relayer embeds + stores it).
// We must round-trip the original prompt AND a tiny structured reference back
// to the on-chain model — `recall()` returns only `{ text, distance, blob_id }`,
// no arbitrary metadata. So we append an escaped, delimited trailer to the
// prompt text:  <escaped-prompt> <RS> <JSON ref>
//
// `m` = the published Model3D object id (for the /model/:id link).
// `c` = the creator address (JWT `sub`); present only on global-namespace
//       records, used by global recall to exclude-self and drop unverifiable
//       authorship (U8). Personal-namespace records omit `c`.
//
// Escaping guarantees the escaped prompt contains NO raw delimiter byte, so the
// FIRST raw RS is unambiguously the trailer boundary even if the user's prompt
// contained the delimiter or escape characters.

/** Reference to the on-chain model a memory record points back to. */
export interface MemoryRef {
  /** Model3D object id. */
  m: string;
  /** Creator address (JWT sub) — global records only; omitted on personal. */
  c?: string;
}

export interface ParsedMemory {
  prompt: string;
  ref: MemoryRef | null;
}

/**
 * The recall response item — the single source of truth for the /api/memory
 * recall wire shape, shared by the backend route and the frontend hook so the
 * contract can't drift. `creator` is present on community (global) results only.
 */
export interface RecallChip {
  prompt: string;
  modelId: string | null;
  distance: number;
  creator?: string;
}

// Control chars that never meaningfully appear in a 3D-model text prompt.
const RS = '\x1e'; // record separator — trailer boundary
const ESC = '\x1b'; // escape marker

// Escape so the result contains no raw RS: ESC→`ESC 0`, RS→`ESC 1`.
function escape(s: string): string {
  return s.replace(/\x1b/g, ESC + '0').replace(/\x1e/g, ESC + '1');
}

// Reverse `escape` in one left-to-right pass (each ESC is always followed by 0|1).
function unescape(s: string): string {
  return s.replace(/\x1b([01])/g, (_, d) => (d === '0' ? ESC : RS));
}

/**
 * Encode a prompt + model reference into one MemWal text record.
 * The trailer is a small fraction of total length (negligible embedding impact).
 */
export function encodeMemory(prompt: string, ref: MemoryRef): string {
  // Only serialize defined fields to keep the trailer tiny and stable.
  const compact: MemoryRef = ref.c ? { m: ref.m, c: ref.c } : { m: ref.m };
  return escape(prompt) + RS + JSON.stringify(compact);
}

/**
 * Parse a MemWal text record back into `{ prompt, ref }`.
 * Tolerant of records with no trailer (plain prompt → `ref: null`) and of a
 * malformed/unparseable trailer (best-effort prompt, `ref: null`).
 */
export function parseMemory(text: string): ParsedMemory {
  const idx = text.indexOf(RS);
  if (idx === -1) {
    // No trailer — plain text (possibly foreign). Unescape is identity for it.
    return { prompt: unescape(text), ref: null };
  }
  const prompt = unescape(text.slice(0, idx));
  const trailer = text.slice(idx + 1);
  try {
    const parsed = JSON.parse(trailer) as unknown;
    if (parsed && typeof parsed === 'object' && typeof (parsed as MemoryRef).m === 'string') {
      const p = parsed as MemoryRef;
      const ref: MemoryRef = typeof p.c === 'string' ? { m: p.m, c: p.c } : { m: p.m };
      return { prompt, ref };
    }
  } catch {
    // fall through — unparseable trailer
  }
  return { prompt, ref: null };
}
