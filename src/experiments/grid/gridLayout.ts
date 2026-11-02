// The window mosaic as a guillotine tree: the screen is cut in two, each half cut
// again, and every leaf is a window. Windows are never placed — only the cuts
// move — so however hard the layout is animated it stays tiled edge to edge,
// with no gaps and no overlaps to resolve. Three events drive it:
//
//   move   a cut slides to a new ratio (two neighbourhoods trade space)
//   split  a window divides, the new half growing out of a zero-width seam
//   merge  a cut slides to an edge and the collapsed side is removed
//
// Renderer-agnostic on purpose: `step` returns rectangles in pixels, and what
// draws them (2D canvas here, WebGL later) is somebody else's business.

import { seededRng } from '@/lab/random';

export type Ease = 'expo' | 'quart' | 'back' | 'steps' | 'linear';

export const EASES: Record<Ease, (t: number) => number> = {
  expo: (t) =>
    t <= 0
      ? 0
      : t >= 1
        ? 1
        : t < 0.5
          ? Math.pow(2, 20 * t - 10) / 2
          : (2 - Math.pow(2, -20 * t + 10)) / 2,
  quart: (t) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2),
  back: (t) => {
    const c = 1.9;
    return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
  },
  // Quantised travel: the cut jumps in hard increments, like a UI redrawing.
  steps: (t) => Math.min(1, Math.floor(t * 5) / 4),
  linear: (t) => t,
};

type Leaf = { kind: 'leaf'; id: number };
type Split = {
  kind: 'split';
  id: number;
  rect: Rect; // as of the last step
  axis: 'x' | 'y'; // x: cut is vertical, children sit side by side
  from: number;
  to: number;
  t0: number;
  dur: number;
  ease: Ease;
  a: Node;
  b: Node;
  dying?: 'a' | 'b';
  r: number; // ratio as of the last step
  na: number; // windows under a, as of the last step
  nb: number;
};
type Node = Leaf | Split;

export type Rect = { x: number; y: number; w: number; h: number };
export type Window = Rect & { id: number };
// A subtree of windows that share one rect: whatever it holds, the windows
// under it move together, so it's a stable thing to hang a picture across.
export type Cluster = { id: number; rect: Rect; leaves: number[] };
export type Cut = {
  id: number;
  axis: 'x' | 'y';
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

export type Motion = {
  windows: number; // the count births and deaths steer towards
  minSize: number; // px
  axisBias: number; // 0..1, how strongly a split cuts across the long side
  rate: number; // events per second
  burst: number; // events fired together
  travel: number; // 0..1, how far a move may slide
  duration: number; // seconds
  ease: Ease;
  churn: number; // 0..1, share of events that are births or deaths
  // 0..1. At 1 every cut moves around its fair position — the split that gives
  // each window under it an equal share of area — and births and deaths go to
  // the biggest and smallest windows. At 0 cuts random-walk from wherever they
  // are, which drifts: a cut near the root wanders to an edge and crushes the
  // whole subtree on that side into slivers while a few windows go huge.
  balance: number;
};

export class GridLayout {
  private root: Node = { kind: 'leaf', id: 0 };
  private nextId = 1;
  private rng: () => number;
  private splits: { node: Split; rect: Rect }[] = [];
  private leaves: { node: Leaf; rect: Rect; parent: Split | null }[] = [];
  private leafRect = new Map<Leaf, Rect>();
  private debt = 0;
  readonly windows: Window[] = [];

  constructor(seed: number) {
    this.rng = seededRng(seed);
  }

  // A balanced-looking opening mosaic: keep cutting one of the largest windows.
  seed(rect: Rect, m: Motion) {
    this.root = { kind: 'leaf', id: 0 };
    this.nextId = 1;
    this.debt = 0;
    for (let i = 1; i < m.windows; i++) {
      this.measure(this.root, rect, null, 0);
      const pool = [...this.leaves]
        .sort((p, q) => q.rect.w * q.rect.h - p.rect.w * p.rect.h)
        .slice(0, 3);
      const pick = pool[Math.floor(this.rng() * pool.length)];
      if (!pick) break;
      const s = this.cut(pick, m, 0, 0.3 + this.rng() * 0.4, false);
      if (s) s.dur = 0;
    }
  }

  step(now: number, dt: number, rect: Rect, m: Motion) {
    this.root = this.resolve(this.root, now);
    this.measure(this.root, rect, null, now);

    this.debt += dt * m.rate;
    while (this.debt >= 1) {
      this.debt -= 1;
      for (let i = 0; i < m.burst; i++) this.event(now, m);
    }

    this.windows.length = 0;
    for (const l of this.leaves)
      this.windows.push({ id: l.node.id, ...l.rect });
    return this.windows;
  }

  // Every cut as a line segment, as of the last `step`. Each ends where it meets
  // its parent's cut or the outer rect, so its endpoints are the mosaic's
  // T-junctions.
  cuts() {
    const out: Cut[] = [];
    for (const { node: s, rect: r } of this.splits) {
      if (s.axis === 'x') {
        const x = r.x + r.w * s.r;
        out.push({ id: s.id, axis: 'x', x0: x, y0: r.y, x1: x, y1: r.y + r.h });
      } else {
        const y = r.y + r.h * s.r;
        out.push({ id: s.id, axis: 'y', x0: r.x, y0: y, x1: r.x + r.w, y1: y });
      }
    }
    return out;
  }

  // Outermost subtrees that `accept` takes, given each one's id and live window
  // count; nothing nested inside an accepted subtree is offered. Call after
  // `step`.
  clusters(accept: (id: number, count: number) => boolean) {
    const out: Cluster[] = [];
    const collect = (n: Node, into: number[]) => {
      if (n.kind === 'leaf') into.push(n.id);
      else {
        if (n.dying !== 'a') collect(n.a, into);
        if (n.dying !== 'b') collect(n.b, into);
      }
    };
    const walk = (n: Node) => {
      if (n.kind === 'leaf') return;
      if (accept(n.id, n.na + n.nb)) {
        const leaves: number[] = [];
        collect(n, leaves);
        out.push({ id: n.id, rect: n.rect, leaves });
        return;
      }
      walk(n.a);
      walk(n.b);
    };
    walk(this.root);
    return out;
  }

  private event(now: number, m: Motion) {
    if (this.rng() < m.churn) {
      const n = this.leaves.length;
      // Births and deaths steer the count back towards the target, so churn
      // reshuffles the mosaic without letting it fill up or empty out.
      const birth = this.rng() < 0.5 + (m.windows - n) / Math.max(4, m.windows);
      if (birth) this.birth(now, m);
      else this.death(now, m);
    } else this.move(now, m);
  }

  private move(now: number, m: Motion) {
    const free = this.splits.filter((s) => !s.node.dying);
    const pick = free[Math.floor(this.rng() * free.length)];
    if (!pick) return;
    const s = pick.node;
    const span = s.axis === 'x' ? pick.rect.w : pick.rect.h;
    const lo = Math.min(0.5, m.minSize / Math.max(span, 1));
    const jitter = this.rng() * 2 - 1;
    const fair = s.na / Math.max(1, s.na + s.nb);
    const settled = fair + jitter * m.travel * Math.min(fair, 1 - fair);
    const drift = s.r + jitter * m.travel;
    const target = drift + (settled - drift) * m.balance;
    this.animate(s, now, m, Math.min(1 - lo, Math.max(lo, target)));
  }

  // The share of candidates, ordered by size, that an event may pick from.
  // At full balance only the most extreme quarter.
  private pool<T>(sorted: T[], m: Motion) {
    const n = Math.max(1, Math.ceil(sorted.length * (1 - 0.75 * m.balance)));
    return sorted[Math.floor(this.rng() * Math.min(n, sorted.length))];
  }

  private birth(now: number, m: Motion) {
    const fits = this.leaves
      .filter((l) => Math.max(l.rect.w, l.rect.h) >= m.minSize * 2)
      .sort((p, q) => q.rect.w * q.rect.h - p.rect.w * p.rect.h);
    const pick = this.pool(fits, m);
    const ratio = 0.5 + (this.rng() * 2 - 1) * m.travel * 0.5;
    if (pick) this.cut(pick, m, now, Math.min(0.8, Math.max(0.2, ratio)), true);
  }

  private death(now: number, m: Motion) {
    // Only cuts with a bare window on the dying side, so a death removes one
    // window rather than swallowing a whole neighbourhood at once. Ranked by
    // thinness, not area: a lone window on one side of a high cut gets its
    // fair share of area as a full-width strip a few px tall, and removing it
    // is what lets the tree rebalance.
    const area = (n: Node) => {
      const r = n.kind === 'leaf' ? this.leafRect.get(n) : undefined;
      return r ? Math.min(r.w, r.h) : Infinity;
    };
    const live = this.splits
      .filter((s) => !s.node.dying)
      .map((s) => {
        const a = area(s.node.a);
        const b = area(s.node.b);
        return {
          s: s.node,
          side: (a <= b ? 'a' : 'b') as 'a' | 'b',
          size: Math.min(a, b),
        };
      })
      .filter((c) => c.size < Infinity)
      .sort((p, q) => p.size - q.size);
    const pick = this.pool(live, m);
    if (!pick) return;
    pick.s.dying = pick.side;
    this.animate(pick.s, now, m, pick.side === 'a' ? 0 : 1);
  }

  // Replace a leaf with a cut. When `grow` is set, the new window opens from a
  // zero-width seam, so a birth is a motion rather than a pop.
  private cut(
    l: { node: Leaf; rect: Rect; parent: Split | null },
    m: Motion,
    now: number,
    ratio: number,
    grow: boolean,
  ) {
    // The leaf list is measured once per frame; an earlier event this frame
    // may already have cut this leaf, and cutting it again would orphan a
    // subtree.
    const held = l.parent
      ? l.parent.a === l.node || l.parent.b === l.node
      : this.root === l.node;
    if (!held) return null;
    const { w, h } = l.rect;
    const long = w >= h ? 'x' : 'y';
    const axis = this.rng() < m.axisBias ? long : long === 'x' ? 'y' : 'x';
    if ((axis === 'x' ? w : h) < m.minSize * 2) return null;
    const born: Leaf = { kind: 'leaf', id: this.nextId++ };
    const newFirst = this.rng() < 0.5;
    const s: Split = {
      kind: 'split',
      id: this.nextId++,
      rect: l.rect,
      axis,
      from: grow ? (newFirst ? 0 : 1) : ratio,
      to: ratio,
      t0: now,
      dur: m.duration,
      ease: m.ease,
      a: newFirst ? born : l.node,
      b: newFirst ? l.node : born,
      r: grow ? (newFirst ? 0 : 1) : ratio,
      na: 1,
      nb: 1,
    };
    if (!l.parent) this.root = s;
    else if (l.parent.a === l.node) l.parent.a = s;
    else l.parent.b = s;
    return s;
  }

  private animate(s: Split, now: number, m: Motion, to: number) {
    s.from = s.r;
    s.to = to;
    s.t0 = now;
    s.dur = m.duration;
    s.ease = m.ease;
  }

  private ratio(s: Split, now: number) {
    const t = s.dur <= 0 ? 1 : Math.min(1, (now - s.t0) / s.dur);
    return s.from + (s.to - s.from) * EASES[s.ease](t);
  }

  // Finished deaths hand their slot to the survivor.
  private resolve(n: Node, now: number): Node {
    if (n.kind === 'leaf') return n;
    if (n.dying && now - n.t0 >= n.dur) {
      return this.resolve(n.dying === 'a' ? n.b : n.a, now);
    }
    n.a = this.resolve(n.a, now);
    n.b = this.resolve(n.b, now);
    return n;
  }

  private measure(root: Node, rect: Rect, parent: Split | null, now: number) {
    this.splits.length = 0;
    this.leaves.length = 0;
    this.leafRect.clear();
    const walk = (n: Node, r: Rect, p: Split | null): number => {
      if (n.kind === 'leaf') {
        this.leaves.push({ node: n, rect: r, parent: p });
        this.leafRect.set(n, r);
        return 1;
      }
      n.r = this.ratio(n, now);
      n.rect = r;
      this.splits.push({ node: n, rect: r });
      if (n.axis === 'x') {
        const w = r.w * n.r;
        n.na = walk(n.a, { x: r.x, y: r.y, w, h: r.h }, n);
        n.nb = walk(n.b, { x: r.x + w, y: r.y, w: r.w - w, h: r.h }, n);
      } else {
        const h = r.h * n.r;
        n.na = walk(n.a, { x: r.x, y: r.y, w: r.w, h }, n);
        n.nb = walk(n.b, { x: r.x, y: r.y + h, w: r.w, h: r.h - h }, n);
      }
      // A dying side is already on its way out; don't hold space for it.
      if (n.dying === 'a') n.na = 0;
      if (n.dying === 'b') n.nb = 0;
      return n.na + n.nb;
    };
    walk(root, rect, parent);
  }
}
