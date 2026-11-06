// Shapes: a closed path of cubic Bézier vertices in the layer's frame. Points
// are frame fractions (0..1), so resizing the frame resizes the shape;
// handles are offsets from their vertex in the same space, and a vertex whose
// handles are both zero is a sharp corner.
//
// Presets (rect, ellipse, polygon, star) keep a few parameters and are turned
// into vertices on demand; editing a vertex converts a preset into a `path`.

import type { Frame } from './document';

export type P = { x: number; y: number };
export type Vertex = {
  x: number;
  y: number;
  ix: number;
  iy: number;
  ox: number;
  oy: number;
};
export type ShapeKind = 'rect' | 'ellipse' | 'polygon' | 'star' | 'path';
export type ShapeDoc = {
  kind: ShapeKind;
  radius: number; // rect corner radius, design units
  // Per-corner radii (top-left, top-right, bottom-right, bottom-left); when
  // set they replace `radius`.
  radii?: [number, number, number, number];
  sides: number; // polygon
  points: number; // star
  inner: number; // star inner radius, as a share of the outer
  path: Vertex[];
};

export const newShape = (kind: ShapeKind, sides = 6): ShapeDoc => ({
  kind,
  radius: 0,
  sides,
  points: 5,
  inner: 0.45,
  path: [],
});

const K = 0.5523; // cubic handle length for a quarter circle
const corner = (x: number, y: number): Vertex => ({
  x,
  y,
  ix: 0,
  iy: 0,
  ox: 0,
  oy: 0,
});

// Points spread to fill the unit box exactly, so a triangle's frame is its
// bounding box rather than its circumcircle's.
function boxed(pts: P[]): Vertex[] {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const sx = Math.max(...xs) - x0 || 1;
  const sy = Math.max(...ys) - y0 || 1;
  return pts.map((p) => corner((p.x - x0) / sx, (p.y - y0) / sy));
}

// A polygon's or star's width over its height when its sides are equal (an
// equilateral triangle, a regular hexagon); null for shapes with no natural
// proportion.
export function aspectOf(s: ShapeDoc): number | null {
  if (s.kind !== 'polygon' && s.kind !== 'star') return null;
  const n = Math.max(3, Math.round(s.kind === 'star' ? s.points : s.sides));
  const m = s.kind === 'star' ? n * 2 : n;
  const pts = Array.from({ length: m }, (_, i) => {
    const a = -Math.PI / 2 + (i / m) * Math.PI * 2;
    const r = s.kind === 'star' && i % 2 ? s.inner : 1;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  });
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return (
    (Math.max(...xs) - Math.min(...xs)) / (Math.max(...ys) - Math.min(...ys))
  );
}

export function verticesOf(s: ShapeDoc, w: number, h: number): Vertex[] {
  switch (s.kind) {
    case 'path':
      return s.path;
    case 'ellipse': {
      const k = 0.5 * K;
      return [
        { x: 0.5, y: 0, ix: -k, iy: 0, ox: k, oy: 0 },
        { x: 1, y: 0.5, ix: 0, iy: -k, ox: 0, oy: k },
        { x: 0.5, y: 1, ix: k, iy: 0, ox: -k, oy: 0 },
        { x: 0, y: 0.5, ix: 0, iy: k, ox: 0, oy: -k },
      ];
    }
    case 'polygon': {
      const n = Math.max(3, Math.round(s.sides));
      return boxed(
        Array.from({ length: n }, (_, i) => {
          const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
          return { x: Math.cos(a), y: Math.sin(a) };
        }),
      );
    }
    case 'star': {
      const n = Math.max(3, Math.round(s.points));
      return boxed(
        Array.from({ length: n * 2 }, (_, i) => {
          const a = -Math.PI / 2 + (i / (n * 2)) * Math.PI * 2;
          const r = i % 2 ? s.inner : 1;
          return { x: Math.cos(a) * r, y: Math.sin(a) * r };
        }),
      );
    }
    default: {
      const [tl, tr, br, bl] = (
        s.radii ?? [s.radius, s.radius, s.radius, s.radius]
      ).map((r) => Math.max(0, Math.min(r, w / 2, h / 2)));
      if (Math.max(tl, tr, br, bl) < 0.01)
        return [corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1)];
      // Each corner's radius as a share of the frame, and its handle length.
      const c = (r: number) => ({
        x: r / w,
        y: r / h,
        kx: (r / w) * K,
        ky: (r / h) * K,
      });
      const a = c(tl);
      const b = c(tr);
      const d = c(br);
      const e = c(bl);
      return [
        { x: a.x, y: 0, ix: -a.kx, iy: 0, ox: 0, oy: 0 },
        { x: 1 - b.x, y: 0, ix: 0, iy: 0, ox: b.kx, oy: 0 },
        { x: 1, y: b.y, ix: 0, iy: -b.ky, ox: 0, oy: 0 },
        { x: 1, y: 1 - d.y, ix: 0, iy: 0, ox: 0, oy: d.ky },
        { x: 1 - d.x, y: 1, ix: d.kx, iy: 0, ox: 0, oy: 0 },
        { x: e.x, y: 1, ix: 0, iy: 0, ox: -e.kx, oy: 0 },
        { x: 0, y: 1 - e.y, ix: 0, iy: e.ky, ox: 0, oy: 0 },
        { x: 0, y: a.y, ix: 0, iy: 0, ox: 0, oy: -a.ky },
      ];
    }
  }
}

const curved = (a: Vertex, b: Vertex) => a.ox || a.oy || b.ix || b.iy;

function bez(a: number, b: number, c: number, d: number, t: number) {
  const m = 1 - t;
  return m * m * m * a + 3 * m * m * t * b + 3 * m * t * t * c + t * t * t * d;
}

// The closed outline as a polygon in frame-local design units.
export function flatten(verts: Vertex[], w: number, h: number, maxPts = 1200) {
  const n = verts.length;
  const segs: { a: Vertex; b: Vertex; len: number }[] = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % n];
    const len =
      Math.hypot((b.x - a.x) * w, (b.y - a.y) * h) +
      (curved(a, b)
        ? Math.hypot(a.ox * w, a.oy * h) + Math.hypot(b.ix * w, b.iy * h)
        : 0);
    segs.push({ a, b, len });
    total += len;
  }
  const step = Math.max(3, total / maxPts);
  const out: P[] = [];
  for (const { a, b, len } of segs) {
    if (!curved(a, b)) {
      out.push({ x: a.x * w, y: a.y * h });
      continue;
    }
    const k = Math.max(2, Math.min(32, Math.ceil(len / step)));
    for (let j = 0; j < k; j++) {
      const t = j / k;
      out.push({
        x: bez(a.x, a.x + a.ox, b.x + b.ix, b.x, t) * w,
        y: bez(a.y, a.y + a.oy, b.y + b.iy, b.y, t) * h,
      });
    }
  }
  return out;
}

export function contains(poly: P[], q: P) {
  let wn = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const c = (b.x - a.x) * (q.y - a.y) - (q.x - a.x) * (b.y - a.y);
    if (a.y <= q.y) {
      if (b.y > q.y && c > 0) wn++;
    } else if (b.y <= q.y && c < 0) wn--;
  }
  return wn !== 0;
}

// Frame-local design units <-> artwork design units.
export function toLocal(f: Frame, p: P): P {
  const a = (-f.rot * Math.PI) / 180;
  const dx = p.x - (f.x + f.w / 2);
  const dy = p.y - (f.y + f.h / 2);
  return {
    x: dx * Math.cos(a) - dy * Math.sin(a) + f.w / 2,
    y: dx * Math.sin(a) + dy * Math.cos(a) + f.h / 2,
  };
}
export function toArtwork(f: Frame, q: P): P {
  const a = (f.rot * Math.PI) / 180;
  const dx = q.x - f.w / 2;
  const dy = q.y - f.h / 2;
  return {
    x: f.x + f.w / 2 + dx * Math.cos(a) - dy * Math.sin(a),
    y: f.y + f.h / 2 + dx * Math.sin(a) + dy * Math.cos(a),
  };
}

// Smooth handles through points in design units (Catmull-Rom as Bézier).
function smoothThrough(pts: P[]): { p: P; t: P }[] {
  const n = pts.length;
  return pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n];
    const b = pts[(i + 1) % n];
    return { p, t: { x: (b.x - a.x) / 6, y: (b.y - a.y) / 6 } };
  });
}

// A frame fitted to points given in some frame's local units, and the points
// as vertices of the new frame. Rotation is kept; the box is in local axes.
export function refit(f: Frame, pts: { p: P; i: P; o: P }[]) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const { p } of pts) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  const c = toArtwork(f, { x: x0 + w / 2, y: y0 + h / 2 });
  const frame: Frame = { x: c.x - w / 2, y: c.y - h / 2, w, h, rot: f.rot };
  const path: Vertex[] = pts.map(({ p, i, o }) => ({
    x: (p.x - x0) / w,
    y: (p.y - y0) / h,
    ix: i.x / w,
    iy: i.y / h,
    ox: o.x / w,
    oy: o.y / h,
  }));
  return { frame, path };
}

// Vertices in local units, ready to edit and refit.
export function unpack(verts: Vertex[], w: number, h: number) {
  return verts.map((v) => ({
    p: { x: v.x * w, y: v.y * h },
    i: { x: v.ix * w, y: v.iy * h },
    o: { x: v.ox * w, y: v.oy * h },
  }));
}

function simplify(pts: P[], eps: number): P[] {
  if (pts.length < 3) return pts;
  let best = 0;
  let at = 0;
  const a = pts[0];
  const b = pts[pts.length - 1];
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const d =
      Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / L;
    if (d > best) {
      best = d;
      at = i;
    }
  }
  if (best <= eps) return [a, b];
  return [
    ...simplify(pts.slice(0, at + 1), eps).slice(0, -1),
    ...simplify(pts.slice(at), eps),
  ];
}

// A freehand stroke (artwork units) as a smooth closed path and its frame.
export function fromStroke(stroke: P[]) {
  const pts = simplify(stroke, 1.6);
  if (
    pts.length > 3 &&
    Math.hypot(pts[0].x - pts.at(-1)!.x, pts[0].y - pts.at(-1)!.y) < 4
  )
    pts.pop();
  if (pts.length < 3) return null;
  // An unrotated unit frame at the origin: its local units are artwork units.
  return smoothPath({ x: 0, y: 0, w: 1, h: 1, rot: 0 }, pts);
}

// Where on the path a point lands nearest: segment index and parameter.
export function nearestOnPath(verts: Vertex[], w: number, h: number, q: P) {
  let best = { i: 0, t: 0, d: Infinity };
  const n = verts.length;
  for (let i = 0; i < n; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % n];
    for (let j = 0; j <= 40; j++) {
      const t = j / 40;
      const x = bez(a.x, a.x + a.ox, b.x + b.ix, b.x, t) * w;
      const y = bez(a.y, a.y + a.oy, b.y + b.iy, b.y, t) * h;
      const d = Math.hypot(x - q.x, y - q.y);
      if (d < best.d) best = { i, t, d };
    }
  }
  return best;
}

// Splits segment i at t without changing the curve (de Casteljau).
export function splitAt(verts: Vertex[], i: number, t: number): Vertex[] {
  const n = verts.length;
  const a = verts[i];
  const b = verts[(i + 1) % n];
  const L = (p: P, q: P) => ({
    x: p.x + (q.x - p.x) * t,
    y: p.y + (q.y - p.y) * t,
  });
  const p0 = { x: a.x, y: a.y };
  const p1 = { x: a.x + a.ox, y: a.y + a.oy };
  const p2 = { x: b.x + b.ix, y: b.y + b.iy };
  const p3 = { x: b.x, y: b.y };
  const p01 = L(p0, p1);
  const p12 = L(p1, p2);
  const p23 = L(p2, p3);
  const p012 = L(p01, p12);
  const p123 = L(p12, p23);
  const m = L(p012, p123);
  const out = verts.map((v) => ({ ...v }));
  out[i] = { ...a, ox: p01.x - a.x, oy: p01.y - a.y };
  out[(i + 1) % n] = { ...out[(i + 1) % n], ix: p23.x - b.x, iy: p23.y - b.y };
  const mid: Vertex = {
    x: m.x,
    y: m.y,
    ix: p012.x - m.x,
    iy: p012.y - m.y,
    ox: p123.x - m.x,
    oy: p123.y - m.y,
  };
  if (!curved(a, b)) {
    mid.ix = mid.iy = mid.ox = mid.oy = 0;
    out[i] = { ...a };
    out[(i + 1) % n] = { ...verts[(i + 1) % n] };
  }
  out.splice(i + 1, 0, mid);
  return out;
}

// Toggles a vertex between a sharp corner and a smooth point.
export function toggleSmooth(verts: Vertex[], i: number, w: number, h: number) {
  const out = verts.map((v) => ({ ...v }));
  const v = out[i];
  if (v.ix || v.iy || v.ox || v.oy) {
    v.ix = v.iy = v.ox = v.oy = 0;
    return out;
  }
  const n = out.length;
  const a = out[(i - 1 + n) % n];
  const b = out[(i + 1) % n];
  const tx = ((b.x - a.x) * w) / 6;
  const ty = ((b.y - a.y) * h) / 6;
  v.ox = tx / w;
  v.oy = ty / h;
  v.ix = -tx / w;
  v.iy = -ty / h;
  return out;
}

// Resamples the outline into evenly spaced smooth vertices, `spacing` design
// units apart, which is the form smearing works on.
export function densify(
  verts: Vertex[],
  w: number,
  h: number,
  spacing: number,
) {
  const poly = flatten(verts, w, h, 4000);
  const out: P[] = [];
  let carry = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    let s = carry;
    for (; s < L; s += spacing)
      out.push({
        x: a.x + ((b.x - a.x) * s) / L,
        y: a.y + ((b.y - a.y) * s) / L,
      });
    carry = s - L;
  }
  return out.length >= 3 ? out : poly;
}

// One smear step: vertices near the brush move with it, falling off smoothly
// to its edge. Points are local units; the result is resampled so stretched
// stretches stay smooth and crushed ones don't pile up.
export function smear(
  pts: P[],
  at: P,
  by: P,
  radius: number,
  strength: number,
  spacing: number,
) {
  const moved = pts.map((p) => {
    const d = Math.hypot(p.x - at.x, p.y - at.y);
    if (d >= radius) return p;
    const f = (1 - (d / radius) ** 2) ** 2 * strength;
    return { x: p.x + by.x * f, y: p.y + by.y * f };
  });
  const out: P[] = [];
  for (let i = 0; i < moved.length; i++) {
    const a = moved[i];
    const b = moved[(i + 1) % moved.length];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (out.length && L < spacing * 0.3 && moved.length - (i - out.length) > 3)
      continue;
    out.push(a);
    const extra = Math.min(4, Math.floor(L / (spacing * 1.6)));
    for (let k = 1; k <= extra; k++) {
      const t = k / (extra + 1);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out.slice(0, 900);
}

// Points (local units) back to a smooth path, refitted to a new frame.
export function smoothPath(f: Frame, pts: P[]) {
  return refit(
    f,
    smoothThrough(pts).map(({ p, t }) => ({
      p,
      i: { x: -t.x, y: -t.y },
      o: t,
    })),
  );
}
