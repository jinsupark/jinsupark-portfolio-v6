// What fills a window. Every panel is laid out from its rect on every frame —
// rows and columns are counted, never stored — because the grid resizes windows
// continuously and a panel that cached its layout would be wrong mid-move.
// State that must survive a resize (log history, hex offset, field values) lives
// on the panel; everything positional is derived.

import { seededRng } from '@/lab/random';
import type { Rect } from '../grid/gridLayout';
import { ART_PROJECTS, loadShot, type Loaded } from './imagePool';
import type { TermValues } from './terminalControls';
import {
  BAR_LABELS,
  BIG_WORDS,
  PROJECTS,
  READOUT_FIELDS,
  SPEC_LINES,
  hash,
  hex,
  int,
  logLine,
  pick,
  scrambled,
  stamp,
  type Level,
  type Rng,
} from './textFx';

export type Gfx = {
  ctx: CanvasRenderingContext2D;
  v: TermValues;
  fs: number; // font px
  lh: number; // line px
  cw: number; // char px
  clock: number;
  tick: number; // glyph clock for scrambles
};

export const KINDS = [
  'log',
  'hex',
  'readout',
  'big',
  'bars',
  'spec',
  'image',
] as const;
export type Kind = (typeof KINDS)[number];

function text(
  g: Gfx,
  s: string,
  x: number,
  y: number,
  alpha = 1,
  fill?: string,
) {
  g.ctx.globalAlpha = alpha;
  g.ctx.fillStyle = fill ?? g.v.ink;
  g.ctx.fillText(s, x, y);
  g.ctx.globalAlpha = 1;
}
const clip = (s: string, n: number) =>
  n <= 0 ? '' : s.length > n ? s.slice(0, n) : s;

export abstract class Panel {
  protected rng: Rng;
  // A per-panel pace, so twenty windows of one kind don't tick in unison.
  protected pace: number;
  readonly id: number;
  readonly kind: Kind;
  constructor(id: number, kind: Kind) {
    this.id = id;
    this.kind = kind;
    this.rng = seededRng(id * 7919 + 13);
    this.pace = 0.6 + hash(id, 99) * 0.8;
  }
  // A full-bleed panel is drawn into the whole window, under the header,
  // rather than into the padded area below it.
  readonly bleed: boolean = false;
  abstract update(dt: number, g: Gfx): void;
  abstract draw(g: Gfx, r: Rect): void;
}

class LogPanel extends Panel {
  private lines: { lvl: Level; msg: string; t: number }[] = [];
  private acc = 0;
  update(dt: number, g: Gfx) {
    this.acc += dt * g.v.logRate * this.pace;
    while (this.acc >= 1) {
      this.acc -= 1;
      const [lvl, msg] = logLine(this.rng);
      this.lines.push({ lvl, msg, t: g.clock });
      if (this.lines.length > 160) this.lines.shift();
    }
  }
  draw(g: Gfx, r: Rect) {
    const rows = Math.floor(r.h / g.lh);
    const cols = Math.floor(r.w / g.cw);
    // Narrow windows drop the timestamp before they drop the message.
    const wide = cols >= 34;
    const msgAt = wide ? 17 : 4;
    const n = this.lines.length;
    for (let i = 0; i < Math.min(rows, n); i++) {
      const line = this.lines[n - 1 - i];
      const y = r.y + (rows - 1 - i) * g.lh;
      const typed = Math.floor((g.clock - line.t) * g.v.typeSpeed);
      const msg = clip(line.msg.slice(0, typed), cols - msgAt);
      const loud = line.lvl === 'WRN' || line.lvl === 'ERR';
      if (wide) text(g, stamp(line.t), r.x, y, g.v.dim);
      text(
        g,
        line.lvl,
        r.x + (msgAt - 4) * g.cw,
        y,
        loud ? 1 : g.v.dim,
        loud ? g.v.accent : undefined,
      );
      text(g, msg, r.x + msgAt * g.cw, y, loud ? 1 : 0.85);
      if (typed < line.msg.length && msg.length < cols - msgAt) {
        g.ctx.fillStyle = g.v.accent;
        g.ctx.fillRect(r.x + (msgAt + msg.length) * g.cw, y, g.cw, g.fs);
      }
    }
  }
}

class HexPanel extends Panel {
  private row0 = Math.floor(this.rng() * 0xfffff);
  private acc = 0;
  private hot = new Map<number, { val: number; t: number }>();
  private visible = 8;
  update(dt: number, g: Gfx) {
    this.acc += dt * g.v.hexScroll * this.pace;
    while (this.acc >= 1) {
      this.acc -= 1;
      this.row0++;
    }
    // Live bytes: a few cells rewrite themselves and flash as they do.
    let flips = dt * g.v.flicker * 40 * this.pace;
    while (flips > 0) {
      if (flips < 1 && this.rng() > flips) break;
      flips -= 1;
      const addr =
        (this.row0 + Math.floor(this.rng() * this.visible)) * 16 +
        Math.floor(this.rng() * 16);
      this.hot.set(addr, { val: Math.floor(this.rng() * 256), t: g.clock });
    }
    if (this.hot.size > 400) {
      for (const k of this.hot.keys())
        if (k < this.row0 * 16) this.hot.delete(k);
    }
  }
  draw(g: Gfx, r: Rect) {
    const rows = Math.floor(r.h / g.lh);
    const cols = Math.floor(r.w / g.cw);
    this.visible = Math.max(1, rows);
    // offset(8) + 2 + 3 per byte + 1 + 1 per byte of ascii
    const ascii = cols >= 11 + 4 * 4;
    const n = Math.max(
      1,
      Math.min(
        16,
        ascii ? Math.floor((cols - 11) / 4) : Math.floor((cols - 10) / 3),
      ),
    );
    for (let row = 0; row < rows; row++) {
      const base = (this.row0 + row) * 16;
      const y = r.y + row * g.lh;
      let bytes = '';
      let chars = '';
      for (let j = 0; j < n; j++) {
        const h = this.hot.get(base + j);
        const b = h ? h.val : Math.floor(hash(base + j, this.id) * 256);
        bytes += b.toString(16).toUpperCase().padStart(2, '0') + ' ';
        chars += b >= 33 && b <= 126 ? String.fromCharCode(b) : '.';
        if (h && g.clock - h.t < 0.18) {
          g.ctx.fillStyle = g.v.accent;
          g.ctx.globalAlpha = 0.85 * (1 - (g.clock - h.t) / 0.18);
          g.ctx.fillRect(
            r.x + (10 + j * 3) * g.cw - 1,
            y - 1,
            g.cw * 2 + 2,
            g.fs + 2,
          );
          g.ctx.globalAlpha = 1;
        }
      }
      if (cols < 12) {
        text(g, clip(bytes, cols), r.x, y, 0.85);
        continue;
      }
      text(
        g,
        base.toString(16).toUpperCase().padStart(8, '0'),
        r.x,
        y,
        g.v.dim,
      );
      text(g, bytes, r.x + 10 * g.cw, y, 0.85);
      if (ascii) text(g, chars, r.x + (10 + n * 3 + 1) * g.cw, y, g.v.dim);
    }
  }
}

class ReadoutPanel extends Panel {
  private fields = Array.from({ length: int(this.rng, 4, 10) }, () => {
    const f = pick(this.rng, READOUT_FIELDS);
    return {
      ...f,
      val: f.base * (0.8 + this.rng() * 0.4),
      changed: -9,
      salt: int(this.rng, 0, 1e6),
    };
  });
  private acc = 0;
  update(dt: number, g: Gfx) {
    for (const f of this.fields) f.val += (this.rng() - 0.5) * f.step * dt * 2;
    this.acc += dt * g.v.readoutRate * this.pace;
    while (this.acc >= 1) {
      this.acc -= 1;
      const f = pick(this.rng, this.fields);
      f.val = f.base * (0.7 + this.rng() * 0.6);
      f.changed = g.clock;
      f.salt++;
    }
  }
  draw(g: Gfx, r: Rect) {
    const rows = Math.floor(r.h / g.lh);
    const cols = Math.floor(r.w / g.cw);
    for (let i = 0; i < Math.min(rows, this.fields.length); i++) {
      const f = this.fields[i];
      const y = r.y + i * g.lh;
      let s = f.val.toFixed(f.digits) + f.unit;
      const p = g.v.scramble > 0 ? (g.clock - f.changed) / g.v.scramble : 1;
      if (p < 1) s = scrambled(s, p, f.salt, g.tick);
      s = clip(s, cols - f.label.length - 1);
      text(g, f.label, r.x, y, g.v.dim);
      text(
        g,
        s,
        r.x + r.w - s.length * g.cw,
        y,
        p < 1 ? 1 : 0.9,
        p < 1 ? g.v.accent : undefined,
      );
    }
  }
}

class BigPanel extends Panel {
  private word = this.next();
  private changed = 0;
  private due = 0;
  private count = int(this.rng, 0, 900);
  private inverted = hash(this.id, 5) < 0.35;
  private next() {
    const r = this.rng();
    if (r < 0.45) return pick(this.rng, BIG_WORDS);
    if (r < 0.65) return `0x${hex(this.rng, 3)}`;
    if (r < 0.8) return `${(this.rng() * 100).toFixed(1)}%`;
    const short = PROJECTS.filter((p) => p.name.length <= 10);
    return pick(this.rng, short).name;
  }
  update(_dt: number, g: Gfx) {
    if (g.clock >= this.due) {
      this.word = this.next();
      this.changed = g.clock;
      this.count++;
      this.due = g.clock + g.v.bigEvery * (0.6 + this.rng() * 0.8);
    }
  }
  draw(g: Gfx, r: Rect) {
    const ctx = g.ctx;
    const len = Math.max(2, this.word.length);
    const size = Math.max(
      g.fs,
      Math.min(r.h * 0.5, (r.w * 0.92) / (len * 0.6)),
    );
    const p = g.v.scramble > 0 ? (g.clock - this.changed) / g.v.scramble : 1;
    const s = p < 1 ? scrambled(this.word, p, this.count, g.tick) : this.word;
    text(g, `IDX ${String(this.count).padStart(4, '0')}`, r.x, r.y, g.v.dim);
    ctx.font = `${size}px "Geist Mono", monospace`;
    const w = ctx.measureText(s).width;
    const x = r.x;
    const y = r.y + (r.h - size) / 2;
    if (this.inverted) {
      ctx.fillStyle = g.v.ink;
      ctx.fillRect(
        x - size * 0.12,
        y - size * 0.1,
        w + size * 0.24,
        size * 1.15,
      );
      text(g, s, x, y, 1, '#111');
    } else text(g, s, x, y, 1);
    ctx.font = `${g.fs}px "Geist Mono", monospace`;
  }
}

class BarsPanel extends Panel {
  private bars = Array.from({ length: int(this.rng, 3, 7) }, () =>
    this.fresh(),
  );
  private fresh() {
    return {
      label:
        this.rng() < 0.3
          ? pick(this.rng, PROJECTS).key.split('/')[1].toUpperCase()
          : pick(this.rng, BAR_LABELS),
      v: 0,
      rate: 0.3 + this.rng() * 1.4,
      hold: 0,
    };
  }
  update(dt: number, g: Gfx) {
    for (let i = 0; i < this.bars.length; i++) {
      const b = this.bars[i];
      if (b.v >= 1) {
        b.hold += dt;
        if (b.hold > 0.5) this.bars[i] = this.fresh();
        continue;
      }
      // Progress lurches rather than gliding, the way real transfers report.
      if (this.rng() < dt * 8)
        b.v = Math.min(1, b.v + this.rng() * 0.12 * b.rate * g.v.barSpeed * 4);
    }
  }
  draw(g: Gfx, r: Rect) {
    const rows = Math.floor(r.h / (g.lh * 1.4));
    const cols = Math.floor(r.w / g.cw);
    const labelW = cols >= 24 ? 9 : 0;
    const barX = r.x + labelW * g.cw;
    const barW = r.w - labelW * g.cw - 5 * g.cw;
    for (let i = 0; i < Math.min(rows, this.bars.length); i++) {
      const b = this.bars[i];
      const y = r.y + i * g.lh * 1.4;
      if (labelW) text(g, clip(b.label, 8), r.x, y, g.v.dim);
      if (barW > 4) {
        g.ctx.globalAlpha = 0.35;
        g.ctx.strokeStyle = g.v.ink;
        g.ctx.strokeRect(
          Math.round(barX) + 0.5,
          Math.round(y + 1) + 0.5,
          Math.round(barW),
          Math.round(g.fs - 2),
        );
        g.ctx.globalAlpha = 1;
        g.ctx.fillStyle = b.v >= 1 ? g.v.accent : g.v.ink;
        g.ctx.fillRect(
          Math.round(barX) + 2,
          Math.round(y + 1) + 2,
          Math.max(0, (barW - 3) * b.v),
          Math.round(g.fs - 5),
        );
      }
      const pct = `${Math.floor(b.v * 100)}%`.padStart(4);
      text(g, pct, r.x + r.w - 4 * g.cw, y, b.v >= 1 ? 1 : 0.8);
    }
  }
}

// After the survey sheets in the reference: a block of codes at the top left,
// a crosshair at the centre, and a project credit set in a column to the right.
class SpecPanel extends Panel {
  private lines = SPEC_LINES.map((f) => ({
    s: f(this.rng),
    changed: -9,
    salt: int(this.rng, 0, 1e6),
  }));
  private project = pick(this.rng, PROJECTS);
  private projectChanged = -9;
  private acc = 0;
  private due = 0;
  update(dt: number, g: Gfx) {
    this.acc += dt * g.v.readoutRate * 0.4 * this.pace;
    while (this.acc >= 1) {
      this.acc -= 1;
      const i = Math.floor(this.rng() * this.lines.length);
      this.lines[i] = {
        s: SPEC_LINES[i](this.rng),
        changed: g.clock,
        salt: this.lines[i].salt + 1,
      };
    }
    if (g.clock >= this.due) {
      this.project = pick(this.rng, PROJECTS);
      this.projectChanged = g.clock;
      this.due = g.clock + g.v.bigEvery * 3 * (0.6 + this.rng() * 0.8);
    }
  }
  draw(g: Gfx, r: Rect) {
    const rows = Math.floor(r.h / g.lh);
    const cols = Math.floor(r.w / g.cw);
    const sc = (s: string, changed: number, salt: number) => {
      const p = g.v.scramble > 0 ? (g.clock - changed) / g.v.scramble : 1;
      return p < 1 ? scrambled(s, p, salt, g.tick) : s;
    };
    for (let i = 0; i < Math.min(rows, this.lines.length); i++) {
      const l = this.lines[i];
      text(g, clip(sc(l.s, l.changed, l.salt), cols), r.x, r.y + i * g.lh, 0.8);
    }
    if (r.w > 40 && r.h > 40) {
      const cx = Math.round(r.x + r.w / 2) + 0.5;
      const cy = Math.round(r.y + r.h / 2) + 0.5;
      g.ctx.strokeStyle = g.v.ink;
      g.ctx.globalAlpha = 0.7;
      g.ctx.beginPath();
      g.ctx.moveTo(cx - 5, cy);
      g.ctx.lineTo(cx + 6, cy);
      g.ctx.moveTo(cx, cy - 5);
      g.ctx.lineTo(cx, cy + 6);
      g.ctx.stroke();
      g.ctx.globalAlpha = 1;
    }
    // The credit only appears where it has room to be read.
    const colX = r.x + r.w * 0.58;
    const colChars = Math.floor((r.x + r.w - colX) / g.cw);
    if (colChars >= 8 && rows >= 12) {
      const words = this.project.name.split(' ');
      const out: string[] = [];
      for (const w of words) {
        const last = out.at(-1);
        if (last && last.length + 1 + w.length <= colChars)
          out[out.length - 1] = `${last} ${w}`;
        else out.push(w);
      }
      const salt = Math.floor(this.projectChanged * 100);
      const y0 = r.y + r.h * 0.3;
      out.forEach((l, i) =>
        text(
          g,
          clip(sc(l, this.projectChanged, salt + i), colChars),
          colX,
          y0 + i * g.lh,
          0.9,
        ),
      );
      text(
        g,
        sc(
          this.project.key.split('/')[1].toUpperCase(),
          this.projectChanged,
          salt + 50,
        ).slice(0, colChars),
        colX,
        y0 + (out.length + 3) * g.lh,
        g.v.dim,
      );
      text(
        g,
        sc(this.project.year, this.projectChanged, salt + 99),
        colX,
        y0 + (out.length + 6) * g.lh,
        0.9,
      );
    }
  }
}

// A piece of brand or art work, cover-filled to the window — refitted every
// frame, since the window is resizing — and swapped for another every few
// seconds behind a scan wipe.
class ImagePanel extends Panel {
  readonly bleed = true;
  private shown: Loaded | null = null;
  private prev: Loaded | null = null;
  private revealed = -9;
  private due = 0;
  private loading = false;
  private now = 0;

  update(_dt: number, g: Gfx) {
    this.now = g.clock;
    if (this.loading || g.clock < this.due || !ART_PROJECTS.length) return;
    this.loading = true;
    const project = pick(this.rng, ART_PROJECTS);
    const index = int(this.rng, 0, project.images.length - 1);
    const every = g.v.imageEvery * (0.6 + this.rng() * 0.8);
    loadShot({ project, index }).then((l) => {
      this.loading = false;
      this.due = this.now + every;
      if (!l) return;
      this.prev = this.shown;
      this.shown = l;
      this.revealed = this.now;
    });
  }

  private cover(g: Gfx, img: HTMLImageElement, r: Rect) {
    const s = Math.max(r.w / img.naturalWidth, r.h / img.naturalHeight);
    const w = img.naturalWidth * s;
    const h = img.naturalHeight * s;
    g.ctx.drawImage(img, r.x + (r.w - w) / 2, r.y + (r.h - h) / 2, w, h);
  }

  draw(g: Gfx, r: Rect) {
    const { ctx, v } = g;
    if (!this.shown) {
      text(
        g,
        scrambled('LOADING', 0.5, this.id, g.tick),
        r.x + v.pad,
        r.y + r.h - v.pad - g.fs,
        v.dim,
      );
      return;
    }
    const p = v.imageWipe > 0 ? (g.clock - this.revealed) / v.imageWipe : 1;
    ctx.globalAlpha = v.imageOpacity;
    if (v.imageMono > 0) ctx.filter = `grayscale(${v.imageMono})`;
    if (p < 1 && this.prev) this.cover(g, this.prev.img, r);
    if (p < 1) {
      // The new picture scans in from the top, a bright line riding the edge.
      const e = 1 - (1 - p) ** 3;
      ctx.save();
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.w, r.h * e);
      ctx.clip();
      this.cover(g, this.shown.img, r);
      ctx.restore();
      ctx.filter = 'none';
      ctx.globalAlpha = 1;
      ctx.fillStyle = v.accent;
      ctx.fillRect(r.x, r.y + r.h * e - 1, r.w, 2);
    } else this.cover(g, this.shown.img, r);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;

    if (v.imageCaption && r.w > 90 && r.h > 50) {
      const { name, year } = this.shown.shot.project;
      const cap = clip(
        `${name.toUpperCase()} · ${year}`,
        Math.floor((r.w - v.pad * 2) / g.cw) - 1,
      );
      const w = cap.length * g.cw + 8;
      const y = r.y + r.h - v.pad - g.fs - 4;
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(r.x + v.pad - 4, y - 3, w, g.fs + 6);
      text(g, cap, r.x + v.pad, y, 0.95);
    }
  }
}

const CTORS: Record<Kind, new (id: number, kind: Kind) => Panel> = {
  log: LogPanel,
  hex: HexPanel,
  readout: ReadoutPanel,
  big: BigPanel,
  bars: BarsPanel,
  spec: SpecPanel,
  image: ImagePanel,
};

export function kindOf(id: number, v: TermValues): Kind {
  const w = [v.wLog, v.wHex, v.wReadout, v.wBig, v.wBars, v.wSpec, v.wImage];
  const total = w.reduce((a, b) => a + b, 0);
  if (total <= 0) return 'log';
  let x = hash(id, 31) * total;
  for (let i = 0; i < KINDS.length; i++) {
    x -= w[i];
    if (x < 0) return KINDS[i];
  }
  return KINDS[KINDS.length - 1];
}

export const makePanel = (id: number, kind: Kind) => new CTORS[kind](id, kind);
