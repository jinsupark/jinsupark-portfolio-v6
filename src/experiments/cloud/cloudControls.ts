import { color, createControls, range, toggle } from '@/lab/controls';

export const cloudControls = createControls('cloud-v1', {
  seed: range('Cloud', 5, 1, 999, 1),
  towers: range('Cloud', 2, 1, 4, 1),
  lobes: range('Cloud', 38, 4, 40, 1),
  height: range('Cloud', 0.8, 0.2, 1.2, 0.01, 'tower height'),
  width: range('Cloud', 0.7, 0.1, 1.5, 0.01, 'tower width'),
  lobeSize: range('Cloud', 0.115, 0.04, 0.4, 0.005, 'lobe size'),
  merge: range('Cloud', 0.06, 0, 0.2, 0.002, 'lobe merge'),
  roughness: range('Cloud', 0.15, 0, 0.4, 0.002, 'edge churn'),
  detail: range('Cloud', 7, 1, 20, 0.1, 'churn scale'),

  speed: range('Timelapse', 1, 0, 5, 0.05),
  life: range('Timelapse', 14, 2, 60, 0.5, 'lobe life s'),
  boil: range('Timelapse', 0.22, 0, 1.5, 0.01),
  paused: toggle('Timelapse', false),

  skyTop: color('Sky', '#2f6cc0', 'top'),
  skyBottom: color('Sky', '#a6cdec', 'horizon'),
  grain: range('Sky', 0.12, 0, 0.5, 0.01, 'paper grain'),

  shade: color('Paint', '#6e6c68'),
  mid: color('Paint', '#a9a59d'),
  light: color('Paint', '#ddd8cc'),
  lace: color('Paint', '#faf8f2'),
  lightAngle: range('Paint', 115, 0, 360, 1, 'sun from °'),
  laceAmount: range('Paint', 1, 0, 2, 0.01, 'lace'),
  laceWidth: range('Paint', 0.28, 0, 1, 0.01, 'lace reach'),
  laceScale: range('Paint', 30, 4, 80, 0.5, 'lace scale'),
  edgeLine: range('Paint', 0.007, 0, 0.05, 0.0005, 'white edge'),
  brush: range('Paint', 0.18, 0, 0.6, 0.01, 'brush wash'),

  resolution: range('Render', 1, 0.25, 1, 0.05),
});

export type CloudValues = typeof cloudControls.values;
