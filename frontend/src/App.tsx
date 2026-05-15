import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { BrowsePage } from './browse/BrowsePage';
import { CreatorFlow } from './creator/CreatorFlow';

// D-014 + D-013: / is the demo default homepage (Browse marketplace);
// /generate is the secondary CTA used by creators. U9 will add
// /model/:objectId for the buyer detail page.
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<BrowsePage />} />
        <Route path="/generate" element={<CreatorFlow />} />
        {/* U9 adds /model/:objectId */}
      </Routes>
    </BrowserRouter>
  );
}

export default App;
