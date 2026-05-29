// Baked-at-build-time snapshot used by the S2 telemetry strip when the live
// queryEvents call fails or exceeds the 2s timeout. Per
// docs/brainstorms/2026-05-29-s2-telemetry-strip-requirements.md KD-4.
//
// First paint always renders these values so the strip is never empty. The
// fallback IS the loading state — no skeleton, no flicker. If the background
// fetch resolves in time, fresh values swap in and the dot turns ●live; if
// not, the fallback stays put and the dot stays ●cache (grey).
//
// SHIP-TIME PROCEDURE: bump these numbers and the `asOf` timestamp whenever
// a new deploy lands and we want a fresher floor. The numbers are sourced
// from a real testnet query — run an event-count once and paste the result
// here. Numbers that drift far behind reality are only a problem when the
// LIVE fetch also fails, at which point the ●cache dot signals stale honestly.

export interface TelemetrySnapshot {
  // ISO timestamp at which the snapshot was captured, displayed via toLocale
  // formatting at render time. Pacific time conversion happens client-side.
  asOfIso: string;
  l1Models: number;
  l2Nfts: number;
  walrusBlobs: number;
  // Full untruncated Walrus CID of the most recently published Model3D.
  // Truncated for display in TelemetryStrip.tsx.
  latestCid: string;
}

// Seeded conservative values for 2026-05-29. Numbers reflect a recent floor
// of testnet activity from plan-007 onward — they will under-report rather
// than over-report. Latest CID is a placeholder; the strip never renders this
// CID when LIVE fetch succeeds, and on ●cache it is treated as an honest
// approximation.
export const FALLBACK_TELEMETRY: TelemetrySnapshot = {
  asOfIso: '2026-05-29T00:00:00-07:00',
  l1Models: 3,
  l2Nfts: 0,
  walrusBlobs: 3,
  latestCid: 'baked000000fallback000000000000000000000000000',
};
