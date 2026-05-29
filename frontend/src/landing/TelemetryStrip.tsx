// S2 telemetry strip. Renders 5 mono fields under the masthead, above
// LedeHero. Per docs/brainstorms/2026-05-29-s2-telemetry-strip-requirements.md
// KD-2 (field order), KD-4 (●live/●cache status semantics), KD-7 (mount
// position). Display-only — no wallet, no transactional logic.

import styles from './TelemetryStrip.module.css';
import { useTelemetryData } from './useTelemetryData';
import { WALRUS_AGGREGATOR } from '../walrus/aggregator';

// CDN swap point: when plan-018 ships, aggregator.ts updates WALRUS_AGGREGATOR
// to cdn.tusk3d.xyz and this component picks it up automatically. Do NOT
// re-introduce a local URL constant — the canonical is in aggregator.ts.

// Truncate a Walrus CID to "first4…last3" for display. Mirrors the visual
// pattern from LedeHero's truncateBlobId and the ideation example.
function truncateCid(cid: string): string {
  if (cid.length <= 10) return cid;
  return `${cid.slice(0, 4)}…${cid.slice(-3)}`;
}

// Format an ISO timestamp into "YYYY-MM-DD HH:MM PT". Always Pacific time
// per Sui Overflow handbook convention. Falls back to raw substring if
// Intl.DateTimeFormat misbehaves in the test environment.
function formatAsOf(iso: string): string {
  try {
    const d = new Date(iso);
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    // en-CA gives YYYY-MM-DD by default; the hour part follows ", HH:MM".
    const parts = fmt.formatToParts(d);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    const date = `${get('year')}-${get('month')}-${get('day')}`;
    const time = `${get('hour')}:${get('minute')}`;
    return `${date} ${time} PT`;
  } catch {
    return iso.slice(0, 16).replace('T', ' ') + ' PT';
  }
}

export function TelemetryStrip(): JSX.Element {
  const { status, data } = useTelemetryData();
  const isLive = status === 'live';
  const truncatedCid = truncateCid(data.latestCid);
  const cidHref = `${WALRUS_AGGREGATOR}/v1/blobs/${data.latestCid}`;

  return (
    <section
      className={styles.strip}
      data-testid="telemetry-strip"
      data-status={status}
      aria-label="Live network telemetry"
    >
      <div className={styles.row}>
        {/* AS OF timestamp */}
        <span className={styles.cell}>
          <span className={styles.label}>AS OF</span>
          <span className={styles.value} data-testid="telemetry-asof">
            {formatAsOf(data.asOfIso)}
          </span>
        </span>
        <span className={styles.sep}>·</span>

        {/* ●live | ●cache status — the SOLE #FF4500 instance on the strip */}
        <span className={styles.cell}>
          <span
            className={isLive ? styles.dotLive : styles.dotCache}
            data-testid={isLive ? 'telemetry-dot-live' : 'telemetry-dot-cache'}
            aria-hidden="true"
          />
          <span
            className={isLive ? styles.statusLive : styles.statusCache}
            data-testid="telemetry-status"
          >
            {isLive ? 'LIVE' : 'CACHE'}
          </span>
        </span>
        <span className={styles.sep}>·</span>

        {/* L1 MODELS */}
        <span className={styles.cell}>
          <span className={styles.label}>L1 MODELS</span>
          <span className={styles.value} data-testid="telemetry-l1-models">
            {data.l1Models}
          </span>
        </span>
        <span className={styles.sep}>·</span>

        {/* L2 NFTS */}
        <span className={styles.cell}>
          <span className={styles.label}>L2 NFTS</span>
          <span className={styles.value} data-testid="telemetry-l2-nfts">
            {data.l2Nfts}
          </span>
        </span>
        <span className={styles.sep}>·</span>

        {/* WALRUS BLOBS */}
        <span className={styles.cell}>
          <span className={styles.label}>WALRUS BLOBS</span>
          <span className={styles.value} data-testid="telemetry-walrus-blobs">
            {data.walrusBlobs}
          </span>
        </span>
        <span className={styles.sep}>·</span>

        {/* LATEST CID — external link, new tab */}
        <span className={styles.cell}>
          <span className={styles.label}>LATEST CID</span>
          <a
            className={styles.cidLink}
            href={cidHref}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="telemetry-cid-link"
          >
            {truncatedCid}
            <span className={styles.cidArrow} aria-hidden="true">
              ↗
            </span>
          </a>
        </span>
      </div>
    </section>
  );
}
