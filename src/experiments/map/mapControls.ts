import { color, createControls, range, toggle } from '@/lab/controls';

export const mapControls = createControls('map-v1', {
  seed: range('City', 7, 1, 999, 1),
  districts: range('City', 3, 1, 6, 1),
  blockW: range('City', 120, 40, 300, 1, 'block length'),
  blockH: range('City', 62, 24, 200, 1, 'block depth'),
  gap: range('City', 13, 4, 60, 1, 'street width'),
  lotMin: range('City', 10, 4, 60, 1, 'lot min'),
  lotMax: range('City', 28, 6, 120, 1, 'lot max'),
  parkShare: range('City', 0.05, 0, 0.5, 0.01, 'parks'),
  roads: range('City', 3, 0, 8, 1, 'avenues'),
  roadWidth: range('City', 26, 8, 80, 1, 'avenue width'),
  water: toggle('City', true),
  waterSize: range('City', 0.4, 0.1, 1, 0.01, 'water size'),
  labels: range('City', 12, 0, 40, 1, 'street names'),

  paper: color('Ink', '#f3f2ee'),
  line: color('Ink', '#3c3c3b'),
  lineWidth: range('Ink', 0.8, 0.2, 3, 0.05, 'line width'),
  labelSize: range('Ink', 8, 4, 20, 0.5, 'label size'),
  waves: color('Ink', '#6f6f6e'),

  speed: range('Routes', 1, 0, 4, 0.05),
  routes: range('Routes', 7, 0, 30, 1, 'routes at once'),
  dotsPerSec: range('Routes', 12, 1, 80, 1, 'dots / s'),
  dotSize: range('Routes', 6.5, 2, 20, 0.1, 'dot radius'),
  dotGap: range('Routes', 0.78, 0.3, 2, 0.01, 'dot spacing'),
  jitter: range('Routes', 0.22, 0, 1, 0.01),
  cluster: range('Routes', 10, 0, 40, 1, 'end cluster'),
  hold: range('Routes', 7, 0, 30, 0.1, 'hold s'),
  fade: range('Routes', 1.6, 0.1, 10, 0.1, 'fade s'),
  triangles: toggle('Routes', true),
  markers: toggle('Routes', true, 'numbers'),
  stars: toggle('Routes', true, 'open stops'),
  paused: toggle('Routes', false),

  shade1: color('Dots', '#d2d2d0', 'light'),
  shade2: color('Dots', '#a6a6a4', 'mid'),
  shade3: color('Dots', '#767675', 'dark'),
  shade4: color('Dots', '#262626', 'black'),
  outline: color('Dots', '#2a2a29'),
  outlineWidth: range('Dots', 0.9, 0, 3, 0.05, 'outline'),
});

export type MapValues = typeof mapControls.values;
