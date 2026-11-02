import type { RaisedValues } from './raisedControls';

const triplet = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16) || 0;
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
};

// The surface's look, as custom properties on the page root. The `.raised`
// rule in index.css reads them.
export function applySurface(root: HTMLElement, v: RaisedValues) {
  const s = root.style;
  s.setProperty('--ground', v.ground);
  s.setProperty('--head-fill', v.headFill);
  s.setProperty('--body-fill', v.bodyFill);
  s.setProperty('--shade', triplet(v.shade));
  s.setProperty('--head-d', `${v.headDepth}px`);
  s.setProperty('--body-d', `${v.bodyDepth}px`);
  s.setProperty('--hi', String(v.highlight));
  s.setProperty('--sh', String(v.shadow));
  s.setProperty('--drop', String(v.drop));
  s.setProperty('--soft', String(v.blur));
}

type Lit = { el: HTMLElement; x: number; y: number; k: number };

// A point light held `height` px above the page at the pointer. Each raised
// block gets the direction towards it (`--lx`, `--ly`) and a shadow length
// (`--lk`) that grows with its distance from the light and shrinks to
// `minLength` right underneath, like a lamp held over paper. Blocks ease
// towards their target, and the loop sleeps once everything has settled.
export function startLight(root: HTMLElement, values: () => RaisedValues) {
  const lit: Lit[] = [...root.querySelectorAll<HTMLElement>('.raised')].map(
    (el) => ({ el, x: 0, y: 0, k: 1 }),
  );
  let pointer: { x: number; y: number } | null = null;
  let raf = 0;
  let last = 0;
  let first = true;

  const target = (l: Lit, v: RaisedValues) => {
    if (!pointer || !v.follow) {
      const a = (v.restAngle * Math.PI) / 180;
      return { x: Math.cos(a), y: Math.sin(a), k: 1 };
    }
    const r = l.el.getBoundingClientRect();
    const dx = pointer.x - (r.left + r.width / 2);
    const dy = pointer.y - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy) || 1;
    const k = Math.min(v.maxLength, Math.max(v.minLength, d / v.height));
    return { x: dx / d, y: dy / d, k };
  };

  const frame = (t: number) => {
    const v = values();
    const dt = first ? 1 : Math.min(0.1, (t - last) / 1000);
    last = t;
    const a = first ? 1 : 1 - Math.exp(-dt * v.ease);
    first = false;
    let moving = false;
    for (const l of lit) {
      const g = target(l, v);
      // Ease the angle rather than the vector, so a light swinging past
      // doesn't shrink the shadow to nothing on the way round.
      const from = Math.atan2(l.y, l.x);
      let da = Math.atan2(g.y, g.x) - from;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      const ang = from + da * a;
      const nx = Math.cos(ang);
      const ny = Math.sin(ang);
      const nk = l.k + (g.k - l.k) * a;
      if (Math.abs(da) > 1e-3 || Math.abs(g.k - nk) > 1e-3) moving = true;
      l.x = nx;
      l.y = ny;
      l.k = nk;
      const s = l.el.style;
      s.setProperty('--lx', nx.toFixed(4));
      s.setProperty('--ly', ny.toFixed(4));
      s.setProperty('--lk', nk.toFixed(4));
    }
    raf = moving ? requestAnimationFrame(frame) : 0;
  };
  const wake = () => {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };

  const move = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
    pointer = { x: e.clientX, y: e.clientY };
    wake();
  };
  addEventListener('pointermove', move);
  addEventListener('scroll', wake, { passive: true });
  addEventListener('resize', wake);
  wake();
  return {
    wake,
    stop() {
      cancelAnimationFrame(raf);
      removeEventListener('pointermove', move);
      removeEventListener('scroll', wake);
      removeEventListener('resize', wake);
    },
  };
}
