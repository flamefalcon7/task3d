import styles from './wireframeLoadingOverlay.module.css';

interface Props {
  /** data-testid for the overlay root (callers use distinct ids per canvas). */
  testId?: string;
  /** Label shown under the cube; rendered with a leading em-dash. */
  label?: string;
}

// Presentational GLB-load overlay shared by PreviewCanvas + TaggingCanvas. It
// renders a wireframe cube + mono label and owns the (reduced-motion-aware)
// animation; it does NOT decide WHEN to show — each canvas owns that condition
// so their per-mount semantics (null glbUrl, dispose window) stay independent.
// See plan 2026-06-16-001.
export function WireframeLoadingOverlay({ testId, label = 'LOADING' }: Props) {
  return (
    <div className={styles.overlay} data-testid={testId} aria-hidden>
      <svg className={styles.cube} width="80" height="80" viewBox="0 0 100 100">
        <g fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinejoin="round">
          <path d="M 20 30 L 50 15 L 80 30 L 80 70 L 50 85 L 20 70 Z" />
          <path d="M 20 30 L 50 45 L 80 30" />
          <path d="M 50 45 L 50 85" />
        </g>
      </svg>
      <span className={styles.label}>— {label}</span>
    </div>
  );
}
