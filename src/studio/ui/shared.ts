import type { RangeControl } from '@/lab/controls';

// Shared bits of the studio's controls.

export const FIELD =
  'h-6 min-w-0 rounded-md border border-black/10 bg-white text-neutral-800 shadow-[0_1px_0_rgb(0_0_0/0.02)] focus-within:border-sky-500/70';

export const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const words = (key: string) =>
  key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
export const digitsOf = (step: number) =>
  step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3;

export const rangeOf = (c: RangeControl) => ({
  min: c.min,
  max: c.max,
  step: c.step,
});

// How far an arrow key moves a value, in its own units: one shown unit (a
// whole number, a whole percent), or a tenth or hundredth of one when the
// whole range is smaller than that would allow.
export function nudgeOf(min: number, max: number, factor = 1) {
  const span = (max - min) * factor;
  const shown =
    !Number.isFinite(span) || span >= 10 ? 1 : span >= 1 ? 0.1 : 0.01;
  return shown / factor;
}
