import { type JSX } from 'react';
import styles from './LifecycleStrip.module.css';
import { TypewriterPrompt } from './TypewriterPrompt';
import { ModelPanel } from './panels/ModelPanel';
import { VariantPanel } from './panels/VariantPanel';
import { InGamePanel } from './panels/InGamePanel';

type PanelKind = 'typing' | 'model' | 'variant' | 'ingame';

interface Panel {
  /** stable key + testid suffix */
  key: string;
  /** mono header word */
  header: string;
  /** on-chain layer sub-caption — contract-locked (plan-023 KD-2/AC-3). */
  layer: string;
  /** which live well to render in the panel body */
  kind: PanelKind;
}

// The 4 visitor-facing stages. Layer captions are fixed by plan-023 KD-2/AC-3
// and stay v1-shipped: INPUT / L1 Model3D / L2 NftToken / L3 Integration.
// "Access", "Seal", "Derivative" are v1.1 / unshipped and must not appear.
const PANELS: readonly Panel[] = [
  { key: 'prompt', header: 'PROMPT', layer: 'INPUT · Tripo', kind: 'typing' },
  { key: 'model', header: 'MODEL', layer: 'L1 · Model3D', kind: 'model' },
  { key: 'variant', header: 'VARIANT', layer: 'L2 · NftToken', kind: 'variant' },
  { key: 'ingame', header: 'IN-GAME OBJ', layer: 'L3 · Integration', kind: 'ingame' },
];

function PanelBody({ kind }: { kind: PanelKind }): JSX.Element {
  switch (kind) {
    case 'typing':
      return <TypewriterPrompt className={styles.prompt} cursorClassName={styles.cursor} />;
    case 'model':
      return <ModelPanel />;
    case 'variant':
      return <VariantPanel />;
    case 'ingame':
      return <InGamePanel />;
  }
}

/**
 * S4 lifecycle strip — a 4-panel explainer of the Tusk3D pipeline, between the
 * lede and the keycap row. Now live (D-092 reverses plan-023's static rule):
 * PROMPT types itself out (no Babylon), MODEL/VARIANT/IN-GAME are live Babylon
 * wells (LiveWell) that fall back to their static SVGs on low-end/mobile. The
 * editorial chrome — mono headers, layer sub-captions, tagline, black wells —
 * is unchanged. Panels stay accent-free (D-093 scopes the grey exception to the
 * hero well only).
 */
export function LifecycleStrip(): JSX.Element {
  return (
    <section className={styles.strip} data-testid="lifecycle-strip" aria-label="How Tusk3D works">
      <ol className={styles.grid}>
        {PANELS.map((p) => (
          <li key={p.key} className={styles.panel} data-testid={`lifecycle-panel-${p.key}`}>
            <span className={styles.header}>{p.header}</span>
            <div className={styles.well}>
              <PanelBody kind={p.kind} />
            </div>
            <span className={styles.layer}>{p.layer}</span>
          </li>
        ))}
      </ol>
      <p className={styles.tagline}>One prompt. One model. Infinite forks. Any world.</p>
    </section>
  );
}
