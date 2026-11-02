// A closed, slowly morphing path with numbered nodes, set on a fat "sticker"
// outline: the line is stroked three times, widest in the edge colour, then in
// paper, then as the hairline itself. Label bubbles, loops and letter chips
// join the same two sticker passes, so they merge with the outline rather than
// sitting on it.
import { seededRng } from '@/lab/random';
import type { PathValues } from './pathControls';

type Ctx = CanvasRenderingContext2D;
type P = { x: number; y: number };

function hash(n: number, salt: number) {
  let x = Math.imul(n ^ (salt * 0x9e3779b9), 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

type Shape = {
  lobes: { k: number; a: number; phase: number; drift: number }[];
  dips: { at: number; depth: number; drift: number }[];
};

function shapeOf(seed: number): Shape {
  const rng = seededRng(seed * 977 + 3);
  return {
    lobes: Array.from({ length: 12 }, (_, i) => ({
      k: i + 1,
      a: (0.4 + rng() * 0.6) / Math.pow(i + 1, 0.7),
      phase: rng() * Math.PI * 2,
      drift: (rng() - 0.5) * 2,
    })),
    dips: Array.from({ length: 6 }, () => ({
      at: rng() * Math.PI * 2,
      depth: 0.6 + rng() * 0.4,
      drift: (rng() - 0.5) * 0.6,
    })),
  };
}

type Node = {
  i: number;
  p: P;
  t: P; // unit tangent
  n: P; // unit outward normal
  kind: 'square' | 'ring' | 'curl';
  pair: boolean;
  label: string | null;
};

const SAMPLES = 900;

// Any closed outline as SAMPLES points evenly spaced along it, wound the way
// the generated loop is (clockwise on screen), which `nodesOf` relies on for
// its outward normals; and its centroid, where the word sits.
function resample(src: P[]) {
  const n = src.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = src[i];
    const b = src[(i + 1) % n];
    area += a.x * b.y - b.x * a.y;
  }
  const ring = area < 0 ? [...src].reverse() : src;
  const acc = [0];
  for (let i = 1; i <= n; i++) {
    const a = ring[i - 1];
    const b = ring[i % n];
    acc.push(acc[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const L = acc[n] || 1;
  const pts: P[] = [];
  let j = 0;
  let cx = 0;
  let cy = 0;
  for (let k = 0; k < SAMPLES; k++) {
    const s = (k / SAMPLES) * L;
    while (j < n - 1 && acc[j + 1] < s) j++;
    const a = ring[j];
    const b = ring[(j + 1) % n];
    const f = (s - acc[j]) / (acc[j + 1] - acc[j] || 1);
    const p = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    pts.push(p);
    cx += p.x;
    cy += p.y;
  }
  return { pts, c: { x: cx / SAMPLES, y: cy / SAMPLES } };
}

export class PathRenderer {
  private shape: Shape | null = null;
  private seeded = -1;
  private clock = 0;

  private given: P[] | null = null;
  private resampled: { pts: P[]; c: P } | null = null;

  // With `outline` (a closed polygon in canvas units, as a studio shape
  // style passes it), the line follows that instead of its own morphing loop,
  // and the ground and dots are left off so the layers below show through.
  render(
    ctx: Ctx,
    W: number,
    H: number,
    wallDt: number,
    v: PathValues,
    outline?: P[],
  ) {
    if (this.seeded !== v.seed || !this.shape) {
      this.shape = shapeOf(v.seed);
      this.seeded = v.seed;
    }
    const dt = v.paused ? 0 : Math.min(wallDt, 0.1) * v.speed;
    const clock = (this.clock += dt);
    const phase = clock * v.morph * Math.PI * 2;
    let cx = W / 2;
    let cy = H / 2;
    const R = Math.min(W, H / v.squash) * v.size;

    let pts: P[];
    if (outline && outline.length > 2) {
      if (this.given !== outline || !this.resampled) {
        this.given = outline;
        this.resampled = resample(outline);
      }
      pts = this.resampled.pts;
      cx = this.resampled.c.x;
      cy = this.resampled.c.y;
    } else pts = this.outlineOf(cx, cy, R, phase, v);
    const nodes = this.nodesOf(pts, clock, v);
    const line = new Path2D();
    pts.forEach((p, i) => (i ? line.lineTo(p.x, p.y) : line.moveTo(p.x, p.y)));
    line.closePath();

    const labelFont = `500 ${v.labelSize}px Geist, system-ui, sans-serif`;
    const wordPx = v.wordSize * W;
    const letters = this.lettersOf(ctx, cx, cy, wordPx, v);

    const styled = !!outline && outline.length > 2;
    if (styled) ctx.clearRect(0, 0, W, H);
    else {
      ctx.fillStyle = v.ground;
      ctx.fillRect(0, 0, W, H);
    }

    // The two sticker passes: everything grown by the edge, then in paper.
    ctx.lineJoin = ctx.lineCap = 'round';
    for (const [grow, fill] of [
      [v.border, v.edge],
      [0, v.paper],
    ] as const) {
      ctx.strokeStyle = ctx.fillStyle = fill;
      if (v.outline > 0) {
        ctx.lineWidth = v.outline + grow * 2;
        ctx.stroke(line);
      }
      ctx.beginPath();
      for (const nd of nodes) {
        if (nd.kind === 'curl') {
          const c = this.curlOf(nd, v);
          const r = c.r + v.outline / 2 + grow;
          ctx.moveTo(c.x + r, c.y);
          ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
        } else if (nd.label) {
          const l = this.labelAt(nd, v);
          const r = v.labelSize * 0.85 + grow;
          ctx.moveTo(l.x + r, l.y);
          ctx.arc(l.x, l.y, r, 0, Math.PI * 2);
        }
      }
      for (const l of letters) {
        const s = v.letterSize * 0.78 + grow;
        ctx.roundRect(l.x - s, l.y - s, s * 2, s * 2, s * 0.45);
      }
      ctx.fill();
    }

    if (v.dots && !styled) {
      ctx.fillStyle = v.edge;
      const g = v.dotGap;
      ctx.beginPath();
      for (let y = (H % g) / 2; y < H; y += g)
        for (let x = (W % g) / 2; x < W; x += g) {
          ctx.moveTo(x + v.dotSize, y);
          ctx.arc(x, y, v.dotSize, 0, Math.PI * 2);
        }
      ctx.fill();
    }

    if (v.word && wordPx > 0) {
      ctx.font = `800 ${wordPx}px Geist, system-ui, sans-serif`;
      ctx.letterSpacing = `${-wordPx * 0.04}px`;
      ctx.fillStyle = v.wordColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(v.word, cx, cy);
      ctx.letterSpacing = '0px';
    }
    if (letters.length) {
      ctx.font = `500 ${v.letterSize}px Geist, system-ui, sans-serif`;
      ctx.fillStyle = v.ink;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const l of letters) ctx.fillText(l.ch, l.x, l.y + 1);
    }

    ctx.strokeStyle = v.ink;
    ctx.lineWidth = v.lineWidth;
    ctx.stroke(line);

    const s = v.nodeSize;
    ctx.font = labelFont;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const nd of nodes) {
      const { p, t } = nd;
      ctx.fillStyle = v.ink;
      if (nd.kind === 'ring') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, s * 0.85, 0, Math.PI * 2);
        ctx.fillStyle = v.paper;
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
        if (nd.pair)
          ctx.fillRect(p.x + t.x * s - s / 2, p.y + t.y * s - s / 2, s, s);
      }
      if (nd.kind === 'curl') {
        const c = this.curlOf(nd, v);
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
        ctx.fillStyle = v.paper;
        ctx.fill();
        ctx.stroke();
        if (nd.label) {
          ctx.fillStyle = v.ink;
          ctx.fillText(nd.label, c.x, c.y + 1, c.r * 1.8);
        }
      } else if (nd.label) {
        const l = this.labelAt(nd, v);
        ctx.fillStyle = v.ink;
        ctx.fillText(nd.label, l.x, l.y + 1);
      }
    }
  }

  // The closed outline, sampled densely in angle.
  private outlineOf(
    cx: number,
    cy: number,
    R: number,
    ph: number,
    v: PathValues,
  ) {
    const { lobes, dips } = this.shape!;
    const used = lobes.slice(0, v.lobes);
    const norm = used.reduce((a, l) => a + l.a, 0) || 1;
    const out: P[] = [];
    for (let j = 0; j < SAMPLES; j++) {
      const th = (j / SAMPLES) * Math.PI * 2;
      let r = 0;
      for (const l of used)
        r += l.a * Math.sin(l.k * th + l.phase + ph * l.drift);
      r = 1 + (r / norm) * v.wobble * 2.2;
      for (const d of dips.slice(0, v.dips)) {
        let dd = th - (d.at + ph * d.drift * 0.2);
        dd = Math.atan2(Math.sin(dd), Math.cos(dd));
        r *= 1 - v.dipDepth * d.depth * Math.exp(-((dd / v.dipWidth) ** 2));
      }
      r = Math.max(0.06, r) * R;
      out.push({
        x: cx + Math.cos(th) * r,
        y: cy + Math.sin(th) * r * v.squash,
      });
    }
    return out;
  }

  // Nodes at roughly even spacing along the arc, each keeping its own
  // character by index as the outline morphs under it.
  private nodesOf(pts: P[], clock: number, v: PathValues): Node[] {
    const n = pts.length;
    const acc = [0];
    for (let j = 1; j <= n; j++) {
      const a = pts[j - 1];
      const b = pts[j % n];
      acc.push(acc[j - 1] + Math.hypot(b.x - a.x, b.y - a.y));
    }
    const L = acc[n];
    const K = Math.round(v.nodes);
    const tick = Math.floor(clock / v.retick);
    const out: Node[] = [];
    let num = 0;
    for (let i = 0; i < K; i++) {
      const s = ((i + 0.5 + (hash(i, v.seed) - 0.5) * 0.7) / K) * L;
      let lo = 0;
      let hi = n;
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (acc[m] <= s) lo = m;
        else hi = m;
      }
      const a = pts[lo];
      const b = pts[(lo + 1) % n];
      const f = (s - acc[lo]) / (acc[lo + 1] - acc[lo] || 1);
      const p = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
      const prev = pts[(lo - 3 + n) % n];
      const next = pts[(lo + 4) % n];
      const tl = Math.hypot(next.x - prev.x, next.y - prev.y) || 1;
      const t = { x: (next.x - prev.x) / tl, y: (next.y - prev.y) / tl };
      // Angle increases clockwise on screen, so outward is the tangent turned
      // anticlockwise by a quarter.
      const nrm = { x: t.y, y: -t.x };

      const h = hash(i, v.seed + 17);
      const kind =
        h < v.curlShare
          ? 'curl'
          : h < v.curlShare + v.ringShare
            ? 'ring'
            : 'square';
      const labelled = kind === 'curl' || hash(i, v.seed + 29) < v.labelShare;
      let label: string | null = null;
      if (labelled) {
        num++;
        label =
          v.labelMode === 'value'
            ? String(Math.floor(hash(i, tick * 131 + v.seed) * 100))
            : v.labelMode === 'coord'
              ? `${Math.round(p.x)}·${Math.round(p.y)}`
              : String(num);
      }
      out.push({
        i,
        p,
        t,
        n: nrm,
        kind,
        pair: kind === 'square' && hash(i, v.seed + 41) < v.pairShare,
        label,
      });
    }
    return out;
  }

  private labelAt(nd: Node, v: PathValues) {
    const d = v.nodeSize * 0.5 + v.labelSize * 0.95;
    return { x: nd.p.x + nd.n.x * d, y: nd.p.y + nd.n.y * d };
  }

  // A small loop off the line, carrying its label inside.
  private curlOf(nd: Node, v: PathValues) {
    const r = Math.max(v.nodeSize * 1.1, v.labelSize * 0.8);
    const d = r + v.nodeSize * 0.3;
    return { x: nd.p.x + nd.n.x * d, y: nd.p.y + nd.n.y * d, r };
  }

  // The spaced letters set under the word, each on its own chip.
  private lettersOf(
    ctx: Ctx,
    cx: number,
    cy: number,
    wordPx: number,
    v: PathValues,
  ) {
    const chars = [...v.letters.replace(/\s/g, '')];
    if (!chars.length) return [];
    ctx.font = `800 ${wordPx}px Geist, system-ui, sans-serif`;
    const span = Math.max(
      chars.length * v.letterSize * 2,
      v.word ? ctx.measureText(v.word).width * 0.95 : 0,
    );
    const y = cy + Math.max(wordPx * 0.62, v.letterSize * 1.5);
    return chars.map((ch, i) => ({
      ch,
      x:
        cx -
        span / 2 +
        (chars.length > 1 ? (span * i) / (chars.length - 1) : span / 2),
      y,
    }));
  }
}
