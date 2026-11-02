// The blueprint as a renderer: draws one frame into any 2D context, in design
// units the caller has already scaled to. The experiment page drives it
// full-screen; the studio drives it as a layer.

import { DemoVideos } from '@/lab/demoVideo';
import { seededRng } from '@/lab/random';
import {
  GridLayout,
  type Cut,
  type Motion,
  type Rect,
  type Window,
} from '../grid/gridLayout';
import { ImageClusters, type ImageLook } from '../grid/imageWindows';
import { hash, scrambled } from '../terminal/textFx';
import type { BlueprintValues } from './blueprintControls';
import { markText } from './marks';

// The window grid redrawn as a document rather than a terminal: paper tones,
// hairlines that overrun their junctions, small print pinned to the vertices,
// and very few pictures, so the ones there are carry the page.

function motionOf(v: BlueprintValues, windows: number, rate: number): Motion {
  return {
    windows,
    minSize: v.minSize,
    axisBias: v.axisBias,
    rate,
    burst: 1,
    travel: v.travel,
    duration: v.duration,
    ease: 'quart',
    churn: v.churn,
    balance: v.balance,
  };
}

function lookOf(v: BlueprintValues, every: number): ImageLook {
  return {
    every,
    wipe: v.imageWipe,
    opacity: 1,
    caption: false,
    ink: v.ink,
    paper: v.toneLight,
    ditherRes: 200,
    pixelRes: 40,
  };
}

// Paper: fine per-pixel grain plus a soft large-scale mottle, both multiplied
// over everything so the whole sheet reads as one scanned print.
function makeGrain() {
  const fine = document.createElement('canvas');
  fine.width = fine.height = 256;
  const g = fine.getContext('2d')!;
  const d = g.createImageData(256, 256);
  for (let i = 0; i < d.data.length; i += 4) {
    const n = 175 + Math.random() * 80;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = n;
    d.data[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  g.fillStyle = 'rgba(0,0,0,0.5)';
  for (let i = 0; i < 40; i++)
    g.fillRect(Math.random() * 256, Math.random() * 256, 1, 1);

  const mottle = document.createElement('canvas');
  mottle.width = mottle.height = 24;
  const m = mottle.getContext('2d')!;
  const md = m.createImageData(24, 24);
  for (let i = 0; i < md.data.length; i += 4) {
    const n = 215 + Math.random() * 40;
    md.data[i] = md.data[i + 1] = md.data[i + 2] = n;
    md.data[i + 3] = 255;
  }
  m.putImageData(md, 0, 0);
  return { fine, mottle };
}

type Ctx = CanvasRenderingContext2D;
type Paint = (r: Rect) => void;

function coverVideo(ctx: Ctx, vid: HTMLVideoElement, r: Rect) {
  const s = Math.max(r.w / vid.videoWidth, r.h / vid.videoHeight);
  const w = vid.videoWidth * s;
  const h = vid.videoHeight * s;
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  ctx.drawImage(vid, r.x + (r.w - w) / 2, r.y + (r.h - h) / 2, w, h);
  ctx.restore();
}

function fillOf(id: number, v: BlueprintValues) {
  const k = hash(id, 1);
  if (k < v.emptyShare) return null;
  if (k < v.emptyShare + v.darkShare) return v.toneDark;
  if (k < v.emptyShare + v.darkShare + v.deepShare) return v.toneDeep;
  return hash(id, 2) < 0.5 ? v.toneLight : v.toneMid;
}

function icon(ctx: Ctx, x: number, y: number, kind: number, ink: string) {
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = 1;
  const X = Math.round(x) + 0.5;
  const Y = Math.round(y) + 0.5;
  if (kind === 0) {
    ctx.strokeRect(X, Y, 7, 7);
    ctx.fillRect(X + 1.5, Y + 1.5, 4, 4);
  } else if (kind === 1) {
    ctx.fillRect(X - 0.5, Y - 0.5, 5, 5);
  } else if (kind === 2) {
    ctx.strokeRect(X, Y, 9, 7);
    ctx.fillRect(X + 2, Y + 2, 5, 1);
    ctx.fillRect(X + 2, Y + 4, 3, 1);
  } else {
    ctx.strokeRect(X, Y, 7, 7);
    ctx.beginPath();
    ctx.moveTo(X, Y);
    ctx.lineTo(X + 7, Y + 7);
    ctx.stroke();
  }
}

// A rewritable text block: each mark rewrites itself on its own period, and
// decodes through a short scramble when it does.
function block(id: number, clock: number, v: BlueprintValues) {
  const period = v.retextEvery * (0.7 + hash(id, 22) * 0.6);
  const phase = hash(id, 23) * period;
  const epoch = Math.floor((clock + phase) / period);
  const p = (clock + phase - epoch * period) / 0.6;
  const lines = markText(seededRng(Math.floor(hash(id, 24, epoch) * 2 ** 32)));
  const tick = Math.floor(clock * 20);
  return lines.map((l, i) => scrambled(l, p, id * 7 + i, tick));
}

function text(
  ctx: Ctx,
  lines: string[],
  x: number,
  y: number,
  dirX: number,
  dirY: number,
  v: BlueprintValues,
) {
  const lh = v.textSize * 1.3;
  ctx.font = `${v.textSize}px "Geist Mono", monospace`;
  ctx.textBaseline = 'top';
  ctx.textAlign = dirX > 0 ? 'left' : 'right';
  ctx.fillStyle = v.ink;
  ctx.globalAlpha = v.textAlpha;
  const top = dirY > 0 ? y : y - lines.length * lh;
  lines.forEach((l, i) => ctx.fillText(l, x, top + i * lh));
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

function drawInset(
  ctx: Ctx,
  win: Window,
  dx: number,
  clock: number,
  v: BlueprintValues,
) {
  const { id } = win;
  if (hash(id, 30) >= v.insetShare || win.w < 150 || win.h < 110) return;
  const iw = win.w * (0.42 + 0.3 * hash(id, 32));
  const ih = win.h * (0.32 + 0.3 * hash(id, 33));
  const corner = Math.floor(hash(id, 31) * 4);
  const x = win.x + dx + (corner & 1 ? win.w - iw : 0);
  const y = win.y + (corner & 2 ? win.h - ih : 0);
  ctx.fillStyle = v.toneLight;
  ctx.fillRect(x, y, iw, ih);
  ctx.globalAlpha = v.lineAlpha * 0.8;
  ctx.strokeStyle = v.ink;
  ctx.lineWidth = 1;
  ctx.strokeRect(
    Math.round(x) + 0.5,
    Math.round(y) + 0.5,
    Math.round(iw) - 1,
    Math.round(ih) - 1,
  );
  ctx.globalAlpha = 1;
  icon(ctx, x + 5, y + 5, Math.floor(hash(id, 34) * 4), v.ink);
  text(ctx, block(id * 3 + 1, clock, v), x + 16, y + 5, 1, 1, v);
}

function drawLines(
  ctx: Ctx,
  cuts: Cut[],
  dx: number,
  TW: number,
  H: number,
  v: BlueprintValues,
) {
  ctx.strokeStyle = v.ink;
  ctx.globalAlpha = v.lineAlpha;
  ctx.lineWidth = v.lineWidth;
  ctx.beginPath();
  for (const c of cuts) {
    const long = hash(c.id, 7) < v.longShare;
    const e0 = long ? Infinity : v.overshoot * hash(c.id, 5) ** 2;
    const e1 = long ? Infinity : v.overshoot * hash(c.id, 6) ** 2;
    const snap = (n: number) => Math.round(n) + (v.lineWidth % 2 ? 0.5 : 0);
    if (c.axis === 'x') {
      const x = snap(c.x0 + dx);
      ctx.moveTo(x, Math.max(0, c.y0 - e0));
      ctx.lineTo(x, Math.min(H, c.y1 + e1));
    } else {
      const y = snap(c.y0);
      ctx.moveTo(Math.max(0, c.x0 - e0) + dx, y);
      ctx.lineTo(Math.min(TW, c.x1 + e1) + dx, y);
    }
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// Marks sit at the cut's two ends, tucked into one of the quadrants beside it.
function drawMarks(
  ctx: Ctx,
  cuts: Cut[],
  dx: number,
  W: number,
  clock: number,
  v: BlueprintValues,
) {
  for (const c of cuts) {
    for (let end = 0; end < 2; end++) {
      const id = c.id * 2 + end;
      if (hash(id, 20) >= v.markShare) continue;
      const px = (end ? c.x1 : c.x0) + dx;
      const py = end ? c.y1 : c.y0;
      if (px < -200 || px > W + 200) continue;
      const side = hash(id, 25) < 0.5 ? 1 : -1;
      const inward = end ? -1 : 1;
      const dirX = c.axis === 'x' ? side : inward;
      const dirY = c.axis === 'x' ? inward : side;

      const k = hash(id, 21) * (v.textShare + v.iconShare + v.barShare);
      if (k < v.textShare) {
        text(
          ctx,
          block(id, clock, v),
          px + dirX * 4,
          py + dirY * 4,
          dirX,
          dirY,
          v,
        );
      } else if (k < v.textShare + v.iconShare) {
        const s = 8;
        icon(
          ctx,
          px + (dirX > 0 ? 4 : -4 - s),
          py + (dirY > 0 ? 4 : -4 - s),
          Math.floor(hash(id, 26) * 4),
          v.ink,
        );
      } else {
        const len = 12 + hash(id, 27) * 48;
        const th = 3 + Math.floor(hash(id, 28) * 4);
        ctx.fillStyle = v.ink;
        ctx.fillRect(
          dirX > 0 ? px : px - len,
          dirY > 0 ? py : py - th,
          len,
          th,
        );
      }
    }
  }
}

function drawRuler(ctx: Ctx, H: number, v: BlueprintValues) {
  const x = 3;
  const w = 11;
  ctx.fillStyle = v.toneLight;
  ctx.fillRect(x, 0, w, H);
  ctx.strokeStyle = v.ink;
  ctx.fillStyle = v.ink;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.8;
  for (let i = 0, y = 22; y < H; i++, y += 11) {
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 10);
    const k = hash(i, 40);
    if (k < 0.45) ctx.fillRect(x + 3, y + 3, 5, 5);
    else if (k < 0.75) ctx.strokeRect(x + 3.5, y + 3.5, 4, 4);
  }
  ctx.fillStyle = v.toneLight;
  ctx.fillRect(x, 3, 56, 13);
  ctx.strokeRect(x + 0.5, 3.5, 56, 13);
  ctx.fillStyle = v.ink;
  ctx.fillRect(x + 3, 6, 7, 7);
  ctx.font = 'bold 9px "Geist Mono", monospace';
  ctx.textBaseline = 'top';
  ctx.fillText('1880', x + 14, 5);
  ctx.globalAlpha = 1;
}

export class BlueprintRenderer {
  private grain = makeGrain();
  private pattern: { ctx: Ctx; p: CanvasPattern } | null = null;
  private regions = new ImageClusters();
  private heroes = new ImageClusters();
  private videos = new DemoVideos();
  private layout: GridLayout | null = null;
  private seeded = -1;
  private size = '';
  private clock = 0;
  private pan = 0;

  private patternFor(ctx: Ctx) {
    if (this.pattern?.ctx !== ctx)
      this.pattern = { ctx, p: ctx.createPattern(this.grain.fine, 'repeat')! };
    return this.pattern.p;
  }

  render(ctx: Ctx, W: number, H: number, wallDt: number, v: BlueprintValues) {
    const { regions, heroes, videos, grain } = this;
    // Same strip as the window grid: `tileSpan` screens wide, repeated end
    // to end and scrolled.
    const span = v.tileSpan;
    const TW = W * span;
    const rect = { x: 0, y: 0, w: TW, h: H };
    const motion = motionOf(v, Math.round(v.windows * span), v.rate * span);
    const size = `${Math.round(W)}x${Math.round(H)}`;
    if (this.seeded !== v.seed || this.size !== size || !this.layout) {
      this.layout = new GridLayout(v.seed);
      this.layout.seed(rect, motion);
      this.seeded = v.seed;
      this.size = size;
    }
    const layout = this.layout;
    const dt = v.paused ? 0 : Math.min(wallDt, 0.1) * v.speed;
    const clock = (this.clock += dt);
    this.pan += dt * v.panSpeed;
    const o = ((this.pan % TW) + TW) % TW;
    const copies = [-o, TW - o];

    const wins = layout.step(clock, dt, rect, motion);
    const cuts = layout.cuts();

    // Reserved imagery: only the largest few accepted regions get a picture.
    regions.begin();
    const picked = layout
      .clusters(
        (id, n) =>
          n >= v.clusterMin && n <= v.clusterMax && hash(id, 11) < v.imageShare,
      )
      .sort((a, b) => b.rect.w * b.rect.h - a.rect.w * a.rect.h)
      .slice(0, v.maxImages);
    const regionLook = lookOf(v, v.imageEvery);
    const shown: { rect: Rect; paint: Paint }[] = [];
    picked.forEach((c, k) => {
      if (v.useVideo) {
        const vid = videos.get(1 + k);
        if (DemoVideos.ready(vid))
          shown.push({ rect: c.rect, paint: (r) => coverVideo(ctx, vid, r) });
        return;
      }
      const slot = regions.update(c.id, clock, regionLook);
      if (slot)
        shown.push({
          rect: c.rect,
          paint: (r) => regions.drawSlice(ctx, slot, r, r, 'plain', regionLook),
        });
    });
    regions.end();

    heroes.begin();
    const heroLook = lookOf(v, v.heroEvery);
    let heroPaint: Paint | null = null;
    if (v.hero && v.useVideo) {
      const vid = videos.get(0);
      if (DemoVideos.ready(vid)) heroPaint = (r) => coverVideo(ctx, vid, r);
    } else if (v.hero) {
      const slot = heroes.update(1, clock, heroLook);
      if (slot)
        heroPaint = (r) => heroes.drawSlice(ctx, slot, r, r, 'plain', heroLook);
    }
    heroes.end();
    const hs = v.heroSize * H;
    const heroRect = {
      x: v.heroX * W - hs * 0.55,
      y: v.heroY * H - hs * 0.5,
      w: hs * 1.1,
      h: hs,
    };

    ctx.fillStyle = v.ground;
    ctx.fillRect(0, 0, W, H);

    const drawHero = (dx: number) => {
      if (!heroPaint) return;
      const r = { ...heroRect, x: heroRect.x + dx };
      if (r.x > W || r.x + r.w < 0) return;
      heroPaint(r);
      if (v.heroBorderW > 0) {
        ctx.strokeStyle = v.heroBorder;
        ctx.lineWidth = v.heroBorderW;
        const b = v.heroBorderW / 2;
        ctx.strokeRect(r.x + b, r.y + b, r.w - b * 2, r.h - b * 2);
      }
    };

    for (const dx of copies) {
      for (const win of wins) {
        if (win.x + dx > W || win.x + win.w + dx < 0) continue;
        const fill = fillOf(win.id, v);
        if (!fill) continue;
        ctx.fillStyle = fill;
        ctx.fillRect(win.x + dx, win.y, win.w, win.h);
      }
      for (const s of shown) {
        const r = { ...s.rect, x: s.rect.x + dx };
        if (r.x > W || r.x + r.w < 0) continue;
        s.paint(r);
      }
      for (const win of wins) {
        if (win.x + dx > W || win.x + win.w + dx < 0) continue;
        drawInset(ctx, win, dx, clock, v);
      }
      if (!v.linesOverHero) drawHero(dx);
      drawLines(ctx, cuts, dx, TW, H, v);
      if (v.linesOverHero) drawHero(dx);
      drawMarks(ctx, cuts, dx, W, clock, v);
    }
    // With lines crossing the hero, they're drawn again over it, lighter,
    // so the picture sits in the drawing rather than on top of it.
    if (v.linesOverHero && heroPaint)
      for (const dx of copies) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(heroRect.x + dx, heroRect.y, heroRect.w, heroRect.h);
        ctx.clip();
        drawLines(ctx, cuts, dx, TW, H, { ...v, lineAlpha: v.lineAlpha * 0.7 });
        ctx.restore();
      }

    if (v.ruler) drawRuler(ctx, H, v);

    if (v.grain > 0) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = Math.min(1, v.grain * 3);
      ctx.fillStyle = this.patternFor(ctx);
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = Math.min(1, v.grain * 4);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(grain.mottle, 0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  dispose() {
    this.videos.dispose();
  }
}
