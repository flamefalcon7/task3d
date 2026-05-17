// DEV-only page for visually comparing Tripo model_version outputs.
// Delete after Tripo model_version is locked.
import { useState } from 'react';
import { PreviewCanvas } from '../babylon/PreviewCanvas';
import { DetailedViewer } from './DetailedViewer';

interface Sample {
  label: string;
  file: string;
  cost: string;
  time: string;
  size: string;
}

const SAMPLES: Sample[] = [
  { label: 'Turbo-v1.0-20250506',        file: 'turbo-v1.glb',  cost: '~15 cr', time: '~15s', size: '638 KB' },
  { label: 'v1.4-20240625',              file: 'v1.4.glb',      cost: '~15 cr', time: '~25s', size: '1.78 MB' },
  { label: 'P1-20260311',                file: 'p1.glb',        cost: '~50 cr', time: '~40s', size: '762 KB' },
  { label: 'Turbo + mesh_segmentation',  file: 'turbo-seg.glb', cost: '+40 cr', time: '+30s', size: '?' },
];

export function CompareGlbsPage() {
  const [focused, setFocused] = useState<Sample | null>(null);

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', background: '#0a0a0a', minHeight: '100vh', color: '#eee' }}>
      <h1 style={{ marginTop: 0 }}>Tripo model_version visual comparison</h1>
      <p style={{ opacity: 0.7, marginBottom: 24 }}>
        Prompt: <code>"a small red sports car"</code>, face_limit: 5000, texture: false.
        Click a card to open the detailed viewer.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {SAMPLES.map((s) => (
          <button
            key={s.file}
            onClick={() => setFocused(s)}
            style={{
              all: 'unset',
              cursor: 'pointer',
              border: '1px solid #333',
              borderRadius: 8,
              padding: 12,
              background: '#141414',
              display: 'block',
            }}
          >
            <h3 style={{ margin: '0 0 4px' }}>{s.label}</h3>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
              cost {s.cost} · time {s.time} · file {s.size}
            </div>
            <div style={{ height: 360, background: '#000', borderRadius: 4, overflow: 'hidden' }}>
              <PreviewCanvas glbUrl={`/dev-glbs/${s.file}`} />
            </div>
            <div style={{ fontSize: 11, color: '#3b82f6', marginTop: 8, textAlign: 'right' }}>
              click to enlarge ↗
            </div>
          </button>
        ))}
      </div>
      {focused && (
        <DetailedViewer
          glbUrl={`/dev-glbs/${focused.file}`}
          label={focused.label}
          onClose={() => setFocused(null)}
        />
      )}
    </div>
  );
}
