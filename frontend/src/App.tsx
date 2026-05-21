import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { BrowsePage } from './browse/BrowsePage';
import { CreateModelPage } from './creator/CreateModelPage';
import { ModelDetailPage } from './buy/ModelDetailPage';
import { LaunchCollectionPage } from './collection/LaunchCollectionPage';
import { CollectionDetailPage } from './collection/CollectionDetailPage';
import { RegisterIntegrationPage } from './integration/RegisterIntegrationPage';
import { MarketPage } from './market/MarketPage';
import { TrackPage } from './track/TrackPage';
import { CompareGlbsPage } from './dev/CompareGlbsPage';

// / is the demo default homepage (Browse marketplace); /create is the L1
// creator mint page. /model/:objectId is the buyer detail page. /launch is the
// nft-creator L1→L2 fork page (U12b — pick a base Model3D, author variants,
// one-signature launch_collection_with_tokens). /collection/:slug is the
// variant browser; /track is the Tiny Racetrack (Babylon + Havok) driven by the
// buyer's owned variants.
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<BrowsePage />} />
        <Route path="/create" element={<CreateModelPage />} />
        <Route path="/model/:objectId" element={<ModelDetailPage />} />
        <Route path="/launch" element={<LaunchCollectionPage />} />
        <Route path="/collection/:slug" element={<CollectionDetailPage />} />
        <Route path="/integrate" element={<RegisterIntegrationPage />} />
        <Route path="/market" element={<MarketPage />} />
        <Route path="/track" element={<TrackPage />} />
        <Route path="/dev/compare" element={<CompareGlbsPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
