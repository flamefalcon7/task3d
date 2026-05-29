import { pagePaper } from '../ux/tokens';
import { Masthead } from './Masthead';
import { LedeHero } from './LedeHero';
import { KeycapRow } from './KeycapRow';
import { TelemetryStrip } from './TelemetryStrip';

export function LandingPage(): JSX.Element {
  return (
    <main style={pagePaper} data-testid="landing-page">
      <Masthead />
      <TelemetryStrip />
      <LedeHero />
      {/* S3 identity mark — future survivor plan (mounts inside Masthead's reserved slot) */}
      {/* S4 lifecycle strip — future survivor plan */}
      {/* S5 actor cards — future survivor plan */}
      <KeycapRow />
    </main>
  );
}
