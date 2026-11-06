import { CornerUpRight, Spline, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { DESIGN, type Frame, type LayerDoc, type Size } from './document';
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
import { IconButton } from './ui';

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
  // The pen: dragging out the handles of the point just placed.
  | { kind: 'anchor'; i: number }
  | {
      kind: 'vertex';
      i: number;
      part: 'p' | 'i' | 'o';
      free: boolean;
      frame: Frame;
      list: ReturnType<typeof unpack>;
      shape: ShapeDoc;
    }
  | { kind: 'smear'; frame: Frame; pts: P[]; last: P; shape: ShapeDoc }
  // A box dragged out to select what it touches; a click if it barely moved.
  // `base` is what stays selected under it (shift-drag adds to a selection).
  | {
      kind: 'marquee';
      at: P;
      to: P;
      add: boolean;
      hit: string | null;
      base: string[];
    }
  // A layer pressed and dragged in one go.
  | { kind: 'grab'; id: string; at: P; frame: Frame };

// A layer that covers the whole canvas: a background. Dragging from one draws
// a selection box rather than moving it.
const isBackground = (l: LayerDoc, size: Size) =>
  l.frame.rot === 0 &&
  l.frame.x <= 0 &&
  l.frame.y <= 0 &&
  l.frame.x + l.frame.w >= size.w &&
  l.frame.y + l.frame.h >= size.h;

// A frame's box on the artwork, rotation included.
function extentOf(f: Frame) {
  const r = (f.rot * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  const w = f.w * c + f.h * s;
  const h = f.w * s + f.h * c;
  const cx = f.x + f.w / 2;
  const cy = f.y + f.h / 2;
  return { x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 };
}

// Everything drawn on the artwork that isn't the frame box: shape creation,
// picking, and the selected shape's points. One SVG in design units over the
// artwork, so it holds at any display size.
export default function ShapeOverlay({
  tool,
  layers,
  layer,
  brush,
  onSelect,
  onSelectMany,
  selection,
  hovered = null,
  onCreate,
  onPatch,
  onDone,
  onDuplicate,
  size = DESIGN,
}: {
  tool: Tool;
  layers: LayerDoc[];
  layer: LayerDoc | null;
  brush: Brush;
  onSelect: (id: string | null, additive: boolean) => void;
  onSelectMany: (ids: string[], additive: boolean) => void;
  selection: string[];
  // A layer hovered in the layer list, outlined here too.
  hovered?: string | null;
  onCreate: (tool: Tool, frame: Frame, shape: ShapeDoc) => void;
  onPatch: (id: string, patch: Partial<LayerDoc>) => void;
  // Leave point editing (back to the select tool).
  onDone?: () => void;
  // Option-drag on a layer copies it in place and drags the copy; gives the
  // copy's id.
  onDuplicate?: (id: string) => string;
  size?: Size;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [hover, setHover] = useState<P | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  // Where the canvas is on screen, for the point toolbar along its top.
  const [canvasTop, setCanvasTop] = useState<{ x: number; y: number } | null>(
    null,
  );
  useEffect(() => {
    if (tool !== 'edit') return;
    const main = svg.current?.closest('main');
    if (!main) return;
    const place = () => {
      const r = main.getBoundingClientRect();
      setCanvasTop({ x: r.left + r.width / 2, y: r.top + 12 });
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(main);
    return () => ro.disconnect();
  }, [tool]);
  // The pen's points so far (artwork units, handles relative to each point).
  const [anchors, setAnchors] = useState<{ p: P; i: P; o: P }[]>([]);
  const [penTool, setPenTool] = useState(tool);
  if (penTool !== tool) {
    setPenTool(tool);
    setAnchors([]);
  }
  const finishPen = (pts = anchors) => {
    if (pts.length >= 3) {
      // An unrotated unit frame at the origin: its local units are artwork's.
      const r = refit({ x: 0, y: 0, w: 1, h: 1, rot: 0 }, pts);
      onCreate('bezier', r.frame, { ...newShape('path'), path: r.path });
    }
    setAnchors([]);
  };
  // Enter closes the pen's shape; Backspace takes its last point back.
  useEffect(() => {
    if (tool !== 'bezier' || !anchors.length) return;
    const key = (e: KeyboardEvent) => {
      if (typing(e)) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        finishPen();
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        e.stopImmediatePropagation();
        setAnchors((a) => a.slice(0, -1));
      }
    };
    addEventListener('keydown', key, true);
    return () => removeEventListener('keydown', key, true);
  });

  const at = (e: { clientX: number; clientY: number }): P => {
    const r = svg.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * size.w,
      y: ((e.clientY - r.top) / r.height) * size.h,
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
      const hit = hitLayer(layers, p);
      if (hit && !isBackground(hit, size)) {
        if (e.altKey && onDuplicate) {
          const id = onDuplicate(hit.id);
          setGesture({ kind: 'grab', id, at: p, frame: hit.frame });
          return;
        }
        onSelect(hit.id, e.shiftKey);
        if (!e.shiftKey)
          setGesture({ kind: 'grab', id: hit.id, at: p, frame: hit.frame });
        return;
      }
      setGesture({
        kind: 'marquee',
        at: p,
        to: p,
        add: e.shiftKey,
        hit: hit?.id ?? null,
        base: e.shiftKey ? selection : [],
      });
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
    if (tool === 'bezier') {
      const px = size.w / (svg.current?.getBoundingClientRect().width || 1);
      const first = anchors[0];
      if (
        anchors.length >= 3 &&
        Math.hypot(p.x - first.p.x, p.y - first.p.y) < 8 * px
      ) {
        finishPen();
        return;
      }
      setAnchors((a) => [...a, { p, i: { x: 0, y: 0 }, o: { x: 0, y: 0 } }]);
      setGesture({ kind: 'anchor', i: anchors.length });
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
    if (g.kind === 'anchor') {
      setAnchors((a) =>
        a.map((v, i) => {
          if (i !== g.i) return v;
          const o = { x: p.x - v.p.x, y: p.y - v.p.y };
          return { ...v, o, i: { x: -o.x, y: -o.y } };
        }),
      );
      return;
    }
    if (g.kind === 'marquee') {
      const next = { ...g, to: p };
      setGesture(next);
      // Layers join the selection as the box reaches them, and leave it again
      // if it pulls back.
      const ids = boxed(next);
      if (ids)
        onSelectMany(
          [...g.base, ...ids.filter((id) => !g.base.includes(id))],
          false,
        );
      return;
    }
    if (g.kind === 'grab') {
      onPatch(g.id, {
        frame: {
          ...g.frame,
          x: Math.round(g.frame.x + p.x - g.at.x),
          y: Math.round(g.frame.y + p.y - g.at.y),
        },
      });
      return;
    }
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

  // What a selection box touches, or null while it's still small enough
  // (~4 screen pixels) to be a click. A background has to be covered whole,
  // or every box would catch it.
  const boxed = (g: { at: P; to: P }) => {
    const px = size.w / (svg.current?.getBoundingClientRect().width || 1);
    const x0 = Math.min(g.at.x, g.to.x);
    const y0 = Math.min(g.at.y, g.to.y);
    const x1 = Math.max(g.at.x, g.to.x);
    const y1 = Math.max(g.at.y, g.to.y);
    if (x1 - x0 < 4 * px && y1 - y0 < 4 * px) return null;
    return layers
      .filter((l) => {
        if (!l.visible || l.locked) return false;
        const e = extentOf(l.frame);
        return isBackground(l, size)
          ? e.x0 >= x0 && e.y0 >= y0 && e.x1 <= x1 && e.y1 <= y1
          : e.x0 < x1 && e.x1 > x0 && e.y0 < y1 && e.y1 > y0;
      })
      .map((l) => l.id);
  };

  const up = () => {
    const g = gesture;
    setGesture(null);
    if (!g) return;
    if (g.kind === 'marquee') {
      const ids = boxed(g);
      if (!ids) onSelect(g.hit, g.add);
      else
        onSelectMany(
          [...g.base, ...ids.filter((id) => !g.base.includes(id))],
          false,
        );
      return;
    }
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
  // The layer under the pointer (or hovered in the layer list), outlined as in
  // Figma, unless it's already selected.
  const hoverLayer =
    (hovered && layers.find((l) => l.id === hovered)) ||
    (tool === 'select' && !gesture && hover ? hitLayer(layers, hover) : null);
  const hoverPath =
    hoverLayer && !selection.includes(hoverLayer.id)
      ? pathTo(outlineIn(hoverLayer))
      : '';
  const art = (v: Vertex, dx = 0, dy = 0) =>
    toArtwork(layer!.frame, {
      x: (v.x + dx) * layer!.frame.w,
      y: (v.y + dy) * layer!.frame.h,
    });
  // The pen's path so far, and a line to the pointer for the next segment.
  const penPath = anchors.length
    ? anchors
        .map((v, k) => {
          if (k === 0) return `M${v.p.x},${v.p.y}`;
          const u = anchors[k - 1];
          return `C${u.p.x + u.o.x},${u.p.y + u.o.y} ${v.p.x + v.i.x},${v.p.y + v.i.y} ${v.p.x},${v.p.y}`;
        })
        .join('')
    : '';
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

  // The point toolbar: make the picked point a corner (no handles) or smooth
  // (mirrored handles), or remove it.
  const setPoint = (how: 'corner' | 'smooth' | 'delete') => {
    if (!layer || picked === null) return;
    const { frame } = layer;
    const shape = shapeOf(layer);
    if (how === 'delete') {
      if (verts.length <= 3) return;
      writePath(
        layer.id,
        frame,
        shape,
        unpack(
          verts.filter((_, i) => i !== picked),
          frame.w,
          frame.h,
        ),
      );
      setPicked(null);
      return;
    }
    const v = verts[picked];
    const curved = !!(v.ix || v.iy || v.ox || v.oy);
    if (how === 'corner' && curved) {
      const list = unpack(verts, frame.w, frame.h);
      list[picked] = { ...list[picked], i: { x: 0, y: 0 }, o: { x: 0, y: 0 } };
      writePath(layer.id, frame, shape, list);
    } else if (how === 'smooth' && !curved)
      onPatch(layer.id, {
        shape: {
          ...shape,
          kind: 'path',
          path: toggleSmooth(verts, picked, frame.w, frame.h),
        },
      });
  };

  return (
    <>
      <svg
        ref={svg}
        viewBox={`0 0 ${size.w} ${size.h}`}
        className="absolute inset-0 size-full touch-none overflow-visible"
        style={{ cursor }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={() => setHover(null)}
        onDoubleClick={dbl}
      >
        {/* Catches presses on the grey round the artwork too, so a selection
          box can start there. */}
        <rect
          x={-100000}
          y={-100000}
          width={200000}
          height={200000}
          fill="transparent"
        />
        {hoverPath && (
          <path
            d={hoverPath}
            fill="none"
            stroke="#0ea5e9"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        )}
        {g?.kind === 'marquee' && (
          <rect
            x={Math.min(g.at.x, g.to.x)}
            y={Math.min(g.at.y, g.to.y)}
            width={Math.abs(g.to.x - g.at.x)}
            height={Math.abs(g.to.y - g.at.y)}
            fill="rgba(14,165,233,0.08)"
            stroke="#0ea5e9"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        )}
        {sel.length > 0 && tool !== 'select' && (
          <path
            d={pathTo(sel)}
            fill="none"
            stroke="#0ea5e9"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        )}
        {tool === 'bezier' && anchors.length > 0 && (
          <g pointerEvents="none">
            <path
              d={penPath}
              fill="none"
              stroke="#0ea5e9"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
            {hover && !gesture && (
              <line
                x1={anchors.at(-1)!.p.x}
                y1={anchors.at(-1)!.p.y}
                x2={hover.x}
                y2={hover.y}
                stroke="#0ea5e9"
                strokeWidth={1}
                strokeDasharray="4 3"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {(() => {
              const v = anchors.at(-1)!;
              return v.o.x || v.o.y ? (
                <path
                  d={`M${v.p.x + v.i.x},${v.p.y + v.i.y}L${v.p.x + v.o.x},${v.p.y + v.o.y}`}
                  stroke="#0ea5e9"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              ) : null;
            })()}
            {anchors.map((v, k) => (
              <rect
                key={k}
                x={v.p.x}
                y={v.p.y}
                width={1}
                height={1}
                fill={k === 0 && anchors.length >= 3 ? '#0ea5e9' : '#ffffff'}
                stroke="#0ea5e9"
                strokeWidth={8}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
        )}
        {preview && (
          <path
            d={preview}
            fill="rgba(14,165,233,0.12)"
            stroke="#0ea5e9"
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
                        stroke="#0ea5e9"
                        strokeWidth={1}
                        vectorEffect="non-scaling-stroke"
                        pointerEvents="none"
                      />
                      <circle
                        cx={h.x}
                        cy={h.y}
                        r={4}
                        fill="#ffffff"
                        stroke="#0ea5e9"
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
                  fill={picked === i ? '#0ea5e9' : '#ffffff'}
                  stroke="#0ea5e9"
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
            stroke="#0ea5e9"
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        )}
      </svg>
      {editing && canvasTop && (
        <div
          style={{ left: canvasTop.x, top: canvasTop.y }}
          className="fixed z-40 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-black/10 bg-white p-1 text-[11px] shadow-[0_2px_8px_rgb(0_0_0/0.12)]"
        >
          <span className="px-1.5 text-neutral-500">
            {picked === null ? 'Select a point' : 'Point'}
          </span>
          <IconButton
            title="Corner"
            onClick={() => setPoint('corner')}
            className={picked === null ? 'pointer-events-none opacity-40' : ''}
          >
            <CornerUpRight size={13} />
          </IconButton>
          <IconButton
            title="Smooth"
            onClick={() => setPoint('smooth')}
            className={picked === null ? 'pointer-events-none opacity-40' : ''}
          >
            <Spline size={13} />
          </IconButton>
          <IconButton
            title="Delete point (⌫)"
            onClick={() => setPoint('delete')}
            className={picked === null ? 'pointer-events-none opacity-40' : ''}
          >
            <Trash2 size={13} />
          </IconButton>
          <span className="mx-0.5 h-4 w-px bg-black/10" />
          <button
            onClick={onDone}
            className="h-6 rounded-md px-2 font-medium text-neutral-700 hover:bg-black/5"
          >
            Done
          </button>
        </div>
      )}
    </>
  );
}
