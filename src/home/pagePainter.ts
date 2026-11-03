// Paints a copy of the live page into one canvas the size of the document, so
// WebGL can refract it. Everything is measured off the real DOM — each
// character's own box, each element's computed style — so the copy sits on the
// HTML pixel for pixel, and the HTML stays the page for links, selection and
// screen readers.
//
// What it knows how to paint, which is what Home is made of:
// - the ground colour,
// - `.dot-field` elements (the dot screen),
// - `[data-paint]` boxes: background, right border, first box-shadow,
// - `<img>`s,
// - text inside `.raised`, with that block's computed `text-shadow`s and
// underlines.
//
// Anything else on the page is invisible in the copy. Add a case here when
// Home gains a new kind of thing.

type Rect = { x: number; y: number; w: number; h: number };
type Glyph = { ch: string; x: number; base: number };
type Line = { x0: number; x1: number; y: number; t: number; color: string };
type TextRun = { font: string; color: string; glyphs: Glyph[] };
type Shadow = { color: string; x: number; y: number; blur: number };
type TextGroup = { shadows: Shadow[]; runs: TextRun[]; lines: Line[] };
type Box = {
  r: Rect;
  bg: string;
  border: { w: number; color: string };
  shadow: (Shadow & { spread: number }) | null;
};

const clear = (c: string) =>
  c === 'transparent' || /rgba\(.*,\s*0\)$/.test(c) || c === '';

// "rgb(1, 2, 3) 1px 2px 3px, rgba(...) ..." -> list. Computed styles always
// put the colour first.
function shadowsOf(css: string): (Shadow & { spread: number })[] {
  if (!css || css === 'none') return [];
  const out: (Shadow & { spread: number })[] = [];
  const re =
    /(rgba?\([^)]*\)|#[0-9a-f]+)\s+([-\d.]+)px\s+([-\d.]+)px(?:\s+([-\d.]+)px)?(?:\s+([-\d.]+)px)?/gi;
  for (const m of css.matchAll(re))
    out.push({
      color: m[1],
      x: +m[2],
      y: +m[3],
      blur: +(m[4] ?? 0),
      spread: +(m[5] ?? 0),
    });
  return out;
}

export class PagePainter {
  readonly canvas = document.createElement('canvas');
  // CSS pixels of the document, and device pixels per CSS pixel in the copy.
  w = 1;
  h = 1;
  scale = 1;
  private ground = '#c6c4c9';
  private dots: {
    r: Rect;
    color: string;
    border: { w: number; color: string };
  }[] = [];
  private boxes: Box[] = [];
  private images: { img: HTMLImageElement; r: Rect }[] = [];
  private groups = new Map<string, TextGroup>();
  private layer = document.createElement('canvas');

  // Measure everything, in document coordinates.
  measure(root: HTMLElement) {
    const sx = scrollX;
    const sy = scrollY;
    const rect = (el: Element | Range): Rect => {
      const b = el.getBoundingClientRect();
      return { x: b.left + sx, y: b.top + sy, w: b.width, h: b.height };
    };
    this.w = Math.max(1, document.documentElement.scrollWidth);
    this.h = Math.max(1, document.documentElement.scrollHeight);
    this.ground = getComputedStyle(root).backgroundColor;

    this.dots = [...root.querySelectorAll('.dot-field')].map((el) => {
      const cs = getComputedStyle(el);
      return {
        r: rect(el),
        color: cs.getPropertyValue('--dot').trim(),
        border: {
          w: parseFloat(cs.borderRightWidth) || 0,
          color: cs.borderRightColor,
        },
      };
    });

    this.boxes = [...root.querySelectorAll('[data-paint]')].map((el) => {
      const cs = getComputedStyle(el);
      return {
        r: rect(el),
        bg: cs.backgroundColor,
        border: {
          w: parseFloat(cs.borderRightWidth) || 0,
          color: cs.borderRightColor,
        },
        shadow: shadowsOf(cs.boxShadow)[0] ?? null,
      };
    });

    this.images = [...root.querySelectorAll('img')].map((img) => ({
      img,
      r: rect(img),
    }));

    this.groups.clear();
    const g = this.layer.getContext('2d')!;
    for (const block of root.querySelectorAll<HTMLElement>('.raised')) {
      const shadowCss = getComputedStyle(block).textShadow;
      let group = this.groups.get(shadowCss);
      if (!group) {
        group = { shadows: shadowsOf(shadowCss), runs: [], lines: [] };
        this.groups.set(shadowCss, group);
      }
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const node = n as Text;
        const parent = node.parentElement!;
        const cs = getComputedStyle(parent);
        const font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        g.font = font;
        const m = g.measureText('Hg');
        const run: TextRun = { font, color: cs.color, glyphs: [] };
        const underline = cs.textDecorationLine.includes('underline');
        const size = parseFloat(cs.fontSize);
        const thick =
          parseFloat(cs.textDecorationThickness) || Math.max(1, size / 14);
        const offset = parseFloat(cs.textUnderlineOffset) || 0;
        const text = node.data;
        const range = document.createRange();
        let line: Line | null = null;
        // One range per character: its box carries the kerning and the
        // letter-spacing, which `fillText` alone can't reproduce everywhere.
        for (let i = 0; i < text.length; i++) {
          const ch = text[i];
          range.setStart(node, i);
          range.setEnd(node, i + 1);
          const b = range.getClientRects()[0];
          if (!b || b.width === 0) continue;
          const x = b.left + sx;
          const base = b.top + sy + m.fontBoundingBoxAscent;
          if (ch.trim()) run.glyphs.push({ ch, x, base });
          if (!underline) continue;
          const y = base + offset + thick / 2;
          if (line && Math.abs(line.y - y) < 1) line.x1 = x + b.width;
          else {
            if (line) group.lines.push(line);
            line = { x0: x, x1: x + b.width, y, t: thick, color: cs.color };
          }
        }
        if (line) group.lines.push(line);
        group.runs.push(run);
      }
    }
  }

  // Draw the measured page. `scale` is device pixels per CSS pixel, capped so
  // the canvas stays inside `maxPx` on its longer side.
  paint(scale: number, maxPx: number, dotColor: string) {
    this.scale = Math.min(scale, maxPx / this.w, maxPx / this.h);
    const k = this.scale;
    const c = this.canvas;
    c.width = Math.max(1, Math.round(this.w * k));
    c.height = Math.max(1, Math.round(this.h * k));
    const g = c.getContext('2d')!;
    g.setTransform(k, 0, 0, k, 0, 0);
    g.fillStyle = this.ground;
    g.fillRect(0, 0, this.w, this.h);

    // The dot screen: a 4px tile, anchored to each field's corner as CSS does.
    const tile = document.createElement('canvas');
    tile.width = tile.height = Math.max(1, Math.round(4 * k));
    const tg = tile.getContext('2d')!;
    tg.scale(k, k);
    for (const d of this.dots) {
      tg.clearRect(0, 0, 4, 4);
      const grad = tg.createRadialGradient(2, 2, 0, 2, 2, 1);
      const col = d.color || dotColor;
      grad.addColorStop(0, col);
      grad.addColorStop(0.6, col);
      grad.addColorStop(1, 'transparent');
      tg.fillStyle = grad;
      tg.fillRect(0, 0, 4, 4);
      const pat = g.createPattern(tile, 'repeat')!;
      pat.setTransform(new DOMMatrix([1 / k, 0, 0, 1 / k, d.r.x, d.r.y]));
      g.fillStyle = pat;
      g.fillRect(d.r.x, d.r.y, d.r.w, d.r.h);
      if (d.border.w > 0 && !clear(d.border.color)) {
        g.fillStyle = d.border.color;
        g.fillRect(d.r.x + d.r.w - d.border.w, d.r.y, d.border.w, d.r.h);
      }
    }

    for (const b of this.boxes) {
      const { r } = b;
      if (b.shadow && !clear(b.shadow.color)) {
        // Canvas shadows have no spread; a negative spread is a smaller
        // shadow-caster under the box.
        const s = b.shadow.spread;
        g.save();
        g.shadowColor = b.shadow.color;
        g.shadowOffsetX = b.shadow.x * k;
        g.shadowOffsetY = b.shadow.y * k;
        g.shadowBlur = b.shadow.blur * k;
        g.fillStyle = clear(b.bg) ? this.ground : b.bg;
        g.fillRect(r.x - s, r.y - s, r.w + 2 * s, r.h + 2 * s);
        g.restore();
      }
      if (!clear(b.bg)) {
        g.fillStyle = b.bg;
        g.fillRect(r.x, r.y, r.w, r.h);
      }
      if (b.border.w > 0 && !clear(b.border.color)) {
        g.fillStyle = b.border.color;
        g.fillRect(r.x + r.w - b.border.w, r.y, b.border.w, r.h);
      }
    }

    for (const { img, r } of this.images)
      if (img.complete && img.naturalWidth)
        g.drawImage(img, r.x, r.y, r.w, r.h);

    // Each text group drawn once into a layer, then stamped with its shadows:
    // last listed first, as CSS paints them, then the letters themselves.
    const L = this.layer;
    L.width = c.width;
    L.height = c.height;
    const lg = L.getContext('2d')!;
    for (const group of this.groups.values()) {
      lg.setTransform(1, 0, 0, 1, 0, 0);
      lg.clearRect(0, 0, L.width, L.height);
      lg.setTransform(k, 0, 0, k, 0, 0);
      lg.textBaseline = 'alphabetic';
      for (const run of group.runs) {
        lg.font = run.font;
        lg.fillStyle = run.color;
        for (const gl of run.glyphs) lg.fillText(gl.ch, gl.x, gl.base);
      }
      for (const l of group.lines) {
        lg.fillStyle = l.color;
        lg.fillRect(l.x0, l.y - l.t / 2, l.x1 - l.x0, l.t);
      }
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      for (const s of [...group.shadows].reverse()) {
        g.shadowColor = s.color;
        g.shadowOffsetX = s.x * k;
        g.shadowOffsetY = s.y * k;
        g.shadowBlur = s.blur * k;
        g.drawImage(L, 0, 0);
      }
      g.shadowColor = 'transparent';
      g.drawImage(L, 0, 0);
      g.restore();
    }
  }
}
