import { pagePaper } from '../ux/tokens';
import { Masthead } from './Masthead';
import { LedeHero } from './LedeHero';
import { LifecycleStrip } from './LifecycleStrip';
import { ActorCards } from './ActorCards';
import { KeycapRow } from './KeycapRow';
import { TelemetryStrip } from './TelemetryStrip';

export function LandingPage(): JSX.Element {
  return (
    <main style={pagePaper} data-testid="landing-page">
      <Masthead />
      {/* S3 identity mark — future survivor plan (mounts inside Masthead's reserved slot) */}
      <TelemetryStrip />
      <LedeHero />
      <LifecycleStrip />
      <ActorCards />
      <KeycapRow />
    </main>
  );
}
