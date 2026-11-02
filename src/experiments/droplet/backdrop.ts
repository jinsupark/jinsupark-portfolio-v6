// The picture under the water: a collage of big rotated photo-like tiles, so
// the refraction has hard edges and strong colour to bend. Painted once per
// seed into a canvas the shader samples.

import { ART_PROJECTS } from '@/experiments/terminal/imagePool';
import { seededRng } from '@/lab/random';

type Ctx = CanvasRenderingContext2D;
type Rng = () => number;

const SKIES = [
  ['#0f5fd6', '#5fa6ee', '#cfe4f7'],
  ['#2a7be6', '#8cc2f2', '#e6f1fb'],
  ['#1550b8', '#3d8ae6', '#9cc8f0'],
];
const GRASS = [
  ['#164a30', '#2c7046'],
  ['#1d5a37', '#3f8a4f'],
  ['#0f3a26', '#24603c'],
];

function sky(g: Ctx, w: number, h: number, r: Rng) {
  const p = SKIES[Math.floor(r() * SKIES.length)];
  const gr = g.createLinearGradient(0, 0, w * (r() - 0.5), h);
  gr.addColorStop(0, p[0]);
  gr.addColorStop(0.6, p[1]);
  gr.addColorStop(1, p[2]);
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  const clouds = 1 + Math.floor(r() * 4);
  for (let c = 0; c < clouds; c++) {
    const cx = r() * w;
    const cy = r() * h;
    const s = Math.min(w, h) * (0.08 + r() * 0.2);
    for (let k = 0; k < 9; k++) {
      const x = cx + (r() - 0.5) * s * 2.6;
      const y = cy + (r() - 0.5) * s * 0.8;
      const rad = s * (0.35 + r() * 0.6);
      const rg = g.createRadialGradient(x, y, 0, x, y, rad);
      rg.addColorStop(0, 'rgba(255,255,255,0.85)');
      rg.addColorStop(0.6, 'rgba(245,249,255,0.45)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  }
}

function grass(g: Ctx, w: number, h: number, r: Rng) {
  const p = GRASS[Math.floor(r() * GRASS.length)];
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, p[0]);
  gr.addColorStop(1, p[1]);
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  const lean = (r() - 0.5) * 0.6;
  const n = Math.min(2500, (w * h) / 220);
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = r() * w;
    const y = r() * h;
    const L = 8 + r() * 34;
    const light = r();
    g.strokeStyle =
      light < 0.5
        ? `rgba(120,190,110,${0.15 + r() * 0.3})`
        : light < 0.8
          ? `rgba(10,40,20,${0.2 + r() * 0.3})`
          : `rgba(210,235,170,${0.15 + r() * 0.25})`;
    g.lineWidth = 0.6 + r() * 1.4;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + lean * L * 0.4, y - L * 0.5, x + lean * L, y - L);
    g.stroke();
  }
}

function water(g: Ctx, w: number, h: number, r: Rng) {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#3f8fd8');
  gr.addColorStop(1, '#1f5e8e');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  g.lineCap = 'round';
  for (let i = 0; i < 160; i++) {
    const x = r() * w;
    const y = r() * h;
    const L = 20 + r() * 80;
    g.strokeStyle = `rgba(220,240,255,${0.1 + r() * 0.35})`;
    g.lineWidth = 0.8 + r() * 2;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + L / 2, y - 3 - r() * 4, x + L, y);
    g.stroke();
  }
}

export class Backdrop {
  readonly canvas = document.createElement('canvas');
  private key = '';
  private images: (HTMLImageElement | null)[] = [];
  private imagesFor = -1;

  update(
    W: number,
    H: number,
    scale: number,
    seed: number,
    tiles: number,
    kind: string,
  ) {
    const key = [W, H, scale, seed, tiles, kind].join('|');
    if (key === this.key) return false;
    this.key = key;
    if (kind === 'projects' && this.imagesFor !== seed) this.load(seed);
    this.paint(W, H, scale, seed, tiles, kind);
    return true;
  }

  private load(seed: number) {
    this.imagesFor = seed;
    const r = seededRng(seed * 31 + 7);
    const picks = [...ART_PROJECTS].sort(() => r() - 0.5).slice(0, 10);
    this.images = picks.map(() => null);
    picks.forEach((p, i) => {
      void p.images[0]().then((url) => {
        const img = new Image();
        img.onload = () => {
          if (this.imagesFor !== seed) return;
          this.images[i] = img;
          // Repaint on the next update.
          this.key = '';
        };
        img.src = url;
      });
    });
  }

  private paint(
    W: number,
    H: number,
    scale: number,
    seed: number,
    tiles: number,
    kind: string,
  ) {
    const c = this.canvas;
    c.width = Math.max(1, Math.round(W * scale));
    c.height = Math.max(1, Math.round(H * scale));
    const g = c.getContext('2d')!;
    g.setTransform(scale, 0, 0, scale, 0, 0);
    const r = seededRng(seed * 977 + 3);
    const projects = kind === 'projects';
    if (projects) {
      g.fillStyle = '#c9ccd2';
      g.fillRect(0, 0, W, H);
    } else sky(g, W, H, r);

    const big = Math.max(W, H);
    for (let i = 0; i < tiles; i++) {
      const w = big * (0.22 + r() * 0.5);
      const h = big * (0.18 + r() * 0.45);
      const x = r() * W;
      const y = r() * H;
      const a = (r() - 0.5) * 1.3;
      g.save();
      g.translate(x, y);
      g.rotate(a);
      g.translate(-w / 2, -h / 2);
      g.beginPath();
      g.rect(0, 0, w, h);
      g.clip();
      if (projects) {
        const img = this.images[i % Math.max(1, this.images.length)];
        if (img?.naturalWidth) {
          const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
          const dw = img.naturalWidth * s;
          const dh = img.naturalHeight * s;
          g.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
        } else {
          g.fillStyle = r() < 0.5 ? '#aeb4bd' : '#d8dbe0';
          g.fillRect(0, 0, w, h);
        }
      } else {
        const k = r();
        if (k < 0.45) sky(g, w, h, r);
        else if (k < 0.8) grass(g, w, h, r);
        else water(g, w, h, r);
      }
      g.restore();
    }
  }
}
