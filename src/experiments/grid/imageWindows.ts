import { ART_PROJECTS, loadShot, type Loaded } from '../terminal/imagePool';
import type { Rect } from './gridLayout';

// One picture is hung across a whole cluster of windows, and each window shows
// its own slice of it — some plainly, some through a treatment, so the image
// reads as one thing seen through several different screens.
export type Fx =
  'plain' | 'mono' | 'invert' | 'difference' | 'dither' | 'pixel' | 'shift';

type Slot = {
  cur: Loaded | null;
  next: Loaded | null;
  wipeAt: number;
  swapAt: number;
  loading: boolean;
  p: number; // wipe progress this frame, 1 when idle
};

export type ImageLook = {
  every: number;
  wipe: number;
  opacity: number;
  caption: boolean;
  ink: string; // the dither's dark tone, and the difference fill
  paper: string; // the dither's light tone
  ditherRes: number; // dither cells across the image
  pixelRes: number;
};

function randomShot(busy: Set<string>) {
  const free = ART_PROJECTS.filter((p) => !busy.has(p.id));
  const from = free.length > 0 ? free : ART_PROJECTS;
  const project = from[Math.floor(Math.random() * from.length)];
  return { project, index: Math.floor(Math.random() * project.images.length) };
}

// 8x8 Bayer thresholds, 0..1.
const BAYER = (() => {
  const m = [0];
  let n = 1;
  while (n < 8) {
    const next: number[] = [];
    for (let y = 0; y < n * 2; y++)
      for (let x = 0; x < n * 2; x++) {
        const q = (y >= n ? 2 : 0) + (x >= n ? 1 : 0);
        const base = m[(y % n) * n + (x % n)];
        next.push(4 * base + [0, 2, 3, 1][q]);
      }
    m.splice(0, m.length, ...next);
    n *= 2;
  }
  return m.map((v) => (v + 0.5) / 64);
})();

function rgbOf(hex: string) {
  const h = hex.replace('#', '');
  const n = parseInt(
    h.length === 3 ? [...h].map((c) => c + c).join('') : h,
    16,
  );
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function shrink(img: HTMLImageElement, cols: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(cols));
  c.height = Math.max(
    1,
    Math.round((cols * img.naturalHeight) / img.naturalWidth),
  );
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, c.width, c.height);
  return { c, g };
}

function dither(
  img: HTMLImageElement,
  cols: number,
  ink: string,
  paper: string,
) {
  const { c, g } = shrink(img, cols);
  const d = g.getImageData(0, 0, c.width, c.height);
  const [ir, ig, ib] = rgbOf(ink);
  const [pr, pg, pb] = rgbOf(paper);
  const px = d.data;
  for (let y = 0; y < c.height; y++)
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      const l =
        (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
      const on = l > BAYER[(y & 7) * 8 + (x & 7)];
      px[i] = on ? pr : ir;
      px[i + 1] = on ? pg : ig;
      px[i + 2] = on ? pb : ib;
      px[i + 3] = 255;
    }
  g.putImageData(d, 0, 0);
  return c;
}

// Derived versions are made once per image and look, not per frame.
type Variants = {
  key: string;
  dither: HTMLCanvasElement;
  pixel: HTMLCanvasElement;
};
const variants = new WeakMap<HTMLImageElement, Variants>();

function variantsOf(img: HTMLImageElement, look: ImageLook) {
  const key = `${look.ink}${look.paper}${look.ditherRes}/${look.pixelRes}`;
  let v = variants.get(img);
  if (!v || v.key !== key) {
    v = {
      key,
      dither: dither(img, look.ditherRes, look.ink, look.paper),
      pixel: shrink(img, look.pixelRes).c,
    };
    variants.set(img, v);
  }
  return v;
}

function cover(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  sw: number,
  sh: number,
  r: Rect,
  dx = 0,
) {
  const s = Math.max(r.w / sw, r.h / sh);
  const dw = sw * s;
  const dh = sh * s;
  ctx.drawImage(src, r.x + (r.w - dw) / 2 + dx, r.y + (r.h - dh) / 2, dw, dh);
}

function paint(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cluster: Rect,
  clip: Rect,
  fx: Fx,
  look: ImageLook,
) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  ctx.globalAlpha = look.opacity;
  if (fx === 'dither' || fx === 'pixel') {
    const v = variantsOf(img, look);
    ctx.imageSmoothingEnabled = false;
    cover(ctx, fx === 'dither' ? v.dither : v.pixel, iw, ih, cluster);
    ctx.imageSmoothingEnabled = true;
  } else if (fx === 'mono') {
    ctx.filter = 'grayscale(1) contrast(1.3)';
    cover(ctx, img, iw, ih, cluster);
    ctx.filter = 'none';
  } else if (fx === 'shift') {
    // Misregistered: the slice is offset along the cluster, as if this screen
    // were a frame behind the others.
    cover(ctx, img, iw, ih, cluster, Math.max(8, clip.w * 0.12));
  } else cover(ctx, img, iw, ih, cluster);
  ctx.globalAlpha = 1;

  if (fx === 'invert' || fx === 'difference') {
    ctx.globalCompositeOperation = 'difference';
    ctx.fillStyle = fx === 'invert' ? '#ffffff' : look.paper;
    ctx.fillRect(clip.x, clip.y, clip.w, clip.h);
    ctx.globalCompositeOperation = 'source-over';
  }
}

// Slots are keyed by cluster id, so a picture stays with its cluster through
// every resize and goes when the cluster dissolves.
export class ImageClusters {
  private slots = new Map<number, Slot>();
  private seen = new Set<number>();

  private fetch(slot: Slot) {
    if (slot.loading || ART_PROJECTS.length === 0) return;
    slot.loading = true;
    // Keep two clusters from showing the same project at once.
    const busy = new Set<string>();
    for (const s of this.slots.values())
      for (const l of [s.cur, s.next]) if (l) busy.add(l.shot.project.id);
    loadShot(randomShot(busy)).then((l) => {
      slot.loading = false;
      if (!l || l === slot.cur) return;
      if (!slot.cur) slot.cur = l;
      else {
        slot.next = l;
        slot.wipeAt = -1;
      }
    });
  }

  begin() {
    this.seen.clear();
  }

  // Advance a cluster's picture for this frame. Returns null until the first
  // one has decoded, so its windows draw their ordinary fill meanwhile.
  update(id: number, now: number, look: ImageLook) {
    this.seen.add(id);
    let slot = this.slots.get(id);
    if (!slot) {
      slot = {
        cur: null,
        next: null,
        wipeAt: 0,
        swapAt: now + look.every * (0.6 + Math.random() * 0.8),
        loading: false,
        p: 1,
      };
      this.slots.set(id, slot);
      this.fetch(slot);
    }
    if (slot.cur && !slot.next && now >= slot.swapAt) {
      slot.swapAt = now + look.every * (0.6 + Math.random() * 0.8);
      this.fetch(slot);
    }
    slot.p = 1;
    if (slot.next) {
      // The decode lands outside the frame clock, so the wipe starts from the
      // first frame that sees it.
      if (slot.wipeAt < 0) slot.wipeAt = now;
      slot.p = Math.min(1, (now - slot.wipeAt) / Math.max(0.01, look.wipe));
      if (slot.p >= 1) {
        slot.cur = slot.next;
        slot.next = null;
      }
    }
    return slot.cur ? slot : null;
  }

  // One window's slice of its cluster's picture. The wipe edge is measured on
  // the cluster, so it sweeps across all of its windows as one line.
  drawSlice(
    ctx: CanvasRenderingContext2D,
    slot: Slot,
    cluster: Rect,
    clip: Rect,
    fx: Fx,
    look: ImageLook,
  ) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(clip.x, clip.y, clip.w, clip.h);
    ctx.clip();
    paint(ctx, slot.cur!.img, cluster, clip, fx, look);
    if (slot.next) {
      const edge = cluster.y + cluster.h * slot.p;
      ctx.save();
      ctx.beginPath();
      ctx.rect(clip.x, clip.y, clip.w, Math.max(0, edge - clip.y));
      ctx.clip();
      paint(ctx, slot.next.img, cluster, clip, fx, look);
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(clip.x, Math.round(edge) - 1, clip.w, 2);
    }
    ctx.restore();
  }

  caption(ctx: CanvasRenderingContext2D, slot: Slot, cluster: Rect) {
    if (cluster.w < 90 || cluster.h < 40) return;
    const shown = slot.next && slot.p > 0.5 ? slot.next : slot.cur!;
    const text =
      `${shown.shot.project.name} · ${shown.shot.project.year}`.toUpperCase();
    ctx.font = '9px "Geist Mono", monospace';
    ctx.textBaseline = 'top';
    const tw = ctx.measureText(text).width;
    const x = cluster.x + 8;
    const y = cluster.y + cluster.h - 22;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(x, y, tw + 10, 14);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(text, x + 5, y + 3);
  }

  // Forget clusters that weren't drawn this frame.
  end() {
    for (const id of this.slots.keys())
      if (!this.seen.has(id)) this.slots.delete(id);
  }
}
