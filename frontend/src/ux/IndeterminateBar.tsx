// Shared indeterminate progress bar (D-081 UX). Continuous motion for long async
// waits (Walrus upload, Tripo generation) so they don't read as a frozen UI.
import styles from './indeterminateBar.module.css';

interface Props {
  /** data-testid for the bar element. */
  testId?: string;
  /** Accessible label describing the in-progress action. */
  ariaLabel?: string;
}

export function IndeterminateBar({ testId, ariaLabel }: Props) {
  return (
    <div className={styles.track} data-testid={testId} role="progressbar" aria-label={ariaLabel}>
      <div className={styles.fill} />
    </div>
  );
}
