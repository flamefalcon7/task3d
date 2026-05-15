import { Link } from 'react-router-dom';
import type { Model3DSummary } from '@overflow2026/shared';

interface Props {
  model: Model3DSummary;
}

// why: SG-008 deferred per-card Babylon rendering — too heavy for a 30-card
// grid. Phase 2 ships a static placeholder; real GLB rendering happens on
// the /model/:objectId detail page (U9). Phase 5 polish may bring per-card
// previews back if perf allows.
function truncate(addr: string, head = 6, tail = 4): string {
  if (!addr || addr.length <= head + tail + 1) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

function formatSui(mist: string): string {
  // 1 SUI = 1_000_000_000 MIST. We format without bigint dependence to keep
  // the bundle slim — overflow above ~9e15 mist (9M SUI) isn't a concern here.
  const n = Number(mist);
  if (!Number.isFinite(n) || n <= 0) return 'Free';
  const sui = n / 1_000_000_000;
  return `${sui.toFixed(sui < 0.01 ? 4 : 2)} SUI`;
}

export function ModelCard({ model }: Props) {
  return (
    <Link
      to={`/model/${model.objectId}`}
      data-testid={`model-card-${model.objectId}`}
      style={{
        display: 'block',
        textDecoration: 'none',
        color: 'inherit',
        border: '1px solid #2a2d33',
        borderRadius: 8,
        background: '#1a1c20',
        overflow: 'hidden',
        transition: 'border-color 120ms',
      }}
    >
      <div
        style={{
          aspectRatio: '1 / 1',
          background: 'linear-gradient(135deg, #23262c 0%, #15171b 100%)',
          display: 'grid',
          placeItems: 'center',
          color: '#444',
          fontSize: 36,
        }}
        aria-hidden
      >
        ◇
      </div>
      <div style={{ padding: 12 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            marginBottom: 4,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {model.name || `Model ${truncate(model.objectId)}`}
        </div>
        <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>
          by <span data-testid="card-creator">{truncate(model.creator)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: '#aaa' }}>{model.shapeType}</span>
          <span data-testid="card-price" style={{ fontSize: 13, fontWeight: 600 }}>
            {formatSui(model.directAccessPrice)}
          </span>
        </div>
        {model.tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {model.tags.map((t) => (
              <span
                key={t}
                data-testid="card-tag"
                style={{
                  fontSize: 10,
                  padding: '2px 6px',
                  background: '#2a2d33',
                  color: '#bbb',
                  borderRadius: 4,
                }}
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
