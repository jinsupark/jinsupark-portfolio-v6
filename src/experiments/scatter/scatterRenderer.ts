// Old-OS windows scattered over one picture, each showing its own displaced,
// zoomed fragment of it, drifting to new spots, resizing, and now and then
// closing while another opens. The fragments are the picture redrawn with a
// per-window transform, so a window reads as a misaligned piece of the same
// image rather than a different one.
import { PictureSource, drawCover } from '@/lab/pictureSource';
import { seededRng } from '@/lab/random';
import type { ScatterValues } from './scatterControls';

type Ctx = CanvasRenderingContext2D;
// Rects are fractions of the canvas, so a resize keeps the composition.
type R = { x: number; y: number; w: number; h: number };
type Look = { zoom: number; ox: number; oy: number };

type Win = {
  id: number;
  kind: 'titled' | 'bare' | 'marquee';
  line: number | null; // drop-line x as a share of width
  from: R;
  to: R;
  lookFrom: Look;
  lookTo: Look;
  t0: number;
  dur: number;
  next: number;
  born: number;
  dying: number | null;
};

const ease = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const POP = 0.22;

export class ScatterRenderer {
  private wins: Win[] = [];
  private rng = seededRng(1);
  private seeded = -1;
  private count = -1;
  private clock = 0;
  private nextId = 0;
  private source = new PictureSource();

  private spawn(v: ScatterValues, at: number, born: number): Win {
    const r = this.rng;
    const w = mix(v.minW, Math.max(v.minW, v.maxW), r());
    const h = mix(v.minH, Math.max(v.minH, v.maxH), r());
    const rect = {
      x: -0.04 + r() * (1.08 - w),
      y: -0.04 + r() * (1.08 - h),
      w,
      h,
    };
    const look = this.lookOf(v);
    const k = r();
    return {
      id: this.nextId++,
      kind:
        k < v.titled ? 'titled' : k < v.titled + v.marquee ? 'marquee' : 'bare',
      line: r() < v.lines ? 0.1 + r() * 0.8 : null,
      from: rect,
      to: rect,
      lookFrom: look,
      lookTo: look,
      t0: at,
      dur: 0.001,
      next: at + r() * v.hold,
      born,
      dying: null,
    };
  }

  private lookOf(v: ScatterValues): Look {
    const r = this.rng;
    return {
      zoom: mix(v.zoomMin, Math.max(v.zoomMin, v.zoomMax), r()),
      ox: (r() - 0.5) * 2 * v.offset,
      oy: (r() - 0.5) * 2 * v.offset,
    };
  }

  private rectAt(w: Win, t: number): R {
    const k = ease(Math.min(1, Math.max(0, (t - w.t0) / w.dur)));
    return {
      x: mix(w.from.x, w.to.x, k),
      y: mix(w.from.y, w.to.y, k),
      w: mix(w.from.w, w.to.w, k),
      h: mix(w.from.h, w.to.h, k),
    };
  }
  private lookAt(w: Win, t: number): Look {
    const k = ease(Math.min(1, Math.max(0, (t - w.t0) / w.dur)));
    return {
      zoom: mix(w.lookFrom.zoom, w.lookTo.zoom, k),
      ox: mix(w.lookFrom.ox, w.lookTo.ox, k),
      oy: mix(w.lookFrom.oy, w.lookTo.oy, k),
    };
  }

  private step(v: ScatterValues, t: number, dt: number) {
    const r = this.rng;
    const n = Math.round(v.windows);
    if (this.seeded !== v.seed || this.count !== n) {
      if (this.seeded !== v.seed) {
        this.rng = seededRng(v.seed * 613 + 1);
        this.wins = [];
      }
      this.seeded = v.seed;
      this.count = n;
    }
    // The first fill is already on screen; windows added later pop in.
    const first = this.wins.length === 0;
    while (this.wins.filter((w) => w.dying === null).length < n)
      this.wins.push(this.spawn(v, t, first ? -1 : t));
    while (this.wins.filter((w) => w.dying === null).length > n) {
      const w = this.wins.find((x) => x.dying === null)!;
      w.dying = t;
    }

    // Churn: one window closes and another opens somewhere else.
    if (dt > 0 && r() < v.churn * dt) {
      const live = this.wins.filter((w) => w.dying === null);
      if (live.length) {
        live[Math.floor(r() * live.length)].dying = t;
        this.wins.push(this.spawn(v, t, t));
      }
    }
    this.wins = this.wins.filter((w) => w.dying === null || t - w.dying < POP);

    for (const w of this.wins) {
      if (w.dying !== null || t < w.next) continue;
      const cur = this.rectAt(w, t);
      const resize = r() < v.resize;
      const nw = resize ? mix(v.minW, Math.max(v.minW, v.maxW), r()) : cur.w;
      const nh = resize ? mix(v.minH, Math.max(v.minH, v.maxH), r()) : cur.h;
      const clamp = (p: number, s: number) =>
        Math.min(1.04 - s, Math.max(-0.04, p));
      w.from = cur;
      w.to = {
        x: clamp(cur.x + (r() - 0.5) * 2 * v.travel, nw),
        y: clamp(cur.y + (r() - 0.5) * 2 * v.travel, nh),
        w: nw,
        h: nh,
      };
      w.lookFrom = this.lookAt(w, t);
      w.lookTo = this.lookOf(v);
      w.t0 = t;
      w.dur = v.duration * (0.6 + r() * 0.8);
      w.next = t + w.dur + v.hold * (0.4 + r() * 1.2);
      if (r() < v.raise) {
        this.wins = this.wins.filter((x) => x !== w);
        this.wins.push(w);
      }
    }
  }

  render(ctx: Ctx, W: number, H: number, wallDt: number, v: ScatterValues) {
    const dt = v.paused ? 0 : Math.min(wallDt, 0.1) * v.speed;
    const t = (this.clock += dt);
    this.step(v, t, dt);
    const src = this.source.get(v.source, v.seed);

    ctx.fillStyle = v.ground;
    ctx.fillRect(0, 0, W, H);
    if (src && v.base) {
      drawCover(ctx, src, 0, 0, W, H);
      if (v.baseDim > 0) {
        ctx.fillStyle = `rgba(0,0,0,${v.baseDim})`;
        ctx.fillRect(0, 0, W, H);
      }
    }

    // Drop lines first, so windows sit over them.
    ctx.fillStyle = v.frame;
    for (const w of this.wins) {
      if (w.line === null) continue;
      const r = this.rectAt(w, t);
      const x = (r.x + r.w * w.line) * W;
      const y = (r.y + r.h) * H;
      ctx.fillRect(Math.round(x), y, Math.max(1, v.frameW), r.h * H * 0.9);
    }

    for (const w of this.wins) {
      const r = this.rectAt(w, t);
      const life = w.born < 0 ? 1 : Math.min(1, (t - w.born) / POP);
      const death = w.dying === null ? 1 : 1 - (t - w.dying) / POP;
      const pop = ease(Math.max(0, Math.min(life, death)));
      if (pop <= 0) continue;
      const cx = (r.x + r.w / 2) * W;
      const cy = (r.y + r.h / 2) * H;
      const ww = r.w * W * (0.85 + 0.15 * pop);
      const wh = r.h * H * (0.85 + 0.15 * pop);
      const x = Math.round(cx - ww / 2);
      const y = Math.round(cy - wh / 2);
      ctx.globalAlpha = pop;
      this.drawWindow(
        ctx,
        w,
        x,
        y,
        Math.round(ww),
        Math.round(wh),
        W,
        H,
        t,
        src,
        v,
      );
      ctx.globalAlpha = 1;
    }
  }

  private drawWindow(
    ctx: Ctx,
    w: Win,
    x: number,
    y: number,
    ww: number,
    wh: number,
    W: number,
    H: number,
    t: number,
    src: ReturnType<PictureSource['get']>,
    v: ScatterValues,
  ) {
    const bar = w.kind === 'titled' ? Math.min(v.barH, wh * 0.4) : 0;
    const look = this.lookAt(w, t);
    const cy0 = y + bar;
    const ch = wh - bar;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, cy0, ww, ch);
    ctx.clip();
    if (src) {
      // The picture, zoomed about the window's centre and shifted.
      const cx = x + ww / 2;
      const cy = cy0 + ch / 2;
      ctx.translate(cx, cy);
      ctx.scale(look.zoom, look.zoom);
      ctx.translate(-cx + look.ox * W, -cy + look.oy * H);
      drawCover(ctx, src, 0, 0, W, H);
    } else {
      ctx.fillStyle = v.barBottom;
      ctx.fillRect(x, cy0, ww, ch);
    }
    ctx.restore();

    if (w.kind === 'marquee') {
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.lineDashOffset = -t * 18;
      ctx.strokeStyle = '#000';
      ctx.strokeRect(x + 0.75, y + 0.75, ww - 1.5, wh - 1.5);
      ctx.lineDashOffset = -t * 18 + 5;
      ctx.strokeStyle = '#fff';
      ctx.setLineDash([4, 6]);
      ctx.strokeRect(x + 0.75, y + 0.75, ww - 1.5, wh - 1.5);
      ctx.setLineDash([]);
      return;
    }

    if (v.frameW > 0) {
      ctx.strokeStyle = v.frame;
      ctx.lineWidth = v.frameW;
      ctx.strokeRect(
        x + v.frameW / 2,
        y + v.frameW / 2,
        ww - v.frameW,
        wh - v.frameW,
      );
    }
    if (!bar) return;
    const g = ctx.createLinearGradient(0, y, 0, y + bar);
    g.addColorStop(0, v.barTop);
    g.addColorStop(1, v.barBottom);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, ww, bar);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(x, y, ww, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x, y + bar - 1, ww, 1);

    const box = Math.round(bar * 0.62);
    const bx = x + ww - box - Math.round((bar - box) / 2) - 2;
    const by = y + Math.round((bar - box) / 2);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, bx - x - 2, bar);
    ctx.clip();
    ctx.fillStyle = v.ink;
    ctx.font = `${v.font}px "Geist Mono", monospace`;
    ctx.textBaseline = 'middle';
    ctx.fillText(
      `${v.title}#${58000 + ((w.id * 7919 + v.seed * 31) % 1000)}`,
      x + 7,
      y + bar / 2 + 0.5,
    );
    ctx.restore();
    if (ww > box * 3) {
      ctx.fillStyle = v.barTop;
      ctx.fillRect(bx, by, box, box);
      ctx.strokeStyle = v.ink;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, by + 0.5, box - 1, box - 1);
      const p = box * 0.28;
      ctx.beginPath();
      ctx.moveTo(bx + p, by + p);
      ctx.lineTo(bx + box - p, by + box - p);
      ctx.moveTo(bx + box - p, by + p);
      ctx.lineTo(bx + p, by + box - p);
      ctx.stroke();
    }
  }

  dispose() {
    this.source.dispose();
  }
}
