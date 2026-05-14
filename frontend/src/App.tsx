import { useCallback, useState } from 'react';
import type { GenerateParams } from '@overflow2026/shared';
import { generate, previewUrl } from './lib/api';
import { ShapePicker } from './components/ShapePicker';
import { PreviewCanvas } from './babylon/PreviewCanvas';

function App() {
  const [params, setParams] = useState<GenerateParams | null>(null);
  const [glbUrl, setGlbUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const onGenerate = useCallback(async () => {
    if (!params) return;
    setStatus('loading');
    setErrMsg(null);
    try {
      const { id } = await generate(params);
      setGlbUrl(previewUrl(id));
      setStatus('idle');
    } catch (e) {
      setStatus('error');
      setErrMsg(e instanceof Error ? e.message : String(e));
    }
  }, [params]);

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui' }}>
      <aside style={{ width: 360, padding: 20, borderRight: '1px solid #222', overflowY: 'auto' }}>
        <h1 style={{ fontSize: 18, marginTop: 0 }}>overflow2026 — Phase 1</h1>
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

export default App;
