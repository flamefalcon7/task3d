import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { BrowsePage } from './browse/BrowsePage';
import { CreatorFlow } from './creator/CreatorFlow';
import { ModelDetailPage } from './buy/ModelDetailPage';

// D-014 + D-013: / is the demo default homepage (Browse marketplace);
// /generate is the secondary CTA used by creators. /model/:objectId is the
// buyer detail page (U9).
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<BrowsePage />} />
        <Route path="/generate" element={<CreatorFlow />} />
        <Route path="/model/:objectId" element={<ModelDetailPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
