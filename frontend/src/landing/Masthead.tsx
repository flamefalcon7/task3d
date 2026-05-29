import { type JSX } from 'react';
import styles from './Masthead.module.css';

// __ISSUE_NUMBER__ is injected at build time by the vite `define` block
// (plan-022 U1 / D-072) as the commit count on `main`. The `typeof` guard keeps
// this safe in the test env, where vitest.config.ts has no `define` block — there
// it resolves to the 0 sentinel and the № token is dropped (KD-4 / AC-4).
const buildIssueNumber: number =
  typeof __ISSUE_NUMBER__ !== 'undefined' ? __ISSUE_NUMBER__ : 0;

interface MastheadProps {
  /**
   * Override the build-time issue number. Defaults to the injected constant;
   * callers never pass this in production — it exists so tests can exercise the
   * positive and sentinel branches without manipulating the build-time global.
   */
  issueNumber?: number;
}

/**
 * S7 versioned masthead — the page identity bar at the top of the landing page.
 * `Tusk3D` wordmark (Newsreader italic) + `№NNN` issue number + `TESTNET EDITION`,
 * 1.5px rule below. Pure black on paper, zero #FF4500 accent (D-044; site budget
 * is full — S2's ●LIVE dot holds the last slot).
 */
export function Masthead({ issueNumber = buildIssueNumber }: MastheadProps = {}): JSX.Element {
  const showIssue = Number.isFinite(issueNumber) && issueNumber > 0;
  return (
    <header className={styles.masthead} data-testid="masthead">
      {/* S3 topology mark slot — future survivor (separate plan). Intentionally
          empty: the flex row already accommodates a leading mark without rework. */}
      <span className={styles.wordmark} data-testid="masthead-wordmark">
        Tusk3D
      </span>
      {showIssue && (
        <span className={styles.issue} data-testid="masthead-issue">
          №{issueNumber}
        </span>
      )}
      <span className={styles.edition} data-testid="masthead-edition">
        TESTNET EDITION
      </span>
    </header>
  );
}
