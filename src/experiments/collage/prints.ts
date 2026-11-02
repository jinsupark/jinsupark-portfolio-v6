// What's printed on a piece of paper, drawn in the sheet's own coordinates
// (0..w, 0..h) and deterministic from `seed`, so a scrap left behind by a rip
// shows exactly the print of the sheet it was torn from.
import { seededRng } from '@/lab/random';

export type PrintKind =
  | 'solid'
  | 'gradient'
  | 'halftone'
  | 'scribble'
  | 'geo'
  | 'ruler'
  | 'type'
  | 'drawing'
  | 'image';
export type Print = {
  kind: PrintKind;
  base: string;
  accent: string;
  ink: string;
  seed: number;
  flip: boolean;
  image: HTMLImageElement | null;
};

type Ctx = CanvasRenderingContext2D;

const LINES = [
  'For Marking Darts, Tucks, Pleats',
  'and Embroidery Designs. For Most',
  'Patterns. For Best Results Use With',
  'Tracing Wheel.',
  'Colors: Light and Dark Fabrics',
  'PURE COTTON — No. 47 Assorted',
  'Guaranteed Fast to Washing',
  'Made in U.S.A.',
  'Keep Flat. Do Not Fold.',
  'Directions: Place Carbon Face Down',
];
const HEADS = [
  'THE SINGER COMPANY',
  'STANDARD PATTERN CO.',
  'DRESSMAKER SUPPLY',
  'THE TAILOR GUILD',
  'NATIONAL THREAD MILLS',
];
const SUBS = ['Manufactured for', 'NEW YORK, N.Y. 10020', 'Distributed by'];

export function drawPrint(ctx: Ctx, p: Print, w: number, h: number) {
  const rng = seededRng(p.seed * 7 + 3);
  ctx.fillStyle = p.base;
  ctx.fillRect(-20, -20, w + 40, h + 40);

  switch (p.kind) {
    case 'gradient': {
      // Printed sky: two inks blended along a random axis, sometimes through
      // a third band where they meet.
      const a = rng() * Math.PI;
      const L = Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a));
      const dx = (Math.cos(a) * L) / 2;
      const dy = (Math.sin(a) * L) / 2;
      const g = ctx.createLinearGradient(
        w / 2 - dx,
        h / 2 - dy,
        w / 2 + dx,
        h / 2 + dy,
      );
      g.addColorStop(0, p.base);
      g.addColorStop(1, p.accent);
      ctx.fillStyle = g;
      ctx.fillRect(-20, -20, w + 40, h + 40);
      break;
    }
    case 'halftone': {
      ctx.fillStyle = p.ink;
      if (rng() < 0.5) {
        // A regular dot screen whose dots swell toward one side.
        const step = 3.5 + rng() * 4;
        const a = rng() * Math.PI * 2;
        const cx = Math.cos(a);
        const cy = Math.sin(a);
        const span = Math.abs(w * cx) + Math.abs(h * cy) || 1;
        for (let y = 0; y < h + step; y += step) {
          const odd = Math.round(y / step) % 2 ? step / 2 : 0;
          for (let x = odd; x < w + step; x += step) {
            const t = ((x - w / 2) * cx + (y - h / 2) * cy) / span + 0.5;
            const rad = step * 0.5 * Math.min(1, Math.max(0, t));
            if (rad < 0.3) continue;
            ctx.beginPath();
            ctx.arc(x, y, rad, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      } else {
        // Photocopy speckle: random grains, clumped by a coarse density.
        const n = Math.min(9000, (w * h) / 9);
        const cells = 6;
        const dens = Array.from({ length: cells * cells }, () => rng());
        for (let i = 0; i < n; i++) {
          const x = rng() * w;
          const y = rng() * h;
          const d =
            dens[
              Math.min(cells - 1, Math.floor((y / h) * cells)) * cells +
                Math.min(cells - 1, Math.floor((x / w) * cells))
            ];
          if (rng() > d) continue;
          const s = 0.6 + rng() * 1.6;
          ctx.fillRect(x, y, s, s);
        }
      }
      break;
    }
    case 'scribble': {
      // Pen loops dragged across the sheet, like a coil pulled sideways.
      ctx.strokeStyle = p.ink;
      ctx.lineCap = 'round';
      const runs = 2 + Math.floor(rng() * 4);
      for (let k = 0; k < runs; k++) {
        ctx.lineWidth = 1.2 + rng() * 1.3;
        ctx.beginPath();
        let x = -10;
        const y0 = rng() * h;
        const R = 6 + rng() * Math.min(w, h) * 0.12;
        const drift = R * (0.25 + rng() * 0.35);
        let t = 0;
        while (x < w + 20 && t < 400) {
          const r = R * (0.7 + 0.3 * Math.sin(t * 0.37 + k));
          const px = x + Math.cos(t) * r;
          const py = y0 + Math.sin(t) * r * 0.8 + Math.sin(t * 0.13) * R;
          if (t === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
          t += 0.35;
          x += drift * 0.35;
        }
        ctx.stroke();
      }
      break;
    }
    case 'geo': {
      ctx.fillStyle = p.accent;
      const n = 2 + Math.floor(rng() * 4);
      const big = Math.max(w, h);
      for (let i = 0; i < n; i++) {
        ctx.save();
        if (rng() < 0.6) {
          // A bar across the sheet, at a strong diagonal or square on.
          ctx.translate(rng() * w, rng() * h);
          const a =
            rng() < 0.75 ? (rng() < 0.5 ? 1 : -1) * (0.6 + rng() * 0.4) : 0;
          ctx.rotate(a);
          const t = Math.min(w, h) * (0.08 + rng() * 0.3);
          ctx.fillRect(-big * 0.3, -t / 2, big * (0.25 + rng() * 0.6), t);
        } else {
          // A triangle wedged into one side.
          const side = Math.floor(rng() * 4);
          const s = rng();
          const e = rng();
          const d = 0.3 + rng() * 0.6;
          ctx.beginPath();
          if (side === 0) {
            ctx.moveTo(s * w, 0);
            ctx.lineTo(e * w, 0);
            ctx.lineTo(((s + e) / 2) * w, d * h);
          } else if (side === 1) {
            ctx.moveTo(w, s * h);
            ctx.lineTo(w, e * h);
            ctx.lineTo((1 - d) * w, ((s + e) / 2) * h);
          } else if (side === 2) {
            ctx.moveTo(s * w, h);
            ctx.lineTo(e * w, h);
            ctx.lineTo(((s + e) / 2) * w, (1 - d) * h);
          } else {
            ctx.moveTo(0, s * h);
            ctx.lineTo(0, e * h);
            ctx.lineTo(d * w, ((s + e) / 2) * h);
          }
          ctx.fill();
        }
        ctx.restore();
      }
      break;
    }
    case 'ruler': {
      ctx.fillStyle = p.accent;
      const vertical = h >= w;
      const L = vertical ? h : w;
      const T = vertical ? w : h;
      const step = L / (6 + Math.floor(rng() * 10));
      const right = rng() < 0.6;
      for (let s = step * 0.3; s < L; s += step) {
        const len = T * (0.2 + rng() * 0.35);
        const th = step * (0.25 + rng() * 0.2);
        const off = right ? T - len : 0;
        if (vertical) ctx.fillRect(off, s, len, th);
        else ctx.fillRect(s, off, th, len);
      }
      break;
    }
    case 'type': {
      ctx.save();
      if (p.flip) {
        ctx.translate(w, h);
        ctx.rotate(Math.PI);
      }
      ctx.fillStyle = p.ink;
      const fs = 6.5 + rng() * 3;
      let y = 8 + rng() * h * 0.2;
      if (rng() < 0.5) {
        ctx.font = `italic ${fs * 0.8}px Georgia, "Times New Roman", serif`;
        ctx.fillText(SUBS[Math.floor(rng() * SUBS.length)], w * 0.2, y);
        y += fs * 1.6;
        ctx.font = `${fs * 1.2}px Georgia, "Times New Roman", serif`;
        ctx.letterSpacing = `${fs * 0.22}px`;
        ctx.fillText(HEADS[Math.floor(rng() * HEADS.length)], w * 0.2, y);
        ctx.letterSpacing = '0px';
        y += fs * 2.2;
      }
      if (rng() < 0.65) {
        // Perforation dots right across the sheet.
        ctx.fillStyle = p.accent;
        for (let x = 4; x < w; x += 6.5) {
          ctx.beginPath();
          ctx.arc(x, y, 1, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = p.ink;
        y += fs * 1.8;
      }
      ctx.font = `${fs}px Georgia, "Times New Roman", serif`;
      const start = Math.floor(rng() * LINES.length);
      for (let i = 0; y < h - 4 && i < 3 + rng() * 6; i++) {
        ctx.fillText(LINES[(start + i) % LINES.length], 6, y);
        y += fs * 1.35;
      }
      ctx.restore();
      if (rng() < 0.4) {
        ctx.fillStyle = p.accent;
        ctx.fillRect(
          w * (0.78 + rng() * 0.15),
          0,
          2.5,
          h * (0.3 + rng() * 0.7),
        );
      }
      break;
    }
    case 'drawing': {
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      let left = rng() < 0.5;
      ctx.moveTo(left ? 0 : w, rng() * h * 0.2);
      for (let y = h * 0.1; y < h; y += h * (0.08 + rng() * 0.12)) {
        left = !left;
        ctx.lineTo(left ? w * rng() * 0.2 : w * (0.8 + rng() * 0.2), y);
      }
      ctx.stroke();
      break;
    }
    case 'image': {
      const img = p.image;
      if (img?.naturalWidth) {
        const s =
          Math.max(w / img.naturalWidth, h / img.naturalHeight) * (1 + rng());
        const dw = img.naturalWidth * s;
        const dh = img.naturalHeight * s;
        ctx.drawImage(img, -rng() * (dw - w), -rng() * (dh - h), dw, dh);
      }
      break;
    }
  }
}
