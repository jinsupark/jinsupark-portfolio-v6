import {
  color,
  createControls,
  range,
  select,
  text,
  toggle,
} from '@/lab/controls';

export const pathControls = createControls('paths-v1', {
  seed: range('Shape', 12, 1, 999, 1),
  size: range('Shape', 0.31, 0.1, 0.6, 0.01, 'radius'),
  wobble: range('Shape', 0.22, 0, 0.5, 0.01),
  lobes: range('Shape', 5, 1, 12, 1, 'max lobes'),
  dips: range('Shape', 2, 0, 6, 1, 'inlets'),
  dipDepth: range('Shape', 0.78, 0, 0.95, 0.01, 'inlet depth'),
  dipWidth: range('Shape', 0.08, 0.01, 0.3, 0.005, 'inlet width'),
  squash: range('Shape', 1.1, 0.5, 2, 0.01, 'height / width'),

  speed: range('Motion', 1, 0, 4, 0.05),
  morph: range('Motion', 0.05, 0, 0.5, 0.005, 'morph rate'),
  paused: toggle('Motion', false),

  outline: range('Sticker', 58, 0, 80, 1, 'width'),
  border: range('Sticker', 2.5, 0, 8, 0.25, 'edge'),
  paper: color('Sticker', '#f8f8f6'),
  edge: color('Sticker', '#1a1a1a', 'edge colour'),

  ink: color('Line', '#111111'),
  lineWidth: range('Line', 2.5, 0.5, 8, 0.25, 'weight'),

  nodes: range('Nodes', 30, 4, 120, 1, 'count'),
  nodeSize: range('Nodes', 18, 3, 30, 0.5, 'size'),
  pairShare: range('Nodes', 0.25, 0, 1, 0.01, 'doubled'),
  labelShare: range('Nodes', 0.55, 0, 1, 0.01, 'labelled'),
  curlShare: range('Nodes', 0.12, 0, 1, 0.01, 'loops'),
  ringShare: range('Nodes', 0.08, 0, 1, 0.01, 'open rings'),
  labelSize: range('Nodes', 19, 6, 40, 0.5, 'label size'),
  labelMode: select('Nodes', 'index', [
    { value: 'index', label: 'index' },
    { value: 'value', label: 'live value' },
    { value: 'coord', label: 'coordinate' },
  ]),
  retick: range('Nodes', 1.2, 0.1, 10, 0.1, 'value every s'),

  ground: color('Ground', '#bab9c3'),
  dots: toggle('Ground', true),
  dotGap: range('Ground', 36, 8, 80, 1, 'dot gap'),
  dotSize: range('Ground', 3, 0.5, 8, 0.1, 'dot size'),
  word: text('Type', 'jinsu'),
  wordColor: color('Type', '#acabb5', 'word colour'),
  wordSize: range('Type', 0.2, 0, 0.6, 0.005, 'word size'),
  letters: text('Type', 'STUDIO', 'spaced letters'),
  letterSize: range('Type', 26, 8, 60, 1, 'letter size'),
});

export type PathValues = typeof pathControls.values;
