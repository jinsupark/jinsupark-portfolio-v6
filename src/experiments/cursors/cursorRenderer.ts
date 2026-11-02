// Pixel-art pointers on tilted elliptical orbits, nearer ones drawn larger and
// on top so the swarm reads as a ring in depth. Sprites are tiny bitmaps drawn
// with smoothing off, so they stay hard-edged at any size.
import { PictureSource, drawCover } from '@/lab/pictureSource';
import { seededRng } from '@/lab/random';
import type { CursorValues } from './cursorControls';

type Ctx = CanvasRenderingContext2D;

// X outline, o fill, anything else transparent. The classic arrow.
const ARROW = [
  'X',
  'XX',
  'XoX',
  'XooX',
  'XoooX',
  'XooooX',
  'XoooooX',
  'XooooooX',
  'XoooooooX',
  'XooooooooX',
  'XoooooXXXXX',
  'XooXooX',
  'XoX.XooX',
  'XX..XooX',
  'X....XooX',
  '.....XooX',
  '......XooX',
  '......XooX',
  '.......XX',
];

// The diagonal resize pointer, built as a fill shape and outlined by rule.
function resizeBitmap() {
  const N = 15;
  const fill = (x: number, y: number) => {
    const a = x >= 1 && y >= 1 && x + y <= 6;
    const b = N - 1 - x >= 1 && N - 1 - y >= 1 && 2 * (N - 1) - x - y <= 6;
    const shaft = x === y && x >= 2 && x <= N - 3;
    return a || b || shaft;
  };
  const rows: string[] = [];
  for (let y = 0; y < N; y++) {
    let row = '';
    for (let x = 0; x < N; x++) {
      if (fill(x, y)) row += 'o';
      else {
        let edge = false;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++)
            if (fill(x + dx, y + dy)) edge = true;
        row += edge ? 'X' : '.';
      }
    }
    rows.push(row);
  }
  return rows;
}
const RESIZE = resizeBitmap();

function sprite(rows: string[], fill: string, outline: string) {
  const w = Math.max(...rows.map((r) => r.length));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = rows.length;
  const ctx = c.getContext('2d')!;
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch !== 'X' && ch !== 'o') return;
      ctx.fillStyle = ch === 'X' ? outline : fill;
      ctx.fillRect(x, y, 1, 1);
    }),
  );
  return c;
}

type Cursor = {
  centre: number;
  r: number;
  phase: number;
  speed: number;
  size: number;
  wob: number;
  kind: 'arrow' | 'resize';
  echo: boolean;
};

export class CursorRenderer {
  private cursors: Cursor[] = [];
  private key = '';
  private sprites = new Map<string, HTMLCanvasElement>();
  private clock = 0;
  private focus: { x: number; y: number } | null = null;
  private centre: { x: number; y: number } | null = null;
  private source = new PictureSource();

  // A point (canvas units) the orbits drift toward when `follow` is on.
  setFocus(p: { x: number; y: number } | null) {
    this.focus = p;
  }

  private spriteOf(kind: Cursor['kind'], v: CursorValues) {
    const k = `${kind}${v.fill}${v.outline}`;
    let s = this.sprites.get(k);
    if (!s) {
      s = sprite(kind === 'arrow' ? ARROW : RESIZE, v.fill, v.outline);
      this.sprites.set(k, s);
    }
    return s;
  }

  private build(v: CursorValues) {
    const key = [
      v.seed,
      v.count,
      v.centers,
      v.radiusMin,
      v.radiusMax,
      v.speed,
      v.speedSpread,
      v.reverse,
      v.sizeMin,
      v.sizeMax,
      v.resizeShare,
      v.echoShare,
    ].join();
    if (key === this.key) return;
    this.key = key;
    const rng = seededRng(v.seed * 389 + 7);
    const lo = Math.min(v.radiusMin, v.radiusMax);
    const hi = Math.max(v.radiusMin, v.radiusMax);
    this.cursors = Array.from({ length: Math.round(v.count) }, () => {
      const dir = rng() < v.reverse ? -1 : 1;
      return {
        centre: Math.floor(rng() * v.centers),
        // Square-root spread fills the disc evenly rather than bunching inside.
        r: lo + (hi - lo) * Math.sqrt(rng()),
        phase: rng() * Math.PI * 2,
        speed: dir * v.speed * (1 - v.speedSpread * rng()),
        size: v.sizeMin + (v.sizeMax - v.sizeMin) * rng(),
        wob: rng() * Math.PI * 2,
        kind: rng() < v.resizeShare ? 'resize' : 'arrow',
        echo: rng() < v.echoShare,
      };
    });
  }

  render(ctx: Ctx, W: number, H: number, wallDt: number, v: CursorValues) {
    this.build(v);
    const wall = Math.min(wallDt, 0.1);
    const dt = v.paused ? 0 : wall * v.timeScale;
    const t = (this.clock += dt);

    const home = { x: W / 2, y: H / 2 };
    const target = v.follow && this.focus ? this.focus : home;
    if (!this.centre) this.centre = { ...target };
    const k = 1 - Math.exp(-wall / v.lag);
    this.centre.x += (target.x - this.centre.x) * k;
    this.centre.y += (target.y - this.centre.y) * k;

    ctx.fillStyle = v.ground;
    ctx.fillRect(0, 0, W, H);
    const src = v.background === 'video' ? this.source.get('video', 0) : null;
    if (src) {
      drawCover(ctx, src, 0, 0, W, H);
      if (v.dim > 0) {
        ctx.fillStyle = `rgba(0,0,0,${v.dim})`;
        ctx.fillRect(0, 0, W, H);
      }
    }

    const unit = Math.min(W, H);
    const tilt = (v.tilt * Math.PI) / 180;
    const ct = Math.cos(tilt);
    const st = Math.sin(tilt);
    // Several centres sit on a slow ring around the main one.
    const centres = Array.from({ length: Math.round(v.centers) }, (_, i) => {
      if (v.centers <= 1) return this.centre!;
      const a = (i / v.centers) * Math.PI * 2 + t * 0.05;
      return {
        x: this.centre!.x + Math.cos(a) * unit * 0.28,
        y: this.centre!.y + Math.sin(a) * unit * 0.2,
      };
    });

    type Draw = { x: number; y: number; s: number; depth: number; c: Cursor };
    const draws: Draw[] = [];
    const place = (c: Cursor, a: number) => {
      const r = c.r * unit * (1 + v.wobble * Math.sin(t * 0.7 + c.wob));
      const ex = Math.cos(a) * r;
      const ey = Math.sin(a) * r * v.ellipse;
      const o = centres[c.centre % centres.length];
      const depth = Math.sin(a);
      const s = v.depth ? c.size * (0.6 + 0.4 * (depth + 1)) : c.size;
      draws.push({
        x: o.x + ex * ct - ey * st,
        y: o.y + ex * st + ey * ct,
        s,
        depth,
        c,
      });
    };
    for (const c of this.cursors) {
      const a = c.phase + t * c.speed;
      place(c, a);
      if (c.echo)
        for (let e = 1; e <= v.echoes; e++)
          place(c, a - Math.sign(c.speed || 1) * e * v.echoGap);
    }
    draws.sort((a, b) => a.depth - b.depth);

    ctx.imageSmoothingEnabled = false;
    for (const d of draws) {
      const img = this.spriteOf(d.c.kind, v);
      const w = Math.round(img.width * d.s);
      const h = Math.round(img.height * d.s);
      const x = Math.round(d.x);
      const y = Math.round(d.y);
      if (v.shadow > 0) {
        ctx.globalAlpha = v.shadow;
        const sh = this.spriteOf(d.c.kind, {
          ...v,
          fill: '#000',
          outline: '#000',
        });
        const off = Math.max(1, Math.round(d.s * 1.5));
        ctx.drawImage(sh, x + off, y + off, w, h);
        ctx.globalAlpha = 1;
      }
      ctx.drawImage(img, x, y, w, h);
    }
    ctx.imageSmoothingEnabled = true;
  }

  dispose() {
    this.source.dispose();
  }
}
