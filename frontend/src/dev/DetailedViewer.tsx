// DEV-only detailed GLB viewer modal — used by CompareGlbsPage.
// Delete with CompareGlbsPage after model_version is locked.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArcRotateCamera,
  AssetContainer,
  Color3,
  Color4,
  Engine,
  HemisphericLight,
  LoadAssetContainerAsync,
  Mesh,
  PointerEventTypes,
  Scene,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF/index.js';

type ViewMode = 'solid' | 'wireframe' | 'bbox' | 'color-by-mesh';
type CameraPreset = 'persp' | 'front' | 'side' | 'top';
type Bg = 'dark' | 'light';

interface MeshInfo {
  name: string;
  vertices: number;
  faces: number;
  // Bounding-box center in world space; useful for spotting wheels (low Y, paired X).
  centerX: number;
  centerY: number;
  centerZ: number;
  sizeX: number;
  sizeY: number;
  sizeZ: number;
}

interface Stats {
  meshes: number;
  vertices: number;
  faces: number;
  materials: number;
}

interface DetailedViewerProps {
  glbUrl: string;
  label: string;
  onClose: () => void;
}

const CAM_PRESETS: Record<CameraPreset, { alpha: number; beta: number }> = {
  persp: { alpha: Math.PI / 4, beta: Math.PI / 3 },
  front: { alpha: -Math.PI / 2, beta: Math.PI / 2 },
  side: { alpha: 0, beta: Math.PI / 2 },
  top: { alpha: -Math.PI / 2, beta: 0.01 },
};

const BG_COLORS: Record<Bg, Color4> = {
  dark: new Color4(0.08, 0.09, 0.11, 1),
  light: new Color4(0.85, 0.86, 0.88, 1),
};

// Palette for color-by-mesh — 16 distinct hues; cycles if more meshes.
const MESH_PALETTE: [number, number, number][] = [
  [0.95, 0.30, 0.30], [0.30, 0.75, 0.30], [0.30, 0.50, 0.95], [0.95, 0.80, 0.20],
  [0.85, 0.35, 0.85], [0.30, 0.85, 0.85], [0.95, 0.55, 0.20], [0.55, 0.30, 0.85],
  [0.20, 0.85, 0.55], [0.85, 0.20, 0.55], [0.55, 0.85, 0.20], [0.20, 0.55, 0.85],
  [0.85, 0.65, 0.40], [0.40, 0.85, 0.65], [0.65, 0.40, 0.85], [0.85, 0.40, 0.40],
];

export function DetailedViewer({ glbUrl, label, onClose }: DetailedViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const cameraRef = useRef<ArcRotateCamera | null>(null);
  const containerRef = useRef<AssetContainer | null>(null);
  // Track original materials so we can restore after color-by-mesh.
  const originalMaterialsRef = useRef<Map<string, unknown>>(new Map());

  const [viewMode, setViewMode] = useState<ViewMode>('solid');
  const [bg, setBg] = useState<Bg>('dark');
  const [stats, setStats] = useState<Stats | null>(null);
  const [meshInfos, setMeshInfos] = useState<MeshInfo[]>([]);
  // null = show all; mesh name = isolate that mesh.
  const [isolated, setIsolated] = useState<string | null>(null);
  // mesh name highlighted by hover or pick (for visual emphasis in list).
  const [highlighted, setHighlighted] = useState<string | null>(null);

  // ESC to close (or clear isolate first).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isolated) setIsolated(null);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, isolated]);

  // Init engine/scene/camera/light.
  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new Engine(canvasRef.current, true);
    const scene = new Scene(engine);
    scene.clearColor = BG_COLORS.dark;
    const camera = new ArcRotateCamera(
      'cam',
      CAM_PRESETS.persp.alpha,
      CAM_PRESETS.persp.beta,
      4,
      new Vector3(0, 0.5, 0),
      scene,
    );
    camera.attachControl(canvasRef.current, true);
    camera.wheelDeltaPercentage = 0.01;
    camera.lowerRadiusLimit = 0.1;
    camera.upperRadiusLimit = 50;
    new HemisphericLight('hl', new Vector3(0, 1, 0), scene);

    // Click-pick: tap a mesh in the canvas → highlight in list.
    scene.onPointerObservable.add((info) => {
      if (info.type !== PointerEventTypes.POINTERTAP) return;
      const picked = info.pickInfo?.pickedMesh;
      if (picked && picked instanceof Mesh) {
        setHighlighted(picked.name);
      } else {
        setHighlighted(null);
      }
    });

    engine.runRenderLoop(() => scene.render());
    engineRef.current = engine;
    sceneRef.current = scene;
    cameraRef.current = camera;

    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      containerRef.current?.dispose();
      scene.dispose();
      engine.dispose();
      engineRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      containerRef.current = null;
    };
  }, []);

  // Load GLB when URL changes; collect stats + per-mesh info.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !glbUrl) return;
    let cancelled = false;
    setIsolated(null);
    setHighlighted(null);
    (async () => {
      try {
        const container = await LoadAssetContainerAsync(glbUrl, scene);
        if (cancelled) {
          container.dispose();
          return;
        }
        containerRef.current?.dispose();
        container.addAllToScene();
        containerRef.current = container;

        // Geometry-bearing meshes only.
        const meshes = container.meshes.filter(
          (m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0,
        );

        // Cache original materials so color-by-mesh can be reverted.
        originalMaterialsRef.current.clear();
        meshes.forEach((m) => {
          originalMaterialsRef.current.set(m.name, m.material);
        });

        const totalVerts = meshes.reduce((s, m) => s + m.getTotalVertices(), 0);
        const totalFaces = meshes.reduce((s, m) => s + Math.floor(m.getTotalIndices() / 3), 0);
        setStats({
          meshes: meshes.length,
          vertices: totalVerts,
          faces: totalFaces,
          materials: container.materials.length,
        });

        const infos: MeshInfo[] = meshes.map((m) => {
          m.computeWorldMatrix(true);
          const bb = m.getBoundingInfo().boundingBox;
          const min = bb.minimumWorld;
          const max = bb.maximumWorld;
          return {
            name: m.name,
            vertices: m.getTotalVertices(),
            faces: Math.floor(m.getTotalIndices() / 3),
            centerX: (min.x + max.x) / 2,
            centerY: (min.y + max.y) / 2,
            centerZ: (min.z + max.z) / 2,
            sizeX: max.x - min.x,
            sizeY: max.y - min.y,
            sizeZ: max.z - min.z,
          };
        });
        setMeshInfos(infos);
      } catch (err) {
        console.error('DetailedViewer: load failed', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [glbUrl]);

  // Apply view mode.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    scene.forceWireframe = viewMode === 'wireframe';
    scene.meshes.forEach((m) => {
      m.showBoundingBox = viewMode === 'bbox';
    });

    // Color-by-mesh: assign distinct emissive-tinted material per mesh.
    const meshes = scene.meshes.filter(
      (m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0,
    );
    if (viewMode === 'color-by-mesh') {
      meshes.forEach((m, i) => {
        const [r, g, b] = MESH_PALETTE[i % MESH_PALETTE.length]!;
        const mat = new StandardMaterial(`__cbm_${m.name}`, scene);
        mat.diffuseColor = new Color3(r, g, b);
        mat.emissiveColor = new Color3(r * 0.25, g * 0.25, b * 0.25);
        m.material = mat;
      });
    } else {
      // Restore originals.
      meshes.forEach((m) => {
        const orig = originalMaterialsRef.current.get(m.name);
        if (orig !== undefined) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          m.material = orig as any;
        }
      });
    }
  }, [viewMode, meshInfos]);

  // Apply isolation: hide non-isolated meshes.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const meshes = scene.meshes.filter(
      (m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0,
    );
    meshes.forEach((m) => {
      m.isVisible = isolated === null || m.name === isolated;
    });
  }, [isolated, meshInfos]);

  // Apply background.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.clearColor = BG_COLORS[bg];
  }, [bg]);

  const applyPreset = (p: CameraPreset) => {
    const cam = cameraRef.current;
    if (!cam) return;
    cam.alpha = CAM_PRESETS[p].alpha;
    cam.beta = CAM_PRESETS[p].beta;
  };

  const zoom = (factor: number) => {
    const cam = cameraRef.current;
    if (!cam) return;
    cam.radius = Math.max(cam.lowerRadiusLimit ?? 0.1, Math.min(cam.upperRadiusLimit ?? 50, cam.radius * factor));
  };

  const resetCamera = () => {
    const cam = cameraRef.current;
    if (!cam) return;
    cam.alpha = CAM_PRESETS.persp.alpha;
    cam.beta = CAM_PRESETS.persp.beta;
    cam.radius = 4;
    cam.target = new Vector3(0, 0.5, 0);
  };

  const fmt = (n: number) => n.toLocaleString('en-US');
  const fmt3 = (n: number) => n.toFixed(2);

  // Sort meshes ascending by Y center → wheels (usually low) bubble to the top.
  const sortedInfos = useMemo(() => {
    return [...meshInfos].sort((a, b) => a.centerY - b.centerY);
  }, [meshInfos]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 1000 }}>
      {/* Fullscreen canvas */}
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
      />

      {/* Header */}
      <div style={overlayBoxStyle({ top: 12, left: 12, right: meshInfos.length > 0 ? 332 : 12, padding: '8px 12px' })}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ margin: 0, color: '#fff', fontSize: 16, flex: 1 }}>{label}</h2>
          {isolated && (
            <button onClick={() => setIsolated(null)} style={btnStyle()}>Show all</button>
          )}
          <button onClick={onClose} style={btnStyle('ghost')}>Close (ESC)</button>
        </div>
      </div>

      {/* Toolbar */}
      <div style={overlayBoxStyle({ top: 64, left: 12, right: meshInfos.length > 0 ? 332 : 12, padding: '8px 12px' })}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <ButtonGroup label="View">
            <ToggleBtn active={viewMode === 'solid'} onClick={() => setViewMode('solid')}>Solid</ToggleBtn>
            <ToggleBtn active={viewMode === 'wireframe'} onClick={() => setViewMode('wireframe')}>Wireframe</ToggleBtn>
            <ToggleBtn active={viewMode === 'bbox'} onClick={() => setViewMode('bbox')}>BBox</ToggleBtn>
            <ToggleBtn active={viewMode === 'color-by-mesh'} onClick={() => setViewMode('color-by-mesh')}>Color×Mesh</ToggleBtn>
          </ButtonGroup>
          <ButtonGroup label="Camera">
            <button onClick={() => applyPreset('persp')} style={btnStyle()}>3/4</button>
            <button onClick={() => applyPreset('front')} style={btnStyle()}>Front</button>
            <button onClick={() => applyPreset('side')} style={btnStyle()}>Side</button>
            <button onClick={() => applyPreset('top')} style={btnStyle()}>Top</button>
          </ButtonGroup>
          <ButtonGroup label="Zoom">
            <button onClick={() => zoom(0.8)} style={btnStyle()}>+</button>
            <button onClick={() => zoom(1.25)} style={btnStyle()}>−</button>
            <button onClick={resetCamera} style={btnStyle()}>Reset</button>
          </ButtonGroup>
          <ButtonGroup label="BG">
            <ToggleBtn active={bg === 'dark'} onClick={() => setBg('dark')}>Dark</ToggleBtn>
            <ToggleBtn active={bg === 'light'} onClick={() => setBg('light')}>Light</ToggleBtn>
          </ButtonGroup>
        </div>
      </div>

      {/* Mesh inspector panel (right side, only if >1 mesh) */}
      {meshInfos.length > 1 && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            bottom: 12,
            width: 308,
            background: 'rgba(0,0,0,0.75)',
            color: '#eee',
            padding: 12,
            borderRadius: 8,
            backdropFilter: 'blur(4px)',
            overflowY: 'auto',
            fontFamily: 'monospace',
            fontSize: 11,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: '#fff' }}>
            Meshes (sorted by Y ↑) · click to isolate
          </div>
          <div style={{ color: '#888', marginBottom: 8 }}>
            Wheels usually have <strong style={{ color: '#3b82f6' }}>lowest Y</strong>, paired ±X, small size.
          </div>
          {sortedInfos.map((m, idx) => {
            const colorIdx = meshInfos.findIndex((x) => x.name === m.name);
            const [r, g, b] = MESH_PALETTE[colorIdx % MESH_PALETTE.length]!;
            const isActive = isolated === m.name;
            const isHighlighted = highlighted === m.name;
            return (
              <button
                key={m.name + idx}
                onClick={() => setIsolated(isActive ? null : m.name)}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  display: 'block',
                  width: '100%',
                  padding: 8,
                  marginBottom: 4,
                  borderRadius: 6,
                  background: isActive ? '#1e40af' : isHighlighted ? '#374151' : '#141414',
                  border: `1px solid ${isActive ? '#3b82f6' : '#333'}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span
                    style={{
                      display: 'inline-block',
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      background: `rgb(${r * 255}, ${g * 255}, ${b * 255})`,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontWeight: 600, color: '#fff', wordBreak: 'break-all' }}>{m.name}</span>
                </div>
                <div style={{ color: '#aaa', fontSize: 10, lineHeight: 1.5 }}>
                  V {fmt(m.vertices)} · F {fmt(m.faces)}<br />
                  pos: ({fmt3(m.centerX)}, <strong style={{ color: '#3b82f6' }}>{fmt3(m.centerY)}</strong>, {fmt3(m.centerZ)})<br />
                  size: {fmt3(m.sizeX)} × {fmt3(m.sizeY)} × {fmt3(m.sizeZ)}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Stats overlay */}
      {stats && (
        <div
          style={overlayBoxStyle({
            bottom: 12,
            left: 12,
            padding: '8px 12px',
            fontFamily: 'monospace',
            fontSize: 12,
            color: '#eee',
          })}
        >
          meshes: {fmt(stats.meshes)} · vertices: {fmt(stats.vertices)} ·
          faces: {fmt(stats.faces)} · materials: {fmt(stats.materials)}
        </div>
      )}

      {/* Help hint */}
      <div
        style={overlayBoxStyle({
          bottom: 12,
          right: meshInfos.length > 1 ? 332 : 12,
          padding: '6px 10px',
          fontSize: 11,
          color: '#aaa',
        })}
      >
        drag rotate · wheel zoom · click mesh to pick · ESC clear/close
      </div>
    </div>
  );
}

function overlayBoxStyle(extra: React.CSSProperties): React.CSSProperties {
  return {
    position: 'absolute',
    background: 'rgba(0,0,0,0.55)',
    borderRadius: 8,
    backdropFilter: 'blur(4px)',
    ...extra,
  };
}

function btnStyle(variant: 'default' | 'ghost' = 'default'): React.CSSProperties {
  return {
    background: variant === 'ghost' ? 'transparent' : '#2a2a2a',
    color: '#eee',
    border: '1px solid #444',
    padding: '6px 12px',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 13,
  };
}

function ToggleBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        ...btnStyle(),
        background: active ? '#3b82f6' : '#2a2a2a',
        borderColor: active ? '#3b82f6' : '#444',
      }}
    >
      {children}
    </button>
  );
}

function ButtonGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ color: '#888', fontSize: 11, marginRight: 4 }}>{label}</span>
      {children}
    </div>
  );
}
