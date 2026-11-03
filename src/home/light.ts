import type { HomeValues } from './homeControls';

const triplet = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16) || 0;
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
};

// The surface's look, as custom properties on the page root. The `.raised`
// rule in index.css reads them.
export function applySurface(root: HTMLElement, v: HomeValues) {
  const s = root.style;
  const a = (v.angle * Math.PI) / 180;
  s.setProperty('--lx', Math.cos(a).toFixed(4));
  s.setProperty('--ly', Math.sin(a).toFixed(4));
  s.setProperty('--lk', String(v.length));
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
