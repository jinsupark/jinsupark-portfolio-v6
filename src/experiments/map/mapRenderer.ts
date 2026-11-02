// A walking-tour map: a line-drawn street plan generated once and baked to an
// offscreen canvas, with dot trails laid along its streets on top — each a
// route that grows a dot at a time, bunches up where it stops, holds, and
// fades for the next one.
//
// The plan is a few districts, each a rotated lattice of blocks cut into lots.
// Districts overlap everywhere, so every lot is kept only on its own side of
// the boundary with a street's width to spare; avenues and the water are
// carved out the same way, a lot at a time, which is what lets buildings line
// an avenue right up to its edge.

import { seededRng } from '@/lab/random';
import type { MapValues } from './mapControls';

type P = { x: number; y: number };
type District = {
  o: P;
  a: number;
  c: number;
  s: number;
  px: number;
  py: number;
  i0: number;
  i1: number;
  j0: number;
  j1: number;
};
type Lot = {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  kind: 'lot' | 'park' | 'court' | 'landmark';
};
type Label = { x: number; y: number; a: number; text: string };
type Dot = { x: number; y: number; t: number; shade: number; star: boolean };
type Tri = { x: number; y: number; a: number; t: number };
type Marker = { x: number; y: number; n: number; t: number };
type Route = {
  age: number;
  dots: Dot[];
  tris: Tri[];
  marker: Marker | null;
  grow: number;
};
type Water = { c: P; r: number; p1: number; p2: number } | null;

const NAMES = [
  'Rue du Mont-Blanc',
  'Quai du Mont-Blanc',
  'Rue des Alpes',
  'Rue de Chantepoulet',
  'Rue Rousseau',
  'Place de Cornavin',
  'Rue de Lausanne',
  'Rue de la Servette',
  'Quai des Bergues',
  'Rue de Berne',
  'Rue du Prieuré',
  'Rue de Monthoux',
  'Pont du Mont-Blanc',
  'Rue Pradier',
  'Gare routière',
  'Rue Kléberg',
  'Place des Grottes',
  'Rue de Fribourg',
  'Rue Thalberg',
  'Rue des Pâquis',
];
const FONT = 'ui-monospace, "Geist Mono", Menlo, monospace';

const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);

function distToLine(q: P, pts: P[]) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy || 1;
    const t = Math.max(
      0,
      Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / l2),
    );
    best = Math.min(best, Math.hypot(q.x - a.x - t * dx, q.y - a.y - t * dy));
  }
  return best;
}

const world = (d: District, u: number, v: number): P => ({
  x: d.o.x + u * d.c - v * d.s,
  y: d.o.y + u * d.s + v * d.c,
});

export class MapRenderer {
  private key = '';
  private W = 0;
  private H = 0;
  private bake: HTMLCanvasElement | null = null;
  private districts: District[] = [];
  private roads: P[][] = [];
  private water: Water = null;
  private routes: Route[] = [];
  private rng = seededRng(1);
  private spawnIn = 0;
  private counter = 0;

  private waterR(q: P) {
    const w = this.water!;
    const th = Math.atan2(q.y - w.c.y, q.x - w.c.x);
    return (
      w.r *
      (1 + 0.07 * Math.sin(3 * th + w.p1) + 0.035 * Math.sin(7 * th + w.p2))
    );
  }

  private inWater(q: P, margin: number) {
    return !!this.water && dist(q, this.water.c) < this.waterR(q) + margin;
  }

  // Whether `q` sits inside district k with `margin` to spare from every other.
  private owns(k: number, q: P, margin: number) {
    const own = dist(q, this.districts[k].o);
    for (let m = 0; m < this.districts.length; m++) {
      if (m === k) continue;
      if ((dist(q, this.districts[m].o) - own) / 2 < margin) return false;
    }
    return true;
  }

  private nearRoad(q: P, margin: number) {
    for (const road of this.roads)
      if (distToLine(q, road) < margin) return true;
    return false;
  }

  private build(v: MapValues, px: number) {
    const { W, H } = this;
    const r = seededRng(v.seed * 7919 + 1);
    const gap = v.gap;

    // Districts: rotated lattices, angles close enough to read as one city.
    const base = r() * Math.PI;
    this.districts = [];
    for (let k = 0; k < Math.max(1, Math.round(v.districts)); k++) {
      const a = base + (r() - 0.5) * Math.PI * 0.7;
      const d: District = {
        o: { x: r() * W, y: r() * H },
        a,
        c: Math.cos(a),
        s: Math.sin(a),
        px: v.blockW * (0.7 + r() * 0.6),
        py: v.blockH * (0.7 + r() * 0.6),
        i0: 0,
        i1: 0,
        j0: 0,
        j1: 0,
      };
      let umin = Infinity;
      let umax = -Infinity;
      let vmin = Infinity;
      let vmax = -Infinity;
      for (const [x, y] of [
        [0, 0],
        [W, 0],
        [W, H],
        [0, H],
      ]) {
        const u = (x - d.o.x) * d.c + (y - d.o.y) * d.s;
        const w = -(x - d.o.x) * d.s + (y - d.o.y) * d.c;
        umin = Math.min(umin, u);
        umax = Math.max(umax, u);
        vmin = Math.min(vmin, w);
        vmax = Math.max(vmax, w);
      }
      d.i0 = Math.floor(umin / d.px) - 1;
      d.i1 = Math.ceil(umax / d.px) + 1;
      d.j0 = Math.floor(vmin / d.py) - 1;
      d.j1 = Math.ceil(vmax / d.py) + 1;
      this.districts.push(d);
    }

    this.water = null;
    if (v.water) {
      const corner = Math.floor(r() * 4);
      const cx = corner === 1 || corner === 2 ? W : 0;
      const cy = corner >= 2 ? H : 0;
      const rad = v.waterSize * Math.hypot(W, H) * 0.5;
      const out = rad * 0.25;
      this.water = {
        c: { x: cx + (cx ? out : -out), y: cy + (cy ? out : -out) },
        r: rad,
        p1: r() * 6.28,
        p2: r() * 6.28,
      };
    }

    // Avenues: gentle curves from one edge of the sheet to another.
    const edge = (e: number, t: number): P =>
      e === 0
        ? { x: t * W, y: -60 }
        : e === 1
          ? { x: W + 60, y: t * H }
          : e === 2
            ? { x: t * W, y: H + 60 }
            : { x: -60, y: t * H };
    this.roads = [];
    for (let k = 0; k < Math.round(v.roads); k++) {
      const e1 = Math.floor(r() * 4);
      const e2 = (e1 + 1 + Math.floor(r() * 3)) % 4;
      const p0 = edge(e1, 0.1 + r() * 0.8);
      const p3 = edge(e2, 0.1 + r() * 0.8);
      const bend = () => (r() - 0.5) * 0.5 * Math.min(W, H);
      const p1 = {
        x: p0.x + (p3.x - p0.x) / 3 + bend(),
        y: p0.y + (p3.y - p0.y) / 3 + bend(),
      };
      const p2 = {
        x: p0.x + ((p3.x - p0.x) * 2) / 3 + bend(),
        y: p0.y + ((p3.y - p0.y) * 2) / 3 + bend(),
      };
      const pts: P[] = [];
      for (let i = 0; i <= 80; i++) {
        const t = i / 80;
        const m = 1 - t;
        pts.push({
          x:
            m * m * m * p0.x +
            3 * m * m * t * p1.x +
            3 * m * t * t * p2.x +
            t * t * t * p3.x,
          y:
            m * m * m * p0.y +
            3 * m * m * t * p1.y +
            3 * m * t * t * p2.y +
            t * t * t * p3.y,
        });
      }
      this.roads.push(pts);
    }

    // Lots, district by district.
    const lots: Lot[][] = this.districts.map(() => []);
    const keep = (k: number, l: Lot) => {
      const d = this.districts[k];
      const q = world(d, (l.u0 + l.u1) / 2, (l.v0 + l.v1) / 2);
      const hd = Math.hypot(l.u1 - l.u0, l.v1 - l.v0) / 2;
      if (q.x < -hd || q.y < -hd || q.x > W + hd || q.y > H + hd) return;
      if (this.inWater(q, gap + hd * 0.8)) return;
      if (this.nearRoad(q, v.roadWidth / 2 + hd * 0.8)) return;
      if (!this.owns(k, q, gap / 2 + hd * 0.7)) return;
      lots[k].push(l);
    };
    const lotMax = Math.max(v.lotMin + 1, v.lotMax);
    const row = (
      k: number,
      u0: number,
      u1: number,
      va: number,
      vb: number,
      top: boolean,
    ) => {
      let ua = u0;
      while (ua < u1 - 1) {
        let ub = Math.min(u1, ua + v.lotMin + r() * (lotMax - v.lotMin));
        if (u1 - ub < v.lotMin * 0.6) ub = u1;
        const f = 0.65 + r() * 0.35;
        const depth = (vb - va) * f;
        keep(k, {
          u0: ua,
          u1: ub,
          v0: top ? va : vb - depth,
          v1: top ? va + depth : vb,
          kind: 'lot',
        });
        ua = ub;
      }
    };
    const block = (
      k: number,
      u0: number,
      v0: number,
      u1: number,
      v1: number,
    ) => {
      const x = r();
      if (x < v.parkShare) return keep(k, { u0, v0, u1, v1, kind: 'park' });
      if (x < v.parkShare + 0.05)
        return keep(k, { u0, v0, u1, v1, kind: 'court' });
      if (x < v.parkShare + 0.06)
        return keep(k, { u0, v0, u1, v1, kind: 'landmark' });
      const depth = v1 - v0;
      if (depth >= v.lotMin * 2.2) {
        row(k, u0, u1, v0, v0 + depth * (0.38 + r() * 0.12), true);
        row(k, u0, u1, v1 - depth * (0.38 + r() * 0.12), v1, false);
      } else row(k, u0, u1, v0, v1, r() < 0.5);
    };
    this.districts.forEach((d, k) => {
      for (let i = d.i0; i < d.i1; i++)
        for (let j = d.j0; j < d.j1; j++) {
          const sh = () => r() * gap * 0.5;
          const u0 = i * d.px + gap / 2 + sh();
          const u1 = (i + 1) * d.px - gap / 2 - sh();
          const v0 = j * d.py + gap / 2 + sh();
          const v1 = (j + 1) * d.py - gap / 2 - sh();
          if (u1 - u0 < v.lotMin || v1 - v0 < v.lotMin) continue;
          if (r() < 0.22 && u1 - u0 > v.lotMin * 4) {
            // An alley through the middle of the block.
            const m = u0 + (u1 - u0) * (0.35 + r() * 0.3);
            block(k, u0, v0, m - gap * 0.25, v1);
            block(k, m + gap * 0.25, v0, u1, v1);
          } else block(k, u0, v0, u1, v1);
        }
    });

    // Street names: one along each avenue, the rest in the lattice streets.
    const names = [...NAMES].sort(() => r() - 0.5);
    let ni = 0;
    const labels: Label[] = [];
    for (const road of this.roads) {
      if (labels.length >= v.labels) break;
      const i = Math.floor(road.length * (0.25 + r() * 0.5));
      const q = road[i];
      if (q.x < 40 || q.y < 40 || q.x > W - 40 || q.y > H - 40) continue;
      if (this.inWater(q, 20)) continue;
      const b = road[i + 1];
      labels.push({
        x: q.x,
        y: q.y,
        a: Math.atan2(b.y - q.y, b.x - q.x),
        text: names[ni++ % names.length],
      });
    }
    for (
      let tries = 0;
      labels.length < v.labels && tries < v.labels * 20;
      tries++
    ) {
      const k = Math.floor(r() * this.districts.length);
      const d = this.districts[k];
      const i = d.i0 + Math.floor(r() * (d.i1 - d.i0));
      const j = d.j0 + Math.floor(r() * (d.j1 - d.j0));
      const along = r() < 0.6;
      const q = along
        ? world(d, (i + 0.5) * d.px, j * d.py)
        : world(d, i * d.px, (j + 0.5) * d.py);
      if (q.x < 60 || q.y < 30 || q.x > W - 60 || q.y > H - 30) continue;
      if (this.inWater(q, 30) || this.nearRoad(q, v.roadWidth / 2 + 20))
        continue;
      if (!this.owns(k, q, gap * 2)) continue;
      if (labels.some((l) => dist(l, q) < 120)) continue;
      labels.push({
        x: q.x,
        y: q.y,
        a: along ? d.a : d.a + Math.PI / 2,
        text: names[ni++ % names.length],
      });
    }

    // Bake the plan.
    const bake = this.bake ?? document.createElement('canvas');
    this.bake = bake;
    bake.width = Math.max(1, Math.round(W * px));
    bake.height = Math.max(1, Math.round(H * px));
    const g = bake.getContext('2d')!;
    g.setTransform(px, 0, 0, px, 0, 0);
    g.fillStyle = v.paper;
    g.fillRect(0, 0, W, H);
    g.lineJoin = 'miter';

    if (this.water) {
      const w = this.water;
      g.strokeStyle = v.waves;
      g.lineWidth = v.lineWidth;
      for (let y = 8; y < H; y += 24)
        for (let x = 8; x < W; x += 22) {
          const q = { x: x + (r() - 0.5) * 10, y: y + (r() - 0.5) * 10 };
          if (!this.inWater(q, -14)) continue;
          const tilt = (r() - 0.5) * 0.5;
          g.beginPath();
          for (let s = 0; s <= 10; s++) {
            const t = s / 10;
            const ox = Math.sin(t * Math.PI * 2) * 1.7;
            const oy = t * 10;
            const X = q.x + ox * Math.cos(tilt) - oy * Math.sin(tilt);
            const Y = q.y + ox * Math.sin(tilt) + oy * Math.cos(tilt);
            if (s) g.lineTo(X, Y);
            else g.moveTo(X, Y);
          }
          g.stroke();
        }
      g.strokeStyle = v.line;
      g.beginPath();
      for (let s = 0; s <= 400; s++) {
        const th = (s / 400) * Math.PI * 2;
        const q0 = { x: w.c.x + Math.cos(th), y: w.c.y + Math.sin(th) };
        const rr = this.waterR(q0);
        const X = w.c.x + Math.cos(th) * rr;
        const Y = w.c.y + Math.sin(th) * rr;
        if (s) g.lineTo(X, Y);
        else g.moveTo(X, Y);
      }
      g.stroke();
    }

    g.strokeStyle = v.line;
    g.lineWidth = v.lineWidth;
    this.districts.forEach((d, k) => {
      g.save();
      g.translate(d.o.x, d.o.y);
      g.rotate(d.a);
      g.beginPath();
      for (const l of lots[k]) {
        g.rect(l.u0, l.v0, l.u1 - l.u0, l.v1 - l.v0);
        if (l.kind === 'court') {
          const iu = (l.u1 - l.u0) * 0.28;
          const iv = (l.v1 - l.v0) * 0.28;
          g.rect(
            l.u0 + iu,
            l.v0 + iv,
            l.u1 - l.u0 - 2 * iu,
            l.v1 - l.v0 - 2 * iv,
          );
        }
      }
      g.stroke();
      g.fillStyle = v.line;
      for (const l of lots[k]) {
        if (l.kind === 'park') {
          const cu = (l.u0 + l.u1) / 2;
          const cv = (l.v0 + l.v1) / 2;
          g.beginPath();
          g.arc(cu, cv, 2.2, 0, Math.PI * 2);
          g.stroke();
        }
        if (l.kind === 'landmark') {
          const iu = (l.u1 - l.u0) * 0.2;
          const iv = (l.v1 - l.v0) * 0.2;
          g.fillRect(
            l.u0 + iu,
            l.v0 + iv,
            l.u1 - l.u0 - 2 * iu,
            l.v1 - l.v0 - 2 * iv,
          );
        }
      }
      g.restore();
    });

    g.font = `${v.labelSize}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const l of labels) {
      let a = Math.atan2(Math.sin(l.a), Math.cos(l.a));
      if (a > Math.PI / 2) a -= Math.PI;
      if (a < -Math.PI / 2) a += Math.PI;
      const tw = g.measureText(l.text).width;
      g.save();
      g.translate(l.x, l.y);
      g.rotate(a);
      g.fillStyle = v.paper;
      g.fillRect(-tw / 2 - 2, -v.labelSize * 0.6, tw + 4, v.labelSize * 1.2);
      g.fillStyle = v.line;
      g.fillText(l.text, 0, 0);
      g.restore();
    }
  }

  // A route either rides part of an avenue or walks the lattice streets.
  private path(v: MapValues): P[] {
    const r = this.rng;
    const { W, H } = this;
    const ok = (q: P) =>
      q.x > 12 &&
      q.y > 12 &&
      q.x < W - 12 &&
      q.y < H - 12 &&
      !this.inWater(q, 10);
    if (this.roads.length && r() < 0.3) {
      const road = this.roads[Math.floor(r() * this.roads.length)];
      const n = road.length;
      const s = Math.floor(r() * n * 0.7);
      let pts = road.slice(s, s + Math.floor(n * (0.15 + r() * 0.3)));
      if (r() < 0.5) pts = pts.reverse();
      const run: P[] = [];
      for (const q of pts) {
        if (ok(q)) run.push(q);
        else if (run.length) break;
      }
      return run;
    }
    const k = Math.floor(r() * this.districts.length);
    const d = this.districts[k];
    let i = d.i0 + Math.floor(r() * (d.i1 - d.i0));
    let j = d.j0 + Math.floor(r() * (d.j1 - d.j0));
    let dir = Math.floor(r() * 4);
    const pts: P[] = [];
    const steps = 3 + Math.floor(r() * 8);
    for (let s = 0; s <= steps; s++) {
      const q = world(d, i * d.px, j * d.py);
      if (!ok(q) || !this.owns(k, q, v.gap)) break;
      pts.push(q);
      if (s && r() < 0.35) dir = (dir + (r() < 0.5 ? 1 : 3)) % 4;
      if (dir === 0) i++;
      else if (dir === 1) j++;
      else if (dir === 2) i--;
      else j--;
    }
    return pts;
  }

  private spawn(v: MapValues, age = 0) {
    const r = this.rng;
    // Routes keep clear of each other, or they stack up along one avenue.
    const clear = v.dotSize * 5;
    const crowded = (pts: P[]) =>
      pts.some((q) =>
        this.routes.some((rt) => rt.dots.some((d) => dist(d, q) < clear)),
      );
    let pts: P[] = [];
    for (let tries = 0; tries < 24; tries++) {
      const cand = this.path(v);
      if (cand.length >= 2 && !crowded(cand)) {
        pts = cand;
        break;
      }
    }
    if (pts.length < 2) return;

    const gauss = () => (r() + r() + r() - 1.5) * 1.15;
    const step = v.dotSize * 2 * v.dotGap;
    const rate = Math.max(1, v.dotsPerSec);
    const weights = [0.32, 0.32, 0.22, 0.14];
    let x = r();
    let shade = 0;
    while (shade < 3 && x > weights[shade]) x -= weights[shade++];
    const pickShade = () =>
      r() < 0.85
        ? shade
        : Math.max(0, Math.min(3, shade + (r() < 0.5 ? -1 : 1)));

    const dots: Dot[] = [];
    let carry = 0;
    for (let i = 1; i < pts.length && dots.length < 80; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const L = dist(a, b);
      const nx = -(b.y - a.y) / (L || 1);
      const ny = (b.x - a.x) / (L || 1);
      for (let s = carry; s < L; s += step) {
        const t = s / L;
        const j = gauss() * v.dotSize * v.jitter;
        dots.push({
          x: a.x + (b.x - a.x) * t + nx * j,
          y: a.y + (b.y - a.y) * t + ny * j,
          t: dots.length / rate,
          shade: pickShade(),
          star: false,
        });
        carry = s + step - L;
      }
    }
    const end = pts[pts.length - 1];
    const tris: Tri[] = [];
    if (v.cluster > 0 && r() < 0.75) {
      const n = Math.round(v.cluster * (0.5 + r()));
      const dark = Math.min(3, shade + 1);
      for (let i = 0; i < n; i++)
        dots.push({
          x: end.x + gauss() * v.dotSize * 2.2,
          y: end.y + gauss() * v.dotSize * 2.2,
          t: dots.length / rate,
          shade: r() < 0.7 ? dark : shade,
          star: false,
        });
    }
    const done = dots.length / rate;
    if (v.stars && dots.length > 4)
      for (let s = 0; s < 1 + Math.floor(r() * 2); s++)
        dots[Math.floor(r() * dots.length)].star = true;
    if (v.triangles) {
      const n = 2 + Math.floor(r() * 4);
      const base = r() * Math.PI * 2;
      for (let i = 0; i < n; i++) {
        const a = base + (i - n / 2) * 0.45;
        const rad = v.dotSize * (3.2 + r() * 1.5);
        tris.push({
          x: end.x + Math.cos(a) * rad,
          y: end.y + Math.sin(a) * rad,
          a: Math.floor(r() * 4) * (Math.PI / 2) + Math.PI / 6,
          t: done + i * 0.08,
        });
      }
    }
    let marker: Marker | null = null;
    if (v.markers) {
      const mid = pts[Math.floor((pts.length - 1) / 2)];
      const nxt = pts[Math.floor((pts.length - 1) / 2) + 1];
      const L = dist(mid, nxt) || 1;
      const side = r() < 0.5 ? 1 : -1;
      this.counter = (this.counter % 12) + 1;
      marker = {
        x: (mid.x + nxt.x) / 2 - ((nxt.y - mid.y) / L) * v.dotSize * 3.4 * side,
        y: (mid.y + nxt.y) / 2 + ((nxt.x - mid.x) / L) * v.dotSize * 3.4 * side,
        n: this.counter,
        t: 0.1,
      };
    }
    this.routes.push({ age, dots, tris, marker, grow: done + 0.5 });
  }

  render(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    wallDt: number,
    v: MapValues,
  ) {
    const px = ctx.getTransform().a || 1;
    const key = [
      W,
      H,
      px,
      v.seed,
      v.districts,
      v.blockW,
      v.blockH,
      v.gap,
      v.lotMin,
      v.lotMax,
      v.parkShare,
      v.roads,
      v.roadWidth,
      v.water,
      v.waterSize,
      v.labels,
      v.paper,
      v.line,
      v.lineWidth,
      v.labelSize,
      v.waves,
    ].join('|');
    if (key !== this.key) {
      this.key = key;
      this.W = W;
      this.H = H;
      this.build(v, px);
      this.rng = seededRng(v.seed * 131 + 17);
      this.routes = [];
      this.counter = 0;
      for (let i = 0; i < v.routes; i++) this.spawn(v);
      for (const rt of this.routes)
        rt.age = this.rng() * (rt.grow + v.hold) * 0.9;
    }

    const dt = v.paused ? 0 : Math.min(wallDt, 0.1) * v.speed;
    for (const rt of this.routes) rt.age += dt;
    this.routes = this.routes.filter(
      (rt) => rt.age < rt.grow + v.hold + v.fade,
    );
    const live = this.routes.filter((rt) => rt.age < rt.grow + v.hold).length;
    this.spawnIn -= dt;
    if (live < v.routes && this.spawnIn <= 0 && dt > 0) {
      this.spawn(v);
      this.spawnIn = 0.6;
    }

    ctx.drawImage(this.bake!, 0, 0, W, H);

    const shades = [v.shade1, v.shade2, v.shade3, v.shade4];
    const R = v.dotSize;
    ctx.lineWidth = v.outlineWidth;
    ctx.strokeStyle = v.outline;
    for (const rt of this.routes) {
      const out = rt.age - rt.grow - v.hold;
      ctx.globalAlpha = out > 0 ? Math.max(0, 1 - out / v.fade) : 1;
      for (const d of rt.dots) {
        const k = (rt.age - d.t) / 0.2;
        if (k <= 0) continue;
        const e = k >= 1 ? 1 : 1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2;
        const rad = R * e;
        ctx.beginPath();
        ctx.arc(d.x, d.y, rad, 0, Math.PI * 2);
        ctx.fillStyle = d.star ? v.paper : shades[d.shade];
        ctx.fill();
        if (v.outlineWidth > 0) ctx.stroke();
        if (d.star) {
          ctx.beginPath();
          for (let s = 0; s < 12; s++) {
            const a = (s / 12) * Math.PI * 2;
            ctx.moveTo(
              d.x + Math.cos(a) * (rad + 1.2),
              d.y + Math.sin(a) * (rad + 1.2),
            );
            ctx.lineTo(
              d.x + Math.cos(a) * (rad + 3.2),
              d.y + Math.sin(a) * (rad + 3.2),
            );
          }
          ctx.stroke();
        }
      }
      ctx.fillStyle = v.outline;
      for (const t of rt.tris) {
        const k = Math.min(1, (rt.age - t.t) / 0.2);
        if (k <= 0) continue;
        const s = R * 0.95 * k;
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          const a = t.a + (i * Math.PI * 2) / 3;
          if (i) ctx.lineTo(t.x + Math.cos(a) * s, t.y + Math.sin(a) * s);
          else ctx.moveTo(t.x + Math.cos(a) * s, t.y + Math.sin(a) * s);
        }
        ctx.fill();
      }
      const m = rt.marker;
      if (m && rt.age > m.t) {
        const s = R * 2.7;
        ctx.fillStyle = '#151515';
        ctx.fillRect(m.x - s / 2, m.y - s / 2, s, s);
        ctx.fillStyle = v.paper;
        ctx.font = `600 ${R * 1.45}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(m.n), m.x, m.y + R * 0.08);
      }
    }
    ctx.globalAlpha = 1;
  }
}
