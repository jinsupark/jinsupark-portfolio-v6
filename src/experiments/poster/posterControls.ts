import { color, createControls, range, select } from '@/lab/controls';
import { MAX_SHEETS } from './shaders';

export const FORMATS: Record<string, number | null> = {
  native: null,
  portrait: 1 / Math.SQRT2,
  landscape: Math.SQRT2,
  square: 1,
};

// Units: the wall is 1 unit tall, so a size of 0.5 is half the screen height.
// Every relief `amt` is a slope rather than a height — each layer of relief is
// divided by its own frequency in the shader, so changing a frequency changes
// how fine the texture is without also changing how hard it catches the light.
// The store id is versioned: bump it when the defaults change enough that values
// saved under the old ones would hide the change.
export const posterControls = createControls('poster-v2', {
  // The wall is dealt from `seed`: which projects, which cell, how big, how
  // tilted. Sheets go onto a grid fitted to the screen, one per cell, so the
  // wall fills edge to edge; `scale` is relative to the cell, and above 1 the
  // sheets overlap. Stacking order is random, independent of the grid.
  sheets: range('Scene', MAX_SHEETS, 1, MAX_SHEETS, 1, 'posters'),
  seed: range('Scene', 7, 1, 999, 1),
  format: select(
    'Scene',
    'portrait',
    Object.keys(FORMATS).map((f) => ({ value: f, label: f })),
  ),
  scale: range('Scene', 1.35, 0.4, 2.5, 0.01, 'poster scale'),
  sizeJitter: range('Scene', 0.2, 0, 0.8, 0.01, 'size jitter'),
  jitter: range('Scene', 0.5, 0, 1.5, 0.01, 'position jitter'),
  spread: range('Scene', 1, 0.2, 1.4, 0.01),
  tilt: range('Scene', 3, 0, 15, 0.1, 'tilt°'),
  border: range('Scene', 0.02, 0, 0.12, 0.001),

  paperColor: color('Paper', '#f2eee6', 'paper'),
  grainAmt: range('Paper', 0.12, 0, 2, 0.01, 'grain'),
  grainFreq: range('Paper', 600, 50, 1500, 1, 'grain freq'),
  fiberAmt: range('Paper', 0.06, 0, 2, 0.01, 'fibres'),
  fiberFreq: range('Paper', 260, 20, 1000, 1, 'fibre freq'),

  ink: range('Ink', 0.97, 0, 1, 0.01, 'density'),
  inkGrain: range('Ink', 0.08, 0, 1, 0.01, 'grain bite'),
  saturation: range('Ink', 1.1, 0, 1.5, 0.01),
  fade: range('Ink', 0, 0, 0.6, 0.01, 'sun fade'),

  creaseAmt: range('Creases', 0.14, 0, 1.5, 0.005, 'strength'),
  creaseFreq: range('Creases', 26, 1, 80, 0.1, 'freq'),
  creaseStretch: range('Creases', 6, 1, 16, 0.1, 'stretch'),
  creaseSharp: range('Creases', 6, 1, 16, 0.1, 'sharpness'),
  creaseCover: range('Creases', 0.35, 0, 1, 0.01, 'coverage'),
  creaseAngle: range('Creases', 75, 0, 180, 1, 'angle°'),
  creaseWarp: range('Creases', 1.5, 0, 4, 0.01, 'warp'),

  bubbleAmt: range('Bubbles', 0.16, 0, 1.5, 0.005, 'strength'),
  bubbleFreq: range('Bubbles', 14, 1, 40, 0.1, 'freq'),
  bubbleSize: range('Bubbles', 0.3, 0.05, 0.7, 0.01, 'size'),
  bubbleDensity: range('Bubbles', 0.12, 0, 1, 0.01, 'density'),

  glueCover: range('Glue', 0.6, 0, 1, 0.01, 'coverage'),
  glueGloss: range('Glue', 0.75, 0, 1, 0.01, 'gloss'),
  brushStreak: range('Glue', 0.65, 0, 1, 0.01, 'brush streaks'),
  brushFreq: range('Glue', 40, 2, 200, 0.5, 'brush freq'),
  brushAngle: range('Glue', 8, 0, 180, 1, 'brush angle°'),
  glueTint: color('Glue', '#d8c9a4', 'tint'),
  glueTintAmt: range('Glue', 0.12, 0, 1, 0.01, 'tint amount'),

  // 0° is from the right, counter-clockwise; 135° is the top left.
  azimuth: range('Light', 135, 0, 360, 1, 'azimuth°'),
  elevation: range('Light', 35, 2, 90, 1, 'elevation°'),
  lightColor: color('Light', '#fff6ea', 'colour'),
  ambient: range('Light', 0.55, 0, 1, 0.01),
  diffuse: range('Light', 0.85, 0, 2, 0.01),
  spec: range('Light', 0.55, 0, 3, 0.01, 'specular'),
  shininess: range('Light', 70, 2, 400, 1),
  normal: range('Light', 1, 0, 4, 0.01, 'relief'),

  ripWidth: range('Tear', 0.055, 0.01, 0.2, 0.001, 'rip width'),
  ripJitter: range('Tear', 0.45, 0, 1, 0.01, 'width jitter'),
  ripSoft: range('Tear', 0.75, 0.1, 1, 0.01, 'softness'),
  edgeRough: range('Tear', 0.28, 0, 0.5, 0.01, 'edge rough'),
  edgeFreq: range('Tear', 22, 2, 120, 0.5, 'edge freq'),
  fuzz: range('Tear', 0.12, 0, 0.4, 0.005, 'fibre fuzz'),
  fuzzFreq: range('Tear', 320, 50, 1200, 1, 'fuzz freq'),
  coreBand: range('Tear', 0.18, 0, 0.48, 0.005, 'white core'),
  coreVary: range('Tear', 0.7, 0, 1, 0.01, 'core vary'),
  coreVaryFreq: range('Tear', 9, 1, 60, 0.5, 'core vary freq'),
  coreColor: color('Tear', '#fbfaf6', 'core colour'),
  lift: range('Tear', 0.6, 0, 3, 0.01, 'edge lift'),
  liftWidth: range('Tear', 0.2, 0.01, 0.5, 0.01, 'lift width'),
  residue: range('Tear', 0.55, 0, 1, 0.01, 'paper residue'),
  residueWidth: range('Tear', 0.22, 0.01, 0.5, 0.01, 'residue width'),
  pasteStain: range('Tear', 0.3, 0, 1, 0.01, 'paste stain'),
  shadow: range('Tear', 0.45, 0, 1, 0.01, 'shadow'),
  shadowDist: range('Tear', 0.004, 0, 0.02, 0.0005, 'paper height'),

  wallColor: color('Wall', '#5f5c57', 'colour'),
  wallGrain: range('Wall', 0.8, 0, 3, 0.01, 'grain'),
});

export type PosterValues = typeof posterControls.values;
