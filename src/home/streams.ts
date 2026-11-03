// Rain on a windscreen: drops that trickle across the screen from the top
// right towards the bottom left, laying a thin trail that dries behind them.
// They live on the glass, in screen px, so the page scrolls beneath them;
// `PageWater` paints them into its mask, where the blur melts a run of discs
// into one rivulet.
//
// Everything moves smoothly on purpose. Drops enter from beyond the top and
// right edges, so nothing pops in; their pace eases between faster and slower
// rather than sticking; and a trail's width varies along its length by a slow
// wave, not per dot, so it doesn't flicker as it dries.

import { seededRng } from '@/lab/random';
import type { HomeValues } from './homeControls';

// A trail point: centre, radius when laid, and when.
type Dot = { x: number; y: number; r: number; t: number };
type Trail = { dots: Dot[] };
type Head = {
  x: number;
  y: number;
  r: number;
  heading: number; // this drop's own direction, radians
  phase: number; // its meander and its pace, both slow waves
  rate: number;
  pace: number; // eased towards the wave's target
  laid: number; // px travelled since the last dot
  run: number; // px travelled in all, for the trail's width wave
  lobes: { k: number; a: number; p: number }[]; // its own irregular outline
  stretch: number;
  trail: Trail;
};

const STEP = 3; // px of travel between trail dots

export class Streams {
  heads: Head[] = [];
  trails: Trail[] = [];
  private time = 0;
  private rng = seededRng(1);
  private key = '';
  // Where along the top and right edges the next drop enters: a golden-ratio
  // walk, so entries spread evenly over time instead of bunching.
  private lane = 0;

  reset(v: HomeValues, W: number, H: number, scale: number) {
    const key = [W, H, scale, v.dropSeed, v.streams].join('|');
    if (key === this.key) return false;
    this.key = key;
    this.rng = seededRng(v.dropSeed * 337 + 19);
    this.heads = [];
    this.trails = [];
    this.time = 0;
    for (let i = 0; i < Math.round(v.streams); i++)
      this.spawn(v, W, H, scale, true);
    // Open on glass that has been raining for a while.
    for (let t = 0; t < v.trailLife; t += 1 / 30)
      this.step(1 / 30, v, W, H, scale);
    return true;
  }

  // A new drop just beyond the top or right edge, aimed into the screen.
  // `inside` scatters the first ones anywhere, so the screen isn't empty.
  private spawn(
    v: HomeValues,
    W: number,
    H: number,
    scale: number,
    inside = false,
  ) {
    const r = this.rng;
    const size =
      scale *
      (v.headMin + (Math.max(v.headMin, v.headMax) - v.headMin) * r() ** 1.5);
    let x: number;
    let y: number;
    if (inside) {
      x = r() * W;
      y = r() * H;
    } else {
      this.lane = (this.lane + 0.6180339887) % 1;
      const u = (this.lane + (r() - 0.5) * 0.06) * (W + H);
      if (u < W) {
        x = W - u;
        y = -size * 3;
      } else {
        x = W + size * 3;
        y = u - W;
      }
    }
    const trail: Trail = { dots: [] };
    this.trails.push(trail);
    this.heads.push({
      x,
      y,
      r: size,
      heading:
        (v.diagonal ? Math.atan2(H, -W) : (v.flowAngle * Math.PI) / 180) +
        ((r() - 0.5) * 2 * v.spread * Math.PI) / 180,
      phase: r() * Math.PI * 2,
      rate: 0.25 + r() * 0.5,
      pace: 1,
      laid: STEP,
      run: r() * 1000,
      lobes: Array.from({ length: 3 }, (_, i) => ({
        k: i + 2,
        a: (0.08 + r() * 0.14) / (1 + i * 0.5),
        p: r() * Math.PI * 2,
      })),
      stretch: 1.25 + r() * 0.5,
      trail,
    });
  }

  step(dt: number, v: HomeValues, W: number, H: number, scale: number) {
    const r = this.rng;
    this.time += dt;
    const now = this.time;
    const minR = scale * v.headMin * 0.4;
    const born: Head[] = [];
    let died = 0;
    const ease = 1 - Math.exp(-dt * 2.5);

    this.heads = this.heads.filter((d) => {
      d.phase += dt * d.rate;
      // Pace drifts between a crawl and a run, eased so it never jerks.
      const want =
        1 - v.stick * 0.5 + v.stick * 0.5 * Math.sin(d.phase * 2.3 + 1.7);
      d.pace += (Math.max(0.05, want) - d.pace) * ease;
      // Bigger drops run faster, as heavier water does.
      const speed =
        v.speed * scale * d.pace * (0.6 + 0.6 * (d.r / (scale * v.headMax)));
      const a =
        d.heading +
        v.meander *
          (0.18 * Math.sin(d.phase * 1.3) + 0.08 * Math.sin(d.phase * 3.1 + 2));
      const go = speed * dt;
      d.x += Math.cos(a) * go;
      d.y += Math.sin(a) * go;
      d.laid += go;
      d.run += go;
      while (d.laid >= STEP) {
        d.laid -= STEP;
        const wave =
          1 + 0.12 * Math.sin(d.run * 0.021) + 0.06 * Math.sin(d.run * 0.057);
        d.trail.dots.push({
          x: d.x,
          y: d.y,
          r: d.r * v.trailWidth * 0.5 * wave,
          t: now,
        });
      }
      d.r -= v.loss * scale * dt;

      // A bead left behind where the trail necks, sitting in the trail.
      if (r() < v.pinch * dt)
        d.trail.dots.push({ x: d.x, y: d.y, r: d.r * 0.55, t: now });
      if (r() < v.branch * dt && d.r > minR * 2) {
        const trail: Trail = { dots: [] };
        this.trails.push(trail);
        born.push({
          ...d,
          r: d.r * 0.6,
          heading: d.heading + (r() < 0.5 ? -1 : 1) * (0.25 + r() * 0.3),
          phase: r() * 6.28,
          laid: STEP,
          trail,
        });
        d.r *= 0.8;
      }
      const m = d.r * 4;
      const gone = d.r < minR || d.x < -m || d.y > H + m;
      if (gone) died++;
      return !gone;
    });
    this.heads.push(...born);
    for (let i = 0; i < died; i++)
      if (this.heads.length < Math.round(v.streams) * 1.5)
        this.spawn(v, W, H, scale);
    while (this.heads.length < Math.round(v.streams))
      this.spawn(v, W, H, scale);

    const life = v.trailLife;
    const alive = new Set(this.heads.map((d) => d.trail));
    this.trails = this.trails.filter((t) => {
      while (t.dots.length && now - t.dots[0].t > life) t.dots.shift();
      return t.dots.length > 0 || alive.has(t);
    });
  }

  // A head's outline: its own lumpy shape, drawn out along the way it's
  // going and fuller at the front, as a drop being pushed is.
  outline(d: Head, n = 28) {
    const c = Math.cos(d.heading);
    const s = Math.sin(d.heading);
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      let q = 1 + 0.18 * Math.cos(t);
      for (const l of d.lobes) q += l.a * Math.sin(l.k * t + l.p);
      const u = Math.cos(t) * d.r * q * d.stretch;
      const v = (Math.sin(t) * d.r * q) / Math.sqrt(d.stretch);
      out.push({ x: d.x + u * c - v * s, y: d.y + u * s + v * c });
    }
    return out;
  }

  // Radius of a trail dot now, thinning as it ages.
  radius(d: Dot, life: number) {
    const a = (this.time - d.t) / life;
    return d.r * Math.max(0, 1 - a * a);
  }
}
