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
      {/* Brand identity mark (D-095/D-096; supersedes the plan-025 tusk-ridge):
          the wireframe-tusk logo, black no-accent variant (tusk-facet.svg), so
          the masthead stays zero-#FF4500 (D-044; landing accent budget full).
          Static asset — NOT a live Walrus fetch (S1 LedeHero already carries
          that proof). Decorative: the wordmark carries the name, so alt=""
          keeps screen readers from double-announcing (the SVG itself carries
          no role/aria-label, so the decorative intent has a single source).
          Intrinsic width/height reserve the box to avoid masthead reflow
          before the SVG decodes (CLS). onError collapses the box
          (display:none, not visibility:hidden) so a sub-path-deploy 404
          leaves no phantom gap in this flex row. */}
      <img
        className={styles.mark}
        src="/mark/tusk-facet.svg"
        alt=""
        width={30}
        height={30}
        data-testid="masthead-mark"
        onError={(e) => {
          e.currentTarget.style.display = 'none';
        }}
      />
      {/* Wordmark + issue share a baseline inside this sub-group; the group
          itself centers against the 30px mark (D-096 fix: with the row
          baseline-aligned, the square mark inflated the line box and pushed
          the text to the top). */}
      <span className={styles.titleGroup}>
        <span className={styles.wordmark} data-testid="masthead-wordmark">
          Tusk3D
        </span>
        {showIssue && (
          <span className={styles.issue} data-testid="masthead-issue">
            №{issueNumber}
          </span>
        )}
      </span>
      <span className={styles.edition} data-testid="masthead-edition">
        TESTNET EDITION
      </span>
      {/* Top-right CTA — crosses from the marketing landing into the app shell
          at /browse (the variant browser). Plain anchor (not a react-router
          Link) so the Masthead stays renderable without a Router context — it
          is unit-tested in isolation. Brutalist black-on-paper button that
          inverts on hover; zero #FF4500 keeps the masthead accent-free (D-044). */}
      <a className={styles.launch} href="/browse" data-testid="masthead-launch">
        Launch App
      </a>
    </header>
  );
}
