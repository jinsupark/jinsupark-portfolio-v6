import {
  color,
  createControls,
  range,
  select,
  text,
  toggle,
} from '@/lab/controls';

export const scatterControls = createControls('scatter-v1', {
  source: select('Source', 'video', [
    { value: 'video', label: 'demo video' },
    { value: 'project', label: 'project image' },
  ]),
  base: toggle('Source', true, 'picture underneath'),
  baseDim: range('Source', 0, 0, 1, 0.01, 'dim underneath'),
  ground: color('Source', '#ece6dc'),

  seed: range('Layout', 5, 1, 999, 1),
  windows: range('Layout', 14, 1, 60, 1),
  minW: range('Layout', 0.12, 0.03, 0.6, 0.01, 'min width'),
  maxW: range('Layout', 0.42, 0.05, 0.9, 0.01, 'max width'),
  minH: range('Layout', 0.1, 0.03, 0.6, 0.01, 'min height'),
  maxH: range('Layout', 0.4, 0.05, 0.9, 0.01, 'max height'),

  speed: range('Motion', 1, 0, 4, 0.05),
  hold: range('Motion', 2.6, 0, 12, 0.1, 'hold s'),
  duration: range('Motion', 1.4, 0.1, 6, 0.05, 'move s'),
  travel: range('Motion', 0.16, 0, 0.6, 0.01),
  resize: range('Motion', 0.35, 0, 1, 0.01, 'resize chance'),
  raise: range('Motion', 0.3, 0, 1, 0.01, 'bring to front'),
  churn: range('Motion', 0.12, 0, 3, 0.01, 'close / open per s'),
  paused: toggle('Motion', false),

  zoomMin: range('Fragments', 0.95, 0.5, 3, 0.01, 'zoom min'),
  zoomMax: range('Fragments', 1.5, 0.5, 4, 0.01, 'zoom max'),
  offset: range('Fragments', 0.1, 0, 0.5, 0.005, 'displacement'),
  titled: range('Fragments', 0.6, 0, 1, 0.01, 'with title bar'),
  marquee: range('Fragments', 0.12, 0, 1, 0.01, 'dashed selection'),
  lines: range('Fragments', 0.35, 0, 1, 0.01, 'drop lines'),

  title: text('Chrome', 'SYSTMS DELTA'),
  barH: range('Chrome', 18, 8, 40, 1, 'bar height'),
  font: range('Chrome', 9, 6, 20, 0.5, 'title size'),
  barTop: color('Chrome', '#ececec', 'bar light'),
  barBottom: color('Chrome', '#bdbdbd', 'bar dark'),
  frame: color('Chrome', '#c9c9c9'),
  frameW: range('Chrome', 2, 0, 6, 0.5, 'frame width'),
  ink: color('Chrome', '#333333'),
});

export type ScatterValues = typeof scatterControls.values;
