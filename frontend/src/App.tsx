import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import type { GenerateParams } from '@overflow2026/shared';
import { generate } from './lib/api';
import { ShapePicker } from './components/ShapePicker';
import { PreviewCanvas } from './babylon/PreviewCanvas';
import { BrowsePage } from './browse/BrowsePage';

// Phase 1's inline ShapePicker + PreviewCanvas demo loop now lives at
// /generate as a placeholder. U7 replaces this with the real CreatorFlow
// (wallet sign + publish PTB). Keeping the loop intact preserves the local
// procedural preview path while U7 is in flight.
function CreatorFlowPlaceholder() {
  const [params, setParams] = useState<GenerateParams | null>(null);
  const [glbUrl, setGlbUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!glbUrl) return;
    return () => URL.revokeObjectURL(glbUrl);
  }, [glbUrl]);

  const onGenerate = useCallback(async () => {
    if (!params) return;
    setStatus('loading');
    setErrMsg(null);
    try {
      const { glbBytes } = await generate(params);
      const blob = new Blob([glbBytes as BlobPart], { type: 'model/gltf-binary' });
      const url = URL.createObjectURL(blob);
      setGlbUrl(url);
      setStatus('idle');
    } catch (e) {
      setStatus('error');
      setErrMsg(e instanceof Error ? e.message : String(e));
    }
  }, [params]);

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui' }}>
      <aside style={{ width: 360, padding: 20, borderRight: '1px solid #222', overflowY: 'auto' }}>
        <Link to="/" style={{ fontSize: 12, color: '#7aa2ff', textDecoration: 'none' }}>← Browse</Link>
        <h1 style={{ fontSize: 18, marginTop: 12 }}>overflow2026 — Phase 1</h1>
        <p style={{ fontSize: 12, color: '#888' }}>Local procedural preview. No chain.</p>
        <ShapePicker onParamsChange={setParams} />
        <button
          onClick={onGenerate}
          disabled={!params || status === 'loading'}
          data-testid="generate-button"
          style={{
            marginTop: 16,
            width: '100%',
            padding: '10px 16px',
            fontSize: 14,
            cursor: status === 'loading' ? 'wait' : 'pointer',
          }}
        >
          {status === 'loading' ? 'Generating…' : 'Generate'}
        </button>
        {errMsg && <p role="alert" style={{ color: 'salmon', fontSize: 12 }}>{errMsg}</p>}
      </aside>
      <main style={{ flex: 1, position: 'relative', background: '#15171b' }}>
        <PreviewCanvas glbUrl={glbUrl} />
        {!glbUrl && (
          <div style={{
            position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
            color: '#666', fontSize: 13, pointerEvents: 'none',
          }}>
            Pick a shape and click Generate
          </div>
        )}
      </main>
    </div>
  );
}

// D-014 + D-013: / is the demo default homepage (Browse marketplace);
// /generate is the secondary CTA used by creators. U9 will add
// /model/:objectId for the buyer detail page.
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<BrowsePage />} />
        <Route path="/generate" element={<CreatorFlowPlaceholder />} />
        {/* U9 adds /model/:objectId */}
      </Routes>
    </BrowserRouter>
  );
}

export default App;
