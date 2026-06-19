import { type JSX } from 'react';
import { Link } from 'react-router-dom';
import styles from './ActorCards.module.css';

interface Actor {
  /** stable key + testid suffix */
  key: string;
  /** actor name (Newsreader italic) */
  name: string;
  /** MTG "mana cost" — qualitative honest cost, NO hardcoded SUI (KD-2) */
  cost: string;
  /** one-sentence ability (body sans) */
  ability: string;
  /** one-line italic role poem */
  flavor: string;
  /** provenance route — a real App.tsx route, clickable (KD-A) */
  route: string;
  /** gameDev is downstream of L1/L2/L3, not a parallel peer (KD-3/KD-B) */
  downstream?: boolean;
}

// The four Tusk3D actors. Copy is verbatim from the S5 requirements Card
// Content table and is honest to SHIPPED v1 (plan-024 KD-1):
//   - buyer OWNS an NftToken (ownership, not access)
//   - gameDev REGISTERS an integration (register_integration)
// "Access" / "Derivative" are unshipped (Access struct deleted D-029; "Derivative"
// flavor deferred) and must not appear anywhere on this surface. "Seal" IS shipped
// (v9 / plan-026 — gated bases are Seal-encrypted), so it may appear — but ONLY in
// honest mitigation framing (R14: never "piracy-proof" / "prevented"). Enforced by
// ActorCards.test.tsx (word-boundary).
const ACTORS: readonly Actor[] = [
  {
    key: 'modelCreator',
    name: 'Model Creator',
    cost: 'gas + storage protocol fee + 3rd API fee',
    // plan-026 — honest Seal beat: gated (allow-list / restricted) bases are
    // Seal-encrypted; mitigation framing (pay-to-unlock), not "piracy-proof".
    ability: 'Publishes a base model to Walrus and sets its license terms — gated bases are Seal-encrypted, so forkers pay to unlock.',
    flavor: 'Every tusk begins as a sentence.',
    route: '/create',
  },
  {
    key: 'nftCreator',
    name: 'NFT Creator',
    cost: 'pay-to-derive + gas',
    ability: 'Forks a base into a variant collection — one signature launches the whole palette.',
    flavor: 'Riff on what already exists.',
    route: '/launch',
  },
  {
    key: 'buyer',
    name: 'Buyer',
    cost: 'listing price + 5% royalty',
    ability: 'Buys and owns an on-chain token — the variant is yours, not rented.',
    flavor: 'Own the object, not a license.',
    route: '/browse',
  },
  {
    key: 'gameDev',
    name: 'Media Creator / Game Dev',
    cost: 'registration fee + gas',
    // Honest to shipped v1: register_integration writes an on-chain
    // attestation ({name, url}) that a game can verify — it is NOT an
    // in-game runtime/SDK render path (none ships for 6/21). Avoids the
    // S4 IN-GAME overclaim. The aspiration lives in the flavor line, not
    // the literal ability.
    ability: 'Registers an on-chain integration any app can verify.',
    flavor: 'Where the carving ends up.',
    route: '/integrate',
    downstream: true,
  },
];

/**
 * S5 actor cards — a static 4-card row casting the Tusk3D actors as
 * brutalist-editorial trading cards (MTG anatomy: name / cost / ability /
 * flavor / provenance). Mounted between the S4 lifecycle strip and the S6
 * keycap row. Pure presentational: no state, no effects, no Babylon, no
 * fetch (plan-024 KD-7). The only motion is a CSS :hover tilt. Zero #FF4500
 * accent (D-044; budget full — KD-6). Provenance routes are clickable Links
 * (KD-A) and offer role-based dispatch complementing S6's verb dispatch.
 * The gameDev card is marked downstream (KD-B): it consumes the output of the
 * create → launch → browse production chain rather than being a parallel peer.
 */
export function ActorCards(): JSX.Element {
  return (
    <section className={styles.section} data-testid="actor-cards" aria-label="Who Tusk3D is for">
      <ol className={styles.grid}>
        {ACTORS.map((a) => (
          <li
            key={a.key}
            className={a.downstream ? `${styles.card} ${styles.downstream}` : styles.card}
            data-testid={`actor-card-${a.key}`}
            data-downstream={a.downstream ? 'true' : undefined}
          >
            {a.downstream && (
              <span className={styles.kicker} aria-hidden="true">
                ↳ CONSUMES OUTPUT
              </span>
            )}
            <span className={styles.name}>{a.name}</span>
            <span className={styles.cost}>{a.cost}</span>
            <p className={styles.ability}>{a.ability}</p>
            <span className={styles.flavor}>{a.flavor}</span>
            <Link className={styles.provenance} to={a.route} data-testid={`actor-route-${a.key}`}>
              → {a.route}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
