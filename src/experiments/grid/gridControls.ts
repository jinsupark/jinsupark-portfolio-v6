import { color, createControls, range, select, toggle } from '@/lab/controls';
import type { Ease } from './gridLayout';

const EASE_OPTIONS: { value: Ease; label: string }[] = [
  { value: 'expo', label: 'expo' },
  { value: 'quart', label: 'quart' },
  { value: 'back', label: 'overshoot' },
  { value: 'steps', label: 'steps' },
  { value: 'linear', label: 'linear' },
];

export const gridControls = createControls('grid-v1', {
  seed: range('Layout', 3, 1, 999, 1, 'seed'),
  windows: range('Layout', 34, 4, 120, 1, 'windows'),
  minSize: range('Layout', 36, 8, 200, 1, 'min size px'),
  axisBias: range('Layout', 0.8, 0, 1, 0.01, 'cut long side'),
  gap: range('Layout', 2, 0, 24, 0.5, 'gutter px'),

  rate: range('Motion', 5, 0, 40, 0.1, 'events / s'),
  burst: range('Motion', 2, 1, 8, 1, 'burst'),
  travel: range('Motion', 0.35, 0, 1, 0.01, 'travel'),
  duration: range('Motion', 0.7, 0.05, 3, 0.01, 'duration s'),
  ease: select('Motion', 'expo', EASE_OPTIONS, 'easing'),
  churn: range('Motion', 0.3, 0, 1, 0.01, 'births / deaths'),
  balance: range('Motion', 0.9, 0, 1, 0.01, 'uniform sizes'),
  speed: range('Motion', 1, 0, 3, 0.01, 'time scale'),
  panSpeed: range('Motion', 14, -200, 200, 1, 'pan px / s'),
  tileSpan: range('Motion', 2, 1, 4, 0.5, 'strip width (screens)'),
  paused: toggle('Motion', false, 'paused'),

  background: color('Look', '#202020', 'background'),
  toneMin: range('Look', 0.18, 0, 1, 0.01, 'tone min'),
  toneMax: range('Look', 0.72, 0, 1, 0.01, 'tone max'),
  voidShare: range('Look', 0.14, 0, 1, 0.01, 'black windows'),
  frameShare: range('Look', 0.22, 0, 1, 0.01, 'empty frames'),
  border: range('Look', 0.22, 0, 1, 0.01, 'border'),
  labels: toggle('Look', true, 'labels'),
  crosshairs: toggle('Look', true, 'crosshairs'),

  pink: color('Palette', '#fcdbe5', 'pink'),
  plum: color('Palette', '#3d2b33', 'plum'),
  pinkShare: range('Palette', 0.2, 0, 1, 0.01, 'pink windows'),
  plumShare: range('Palette', 0.16, 0, 1, 0.01, 'plum windows'),

  clusterShare: range('Images', 0.3, 0, 1, 0.01, 'image clusters'),
  clusterMin: range('Images', 3, 2, 12, 1, 'cluster min windows'),
  clusterMax: range('Images', 7, 2, 24, 1, 'cluster max windows'),
  imageEvery: range('Images', 6, 1, 30, 0.5, 'swap every s'),
  imageWipe: range('Images', 0.6, 0.05, 3, 0.01, 'wipe s'),
  imageOpacity: range('Images', 0.92, 0, 1, 0.01, 'opacity'),
  imageCaption: toggle('Images', true, 'caption'),

  termShare: range('Terminal', 0.5, 0, 1, 0.01, 'terminal windows'),
  termFont: range('Terminal', 9, 6, 20, 0.5, 'font px'),
  termBg: color('Terminal', '#0d0d0d', 'background'),
  termInk: color('Terminal', '#e6e6e6', 'ink'),
  termGlitch: range('Terminal', 0.5, 0, 3, 0.01, 'glitches / s'),

  treated: range('Treatments', 0.55, 0, 1, 0.01, 'treated windows'),
  fxDither: range('Treatments', 1, 0, 1, 0.01, 'dither'),
  fxDifference: range('Treatments', 0.8, 0, 1, 0.01, 'difference'),
  fxInvert: range('Treatments', 0.5, 0, 1, 0.01, 'invert'),
  fxPixel: range('Treatments', 0.5, 0, 1, 0.01, 'pixelate'),
  fxMono: range('Treatments', 0.6, 0, 1, 0.01, 'mono'),
  fxShift: range('Treatments', 0.4, 0, 1, 0.01, 'misregister'),
  ditherRes: range('Treatments', 220, 40, 800, 10, 'dither cells'),
  pixelRes: range('Treatments', 36, 8, 200, 1, 'pixel cells'),

  ghostAlpha: range('Ghost', 0.14, 0, 0.6, 0.01, 'opacity'),
  ghostWindows: range('Ghost', 9, 2, 40, 1, 'windows'),
  ghostPan: range('Ghost', 0.5, 0, 2, 0.01, 'pan share'),
});

export type GridValues = typeof gridControls.values;
