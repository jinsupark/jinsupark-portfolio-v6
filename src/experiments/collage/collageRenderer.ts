// A paper collage that keeps composing itself: cut and torn pieces are pasted
// down one at a time, and old ones are ripped back off, often leaving a torn
// scrap behind. Each piece is drawn once into its own sprite; settled pieces
// are baked into one wall canvas, so a frame only redraws what's moving.
//
// A torn edge shows the paper's core: the piece's outline is filled with the
// core colour (white, or cardboard), and the print is clipped by a second
// outline pulled in by a varying band along the torn sides only.
import { ART_PROJECTS } from '@/experiments/terminal/imagePool';
import { seededRng } from '@/lab/random';
import type { CollageValues } from './collageControls';
import { drawPrint, type Print, type PrintKind } from './prints';

type Ctx = CanvasRenderingContext2D;
type P = { x: number; y: number };

type Shape = {
  // The visible part of the sheet, in sheet coordinates.
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  torn: [boolean, boolean, boolean, boolean]; // top, right, bottom, left
  seeds: [number, number, number, number];
  cut: P[] | null; // a scissor-cut outline instead of a rectangle
};

type Piece = {
  id: number;
  cx: number;
  cy: number;
  w: number;
  h: number;
  rot: number;
  alpha: number;
  print: Print;
  shape: Shape;
  rim: string;
  scrap: boolean;
  sprite: { c: HTMLCanvasElement; m: number } | null;
};

type Moving = { piece: Piece; t0: number; dir: P; spin: number };

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIn = (t: number) => t * t * t;

function valueNoise(seed: number) {
  const r = seededRng(seed);
  const v = Array.from({ length: 512 }, r);
  const n = (x: number) => {
    const i = Math.floor(x);
    const f = x - i;
    const a = v[i & 511];
    const b = v[(i + 1) & 511];
    return a + (b - a) * f * f * (3 - 2 * f);
  };
  // Signed fractal noise, roughly -1..1.
  return (x: number) =>
    (n(x) - 0.5) * 1.2 +
    (n(x * 2.3 + 17) - 0.5) * 0.6 +
    (n(x * 5.1 + 41) - 0.5) * 0.35;
}

function makeGrain() {
  const fine = document.createElement('canvas');
  fine.width = fine.height = 256;
  const g = fine.getContext('2d')!;
  const img = g.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 200 + Math.random() * 55;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const mottle = document.createElement('canvas');
  mottle.width = mottle.height = 24;
  const m = mottle.getContext('2d')!;
  const mi = m.createImageData(24, 24);
  for (let i = 0; i < mi.data.length; i += 4) {
    const v = 225 + Math.random() * 30;
    mi.data[i] = v;
    mi.data[i + 1] = v - 4;
    mi.data[i + 2] = v - 12;
    mi.data[i + 3] = 255;
  }
  m.putImageData(mi, 0, 0);
  return { fine, mottle };
}

export class CollageRenderer {
  private grain = makeGrain();
  private settled: Piece[] = [];
  private pasting: Moving[] = [];
  private ripping: Moving[] = [];
  private bake: HTMLCanvasElement | null = null;
  private dirty = true;
  private key = '';
  private rng = seededRng(1);
  private clock = 0;
  private nextPaste = 0;
  private nextId = 0;
  private px = 1;
  private W = 0;
  private H = 0;
  private pendingRip: P | null = null;
  private images = new Map<number, HTMLImageElement>();

  // Rip the top piece under a point (canvas units) on the next frame.
  ripAt(p: P) {
    this.pendingRip = p;
  }

  private reset(v: CollageValues) {
    this.rng = seededRng(v.seed * 4513 + 9);
    this.settled = [];
    this.pasting = [];
    this.ripping = [];
    this.nextId = 0;
    for (let i = 0; i < v.pieces; i++) this.settled.push(this.spawn(v));
    this.nextPaste = this.clock + v.pasteEvery;
    this.dirty = true;
  }

  private imageFor(seed: number) {
    if (!ART_PROJECTS.length) return null;
    const i = seed % ART_PROJECTS.length;
    let img = this.images.get(i);
    if (!img) {
      const el = new Image();
      img = el;
      this.images.set(i, el);
      void ART_PROJECTS[i].images[0]().then((url) => {
        el.onload = () => {
          // Pieces printed with it were drawn blank; draw them again.
          for (const p of [
            ...this.settled,
            ...this.pasting.map((m) => m.piece),
          ])
            if (p.print.image === el) p.sprite = null;
          this.dirty = true;
        };
        el.src = url;
      });
    }
    return img;
  }

  private spawn(v: CollageValues): Piece {
    const r = this.rng;
    const W = this.W;
    const H = this.H;
    const U = Math.min(W, H);
    const roll = r();
    let w: number;
    let h: number;
    let cut: P[] | null = null;
    const strip = roll < v.stripShare;
    if (strip) {
      const long = U * (0.4 + r() * 0.7);
      const short = U * (0.05 + r() * 0.16);
      [w, h] = r() < 0.7 ? [short, long] : [long, short];
    } else if (roll < v.stripShare + v.cutoutShare) {
      w = U * (0.25 + r() * 0.35);
      h = U * (0.25 + r() * 0.35);
      cut = this.cutout(w, h);
    } else {
      const lo = Math.min(v.sizeMin, v.sizeMax);
      const hi = Math.max(v.sizeMin, v.sizeMax);
      w = U * (lo + r() * (hi - lo));
      h = U * (lo + r() * (hi - lo));
    }

    // Left edges snap to a loose column grid, which is what gives a collage
    // like this its strong verticals.
    let x = r() * W;
    if (r() < v.snap) x = (Math.round((x / W) * v.columns) / v.columns) * W;
    const cx = x + w / 2 + (r() - 0.5) * U * 0.02;
    const cy = -0.05 * H + r() * 1.1 * H;
    const rot = ((r() - 0.5) * 2 * v.tilt * Math.PI) / 180;

    const tornP = (end: boolean) =>
      r() < (strip ? (end ? 0.8 : v.tornShare * 0.4) : v.tornShare);
    const vertical = h > w;
    const torn: Shape['torn'] = [
      tornP(vertical),
      tornP(!vertical),
      tornP(vertical),
      tornP(!vertical),
    ];

    const print = this.printFor(v, strip, !!cut);
    const drawing = print.kind === 'drawing';
    return {
      id: this.nextId++,
      cx,
      cy,
      w,
      h,
      rot,
      alpha: drawing ? 0.82 : 1,
      print,
      shape: {
        x0: 0,
        y0: 0,
        x1: w,
        y1: h,
        torn,
        seeds: [r() * 1e6, r() * 1e6, r() * 1e6, r() * 1e6].map(
          Math.floor,
        ) as Shape['seeds'],
        cut,
      },
      rim: r() < v.kraftShare ? v.kraft : v.core,
      scrap: false,
      sprite: null,
    };
  }

  private printFor(v: CollageValues, strip: boolean, cutout: boolean): Print {
    const r = this.rng;
    const seed = Math.floor(r() * 1e6);
    const colours = [
      v.orange,
      v.orange,
      v.cobalt,
      v.violet,
      v.pink,
      v.coral,
      v.sky,
      v.yellow,
      v.green,
      v.black,
    ];
    const greys = ['#f4f4f2', '#d6d6d4', '#a9a9a7', '#7c7c7b', '#4a4a49'];
    const pick = <T>(a: T[]) => a[Math.floor(r() * a.length)];
    const other = (c: string) => {
      const rest = colours.filter((x) => x !== c && x !== v.black);
      return pick(rest.length ? rest : colours);
    };
    const first = r() < v.colorShare ? pick(colours) : pick(greys);
    const base: Print = {
      kind: 'solid',
      base: first,
      accent: other(first),
      ink: v.textInk,
      seed,
      flip: r() < 0.4,
      image: null,
    };
    // Cut-outs are mostly black silhouettes, as in a photo collage.
    if (cutout)
      return r() < 0.55
        ? { ...base, kind: 'halftone', base: v.black, ink: '#5a5a58' }
        : { ...base, base: pick(colours) };
    const shares: [PrintKind, number][] = [
      ['gradient', v.gradientShare],
      ['halftone', v.halftoneShare],
      ['scribble', v.scribbleShare],
      ['geo', v.geoShare],
      ['type', v.typeShare],
      ['ruler', strip ? v.rulerShare * 3 : 0],
      ['drawing', v.drawingShare],
      ['image', v.imageShare],
    ];
    let x = r();
    for (const [kind, s] of shares) {
      if (x < s) {
        if (kind === 'gradient') {
          const a = pick(colours.filter((c) => c !== v.black));
          return { ...base, kind, base: a, accent: other(a) };
        }
        if (kind === 'halftone') {
          const dark = r() < 0.5;
          return {
            ...base,
            kind,
            base: dark ? pick(greys.slice(3)) : pick(greys.slice(1, 3)),
            ink: dark ? '#d8d8d6' : v.black,
          };
        }
        if (kind === 'scribble')
          return {
            ...base,
            kind,
            base: pick([v.black, '#2a2a29', '#3d3d3c']),
            ink: '#a8a8a6',
          };
        if (kind === 'geo') {
          const a = pick(colours);
          return {
            ...base,
            kind,
            base: a,
            accent: r() < 0.25 ? v.cream : other(a),
          };
        }
        if (kind === 'ruler') return { ...base, kind, accent: '#f7f6f2' };
        if (kind === 'type')
          return {
            ...base,
            kind,
            base: pick([v.cream, '#f3ead9', '#f5f4f0']),
            accent: v.green,
          };
        if (kind === 'drawing')
          return { ...base, kind, base: '#dfe4ea', ink: '#5d6f8c' };
        return { ...base, kind, image: this.imageFor(seed) };
      }
      x -= s;
    }
    return base;
  }

  // A scissor-cut silhouette: a bent limb or a lumpy blob.
  private cutout(w: number, h: number): P[] {
    const r = this.rng;
    const pts: P[] = [];
    if (r() < 0.6) {
      const a = { x: w * 0.05, y: h * (0.6 + r() * 0.35) };
      const c = { x: w * (0.3 + r() * 0.4), y: h * (0.2 + r() * 0.6) };
      const b = { x: w * 0.95, y: h * (0.05 + r() * 0.35) };
      const half = Math.min(w, h) * (0.1 + r() * 0.08);
      const side: P[] = [];
      const other: P[] = [];
      const N = 28;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const p = {
          x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t * t * b.x,
          y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t * t * b.y,
        };
        const d = {
          x: 2 * (1 - t) * (c.x - a.x) + 2 * t * (b.x - c.x),
          y: 2 * (1 - t) * (c.y - a.y) + 2 * t * (b.y - c.y),
        };
        const l = Math.hypot(d.x, d.y) || 1;
        const n = { x: -d.y / l, y: d.x / l };
        const wid =
          half * (0.8 + 0.5 * Math.sin(t * 3 + r() * 0.3)) * (0.7 + t * 0.5);
        side.push({ x: p.x + n.x * wid, y: p.y + n.y * wid });
        other.push({ x: p.x - n.x * wid, y: p.y - n.y * wid });
      }
      pts.push(...side, ...other.reverse());
    } else {
      const k = 3 + Math.floor(r() * 3);
      const ph = r() * 6;
      for (let i = 0; i < 48; i++) {
        const th = (i / 48) * Math.PI * 2;
        const rad =
          0.42 + 0.08 * Math.sin(k * th + ph) + 0.03 * Math.sin(7 * th);
        pts.push({
          x: w / 2 + Math.cos(th) * rad * w,
          y: h / 2 + Math.sin(th) * rad * h,
        });
      }
    }
    return pts;
  }

  // The piece's outer outline, and the print's outline inside it.
  private outlines(p: Piece, v: CollageValues) {
    const s = p.shape;
    if (s.cut) return { outer: s.cut, inner: s.cut };
    const corners = [
      { x: s.x0, y: s.y0 },
      { x: s.x1, y: s.y0 },
      { x: s.x1, y: s.y1 },
      { x: s.x0, y: s.y1 },
    ];
    const outer: P[] = [];
    const inner: P[] = [];
    for (let side = 0; side < 4; side++) {
      const a = corners[side];
      const b = corners[(side + 1) % 4];
      if (!s.torn[side]) {
        outer.push(a);
        inner.push(a);
        continue;
      }
      const noise = valueNoise(s.seeds[side]);
      const core = valueNoise(s.seeds[side] + 1);
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      const dir = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
      const nIn = { x: -dir.y, y: dir.x };
      const steps = Math.max(2, Math.ceil(L / 2));
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        const q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        // Noise runs along the sheet's own axis, so a scrap torn from this
        // sheet keeps exactly this edge where it shares it.
        const u = (side % 2 === 0 ? q.x : q.y) * v.roughFreq;
        const taper = Math.min(1, Math.sin(Math.PI * t) * 4);
        const d = v.rough * noise(u) * taper;
        const band =
          v.band * (0.35 + 0.65 * Math.abs(core(u * 0.6))) * 1.4 * taper;
        outer.push({ x: q.x + nIn.x * d, y: q.y + nIn.y * d });
        inner.push({
          x: q.x + nIn.x * (d + band),
          y: q.y + nIn.y * (d + band),
        });
      }
    }
    return { outer, inner };
  }

  private spriteOf(p: Piece, v: CollageValues) {
    if (p.sprite) return p.sprite;
    const m = v.rough * 1.6 + 4;
    const px = this.px;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil((p.w + 2 * m) * px));
    c.height = Math.max(1, Math.ceil((p.h + 2 * m) * px));
    const g = c.getContext('2d')!;
    g.setTransform(px, 0, 0, px, m * px, m * px);
    const { outer, inner } = this.outlines(p, v);
    const path = (pts: P[]) => {
      g.beginPath();
      pts.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)));
      g.closePath();
    };
    g.save();
    path(outer);
    g.clip();
    g.fillStyle = p.rim;
    g.fillRect(-m, -m, p.w + 2 * m, p.h + 2 * m);
    g.save();
    path(inner);
    g.clip();
    drawPrint(g, p.print, p.w, p.h);
    g.restore();
    if (v.grain > 0) {
      g.globalCompositeOperation = 'multiply';
      g.globalAlpha = v.grain;
      g.fillStyle = g.createPattern(this.grain.fine, 'repeat')!;
      g.fillRect(-m, -m, p.w + 2 * m, p.h + 2 * m);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
    if (v.stain > 0) {
      const r = seededRng(p.print.seed + 77);
      for (let i = 0; i < 2; i++) {
        const sx = r() * p.w;
        const sy = r() * p.h;
        const sr = Math.max(p.w, p.h) * (0.2 + r() * 0.5);
        const grad = g.createRadialGradient(sx, sy, 0, sx, sy, sr);
        grad.addColorStop(0, `rgba(150,110,60,${0.12 * v.stain * r()})`);
        grad.addColorStop(1, 'rgba(150,110,60,0)');
        g.fillStyle = grad;
        g.fillRect(-m, -m, p.w + 2 * m, p.h + 2 * m);
      }
    }
    g.restore();
    p.sprite = { c, m };
    return p.sprite;
  }

  private drawPiece(
    ctx: Ctx,
    p: Piece,
    v: CollageValues,
    o: {
      dx?: number;
      dy?: number;
      rot?: number;
      scale?: number;
      alpha?: number;
      lift?: number;
    } = {},
  ) {
    const s = this.spriteOf(p, v);
    const lift = o.lift ?? 0;
    ctx.save();
    ctx.translate(p.cx + (o.dx ?? 0), p.cy + (o.dy ?? 0));
    ctx.rotate(p.rot + (o.rot ?? 0));
    const sc = o.scale ?? 1;
    ctx.scale(sc, sc);
    ctx.globalAlpha = p.alpha * (o.alpha ?? 1);
    if (v.shadow > 0) {
      // Shadow offsets ignore the transform, so they're in device pixels.
      const k = this.px;
      ctx.shadowColor = `rgba(45,32,18,${v.shadow * (1 - lift / (lift + 60))})`;
      ctx.shadowBlur = (v.shadowBlur + lift * 1.2) * k;
      ctx.shadowOffsetX = (1 + lift * 0.4) * k;
      ctx.shadowOffsetY = (1.5 + lift * 0.6) * k;
    }
    ctx.drawImage(
      s.c,
      -p.w / 2 - s.m,
      -p.h / 2 - s.m,
      p.w + 2 * s.m,
      p.h + 2 * s.m,
    );
    ctx.restore();
  }

  private rebake(v: CollageValues) {
    const px = this.px;
    const c = (this.bake ??= document.createElement('canvas'));
    c.width = Math.ceil(this.W * px);
    c.height = Math.ceil(this.H * px);
    const g = c.getContext('2d')!;
    g.setTransform(px, 0, 0, px, 0, 0);
    g.fillStyle = v.wall;
    g.fillRect(0, 0, this.W, this.H);
    g.globalCompositeOperation = 'multiply';
    g.globalAlpha = v.grain * 0.8;
    g.imageSmoothingEnabled = true;
    g.drawImage(this.grain.mottle, 0, 0, this.W, this.H);
    g.fillStyle = g.createPattern(this.grain.fine, 'repeat')!;
    g.fillRect(0, 0, this.W, this.H);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    for (const p of this.settled) this.drawPiece(g, p, v);
    this.dirty = false;
  }

  // Tears a piece off. Often a scrap stays glued down: the part of the sheet
  // beyond a fresh tear line, against one of its sides.
  private rip(p: Piece, v: CollageValues) {
    const r = this.rng;
    const at = this.settled.indexOf(p);
    this.settled = this.settled.filter((x) => x !== p);
    const a = r() * Math.PI * 2;
    this.ripping.push({
      piece: p,
      t0: this.clock,
      dir: { x: Math.cos(a), y: Math.sin(a) - 0.6 },
      spin: (r() - 0.5) * 0.8,
    });
    if (!p.shape.cut && r() < v.residue) {
      const s = p.shape;
      const side = Math.floor(r() * 4);
      const f = 0.12 + r() * 0.3;
      const shape: Shape = { ...s, torn: [...s.torn], seeds: [...s.seeds] };
      const fresh = Math.floor(r() * 1e6);
      if (side === 0) {
        shape.y1 = s.y0 + (s.y1 - s.y0) * f;
        shape.torn[2] = true;
        shape.seeds[2] = fresh;
      } else if (side === 1) {
        shape.x0 = s.x1 - (s.x1 - s.x0) * f;
        shape.torn[3] = true;
        shape.seeds[3] = fresh;
      } else if (side === 2) {
        shape.y0 = s.y1 - (s.y1 - s.y0) * f;
        shape.torn[0] = true;
        shape.seeds[0] = fresh;
      } else {
        shape.x1 = s.x0 + (s.x1 - s.x0) * f;
        shape.torn[1] = true;
        shape.seeds[1] = fresh;
      }
      const scrap: Piece = {
        ...p,
        id: this.nextId++,
        shape,
        scrap: true,
        sprite: null,
      };
      // The scrap stays where the sheet was in the stack.
      this.settled.splice(Math.max(0, at), 0, scrap);
      const scraps = this.settled.filter((x) => x.scrap);
      if (scraps.length > v.pieces * 0.6)
        this.settled = this.settled.filter((x) => x !== scraps[0]);
    }
    this.dirty = true;
  }

  private hit(pt: P) {
    for (let i = this.settled.length - 1; i >= 0; i--) {
      const p = this.settled[i];
      const dx = pt.x - p.cx;
      const dy = pt.y - p.cy;
      const c = Math.cos(-p.rot);
      const s = Math.sin(-p.rot);
      const lx = dx * c - dy * s + p.w / 2;
      const ly = dx * s + dy * c + p.h / 2;
      const sh = p.shape;
      if (lx >= sh.x0 && lx <= sh.x1 && ly >= sh.y0 && ly <= sh.y1) return p;
    }
    return null;
  }

  render(ctx: Ctx, W: number, H: number, wallDt: number, v: CollageValues) {
    const px = ctx.getTransform().a || 1;
    const key = [
      Math.round(W),
      Math.round(H),
      px,
      v.seed,
      v.stripShare,
      v.cutoutShare,
      v.columns,
    ].join();
    if (key !== this.key) {
      this.key = key;
      this.W = W;
      this.H = H;
      this.px = px;
      this.reset(v);
    }
    const dt = v.paused ? 0 : Math.min(wallDt, 0.1) * v.speed;
    const t = (this.clock += dt);

    if (this.pendingRip) {
      const p = this.hit(this.pendingRip);
      if (p) this.rip(p, v);
      this.pendingRip = null;
    }

    if (dt > 0 && t >= this.nextPaste) {
      this.pasting.push({
        piece: this.spawn(v),
        t0: t,
        dir: { x: 0, y: 0 },
        spin: 0,
      });
      this.nextPaste = t + v.pasteEvery * (0.5 + this.rng());
    }
    const done = this.pasting.filter((m) => t - m.t0 >= v.pasteDur);
    if (done.length) {
      this.pasting = this.pasting.filter((m) => !done.includes(m));
      this.settled.push(...done.map((m) => m.piece));
      if (!this.dirty && this.bake) {
        const g = this.bake.getContext('2d')!;
        for (const m of done) this.drawPiece(g, m.piece, v);
      } else this.dirty = true;
    }
    if (v.autoRip && dt > 0) {
      const whole = this.settled.filter((p) => !p.scrap);
      if (whole.length + this.pasting.length > v.pieces && whole.length) {
        const old = whole.slice(0, Math.max(1, Math.ceil(whole.length / 2)));
        this.rip(old[Math.floor(this.rng() * old.length)], v);
      }
    }
    this.ripping = this.ripping.filter((m) => t - m.t0 < v.ripDur);

    if (this.dirty || !this.bake) this.rebake(v);
    ctx.drawImage(this.bake!, 0, 0, W, H);

    for (const m of this.pasting) {
      const k = easeOut(Math.min(1, (t - m.t0) / v.pasteDur));
      this.drawPiece(ctx, m.piece, v, {
        dx: -v.lift * 0.6 * (1 - k),
        dy: -v.lift * (1 - k),
        scale: 1 + 0.04 * (1 - k),
        alpha: Math.min(1, k * 4),
        lift: v.lift * (1 - k),
      });
    }
    const U = Math.min(W, H);
    for (const m of this.ripping) {
      const k = easeIn(Math.min(1, (t - m.t0) / v.ripDur));
      this.drawPiece(ctx, m.piece, v, {
        dx: m.dir.x * U * 0.8 * k,
        dy: m.dir.y * U * 0.8 * k,
        rot: m.spin * k,
        scale: 1 + 0.06 * Math.min(1, k * 6),
        alpha: 1 - Math.max(0, (k - 0.6) / 0.4),
        lift: v.lift * Math.min(1, k * 6),
      });
    }
  }
}
