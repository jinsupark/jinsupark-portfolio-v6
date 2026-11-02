import { useEffect, useRef, useState } from 'react';
import { DESIGN, type Frame, type LayerDoc } from './document';
import {
  densify,
  flatten,
  fromStroke,
  nearestOnPath,
  newShape,
  refit,
  smear,
  smoothPath,
  splitAt,
  toArtwork,
  toLocal,
  toggleSmooth,
  unpack,
  verticesOf,
  type P,
  type ShapeDoc,
  type Vertex,
} from './shape';
import {
  DRAW_TOOLS,
  hitLayer,
  shapeOf,
  typing,
  type Brush,
  type Tool,
} from './tools';

const SMEAR_SPACING = 6;
const HIT = 10; // design units, for picking vertices and segments

const pathTo = (pts: P[]) =>
  pts.length
    ? `M${pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('L')}Z`
    : '';

function outlineIn(l: LayerDoc): P[] {
  const { w, h } = l.frame;
  return flatten(verticesOf(shapeOf(l), w, h), w, h, 400).map((q) =>
    toArtwork(l.frame, q),
  );
}

type Gesture =
  | { kind: 'draw'; at: P; to: P }
  | { kind: 'pen'; pts: P[] }
  | {
      kind: 'vertex';
      i: number;
      part: 'p' | 'i' | 'o';
      free: boolean;
      frame: Frame;
      list: ReturnType<typeof unpack>;
      shape: ShapeDoc;
    }
  | { kind: 'smear'; frame: Frame; pts: P[]; last: P; shape: ShapeDoc };

// Everything drawn on the artwork that isn't the frame box: shape creation,
// picking, and the selected shape's points. One SVG in design units over the
// artwork, so it holds at any display size.
export default function ShapeOverlay({
  tool,
  layers,
  layer,
  brush,
  onSelect,
  onCreate,
  onPatch,
}: {
  tool: Tool;
  layers: LayerDoc[];
  layer: LayerDoc | null;
  brush: Brush;
  onSelect: (id: string | null) => void;
  onCreate: (tool: Tool, frame: Frame, shape: ShapeDoc) => void;
  onPatch: (id: string, patch: Partial<LayerDoc>) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [hover, setHover] = useState<P | null>(null);
  const [picked, setPicked] = useState<number | null>(null);

  const at = (e: { clientX: number; clientY: number }): P => {
    const r = svg.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * DESIGN.w,
      y: ((e.clientY - r.top) / r.height) * DESIGN.h,
    };
  };

  const editing = tool === 'edit' && layer;
  const verts = layer
    ? verticesOf(shapeOf(layer), layer.frame.w, layer.frame.h)
    : [];

  // Delete removes the picked point, keeping a shape at least a triangle.
  useEffect(() => {
    if (!editing || picked === null) return;
    const key = (e: KeyboardEvent) => {
      if (typing(e)) return;
      if (e.key !== 'Backspace' && e.key !== 'Delete') return;
      if (verts.length <= 3) return;
      e.preventDefault();
      const path = verts.filter((_, i) => i !== picked);
      const { frame, path: next } = refit(
        layer.frame,
        unpack(path, layer.frame.w, layer.frame.h),
      );
      onPatch(layer.id, {
        frame,
        shape: { ...shapeOf(layer), kind: 'path', path: next },
      });
      setPicked(null);
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  });

  const writePath = (
    id: string,
    frame: Frame,
    shape: ShapeDoc,
    list: ReturnType<typeof unpack>,
  ) => {
    const r = refit(frame, list);
    onPatch(id, {
      frame: r.frame,
      shape: { ...shape, kind: 'path', path: r.path },
    });
  };

  const down = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const p = at(e);
    svg.current!.setPointerCapture(e.pointerId);
    if (tool === 'select') {
      onSelect(hitLayer(layers, p)?.id ?? null);
      return;
    }
    if (tool in DRAW_TOOLS) {
      setGesture({ kind: 'draw', at: p, to: p });
      return;
    }
    if (tool === 'pen') {
      setGesture({ kind: 'pen', pts: [p] });
      return;
    }
    if (!layer) return;
    const { frame } = layer;
    const shape = shapeOf(layer);
    if (tool === 'smear') {
      const q = toLocal(frame, p);
      setGesture({
        kind: 'smear',
        frame,
        shape,
        last: q,
        pts: densify(verts, frame.w, frame.h, SMEAR_SPACING),
      });
    }
  };

  const grab = (e: React.PointerEvent, i: number, part: 'p' | 'i' | 'o') => {
    if (!layer || e.button !== 0) return;
    e.stopPropagation();
    const { frame } = layer;
    if (part === 'p' && e.altKey) {
      const path = toggleSmooth(verts, i, frame.w, frame.h);
      onPatch(layer.id, {
        shape: { ...shapeOf(layer), kind: 'path', path },
      });
      return;
    }
    // Captured on the SVG, whose handlers run the drag.
    (e.currentTarget as SVGElement).ownerSVGElement!.setPointerCapture(
      e.pointerId,
    );
    setPicked(i);
    setGesture({
      kind: 'vertex',
      i,
      part,
      free: e.altKey,
      frame,
      shape: shapeOf(layer),
      list: unpack(verts, frame.w, frame.h),
    });
  };

  const move = (e: React.PointerEvent) => {
    const p = at(e);
    setHover(p);
    const g = gesture;
    if (!g) return;
    if (g.kind === 'draw') {
      let to = p;
      if (e.shiftKey) {
        const s = Math.max(Math.abs(p.x - g.at.x), Math.abs(p.y - g.at.y));
        to = {
          x: g.at.x + Math.sign(p.x - g.at.x || 1) * s,
          y: g.at.y + Math.sign(p.y - g.at.y || 1) * s,
        };
      }
      setGesture({ ...g, to });
    } else if (g.kind === 'pen') {
      const last = g.pts.at(-1)!;
      if (Math.hypot(p.x - last.x, p.y - last.y) > 2)
        setGesture({ ...g, pts: [...g.pts, p] });
    } else if (g.kind === 'vertex' && layer) {
      const q = toLocal(g.frame, p);
      const list = g.list.map((v) => ({ ...v }));
      const v = list[g.i];
      if (g.part === 'p') v.p = q;
      else {
        const off = { x: q.x - v.p.x, y: q.y - v.p.y };
        const other = g.part === 'i' ? 'o' : 'i';
        v[g.part] = off;
        if (!g.free) {
          const len = Math.hypot(v[other].x, v[other].y);
          const l = Math.hypot(off.x, off.y) || 1;
          v[other] = { x: (-off.x / l) * len, y: (-off.y / l) * len };
        }
      }
      writePath(layer.id, g.frame, g.shape, list);
    } else if (g.kind === 'smear' && layer) {
      const q = toLocal(g.frame, p);
      const by = { x: q.x - g.last.x, y: q.y - g.last.y };
      if (Math.hypot(by.x, by.y) < 0.5) return;
      const pts = smear(
        g.pts,
        g.last,
        by,
        brush.size,
        brush.strength,
        SMEAR_SPACING,
      );
      setGesture({ ...g, pts, last: q });
      const r = smoothPath(g.frame, pts);
      onPatch(layer.id, {
        frame: r.frame,
        shape: { ...g.shape, kind: 'path', path: r.path },
      });
    }
  };

  const up = () => {
    const g = gesture;
    setGesture(null);
    if (!g) return;
    if (g.kind === 'draw') {
      let x0 = Math.min(g.at.x, g.to.x);
      let y0 = Math.min(g.at.y, g.to.y);
      let w = Math.abs(g.to.x - g.at.x);
      let h = Math.abs(g.to.y - g.at.y);
      // A click rather than a drag drops a default-sized shape there.
      if (w < 6 || h < 6) {
        w = h = 240;
        x0 = g.at.x - w / 2;
        y0 = g.at.y - h / 2;
      }
      const kind = DRAW_TOOLS[tool];
      const shape = newShape(kind, tool === 'triangle' ? 3 : 6);
      onCreate(tool, { x: x0, y: y0, w, h, rot: 0 }, shape);
    } else if (g.kind === 'pen') {
      const r = fromStroke(g.pts);
      if (r) onCreate('pen', r.frame, { ...newShape('path'), path: r.path });
    }
  };

  // Double-click a segment to add a point on it, without changing the curve.
  const dbl = (e: React.MouseEvent) => {
    if (!editing) return;
    const q = toLocal(layer.frame, at(e));
    const { w, h } = layer.frame;
    const n = nearestOnPath(verts, w, h, q);
    if (n.d > HIT * 1.5) return;
    onPatch(layer.id, {
      shape: {
        ...shapeOf(layer),
        kind: 'path',
        path: splitAt(verts, n.i, n.t),
      },
    });
    setPicked(n.i + 1);
  };

  const g = gesture;
  const sel = layer ? outlineIn(layer) : [];
  const art = (v: Vertex, dx = 0, dy = 0) =>
    toArtwork(layer!.frame, {
      x: (v.x + dx) * layer!.frame.w,
      y: (v.y + dy) * layer!.frame.h,
    });
  const preview = (() => {
    if (g?.kind === 'pen') return pathTo(g.pts).replace(/Z$/, '');
    if (g?.kind !== 'draw') return '';
    const x0 = Math.min(g.at.x, g.to.x);
    const y0 = Math.min(g.at.y, g.to.y);
    const w = Math.abs(g.to.x - g.at.x);
    const h = Math.abs(g.to.y - g.at.y);
    if (w < 1 || h < 1) return '';
    const kind = DRAW_TOOLS[tool];
    const s = newShape(kind, tool === 'triangle' ? 3 : 6);
    return pathTo(
      flatten(verticesOf(s, w, h), w, h, 200).map((q) => ({
        x: q.x + x0,
        y: q.y + y0,
      })),
    );
  })();

  const cursor =
    tool === 'select' ? 'default' : tool === 'smear' ? 'none' : 'crosshair';

  return (
    <svg
      ref={svg}
      viewBox={`0 0 ${DESIGN.w} ${DESIGN.h}`}
      className="absolute inset-0 size-full touch-none overflow-visible"
      style={{ cursor }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerLeave={() => setHover(null)}
      onDoubleClick={dbl}
    >
      {sel.length > 0 && tool !== 'select' && (
        <path
          d={pathTo(sel)}
          fill="none"
          stroke="#38bdf8"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      )}
      {preview && (
        <path
          d={preview}
          fill="rgba(56,189,248,0.12)"
          stroke="#38bdf8"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      )}
      {editing &&
        verts.map((v, i) => {
          const p = art(v);
          const smooth = v.ix || v.iy || v.ox || v.oy;
          const hi = art(v, v.ix, v.iy);
          const ho = art(v, v.ox, v.oy);
          const showHandles = smooth && (picked === i || verts.length <= 24);
          return (
            <g key={i}>
              {showHandles &&
                (
                  [
                    [hi, 'i'],
                    [ho, 'o'],
                  ] as const
                ).map(([h, part]) => (
                  <g key={part}>
                    <line
                      x1={p.x}
                      y1={p.y}
                      x2={h.x}
                      y2={h.y}
                      stroke="#38bdf8"
                      strokeWidth={1}
                      vectorEffect="non-scaling-stroke"
                      pointerEvents="none"
                    />
                    <circle
                      cx={h.x}
                      cy={h.y}
                      r={4}
                      fill="#0f172a"
                      stroke="#38bdf8"
                      vectorEffect="non-scaling-stroke"
                      onPointerDown={(e) => grab(e, i, part)}
                    />
                  </g>
                ))}
              <rect
                x={p.x - 4.5}
                y={p.y - 4.5}
                width={9}
                height={9}
                rx={smooth ? 4.5 : 0}
                fill={picked === i ? '#38bdf8' : '#0f172a'}
                stroke="#38bdf8"
                vectorEffect="non-scaling-stroke"
                className="cursor-move"
                onPointerDown={(e) => grab(e, i, 'p')}
              />
            </g>
          );
        })}
      {tool === 'smear' && hover && (
        <circle
          cx={hover.x}
          cy={hover.y}
          r={brush.size}
          fill="none"
          stroke="#38bdf8"
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      )}
    </svg>
  );
}
