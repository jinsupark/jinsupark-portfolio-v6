import { color, createControls, range, toggle } from '@/lab/controls';

export const blueprintControls = createControls('blueprint-v1', {
  seed: range('Layout', 7, 1, 999, 1, 'seed'),
  windows: range('Layout', 20, 4, 80, 1, 'windows'),
  minSize: range('Layout', 70, 16, 300, 1, 'min size px'),
  axisBias: range('Layout', 0.75, 0, 1, 0.01, 'cut long side'),

  rate: range('Motion', 0.7, 0, 10, 0.05, 'events / s'),
  travel: range('Motion', 0.3, 0, 1, 0.01, 'travel'),
  duration: range('Motion', 1.8, 0.1, 5, 0.05, 'duration s'),
  churn: range('Motion', 0.25, 0, 1, 0.01, 'births / deaths'),
  balance: range('Motion', 0.8, 0, 1, 0.01, 'uniform sizes'),
  speed: range('Motion', 1, 0, 3, 0.01, 'time scale'),
  panSpeed: range('Motion', 6, -120, 120, 1, 'pan px / s'),
  tileSpan: range('Motion', 2, 1, 4, 0.5, 'strip width (screens)'),
  paused: toggle('Motion', false, 'paused'),

  ground: color('Paper', '#e3e1dc', 'ground'),
  toneLight: color('Paper', '#f4f3ef', 'light'),
  toneMid: color('Paper', '#d2d1cd', 'mid'),
  toneDeep: color('Paper', '#bab9b5', 'deep'),
  toneDark: color('Paper', '#141414', 'dark'),
  emptyShare: range('Paper', 0.3, 0, 1, 0.01, 'bare paper'),
  deepShare: range('Paper', 0.18, 0, 1, 0.01, 'deep windows'),
  darkShare: range('Paper', 0.05, 0, 1, 0.01, 'dark windows'),
  grain: range('Paper', 0.07, 0, 0.5, 0.01, 'grain'),

  ink: color('Lines', '#151515', 'ink'),
  lineAlpha: range('Lines', 0.85, 0, 1, 0.01, 'opacity'),
  lineWidth: range('Lines', 1, 0.5, 3, 0.25, 'width px'),
  overshoot: range('Lines', 48, 0, 300, 1, 'overshoot px'),
  longShare: range('Lines', 0.12, 0, 1, 0.01, 'full-length lines'),

  markShare: range('Marks', 0.8, 0, 1, 0.01, 'marked junctions'),
  textShare: range('Marks', 0.45, 0, 1, 0.01, 'text'),
  iconShare: range('Marks', 0.35, 0, 1, 0.01, 'icons'),
  barShare: range('Marks', 0.2, 0, 1, 0.01, 'bars'),
  textSize: range('Marks', 7, 4, 12, 0.25, 'text px'),
  textAlpha: range('Marks', 0.85, 0, 1, 0.01, 'text opacity'),
  retextEvery: range('Marks', 7, 1, 40, 0.5, 'rewrite every s'),
  insetShare: range('Marks', 0.2, 0, 1, 0.01, 'inset frames'),
  ruler: toggle('Marks', true, 'edge ruler'),

  useVideo: toggle('Images', true, 'demo video'),
  imageShare: range('Images', 0.25, 0, 1, 0.01, 'image regions'),
  maxImages: range('Images', 2, 0, 6, 1, 'max regions'),
  clusterMin: range('Images', 2, 1, 8, 1, 'region min windows'),
  clusterMax: range('Images', 4, 1, 12, 1, 'region max windows'),
  imageEvery: range('Images', 14, 2, 60, 0.5, 'swap every s'),
  imageWipe: range('Images', 1.2, 0.05, 4, 0.05, 'wipe s'),

  hero: toggle('Hero', true, 'hero image'),
  heroX: range('Hero', 0.44, 0, 1, 0.01, 'centre x'),
  heroY: range('Hero', 0.46, 0, 1, 0.01, 'centre y'),
  heroSize: range('Hero', 0.4, 0.1, 0.9, 0.01, 'size (of height)'),
  heroBorder: color('Hero', '#c62a1f', 'border'),
  heroBorderW: range('Hero', 3, 0, 12, 0.5, 'border px'),
  heroEvery: range('Hero', 11, 2, 60, 0.5, 'swap every s'),
  linesOverHero: toggle('Hero', true, 'lines cross hero'),
});

export type BlueprintValues = typeof blueprintControls.values;
