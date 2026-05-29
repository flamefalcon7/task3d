import { type JSX } from 'react';
import styles from './LifecycleStrip.module.css';

interface Panel {
  /** stable key + testid suffix */
  key: string;
  /** mono header word */
  header: string;
  /** on-chain layer sub-caption (v1-shipped only — no Access/Seal/Derivative) */
  layer: string;
  /** panel 1 renders this prompt text in the well */
  prompt?: string;
  /** panels 2–4 render this static SVG asset in the well */
  img?: string;
  alt?: string;
}

const TUSK_PROMPT = 'a low-poly walrus tusk, ornate carve';

// The 4 visitor-facing stages. Layer captions are fixed by plan-023 KD-2/AC-3
// and must stay v1-shipped: INPUT / L1 Model3D / L2 NftToken / L3 Integration.
// "Access", "Seal", "Derivative" are v1.1 / unshipped and must not appear.
const PANELS: readonly Panel[] = [
  { key: 'prompt', header: 'PROMPT', layer: 'INPUT · Tripo', prompt: TUSK_PROMPT },
  {
    key: 'model',
    header: 'MODEL',
    layer: 'L1 · Model3D',
    img: '/lifecycle/model.svg',
    alt: 'A walrus tusk shown half as a solid model, half as a wireframe mesh',
  },
  {
    key: 'variant',
    header: 'VARIANT',
    layer: 'L2 · NftToken',
    img: '/lifecycle/variant.svg',
    alt: 'A grid of eight tusk forks',
  },
  {
    key: 'ingame',
    header: 'IN-GAME OBJ',
    layer: 'L3 · Integration',
    img: '/lifecycle/in-game.svg',
    alt: 'The tusk floating as a usable object in a neutral game scene',
  },
];

/**
 * S4 lifecycle strip — a static 4-panel explainer of the Tusk3D pipeline,
 * mounted between the lede and the keycap row. Pure presentational: no state,
 * no effects, no Babylon, no Walrus fetch (plan-023 KD-1 / AC-6). Black-well
 * panels, mono headers + layer sub-captions, Newsreader-italic tagline, zero
 * #FF4500 accent (D-044; budget full).
 */
export function LifecycleStrip(): JSX.Element {
  return (
    <section className={styles.strip} data-testid="lifecycle-strip" aria-label="How Tusk3D works">
      <ol className={styles.grid}>
        {PANELS.map((p) => (
          <li key={p.key} className={styles.panel} data-testid={`lifecycle-panel-${p.key}`}>
            <span className={styles.header}>{p.header}</span>
            <div className={styles.well}>
              {p.prompt ? (
                <span className={styles.prompt}>&ldquo;{p.prompt}&rdquo;</span>
              ) : (
                <img className={styles.art} src={p.img} alt={p.alt} />
              )}
            </div>
            <span className={styles.layer}>{p.layer}</span>
          </li>
        ))}
      </ol>
      <p className={styles.tagline}>One prompt. One model. Sixteen forks. Every game.</p>
    </section>
  );
}
