// Live terminal panels in some of the grid's windows — the terminal
// experiment's own panels, so pace and content are tuned in one place (its
// store) and this only decides which windows run one and in what ink.

import { kindOf, makePanel, type Gfx, type Panel } from '../terminal/panels';
import {
  terminalControls,
  type TermValues,
} from '../terminal/terminalControls';
import { hash } from '../terminal/textFx';
import type { Rect } from './gridLayout';

export type TermLook = {
  fontSize: number;
  ink: string;
  accent: string;
  glitch: number;
};

export class TerminalWindows {
  private panels = new Map<number, Panel>();
  private seen = new Set<number>();
  private glitches = new Map<
    number,
    { until: number; y: number; dx: number }
  >();
  private cwFor = '';
  private cw = 0;

  // The experiment page follows the terminal experiment's live store; a layer
  // passes fixed values, so a saved artwork doesn't depend on that store.
  private readonly terminal: () => TermValues;
  constructor(terminal: () => TermValues = () => terminalControls.values) {
    this.terminal = terminal;
  }

  begin() {
    this.seen.clear();
  }

  draw(
    ctx: CanvasRenderingContext2D,
    id: number,
    r: Rect,
    clock: number,
    dt: number,
    look: TermLook,
  ) {
    // A window can be drawn twice in a frame where the strip wraps; it only
    // advances once.
    const fresh = !this.seen.has(id);
    this.seen.add(id);
    // The grid hangs its own images, so the terminal's image panel is left out.
    const v = {
      ...this.terminal(),
      fontSize: look.fontSize,
      ink: look.ink,
      accent: look.accent,
      wImage: 0,
    };
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

    const kind = kindOf(id, v);
    let panel = this.panels.get(id);
    if (!panel || panel.kind !== kind) {
      panel = makePanel(id, kind);
      this.panels.set(id, panel);
    }
    if (fresh) panel.update(dt, g);

    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();

    let gl = this.glitches.get(id);
    if ((!gl || clock > gl.until + 0.5) && Math.random() < dt * look.glitch) {
      gl = {
        until: clock + 0.05 + Math.random() * 0.12,
        y: Math.random(),
        dx: (Math.random() - 0.5) * 3 * g.cw,
      };
      this.glitches.set(id, gl);
    }
    const glitching = !!gl && clock < gl.until;
    if (glitching) ctx.translate(Math.round(gl!.dx), 0);

    const p = Math.min(v.pad, r.w / 6);
    let inner = { x: r.x + p, y: r.y + p, w: r.w - p * 2, h: r.h - p * 2 };
    if (inner.h > g.lh * 2.5) {
      ctx.globalAlpha = v.dim;
      ctx.fillStyle = v.ink;
      ctx.fillText(
        `${kind.toUpperCase()} · ${id.toString(16).padStart(4, '0')}`,
        inner.x,
        inner.y,
      );
      if (Math.floor(clock * (1 + hash(id, 3) * 3)) % 2 === 0)
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
    if (inner.w > g.cw && inner.h > g.fs) panel.draw(g, inner);

    if (glitching) {
      ctx.globalCompositeOperation = 'difference';
      ctx.fillStyle = '#fff';
      ctx.fillRect(r.x - 10, r.y + gl!.y * r.h, r.w + 20, 2 * g.lh);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }

  // Drop panels for windows that didn't draw this frame.
  end() {
    for (const id of this.panels.keys())
      if (!this.seen.has(id)) this.panels.delete(id);
    for (const id of this.glitches.keys())
      if (!this.seen.has(id)) this.glitches.delete(id);
  }
}
