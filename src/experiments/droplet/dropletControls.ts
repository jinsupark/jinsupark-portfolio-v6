import { color, createControls, range, select, toggle } from '@/lab/controls';

export const dropletControls = createControls('droplet-v1', {
  mode: select(
    'Draw',
    'lasso',
    [
      { value: 'lasso', label: 'Lasso (fill shape)' },
      { value: 'brush', label: 'Brush (stroke)' },
    ],
    'draw mode',
  ),
  brush: range('Draw', 38, 6, 160, 1, 'brush width'),
  dropSize: range('Draw', 26, 6, 120, 1, 'click drop'),
  starters: toggle('Draw', true, 'starter drops'),

  edge: range('Water', 26, 4, 90, 1, 'edge roundness'),
  thickness: range('Water', 40, 0, 160, 1),
  refract: range('Water', 70, 0, 240, 1, 'refraction px'),
  parallax: range('Water', 12, 0, 80, 0.5, 'inner shift px'),
  chroma: range('Water', 0.08, 0, 0.5, 0.005, 'colour split'),
  wobble: range('Water', 0.5, 0, 3, 0.01),
  wobbleSpeed: range('Water', 1, 0, 5, 0.05, 'wobble speed'),

  specular: range('Light', 0.85, 0, 3, 0.01),
  shininess: range('Light', 70, 2, 300, 1),
  rim: range('Light', 0.55, 0, 2, 0.01, 'rim light'),
  rimDark: range('Light', 0.4, 0, 1, 0.01, 'rim shade'),
  lightAngle: range('Light', 135, 0, 360, 1, 'light from °'),
  tint: color('Light', '#d8ecff'),
  tintAmount: range('Light', 0.06, 0, 1, 0.01, 'tint'),

  shadow: range('Shadow', 0.6, 0, 1, 0.01),
  shadowX: range('Shadow', 16, -80, 80, 1, 'offset x'),
  shadowY: range('Shadow', 26, -80, 80, 1, 'offset y'),
  shadowColor: color('Shadow', '#2a4fb8', 'colour'),
  caustics: range('Shadow', 0.2, 0, 3, 0.01),

  backdrop: select('Backdrop', 'sky', [
    { value: 'sky', label: 'Sky + grass collage' },
    { value: 'projects', label: 'Project collage' },
    { value: 'video', label: 'Demo video' },
  ]),
  seed: range('Backdrop', 3, 1, 999, 1),
  tiles: range('Backdrop', 10, 0, 30, 1),
});

export type DropletValues = typeof dropletControls.values;
