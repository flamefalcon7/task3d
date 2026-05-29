import { pagePaper } from '../ux/tokens';
import { LedeHero } from './LedeHero';
import { KeycapRow } from './KeycapRow';
import { TelemetryStrip } from './TelemetryStrip';

export function LandingPage(): JSX.Element {
  return (
    <main style={pagePaper} data-testid="landing-page">
      <TelemetryStrip />
      <LedeHero />
      {/* S3 identity mark — future survivor plan */}
      {/* S4 lifecycle strip — future survivor plan */}
      {/* S5 actor cards — future survivor plan */}
      {/* S7 issue masthead — future survivor plan */}
      <KeycapRow />
    </main>
  );
}
