import type { JSX } from 'react';
import { pagePaper } from '../ux/tokens';
import { Masthead } from './Masthead';
import { LedeHero } from './LedeHero';
import { LifecycleStrip } from './LifecycleStrip';
import { ActorCards } from './ActorCards';
import { KeycapRow } from './KeycapRow';
import { TelemetryStrip } from './TelemetryStrip';
import { useSmoothScroll } from './useSmoothScroll';
import { RevealSection } from './RevealSection';
import { ScrollSpineIndicator } from './ScrollSpineIndicator';

export function LandingPage(): JSX.Element {
  // Landing scroll spine (D-098): eased inertial smooth-scroll. No-op unless the
  // spine is engaged (flag + live render mode + not reduced-motion). Hook is
  // unconditional and page-level (Lenis wraps the window scroller).
  useSmoothScroll();

  return (
    <main style={pagePaper} data-testid="landing-page">
      {/* Fixed stage indicator (CARVE/MINT/RIFF) — self-suppresses on mobile and
          when the spine is off. Rendered outside flow; document order below is
          unchanged. */}
      <ScrollSpineIndicator />
      <Masthead />
      {/* S3 identity mark — future survivor plan (mounts inside Masthead's reserved slot) */}
      <TelemetryStrip />
      {/* Above-the-fold (Masthead/Telemetry/Hero) are not reveal-wrapped — they are
          visible on load; the hero has its own scroll-coupled farewell (U5). The
          below-fold sections ease in once as they are scrolled to (U3). */}
      <LedeHero />
      <RevealSection>
        <LifecycleStrip />
      </RevealSection>
      <RevealSection>
        <ActorCards />
      </RevealSection>
      <RevealSection>
        <KeycapRow />
      </RevealSection>
    </main>
  );
}
