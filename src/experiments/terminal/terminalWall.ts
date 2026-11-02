// The terminal wall as a reusable renderer: the moving grid plus the panels in
// it, drawn into any 2D context. The terminal experiment draws it to the screen;
// the glass experiment draws it into a texture and stands a block on each window.

import { GridLayout, type Motion, type Window } from '../grid/gridLayout';
import { kindOf, makePanel, type Gfx, type Kind, type Panel } from './panels';
import type { TermValues } from './terminalControls';
import { hash } from './textFx';

function motionOf(v: TermValues): Motion {
  return {
    windows: v.windows,
    minSize: v.minSize,
    axisBias: 0.8,
    rate: v.gridRate,
    burst: v.burst,
    travel: 0.35,
    duration: v.duration,
    ease: 'expo',
    churn: v.churn,
    balance: v.balance,
  };
}

export type DrawnWindow = Window & { kind: Kind };

export class TerminalWall {
  private layout: GridLayout | null = null;
  private seeded = -1;
  private panels = new Map<number, Panel>();
  private glitches = new Map<
    number,
    { until: number; y: number; h: number; dx: number }
  >();
  private cwFor = '';
  private cw = 0;
  private clock = 0;
  private dt = 0;
  // The windows as drawn this frame, gutter already taken off.
  readonly windows: DrawnWindow[] = [];

  render(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    dt: number,
    v: TermValues,
  ) {
    const rect = { x: 0, y: 0, w: W, h: H };
    const motion = motionOf(v);
    if (this.seeded !== v.seed || !this.layout) {
      this.layout = new GridLayout(v.seed);
      this.layout.seed(rect, motion);
      this.panels.clear();
      this.seeded = v.seed;
    }
    const clock = (this.clock += dt);
    this.dt = dt;
    const wins = this.layout.step(clock, dt, rect, motion);

    const font = `${v.fontSize}px "Geist Mono", monospace`;
    ctx.font = font;
    ctx.textBaseline = 'top';
    if (this.cwFor !== font) {
      this.cw = ctx.measureText('0').width;
      this.cwFor = font;
    }
    const g: Gfx = {
      ctx,
      v,
      fs: v.fontSize,
      lh: v.fontSize * v.lineHeight,
      cw: this.cw,
      clock,
      tick: Math.floor(clock * 24),
    };

    ctx.fillStyle = v.background;
    ctx.fillRect(0, 0, W, H);

    this.windows.length = 0;
    const live = new Set<number>();
    for (const win of wins) {
      live.add(win.id);
      // Kinds follow the mix sliders live: a window whose kind changes gets a
      // new panel rather than a panel of the wrong shape.
      const kind = kindOf(win.id, v);
      let panel = this.panels.get(win.id);
      if (!panel || panel.kind !== kind) {
        panel = makePanel(win.id, kind);
        this.panels.set(win.id, panel);
      }
      panel.update(dt, g);

      const half = v.gap / 2;
      const x = win.x + half;
      const y = win.y + half;
      const w = win.w - v.gap;
      const h = win.h - v.gap;
      if (w < 2 || h < 2) continue;
      this.windows.push({ id: win.id, x, y, w, h, kind });
      this.drawWindow(g, panel, win.id, kind, x, y, w, h);
    }
    for (const id of this.panels.keys())
      if (!live.has(id)) this.panels.delete(id);
    for (const id of this.glitches.keys())
      if (!live.has(id)) this.glitches.delete(id);
  }

  private drawWindow(
    g: Gfx,
    panel: Panel,
    id: number,
    kind: Kind,
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    const { ctx, v, clock } = g;
    const c = Math.round(v.tone * 255);
    ctx.fillStyle = `rgb(${c},${c},${c})`;
    ctx.fillRect(x, y, w, h);
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

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    // A glitch shoves the panel sideways and inverts a band of it.
    let gl = this.glitches.get(id);
    if (!gl || clock > gl.until + 0.5) {
      if (Math.random() < this.dt * v.glitch) {
        gl = {
          until: clock + 0.05 + Math.random() * 0.12,
          y: Math.random(),
          h: 1 + Math.floor(Math.random() * 4),
          dx: (Math.random() - 0.5) * 3 * g.cw,
        };
        this.glitches.set(id, gl);
      }
    }
    const glitching = gl !== undefined && clock < gl.until;
    if (glitching) ctx.translate(Math.round(gl!.dx), 0);

    if (panel.bleed) panel.draw(g, { x, y, w, h });

    const p = v.pad;
    let inner = { x: x + p, y: y + p, w: w - p * 2, h: h - p * 2 };
    if (v.header && inner.h > g.lh * 2) {
      if (panel.bleed) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(x, y, w, p + g.lh + 3);
      }
      ctx.globalAlpha = v.dim;
      ctx.fillStyle = v.ink;
      const tag = `${kind.toUpperCase()} · ${id.toString(16).padStart(4, '0')}`;
      ctx.fillText(tag, inner.x, inner.y);
      // A status pip that blinks at the window's own rate.
      const on = Math.floor(clock * (1 + hash(id, 3) * 3)) % 2 === 0;
      if (on)
        ctx.fillRect(
          inner.x + inner.w - g.fs * 0.6,
          inner.y + g.fs * 0.2,
          g.fs * 0.6,
          g.fs * 0.6,
        );
      ctx.globalAlpha = 0.25;
      ctx.fillRect(inner.x, inner.y + g.lh, inner.w, 1);
      ctx.globalAlpha = 1;
      inner = { ...inner, y: inner.y + g.lh + 5, h: inner.h - g.lh - 5 };
    }
    if (!panel.bleed && inner.w > g.cw && inner.h > g.fs) panel.draw(g, inner);

    if (glitching) {
      ctx.globalCompositeOperation = 'difference';
      ctx.fillStyle = '#fff';
      ctx.fillRect(x - 10, y + gl!.y * h, w + 20, gl!.h * g.lh);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }
}
