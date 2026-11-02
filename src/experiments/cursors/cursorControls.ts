import { color, createControls, range, select, toggle } from '@/lab/controls';

export const cursorControls = createControls('cursors-v1', {
  seed: range('Orbit', 9, 1, 999, 1),
  count: range('Orbit', 70, 1, 400, 1),
  centers: range('Orbit', 1, 1, 6, 1),
  radiusMin: range('Orbit', 0.06, 0, 1, 0.01, 'radius min'),
  radiusMax: range('Orbit', 0.5, 0.02, 1.2, 0.01, 'radius max'),
  ellipse: range('Orbit', 0.5, 0.05, 1, 0.01, 'height / width'),
  tilt: range('Orbit', -12, -90, 90, 0.5, 'tilt °'),
  speed: range('Orbit', 0.35, 0, 3, 0.01, 'rad / s'),
  speedSpread: range('Orbit', 0.6, 0, 1, 0.01, 'speed spread'),
  reverse: range('Orbit', 0.12, 0, 1, 0.01, 'counter-orbit'),
  wobble: range('Orbit', 0.04, 0, 0.3, 0.005),
  follow: toggle('Orbit', true, 'follow pointer'),
  lag: range('Orbit', 1.6, 0.05, 8, 0.05, 'follow lag s'),

  sizeMin: range('Cursors', 1, 0.5, 8, 0.25, 'size min'),
  sizeMax: range('Cursors', 3.5, 0.5, 10, 0.25, 'size max'),
  depth: toggle('Cursors', true, 'bigger in front'),
  resizeShare: range('Cursors', 0.06, 0, 1, 0.01, 'resize cursors'),
  echoShare: range('Cursors', 0.35, 0, 1, 0.01, 'doubled'),
  echoes: range('Cursors', 1, 1, 6, 1, 'echo copies'),
  echoGap: range('Cursors', 0.05, 0.005, 0.4, 0.005, 'echo gap rad'),
  fill: color('Cursors', '#ffffff'),
  outline: color('Cursors', '#000000'),
  shadow: range('Cursors', 0.25, 0, 1, 0.01),

  background: select('Ground', 'video', [
    { value: 'color', label: 'colour' },
    { value: 'video', label: 'demo video' },
  ]),
  ground: color('Ground', '#d8d6d2'),
  dim: range('Ground', 0.15, 0, 1, 0.01, 'video dim'),

  timeScale: range('Motion', 1, 0, 4, 0.05, 'time scale'),
  paused: toggle('Motion', false),
});

export type CursorValues = typeof cursorControls.values;
