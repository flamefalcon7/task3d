import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { BrowsePage } from './browse/BrowsePage';
import { CreatorFlow } from './creator/CreatorFlow';
import { ModelDetailPage } from './buy/ModelDetailPage';
import { ForgePage } from './forge/ForgePage';
import { CollectionDetailPage } from './collection/CollectionDetailPage';
import { TrackPage } from './track/TrackPage';
import { CompareGlbsPage } from './dev/CompareGlbsPage';

// D-014 + D-013: / is the demo default homepage (Browse marketplace);
// /generate is the secondary CTA used by creators. /model/:objectId is the
// buyer detail page (U9). Phase 3 adds /forge (creator collection mint per
// U4), /collection/:slug (variant browser per U5), and /track (Tiny
// Racetrack per U6 — Babylon + Havok scene driven by the buyer's owned
// variants).
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<BrowsePage />} />
        <Route path="/generate" element={<CreatorFlow />} />
        <Route path="/model/:objectId" element={<ModelDetailPage />} />
        <Route path="/forge" element={<ForgePage />} />
        <Route path="/collection/:slug" element={<CollectionDetailPage />} />
        <Route path="/track" element={<TrackPage />} />
        <Route path="/dev/compare" element={<CompareGlbsPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
