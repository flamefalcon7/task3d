import type { JSX } from 'react';
import { Link } from 'react-router-dom';
import styles from './KeycapRow.module.css';

interface Keycap {
  verb: string;
  route: string;
  accent?: boolean;
}

const KEYCAPS: readonly Keycap[] = [
  { verb: 'CARVE', route: '/create' },
  { verb: 'RIFF', route: '/launch' },
  { verb: 'BROWSE', route: '/browse', accent: true },
  { verb: 'INTEGRATE', route: '/integrate' },
];

export function KeycapRow(): JSX.Element {
  return (
    <nav data-testid="keycap-row" aria-label="Site sections">
      <ul className={styles.keycaps}>
        {KEYCAPS.map((kc) => (
          <li key={kc.verb}>
            <Link
              to={kc.route}
              className={styles.keycap}
              data-testid={`keycap-${kc.verb.toLowerCase()}`}
            >
              <span className={styles.verb}>
                {kc.verb}
                {kc.accent && (
                  <span
                    className={styles.accentDot}
                    data-testid="keycap-accent-dot"
                    aria-hidden="true"
                  />
                )}
              </span>
              <span className={styles.route}>{kc.route.toUpperCase()}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
