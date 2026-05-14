import { useEffect, useMemo, useState } from 'react';
import type { GenerateParams, ShapeCatalog, ShapeId, ShapeSpec } from '@overflow2026/shared';
import { fetchShapes } from '../lib/api';

interface Props {
  onParamsChange: (params: GenerateParams) => void;
}

function defaultsFor(spec: ShapeSpec): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of spec.fields) out[f.name] = f.default;
  return out;
}

export function ShapePicker({ onParamsChange }: Props) {
  const [catalog, setCatalog] = useState<ShapeCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shapeId, setShapeId] = useState<ShapeId>('box');
  const [values, setValues] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchShapes()
      .then((c) => {
        setCatalog(c);
        const first = c.find((s) => s.id === 'box') ?? c[0];
        if (first) {
          setShapeId(first.id);
          setValues(defaultsFor(first));
        }
      })
      .catch((e) => setError(String(e)));
  }, []);

  const currentSpec = useMemo(
    () => catalog?.find((s) => s.id === shapeId) ?? null,
    [catalog, shapeId],
  );

  useEffect(() => {
    if (!currentSpec) return;
    const params = { shape: currentSpec.id, ...values } as unknown as GenerateParams;
    onParamsChange(params);
  }, [currentSpec, values, onParamsChange]);

  if (error) return <div role="alert" style={{ color: 'salmon' }}>Failed to load shapes: {error}</div>;
  if (!catalog || !currentSpec) return <div>Loading shapes…</div>;

  return (
    <div data-testid="shape-picker">
      <label style={{ display: 'block', marginBottom: 12 }}>
        Shape:{' '}
        <select
          value={shapeId}
          onChange={(e) => {
            const next = e.target.value as ShapeId;
            const spec = catalog.find((s) => s.id === next)!;
            setShapeId(next);
            setValues(defaultsFor(spec));
          }}
        >
          {catalog.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
      </label>
      {currentSpec.fields.map((f) => (
        <div key={f.name} style={{ marginBottom: 8 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ minWidth: 100 }}>{f.label}</span>
            <input
              type="range"
              min={f.min}
              max={f.max}
              step={f.step}
              value={values[f.name] ?? f.default}
              onChange={(e) => setValues((v) => ({ ...v, [f.name]: Number(e.target.value) }))}
              style={{ flex: 1 }}
              data-testid={`slider-${f.name}`}
            />
            <span style={{ minWidth: 60, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {(values[f.name] ?? f.default).toFixed(2)}
            </span>
          </label>
        </div>
      ))}
    </div>
  );
}
