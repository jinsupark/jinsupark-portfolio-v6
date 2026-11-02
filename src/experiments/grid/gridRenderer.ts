// The window grid as a renderer: draws one frame into any 2D context, in
// design units the caller has already scaled to. The experiment page drives it
// full-screen; the studio drives it as a layer.

import type { TermValues } from '../terminal/terminalControls';
import type { GridValues } from './gridControls';
import {
  GridLayout,
  type Ease,
  type Motion,
  type Rect,
  type Window,
} from './gridLayout';
import { ImageClusters, type Fx, type ImageLook } from './imageWindows';
import { TerminalWindows } from './terminalWindows';

// Per-window look, fixed by id so a window keeps its character as it moves.
function hash(n: number, salt: number) {
  let x = Math.imul(n ^ (salt * 0x9e3779b9), 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

function motionOf(v: GridValues, windows: number, rate: number): Motion {
  return {
    windows,
    minSize: v.minSize,
    axisBias: v.axisBias,
    rate,
    burst: v.burst,
    travel: v.travel,
    duration: v.duration,
    // The store only ever holds one of the select's options.
    ease: v.ease as Ease,
    churn: v.churn,
    balance: v.balance,
  };
}

function lookOf(v: GridValues): ImageLook {
  return {
    every: v.imageEvery,
    wipe: v.imageWipe,
    opacity: v.imageOpacity,
    caption: v.imageCaption,
    ink: v.plum,
    paper: v.pink,
    ditherRes: v.ditherRes,
    pixelRes: v.pixelRes,
  };
}

// A window's treatment is fixed by its id, so a slice keeps its look as the
// cluster reshapes around it.
function fxOf(id: number, v: GridValues): Fx {
  if (hash(id, 12) >= v.treated) return 'plain';
  const table: [Fx, number][] = [
    ['dither', v.fxDither],
    ['difference', v.fxDifference],
    ['invert', v.fxInvert],
    ['pixel', v.fxPixel],
    ['mono', v.fxMono],
    ['shift', v.fxShift],
  ];
  const total = table.reduce((s, [, w]) => s + w, 0);
  if (total <= 0) return 'plain';
  let r = hash(id, 13) * total;
  for (const [fx, w] of table) if ((r -= w) < 0) return fx;
  return 'plain';
}

type Hung = {
  slot: NonNullable<ReturnType<ImageClusters['update']>>;
  rect: Rect;
};

function drawWindows(
  ctx: CanvasRenderingContext2D,
  wins: Window[],
  v: GridValues,
  ghost: boolean,
  images?: { slots: ImageClusters; hung: Map<number, Hung>; look: ImageLook },
  live?: { terms: TerminalWindows; clock: number; dt: number },
  // Where this copy of the strip sits, and the screen width to cull against.
  view = { dx: 0, W: Infinity },
) {
  const g = v.gap / 2;
  const { dx } = view;
  for (const win of wins) {
    if (win.x + dx > view.W || win.x + win.w + dx < 0) continue;
    const x = win.x + g + dx;
    const y = win.y + g;
    const w = win.w - v.gap;
    const h = win.h - v.gap;
    if (w < 1 || h < 1) continue;

    const k = hash(win.id, ghost ? 7 : 1);
    const isVoid = !ghost && k < v.voidShare;
    const isFrame = k >= v.voidShare && k < v.voidShare + v.frameShare;
    const tone = isVoid
      ? 0.03
      : v.toneMin + (v.toneMax - v.toneMin) * hash(win.id, ghost ? 8 : 2);
    const c = Math.round(tone * 255);
    const p = hash(win.id, 4);
    const paint =
      ghost || isVoid || isFrame
        ? null
        : p < v.pinkShare
          ? 'pink'
          : p < v.pinkShare + v.plumShare
            ? 'plum'
            : null;

    const h0 = images?.hung.get(win.id);
    const hung = h0 && { ...h0, rect: { ...h0.rect, x: h0.rect.x + dx } };
    const isTerm =
      !!live && !hung && hash(win.id, 14) < v.termShare && w > 40 && h > 30;

    if (ghost) ctx.globalAlpha = v.ghostAlpha * (0.5 + hash(win.id, 9));
    if (!isFrame || isTerm) {
      ctx.fillStyle = ghost
        ? 'rgb(225,225,225)'
        : paint === 'pink'
          ? v.pink
          : paint === 'plum'
            ? v.plum
            : isTerm
              ? v.termBg
              : `rgb(${c},${c},${c})`;
      ctx.fillRect(x, y, w, h);
    }
    if (hung)
      images!.slots.drawSlice(
        ctx,
        hung.slot,
        hung.rect,
        { x, y, w, h },
        fxOf(win.id, v),
        images!.look,
      );
    const isImage = !!hung;
    if (v.border > 0) {
      ctx.strokeStyle = `rgba(255,255,255,${v.border})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(
        Math.round(x) + 0.5,
        Math.round(y) + 0.5,
        Math.round(w) - 1,
        Math.round(h) - 1,
      );
    }
    if (ghost) {
      ctx.globalAlpha = 1;
      continue;
    }

    if (isImage) continue;
    if (isTerm) {
      const termInk =
        paint === 'pink' ? v.plum : paint === 'plum' ? v.pink : v.termInk;
      live!.terms.draw(ctx, win.id, { x, y, w, h }, live!.clock, live!.dt, {
        fontSize: v.termFont,
        ink: termInk,
        accent: termInk,
        glitch: v.termGlitch,
      });
      continue;
    }
    ctx.font = '9px "Geist Mono", monospace';
    ctx.textBaseline = 'top';
    const ink =
      paint === 'pink'
        ? v.plum
        : paint === 'plum'
          ? v.pink
          : tone > 0.5 && !isFrame
            ? 'rgba(0,0,0,0.65)'
            : 'rgba(255,255,255,0.6)';
    if (v.labels && w > 64 && h > 34) {
      ctx.fillStyle = ink;
      ctx.fillText(`0x${win.id.toString(16).padStart(4, '0')}`, x + 7, y + 7);
      ctx.fillText(`${Math.round(w)}×${Math.round(h)}`, x + 7, y + 19);
    }
    if (v.crosshairs && w > 28 && h > 28) {
      const cx = Math.round(x + w / 2) + 0.5;
      const cy = Math.round(y + h / 2) + 0.5;
      ctx.strokeStyle = ink;
      ctx.beginPath();
      ctx.moveTo(cx - 4, cy);
      ctx.lineTo(cx + 5, cy);
      ctx.moveTo(cx, cy - 4);
      ctx.lineTo(cx, cy + 5);
      ctx.stroke();
    }
  }
}

export class GridRenderer {
  private main: GridLayout | null = null;
  private ghost: GridLayout | null = null;
  private images = new ImageClusters();
  private terms: TerminalWindows;
  private seeded = -1;
  private size = '';
  private clock = 0;
  private pan = 0;

  // `terminal` supplies the pace and vocabulary for the terminal windows.
  constructor(terminal?: () => TermValues) {
    this.terms = new TerminalWindows(terminal);
  }

  render(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    wallDt: number,
    v: GridValues,
  ) {
    // The layout is a strip `tileSpan` screens wide, repeated end to end and
    // scrolled left; the window counts scale with it so sizes don't change.
    const span = v.tileSpan;
    const TW = W * span;
    const rect = { x: 0, y: 0, w: TW, h: H };
    const mainMotion = motionOf(v, Math.round(v.windows * span), v.rate * span);
    const ghostMotion = motionOf(
      v,
      Math.round(v.ghostWindows * span),
      v.rate * 0.4 * span,
    );

    const size = `${Math.round(W)}x${Math.round(H)}`;
    if (
      this.seeded !== v.seed ||
      this.size !== size ||
      !this.main ||
      !this.ghost
    ) {
      this.main = new GridLayout(v.seed);
      this.main.seed(rect, mainMotion);
      this.ghost = new GridLayout(v.seed + 101);
      this.ghost.seed(rect, ghostMotion);
      this.seeded = v.seed;
      this.size = size;
    }
    const { main, ghost, images, terms } = this;

    // Its own clock, so pausing or slowing time doesn't make cuts jump to
    // where wall-clock time says they should have got to.
    const dt = v.paused ? 0 : Math.min(wallDt, 0.1) * v.speed;
    const clock = (this.clock += dt);
    this.pan += dt * v.panSpeed;
    const pan = this.pan;
    const copies = (offset: number) => {
      const o = ((offset % TW) + TW) % TW;
      return [-o, TW - o];
    };

    const wins = main.step(clock, dt, rect, mainMotion);
    const ghosts = ghost.step(clock, dt, rect, ghostMotion);

    ctx.fillStyle = v.background;
    ctx.fillRect(0, 0, W, H);
    const look = lookOf(v);
    const hung = new Map<number, Hung>();
    const shown: Hung[] = [];
    images.begin();
    const clusters = main.clusters(
      (id, n) =>
        n >= v.clusterMin && n <= v.clusterMax && hash(id, 11) < v.clusterShare,
    );
    for (const c of clusters) {
      const slot = images.update(c.id, clock, look);
      if (!slot) continue;
      const h = { slot, rect: c.rect };
      shown.push(h);
      for (const leaf of c.leaves) hung.set(leaf, h);
    }
    images.end();

    terms.begin();
    for (const dx of copies(pan)) {
      drawWindows(
        ctx,
        wins,
        v,
        false,
        { slots: images, hung, look },
        { terms, clock, dt },
        { dx, W },
      );
      if (v.imageCaption)
        for (const h of shown)
          if (h.rect.x + dx < W && h.rect.x + h.rect.w + dx > 0)
            images.caption(ctx, h.slot, { ...h.rect, x: h.rect.x + dx });
    }
    terms.end();
    if (v.ghostAlpha > 0)
      for (const dx of copies(pan * v.ghostPan))
        drawWindows(ctx, ghosts, v, true, undefined, undefined, { dx, W });
  }
}
