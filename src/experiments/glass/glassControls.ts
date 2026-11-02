import { color, createControls, range } from '@/lab/controls';

// The terminal content itself (panel mix, pace, typography) is tuned on the
// terminal experiment and read from its store; these are only the overrides a
// tile on a slanted plane needs, plus everything about the glass and the light.
export const glassControls = createControls('glass-v1', {
  windows: range('Content', 40, 4, 120, 1, 'windows per tile'),
  fontSize: range('Content', 15, 6, 32, 0.5, 'font px'),
  contentGain: range('Content', 0.85, 0, 3, 0.01, 'brightness'),
  contentFps: range('Content', 60, 5, 60, 1, 'redraw fps'),

  pitch: range('Camera', 34, 5, 89, 0.5, 'tilt °'),
  yaw: range('Camera', 32, -180, 180, 0.5, 'turn °'),
  distance: range('Camera', 10, 2, 30, 0.1, 'distance'),
  fov: range('Camera', 38, 10, 90, 0.5, 'lens °'),
  panSpeed: range('Camera', 0.35, 0, 4, 0.01, 'pan speed'),
  panAngle: range('Camera', 215, 0, 360, 1, 'pan direction °'),
  tileSize: range('Camera', 12, 3, 40, 0.1, 'tile size'),
  tiles: range('Camera', 5, 1, 9, 1, 'tiles across'),

  depthMax: range('Depth', 0.45, 0, 4, 0.01, 'max height'),
  depthPow: range('Depth', 2.2, 0.3, 6, 0.01, 'height curve'),
  flatShare: range('Depth', 0.5, 0, 1, 0.01, 'flat windows'),

  sideTone: range('Surface', 0.05, 0, 0.5, 0.005, 'side tone'),
  edge: range('Surface', 0.7, 0, 3, 0.01, 'edge light'),
  edgeWidth: range('Surface', 0.012, 0.001, 0.08, 0.001, 'edge width'),
  spec: range('Surface', 0.5, 0, 3, 0.01, 'specular'),
  shininess: range('Surface', 60, 2, 400, 1, 'shininess'),
  lightAzimuth: range('Surface', 135, 0, 360, 1, 'light azimuth °'),
  lightElevation: range('Surface', 40, 5, 90, 1, 'light elevation °'),
  fog: range('Surface', 0.045, 0, 0.3, 0.001, 'fog'),
  background: color('Surface', '#000000', 'background'),

  reflShare: range('Reflection', 0.2, 0, 1, 0.01, 'reflective windows'),
  reflAmt: range('Reflection', 0.7, 0, 2, 0.01, 'strength'),
  reflAll: range('Reflection', 0.05, 0, 1, 0.01, 'on every window'),
  reflScale: range('Reflection', 0.7, 0.05, 4, 0.01, 'scale'),
  fresnel: range('Reflection', 0.6, 0, 1, 0.01, 'fresnel'),

  sweepAmt: range('Sweep', 1.1, 0, 5, 0.01, 'strength'),
  sweepWidth: range('Sweep', 0.035, 0.01, 0.5, 0.005, 'width'),
  sweepFreq: range('Sweep', 0.05, 0.01, 1, 0.001, 'frequency'),
  sweepSpeed: range('Sweep', 0.18, -2, 2, 0.01, 'speed'),
  sweepAngle: range('Sweep', 65, 0, 180, 1, 'angle °'),
  sweepGap: range('Sweep', 0.35, 0, 1, 0.01, 'gaps'),
  sweepFollow: range('Sweep', 0, 0, 1, 0.01, 'follows pan'),
  spread: range('Sweep', 1.6, 0, 8, 0.01, 'spectral spread'),
  meshFreq: range('Sweep', 14, 5, 400, 1, 'mesh pitch'),
  meshAmt: range('Sweep', 0.8, 0, 1, 0.01, 'mesh'),

  fringe: range('Fringe', 0.5, 0, 3, 0.01, 'strength'),
  fringeWidth: range('Fringe', 0.03, 0.001, 0.2, 0.001, 'width'),
  fringeFreq: range('Fringe', 30, 1, 200, 0.5, 'bands'),

  bloom: range('Post', 0.4, 0, 3, 0.01, 'bloom'),
  bloomRadius: range('Post', 0.45, 0, 1, 0.01, 'bloom radius'),
  bloomThreshold: range('Post', 0.7, 0, 1, 0.01, 'bloom threshold'),
  trails: range('Post', 0.72, 0, 0.98, 0.01, 'motion trails'),
});

export type GlassValues = typeof glassControls.values;
