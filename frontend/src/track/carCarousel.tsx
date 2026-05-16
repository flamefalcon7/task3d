import type { Model3DSummary } from '@overflow2026/shared';

// Phase 3 U6 — horizontal strip of owned-variant thumbnails. Click a tile
// to swap the loaded car. v1 has no GLB thumbnails (would need a second
// Babylon render-to-texture pass per variant), so each tile shows the
// variant name + a colored swatch derived from its objectId. Phase 5 polish
// can add real screenshots.

function truncate(addr: string, head = 4, tail = 4): string {
  if (!addr || addr.length <= head + tail + 1) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

// Pure objectId-hash → CSS color. Deterministic so the same variant always
// gets the same swatch, gives the carousel some visual variety without
// shipping thumbnails.
function swatch(objectId: string): string {
  let h = 0;
  for (let i = 0; i < objectId.length; i++) {
    h = (h * 31 + objectId.charCodeAt(i)) | 0;
  }
  const hue = ((h % 360) + 360) % 360;
  return `hsl(${hue} 55% 60%)`;
}

export interface CarCarouselProps {
  variants: Model3DSummary[];
  selectedIdx: number;
  onSelect: (idx: number) => void;
}

export function CarCarousel({
  variants,
  selectedIdx,
  onSelect,
}: CarCarouselProps) {
  return (
    <div
      data-testid="car-carousel"
      style={{
        display: 'flex',
        gap: 12,
        overflowX: 'auto',
        padding: '12px 0',
      }}
    >
      {variants.map((v, idx) => {
        const selected = idx === selectedIdx;
        return (
          <button
            key={v.objectId}
            data-testid={`carousel-tile-${idx}`}
            data-selected={selected ? 'true' : 'false'}
            onClick={() => onSelect(idx)}
            type="button"
            style={{
              minWidth: 120,
              padding: 12,
              border: selected ? '2px solid #2b7' : '1px solid #ccc',
              borderRadius: 8,
              background: selected ? '#f1faf3' : '#fff',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <div
              aria-hidden
              style={{
                width: '100%',
                height: 64,
                borderRadius: 6,
                background: swatch(v.objectId),
                marginBottom: 8,
              }}
            />
            <div style={{ fontWeight: 600, fontSize: 13 }}>
              {v.name || `Variant ${truncate(v.objectId)}`}
            </div>
            <div style={{ fontSize: 11, color: '#666' }}>
              {v.shapeType || 'unknown'}
            </div>
          </button>
        );
      })}
    </div>
  );
}
